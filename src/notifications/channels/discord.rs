//! Discord webhook channel.
//!
//! Posts rich embeds to a user-provided webhook URL. Embed color is green or
//! red depending on the stock's price direction, and the matched conditions
//! are rendered as inline fields. If the webhook is rate-limited (HTTP 429)
//! the channel honors `Retry-After` for up to three attempts.

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use chrono::Utc;
use serde_json::{json, Value};
use std::time::Duration;
use tracing::{debug, warn};

use super::{Channel, RenderedMessage};
use crate::notifications::models::DiscordChannelConfig;

pub struct DiscordChannel {
    cfg: DiscordChannelConfig,
    http: reqwest::Client,
}

impl DiscordChannel {
    pub fn new(cfg: DiscordChannelConfig, http: reqwest::Client) -> Self {
        Self { cfg, http }
    }

    fn build_embed(&self, msg: &RenderedMessage) -> Value {
        let change_pct = msg.snapshot.price_change_percent.unwrap_or(0.0);
        // Discord embed colors are ints (0xRRGGBB).
        let color: i64 = if change_pct >= 0.0 {
            0x22c55e
        } else {
            0xef4444
        };

        let mut fields: Vec<Value> = Vec::new();

        fields.push(json!({
            "name": "Price",
            "value": format_money(msg.snapshot.price),
            "inline": true,
        }));
        fields.push(json!({
            "name": "Change",
            "value": format_signed_pct(msg.snapshot.price_change_percent),
            "inline": true,
        }));
        if let Some(rsi) = msg.snapshot.rsi {
            fields.push(json!({
                "name": "RSI",
                "value": format!("{:.1}", rsi),
                "inline": true,
            }));
        }
        if let Some(mc) = msg.snapshot.market_cap {
            fields.push(json!({
                "name": "Market cap",
                "value": format_big(mc),
                "inline": true,
            }));
        }
        if let Some(tech) = &msg.snapshot.technicals {
            if let (Some(hi), Some(lo)) = (tech.fifty_two_week_high, tech.fifty_two_week_low) {
                fields.push(json!({
                    "name": "52w range",
                    "value": format!("{} – {}", format_money(lo), format_money(hi)),
                    "inline": true,
                }));
            }
        }
        if !msg.matched_conditions.is_empty() {
            fields.push(json!({
                "name": "Matched",
                "value": msg.matched_conditions.iter()
                    .map(|c| format!("• {}", c))
                    .collect::<Vec<_>>()
                    .join("\n"),
                "inline": false,
            }));
        }

        let mut embed = json!({
            "title": msg.title,
            "description": msg.body,
            "color": color,
            "timestamp": msg.created_at.to_rfc3339(),
            "fields": fields,
            "footer": { "text": format!("Rule: {}", msg.rule_name) },
        });

        if let Some(url) = &msg.stock_url {
            embed["url"] = json!(url);
        }
        embed
    }

    fn build_payload(&self, msg: &RenderedMessage) -> Value {
        let mut payload = json!({ "embeds": [self.build_embed(msg)] });
        if let Some(u) = &self.cfg.username {
            payload["username"] = json!(u);
        }
        if let Some(a) = &self.cfg.avatar_url {
            payload["avatar_url"] = json!(a);
        }
        payload
    }

    async fn post(&self, payload: &Value) -> Result<()> {
        // Three-attempt retry with `Retry-After` honoring. Discord's webhook
        // rate limit is per-webhook and usually lifts in <2s.
        for attempt in 0..3 {
            let resp = self
                .http
                .post(&self.cfg.webhook_url)
                .json(payload)
                .send()
                .await;
            match resp {
                Ok(r) => {
                    let status = r.status();
                    if status.is_success() {
                        return Ok(());
                    }
                    if status.as_u16() == 429 {
                        let retry_after = r
                            .headers()
                            .get("retry-after")
                            .and_then(|v| v.to_str().ok())
                            .and_then(|s| s.parse::<f64>().ok())
                            .unwrap_or(1.0);
                        warn!(
                            "discord: rate limited (attempt {}), sleeping {:.1}s",
                            attempt + 1,
                            retry_after
                        );
                        tokio::time::sleep(Duration::from_millis((retry_after * 1000.0) as u64))
                            .await;
                        continue;
                    }
                    let body = r.text().await.unwrap_or_default();
                    return Err(anyhow!(
                        "discord webhook returned {}: {}",
                        status,
                        truncate(&body, 300)
                    ));
                }
                Err(e) => {
                    warn!("discord: POST failed (attempt {}): {}", attempt + 1, e);
                    if attempt == 2 {
                        return Err(anyhow!("discord webhook error: {}", e));
                    }
                    tokio::time::sleep(Duration::from_millis(500)).await;
                }
            }
        }
        Err(anyhow!("discord webhook: exhausted retries"))
    }
}

#[async_trait]
impl Channel for DiscordChannel {
    async fn send(&self, msg: &RenderedMessage) -> Result<()> {
        let payload = self.build_payload(msg);
        debug!("discord: sending alert for {}", msg.symbol);
        self.post(&payload).await
    }

    async fn send_test(&self) -> Result<()> {
        let payload = json!({
            "username": self.cfg.username.clone().unwrap_or_else(|| "Auto Analyser".into()),
            "avatar_url": self.cfg.avatar_url,
            "embeds": [{
                "title": "Test notification",
                "description": "If you can read this, your Auto Analyser Discord webhook is configured correctly.",
                "color": 0x3b82f6,
                "timestamp": Utc::now().to_rfc3339(),
            }],
        });
        self.post(&payload).await
    }
}

// ---------- small formatting helpers (no new crate) ----------

fn format_money(v: f64) -> String {
    if v >= 1000.0 {
        format!("${:.2}", v)
    } else {
        format!("${:.2}", v)
    }
}

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
    if s.len() <= n {
        s.to_string()
    } else {
        format!("{}…", &s[..n])
    }
}
