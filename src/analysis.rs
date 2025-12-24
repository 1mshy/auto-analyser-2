use crate::{
    cache::CacheLayer,
    db::MongoDB,
    indicators::TechnicalIndicators,
    models::{AnalysisProgress, NasdaqResponse, StockAnalysis},
    nasdaq::NasdaqClient,
    yahoo::YahooFinanceClient,
};
use chrono::Utc;
use rand::Rng;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration};
use tracing::{debug, error, info, warn};

pub struct AnalysisEngine {
    db: MongoDB,
    yahoo_client: YahooFinanceClient,
    nasdaq_client: NasdaqClient,
    http_client: reqwest::Client,
    cache: CacheLayer,
    progress: Arc<RwLock<AnalysisProgress>>,
    interval_secs: u64,
    yahoo_delay_ms: u64,
    nasdaq_delay_ms: u64,
    cached_symbols: Arc<RwLock<Vec<(String, Option<f64>)>>>,
}

impl AnalysisEngine {
    pub fn new(
        db: MongoDB,
        cache: CacheLayer,
        interval_secs: u64,
        yahoo_delay_ms: u64,
        nasdaq_delay_ms: u64,
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

        let nasdaq_client = NasdaqClient::new(nasdaq_delay_ms);

        AnalysisEngine {
            db,
            yahoo_client: YahooFinanceClient::new(),
            nasdaq_client,
            http_client,
            cache,
            progress,
            interval_secs,
            yahoo_delay_ms,
            nasdaq_delay_ms,
            cached_symbols: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Load existing data from MongoDB and populate cache
    pub async fn load_existing_data(&self) -> anyhow::Result<usize> {
        info!("Loading existing data from MongoDB...");
        
        match self.db.get_all_analyses().await {
            Ok(analyses) => {
                let count = analyses.len();
                if count > 0 {
                    info!("Found {} existing analyses in database", count);
                    
                    // Populate cache
                    for analysis in analyses {
                        self.cache.set_stock(analysis.symbol.clone(), analysis).await;
                    }
                    
                    info!("✅ Loaded {} analyses into cache", count);
                } else {
                    info!("No existing analyses found in database");
                }
                Ok(count)
            }
            Err(e) => {
                warn!("Failed to load existing data: {}. Starting fresh.", e);
                Ok(0)
            }
        }
    }

    pub fn get_progress(&self) -> Arc<RwLock<AnalysisProgress>> {
        Arc::clone(&self.progress)
    }

    pub async fn start_continuous_analysis(&self) {
        info!("Starting continuous analysis engine...");
        info!("Per-ticker caching enabled: {}s threshold", self.interval_secs);
        info!("Yahoo Finance request delay: {}ms (+ 0-2s jitter)", self.yahoo_delay_ms);
        
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
        let mut skipped = 0;

        for (idx, (symbol, market_cap)) in symbols.iter().enumerate() {
            // Update progress
            {
                let mut progress = self.progress.write().await;
                progress.current_symbol = Some(symbol.clone());
                progress.analyzed = idx;
            }

            // Check if this ticker was analyzed recently
            let should_analyze = match self.db.get_analysis_by_symbol(symbol).await {
                Ok(Some(existing)) => {
                    let now = Utc::now();
                    let elapsed = now.signed_duration_since(existing.analyzed_at).num_seconds() as u64;
                    
                    if elapsed < self.interval_secs {
                        info!("⏭️  Skipping {} - analyzed {}s ago (threshold: {}s)", 
                            symbol, elapsed, self.interval_secs);
                        skipped += 1;
                        false
                    } else {
                        info!("🔄 Re-analyzing {} - last analyzed {}s ago", symbol, elapsed);
                        true
                    }
                }
                Ok(None) => {
                    info!("🆕 Analyzing new ticker: {}", symbol);
                    true
                }
                Err(e) => {
                    warn!("Error checking existing data for {}: {}. Will analyze.", symbol, e);
                    true
                }
            };

            if should_analyze {
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

                // Rate limiting with jitter based on config
                let base_delay = self.yahoo_delay_ms;
                let jitter = rand::thread_rng().gen_range(0..2000); // Add 0-2 seconds jitter
                let _delay_ms = base_delay + jitter;
                // info!("⏱️  Waiting {}ms before next request", delay_ms);
                // info!("Sike doing it rn!")
                // sleep(Duration::from_millis(delay_ms)).await;
            }
        }

        // Invalidate list caches after cycle
        self.cache.invalidate_all_lists().await;

        let mut progress = self.progress.write().await;
        progress.analyzed = symbols.len();
        progress.current_symbol = None;

        info!(
            "Cycle complete. Processed {} stocks ({} analyzed, {} skipped, {} errors)",
            symbols.len(),
            symbols.len() - skipped,
            skipped,
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

        // Fetch NASDAQ technicals (with rate limiting)
        let technicals = match self.nasdaq_client.get_technicals(symbol).await {
            Ok(t) => {
                debug!("Fetched NASDAQ technicals for {}", symbol);
                Some(t)
            }
            Err(e) => {
                debug!("Could not fetch NASDAQ technicals for {}: {}", symbol, e);
                None
            }
        };

        // Apply NASDAQ delay
        self.nasdaq_client.apply_delay().await;

        // Fetch NASDAQ news (check cache first)
        let news = if let Some(cached_news) = self.cache.get_news(symbol).await {
            debug!("Using cached news for {}", symbol);
            Some(cached_news)
        } else {
            match self.nasdaq_client.get_news(symbol, 10).await {
                Ok(n) if !n.is_empty() => {
                    debug!("Fetched {} news items for {}", n.len(), symbol);
                    // Cache the news
                    self.cache.set_news(symbol.to_string(), n.clone()).await;
                    Some(n)
                }
                Ok(_) => None,
                Err(e) => {
                    debug!("Could not fetch news for {}: {}", symbol, e);
                    None
                }
            }
        };

        // Apply NASDAQ delay again after news fetch
        self.nasdaq_client.apply_delay().await;

        // Get sector from technicals if available
        let sector = technicals.as_ref().and_then(|t| t.sector.clone());

        // Calculate price change - prefer NASDAQ primaryData (most accurate),
        // then calculate from previous_close, then fall back to historical data
        let (price_change, price_change_percent) = if let Some(ref tech) = technicals {
            // First priority: Use NASDAQ primaryData fields (always accurate)
            if let (Some(change), Some(pct)) = (tech.net_change, tech.percentage_change) {
                debug!("Using NASDAQ primaryData for {}: change={}, pct={}", symbol, change, pct);
                (Some(change), Some(pct))
            }
            // Second priority: Calculate from previous_close
            else if let Some(prev_close) = tech.previous_close {
                if prev_close > 0.0 {
                    let change = latest_price.close - prev_close;
                    let change_percent = (change / prev_close) * 100.0;
                    debug!("Calculated from previous_close for {}: change={}, pct={}", symbol, change, change_percent);
                    (Some(change), Some(change_percent))
                } else {
                    (None, None)
                }
            } else {
                (None, None)
            }
        } else {
            // Fallback: calculate from historical data if we have at least 2 days
            // Only use if previous day had trading activity (volume > 0)
            if historical_prices.len() >= 2 {
                let prev_idx = historical_prices.len() - 2;
                let prev = &historical_prices[prev_idx];
                if prev.close > 0.0 && prev.volume > 0.0 {
                    let change = latest_price.close - prev.close;
                    let change_percent = (change / prev.close) * 100.0;
                    debug!("Calculated from historical for {}: change={}, pct={}", symbol, change, change_percent);
                    (Some(change), Some(change_percent))
                } else {
                    // Previous day had no volume - likely stale data
                    warn!("Skipping price change calc for {} - previous day had no volume (stale data)", symbol);
                    (None, None)
                }
            } else {
                (None, None)
            }
        };

        let analysis = StockAnalysis {
            id: None,
            symbol: symbol.to_string(),
            price: latest_price.close,
            price_change,
            price_change_percent,
            rsi,
            sma_20,
            sma_50,
            macd,
            volume: Some(latest_price.volume),
            market_cap,
            sector,
            is_oversold: TechnicalIndicators::is_oversold(rsi),
            is_overbought: TechnicalIndicators::is_overbought(rsi),
            analyzed_at: Utc::now(),
            technicals,
            news,
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
        // Remove dollar signs, commas, and whitespace, then parse
        // Examples: "$1,234,567,890", "1234567890", "$0"
        let cleaned = market_cap_str
            .replace('$', "")
            .replace(',', "")
            .trim()
            .to_string();
        
        if cleaned.is_empty() || cleaned == "0" {
            return None;
        }
        
        cleaned.parse::<f64>().ok()
    }
}
