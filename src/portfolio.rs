//! Portfolio holdings.
//!
//! Users upload a brokerage export in whatever format they have (CSV / TSV /
//! semicolon-separated, Excel / ODS, JSON, HTML tables or plain text). The
//! document is turned into text, then parsed into holdings by the configured
//! AI model first (`openrouter.rs`) with a deterministic column-mapping parser
//! as the fallback whenever AI is disabled, busy, failing, or returns nothing
//! usable. Holdings live in their own Mongo collection (`portfolio_holdings`)
//! and are joined against the latest `StockAnalysis` rows for the dashboard.
//!
//! Routes (all JSON, `{ success, ... }` envelope):
//! - `GET    /api/portfolio`                 holdings + per-symbol positions + totals
//! - `GET    /api/portfolio/related`         stocks relevant to what is held
//! - `POST   /api/portfolio/import`          multipart upload (`file` or `text`)
//! - `POST   /api/portfolio/holdings`        manual add
//! - `PATCH  /api/portfolio/holdings/:id`    manual edit
//! - `DELETE /api/portfolio/holdings/:id`
//! - `DELETE /api/portfolio`                 clear everything

use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::Cursor;

use axum::{
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use chrono::{DateTime, Utc};
use futures::TryStreamExt;
use mongodb::bson::{doc, oid::ObjectId, to_bson};
use mongodb::Collection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::api::AppState;
use crate::db::MongoDB;
use crate::models::StockAnalysis;
use crate::openrouter::OpenRouterClient;
use crate::symbols::normalize_symbol_key;

const COLLECTION: &str = "portfolio_holdings";
/// Upload cap for the multipart body. Brokerage exports are tiny; this mostly
/// guards against someone dropping a video on the dropzone.
const MAX_UPLOAD_BYTES: usize = 8 * 1024 * 1024;
/// Decoded text cap handed to the parsers.
const MAX_TEXT_CHARS: usize = 400_000;
/// Per-request chunk size sent to the model. Keeps each call well inside the
/// context window of small self-hosted models.
const LLM_CHUNK_CHARS: usize = 14_000;
const LLM_MAX_CHUNKS: usize = 8;
const LLM_MAX_TOKENS: u32 = 6_000;
const UNIVERSE_CACHE_KEY: &str = "portfolio:universe";

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HoldingSource {
    Import,
    Manual,
}

/// One lot: a symbol held in one account. The same symbol may appear several
/// times across accounts or currencies (e.g. a US listing and its CDR).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortfolioHolding {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    /// Normalized key used to join against `StockAnalysis` (`GOOG`, `SHOP.TO`).
    pub symbol: String,
    /// Symbol exactly as it appeared in the document.
    pub raw_symbol: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub quantity: f64,
    /// Average cost per unit in `currency`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avg_cost: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub account: Option<String>,
    /// Unit price and value as reported by the document at import time.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub market_price: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub market_value: Option<f64>,
    /// Canadian Depositary Receipt of a US stock: tracks the underlying but is
    /// priced in CAD, so the live US price must not be multiplied by quantity.
    #[serde(default)]
    pub is_cdr: bool,
    pub source: HoldingSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_file: Option<String>,
    pub imported_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Parser output before persistence.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ParsedHolding {
    pub symbol: String,
    pub raw_symbol: String,
    #[serde(default)]
    pub description: Option<String>,
    pub quantity: f64,
    #[serde(default)]
    pub avg_cost: Option<f64>,
    #[serde(default)]
    pub currency: Option<String>,
    #[serde(default)]
    pub account: Option<String>,
    #[serde(default)]
    pub market_price: Option<f64>,
    #[serde(default)]
    pub market_value: Option<f64>,
    #[serde(default)]
    pub is_cdr: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ParserKind {
    Llm,
    Heuristic,
}

#[derive(Debug, Clone, Serialize)]
pub struct ParseOutcome {
    pub holdings: Vec<ParsedHolding>,
    pub parser: ParserKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_used: Option<String>,
    pub warnings: Vec<String>,
    pub skipped: Vec<String>,
}

/// The subset of `StockAnalysis` the portfolio screens need. Keeps news and
/// NASDAQ technicals out of a response that lists every lot.
#[derive(Debug, Clone, Serialize)]
pub struct HoldingMarket {
    pub price: f64,
    pub price_change_percent: Option<f64>,
    pub rsi: Option<f64>,
    pub sma_20: Option<f64>,
    pub sma_50: Option<f64>,
    pub sector: Option<String>,
    pub market_cap: Option<f64>,
    pub is_oversold: bool,
    pub is_overbought: bool,
    pub analyzed_at: DateTime<Utc>,
}

impl From<&StockAnalysis> for HoldingMarket {
    fn from(a: &StockAnalysis) -> Self {
        Self {
            price: a.price,
            price_change_percent: a.price_change_percent,
            rsi: a.rsi,
            sma_20: a.sma_20,
            sma_50: a.sma_50,
            sector: a.sector.clone(),
            market_cap: a.market_cap,
            is_oversold: a.is_oversold,
            is_overbought: a.is_overbought,
            analyzed_at: a.analyzed_at,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ValueSource {
    Live,
    Import,
}

#[derive(Debug, Clone, Serialize)]
pub struct HoldingView {
    #[serde(flatten)]
    pub holding: PortfolioHolding,
    pub market: Option<HoldingMarket>,
    pub cost_basis_total: Option<f64>,
    pub current_value: Option<f64>,
    pub value_source: Option<ValueSource>,
    pub unrealized_pnl: Option<f64>,
    pub unrealized_pnl_pct: Option<f64>,
    /// `current_value * day change %`. For CDRs this is an approximation
    /// based on the underlying's move.
    pub day_change_value: Option<f64>,
}

impl HoldingView {
    pub fn build(holding: PortfolioHolding, analysis: Option<&StockAnalysis>) -> Self {
        let market = analysis.map(HoldingMarket::from);
        let cost_basis_total = holding.avg_cost.map(|c| c * holding.quantity);
        let (current_value, value_source) = match (&market, holding.is_cdr) {
            (Some(m), false) => (Some(m.price * holding.quantity), Some(ValueSource::Live)),
            _ => (
                holding.market_value,
                holding.market_value.map(|_| ValueSource::Import),
            ),
        };
        let unrealized_pnl = match (current_value, cost_basis_total) {
            (Some(v), Some(c)) => Some(v - c),
            _ => None,
        };
        let unrealized_pnl_pct = match (unrealized_pnl, cost_basis_total) {
            (Some(p), Some(c)) if c > 0.0 => Some(p / c * 100.0),
            _ => None,
        };
        let day_change_value = match (
            current_value,
            market.as_ref().and_then(|m| m.price_change_percent),
        ) {
            (Some(v), Some(pct)) => Some(v * pct / 100.0),
            _ => None,
        };
        Self {
            holding,
            market,
            cost_basis_total,
            current_value,
            value_source,
            unrealized_pnl,
            unrealized_pnl_pct,
            day_change_value,
        }
    }
}

/// All lots of one symbol folded together — what the dashboard lists.
#[derive(Debug, Clone, Serialize)]
pub struct PortfolioPosition {
    pub symbol: String,
    pub description: Option<String>,
    pub quantity: f64,
    pub lots: usize,
    pub accounts: Vec<String>,
    pub currencies: Vec<String>,
    pub market: Option<HoldingMarket>,
    /// Sum of lot values, currencies taken at par (an approximation used only
    /// for weighting, never shown as money).
    pub value_at_par: f64,
    pub weight_pct: Option<f64>,
    pub unrealized_pnl_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct CurrencyTotal {
    pub currency: String,
    pub market_value: f64,
    pub cost_basis: f64,
    pub unrealized_pnl: f64,
    pub day_change: f64,
    pub holdings: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct SectorWeight {
    pub sector: String,
    pub symbols: Vec<String>,
    pub weight_pct: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PortfolioSummary {
    pub holdings: usize,
    pub symbols: usize,
    pub accounts: Vec<String>,
    pub totals: Vec<CurrencyTotal>,
    pub sectors: Vec<SectorWeight>,
    pub last_imported_at: Option<DateTime<Utc>>,
    pub source_file: Option<String>,
    /// Symbols with no stored analysis (not in the analysis universe yet).
    pub unanalyzed_symbols: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RelatedStock {
    pub symbol: String,
    pub price: f64,
    pub price_change_percent: Option<f64>,
    pub rsi: Option<f64>,
    pub sector: Option<String>,
    pub market_cap: Option<f64>,
    pub is_oversold: bool,
    pub is_overbought: bool,
    pub reason: String,
    pub related_to: Vec<String>,
    pub score: f64,
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

pub struct PortfolioRepo {
    col: Collection<PortfolioHolding>,
}

impl PortfolioRepo {
    pub fn new(db: &MongoDB) -> Self {
        Self {
            col: db.database().collection(COLLECTION),
        }
    }

    pub async fn list(&self) -> anyhow::Result<Vec<PortfolioHolding>> {
        let cursor = self
            .col
            .find(doc! {})
            .sort(doc! { "symbol": 1, "account": 1 })
            .await?;
        Ok(cursor.try_collect().await?)
    }

    pub async fn get(&self, id: &ObjectId) -> anyhow::Result<Option<PortfolioHolding>> {
        Ok(self.col.find_one(doc! { "_id": id }).await?)
    }

    pub async fn insert(&self, mut holding: PortfolioHolding) -> anyhow::Result<PortfolioHolding> {
        let res = self.col.insert_one(&holding).await?;
        holding.id = res.inserted_id.as_object_id();
        Ok(holding)
    }

    pub async fn insert_many(&self, holdings: &[PortfolioHolding]) -> anyhow::Result<usize> {
        if holdings.is_empty() {
            return Ok(0);
        }
        let res = self.col.insert_many(holdings).await?;
        Ok(res.inserted_ids.len())
    }

    /// `replace`: wipe everything first. `merge`: drop the lots that share a
    /// `(symbol, account)` with an incoming lot, keep the rest, then insert.
    pub async fn import(
        &self,
        holdings: &[PortfolioHolding],
        mode: ImportMode,
    ) -> anyhow::Result<usize> {
        match mode {
            ImportMode::Replace => {
                self.col.delete_many(doc! {}).await?;
            }
            ImportMode::Merge => {
                let mut keys: Vec<bson::Document> = Vec::new();
                for h in holdings {
                    let account = match &h.account {
                        Some(a) => to_bson(a)?,
                        None => bson::Bson::Null,
                    };
                    keys.push(doc! { "symbol": &h.symbol, "account": account });
                }
                if !keys.is_empty() {
                    self.col.delete_many(doc! { "$or": keys }).await?;
                }
            }
        }
        self.insert_many(holdings).await
    }

    pub async fn update(
        &self,
        id: &ObjectId,
        patch: UpdateHoldingInput,
    ) -> anyhow::Result<Option<PortfolioHolding>> {
        let mut set = doc! { "updated_at": to_bson(&Utc::now())? };
        if let Some(q) = patch.quantity {
            set.insert("quantity", q);
        }
        if let Some(c) = patch.avg_cost {
            set.insert("avg_cost", c);
        }
        if let Some(c) = patch.currency {
            set.insert("currency", c.trim().to_ascii_uppercase());
        }
        if let Some(a) = patch.account {
            set.insert("account", a.trim().to_string());
        }
        if let Some(d) = patch.description {
            set.insert("description", d.trim().to_string());
        }
        if let Some(c) = patch.is_cdr {
            set.insert("is_cdr", c);
        }
        self.col
            .update_one(doc! { "_id": id }, doc! { "$set": set })
            .await?;
        self.get(id).await
    }

    pub async fn delete(&self, id: &ObjectId) -> anyhow::Result<bool> {
        Ok(self.col.delete_one(doc! { "_id": id }).await?.deleted_count > 0)
    }

    pub async fn clear(&self) -> anyhow::Result<u64> {
        Ok(self.col.delete_many(doc! {}).await?.deleted_count)
    }
}

// ---------------------------------------------------------------------------
// Document decoding: bytes -> text
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct ReadableDocument {
    pub filename: String,
    pub text: String,
    pub format: &'static str,
}

/// Turn whatever was uploaded into plain text the parsers can read.
pub fn decode_document(filename: &str, bytes: &[u8]) -> Result<ReadableDocument, String> {
    if bytes.is_empty() {
        return Err("The uploaded file is empty.".into());
    }
    if bytes.starts_with(b"%PDF") {
        return Err("PDF statements are not supported yet. Export the holdings as CSV, Excel or plain text, or paste the table as text.".into());
    }
    let lower_name = filename.to_ascii_lowercase();
    let looks_like_zip = bytes.starts_with(b"PK\x03\x04");
    let looks_like_ole = bytes.starts_with(&[0xD0, 0xCF, 0x11, 0xE0]);
    if looks_like_zip
        || looks_like_ole
        || lower_name.ends_with(".xlsx")
        || lower_name.ends_with(".xls")
        || lower_name.ends_with(".ods")
        || lower_name.ends_with(".xlsm")
    {
        return decode_spreadsheet(filename, bytes);
    }
    let mut text = decode_text(bytes)?;
    let format = if text.trim_start().starts_with('<')
        && (text.contains("<table") || text.contains("<html") || text.contains("<TABLE"))
    {
        text = html_to_text(&text);
        "html"
    } else if text.trim_start().starts_with('[') || text.trim_start().starts_with('{') {
        "json"
    } else {
        "text"
    };
    Ok(ReadableDocument {
        filename: filename.to_string(),
        text: truncate_chars(text, MAX_TEXT_CHARS),
        format,
    })
}

fn decode_spreadsheet(filename: &str, bytes: &[u8]) -> Result<ReadableDocument, String> {
    use calamine::{open_workbook_auto_from_rs, Reader};
    let cursor = Cursor::new(bytes.to_vec());
    let mut workbook = open_workbook_auto_from_rs(cursor)
        .map_err(|e| format!("Could not open the spreadsheet: {e}"))?;
    let mut out = String::new();
    for name in workbook.sheet_names() {
        let range = match workbook.worksheet_range(&name) {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("portfolio import: sheet {name} unreadable: {e}");
                continue;
            }
        };
        if range.is_empty() {
            continue;
        }
        out.push_str(&format!("# Sheet: {name}\n"));
        for row in range.rows() {
            let cells: Vec<String> = row
                .iter()
                .map(|c| c.to_string().trim().to_string())
                .collect();
            if cells.iter().all(|c| c.is_empty()) {
                continue;
            }
            out.push_str(&cells.join("\t"));
            out.push('\n');
        }
        out.push('\n');
    }
    if out.trim().is_empty() {
        return Err("The spreadsheet has no readable rows.".into());
    }
    Ok(ReadableDocument {
        filename: filename.to_string(),
        text: truncate_chars(out, MAX_TEXT_CHARS),
        format: "spreadsheet",
    })
}

fn decode_text(bytes: &[u8]) -> Result<String, String> {
    // UTF-16 with BOM (Excel "Unicode text" exports).
    if bytes.len() >= 2 && (bytes[..2] == [0xFF, 0xFE] || bytes[..2] == [0xFE, 0xFF]) {
        let little = bytes[0] == 0xFF;
        let units: Vec<u16> = bytes[2..]
            .chunks(2)
            .filter(|c| c.len() == 2)
            .map(|c| {
                if little {
                    u16::from_le_bytes([c[0], c[1]])
                } else {
                    u16::from_be_bytes([c[0], c[1]])
                }
            })
            .collect();
        return Ok(String::from_utf16_lossy(&units));
    }
    let body = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    let text = match std::str::from_utf8(body) {
        Ok(s) => s.to_string(),
        // Latin-1 fallback: every byte is a valid code point.
        Err(_) => body.iter().map(|&b| b as char).collect(),
    };
    let sample: Vec<char> = text.chars().take(4000).collect();
    let binary = sample
        .iter()
        .filter(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
        .count();
    if !sample.is_empty() && binary * 10 > sample.len() {
        return Err("This file does not look like readable text. Upload a CSV, spreadsheet, JSON, HTML or text export.".into());
    }
    Ok(text)
}

fn truncate_chars(s: String, max: usize) -> String {
    if s.chars().count() <= max {
        s
    } else {
        s.chars().take(max).collect()
    }
}

/// Crude but dependency-free: table cells become tab-separated, rows become
/// lines, everything else loses its tags.
fn html_to_text(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let chars = html.chars();
    let mut in_tag = false;
    let mut tag = String::new();
    for c in chars {
        if in_tag {
            if c == '>' {
                in_tag = false;
                let name = tag
                    .trim()
                    .trim_start_matches('/')
                    .split_whitespace()
                    .next()
                    .unwrap_or("")
                    .to_ascii_lowercase();
                let closing = tag.trim_start().starts_with('/');
                match name.as_str() {
                    "td" | "th" if closing => out.push('\t'),
                    "tr" | "br" | "p" | "div" | "li" | "h1" | "h2" | "h3" | "h4" | "table"
                        if closing || name == "br" =>
                    {
                        out.push('\n')
                    }
                    _ => {}
                }
                tag.clear();
            } else {
                tag.push(c);
            }
            continue;
        }
        if c == '<' {
            in_tag = true;
            continue;
        }
        out.push(c);
    }
    out.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

// ---------------------------------------------------------------------------
// Shared value helpers
// ---------------------------------------------------------------------------

/// Parse "1,234.56", "1.234,56", "(12.5)", "$ 45.13", "2.01%", "176" …
pub fn parse_number(raw: &str) -> Option<f64> {
    let mut s = raw.trim().trim_matches('"').trim().to_string();
    if s.is_empty() {
        return None;
    }
    let negative_parens = s.starts_with('(') && s.ends_with(')');
    if negative_parens {
        s = s[1..s.len() - 1].to_string();
    }
    let cleaned: String = s
        .chars()
        .filter(|c| c.is_ascii_digit() || matches!(c, '.' | ',' | '-' | '+'))
        .collect();
    if cleaned.is_empty() || !cleaned.chars().any(|c| c.is_ascii_digit()) {
        return None;
    }
    let has_dot = cleaned.contains('.');
    let has_comma = cleaned.contains(',');
    let normalized = match (has_dot, has_comma) {
        (true, true) => {
            // Whichever separator comes last is the decimal mark.
            if cleaned.rfind('.') > cleaned.rfind(',') {
                cleaned.replace(',', "")
            } else {
                cleaned.replace('.', "").replace(',', ".")
            }
        }
        (false, true) => {
            let commas = cleaned.matches(',').count();
            let after = cleaned.rsplit(',').next().unwrap_or("").len();
            if commas == 1 && after != 3 {
                cleaned.replace(',', ".")
            } else {
                cleaned.replace(',', "")
            }
        }
        _ => cleaned,
    };
    let value: f64 = normalized.parse().ok()?;
    if !value.is_finite() {
        return None;
    }
    Some(if negative_parens { -value } else { value })
}

const SYMBOL_STOPWORDS: &[&str] = &[
    "TOTAL", "TOTALS", "CASH", "USD", "CAD", "EUR", "GBP", "N/A", "NA", "NONE", "NULL", "SUM",
    "SUBTOTAL", "BALANCE", "ACCOUNT", "SYMBOL", "TICKER", "QTY", "SHARES", "PRICE", "VALUE",
    "COST", "NAME", "DATE", "TYPE", "BUY", "SELL", "DIV", "FEE", "FEES", "TAX", "INTEREST", "THE",
    "AND", "FOR", "INC", "LTD", "CORP", "ETF", "CL", "CDR", "HDG",
];

const EXCHANGE_PREFIXES: &[&str] = &[
    "NASDAQ", "NYSE", "TSX", "TSXV", "TSE", "NEO", "CSE", "CBOE", "AMEX", "ARCA", "BATS", "LSE",
    "XETRA", "NYSEARCA", "OTC", "OTCMKTS", "NMS", "NGM", "NCM", "US", "CA",
];

/// Clean a raw symbol cell: strips `$`, exchange prefixes/suffixes
/// (`NASDAQ:GOOG`, `GOOG:US`), then validates the ticker shape.
pub fn clean_symbol(raw: &str) -> Option<String> {
    let mut s = raw
        .trim()
        .trim_matches('"')
        .trim()
        .trim_start_matches('$')
        .to_ascii_uppercase();
    if s.contains(':') {
        let parts: Vec<&str> = s
            .split(':')
            .map(|p| p.trim())
            .filter(|p| !p.is_empty())
            .collect();
        let pick = parts
            .iter()
            .find(|p| !EXCHANGE_PREFIXES.contains(p))
            .or_else(|| parts.first())?;
        s = pick.to_string();
    }
    if s.ends_with(".US") {
        s.truncate(s.len() - 3);
    }
    if s.is_empty() || s.len() > 12 || SYMBOL_STOPWORDS.contains(&s.as_str()) {
        return None;
    }
    let mut chars = s.chars();
    let first = chars.next()?;
    if !first.is_ascii_alphabetic() {
        return None;
    }
    if !s
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '/'))
    {
        return None;
    }
    // Root (before any class separator) is 1–6 chars; suffix at most 4.
    let root_len = s.find(['.', '-', '/']).unwrap_or(s.len());
    if root_len == 0 || root_len > 6 {
        return None;
    }
    if s.len() - root_len > 5 {
        return None;
    }
    Some(normalize_symbol_key(&s))
}

fn is_cdr_description(description: &str) -> bool {
    let upper = description.to_ascii_uppercase();
    upper
        .split(|c: char| !c.is_ascii_alphanumeric() && c != '$')
        .any(|w| w == "CDR" || w == "C$HDG" || w == "CAD-HEDGED")
        || upper.contains("CDR ")
        || upper.ends_with("CDR")
        || upper.contains("CANADIAN DEPOSITARY")
        || upper.contains("C$HDG")
}

fn clean_currency(raw: &str) -> Option<String> {
    let s = raw.trim().trim_matches('"').trim().to_ascii_uppercase();
    match s.as_str() {
        "" => None,
        "$" | "US$" | "USD" | "US DOLLAR" => Some("USD".into()),
        "C$" | "CA$" | "CAD" | "CANADIAN DOLLAR" => Some("CAD".into()),
        "€" | "EUR" => Some("EUR".into()),
        "£" | "GBP" => Some("GBP".into()),
        _ if s.len() == 3 && s.chars().all(|c| c.is_ascii_alphabetic()) => Some(s),
        _ => None,
    }
}

fn clean_text(raw: &str) -> Option<String> {
    let s = raw.trim().trim_matches('"').trim();
    if s.is_empty() {
        None
    } else {
        Some(s.chars().take(200).collect())
    }
}

/// Final shape-up shared by both parsers: CDR detection, currency inference,
/// `.NE` CDR listings mapped to their underlying.
fn finalize(mut h: ParsedHolding) -> ParsedHolding {
    if let Some(desc) = &h.description {
        if is_cdr_description(desc) {
            h.is_cdr = true;
        }
    }
    if h.is_cdr {
        if let Some(base) = h.symbol.strip_suffix(".NE") {
            h.symbol = base.to_string();
        }
        if h.currency.is_none() {
            h.currency = Some("CAD".into());
        }
    }
    if h.currency.is_none() {
        if let Some(desc) = &h.description {
            let upper = desc.to_ascii_uppercase();
            if upper.contains("C$") || upper.contains(" CAD") {
                h.currency = Some("CAD".into());
            } else if upper.contains("US$") || upper.contains(" USD") {
                h.currency = Some("USD".into());
            }
        }
    }
    if h.currency.is_none()
        && h.symbol
            .rsplit_once('.')
            .is_some_and(|(_, s)| matches!(s, "TO" | "V" | "NE" | "CN"))
    {
        h.currency = Some("CAD".into());
    }
    if h.avg_cost.is_some_and(|c| c <= 0.0 || !c.is_finite()) {
        h.avg_cost = None;
    }
    if h.market_value.is_some_and(|v| !v.is_finite()) {
        h.market_value = None;
    }
    if h.market_price.is_some_and(|v| v <= 0.0 || !v.is_finite()) {
        h.market_price = None;
    }
    h
}

// ---------------------------------------------------------------------------
// Heuristic parser (the algorithmic backup)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Field {
    Symbol,
    Description,
    Quantity,
    AvgCost,
    BookValue,
    MarketPrice,
    MarketValue,
    Currency,
    Account,
}

const ALIASES: &[(Field, &[&str])] = &[
    (
        Field::Symbol,
        &[
            "symbol",
            "ticker",
            "ticker symbol",
            "stock symbol",
            "symbol ticker",
            "code",
            "stock code",
            "security symbol",
            "instrument",
            "sym",
            "security id",
            "stock",
        ],
    ),
    (
        Field::Description,
        &[
            "description",
            "name",
            "security",
            "security name",
            "security description",
            "company",
            "company name",
            "holding",
            "instrument name",
            "product",
            "asset",
            "asset name",
            "investment",
        ],
    ),
    (
        Field::Quantity,
        &[
            "quantity",
            "qty",
            "shares",
            "units",
            "number of shares",
            "shares held",
            "quantity held",
            "position",
            "nominal",
            "holdings",
            "qty held",
            "share quantity",
            "no of shares",
            "share count",
            "amount held",
            "quantity owned",
            "shares owned",
            "unit",
        ],
    ),
    (
        Field::AvgCost,
        &[
            "average unit cost",
            "average cost",
            "avg cost",
            "average price",
            "avg price",
            "avg unit cost",
            "cost per share",
            "cost share",
            "unit cost",
            "average cost basis",
            "cost basis per share",
            "average cost per share",
            "purchase price",
            "price paid",
            "acb per share",
            "acb unit",
            "avg cost basis",
            "book cost per share",
            "avg cost share",
            "average purchase price",
            "cost per unit",
            "average unit price",
            "entry price",
            "buy price",
        ],
    ),
    (
        Field::BookValue,
        &[
            "book value",
            "cost basis",
            "total cost",
            "book cost",
            "acb",
            "adjusted cost base",
            "cost",
            "total cost basis",
            "invested",
            "amount invested",
            "total book value",
            "cost value",
            "purchase value",
        ],
    ),
    (
        Field::MarketPrice,
        &[
            "market price",
            "last price",
            "current price",
            "price",
            "last",
            "quote",
            "close",
            "closing price",
            "mark",
            "last trade price",
            "current market price",
            "unit price",
            "price per share",
            "latest price",
        ],
    ),
    (
        Field::MarketValue,
        &[
            "market value",
            "current value",
            "value",
            "total value",
            "position value",
            "equity",
            "mkt value",
            "mkt val",
            "market val",
            "total market value",
            "current market value",
            "holding value",
            "net value",
            "mv",
        ],
    ),
    (
        Field::Currency,
        &[
            "currency",
            "account currency",
            "ccy",
            "cur",
            "curr",
            "price currency",
        ],
    ),
    (
        Field::Account,
        &[
            "account",
            "account number",
            "account name",
            "account id",
            "account no",
            "account type",
            "portfolio",
            "acct",
            "account alias",
            "account nickname",
            "portfolio name",
        ],
    ),
];

/// Short aliases that only count on an exact match, never on "contains".
const EXACT_ONLY: &[&str] = &[
    "price",
    "value",
    "cost",
    "amount",
    "last",
    "unit",
    "units",
    "code",
    "name",
    "stock",
    "position",
    "equity",
    "close",
    "mark",
    "mv",
    "cur",
    "sym",
    "quote",
    "asset",
    "security",
    "holding",
    "holdings",
    "nominal",
    "investment",
    "portfolio",
    "acct",
    "product",
    "instrument",
];

fn normalize_header(raw: &str) -> String {
    // Split camelCase keys ("averageCost") before lowercasing.
    let mut split = String::with_capacity(raw.len() + 4);
    let mut prev_lower = false;
    for c in raw.trim().trim_matches('"').chars() {
        if c.is_ascii_uppercase() && prev_lower {
            split.push(' ');
        }
        prev_lower = c.is_ascii_lowercase();
        split.push(c);
    }
    let lower = split.to_ascii_lowercase();
    let spaced: String = lower
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { ' ' })
        .collect();
    spaced.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn classify_header(raw: &str) -> Option<Field> {
    let h = normalize_header(raw);
    if h.is_empty() {
        return None;
    }
    for (field, aliases) in ALIASES {
        if aliases.iter().any(|a| *a == h) {
            return Some(*field);
        }
    }
    // Contains-matching, longest alias first so "average unit cost" beats "cost".
    let mut best: Option<(usize, Field)> = None;
    for (field, aliases) in ALIASES {
        for alias in aliases.iter() {
            if EXACT_ONLY.contains(alias) {
                continue;
            }
            let hit = h
                .split(' ')
                .collect::<Vec<_>>()
                .windows(alias.split(' ').count())
                .any(|w| w.join(" ") == *alias);
            if hit && best.is_none_or(|(len, _)| alias.len() > len) {
                best = Some((alias.len(), *field));
            }
        }
    }
    best.map(|(_, f)| f)
}

fn detect_delimiter(lines: &[&str]) -> char {
    let candidates = [';', ',', '\t', '|'];
    let sample: Vec<&str> = lines.iter().take(30).copied().collect();
    let mut best = (',', 0usize, 0usize);
    for &d in &candidates {
        let counts: Vec<usize> = sample.iter().map(|l| count_outside_quotes(l, d)).collect();
        let nonzero = counts.iter().filter(|&&c| c > 0).count();
        if nonzero == 0 {
            continue;
        }
        // Consistency: how many lines share the most common count.
        let mut freq: HashMap<usize, usize> = HashMap::new();
        for &c in counts.iter().filter(|&&c| c > 0) {
            *freq.entry(c).or_default() += 1;
        }
        let consistent = freq.values().copied().max().unwrap_or(0);
        if (consistent, nonzero) > (best.1, best.2) {
            best = (d, consistent, nonzero);
        }
    }
    best.0
}

fn count_outside_quotes(line: &str, d: char) -> usize {
    let mut inside = false;
    let mut n = 0;
    for c in line.chars() {
        if c == '"' {
            inside = !inside;
        } else if c == d && !inside {
            n += 1;
        }
    }
    n
}

fn split_row(line: &str, d: char) -> Vec<String> {
    let mut cells = Vec::new();
    let mut cur = String::new();
    let mut inside = false;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '"' {
            if inside && chars.peek() == Some(&'"') {
                cur.push('"');
                chars.next();
            } else {
                inside = !inside;
            }
        } else if c == d && !inside {
            cells.push(cur.trim().to_string());
            cur.clear();
        } else {
            cur.push(c);
        }
    }
    cells.push(cur.trim().to_string());
    cells
}

fn is_numeric_cell(cell: &str) -> bool {
    let t = cell.trim().trim_matches('"');
    !t.is_empty()
        && parse_number(t).is_some()
        && t.chars().filter(|c| c.is_ascii_alphabetic()).count() <= 3
}

/// Deterministic parse: JSON → delimited table with headers → bare token scan.
pub fn parse_heuristic(text: &str) -> ParseOutcome {
    let mut warnings = Vec::new();
    let mut skipped = Vec::new();
    let trimmed = text.trim_start();
    if trimmed.starts_with('[') || trimmed.starts_with('{') {
        if let Ok(value) = serde_json::from_str::<Value>(text) {
            let holdings = parse_json_value(&value, &mut skipped);
            if !holdings.is_empty() {
                return ParseOutcome {
                    holdings,
                    parser: ParserKind::Heuristic,
                    model_used: None,
                    warnings,
                    skipped,
                };
            }
            warnings.push(
                "The JSON document had no recognisable holdings; scanning it as text instead."
                    .into(),
            );
        }
    }
    let lines: Vec<&str> = text
        .lines()
        .map(|l| l.trim_end())
        .filter(|l| !l.trim().is_empty())
        .collect();
    if lines.is_empty() {
        return ParseOutcome {
            holdings: vec![],
            parser: ParserKind::Heuristic,
            model_used: None,
            warnings,
            skipped,
        };
    }
    let delimiter = detect_delimiter(&lines);
    let rows: Vec<Vec<String>> = lines.iter().map(|l| split_row(l, delimiter)).collect();

    // Locate a header row within the first 25 rows.
    let mut header: Option<(usize, HashMap<Field, usize>)> = None;
    for (i, row) in rows.iter().take(25).enumerate() {
        if row.len() < 2 {
            continue;
        }
        let mut map: HashMap<Field, usize> = HashMap::new();
        for (idx, cell) in row.iter().enumerate() {
            if let Some(f) = classify_header(cell) {
                map.entry(f).or_insert(idx);
            }
        }
        let numeric_cells = row.iter().filter(|c| is_numeric_cell(c)).count();
        if map.contains_key(&Field::Symbol) && map.len() >= 2 && numeric_cells * 2 < row.len() {
            header = Some((i, map));
            break;
        }
    }

    let holdings = match header {
        Some((header_idx, map)) => {
            let mut out = Vec::new();
            for (n, row) in rows.iter().enumerate().skip(header_idx + 1) {
                let cell = |f: Field| {
                    map.get(&f)
                        .and_then(|&i| row.get(i))
                        .map(|s| s.as_str())
                        .unwrap_or("")
                };
                let raw_symbol = cell(Field::Symbol).trim().trim_matches('"').to_string();
                if raw_symbol.is_empty() {
                    continue;
                }
                let Some(symbol) = clean_symbol(&raw_symbol) else {
                    skipped.push(format!(
                        "line {}: '{}' is not a ticker symbol",
                        n + 1,
                        raw_symbol
                    ));
                    continue;
                };
                let quantity = parse_number(cell(Field::Quantity));
                let Some(quantity) = quantity else {
                    skipped.push(format!("line {}: {} has no quantity", n + 1, symbol));
                    continue;
                };
                if quantity <= 0.0 {
                    skipped.push(format!(
                        "line {}: {} quantity is {} (short or closed positions are ignored)",
                        n + 1,
                        symbol,
                        quantity
                    ));
                    continue;
                }
                let book_value = parse_number(cell(Field::BookValue));
                let avg_cost =
                    parse_number(cell(Field::AvgCost)).or_else(|| book_value.map(|b| b / quantity));
                out.push(finalize(ParsedHolding {
                    symbol,
                    raw_symbol,
                    description: clean_text(cell(Field::Description)),
                    quantity,
                    avg_cost,
                    currency: clean_currency(cell(Field::Currency)),
                    account: clean_text(cell(Field::Account)),
                    market_price: parse_number(cell(Field::MarketPrice)),
                    market_value: parse_number(cell(Field::MarketValue)),
                    is_cdr: false,
                }));
            }
            out
        }
        None => {
            warnings.push("No column headers were recognised, so symbols and quantities were guessed from the text. Check the preview carefully.".into());
            scan_tokens(&lines, &mut skipped)
        }
    };
    ParseOutcome {
        holdings,
        parser: ParserKind::Heuristic,
        model_used: None,
        warnings,
        skipped,
    }
}

/// Header-less fallback: the first ticker-looking token on a line plus the
/// first positive number after it.
fn scan_tokens(lines: &[&str], skipped: &mut Vec<String>) -> Vec<ParsedHolding> {
    let mut out = Vec::new();
    for (n, line) in lines.iter().enumerate() {
        let tokens: Vec<&str> = line
            .split(|c: char| c.is_whitespace() || matches!(c, ',' | ';' | '|' | '\t'))
            .map(|t| t.trim_matches(|c: char| c == '"' || c == '\''))
            .filter(|t| !t.is_empty())
            .collect();
        if tokens.len() < 2 || tokens.len() > 40 {
            continue;
        }
        let Some(sym_idx) = tokens.iter().position(|t| {
            t.chars().any(|c| c.is_ascii_uppercase())
                && !t.chars().any(|c| c.is_ascii_lowercase())
                && clean_symbol(t).is_some()
        }) else {
            continue;
        };
        let symbol = clean_symbol(tokens[sym_idx]).unwrap();
        let Some(quantity) = tokens[sym_idx + 1..]
            .iter()
            .filter_map(|t| parse_number(t))
            .find(|q| *q > 0.0)
        else {
            skipped.push(format!("line {}: {} has no quantity", n + 1, symbol));
            continue;
        };
        let description: Vec<&str> = tokens[sym_idx + 1..]
            .iter()
            .copied()
            .filter(|t| parse_number(t).is_none())
            .take(6)
            .collect();
        out.push(finalize(ParsedHolding {
            symbol,
            raw_symbol: tokens[sym_idx].to_string(),
            description: if description.is_empty() {
                None
            } else {
                Some(description.join(" "))
            },
            quantity,
            avg_cost: None,
            currency: None,
            account: None,
            market_price: None,
            market_value: None,
            is_cdr: false,
        }));
    }
    out
}

/// JSON exports: find arrays of objects anywhere in the document and map keys
/// with the same aliases as table headers.
fn parse_json_value(value: &Value, skipped: &mut Vec<String>) -> Vec<ParsedHolding> {
    let mut out = Vec::new();
    collect_json_objects(value, &mut out, skipped, 0);
    out
}

fn collect_json_objects(
    value: &Value,
    out: &mut Vec<ParsedHolding>,
    skipped: &mut Vec<String>,
    depth: usize,
) {
    if depth > 6 {
        return;
    }
    match value {
        Value::Array(items) => {
            for item in items {
                collect_json_objects(item, out, skipped, depth + 1);
            }
        }
        Value::Object(map) => {
            if let Some(h) = object_to_holding(map, skipped) {
                out.push(h);
                return;
            }
            for v in map.values() {
                collect_json_objects(v, out, skipped, depth + 1);
            }
        }
        _ => {}
    }
}

fn value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        _ => String::new(),
    }
}

fn object_to_holding(
    map: &serde_json::Map<String, Value>,
    skipped: &mut Vec<String>,
) -> Option<ParsedHolding> {
    let mut fields: HashMap<Field, String> = HashMap::new();
    for (k, v) in map {
        if let Some(f) = classify_header(k) {
            if matches!(v, Value::String(_) | Value::Number(_)) {
                fields.entry(f).or_insert_with(|| value_to_string(v));
            }
        }
    }
    let raw_symbol = fields.get(&Field::Symbol)?.clone();
    let symbol = match clean_symbol(&raw_symbol) {
        Some(s) => s,
        None => {
            skipped.push(format!("'{}' is not a ticker symbol", raw_symbol));
            return None;
        }
    };
    let quantity = fields.get(&Field::Quantity).and_then(|q| parse_number(q));
    let Some(quantity) = quantity else {
        skipped.push(format!("{} has no quantity", symbol));
        return None;
    };
    if quantity <= 0.0 {
        skipped.push(format!("{} quantity is {} (ignored)", symbol, quantity));
        return None;
    }
    let get = |f: Field| fields.get(&f).map(|s| s.as_str()).unwrap_or("");
    let book_value = parse_number(get(Field::BookValue));
    Some(finalize(ParsedHolding {
        symbol,
        raw_symbol,
        description: clean_text(get(Field::Description)),
        quantity,
        avg_cost: parse_number(get(Field::AvgCost)).or_else(|| book_value.map(|b| b / quantity)),
        currency: clean_currency(get(Field::Currency)),
        account: clean_text(get(Field::Account)),
        market_price: parse_number(get(Field::MarketPrice)),
        market_value: parse_number(get(Field::MarketValue)),
        is_cdr: false,
    }))
}

// ---------------------------------------------------------------------------
// LLM parser
// ---------------------------------------------------------------------------

const IMPORT_SYSTEM: &str = "You extract investment holdings from brokerage statements, portfolio exports and pasted tables. \
Reply with a single JSON object and nothing else: no prose, no markdown fences. \
Schema: {\"holdings\":[{\"symbol\":string,\"description\":string|null,\"quantity\":number,\"avg_cost\":number|null,\
\"currency\":string|null,\"account\":string|null,\"market_price\":number|null,\"market_value\":number|null,\"book_value\":number|null}]}. \
Rules: one entry per holding row, keep rows that repeat a symbol in different accounts as separate entries; \
symbol is the exchange ticker exactly as written in the document (never invent or translate one); quantity is the number of shares/units held; \
avg_cost is the average cost per single share/unit in the row's currency (if only a total book value is given, put it in book_value and leave avg_cost null); \
currency is a 3-letter ISO code when stated or clearly implied; skip cash balances, totals, headers and closed positions; \
numbers are plain JSON numbers with no thousands separators, currency signs or percent signs. If nothing can be extracted return {\"holdings\":[]}.";

#[derive(Debug, Deserialize)]
struct LlmEnvelope {
    #[serde(default)]
    holdings: Vec<Value>,
}

fn lenient_number(v: Option<&Value>) -> Option<f64> {
    match v? {
        Value::Number(n) => n.as_f64().filter(|f| f.is_finite()),
        Value::String(s) => parse_number(s),
        _ => None,
    }
}

fn lenient_string(v: Option<&Value>) -> Option<String> {
    match v? {
        Value::String(s) => clean_text(s),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// Pull the JSON object out of a model reply that may carry fences or prose.
fn extract_json_object(answer: &str) -> Option<Value> {
    let trimmed = answer.trim();
    if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
        return Some(v);
    }
    let start = trimmed.find('{')?;
    let end = trimmed.rfind('}')?;
    if end <= start {
        return None;
    }
    serde_json::from_str(&trimmed[start..=end]).ok()
}

/// Convert and validate one model-produced holding. A symbol must literally
/// appear in the source chunk, which blocks hallucinated tickers.
fn llm_item_to_holding(
    item: &Value,
    chunk_upper: &str,
    skipped: &mut Vec<String>,
) -> Option<ParsedHolding> {
    let obj = item.as_object()?;
    let raw_symbol = lenient_string(obj.get("symbol"))?;
    let Some(symbol) = clean_symbol(&raw_symbol) else {
        skipped.push(format!(
            "AI returned '{}' which is not a ticker symbol",
            raw_symbol
        ));
        return None;
    };
    let root = symbol.split(['.', '-']).next().unwrap_or(&symbol);
    let present =
        chunk_upper.contains(&raw_symbol.to_ascii_uppercase()) || contains_token(chunk_upper, root);
    if !present {
        skipped.push(format!(
            "AI returned {} but it does not appear in the document",
            symbol
        ));
        return None;
    }
    let Some(quantity) = lenient_number(obj.get("quantity")) else {
        skipped.push(format!("{} has no quantity", symbol));
        return None;
    };
    if quantity <= 0.0 {
        skipped.push(format!("{} quantity is {} (ignored)", symbol, quantity));
        return None;
    }
    let book_value = lenient_number(obj.get("book_value"));
    Some(finalize(ParsedHolding {
        symbol,
        raw_symbol,
        description: lenient_string(obj.get("description")),
        quantity,
        avg_cost: lenient_number(obj.get("avg_cost")).or_else(|| book_value.map(|b| b / quantity)),
        currency: lenient_string(obj.get("currency")).and_then(|c| clean_currency(&c)),
        account: lenient_string(obj.get("account")),
        market_price: lenient_number(obj.get("market_price")),
        market_value: lenient_number(obj.get("market_value")),
        is_cdr: obj.get("is_cdr").and_then(Value::as_bool).unwrap_or(false),
    }))
}

fn contains_token(haystack_upper: &str, token: &str) -> bool {
    if token.is_empty() {
        return false;
    }
    let mut start = 0;
    while let Some(pos) = haystack_upper[start..].find(token) {
        let abs = start + pos;
        let before = haystack_upper[..abs].chars().next_back();
        let after = haystack_upper[abs + token.len()..].chars().next();
        let boundary = |c: Option<char>| c.is_none_or(|c| !c.is_ascii_alphanumeric());
        if boundary(before) && boundary(after) {
            return true;
        }
        start = abs + token.len();
    }
    false
}

fn chunk_document(text: &str) -> Vec<String> {
    let total = text.chars().count();
    if total <= LLM_CHUNK_CHARS {
        return vec![text.to_string()];
    }
    let lines: Vec<&str> = text.lines().collect();
    let header = lines
        .iter()
        .find(|l| !l.trim().is_empty())
        .copied()
        .unwrap_or("");
    let mut chunks = Vec::new();
    let mut current = String::new();
    for line in lines.iter().skip(1) {
        if current.chars().count() + line.chars().count() + 1 > LLM_CHUNK_CHARS
            && !current.is_empty()
        {
            chunks.push(format!("{header}\n{current}"));
            current.clear();
        }
        current.push_str(line);
        current.push('\n');
    }
    if !current.trim().is_empty() {
        chunks.push(format!("{header}\n{current}"));
    }
    chunks
}

async fn parse_with_llm(
    client: &OpenRouterClient,
    doc: &ReadableDocument,
) -> Result<ParseOutcome, String> {
    let chunks = chunk_document(&doc.text);
    if chunks.len() > LLM_MAX_CHUNKS {
        return Err(format!(
            "document too large for AI parsing ({} chunks)",
            chunks.len()
        ));
    }
    let mut holdings = Vec::new();
    let mut skipped = Vec::new();
    let mut model_used = None;
    for (i, chunk) in chunks.iter().enumerate() {
        let prompt = format!(
            "Document name: {}\nDetected format: {}\nPart {} of {}.\n\nExtract every holding from the document below.\n\n<document>\n{}\n</document>",
            doc.filename, doc.format, i + 1, chunks.len(), chunk
        );
        let completion = client
            .generate_structured(IMPORT_SYSTEM, &prompt, LLM_MAX_TOKENS)
            .await
            .map_err(|e| e.to_string())?;
        model_used = Some(completion.model_used.clone());
        let Some(value) = extract_json_object(&completion.answer) else {
            return Err("the model did not return JSON".into());
        };
        let envelope: LlmEnvelope = serde_json::from_value(value)
            .map_err(|_| "the model returned JSON without a holdings array".to_string())?;
        let chunk_upper = chunk.to_ascii_uppercase();
        for item in &envelope.holdings {
            if let Some(h) = llm_item_to_holding(item, &chunk_upper, &mut skipped) {
                holdings.push(h);
            }
        }
    }
    if holdings.is_empty() {
        return Err("the model found no holdings".into());
    }
    Ok(ParseOutcome {
        holdings,
        parser: ParserKind::Llm,
        model_used,
        warnings: vec![],
        skipped,
    })
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ParserPreference {
    #[default]
    Auto,
    Llm,
    Heuristic,
}

/// AI first, deterministic parser as the safety net. When the model answers,
/// lots the deterministic parser found from recognised column headers but the
/// model dropped are added back, so a flaky model never silently loses a row.
pub async fn parse_document(
    client: &OpenRouterClient,
    doc: &ReadableDocument,
    preference: ParserPreference,
) -> ParseOutcome {
    let mut heuristic = parse_heuristic(&doc.text);
    let heuristic_confident = heuristic.warnings.is_empty() && !heuristic.holdings.is_empty();
    if preference == ParserPreference::Heuristic {
        return heuristic;
    }
    if !client.is_enabled() {
        heuristic.warnings.insert(
            0,
            "AI parsing is not enabled on this server; the built-in parser was used.".into(),
        );
        return heuristic;
    }
    let _permit = match client.try_acquire_research() {
        Ok(p) => p,
        Err(e) => {
            heuristic
                .warnings
                .insert(0, format!("{} The built-in parser was used instead.", e));
            return heuristic;
        }
    };
    match tokio::time::timeout(
        std::time::Duration::from_secs(180),
        parse_with_llm(client, doc),
    )
    .await
    {
        Ok(Ok(mut llm)) => {
            if heuristic_confident {
                let seen: HashSet<(String, Option<String>)> = llm
                    .holdings
                    .iter()
                    .map(|h| (h.symbol.clone(), h.account.clone()))
                    .collect();
                let mut added = Vec::new();
                for h in heuristic.holdings {
                    if !seen.contains(&(h.symbol.clone(), h.account.clone()))
                        && !llm
                            .holdings
                            .iter()
                            .any(|l| l.symbol == h.symbol && l.account.is_none())
                    {
                        added.push(h.symbol.clone());
                        llm.holdings.push(h);
                    }
                }
                if !added.is_empty() {
                    llm.warnings.push(format!("The AI reply was missing {} lot(s) that the built-in parser recognised; they were added: {}.", added.len(), added.join(", ")));
                }
            }
            llm
        }
        Ok(Err(e)) => {
            heuristic.warnings.insert(
                0,
                format!(
                    "AI parsing failed ({}); the built-in parser was used instead.",
                    e
                ),
            );
            heuristic
        }
        Err(_) => {
            heuristic.warnings.insert(
                0,
                "AI parsing timed out; the built-in parser was used instead.".into(),
            );
            heuristic
        }
    }
}

// ---------------------------------------------------------------------------
// Views: holdings + analyses -> positions, totals, related stocks
// ---------------------------------------------------------------------------

async fn analysis_for(state: &AppState, symbol: &str) -> Option<StockAnalysis> {
    if let Some(a) = state.cache.get_stock(symbol).await {
        return Some(a);
    }
    match state.db.get_analysis_by_symbol(symbol).await {
        Ok(a) => a,
        Err(e) => {
            tracing::warn!("portfolio: analysis lookup for {symbol} failed: {e}");
            None
        }
    }
}

async fn load_analyses(
    state: &AppState,
    holdings: &[PortfolioHolding],
) -> HashMap<String, StockAnalysis> {
    let mut map = HashMap::new();
    let symbols: HashSet<&str> = holdings.iter().map(|h| h.symbol.as_str()).collect();
    for symbol in symbols {
        if let Some(a) = analysis_for(state, symbol).await {
            map.insert(symbol.to_string(), a);
        }
    }
    map
}

pub fn build_views(
    holdings: Vec<PortfolioHolding>,
    analyses: &HashMap<String, StockAnalysis>,
) -> (Vec<HoldingView>, Vec<PortfolioPosition>, PortfolioSummary) {
    let views: Vec<HoldingView> = holdings
        .into_iter()
        .map(|h| {
            let analysis = analyses.get(&h.symbol);
            HoldingView::build(h, analysis)
        })
        .collect();

    // Currency totals.
    let mut totals: BTreeMap<String, CurrencyTotal> = BTreeMap::new();
    for v in &views {
        let currency = v.holding.currency.clone().unwrap_or_else(|| "—".into());
        let t = totals
            .entry(currency.clone())
            .or_insert_with(|| CurrencyTotal {
                currency,
                ..Default::default()
            });
        t.holdings += 1;
        t.market_value += v.current_value.unwrap_or(0.0);
        t.cost_basis += v.cost_basis_total.unwrap_or(0.0);
        t.unrealized_pnl += v.unrealized_pnl.unwrap_or(0.0);
        t.day_change += v.day_change_value.unwrap_or(0.0);
    }

    // Per-symbol positions.
    let mut by_symbol: BTreeMap<String, Vec<&HoldingView>> = BTreeMap::new();
    for v in &views {
        by_symbol
            .entry(v.holding.symbol.clone())
            .or_default()
            .push(v);
    }
    let total_at_par: f64 = views.iter().filter_map(|v| v.current_value).sum();
    let mut positions: Vec<PortfolioPosition> = by_symbol
        .into_iter()
        .map(|(symbol, lots)| {
            let quantity = lots.iter().map(|l| l.holding.quantity).sum();
            let value_at_par: f64 = lots.iter().filter_map(|l| l.current_value).sum();
            let cost: f64 = lots.iter().filter_map(|l| l.cost_basis_total).sum();
            let pnl: f64 = lots.iter().filter_map(|l| l.unrealized_pnl).sum();
            let mut accounts: Vec<String> = lots
                .iter()
                .filter_map(|l| l.holding.account.clone())
                .collect();
            accounts.sort();
            accounts.dedup();
            let mut currencies: Vec<String> = lots
                .iter()
                .filter_map(|l| l.holding.currency.clone())
                .collect();
            currencies.sort();
            currencies.dedup();
            let description = lots
                .iter()
                .filter(|l| !l.holding.is_cdr)
                .chain(lots.iter())
                .find_map(|l| l.holding.description.clone());
            PortfolioPosition {
                symbol,
                description,
                quantity,
                lots: lots.len(),
                accounts,
                currencies,
                market: lots.iter().find_map(|l| l.market.clone()),
                value_at_par,
                weight_pct: if total_at_par > 0.0 {
                    Some(value_at_par / total_at_par * 100.0)
                } else {
                    None
                },
                unrealized_pnl_pct: if cost > 0.0 {
                    Some(pnl / cost * 100.0)
                } else {
                    None
                },
            }
        })
        .collect();
    positions.sort_by(|a, b| {
        b.value_at_par
            .partial_cmp(&a.value_at_par)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Sector weights (by value at par).
    let mut sector_value: BTreeMap<String, (f64, Vec<String>)> = BTreeMap::new();
    for p in &positions {
        let sector = p
            .market
            .as_ref()
            .and_then(|m| m.sector.clone())
            .unwrap_or_else(|| "Unclassified".into());
        let e = sector_value.entry(sector).or_insert((0.0, vec![]));
        e.0 += p.value_at_par;
        e.1.push(p.symbol.clone());
    }
    let mut sectors: Vec<SectorWeight> = sector_value
        .into_iter()
        .map(|(sector, (value, symbols))| SectorWeight {
            sector,
            symbols,
            weight_pct: if total_at_par > 0.0 {
                value / total_at_par * 100.0
            } else {
                0.0
            },
        })
        .collect();
    sectors.sort_by(|a, b| {
        b.weight_pct
            .partial_cmp(&a.weight_pct)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut accounts: Vec<String> = views
        .iter()
        .filter_map(|v| v.holding.account.clone())
        .collect();
    accounts.sort();
    accounts.dedup();
    let unanalyzed: Vec<String> = positions
        .iter()
        .filter(|p| p.market.is_none())
        .map(|p| p.symbol.clone())
        .collect();
    let summary = PortfolioSummary {
        holdings: views.len(),
        symbols: positions.len(),
        accounts,
        totals: totals.into_values().collect(),
        sectors,
        last_imported_at: views.iter().map(|v| v.holding.imported_at).max(),
        source_file: views
            .iter()
            .filter(|v| v.holding.source == HoldingSource::Import)
            .find_map(|v| v.holding.source_file.clone()),
        unanalyzed_symbols: unanalyzed,
    };
    (views, positions, summary)
}

/// Rank the analysis universe by relevance to the held positions: sector
/// overlap carries most of the weight, then an oversold / low-RSI tilt (the
/// app's core signal), then size as a tie-breaker.
pub fn rank_related(
    positions: &[PortfolioPosition],
    universe: &[StockAnalysis],
    min_market_cap: f64,
    limit: usize,
) -> Vec<RelatedStock> {
    use std::cmp::Ordering;
    /// A candidate counts as a size peer within this factor of a held cap.
    const CAP_BAND: f64 = 3.0;
    let held: HashSet<&str> = positions.iter().map(|p| p.symbol.as_str()).collect();
    let total_value: f64 = positions.iter().map(|p| p.value_at_par).sum();
    let weight_of = |p: &PortfolioPosition| {
        if total_value > 0.0 {
            p.value_at_par / total_value
        } else {
            1.0 / positions.len().max(1) as f64
        }
    };
    let mut sector_weight: HashMap<String, (f64, Vec<String>)> = HashMap::new();
    // (held market cap, portfolio weight, symbol) — the fallback relation when
    // sector data is missing, which NASDAQ frequently leaves blank.
    let mut cap_peers: Vec<(f64, f64, String)> = Vec::new();
    for p in positions {
        let Some(m) = p.market.as_ref() else { continue };
        if let Some(sector) = m.sector.clone() {
            let e = sector_weight.entry(sector).or_insert((0.0, vec![]));
            e.0 += weight_of(p);
            e.1.push(p.symbol.clone());
        }
        if let Some(cap) = m.market_cap.filter(|c| *c > 0.0) {
            cap_peers.push((cap, weight_of(p), p.symbol.clone()));
        }
    }
    if sector_weight.is_empty() && cap_peers.is_empty() {
        return vec![];
    }
    let mut out: Vec<RelatedStock> = universe
        .iter()
        .filter(|a| !held.contains(a.symbol.as_str()))
        .filter(|a| a.market_cap.unwrap_or(0.0) >= min_market_cap)
        .filter_map(|a| {
            let mut score = 0.0;
            let mut reasons: Vec<String> = Vec::new();
            let mut related_to: Vec<String> = Vec::new();
            if let Some((weight, symbols)) = a.sector.as_ref().and_then(|s| sector_weight.get(s)) {
                score += weight * 100.0;
                reasons.push(format!("Same sector as {}", summarize_symbols(symbols)));
                related_to.extend(symbols.iter().cloned());
            }
            if let Some(cap) = a.market_cap.filter(|c| *c > 0.0) {
                let mut closeness_total = 0.0;
                let mut peers: Vec<(f64, &str)> = Vec::new();
                for (held_cap, weight, symbol) in &cap_peers {
                    let distance = (cap / held_cap).log10().abs() / CAP_BAND.log10();
                    if distance < 1.0 && !related_to.contains(symbol) {
                        let closeness = 1.0 - distance;
                        closeness_total += weight * closeness;
                        peers.push((closeness, symbol.as_str()));
                    }
                }
                if !peers.is_empty() {
                    peers.sort_by(|x, y| y.0.partial_cmp(&x.0).unwrap_or(Ordering::Equal));
                    let names: Vec<String> = peers.iter().map(|(_, s)| s.to_string()).collect();
                    score += closeness_total.min(1.0) * 60.0;
                    reasons.push(format!("Similar size to {}", summarize_symbols(&names)));
                    related_to.extend(names);
                }
            }
            if reasons.is_empty() {
                return None;
            }
            if a.is_oversold {
                score += 25.0;
                reasons.push(match a.rsi {
                    Some(r) => format!("oversold (RSI {:.0})", r),
                    None => "oversold".into(),
                });
            } else if let Some(r) = a.rsi {
                if r < 40.0 {
                    score += 40.0 - r;
                    reasons.push(format!("RSI {:.0}", r));
                }
            }
            if let Some(cap) = a.market_cap {
                score += cap.max(1.0).log10();
            }
            Some(RelatedStock {
                symbol: a.symbol.clone(),
                price: a.price,
                price_change_percent: a.price_change_percent,
                rsi: a.rsi,
                sector: a.sector.clone(),
                market_cap: a.market_cap,
                is_oversold: a.is_oversold,
                is_overbought: a.is_overbought,
                reason: reasons.join(" · "),
                related_to,
                score,
            })
        })
        .collect();
    out.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));
    // Keep the list diverse: at most ceil(limit/2) names from any one sector.
    // Unclassified names are not capped — they have nothing to be diverse by.
    let per_sector_cap = limit.div_ceil(2).max(1);
    let mut taken: HashMap<String, usize> = HashMap::new();
    out.retain(|r| {
        let Some(key) = r.sector.clone() else {
            return true;
        };
        let n = taken.entry(key).or_default();
        if *n >= per_sector_cap {
            return false;
        }
        *n += 1;
        true
    });
    out.truncate(limit);
    out
}

fn summarize_symbols(symbols: &[String]) -> String {
    match symbols.len() {
        0 => String::new(),
        1..=3 => symbols.join(", "),
        n => format!("{} +{}", symbols[..3].join(", "), n - 3),
    }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ImportMode {
    #[default]
    Replace,
    Merge,
}

#[derive(Debug, Deserialize, Default)]
pub struct ImportQuery {
    #[serde(default)]
    pub mode: ImportMode,
    #[serde(default)]
    pub parser: ParserPreference,
    #[serde(default)]
    pub dry_run: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateHoldingInput {
    pub symbol: String,
    pub quantity: f64,
    #[serde(default)]
    pub avg_cost: Option<f64>,
    #[serde(default)]
    pub currency: Option<String>,
    #[serde(default)]
    pub account: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub is_cdr: bool,
}

#[derive(Debug, Deserialize, Default)]
pub struct UpdateHoldingInput {
    #[serde(default)]
    pub quantity: Option<f64>,
    #[serde(default)]
    pub avg_cost: Option<f64>,
    #[serde(default)]
    pub currency: Option<String>,
    #[serde(default)]
    pub account: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub is_cdr: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct RelatedQuery {
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub min_market_cap: Option<f64>,
}

pub fn mount(router: Router<AppState>) -> Router<AppState> {
    router
        .route("/api/portfolio", get(get_portfolio).delete(clear_portfolio))
        .route("/api/portfolio/related", get(get_related))
        .route(
            "/api/portfolio/import",
            post(import_portfolio).layer(DefaultBodyLimit::max(MAX_UPLOAD_BYTES + 64 * 1024)),
        )
        .route("/api/portfolio/holdings", post(create_holding))
        .route(
            "/api/portfolio/holdings/:id",
            axum::routing::patch(update_holding).delete(delete_holding),
        )
}

fn err(status: StatusCode, msg: impl Into<String>) -> Response {
    (
        status,
        Json(json!({ "success": false, "error": msg.into() })),
    )
        .into_response()
}

fn parse_oid(s: &str) -> Option<ObjectId> {
    ObjectId::parse_str(s).ok()
}

async fn get_portfolio(State(state): State<AppState>) -> Response {
    let repo = PortfolioRepo::new(&state.db);
    let holdings = match repo.list().await {
        Ok(h) => h,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    };
    let analyses = load_analyses(&state, &holdings).await;
    let (views, positions, summary) = build_views(holdings, &analyses);
    Json(json!({ "success": true, "holdings": views, "positions": positions, "summary": summary }))
        .into_response()
}

async fn universe(state: &AppState) -> anyhow::Result<Vec<StockAnalysis>> {
    if let Some(list) = state.cache.get_list(UNIVERSE_CACHE_KEY).await {
        return Ok(list);
    }
    let all = state.db.get_all_analyses().await?;
    state
        .cache
        .set_list(UNIVERSE_CACHE_KEY.to_string(), all.clone())
        .await;
    Ok(all)
}

async fn get_related(State(state): State<AppState>, Query(q): Query<RelatedQuery>) -> Response {
    let repo = PortfolioRepo::new(&state.db);
    let holdings = match repo.list().await {
        Ok(h) => h,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    };
    if holdings.is_empty() {
        return Json(json!({ "success": true, "related": [], "sectors": [] })).into_response();
    }
    let analyses = load_analyses(&state, &holdings).await;
    let (_, positions, summary) = build_views(holdings, &analyses);
    let all = match universe(&state).await {
        Ok(a) => a,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    };
    let limit = q.limit.unwrap_or(12).clamp(1, 50);
    let min_cap = q.min_market_cap.unwrap_or(2_000_000_000.0).max(0.0);
    let related = rank_related(&positions, &all, min_cap, limit);
    Json(json!({ "success": true, "related": related, "sectors": summary.sectors })).into_response()
}

async fn import_portfolio(
    State(state): State<AppState>,
    Query(q): Query<ImportQuery>,
    mut multipart: Multipart,
) -> Response {
    let mut filename = String::from("upload");
    let mut bytes: Option<Vec<u8>> = None;
    let mut pasted: Option<String> = None;
    loop {
        let field = match multipart.next_field().await {
            Ok(Some(f)) => f,
            Ok(None) => break,
            Err(e) => return err(StatusCode::BAD_REQUEST, format!("invalid upload: {e}")),
        };
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                if let Some(f) = field.file_name() {
                    filename = f.to_string();
                }
                match field.bytes().await {
                    Ok(b) if b.len() > MAX_UPLOAD_BYTES => {
                        return err(StatusCode::PAYLOAD_TOO_LARGE, "file larger than 8 MB")
                    }
                    Ok(b) => bytes = Some(b.to_vec()),
                    Err(e) => {
                        return err(StatusCode::BAD_REQUEST, format!("could not read file: {e}"))
                    }
                }
            }
            "text" => match field.text().await {
                Ok(t) => pasted = Some(t),
                Err(e) => return err(StatusCode::BAD_REQUEST, format!("could not read text: {e}")),
            },
            "filename" => {
                if let Ok(t) = field.text().await {
                    if !t.trim().is_empty() {
                        filename = t.trim().to_string();
                    }
                }
            }
            _ => {}
        }
    }
    let raw = match (bytes, pasted) {
        (Some(b), _) => b,
        (None, Some(t)) if !t.trim().is_empty() => {
            if filename == "upload" {
                filename = "pasted.txt".into();
            }
            t.into_bytes()
        }
        _ => {
            return err(
                StatusCode::BAD_REQUEST,
                "Send a multipart form with a `file` field or a `text` field.",
            )
        }
    };
    let doc = match decode_document(&filename, &raw) {
        Ok(d) => d,
        Err(e) => return err(StatusCode::UNPROCESSABLE_ENTITY, e),
    };
    let outcome = parse_document(&state.openrouter_client, &doc, q.parser).await;
    if outcome.holdings.is_empty() {
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({
                "success": false,
                "error": "No holdings could be read from this document.",
                "parser": outcome.parser,
                "model_used": outcome.model_used,
                "warnings": outcome.warnings,
                "skipped": outcome.skipped,
                "format": doc.format,
            })),
        )
            .into_response();
    }
    let mut imported = 0usize;
    if !q.dry_run {
        let now = Utc::now();
        let rows: Vec<PortfolioHolding> = outcome
            .holdings
            .iter()
            .cloned()
            .map(|h| PortfolioHolding {
                id: None,
                symbol: h.symbol,
                raw_symbol: h.raw_symbol,
                description: h.description,
                quantity: h.quantity,
                avg_cost: h.avg_cost,
                currency: h.currency,
                account: h.account,
                market_price: h.market_price,
                market_value: h.market_value,
                is_cdr: h.is_cdr,
                source: HoldingSource::Import,
                source_file: Some(doc.filename.clone()),
                imported_at: now,
                updated_at: now,
            })
            .collect();
        match PortfolioRepo::new(&state.db).import(&rows, q.mode).await {
            Ok(n) => imported = n,
            Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        }
    }
    Json(json!({
        "success": true,
        "dry_run": q.dry_run,
        "mode": match q.mode { ImportMode::Replace => "replace", ImportMode::Merge => "merge" },
        "format": doc.format,
        "filename": doc.filename,
        "parser": outcome.parser,
        "model_used": outcome.model_used,
        "holdings": outcome.holdings,
        "count": outcome.holdings.len(),
        "imported": imported,
        "warnings": outcome.warnings,
        "skipped": outcome.skipped,
    }))
    .into_response()
}

async fn create_holding(
    State(state): State<AppState>,
    Json(input): Json<CreateHoldingInput>,
) -> Response {
    let Some(symbol) = clean_symbol(&input.symbol) else {
        return err(StatusCode::BAD_REQUEST, "symbol is not a valid ticker");
    };
    if !(input.quantity.is_finite() && input.quantity > 0.0) {
        return err(
            StatusCode::BAD_REQUEST,
            "quantity must be a positive number",
        );
    }
    let parsed = finalize(ParsedHolding {
        symbol,
        raw_symbol: input.symbol.trim().to_string(),
        description: input.description.as_deref().and_then(clean_text),
        quantity: input.quantity,
        avg_cost: input.avg_cost,
        currency: input.currency.as_deref().and_then(clean_currency),
        account: input.account.as_deref().and_then(clean_text),
        market_price: None,
        market_value: None,
        is_cdr: input.is_cdr,
    });
    let now = Utc::now();
    let holding = PortfolioHolding {
        id: None,
        symbol: parsed.symbol,
        raw_symbol: parsed.raw_symbol,
        description: parsed.description,
        quantity: parsed.quantity,
        avg_cost: parsed.avg_cost,
        currency: parsed.currency,
        account: parsed.account,
        market_price: None,
        market_value: None,
        is_cdr: parsed.is_cdr,
        source: HoldingSource::Manual,
        source_file: None,
        imported_at: now,
        updated_at: now,
    };
    match PortfolioRepo::new(&state.db).insert(holding).await {
        Ok(h) => {
            let analysis = analysis_for(&state, &h.symbol).await;
            Json(json!({ "success": true, "holding": HoldingView::build(h, analysis.as_ref()) }))
                .into_response()
        }
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

async fn update_holding(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpdateHoldingInput>,
) -> Response {
    let Some(oid) = parse_oid(&id) else {
        return err(StatusCode::BAD_REQUEST, "invalid id");
    };
    if input.quantity.is_some_and(|q| !(q.is_finite() && q > 0.0)) {
        return err(
            StatusCode::BAD_REQUEST,
            "quantity must be a positive number",
        );
    }
    if input.avg_cost.is_some_and(|c| !(c.is_finite() && c >= 0.0)) {
        return err(
            StatusCode::BAD_REQUEST,
            "avg_cost must be a non-negative number",
        );
    }
    match PortfolioRepo::new(&state.db).update(&oid, input).await {
        Ok(Some(h)) => {
            let analysis = analysis_for(&state, &h.symbol).await;
            Json(json!({ "success": true, "holding": HoldingView::build(h, analysis.as_ref()) }))
                .into_response()
        }
        Ok(None) => err(StatusCode::NOT_FOUND, "holding not found"),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

async fn delete_holding(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(oid) = parse_oid(&id) else {
        return err(StatusCode::BAD_REQUEST, "invalid id");
    };
    match PortfolioRepo::new(&state.db).delete(&oid).await {
        Ok(true) => Json(json!({ "success": true })).into_response(),
        Ok(false) => err(StatusCode::NOT_FOUND, "holding not found"),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

async fn clear_portfolio(State(state): State<AppState>) -> Response {
    match PortfolioRepo::new(&state.db).clear().await {
        Ok(n) => Json(json!({ "success": true, "deleted": n })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_SEMICOLON: &str = r#"Account number;Account currency;Symbol;Description;Quantity;Average unit cost;Book value;Market price;Day Change $;Day Change %;Market Value;Day Change;Accrued Interest;Unrealized gain/loss;Unrealized gain/loss %;Loan Value
"687CWDA";CAD;GOOG;"ALPHABET INC CDR C$HDG";"176";"30.22540";"5319.67";"45.13000";"0.89000";"2.01%";"7942.88";"156.64";;"2623.21";"49.31%";
"687CWDB";USD;GOOG;"ALPHABET INC CL-C";"19";"165.01632";"3135.31";"284.12000";"5.90000";"2.12%";"5398.28";"112.10";;"2262.97";"72.18%";
"687CWDB";USD;ASML;"ASML HOLDING NV NY RG-NEW";"3";"718.93000";"2156.79";"1582.76000";"16.86000";"1.08%";"4748.28";"50.58";;"2591.49";"120.16%";
"#;

    #[test]
    fn parses_numbers_in_common_formats() {
        assert_eq!(parse_number("\"176\""), Some(176.0));
        assert_eq!(parse_number("1,234.56"), Some(1234.56));
        assert_eq!(parse_number("1.234,56"), Some(1234.56));
        assert_eq!(parse_number("1,5"), Some(1.5));
        assert_eq!(parse_number("$ 45.13"), Some(45.13));
        assert_eq!(parse_number("(12.5)"), Some(-12.5));
        assert_eq!(parse_number("2.01%"), Some(2.01));
        assert_eq!(parse_number("n/a"), None);
        assert_eq!(parse_number(""), None);
    }

    #[test]
    fn cleans_symbols_and_rejects_noise() {
        assert_eq!(clean_symbol("goog"), Some("GOOG".into()));
        assert_eq!(clean_symbol("NASDAQ:GOOG"), Some("GOOG".into()));
        assert_eq!(clean_symbol("GOOG:US"), Some("GOOG".into()));
        assert_eq!(clean_symbol("$AAPL"), Some("AAPL".into()));
        assert_eq!(clean_symbol("BRK.B"), Some("BRK-B".into()));
        assert_eq!(clean_symbol("shop.to"), Some("SHOP.TO".into()));
        assert_eq!(clean_symbol("TOTAL"), None);
        assert_eq!(clean_symbol("123"), None);
        assert_eq!(clean_symbol("ALPHABET INC"), None);
        assert_eq!(clean_symbol(""), None);
    }

    #[test]
    fn heuristic_parses_semicolon_export_with_cdr_detection() {
        let out = parse_heuristic(SAMPLE_SEMICOLON);
        assert_eq!(out.parser, ParserKind::Heuristic);
        assert!(out.warnings.is_empty(), "{:?}", out.warnings);
        assert_eq!(out.holdings.len(), 3);
        let cdr = &out.holdings[0];
        assert_eq!(cdr.symbol, "GOOG");
        assert!(cdr.is_cdr);
        assert_eq!(cdr.currency.as_deref(), Some("CAD"));
        assert_eq!(cdr.account.as_deref(), Some("687CWDA"));
        assert_eq!(cdr.quantity, 176.0);
        assert!((cdr.avg_cost.unwrap() - 30.2254).abs() < 1e-6);
        assert!((cdr.market_value.unwrap() - 7942.88).abs() < 1e-6);
        let us = &out.holdings[1];
        assert!(!us.is_cdr);
        assert_eq!(us.currency.as_deref(), Some("USD"));
        assert_eq!(out.holdings[2].symbol, "ASML");
    }

    #[test]
    fn heuristic_parses_comma_csv_and_derives_avg_cost_from_book_value() {
        let csv = "Ticker,Shares,Cost Basis,Name\nAAPL,10,\"1,500.00\",Apple Inc\nMSFT,5,2000,Microsoft\nCash,,100,\n";
        let out = parse_heuristic(csv);
        assert_eq!(out.holdings.len(), 2);
        assert_eq!(out.holdings[0].symbol, "AAPL");
        assert_eq!(out.holdings[0].avg_cost, Some(150.0));
        assert_eq!(out.holdings[1].avg_cost, Some(400.0));
        assert!(out.skipped.iter().any(|s| s.contains("Cash")));
    }

    #[test]
    fn heuristic_parses_tab_separated_spreadsheet_text() {
        let tsv = "# Sheet: Holdings\nSymbol\tQuantity\tAverage Price\tCurrency\nSHOP.TO\t12\t80.5\tCAD\nNVDA\t3\t120\tUSD\n";
        let out = parse_heuristic(tsv);
        assert_eq!(out.holdings.len(), 2);
        assert_eq!(out.holdings[0].symbol, "SHOP.TO");
        assert_eq!(out.holdings[0].currency.as_deref(), Some("CAD"));
        assert_eq!(out.holdings[1].avg_cost, Some(120.0));
    }

    #[test]
    fn heuristic_parses_json_arrays() {
        let json = r#"{"account":"x","positions":[{"ticker":"AMZN","qty":16,"averageCost":169.86},{"ticker":"META","qty":"1","averageCost":"549.13"}]}"#;
        let out = parse_heuristic(json);
        assert_eq!(out.holdings.len(), 2);
        assert_eq!(out.holdings[0].symbol, "AMZN");
        assert_eq!(out.holdings[1].quantity, 1.0);
        assert_eq!(out.holdings[1].avg_cost, Some(549.13));
    }

    #[test]
    fn heuristic_scans_free_text_without_headers() {
        let text = "My holdings as of today:\nAAPL 10 shares\nMSFT 5\ntotal value 5000\n";
        let out = parse_heuristic(text);
        assert_eq!(out.holdings.len(), 2);
        assert!(!out.warnings.is_empty());
        assert_eq!(out.holdings[0].symbol, "AAPL");
        assert_eq!(out.holdings[0].quantity, 10.0);
    }

    #[test]
    fn html_tables_decode_to_tab_rows() {
        let html = "<html><table><tr><th>Symbol</th><th>Quantity</th></tr><tr><td>NKE</td><td>10</td></tr></table></html>";
        let doc = decode_document("export.html", html.as_bytes()).unwrap();
        assert_eq!(doc.format, "html");
        let out = parse_heuristic(&doc.text);
        assert_eq!(out.holdings.len(), 1);
        assert_eq!(out.holdings[0].symbol, "NKE");
    }

    #[test]
    fn decode_rejects_pdf_and_binary() {
        assert!(decode_document("a.pdf", b"%PDF-1.4 ...").is_err());
        let garbage: Vec<u8> = (0..200).map(|i| (i % 7) as u8).collect();
        assert!(decode_document("a.bin", &garbage).is_err());
    }

    #[test]
    fn llm_items_are_validated_against_the_document() {
        let chunk = SAMPLE_SEMICOLON.to_ascii_uppercase();
        let mut skipped = vec![];
        let good = json!({"symbol": "GOOG", "quantity": "176", "avg_cost": 30.2254, "currency": "cad", "account": "687CWDA", "description": "ALPHABET INC CDR C$HDG"});
        let h = llm_item_to_holding(&good, &chunk, &mut skipped).unwrap();
        assert!(h.is_cdr);
        assert_eq!(h.currency.as_deref(), Some("CAD"));
        let hallucinated = json!({"symbol": "TSLA", "quantity": 5});
        assert!(llm_item_to_holding(&hallucinated, &chunk, &mut skipped).is_none());
        assert!(skipped.iter().any(|s| s.contains("TSLA")));
        let no_qty = json!({"symbol": "ASML"});
        assert!(llm_item_to_holding(&no_qty, &chunk, &mut skipped).is_none());
    }

    #[test]
    fn extracts_json_from_fenced_replies() {
        let reply = "```json\n{\"holdings\":[{\"symbol\":\"A\",\"quantity\":1}]}\n```";
        let v = extract_json_object(reply).unwrap();
        assert_eq!(v["holdings"].as_array().unwrap().len(), 1);
        assert!(extract_json_object("no json here").is_none());
    }

    fn analysis(symbol: &str, sector: &str, cap: f64, rsi: f64, oversold: bool) -> StockAnalysis {
        StockAnalysis {
            id: None,
            symbol: symbol.into(),
            price: 100.0,
            price_change: Some(1.0),
            price_change_percent: Some(1.0),
            rsi: Some(rsi),
            sma_20: None,
            sma_50: None,
            macd: None,
            volume: None,
            market_cap: Some(cap),
            sector: Some(sector.into()),
            is_oversold: oversold,
            is_overbought: false,
            analyzed_at: Utc::now(),
            bollinger: None,
            stochastic: None,
            earnings: None,
            technicals: None,
            news: None,
        }
    }

    fn holding(
        symbol: &str,
        qty: f64,
        cost: f64,
        currency: &str,
        cdr: bool,
        mv: Option<f64>,
    ) -> PortfolioHolding {
        let now = Utc::now();
        PortfolioHolding {
            id: None,
            symbol: symbol.into(),
            raw_symbol: symbol.into(),
            description: None,
            quantity: qty,
            avg_cost: Some(cost),
            currency: Some(currency.into()),
            account: Some("A".into()),
            market_price: None,
            market_value: mv,
            is_cdr: cdr,
            source: HoldingSource::Import,
            source_file: None,
            imported_at: now,
            updated_at: now,
        }
    }

    #[test]
    fn views_use_live_price_for_listings_and_import_value_for_cdrs() {
        let mut analyses = HashMap::new();
        analyses.insert(
            "GOOG".to_string(),
            analysis("GOOG", "Technology", 2e12, 55.0, false),
        );
        let holdings = vec![
            holding("GOOG", 10.0, 50.0, "USD", false, Some(1.0)),
            holding("GOOG", 100.0, 30.0, "CAD", true, Some(4500.0)),
            holding("ZZZZ", 1.0, 1.0, "USD", false, None),
        ];
        let (views, positions, summary) = build_views(holdings, &analyses);
        assert_eq!(views[0].value_source, Some(ValueSource::Live));
        assert_eq!(views[0].current_value, Some(1000.0));
        assert_eq!(views[0].unrealized_pnl, Some(500.0));
        assert_eq!(views[1].value_source, Some(ValueSource::Import));
        assert_eq!(views[1].current_value, Some(4500.0));
        assert_eq!(views[1].day_change_value, Some(45.0));
        assert_eq!(views[2].current_value, None);
        assert_eq!(positions.len(), 2);
        assert_eq!(positions[0].symbol, "GOOG");
        assert_eq!(positions[0].lots, 2);
        assert_eq!(summary.unanalyzed_symbols, vec!["ZZZZ".to_string()]);
        assert_eq!(
            summary
                .totals
                .iter()
                .find(|t| t.currency == "USD")
                .unwrap()
                .market_value,
            1000.0
        );
    }

    #[test]
    fn related_ranks_same_sector_oversold_names_and_skips_held() {
        let mut analyses = HashMap::new();
        analyses.insert(
            "GOOG".to_string(),
            analysis("GOOG", "Technology", 2e12, 55.0, false),
        );
        analyses.insert(
            "XOM".to_string(),
            analysis("XOM", "Energy", 4e11, 50.0, false),
        );
        let (_, positions, _) = build_views(
            vec![
                holding("GOOG", 10.0, 50.0, "USD", false, None),
                holding("XOM", 1.0, 50.0, "USD", false, None),
            ],
            &analyses,
        );
        let universe = vec![
            analysis("GOOG", "Technology", 2e12, 55.0, false),
            analysis("MSFT", "Technology", 3e12, 60.0, false),
            analysis("ORCL", "Technology", 3e11, 28.0, true),
            analysis("CVX", "Energy", 3e11, 45.0, false),
            analysis("TINY", "Technology", 1e8, 10.0, true),
            analysis("JPM", "Financials", 5e11, 50.0, false),
            analysis("FAR", "Financials", 1e10, 50.0, false),
        ];
        let related = rank_related(&positions, &universe, 2e9, 10);
        let symbols: Vec<&str> = related.iter().map(|r| r.symbol.as_str()).collect();
        assert!(!symbols.contains(&"GOOG"));
        assert!(!symbols.contains(&"TINY"), "below the market-cap floor");
        assert!(!symbols.contains(&"FAR"), "neither sector nor size peer");
        assert_eq!(symbols[0], "ORCL", "{symbols:?}");
        assert!(related[0].reason.contains("Same sector"));
        assert!(related[0].reason.contains("oversold"));
        assert!(related[0].related_to.contains(&"GOOG".to_string()));
        assert_eq!(symbols[1], "MSFT", "{symbols:?}");
        let jpm = related
            .iter()
            .find(|r| r.symbol == "JPM")
            .expect("size peer of XOM");
        assert!(jpm.reason.contains("Similar size to XOM"), "{}", jpm.reason);
        assert!(!jpm.reason.contains("Same sector"));
    }

    #[test]
    fn related_falls_back_to_size_peers_when_sectors_are_missing() {
        let mut no_sector = analysis("GOOG", "x", 2e12, 55.0, false);
        no_sector.sector = None;
        let mut analyses = HashMap::new();
        analyses.insert("GOOG".to_string(), no_sector);
        let (_, positions, _) = build_views(
            vec![holding("GOOG", 10.0, 50.0, "USD", false, None)],
            &analyses,
        );
        let mut universe = vec![
            analysis("NVDA", "x", 4e12, 25.0, true),
            analysis("MSFT", "x", 3e12, 60.0, false),
            analysis("CVX", "x", 3e11, 20.0, true),
        ];
        for a in &mut universe {
            a.sector = None;
        }
        let related = rank_related(&positions, &universe, 2e9, 10);
        let symbols: Vec<&str> = related.iter().map(|r| r.symbol.as_str()).collect();
        assert_eq!(symbols, vec!["NVDA", "MSFT"], "{symbols:?}");
        assert!(related[0].reason.starts_with("Similar size to GOOG"));
        assert!(related[0].reason.contains("oversold"));
        assert_eq!(related[0].related_to, vec!["GOOG".to_string()]);
        // Nothing held with market data → nothing to relate to.
        assert!(rank_related(&[], &universe, 2e9, 10).is_empty());
    }
}
