use crate::{
    async_fetcher::{AsyncStockFetcher, FetcherConfig},
    cache::CacheLayer,
    db::MongoDB,
    indicators::TechnicalIndicators,
    models::{AnalysisProgress, HistoricalPrice, NasdaqResponse, StockAnalysis},
    nasdaq::NasdaqClient,
};
use chrono::Utc;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration};
use tracing::{debug, error, info, warn};

pub struct AnalysisEngine {
    db: MongoDB,
    nasdaq_client: NasdaqClient,
    http_client: reqwest::Client,
    cache: CacheLayer,
    progress: Arc<RwLock<AnalysisProgress>>,
    interval_secs: u64,
    yahoo_delay_ms: u64,
    yahoo_concurrency: usize,
    cached_symbols: Arc<RwLock<Vec<(String, Option<f64>)>>>,
    min_market_cap_usd: f64,
    max_abs_price_change_percent: f64,
}

impl AnalysisEngine {
    pub fn new(
        db: MongoDB,
        cache: CacheLayer,
        interval_secs: u64,
        yahoo_delay_ms: u64,
        yahoo_concurrency: usize,
        nasdaq_delay_ms: u64,
        min_market_cap_usd: f64,
        max_abs_price_change_percent: f64,
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
            nasdaq_client,
            http_client,
            cache,
            progress,
            interval_secs,
            yahoo_delay_ms,
            yahoo_concurrency,
            cached_symbols: Arc::new(RwLock::new(Vec::new())),
            min_market_cap_usd,
            max_abs_price_change_percent,
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
        info!("Yahoo Finance: concurrency={}, delay={}ms", self.yahoo_concurrency, self.yahoo_delay_ms);
        
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
        use crate::async_fetcher::FetchResult;
        
        // Get list of stocks from NASDAQ API
        let symbols = self.get_stock_symbols().await;
        
        // Build map of symbol -> market_cap for later use
        let market_cap_map: HashMap<String, Option<f64>> = symbols
            .iter()
            .map(|(s, mc)| (s.clone(), *mc))
            .collect();
        
        // Filter to symbols that need analysis
        let mut symbols_to_analyze: Vec<String> = Vec::new();
        let mut skipped = 0;
        
        for (symbol, _) in &symbols {
            match self.db.get_analysis_by_symbol(symbol).await {
                Ok(Some(existing)) => {
                    let now = Utc::now();
                    let elapsed = now.signed_duration_since(existing.analyzed_at).num_seconds() as u64;
                    
                    if elapsed < self.interval_secs {
                        debug!("⏭️  Skipping {} - analyzed {}s ago", symbol, elapsed);
                        skipped += 1;
                    } else {
                        symbols_to_analyze.push(symbol.clone());
                    }
                }
                Ok(None) => {
                    symbols_to_analyze.push(symbol.clone());
                }
                Err(_) => {
                    symbols_to_analyze.push(symbol.clone());
                }
            }
        }
        
        let total_to_analyze = symbols_to_analyze.len();
        info!("📊 Analyzing {} stocks ({} skipped, already up-to-date)", total_to_analyze, skipped);
        
        // Initialize progress
        {
            let mut progress = self.progress.write().await;
            progress.total_stocks = symbols.len();
            progress.analyzed = skipped;
            progress.cycle_start = Utc::now();
            progress.errors = 0;
        }
        
        if symbols_to_analyze.is_empty() {
            info!("✅ All stocks are up-to-date, nothing to analyze");
            return Ok(());
        }
        
        // Use streaming fetch to process stocks as they complete
        info!("🚀 Fetching and processing stocks (concurrency={}, progressive saves enabled)", self.yahoo_concurrency);
        
        let fetcher = AsyncStockFetcher::new(FetcherConfig {
            concurrency: self.yahoo_concurrency,
            delay_between_requests_ms: self.yahoo_delay_ms,
            days: 90, // 90 days for technical indicators
        });
        
        let (mut rx, fetch_handle) = fetcher.fetch_batch_streaming(symbols_to_analyze.clone());
        
        let mut analyzed_count = 0;
        let mut error_count = 0;
        let mut success_count = 0;
        
        // Process results as they arrive
        while let Some(result) = rx.recv().await {
            match result {
                FetchResult::Success { symbol, prices } => {
                    // Update progress
                    {
                        let mut progress = self.progress.write().await;
                        progress.current_symbol = Some(symbol.clone());
                        progress.analyzed = skipped + analyzed_count;
                    }
                    
                    let market_cap = market_cap_map.get(&symbol).copied().flatten();
                    
                    match self.process_stock_with_prices(&symbol, market_cap, prices).await {
                        Ok(analysis) => {
                            if let Err(e) = self.db.save_analysis(&analysis).await {
                                error!("Failed to save analysis for {}: {}", symbol, e);
                                error_count += 1;
                            } else {
                                self.cache.set_stock(symbol.clone(), analysis).await;
                                success_count += 1;
                            }
                        }
                        Err(e) => {
                            warn!("Failed to process {}: {}", symbol, e);
                            error_count += 1;
                        }
                    }
                    
                    analyzed_count += 1;
                    if analyzed_count % 50 == 0 {
                        info!("📊 Progress: {}/{} processed, {} saved to DB", analyzed_count, total_to_analyze, success_count);
                    }
                }
                FetchResult::Failed { symbol, error, is_rate_limited } => {
                    if is_rate_limited {
                        debug!("Rate limited fetching {}: {}", symbol, error);
                    } else {
                        warn!("Failed to fetch {}: {}", symbol, error);
                    }
                    error_count += 1;
                    analyzed_count += 1;
                }
            }
            
            // Update error count in progress
            {
                let mut progress = self.progress.write().await;
                progress.errors = error_count;
            }
        }
        
        // Wait for the fetch task to complete
        let _ = fetch_handle.await;

        // Invalidate list caches after cycle
        self.cache.invalidate_all_lists().await;

        let progress = self.progress.read().await;
        info!(
            "✅ Cycle complete. {} total, {} processed, {} saved, {} skipped, {} errors",
            symbols.len(),
            analyzed_count,
            success_count,
            skipped,
            progress.errors
        );

        Ok(())
    }
    
    /// Process a stock with pre-fetched historical prices
    async fn process_stock_with_prices(
        &self,
        symbol: &str,
        market_cap: Option<f64>,
        historical_prices: Vec<HistoricalPrice>,
    ) -> anyhow::Result<StockAnalysis> {
        // Data-quality gate: reject thinly-traded / brand-new / delisted stocks
        // before running any indicator math. Without this, the feed fills up
        // with tickers whose RSI is based on 5 bars of zero-volume noise.
        const MIN_BARS: usize = 30;
        if historical_prices.len() < MIN_BARS {
            return Err(anyhow::anyhow!(
                "{}: only {} bars (need {}+)",
                symbol, historical_prices.len(), MIN_BARS
            ));
        }

        let latest_price = historical_prices.last()
            .ok_or_else(|| anyhow::anyhow!("No price data for {}", symbol))?;

        if latest_price.volume <= 0.0 {
            return Err(anyhow::anyhow!(
                "{}: latest bar has zero volume, refusing to save analysis",
                symbol
            ));
        }

        // Calculate technical indicators
        let rsi = TechnicalIndicators::calculate_rsi(&historical_prices, 14);
        let sma_20 = TechnicalIndicators::calculate_sma(&historical_prices, 20);
        let sma_50 = TechnicalIndicators::calculate_sma(&historical_prices, 50);
        let macd = TechnicalIndicators::calculate_macd(&historical_prices);
        let bollinger = TechnicalIndicators::calculate_bollinger_bands(&historical_prices, 20, 2.0);
        let stochastic = TechnicalIndicators::calculate_stochastic(&historical_prices, 14, 3);

        // Fetch NASDAQ technicals
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

        // Fetch NASDAQ news (check cache first)
        let news = if let Some(cached_news) = self.cache.get_news(symbol).await {
            Some(cached_news)
        } else {
            match self.nasdaq_client.get_news(symbol, 10).await {
                Ok(n) if !n.is_empty() => {
                    self.cache.set_news(symbol.to_string(), n.clone()).await;
                    Some(n)
                }
                _ => None,
            }
        };

        let sector = technicals.as_ref().and_then(|t| t.sector.clone());

        // Calculate price change
        let (price_change, price_change_percent) = if let Some(ref tech) = technicals {
            if let (Some(change), Some(pct)) = (tech.net_change, tech.percentage_change) {
                (Some(change), Some(pct))
            } else if let Some(prev_close) = tech.previous_close {
                if prev_close > 0.0 {
                    let change = latest_price.close - prev_close;
                    (Some(change), Some((change / prev_close) * 100.0))
                } else {
                    (None, None)
                }
            } else {
                (None, None)
            }
        } else if historical_prices.len() >= 2 {
            let prev = &historical_prices[historical_prices.len() - 2];
            if prev.close > 0.0 && prev.volume > 0.0 {
                let change = latest_price.close - prev.close;
                (Some(change), Some((change / prev.close) * 100.0))
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

        // Drop runaway day-gainers/losers that the user doesn't want in the feed.
        if let Some(pct) = price_change_percent {
            if pct.abs() > self.max_abs_price_change_percent {
                return Err(anyhow::anyhow!(
                    "{}: |price_change_percent| {:.2}% exceeds max {:.2}%",
                    symbol, pct, self.max_abs_price_change_percent
                ));
            }
        }

        Ok(StockAnalysis {
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
            bollinger,
            stochastic,
            earnings: None,
            technicals,
            news,
        })
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

        let min_cap = self.min_market_cap_usd;
        let total_before = nasdaq_response.data.table.rows.len();

        let mut stocks: Vec<(String, Option<f64>)> = nasdaq_response
            .data
            .table
            .rows
            .into_iter()
            .filter_map(|stock| {
                if stock.symbol.is_empty() || is_junk_symbol(&stock.symbol) {
                    return None;
                }
                let mc = parse_market_cap(&stock.market_cap)?;
                if mc < min_cap {
                    return None;
                }
                Some((stock.symbol, Some(mc)))
            })
            .collect();

        // Sort by market cap descending
        stocks.sort_by(|a, b| {
            let cap_a = a.1.unwrap_or(0.0);
            let cap_b = b.1.unwrap_or(0.0);
            cap_b.partial_cmp(&cap_a).unwrap_or(std::cmp::Ordering::Equal)
        });

        info!(
            "NASDAQ screener: {} rows → {} after junk/market-cap filter (min_cap=${:.0})",
            total_before, stocks.len(), min_cap
        );

        Ok(stocks)
    }

    fn parse_market_cap(market_cap_str: &str) -> Option<f64> {
        parse_market_cap(market_cap_str)
    }
}

/// Reject warrants, units, rights, preferred shares, and other non-common-stock
/// tickers that clutter the NASDAQ screener. Match is case-insensitive on the
/// *suffix* following a dot/dash/slash so we don't accidentally drop legit
/// symbols like "AAPL" or "BRK-B".
///
/// Examples we filter out:
///   * `FOO.W`, `FOO.WS`, `FOO/WS`, `FOO-W` — warrants
///   * `FOO.U`, `FOO-U` — units (typical SPAC structure)
///   * `FOO.R`, `FOO-R` — rights
pub(crate) fn is_junk_symbol(symbol: &str) -> bool {
    // Find the suffix after the last '.', '-', or '/'. Case-insensitive.
    let upper = symbol.to_ascii_uppercase();
    let last_sep = upper.rfind(|c: char| c == '.' || c == '-' || c == '/');
    let Some(idx) = last_sep else { return false; };
    let suffix = &upper[idx + 1..];

    // Preserved as common-stock sub-classes we must NOT reject, despite their
    // separator-prefixed letters. BRK-B, BF-B, HEI-A, GOOG-L style tickers are
    // single-letter share classes (A/B/C/K/L), not warrants/units/rights.
    // Warrants/units/rights use a distinct set of suffixes:
    matches!(suffix, "W" | "WS" | "WSA" | "WSB" | "U" | "UN" | "R" | "RT")
}

/// Parse a NASDAQ screener `marketCap` string.
/// Accepts `"$1,234,567,890"`, `"1234567890"`; rejects empty / `"0"` / `"N/A"`.
pub(crate) fn parse_market_cap(market_cap_str: &str) -> Option<f64> {
    let cleaned = market_cap_str
        .replace('$', "")
        .replace(',', "");
    let cleaned = cleaned.trim();

    if cleaned.is_empty() || cleaned == "0" {
        return None;
    }

    let v = cleaned.parse::<f64>().ok()?;
    // Defensive: NASDAQ occasionally emits negative or NaN-ish placeholder values.
    if !v.is_finite() || v <= 0.0 {
        return None;
    }
    Some(v)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{NasdaqResponse, NasdaqStock};

    #[test]
    fn test_parse_market_cap_valid() {
        assert_eq!(parse_market_cap("$1,234,567,890"), Some(1_234_567_890.0));
        assert_eq!(parse_market_cap("1234567890"), Some(1_234_567_890.0));
        assert_eq!(parse_market_cap("3400000000000"), Some(3_400_000_000_000.0));
        assert_eq!(parse_market_cap("  $500,000,000 "), Some(500_000_000.0));
    }

    #[test]
    fn test_parse_market_cap_rejects_junk() {
        assert_eq!(parse_market_cap(""), None);
        assert_eq!(parse_market_cap(" "), None);
        assert_eq!(parse_market_cap("$0"), None);
        assert_eq!(parse_market_cap("0"), None);
        assert_eq!(parse_market_cap("N/A"), None);
        assert_eq!(parse_market_cap("--"), None);
        assert_eq!(parse_market_cap("-1000"), None, "negative should be rejected");
    }

    #[test]
    fn test_nasdaq_screener_deserialization() {
        let json = r#"{
            "data": {
                "table": {
                    "rows": [
                        {"symbol": "AAPL", "name": "Apple Inc.", "marketCap": "3,400,000,000,000"},
                        {"symbol": "TINY", "name": "Tiny Co.",   "marketCap": "0"},
                        {"symbol": "SPAC.U", "name": "SPAC Unit", "marketCap": "500,000,000"}
                    ]
                }
            }
        }"#;
        let resp: NasdaqResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.data.table.rows.len(), 3);
        assert_eq!(resp.data.table.rows[0].symbol, "AAPL");
        assert_eq!(resp.data.table.rows[1].market_cap, "0");
    }

    #[test]
    fn test_nasdaq_screener_filter_pipeline() {
        // Replicate the filter in fetch_nasdaq_stocks so the filtering behavior
        // stays covered even when it evolves.
        let rows = vec![
            NasdaqStock { symbol: "AAPL".to_string(), name: "Apple".to_string(), market_cap: "3,400,000,000,000".to_string() },
            NasdaqStock { symbol: "".to_string(),     name: "Empty".to_string(), market_cap: "1,000,000".to_string() },
            NasdaqStock { symbol: "ZERO".to_string(), name: "Zero".to_string(),  market_cap: "0".to_string() },
        ];
        let filtered: Vec<_> = rows.into_iter()
            .filter_map(|s| {
                let mc = parse_market_cap(&s.market_cap)?;
                if s.symbol.is_empty() { return None; }
                Some((s.symbol, mc))
            })
            .collect();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].0, "AAPL");
    }

    // ---- is_junk_symbol ------------------------------------------------------

    #[test]
    fn test_is_junk_symbol_rejects_warrants_and_units() {
        for junk in &[
            "FOO.W", "FOO.WS", "FOO/WS", "FOO-W",
            "FOO.WSA", "FOO.WSB",
            "FOO.U", "FOO-U", "FOO.UN",
            "FOO.R", "FOO-R", "FOO.RT",
            "foo.w", "foo.ws", // case-insensitive
        ] {
            assert!(is_junk_symbol(junk), "should be junk: {}", junk);
        }
    }

    #[test]
    fn test_is_junk_symbol_keeps_common_stock() {
        for good in &[
            "AAPL", "MSFT", "GOOG", "BRK-B", "BF-B", "HEI-A",
            "GOOG.L", "FOO.TO", "FOO-K", "FOO.C",
        ] {
            assert!(!is_junk_symbol(good), "should NOT be junk: {}", good);
        }
    }

    // ---- End-to-end screener filter simulation ------------------------------

    #[test]
    fn test_screener_filter_with_min_market_cap_and_junk() {
        // Mix of legit large caps, warrants/SPACs, and sub-threshold micro caps.
        let rows = vec![
            NasdaqStock { symbol: "AAPL".into(),   name: "Apple".into(),     market_cap: "3,400,000,000,000".into() },
            NasdaqStock { symbol: "MSFT".into(),   name: "Microsoft".into(), market_cap: "3,000,000,000,000".into() },
            NasdaqStock { symbol: "SPAC.U".into(), name: "SPAC Unit".into(), market_cap: "500,000,000".into() },
            NasdaqStock { symbol: "XYZ.WS".into(), name: "Warrant".into(),   market_cap: "100,000,000".into() },
            NasdaqStock { symbol: "MICRO".into(),  name: "Micro-cap".into(), market_cap: "50,000,000".into() },
            NasdaqStock { symbol: "ZERO".into(),   name: "Zero".into(),      market_cap: "0".into() },
            NasdaqStock { symbol: "BRK-B".into(),  name: "Berkshire".into(), market_cap: "1,000,000,000,000".into() },
        ];
        let min_cap = 300_000_000.0;

        let kept: Vec<_> = rows
            .into_iter()
            .filter_map(|s| {
                if s.symbol.is_empty() || is_junk_symbol(&s.symbol) {
                    return None;
                }
                let mc = parse_market_cap(&s.market_cap)?;
                if mc < min_cap {
                    return None;
                }
                Some(s.symbol)
            })
            .collect();

        assert_eq!(kept, vec!["AAPL", "MSFT", "BRK-B"]);
    }
}
