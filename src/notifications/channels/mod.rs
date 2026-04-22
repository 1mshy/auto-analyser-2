//! Pluggable notification delivery channels.
//!
//! New channels (Telegram, Signal, email, generic webhook) should:
//! 1. Add a variant to `models::ChannelKind` + a config struct to `ChannelConfig`.
//! 2. Drop a file in this folder implementing `NotificationChannel`.
//! 3. Wire it into `build_channel` below.

use anyhow::Result;
use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::models::StockAnalysis;
use crate::notifications::models::{ChannelConfig, NotificationChannel};

pub mod discord;

/// A message produced by the dispatcher, rendered once and fanned out to
/// every destination channel. Individual channels decide how to format it.
#[derive(Debug, Clone)]
pub struct RenderedMessage {
    pub title: String,
    pub body: String,
    pub symbol: String,
    pub matched_conditions: Vec<String>,
    pub snapshot: StockAnalysis,
    pub rule_name: String,
    pub created_at: DateTime<Utc>,
    /// Optional link back to the stock detail page — populated when
    /// `PUBLIC_BASE_URL` is configured.
    pub stock_url: Option<String>,
}

#[async_trait]
pub trait Channel: Send + Sync {
    async fn send(&self, msg: &RenderedMessage) -> Result<()>;
    /// Send a plain "is this webhook wired up?" message. Default impl calls `send`.
    async fn send_test(&self) -> Result<()>;
}

/// Build a dispatchable channel from its persisted config.
///
/// Returns a `Box<dyn Channel>`. If the channel is globally disabled (its
/// `enabled` flag is `false`) the caller is expected to skip it — the factory
/// does not filter here because test-sends ignore the flag on purpose.
pub fn build_channel(
    channel: &NotificationChannel,
    http: reqwest::Client,
) -> Box<dyn Channel> {
    match &channel.config {
        ChannelConfig::Discord(cfg) => Box::new(discord::DiscordChannel::new(cfg.clone(), http)),
    }
}
