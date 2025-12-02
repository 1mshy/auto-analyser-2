use crate::models::{NasdaqNewsItem, NasdaqTechnicals};
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
    #[serde(rename = "summaryData")]
    summary_data: Option<SummaryData>,
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

        let nasdaq_response: NasdaqTechnicalsResponse = response
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse NASDAQ technicals for {}: {}", symbol, e))?;

        let data = nasdaq_response
            .data
            .ok_or_else(|| anyhow!("No data in NASDAQ technicals response for {}", symbol))?;

        let summary = data
            .summary_data
            .ok_or_else(|| anyhow!("No summary data for {}", symbol))?;

        // Parse high/low from "227.07/225.91" format
        let (todays_high, todays_low) = Self::parse_high_low(&summary.today_high_low);
        let (fifty_two_week_high, fifty_two_week_low) =
            Self::parse_high_low(&summary.fifty_two_week_high_low);

        Ok(NasdaqTechnicals {
            exchange: summary.exchange.and_then(|v| v.value),
            sector: summary.sector.and_then(|v| v.value),
            industry: summary.industry.and_then(|v| v.value),
            one_year_target: summary
                .one_yr_target
                .and_then(|v| Self::parse_dollar_value(&v.value)),
            todays_high,
            todays_low,
            share_volume: summary
                .share_volume
                .and_then(|v| Self::parse_number_with_commas(&v.value)),
            average_volume: summary
                .average_volume
                .and_then(|v| Self::parse_number_with_commas(&v.value)),
            previous_close: summary
                .previous_close
                .and_then(|v| Self::parse_dollar_value(&v.value)),
            fifty_two_week_high,
            fifty_two_week_low,
            pe_ratio: summary.pe_ratio.and_then(|v| Self::parse_json_number(&v.value)),
            forward_pe: summary
                .forward_pe
                .and_then(|v| Self::parse_dollar_value(&v.value)),
            eps: summary.eps.and_then(|v| Self::parse_dollar_value(&v.value)),
            annualized_dividend: summary
                .annualized_dividend
                .and_then(|v| Self::parse_dollar_value(&v.value)),
            ex_dividend_date: summary.ex_dividend_date.and_then(|v| v.value),
            dividend_pay_date: summary.dividend_pay_date.and_then(|v| v.value),
            current_yield: summary
                .current_yield
                .and_then(|v| Self::parse_percentage(&v.value)),
        })
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

        let nasdaq_response: NasdaqNewsResponse = response
            .json()
            .await
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

    /// Apply rate limiting delay
    pub async fn apply_delay(&self) {
        if self.delay_ms > 0 {
            sleep(Duration::from_millis(self.delay_ms)).await;
        }
    }

    // Helper functions for parsing NASDAQ data

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

    fn parse_number_with_commas(value: &Option<String>) -> Option<f64> {
        value.as_ref().and_then(|v| {
            v.replace(',', "").trim().parse::<f64>().ok()
        })
    }

    fn parse_percentage(value: &Option<String>) -> Option<f64> {
        value.as_ref().and_then(|v| {
            v.replace('%', "").trim().parse::<f64>().ok()
        })
    }

    fn parse_json_number(value: &Option<serde_json::Value>) -> Option<f64> {
        value.as_ref().and_then(|v| match v {
            serde_json::Value::Number(n) => n.as_f64(),
            serde_json::Value::String(s) => s.parse::<f64>().ok(),
            _ => None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_high_low() {
        let value = Some(LabelValue {
            label: Some("Today's High/Low".to_string()),
            value: Some("$227.07/$225.91".to_string()),
        });

        let (high, low) = NasdaqClient::parse_high_low(&value);
        assert!((high.unwrap() - 227.07).abs() < 0.01);
        assert!((low.unwrap() - 225.91).abs() < 0.01);
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
    }

    #[test]
    fn test_parse_number_with_commas() {
        assert_eq!(
            NasdaqClient::parse_number_with_commas(&Some("67,622,607".to_string())),
            Some(67622607.0)
        );
    }

    #[test]
    fn test_parse_percentage() {
        assert_eq!(
            NasdaqClient::parse_percentage(&Some("0.44%".to_string())),
            Some(0.44)
        );
    }
}
