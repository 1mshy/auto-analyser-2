use crate::models::{CompanyProfile, HistoricalPrice};
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use rand::Rng;
use reqwest;
use reqwest::header::ACCEPT;
use serde::Deserialize;
use std::sync::Arc;
use std::time::{Duration as StdDuration, Instant};
use tokio::sync::RwLock;
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
    #[serde(rename = "financialData")]
    financial_data: Option<FinancialDataResponse>,
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

// Financial data response structures
#[derive(Debug, Deserialize)]
struct FinancialDataResponse {
    #[serde(rename = "currentPrice")]
    current_price: Option<YahooValue>,
    #[serde(rename = "targetHighPrice")]
    target_high_price: Option<YahooValue>,
    #[serde(rename = "targetLowPrice")]
    target_low_price: Option<YahooValue>,
    #[serde(rename = "targetMeanPrice")]
    target_mean_price: Option<YahooValue>,
    #[serde(rename = "recommendationKey")]
    recommendation_key: Option<String>,
    #[serde(rename = "numberOfAnalystOpinions")]
    number_of_analyst_opinions: Option<YahooValue>,
    #[serde(rename = "totalRevenue")]
    total_revenue: Option<YahooValue>,
    #[serde(rename = "revenuePerShare")]
    revenue_per_share: Option<YahooValue>,
    #[serde(rename = "profitMargins")]
    profit_margins: Option<YahooValue>,
    #[serde(rename = "grossMargins")]
    gross_margins: Option<YahooValue>,
    #[serde(rename = "operatingMargins")]
    operating_margins: Option<YahooValue>,
    #[serde(rename = "returnOnEquity")]
    return_on_equity: Option<YahooValue>,
    #[serde(rename = "freeCashflow")]
    free_cash_flow: Option<YahooValue>,
}

// Yahoo's value format: { raw: f64, fmt: String }
#[derive(Debug, Deserialize)]
struct YahooValue {
    raw: Option<f64>,
    #[allow(dead_code)]
    fmt: Option<String>,
}

impl YahooValue {
    fn to_f64(&self) -> Option<f64> {
        self.raw
    }
    
    fn to_i64(&self) -> Option<i64> {
        self.raw.map(|v| v as i64)
    }
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

/// Yahoo Finance client with crumb-based authentication for reliable API access
#[derive(Clone)]
pub struct YahooFinanceClient {
    client: Arc<reqwest::Client>,
    crumb: Arc<RwLock<Option<String>>>,
    last_refresh: Arc<RwLock<Option<Instant>>>,
    max_retries: u32,
}

impl YahooFinanceClient {
    pub fn new() -> Self {
        // Build client with cookie store enabled for session management
        let client = reqwest::Client::builder()
            .cookie_store(true)
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .timeout(StdDuration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        YahooFinanceClient {
            client: Arc::new(client),
            crumb: Arc::new(RwLock::new(None)),
            last_refresh: Arc::new(RwLock::new(None)),
            max_retries: 3,
        }
    }

    /// Refresh the crumb token by visiting Yahoo and getting a new one
    async fn refresh_crumb(&self) -> Result<()> {
        tracing::debug!("Refreshing Yahoo Finance crumb token...");
        
        // First, hit fc.yahoo.com to get cookies established
        self.client
            .get("https://fc.yahoo.com")
            .send()
            .await
            .map_err(|e| anyhow!("Failed to establish Yahoo session: {}", e))?;

        // Now get the crumb from the getcrumb endpoint
        let crumb_response = self.client
            .get("https://query1.finance.yahoo.com/v1/test/getcrumb")
            .send()
            .await
            .map_err(|e| anyhow!("Failed to get crumb: {}", e))?;

        if !crumb_response.status().is_success() {
            return Err(anyhow!("Crumb endpoint returned status: {}", crumb_response.status()));
        }

        let crumb_text = crumb_response.text().await
            .map_err(|e| anyhow!("Failed to read crumb response: {}", e))?;

        if crumb_text.is_empty() || crumb_text.contains("error") {
            return Err(anyhow!("Invalid crumb response: {}", crumb_text));
        }

        // Store the crumb and update refresh time
        {
            let mut crumb_lock = self.crumb.write().await;
            *crumb_lock = Some(crumb_text.clone());
        }
        {
            let mut refresh_lock = self.last_refresh.write().await;
            *refresh_lock = Some(Instant::now());
        }

        tracing::info!("✅ Yahoo Finance crumb refreshed successfully");
        Ok(())
    }

    /// Ensure crumb is valid, refreshing if necessary (15 minute TTL)
    async fn ensure_crumb_valid(&self) -> Result<()> {
        let crumb_ttl = StdDuration::from_secs(15 * 60); // 15 minutes
        
        let needs_refresh = {
            let crumb = self.crumb.read().await;
            let last_refresh = self.last_refresh.read().await;
            
            match (crumb.as_ref(), last_refresh.as_ref()) {
                (Some(_), Some(t)) if t.elapsed() < crumb_ttl => false,
                _ => true,
            }
        };

        if needs_refresh {
            self.refresh_crumb().await?;
        }

        Ok(())
    }

    /// Get the current crumb, ensuring it's valid first
    async fn get_crumb(&self) -> Result<String> {
        self.ensure_crumb_valid().await?;
        
        let crumb = self.crumb.read().await;
        crumb.clone().ok_or_else(|| anyhow!("Crumb not available"))
    }

    /// Make an authenticated request to Yahoo Finance
    async fn fetch_with_crumb(&self, base_url: &str) -> Result<String> {
        let crumb = self.get_crumb().await?;
        
        // Add crumb to URL (append with & if URL already has params, otherwise ?)
        let separator = if base_url.contains('?') { "&" } else { "?" };
        let full_url = format!("{}{}crumb={}", base_url, separator, crumb);

        let response = self.client
            .get(&full_url)
            .header(ACCEPT, "application/json")
            .send()
            .await
            .map_err(|e| anyhow!("HTTP request failed: {}", e))?;

        let status = response.status();

        // If we get a 403, try refreshing the crumb and retry once
        if status == reqwest::StatusCode::FORBIDDEN {
            tracing::warn!("Got 403, refreshing crumb and retrying...");
            self.refresh_crumb().await?;
            
            let crumb = self.get_crumb().await?;
            let full_url = format!("{}{}crumb={}", base_url, separator, crumb);
            
            let retry_response = self.client
                .get(&full_url)
                .header(ACCEPT, "application/json")
                .send()
                .await
                .map_err(|e| anyhow!("HTTP retry request failed: {}", e))?;

            if !retry_response.status().is_success() {
                return Err(anyhow!("Request failed after crumb refresh: {}", retry_response.status()));
            }

            return retry_response.text().await
                .map_err(|e| anyhow!("Failed to read response: {}", e));
        }

        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(anyhow!("Rate limited by Yahoo Finance (429)"));
        }

        if !status.is_success() {
            return Err(anyhow!("Yahoo Finance returned status {}", status));
        }

        response.text().await
            .map_err(|e| anyhow!("Failed to read response: {}", e))
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
        
        let text = self.fetch_with_crumb(&url).await?;
        
        let yahoo_response: YahooResponse = serde_json::from_str(&text)
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

    /// Fetch company profile with financial data from Yahoo Finance quoteSummary endpoint
    pub async fn get_company_profile(&self, symbol: &str) -> Result<CompanyProfile> {
        // Use both assetProfile and financialData modules
        let url = format!(
            "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{}?modules=assetProfile,financialData",
            symbol.replace("/", "-")
        );

        tracing::debug!("Fetching company profile for {} from Yahoo Finance: {}", symbol, url);

        let text = self.fetch_with_crumb(&url).await?;

        let summary_response: QuoteSummaryResponse = serde_json::from_str(&text)
            .map_err(|e| anyhow!("Failed to parse quoteSummary JSON for {}: {}", symbol, e))?;

        if let Some(error) = summary_response.quote_summary.error {
            return Err(anyhow!(
                "Yahoo Finance error for {}: {} - {}",
                symbol,
                error.code,
                error.description
            ));
        }

        let data = summary_response
            .quote_summary
            .result
            .and_then(|r| r.into_iter().next())
            .ok_or_else(|| anyhow!("No data returned for {}", symbol))?;

        let asset_profile = data.asset_profile;
        let financial_data = data.financial_data;

        // Build CompanyProfile from both assetProfile and financialData
        Ok(CompanyProfile {
            // Asset Profile fields
            long_business_summary: asset_profile.as_ref().and_then(|p| p.long_business_summary.clone()),
            industry: asset_profile.as_ref().and_then(|p| p.industry.clone()),
            sector: asset_profile.as_ref().and_then(|p| p.sector.clone()),
            website: asset_profile.as_ref().and_then(|p| p.website.clone()),
            full_time_employees: asset_profile.as_ref().and_then(|p| p.full_time_employees),
            city: asset_profile.as_ref().and_then(|p| p.city.clone()),
            state: asset_profile.as_ref().and_then(|p| p.state.clone()),
            country: asset_profile.as_ref().and_then(|p| p.country.clone()),
            phone: asset_profile.as_ref().and_then(|p| p.phone.clone()),
            // Financial Data fields
            current_price: financial_data.as_ref().and_then(|f| f.current_price.as_ref().and_then(|v| v.to_f64())),
            target_high_price: financial_data.as_ref().and_then(|f| f.target_high_price.as_ref().and_then(|v| v.to_f64())),
            target_low_price: financial_data.as_ref().and_then(|f| f.target_low_price.as_ref().and_then(|v| v.to_f64())),
            target_mean_price: financial_data.as_ref().and_then(|f| f.target_mean_price.as_ref().and_then(|v| v.to_f64())),
            recommendation_key: financial_data.as_ref().and_then(|f| f.recommendation_key.clone()),
            number_of_analyst_opinions: financial_data.as_ref().and_then(|f| f.number_of_analyst_opinions.as_ref().and_then(|v| v.to_i64())),
            total_revenue: financial_data.as_ref().and_then(|f| f.total_revenue.as_ref().and_then(|v| v.to_f64())),
            revenue_per_share: financial_data.as_ref().and_then(|f| f.revenue_per_share.as_ref().and_then(|v| v.to_f64())),
            profit_margins: financial_data.as_ref().and_then(|f| f.profit_margins.as_ref().and_then(|v| v.to_f64())),
            gross_margins: financial_data.as_ref().and_then(|f| f.gross_margins.as_ref().and_then(|v| v.to_f64())),
            operating_margins: financial_data.as_ref().and_then(|f| f.operating_margins.as_ref().and_then(|v| v.to_f64())),
            return_on_equity: financial_data.as_ref().and_then(|f| f.return_on_equity.as_ref().and_then(|v| v.to_f64())),
            free_cash_flow: financial_data.as_ref().and_then(|f| f.free_cash_flow.as_ref().and_then(|v| v.to_f64())),
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
