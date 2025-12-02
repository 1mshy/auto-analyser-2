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
    // Sorting options
    pub sort_by: Option<String>,      // "market_cap", "price_change_percent", "rsi", "price"
    pub sort_order: Option<String>,   // "asc" or "desc"
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
    pub mega_cap_highlights: Vec<StockAnalysis>,  // >$200B
    pub generated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AnalysisProgress {
    pub total_stocks: usize,
    pub analyzed: usize,
    pub current_symbol: Option<String>,
    pub cycle_start: DateTime<Utc>,
    pub errors: usize,
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
}
