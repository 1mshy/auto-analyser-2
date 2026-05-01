use crate::models::{CompanyProfile, EarningsData, HistoricalPrice};
use anyhow::{anyhow, Result};
use chrono::DateTime;
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
    #[serde(rename = "summaryDetail")]
    summary_detail: Option<SummaryDetail>,
    #[serde(rename = "defaultKeyStatistics")]
    default_key_statistics: Option<DefaultKeyStatistics>,
    price: Option<PriceData>,
    #[serde(rename = "calendarEvents")]
    calendar_events: Option<CalendarEvents>,
}

#[derive(Debug, Deserialize)]
struct CalendarEvents {
    earnings: Option<EarningsInfo>,
}

#[derive(Debug, Deserialize)]
struct EarningsInfo {
    #[serde(rename = "earningsDate")]
    earnings_date: Option<Vec<YahooValue>>,
    #[serde(rename = "earningsAverage")]
    earnings_average: Option<YahooValue>,
    #[serde(rename = "revenueAverage")]
    revenue_average: Option<YahooValue>,
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
    #[serde(rename = "revenueGrowth")]
    revenue_growth: Option<YahooValue>,
    #[serde(rename = "earningsGrowth")]
    earnings_growth: Option<YahooValue>,
}

#[derive(Debug, Deserialize)]
struct SummaryDetail {
    #[serde(rename = "marketCap")]
    market_cap: Option<YahooValue>,
    beta: Option<YahooValue>,
    #[serde(rename = "trailingPE")]
    trailing_pe: Option<YahooValue>,
    #[serde(rename = "forwardPE")]
    forward_pe: Option<YahooValue>,
    #[serde(rename = "dividendRate")]
    dividend_rate: Option<YahooValue>,
    #[serde(rename = "dividendYield")]
    dividend_yield: Option<YahooValue>,
    #[serde(rename = "payoutRatio")]
    payout_ratio: Option<YahooValue>,
    #[serde(rename = "averageVolume")]
    average_volume: Option<YahooValue>,
    #[serde(rename = "averageVolume10days")]
    average_volume_10_day: Option<YahooValue>,
    #[serde(rename = "fiftyTwoWeekHigh")]
    fifty_two_week_high: Option<YahooValue>,
    #[serde(rename = "fiftyTwoWeekLow")]
    fifty_two_week_low: Option<YahooValue>,
    #[serde(rename = "fiftyDayAverage")]
    fifty_day_average: Option<YahooValue>,
    #[serde(rename = "twoHundredDayAverage")]
    two_hundred_day_average: Option<YahooValue>,
}

#[derive(Debug, Deserialize)]
struct DefaultKeyStatistics {
    #[serde(rename = "enterpriseValue")]
    enterprise_value: Option<YahooValue>,
    #[serde(rename = "forwardPE")]
    forward_pe: Option<YahooValue>,
    #[serde(rename = "pegRatio")]
    peg_ratio: Option<YahooValue>,
    #[serde(rename = "priceToBook")]
    price_to_book: Option<YahooValue>,
    #[serde(rename = "bookValue")]
    book_value: Option<YahooValue>,
    #[serde(rename = "trailingEps")]
    trailing_eps: Option<YahooValue>,
    #[serde(rename = "forwardEps")]
    forward_eps: Option<YahooValue>,
    #[serde(rename = "sharesOutstanding")]
    shares_outstanding: Option<YahooValue>,
    #[serde(rename = "floatShares")]
    float_shares: Option<YahooValue>,
    #[serde(rename = "heldPercentInsiders")]
    held_percent_insiders: Option<YahooValue>,
    #[serde(rename = "heldPercentInstitutions")]
    held_percent_institutions: Option<YahooValue>,
    #[serde(rename = "netIncomeToCommon")]
    net_income_to_common: Option<YahooValue>,
}

#[derive(Debug, Deserialize)]
struct PriceData {
    #[serde(rename = "shortName")]
    short_name: Option<String>,
    #[serde(rename = "longName")]
    long_name: Option<String>,
    exchange: Option<String>,
    #[serde(rename = "exchangeName")]
    exchange_name: Option<String>,
    #[serde(rename = "quoteType")]
    quote_type: Option<String>,
    currency: Option<String>,
    #[serde(rename = "marketCap")]
    market_cap: Option<YahooValue>,
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
        let crumb_response = self
            .client
            .get("https://query1.finance.yahoo.com/v1/test/getcrumb")
            .send()
            .await
            .map_err(|e| anyhow!("Failed to get crumb: {}", e))?;

        if !crumb_response.status().is_success() {
            return Err(anyhow!(
                "Crumb endpoint returned status: {}",
                crumb_response.status()
            ));
        }

        let crumb_text = crumb_response
            .text()
            .await
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

        let full_url = Self::url_with_crumb(base_url, &crumb)?;

        let response = self
            .client
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
            let full_url = Self::url_with_crumb(base_url, &crumb)?;

            let retry_response = self
                .client
                .get(&full_url)
                .header(ACCEPT, "application/json")
                .send()
                .await
                .map_err(|e| anyhow!("HTTP retry request failed: {}", e))?;

            let retry_status = retry_response.status();

            // The retry may itself be rate-limited. Emit the canonical
            // "Rate limited ... (429)" message so `async_fetcher` counts it
            // correctly instead of treating it as a generic failure.
            if retry_status == reqwest::StatusCode::TOO_MANY_REQUESTS {
                return Err(anyhow!(
                    "Rate limited by Yahoo Finance (429) after crumb refresh"
                ));
            }

            if !retry_status.is_success() {
                return Err(anyhow!(
                    "Request failed after crumb refresh: {}",
                    retry_status
                ));
            }

            return retry_response
                .text()
                .await
                .map_err(|e| anyhow!("Failed to read response: {}", e));
        }

        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(anyhow!("Rate limited by Yahoo Finance (429)"));
        }

        if !status.is_success() {
            return Err(anyhow!("Yahoo Finance returned status {}", status));
        }

        response
            .text()
            .await
            .map_err(|e| anyhow!("Failed to read response: {}", e))
    }

    fn url_with_crumb(base_url: &str, crumb: &str) -> Result<String> {
        let mut url = reqwest::Url::parse(base_url)
            .map_err(|e| anyhow!("Invalid Yahoo Finance URL '{}': {}", base_url, e))?;
        url.query_pairs_mut().append_pair("crumb", crumb);
        Ok(url.to_string())
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
                tracing::warn!(
                    "Retry attempt {} for {} after {}s delay (rate limited)",
                    attempt + 1,
                    symbol,
                    delay
                );
                sleep(StdDuration::from_secs(delay)).await;
            }

            match self.fetch_historical_prices(symbol, days).await {
                Ok(prices) => {
                    if attempt > 0 {
                        tracing::info!(
                            "✅ Successfully fetched {} after {} retries",
                            symbol,
                            attempt
                        );
                    }
                    return Ok(prices);
                }
                Err(e) => {
                    let err_msg = e.to_string();
                    if err_msg.contains("429") || err_msg.contains("Rate limited") {
                        tracing::warn!(
                            "⚠️  Rate limited on attempt {} for {}",
                            attempt + 1,
                            symbol
                        );
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
            crate::symbols::yahoo_symbol(symbol),
            days
        );

        tracing::debug!("Fetching {} from Yahoo Finance (query2): {}", symbol, url);

        let text = self.fetch_with_crumb(&url).await?;
        parse_historical_prices(&text, symbol)
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
        let url = format!(
            "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{}?modules=assetProfile,financialData,summaryDetail,defaultKeyStatistics,price",
            crate::symbols::yahoo_symbol(symbol)
        );

        tracing::debug!(
            "Fetching company profile for {} from Yahoo Finance: {}",
            symbol,
            url
        );

        let text = self.fetch_with_crumb(&url).await?;
        parse_company_profile(&text, symbol)
    }

    /// Fetch earnings data from Yahoo Finance calendarEvents module
    pub async fn get_earnings_data(&self, symbol: &str) -> Result<EarningsData> {
        let url = format!(
            "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{}?modules=calendarEvents",
            crate::symbols::yahoo_symbol(symbol)
        );

        tracing::debug!("Fetching earnings data for {} from Yahoo Finance", symbol);

        let text = self.fetch_with_crumb(&url).await?;
        parse_earnings_data(&text, symbol)
    }
}

// ============================================================================
// Pure parsing functions (offline-testable)
// ============================================================================

/// Parse a Yahoo Finance chart response into historical prices.
/// Rows with any missing OHLC value are skipped; missing volume defaults to 0.
pub(crate) fn parse_historical_prices(text: &str, symbol: &str) -> Result<Vec<HistoricalPrice>> {
    let yahoo_response: YahooResponse = serde_json::from_str(text)
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
        if let (Some(Some(open)), Some(Some(high)), Some(Some(low)), Some(Some(close))) =
            (opens.get(i), highs.get(i), lows.get(i), closes.get(i))
        {
            let volume = volumes
                .get(i)
                .and_then(|v| v.as_ref())
                .copied()
                .unwrap_or(0) as f64;

            let Some(date) = DateTime::from_timestamp(timestamp, 0) else {
                tracing::warn!(
                    "Skipping {} bar with invalid timestamp {}",
                    symbol,
                    timestamp
                );
                continue;
            };

            prices.push(HistoricalPrice {
                date,
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

/// Parse a Yahoo Finance quoteSummary response (assetProfile + financialData).
pub(crate) fn parse_company_profile(text: &str, symbol: &str) -> Result<CompanyProfile> {
    let summary_response: QuoteSummaryResponse = serde_json::from_str(text)
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
    let summary_detail = data.summary_detail;
    let default_key_statistics = data.default_key_statistics;
    let price = data.price;

    Ok(CompanyProfile {
        short_name: price.as_ref().and_then(|p| p.short_name.clone()),
        long_name: price.as_ref().and_then(|p| p.long_name.clone()),
        exchange: price.as_ref().and_then(|p| p.exchange.clone()),
        exchange_name: price.as_ref().and_then(|p| p.exchange_name.clone()),
        quote_type: price.as_ref().and_then(|p| p.quote_type.clone()),
        currency: price.as_ref().and_then(|p| p.currency.clone()),
        long_business_summary: asset_profile
            .as_ref()
            .and_then(|p| p.long_business_summary.clone()),
        industry: asset_profile.as_ref().and_then(|p| p.industry.clone()),
        sector: asset_profile.as_ref().and_then(|p| p.sector.clone()),
        website: asset_profile.as_ref().and_then(|p| p.website.clone()),
        full_time_employees: asset_profile.as_ref().and_then(|p| p.full_time_employees),
        city: asset_profile.as_ref().and_then(|p| p.city.clone()),
        state: asset_profile.as_ref().and_then(|p| p.state.clone()),
        country: asset_profile.as_ref().and_then(|p| p.country.clone()),
        phone: asset_profile.as_ref().and_then(|p| p.phone.clone()),
        current_price: financial_data
            .as_ref()
            .and_then(|f| f.current_price.as_ref().and_then(|v| v.to_f64())),
        target_high_price: financial_data
            .as_ref()
            .and_then(|f| f.target_high_price.as_ref().and_then(|v| v.to_f64())),
        target_low_price: financial_data
            .as_ref()
            .and_then(|f| f.target_low_price.as_ref().and_then(|v| v.to_f64())),
        target_mean_price: financial_data
            .as_ref()
            .and_then(|f| f.target_mean_price.as_ref().and_then(|v| v.to_f64())),
        recommendation_key: financial_data
            .as_ref()
            .and_then(|f| f.recommendation_key.clone()),
        number_of_analyst_opinions: financial_data.as_ref().and_then(|f| {
            f.number_of_analyst_opinions
                .as_ref()
                .and_then(|v| v.to_i64())
        }),
        total_revenue: financial_data
            .as_ref()
            .and_then(|f| f.total_revenue.as_ref().and_then(|v| v.to_f64())),
        revenue_per_share: financial_data
            .as_ref()
            .and_then(|f| f.revenue_per_share.as_ref().and_then(|v| v.to_f64())),
        profit_margins: financial_data
            .as_ref()
            .and_then(|f| f.profit_margins.as_ref().and_then(|v| v.to_f64())),
        gross_margins: financial_data
            .as_ref()
            .and_then(|f| f.gross_margins.as_ref().and_then(|v| v.to_f64())),
        operating_margins: financial_data
            .as_ref()
            .and_then(|f| f.operating_margins.as_ref().and_then(|v| v.to_f64())),
        return_on_equity: financial_data
            .as_ref()
            .and_then(|f| f.return_on_equity.as_ref().and_then(|v| v.to_f64())),
        free_cash_flow: financial_data
            .as_ref()
            .and_then(|f| f.free_cash_flow.as_ref().and_then(|v| v.to_f64())),
        revenue_growth: financial_data
            .as_ref()
            .and_then(|f| f.revenue_growth.as_ref().and_then(|v| v.to_f64())),
        earnings_growth: financial_data
            .as_ref()
            .and_then(|f| f.earnings_growth.as_ref().and_then(|v| v.to_f64())),
        market_cap: price
            .as_ref()
            .and_then(|p| p.market_cap.as_ref().and_then(|v| v.to_f64()))
            .or_else(|| {
                summary_detail
                    .as_ref()
                    .and_then(|s| s.market_cap.as_ref().and_then(|v| v.to_f64()))
            }),
        enterprise_value: default_key_statistics
            .as_ref()
            .and_then(|k| k.enterprise_value.as_ref().and_then(|v| v.to_f64())),
        beta: summary_detail
            .as_ref()
            .and_then(|s| s.beta.as_ref().and_then(|v| v.to_f64())),
        trailing_pe: summary_detail
            .as_ref()
            .and_then(|s| s.trailing_pe.as_ref().and_then(|v| v.to_f64())),
        forward_pe: summary_detail
            .as_ref()
            .and_then(|s| s.forward_pe.as_ref().and_then(|v| v.to_f64()))
            .or_else(|| {
                default_key_statistics
                    .as_ref()
                    .and_then(|k| k.forward_pe.as_ref().and_then(|v| v.to_f64()))
            }),
        peg_ratio: default_key_statistics
            .as_ref()
            .and_then(|k| k.peg_ratio.as_ref().and_then(|v| v.to_f64())),
        price_to_book: default_key_statistics
            .as_ref()
            .and_then(|k| k.price_to_book.as_ref().and_then(|v| v.to_f64())),
        book_value: default_key_statistics
            .as_ref()
            .and_then(|k| k.book_value.as_ref().and_then(|v| v.to_f64())),
        trailing_eps: default_key_statistics
            .as_ref()
            .and_then(|k| k.trailing_eps.as_ref().and_then(|v| v.to_f64())),
        forward_eps: default_key_statistics
            .as_ref()
            .and_then(|k| k.forward_eps.as_ref().and_then(|v| v.to_f64())),
        dividend_rate: summary_detail
            .as_ref()
            .and_then(|s| s.dividend_rate.as_ref().and_then(|v| v.to_f64())),
        dividend_yield: summary_detail
            .as_ref()
            .and_then(|s| s.dividend_yield.as_ref().and_then(|v| v.to_f64())),
        payout_ratio: summary_detail
            .as_ref()
            .and_then(|s| s.payout_ratio.as_ref().and_then(|v| v.to_f64())),
        average_volume: summary_detail
            .as_ref()
            .and_then(|s| s.average_volume.as_ref().and_then(|v| v.to_f64())),
        average_volume_10_day: summary_detail
            .as_ref()
            .and_then(|s| s.average_volume_10_day.as_ref().and_then(|v| v.to_f64())),
        fifty_two_week_high: summary_detail
            .as_ref()
            .and_then(|s| s.fifty_two_week_high.as_ref().and_then(|v| v.to_f64())),
        fifty_two_week_low: summary_detail
            .as_ref()
            .and_then(|s| s.fifty_two_week_low.as_ref().and_then(|v| v.to_f64())),
        fifty_day_average: summary_detail
            .as_ref()
            .and_then(|s| s.fifty_day_average.as_ref().and_then(|v| v.to_f64())),
        two_hundred_day_average: summary_detail
            .as_ref()
            .and_then(|s| s.two_hundred_day_average.as_ref().and_then(|v| v.to_f64())),
        shares_outstanding: default_key_statistics
            .as_ref()
            .and_then(|k| k.shares_outstanding.as_ref().and_then(|v| v.to_f64())),
        float_shares: default_key_statistics
            .as_ref()
            .and_then(|k| k.float_shares.as_ref().and_then(|v| v.to_f64())),
        held_percent_insiders: default_key_statistics
            .as_ref()
            .and_then(|k| k.held_percent_insiders.as_ref().and_then(|v| v.to_f64())),
        held_percent_institutions: default_key_statistics.as_ref().and_then(|k| {
            k.held_percent_institutions
                .as_ref()
                .and_then(|v| v.to_f64())
        }),
        net_income_to_common: default_key_statistics
            .as_ref()
            .and_then(|k| k.net_income_to_common.as_ref().and_then(|v| v.to_f64())),
    })
}

/// Parse a Yahoo Finance quoteSummary response for earnings (calendarEvents).
pub(crate) fn parse_earnings_data(text: &str, symbol: &str) -> Result<EarningsData> {
    let summary_response: QuoteSummaryResponse = serde_json::from_str(text)
        .map_err(|e| anyhow!("Failed to parse earnings JSON for {}: {}", symbol, e))?;

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

    let calendar = data.calendar_events;

    let earnings_date = calendar
        .as_ref()
        .and_then(|c| c.earnings.as_ref())
        .and_then(|e| e.earnings_date.as_ref())
        .and_then(|dates| dates.first())
        .and_then(|v| v.raw)
        .and_then(|ts| DateTime::from_timestamp(ts as i64, 0));

    let eps_estimate = calendar
        .as_ref()
        .and_then(|c| c.earnings.as_ref())
        .and_then(|e| e.earnings_average.as_ref())
        .and_then(|v| v.to_f64());

    let revenue_estimate = calendar
        .as_ref()
        .and_then(|c| c.earnings.as_ref())
        .and_then(|e| e.revenue_average.as_ref())
        .and_then(|v| v.to_f64());

    Ok(EarningsData {
        earnings_date,
        eps_estimate,
        revenue_estimate,
    })
}

impl Default for YahooFinanceClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- Client construction -------------------------------------------------

    #[test]
    fn test_client_has_user_agent() {
        let client = YahooFinanceClient::new();
        assert_eq!(client.max_retries, 3);
    }

    // ---- Rate-limit error message format (locks async_fetcher contract) -----

    /// Shared helper replicating `async_fetcher`'s rate-limit detection.
    fn is_rate_limited_error(msg: &str) -> bool {
        msg.contains("429") || msg.contains("Rate limited")
    }

    #[test]
    fn test_rate_limit_error_messages_are_detectable() {
        // Direct 429 response
        let direct = format!("Rate limited by Yahoo Finance (429)");
        assert!(is_rate_limited_error(&direct));

        // 429 on the retry after a 403 crumb refresh. Regression: previously
        // this bubbled up as a plain "Request failed after crumb refresh: 429"
        // which would match "429" but not the "Rate limited" phrase; the new
        // message explicitly includes both for consistent logging.
        let after_refresh = format!("Rate limited by Yahoo Finance (429) after crumb refresh");
        assert!(is_rate_limited_error(&after_refresh));
        assert!(after_refresh.contains("429"));
        assert!(after_refresh.contains("Rate limited"));
    }

    // ---- YahooValue ----------------------------------------------------------

    #[test]
    fn test_yahoo_value_to_f64_and_i64() {
        let v: YahooValue = serde_json::from_str(r#"{"raw": 42.5, "fmt": "42.50"}"#).unwrap();
        assert_eq!(v.to_f64(), Some(42.5));
        assert_eq!(v.to_i64(), Some(42));

        let empty: YahooValue = serde_json::from_str(r#"{}"#).unwrap();
        assert_eq!(empty.to_f64(), None);
        assert_eq!(empty.to_i64(), None);

        let no_fmt: YahooValue = serde_json::from_str(r#"{"raw": 7.0}"#).unwrap();
        assert_eq!(no_fmt.to_f64(), Some(7.0));
    }

    // ---- parse_historical_prices --------------------------------------------

    fn chart_fixture_normal() -> &'static str {
        r#"{
            "chart": {
                "result": [{
                    "timestamp": [1700000000, 1700086400, 1700172800],
                    "indicators": {
                        "quote": [{
                            "open":   [100.0, 101.0, 102.0],
                            "high":   [105.0, 106.0, 107.0],
                            "low":    [ 99.0, 100.0, 101.0],
                            "close":  [103.0, 104.0, 105.0],
                            "volume": [1000000, 1100000, 1200000]
                        }]
                    }
                }],
                "error": null
            }
        }"#
    }

    #[test]
    fn test_parse_historical_prices_normal() {
        let prices = parse_historical_prices(chart_fixture_normal(), "AAPL").unwrap();
        assert_eq!(prices.len(), 3);
        assert_eq!(prices[0].open, 100.0);
        assert_eq!(prices[0].close, 103.0);
        assert_eq!(prices[0].volume, 1_000_000.0);
        assert_eq!(prices[2].close, 105.0);
    }

    #[test]
    fn test_parse_historical_prices_skips_null_rows() {
        // Second row has all nulls (a holiday / missing bar). It must be skipped,
        // not turned into a 0.0 price which would break RSI.
        let json = r#"{
            "chart": {
                "result": [{
                    "timestamp": [1700000000, 1700086400, 1700172800],
                    "indicators": {
                        "quote": [{
                            "open":   [100.0, null, 102.0],
                            "high":   [105.0, null, 107.0],
                            "low":    [ 99.0, null, 101.0],
                            "close":  [103.0, null, 105.0],
                            "volume": [1000000, null, 1200000]
                        }]
                    }
                }],
                "error": null
            }
        }"#;
        let prices = parse_historical_prices(json, "AAPL").unwrap();
        assert_eq!(prices.len(), 2, "null OHLC rows must be dropped");
        assert_eq!(prices[0].close, 103.0);
        assert_eq!(prices[1].close, 105.0);
        // No 0.0 close sneaking in.
        assert!(prices.iter().all(|p| p.close > 0.0));
    }

    #[test]
    fn test_parse_historical_prices_missing_volume_defaults_to_zero() {
        let json = r#"{
            "chart": {
                "result": [{
                    "timestamp": [1700000000],
                    "indicators": {
                        "quote": [{
                            "open":   [100.0],
                            "high":   [105.0],
                            "low":    [ 99.0],
                            "close":  [103.0],
                            "volume": [null]
                        }]
                    }
                }],
                "error": null
            }
        }"#;
        let prices = parse_historical_prices(json, "AAPL").unwrap();
        assert_eq!(prices.len(), 1);
        assert_eq!(prices[0].volume, 0.0);
    }

    #[test]
    fn test_parse_historical_prices_error_block() {
        let json = r#"{
            "chart": {
                "result": null,
                "error": {
                    "code": "Not Found",
                    "description": "No data found, symbol may be delisted"
                }
            }
        }"#;
        let err = parse_historical_prices(json, "ZZZZ").unwrap_err();
        assert!(err.to_string().contains("Not Found"));
        assert!(err.to_string().contains("delisted"));
    }

    #[test]
    fn test_parse_historical_prices_empty_result() {
        let json = r#"{"chart": {"result": [], "error": null}}"#;
        let err = parse_historical_prices(json, "ZZZZ").unwrap_err();
        assert!(err.to_string().contains("No data returned"));
    }

    #[test]
    fn test_parse_historical_prices_all_null_rows_returns_error() {
        // A stock whose Yahoo payload is structurally valid but has only null bars
        // must NOT produce a StockAnalysis. This prevents polluting the feed.
        let json = r#"{
            "chart": {
                "result": [{
                    "timestamp": [1700000000, 1700086400],
                    "indicators": {
                        "quote": [{
                            "open":   [null, null],
                            "high":   [null, null],
                            "low":    [null, null],
                            "close":  [null, null],
                            "volume": [null, null]
                        }]
                    }
                }],
                "error": null
            }
        }"#;
        let err = parse_historical_prices(json, "ZZZZ").unwrap_err();
        assert!(err.to_string().contains("No valid price data"));
    }

    #[test]
    fn test_parse_historical_prices_invalid_json() {
        let err = parse_historical_prices("not json", "AAPL").unwrap_err();
        assert!(err.to_string().contains("Failed to parse JSON"));
    }

    // ---- parse_company_profile ----------------------------------------------

    fn profile_fixture_full() -> &'static str {
        r#"{
            "quoteSummary": {
                "result": [{
                    "assetProfile": {
                        "longBusinessSummary": "Makes phones.",
                        "industry": "Consumer Electronics",
                        "sector": "Technology",
                        "website": "https://apple.com",
                        "fullTimeEmployees": 164000,
                        "city": "Cupertino",
                        "state": "CA",
                        "country": "USA",
                        "phone": "408-996-1010"
                    },
                    "financialData": {
                        "currentPrice":           {"raw": 190.25, "fmt": "190.25"},
                        "targetHighPrice":        {"raw": 250.0,  "fmt": "250.00"},
                        "targetLowPrice":         {"raw": 150.0,  "fmt": "150.00"},
                        "targetMeanPrice":        {"raw": 210.0,  "fmt": "210.00"},
                        "recommendationKey":      "buy",
                        "numberOfAnalystOpinions":{"raw": 35.0,   "fmt": "35"},
                        "totalRevenue":           {"raw": 4.0e11, "fmt": "400B"},
                        "revenuePerShare":        {"raw": 25.0,   "fmt": "25.00"},
                        "profitMargins":          {"raw": 0.25,   "fmt": "25%"},
                        "grossMargins":           {"raw": 0.44,   "fmt": "44%"},
                        "operatingMargins":       {"raw": 0.30,   "fmt": "30%"},
                        "returnOnEquity":         {"raw": 1.5,    "fmt": "150%"},
                        "freeCashflow":           {"raw": 1.0e11, "fmt": "100B"},
                        "revenueGrowth":          {"raw": 0.08,   "fmt": "8%"},
                        "earningsGrowth":         {"raw": 0.12,   "fmt": "12%"}
                    },
                    "summaryDetail": {
                        "marketCap":              {"raw": 3.0e12, "fmt": "3T"},
                        "beta":                   {"raw": 1.2,    "fmt": "1.20"},
                        "trailingPE":             {"raw": 31.0,   "fmt": "31.00"},
                        "forwardPE":              {"raw": 27.5,   "fmt": "27.50"},
                        "dividendRate":           {"raw": 1.04,   "fmt": "1.04"},
                        "dividendYield":          {"raw": 0.005,  "fmt": "0.50%"},
                        "payoutRatio":            {"raw": 0.16,   "fmt": "16%"},
                        "averageVolume":          {"raw": 5.8e7,  "fmt": "58M"},
                        "averageVolume10days":    {"raw": 6.1e7,  "fmt": "61M"},
                        "fiftyTwoWeekHigh":       {"raw": 199.62, "fmt": "199.62"},
                        "fiftyTwoWeekLow":        {"raw": 164.08, "fmt": "164.08"},
                        "fiftyDayAverage":        {"raw": 185.3,  "fmt": "185.30"},
                        "twoHundredDayAverage":   {"raw": 181.4,  "fmt": "181.40"}
                    },
                    "defaultKeyStatistics": {
                        "enterpriseValue":        {"raw": 3.1e12, "fmt": "3.1T"},
                        "pegRatio":               {"raw": 2.4,    "fmt": "2.40"},
                        "priceToBook":            {"raw": 45.0,   "fmt": "45.00"},
                        "bookValue":              {"raw": 4.21,   "fmt": "4.21"},
                        "trailingEps":            {"raw": 6.12,   "fmt": "6.12"},
                        "forwardEps":             {"raw": 6.95,   "fmt": "6.95"},
                        "sharesOutstanding":      {"raw": 1.55e10,"fmt": "15.5B"},
                        "floatShares":            {"raw": 1.54e10,"fmt": "15.4B"},
                        "heldPercentInsiders":    {"raw": 0.0007, "fmt": "0.07%"},
                        "heldPercentInstitutions": {"raw": 0.61,  "fmt": "61%"},
                        "netIncomeToCommon":      {"raw": 9.7e10, "fmt": "97B"}
                    },
                    "price": {
                        "shortName": "Apple Inc.",
                        "longName": "Apple Inc.",
                        "exchange": "NMS",
                        "exchangeName": "NasdaqGS",
                        "quoteType": "EQUITY",
                        "currency": "USD",
                        "marketCap": {"raw": 3.05e12, "fmt": "3.05T"}
                    }
                }],
                "error": null
            }
        }"#
    }

    #[test]
    fn test_parse_company_profile_full() {
        let profile = parse_company_profile(profile_fixture_full(), "AAPL").unwrap();
        assert_eq!(profile.industry.as_deref(), Some("Consumer Electronics"));
        assert_eq!(profile.sector.as_deref(), Some("Technology"));
        assert_eq!(profile.full_time_employees, Some(164000));
        assert_eq!(profile.current_price, Some(190.25));
        assert_eq!(profile.target_mean_price, Some(210.0));
        assert_eq!(profile.recommendation_key.as_deref(), Some("buy"));
        assert_eq!(profile.number_of_analyst_opinions, Some(35));
        assert_eq!(profile.profit_margins, Some(0.25));
        assert_eq!(profile.short_name.as_deref(), Some("Apple Inc."));
        assert_eq!(profile.exchange.as_deref(), Some("NMS"));
        assert_eq!(profile.currency.as_deref(), Some("USD"));
        assert_eq!(profile.market_cap, Some(3.05e12));
        assert_eq!(profile.enterprise_value, Some(3.1e12));
        assert_eq!(profile.beta, Some(1.2));
        assert_eq!(profile.trailing_pe, Some(31.0));
        assert_eq!(profile.forward_pe, Some(27.5));
        assert_eq!(profile.price_to_book, Some(45.0));
        assert_eq!(profile.dividend_yield, Some(0.005));
        assert_eq!(profile.average_volume_10_day, Some(6.1e7));
        assert_eq!(profile.shares_outstanding, Some(1.55e10));
        assert_eq!(profile.float_shares, Some(1.54e10));
        assert_eq!(profile.net_income_to_common, Some(9.7e10));
        assert_eq!(profile.revenue_growth, Some(0.08));
        assert_eq!(profile.earnings_growth, Some(0.12));
    }

    #[test]
    fn test_parse_company_profile_null_asset_profile() {
        let json = r#"{
            "quoteSummary": {
                "result": [{
                    "assetProfile": null,
                    "financialData": {
                        "currentPrice": {"raw": 50.0, "fmt": "50.00"}
                    }
                }],
                "error": null
            }
        }"#;
        let profile = parse_company_profile(json, "XYZ").unwrap();
        assert!(profile.industry.is_none());
        assert!(profile.long_business_summary.is_none());
        assert_eq!(profile.current_price, Some(50.0));
    }

    #[test]
    fn test_parse_company_profile_null_financial_data() {
        let json = r#"{
            "quoteSummary": {
                "result": [{
                    "assetProfile": {
                        "sector": "Utilities"
                    },
                    "financialData": null
                }],
                "error": null
            }
        }"#;
        let profile = parse_company_profile(json, "XYZ").unwrap();
        assert_eq!(profile.sector.as_deref(), Some("Utilities"));
        assert!(profile.current_price.is_none());
        assert!(profile.target_mean_price.is_none());
    }

    #[test]
    fn test_parse_company_profile_error_block() {
        let json = r#"{
            "quoteSummary": {
                "result": null,
                "error": {
                    "code": "Unauthorized",
                    "description": "Invalid crumb"
                }
            }
        }"#;
        let err = parse_company_profile(json, "AAPL").unwrap_err();
        assert!(err.to_string().contains("Unauthorized"));
    }

    #[test]
    fn test_parse_company_profile_empty_result() {
        let json = r#"{"quoteSummary": {"result": [], "error": null}}"#;
        let err = parse_company_profile(json, "AAPL").unwrap_err();
        assert!(err.to_string().contains("No data returned"));
    }

    // ---- parse_earnings_data -------------------------------------------------

    #[test]
    fn test_parse_earnings_data_full() {
        let json = r#"{
            "quoteSummary": {
                "result": [{
                    "calendarEvents": {
                        "earnings": {
                            "earningsDate": [
                                {"raw": 1700000000, "fmt": "2023-11-14"}
                            ],
                            "earningsAverage": {"raw": 2.15, "fmt": "2.15"},
                            "revenueAverage": {"raw": 95000000000.0, "fmt": "95B"}
                        }
                    }
                }],
                "error": null
            }
        }"#;
        let earnings = parse_earnings_data(json, "AAPL").unwrap();
        assert!(earnings.earnings_date.is_some());
        assert_eq!(earnings.eps_estimate, Some(2.15));
        assert_eq!(earnings.revenue_estimate, Some(95_000_000_000.0));
    }

    #[test]
    fn test_parse_earnings_data_missing_fields() {
        let json = r#"{
            "quoteSummary": {
                "result": [{
                    "calendarEvents": {
                        "earnings": null
                    }
                }],
                "error": null
            }
        }"#;
        let earnings = parse_earnings_data(json, "AAPL").unwrap();
        assert!(earnings.earnings_date.is_none());
        assert!(earnings.eps_estimate.is_none());
        assert!(earnings.revenue_estimate.is_none());
    }

    #[test]
    fn test_parse_earnings_data_no_calendar_events() {
        let json = r#"{
            "quoteSummary": {
                "result": [{}],
                "error": null
            }
        }"#;
        let earnings = parse_earnings_data(json, "AAPL").unwrap();
        assert!(earnings.earnings_date.is_none());
    }
}
