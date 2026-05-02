use anyhow::{bail, Result};
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
    /// Master kill-switch for the alert engine. When `false`, no rules are
    /// evaluated at the end of each cycle; API CRUD still works so users can
    /// keep editing rules while paused. Configurable via `NOTIFICATIONS_ENABLED`.
    pub notifications_enabled: bool,
    /// Base URL of the frontend, used to render "view stock" links inside
    /// Discord embeds. e.g. `http://localhost:5173`. Optional.
    pub public_base_url: Option<String>,
    /// Optional Canadian listings to include alongside the US-primary universe.
    /// Use Yahoo suffixes like `.TO` and `.V`. Configurable via `CANADIAN_SYMBOLS`.
    pub canadian_symbols: Vec<String>,
    /// Per-symbol Yahoo circuit breaker: number of consecutive non-rate-limit
    /// fetch failures before the breaker opens for that symbol. Configurable
    /// via `YAHOO_CIRCUIT_FAILURES`. Set to 0 to disable the breaker entirely.
    pub yahoo_circuit_failure_threshold: u32,
    /// Number of subsequent cycles to skip a symbol after the breaker opens,
    /// before it is probed again. Configurable via `YAHOO_CIRCUIT_SKIP_CYCLES`.
    pub yahoo_circuit_skip_cycles: u32,
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

        let config = Config {
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
            notifications_enabled: env::var("NOTIFICATIONS_ENABLED")
                .unwrap_or_else(|_| "true".to_string())
                .parse()
                .unwrap_or(true),
            public_base_url: env::var("PUBLIC_BASE_URL").ok().filter(|s| !s.is_empty()),
            canadian_symbols: crate::symbols::parse_symbol_list(
                &env::var("CANADIAN_SYMBOLS").unwrap_or_else(|_| {
                    "SHOP.TO,RY.TO,TD.TO,BNS.TO,BMO.TO,CM.TO,ENB.TO,CNQ.TO,CNR.TO,CP.TO,TRI.TO,ATD.TO,SU.TO,BAM.TO,BN.TO,WCN.TO,CSU.TO,IMO.TO,ABX.TO,TECK-B.TO".to_string()
                }),
            ),
            yahoo_circuit_failure_threshold: env::var("YAHOO_CIRCUIT_FAILURES")
                .unwrap_or_else(|_| "5".to_string())
                .parse()?,
            yahoo_circuit_skip_cycles: env::var("YAHOO_CIRCUIT_SKIP_CYCLES")
                .unwrap_or_else(|_| "12".to_string())
                .parse()?,
            OPENROUTER_API_KEY_STOCKS,
            openrouter_enabled,
        };

        config.validate()?;
        Ok(config)
    }

    fn validate(&self) -> Result<()> {
        if self.server_port == 0 {
            bail!("SERVER_PORT must be greater than 0");
        }
        if self.analysis_interval_secs == 0 {
            bail!("ANALYSIS_INTERVAL_SECS must be greater than 0");
        }
        if self.cache_ttl_secs == 0 {
            bail!("CACHE_TTL_SECS must be greater than 0");
        }
        if self.yahoo_concurrency == 0 {
            bail!("YAHOO_CONCURRENCY must be greater than 0");
        }
        if self.min_market_cap_usd < 0.0 || !self.min_market_cap_usd.is_finite() {
            bail!("MIN_MARKET_CAP_USD must be a finite non-negative number");
        }
        if self.max_abs_price_change_percent <= 0.0
            || !self.max_abs_price_change_percent.is_finite()
        {
            bail!("MAX_ABS_PRICE_CHANGE_PCT must be a finite positive number");
        }
        Ok(())
    }
}
