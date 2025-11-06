use crate::{
    cache::CacheLayer,
    db::MongoDB,
    indicators::TechnicalIndicators,
    models::{AnalysisProgress, StockAnalysis},
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
    cache: CacheLayer,
    progress: Arc<RwLock<AnalysisProgress>>,
    interval_secs: u64,
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

        AnalysisEngine {
            db,
            yahoo_client: YahooFinanceClient::new(),
            cache,
            progress,
            interval_secs,
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
        // Get list of popular stocks to analyze
        let symbols = self.get_stock_symbols();
        
        let mut progress = self.progress.write().await;
        progress.total_stocks = symbols.len();
        progress.analyzed = 0;
        progress.cycle_start = Utc::now();
        progress.errors = 0;
        drop(progress);

        info!("Analyzing {} stocks", symbols.len());

        for (idx, symbol) in symbols.iter().enumerate() {
            // Update progress
            {
                let mut progress = self.progress.write().await;
                progress.current_symbol = Some(symbol.clone());
                progress.analyzed = idx;
            }

            // Analyze stock with rate limiting
            match self.analyze_stock(symbol).await {
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

    async fn analyze_stock(&self, symbol: &str) -> anyhow::Result<StockAnalysis> {
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
            market_cap: None, // Would need additional API call
            sector: None,     // Would need additional API call
            is_oversold: TechnicalIndicators::is_oversold(rsi),
            is_overbought: TechnicalIndicators::is_overbought(rsi),
            analyzed_at: Utc::now(),
        };

        Ok(analysis)
    }

    fn get_stock_symbols(&self) -> Vec<String> {
        // Popular US stocks for initial implementation
        // In production, this would come from a database or API
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
        .map(|s| s.to_string())
        .collect()
    }
}
