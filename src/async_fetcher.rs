//! Asynchronous batch fetcher for stock data with configurable concurrency.
//!
//! This module provides concurrent fetching of stock data from Yahoo Finance
//! with semaphore-based rate limiting and progress tracking.

use crate::models::HistoricalPrice;
use crate::yahoo::YahooFinanceClient;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, Semaphore};
use tokio::time::sleep;
use tracing::{debug, info, warn};

/// Result of fetching a single stock
#[derive(Debug)]
pub enum FetchResult {
    /// Successfully fetched a stock with its price data
    Success {
        symbol: String,
        prices: Vec<HistoricalPrice>,
    },
    /// Failed to fetch a stock
    Failed {
        symbol: String,
        error: String,
        is_rate_limited: bool,
    },
}

/// Result of a batch fetch operation
#[derive(Debug)]
pub struct BatchFetchResult {
    /// Successfully fetched symbols with their price data
    pub successful: Vec<(String, Vec<HistoricalPrice>)>,
    /// Failed symbols with error messages
    pub failed: Vec<(String, String)>,
    /// Total time taken for the batch
    pub total_time: Duration,
    /// Average time per request
    pub avg_time_per_request: Duration,
    /// Number of rate limit (429) errors encountered
    pub rate_limit_errors: usize,
}

impl BatchFetchResult {
    /// Calculate success rate as a percentage
    pub fn success_rate(&self) -> f64 {
        let total = self.successful.len() + self.failed.len();
        if total == 0 {
            return 0.0;
        }
        (self.successful.len() as f64 / total as f64) * 100.0
    }

    /// Calculate rate limit error rate as a percentage
    pub fn rate_limit_rate(&self) -> f64 {
        let total = self.successful.len() + self.failed.len();
        if total == 0 {
            return 0.0;
        }
        (self.rate_limit_errors as f64 / total as f64) * 100.0
    }
}

/// Configuration for the async fetcher
#[derive(Debug, Clone)]
pub struct FetcherConfig {
    /// Maximum number of concurrent requests
    pub concurrency: usize,
    /// Delay between starting each request (in milliseconds)
    pub delay_between_requests_ms: u64,
    /// Number of days of historical data to fetch
    pub days: i64,
}

impl Default for FetcherConfig {
    fn default() -> Self {
        FetcherConfig {
            concurrency: 5,
            delay_between_requests_ms: 500,
            days: 30,
        }
    }
}

/// Asynchronous stock fetcher with configurable concurrency
pub struct AsyncStockFetcher {
    client: Arc<YahooFinanceClient>,
    config: FetcherConfig,
}

impl AsyncStockFetcher {
    /// Create a new async fetcher with the given configuration
    pub fn new(config: FetcherConfig) -> Self {
        AsyncStockFetcher {
            client: Arc::new(YahooFinanceClient::new()),
            config,
        }
    }

    /// Create a new fetcher with default configuration
    pub fn with_defaults() -> Self {
        Self::new(FetcherConfig::default())
    }

    /// Create a fetcher with custom concurrency
    pub fn with_concurrency(concurrency: usize) -> Self {
        Self::new(FetcherConfig {
            concurrency,
            ..Default::default()
        })
    }

    /// Fetch historical prices for multiple symbols with streaming results.
    /// Returns a channel receiver that yields results as they complete.
    /// Also returns a handle to wait for completion.
    pub fn fetch_batch_streaming(
        &self,
        symbols: Vec<String>,
    ) -> (mpsc::Receiver<FetchResult>, tokio::task::JoinHandle<()>) {
        let (tx, rx) = mpsc::channel(100); // Buffer up to 100 results
        let client = Arc::clone(&self.client);
        let config = self.config.clone();
        let total = symbols.len();

        let handle = tokio::spawn(async move {
            let semaphore = Arc::new(Semaphore::new(config.concurrency));
            let completed = Arc::new(AtomicUsize::new(0));
            let mut handles = Vec::new();

            for (idx, symbol) in symbols.into_iter().enumerate() {
                let permit = semaphore.clone().acquire_owned().await.unwrap();
                let client = Arc::clone(&client);
                let tx = tx.clone();
                let completed = Arc::clone(&completed);
                let days = config.days;
                let delay_ms = config.delay_between_requests_ms;

                let handle = tokio::spawn(async move {
                    // Stagger requests slightly based on index
                    if idx > 0 && delay_ms > 0 {
                        sleep(Duration::from_millis(delay_ms * (idx as u64 % 3))).await;
                    }

                    let result = client.get_historical_prices(&symbol, days).await;

                    // Release permit immediately after request completes
                    drop(permit);

                    let fetch_result = match result {
                        Ok(prices) => {
                            debug!("✅ Fetched {} prices for {}", prices.len(), symbol);
                            FetchResult::Success { symbol, prices }
                        }
                        Err(e) => {
                            let error_msg = e.to_string();
                            let is_rate_limited = error_msg.contains("429") || error_msg.contains("Rate limited");
                            if is_rate_limited {
                                warn!("⚠️  Rate limited: {}", symbol);
                            } else {
                                warn!("❌ Failed {}: {}", symbol, error_msg);
                            }
                            FetchResult::Failed {
                                symbol,
                                error: error_msg,
                                is_rate_limited,
                            }
                        }
                    };

                    // Send result through channel (ignore send errors if receiver dropped)
                    let _ = tx.send(fetch_result).await;

                    let done = completed.fetch_add(1, Ordering::SeqCst) + 1;
                    if done % 50 == 0 || done == total {
                        info!("Fetch progress: {}/{} completed", done, total);
                    }
                });

                handles.push(handle);

                // Small delay between spawning tasks
                if delay_ms > 0 {
                    sleep(Duration::from_millis(delay_ms)).await;
                }
            }

            // Wait for all tasks to complete
            for handle in handles {
                let _ = handle.await;
            }
        });

        (rx, handle)
    }

    /// Fetch historical prices for multiple symbols concurrently (blocking until all complete)
    pub async fn fetch_batch(&self, symbols: Vec<String>) -> BatchFetchResult {
        let start_time = Instant::now();
        let semaphore = Arc::new(Semaphore::new(self.config.concurrency));
        let successful = Arc::new(tokio::sync::Mutex::new(Vec::new()));
        let failed = Arc::new(tokio::sync::Mutex::new(Vec::new()));
        let rate_limit_errors = Arc::new(AtomicUsize::new(0));
        let completed = Arc::new(AtomicUsize::new(0));
        let total = symbols.len();

        let mut handles = Vec::new();

        for (idx, symbol) in symbols.into_iter().enumerate() {
            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let client = Arc::clone(&self.client);
            let successful = Arc::clone(&successful);
            let failed = Arc::clone(&failed);
            let rate_limit_errors = Arc::clone(&rate_limit_errors);
            let completed = Arc::clone(&completed);
            let days = self.config.days;
            let delay_ms = self.config.delay_between_requests_ms;

            let handle = tokio::spawn(async move {
                // Stagger requests slightly based on index
                if idx > 0 && delay_ms > 0 {
                    sleep(Duration::from_millis(delay_ms * (idx as u64 % 3))).await;
                }

                let result = client.get_historical_prices(&symbol, days).await;

                // Release permit immediately after request completes
                drop(permit);

                match result {
                    Ok(prices) => {
                        debug!("✅ Fetched {} prices for {}", prices.len(), symbol);
                        successful.lock().await.push((symbol, prices));
                    }
                    Err(e) => {
                        let error_msg = e.to_string();
                        if error_msg.contains("429") || error_msg.contains("Rate limited") {
                            rate_limit_errors.fetch_add(1, Ordering::SeqCst);
                            warn!("⚠️  Rate limited: {}", symbol);
                        } else {
                            warn!("❌ Failed {}: {}", symbol, error_msg);
                        }
                        failed.lock().await.push((symbol, error_msg));
                    }
                }

                let done = completed.fetch_add(1, Ordering::SeqCst) + 1;
                if done % 10 == 0 || done == total {
                    info!("Progress: {}/{} completed", done, total);
                }
            });

            handles.push(handle);

            // Small delay between spawning tasks
            if delay_ms > 0 {
                sleep(Duration::from_millis(delay_ms)).await;
            }
        }

        // Wait for all tasks to complete
        for handle in handles {
            let _ = handle.await;
        }

        let total_time = start_time.elapsed();
        
        // Extract results from the mutexes
        let successful = successful.lock().await.clone();
        let failed = failed.lock().await.clone();

        let total_requests = successful.len() + failed.len();
        let avg_time_per_request = if total_requests > 0 {
            total_time / total_requests as u32
        } else {
            Duration::ZERO
        };

        BatchFetchResult {
            successful,
            failed,
            total_time,
            avg_time_per_request,
            rate_limit_errors: rate_limit_errors.load(Ordering::SeqCst),
        }
    }

    /// Run a quick test to check rate limit behavior
    pub async fn test_rate_limit(&self, num_requests: usize) -> BatchFetchResult {
        // Use a small set of known good symbols for testing
        let test_symbols: Vec<String> = vec![
            "AAPL", "MSFT", "GOOGL", "AMZN", "META",
            "NVDA", "TSLA", "JPM", "V", "JNJ",
            "WMT", "PG", "MA", "HD", "DIS",
            "PYPL", "NFLX", "ADBE", "CRM", "INTC",
        ]
        .into_iter()
        .take(num_requests)
        .map(String::from)
        .collect();

        self.fetch_batch(test_symbols).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fetcher_config_default() {
        let config = FetcherConfig::default();
        assert_eq!(config.concurrency, 5);
        assert_eq!(config.delay_between_requests_ms, 500);
        assert_eq!(config.days, 30);
    }

    #[tokio::test]
    async fn test_batch_result_success_rate() {
        let result = BatchFetchResult {
            successful: vec![("AAPL".to_string(), vec![])],
            failed: vec![("MSFT".to_string(), "error".to_string())],
            total_time: Duration::from_secs(1),
            avg_time_per_request: Duration::from_millis(500),
            rate_limit_errors: 1,
        };

        assert!((result.success_rate() - 50.0).abs() < 0.01);
        assert!((result.rate_limit_rate() - 50.0).abs() < 0.01);
    }
}
