use anyhow::Result;
use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub mongodb_uri: String,
    pub database_name: String,
    pub server_host: String,
    pub server_port: u16,
    pub analysis_interval_secs: u64,
    pub cache_ttl_secs: u64,
    pub yahoo_request_delay_ms: u64,
    pub yahoo_concurrency: usize,
    pub nasdaq_request_delay_ms: u64,
    pub news_cache_ttl_secs: u64,
    pub OPENROUTER_API_KEY_STOCKS: Option<String>,
    pub openrouter_enabled: bool,
    /// Minimum market cap to accept a stock into the analysis pipeline.
    /// Below this, the screener-dredged small-caps / shell companies are
    /// excluded. Configurable via `MIN_MARKET_CAP_USD`.
    pub min_market_cap_usd: f64,
    /// Drop stocks from the current analysis cycle whose one-day
    /// `|price_change_percent|` exceeds this threshold. Keeps runaway
    /// gainers/losers out of the feed. Configurable via `MAX_ABS_PRICE_CHANGE_PCT`.
    pub max_abs_price_change_percent: f64,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        dotenv::dotenv().ok();

        let OPENROUTER_API_KEY_STOCKS = env::var("OPENROUTER_API_KEY_STOCKS").ok();
        let openrouter_enabled = OPENROUTER_API_KEY_STOCKS.is_some() 
            && env::var("OPENROUTER_ENABLED")
                .unwrap_or_else(|_| "true".to_string())
                .parse()
                .unwrap_or(true);

        Ok(Config {
            mongodb_uri: env::var("MONGODB_URI")
                .unwrap_or_else(|_| "mongodb://localhost:27017".to_string()),
            database_name: env::var("DATABASE_NAME")
                .unwrap_or_else(|_| "stock_analyzer".to_string()),
            server_host: env::var("SERVER_HOST")
                .unwrap_or_else(|_| "127.0.0.1".to_string()),
            server_port: env::var("SERVER_PORT")
                .unwrap_or_else(|_| "3000".to_string())
                .parse()?,
            analysis_interval_secs: env::var("ANALYSIS_INTERVAL_SECS")
                .unwrap_or_else(|_| "3600".to_string())
                .parse()?,
            cache_ttl_secs: env::var("CACHE_TTL_SECS")
                .unwrap_or_else(|_| "300".to_string())
                .parse()?,
            yahoo_request_delay_ms: env::var("YAHOO_REQUEST_DELAY_MS")
                .unwrap_or_else(|_| "100".to_string())
                .parse()?,
            yahoo_concurrency: env::var("YAHOO_CONCURRENCY")
                .unwrap_or_else(|_| "5".to_string())
                .parse()?,
            nasdaq_request_delay_ms: env::var("NASDAQ_REQUEST_DELAY_MS")
                .unwrap_or_else(|_| "500".to_string())
                .parse()?,
            news_cache_ttl_secs: env::var("NEWS_CACHE_TTL_SECS")
                .unwrap_or_else(|_| "900".to_string()) // 15 minutes
                .parse()?,
            min_market_cap_usd: env::var("MIN_MARKET_CAP_USD")
                .unwrap_or_else(|_| "300000000".to_string()) // $300M
                .parse()?,
            max_abs_price_change_percent: env::var("MAX_ABS_PRICE_CHANGE_PCT")
                .unwrap_or_else(|_| "25".to_string())
                .parse()?,
            OPENROUTER_API_KEY_STOCKS,
            openrouter_enabled,
        })
    }
}
