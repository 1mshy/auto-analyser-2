//! Crypto market data via CoinGecko.
//!
//! Vertical slice mirroring the Yahoo/NASDAQ pattern:
//! - HTTP client (`CoinGeckoClient`) with desktop User-Agent.
//! - Mongo persistence on collection `crypto_assets`, natural key `id`.
//! - Axum handlers `list_crypto` / `get_crypto` that read the cached
//!   collection and `tokio::spawn` a background refresh when stale.
//!
//! Refresh policy: at most every `REFRESH_INTERVAL_SECS` (5 minutes) to
//! respect CoinGecko's free-tier rate limit (~10–30 req/min).
//!
//! The HTTP fetch lives behind the [`CoinGeckoFetcher`] trait so tests
//! can inject canned JSON without hitting the network.

use anyhow::{Context, Result};
use async_trait::async_trait;
use axum::{
    extract::{Path, State},
    response::{IntoResponse, Json},
};
use chrono::{DateTime, Utc};
use futures::stream::StreamExt;
use mongodb::{
    bson::{doc, oid::ObjectId},
    options::UpdateOptions,
    Collection,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration as StdDuration;
use tokio::sync::Mutex;
use tracing::{debug, info, warn};

use crate::api::AppState;
use crate::db::MongoDB;

const COINGECKO_MARKETS_URL: &str =
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1";
const COLLECTION_NAME: &str = "crypto_assets";
const REFRESH_INTERVAL_SECS: i64 = 300;
const REQUEST_TIMEOUT_SECS: u64 = 15;
const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/// Public asset model. Mirrors `frontend/src/types.ts::CryptoAsset`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CryptoAsset {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub mongo_id: Option<ObjectId>,
    /// CoinGecko slug, e.g. `"bitcoin"`. Natural key.
    pub id: String,
    pub symbol: String,
    pub name: String,
    pub current_price: f64,
    pub market_cap: f64,
    pub price_change_24h: f64,
    pub price_change_pct_24h: f64,
    pub volume_24h: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    pub updated_at: DateTime<Utc>,
}

/// Raw CoinGecko `/coins/markets` row. Only the fields we surface.
#[derive(Debug, Clone, Deserialize)]
pub struct CoinGeckoMarket {
    pub id: String,
    pub symbol: String,
    pub name: String,
    #[serde(default)]
    pub current_price: Option<f64>,
    #[serde(default)]
    pub market_cap: Option<f64>,
    #[serde(default)]
    pub price_change_24h: Option<f64>,
    #[serde(default)]
    pub price_change_percentage_24h: Option<f64>,
    #[serde(default)]
    pub total_volume: Option<f64>,
    #[serde(default)]
    pub image: Option<String>,
}

impl CoinGeckoMarket {
    /// Convert a raw row into the persisted/API model. Missing numerics
    /// fall back to 0.0 so the frontend never has to handle null prices.
    pub fn into_asset(self, fetched_at: DateTime<Utc>) -> CryptoAsset {
        CryptoAsset {
            mongo_id: None,
            id: self.id,
            symbol: self.symbol.to_uppercase(),
            name: self.name,
            current_price: self.current_price.unwrap_or(0.0),
            market_cap: self.market_cap.unwrap_or(0.0),
            price_change_24h: self.price_change_24h.unwrap_or(0.0),
            price_change_pct_24h: self.price_change_percentage_24h.unwrap_or(0.0),
            volume_24h: self.total_volume.unwrap_or(0.0),
            image: self.image,
            updated_at: fetched_at,
        }
    }
}

/// Indirection layer so tests can inject canned JSON. The real impl is
/// `CoinGeckoClient`; tests use a fixture-backed fake.
#[async_trait]
pub trait CoinGeckoFetcher: Send + Sync {
    async fn fetch_markets(&self) -> Result<Vec<CoinGeckoMarket>>;
}

#[derive(Debug, Clone)]
pub struct CoinGeckoClient {
    client: reqwest::Client,
    url: String,
}

impl CoinGeckoClient {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(StdDuration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .expect("Failed to build CoinGecko HTTP client");
        Self {
            client,
            url: COINGECKO_MARKETS_URL.to_string(),
        }
    }
}

impl Default for CoinGeckoClient {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CoinGeckoFetcher for CoinGeckoClient {
    async fn fetch_markets(&self) -> Result<Vec<CoinGeckoMarket>> {
        let response = self
            .client
            .get(&self.url)
            .send()
            .await
            .context("CoinGecko request failed")?;

        if !response.status().is_success() {
            anyhow::bail!("CoinGecko returned status {}", response.status());
        }

        let body = response
            .text()
            .await
            .context("CoinGecko response body read failed")?;

        parse_markets(&body)
    }
}

/// Pure parser exposed for tests. Accepts the raw `/coins/markets` JSON
/// payload and returns the typed rows.
pub fn parse_markets(body: &str) -> Result<Vec<CoinGeckoMarket>> {
    let rows: Vec<CoinGeckoMarket> =
        serde_json::from_str(body).context("CoinGecko payload was not a market array")?;
    Ok(rows)
}

/// Mongo-side helpers — kept tiny on purpose so they can be exercised
/// from a live integration test if/when one is added.
pub fn crypto_collection(db: &MongoDB) -> Collection<CryptoAsset> {
    db.database().collection(COLLECTION_NAME)
}

/// Create the unique index on `id`. Best-effort, non-fatal — mirrors the
/// pattern used by `notifications::repo`.
pub async fn ensure_indexes(db: &MongoDB) {
    let collection = crypto_collection(db);
    let result = collection
        .create_index(
            mongodb::IndexModel::builder()
                .keys(doc! { "id": 1 })
                .options(
                    mongodb::options::IndexOptions::builder()
                        .unique(true)
                        .build(),
                )
                .build(),
        )
        .await;
    if let Err(e) = result {
        warn!("crypto_assets index create failed (continuing): {e}");
    }
}

pub async fn upsert_assets(db: &MongoDB, assets: &[CryptoAsset]) -> Result<u64> {
    let collection = crypto_collection(db);
    let mut count: u64 = 0;
    for asset in assets {
        let body = mongodb::bson::to_document(asset).context("encode CryptoAsset to bson")?;
        let filter = doc! { "id": &asset.id };
        let update = doc! { "$set": body };
        let opts = UpdateOptions::builder().upsert(true).build();
        match collection
            .update_one(filter, update)
            .with_options(opts)
            .await
        {
            Ok(_) => count += 1,
            Err(e) => warn!("crypto upsert failed for {}: {e}", asset.id),
        }
    }
    Ok(count)
}

pub async fn read_assets(db: &MongoDB) -> Result<Vec<CryptoAsset>> {
    let collection = crypto_collection(db);
    let opts = mongodb::options::FindOptions::builder()
        .sort(doc! { "market_cap": -1 })
        .limit(100)
        .build();
    let mut cursor = collection
        .find(doc! {})
        .with_options(opts)
        .await
        .context("crypto find failed")?;
    let mut out = Vec::with_capacity(100);
    while let Some(item) = cursor.next().await {
        match item {
            Ok(a) => out.push(a),
            Err(e) => warn!("crypto decode failed: {e}"),
        }
    }
    Ok(out)
}

pub async fn read_one(db: &MongoDB, id: &str) -> Result<Option<CryptoAsset>> {
    crypto_collection(db)
        .find_one(doc! { "id": id })
        .await
        .context("crypto find_one failed")
}

/// True if no asset has been updated within `REFRESH_INTERVAL_SECS`.
/// Empty caches count as stale.
pub fn is_stale(assets: &[CryptoAsset], now: DateTime<Utc>) -> bool {
    let Some(latest) = assets.iter().map(|a| a.updated_at).max() else {
        return true;
    };
    (now - latest).num_seconds() >= REFRESH_INTERVAL_SECS
}

/// One-flight guard so concurrent `/api/crypto` callers only trigger a
/// single refresh.
#[derive(Debug, Default, Clone)]
pub struct RefreshGuard(Arc<Mutex<Option<DateTime<Utc>>>>);

impl RefreshGuard {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns `true` if the caller should run a refresh (i.e. no other
    /// refresh has run within `REFRESH_INTERVAL_SECS`).
    pub async fn try_claim(&self, now: DateTime<Utc>) -> bool {
        let mut slot = self.0.lock().await;
        match *slot {
            Some(t) if (now - t).num_seconds() < REFRESH_INTERVAL_SECS => false,
            _ => {
                *slot = Some(now);
                true
            }
        }
    }
}

/// Process used by both the handler and tests: fetch -> parse -> upsert.
/// Returns the freshly-built assets so callers can avoid a redundant
/// Mongo round-trip when they need to surface them immediately.
pub async fn refresh_once<F: CoinGeckoFetcher>(
    db: &MongoDB,
    fetcher: &F,
) -> Result<Vec<CryptoAsset>> {
    let rows = fetcher.fetch_markets().await?;
    let now = Utc::now();
    let assets: Vec<CryptoAsset> = rows.into_iter().map(|r| r.into_asset(now)).collect();
    upsert_assets(db, &assets).await?;
    info!("Refreshed {} crypto assets from CoinGecko", assets.len());
    Ok(assets)
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

fn success<T: Serialize>(data: T) -> Json<serde_json::Value> {
    Json(json!({ "success": true, "data": data }))
}

fn failure(msg: impl Into<String>) -> Json<serde_json::Value> {
    Json(json!({ "success": false, "error": msg.into() }))
}

/// Triggers a background refresh if the cached data is stale. Never blocks
/// the handler — the refresh is `tokio::spawn`ed.
async fn maybe_refresh(state: &AppState, assets: &[CryptoAsset]) {
    if !is_stale(assets, Utc::now()) {
        return;
    }
    if !state.crypto_refresh_guard.try_claim(Utc::now()).await {
        debug!("crypto refresh already in flight, skipping");
        return;
    }
    let db = state.db.clone();
    tokio::spawn(async move {
        let client = CoinGeckoClient::new();
        if let Err(e) = refresh_once(&db, &client).await {
            warn!("Background crypto refresh failed: {e}");
        }
    });
}

pub async fn list_crypto(State(state): State<AppState>) -> impl IntoResponse {
    let cached = match read_assets(&state.db).await {
        Ok(v) => v,
        Err(e) => {
            warn!("crypto read failed: {e}");
            return failure(format!("failed to read crypto cache: {e}"));
        }
    };

    maybe_refresh(&state, &cached).await;

    // Cold start: cache empty, do an inline best-effort fetch so the
    // user doesn't see an empty page on first visit.
    if cached.is_empty() {
        let client = CoinGeckoClient::new();
        return match refresh_once(&state.db, &client).await {
            Ok(mut fresh) => {
                fresh.sort_by(|a, b| {
                    b.market_cap
                        .partial_cmp(&a.market_cap)
                        .unwrap_or(std::cmp::Ordering::Equal)
                });
                success(fresh)
            }
            Err(e) => {
                warn!("Cold-start crypto refresh failed: {e}");
                failure(format!("crypto upstream unavailable: {e}"))
            }
        };
    }

    success(cached)
}

pub async fn get_crypto(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    match read_one(&state.db, &id).await {
        Ok(Some(a)) => success(a),
        Ok(None) => failure(format!("crypto asset '{id}' not found")),
        Err(e) => failure(format!("crypto read failed: {e}")),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"[
        {
            "id": "bitcoin",
            "symbol": "btc",
            "name": "Bitcoin",
            "current_price": 50000.0,
            "market_cap": 1000000000000.0,
            "price_change_24h": 1500.0,
            "price_change_percentage_24h": 3.1,
            "total_volume": 25000000000.0,
            "image": "https://example/bitcoin.png"
        },
        {
            "id": "ethereum",
            "symbol": "eth",
            "name": "Ethereum",
            "current_price": 3000.0,
            "market_cap": 360000000000.0,
            "price_change_24h": -50.0,
            "price_change_percentage_24h": -1.6,
            "total_volume": 15000000000.0,
            "image": "https://example/eth.png"
        }
    ]"#;

    #[test]
    fn parse_markets_decodes_sample() {
        let rows = parse_markets(SAMPLE).expect("parse ok");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].id, "bitcoin");
        assert_eq!(rows[1].id, "ethereum");
    }

    #[test]
    fn into_asset_uppercases_symbol_and_fills_defaults() {
        let row = CoinGeckoMarket {
            id: "solana".into(),
            symbol: "sol".into(),
            name: "Solana".into(),
            current_price: Some(150.0),
            market_cap: Some(70_000_000_000.0),
            price_change_24h: None,
            price_change_percentage_24h: None,
            total_volume: None,
            image: None,
        };
        let now = Utc::now();
        let asset = row.into_asset(now);
        assert_eq!(asset.symbol, "SOL");
        assert_eq!(asset.price_change_24h, 0.0);
        assert_eq!(asset.volume_24h, 0.0);
        assert_eq!(asset.updated_at, now);
    }

    #[test]
    fn is_stale_treats_empty_as_stale() {
        assert!(is_stale(&[], Utc::now()));
    }

    #[test]
    fn is_stale_respects_window() {
        let now = Utc::now();
        let fresh = CryptoAsset {
            mongo_id: None,
            id: "bitcoin".into(),
            symbol: "BTC".into(),
            name: "Bitcoin".into(),
            current_price: 1.0,
            market_cap: 1.0,
            price_change_24h: 0.0,
            price_change_pct_24h: 0.0,
            volume_24h: 0.0,
            image: None,
            updated_at: now,
        };
        let mut old = fresh.clone();
        old.updated_at = now - chrono::Duration::seconds(REFRESH_INTERVAL_SECS + 5);
        assert!(!is_stale(&[fresh], now));
        assert!(is_stale(&[old], now));
    }
}
