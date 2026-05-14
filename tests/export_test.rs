//! Tests for `src/export.rs` (unit-14).
//!
//! These hit the pure `to_csv` / `to_json` serializers with hand-built
//! `StockAnalysis` fixtures — no Mongo, no Axum, no live server. The goal is
//! to lock down the column order, the empty-cell convention for `None`, and
//! the basic JSON shape, so that a regression in the serializer fails fast.

use auto_analyser_2::export::{to_csv, to_json};
use auto_analyser_2::models::{MACDIndicator, NasdaqTechnicals, StockAnalysis};
use chrono::TimeZone;

fn ts() -> chrono::DateTime<chrono::Utc> {
    // Deterministic timestamp so the snapshot doesn't drift.
    chrono::Utc.with_ymd_and_hms(2026, 5, 13, 12, 0, 0).unwrap()
}

fn nasdaq_with_52w(high: f64, low: f64) -> NasdaqTechnicals {
    NasdaqTechnicals {
        exchange: None,
        sector: None,
        industry: None,
        one_year_target: None,
        todays_high: None,
        todays_low: None,
        share_volume: None,
        average_volume: None,
        previous_close: None,
        fifty_two_week_high: Some(high),
        fifty_two_week_low: Some(low),
        pe_ratio: None,
        forward_pe: None,
        eps: None,
        annualized_dividend: None,
        ex_dividend_date: None,
        dividend_pay_date: None,
        current_yield: None,
        last_sale_price: None,
        net_change: None,
        percentage_change: None,
    }
}

fn full_stock() -> StockAnalysis {
    StockAnalysis {
        id: None,
        symbol: "AAPL".to_string(),
        price: 195.5,
        price_change: Some(2.5),
        price_change_percent: Some(1.3),
        rsi: Some(55.2),
        sma_20: Some(190.0),
        sma_50: Some(185.0),
        macd: Some(MACDIndicator {
            macd_line: 2.5,
            signal_line: 2.0,
            histogram: 0.5,
        }),
        volume: Some(50_000_000.0),
        market_cap: Some(3_000_000_000_000.0),
        sector: Some("Technology".to_string()),
        is_oversold: false,
        is_overbought: false,
        analyzed_at: ts(),
        bollinger: None,
        stochastic: None,
        earnings: None,
        technicals: Some(nasdaq_with_52w(200.0, 150.0)),
        news: None,
    }
}

fn sparse_stock() -> StockAnalysis {
    // Mostly `None` — exercises the "skip None as empty cell" rule.
    StockAnalysis {
        id: None,
        symbol: "TEST".to_string(),
        price: 10.0,
        price_change: None,
        price_change_percent: None,
        rsi: None,
        sma_20: None,
        sma_50: None,
        macd: None,
        volume: None,
        market_cap: None,
        sector: None,
        is_oversold: false,
        is_overbought: false,
        analyzed_at: ts(),
        bollinger: None,
        stochastic: None,
        earnings: None,
        technicals: None,
        news: None,
    }
}

#[test]
fn csv_header_row_matches_spec() {
    let csv = to_csv(&[]).expect("empty input is valid");
    let header = csv.lines().next().expect("header present");
    assert_eq!(
        header,
        "symbol,name,sector,market_cap,current_price,price_change_pct,rsi,sma_20,sma_50,macd,macd_signal,macd_hist,volume,52w_high,52w_low,analyzed_at"
    );
}

#[test]
fn csv_full_row_contains_expected_fields() {
    let csv = to_csv(&[full_stock()]).unwrap();
    let mut lines = csv.lines();
    let _header = lines.next();
    let row = lines.next().expect("data row present");

    // Spot-check key cells in order.
    assert!(row.starts_with("AAPL,"), "symbol first: got `{row}`");
    // name is empty (StockAnalysis has no name field) — adjacent commas.
    assert!(row.contains("AAPL,,Technology,"), "name empty cell");
    assert!(row.contains("195.5"), "price present");
    assert!(row.contains("55.2"), "rsi present");
    assert!(row.contains("2.5,2,0.5"), "macd triple present");
    assert!(row.contains("200,150"), "52w high/low present");
    assert!(row.contains("2026-05-13"), "analyzed_at rfc3339 date");
}

#[test]
fn csv_skips_none_as_empty_cells() {
    let csv = to_csv(&[sparse_stock()]).unwrap();
    let row = csv.lines().nth(1).expect("data row");

    // 16 columns -> 15 commas. None fields collapse to empty cells.
    let commas = row.chars().filter(|c| *c == ',').count();
    assert_eq!(commas, 15, "expected 15 commas, got row: {row}");

    // Columns: symbol, name, sector, market_cap, current_price, ...
    // sparse_stock fills only symbol and price -> name/sector/market_cap are
    // 3 empty cells, then "10", then 10 more empty cells, then analyzed_at.
    assert!(
        row.starts_with("TEST,,,,10,,,,,,,,,,,2026-"),
        "unexpected row: `{row}`"
    );
}

#[test]
fn csv_handles_empty_input() {
    let csv = to_csv(&[]).expect("empty input is valid");
    // Header only, no trailing data row.
    assert_eq!(csv.lines().count(), 1);
}

#[test]
fn csv_handles_multiple_rows() {
    let csv = to_csv(&[full_stock(), sparse_stock()]).unwrap();
    let lines: Vec<_> = csv.lines().collect();
    assert_eq!(lines.len(), 3, "header + 2 rows");
    assert!(lines[1].starts_with("AAPL,"));
    assert!(lines[2].starts_with("TEST,"));
}

#[test]
fn json_round_trips_stockanalysis() {
    let stocks = vec![full_stock(), sparse_stock()];
    let json = to_json(&stocks).unwrap();

    let parsed: Vec<StockAnalysis> = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed.len(), 2);
    assert_eq!(parsed[0].symbol, "AAPL");
    assert_eq!(parsed[1].symbol, "TEST");
    assert!(parsed[1].rsi.is_none());
}

#[test]
fn json_empty_input_serializes_to_empty_array() {
    let json = to_json(&[]).unwrap();
    let parsed: Vec<StockAnalysis> = serde_json::from_str(&json).unwrap();
    assert!(parsed.is_empty());
}
