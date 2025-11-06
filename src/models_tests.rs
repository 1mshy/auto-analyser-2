#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

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
    fn test_stock_filter_empty() {
        let filter = StockFilter {
            min_price: None,
            max_price: None,
            min_volume: None,
            min_market_cap: None,
            max_market_cap: None,
            min_rsi: None,
            max_rsi: None,
            sectors: None,
            only_oversold: None,
            only_overbought: None,
        };

        let json = serde_json::to_string(&filter).unwrap();
        // Should serialize to mostly null values
        assert!(json.contains("null") || json.len() < 50);
    }

    #[test]
    fn test_oversold_flag() {
        let mut analysis = StockAnalysis {
            id: None,
            symbol: "TEST".to_string(),
            price: 100.0,
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
