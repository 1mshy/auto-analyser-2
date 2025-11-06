use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use mongodb::bson::oid::ObjectId;

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MACDIndicator {
    pub macd_line: f64,
    pub signal_line: f64,
    pub histogram: f64,
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
}

#[derive(Debug, Clone, Serialize)]
pub struct AnalysisProgress {
    pub total_stocks: usize,
    pub analyzed: usize,
    pub current_symbol: Option<String>,
    pub cycle_start: DateTime<Utc>,
    pub errors: usize,
}
