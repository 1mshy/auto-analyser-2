//! Bulk export endpoint (unit-14).
//!
//! Emits the current filtered stock analysis set as CSV or JSON, suitable for
//! downloading via a browser. Mounted at `GET /api/export/stocks`.
//!
//! Query parameters mirror [`StockFilter`] (sectors is comma-separated) plus a
//! `format` discriminator (`csv` | `json`, default `csv`).
//!
//! ## Streaming / capacity
//!
//! The handler pages through `db.get_latest_analyses` until the result set is
//! drained, capped at [`EXPORT_MAX_ROWS`] (50k) to bound memory. The full
//! payload is assembled in memory before being returned; this keeps the
//! implementation simple and is fine for the universe sizes we run against
//! (NASDAQ + Canadian symbols are well under the cap). If we ever exceed it,
//! the response is truncated and a warning is logged.
//!
//! ## Testability
//!
//! [`to_csv`] and [`to_json`] are pure functions over a slice of
//! `StockAnalysis`, so `tests/export_test.rs` can exercise them with a
//! hand-built fixture — no Mongo, no Axum, no live server.

use crate::{api::AppState, models::StockAnalysis, models::StockFilter};
use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use chrono::Utc;
use serde::Deserialize;
use tracing::warn;

/// Hard cap on the number of rows returned by a single export request.
/// In-memory accumulation makes this a memory bound — bump cautiously.
pub const EXPORT_MAX_ROWS: usize = 50_000;

/// Page size used when looping through `get_latest_analyses`. Matches the
/// upper bound enforced by `db::get_latest_analyses` (200).
const EXPORT_PAGE_SIZE: u32 = 200;

/// Query string for `GET /api/export/stocks`. Mirrors `StockFilter` fields
/// (flattened so callers can write `?min_rsi=30&format=csv`) and adds the
/// `format` discriminator.
///
/// `sectors` is a comma-separated string here (rather than repeated keys) so
/// we can use the default `serde_urlencoded` extractor without pulling in an
/// extra feature.
#[derive(Debug, Deserialize, Default)]
pub struct ExportParams {
    #[serde(default = "default_format")]
    pub format: String,
    pub min_price: Option<f64>,
    pub max_price: Option<f64>,
    pub min_volume: Option<f64>,
    pub min_market_cap: Option<f64>,
    pub max_market_cap: Option<f64>,
    pub min_rsi: Option<f64>,
    pub max_rsi: Option<f64>,
    /// Comma-separated sectors (e.g. `Technology,Healthcare`).
    pub sectors: Option<String>,
    pub only_oversold: Option<bool>,
    pub only_overbought: Option<bool>,
    pub symbol_search: Option<String>,
    pub min_stochastic_k: Option<f64>,
    pub max_stochastic_k: Option<f64>,
    pub min_bandwidth: Option<f64>,
    pub max_bandwidth: Option<f64>,
    pub max_abs_price_change_percent: Option<f64>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

fn default_format() -> String {
    "csv".to_string()
}

impl ExportParams {
    /// Build a `StockFilter` from the export params, ignoring pagination —
    /// the handler drives paging itself.
    fn to_filter(&self) -> StockFilter {
        StockFilter {
            min_price: self.min_price,
            max_price: self.max_price,
            min_volume: self.min_volume,
            min_market_cap: self.min_market_cap,
            max_market_cap: self.max_market_cap,
            min_rsi: self.min_rsi,
            max_rsi: self.max_rsi,
            sectors: self.sectors.as_ref().map(|s| {
                s.split(',')
                    .map(|p| p.trim().to_string())
                    .filter(|p| !p.is_empty())
                    .collect()
            }),
            only_oversold: self.only_oversold,
            only_overbought: self.only_overbought,
            symbol_search: self.symbol_search.clone(),
            min_stochastic_k: self.min_stochastic_k,
            max_stochastic_k: self.max_stochastic_k,
            min_bandwidth: self.min_bandwidth,
            max_bandwidth: self.max_bandwidth,
            max_abs_price_change_percent: self.max_abs_price_change_percent,
            sort_by: self.sort_by.clone(),
            sort_order: self.sort_order.clone(),
            // Pagination is driven by the handler below — see `fetch_all`.
            page: None,
            page_size: None,
        }
    }
}

/// Format option parsed from `ExportParams::format`. Anything that isn't
/// `"json"` falls back to CSV (the default).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Format {
    Csv,
    Json,
}

impl Format {
    fn parse(s: &str) -> Self {
        if s.eq_ignore_ascii_case("json") {
            Format::Json
        } else {
            Format::Csv
        }
    }

    fn content_type(self) -> &'static str {
        match self {
            Format::Csv => "text/csv; charset=utf-8",
            Format::Json => "application/json",
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Format::Csv => "csv",
            Format::Json => "json",
        }
    }
}

/// Format an `Option<f64>` as a CSV cell — `None` -> empty string (per spec).
fn opt_f64(v: Option<f64>) -> String {
    v.map(|x| x.to_string()).unwrap_or_default()
}

fn opt_str(v: Option<&String>) -> String {
    v.cloned().unwrap_or_default()
}

/// Serialize a slice of `StockAnalysis` as CSV with the column order required
/// by unit-14. Header row included. `None` cells are emitted as empty strings.
///
/// Pure function — used directly by `tests/export_test.rs`.
pub fn to_csv(stocks: &[StockAnalysis]) -> anyhow::Result<String> {
    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record([
        "symbol",
        "name",
        "sector",
        "market_cap",
        "current_price",
        "price_change_pct",
        "rsi",
        "sma_20",
        "sma_50",
        "macd",
        "macd_signal",
        "macd_hist",
        "volume",
        "52w_high",
        "52w_low",
        "analyzed_at",
    ])?;

    for s in stocks {
        let (macd_line, macd_signal, macd_hist) = match &s.macd {
            Some(m) => (
                m.macd_line.to_string(),
                m.signal_line.to_string(),
                m.histogram.to_string(),
            ),
            None => (String::new(), String::new(), String::new()),
        };
        let (high_52w, low_52w) = match &s.technicals {
            Some(t) => (
                opt_f64(t.fifty_two_week_high),
                opt_f64(t.fifty_two_week_low),
            ),
            None => (String::new(), String::new()),
        };

        wtr.write_record([
            s.symbol.clone(),
            // `StockAnalysis` has no `name` field — output empty per spec.
            String::new(),
            opt_str(s.sector.as_ref()),
            opt_f64(s.market_cap),
            s.price.to_string(),
            opt_f64(s.price_change_percent),
            opt_f64(s.rsi),
            opt_f64(s.sma_20),
            opt_f64(s.sma_50),
            macd_line,
            macd_signal,
            macd_hist,
            opt_f64(s.volume),
            high_52w,
            low_52w,
            s.analyzed_at.to_rfc3339(),
        ])?;
    }

    let bytes = wtr.into_inner()?;
    Ok(String::from_utf8(bytes)?)
}

/// Serialize a slice of `StockAnalysis` as pretty-printed JSON. Mirrors what
/// `/api/stocks` returns, minus the response envelope — this is meant to be
/// loaded directly into a notebook or spreadsheet, not consumed by the SPA.
///
/// Pure function — used directly by `tests/export_test.rs`.
pub fn to_json(stocks: &[StockAnalysis]) -> anyhow::Result<String> {
    Ok(serde_json::to_string_pretty(stocks)?)
}

/// Page through `db.get_latest_analyses` until the result set is drained or
/// `EXPORT_MAX_ROWS` is hit. Returning early on the cap logs a warning so an
/// operator can spot truncation.
async fn fetch_all(
    state: &AppState,
    base_filter: &StockFilter,
) -> anyhow::Result<Vec<StockAnalysis>> {
    let mut out: Vec<StockAnalysis> = Vec::new();
    let mut page: u32 = 1;
    loop {
        let mut f = base_filter.clone();
        f.page = Some(page);
        f.page_size = Some(EXPORT_PAGE_SIZE);
        let batch = state.db.get_latest_analyses(f).await?;
        let len = batch.len();
        out.extend(batch);
        if len < EXPORT_PAGE_SIZE as usize {
            break;
        }
        if out.len() >= EXPORT_MAX_ROWS {
            warn!(
                "export: result set exceeds {} rows; truncating",
                EXPORT_MAX_ROWS
            );
            out.truncate(EXPORT_MAX_ROWS);
            break;
        }
        page += 1;
    }
    Ok(out)
}

/// Handler for `GET /api/export/stocks`. Returns a downloadable CSV or JSON
/// file (Content-Disposition: attachment) with today's date in the filename.
pub async fn export_stocks(
    Query(params): Query<ExportParams>,
    State(state): State<AppState>,
) -> Response {
    let format = Format::parse(&params.format);
    let filter = params.to_filter();

    let stocks = match fetch_all(&state, &filter).await {
        Ok(v) => v,
        Err(e) => {
            warn!("export: db query failed: {e}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("export failed: {e}"),
            )
                .into_response();
        }
    };

    let body = match format {
        Format::Csv => to_csv(&stocks),
        Format::Json => to_json(&stocks),
    };
    let body = match body {
        Ok(b) => b,
        Err(e) => {
            warn!("export: serialize failed: {e}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("serialize failed: {e}"),
            )
                .into_response();
        }
    };

    let date = Utc::now().format("%Y%m%d");
    let filename = format!("stocks-{}.{}", date, format.extension());
    let disposition = format!("attachment; filename=\"{}\"", filename);

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, format.content_type())
        .header(header::CONTENT_DISPOSITION, disposition)
        .body(Body::from(body))
        .unwrap_or_else(|e| {
            warn!("export: response build failed: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, "response build failed").into_response()
        })
}
