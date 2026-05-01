//! Notification dispatcher.
//!
//! Turns a `PendingNotification` into a delivered notification by:
//! 1. rendering the user's message template against the stock snapshot,
//! 2. fanning out to every `channel_id` referenced by the rule,
//! 3. persisting a `notification_history` row (with per-channel delivery status).

use std::collections::HashMap;

use anyhow::Result;
use chrono::Utc;
use mongodb::bson::oid::ObjectId;
use tracing::{debug, warn};

use crate::models::StockAnalysis;
use crate::notifications::channels::{build_channel, Channel, RenderedMessage};
use crate::notifications::models::{
    DeliveryResult, NotificationChannel, NotificationHistory, PendingNotification,
};
use crate::notifications::repo::NotificationsRepo;

pub struct Dispatcher {
    repo: NotificationsRepo,
    http: reqwest::Client,
    public_base_url: Option<String>,
}

impl Dispatcher {
    pub fn new(
        repo: NotificationsRepo,
        http: reqwest::Client,
        public_base_url: Option<String>,
    ) -> Self {
        Self {
            repo,
            http,
            public_base_url,
        }
    }

    /// Deliver every pending notification. Channel failures don't abort the
    /// batch — per-channel errors are captured in the history row and
    /// surfaced in the UI inbox.
    pub async fn dispatch_all(&self, pending: Vec<PendingNotification>) -> Result<()> {
        if pending.is_empty() {
            return Ok(());
        }

        // One fetch per cycle instead of per-notification — most rules reuse channels.
        let channels = self.repo.list_channels().await?;
        let by_id: HashMap<ObjectId, NotificationChannel> = channels
            .into_iter()
            .filter_map(|c| c.id.map(|id| (id, c)))
            .collect();

        for p in pending {
            if let Err(e) = self.dispatch_one(p, &by_id).await {
                warn!("dispatch error: {}", e);
            }
        }
        Ok(())
    }

    async fn dispatch_one(
        &self,
        pending: PendingNotification,
        channels_by_id: &HashMap<ObjectId, NotificationChannel>,
    ) -> Result<()> {
        let rendered = render_message(
            &pending.rule.name,
            pending.rule.message_template.as_deref(),
            &pending.snapshot,
            &pending.matched_conditions,
            self.public_base_url.as_deref(),
        );

        let mut delivered: Vec<DeliveryResult> = Vec::new();

        for cid in &pending.rule.channel_ids {
            let ch = match channels_by_id.get(cid) {
                Some(c) if c.enabled => c,
                Some(_) => {
                    debug!("channel {} disabled, skipping", cid);
                    continue;
                }
                None => {
                    warn!(
                        "channel {} referenced by rule {} not found",
                        cid, pending.rule.name
                    );
                    delivered.push(DeliveryResult {
                        channel_id: *cid,
                        channel_name: "<missing>".into(),
                        ok: false,
                        error: Some("channel no longer exists".into()),
                        sent_at: Utc::now(),
                    });
                    continue;
                }
            };
            let channel: Box<dyn Channel> = build_channel(ch, self.http.clone());
            match channel.send(&rendered).await {
                Ok(_) => delivered.push(DeliveryResult {
                    channel_id: *cid,
                    channel_name: ch.name.clone(),
                    ok: true,
                    error: None,
                    sent_at: Utc::now(),
                }),
                Err(e) => {
                    warn!("channel {} send failed: {}", ch.name, e);
                    delivered.push(DeliveryResult {
                        channel_id: *cid,
                        channel_name: ch.name.clone(),
                        ok: false,
                        error: Some(e.to_string()),
                        sent_at: Utc::now(),
                    });
                }
            }
        }

        let delivered_ok = delivered.iter().any(|d| d.ok);
        let entry = NotificationHistory {
            id: None,
            rule_id: pending.rule.id.unwrap_or_default(),
            rule_name: pending.rule.name.clone(),
            symbol: pending.symbol.clone(),
            matched_conditions: pending.matched_conditions.clone(),
            message: rendered.body.clone(),
            channel_ids: pending.rule.channel_ids.clone(),
            delivered,
            snapshot: pending.snapshot.clone(),
            created_at: Utc::now(),
            read: false,
        };
        self.repo.record_history(&entry).await?;
        if delivered_ok {
            if let Some(rule_id) = pending.rule.id {
                self.repo
                    .mark_state_triggered(&rule_id, &pending.symbol, Utc::now())
                    .await?;
            }
        }
        Ok(())
    }

    /// Deliver a single test notification for a specific rule + symbol.
    /// Used by `POST /api/alerts/rules/:id/test`.
    pub async fn dispatch_test(&self, pending: PendingNotification) -> Result<Vec<DeliveryResult>> {
        let channels = self
            .repo
            .list_channels_by_ids(&pending.rule.channel_ids)
            .await?;
        let by_id: HashMap<ObjectId, NotificationChannel> = channels
            .into_iter()
            .filter_map(|c| c.id.map(|id| (id, c)))
            .collect();

        let rendered = render_message(
            &pending.rule.name,
            pending.rule.message_template.as_deref(),
            &pending.snapshot,
            &pending.matched_conditions,
            self.public_base_url.as_deref(),
        );

        let mut out = Vec::new();
        for cid in &pending.rule.channel_ids {
            let ch = match by_id.get(cid) {
                Some(c) if c.enabled => c,
                Some(c) => {
                    out.push(DeliveryResult {
                        channel_id: *cid,
                        channel_name: c.name.clone(),
                        ok: false,
                        error: Some("channel disabled".into()),
                        sent_at: Utc::now(),
                    });
                    continue;
                }
                None => {
                    out.push(DeliveryResult {
                        channel_id: *cid,
                        channel_name: "<missing>".into(),
                        ok: false,
                        error: Some("channel not found".into()),
                        sent_at: Utc::now(),
                    });
                    continue;
                }
            };
            let channel = build_channel(ch, self.http.clone());
            let res = channel.send(&rendered).await;
            out.push(DeliveryResult {
                channel_id: *cid,
                channel_name: ch.name.clone(),
                ok: res.is_ok(),
                error: res.err().map(|e| e.to_string()),
                sent_at: Utc::now(),
            });
        }
        Ok(out)
    }

    /// Send a generic "this webhook works" ping for one channel.
    pub async fn test_channel(&self, channel_id: &ObjectId) -> Result<()> {
        let channel = self
            .repo
            .get_channel(channel_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("channel not found"))?;
        let ch = build_channel(&channel, self.http.clone());
        ch.send_test().await
    }
}

/// Render the user's template against the stock snapshot. Supports a small,
/// well-known set of `{{placeholders}}`; unknown placeholders are left
/// untouched so the user gets visible feedback when they typo.
fn render_message(
    rule_name: &str,
    template: Option<&str>,
    snapshot: &StockAnalysis,
    matched: &[String],
    public_base_url: Option<&str>,
) -> RenderedMessage {
    let default_body = format!(
        "{} triggered for {} at ${:.2} ({}).",
        rule_name,
        snapshot.symbol,
        snapshot.price,
        matched.join("; ")
    );
    let title = format!("Alert: {} – {}", snapshot.symbol, rule_name);

    let body = match template {
        Some(t) if !t.trim().is_empty() => substitute(t, snapshot, rule_name, matched),
        _ => default_body,
    };

    let stock_url = public_base_url.map(|base| {
        let base = base.trim_end_matches('/');
        format!("{}/stocks/{}", base, snapshot.symbol)
    });

    RenderedMessage {
        title,
        body,
        symbol: snapshot.symbol.clone(),
        matched_conditions: matched.to_vec(),
        snapshot: snapshot.clone(),
        rule_name: rule_name.to_string(),
        created_at: Utc::now(),
        stock_url,
    }
}

/// Trivial `{{placeholder}}` substitutor. No new dep required.
fn substitute(
    template: &str,
    snapshot: &StockAnalysis,
    rule_name: &str,
    matched: &[String],
) -> String {
    let mut vars: HashMap<&str, String> = HashMap::new();
    vars.insert("symbol", snapshot.symbol.clone());
    vars.insert("price", format!("{:.2}", snapshot.price));
    vars.insert("rule_name", rule_name.to_string());
    vars.insert(
        "rsi",
        snapshot
            .rsi
            .map(|r| format!("{:.1}", r))
            .unwrap_or_else(|| "-".into()),
    );
    vars.insert(
        "change_pct",
        snapshot
            .price_change_percent
            .map(|p| format!("{:.2}", p))
            .unwrap_or_else(|| "-".into()),
    );
    vars.insert(
        "market_cap",
        snapshot
            .market_cap
            .map(|m| format!("{:.0}", m))
            .unwrap_or_else(|| "-".into()),
    );
    vars.insert(
        "sector",
        snapshot.sector.clone().unwrap_or_else(|| "-".into()),
    );
    vars.insert(
        "52w_low",
        snapshot
            .technicals
            .as_ref()
            .and_then(|t| t.fifty_two_week_low)
            .map(|v| format!("{:.2}", v))
            .unwrap_or_else(|| "-".into()),
    );
    vars.insert(
        "52w_high",
        snapshot
            .technicals
            .as_ref()
            .and_then(|t| t.fifty_two_week_high)
            .map(|v| format!("{:.2}", v))
            .unwrap_or_else(|| "-".into()),
    );
    vars.insert("matched", matched.join(", "));

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::StockAnalysis;
    use chrono::Utc;

    fn sample() -> StockAnalysis {
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

    #[test]
    fn substitutes_known_placeholders() {
        let s = sample();
        let t = "{{symbol}} @ ${{price}} (RSI {{rsi}}, {{change_pct}}%)";
        let out = substitute(t, &s, "Dip rule", &[]);
        assert_eq!(out, "AAPL @ $150.25 (RSI 28.5, -1.95%)");
    }

    #[test]
    fn leaves_unknown_placeholders_alone() {
        let s = sample();
        let out = substitute("{{symbol}} {{nope}}", &s, "r", &[]);
        assert_eq!(out, "AAPL {{nope}}");
    }

    #[test]
    fn default_body_when_no_template() {
        let s = sample();
        let r = render_message("My rule", None, &s, &["RSI 28.5 < 30".into()], None);
        assert!(r.body.contains("AAPL"));
        assert!(r.body.contains("My rule"));
        assert!(r.body.contains("RSI 28.5 < 30"));
    }

    #[test]
    fn stock_url_from_public_base() {
        let s = sample();
        let r = render_message("r", None, &s, &[], Some("http://localhost:5173/"));
        assert_eq!(
            r.stock_url.as_deref(),
            Some("http://localhost:5173/stocks/AAPL")
        );
    }
}
