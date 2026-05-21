//! Backtesting / strategy-performance engine.
//!
//! Pure, network-free simulation: given a symbol's `Vec<HistoricalPrice>` and a
//! [`Strategy`], it walks the bars one at a time, rebuilds a `StockAnalysis`
//! snapshot from the history *up to that bar*, evaluates the strategy's
//! entry/exit rule-trees with the same evaluator the live alert engine uses,
//! manages a single long position (stop-loss / take-profit / max-holding), and
//! records every round-trip trade, an equity curve, and a metrics block.
//!
//! All execution invariants (close-to-close fills, no same-bar re-entry, stop
//! checked first, forced close at end of data, …) are documented in
//! `NOTES_BACKTESTING.md` and locked by the unit tests at the bottom of this
//! file. The math is deliberately Option-returning / panic-free so zero-trade
//! and all-loss runs produce a valid result rather than `NaN`/`Inf`.

use chrono::{DateTime, Utc};

use crate::indicators::TechnicalIndicators;
use crate::models::{
    BacktestMetrics, BacktestResult, BacktestSummary, EquityPoint, ExitReason, HistoricalPrice,
    NasdaqTechnicals, StockAnalysis, Strategy, Trade,
};
use crate::notifications::rules::{evaluate, EvalContext};

// Indicator periods mirror the live engine (`analysis.rs::process_stock_with_prices`).
const RSI_PERIOD: usize = 14;
const SMA_SHORT: usize = 20;
const SMA_LONG: usize = 50;
const BOLLINGER_PERIOD: usize = 20;
const BOLLINGER_STD: f64 = 2.0;
const STOCH_K: usize = 14;
const STOCH_D: usize = 3;
/// Trailing window (in bars) used for the synthetic 52-week high/low. ~252
/// trading days per year; the helper uses `min(window, available)` so it warms
/// up gracefully early in the series.
const FIFTY_TWO_WEEK_BARS: usize = 252;
/// Trading days per year, for annualizing the Sharpe ratio (daily bars assumed).
const TRADING_DAYS_PER_YEAR: f64 = 252.0;
/// Default capital used if a caller supplies a non-positive `initial_capital`.
const FALLBACK_CAPITAL: f64 = 10_000.0;

/// Build a `StockAnalysis` snapshot as of bar `i`, computed from `&prices[..=i]`
/// using the same indicator functions/periods as the production analysis loop.
///
/// `price_change*` are bar-over-bar (close[i] vs close[i-1]). The 52-week
/// high/low are filled from the trailing window into a minimal
/// `NasdaqTechnicals` so `Near52WeekLow/High` and `DropFromHighPct` conditions
/// work. `sector`/`market_cap` stay `None` (a per-symbol backtest has no
/// cross-sectional context), so `SectorEquals` is inert by design.
///
/// Panics only if `i >= prices.len()` — callers always pass a valid index.
pub fn snapshot_at(prices: &[HistoricalPrice], i: usize) -> StockAnalysis {
    let slice = &prices[..=i];
    let bar = &prices[i];

    let rsi = TechnicalIndicators::calculate_rsi(slice, RSI_PERIOD);
    let sma_20 = TechnicalIndicators::calculate_sma(slice, SMA_SHORT);
    let sma_50 = TechnicalIndicators::calculate_sma(slice, SMA_LONG);
    let macd = TechnicalIndicators::calculate_macd(slice);
    let bollinger =
        TechnicalIndicators::calculate_bollinger_bands(slice, BOLLINGER_PERIOD, BOLLINGER_STD);
    let stochastic = TechnicalIndicators::calculate_stochastic(slice, STOCH_K, STOCH_D);

    let (price_change, price_change_percent) = if i > 0 {
        let prev = prices[i - 1].close;
        if prev.abs() > f64::EPSILON {
            let change = bar.close - prev;
            (Some(change), Some(change / prev * 100.0))
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    // Trailing 52-week range over the available history (≤ 252 bars).
    let window = slice.len().min(FIFTY_TWO_WEEK_BARS);
    let fifty_two_week_high = TechnicalIndicators::highest_high(slice, window);
    let fifty_two_week_low = TechnicalIndicators::lowest_low(slice, window);
    let technicals = if fifty_two_week_high.is_some() || fifty_two_week_low.is_some() {
        Some(fifty_two_week_technicals(
            fifty_two_week_high,
            fifty_two_week_low,
        ))
    } else {
        None
    };

    StockAnalysis {
        id: None,
        symbol: String::new(),
        price: bar.close,
        price_change,
        price_change_percent,
        rsi,
        sma_20,
        sma_50,
        macd,
        volume: Some(bar.volume),
        market_cap: None,
        sector: None,
        is_oversold: TechnicalIndicators::is_oversold(rsi),
        is_overbought: TechnicalIndicators::is_overbought(rsi),
        analyzed_at: bar.date,
        bollinger,
        stochastic,
        earnings: None,
        technicals,
        news: None,
    }
}

/// Minimal `NasdaqTechnicals` carrying only the trailing 52-week high/low.
fn fifty_two_week_technicals(high: Option<f64>, low: Option<f64>) -> NasdaqTechnicals {
    NasdaqTechnicals {
        exchange: None,
        sector: None,
        industry: None,
        one_year_target: None,
        todays_high: None,
        todays_low: None,
        share_volume: None,
        average_volume: None,
        previous_close: None,
        fifty_two_week_high: high,
        fifty_two_week_low: low,
        pe_ratio: None,
        forward_pe: None,
        eps: None,
        annualized_dividend: None,
        ex_dividend_date: None,
        dividend_pay_date: None,
        current_yield: None,
        last_sale_price: None,
        net_change: None,
        percentage_change: None,
    }
}

/// An open long position carried across bars while the simulation runs.
struct OpenPosition {
    shares: f64,
    /// Cash removed at entry (notional + entry commission). The cost basis.
    entry_cost: f64,
    entry_fill: f64,
    entry_index: usize,
    entry_date: DateTime<Utc>,
    /// Absolute stop level (already includes the % below the fill). `None` = no stop.
    stop_price: Option<f64>,
    /// Absolute take-profit level. `None` = no target.
    take_price: Option<f64>,
}

/// Run a backtest over the full `prices` series (entries allowed from bar 0).
pub fn simulate(symbol: &str, prices: &[HistoricalPrice], strategy: &Strategy) -> BacktestResult {
    simulate_from(symbol, prices, strategy, 0)
}

/// Run a backtest, allowing entries (and recording the equity curve) only from
/// `start_index` onward. Indicators still warm up using the full history before
/// `start_index`, so a date-bounded window doesn't start with cold indicators.
pub fn simulate_from(
    symbol: &str,
    prices: &[HistoricalPrice],
    strategy: &Strategy,
    start_index: usize,
) -> BacktestResult {
    let initial_capital = if strategy.initial_capital.is_finite() && strategy.initial_capital > 0.0
    {
        strategy.initial_capital
    } else {
        FALLBACK_CAPITAL
    };

    // Fewer than two bars in the window → nothing to simulate (no holding
    // period can form). Return a valid, trade-less result.
    if prices.len() < 2 || start_index >= prices.len() {
        return empty_result(symbol, initial_capital, prices, start_index);
    }

    let cap_pct = strategy.position_size_pct.clamp(0.0, 1.0);
    let commission_rate = (strategy.commission_bps.max(0.0)) / 10_000.0;
    let slippage_rate = (strategy.slippage_bps.max(0.0)) / 10_000.0;

    let mut cash = initial_capital;
    let mut trades: Vec<Trade> = Vec::new();
    let mut equity_curve: Vec<EquityPoint> = Vec::with_capacity(prices.len() - start_index);
    let mut open: Option<OpenPosition> = None;
    // Previous bar's MACD histogram, threaded for cross detection (matches the
    // live evaluator: no cross on the first bar where MACD becomes available).
    let mut prev_hist: Option<f64> = None;
    let mut bars_in_market = 0usize;

    for i in 0..prices.len() {
        let snap = snapshot_at(prices, i);
        let curr_hist = snap.macd.as_ref().map(|m| m.histogram);
        let bar = &prices[i];
        let mut exited_this_bar = false;

        // --- Manage an existing position (opened on an earlier bar) ----------
        // Decide the exit while only *borrowing* `open`; act after the borrow
        // is released so we can `open.take()`.
        let exit_decision: Option<(f64, ExitReason)> = if let Some(pos) = open.as_ref() {
            let mut exit: Option<(f64, ExitReason)> = None;

            // 1. Stop-loss (intrabar low). Checked first so a bar that touches
            //    both stop and target resolves to the stop (conservative).
            if let Some(stop) = pos.stop_price {
                if bar.low <= stop {
                    exit = Some((stop, ExitReason::StopLoss));
                }
            }
            // 2. Take-profit (intrabar high).
            if exit.is_none() {
                if let Some(take) = pos.take_price {
                    if bar.high >= take {
                        exit = Some((take, ExitReason::TakeProfit));
                    }
                }
            }
            // 3. Exit condition (evaluated on the close).
            if exit.is_none() {
                let ctx = EvalContext {
                    analysis: &snap,
                    prev_macd_histogram: prev_hist,
                };
                if evaluate(&strategy.exit, &ctx).0 {
                    exit = Some((bar.close, ExitReason::ExitSignal));
                }
            }
            // 4. Max holding period (on the close).
            if exit.is_none() {
                if let Some(max_hold) = strategy.max_holding_bars {
                    if i.saturating_sub(pos.entry_index) >= max_hold {
                        exit = Some((bar.close, ExitReason::MaxHolding));
                    }
                }
            }
            exit
        } else {
            None
        };

        if let Some((reference, reason)) = exit_decision {
            let pos = open.take().unwrap();
            let trade = close_position(
                &pos,
                reference,
                bar.date,
                i,
                reason,
                slippage_rate,
                commission_rate,
            );
            cash += trade_proceeds(&pos, reference, slippage_rate, commission_rate);
            trades.push(trade);
            exited_this_bar = true;
        }

        // --- Look for an entry (only when flat and not just exited) ----------
        if open.is_none() && !exited_this_bar && i >= start_index {
            let ctx = EvalContext {
                analysis: &snap,
                prev_macd_histogram: prev_hist,
            };
            if evaluate(&strategy.entry, &ctx).0 {
                let budget = cash * cap_pct;
                let entry_fill = bar.close * (1.0 + slippage_rate);
                if budget > 0.0 && entry_fill > 0.0 {
                    // Size so notional + entry commission == budget exactly;
                    // cash therefore never goes negative.
                    let shares = budget / (entry_fill * (1.0 + commission_rate));
                    if shares > 0.0 && shares.is_finite() {
                        cash -= budget;
                        open = Some(OpenPosition {
                            shares,
                            entry_cost: budget,
                            entry_fill,
                            entry_index: i,
                            entry_date: bar.date,
                            stop_price: strategy
                                .stop_loss_pct
                                .map(|p| entry_fill * (1.0 - p / 100.0)),
                            take_price: strategy
                                .take_profit_pct
                                .map(|p| entry_fill * (1.0 + p / 100.0)),
                        });
                    }
                }
            }
        }

        // --- Mark to market + record equity (only within the window) --------
        if i >= start_index {
            let equity = match open.as_ref() {
                Some(pos) => cash + pos.shares * bar.close,
                None => cash,
            };
            equity_curve.push(EquityPoint {
                date: bar.date,
                equity,
            });
            if open.is_some() {
                bars_in_market += 1;
            }
        }

        prev_hist = curr_hist;
    }

    // Force-close any position still open on the last bar so metrics reflect a
    // completed round-trip, tagged so the UI doesn't read it as a real signal.
    if let Some(pos) = open.take() {
        let last = prices.len() - 1;
        let bar = &prices[last];
        let trade = close_position(
            &pos,
            bar.close,
            bar.date,
            last,
            ExitReason::EndOfData,
            slippage_rate,
            commission_rate,
        );
        cash += trade_proceeds(&pos, bar.close, slippage_rate, commission_rate);
        trades.push(trade);
        // Align the final equity point with the net liquidation value.
        if let Some(point) = equity_curve.last_mut() {
            point.equity = cash;
        }
    }

    let bars = equity_curve.len();
    let final_equity = cash;
    let metrics = compute_metrics(
        initial_capital,
        final_equity,
        &trades,
        &equity_curve,
        bars_in_market,
    );

    BacktestResult {
        symbol: symbol.to_string(),
        trades,
        start_date: equity_curve.first().map(|p| p.date),
        end_date: equity_curve.last().map(|p| p.date),
        equity_curve,
        metrics,
        initial_capital,
        final_equity,
        bars,
        error: None,
    }
}

/// Net cash received when closing `pos` at `reference` (sell fill = reference
/// after slippage, minus exit commission on the proceeds).
fn trade_proceeds(
    pos: &OpenPosition,
    reference: f64,
    slippage_rate: f64,
    commission_rate: f64,
) -> f64 {
    let sell_fill = reference * (1.0 - slippage_rate);
    pos.shares * sell_fill * (1.0 - commission_rate)
}

/// Build the `Trade` record for closing `pos`.
fn close_position(
    pos: &OpenPosition,
    reference: f64,
    exit_date: DateTime<Utc>,
    exit_index: usize,
    reason: ExitReason,
    slippage_rate: f64,
    commission_rate: f64,
) -> Trade {
    let sell_fill = reference * (1.0 - slippage_rate);
    let proceeds = trade_proceeds(pos, reference, slippage_rate, commission_rate);
    let pnl = proceeds - pos.entry_cost;
    let return_pct = if pos.entry_cost > 0.0 {
        pnl / pos.entry_cost * 100.0
    } else {
        0.0
    };
    Trade {
        entry_date: pos.entry_date,
        entry_price: pos.entry_fill,
        exit_date,
        exit_price: sell_fill,
        shares: pos.shares,
        return_pct,
        pnl,
        bars_held: exit_index.saturating_sub(pos.entry_index),
        exit_reason: reason,
    }
}

/// A valid result for a series too short to simulate.
fn empty_result(
    symbol: &str,
    initial_capital: f64,
    prices: &[HistoricalPrice],
    start_index: usize,
) -> BacktestResult {
    let equity_curve: Vec<EquityPoint> = prices
        .iter()
        .skip(start_index)
        .map(|p| EquityPoint {
            date: p.date,
            equity: initial_capital,
        })
        .collect();
    let metrics = compute_metrics(initial_capital, initial_capital, &[], &equity_curve, 0);
    BacktestResult {
        symbol: symbol.to_string(),
        trades: Vec::new(),
        start_date: equity_curve.first().map(|p| p.date),
        end_date: equity_curve.last().map(|p| p.date),
        equity_curve,
        metrics,
        initial_capital,
        final_equity: initial_capital,
        bars: 0,
        error: None,
    }
}

/// Build a `BacktestResult` carrying only an error (history fetch failed, etc).
pub fn error_result(symbol: &str, initial_capital: f64, error: String) -> BacktestResult {
    BacktestResult {
        symbol: symbol.to_string(),
        trades: Vec::new(),
        equity_curve: Vec::new(),
        metrics: compute_metrics(initial_capital, initial_capital, &[], &[], 0),
        initial_capital,
        final_equity: initial_capital,
        bars: 0,
        start_date: None,
        end_date: None,
        error: Some(error),
    }
}

/// Compute the metrics block. Pure; handles empty/all-loss inputs without
/// producing `NaN`/`Inf` (undefined ratios become `None`).
fn compute_metrics(
    initial_capital: f64,
    final_equity: f64,
    trades: &[Trade],
    equity_curve: &[EquityPoint],
    bars_in_market: usize,
) -> BacktestMetrics {
    let total_return_pct = if initial_capital > 0.0 {
        (final_equity - initial_capital) / initial_capital * 100.0
    } else {
        0.0
    };

    let trade_count = trades.len();
    let winning: Vec<&Trade> = trades.iter().filter(|t| t.pnl > 0.0).collect();
    let losing: Vec<&Trade> = trades.iter().filter(|t| t.pnl < 0.0).collect();
    let winning_trades = winning.len();
    let losing_trades = losing.len();

    let win_rate_pct = if trade_count > 0 {
        winning_trades as f64 / trade_count as f64 * 100.0
    } else {
        0.0
    };

    let avg_win_pct = if winning_trades > 0 {
        Some(winning.iter().map(|t| t.return_pct).sum::<f64>() / winning_trades as f64)
    } else {
        None
    };
    let avg_loss_pct = if losing_trades > 0 {
        Some(losing.iter().map(|t| t.return_pct).sum::<f64>() / losing_trades as f64)
    } else {
        None
    };

    let gross_profit: f64 = winning.iter().map(|t| t.pnl).sum();
    let gross_loss: f64 = losing.iter().map(|t| -t.pnl).sum();
    let profit_factor = if gross_loss > 0.0 {
        Some(gross_profit / gross_loss)
    } else {
        None
    };

    let max_drawdown_pct = max_drawdown(equity_curve);
    let sharpe_ratio = annualized_sharpe(equity_curve);

    let exposure_pct = if !equity_curve.is_empty() {
        bars_in_market as f64 / equity_curve.len() as f64 * 100.0
    } else {
        0.0
    };

    let cagr_pct = cagr(initial_capital, final_equity, equity_curve);

    BacktestMetrics {
        total_return_pct,
        cagr_pct,
        win_rate_pct,
        avg_win_pct,
        avg_loss_pct,
        profit_factor,
        max_drawdown_pct,
        sharpe_ratio,
        trade_count,
        winning_trades,
        losing_trades,
        exposure_pct,
    }
}

/// Maximum peak-to-trough decline of the equity curve, as a positive percent.
fn max_drawdown(equity_curve: &[EquityPoint]) -> f64 {
    let mut peak = f64::NEG_INFINITY;
    let mut max_dd = 0.0;
    for point in equity_curve {
        if point.equity > peak {
            peak = point.equity;
        }
        if peak > 0.0 {
            let dd = (peak - point.equity) / peak * 100.0;
            if dd > max_dd {
                max_dd = dd;
            }
        }
    }
    max_dd
}

/// Annualized Sharpe of per-bar returns. `None` when there are < 2 returns or
/// the returns have zero variance (a risk-free-like flat curve).
fn annualized_sharpe(equity_curve: &[EquityPoint]) -> Option<f64> {
    if equity_curve.len() < 3 {
        return None;
    }
    let mut returns = Vec::with_capacity(equity_curve.len() - 1);
    for w in equity_curve.windows(2) {
        let prev = w[0].equity;
        if prev.abs() <= f64::EPSILON {
            continue;
        }
        returns.push(w[1].equity / prev - 1.0);
    }
    if returns.len() < 2 {
        return None;
    }
    let n = returns.len() as f64;
    let mean = returns.iter().sum::<f64>() / n;
    let variance = returns.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (n - 1.0);
    let std = variance.sqrt();
    if std <= f64::EPSILON {
        return None;
    }
    Some(mean / std * TRADING_DAYS_PER_YEAR.sqrt())
}

/// Compound annual growth rate (%). `None` when the span is < 1 day or capital
/// is non-positive.
fn cagr(initial_capital: f64, final_equity: f64, equity_curve: &[EquityPoint]) -> Option<f64> {
    if initial_capital <= 0.0 || final_equity <= 0.0 || equity_curve.len() < 2 {
        return None;
    }
    let start = equity_curve.first()?.date;
    let end = equity_curve.last()?.date;
    let days = end.signed_duration_since(start).num_seconds() as f64 / 86_400.0;
    if days <= 0.0 {
        return None;
    }
    let years = days / 365.25;
    Some(((final_equity / initial_capital).powf(1.0 / years) - 1.0) * 100.0)
}

/// Build the aggregate summary across a run's per-symbol results. `id` is left
/// `None`; the DB layer fills it from the run's `_id` at save time. Equal-
/// weighted across symbols that simulated without error.
pub fn summarize(
    label: &str,
    symbols: &[String],
    ran_at: DateTime<Utc>,
    results: &[BacktestResult],
) -> BacktestSummary {
    let ok: Vec<&BacktestResult> = results.iter().filter(|r| r.error.is_none()).collect();
    let symbol_count = ok.len();

    let mean = |vals: &[f64]| -> f64 {
        if vals.is_empty() {
            0.0
        } else {
            vals.iter().sum::<f64>() / vals.len() as f64
        }
    };

    let total_return_pct = mean(
        &ok.iter()
            .map(|r| r.metrics.total_return_pct)
            .collect::<Vec<_>>(),
    );
    let win_rate_pct = mean(
        &ok.iter()
            .map(|r| r.metrics.win_rate_pct)
            .collect::<Vec<_>>(),
    );
    let trade_count = ok.iter().map(|r| r.metrics.trade_count).sum();
    let max_drawdown_pct = ok
        .iter()
        .map(|r| r.metrics.max_drawdown_pct)
        .fold(0.0_f64, f64::max);
    let sharpes: Vec<f64> = ok.iter().filter_map(|r| r.metrics.sharpe_ratio).collect();
    let sharpe_ratio = if sharpes.is_empty() {
        None
    } else {
        Some(mean(&sharpes))
    };

    BacktestSummary {
        id: None,
        label: label.to_string(),
        symbols: symbols.to_vec(),
        ran_at,
        symbol_count,
        total_return_pct,
        trade_count,
        win_rate_pct,
        max_drawdown_pct,
        sharpe_ratio,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notifications::models::{Condition, ConditionGroup};
    use chrono::{Duration, TimeZone};

    fn base_date() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2020, 1, 1, 0, 0, 0).unwrap()
    }

    /// OHLC bar `i` days after the base date.
    fn bar(i: usize, open: f64, high: f64, low: f64, close: f64) -> HistoricalPrice {
        HistoricalPrice {
            date: base_date() + Duration::days(i as i64),
            open,
            high,
            low,
            close,
            volume: 1_000_000.0,
        }
    }

    /// A bar whose OHLC are all the same close (used when intrabar range is
    /// irrelevant to the test).
    fn flat_bar(i: usize, close: f64) -> HistoricalPrice {
        bar(i, close, close, close, close)
    }

    fn leaf(c: Condition) -> ConditionGroup {
        ConditionGroup::Leaf { condition: c }
    }

    /// Strategy with explicit entry/exit and otherwise-zeroed knobs (no fees,
    /// full deployment, 10k capital) so trade math is exact.
    fn strategy(entry: ConditionGroup, exit: ConditionGroup) -> Strategy {
        Strategy {
            entry,
            exit,
            stop_loss_pct: None,
            take_profit_pct: None,
            max_holding_bars: None,
            position_size_pct: 1.0,
            initial_capital: 10_000.0,
            commission_bps: 0.0,
            slippage_bps: 0.0,
        }
    }

    /// Entry that always fires (price is always > 0); exit that never fires.
    fn always_in() -> Strategy {
        strategy(
            leaf(Condition::PriceAbove { value: 0.0 }),
            leaf(Condition::PriceBelow { value: 0.0 }),
        )
    }

    #[test]
    fn monotonic_rising_is_one_winning_trade() {
        // 100 → 110 over 11 bars. Buy bar 0 @100, force-close bar 10 @110.
        let prices: Vec<HistoricalPrice> = (0..11).map(|i| flat_bar(i, 100.0 + i as f64)).collect();
        let res = simulate("UP", &prices, &always_in());

        assert_eq!(res.trades.len(), 1);
        let t = &res.trades[0];
        assert_eq!(t.exit_reason, ExitReason::EndOfData);
        assert!((t.entry_price - 100.0).abs() < 1e-9);
        assert!((t.exit_price - 110.0).abs() < 1e-9);
        // 100 shares × $110 = $11,000 from $10,000 → +10%.
        assert!(
            (res.final_equity - 11_000.0).abs() < 1e-6,
            "final {}",
            res.final_equity
        );
        assert!((res.metrics.total_return_pct - 10.0).abs() < 1e-6);
        assert!((res.metrics.win_rate_pct - 100.0).abs() < 1e-9);
        assert_eq!(res.metrics.winning_trades, 1);
        assert_eq!(res.metrics.losing_trades, 0);
        // Monotonic up → no drawdown, profit factor undefined (no losers).
        assert!(res.metrics.max_drawdown_pct.abs() < 1e-9);
        assert!(res.metrics.profit_factor.is_none());
        assert!(res.metrics.avg_loss_pct.is_none());
        // Held the whole window → ~100% exposure.
        assert!((res.metrics.exposure_pct - 100.0).abs() < 1e-9);
    }

    #[test]
    fn buy_and_hold_drawdown_and_single_trade() {
        // 100, 120, 90, 130 → buy @100 (100 shares), equity 10k,12k,9k,13k.
        // Peak 12k then 9k → 25% drawdown. Force close @130 → +30%.
        let prices = vec![
            flat_bar(0, 100.0),
            flat_bar(1, 120.0),
            flat_bar(2, 90.0),
            flat_bar(3, 130.0),
        ];
        let res = simulate("DD", &prices, &always_in());

        assert_eq!(res.trades.len(), 1);
        assert_eq!(res.trades[0].exit_reason, ExitReason::EndOfData);
        assert!((res.metrics.total_return_pct - 30.0).abs() < 1e-6);
        assert!(
            (res.metrics.max_drawdown_pct - 25.0).abs() < 1e-6,
            "dd {}",
            res.metrics.max_drawdown_pct
        );
        assert_eq!(res.equity_curve.len(), 4);
        assert!((res.equity_curve[1].equity - 12_000.0).abs() < 1e-6);
        assert!((res.equity_curve[2].equity - 9_000.0).abs() < 1e-6);
    }

    #[test]
    fn take_profit_exit() {
        // Buy @100, target +5% = 105. Bar 1 high 106 triggers TP at 105.
        let mut strat = always_in();
        strat.take_profit_pct = Some(5.0);
        let prices = vec![
            bar(0, 100.0, 100.0, 100.0, 100.0),
            bar(1, 101.0, 106.0, 101.0, 104.0),
            bar(2, 104.0, 104.0, 104.0, 104.0),
        ];
        let res = simulate("TP", &prices, &strat);
        // First trade is the TP; entry re-fires afterwards so there may be a
        // trailing EndOfData trade — assert on the first.
        assert!(res.trades.len() >= 1);
        let t = &res.trades[0];
        assert_eq!(t.exit_reason, ExitReason::TakeProfit);
        assert!((t.exit_price - 105.0).abs() < 1e-9, "exit {}", t.exit_price);
        assert!((t.return_pct - 5.0).abs() < 1e-9);
        assert_eq!(t.bars_held, 1);
    }

    #[test]
    fn stop_loss_exit() {
        // Buy @100, stop -5% = 95. Bar 1 low 94 triggers stop at 95.
        let mut strat = always_in();
        strat.stop_loss_pct = Some(5.0);
        let prices = vec![
            bar(0, 100.0, 100.0, 100.0, 100.0),
            bar(1, 99.0, 99.0, 94.0, 96.0),
            bar(2, 96.0, 96.0, 96.0, 96.0),
        ];
        let res = simulate("SL", &prices, &strat);
        let t = &res.trades[0];
        assert_eq!(t.exit_reason, ExitReason::StopLoss);
        assert!((t.exit_price - 95.0).abs() < 1e-9);
        assert!((t.return_pct + 5.0).abs() < 1e-9, "return {}", t.return_pct);
    }

    #[test]
    fn stop_not_checked_on_entry_bar() {
        // Bar 0 has a low far below the stop, but the position is opened at the
        // bar-0 close — the stop must NOT fire on bar 0 (that would be
        // lookahead). It fires on bar 2 when the low next breaches 95.
        let mut strat = always_in();
        strat.stop_loss_pct = Some(5.0);
        let prices = vec![
            bar(0, 100.0, 100.0, 80.0, 100.0), // low 80 < stop 95, must be ignored
            bar(1, 100.0, 100.0, 99.0, 100.0), // no breach
            bar(2, 100.0, 100.0, 94.0, 96.0),  // breach → stop
        ];
        let res = simulate("ENTRYBAR", &prices, &strat);
        assert_eq!(res.trades[0].exit_reason, ExitReason::StopLoss);
        assert_eq!(res.trades[0].bars_held, 2, "entered bar 0, stopped bar 2");
    }

    #[test]
    fn stop_takes_priority_over_take_profit_same_bar() {
        // Bar 1 touches both stop (low 94 ≤ 95) and target (high 106 ≥ 105).
        // Conservative rule: the stop wins.
        let mut strat = always_in();
        strat.stop_loss_pct = Some(5.0);
        strat.take_profit_pct = Some(5.0);
        let prices = vec![
            bar(0, 100.0, 100.0, 100.0, 100.0),
            bar(1, 100.0, 106.0, 94.0, 100.0),
            bar(2, 100.0, 100.0, 100.0, 100.0),
        ];
        let res = simulate("CONFLICT", &prices, &strat);
        assert_eq!(res.trades[0].exit_reason, ExitReason::StopLoss);
    }

    #[test]
    fn max_holding_exit() {
        let mut strat = always_in();
        strat.max_holding_bars = Some(3);
        let prices: Vec<HistoricalPrice> = (0..10).map(|i| flat_bar(i, 100.0)).collect();
        let res = simulate("HOLD", &prices, &strat);
        // First exit after exactly 3 bars held.
        assert_eq!(res.trades[0].exit_reason, ExitReason::MaxHolding);
        assert_eq!(res.trades[0].bars_held, 3);
    }

    #[test]
    fn exit_signal_and_no_same_bar_reentry() {
        // Entry: price < 100. Exit: price > 110.
        let strat = strategy(
            leaf(Condition::PriceBelow { value: 100.0 }),
            leaf(Condition::PriceAbove { value: 110.0 }),
        );
        // 100(flat), 95(buy), 112(sell), 90(buy), 115(sell)
        let prices = vec![
            flat_bar(0, 100.0),
            flat_bar(1, 95.0),
            flat_bar(2, 112.0),
            flat_bar(3, 90.0),
            flat_bar(4, 115.0),
        ];
        let res = simulate("OSC", &prices, &strat);
        assert_eq!(res.trades.len(), 2, "two completed round-trips");
        assert!(res
            .trades
            .iter()
            .all(|t| t.exit_reason == ExitReason::ExitSignal));
        // Bar 2 sold at 112; even though 112 is not < 100, confirm we did not
        // re-enter on bar 2 (no third trade opened there).
        assert_eq!(res.trades[0].entry_date, base_date() + Duration::days(1));
        assert_eq!(res.trades[1].entry_date, base_date() + Duration::days(3));
        // Both wins: 95→112 and 90→115.
        assert_eq!(res.metrics.winning_trades, 2);
    }

    #[test]
    fn all_loss_sequence() {
        // Always-in with a 5% stop on a declining series → every trade stops out
        // for exactly −5%. Two completed losing trades here.
        let mut strat = always_in();
        strat.stop_loss_pct = Some(5.0);
        let prices = vec![
            bar(0, 100.0, 100.0, 100.0, 100.0), // buy @100, stop 95
            bar(1, 96.0, 96.0, 94.0, 96.0),     // low 94 ≤ 95 → stop @95 (−5%)
            bar(2, 96.0, 96.0, 96.0, 96.0),     // re-enter @96, stop 91.2
            bar(3, 92.0, 92.0, 90.0, 92.0),     // low 90 ≤ 91.2 → stop @91.2 (−5%)
            bar(4, 92.0, 92.0, 92.0, 92.0),     // re-enter @92 → force-closed @92 (0%)
        ];
        let res = simulate("LOSS", &prices, &strat);
        // Two stop-outs (both −5%) plus a flat EndOfData close.
        let stops: Vec<&Trade> = res
            .trades
            .iter()
            .filter(|t| t.exit_reason == ExitReason::StopLoss)
            .collect();
        assert_eq!(stops.len(), 2);
        for t in &stops {
            assert!((t.return_pct + 5.0).abs() < 1e-9, "return {}", t.return_pct);
        }
        assert_eq!(res.metrics.winning_trades, 0);
        assert!(res.metrics.total_return_pct < 0.0);
        assert!(res.metrics.avg_win_pct.is_none());
        assert!(res.metrics.avg_loss_pct.unwrap() < 0.0);
        // No winners → gross profit 0, but there ARE losers → factor Some(0.0).
        assert_eq!(res.metrics.profit_factor, Some(0.0));
    }

    #[test]
    fn empty_and_short_history_make_no_trades() {
        let empty: Vec<HistoricalPrice> = Vec::new();
        let res = simulate("EMPTY", &empty, &always_in());
        assert_eq!(res.trades.len(), 0);
        assert_eq!(res.bars, 0);
        assert!((res.final_equity - 10_000.0).abs() < 1e-9);
        assert!((res.metrics.total_return_pct).abs() < 1e-9);
        assert!(res.metrics.sharpe_ratio.is_none());
        assert!(res.metrics.profit_factor.is_none());

        let one = vec![flat_bar(0, 100.0)];
        let res1 = simulate("ONE", &one, &always_in());
        assert_eq!(res1.trades.len(), 0);
    }

    #[test]
    fn commission_and_slippage_reduce_return() {
        let prices: Vec<HistoricalPrice> = (0..11).map(|i| flat_bar(i, 100.0 + i as f64)).collect();
        let mut strat = always_in();
        let clean = simulate("CLEAN", &prices, &strat);
        strat.commission_bps = 50.0; // 0.5% per leg
        strat.slippage_bps = 50.0; // 0.5% per leg
        let dirty = simulate("DIRTY", &prices, &strat);
        assert!(
            dirty.metrics.total_return_pct < clean.metrics.total_return_pct,
            "fees should reduce return: clean {} dirty {}",
            clean.metrics.total_return_pct,
            dirty.metrics.total_return_pct
        );
        // Cash never goes negative even at full deployment with fees.
        assert!(dirty.final_equity > 0.0);
    }

    #[test]
    fn snapshot_indicators_match_direct_slice_computation() {
        // The production decision path is `snapshot_at`. Verify each indicator
        // it exposes equals a direct `calculate_*(&prices[..=i], …)` call — not
        // a tautological wrapper, but the real codepath backtest signals use.
        let closes: Vec<f64> = (0..80)
            .map(|i| 100.0 + 10.0 * ((i as f64) * 0.3).sin() + (i as f64) * 0.2)
            .collect();
        let prices: Vec<HistoricalPrice> = closes
            .iter()
            .enumerate()
            .map(|(i, &c)| bar(i, c * 0.99, c * 1.03, c * 0.97, c))
            .collect();

        for i in [20usize, 35, 50, 60, 79] {
            let snap = snapshot_at(&prices, i);
            let slice = &prices[..=i];
            assert_eq!(
                snap.rsi,
                TechnicalIndicators::calculate_rsi(slice, RSI_PERIOD)
            );
            assert_eq!(
                snap.sma_20,
                TechnicalIndicators::calculate_sma(slice, SMA_SHORT)
            );
            assert_eq!(
                snap.sma_50,
                TechnicalIndicators::calculate_sma(slice, SMA_LONG)
            );
            assert_eq!(
                snap.macd.map(|m| m.histogram),
                TechnicalIndicators::calculate_macd(slice).map(|m| m.histogram)
            );
            assert_eq!(
                snap.bollinger.map(|b| b.bandwidth),
                TechnicalIndicators::calculate_bollinger_bands(
                    slice,
                    BOLLINGER_PERIOD,
                    BOLLINGER_STD
                )
                .map(|b| b.bandwidth)
            );
            assert_eq!(
                snap.stochastic.map(|s| s.k_line),
                TechnicalIndicators::calculate_stochastic(slice, STOCH_K, STOCH_D)
                    .map(|s| s.k_line)
            );
            // 52-week range uses the trailing min(252, available) window.
            let window = slice.len().min(FIFTY_TWO_WEEK_BARS);
            assert_eq!(
                snap.technicals.as_ref().and_then(|t| t.fifty_two_week_high),
                TechnicalIndicators::highest_high(slice, window)
            );
            assert_eq!(snap.price, prices[i].close);
        }
    }

    #[test]
    fn start_index_defers_entries_for_warmup() {
        // Entry always true, but start_index=5 means no trade can open before
        // bar 5; the equity curve also starts at bar 5.
        let prices: Vec<HistoricalPrice> = (0..12).map(|i| flat_bar(i, 100.0 + i as f64)).collect();
        let res = simulate_from("WARMUP", &prices, &always_in(), 5);
        assert_eq!(res.bars, prices.len() - 5);
        assert_eq!(res.equity_curve.len(), 7);
        // First (and only) trade enters on bar 5 at its close (105).
        assert_eq!(res.trades.len(), 1);
        assert!((res.trades[0].entry_price - 105.0).abs() < 1e-9);
        assert_eq!(res.trades[0].entry_date, base_date() + Duration::days(5));
    }

    #[test]
    fn summarize_aggregates_successful_results() {
        let now = base_date();
        let up = simulate(
            "UP",
            &(0..11)
                .map(|i| flat_bar(i, 100.0 + i as f64))
                .collect::<Vec<_>>(),
            &always_in(),
        );
        let failed = error_result("BAD", 10_000.0, "fetch failed".into());
        let summary = summarize(
            "Test run",
            &["UP".to_string(), "BAD".to_string()],
            now,
            &[up.clone(), failed],
        );
        // Only the successful symbol counts toward aggregates.
        assert_eq!(summary.symbol_count, 1);
        assert!((summary.total_return_pct - up.metrics.total_return_pct).abs() < 1e-9);
        assert_eq!(summary.trade_count, up.metrics.trade_count);
        assert!(summary.id.is_none());
    }
}
