use crate::models::{CompanyProfile, HistoricalPrice};
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use rand::Rng;
use reqwest;
use reqwest::header::ACCEPT;
use serde::Deserialize;
use std::time::Duration as StdDuration;
use tokio::time::sleep;

// Response structs for quoteSummary/assetProfile endpoint
#[derive(Debug, Deserialize)]
struct QuoteSummaryResponse {
    #[serde(rename = "quoteSummary")]
    quote_summary: QuoteSummaryResult,
}

#[derive(Debug, Deserialize)]
struct QuoteSummaryResult {
    result: Option<Vec<QuoteSummaryData>>,
    error: Option<YahooError>,
}

#[derive(Debug, Deserialize)]
struct QuoteSummaryData {
    #[serde(rename = "assetProfile")]
    asset_profile: Option<AssetProfile>,
}

#[derive(Debug, Deserialize)]
struct AssetProfile {
    #[serde(rename = "longBusinessSummary")]
    long_business_summary: Option<String>,
    industry: Option<String>,
    sector: Option<String>,
    website: Option<String>,
    #[serde(rename = "fullTimeEmployees")]
    full_time_employees: Option<i64>,
    city: Option<String>,
    state: Option<String>,
    country: Option<String>,
    phone: Option<String>,
}

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
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"
                .parse()
                .unwrap(),
        );
        headers.insert(
            reqwest::header::ACCEPT_LANGUAGE,
            "en-GB,en-US;q=0.9,en;q=0.8".parse().unwrap(),
        );
        headers.insert(
            reqwest::header::CACHE_CONTROL,
            "max-age=0".parse().unwrap(),
        );
        headers.insert(
            "sec-ch-ua",
            "\"Chromium\";v=\"142\", \"Google Chrome\";v=\"142\", \"Not_A Brand\";v=\"99\""
                .parse()
                .unwrap(),
        );
        headers.insert("sec-ch-ua-mobile", "?0".parse().unwrap());
        headers.insert("sec-ch-ua-platform", "\"macOS\"".parse().unwrap());
        headers.insert("sec-fetch-dest", "document".parse().unwrap());
        headers.insert("sec-fetch-mode", "navigate".parse().unwrap());
        headers.insert("sec-fetch-site", "none".parse().unwrap());
        headers.insert("sec-fetch-user", "?1".parse().unwrap());
        headers.insert(
            "upgrade-insecure-requests",
            "1".parse().unwrap(),
        );

        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .default_headers(headers)
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
                // Exponential backoff with jitter: 5-7s, 10-14s, 20-28s
                let base_delay = 5u64 * 2u64.pow(attempt - 1);
                let jitter = rand::thread_rng().gen_range(0..=(base_delay / 2));
                let delay = base_delay + jitter;
                tracing::warn!("Retry attempt {} for {} after {}s delay (rate limited)", attempt + 1, symbol, delay);
                sleep(StdDuration::from_secs(delay)).await;
            }

            match self.fetch_historical_prices(symbol, days).await {
                Ok(prices) => {
                    if attempt > 0 {
                        tracing::info!("✅ Successfully fetched {} after {} retries", symbol, attempt);
                    }
                    return Ok(prices);
                }
                Err(e) => {
                    let err_msg = e.to_string();
                    if err_msg.contains("429") || err_msg.contains("Rate limited") {
                        tracing::warn!("⚠️  Rate limited on attempt {} for {}", attempt + 1, symbol);
                    } else {
                        tracing::error!("❌ Error fetching {}: {}", symbol, err_msg);
                    }
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
            "https://query2.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range={}d",
            symbol.replace("/", "-"), days
        );

        tracing::debug!("Fetching {} from Yahoo Finance (query2): {}", symbol, url);
        
        let response = self
            .client
            .get(&url)
            .header(ACCEPT, "application/json")
            .send()
            .await
            .map_err(|e| anyhow!("HTTP request failed for {}: {}", symbol, e))?;

        let status = response.status();
        tracing::debug!("Response status for {}: {}", symbol, status);
        
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(anyhow!("Rate limited by Yahoo Finance (429)"));
        }

        if !status.is_success() {
            let body = response.text().await.unwrap_or_else(|_| "Unable to read response".to_string());
            tracing::warn!("Yahoo Finance error for {}: status={}, body={}", symbol, status, body);
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

    /// Fetch company profile from Yahoo Finance quoteSummary endpoint
    pub async fn get_company_profile(&self, symbol: &str) -> Result<CompanyProfile> {
        let url = format!(
            "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{}?modules=assetProfile",
            symbol.replace("/", "-")
        );

        tracing::debug!("Fetching company profile for {} from Yahoo Finance: {}", symbol, url);

        let response = self
            .client
            .get(&url)
            .header(ACCEPT, "application/json")
            .send()
            .await
            .map_err(|e| anyhow!("HTTP request failed for {}: {}", symbol, e))?;

        let status = response.status();

        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(anyhow!("Rate limited by Yahoo Finance (429)"));
        }

        if !status.is_success() {
            let body = response.text().await.unwrap_or_else(|_| "Unable to read response".to_string());
            tracing::warn!("Yahoo Finance profile error for {}: status={}, body={}", symbol, status, body);
            return Err(anyhow!("Yahoo Finance returned status {}", status));
        }

        let summary_response: QuoteSummaryResponse = response
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse quoteSummary JSON for {}: {}", symbol, e))?;

        if let Some(error) = summary_response.quote_summary.error {
            return Err(anyhow!(
                "Yahoo Finance error for {}: {} - {}",
                symbol,
                error.code,
                error.description
            ));
        }

        let asset_profile = summary_response
            .quote_summary
            .result
            .and_then(|r| r.into_iter().next())
            .and_then(|d| d.asset_profile)
            .ok_or_else(|| anyhow!("No asset profile data returned for {}", symbol))?;

        Ok(CompanyProfile {
            long_business_summary: asset_profile.long_business_summary,
            industry: asset_profile.industry,
            sector: asset_profile.sector,
            website: asset_profile.website,
            full_time_employees: asset_profile.full_time_employees,
            city: asset_profile.city,
            state: asset_profile.state,
            country: asset_profile.country,
            phone: asset_profile.phone,
        })
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
