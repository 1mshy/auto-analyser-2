//! Telegram Bot API channel.
//!
//! Posts plain or formatted messages to a Telegram chat via the
//! `sendMessage` Bot API endpoint
//! (<https://core.telegram.org/bots/api#sendmessage>).
//!
//! The HTTP send is factored behind a [`TelegramTransport`] trait so the
//! integration test can inject a stub without hitting the network. The
//! default transport uses the shared `reqwest::Client` passed in by the
//! dispatcher.

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use chrono::Utc;
use serde_json::{json, Value};
use tracing::debug;

use super::{Channel, RenderedMessage};
use crate::notifications::models::TelegramChannelConfig;

/// Maximum length of a Telegram message body (Bot API caps at 4096 chars).
const TELEGRAM_MAX_TEXT_LEN: usize = 4096;

/// Result of a single HTTP send. `Ok(())` means the API returned 2xx;
/// `Err` carries the failure (network error, non-2xx with response body, etc.).
#[async_trait]
pub trait TelegramTransport: Send + Sync {
    /// POST `payload` to the Telegram Bot API `sendMessage` endpoint for
    /// the supplied `bot_token`. Implementations must return `Err` for
    /// any non-2xx response with the body included as the error string.
    async fn send_message(&self, bot_token: &str, payload: &Value) -> Result<()>;
}

/// Default transport backed by `reqwest::Client`.
pub struct ReqwestTelegramTransport {
    http: reqwest::Client,
}

impl ReqwestTelegramTransport {
    pub fn new(http: reqwest::Client) -> Self {
        Self { http }
    }
}

#[async_trait]
impl TelegramTransport for ReqwestTelegramTransport {
    async fn send_message(&self, bot_token: &str, payload: &Value) -> Result<()> {
        let url = format!("https://api.telegram.org/bot{}/sendMessage", bot_token);
        let resp = self.http.post(&url).json(payload).send().await?;
        let status = resp.status();
        if status.is_success() {
            return Ok(());
        }
        let body = resp.text().await.unwrap_or_default();
        // Token is never echoed — only the status and Telegram's response body.
        Err(anyhow!("telegram api returned {}: {}", status, body))
    }
}

/// Telegram dispatch channel.
pub struct TelegramChannel {
    cfg: TelegramChannelConfig,
    transport: Box<dyn TelegramTransport>,
}

impl TelegramChannel {
    /// Construct with the default `reqwest`-backed transport.
    pub fn new(cfg: TelegramChannelConfig, http: reqwest::Client) -> Self {
        Self {
            cfg,
            transport: Box::new(ReqwestTelegramTransport::new(http)),
        }
    }

    /// Construct with an injected transport — primarily for tests.
    pub fn with_transport(
        cfg: TelegramChannelConfig,
        transport: Box<dyn TelegramTransport>,
    ) -> Self {
        Self { cfg, transport }
    }

    /// Build the JSON body for `sendMessage`. Always includes `chat_id` and
    /// `text`; includes `parse_mode` only when the configured value is one of
    /// the modes Telegram accepts (`MarkdownV2`, `HTML`). Anything else is
    /// dropped so the API treats the message as plain text rather than
    /// rejecting it.
    fn build_payload(&self, text: &str) -> Value {
        let mut payload = json!({
            "chat_id": self.cfg.chat_id,
            "text": text,
        });
        if let Some(mode) = validated_parse_mode(self.cfg.parse_mode.as_deref()) {
            payload["parse_mode"] = json!(mode);
        }
        payload
    }

    /// Format a [`RenderedMessage`] as the Telegram message text.
    fn format_text(msg: &RenderedMessage) -> String {
        let mut text = format!("{}\n{}", msg.title, msg.body);
        if let Some(url) = &msg.stock_url {
            text.push('\n');
            text.push_str(url);
        }
        truncate(&text, TELEGRAM_MAX_TEXT_LEN)
    }
}

#[async_trait]
impl Channel for TelegramChannel {
    async fn send(&self, msg: &RenderedMessage) -> Result<()> {
        let text = Self::format_text(msg);
        let payload = self.build_payload(&text);
        debug!("telegram: sending alert for {}", msg.symbol);
        self.transport
            .send_message(&self.cfg.bot_token, &payload)
            .await
    }

    async fn send_test(&self) -> Result<()> {
        let text = format!(
            "Auto Analyser test notification ({}).\nIf you can read this, your Telegram channel is configured correctly.",
            Utc::now().to_rfc3339()
        );
        let payload = self.build_payload(&text);
        self.transport
            .send_message(&self.cfg.bot_token, &payload)
            .await
    }
}

/// Return `Some(mode)` only for modes Telegram's Bot API recognizes;
/// any other value (or `None`) yields `None`, which the caller renders as
/// "omit `parse_mode`" — i.e. plain text.
fn validated_parse_mode(mode: Option<&str>) -> Option<&str> {
    match mode {
        Some("MarkdownV2") => Some("MarkdownV2"),
        Some("HTML") => Some("HTML"),
        _ => None,
    }
}

/// Hard-truncate to `n` *characters* (not bytes) so we never split a UTF-8
/// codepoint. Telegram's 4096 limit is character-based.
fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        return s.to_string();
    }
    s.chars().take(n).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_mode_accepts_known_values() {
        assert_eq!(validated_parse_mode(Some("MarkdownV2")), Some("MarkdownV2"));
        assert_eq!(validated_parse_mode(Some("HTML")), Some("HTML"));
    }

    #[test]
    fn parse_mode_rejects_unknown_or_none() {
        assert_eq!(validated_parse_mode(None), None);
        assert_eq!(validated_parse_mode(Some("Markdown")), None);
        assert_eq!(validated_parse_mode(Some("")), None);
        assert_eq!(validated_parse_mode(Some("html")), None); // case-sensitive
    }

    #[test]
    fn build_payload_omits_parse_mode_for_plain_text() {
        let cfg = TelegramChannelConfig {
            bot_token: "TOKEN".into(),
            chat_id: "123".into(),
            parse_mode: None,
        };
        let ch = TelegramChannel::new(cfg, reqwest::Client::new());
        let payload = ch.build_payload("hello");
        assert_eq!(payload["chat_id"], "123");
        assert_eq!(payload["text"], "hello");
        assert!(payload.get("parse_mode").is_none());
    }

    #[test]
    fn build_payload_includes_validated_parse_mode() {
        let cfg = TelegramChannelConfig {
            bot_token: "TOKEN".into(),
            chat_id: "123".into(),
            parse_mode: Some("HTML".into()),
        };
        let ch = TelegramChannel::new(cfg, reqwest::Client::new());
        let payload = ch.build_payload("hello");
        assert_eq!(payload["parse_mode"], "HTML");
    }

    #[test]
    fn build_payload_drops_unrecognized_parse_mode() {
        let cfg = TelegramChannelConfig {
            bot_token: "TOKEN".into(),
            chat_id: "123".into(),
            parse_mode: Some("Markdown".into()),
        };
        let ch = TelegramChannel::new(cfg, reqwest::Client::new());
        let payload = ch.build_payload("hello");
        assert!(payload.get("parse_mode").is_none());
    }

    #[test]
    fn truncate_respects_character_count() {
        let s: String = "a".repeat(5000);
        let out = truncate(&s, 4096);
        assert_eq!(out.chars().count(), 4096);
    }
}
