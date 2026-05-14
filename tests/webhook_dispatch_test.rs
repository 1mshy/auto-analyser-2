//! Integration tests for the generic webhook notification channel.
//!
//! These tests exercise `WebhookChannel` through the `Channel` trait using
//! a stub `WebhookTransport` — no real outbound HTTP. They mirror the
//! fixture pattern used in `src/notifications/dispatcher.rs` tests.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::Result;
use async_trait::async_trait;
use chrono::Utc;
use serde_json::Value;

use auto_analyser_2::models::StockAnalysis;
use auto_analyser_2::notifications::channels::webhook::{
    WebhookChannel, WebhookRequest, WebhookResponse, WebhookTransport,
};
use auto_analyser_2::notifications::channels::{Channel, RenderedMessage};
use auto_analyser_2::notifications::models::WebhookChannelConfig;

struct StubTransport {
    last: Mutex<Option<WebhookRequest>>,
    status: u16,
    response_body: String,
}

impl StubTransport {
    fn ok() -> Arc<Self> {
        Arc::new(Self {
            last: Mutex::new(None),
            status: 200,
            response_body: String::new(),
        })
    }

    fn with_status(status: u16, body: &str) -> Arc<Self> {
        Arc::new(Self {
            last: Mutex::new(None),
            status,
            response_body: body.to_string(),
        })
    }

    fn captured(&self) -> WebhookRequest {
        self.last
            .lock()
            .unwrap()
            .clone()
            .expect("no request captured")
    }
}

#[async_trait]
impl WebhookTransport for StubTransport {
    async fn execute(&self, req: WebhookRequest) -> Result<WebhookResponse> {
        *self.last.lock().unwrap() = Some(req);
        Ok(WebhookResponse {
            status: self.status,
            body: self.response_body.clone(),
        })
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

fn sample_message() -> RenderedMessage {
    RenderedMessage {
        title: "Alert: AAPL – Dip rule".into(),
        body: "Dip rule triggered for AAPL at $150.25 (RSI 28.5 < 30).".into(),
        symbol: "AAPL".into(),
        matched_conditions: vec!["RSI 28.5 < 30".into()],
        snapshot: sample_snapshot(),
        rule_name: "Dip rule".into(),
        created_at: Utc::now(),
        stock_url: None,
    }
}

fn base_cfg(url: &str) -> WebhookChannelConfig {
    WebhookChannelConfig {
        url: url.to_string(),
        method: None,
        headers: None,
        body_template: None,
        content_type: None,
        timeout_ms: None,
    }
}

#[tokio::test]
async fn default_json_body_is_emitted_when_no_template() {
    let transport = StubTransport::ok();
    let channel = WebhookChannel::with_transport(
        base_cfg("https://hooks.example.com/alerts"),
        transport.clone(),
    );

    channel.send(&sample_message()).await.expect("delivery ok");

    let req = transport.captured();
    assert_eq!(req.method, "POST");
    assert_eq!(req.url, "https://hooks.example.com/alerts");

    let body: Value = serde_json::from_str(&req.body).expect("default payload is JSON");
    assert_eq!(body["title"], "Alert: AAPL – Dip rule");
    assert_eq!(body["symbol"], "AAPL");
    assert!(body["body"].as_str().unwrap().contains("AAPL"));
    let matched = body["matched_rules"]
        .as_array()
        .expect("matched_rules array");
    assert_eq!(matched.len(), 1);
    assert_eq!(matched[0], "RSI 28.5 < 30");
}

#[tokio::test]
async fn body_template_substitutes_dispatcher_compatible_placeholders() {
    let transport = StubTransport::ok();
    let mut cfg = base_cfg("https://hooks.example.com/alerts");
    cfg.body_template =
        Some(r#"{"text":"{{title}} for {{symbol}}: {{body}} ({{matched}})"}"#.to_string());
    let channel = WebhookChannel::with_transport(cfg, transport.clone());

    channel.send(&sample_message()).await.unwrap();

    let body = transport.captured().body;
    assert!(body.contains("Alert: AAPL – Dip rule"));
    assert!(body.contains("for AAPL"));
    assert!(body.contains("RSI 28.5 < 30"));
}

#[tokio::test]
async fn unknown_placeholders_are_left_intact() {
    let transport = StubTransport::ok();
    let mut cfg = base_cfg("https://hooks.example.com/alerts");
    cfg.body_template = Some("{{title}} :: {{not_a_var}}".into());
    let channel = WebhookChannel::with_transport(cfg, transport.clone());

    channel.send(&sample_message()).await.unwrap();

    let body = transport.captured().body;
    assert!(body.contains("Alert: AAPL – Dip rule"));
    assert!(body.contains("{{not_a_var}}"));
}

#[tokio::test]
async fn method_default_is_post_and_uppercased_when_set() {
    let transport = StubTransport::ok();
    let mut cfg = base_cfg("https://hooks.example.com/alerts");
    cfg.method = Some("patch".into());
    let channel = WebhookChannel::with_transport(cfg, transport.clone());
    channel.send(&sample_message()).await.unwrap();
    assert_eq!(transport.captured().method, "PATCH");
}

#[tokio::test]
async fn custom_headers_are_forwarded() {
    let transport = StubTransport::ok();
    let mut headers = HashMap::new();
    headers.insert("Authorization".into(), "Bearer abc123".into());
    headers.insert("X-Source".into(), "auto-analyser".into());
    let mut cfg = base_cfg("https://hooks.example.com/alerts");
    cfg.headers = Some(headers);
    let channel = WebhookChannel::with_transport(cfg, transport.clone());

    channel.send(&sample_message()).await.unwrap();

    let req = transport.captured();
    assert_eq!(
        req.headers.get("Authorization").map(String::as_str),
        Some("Bearer abc123")
    );
    assert_eq!(
        req.headers.get("X-Source").map(String::as_str),
        Some("auto-analyser")
    );
}

#[tokio::test]
async fn content_type_defaults_to_application_json() {
    let transport = StubTransport::ok();
    let channel =
        WebhookChannel::with_transport(base_cfg("https://example.com"), transport.clone());
    channel.send(&sample_message()).await.unwrap();
    let req = transport.captured();
    let ct = req
        .headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("content-type"))
        .map(|(_, v)| v.clone());
    assert_eq!(ct.as_deref(), Some("application/json"));
}

#[tokio::test]
async fn explicit_content_type_overrides_default() {
    let transport = StubTransport::ok();
    let mut cfg = base_cfg("https://example.com");
    cfg.content_type = Some("application/x-www-form-urlencoded".into());
    let channel = WebhookChannel::with_transport(cfg, transport.clone());
    channel.send(&sample_message()).await.unwrap();
    let req = transport.captured();
    let ct = req
        .headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("content-type"))
        .map(|(_, v)| v.clone());
    assert_eq!(ct.as_deref(), Some("application/x-www-form-urlencoded"));
}

#[tokio::test]
async fn timeout_ms_default_is_5000() {
    let transport = StubTransport::ok();
    let channel =
        WebhookChannel::with_transport(base_cfg("https://example.com"), transport.clone());
    channel.send(&sample_message()).await.unwrap();
    assert_eq!(transport.captured().timeout, Duration::from_millis(5000));
}

#[tokio::test]
async fn timeout_ms_threads_through_when_set() {
    let transport = StubTransport::ok();
    let mut cfg = base_cfg("https://example.com");
    cfg.timeout_ms = Some(750);
    let channel = WebhookChannel::with_transport(cfg, transport.clone());
    channel.send(&sample_message()).await.unwrap();
    assert_eq!(transport.captured().timeout, Duration::from_millis(750));
}

#[tokio::test]
async fn non_2xx_status_is_failure_and_includes_status_code() {
    let transport = StubTransport::with_status(503, "service unavailable");
    let channel = WebhookChannel::with_transport(base_cfg("https://example.com"), transport);
    let err = channel
        .send(&sample_message())
        .await
        .expect_err("expected failure for HTTP 503");
    let msg = err.to_string();
    assert!(msg.contains("503"), "error must mention status: {}", msg);
    assert!(
        msg.contains("service unavailable"),
        "error must include body: {}",
        msg
    );
}

#[tokio::test]
async fn non_2xx_body_is_truncated_to_500_chars() {
    let long_body = "z".repeat(2_000);
    let transport = StubTransport::with_status(500, &long_body);
    let channel = WebhookChannel::with_transport(base_cfg("https://example.com"), transport);
    let err = channel
        .send(&sample_message())
        .await
        .expect_err("expected failure");
    let msg = err.to_string();
    let z_count = msg.chars().filter(|c| *c == 'z').count();
    assert!(
        z_count <= 500,
        "body should be truncated to 500 chars, got {}",
        z_count
    );
    assert!(
        msg.contains('…'),
        "expected ellipsis on truncation: {}",
        msg
    );
}

#[tokio::test]
async fn send_test_uses_default_test_payload() {
    let transport = StubTransport::ok();
    let channel =
        WebhookChannel::with_transport(base_cfg("https://example.com"), transport.clone());
    channel.send_test().await.expect("send_test ok");
    let body = transport.captured().body;
    let v: Value = serde_json::from_str(&body).expect("test payload is JSON");
    assert_eq!(v["title"], "Test notification");
}
