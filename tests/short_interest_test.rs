//! Integration tests for the short-interest module.
//!
//! These tests use a stub `ShortInterestFetcher` driven by canned JSON
//! fixtures so they require no network access and no MongoDB. Logic that
//! depends on Mongo (`ShortInterestRepo`, `ShortInterestService::ensure_fresh`)
//! is covered by the inline unit tests in `src/short_interest.rs`. Here we
//! exercise the squeeze-score function over a small parametric table and the
//! Yahoo fixture parser end-to-end.

use anyhow::Result;
use async_trait::async_trait;
use auto_analyser_2::short_interest::{
    parse_short_interest, squeeze_score, ShortInterest, ShortInterestFetcher, SqueezeInputs,
};
use chrono::Utc;
use std::sync::Arc;

/// Stub fetcher that returns a fixed `ShortInterest` regardless of symbol.
struct StubFetcher {
    canned: ShortInterest,
}

#[async_trait]
impl ShortInterestFetcher for StubFetcher {
    async fn fetch(&self, _symbol: &str) -> Result<ShortInterest> {
        Ok(self.canned.clone())
    }
}

const YAHOO_FIXTURE: &str = r#"{
    "quoteSummary": {
        "result": [{
            "defaultKeyStatistics": {
                "shortPercentOfFloat": { "raw": 0.215, "fmt": "21.50%" },
                "sharesShort": { "raw": 45000000, "fmt": "45M" },
                "floatShares": { "raw": 210000000, "fmt": "210M" },
                "shortRatio": { "raw": 6.5, "fmt": "6.50" }
            }
        }],
        "error": null
    }
}"#;

#[test]
fn yahoo_fixture_parses_into_short_interest() {
    let parsed = parse_short_interest(YAHOO_FIXTURE, "GME").expect("parse ok");
    assert_eq!(parsed.symbol, "GME");
    // fraction-to-percent conversion: 0.215 -> 21.5
    assert!((parsed.short_pct_of_float - 21.5).abs() < 1e-9);
    assert!((parsed.short_interest - 45_000_000.0).abs() < 1e-3);
    assert!((parsed.float - 210_000_000.0).abs() < 1e-3);
    assert!((parsed.days_to_cover - 6.5).abs() < 1e-9);
}

#[test]
fn squeeze_score_input_table() {
    struct Case {
        name: &'static str,
        inputs: SqueezeInputs,
        expected: f64,
    }
    let cases = [
        Case {
            name: "tiny short, no rsi",
            inputs: SqueezeInputs {
                short_pct_of_float: 2.0,
                days_to_cover: 1.0,
                rsi: None,
            },
            // 2*1.5 + 1*5 = 8
            expected: 8.0,
        },
        Case {
            name: "moderate short, oversold rsi bumps",
            inputs: SqueezeInputs {
                short_pct_of_float: 15.0,
                days_to_cover: 4.0,
                rsi: Some(32.0),
            },
            // base = 15*1.5 + 4*5 = 42.5; rsi<40 -> +10 = 52.5
            expected: 52.5,
        },
        Case {
            name: "huge short, no rsi caps at 100",
            inputs: SqueezeInputs {
                short_pct_of_float: 80.0,
                days_to_cover: 20.0,
                rsi: None,
            },
            // base = 80*1.5 + 20*5 = 220, capped at 100
            expected: 100.0,
        },
        Case {
            name: "huge short + oversold may exceed 100",
            inputs: SqueezeInputs {
                short_pct_of_float: 80.0,
                days_to_cover: 20.0,
                rsi: Some(25.0),
            },
            // base capped at 100, +10 bump = 110
            expected: 110.0,
        },
        Case {
            name: "rsi exactly 40 -> no bump",
            inputs: SqueezeInputs {
                short_pct_of_float: 10.0,
                days_to_cover: 2.0,
                rsi: Some(40.0),
            },
            // base = 10*1.5 + 2*5 = 25; no bump
            expected: 25.0,
        },
    ];
    for c in cases {
        let got = squeeze_score(c.inputs);
        assert!(
            (got - c.expected).abs() < 1e-9,
            "case '{}' expected {}, got {}",
            c.name,
            c.expected,
            got,
        );
    }
}

#[tokio::test]
async fn stub_fetcher_returns_canned_record() {
    let canned = ShortInterest {
        symbol: "TEST".to_string(),
        company_name: Some("Test Co".to_string()),
        short_interest: 1_000_000.0,
        float: 10_000_000.0,
        short_pct_of_float: 10.0,
        days_to_cover: 3.0,
        report_date: Utc::now(),
        updated_at: Utc::now(),
    };
    let fetcher: Arc<dyn ShortInterestFetcher> = Arc::new(StubFetcher {
        canned: canned.clone(),
    });
    let got = fetcher.fetch("TEST").await.expect("stub returns ok");
    assert_eq!(got.symbol, canned.symbol);
    assert!((got.short_pct_of_float - canned.short_pct_of_float).abs() < 1e-9);
}
