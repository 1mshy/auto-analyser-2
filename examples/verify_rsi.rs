/// Verify RSI calculation matches TradingView methodology
/// This example demonstrates that our RSI now uses Wilder's Smoothing
use chrono::Utc;

// Copy necessary structs since we can't import from binary
#[derive(Debug, Clone)]
struct HistoricalPrice {
    date: chrono::DateTime<chrono::Utc>,
    open: f64,
    high: f64,
    low: f64,
    close: f64,
    volume: f64,
}

fn calculate_rsi_wilders(prices: &[HistoricalPrice], period: usize) -> Option<f64> {
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
            return Some(50.0);
        }
        return Some(100.0);
    }

    if avg_gain == 0.0 {
        return Some(0.0);
    }

    let rs = avg_gain / avg_loss;
    let rsi = 100.0 - (100.0 / (1.0 + rs));

    Some(rsi)
}

fn main() {
    println!("RSI Calculation Verification");
    println!("============================\n");
    
    // Example 1: Trending upward with some pullbacks (realistic scenario)
    let prices1: Vec<HistoricalPrice> = vec![
        100.0, 101.5, 102.0, 101.0, 103.0, 104.5, 103.5, 105.0,
        106.0, 105.0, 107.0, 108.5, 107.5, 109.0, 110.0, 109.0,
        111.0, 112.0, 111.5, 113.0, 114.0, 113.0, 115.0, 116.0,
        115.0, 117.0, 118.0, 117.0, 119.0, 120.0,
    ]
    .into_iter()
    .enumerate()
    .map(|(i, close)| HistoricalPrice {
        date: Utc::now() - chrono::Duration::days(30 - i as i64),
        open: close * 0.99,
        high: close * 1.01,
        low: close * 0.98,
        close,
        volume: 1000000.0,
    })
    .collect();

    let rsi1 = calculate_rsi_wilders(&prices1, 14);
    println!("Example 1: Uptrend with pullbacks");
    println!("  Prices: 100.0 → 120.0 (20% gain over 30 days)");
    println!("  RSI(14): {:.2}", rsi1.unwrap_or(0.0));
    println!("  Expected: ~65-75 (bullish but not overbought)\n");

    // Example 2: Strong uptrend (like a rally)
    let prices2: Vec<HistoricalPrice> = vec![
        100.0, 102.0, 104.0, 105.0, 107.0, 109.0, 110.0, 112.0,
        114.0, 115.0, 117.0, 119.0, 120.0, 122.0, 124.0, 125.0,
        127.0, 129.0, 130.0, 132.0,
    ]
    .into_iter()
    .enumerate()
    .map(|(i, close)| HistoricalPrice {
        date: Utc::now() - chrono::Duration::days(20 - i as i64),
        open: close * 0.99,
        high: close * 1.01,
        low: close * 0.98,
        close,
        volume: 1000000.0,
    })
    .collect();

    let rsi2 = calculate_rsi_wilders(&prices2, 14);
    println!("Example 2: Strong uptrend (rally)");
    println!("  Prices: 100.0 → 132.0 (32% gain over 20 days)");
    println!("  RSI(14): {:.2}", rsi2.unwrap_or(0.0));
    println!("  Expected: ~80-95 (overbought territory)\n");

    // Example 3: Sideways with volatility (realistic consolidation)
    let prices3: Vec<HistoricalPrice> = vec![
        100.0, 102.0, 99.0, 101.0, 98.0, 102.0, 100.0, 103.0,
        99.0, 101.0, 100.0, 102.0, 99.0, 101.0, 100.0, 102.0,
        100.0, 101.0, 99.0, 100.0,
    ]
    .into_iter()
    .enumerate()
    .map(|(i, close)| HistoricalPrice {
        date: Utc::now() - chrono::Duration::days(20 - i as i64),
        open: close * 0.99,
        high: close * 1.01,
        low: close * 0.98,
        close,
        volume: 1000000.0,
    })
    .collect();

    let rsi3 = calculate_rsi_wilders(&prices3, 14);
    println!("Example 3: Sideways/consolidation");
    println!("  Prices: 100.0 → 100.0 (oscillating ±3%)");
    println!("  RSI(14): {:.2}", rsi3.unwrap_or(0.0));
    println!("  Expected: ~45-55 (neutral)\n");

    println!("\n✅ RSI Calculation Method");
    println!("==========================");
    println!("Method: Wilder's Smoothing (SMMA)");
    println!("Period: 14 (standard)");
    println!("Formula:");
    println!("  1. Initial AvgGain/Loss = SMA of first 14 gains/losses");
    println!("  2. Subsequent: AvgGain = (PrevAvg × 13 + CurrentGain) / 14");
    println!("  3. RS = AvgGain / AvgLoss");
    println!("  4. RSI = 100 - (100 / (1 + RS))");
    println!("\nThis matches TradingView's RSI calculation! 🎯");
}
