use crate::models::StockAnalysis;
use moka::future::Cache;
use std::sync::Arc;
use std::time::Duration;

#[derive(Clone)]
pub struct CacheLayer {
    stock_cache: Arc<Cache<String, StockAnalysis>>,
    list_cache: Arc<Cache<String, Vec<StockAnalysis>>>,
}

impl CacheLayer {
    pub fn new(ttl_secs: u64) -> Self {
        let stock_cache = Cache::builder()
            .time_to_live(Duration::from_secs(ttl_secs))
            .max_capacity(10_000)
            .build();

        let list_cache = Cache::builder()
            .time_to_live(Duration::from_secs(ttl_secs / 2))
            .max_capacity(100)
            .build();

        CacheLayer {
            stock_cache: Arc::new(stock_cache),
            list_cache: Arc::new(list_cache),
        }
    }

    pub async fn get_stock(&self, symbol: &str) -> Option<StockAnalysis> {
        self.stock_cache.get(symbol).await
    }

    pub async fn set_stock(&self, symbol: String, analysis: StockAnalysis) {
        self.stock_cache.insert(symbol, analysis).await;
    }

    pub async fn get_list(&self, cache_key: &str) -> Option<Vec<StockAnalysis>> {
        self.list_cache.get(cache_key).await
    }

    pub async fn set_list(&self, cache_key: String, analyses: Vec<StockAnalysis>) {
        self.list_cache.insert(cache_key, analyses).await;
    }

    pub async fn invalidate_stock(&self, symbol: &str) {
        self.stock_cache.invalidate(symbol).await;
    }

    pub async fn invalidate_all_lists(&self) {
        self.list_cache.invalidate_all();
    }
}
