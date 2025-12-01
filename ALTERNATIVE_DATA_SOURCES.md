# Quick Start: Using Alternative Data Source (Alpha Vantage)

## Problem
Yahoo Finance rate limits Docker containers. This guide shows how to use Alpha Vantage as a free alternative.

## Solution: Alpha Vantage (Free: 25 requests/day, Premium: 500+/day)

### Step 1: Get API Key
1. Go to https://www.alphavantage.co/support/#api-key
2. Enter your email → Get free API key instantly
3. Copy the key (format: `ABCDEFGHIJKLMNOP`)

### Step 2: Update Configuration

Add to `.env`:
```bash
ALPHA_VANTAGE_API_KEY=your_api_key_here
USE_ALPHA_VANTAGE=true  # Fallback to Alpha Vantage if Yahoo fails
```

Add to `docker-compose.yml`:
```yaml
backend:
  environment:
    - ALPHA_VANTAGE_API_KEY=${ALPHA_VANTAGE_API_KEY:-}
    - USE_ALPHA_VANTAGE=true
    - YAHOO_REQUEST_DELAY_MS=10000
```

### Step 3: Implementation Code

Create `src/alpha_vantage.rs`:

```rust
use crate::models::HistoricalPrice;
use anyhow::{anyhow, Result};
use chrono::{DateTime, NaiveDate, Utc};
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
struct AlphaVantageResponse {
    #[serde(rename = "Time Series (Daily)")]
    time_series: Option<HashMap<String, DailyData>>,
    #[serde(rename = "Error Message")]
    error_message: Option<String>,
    #[serde(rename = "Note")]
    note: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DailyData {
    #[serde(rename = "1. open")]
    open: String,
    #[serde(rename = "2. high")]
    high: String,
    #[serde(rename = "3. low")]
    low: String,
    #[serde(rename = "4. close")]
    close: String,
    #[serde(rename = "5. volume")]
    volume: String,
}

pub struct AlphaVantageClient {
    client: reqwest::Client,
    api_key: String,
}

impl AlphaVantageClient {
    pub fn new(api_key: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        AlphaVantageClient { client, api_key }
    }

    pub async fn get_historical_prices(
        &self,
        symbol: &str,
        _days: i64,
    ) -> Result<Vec<HistoricalPrice>> {
        let url = format!(
            "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol={}&apikey={}&outputsize=compact",
            symbol, self.api_key
        );

        tracing::debug!("Fetching {} from Alpha Vantage", symbol);

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| anyhow!("Alpha Vantage request failed for {}: {}", symbol, e))?;

        if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(anyhow!("Alpha Vantage rate limit reached (25/day on free tier)"));
        }

        let av_response: AlphaVantageResponse = response
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse Alpha Vantage response: {}", e))?;

        if let Some(error) = av_response.error_message {
            return Err(anyhow!("Alpha Vantage error: {}", error));
        }

        if let Some(note) = av_response.note {
            return Err(anyhow!("Alpha Vantage limit: {}", note));
        }

        let time_series = av_response
            .time_series
            .ok_or_else(|| anyhow!("No data returned for {}", symbol))?;

        let mut prices: Vec<HistoricalPrice> = time_series
            .into_iter()
            .filter_map(|(date_str, data)| {
                let date = NaiveDate::parse_from_str(&date_str, "%Y-%m-%d").ok()?;
                let datetime = date.and_hms_opt(0, 0, 0)?.and_utc();

                Some(HistoricalPrice {
                    date: datetime,
                    open: data.open.parse().ok()?,
                    high: data.high.parse().ok()?,
                    low: data.low.parse().ok()?,
                    close: data.close.parse().ok()?,
                    volume: data.volume.parse().ok()?,
                })
            })
            .collect();

        prices.sort_by(|a, b| a.date.cmp(&b.date));

        if prices.is_empty() {
            return Err(anyhow!("No valid price data for {}", symbol));
        }

        tracing::info!("✅ Fetched {} days of data for {} from Alpha Vantage", prices.len(), symbol);
        Ok(prices)
    }
}
```

Add to `src/main.rs`:
```rust
mod alpha_vantage;  // Add this line

// In main():
use alpha_vantage::AlphaVantageClient;

// After config loading:
let use_alpha = std::env::var("USE_ALPHA_VANTAGE")
    .unwrap_or_default() == "true";

let alpha_client = if use_alpha {
    std::env::var("ALPHA_VANTAGE_API_KEY")
        .ok()
        .map(AlphaVantageClient::new)
} else {
    None
};
```

Update `src/analysis.rs` to use fallback:
```rust
async fn analyze_stock(&self, symbol: &str, market_cap: Option<f64>) -> anyhow::Result<StockAnalysis> {
    // Try Yahoo first
    let historical_prices = match self.yahoo_client.get_historical_prices(symbol, 90).await {
        Ok(prices) => prices,
        Err(e) if e.to_string().contains("429") => {
            // Fallback to Alpha Vantage if rate limited
            tracing::warn!("Yahoo rate limited, trying Alpha Vantage for {}", symbol);
            if let Some(ref alpha) = self.alpha_client {
                alpha.get_historical_prices(symbol, 90).await?
            } else {
                return Err(e);
            }
        }
        Err(e) => return Err(e),
    };
    
    // Rest of analysis...
}
```

### Step 4: Deploy

```bash
# Build with new changes
cargo build --release

# Update Docker
docker-compose down
docker-compose build backend
docker-compose up -d

# Check logs
docker logs -f stock_analyzer_backend | grep "Alpha Vantage"
```

## Rate Limits Comparison

| Service | Free Tier | Paid Tier | Best For |
|---------|-----------|-----------|----------|
| **Yahoo Finance** | ∞ (but blocks Docker) | N/A | Local dev only |
| **Alpha Vantage** | 25 req/day | 500 req/day ($50/mo) | Small portfolios |
| **Twelve Data** | 800 req/day | Unlimited ($79/mo) | Medium scale |
| **Polygon.io** | 5 req/min | Unlimited ($249/mo) | High frequency |
| **IEX Cloud** | 50k/mo | 100M/mo ($9-999/mo) | Production apps |

## Recommended: Twelve Data (Best Free Tier)

800 requests/day = analyze 800 stocks daily or 33 stocks every hour!

```rust
// src/twelve_data.rs
const BASE_URL: &str = "https://api.twelvedata.com/time_series";

pub async fn get_prices(&self, symbol: &str) -> Result<Vec<HistoricalPrice>> {
    let url = format!(
        "{}?symbol={}&interval=1day&outputsize=90&apikey={}",
        BASE_URL, symbol, self.api_key
    );
    // Similar implementation to Alpha Vantage
}
```

Get free API key: https://twelvedata.com/pricing

## Pro Tip: Hybrid Strategy

Use all three in fallback order:
1. Yahoo Finance (free, unlimited) → Try first
2. Twelve Data (800/day) → Fallback #1
3. Alpha Vantage (25/day) → Fallback #2

This gives you **800+ requests/day** in Docker!
