use crate::models::{InsiderTrade, NasdaqNewsItem, NasdaqTechnicals};
use anyhow::{anyhow, Result};
use serde::Deserialize;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{debug, warn};

/// NASDAQ API client for fetching technicals and news
#[derive(Clone)]
pub struct NasdaqClient {
    client: reqwest::Client,
    delay_ms: u64,
}

// Response structures for NASDAQ API

#[derive(Debug, Deserialize)]
struct NasdaqTechnicalsResponse {
    data: Option<NasdaqTechnicalsData>,
    status: Option<NasdaqStatus>,
}

#[derive(Debug, Deserialize)]
struct NasdaqTechnicalsData {
    symbol: Option<String>,
    #[serde(rename = "primaryData")]
    primary_data: Option<PrimaryData>,
    #[serde(rename = "summaryData")]
    summary_data: Option<SummaryData>,
}

#[derive(Debug, Deserialize)]
struct PrimaryData {
    #[serde(rename = "lastSalePrice")]
    last_sale_price: Option<String>,
    #[serde(rename = "netChange")]
    net_change: Option<String>,
    #[serde(rename = "percentageChange")]
    percentage_change: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SummaryData {
    #[serde(rename = "Exchange")]
    exchange: Option<LabelValue>,
    #[serde(rename = "Sector")]
    sector: Option<LabelValue>,
    #[serde(rename = "Industry")]
    industry: Option<LabelValue>,
    #[serde(rename = "OneYrTarget")]
    one_yr_target: Option<LabelValue>,
    #[serde(rename = "TodayHighLow")]
    today_high_low: Option<LabelValue>,
    #[serde(rename = "ShareVolume")]
    share_volume: Option<LabelValue>,
    #[serde(rename = "AverageVolume")]
    average_volume: Option<LabelValue>,
    #[serde(rename = "PreviousClose")]
    previous_close: Option<LabelValue>,
    #[serde(rename = "FiftTwoWeekHighLow")]
    fifty_two_week_high_low: Option<LabelValue>,
    #[serde(rename = "MarketCap")]
    market_cap: Option<LabelValue>,
    #[serde(rename = "PERatio")]
    pe_ratio: Option<LabelValueNumeric>,
    #[serde(rename = "ForwardPE1Yr")]
    forward_pe: Option<LabelValue>,
    #[serde(rename = "EarningsPerShare")]
    eps: Option<LabelValue>,
    #[serde(rename = "AnnualizedDividend")]
    annualized_dividend: Option<LabelValue>,
    #[serde(rename = "ExDividendDate")]
    ex_dividend_date: Option<LabelValue>,
    #[serde(rename = "DividendPaymentDate")]
    dividend_pay_date: Option<LabelValue>,
    #[serde(rename = "Yield")]
    current_yield: Option<LabelValue>,
}

#[derive(Debug, Deserialize)]
struct LabelValue {
    label: Option<String>,
    value: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LabelValueNumeric {
    label: Option<String>,
    value: Option<serde_json::Value>, // Can be number or string
}

#[derive(Debug, Deserialize)]
struct NasdaqStatus {
    #[serde(rename = "rCode")]
    r_code: Option<i32>,
}

// News response structures

#[derive(Debug, Deserialize)]
struct NasdaqNewsResponse {
    data: Option<NasdaqNewsData>,
}

#[derive(Debug, Deserialize)]
struct NasdaqNewsData {
    rows: Option<Vec<NasdaqNewsRow>>,
}

#[derive(Debug, Deserialize)]
struct NasdaqNewsRow {
    title: Option<String>,
    url: Option<String>,
    publisher: Option<String>,
    created: Option<String>,
    ago: Option<String>,
}

// Insider trades response structures

#[derive(Debug, Deserialize)]
struct InsiderTradesResponse {
    data: Option<InsiderTradesData>,
}

#[derive(Debug, Deserialize)]
struct InsiderTradesData {
    #[serde(rename = "transactionTable")]
    transaction_table: Option<InsiderTransactionTable>,
}

#[derive(Debug, Deserialize)]
struct InsiderTransactionTable {
    rows: Option<Vec<InsiderTradeRow>>,
}

#[derive(Debug, Deserialize)]
struct InsiderTradeRow {
    insider: Option<String>,
    relation: Option<String>,
    #[serde(rename = "transactionType")]
    transaction_type: Option<String>,
    #[serde(rename = "lastDate")]
    last_date: Option<String>,
    #[serde(rename = "sharesTraded")]
    shares_traded: Option<String>,
    price: Option<String>,
    #[serde(rename = "sharesHeld")]
    shares_held: Option<String>,
}

impl NasdaqClient {
    pub fn new(delay_ms: u64) -> Self {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::ACCEPT,
            "application/json, text/plain, */*".parse().unwrap(),
        );
        headers.insert(
            reqwest::header::ACCEPT_LANGUAGE,
            "en-US,en;q=0.9".parse().unwrap(),
        );
        headers.insert(
            reqwest::header::ORIGIN,
            "https://www.nasdaq.com".parse().unwrap(),
        );
        headers.insert(
            reqwest::header::REFERER,
            "https://www.nasdaq.com/".parse().unwrap(),
        );

        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .default_headers(headers)
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to create NASDAQ HTTP client");

        NasdaqClient { client, delay_ms }
    }

    /// Fetch technical indicators for a stock from NASDAQ API
    pub async fn get_technicals(&self, symbol: &str) -> Result<NasdaqTechnicals> {
        let url = format!(
            "https://api.nasdaq.com/api/quote/{}/info?assetclass=stocks",
            symbol.to_uppercase()
        );

        debug!("Fetching NASDAQ technicals for {}", symbol);

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| anyhow!("NASDAQ technicals request failed for {}: {}", symbol, e))?;

        let status = response.status();
        if !status.is_success() {
            return Err(anyhow!(
                "NASDAQ API returned status {} for {}",
                status,
                symbol
            ));
        }

        let text = response.text().await.map_err(|e| {
            anyhow!(
                "Failed to read NASDAQ technicals body for {}: {}",
                symbol,
                e
            )
        })?;

        parse_technicals_response(&text, symbol)
    }

    /// Fetch news for a stock from NASDAQ API
    pub async fn get_news(&self, symbol: &str, limit: usize) -> Result<Vec<NasdaqNewsItem>> {
        let url = format!(
            "https://api.nasdaq.com/api/news/headline/{}?limit={}",
            symbol.to_uppercase(),
            limit
        );

        debug!("Fetching NASDAQ news for {}", symbol);

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| anyhow!("NASDAQ news request failed for {}: {}", symbol, e))?;

        let status = response.status();
        if !status.is_success() {
            warn!("NASDAQ news API returned status {} for {}", status, symbol);
            return Ok(vec![]);
        }

        let text = response
            .text()
            .await
            .map_err(|e| anyhow!("Failed to read NASDAQ news body for {}: {}", symbol, e))?;

        parse_news_response(&text, symbol)
    }

    /// Fetch insider trades for a stock from NASDAQ API
    pub async fn get_insider_trades(
        &self,
        symbol: &str,
        limit: usize,
    ) -> Result<Vec<InsiderTrade>> {
        let url = format!(
            "https://api.nasdaq.com/api/company/{}/insider-trades?limit={}&type=ALL",
            symbol.to_uppercase(),
            limit
        );

        debug!("Fetching NASDAQ insider trades for {}", symbol);

        let response =
            self.client.get(&url).send().await.map_err(|e| {
                anyhow!("NASDAQ insider trades request failed for {}: {}", symbol, e)
            })?;

        let status = response.status();
        if !status.is_success() {
            warn!(
                "NASDAQ insider trades API returned status {} for {}",
                status, symbol
            );
            return Ok(vec![]);
        }

        let text = response
            .text()
            .await
            .map_err(|e| anyhow!("Failed to read NASDAQ insider body for {}: {}", symbol, e))?;

        parse_insider_trades_response(&text, symbol)
    }

    /// Apply rate limiting delay
    pub async fn apply_delay(&self) {
        if self.delay_ms > 0 {
            sleep(Duration::from_millis(self.delay_ms)).await;
        }
    }

    // Helper functions for parsing NASDAQ data
    // Kept as associated fns for back-compat; they delegate to module-level
    // free functions that are easier to exercise from tests.

    fn parse_high_low(value: &Option<LabelValue>) -> (Option<f64>, Option<f64>) {
        if let Some(lv) = value {
            if let Some(v) = &lv.value {
                // Format: "$227.07/$225.91" or "237.23/164.075"
                let cleaned = v.replace('$', "");
                let parts: Vec<&str> = cleaned.split('/').collect();
                if parts.len() == 2 {
                    let high = parts[0].trim().parse::<f64>().ok();
                    let low = parts[1].trim().parse::<f64>().ok();
                    return (high, low);
                }
            }
        }
        (None, None)
    }

    fn parse_dollar_value(value: &Option<String>) -> Option<f64> {
        value.as_ref().and_then(|v| {
            v.replace('$', "")
                .replace(',', "")
                .trim()
                .parse::<f64>()
                .ok()
        })
    }

    fn parse_signed_number(value: &Option<String>) -> Option<f64> {
        value
            .as_ref()
            .and_then(|v| v.replace(',', "").trim().parse::<f64>().ok())
    }

    fn parse_number_with_commas(value: &Option<String>) -> Option<f64> {
        value
            .as_ref()
            .and_then(|v| v.replace(',', "").trim().parse::<f64>().ok())
    }

    fn parse_percentage(value: &Option<String>) -> Option<f64> {
        value
            .as_ref()
            .and_then(|v| v.replace('%', "").trim().parse::<f64>().ok())
    }

    fn parse_json_number(value: &Option<serde_json::Value>) -> Option<f64> {
        value.as_ref().and_then(|v| match v {
            serde_json::Value::Number(n) => n.as_f64(),
            serde_json::Value::String(s) => s.parse::<f64>().ok(),
            _ => None,
        })
    }
}

// ============================================================================
// Pure parsing functions (offline-testable)
// ============================================================================

/// Parse a NASDAQ `/api/quote/{sym}/info` response into `NasdaqTechnicals`.
pub(crate) fn parse_technicals_response(text: &str, symbol: &str) -> Result<NasdaqTechnicals> {
    let nasdaq_response: NasdaqTechnicalsResponse = serde_json::from_str(text)
        .map_err(|e| anyhow!("Failed to parse NASDAQ technicals for {}: {}", symbol, e))?;

    let data = nasdaq_response
        .data
        .ok_or_else(|| anyhow!("No data in NASDAQ technicals response for {}", symbol))?;

    let primary = data.primary_data.as_ref();
    let last_sale_price =
        primary.and_then(|p| NasdaqClient::parse_dollar_value(&p.last_sale_price));
    let net_change = primary.and_then(|p| NasdaqClient::parse_signed_number(&p.net_change));
    let percentage_change =
        primary.and_then(|p| NasdaqClient::parse_percentage(&p.percentage_change));

    let summary = data.summary_data;

    let (todays_high, todays_low) = summary
        .as_ref()
        .map(|s| NasdaqClient::parse_high_low(&s.today_high_low))
        .unwrap_or((None, None));
    let (fifty_two_week_high, fifty_two_week_low) = summary
        .as_ref()
        .map(|s| NasdaqClient::parse_high_low(&s.fifty_two_week_high_low))
        .unwrap_or((None, None));

    Ok(NasdaqTechnicals {
        exchange: summary
            .as_ref()
            .and_then(|s| s.exchange.as_ref().and_then(|v| v.value.clone())),
        sector: summary
            .as_ref()
            .and_then(|s| s.sector.as_ref().and_then(|v| v.value.clone())),
        industry: summary
            .as_ref()
            .and_then(|s| s.industry.as_ref().and_then(|v| v.value.clone())),
        one_year_target: summary
            .as_ref()
            .and_then(|s| s.one_yr_target.as_ref())
            .and_then(|v| NasdaqClient::parse_dollar_value(&v.value)),
        todays_high,
        todays_low,
        share_volume: summary
            .as_ref()
            .and_then(|s| s.share_volume.as_ref())
            .and_then(|v| NasdaqClient::parse_number_with_commas(&v.value)),
        average_volume: summary
            .as_ref()
            .and_then(|s| s.average_volume.as_ref())
            .and_then(|v| NasdaqClient::parse_number_with_commas(&v.value)),
        previous_close: summary
            .as_ref()
            .and_then(|s| s.previous_close.as_ref())
            .and_then(|v| NasdaqClient::parse_dollar_value(&v.value)),
        fifty_two_week_high,
        fifty_two_week_low,
        pe_ratio: summary
            .as_ref()
            .and_then(|s| s.pe_ratio.as_ref())
            .and_then(|v| NasdaqClient::parse_json_number(&v.value)),
        forward_pe: summary
            .as_ref()
            .and_then(|s| s.forward_pe.as_ref())
            .and_then(|v| NasdaqClient::parse_dollar_value(&v.value)),
        eps: summary
            .as_ref()
            .and_then(|s| s.eps.as_ref())
            .and_then(|v| NasdaqClient::parse_dollar_value(&v.value)),
        annualized_dividend: summary
            .as_ref()
            .and_then(|s| s.annualized_dividend.as_ref())
            .and_then(|v| NasdaqClient::parse_dollar_value(&v.value)),
        ex_dividend_date: summary
            .as_ref()
            .and_then(|s| s.ex_dividend_date.as_ref().and_then(|v| v.value.clone())),
        dividend_pay_date: summary
            .as_ref()
            .and_then(|s| s.dividend_pay_date.as_ref().and_then(|v| v.value.clone())),
        current_yield: summary
            .as_ref()
            .and_then(|s| s.current_yield.as_ref())
            .and_then(|v| NasdaqClient::parse_percentage(&v.value)),
        last_sale_price,
        net_change,
        percentage_change,
    })
}

/// Parse a NASDAQ news headline response.
pub(crate) fn parse_news_response(text: &str, symbol: &str) -> Result<Vec<NasdaqNewsItem>> {
    let nasdaq_response: NasdaqNewsResponse = serde_json::from_str(text)
        .map_err(|e| anyhow!("Failed to parse NASDAQ news for {}: {}", symbol, e))?;

    let rows = nasdaq_response
        .data
        .and_then(|d| d.rows)
        .unwrap_or_default();

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            Some(NasdaqNewsItem {
                title: row.title?,
                url: format!("https://www.nasdaq.com{}", row.url?),
                publisher: row.publisher,
                created: row.created,
                ago: row.ago,
            })
        })
        .collect())
}

/// Parse a NASDAQ insider trades response.
pub(crate) fn parse_insider_trades_response(text: &str, symbol: &str) -> Result<Vec<InsiderTrade>> {
    let nasdaq_response: InsiderTradesResponse = serde_json::from_str(text).map_err(|e| {
        anyhow!(
            "Failed to parse NASDAQ insider trades for {}: {}",
            symbol,
            e
        )
    })?;

    let rows = nasdaq_response
        .data
        .and_then(|d| d.transaction_table)
        .and_then(|t| t.rows)
        .unwrap_or_default();

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            Some(InsiderTrade {
                insider_name: row.insider?,
                relation: row.relation,
                transaction_type: row
                    .transaction_type
                    .unwrap_or_else(|| "Unknown".to_string()),
                date: row.last_date,
                shares_traded: row
                    .shares_traded
                    .as_ref()
                    .and_then(|s| NasdaqClient::parse_number_with_commas(&Some(s.clone()))),
                price: row
                    .price
                    .as_ref()
                    .and_then(|s| NasdaqClient::parse_dollar_value(&Some(s.clone()))),
                shares_held: row
                    .shares_held
                    .as_ref()
                    .and_then(|s| NasdaqClient::parse_number_with_commas(&Some(s.clone()))),
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- Primitive parsers ---------------------------------------------------

    #[test]
    fn test_parse_high_low_basic() {
        let value = Some(LabelValue {
            label: Some("Today's High/Low".to_string()),
            value: Some("$227.07/$225.91".to_string()),
        });
        let (high, low) = NasdaqClient::parse_high_low(&value);
        assert!((high.unwrap() - 227.07).abs() < 0.01);
        assert!((low.unwrap() - 225.91).abs() < 0.01);
    }

    #[test]
    fn test_parse_high_low_no_dollar_signs() {
        let value = Some(LabelValue {
            label: None,
            value: Some("237.23/164.075".to_string()),
        });
        let (high, low) = NasdaqClient::parse_high_low(&value);
        assert_eq!(high, Some(237.23));
        assert_eq!(low, Some(164.075));
    }

    #[test]
    fn test_parse_high_low_malformed() {
        let value = Some(LabelValue {
            label: None,
            value: Some("N/A".to_string()),
        });
        let (h, l) = NasdaqClient::parse_high_low(&value);
        assert!(h.is_none() && l.is_none());

        let none_val = Some(LabelValue {
            label: None,
            value: None,
        });
        let (h, l) = NasdaqClient::parse_high_low(&none_val);
        assert!(h.is_none() && l.is_none());

        let (h, l) = NasdaqClient::parse_high_low(&None);
        assert!(h.is_none() && l.is_none());
    }

    #[test]
    fn test_parse_dollar_value() {
        assert_eq!(
            NasdaqClient::parse_dollar_value(&Some("$226.51".to_string())),
            Some(226.51)
        );
        assert_eq!(
            NasdaqClient::parse_dollar_value(&Some("$1,234.56".to_string())),
            Some(1234.56)
        );
        assert_eq!(
            NasdaqClient::parse_dollar_value(&Some("  $0.00 ".to_string())),
            Some(0.0)
        );
        assert_eq!(
            NasdaqClient::parse_dollar_value(&Some("N/A".to_string())),
            None
        );
        assert_eq!(
            NasdaqClient::parse_dollar_value(&Some("--".to_string())),
            None
        );
        assert_eq!(
            NasdaqClient::parse_dollar_value(&Some("".to_string())),
            None
        );
        assert_eq!(NasdaqClient::parse_dollar_value(&None), None);
    }

    #[test]
    fn test_parse_number_with_commas() {
        assert_eq!(
            NasdaqClient::parse_number_with_commas(&Some("67,622,607".to_string())),
            Some(67_622_607.0)
        );
        assert_eq!(
            NasdaqClient::parse_number_with_commas(&Some("1000".to_string())),
            Some(1000.0)
        );
        assert_eq!(
            NasdaqClient::parse_number_with_commas(&Some("N/A".to_string())),
            None
        );
        assert_eq!(
            NasdaqClient::parse_number_with_commas(&Some("".to_string())),
            None
        );
    }

    #[test]
    fn test_parse_percentage() {
        assert_eq!(
            NasdaqClient::parse_percentage(&Some("0.44%".to_string())),
            Some(0.44)
        );
        assert_eq!(
            NasdaqClient::parse_percentage(&Some("-6.30%".to_string())),
            Some(-6.30)
        );
        assert_eq!(
            NasdaqClient::parse_percentage(&Some("  12.5%  ".to_string())),
            Some(12.5)
        );
        assert_eq!(
            NasdaqClient::parse_percentage(&Some("N/A".to_string())),
            None
        );
        assert_eq!(
            NasdaqClient::parse_percentage(&Some("--".to_string())),
            None
        );
        assert_eq!(NasdaqClient::parse_percentage(&None), None);
    }

    #[test]
    fn test_parse_signed_number() {
        assert_eq!(
            NasdaqClient::parse_signed_number(&Some("-0.23".to_string())),
            Some(-0.23)
        );
        assert_eq!(
            NasdaqClient::parse_signed_number(&Some("1.45".to_string())),
            Some(1.45)
        );
        assert_eq!(
            NasdaqClient::parse_signed_number(&Some("-1,234.56".to_string())),
            Some(-1234.56)
        );
        assert_eq!(
            NasdaqClient::parse_signed_number(&Some("N/A".to_string())),
            None
        );
        assert_eq!(NasdaqClient::parse_signed_number(&None), None);
    }

    #[test]
    fn test_parse_json_number_variants() {
        assert_eq!(
            NasdaqClient::parse_json_number(&Some(serde_json::json!(12.5))),
            Some(12.5)
        );
        assert_eq!(
            NasdaqClient::parse_json_number(&Some(serde_json::json!("33.25"))),
            Some(33.25)
        );
        assert_eq!(
            NasdaqClient::parse_json_number(&Some(serde_json::json!("N/A"))),
            None
        );
        assert_eq!(
            NasdaqClient::parse_json_number(&Some(serde_json::json!(null))),
            None
        );
        assert_eq!(NasdaqClient::parse_json_number(&None), None);
    }

    // ---- parse_technicals_response ------------------------------------------

    fn technicals_fixture_common_stock() -> &'static str {
        r#"{
            "data": {
                "symbol": "AAPL",
                "primaryData": {
                    "lastSalePrice": "$226.51",
                    "netChange": "+1.45",
                    "percentageChange": "0.64%"
                },
                "summaryData": {
                    "Exchange":           {"label": "Exchange",          "value": "NASDAQ-GS"},
                    "Sector":             {"label": "Sector",            "value": "Technology"},
                    "Industry":           {"label": "Industry",          "value": "Computer Hardware"},
                    "OneYrTarget":        {"label": "1 Yr Target",       "value": "$250.00"},
                    "TodayHighLow":       {"label": "Today's High/Low",  "value": "$227.07/$225.91"},
                    "ShareVolume":        {"label": "Share Volume",      "value": "67,622,607"},
                    "AverageVolume":      {"label": "Average Volume",    "value": "55,000,000"},
                    "PreviousClose":      {"label": "Previous Close",    "value": "$225.06"},
                    "FiftTwoWeekHighLow": {"label": "52 Week High/Low",  "value": "$237.23/$164.08"},
                    "MarketCap":          {"label": "Market Cap",        "value": "3,400,000,000,000"},
                    "PERatio":            {"label": "P/E Ratio",         "value": 30.5},
                    "ForwardPE1Yr":       {"label": "Forward P/E",       "value": "$28.00"},
                    "EarningsPerShare":   {"label": "EPS",               "value": "$6.50"},
                    "AnnualizedDividend": {"label": "Annualized Div",    "value": "$0.96"},
                    "ExDividendDate":     {"label": "Ex Div Date",       "value": "2024-11-08"},
                    "DividendPaymentDate":{"label": "Div Pay Date",      "value": "2024-11-14"},
                    "Yield":              {"label": "Yield",             "value": "0.44%"}
                }
            },
            "status": {"rCode": 200}
        }"#
    }

    #[test]
    fn test_parse_technicals_common_stock() {
        let t = parse_technicals_response(technicals_fixture_common_stock(), "AAPL").unwrap();
        assert_eq!(t.last_sale_price, Some(226.51));
        assert_eq!(t.net_change, Some(1.45));
        assert_eq!(t.percentage_change, Some(0.64));
        assert_eq!(t.sector.as_deref(), Some("Technology"));
        assert_eq!(t.one_year_target, Some(250.0));
        assert_eq!(t.todays_high, Some(227.07));
        assert_eq!(t.todays_low, Some(225.91));
        assert_eq!(t.share_volume, Some(67_622_607.0));
        assert_eq!(t.fifty_two_week_high, Some(237.23));
        assert_eq!(t.fifty_two_week_low, Some(164.08));
        assert_eq!(t.pe_ratio, Some(30.5));
        assert_eq!(t.eps, Some(6.5));
        assert_eq!(t.current_yield, Some(0.44));
    }

    #[test]
    fn test_parse_technicals_primary_data_without_summary_data() {
        let json = r#"{
            "data": {
                "symbol": "INTC",
                "companyName": "Intel Corporation Common Stock",
                "primaryData": {
                    "lastSalePrice": "$82.54",
                    "netChange": "+15.76",
                    "percentageChange": "+23.60%"
                }
            },
            "status": {"rCode": 200}
        }"#;

        let t = parse_technicals_response(json, "INTC").unwrap();

        assert_eq!(t.last_sale_price, Some(82.54));
        assert_eq!(t.net_change, Some(15.76));
        assert_eq!(t.percentage_change, Some(23.60));
        assert!(t.sector.is_none());
    }

    #[test]
    fn test_parse_technicals_warrant_no_summary_data() {
        // Warrants often lack `summaryData`. Must not crash the parser —
        // should return `Ok` with mostly-None fields plus primaryData.
        let json = r#"{
            "data": {
                "symbol": "AAPL.WS",
                "primaryData": {
                    "lastSalePrice": "$0.15",
                    "netChange": "0.00",
                    "percentageChange": "0.00%"
                },
                "summaryData": null
            },
            "status": {"rCode": 200}
        }"#;
        let t = parse_technicals_response(json, "AAPL.WS").unwrap();
        assert_eq!(t.last_sale_price, Some(0.15));
        assert!(t.sector.is_none());
        assert!(t.one_year_target.is_none());
        assert!(t.todays_high.is_none());
        assert!(t.pe_ratio.is_none());
    }

    #[test]
    fn test_parse_technicals_na_values() {
        // Many small-cap stocks have "N/A" for P/E, yield, etc.
        let json = r#"{
            "data": {
                "symbol": "TINY",
                "primaryData": {
                    "lastSalePrice": "$1.23",
                    "netChange": "0.01",
                    "percentageChange": "0.82%"
                },
                "summaryData": {
                    "PERatio":  {"label": "P/E Ratio",  "value": "N/A"},
                    "Yield":    {"label": "Yield",      "value": "N/A"},
                    "EarningsPerShare": {"label": "EPS", "value": "N/A"},
                    "OneYrTarget": {"label": "Target", "value": ""}
                }
            }
        }"#;
        let t = parse_technicals_response(json, "TINY").unwrap();
        assert!(t.pe_ratio.is_none());
        assert!(t.current_yield.is_none());
        assert!(t.eps.is_none());
        assert!(t.one_year_target.is_none());
    }

    #[test]
    fn test_parse_technicals_no_data() {
        let json = r#"{"data": null, "status": {"rCode": 400}}"#;
        let err = parse_technicals_response(json, "ZZZ").unwrap_err();
        assert!(err.to_string().contains("No data"));
    }

    #[test]
    fn test_parse_technicals_invalid_json() {
        let err = parse_technicals_response("not json", "AAPL").unwrap_err();
        assert!(err.to_string().contains("Failed to parse"));
    }

    // ---- parse_news_response ------------------------------------------------

    #[test]
    fn test_parse_news_response_rows() {
        let json = r#"{
            "data": {
                "rows": [
                    {
                        "title": "Apple beats earnings",
                        "url": "/articles/apple-beats-earnings",
                        "publisher": "Reuters",
                        "created": "2024-01-01",
                        "ago": "2 hours ago"
                    },
                    {
                        "title": null,
                        "url": "/articles/missing-title",
                        "publisher": "Bloomberg"
                    },
                    {
                        "title": "Has title but no url",
                        "url": null
                    }
                ]
            }
        }"#;
        let news = parse_news_response(json, "AAPL").unwrap();
        assert_eq!(news.len(), 1, "rows missing title or url must be dropped");
        assert_eq!(news[0].title, "Apple beats earnings");
        assert!(news[0].url.starts_with("https://www.nasdaq.com"));
        assert_eq!(news[0].publisher.as_deref(), Some("Reuters"));
    }

    #[test]
    fn test_parse_news_response_empty() {
        let empty_rows = r#"{"data": {"rows": []}}"#;
        assert!(parse_news_response(empty_rows, "AAPL").unwrap().is_empty());

        let no_rows = r#"{"data": {}}"#;
        assert!(parse_news_response(no_rows, "AAPL").unwrap().is_empty());

        let no_data = r#"{"data": null}"#;
        assert!(parse_news_response(no_data, "AAPL").unwrap().is_empty());
    }

    // ---- parse_insider_trades_response --------------------------------------

    #[test]
    fn test_parse_insider_trades_rows() {
        let json = r#"{
            "data": {
                "transactionTable": {
                    "rows": [
                        {
                            "insider": "TIM COOK",
                            "relation": "Chief Executive Officer",
                            "transactionType": "Sale",
                            "lastDate": "11/01/2024",
                            "sharesTraded": "50,000",
                            "price": "$226.51",
                            "sharesHeld": "3,280,994"
                        },
                        {
                            "insider": null,
                            "relation": "Director"
                        }
                    ]
                }
            }
        }"#;
        let trades = parse_insider_trades_response(json, "AAPL").unwrap();
        assert_eq!(trades.len(), 1);
        assert_eq!(trades[0].insider_name, "TIM COOK");
        assert_eq!(trades[0].shares_traded, Some(50_000.0));
        assert_eq!(trades[0].price, Some(226.51));
        assert_eq!(trades[0].shares_held, Some(3_280_994.0));
    }

    #[test]
    fn test_parse_insider_trades_missing_type_defaults_unknown() {
        let json = r#"{
            "data": {
                "transactionTable": {
                    "rows": [
                        {"insider": "SOMEONE"}
                    ]
                }
            }
        }"#;
        let trades = parse_insider_trades_response(json, "X").unwrap();
        assert_eq!(trades.len(), 1);
        assert_eq!(trades[0].transaction_type, "Unknown");
        assert!(trades[0].shares_traded.is_none());
        assert!(trades[0].price.is_none());
    }

    #[test]
    fn test_parse_insider_trades_missing_tables() {
        let no_table = r#"{"data": {}}"#;
        assert!(parse_insider_trades_response(no_table, "X")
            .unwrap()
            .is_empty());

        let no_data = r#"{"data": null}"#;
        assert!(parse_insider_trades_response(no_data, "X")
            .unwrap()
            .is_empty());

        let empty_rows = r#"{"data": {"transactionTable": {"rows": []}}}"#;
        assert!(parse_insider_trades_response(empty_rows, "X")
            .unwrap()
            .is_empty());
    }
}
