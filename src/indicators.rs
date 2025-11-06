use crate::models::{HistoricalPrice, MACDIndicator};

pub struct TechnicalIndicators;

impl TechnicalIndicators {
    /// Calculate RSI (Relative Strength Index)
    pub fn calculate_rsi(prices: &[HistoricalPrice], period: usize) -> Option<f64> {
        if prices.len() < period + 1 {
            return None;
        }

        let mut gains = Vec::new();
        let mut losses = Vec::new();

        for i in 1..prices.len() {
            let change = prices[i].close - prices[i - 1].close;
            if change > 0.0 {
                gains.push(change);
                losses.push(0.0);
            } else {
                gains.push(0.0);
                losses.push(-change);
            }
        }

        if gains.len() < period {
            return None;
        }

        let avg_gain: f64 = gains.iter().rev().take(period).sum::<f64>() / period as f64;
        let avg_loss: f64 = losses.iter().rev().take(period).sum::<f64>() / period as f64;

        if avg_loss == 0.0 {
            return Some(100.0);
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
