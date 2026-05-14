//! Generic HTTP webhook channel.
//!
//! Posts alerts to a user-provided URL using configurable method, headers,
//! and body template. If `body_template` is set, `{{title}}`, `{{body}}`,
//! `{{symbol}}`, and `{{matched}}` are substituted (mirroring the dispatcher's
//! placeholder syntax). Otherwise a default JSON payload is emitted.
//!
//! The HTTP call is abstracted behind `WebhookTransport` so tests can inject
//! a fake without touching the network.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use tracing::debug;

use super::{Channel, RenderedMessage};
use crate::notifications::models::WebhookChannelConfig;

const DEFAULT_TIMEOUT_MS: u64 = 5000;
const DEFAULT_CONTENT_TYPE: &str = "application/json";
const DEFAULT_METHOD: &str = "POST";

/// The HTTP request a webhook channel emits. Lifted out so the transport
/// trait can be implemented without depending on `reqwest` types directly.
#[derive(Debug, Clone)]
pub struct WebhookRequest {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub timeout: Duration,
}

/// Minimal response shape the channel inspects.
#[derive(Debug, Clone)]
pub struct WebhookResponse {
    pub status: u16,
    pub body: String,
}

/// Abstracts the HTTP call so tests can inject a fake transport.
#[async_trait]
pub trait WebhookTransport: Send + Sync {
    async fn execute(&self, req: WebhookRequest) -> Result<WebhookResponse>;
}

/// Production transport backed by `reqwest::Client`.
pub struct ReqwestTransport {
    http: reqwest::Client,
}

impl ReqwestTransport {
    pub fn new(http: reqwest::Client) -> Self {
        Self { http }
    }
}

#[async_trait]
impl WebhookTransport for ReqwestTransport {
    async fn execute(&self, req: WebhookRequest) -> Result<WebhookResponse> {
        let method = reqwest::Method::from_bytes(req.method.as_bytes())
            .map_err(|e| anyhow!("invalid HTTP method '{}': {}", req.method, e))?;

        let mut builder = self.http.request(method, &req.url).timeout(req.timeout);
        for (k, v) in &req.headers {
            builder = builder.header(k, v);
        }
        builder = builder.body(req.body.clone());

        let resp = builder
            .send()
            .await
            .map_err(|e| anyhow!("webhook request failed: {}", e))?;
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        Ok(WebhookResponse { status, body })
    }
}

pub struct WebhookChannel {
    cfg: WebhookChannelConfig,
    transport: Arc<dyn WebhookTransport>,
}

impl WebhookChannel {
    /// Production constructor: wraps a shared `reqwest::Client` in the default
    /// transport. Tests should call [`WebhookChannel::with_transport`] instead.
    pub fn new(cfg: WebhookChannelConfig, http: reqwest::Client) -> Self {
        Self {
            cfg,
            transport: Arc::new(ReqwestTransport::new(http)),
        }
    }

    /// Test-only constructor accepting a custom transport.
    pub fn with_transport(cfg: WebhookChannelConfig, transport: Arc<dyn WebhookTransport>) -> Self {
        Self { cfg, transport }
    }

    fn build_body(&self, msg: &RenderedMessage) -> String {
        match self.cfg.body_template.as_deref() {
            Some(t) if !t.trim().is_empty() => substitute(t, msg),
            _ => default_payload(msg).to_string(),
        }
    }

    fn build_test_body(&self) -> String {
        match self.cfg.body_template.as_deref() {
            Some(t) if !t.trim().is_empty() => substitute_test(t),
            _ => json!({
                "title": "Test notification",
                "body": "If you can read this, your Auto Analyser webhook is configured correctly.",
                "symbol": "",
                "matched_rules": [],
            })
            .to_string(),
        }
    }

    fn assemble_request(&self, body: String) -> WebhookRequest {
        let method = self
            .cfg
            .method
            .as_deref()
            .map(|m| m.trim().to_uppercase())
            .filter(|m| !m.is_empty())
            .unwrap_or_else(|| DEFAULT_METHOD.to_string());

        let content_type = self
            .cfg
            .content_type
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(DEFAULT_CONTENT_TYPE)
            .to_string();

        let mut headers: HashMap<String, String> = HashMap::new();
        if let Some(extra) = &self.cfg.headers {
            for (k, v) in extra {
                headers.insert(k.clone(), v.clone());
            }
        }
        // User-supplied headers should not override Content-Type unless they
        // set it explicitly; we only insert when none is present.
        if !headers
            .keys()
            .any(|k| k.eq_ignore_ascii_case("content-type"))
        {
            headers.insert("Content-Type".to_string(), content_type);
        }

        let timeout = Duration::from_millis(self.cfg.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));

        WebhookRequest {
            url: self.cfg.url.clone(),
            method,
            headers,
            body,
            timeout,
        }
    }

    async fn send_request(&self, req: WebhookRequest) -> Result<()> {
        debug!(
            "webhook: {} {} ({} bytes)",
            req.method,
            req.url,
            req.body.len()
        );
        let resp = self.transport.execute(req).await?;
        if (200..300).contains(&resp.status) {
            return Ok(());
        }
        Err(anyhow!(
            "webhook returned HTTP {}: {}",
            resp.status,
            truncate(&resp.body, 500)
        ))
    }
}

#[async_trait]
impl Channel for WebhookChannel {
    async fn send(&self, msg: &RenderedMessage) -> Result<()> {
        let req = self.assemble_request(self.build_body(msg));
        self.send_request(req).await
    }

    async fn send_test(&self) -> Result<()> {
        let req = self.assemble_request(self.build_test_body());
        self.send_request(req).await
    }
}

// ---------- payload helpers ----------

fn default_payload(msg: &RenderedMessage) -> Value {
    json!({
        "title": msg.title,
        "body": msg.body,
        "symbol": msg.symbol,
        "matched_rules": msg.matched_conditions,
    })
}

/// Substitute `{{title}}`, `{{body}}`, `{{symbol}}`, `{{matched}}` placeholders.
/// Mirrors the dispatcher's behavior: unknown placeholders are left intact
/// so typos are visible. `{{matched}}` joins on `", "`.
fn substitute(template: &str, msg: &RenderedMessage) -> String {
    let mut vars: HashMap<&str, String> = HashMap::new();
    vars.insert("title", msg.title.clone());
    vars.insert("body", msg.body.clone());
    vars.insert("symbol", msg.symbol.clone());
    vars.insert("matched", msg.matched_conditions.join(", "));
    substitute_vars(template, &vars)
}

/// Test-send substitution — the channel has no real `RenderedMessage`.
fn substitute_test(template: &str) -> String {
    let mut vars: HashMap<&str, String> = HashMap::new();
    vars.insert("title", "Test notification".to_string());
    vars.insert(
        "body",
        "If you can read this, your Auto Analyser webhook is configured correctly.".to_string(),
    );
    vars.insert("symbol", String::new());
    vars.insert("matched", String::new());
    substitute_vars(template, &vars)
}

fn substitute_vars(template: &str, vars: &HashMap<&str, String>) -> String {
    let mut out = String::with_capacity(template.len());
    let bytes = template.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if i + 1 < bytes.len() && bytes[i] == b'{' && bytes[i + 1] == b'{' {
            if let Some(end) = template[i + 2..].find("}}") {
                let key = template[i + 2..i + 2 + end].trim();
                if let Some(val) = vars.get(key) {
                    out.push_str(val);
                } else {
                    out.push_str(&template[i..i + 2 + end + 2]);
                }
                i += 2 + end + 2;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(n).collect();
        out.push('…');
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::StockAnalysis;
    use chrono::Utc;
    use std::sync::Mutex;

    fn sample_msg() -> RenderedMessage {
        let snap = StockAnalysis {
            id: None,
            symbol: "AAPL".into(),
            price: 150.0,
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
            analyzed_at: Utc::now(),
            bollinger: None,
            stochastic: None,
            earnings: None,
            technicals: None,
            news: None,
        };
        RenderedMessage {
            title: "Alert: AAPL – Dip".into(),
            body: "AAPL dipped".into(),
            symbol: "AAPL".into(),
            matched_conditions: vec!["RSI < 30".into(), "near 52w low".into()],
            snapshot: snap,
            rule_name: "Dip".into(),
            created_at: Utc::now(),
            stock_url: None,
        }
    }

    struct CapturingTransport {
        last: Mutex<Option<WebhookRequest>>,
        status: u16,
        body: String,
    }

    impl CapturingTransport {
        fn new(status: u16) -> Arc<Self> {
            Arc::new(Self {
                last: Mutex::new(None),
                status,
                body: String::new(),
            })
        }
        fn with_body(status: u16, body: &str) -> Arc<Self> {
            Arc::new(Self {
                last: Mutex::new(None),
                status,
                body: body.to_string(),
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
    impl WebhookTransport for CapturingTransport {
        async fn execute(&self, req: WebhookRequest) -> Result<WebhookResponse> {
            *self.last.lock().unwrap() = Some(req);
            Ok(WebhookResponse {
                status: self.status,
                body: self.body.clone(),
            })
        }
    }

    fn cfg(url: &str) -> WebhookChannelConfig {
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
    async fn default_payload_is_json_with_known_fields() {
        let t = CapturingTransport::new(200);
        let ch = WebhookChannel::with_transport(cfg("https://example.com/hook"), t.clone());
        ch.send(&sample_msg()).await.expect("send ok");
        let req = t.captured();
        assert_eq!(req.method, "POST");
        assert_eq!(req.url, "https://example.com/hook");
        let v: Value = serde_json::from_str(&req.body).expect("json body");
        assert_eq!(v["title"], "Alert: AAPL – Dip");
        assert_eq!(v["symbol"], "AAPL");
        assert_eq!(v["body"], "AAPL dipped");
        assert_eq!(v["matched_rules"][0], "RSI < 30");
    }

    #[tokio::test]
    async fn default_content_type_is_json() {
        let t = CapturingTransport::new(200);
        let ch = WebhookChannel::with_transport(cfg("https://example.com/hook"), t.clone());
        ch.send(&sample_msg()).await.unwrap();
        let req = t.captured();
        let ct = req
            .headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("content-type"))
            .map(|(_, v)| v.clone())
            .expect("content-type header");
        assert_eq!(ct, "application/json");
    }

    #[tokio::test]
    async fn body_template_substitutes_known_placeholders_and_leaves_unknown() {
        let t = CapturingTransport::new(200);
        let mut c = cfg("https://example.com/hook");
        c.body_template =
            Some("title={{title}} symbol={{symbol}} matched={{matched}} oops={{nope}}".into());
        let ch = WebhookChannel::with_transport(c, t.clone());
        ch.send(&sample_msg()).await.unwrap();
        let body = t.captured().body;
        assert!(body.contains("title=Alert: AAPL – Dip"));
        assert!(body.contains("symbol=AAPL"));
        assert!(body.contains("matched=RSI < 30, near 52w low"));
        assert!(body.contains("oops={{nope}}"));
    }

    #[tokio::test]
    async fn custom_method_and_headers_applied() {
        let t = CapturingTransport::new(200);
        let mut headers = HashMap::new();
        headers.insert("X-Token".into(), "secret".into());
        headers.insert("Content-Type".into(), "text/plain".into());
        let mut c = cfg("https://example.com/hook");
        c.method = Some("put".into());
        c.headers = Some(headers);
        c.body_template = Some("hi".into());
        let ch = WebhookChannel::with_transport(c, t.clone());
        ch.send(&sample_msg()).await.unwrap();
        let req = t.captured();
        assert_eq!(req.method, "PUT");
        assert_eq!(
            req.headers.get("X-Token").map(String::as_str),
            Some("secret")
        );
        // Custom content-type honored, not overwritten.
        let ct = req
            .headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("content-type"))
            .map(|(_, v)| v.clone())
            .unwrap();
        assert_eq!(ct, "text/plain");
        assert_eq!(req.body, "hi");
    }

    #[tokio::test]
    async fn timeout_ms_threads_through() {
        let t = CapturingTransport::new(200);
        let mut c = cfg("https://example.com/hook");
        c.timeout_ms = Some(1234);
        let ch = WebhookChannel::with_transport(c, t.clone());
        ch.send(&sample_msg()).await.unwrap();
        assert_eq!(t.captured().timeout, Duration::from_millis(1234));
    }

    #[tokio::test]
    async fn default_timeout_is_5000ms() {
        let t = CapturingTransport::new(200);
        let ch = WebhookChannel::with_transport(cfg("https://example.com/hook"), t.clone());
        ch.send(&sample_msg()).await.unwrap();
        assert_eq!(
            t.captured().timeout,
            Duration::from_millis(DEFAULT_TIMEOUT_MS)
        );
    }

    #[tokio::test]
    async fn non_2xx_status_is_error_with_status_and_truncated_body() {
        let long_body = "x".repeat(2000);
        let t = CapturingTransport::with_body(500, &long_body);
        let ch = WebhookChannel::with_transport(cfg("https://example.com/hook"), t);
        let err = ch
            .send(&sample_msg())
            .await
            .expect_err("expected error for 500");
        let msg = err.to_string();
        assert!(msg.contains("500"), "missing status: {}", msg);
        // 500 chars + ellipsis byte sequence (3 UTF-8 bytes) — should be well under original 2000.
        assert!(msg.len() < 1200, "body not truncated: {} chars", msg.len());
        assert!(msg.contains('…'), "expected truncation ellipsis: {}", msg);
    }

    #[tokio::test]
    async fn send_test_emits_default_test_payload_when_no_template() {
        let t = CapturingTransport::new(200);
        let ch = WebhookChannel::with_transport(cfg("https://example.com/hook"), t.clone());
        ch.send_test().await.unwrap();
        let body = t.captured().body;
        let v: Value = serde_json::from_str(&body).expect("json body");
        assert_eq!(v["title"], "Test notification");
        assert!(v["matched_rules"].is_array());
    }

    #[tokio::test]
    async fn send_test_uses_body_template_if_provided() {
        let t = CapturingTransport::new(200);
        let mut c = cfg("https://example.com/hook");
        c.body_template = Some("test:{{title}}".into());
        let ch = WebhookChannel::with_transport(c, t.clone());
        ch.send_test().await.unwrap();
        assert_eq!(t.captured().body, "test:Test notification");
    }
}
