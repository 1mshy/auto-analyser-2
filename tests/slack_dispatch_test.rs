//! Integration tests for the Slack notification channel.
//!
//! These exercise the `SlackChannel` end-to-end through a stub
//! `SlackTransport` that captures the JSON payload — no real HTTP / Slack call
//! is made. They cover:
//!
//! - the bullish (positive change) shape,
//! - the bearish (negative change) shape,
//! - propagation of optional `channel` / `username` / `icon_emoji` fields,
//! - transport errors bubble up as `Err`.

use std::sync::{Arc, Mutex};

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use chrono::Utc;
use serde_json::Value;

use auto_analyser_2::models::StockAnalysis;
use auto_analyser_2::notifications::channels::slack::{SlackChannel, SlackTransport};
use auto_analyser_2::notifications::channels::{Channel, RenderedMessage};
use auto_analyser_2::notifications::models::SlackChannelConfig;

/// Fake transport that records every payload it would have POSTed and lets the
/// test choose whether `post` succeeds or fails.
///
/// The captured vec is held behind an `Arc<Mutex>` so the test can keep a
/// handle to it after the transport is moved into the channel via `Box`.
struct FakeTransport {
    captured: Arc<Mutex<Vec<(String, Value)>>>,
    fail_with: Option<String>,
}

impl FakeTransport {
    fn ok() -> (Box<Self>, Captured) {
        let captured = Arc::new(Mutex::new(Vec::new()));
        let handle = Captured(captured.clone());
        (
            Box::new(Self {
                captured,
                fail_with: None,
            }),
            handle,
        )
    }

    fn failing(msg: impl Into<String>) -> (Box<Self>, Captured) {
        let captured = Arc::new(Mutex::new(Vec::new()));
        let handle = Captured(captured.clone());
        (
            Box::new(Self {
                captured,
                fail_with: Some(msg.into()),
            }),
            handle,
        )
    }
}

#[async_trait]
impl SlackTransport for FakeTransport {
    async fn post(&self, url: &str, payload: &Value) -> Result<()> {
        self.captured
            .lock()
            .unwrap()
            .push((url.to_string(), payload.clone()));
        if let Some(err) = &self.fail_with {
            return Err(anyhow!("{}", err));
        }
        Ok(())
    }
}

#[derive(Clone)]
struct Captured(Arc<Mutex<Vec<(String, Value)>>>);

impl Captured {
    fn last(&self) -> (String, Value) {
        self.0
            .lock()
            .unwrap()
            .last()
            .cloned()
            .expect("no payload captured")
    }

    fn call_count(&self) -> usize {
        self.0.lock().unwrap().len()
    }
}

fn sample_snapshot() -> StockAnalysis {
    StockAnalysis {
        id: None,
        symbol: "AAPL".into(),
        price: 150.25,
        price_change: Some(-3.0),
        price_change_percent: Some(-1.95),
        rsi: Some(28.5),
        sma_20: None,
        sma_50: None,
        macd: None,
        volume: None,
        market_cap: Some(3_000_000_000_000.0),
        sector: Some("Technology".into()),
        is_oversold: true,
        is_overbought: false,
        analyzed_at: Utc::now(),
        bollinger: None,
        stochastic: None,
        earnings: None,
        technicals: None,
        news: None,
    }
}

fn rendered_for(snapshot: StockAnalysis, stock_url: Option<String>) -> RenderedMessage {
    RenderedMessage {
        title: "Alert: AAPL – Oversold watcher".into(),
        body: "AAPL hit oversold at $150.25 (RSI 28.5).".into(),
        symbol: snapshot.symbol.clone(),
        matched_conditions: vec!["rsi_below(30)".into(), "price_below(160)".into()],
        snapshot,
        rule_name: "Oversold watcher".into(),
        created_at: Utc::now(),
        stock_url,
    }
}

fn basic_cfg() -> SlackChannelConfig {
    SlackChannelConfig {
        webhook_url: "https://hooks.slack.example/services/T/B/XYZ".into(),
        channel: None,
        username: None,
        icon_emoji: None,
    }
}

fn blocks(payload: &Value) -> &Vec<Value> {
    payload
        .get("blocks")
        .and_then(Value::as_array)
        .expect("payload missing `blocks` array")
}

#[tokio::test]
async fn dispatch_oversold_alert_emits_blocks_and_fallback_text() {
    let (transport, captured) = FakeTransport::ok();
    let channel = SlackChannel::with_transport(basic_cfg(), transport);

    let msg = rendered_for(
        sample_snapshot(),
        Some("https://app.example/stocks/AAPL".into()),
    );
    channel.send(&msg).await.expect("send should succeed");

    let (url, payload) = captured.last();
    assert_eq!(url, "https://hooks.slack.example/services/T/B/XYZ");

    // Required Slack fallback field
    assert_eq!(
        payload.get("text").and_then(Value::as_str),
        Some("AAPL hit oversold at $150.25 (RSI 28.5).")
    );

    let bs = blocks(&payload);
    assert!(bs.len() >= 3, "expected header + section + fields/context");

    // Header block has the title text verbatim.
    let header = &bs[0];
    assert_eq!(header.get("type").and_then(Value::as_str), Some("header"));
    assert_eq!(
        header
            .get("text")
            .and_then(|t| t.get("text"))
            .and_then(Value::as_str),
        Some("Alert: AAPL – Oversold watcher")
    );

    // Body section carries the rendered body verbatim.
    let body_section = &bs[1];
    assert_eq!(
        body_section.get("type").and_then(Value::as_str),
        Some("section")
    );
    assert_eq!(
        body_section
            .get("text")
            .and_then(|t| t.get("text"))
            .and_then(Value::as_str),
        Some("AAPL hit oversold at $150.25 (RSI 28.5).")
    );

    // Somewhere in the remaining blocks, the matched conditions should appear.
    let serialized = serde_json::to_string(&payload).unwrap();
    assert!(
        serialized.contains("rsi_below(30)"),
        "matched condition not rendered: {}",
        serialized
    );
    assert!(
        serialized.contains("Oversold watcher"),
        "rule name not rendered: {}",
        serialized
    );
    assert!(
        serialized.contains("https://app.example/stocks/AAPL"),
        "stock_url not rendered: {}",
        serialized
    );

    // Optional fields are omitted when unset.
    assert!(payload.get("channel").is_none());
    assert!(payload.get("username").is_none());
    assert!(payload.get("icon_emoji").is_none());
}

#[tokio::test]
async fn dispatch_forwards_optional_channel_username_and_icon() {
    let cfg = SlackChannelConfig {
        webhook_url: "https://hooks.slack.example/services/T/B/AAA".into(),
        channel: Some("#alerts".into()),
        username: Some("Auto Analyser".into()),
        icon_emoji: Some(":chart_with_upwards_trend:".into()),
    };
    let (transport, captured) = FakeTransport::ok();
    let channel = SlackChannel::with_transport(cfg, transport);

    let mut snap = sample_snapshot();
    snap.price_change = Some(2.5);
    snap.price_change_percent = Some(1.67);
    snap.is_oversold = false;
    let msg = rendered_for(snap, None);

    channel.send(&msg).await.expect("send should succeed");

    let (_, payload) = captured.last();
    assert_eq!(
        payload.get("channel").and_then(Value::as_str),
        Some("#alerts")
    );
    assert_eq!(
        payload.get("username").and_then(Value::as_str),
        Some("Auto Analyser")
    );
    assert_eq!(
        payload.get("icon_emoji").and_then(Value::as_str),
        Some(":chart_with_upwards_trend:")
    );

    // No stock_url provided -> context block still emitted with rule name only.
    let serialized = serde_json::to_string(&payload).unwrap();
    assert!(
        !serialized.contains("https://app.example"),
        "stock_url should not appear: {}",
        serialized
    );
    assert!(serialized.contains("Oversold watcher"));
}

#[tokio::test]
async fn transport_error_propagates_as_err() {
    let (transport, captured) = FakeTransport::failing("slack webhook returned 403: invalid token");
    let channel = SlackChannel::with_transport(basic_cfg(), transport);

    let result = channel.send(&rendered_for(sample_snapshot(), None)).await;

    assert!(result.is_err(), "expected Err from failing transport");
    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("403"),
        "expected error to include transport message, got: {}",
        err
    );
    // The transport should still have been invoked exactly once before failing.
    assert_eq!(captured.call_count(), 1);
}

#[tokio::test]
async fn send_test_emits_payload_without_alert_context() {
    let (transport, captured) = FakeTransport::ok();
    let channel = SlackChannel::with_transport(basic_cfg(), transport);

    channel.send_test().await.expect("test send should succeed");

    let (_, payload) = captured.last();
    // The fallback `text` should be present for Slack's notification.
    let text = payload
        .get("text")
        .and_then(Value::as_str)
        .expect("missing `text`");
    assert!(text.contains("Auto Analyser"));
    // Blocks should at minimum include a header and a section.
    assert!(blocks(&payload).len() >= 2);
}
