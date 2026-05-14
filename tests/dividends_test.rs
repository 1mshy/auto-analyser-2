//! Integration tests for the dividend module.
//!
//! These exercise the pure analytics + the `DividendFetcher` trait surface
//! against a canned stub. They do NOT hit Yahoo and do NOT touch MongoDB.

use anyhow::Result;
use async_trait::async_trait;
use auto_analyser_2::dividends::{
    annual_totals, build_summary, compute_five_year_cagr, infer_frequency, DividendFetcher,
    DividendPayment, DividendQuote,
};
use chrono::{Duration, Utc};

struct StubFetcher {
    payments: Vec<DividendPayment>,
    quote: DividendQuote,
}

#[async_trait]
impl DividendFetcher for StubFetcher {
    async fn fetch_payments(&self, _symbol: &str) -> Result<Vec<DividendPayment>> {
        Ok(self.payments.clone())
    }
    async fn fetch_quote(&self, _symbol: &str) -> Result<DividendQuote> {
        Ok(self.quote.clone())
    }
}

fn payment(year: i32, month: u32, day: u32, amount: f64) -> DividendPayment {
    let dt = chrono::TimeZone::with_ymd_and_hms(&Utc, year, month, day, 0, 0, 0).unwrap();
    DividendPayment {
        symbol: "TEST".into(),
        ex_date: dt.to_rfc3339(),
        pay_date: None,
        amount,
        frequency: None,
    }
}

#[tokio::test]
async fn stub_fetcher_round_trips_payments() {
    let payments = vec![
        payment(2020, 3, 1, 0.5),
        payment(2020, 6, 1, 0.5),
        payment(2020, 9, 1, 0.5),
        payment(2020, 12, 1, 0.5),
    ];
    let stub = StubFetcher {
        payments: payments.clone(),
        quote: DividendQuote {
            close: Some(50.0),
            ..Default::default()
        },
    };
    let fetched = stub.fetch_payments("TEST").await.unwrap();
    assert_eq!(fetched.len(), 4);
    let q = stub.fetch_quote("TEST").await.unwrap();
    assert_eq!(q.close, Some(50.0));
}

#[test]
fn five_year_cagr_growth_series() {
    // Hand-built series: 1.0 -> 1.61 over 4 spans (5 yearly points).
    // CAGR = 1.61^(1/4) - 1 ≈ 0.1265 -> 12.65%
    let totals = vec![
        (2018, 1.00),
        (2019, 1.10),
        (2020, 1.25),
        (2021, 1.42),
        (2022, 1.61),
    ];
    let cagr = compute_five_year_cagr(&totals).expect("expected Some");
    // CAGR = (1.61/1.0)^(1/4) - 1 ≈ 0.12644 -> ~12.64%
    let expected = (1.61f64.powf(0.25) - 1.0) * 100.0;
    assert!(
        (cagr - expected).abs() < 1e-6,
        "got {cagr}, expected {expected}"
    );
}

#[test]
fn five_year_cagr_skips_when_short() {
    // 3 years of data -> None per spec
    let totals = vec![(2020, 1.0), (2021, 1.1), (2022, 1.2)];
    assert!(compute_five_year_cagr(&totals).is_none());
}

#[test]
fn annual_totals_aggregates_quarterly() {
    let payments = vec![
        payment(2020, 3, 1, 0.25),
        payment(2020, 6, 1, 0.25),
        payment(2020, 9, 1, 0.25),
        payment(2020, 12, 1, 0.25),
        payment(2021, 3, 1, 0.30),
        payment(2021, 6, 1, 0.30),
        payment(2021, 9, 1, 0.30),
        payment(2021, 12, 1, 0.30),
    ];
    let totals = annual_totals(&payments);
    assert_eq!(totals.len(), 2);
    assert!((totals[0].1 - 1.00).abs() < 1e-9);
    assert!((totals[1].1 - 1.20).abs() < 1e-9);
}

#[test]
fn infer_frequency_recognises_monthly() {
    let now = Utc::now();
    let payments: Vec<DividendPayment> = (0..6)
        .rev()
        .map(|i| {
            let dt = now - Duration::days(30 * i as i64);
            DividendPayment {
                symbol: "M".into(),
                ex_date: dt.to_rfc3339(),
                pay_date: None,
                amount: 0.1,
                frequency: None,
            }
        })
        .collect();
    assert_eq!(infer_frequency(&payments).as_deref(), Some("monthly"));
}

#[tokio::test]
async fn build_summary_from_stub_payments() {
    let now = Utc::now();
    let payments: Vec<DividendPayment> = (0..4)
        .map(|i| {
            let dt = now - Duration::days(90 * (i + 1) as i64);
            DividendPayment {
                symbol: "TEST".into(),
                ex_date: dt.to_rfc3339(),
                pay_date: None,
                amount: 0.5,
                frequency: None,
            }
        })
        .collect();
    let quote = DividendQuote {
        close: Some(100.0),
        company_name: Some("Test Co".into()),
        ..Default::default()
    };
    let summary = build_summary("TEST", &payments, &quote);
    assert_eq!(summary.symbol, "TEST");
    assert_eq!(summary.company_name.as_deref(), Some("Test Co"));
    // 4 payments * 0.5 = 2.0 over trailing year
    assert!((summary.trailing_annual_dividend - 2.0).abs() < 1e-9);
    // 2.0 / 100.0 = 2.0%
    assert!((summary.trailing_yield_pct - 2.0).abs() < 1e-6);
    assert_eq!(summary.payment_count_5y, 4);
}
