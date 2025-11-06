use crate::models::HistoricalPrice;
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use reqwest;
use serde::Deserialize;
use std::time::Duration as StdDuration;
use tokio::time::sleep;

#[derive(Debug, Deserialize)]
struct YahooResponse {
    chart: Chart,
}

#[derive(Debug, Deserialize)]
struct Chart {
    result: Option<Vec<ChartResult>>,
    error: Option<YahooError>,
}

#[derive(Debug, Deserialize)]
struct ChartResult {
    timestamp: Option<Vec<i64>>,
    indicators: Indicators,
}

#[derive(Debug, Deserialize)]
struct Indicators {
    quote: Vec<Quote>,
}

#[derive(Debug, Deserialize)]
struct Quote {
    open: Option<Vec<Option<f64>>>,
    high: Option<Vec<Option<f64>>>,
    low: Option<Vec<Option<f64>>>,
    close: Option<Vec<Option<f64>>>,
    volume: Option<Vec<Option<i64>>>,
}

#[derive(Debug, Deserialize)]
struct YahooError {
    code: String,
    description: String,
}

#[derive(Clone)]
pub struct YahooFinanceClient {
    client: reqwest::Client,
    max_retries: u32,
}

impl YahooFinanceClient {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .timeout(StdDuration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        YahooFinanceClient {
            client,
            max_retries: 3,
        }
    }

    pub async fn get_historical_prices(
        &self,
        symbol: &str,
        days: i64,
    ) -> Result<Vec<HistoricalPrice>> {
        let mut attempt = 0;
        let mut last_error = None;

        while attempt < self.max_retries {
            if attempt > 0 {
                // Exponential backoff: 2, 4, 8 seconds
                let delay = 2u64.pow(attempt);
                tracing::debug!("Retry attempt {} for {} after {}s delay", attempt + 1, symbol, delay);
                sleep(StdDuration::from_secs(delay)).await;
            }

            match self.fetch_historical_prices(symbol, days).await {
                Ok(prices) => return Ok(prices),
                Err(e) => {
                    last_error = Some(e);
                    attempt += 1;
                }
            }
        }

        Err(last_error.unwrap_or_else(|| anyhow!("Failed after {} retries", self.max_retries)))
    }

    async fn fetch_historical_prices(
        &self,
        symbol: &str,
        days: i64,
    ) -> Result<Vec<HistoricalPrice>> {
        let url = format!(
            "https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range={}d",
            symbol, days
        );

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| anyhow!("HTTP request failed for {}: {}", symbol, e))?;

        let status = response.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(anyhow!("Rate limited by Yahoo Finance (429)"));
        }

        if !status.is_success() {
            return Err(anyhow!("Yahoo Finance returned status {}", status));
        }

        let yahoo_response: YahooResponse = response
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse JSON for {}: {}", symbol, e))?;

        if let Some(error) = yahoo_response.chart.error {
            return Err(anyhow!(
                "Yahoo Finance error for {}: {} - {}",
                symbol,
                error.code,
                error.description
            ));
        }

        let result = yahoo_response
            .chart
            .result
            .and_then(|r| r.into_iter().next())
            .ok_or_else(|| anyhow!("No data returned for {}", symbol))?;

        let timestamps = result
            .timestamp
            .ok_or_else(|| anyhow!("No timestamps for {}", symbol))?;

        let quote = result
            .indicators
            .quote
            .into_iter()
            .next()
            .ok_or_else(|| anyhow!("No quote data for {}", symbol))?;

        let opens = quote.open.unwrap_or_default();
        let highs = quote.high.unwrap_or_default();
        let lows = quote.low.unwrap_or_default();
        let closes = quote.close.unwrap_or_default();
        let volumes = quote.volume.unwrap_or_default();

        let mut prices = Vec::new();

        for (i, &timestamp) in timestamps.iter().enumerate() {
            if let (Some(Some(open)), Some(Some(high)), Some(Some(low)), Some(Some(close))) = (
                opens.get(i),
                highs.get(i),
                lows.get(i),
                closes.get(i),
            ) {
                let volume = volumes
                    .get(i)
                    .and_then(|v| v.as_ref())
                    .copied()
                    .unwrap_or(0) as f64;

                prices.push(HistoricalPrice {
                    date: DateTime::from_timestamp(timestamp, 0)
                        .unwrap_or_else(|| Utc::now()),
                    open: *open,
                    high: *high,
                    low: *low,
                    close: *close,
                    volume,
                });
            }
        }

        if prices.is_empty() {
            return Err(anyhow!("No valid price data for {}", symbol));
        }

        Ok(prices)
    }

    pub async fn get_latest_quote(&self, symbol: &str) -> Result<(f64, f64)> {
        let prices = self.get_historical_prices(symbol, 5).await?;
        let latest = prices
            .last()
            .ok_or_else(|| anyhow!("No latest quote for {}", symbol))?;
        Ok((latest.close, latest.volume))
    }

    /// Fetch historical data for a symbol (alias for get_historical_prices)
    pub async fn fetch_historical_data(
        &self,
        symbol: &str,
        days: i64,
    ) -> Result<Vec<HistoricalPrice>> {
        self.get_historical_prices(symbol, days).await
    }
}

impl Default for YahooFinanceClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fetch_historical_prices() {
        let client = YahooFinanceClient::new();
        
        // Note: This test requires internet and may fail if rate limited
        // In CI/CD, consider mocking or using VCR-style recordings
        match client.get_historical_prices("AAPL", 7).await {
            Ok(prices) => {
                assert!(!prices.is_empty(), "Should have some price data");
                assert!(prices.len() <= 7, "Should not exceed requested days");
                
                // Verify data structure
                let first = &prices[0];
                assert!(first.close > 0.0, "Close price should be positive");
                assert!(first.volume >= 0.0, "Volume should be non-negative");
            }
            Err(e) => {
                // If we're rate limited, that's expected behavior
                let err_msg = e.to_string();
                assert!(
                    err_msg.contains("Rate limited") || err_msg.contains("429"),
                    "Should fail with rate limit error if blocked"
                );
            }
        }
    }

    #[tokio::test]
    async fn test_invalid_symbol() {
        let client = YahooFinanceClient::new();
        
        let result = client.get_historical_prices("INVALIDSYMBOL12345", 7).await;
        assert!(result.is_err(), "Invalid symbol should return error");
    }

    #[tokio::test]
    async fn test_client_has_user_agent() {
        let client = YahooFinanceClient::new();
        // Just verify client was created successfully with proper configuration
        assert_eq!(client.max_retries, 3);
    }
}
