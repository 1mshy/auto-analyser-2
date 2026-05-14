//! Slack incoming-webhook channel.
//!
//! Posts a message to a user-provided Slack incoming-webhook URL. Renders the
//! alert as a Block Kit message (header + section) with the plain `text` field
//! populated as the notification fallback. Optional Slack-specific fields
//! (`channel`, `username`, `icon_emoji`) are forwarded if configured.
//!
//! Slack incoming-webhook URLs return `200 OK` with the body `"ok"` on success
//! — we only inspect the HTTP status. The HTTP call is factored behind the
//! [`SlackTransport`] trait so tests can inject a fake.

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use chrono::Utc;
use serde_json::{json, Value};
use tracing::debug;

use super::{Channel, RenderedMessage};
use crate::notifications::models::SlackChannelConfig;

/// Pluggable HTTP transport for Slack. Production uses [`ReqwestSlackTransport`];
/// tests inject a fake that captures the payload.
#[async_trait]
pub trait SlackTransport: Send + Sync {
    async fn post(&self, url: &str, payload: &Value) -> Result<()>;
}

/// Default transport that posts via a shared `reqwest::Client`. Treats any
/// non-2xx response as an error — Slack returns 200 + "ok" on success.
pub struct ReqwestSlackTransport {
    http: reqwest::Client,
}

impl ReqwestSlackTransport {
    pub fn new(http: reqwest::Client) -> Self {
        Self { http }
    }
}

#[async_trait]
impl SlackTransport for ReqwestSlackTransport {
    async fn post(&self, url: &str, payload: &Value) -> Result<()> {
        let resp = self
            .http
            .post(url)
            .json(payload)
            .send()
            .await
            .map_err(|e| anyhow!("slack webhook error: {}", e))?;
        let status = resp.status();
        if status.is_success() {
            return Ok(());
        }
        let body = resp.text().await.unwrap_or_default();
        Err(anyhow!(
            "slack webhook returned {}: {}",
            status,
            truncate(&body, 300)
        ))
    }
}

pub struct SlackChannel {
    cfg: SlackChannelConfig,
    transport: Box<dyn SlackTransport>,
}

impl SlackChannel {
    /// Production constructor — wires up the default reqwest-backed transport.
    pub fn new(cfg: SlackChannelConfig, http: reqwest::Client) -> Self {
        Self {
            cfg,
            transport: Box::new(ReqwestSlackTransport::new(http)),
        }
    }

    /// Test constructor — accepts any [`SlackTransport`] implementation.
    pub fn with_transport(cfg: SlackChannelConfig, transport: Box<dyn SlackTransport>) -> Self {
        Self { cfg, transport }
    }

    fn build_payload(&self, msg: &RenderedMessage) -> Value {
        // `text` is required by Slack as the notification fallback — populate it
        // even when blocks are present so the OS-level notification still works.
        let mut payload = json!({
            "text": msg.body,
            "blocks": self.build_blocks(msg),
        });
        self.apply_overrides(&mut payload);
        payload
    }

    /// Forward optional Slack-specific overrides (`channel`, `username`,
    /// `icon_emoji`) onto a payload. Shared between alert + test sends.
    fn apply_overrides(&self, payload: &mut Value) {
        if let Some(ch) = &self.cfg.channel {
            payload["channel"] = json!(ch);
        }
        if let Some(u) = &self.cfg.username {
            payload["username"] = json!(u);
        }
        if let Some(icon) = &self.cfg.icon_emoji {
            payload["icon_emoji"] = json!(icon);
        }
    }

    fn build_blocks(&self, msg: &RenderedMessage) -> Value {
        let mut blocks: Vec<Value> = Vec::new();

        // Slack header text has a hard 150-char limit.
        blocks.push(json!({
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": truncate(&msg.title, 150),
                "emoji": true,
            }
        }));

        blocks.push(json!({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": msg.body,
            }
        }));

        let mut fields: Vec<Value> = Vec::new();
        fields.push(json!({
            "type": "mrkdwn",
            "text": format!("*Price*\n${:.2}", msg.snapshot.price),
        }));
        fields.push(json!({
            "type": "mrkdwn",
            "text": format!(
                "*Change*\n{}",
                format_signed_pct(msg.snapshot.price_change_percent)
            ),
        }));
        if let Some(rsi) = msg.snapshot.rsi {
            fields.push(json!({
                "type": "mrkdwn",
                "text": format!("*RSI*\n{:.1}", rsi),
            }));
        }
        if let Some(mc) = msg.snapshot.market_cap {
            fields.push(json!({
                "type": "mrkdwn",
                "text": format!("*Market cap*\n{}", format_big(mc)),
            }));
        }
        // Slack section blocks cap at 10 fields.
        if !fields.is_empty() {
            fields.truncate(10);
            blocks.push(json!({
                "type": "section",
                "fields": fields,
            }));
        }

        if !msg.matched_conditions.is_empty() {
            let bullets = msg
                .matched_conditions
                .iter()
                .map(|c| format!("• {}", c))
                .collect::<Vec<_>>()
                .join("\n");
            blocks.push(json!({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": format!("*Matched*\n{}", bullets),
                }
            }));
        }

        if let Some(url) = &msg.stock_url {
            blocks.push(json!({
                "type": "context",
                "elements": [{
                    "type": "mrkdwn",
                    "text": format!("<{}|View {}> • Rule: {}", url, msg.symbol, msg.rule_name),
                }]
            }));
        } else {
            blocks.push(json!({
                "type": "context",
                "elements": [{
                    "type": "mrkdwn",
                    "text": format!("Rule: {}", msg.rule_name),
                }]
            }));
        }

        Value::Array(blocks)
    }
}

#[async_trait]
impl Channel for SlackChannel {
    async fn send(&self, msg: &RenderedMessage) -> Result<()> {
        let payload = self.build_payload(msg);
        debug!("slack: sending alert for {}", msg.symbol);
        self.transport.post(&self.cfg.webhook_url, &payload).await
    }

    async fn send_test(&self) -> Result<()> {
        let body =
            "If you can read this, your Auto Analyser Slack webhook is configured correctly.";
        let mut payload = json!({
            "text": body,
            "blocks": [
                {
                    "type": "header",
                    "text": { "type": "plain_text", "text": "Test notification", "emoji": true }
                },
                {
                    "type": "section",
                    "text": { "type": "mrkdwn", "text": body }
                },
                {
                    "type": "context",
                    "elements": [{
                        "type": "mrkdwn",
                        "text": format!("Sent at {}", Utc::now().to_rfc3339()),
                    }]
                }
            ],
        });
        self.apply_overrides(&mut payload);
        self.transport.post(&self.cfg.webhook_url, &payload).await
    }
}

// ---------- small formatting helpers (kept local to avoid cross-channel coupling) ----------

fn format_signed_pct(v: Option<f64>) -> String {
    match v {
        Some(x) => {
            let sign = if x >= 0.0 { "+" } else { "" };
            format!("{}{:.2}%", sign, x)
        }
        None => "-".into(),
    }
}

fn format_big(v: f64) -> String {
    if v >= 1e12 {
        format!("${:.2}T", v / 1e12)
    } else if v >= 1e9 {
        format!("${:.2}B", v / 1e9)
    } else if v >= 1e6 {
        format!("${:.1}M", v / 1e6)
    } else {
        format!("${:.0}", v)
    }
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        let cut: String = s.chars().take(n).collect();
        format!("{}…", cut)
    }
}
