use crate::models::{BollingerBands, HistoricalPrice, MACDIndicator, StochasticOscillator};

pub struct TechnicalIndicators;

impl TechnicalIndicators {
    /// Calculate RSI (Relative Strength Index) using Wilder's Smoothing
    /// This matches TradingView's RSI calculation
    pub fn calculate_rsi(prices: &[HistoricalPrice], period: usize) -> Option<f64> {
        if prices.len() < period + 1 {
            return None;
        }

        // Calculate price changes
        let mut changes = Vec::new();
        for i in 1..prices.len() {
            changes.push(prices[i].close - prices[i - 1].close);
        }

        if changes.len() < period {
            return None;
        }

        // Calculate initial average gain and loss using SMA for first period
        let mut gains = Vec::new();
        let mut losses = Vec::new();
        
        for &change in &changes[..period] {
            if change > 0.0 {
                gains.push(change);
                losses.push(0.0);
            } else {
                gains.push(0.0);
                losses.push(change.abs());
            }
        }

        let mut avg_gain: f64 = gains.iter().sum::<f64>() / period as f64;
        let mut avg_loss: f64 = losses.iter().sum::<f64>() / period as f64;

        // Apply Wilder's Smoothing for remaining periods
        for &change in &changes[period..] {
            let gain = if change > 0.0 { change } else { 0.0 };
            let loss = if change < 0.0 { change.abs() } else { 0.0 };
            
            // Wilder's smoothing: (previous_avg * (period - 1) + current_value) / period
            avg_gain = (avg_gain * (period - 1) as f64 + gain) / period as f64;
            avg_loss = (avg_loss * (period - 1) as f64 + loss) / period as f64;
        }

        // Calculate RSI
        if avg_loss == 0.0 {
            if avg_gain == 0.0 {
                return Some(50.0); // No movement
            }
            return Some(100.0); // All gains, no losses
        }

        if avg_gain == 0.0 {
            return Some(0.0); // All losses, no gains
        }

        let rs = avg_gain / avg_loss;
        let rsi = 100.0 - (100.0 / (1.0 + rs));

        Some(rsi)
    }

    /// Calculate Simple Moving Average
    pub fn calculate_sma(prices: &[HistoricalPrice], period: usize) -> Option<f64> {
        if prices.len() < period {
            return None;
        }

        let sum: f64 = prices.iter().rev().take(period).map(|p| p.close).sum();
        Some(sum / period as f64)
    }

    /// Calculate MACD (Moving Average Convergence Divergence)
    pub fn calculate_macd(prices: &[HistoricalPrice]) -> Option<MACDIndicator> {
        if prices.len() < 26 {
            return None;
        }

        let ema_12 = Self::calculate_ema(prices, 12)?;
        let ema_26 = Self::calculate_ema(prices, 26)?;
        let macd_line = ema_12 - ema_26;

        // For signal line, we'd need to calculate EMA of MACD values
        // Simplified version using the current MACD value
        let signal_line = macd_line * 0.9; // Approximation
        let histogram = macd_line - signal_line;

        Some(MACDIndicator {
            macd_line,
            signal_line,
            histogram,
        })
    }

    /// Calculate Exponential Moving Average
    fn calculate_ema(prices: &[HistoricalPrice], period: usize) -> Option<f64> {
        if prices.len() < period {
            return None;
        }

        let multiplier = 2.0 / (period as f64 + 1.0);
        
        // Start with SMA
        let initial_sma: f64 = prices
            .iter()
            .rev()
            .skip(prices.len() - period)
            .take(period)
            .map(|p| p.close)
            .sum::<f64>() / period as f64;

        let mut ema = initial_sma;

        // Calculate EMA for remaining prices
        for price in prices.iter().rev().take(prices.len() - period) {
            ema = (price.close - ema) * multiplier + ema;
        }

        Some(ema)
    }

    /// Calculate Bollinger Bands
    pub fn calculate_bollinger_bands(
        prices: &[HistoricalPrice],
        period: usize,
        std_dev_multiplier: f64,
    ) -> Option<BollingerBands> {
        if prices.len() < period {
            return None;
        }

        let recent: Vec<f64> = prices.iter().rev().take(period).map(|p| p.close).collect();
        let middle_band = recent.iter().sum::<f64>() / period as f64;

        let variance = recent.iter()
            .map(|x| (x - middle_band).powi(2))
            .sum::<f64>() / period as f64;
        let std_dev = variance.sqrt();

        let upper_band = middle_band + std_dev_multiplier * std_dev;
        let lower_band = middle_band - std_dev_multiplier * std_dev;
        let bandwidth = if middle_band > 0.0 {
            (upper_band - lower_band) / middle_band * 100.0
        } else {
            0.0
        };

        Some(BollingerBands {
            upper_band,
            lower_band,
            middle_band,
            bandwidth,
        })
    }

    /// Calculate Stochastic Oscillator (%K and %D)
    pub fn calculate_stochastic(
        prices: &[HistoricalPrice],
        k_period: usize,
        d_period: usize,
    ) -> Option<StochasticOscillator> {
        let needed = k_period + d_period - 1;
        if prices.len() < needed {
            return None;
        }

        // Calculate multiple %K values for the D period
        let mut k_values = Vec::with_capacity(d_period);

        for i in 0..d_period {
            let end = prices.len() - i;
            let start = if end >= k_period { end - k_period } else { 0 };
            let window = &prices[start..end];

            let highest_high = window.iter().map(|p| p.high).fold(f64::NEG_INFINITY, f64::max);
            let lowest_low = window.iter().map(|p| p.low).fold(f64::INFINITY, f64::min);
            let close = window.last()?.close;

            let range = highest_high - lowest_low;
            let k = if range > 0.0 {
                ((close - lowest_low) / range) * 100.0
            } else {
                50.0
            };
            k_values.push(k);
        }

        let k_line = k_values[0]; // Most recent %K
        let d_line = k_values.iter().sum::<f64>() / k_values.len() as f64;

        Some(StochasticOscillator { k_line, d_line })
    }

    /// Calculate Pearson correlation coefficient between two price series
    pub fn calculate_correlation(prices_a: &[f64], prices_b: &[f64]) -> Option<f64> {
        let n = prices_a.len().min(prices_b.len());
        if n < 2 {
            return None;
        }

        let a = &prices_a[..n];
        let b = &prices_b[..n];

        let mean_a = a.iter().sum::<f64>() / n as f64;
        let mean_b = b.iter().sum::<f64>() / n as f64;

        let mut cov = 0.0;
        let mut var_a = 0.0;
        let mut var_b = 0.0;

        for i in 0..n {
            let da = a[i] - mean_a;
            let db = b[i] - mean_b;
            cov += da * db;
            var_a += da * da;
            var_b += db * db;
        }

        let denom = (var_a * var_b).sqrt();
        if denom == 0.0 {
            return None;
        }

        Some(cov / denom)
    }

    /// Determine if stock is oversold (RSI < 30)
    pub fn is_oversold(rsi: Option<f64>) -> bool {
        rsi.map_or(false, |r| r < 30.0)
    }

    /// Determine if stock is overbought (RSI > 70)
    pub fn is_overbought(rsi: Option<f64>) -> bool {
        rsi.map_or(false, |r| r > 70.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn create_test_prices(close_prices: Vec<f64>) -> Vec<HistoricalPrice> {
        let len = close_prices.len();
        close_prices
            .into_iter()
            .enumerate()
            .map(|(i, close)| HistoricalPrice {
                date: Utc::now() - chrono::Duration::days(len as i64 - i as i64),
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
        // Create price series with uptrend but some variation
        let prices = create_test_prices(vec![
            100.0, 101.0, 100.5, 102.0, 103.0, 102.5, 104.0, 105.0,
            104.5, 106.0, 107.0, 106.5, 108.0, 109.0, 108.5, 110.0,
        ]);

        let rsi = TechnicalIndicators::calculate_rsi(&prices, 14);
        assert!(rsi.is_some(), "RSI should calculate with sufficient data");
        let rsi_value = rsi.unwrap();
        assert!(rsi_value >= 50.0 && rsi_value <= 100.0, "RSI for uptrend should be >= 50, got {}", rsi_value);
    }

    #[test]
    fn test_rsi_downtrend() {
        // Create price series with downtrend but some variation
        let prices = create_test_prices(vec![
            115.0, 114.0, 114.5, 113.0, 112.0, 112.5, 111.0, 110.0,
            110.5, 109.0, 108.0, 108.5, 107.0, 106.0, 106.5, 105.0,
        ]);

        let rsi = TechnicalIndicators::calculate_rsi(&prices, 14);
        assert!(rsi.is_some());
        let rsi_value = rsi.unwrap();
        assert!(rsi_value >= 0.0 && rsi_value <= 50.0, "RSI for downtrend should be <= 50, got {}", rsi_value);
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
    fn test_bollinger_bands() {
        let prices = create_test_prices(vec![
            100.0, 102.0, 101.0, 103.0, 104.0, 102.0, 105.0, 106.0,
            104.0, 107.0, 108.0, 106.0, 109.0, 110.0, 108.0, 111.0,
            112.0, 110.0, 113.0, 114.0,
        ]);

        let bb = TechnicalIndicators::calculate_bollinger_bands(&prices, 20, 2.0);
        assert!(bb.is_some(), "Bollinger Bands should calculate with 20 days");
        let bb = bb.unwrap();
        assert!(bb.upper_band > bb.middle_band, "Upper band should be above middle");
        assert!(bb.lower_band < bb.middle_band, "Lower band should be below middle");
        assert!(bb.bandwidth > 0.0, "Bandwidth should be positive");
    }

    #[test]
    fn test_bollinger_bands_insufficient_data() {
        let prices = create_test_prices(vec![100.0, 102.0, 104.0]);
        let bb = TechnicalIndicators::calculate_bollinger_bands(&prices, 20, 2.0);
        assert!(bb.is_none(), "Should return None with insufficient data");
    }

    #[test]
    fn test_stochastic_oscillator() {
        let prices = create_test_prices(vec![
            100.0, 102.0, 101.0, 103.0, 104.0, 102.0, 105.0, 106.0,
            104.0, 107.0, 108.0, 106.0, 109.0, 110.0, 108.0, 111.0,
        ]);

        let stoch = TechnicalIndicators::calculate_stochastic(&prices, 14, 3);
        assert!(stoch.is_some(), "Stochastic should calculate with 16 days");
        let stoch = stoch.unwrap();
        assert!(stoch.k_line >= 0.0 && stoch.k_line <= 100.0, "K should be 0-100, got {}", stoch.k_line);
        assert!(stoch.d_line >= 0.0 && stoch.d_line <= 100.0, "D should be 0-100, got {}", stoch.d_line);
    }

    #[test]
    fn test_stochastic_insufficient_data() {
        let prices = create_test_prices(vec![100.0, 102.0, 104.0]);
        let stoch = TechnicalIndicators::calculate_stochastic(&prices, 14, 3);
        assert!(stoch.is_none(), "Should return None with insufficient data");
    }

    #[test]
    fn test_correlation() {
        // Perfect positive correlation
        let a = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let b = vec![2.0, 4.0, 6.0, 8.0, 10.0];
        let corr = TechnicalIndicators::calculate_correlation(&a, &b);
        assert!(corr.is_some());
        assert!((corr.unwrap() - 1.0).abs() < 0.001, "Perfect positive should be ~1.0");

        // Perfect negative correlation
        let c = vec![5.0, 4.0, 3.0, 2.0, 1.0];
        let corr = TechnicalIndicators::calculate_correlation(&a, &c);
        assert!(corr.is_some());
        assert!((corr.unwrap() + 1.0).abs() < 0.001, "Perfect negative should be ~-1.0");
    }

    #[test]
    fn test_correlation_insufficient_data() {
        let a = vec![1.0];
        let b = vec![2.0];
        assert!(TechnicalIndicators::calculate_correlation(&a, &b).is_none());
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

#[cfg(test)]
mod tests_backup {
    use super::*;
    use chrono::Utc;

    #[test]
    fn test_sma_calculation() {
        let prices = vec![
            HistoricalPrice {
                date: Utc::now(),
                open: 100.0,
                high: 105.0,
                low: 99.0,
                close: 102.0,
                volume: 1000.0,
            },
            HistoricalPrice {
                date: Utc::now(),
                open: 102.0,
                high: 106.0,
                low: 101.0,
                close: 104.0,
                volume: 1000.0,
            },
            HistoricalPrice {
                date: Utc::now(),
                open: 104.0,
                high: 108.0,
                low: 103.0,
                close: 106.0,
                volume: 1000.0,
            },
        ];

        let sma = TechnicalIndicators::calculate_sma(&prices, 3);
        assert!(sma.is_some());
        assert!((sma.unwrap() - 104.0).abs() < 0.01);
    }
}
