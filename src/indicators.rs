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

    /// Calculate MACD (Moving Average Convergence Divergence) with a real
    /// signal line computed as EMA(9) of the MACD series.
    ///
    /// Requires at least 34 bars (`26 + 9 - 1`) so the signal EMA has enough
    /// MACD samples to seed itself.
    pub fn calculate_macd(prices: &[HistoricalPrice]) -> Option<MACDIndicator> {
        const FAST: usize = 12;
        const SLOW: usize = 26;
        const SIGNAL: usize = 9;

        if prices.len() < SLOW + SIGNAL - 1 {
            return None;
        }

        let closes: Vec<f64> = prices.iter().map(|p| p.close).collect();
        let ema_fast = ema_series(&closes, FAST);
        let ema_slow = ema_series(&closes, SLOW);

        // `ema_fast` starts at index FAST-1 in `closes`; `ema_slow` at SLOW-1.
        // Align `ema_fast` forward by `SLOW - FAST` so the two series start on
        // the same bar.
        let offset = SLOW - FAST;
        let macd_series: Vec<f64> = ema_slow
            .iter()
            .enumerate()
            .map(|(i, &slow)| ema_fast[i + offset] - slow)
            .collect();

        if macd_series.len() < SIGNAL {
            return None;
        }

        let signal_series = ema_series(&macd_series, SIGNAL);
        let macd_line = *macd_series.last()?;
        let signal_line = *signal_series.last()?;
        let histogram = macd_line - signal_line;

        Some(MACDIndicator {
            macd_line,
            signal_line,
            histogram,
        })
    }

    /// Calculate Exponential Moving Average — chronological, seeded with the
    /// SMA of the first `period` samples. Returns `None` if `prices.len() < period`.
    fn calculate_ema(prices: &[HistoricalPrice], period: usize) -> Option<f64> {
        if prices.len() < period {
            return None;
        }
        let closes: Vec<f64> = prices.iter().map(|p| p.close).collect();
        ema_series(&closes, period).last().copied()
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

/// Compute the EMA series for `closes`, seeded with the SMA of the first
/// `period` values. The returned vector has length `closes.len() - period + 1`
/// (empty if there aren't enough samples). Iterates chronologically.
fn ema_series(closes: &[f64], period: usize) -> Vec<f64> {
    if closes.len() < period || period == 0 {
        return Vec::new();
    }
    let k = 2.0 / (period as f64 + 1.0);
    let mut out = Vec::with_capacity(closes.len() - period + 1);
    let mut ema: f64 = closes[..period].iter().sum::<f64>() / period as f64;
    out.push(ema);
    for &c in &closes[period..] {
        ema = (c - ema) * k + ema;
        out.push(ema);
    }
    out
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
        // Need at least 34 days (26 + 9 - 1) for MACD with a real signal EMA.
        let mut price_values = Vec::new();
        for i in 0..40 {
            price_values.push(100.0 + i as f64 * 0.5);
        }
        let prices = create_test_prices(price_values);

        let macd = TechnicalIndicators::calculate_macd(&prices).unwrap();
        assert!(macd.macd_line > 0.0, "Uptrend → positive MACD line, got {}", macd.macd_line);
        assert!(macd.signal_line > 0.0);
        // Histogram definition holds exactly.
        assert!((macd.histogram - (macd.macd_line - macd.signal_line)).abs() < 1e-9);
    }

    #[test]
    fn test_macd_regression_not_fake_signal() {
        // Regression: previous implementation set signal_line = macd_line * 0.9,
        // so histogram was always exactly 0.1 * macd_line. Verify we now have a
        // real EMA(9) signal line by crafting data where the relationship breaks.
        let mut prices = Vec::new();
        for _ in 0..30 { prices.push(100.0); }          // flat for 30 bars
        for i in 0..10 { prices.push(100.0 + i as f64 * 0.01); } // tiny up-tick
        let prices = create_test_prices(prices);

        let macd = TechnicalIndicators::calculate_macd(&prices).unwrap();
        // Signal line is EMA(9) of MACD series; MACD series was 0 for ages so
        // signal_line should be tiny and positive but STRICTLY less than MACD,
        // and the ratio must NOT be the old 0.9.
        assert!(macd.macd_line > 0.0);
        assert!(macd.signal_line >= 0.0);
        assert!(macd.signal_line < macd.macd_line);
        let ratio = macd.signal_line / macd.macd_line;
        assert!(
            (ratio - 0.9).abs() > 0.01,
            "signal_line/macd_line should not be the old 0.9 approximation, got {}",
            ratio
        );
        // Histogram sanity: equals diff.
        assert!((macd.histogram - (macd.macd_line - macd.signal_line)).abs() < 1e-9);
    }

    #[test]
    fn test_macd_flat_series_gives_zero() {
        let prices = create_test_prices(vec![100.0; 40]);
        let macd = TechnicalIndicators::calculate_macd(&prices).unwrap();
        assert!(macd.macd_line.abs() < 1e-9);
        assert!(macd.signal_line.abs() < 1e-9);
        assert!(macd.histogram.abs() < 1e-9);
    }

    #[test]
    fn test_macd_insufficient_data() {
        let prices = create_test_prices(vec![100.0, 102.0, 104.0, 106.0, 108.0]);
        let macd = TechnicalIndicators::calculate_macd(&prices);
        assert!(macd.is_none(), "MACD should return None with < 34 bars");

        // Boundary: exactly 33 bars should still be None.
        let prices33 = create_test_prices((0..33).map(|i| 100.0 + i as f64).collect());
        assert!(TechnicalIndicators::calculate_macd(&prices33).is_none());

        // 34 bars is enough.
        let prices34 = create_test_prices((0..34).map(|i| 100.0 + i as f64).collect());
        assert!(TechnicalIndicators::calculate_macd(&prices34).is_some());
    }

    #[test]
    fn test_ema_calculation_chronological() {
        // 13 bars rising 100 → 112. Initial SMA(12) = mean(100..111) = 105.5.
        // After one step with close=112, k = 2/13, so
        // EMA = (112 - 105.5) * 2/13 + 105.5 ≈ 106.5.
        let prices = create_test_prices(vec![
            100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0,
            108.0, 109.0, 110.0, 111.0, 112.0,
        ]);

        let ema = TechnicalIndicators::calculate_ema(&prices, 12).unwrap();
        assert!((ema - 106.5).abs() < 0.01, "EMA(12) chronological should be ~106.5, got {}", ema);
    }

    #[test]
    fn test_ema_regression_direction_sensitive() {
        // An uptrend must produce EMA > the oldest SMA seed. The pre-fix
        // implementation iterated in reverse and could push the EMA toward the
        // older (lower) values.
        let prices = create_test_prices((0..30).map(|i| 100.0 + i as f64).collect());
        let ema = TechnicalIndicators::calculate_ema(&prices, 12).unwrap();
        let seed_sma: f64 = (0..12).map(|i| 100.0 + i as f64).sum::<f64>() / 12.0; // 105.5
        assert!(ema > seed_sma, "Uptrend EMA must exceed initial SMA seed ({} vs {})", ema, seed_sma);
        // And must be below the latest close.
        assert!(ema < 129.0);
    }

    #[test]
    fn test_ema_flat_returns_constant() {
        let prices = create_test_prices(vec![50.0; 30]);
        let ema = TechnicalIndicators::calculate_ema(&prices, 12).unwrap();
        assert!((ema - 50.0).abs() < 1e-9);
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

    // ---- Edge cases: flat / alternating / zero-range ----------------------

    #[test]
    fn test_rsi_flat_series_returns_50() {
        let prices = create_test_prices(vec![100.0; 20]);
        let rsi = TechnicalIndicators::calculate_rsi(&prices, 14).unwrap();
        assert!((rsi - 50.0).abs() < 1e-9, "Flat series should yield RSI=50, got {}", rsi);
    }

    #[test]
    fn test_rsi_alternating_near_50() {
        // +1/-1 alternating — average gain == average loss → RSI near 50.
        let mut closes = Vec::new();
        let mut p = 100.0;
        for i in 0..20 {
            closes.push(p);
            p += if i % 2 == 0 { 1.0 } else { -1.0 };
        }
        let prices = create_test_prices(closes);
        let rsi = TechnicalIndicators::calculate_rsi(&prices, 14).unwrap();
        assert!(
            (rsi - 50.0).abs() < 10.0,
            "Alternating series RSI should be near 50, got {}",
            rsi
        );
    }

    #[test]
    fn test_rsi_recovery_after_drop() {
        // Sharp drop then strong recovery — RSI should climb back above 50.
        let mut closes = vec![100.0, 95.0, 90.0, 85.0, 80.0, 75.0, 70.0];
        for i in 1..=15 {
            closes.push(70.0 + i as f64 * 2.0);
        }
        let prices = create_test_prices(closes);
        let rsi = TechnicalIndicators::calculate_rsi(&prices, 14).unwrap();
        assert!(rsi > 50.0, "RSI after recovery should be > 50, got {}", rsi);
    }

    #[test]
    fn test_bollinger_bands_flat_prices() {
        let prices = create_test_prices(vec![50.0; 25]);
        let bb = TechnicalIndicators::calculate_bollinger_bands(&prices, 20, 2.0).unwrap();
        assert!((bb.middle_band - 50.0).abs() < 1e-9);
        assert!((bb.upper_band - 50.0).abs() < 1e-9);
        assert!((bb.lower_band - 50.0).abs() < 1e-9);
        assert!(bb.bandwidth.abs() < 1e-9, "Flat prices → zero bandwidth");
    }

    #[test]
    fn test_bollinger_bands_zero_middle_fallback() {
        // If middle_band is 0 (pathological), bandwidth must be 0, not NaN.
        let prices = create_test_prices(vec![0.0; 25]);
        let bb = TechnicalIndicators::calculate_bollinger_bands(&prices, 20, 2.0).unwrap();
        assert_eq!(bb.bandwidth, 0.0);
        assert!(bb.upper_band.is_finite() && bb.lower_band.is_finite());
    }

    #[test]
    fn test_stochastic_zero_range_fallback() {
        // Highs == lows → range is 0 → formula would divide by zero.
        // Must return 50.0 (mid-range) instead of NaN.
        let mut prices = Vec::new();
        for _ in 0..20 {
            prices.push(HistoricalPrice {
                date: chrono::Utc::now(),
                open: 100.0,
                high: 100.0,
                low: 100.0,
                close: 100.0,
                volume: 1000.0,
            });
        }
        let stoch = TechnicalIndicators::calculate_stochastic(&prices, 14, 3).unwrap();
        assert!((stoch.k_line - 50.0).abs() < 1e-9);
        assert!((stoch.d_line - 50.0).abs() < 1e-9);
    }

    #[test]
    fn test_stochastic_at_top_of_range() {
        // Close equals the high over the lookback → %K = 100.
        let mut prices = create_test_prices(
            (0..20).map(|i| 100.0 + i as f64).collect::<Vec<f64>>(),
        );
        // Force close == max high in the last 14 bars.
        let max_high = prices.iter().rev().take(14).map(|p| p.high).fold(f64::NEG_INFINITY, f64::max);
        prices.last_mut().unwrap().close = max_high;
        let stoch = TechnicalIndicators::calculate_stochastic(&prices, 14, 3).unwrap();
        assert!(stoch.k_line > 99.0, "Close at top → K near 100, got {}", stoch.k_line);
    }
}

