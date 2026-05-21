use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

// Entry/exit conditions reuse the alert engine's rule tree. See `backtest.rs`.
use crate::notifications::models::ConditionGroup;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stock {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub symbol: String,
    pub name: String,
    pub price: f64,
    pub market_cap: Option<f64>,
    pub volume: Option<f64>,
    pub sector: Option<String>,
    pub last_updated: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockAnalysis {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub symbol: String,
    pub price: f64,
    pub price_change: Option<f64>,
    pub price_change_percent: Option<f64>,
    pub rsi: Option<f64>,
    pub sma_20: Option<f64>,
    pub sma_50: Option<f64>,
    pub macd: Option<MACDIndicator>,
    pub volume: Option<f64>,
    pub market_cap: Option<f64>,
    pub sector: Option<String>,
    pub is_oversold: bool,
    pub is_overbought: bool,
    pub analyzed_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bollinger: Option<BollingerBands>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stochastic: Option<StochasticOscillator>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub earnings: Option<EarningsData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub technicals: Option<NasdaqTechnicals>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub news: Option<Vec<NasdaqNewsItem>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MACDIndicator {
    pub macd_line: f64,
    pub signal_line: f64,
    pub histogram: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BollingerBands {
    pub upper_band: f64,
    pub lower_band: f64,
    pub middle_band: f64,
    pub bandwidth: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StochasticOscillator {
    pub k_line: f64,
    pub d_line: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EarningsData {
    pub earnings_date: Option<DateTime<Utc>>,
    pub eps_estimate: Option<f64>,
    pub revenue_estimate: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsiderTrade {
    pub insider_name: String,
    pub relation: Option<String>,
    pub transaction_type: String,
    pub date: Option<String>,
    pub shares_traded: Option<f64>,
    pub price: Option<f64>,
    pub shares_held: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectorPerformance {
    pub sector: String,
    pub stock_count: u32,
    pub avg_change_percent: f64,
    pub avg_rsi: f64,
    pub top_performers: Vec<StockAnalysis>,
    pub bottom_performers: Vec<StockAnalysis>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AggregatedNewsItem {
    pub symbol: String,
    pub sector: Option<String>,
    pub title: String,
    pub url: String,
    pub publisher: Option<String>,
    pub created: Option<String>,
    pub ago: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoricalPrice {
    pub date: DateTime<Utc>,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StockFilter {
    pub min_price: Option<f64>,
    pub max_price: Option<f64>,
    pub min_volume: Option<f64>,
    pub min_market_cap: Option<f64>,
    pub max_market_cap: Option<f64>,
    pub min_rsi: Option<f64>,
    pub max_rsi: Option<f64>,
    pub sectors: Option<Vec<String>>,
    pub only_oversold: Option<bool>,
    pub only_overbought: Option<bool>,
    /// Case-insensitive substring match on `symbol`. Lets the UI search the
    /// entire universe instead of just the rows already on the current page.
    pub symbol_search: Option<String>,
    // Stochastic / Bollinger filters
    pub min_stochastic_k: Option<f64>,
    pub max_stochastic_k: Option<f64>,
    pub min_bandwidth: Option<f64>,
    pub max_bandwidth: Option<f64>,
    /// Drop rows whose `|price_change_percent|` exceeds this threshold.
    /// Keeps runaway day-gainers out of the feed.
    pub max_abs_price_change_percent: Option<f64>,
    // Sorting options
    pub sort_by: Option<String>, // "market_cap", "price_change_percent", "rsi", "price"
    pub sort_order: Option<String>, // "asc" or "desc"
    // Pagination
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketSummary {
    pub total_stocks: usize,
    pub top_gainers: Vec<StockAnalysis>,
    pub top_losers: Vec<StockAnalysis>,
    pub most_oversold: Vec<StockAnalysis>,
    pub most_overbought: Vec<StockAnalysis>,
    pub mega_cap_highlights: Vec<StockAnalysis>, // >$200B
    pub generated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AnalysisProgress {
    pub total_stocks: usize,
    pub analyzed: usize,
    pub current_symbol: Option<String>,
    pub cycle_start: DateTime<Utc>,
    pub errors: usize,
    pub last_cycle_started: Option<DateTime<Utc>>,
    pub last_cycle_completed: Option<DateTime<Utc>>,
    pub last_successful_cycle: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
}

// NASDAQ Technicals (from /api/quote/{symbol}/info endpoint)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NasdaqTechnicals {
    pub exchange: Option<String>,
    pub sector: Option<String>,
    pub industry: Option<String>,
    pub one_year_target: Option<f64>,
    pub todays_high: Option<f64>,
    pub todays_low: Option<f64>,
    pub share_volume: Option<f64>,
    pub average_volume: Option<f64>,
    pub previous_close: Option<f64>,
    pub fifty_two_week_high: Option<f64>,
    pub fifty_two_week_low: Option<f64>,
    pub pe_ratio: Option<f64>,
    pub forward_pe: Option<f64>,
    pub eps: Option<f64>,
    pub annualized_dividend: Option<f64>,
    pub ex_dividend_date: Option<String>,
    pub dividend_pay_date: Option<String>,
    pub current_yield: Option<f64>,
    // Primary data from NASDAQ API (more reliable for price changes)
    pub last_sale_price: Option<f64>,
    pub net_change: Option<f64>,
    pub percentage_change: Option<f64>,
}

// NASDAQ News Item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NasdaqNewsItem {
    pub title: String,
    pub url: String,
    pub publisher: Option<String>,
    pub created: Option<String>,
    pub ago: Option<String>,
}

// ---------------------------------------------------------------------------
// Marketaux-backed news + AI summary
// ---------------------------------------------------------------------------

/// Article returned by the Marketaux `/news/all` endpoint, normalized to the
/// shape the UI consumes. Other news providers can populate the same struct.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewsArticle {
    pub title: String,
    pub url: String,
    pub source: Option<String>,
    pub published_at: Option<String>,
    pub snippet: Option<String>,
    pub sentiment_score: Option<f64>,
    pub image_url: Option<String>,
}

/// Persisted AI-generated summary for a (symbol, date) pair. Multiple summaries
/// per symbol are kept so we can show a short history.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewsSummary {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub symbol: String,
    /// `YYYY-MM-DD` in UTC, used as the dedupe key alongside `symbol`.
    pub date: String,
    pub summary_text: String,
    pub model_used: String,
    pub article_count: usize,
    pub generated_at: DateTime<Utc>,
}

/// Combined payload returned by `GET /api/stocks/:symbol/news`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewsCardPayload {
    pub symbol: String,
    pub articles: Vec<NewsArticle>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<NewsSummary>,
    pub fetched_at: DateTime<Utc>,
}

/// Symbol enrolled in the daily news pre-fetch loop. Tiny CRUD collection
/// edited via the admin endpoints in `api.rs`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyNewsSymbol {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub symbol: String,
    pub added_at: DateTime<Utc>,
}

// Company Profile from Yahoo Finance quoteSummary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyProfile {
    // Price/identity fields
    pub short_name: Option<String>,
    pub long_name: Option<String>,
    pub exchange: Option<String>,
    pub exchange_name: Option<String>,
    pub quote_type: Option<String>,
    pub currency: Option<String>,
    // Asset Profile fields
    pub long_business_summary: Option<String>,
    pub industry: Option<String>,
    pub sector: Option<String>,
    pub website: Option<String>,
    pub full_time_employees: Option<i64>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub country: Option<String>,
    pub phone: Option<String>,
    // Financial Data fields
    pub current_price: Option<f64>,
    pub target_high_price: Option<f64>,
    pub target_low_price: Option<f64>,
    pub target_mean_price: Option<f64>,
    pub recommendation_key: Option<String>,
    pub number_of_analyst_opinions: Option<i64>,
    pub total_revenue: Option<f64>,
    pub revenue_per_share: Option<f64>,
    pub profit_margins: Option<f64>,
    pub gross_margins: Option<f64>,
    pub operating_margins: Option<f64>,
    pub return_on_equity: Option<f64>,
    pub free_cash_flow: Option<f64>,
    pub revenue_growth: Option<f64>,
    pub earnings_growth: Option<f64>,
    // Summary/detail and key statistics fields
    pub market_cap: Option<f64>,
    pub enterprise_value: Option<f64>,
    pub beta: Option<f64>,
    pub trailing_pe: Option<f64>,
    pub forward_pe: Option<f64>,
    pub peg_ratio: Option<f64>,
    pub price_to_book: Option<f64>,
    pub book_value: Option<f64>,
    pub trailing_eps: Option<f64>,
    pub forward_eps: Option<f64>,
    pub dividend_rate: Option<f64>,
    pub dividend_yield: Option<f64>,
    pub payout_ratio: Option<f64>,
    pub average_volume: Option<f64>,
    pub average_volume_10_day: Option<f64>,
    pub fifty_two_week_high: Option<f64>,
    pub fifty_two_week_low: Option<f64>,
    pub fifty_day_average: Option<f64>,
    pub two_hundred_day_average: Option<f64>,
    pub shares_outstanding: Option<f64>,
    pub float_shares: Option<f64>,
    pub held_percent_insiders: Option<f64>,
    pub held_percent_institutions: Option<f64>,
    pub net_income_to_common: Option<f64>,
}

// AI Analysis Response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIAnalysisResponse {
    pub symbol: String,
    pub analysis: String,
    pub model_used: String,
    pub generated_at: DateTime<Utc>,
}

// NASDAQ API response structures
#[derive(Debug, Clone, Deserialize)]
pub struct NasdaqResponse {
    pub data: NasdaqData,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NasdaqData {
    pub table: NasdaqTable,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NasdaqTable {
    pub rows: Vec<NasdaqStock>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NasdaqStock {
    pub symbol: String,
    pub name: String,
    #[serde(rename = "marketCap")]
    pub market_cap: String,
}

// ---------------------------------------------------------------------------
// Backtesting / strategy performance
//
// Runs are persisted append-only to the `backtests` collection (NOT keyed on
// symbol like `stock_analysis`). A `BacktestRun` groups one `BacktestResult`
// per requested symbol plus an aggregate `BacktestSummary`. The simulator and
// metric definitions live in `src/backtest.rs`; see `BACKTESTING.md`.
// ---------------------------------------------------------------------------

/// Why a backtest position was closed. Snake-cased to match the API + frontend.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExitReason {
    /// Price fell to the stop-loss level.
    StopLoss,
    /// Price reached the take-profit target.
    TakeProfit,
    /// The strategy's exit condition tree fired.
    ExitSignal,
    /// The position hit `max_holding_bars`.
    MaxHolding,
    /// Position was still open on the last bar and force-closed at its close.
    EndOfData,
}

/// A single completed round-trip long trade.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trade {
    pub entry_date: DateTime<Utc>,
    /// Fill price after slippage.
    pub entry_price: f64,
    pub exit_date: DateTime<Utc>,
    /// Fill price after slippage.
    pub exit_price: f64,
    pub shares: f64,
    /// Net return on entry notional as a percent, after commission + slippage.
    pub return_pct: f64,
    /// Net profit/loss in account currency, after commission + slippage.
    pub pnl: f64,
    /// Bars held, counted from the entry bar to the exit bar (inclusive of the
    /// span between them). A same-day in/out would be 0.
    pub bars_held: usize,
    pub exit_reason: ExitReason,
}

/// One point on the equity curve — account value marked-to-market at a bar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EquityPoint {
    pub date: DateTime<Utc>,
    pub equity: f64,
}

/// Default per-trade capital fraction when the client omits it.
fn default_position_size_pct() -> f64 {
    1.0
}

/// Default starting capital when the client omits it.
fn default_initial_capital() -> f64 {
    10_000.0
}

/// Strategy specification: entry/exit rule-trees plus risk + sizing knobs.
///
/// `entry` and `exit` reuse the alert engine's [`ConditionGroup`], so any alert
/// condition (RSI, MACD cross, Bollinger, stochastic, %-change, 52-week
/// proximity, …) is a valid trigger on either side.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Strategy {
    pub entry: ConditionGroup,
    pub exit: ConditionGroup,
    /// Hard stop as a percent below entry (e.g. `8.0` → exit if price drops 8%).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_loss_pct: Option<f64>,
    /// Profit target as a percent above entry.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub take_profit_pct: Option<f64>,
    /// Force-exit after this many bars in the position.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_holding_bars: Option<usize>,
    /// Fraction of *current* equity to deploy per trade, in `(0, 1]`.
    #[serde(default = "default_position_size_pct")]
    pub position_size_pct: f64,
    /// Starting account value.
    #[serde(default = "default_initial_capital")]
    pub initial_capital: f64,
    /// Commission per leg in basis points (1 bp = 0.01%).
    #[serde(default)]
    pub commission_bps: f64,
    /// Slippage per leg in basis points, applied against the fill.
    #[serde(default)]
    pub slippage_bps: f64,
}

/// Performance metrics for one simulation. Percentages are pre-multiplied by
/// 100; `Option` fields are `None` when mathematically undefined (rather than
/// `NaN`/`Inf`), so zero-trade and all-loss runs never panic or poison JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestMetrics {
    pub total_return_pct: f64,
    /// Compound annual growth rate (%). `None` when the span is < 1 bar or
    /// final equity is non-positive.
    pub cagr_pct: Option<f64>,
    pub win_rate_pct: f64,
    /// Average return (%) of winning trades. `None` when there are none.
    pub avg_win_pct: Option<f64>,
    /// Average return (%) of losing trades (negative). `None` when there are none.
    pub avg_loss_pct: Option<f64>,
    /// Gross profit / gross loss. `None` when there are no losing trades.
    pub profit_factor: Option<f64>,
    pub max_drawdown_pct: f64,
    /// Annualized Sharpe of per-bar returns. `None` when variance is 0 or < 2 bars.
    pub sharpe_ratio: Option<f64>,
    pub trade_count: usize,
    pub winning_trades: usize,
    pub losing_trades: usize,
    /// Percent of bars spent holding a position.
    pub exposure_pct: f64,
}

/// The result of simulating one strategy against one symbol's history.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestResult {
    pub symbol: String,
    pub trades: Vec<Trade>,
    pub equity_curve: Vec<EquityPoint>,
    pub metrics: BacktestMetrics,
    pub initial_capital: f64,
    pub final_equity: f64,
    /// Number of bars simulated (within the requested window).
    pub bars: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_date: Option<DateTime<Utc>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_date: Option<DateTime<Utc>>,
    /// Set when this symbol could not be simulated (history fetch failed, too
    /// few bars). When present the other fields are empty/zeroed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Lightweight aggregate over a run, used both for the list endpoint and as the
/// embedded summary on [`BacktestRun`]. `id` mirrors the run's `_id` so list →
/// detail round-trips.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestSummary {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub label: String,
    pub symbols: Vec<String>,
    pub ran_at: DateTime<Utc>,
    /// Symbols that simulated without error.
    pub symbol_count: usize,
    /// Equal-weighted mean total return across successful symbols.
    pub total_return_pct: f64,
    pub trade_count: usize,
    /// Equal-weighted mean win rate across successful symbols.
    pub win_rate_pct: f64,
    /// Worst (largest) per-symbol max drawdown across the run.
    pub max_drawdown_pct: f64,
    /// Equal-weighted mean Sharpe across successful symbols (skipping `None`).
    pub sharpe_ratio: Option<f64>,
}

/// A persisted backtest run. Append-only; one document per POST. Embeds a
/// `BacktestResult` per requested symbol plus an aggregate `summary`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestRun {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub label: String,
    pub strategy: Strategy,
    /// Requested symbols (normalized, deduped).
    pub symbols: Vec<String>,
    pub results: Vec<BacktestResult>,
    pub summary: BacktestSummary,
    pub ran_at: DateTime<Utc>,
}

/// POST `/api/backtest` body. Symbols come from an explicit list and/or a
/// watchlist; the union is simulated.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateBacktestInput {
    #[serde(default)]
    pub symbols: Vec<String>,
    /// Optional watchlist id; its members are unioned with `symbols`.
    #[serde(default)]
    pub watchlist_id: Option<String>,
    pub strategy: Strategy,
    #[serde(default)]
    pub label: Option<String>,
    /// Inclusive simulation-window bounds. When omitted the full fetched
    /// history is used.
    #[serde(default)]
    pub start_date: Option<DateTime<Utc>>,
    #[serde(default)]
    pub end_date: Option<DateTime<Utc>>,
    /// Explicit Yahoo lookback in days; overrides the date-derived lookback.
    #[serde(default)]
    pub lookback_days: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stock_serialization() {
        let stock = Stock {
            id: None,
            symbol: "AAPL".to_string(),
            name: "Apple Inc.".to_string(),
            price: 150.0,
            market_cap: Some(2_500_000_000_000.0),
            volume: Some(50_000_000.0),
            sector: Some("Technology".to_string()),
            last_updated: Utc::now(),
        };

        let json = serde_json::to_string(&stock).unwrap();
        assert!(json.contains("AAPL"));
        assert!(json.contains("150"));

        let deserialized: Stock = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.symbol, "AAPL");
        assert_eq!(deserialized.price, 150.0);
    }

    #[test]
    fn test_stock_analysis_serialization() {
        let analysis = StockAnalysis {
            id: None,
            symbol: "MSFT".to_string(),
            price: 350.0,
            price_change: Some(5.0),
            price_change_percent: Some(1.45),
            rsi: Some(65.5),
            sma_20: Some(345.0),
            sma_50: Some(340.0),
            macd: Some(MACDIndicator {
                macd_line: 1.5,
                signal_line: 1.2,
                histogram: 0.3,
            }),
            volume: Some(25_000_000.0),
            market_cap: Some(2_600_000_000_000.0),
            sector: Some("Technology".to_string()),
            is_oversold: false,
            is_overbought: false,
            analyzed_at: Utc::now(),
            bollinger: None,
            stochastic: None,
            earnings: None,
            technicals: None,
            news: None,
        };

        let json = serde_json::to_string(&analysis).unwrap();
        assert!(json.contains("MSFT"));
        assert!(json.contains("65.5"));

        let deserialized: StockAnalysis = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.symbol, "MSFT");
        assert_eq!(deserialized.rsi, Some(65.5));
    }

    #[test]
    fn test_stock_filter_deserialization() {
        let json = r#"{
            "min_price": 100.0,
            "max_price": 200.0,
            "min_rsi": 30.0,
            "max_rsi": 70.0,
            "only_oversold": false
        }"#;

        let filter: StockFilter = serde_json::from_str(json).unwrap();
        assert_eq!(filter.min_price, Some(100.0));
        assert_eq!(filter.max_price, Some(200.0));
        assert_eq!(filter.min_rsi, Some(30.0));
        assert_eq!(filter.max_rsi, Some(70.0));
    }

    #[test]
    fn test_macd_indicator() {
        let macd = MACDIndicator {
            macd_line: 2.5,
            signal_line: 2.0,
            histogram: 0.5,
        };

        let json = serde_json::to_string(&macd).unwrap();
        let deserialized: MACDIndicator = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.macd_line, 2.5);
        assert_eq!(deserialized.signal_line, 2.0);
        assert_eq!(deserialized.histogram, 0.5);
    }

    #[test]
    fn test_historical_price() {
        let price = HistoricalPrice {
            date: Utc::now(),
            open: 100.0,
            high: 105.0,
            low: 99.0,
            close: 103.0,
            volume: 1_000_000.0,
        };

        let json = serde_json::to_string(&price).unwrap();
        let deserialized: HistoricalPrice = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.open, 100.0);
        assert_eq!(deserialized.close, 103.0);
    }

    #[test]
    fn test_analysis_progress() {
        let progress = AnalysisProgress {
            total_stocks: 60,
            analyzed: 30,
            current_symbol: Some("AAPL".to_string()),
            cycle_start: Utc::now(),
            errors: 2,
            last_cycle_started: None,
            last_cycle_completed: None,
            last_successful_cycle: None,
            last_error: None,
        };

        let json = serde_json::to_string(&progress).unwrap();
        assert!(json.contains("60"));
        assert!(json.contains("30"));
        assert!(json.contains("AAPL"));
    }

    #[test]
    fn test_oversold_flag() {
        let mut analysis = StockAnalysis {
            id: None,
            symbol: "TEST".to_string(),
            price: 100.0,
            price_change: None,
            price_change_percent: None,
            rsi: Some(25.0),
            sma_20: None,
            sma_50: None,
            macd: None,
            volume: None,
            market_cap: None,
            sector: None,
            is_oversold: true,
            is_overbought: false,
            analyzed_at: Utc::now(),
            bollinger: None,
            stochastic: None,
            earnings: None,
            technicals: None,
            news: None,
        };

        assert!(analysis.is_oversold);
        assert!(!analysis.is_overbought);

        analysis.rsi = Some(75.0);
        analysis.is_oversold = false;
        analysis.is_overbought = true;

        assert!(!analysis.is_oversold);
        assert!(analysis.is_overbought);
    }

    #[test]
    fn test_exit_reason_snake_case() {
        assert_eq!(
            serde_json::to_string(&ExitReason::StopLoss).unwrap(),
            "\"stop_loss\""
        );
        assert_eq!(
            serde_json::to_string(&ExitReason::EndOfData).unwrap(),
            "\"end_of_data\""
        );
        let r: ExitReason = serde_json::from_str("\"take_profit\"").unwrap();
        assert_eq!(r, ExitReason::TakeProfit);
    }

    #[test]
    fn test_strategy_serde_defaults() {
        // Only entry/exit supplied — sizing/capital/fees fall back to defaults.
        let json = r#"{
            "entry": { "op": "leaf", "condition": { "type": "rsi_below", "value": 30 } },
            "exit":  { "op": "leaf", "condition": { "type": "rsi_above", "value": 70 } }
        }"#;
        let s: Strategy = serde_json::from_str(json).unwrap();
        assert_eq!(s.position_size_pct, 1.0);
        assert_eq!(s.initial_capital, 10_000.0);
        assert_eq!(s.commission_bps, 0.0);
        assert_eq!(s.slippage_bps, 0.0);
        assert!(s.stop_loss_pct.is_none());
        assert!(s.max_holding_bars.is_none());

        // Round-trips through serde without losing the rule trees.
        let back: Strategy = serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert_eq!(back.entry, s.entry);
        assert_eq!(back.exit, s.exit);
    }
}
