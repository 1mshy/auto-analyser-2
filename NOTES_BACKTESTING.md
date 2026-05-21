# Backtesting engine — decisions log

A running record of assumptions and trade-offs made while building the
backtesting / strategy-performance feature (`feat/backtesting-engine`). Kept so
the next reader doesn't have to reverse-engineer the "why".

## Architecture / reuse

- **Entry & exit conditions reuse the alert rule-tree.** `Strategy` embeds two
  `notifications::models::ConditionGroup` trees (entry + exit) and is evaluated
  with the existing pure `notifications::rules::evaluate(group, &EvalContext)`.
  `pub mod rules` is already public, so `src/backtest.rs` can call it directly —
  no change to the notifications public surface was needed. This means every
  metric the alert UI already exposes (RSI, MACD cross, Bollinger, stochastic,
  %-change, 52-week proximity, …) is automatically a valid entry/exit trigger.

- **Per-bar snapshot.** At each bar `i` the simulator builds a `StockAnalysis`
  from `&prices[..=i]` using the same `TechnicalIndicators::calculate_*`
  functions and periods as the live engine (`analysis.rs`): RSI 14, SMA 20/50,
  MACD 12/26/9, Bollinger(20, 2.0), Stochastic(14, 3). Missing indicators stay
  `None` and simply don't fire — identical to live alert semantics. 52-week
  high/low are computed from the trailing window with new pure rolling helpers
  (`highest_high` / `lowest_low`) and stored in a minimal `NasdaqTechnicals`.

- **`prev_macd_histogram`** is threaded from the previous bar's snapshot so MACD
  cross conditions behave exactly like the live evaluator (no fire on the first
  bar where MACD becomes available).

## Execution model (locked invariants)

- **Close-to-close fills.** A signal computed on bar `i`'s close transacts at
  that same close. The close is known at end of bar, so this is not lookahead.
- **Single open long position.** No shorting, no pyramiding.
- **No same-bar churn.** If we exit on bar `i`, the earliest re-entry is bar
  `i+1`. At most one state transition per bar.
- **Stop-loss / take-profit are only checked on bars *after* entry** (first
  check is `i+1`). Checking the entry bar's own intrabar high/low against the
  fill would be lookahead.
- **Stop-vs-TP same-bar conflict resolves to the stop (conservative).** If a
  single bar's low triggers the stop *and* its high triggers the take-profit, we
  assume the stop hit first. This is a deliberate worst-case choice — documented
  here because result correctness depends on it.
- **Exit priority within a bar:** stop-loss → take-profit → exit-condition (on
  close) → max-holding (on close).
- **Forced close at end of data.** A position still open on the last bar is
  closed at the final close and tagged `ExitReason::EndOfData` so it isn't read
  as a real exit signal. It still counts as a completed round-trip for metrics.
- **Commission + slippage** are expressed in basis points and applied on both
  legs. Buy fill = `price * (1 + slippage_bps/1e4)`; sell fill =
  `price * (1 - slippage_bps/1e4)`; commission = `notional * commission_bps/1e4`
  charged on entry and exit notional.
- **Position sizing** is a fixed fraction of *current* equity
  (`position_size_pct`, 0..1). Fractional shares are allowed (keeps the math
  continuous and the tests exact).

## Persistence

- **New `backtests` collection, append-only.** Unlike `stock_analysis` (upsert
  keyed on `symbol`), backtest runs are immutable historical records inserted
  with `insert_one`. No symbol key, no upsert.
- **`BacktestRun` wraps per-symbol `BacktestResult`s.** The task named
  `Strategy / BacktestResult / Trade / EquityPoint / BacktestSummary`. To support
  "run for a symbol *or a watchlist*" we add one extra container type,
  `BacktestRun { _id, label, strategy, symbols, results: Vec<BacktestResult>,
  summary: BacktestSummary, ran_at }`. `BacktestSummary` mirrors the run `_id`
  so list → detail round-trips. This deviation (an extra well-named type) was
  preferred over contorting `BacktestResult` to hold multiple symbols.
- **Mongo index** for the new collection is added in `db.rs::create_indexes`
  (best-effort, non-fatal — same pattern as the news indexes), *not* in
  `indexes.rs`. Despite CLAUDE.md's wording, `src/indexes.rs` is the market-index
  constituent catalog; all real Mongo index creation lives in `db.rs`.
- **16MB document ceiling.** A run embeds full equity curves + trade logs for
  every symbol. For daily bars × a few dozen symbols this is far under Mongo's
  16MB limit. Future work on intraday bars or very large watchlists should chunk
  or cap the embedded curves.

## Config / dependencies

- **No new required env vars and no new external services** (per the task). The
  feature runs on the existing `Config`. Backtests pull history through the
  existing `YahooFinanceClient` already in `AppState`; the simulation math is
  network-free and unit-tested offline.
- **Yahoo lookback conversion.** `YahooFinanceClient::get_historical_prices`
  takes a `days: i64` lookback, not a date range. The POST accepts optional
  `start_date` / `end_date`; we fetch `max(requested_span_days + warmup_buffer,
  floor)` calendar days, then slice the returned series to the requested range
  for the simulation. Warmup buffer covers the longest indicator period (~60
  trading days) plus weekend/holiday padding.
- **Cache is untouched.** Backtests never mutate `StockAnalysis`, so the
  CLAUDE.md cache-invalidation rule does not apply. `cache.rs` and `config.rs`
  were intentionally not modified.
