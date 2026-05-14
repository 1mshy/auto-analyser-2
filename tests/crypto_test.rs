//! Integration tests for `crypto` module. None of these hit live
//! CoinGecko — the HTTP boundary is swapped out via the
//! `CoinGeckoFetcher` trait.

use anyhow::Result;
use async_trait::async_trait;
use auto_analyser_2::crypto::{
    is_stale, parse_markets, CoinGeckoFetcher, CoinGeckoMarket, CryptoAsset,
};
use chrono::{Duration, Utc};

/// Canned CoinGecko `/coins/markets` payload covering the surfaces we
/// care about: numeric fields present, optional `image`, mixed signs on
/// 24h change.
const FIXTURE: &str = r#"[
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
    },
    {
        "id": "weird-coin",
        "symbol": "wrd",
        "name": "Weird Coin",
        "current_price": null,
        "market_cap": null,
        "price_change_24h": null,
        "price_change_percentage_24h": null,
        "total_volume": null,
        "image": null
    }
]"#;

/// Fake fetcher returning the fixture above. No network, no Mongo —
/// perfect for CI.
struct FakeFetcher;

#[async_trait]
impl CoinGeckoFetcher for FakeFetcher {
    async fn fetch_markets(&self) -> Result<Vec<CoinGeckoMarket>> {
        parse_markets(FIXTURE)
    }
}

#[tokio::test]
async fn fake_fetcher_round_trips_fixture() {
    let rows = FakeFetcher.fetch_markets().await.expect("fetch ok");
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0].id, "bitcoin");
    assert_eq!(rows[1].id, "ethereum");
    assert_eq!(rows[2].id, "weird-coin");
}

#[test]
fn parse_markets_handles_nulls() {
    let rows = parse_markets(FIXTURE).expect("parse ok");
    let weird = rows.iter().find(|r| r.id == "weird-coin").unwrap();
    assert!(weird.current_price.is_none());
    assert!(weird.market_cap.is_none());
}

#[test]
fn into_asset_normalises_symbol_and_defaults_to_zero() {
    let rows = parse_markets(FIXTURE).expect("parse ok");
    let now = Utc::now();
    let weird = rows
        .into_iter()
        .find(|r| r.id == "weird-coin")
        .unwrap()
        .into_asset(now);

    // Uppercased + missing numerics zero out
    assert_eq!(weird.symbol, "WRD");
    assert_eq!(weird.current_price, 0.0);
    assert_eq!(weird.market_cap, 0.0);
    assert_eq!(weird.volume_24h, 0.0);
    assert_eq!(weird.price_change_24h, 0.0);
    assert_eq!(weird.price_change_pct_24h, 0.0);
    assert_eq!(weird.updated_at, now);
}

#[test]
fn aggregate_top_n_by_market_cap_orders_descending() {
    let now = Utc::now();
    let rows = parse_markets(FIXTURE).expect("parse ok");
    let mut assets: Vec<CryptoAsset> = rows.into_iter().map(|r| r.into_asset(now)).collect();
    assets.sort_by(|a, b| {
        b.market_cap
            .partial_cmp(&a.market_cap)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    // bitcoin (1T) > ethereum (360B) > weird-coin (0)
    assert_eq!(assets[0].id, "bitcoin");
    assert_eq!(assets[1].id, "ethereum");
    assert_eq!(assets[2].id, "weird-coin");
}

#[test]
fn is_stale_marks_empty_or_old_caches() {
    let now = Utc::now();
    assert!(is_stale(&[], now), "empty cache must be stale");

    let fresh = CryptoAsset {
        mongo_id: None,
        id: "bitcoin".into(),
        symbol: "BTC".into(),
        name: "Bitcoin".into(),
        current_price: 50_000.0,
        market_cap: 1.0,
        price_change_24h: 0.0,
        price_change_pct_24h: 0.0,
        volume_24h: 0.0,
        image: None,
        updated_at: now,
    };
    assert!(!is_stale(&[fresh.clone()], now));

    let mut old = fresh;
    old.updated_at = now - Duration::seconds(600); // 10 minutes ago
    assert!(is_stale(&[old], now), "10-minute-old cache must be stale");
}
