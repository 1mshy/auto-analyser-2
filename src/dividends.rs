//! Dividend history + ex-dividend calendar.
//!
//! This module provides a per-symbol dividend history pulled from Yahoo
//! Finance's chart endpoint with `events=div`, persists payments and a derived
//! summary (trailing yield + 5y CAGR) into MongoDB, and exposes two read-only
//! HTTP endpoints.
//!
//! ## Data source
//!
//! We hit `https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}` with
//! `events=div&interval=1d&period1=<10y-ago>&period2=<now>`. This endpoint
//! returns OHLC plus a `events.dividends` map keyed by unix-timestamp. The
//! older `v7/finance/download/...&events=div` CSV endpoint requires the
//! consent cookie + crumb dance; chart `events=div` does not, which keeps the
//! module self-contained.
//!
//! ## Schema
//!
//! Two collections, mirroring the `stock_analysis` / `alert_state` split:
//!
//! - `dividend_payments` — individual `DividendPayment` records, one per
//!   ex-dividend date per symbol. Compound-unique on `(symbol, ex_date)`.
//! - `dividend_summaries` — derived `DividendSummary` per symbol, upserted at
//!   the end of each refresh. Keyed by `symbol`.
//!
//! ## Refresh
//!
//! No standalone background task is spawned at startup (this module owns no
//! lifecycle hook). Instead the list endpoint triggers a lazy `tokio::spawn`
//! refresh when the cache is older than `REFRESH_INTERVAL` and returns
//! whatever is currently persisted, so the first hit never blocks on Yahoo.
//!
//! ## Five-year CAGR
//!
//! `compute_five_year_cagr` takes an ordered slice of `(year, total)` and
//! returns `Some(pct)` when at least five distinct years are present and both
//! the first and last totals are positive. Anything shorter, zero starts, or
//! non-finite results → `None`. Tested directly.

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use axum::{
    extract::{Path, Query, State},
    response::{IntoResponse, Json},
};
use chrono::{DateTime, Datelike, Duration, Utc};
use futures::stream::StreamExt;
use mongodb::{
    bson::{doc, to_document},
    options::IndexOptions,
    Collection, IndexModel,
};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashSet};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration as StdDuration, Instant};
use tokio::sync::Mutex;
use tracing::{debug, info, warn};

use crate::api::AppState;
use crate::db::MongoDB;

const DESKTOP_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                          (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PAYMENTS_COLLECTION: &str = "dividend_payments";
const SUMMARIES_COLLECTION: &str = "dividend_summaries";
const HISTORY_DAYS: i64 = 365 * 10; // 10 years of dividend history
const REFRESH_INTERVAL: StdDuration = StdDuration::from_secs(6 * 60 * 60); // 6h
const REFRESH_SYMBOL_DELAY_MS: u64 = 250;
const MAX_REFRESH_SYMBOLS: usize = 500;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DividendPayment {
    pub symbol: String,
    /// Ex-dividend date in ISO-8601 (UTC).
    pub ex_date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pay_date: Option<String>,
    pub amount: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DividendSummary {
    pub symbol: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub company_name: Option<String>,
    pub trailing_annual_dividend: f64,
    pub trailing_yield_pct: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub five_year_growth_rate_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payout_frequency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_ex_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_payment_amount: Option<f64>,
    pub payment_count_5y: u32,
    pub updated_at: String,
}

// ---------------------------------------------------------------------------
// Fetcher trait (allows test stubbing)
// ---------------------------------------------------------------------------

#[async_trait]
pub trait DividendFetcher: Send + Sync {
    /// Fetch all dividend payments for `symbol`. Should return payments
    /// sorted by `ex_date` ascending. May return an empty vec if there is no
    /// history or the symbol does not pay dividends.
    async fn fetch_payments(&self, symbol: &str) -> Result<Vec<DividendPayment>>;

    /// Fetch the latest close + trailing-12m dividend yield (as a percentage).
    /// `None` for any field that the source did not supply.
    async fn fetch_quote(&self, symbol: &str) -> Result<DividendQuote>;
}

#[derive(Debug, Clone, Default)]
pub struct DividendQuote {
    pub close: Option<f64>,
    pub company_name: Option<String>,
    pub trailing_annual_dividend_yield: Option<f64>,
    pub trailing_annual_dividend_rate: Option<f64>,
    pub ex_dividend_date: Option<String>,
}

// ---------------------------------------------------------------------------
// Yahoo implementation
// ---------------------------------------------------------------------------

pub struct YahooDividendFetcher {
    http: reqwest::Client,
}

impl YahooDividendFetcher {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .user_agent(DESKTOP_UA)
            .timeout(StdDuration::from_secs(20))
            .build()
            .expect("dividend HTTP client");
        Self { http }
    }
}

impl Default for YahooDividendFetcher {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl DividendFetcher for YahooDividendFetcher {
    async fn fetch_payments(&self, symbol: &str) -> Result<Vec<DividendPayment>> {
        let now = Utc::now();
        let period2 = now.timestamp();
        let period1 = (now - Duration::days(HISTORY_DAYS)).timestamp();
        let url = format!(
            "https://query1.finance.yahoo.com/v8/finance/chart/{}?period1={}&period2={}&interval=1d&events=div",
            crate::symbols::yahoo_symbol(symbol),
            period1,
            period2,
        );
        let resp = self.http.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "Yahoo dividend chart returned {} for {}",
                resp.status(),
                symbol
            ));
        }
        let body: Value = resp.json().await?;
        parse_dividend_chart(&body, symbol)
    }

    async fn fetch_quote(&self, symbol: &str) -> Result<DividendQuote> {
        let url = format!(
            "https://query1.finance.yahoo.com/v7/finance/quote?symbols={}",
            crate::symbols::yahoo_symbol(symbol),
        );
        let resp = self.http.get(&url).send().await?;
        if !resp.status().is_success() {
            // Quote endpoint is sometimes gated behind a crumb; degrade
            // gracefully — payments alone are still useful.
            return Ok(DividendQuote::default());
        }
        let body: Value = resp.json().await?;
        Ok(parse_quote(&body))
    }
}

fn parse_dividend_chart(body: &Value, symbol: &str) -> Result<Vec<DividendPayment>> {
    let result = body
        .pointer("/chart/result/0")
        .ok_or_else(|| anyhow!("no chart.result[0] for {}", symbol))?;
    let dividends = match result.pointer("/events/dividends") {
        Some(d) => d,
        None => return Ok(Vec::new()),
    };
    let map = match dividends.as_object() {
        Some(m) => m,
        None => return Ok(Vec::new()),
    };
    let mut out = Vec::with_capacity(map.len());
    for entry in map.values() {
        let ts = entry.get("date").and_then(|v| v.as_i64());
        let amount = entry.get("amount").and_then(|v| v.as_f64());
        let (Some(ts), Some(amount)) = (ts, amount) else {
            continue;
        };
        if amount <= 0.0 || !amount.is_finite() {
            continue;
        }
        let Some(dt) = DateTime::from_timestamp(ts, 0) else {
            continue;
        };
        out.push(DividendPayment {
            symbol: symbol.to_string(),
            ex_date: dt.to_rfc3339(),
            pay_date: None,
            amount,
            frequency: None,
        });
    }
    out.sort_by(|a, b| a.ex_date.cmp(&b.ex_date));
    // Pass over payments to infer per-cluster frequency labels.
    let freq = infer_frequency(&out);
    for p in out.iter_mut() {
        p.frequency = freq.clone();
    }
    Ok(out)
}

fn parse_quote(body: &Value) -> DividendQuote {
    let q = body
        .pointer("/quoteResponse/result/0")
        .cloned()
        .unwrap_or(Value::Null);
    DividendQuote {
        close: q.get("regularMarketPrice").and_then(|v| v.as_f64()),
        company_name: q
            .get("longName")
            .or_else(|| q.get("shortName"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        trailing_annual_dividend_yield: q
            .get("trailingAnnualDividendYield")
            .and_then(|v| v.as_f64()),
        trailing_annual_dividend_rate: q.get("trailingAnnualDividendRate").and_then(|v| v.as_f64()),
        ex_dividend_date: q
            .get("exDividendDate")
            .and_then(|v| v.as_i64())
            .and_then(|ts| DateTime::from_timestamp(ts, 0).map(|d| d.to_rfc3339())),
    }
}

// ---------------------------------------------------------------------------
// Pure analytics
// ---------------------------------------------------------------------------

/// Group a chronologically-ordered slice of payments by calendar year and sum
/// the per-year total dividends. The returned vec is ordered by year.
pub fn annual_totals(payments: &[DividendPayment]) -> Vec<(i32, f64)> {
    let mut totals: BTreeMap<i32, f64> = BTreeMap::new();
    for p in payments {
        let Ok(dt) = DateTime::parse_from_rfc3339(&p.ex_date) else {
            continue;
        };
        *totals.entry(dt.year()).or_insert(0.0) += p.amount;
    }
    totals.into_iter().collect()
}

/// 5-year compound annual growth rate over annual dividend totals. Returns
/// `None` if fewer than 5 distinct years are available or the start total is
/// zero/negative. Uses the most recent 5 years (or 6 spans if available).
pub fn compute_five_year_cagr(annual: &[(i32, f64)]) -> Option<f64> {
    // Require at least 5 distinct years.
    let unique_years: HashSet<i32> = annual.iter().map(|(y, _)| *y).collect();
    if unique_years.len() < 5 {
        return None;
    }
    // Take the most recent 5 spanning years.
    let n = annual.len();
    let tail = &annual[n.saturating_sub(5)..];
    let (_, first) = tail.first()?;
    let (_, last) = tail.last()?;
    if *first <= 0.0 || *last <= 0.0 {
        return None;
    }
    let years = (tail.len() as f64) - 1.0;
    if years <= 0.0 {
        return None;
    }
    let cagr = (last / first).powf(1.0 / years) - 1.0;
    if !cagr.is_finite() {
        return None;
    }
    Some(cagr * 100.0)
}

/// Infer payout frequency from inter-payment gaps. Looks at the most recent
/// 8 payments and returns a coarse bucket.
pub fn infer_frequency(payments: &[DividendPayment]) -> Option<String> {
    if payments.len() < 2 {
        return None;
    }
    let dates: Vec<DateTime<Utc>> = payments
        .iter()
        .rev()
        .take(8)
        .filter_map(|p| DateTime::parse_from_rfc3339(&p.ex_date).ok())
        .map(|d| d.with_timezone(&Utc))
        .collect();
    if dates.len() < 2 {
        return None;
    }
    let mut gaps: Vec<i64> = dates
        .windows(2)
        .map(|w| (w[0] - w[1]).num_days().abs())
        .collect();
    gaps.sort();
    let median = gaps[gaps.len() / 2];
    Some(match median {
        0..=45 => "monthly".to_string(),
        46..=120 => "quarterly".to_string(),
        121..=240 => "semi-annual".to_string(),
        _ => "annual".to_string(),
    })
}

/// Build a summary from raw payments + current quote.
pub fn build_summary(
    symbol: &str,
    payments: &[DividendPayment],
    quote: &DividendQuote,
) -> DividendSummary {
    let now = Utc::now();
    let one_year_ago = now - Duration::days(365);
    let five_years_ago = now - Duration::days(365 * 5);

    let mut trailing_total = 0.0;
    let mut count_5y: u32 = 0;
    let mut next_ex_date: Option<String> = None;
    let mut next_payment_amount: Option<f64> = None;

    for p in payments {
        let Ok(dt) = DateTime::parse_from_rfc3339(&p.ex_date) else {
            continue;
        };
        let dt_utc = dt.with_timezone(&Utc);
        if dt_utc >= one_year_ago && dt_utc <= now {
            trailing_total += p.amount;
        }
        if dt_utc >= five_years_ago {
            count_5y += 1;
        }
        if dt_utc > now {
            // Future payment (rare in chart data, but defensive).
            if next_ex_date.is_none() {
                next_ex_date = Some(p.ex_date.clone());
                next_payment_amount = Some(p.amount);
            }
        }
    }

    if next_ex_date.is_none() {
        if let Some(ex) = quote.ex_dividend_date.clone() {
            if let Ok(dt) = DateTime::parse_from_rfc3339(&ex) {
                if dt.with_timezone(&Utc) >= now {
                    next_ex_date = Some(ex);
                    if next_payment_amount.is_none() {
                        next_payment_amount = payments.last().map(|p| p.amount);
                    }
                }
            }
        }
    }

    // Prefer the locally-computed trailing total; fall back to Yahoo's rate.
    let trailing_annual_dividend = if trailing_total > 0.0 {
        trailing_total
    } else {
        quote.trailing_annual_dividend_rate.unwrap_or(0.0)
    };

    // Yield: prefer Yahoo's number (already converted to a fraction by Yahoo,
    // ranges 0..1). If absent, compute from trailing total / current price.
    let trailing_yield_pct = if let Some(y) = quote.trailing_annual_dividend_yield {
        y * 100.0
    } else if let (Some(close), true) = (quote.close, trailing_annual_dividend > 0.0) {
        if close > 0.0 {
            (trailing_annual_dividend / close) * 100.0
        } else {
            0.0
        }
    } else {
        0.0
    };

    let totals = annual_totals(payments);
    let cagr = compute_five_year_cagr(&totals);
    let frequency = infer_frequency(payments);

    DividendSummary {
        symbol: symbol.to_string(),
        company_name: quote.company_name.clone(),
        trailing_annual_dividend,
        trailing_yield_pct,
        five_year_growth_rate_pct: cagr,
        payout_frequency: frequency,
        next_ex_date,
        next_payment_amount,
        payment_count_5y: count_5y,
        updated_at: now.to_rfc3339(),
    }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

pub fn payments_collection(db: &MongoDB) -> Collection<DividendPayment> {
    db.database().collection(PAYMENTS_COLLECTION)
}

pub fn summaries_collection(db: &MongoDB) -> Collection<DividendSummary> {
    db.database().collection(SUMMARIES_COLLECTION)
}

/// Create dividend collection indexes. Best-effort, non-fatal.
pub async fn ensure_indexes(db: &MongoDB) {
    let payments: Collection<DividendPayment> = payments_collection(db);
    let unique = IndexOptions::builder().unique(true).build();
    if let Err(e) = payments
        .create_index(
            IndexModel::builder()
                .keys(doc! { "symbol": 1, "ex_date": -1 })
                .options(unique)
                .build(),
        )
        .await
    {
        warn!("dividends: failed to create (symbol, ex_date) index: {e}");
    }

    let summaries: Collection<DividendSummary> = summaries_collection(db);
    if let Err(e) = summaries
        .create_index(
            IndexModel::builder()
                .keys(doc! { "symbol": 1 })
                .options(IndexOptions::builder().unique(true).build())
                .build(),
        )
        .await
    {
        warn!("dividends: failed to create summary symbol index: {e}");
    }
    if let Err(e) = summaries
        .create_index(
            IndexModel::builder()
                .keys(doc! { "next_ex_date": 1 })
                .build(),
        )
        .await
    {
        warn!("dividends: failed to create next_ex_date index: {e}");
    }
}

async fn upsert_payment(coll: &Collection<DividendPayment>, p: &DividendPayment) -> Result<()> {
    let doc = to_document(p)?;
    coll.update_one(
        doc! { "symbol": &p.symbol, "ex_date": &p.ex_date },
        doc! { "$set": doc },
    )
    .upsert(true)
    .await?;
    Ok(())
}

async fn upsert_summary(coll: &Collection<DividendSummary>, s: &DividendSummary) -> Result<()> {
    let doc = to_document(s)?;
    coll.update_one(doc! { "symbol": &s.symbol }, doc! { "$set": doc })
        .upsert(true)
        .await?;
    Ok(())
}

async fn list_summaries(db: &MongoDB, min_yield: Option<f64>) -> Result<Vec<DividendSummary>> {
    let coll = summaries_collection(db);
    let filter = if let Some(my) = min_yield {
        doc! { "trailing_yield_pct": { "$gte": my } }
    } else {
        doc! {}
    };
    let mut cursor = coll
        .find(filter)
        .sort(doc! { "trailing_yield_pct": -1 })
        .await?;
    let mut out = Vec::new();
    while let Some(d) = cursor.next().await {
        if let Ok(s) = d {
            out.push(s);
        }
    }
    Ok(out)
}

async fn get_summary(db: &MongoDB, symbol: &str) -> Result<Option<DividendSummary>> {
    Ok(summaries_collection(db)
        .find_one(doc! { "symbol": symbol })
        .await?)
}

async fn get_payments(db: &MongoDB, symbol: &str) -> Result<Vec<DividendPayment>> {
    let coll = payments_collection(db);
    let mut cursor = coll
        .find(doc! { "symbol": symbol })
        .sort(doc! { "ex_date": -1 })
        .await?;
    let mut out = Vec::new();
    while let Some(d) = cursor.next().await {
        if let Ok(p) = d {
            out.push(p);
        }
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// Refresh orchestration
// ---------------------------------------------------------------------------

static REFRESH_LOCK: Lazy<Arc<Mutex<Option<Instant>>>> = Lazy::new(|| Arc::new(Mutex::new(None)));
static REFRESH_RUNNING: AtomicBool = AtomicBool::new(false);

async fn should_refresh() -> bool {
    let guard = REFRESH_LOCK.lock().await;
    match *guard {
        Some(t) => t.elapsed() >= REFRESH_INTERVAL,
        None => true,
    }
}

async fn mark_refreshed() {
    let mut guard = REFRESH_LOCK.lock().await;
    *guard = Some(Instant::now());
}

/// Refresh all dividend data for the symbols currently in `stock_analysis`.
/// Sequential with a short delay between symbols to keep Yahoo happy.
pub async fn refresh_all(db: MongoDB, fetcher: Arc<dyn DividendFetcher>) -> Result<usize> {
    if REFRESH_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        debug!("dividends: refresh already running, skipping");
        return Ok(0);
    }
    // RAII reset of REFRESH_RUNNING on any return path (including panic).
    struct RunningGuard;
    impl Drop for RunningGuard {
        fn drop(&mut self) {
            REFRESH_RUNNING.store(false, Ordering::SeqCst);
        }
    }
    let _guard = RunningGuard;

    ensure_indexes(&db).await;

    let analyses = db.get_all_analyses().await.unwrap_or_default();
    // Build a price lookup from the existing analysis pass — Yahoo's /v7/quote
    // endpoint is crumb-gated and frequently 401s, so fall back to our own
    // most-recent close for the yield denominator.
    let price_lookup: std::collections::HashMap<String, f64> = analyses
        .iter()
        .map(|a| (a.symbol.clone(), a.price))
        .collect();
    let mut symbols: Vec<String> = price_lookup.keys().cloned().collect();
    symbols.sort();
    symbols.truncate(MAX_REFRESH_SYMBOLS);

    let payments_coll = payments_collection(&db);
    let summaries_coll = summaries_collection(&db);
    let mut processed = 0usize;

    for symbol in symbols {
        let payments = match fetcher.fetch_payments(&symbol).await {
            Ok(p) => p,
            Err(e) => {
                warn!("dividends: payments fetch failed for {symbol}: {e}");
                Vec::new()
            }
        };
        if payments.is_empty() {
            tokio::time::sleep(StdDuration::from_millis(REFRESH_SYMBOL_DELAY_MS)).await;
            continue;
        }
        for p in &payments {
            if let Err(e) = upsert_payment(&payments_coll, p).await {
                warn!("dividends: upsert payment failed {symbol}: {e}");
            }
        }
        let mut quote = fetcher.fetch_quote(&symbol).await.unwrap_or_default();
        if quote.close.is_none() {
            quote.close = price_lookup.get(&symbol).copied();
        }
        let summary = build_summary(&symbol, &payments, &quote);
        if let Err(e) = upsert_summary(&summaries_coll, &summary).await {
            warn!("dividends: upsert summary failed {symbol}: {e}");
        }
        processed += 1;
        tokio::time::sleep(StdDuration::from_millis(REFRESH_SYMBOL_DELAY_MS)).await;
    }

    info!("dividends: refresh complete, processed {processed} symbols");
    mark_refreshed().await;
    Ok(processed)
}

fn spawn_lazy_refresh(state: &AppState) {
    let db = state.db.clone();
    tokio::spawn(async move {
        if !should_refresh().await {
            return;
        }
        let fetcher: Arc<dyn DividendFetcher> = Arc::new(YahooDividendFetcher::new());
        if let Err(e) = refresh_all(db, fetcher).await {
            warn!("dividends: lazy refresh failed: {e}");
        }
    });
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ListDividendsQuery {
    pub symbol: Option<String>,
    pub min_yield: Option<f64>,
}

pub async fn list_dividends(
    State(state): State<AppState>,
    Query(q): Query<ListDividendsQuery>,
) -> impl IntoResponse {
    spawn_lazy_refresh(&state);

    let result = if let Some(sym) = q.symbol.as_deref() {
        get_summary(&state.db, sym).await.map(|maybe| match maybe {
            Some(s) => vec![s],
            None => vec![],
        })
    } else {
        list_summaries(&state.db, q.min_yield).await
    };

    match result {
        Ok(data) => Json(json!({ "success": true, "data": data })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

pub async fn dividend_history(
    State(state): State<AppState>,
    Path(symbol): Path<String>,
) -> impl IntoResponse {
    spawn_lazy_refresh(&state);

    let symbol = symbol.to_uppercase();
    let summary = match get_summary(&state.db, &symbol).await {
        Ok(s) => s,
        Err(e) => {
            return Json(json!({ "success": false, "error": e.to_string() }));
        }
    };
    let history = match get_payments(&state.db, &symbol).await {
        Ok(h) => h,
        Err(e) => {
            return Json(json!({ "success": false, "error": e.to_string() }));
        }
    };

    Json(json!({
        "success": true,
        "data": {
            "summary": summary,
            "history": history,
        }
    }))
}

// ---------------------------------------------------------------------------
// Internal unit tests for pure analytics. Integration tests for the fetcher
// trait live in tests/dividends_test.rs.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn p(symbol: &str, year: i32, month: u32, day: u32, amount: f64) -> DividendPayment {
        let dt = Utc.with_ymd_and_hms(year, month, day, 0, 0, 0).unwrap();
        DividendPayment {
            symbol: symbol.to_string(),
            ex_date: dt.to_rfc3339(),
            pay_date: None,
            amount,
            frequency: None,
        }
    }

    #[test]
    fn annual_totals_groups_by_year() {
        let payments = vec![
            p("X", 2020, 3, 1, 0.5),
            p("X", 2020, 6, 1, 0.5),
            p("X", 2020, 9, 1, 0.5),
            p("X", 2020, 12, 1, 0.5),
            p("X", 2021, 3, 1, 0.6),
        ];
        let totals = annual_totals(&payments);
        assert_eq!(totals.len(), 2);
        assert_eq!(totals[0].0, 2020);
        assert!((totals[0].1 - 2.0).abs() < 1e-9);
        assert_eq!(totals[1].0, 2021);
        assert!((totals[1].1 - 0.6).abs() < 1e-9);
    }

    #[test]
    fn five_year_cagr_basic() {
        // 1.0 -> 2.0 over 4 years (5 data points): CAGR = (2/1)^(1/4) - 1
        let totals = vec![
            (2018, 1.0),
            (2019, 1.2),
            (2020, 1.4),
            (2021, 1.6),
            (2022, 2.0),
        ];
        let cagr = compute_five_year_cagr(&totals).unwrap();
        let expected = ((2.0f64 / 1.0).powf(1.0 / 4.0) - 1.0) * 100.0;
        assert!((cagr - expected).abs() < 1e-6);
    }

    #[test]
    fn cagr_none_when_fewer_than_5_years() {
        let totals = vec![(2020, 1.0), (2021, 1.1), (2022, 1.2)];
        assert!(compute_five_year_cagr(&totals).is_none());
    }

    #[test]
    fn cagr_none_when_first_total_zero() {
        let totals = vec![
            (2018, 0.0),
            (2019, 0.1),
            (2020, 0.2),
            (2021, 0.3),
            (2022, 0.4),
        ];
        assert!(compute_five_year_cagr(&totals).is_none());
    }

    #[test]
    fn infer_frequency_quarterly() {
        let payments = vec![
            p("X", 2022, 3, 1, 0.5),
            p("X", 2022, 6, 1, 0.5),
            p("X", 2022, 9, 1, 0.5),
            p("X", 2022, 12, 1, 0.5),
        ];
        assert_eq!(infer_frequency(&payments).as_deref(), Some("quarterly"));
    }

    #[test]
    fn build_summary_computes_trailing() {
        let now = Utc::now();
        let p1_dt = now - Duration::days(30);
        let p2_dt = now - Duration::days(120);
        let p3_dt = now - Duration::days(210);
        let p4_dt = now - Duration::days(300);
        let payments = vec![
            DividendPayment {
                symbol: "X".into(),
                ex_date: p4_dt.to_rfc3339(),
                pay_date: None,
                amount: 0.25,
                frequency: None,
            },
            DividendPayment {
                symbol: "X".into(),
                ex_date: p3_dt.to_rfc3339(),
                pay_date: None,
                amount: 0.25,
                frequency: None,
            },
            DividendPayment {
                symbol: "X".into(),
                ex_date: p2_dt.to_rfc3339(),
                pay_date: None,
                amount: 0.25,
                frequency: None,
            },
            DividendPayment {
                symbol: "X".into(),
                ex_date: p1_dt.to_rfc3339(),
                pay_date: None,
                amount: 0.25,
                frequency: None,
            },
        ];
        let quote = DividendQuote {
            close: Some(100.0),
            ..Default::default()
        };
        let s = build_summary("X", &payments, &quote);
        assert!((s.trailing_annual_dividend - 1.0).abs() < 1e-9);
        assert!((s.trailing_yield_pct - 1.0).abs() < 1e-6);
        assert_eq!(s.payment_count_5y, 4);
    }

    #[test]
    fn parse_dividend_chart_extracts_payments() {
        let body = json!({
            "chart": {
                "result": [{
                    "events": {
                        "dividends": {
                            "1577836800": { "amount": 0.5, "date": 1577836800_i64 },
                            "1585699200": { "amount": 0.6, "date": 1585699200_i64 }
                        }
                    }
                }]
            }
        });
        let payments = parse_dividend_chart(&body, "X").unwrap();
        assert_eq!(payments.len(), 2);
        assert!(payments[0].ex_date < payments[1].ex_date);
        assert!((payments[1].amount - 0.6).abs() < 1e-9);
    }
}
