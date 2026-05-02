//! Data models for the notification / alert engine.
//!
//! These are persisted in four new Mongo collections:
//! - `notification_channels` – user-configured delivery targets (Discord webhooks for now)
//! - `watchlists`            – groups of symbols the user cares about
//! - `alert_rules`           – enabled rules with an AND/OR condition tree and channel fan-out
//! - `alert_state`           – per `(rule, symbol)` state (cooldown, hysteresis, MACD cross detection)
//! - `notification_history`  – audit log / inbox UI feed

use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

use crate::models::StockAnalysis;

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/// Delivery backend kind. Stored as a tagged string in Mongo so we can add
/// variants (telegram, signal, email, webhook) without migrating existing
/// documents — old rows still deserialize via `#[serde(other)]` in future.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChannelKind {
    Discord,
}

/// Config blob for a delivery channel. Tagged so each kind can own its own
/// shape; right now only Discord is implemented.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ChannelConfig {
    Discord(DiscordChannelConfig),
}

impl ChannelConfig {
    pub fn kind(&self) -> ChannelKind {
        match self {
            ChannelConfig::Discord(_) => ChannelKind::Discord,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordChannelConfig {
    pub webhook_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationChannel {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub name: String,
    #[serde(flatten)]
    pub config: ChannelConfig,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Watchlists
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Watchlist {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub name: String,
    pub symbols: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Positions (open holdings, used for P&L tracking)
// ---------------------------------------------------------------------------

/// A single open position. Flat list — no portfolio grouping (yet). P&L is
/// computed at response time against the latest cached `StockAnalysis.price`,
/// not persisted, so cache invalidation is the source of truth.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    /// Normalized uppercase symbol (e.g. "AAPL", "SHOP.TO").
    pub symbol: String,
    pub quantity: f64,
    pub cost_basis_per_share: f64,
    pub opened_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Position + computed P&L for client responses. Computed fields are
/// `Option` because the latest analysis may not be in the cache yet.
#[derive(Debug, Clone, Serialize)]
pub struct PositionView {
    #[serde(flatten)]
    pub position: Position,
    pub current_price: Option<f64>,
    pub market_value: Option<f64>,
    pub cost_basis_total: f64,
    pub unrealized_pnl: Option<f64>,
    pub unrealized_pnl_pct: Option<f64>,
}

impl PositionView {
    /// Construct a view by joining a `Position` against an optional current
    /// price. The cost-basis total is always known; everything else falls
    /// back to `None` when the price is missing.
    pub fn from_position(position: Position, current_price: Option<f64>) -> Self {
        let cost_basis_total = position.cost_basis_per_share * position.quantity;
        let market_value = current_price.map(|p| p * position.quantity);
        let unrealized_pnl = market_value.map(|mv| mv - cost_basis_total);
        let unrealized_pnl_pct = if cost_basis_total > 0.0 {
            unrealized_pnl.map(|p| (p / cost_basis_total) * 100.0)
        } else {
            None
        };
        Self {
            position,
            current_price,
            market_value,
            cost_basis_total,
            unrealized_pnl,
            unrealized_pnl_pct,
        }
    }
}

// ---------------------------------------------------------------------------
// Alert rules: conditions, scope, quiet hours
// ---------------------------------------------------------------------------

/// A leaf predicate over a single `StockAnalysis` snapshot.
///
/// Keep this enum additive — downstream UI builds its condition picker
/// directly from these variants, so adding a new metric is a one-line
/// change in `rules.rs` + a new switch case in the TS tree builder.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Condition {
    RsiBelow {
        value: f64,
    },
    RsiAbove {
        value: f64,
    },
    PriceBelow {
        value: f64,
    },
    PriceAbove {
        value: f64,
    },
    PriceChangePctBelow {
        value: f64,
    },
    PriceChangePctAbove {
        value: f64,
    },
    /// True when `(52w_low - price).abs() / 52w_low <= within_pct / 100`
    /// — i.e. we're within `within_pct` of the 52-week low.
    Near52WeekLow {
        within_pct: f64,
    },
    Near52WeekHigh {
        within_pct: f64,
    },
    /// Requires previous cycle's MACD histogram (via `alert_state.last_macd_histogram`).
    MacdBullishCross,
    MacdBearishCross,
    StochasticKBelow {
        value: f64,
    },
    StochasticKAbove {
        value: f64,
    },
    BollingerBandwidthBelow {
        value: f64,
    },
    IsOversold,
    IsOverbought,
    VolumeAbove {
        value: f64,
    },
    SectorEquals {
        sector: String,
    },
    /// `(52w_high - price) / 52w_high * 100 >= value`
    DropFromHighPct {
        value: f64,
    },
}

/// AND/OR/NOT tree of conditions. Stored as JSON under `conditions`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum ConditionGroup {
    And { children: Vec<ConditionGroup> },
    Or { children: Vec<ConditionGroup> },
    Not { child: Box<ConditionGroup> },
    Leaf { condition: Condition },
}

/// What set of symbols this rule applies to.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AlertScope {
    /// Every symbol that appears in any watchlist (union).
    AllWatched,
    /// Only symbols in a specific watchlist.
    Watchlist { watchlist_id: ObjectId },
    /// Explicit list of symbols.
    Symbols { symbols: Vec<String> },
    /// Every stock that gets analyzed (power-user mode).
    AllAnalyzed,
}

/// UTC quiet-hour window. Start/end are hours `0..24`. If `start_hour > end_hour`
/// the window wraps midnight (e.g. 22..7).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct QuietHours {
    pub start_hour: u8,
    pub end_hour: u8,
    /// Timezone name (e.g. "UTC", "America/New_York"). Stored for future use;
    /// current evaluation is in UTC.
    #[serde(default = "default_tz")]
    pub tz: String,
}

fn default_tz() -> String {
    "UTC".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertRule {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub name: String,
    pub enabled: bool,
    pub scope: AlertScope,
    pub conditions: ConditionGroup,
    #[serde(default)]
    pub cooldown_minutes: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quiet_hours: Option<QuietHours>,
    pub channel_ids: Vec<ObjectId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message_template: Option<String>,
    #[serde(default = "default_require_consecutive")]
    pub require_consecutive: u32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

fn default_require_consecutive() -> u32 {
    1
}

// ---------------------------------------------------------------------------
// Alert state (per-rule-per-symbol cooldown / hysteresis / cross detection)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertState {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub rule_id: ObjectId,
    pub symbol: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_triggered_at: Option<DateTime<Utc>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_matched_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub consecutive_matches: u32,
    /// Histogram from the previous evaluation — needed for MACD cross detection.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_macd_histogram: Option<f64>,
}

impl AlertState {
    pub fn new(rule_id: ObjectId, symbol: String) -> Self {
        AlertState {
            id: None,
            rule_id,
            symbol,
            last_triggered_at: None,
            last_matched_at: None,
            consecutive_matches: 0,
            last_macd_histogram: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Notification history (UI inbox)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeliveryResult {
    pub channel_id: ObjectId,
    pub channel_name: String,
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub sent_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationHistory {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub rule_id: ObjectId,
    pub rule_name: String,
    pub symbol: String,
    pub matched_conditions: Vec<String>,
    pub message: String,
    pub channel_ids: Vec<ObjectId>,
    pub delivered: Vec<DeliveryResult>,
    pub snapshot: StockAnalysis,
    pub created_at: DateTime<Utc>,
    /// UI read/unread flag — flipped by the frontend.
    #[serde(default)]
    pub read: bool,
}

// ---------------------------------------------------------------------------
// Transient types shared between evaluator and dispatcher
// ---------------------------------------------------------------------------

/// The product of rule evaluation for a single `(rule, symbol)` match,
/// awaiting dispatch.
#[derive(Debug, Clone)]
pub struct PendingNotification {
    pub rule: AlertRule,
    pub symbol: String,
    pub matched_conditions: Vec<String>,
    pub snapshot: StockAnalysis,
}

// ---------------------------------------------------------------------------
// API input DTOs (split from persisted model to avoid leaking _id/timestamps)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct CreateChannelInput {
    pub name: String,
    #[serde(flatten)]
    pub config: ChannelConfig,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateChannelInput {
    pub name: Option<String>,
    pub config: Option<ChannelConfig>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateWatchlistInput {
    pub name: String,
    #[serde(default)]
    pub symbols: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateWatchlistInput {
    pub name: Option<String>,
    pub symbols: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AddSymbolInput {
    pub symbol: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreatePositionInput {
    pub symbol: String,
    pub quantity: f64,
    pub cost_basis_per_share: f64,
    /// When the user opened the position. Defaults to `now()` if omitted.
    #[serde(default)]
    pub opened_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePositionInput {
    pub quantity: Option<f64>,
    pub cost_basis_per_share: Option<f64>,
    pub opened_at: Option<DateTime<Utc>>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateAlertRuleInput {
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub scope: AlertScope,
    pub conditions: ConditionGroup,
    #[serde(default)]
    pub cooldown_minutes: u32,
    #[serde(default)]
    pub quiet_hours: Option<QuietHours>,
    #[serde(default)]
    pub channel_ids: Vec<ObjectId>,
    #[serde(default)]
    pub message_template: Option<String>,
    #[serde(default = "default_require_consecutive")]
    pub require_consecutive: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAlertRuleInput {
    pub name: Option<String>,
    pub enabled: Option<bool>,
    pub scope: Option<AlertScope>,
    pub conditions: Option<ConditionGroup>,
    pub cooldown_minutes: Option<u32>,
    pub quiet_hours: Option<Option<QuietHours>>,
    pub channel_ids: Option<Vec<ObjectId>>,
    pub message_template: Option<Option<String>>,
    pub require_consecutive: Option<u32>,
}

fn default_true() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn position(quantity: f64, cost: f64) -> Position {
        let now = Utc::now();
        Position {
            id: None,
            symbol: "AAPL".to_string(),
            quantity,
            cost_basis_per_share: cost,
            opened_at: now,
            notes: None,
            created_at: now,
            updated_at: now,
        }
    }

    #[test]
    fn position_view_with_price_computes_pnl() {
        let view = PositionView::from_position(position(10.0, 100.0), Some(110.0));
        assert_eq!(view.cost_basis_total, 1000.0);
        assert_eq!(view.market_value, Some(1100.0));
        assert_eq!(view.unrealized_pnl, Some(100.0));
        assert!((view.unrealized_pnl_pct.unwrap() - 10.0).abs() < 1e-9);
    }

    #[test]
    fn position_view_loss_is_negative() {
        let view = PositionView::from_position(position(5.0, 100.0), Some(80.0));
        assert_eq!(view.unrealized_pnl, Some(-100.0));
        assert!((view.unrealized_pnl_pct.unwrap() + 20.0).abs() < 1e-9);
    }

    #[test]
    fn position_view_without_price_is_partial() {
        let view = PositionView::from_position(position(10.0, 100.0), None);
        assert_eq!(view.cost_basis_total, 1000.0);
        assert!(view.market_value.is_none());
        assert!(view.unrealized_pnl.is_none());
        assert!(view.unrealized_pnl_pct.is_none());
    }

    #[test]
    fn position_view_zero_cost_basis_skips_pct() {
        let view = PositionView::from_position(position(10.0, 0.0), Some(50.0));
        assert_eq!(view.cost_basis_total, 0.0);
        assert_eq!(view.market_value, Some(500.0));
        assert_eq!(view.unrealized_pnl, Some(500.0));
        assert!(view.unrealized_pnl_pct.is_none(), "no pct when basis is 0");
    }
}
