use crate::models::HistoricalPrice;
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use yahoo_finance_api as yahoo;
use time::{Duration, OffsetDateTime};

pub struct YahooFinanceClient {
    provider: yahoo::YahooConnector,
}

impl YahooFinanceClient {
    pub fn new() -> Self {
        YahooFinanceClient {
            provider: yahoo::YahooConnector::new(),
        }
    }

    pub async fn get_historical_prices(
        &self,
        symbol: &str,
        days: i64,
    ) -> Result<Vec<HistoricalPrice>> {
        let end = OffsetDateTime::now_utc();
        let start = end - Duration::days(days);

        let response = self
            .provider
            .get_quote_history(symbol, start, end)
            .await
            .map_err(|e| anyhow!("Failed to fetch data for {}: {}", symbol, e))?;

        let quotes = response.quotes()
            .map_err(|e| anyhow!("Failed to parse quotes for {}: {}", symbol, e))?;

        let prices: Vec<HistoricalPrice> = quotes
            .iter()
            .map(|q| HistoricalPrice {
                date: DateTime::from_timestamp(q.timestamp as i64, 0)
                    .unwrap_or_else(|| Utc::now()),
                open: q.open,
                high: q.high,
                low: q.low,
                close: q.close,
                volume: q.volume as f64,
            })
            .collect();

        if prices.is_empty() {
            return Err(anyhow!("No historical data available for {}", symbol));
        }

        Ok(prices)
    }

    pub async fn get_latest_quote(&self, symbol: &str) -> Result<(f64, f64)> {
        let response = self
            .provider
            .get_latest_quotes(symbol, "1d")
            .await
            .map_err(|e| anyhow!("Failed to fetch latest quote for {}: {}", symbol, e))?;

        let quote = response
            .last_quote()
            .map_err(|e| anyhow!("Failed to parse latest quote for {}: {}", symbol, e))?;

        Ok((quote.close, quote.volume as f64))
    }
}

impl Default for YahooFinanceClient {
    fn default() -> Self {
        Self::new()
    }
}
