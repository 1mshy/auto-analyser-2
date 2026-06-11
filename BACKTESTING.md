# Backtesting & Strategy Performance

Replays a rule-based trading strategy over historical daily OHLCV and reports
how it would have performed. The engine reuses the alert system's condition
trees for entry/exit, so any signal you can alert on is a signal you can
backtest.

- Backend math: `src/backtest.rs` (pure, network-free, unit-tested)
- Indicators: `src/indicators.rs` (`TechnicalIndicators`)
- Persisted types: `src/models.rs`
- Persistence: `src/db.rs` (`backtests` collection, append-only)
- HTTP: `src/api.rs` (`/api/backtest*`)
- Frontend: `frontend/src/pages/Backtest.tsx`
- Decisions log: `NOTES_BACKTESTING.md`

## Engine overview

For each symbol the simulator walks the price series one bar at a time. At bar
`i` it rebuilds a `StockAnalysis` snapshot from `prices[..=i]` using the same
indicator functions and periods as the live analysis loop (RSI 14, SMA 20/50,
MACD 12/26/9, Bollinger 20/2, Stochastic 14/3) plus a trailing 52-week high/low.
It then evaluates the strategy's **entry** and **exit** condition trees with the
exact same evaluator the alert engine uses (`notifications::rules::evaluate`),
so behavior is identical to a live alert — including MACD-cross detection, which
compares the previous bar's histogram.

A single long position is managed at a time. Execution model (full list in
`NOTES_BACKTESTING.md`):

- **Close-to-close fills.** A signal on bar `i`'s close transacts at that close.
- **No same-bar re-entry.** At most one state change per bar; if you exit on bar
  `i`, the earliest re-entry is bar `i+1`.
- **Stop/take-profit are checked only on bars *after* entry**, against the bar's
  intrabar low/high. If a single bar would trigger both, the **stop wins**
  (conservative).
- **Exit priority per bar:** stop-loss → take-profit → exit condition (on close)
  → max-holding (on close).
- **Forced close** at the last bar (`exit_reason = end_of_data`) so a still-open
  position is counted as a completed round-trip.
- **Commission + slippage** in basis points are applied on both legs.
- **Position sizing** deploys a fixed fraction of *current* equity; fractional
  shares are allowed. Cash never goes negative.

A date window (`start_date`/`end_date`) bounds *when trades may occur*; bars
before `start_date` are still used to warm up the indicators.

## Strategy spec

`Strategy` (`src/models.rs`):

| Field | Type | Meaning | Default |
|---|---|---|---|
| `entry` | `ConditionGroup` | AND/OR/NOT tree of leaf conditions to open a long | — (required) |
| `exit` | `ConditionGroup` | tree to close the position | — (required) |
| `stop_loss_pct` | `f64?` | exit if price falls this % below the entry fill | none |
| `take_profit_pct` | `f64?` | exit if price rises this % above the entry fill | none |
| `max_holding_bars` | `usize?` | force-exit after N bars held | none |
| `position_size_pct` | `f64` | fraction of equity per trade, `(0,1]` | `1.0` |
| `initial_capital` | `f64` | starting account value | `10000` |
| `commission_bps` | `f64` | commission per leg (1 bp = 0.01%) | `0` |
| `slippage_bps` | `f64` | slippage per leg | `0` |

Leaf conditions are the same enum the alerts use (`Condition`): `rsi_below`,
`rsi_above`, `price_below/above`, `price_change_pct_below/above`,
`near_52_week_low/high`, `macd_bullish_cross`, `macd_bearish_cross`,
`stochastic_k_below/above`, `bollinger_bandwidth_below`, `is_oversold`,
`is_overbought`, `volume_above`, `drop_from_high_pct`, `sector_equals`. See
`NOTIFICATIONS.md` for the full reference.

> `sector_equals` is inert in a per-symbol backtest (there is no
> cross-sectional sector context), and is best left out of strategies.

## Metric definitions

`BacktestMetrics` (per symbol). Undefined ratios are `null`, never `NaN`/`Inf`.

| Metric | Definition |
|---|---|
| `total_return_pct` | `(final_equity − initial_capital) / initial_capital × 100` |
| `cagr_pct` | `((final/initial)^(1/years) − 1) × 100`; `null` if span < 1 day or equity ≤ 0 |
| `win_rate_pct` | winning trades / total trades × 100 |
| `avg_win_pct` / `avg_loss_pct` | mean per-trade return of winners / losers (`null` if none) |
| `profit_factor` | gross profit / gross loss; `null` if there are no losing trades |
| `max_drawdown_pct` | largest peak-to-trough decline of the equity curve, as a positive % |
| `sharpe_ratio` | annualized: `mean(per-bar return) / stddev × √252`; `null` if < 2 returns or zero variance |
| `trade_count`, `winning_trades`, `losing_trades` | counts (a `pnl == 0` trade is neither) |
| `exposure_pct` | % of bars holding a position |

A trade's `return_pct`/`pnl` are net of commission and slippage. Returns and
P&L on the curve are after fees.

## API surface

All responses follow `{ "success": true, ... }` / `{ "success": false, "error": "…" }`.

### `POST /api/backtest`

Run a strategy over one or more symbols (and/or a watchlist), persist the run,
and return it.

```jsonc
{
  "symbols": ["AAPL", "MSFT"],          // and/or:
  "watchlist_id": "657f…",              // union of both is simulated (≤ 25 symbols)
  "label": "RSI mean-reversion",         // optional; auto-generated from symbols if omitted
  "start_date": "2022-01-01T00:00:00Z",  // optional window bounds (ISO-8601)
  "end_date":   "2024-01-01T00:00:00Z",
  "lookback_days": 730,                  // optional; overrides the date-derived Yahoo lookback
  "strategy": {
    "entry": { "op": "leaf", "condition": { "type": "rsi_below", "value": 30 } },
    "exit":  { "op": "leaf", "condition": { "type": "rsi_above", "value": 70 } },
    "stop_loss_pct": 8,
    "take_profit_pct": 20,
    "position_size_pct": 1.0,
    "initial_capital": 10000,
    "commission_bps": 5,
    "slippage_bps": 5
  }
}
```

Returns `{ "success": true, "run": BacktestRun }` where `run` embeds a
`BacktestResult` per symbol (trade log + equity curve + metrics), an aggregate
`summary`, and the run `_id`.

### `GET /api/backtests`

List run summaries, most recent first (heavy equity curves omitted):
`{ "success": true, "count": N, "backtests": [BacktestSummary, …] }`.

### `GET /api/backtest/:id`

Fetch a full run by id: `{ "success": true, "run": BacktestRun }`, or
`success: false` if the id is malformed or not found.

## Notes

- No new env vars or external services — backtests pull history through the
  existing Yahoo client; the simulation itself is offline.
- Runs are stored in the append-only `backtests` collection (immutable history),
  unlike `stock_analysis` which is upserted per symbol.
- The simulator is exercised by deterministic unit tests in `src/backtest.rs`
  (monotonic-rise, drawdown, stop/take-profit ordering, all-loss, zero-trade,
  windowing, snapshot-vs-slice parity). Run with `cargo test`.
