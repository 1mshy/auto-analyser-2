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
}

impl Config {
    pub fn from_env() -> Result<Self> {
        dotenv::dotenv().ok();

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
        })
    }
}
