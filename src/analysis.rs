use crate::{
    cache::CacheLayer,
    db::MongoDB,
    indicators::TechnicalIndicators,
    models::{AnalysisProgress, NasdaqResponse, StockAnalysis},
    yahoo::YahooFinanceClient,
};
use chrono::Utc;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration};
use tracing::{error, info, warn};

pub struct AnalysisEngine {
    db: MongoDB,
    yahoo_client: YahooFinanceClient,
    http_client: reqwest::Client,
    cache: CacheLayer,
    progress: Arc<RwLock<AnalysisProgress>>,
    interval_secs: u64,
    cached_symbols: Arc<RwLock<Vec<(String, Option<f64>)>>>,
}

impl AnalysisEngine {
    pub fn new(
        db: MongoDB,
        cache: CacheLayer,
        interval_secs: u64,
    ) -> Self {
        let progress = Arc::new(RwLock::new(AnalysisProgress {
            total_stocks: 0,
            analyzed: 0,
            current_symbol: None,
            cycle_start: Utc::now(),
            errors: 0,
        }));

        let http_client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        AnalysisEngine {
            db,
            yahoo_client: YahooFinanceClient::new(),
            http_client,
            cache,
            progress,
            interval_secs,
            cached_symbols: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn get_progress(&self) -> Arc<RwLock<AnalysisProgress>> {
        Arc::clone(&self.progress)
    }

    pub async fn start_continuous_analysis(&self) {
        info!("Starting continuous analysis engine...");
        
        loop {
            info!("Beginning new analysis cycle");
            
            if let Err(e) = self.run_analysis_cycle().await {
                error!("Analysis cycle error: {}", e);
            }

            info!(
                "Analysis cycle complete. Waiting {} seconds before next cycle",
                self.interval_secs
            );
            sleep(Duration::from_secs(self.interval_secs)).await;
        }
    }

    async fn run_analysis_cycle(&self) -> anyhow::Result<()> {
        // Get list of stocks from NASDAQ API
        let symbols = self.get_stock_symbols().await;
        
        let mut progress = self.progress.write().await;
        progress.total_stocks = symbols.len();
        progress.analyzed = 0;
        progress.cycle_start = Utc::now();
        progress.errors = 0;
        drop(progress);

        info!("Analyzing {} stocks", symbols.len());

        for (idx, (symbol, market_cap)) in symbols.iter().enumerate() {
            // Update progress
            {
                let mut progress = self.progress.write().await;
                progress.current_symbol = Some(symbol.clone());
                progress.analyzed = idx;
            }

            // Analyze stock with rate limiting
            match self.analyze_stock(symbol, *market_cap).await {
                Ok(analysis) => {
                    // Save to database
                    if let Err(e) = self.db.save_analysis(&analysis).await {
                        error!("Failed to save analysis for {}: {}", symbol, e);
                        let mut progress = self.progress.write().await;
                        progress.errors += 1;
                    } else {
                        // Update cache
                        self.cache.set_stock(symbol.clone(), analysis).await;
                    }
                }
                Err(e) => {
                    warn!("Failed to analyze {}: {}", symbol, e);
                    let mut progress = self.progress.write().await;
                    progress.errors += 1;
                }
            }

            // Rate limiting: wait 4 seconds between requests to avoid 429 errors
            sleep(Duration::from_millis(4000)).await;
        }

        // Invalidate list caches after cycle
        self.cache.invalidate_all_lists().await;

        let mut progress = self.progress.write().await;
        progress.analyzed = symbols.len();
        progress.current_symbol = None;

        info!(
            "Cycle complete. Analyzed {} stocks with {} errors",
            symbols.len(),
            progress.errors
        );

        Ok(())
    }

    async fn analyze_stock(&self, symbol: &str, market_cap: Option<f64>) -> anyhow::Result<StockAnalysis> {
        // Fetch historical data (90 days for technical indicators)
        let historical_prices = self
            .yahoo_client
            .get_historical_prices(symbol, 90)
            .await?;

        // Calculate technical indicators
        let rsi = TechnicalIndicators::calculate_rsi(&historical_prices, 14);
        let sma_20 = TechnicalIndicators::calculate_sma(&historical_prices, 20);
        let sma_50 = TechnicalIndicators::calculate_sma(&historical_prices, 50);
        let macd = TechnicalIndicators::calculate_macd(&historical_prices);

        let latest_price = historical_prices.last().unwrap();

        let analysis = StockAnalysis {
            id: None,
            symbol: symbol.to_string(),
            price: latest_price.close,
            rsi,
            sma_20,
            sma_50,
            macd,
            volume: Some(latest_price.volume),
            market_cap,
            sector: None, // Not provided by NASDAQ API
            is_oversold: TechnicalIndicators::is_oversold(rsi),
            is_overbought: TechnicalIndicators::is_overbought(rsi),
            analyzed_at: Utc::now(),
        };

        Ok(analysis)
    }

    async fn get_stock_symbols(&self) -> Vec<(String, Option<f64>)> {
        // Try to fetch from NASDAQ API
        match self.fetch_nasdaq_stocks().await {
            Ok(stocks) => {
                info!("Fetched {} stocks from NASDAQ API", stocks.len());
                // Update cache
                let mut cached = self.cached_symbols.write().await;
                *cached = stocks.clone();
                stocks
            }
            Err(e) => {
                warn!("Failed to fetch NASDAQ stocks: {}. Using cached/fallback list.", e);
                // Use cached symbols if available
                let cached = self.cached_symbols.read().await;
                if !cached.is_empty() {
                    info!("Using {} cached stocks", cached.len());
                    cached.clone()
                } else {
                    // Fallback to hardcoded popular stocks
                    info!("Using fallback stock list");
                    vec![
                        "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B",
                        "JPM", "JNJ", "V", "PG", "UNH", "HD", "MA", "DIS", "PYPL", "NFLX",
                        "ADBE", "CRM", "CSCO", "INTC", "PFE", "VZ", "KO", "NKE", "MRK",
                        "T", "PEP", "ABT", "TMO", "COST", "AVGO", "ACN", "DHR", "TXN",
                        "NEE", "LLY", "MDT", "ORCL", "WMT", "HON", "PM", "UNP", "BMY",
                        "QCOM", "C", "LOW", "UPS", "RTX", "BA", "AMGN", "IBM", "SBUX",
                        "CAT", "GE", "AMD", "GILD", "CVS", "MMM", "MO", "USB", "TGT",
                    ]
                    .iter()
                    .map(|s| (s.to_string(), None))
                    .collect()
                }
            }
        }
    }

    async fn fetch_nasdaq_stocks(&self) -> anyhow::Result<Vec<(String, Option<f64>)>> {
        let url = "https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=0";
        
        let response = self.http_client
            .get(url)
            .send()
            .await?
            .error_for_status()?;

        let nasdaq_response: NasdaqResponse = response.json().await?;
        
        let mut stocks: Vec<(String, Option<f64>)> = nasdaq_response
            .data
            .table
            .rows
            .into_iter()
            .filter_map(|stock| {
                // Parse market cap (format: "1,234,567,890" or "0")
                let market_cap = Self::parse_market_cap(&stock.market_cap);
                
                // Only include stocks with valid symbols and market cap
                if !stock.symbol.is_empty() && market_cap.is_some() {
                    Some((stock.symbol, market_cap))
                } else {
                    None
                }
            })
            .collect();

        // Sort by market cap descending
        stocks.sort_by(|a, b| {
            let cap_a = a.1.unwrap_or(0.0);
            let cap_b = b.1.unwrap_or(0.0);
            cap_b.partial_cmp(&cap_a).unwrap_or(std::cmp::Ordering::Equal)
        });
        
        Ok(stocks)
    }

    fn parse_market_cap(market_cap_str: &str) -> Option<f64> {
        // Remove commas and parse
        let cleaned = market_cap_str.replace(',', "");
        cleaned.parse::<f64>().ok()
    }
}
