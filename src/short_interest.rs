//! Short interest data source + short-squeeze candidates.
//!
//! Pulls per-symbol short-interest stats from Yahoo's
//! `quoteSummary?modules=defaultKeyStatistics` endpoint, persists them in the
//! `short_interest` MongoDB collection, and exposes two HTTP endpoints:
//!
//! - `GET /api/short-interest` — list / filter by `symbol` or `min_pct`.
//! - `GET /api/short-interest/squeeze-candidates` — ranked squeeze candidates,
//!   joined with the latest entry from `stock_analysis` for RSI + price change.
//!
//! ## Squeeze score
//!
//! ```text
//! base  = min(100, short_pct_of_float * 1.5 + days_to_cover * 5)
//! score = base + (10 if rsi.is_some() && rsi < 40 else 0)
//! ```
//!
//! `short_pct_of_float` is stored as a **percentage** (e.g. `5.23` for 5.23%),
//! not a fraction. Yahoo returns it as a fraction in `shortPercentOfFloat`, so
//! we multiply by 100 on ingest. The bumped score can exceed 100 — the cap is
//! applied only to the base. This is intentional so RSI-oversold candidates
//! rise above non-oversold candidates with otherwise identical metrics.
//!
//! ## Refresh policy
//!
//! Per-symbol fetches are gated by `report_date` / `updated_at`: a symbol is
//! refreshed at most once every 6 hours. No background task is required —
//! refreshes happen lazily during request handling and the rate cap is
//! enforced at the persistence layer (`should_refresh`).
//!
//! ## Mongo indexes
//!
//! Created idempotently on first use via [`ShortInterestRepo::create_indexes`]
//! (called best-effort on startup of the first handler that touches the repo,
//! same pattern as `notifications/repo.rs`). Indexes:
//!
//! - unique on `symbol`
//! - descending on `short_pct_of_float`

// Several items in this module (the Yahoo fetcher, the `ShortInterestService`,
// the raw JSON parser) are part of the public surface — they are exercised
// from `tests/short_interest_test.rs` and importable by future callers — but
// the live binary only uses the two HTTP handlers, which build their own
// stateless repo. Without this `allow`, building `auto_analyser_2` (the bin)
// triggers `dead_code` warnings for the lib-only items.
#![allow(dead_code)]

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Json},
};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use futures::stream::StreamExt;
use mongodb::{
    bson::{doc, Document},
    options::IndexOptions,
    Collection, IndexModel,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration as StdDuration;

use crate::api::AppState;
use crate::db::MongoDB;
use crate::models::StockAnalysis;

/// Minimum gap between successive fetches for a single symbol.
const REFRESH_INTERVAL_HOURS: i64 = 6;

/// Yahoo `query2` host. Kept separate from `yahoo.rs` because we want a
/// crumb-less request — `defaultKeyStatistics` is normally available without
/// a crumb if the request carries cookies; we use a fresh client and accept
/// occasional 401/403 (caller treats those as a transient fetch error).
const YAHOO_QUOTE_SUMMARY_HOST: &str = "https://query2.finance.yahoo.com";

const DESKTOP_USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

// ---------- public records ---------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortInterest {
    pub symbol: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub company_name: Option<String>,
    pub short_interest: f64,
    pub float: f64,
    /// Percentage of float that is short, e.g. `5.23` for 5.23%.
    pub short_pct_of_float: f64,
    pub days_to_cover: f64,
    pub report_date: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SqueezeCandidate {
    #[serde(flatten)]
    pub short: ShortInterest,
    pub squeeze_score: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rsi: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price_change_pct: Option<f64>,
}

// ---------- score logic (pure, easy to unit-test) ----------------------------

/// Raw numbers needed for a squeeze score. `rsi` is optional; if present and
/// below 40, the score is bumped by 10. See module-level doc comment for the
/// formula.
#[derive(Debug, Clone, Copy)]
pub struct SqueezeInputs {
    pub short_pct_of_float: f64,
    pub days_to_cover: f64,
    pub rsi: Option<f64>,
}

/// Compute the squeeze score from already-percentage `short_pct_of_float`.
///
/// `base = min(100, short_pct_of_float * 1.5 + days_to_cover * 5)`, plus a
/// flat +10 if RSI is known and below 40. The bumped value can exceed 100;
/// the cap applies only to the base term.
pub fn squeeze_score(inputs: SqueezeInputs) -> f64 {
    let base = (inputs.short_pct_of_float * 1.5 + inputs.days_to_cover * 5.0).min(100.0);
    let bump = match inputs.rsi {
        Some(r) if r < 40.0 => 10.0,
        _ => 0.0,
    };
    base + bump
}

// ---------- fetcher trait ----------------------------------------------------

/// Abstraction over the Yahoo HTTP fetch so tests can supply canned JSON.
#[async_trait]
pub trait ShortInterestFetcher: Send + Sync {
    async fn fetch(&self, symbol: &str) -> Result<ShortInterest>;
}

/// Real implementation hitting `query2.finance.yahoo.com`.
pub struct YahooShortInterestFetcher {
    client: reqwest::Client,
}

impl YahooShortInterestFetcher {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent(DESKTOP_USER_AGENT)
            .timeout(StdDuration::from_secs(15))
            .cookie_store(true)
            .build()
            .map_err(|e| anyhow!("failed to build short-interest HTTP client: {}", e))?;
        Ok(Self { client })
    }
}

impl Default for YahooShortInterestFetcher {
    fn default() -> Self {
        Self::new().expect("default reqwest client should build")
    }
}

#[async_trait]
impl ShortInterestFetcher for YahooShortInterestFetcher {
    async fn fetch(&self, symbol: &str) -> Result<ShortInterest> {
        let url = format!(
            "{}/v10/finance/quoteSummary/{}?modules=defaultKeyStatistics",
            YAHOO_QUOTE_SUMMARY_HOST, symbol,
        );
        let resp = self
            .client
            .get(&url)
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await
            .map_err(|e| anyhow!("HTTP error fetching short interest for {}: {}", symbol, e))?;

        let status = resp.status();
        if !status.is_success() {
            return Err(anyhow!(
                "Yahoo returned {} when fetching short interest for {}",
                status,
                symbol
            ));
        }
        let body = resp
            .text()
            .await
            .map_err(|e| anyhow!("read body failed: {}", e))?;
        parse_short_interest(&body, symbol)
    }
}

/// Parse Yahoo's `quoteSummary?modules=defaultKeyStatistics` JSON into a
/// `ShortInterest`. Exposed for tests via fixture JSON.
pub fn parse_short_interest(body: &str, symbol: &str) -> Result<ShortInterest> {
    let v: Value = serde_json::from_str(body)
        .map_err(|e| anyhow!("invalid JSON in Yahoo response for {}: {}", symbol, e))?;

    let stats = v
        .pointer("/quoteSummary/result/0/defaultKeyStatistics")
        .ok_or_else(|| anyhow!("missing defaultKeyStatistics block for {}", symbol))?;

    let raw = |path: &str| -> Option<f64> {
        stats.pointer(path).and_then(|v| v.as_f64()).or_else(|| {
            stats
                .pointer(path)
                .and_then(|v| v.as_i64())
                .map(|n| n as f64)
        })
    };

    // Yahoo returns these as `{ "raw": <number>, "fmt": "..." }`.
    let short_pct_raw = raw("/shortPercentOfFloat/raw").unwrap_or(0.0);
    let shares_short = raw("/sharesShort/raw").unwrap_or(0.0);
    let float_shares = raw("/floatShares/raw").unwrap_or(0.0);
    let short_ratio = raw("/shortRatio/raw").unwrap_or(0.0);

    if short_pct_raw == 0.0 && shares_short == 0.0 {
        return Err(anyhow!("no short-interest data reported for {}", symbol));
    }

    // shortPercentOfFloat is a fraction (e.g. 0.0523). Store as a percent.
    let short_pct_of_float = short_pct_raw * 100.0;

    let now = Utc::now();
    Ok(ShortInterest {
        symbol: symbol.to_string(),
        company_name: None,
        short_interest: shares_short,
        float: float_shares,
        short_pct_of_float,
        days_to_cover: short_ratio,
        report_date: now,
        updated_at: now,
    })
}

// ---------- repo / service ---------------------------------------------------

#[derive(Clone)]
pub struct ShortInterestRepo {
    db: MongoDB,
}

impl ShortInterestRepo {
    pub fn new(db: MongoDB) -> Self {
        Self { db }
    }

    pub fn collection(&self) -> Collection<ShortInterest> {
        self.db.database().collection("short_interest")
    }

    /// Best-effort idempotent index creation. Identical to the pattern in
    /// `notifications/repo.rs::create_indexes`.
    pub async fn create_indexes(&self) -> Result<()> {
        let coll = self.collection();
        coll.create_index(
            IndexModel::builder()
                .keys(doc! { "symbol": 1 })
                .options(IndexOptions::builder().unique(true).build())
                .build(),
        )
        .await?;
        coll.create_index(
            IndexModel::builder()
                .keys(doc! { "short_pct_of_float": -1 })
                .build(),
        )
        .await?;
        Ok(())
    }

    pub async fn get(&self, symbol: &str) -> Result<Option<ShortInterest>> {
        Ok(self
            .collection()
            .find_one(doc! { "symbol": symbol })
            .await?)
    }

    pub async fn list(&self, filter: Document) -> Result<Vec<ShortInterest>> {
        let mut cursor = self.collection().find(filter).await?;
        let mut out = Vec::new();
        while let Some(doc) = cursor.next().await {
            match doc {
                Ok(v) => out.push(v),
                Err(e) => tracing::warn!("short_interest deserialize error: {}", e),
            }
        }
        Ok(out)
    }

    pub async fn upsert(&self, record: &ShortInterest) -> Result<()> {
        let doc = mongodb::bson::to_document(record)?;
        self.collection()
            .update_one(doc! { "symbol": &record.symbol }, doc! { "$set": doc })
            .upsert(true)
            .await?;
        Ok(())
    }

    /// True if the symbol has no record or its `updated_at` is older than
    /// [`REFRESH_INTERVAL_HOURS`].
    pub async fn should_refresh(&self, symbol: &str) -> Result<bool> {
        let cutoff = Utc::now() - ChronoDuration::hours(REFRESH_INTERVAL_HOURS);
        match self.get(symbol).await? {
            None => Ok(true),
            Some(r) => Ok(r.updated_at < cutoff),
        }
    }
}

/// Service wiring a [`ShortInterestFetcher`] + a [`ShortInterestRepo`]. Used
/// internally by handlers but exposed publicly so tests can drive it with a
/// stub fetcher.
pub struct ShortInterestService {
    pub fetcher: Arc<dyn ShortInterestFetcher>,
    pub repo: ShortInterestRepo,
}

impl ShortInterestService {
    pub fn new(fetcher: Arc<dyn ShortInterestFetcher>, repo: ShortInterestRepo) -> Self {
        Self { fetcher, repo }
    }

    /// Refresh one symbol if its cached record is stale (or missing).
    /// Returns the up-to-date record, whether it was refreshed or not. Fetch
    /// failures fall back to the stale record if one exists.
    pub async fn ensure_fresh(&self, symbol: &str) -> Result<ShortInterest> {
        let needs = self.repo.should_refresh(symbol).await.unwrap_or(true);
        if needs {
            match self.fetcher.fetch(symbol).await {
                Ok(mut record) => {
                    record.symbol = symbol.to_string();
                    if let Err(e) = self.repo.upsert(&record).await {
                        tracing::warn!("short_interest upsert failed for {}: {}", symbol, e);
                    }
                    return Ok(record);
                }
                Err(e) => {
                    tracing::warn!(
                        "short_interest fetch failed for {}: {}; falling back to cache",
                        symbol,
                        e
                    );
                }
            }
        }
        match self.repo.get(symbol).await? {
            Some(r) => Ok(r),
            None => Err(anyhow!("no short-interest data for {}", symbol)),
        }
    }
}

// ---------- HTTP handlers ----------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub symbol: Option<String>,
    pub min_pct: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct CandidatesQuery {
    pub limit: Option<usize>,
}

fn err(status: StatusCode, msg: impl Into<String>) -> (StatusCode, Json<serde_json::Value>) {
    (
        status,
        Json(json!({ "success": false, "error": msg.into() })),
    )
}

/// Lazily build a repo. We don't add a field to `AppState` (forbidden by the
/// append-only rule); instead each handler constructs a tiny stateless
/// `ShortInterestRepo` over the shared `MongoDB`.
///
/// Index creation is gated by a process-wide `OnceCell` so we don't issue a
/// `createIndexes` round-trip on every API hit (Mongo treats them as no-ops
/// but it's still network chatter).
async fn repo_from_state(state: &AppState) -> ShortInterestRepo {
    use once_cell::sync::OnceCell;
    static INDEXES_READY: OnceCell<()> = OnceCell::new();

    let repo = ShortInterestRepo::new(state.db.clone());
    if INDEXES_READY.get().is_none() {
        if let Err(e) = repo.create_indexes().await {
            tracing::warn!("short_interest: failed to ensure indexes: {}", e);
        } else {
            let _ = INDEXES_READY.set(());
        }
    }
    repo
}

pub async fn list_short_interest(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> impl IntoResponse {
    let repo = repo_from_state(&state).await;
    let mut filter = Document::new();
    if let Some(sym) = q.symbol.as_ref().filter(|s| !s.is_empty()) {
        filter.insert("symbol", sym);
    }
    if let Some(min) = q.min_pct {
        filter.insert("short_pct_of_float", doc! { "$gte": min });
    }
    match repo.list(filter).await {
        Ok(items) => Json(json!({ "success": true, "data": items })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn squeeze_candidates(
    State(state): State<AppState>,
    Query(q): Query<CandidatesQuery>,
) -> impl IntoResponse {
    let limit = q.limit.unwrap_or(50).clamp(1, 500);
    let repo = repo_from_state(&state).await;
    let shorts = match repo.list(Document::new()).await {
        Ok(v) => v,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // Join: fetch all StockAnalysis documents whose symbol appears in shorts.
    // We do a single $in query rather than per-symbol round trips.
    let symbols: Vec<String> = shorts.iter().map(|s| s.symbol.clone()).collect();
    let analyses = match fetch_analyses(&state.db, &symbols).await {
        Ok(v) => v,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut candidates: Vec<SqueezeCandidate> = shorts
        .into_iter()
        .map(|short| {
            let an = analyses.iter().find(|a| a.symbol == short.symbol);
            let rsi = an.and_then(|a| a.rsi);
            let price_change_pct = an.and_then(|a| a.price_change_percent);
            let score = squeeze_score(SqueezeInputs {
                short_pct_of_float: short.short_pct_of_float,
                days_to_cover: short.days_to_cover,
                rsi,
            });
            SqueezeCandidate {
                short,
                squeeze_score: score,
                rsi,
                price_change_pct,
            }
        })
        .collect();

    candidates.sort_by(|a, b| {
        b.squeeze_score
            .partial_cmp(&a.squeeze_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    candidates.truncate(limit);

    Json(json!({ "success": true, "data": candidates })).into_response()
}

async fn fetch_analyses(db: &MongoDB, symbols: &[String]) -> Result<Vec<StockAnalysis>> {
    if symbols.is_empty() {
        return Ok(Vec::new());
    }
    let coll: Collection<StockAnalysis> = db.database().collection("stock_analysis");
    let mut cursor = coll.find(doc! { "symbol": { "$in": symbols } }).await?;
    let mut out = Vec::new();
    while let Some(doc) = cursor.next().await {
        if let Ok(v) = doc {
            out.push(v);
        }
    }
    Ok(out)
}

// ---------- tests ------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn squeeze_score_table() {
        // pure base, no rsi bump
        let s = squeeze_score(SqueezeInputs {
            short_pct_of_float: 10.0,
            days_to_cover: 2.0,
            rsi: None,
        });
        assert!((s - (10.0 * 1.5 + 2.0 * 5.0)).abs() < 1e-9, "got {}", s);

        // capped at 100 before bump
        let s = squeeze_score(SqueezeInputs {
            short_pct_of_float: 100.0,
            days_to_cover: 100.0,
            rsi: None,
        });
        assert!((s - 100.0).abs() < 1e-9);

        // bump when oversold
        let s = squeeze_score(SqueezeInputs {
            short_pct_of_float: 20.0,
            days_to_cover: 3.0,
            rsi: Some(28.0),
        });
        // base = 20*1.5 + 3*5 = 45; +10 because rsi<40
        assert!((s - 55.0).abs() < 1e-9, "got {}", s);

        // no bump if rsi is >= 40
        let s = squeeze_score(SqueezeInputs {
            short_pct_of_float: 20.0,
            days_to_cover: 3.0,
            rsi: Some(40.0),
        });
        assert!((s - 45.0).abs() < 1e-9, "got {}", s);

        // cap stays at 100 base; bump can lift past it
        let s = squeeze_score(SqueezeInputs {
            short_pct_of_float: 100.0,
            days_to_cover: 100.0,
            rsi: Some(20.0),
        });
        assert!((s - 110.0).abs() < 1e-9, "got {}", s);
    }

    #[test]
    fn parse_short_interest_basic() {
        let fixture = r#"{
            "quoteSummary": {
                "result": [{
                    "defaultKeyStatistics": {
                        "shortPercentOfFloat": { "raw": 0.0823, "fmt": "8.23%" },
                        "sharesShort": { "raw": 12345678, "fmt": "12.35M" },
                        "floatShares": { "raw": 150000000, "fmt": "150M" },
                        "shortRatio": { "raw": 4.2, "fmt": "4.20" }
                    }
                }],
                "error": null
            }
        }"#;
        let r = parse_short_interest(fixture, "GME").expect("parse ok");
        assert_eq!(r.symbol, "GME");
        assert!((r.short_pct_of_float - 8.23).abs() < 1e-9);
        assert!((r.short_interest - 12_345_678.0).abs() < 1e-3);
        assert!((r.float - 150_000_000.0).abs() < 1e-3);
        assert!((r.days_to_cover - 4.2).abs() < 1e-9);
    }

    #[test]
    fn parse_short_interest_missing_data_errors() {
        let fixture = r#"{
            "quoteSummary": {
                "result": [{ "defaultKeyStatistics": {} }],
                "error": null
            }
        }"#;
        assert!(parse_short_interest(fixture, "ABC").is_err());
    }
}
