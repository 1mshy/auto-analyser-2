#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn create_test_prices(close_prices: Vec<f64>) -> Vec<HistoricalPrice> {
        close_prices
            .into_iter()
            .enumerate()
            .map(|(i, close)| HistoricalPrice {
                date: Utc::now() - chrono::Duration::days(close_prices.len() as i64 - i as i64),
                open: close * 0.99,
                high: close * 1.02,
                low: close * 0.98,
                close,
                volume: 1000000.0,
            })
            .collect()
    }

    #[test]
    fn test_sma_calculation() {
        let prices = create_test_prices(vec![100.0, 102.0, 104.0, 106.0, 108.0]);
        
        let sma_3 = TechnicalIndicators::calculate_sma(&prices, 3);
        assert!(sma_3.is_some());
        let sma_value = sma_3.unwrap();
        assert!((sma_value - 106.0).abs() < 0.01, "SMA(3) should be ~106.0, got {}", sma_value);

        let sma_5 = TechnicalIndicators::calculate_sma(&prices, 5);
        assert!(sma_5.is_some());
        let sma_value = sma_5.unwrap();
        assert!((sma_value - 104.0).abs() < 0.01, "SMA(5) should be 104.0, got {}", sma_value);
    }

    #[test]
    fn test_sma_insufficient_data() {
        let prices = create_test_prices(vec![100.0, 102.0]);
        let sma = TechnicalIndicators::calculate_sma(&prices, 5);
        assert!(sma.is_none(), "SMA should return None when insufficient data");
    }

    #[test]
    fn test_rsi_calculation() {
        // Create price series with clear uptrend
        let prices = create_test_prices(vec![
            100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0,
            108.0, 109.0, 110.0, 111.0, 112.0, 113.0, 114.0, 115.0,
        ]);

        let rsi = TechnicalIndicators::calculate_rsi(&prices, 14);
        assert!(rsi.is_some(), "RSI should calculate with sufficient data");
        let rsi_value = rsi.unwrap();
        assert!(rsi_value > 50.0 && rsi_value < 100.0, "RSI for uptrend should be > 50, got {}", rsi_value);
    }

    #[test]
    fn test_rsi_downtrend() {
        // Create price series with clear downtrend
        let prices = create_test_prices(vec![
            115.0, 114.0, 113.0, 112.0, 111.0, 110.0, 109.0, 108.0,
            107.0, 106.0, 105.0, 104.0, 103.0, 102.0, 101.0, 100.0,
        ]);

        let rsi = TechnicalIndicators::calculate_rsi(&prices, 14);
        assert!(rsi.is_some());
        let rsi_value = rsi.unwrap();
        assert!(rsi_value > 0.0 && rsi_value < 50.0, "RSI for downtrend should be < 50, got {}", rsi_value);
    }

    #[test]
    fn test_rsi_insufficient_data() {
        let prices = create_test_prices(vec![100.0, 102.0, 104.0]);
        let rsi = TechnicalIndicators::calculate_rsi(&prices, 14);
        assert!(rsi.is_none(), "RSI should return None with insufficient data");
    }

    #[test]
    fn test_macd_calculation() {
        // Need at least 26 days for MACD
        let mut price_values = Vec::new();
        for i in 0..30 {
            price_values.push(100.0 + i as f64 * 0.5);
        }
        let prices = create_test_prices(price_values);

        let macd = TechnicalIndicators::calculate_macd(&prices);
        assert!(macd.is_some(), "MACD should calculate with 30 days of data");
        
        let macd_indicator = macd.unwrap();
        assert!(macd_indicator.macd_line.abs() > 0.0, "MACD line should be non-zero");
        assert!(macd_indicator.signal_line.abs() > 0.0, "Signal line should be non-zero");
    }

    #[test]
    fn test_macd_insufficient_data() {
        let prices = create_test_prices(vec![100.0, 102.0, 104.0, 106.0, 108.0]);
        let macd = TechnicalIndicators::calculate_macd(&prices);
        assert!(macd.is_none(), "MACD should return None with < 26 days");
    }

    #[test]
    fn test_ema_calculation() {
        let prices = create_test_prices(vec![
            100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0,
            108.0, 109.0, 110.0, 111.0, 112.0,
        ]);

        let ema = TechnicalIndicators::calculate_ema(&prices, 12);
        assert!(ema.is_some());
        let ema_value = ema.unwrap();
        assert!(ema_value > 100.0 && ema_value < 115.0, "EMA should be in reasonable range, got {}", ema_value);
    }

    #[test]
    fn test_oversold_detection() {
        assert!(TechnicalIndicators::is_oversold(Some(25.0)));
        assert!(TechnicalIndicators::is_oversold(Some(15.0)));
        assert!(!TechnicalIndicators::is_oversold(Some(35.0)));
        assert!(!TechnicalIndicators::is_oversold(Some(50.0)));
        assert!(!TechnicalIndicators::is_oversold(None));
    }

    #[test]
    fn test_overbought_detection() {
        assert!(TechnicalIndicators::is_overbought(Some(75.0)));
        assert!(TechnicalIndicators::is_overbought(Some(85.0)));
        assert!(!TechnicalIndicators::is_overbought(Some(65.0)));
        assert!(!TechnicalIndicators::is_overbought(Some(50.0)));
        assert!(!TechnicalIndicators::is_overbought(None));
    }

    #[test]
    fn test_rsi_boundary_conditions() {
        // All gains
        let prices = create_test_prices(vec![
            100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0,
            108.0, 109.0, 110.0, 111.0, 112.0, 113.0, 114.0, 115.0,
        ]);
        let rsi = TechnicalIndicators::calculate_rsi(&prices, 14);
        assert!(rsi.is_some());
        let rsi_value = rsi.unwrap();
        assert!(rsi_value > 80.0, "RSI with all gains should be very high, got {}", rsi_value);
    }
}
