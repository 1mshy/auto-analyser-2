//! CRUD helpers for the notification-related Mongo collections.
//!
//! Kept separate from `src/db.rs` so that the existing stock-analysis data
//! layer stays small and focused. The repo is constructed around a
//! `MongoDB` handle and exposes typed accessors for each collection.

use anyhow::{anyhow, Result};
use chrono::Utc;
use futures::stream::StreamExt;
use mongodb::{
    bson::{doc, oid::ObjectId, to_document, Document},
    options::{FindOptions, IndexOptions},
    Collection, IndexModel,
};

use crate::db::MongoDB;

use super::models::{
    AlertRule, AlertState, CreateAlertRuleInput, CreateChannelInput, CreatePositionInput,
    CreateWatchlistInput, NotificationChannel, NotificationHistory, Position, UpdateAlertRuleInput,
    UpdateChannelInput, UpdatePositionInput, UpdateWatchlistInput, Watchlist,
};

#[derive(Clone)]
pub struct NotificationsRepo {
    db: MongoDB,
}

impl NotificationsRepo {
    pub fn new(db: MongoDB) -> Self {
        Self { db }
    }

    // ----- collection handles --------------------------------------------

    pub fn channels(&self) -> Collection<NotificationChannel> {
        self.db.database().collection("notification_channels")
    }

    pub fn watchlists(&self) -> Collection<Watchlist> {
        self.db.database().collection("watchlists")
    }

    pub fn rules(&self) -> Collection<AlertRule> {
        self.db.database().collection("alert_rules")
    }

    pub fn state(&self) -> Collection<AlertState> {
        self.db.database().collection("alert_state")
    }

    pub fn history(&self) -> Collection<NotificationHistory> {
        self.db.database().collection("notification_history")
    }

    pub fn positions(&self) -> Collection<Position> {
        self.db.database().collection("positions")
    }

    // ----- indexes --------------------------------------------------------

    /// Create secondary indexes. Idempotent — Mongo ignores re-creations of
    /// identical specs. Called once at startup.
    pub async fn create_indexes(&self) -> Result<()> {
        self.channels()
            .create_index(IndexModel::builder().keys(doc! { "name": 1 }).build())
            .await?;
        self.watchlists()
            .create_index(IndexModel::builder().keys(doc! { "name": 1 }).build())
            .await?;
        self.rules()
            .create_index(IndexModel::builder().keys(doc! { "enabled": 1 }).build())
            .await?;
        self.state()
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "rule_id": 1, "symbol": 1 })
                    .options(IndexOptions::builder().unique(true).build())
                    .build(),
            )
            .await?;
        self.history()
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "created_at": -1 })
                    .build(),
            )
            .await?;
        self.history()
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "symbol": 1, "created_at": -1 })
                    .build(),
            )
            .await?;
        self.history()
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "rule_id": 1, "created_at": -1 })
                    .build(),
            )
            .await?;
        self.positions()
            .create_index(IndexModel::builder().keys(doc! { "symbol": 1 }).build())
            .await?;
        Ok(())
    }

    // ----- channels -------------------------------------------------------

    pub async fn list_channels(&self) -> Result<Vec<NotificationChannel>> {
        collect(self.channels().find(doc! {}).await?).await
    }

    pub async fn get_channel(&self, id: &ObjectId) -> Result<Option<NotificationChannel>> {
        Ok(self.channels().find_one(doc! { "_id": id }).await?)
    }

    pub async fn list_channels_by_ids(&self, ids: &[ObjectId]) -> Result<Vec<NotificationChannel>> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        collect(self.channels().find(doc! { "_id": { "$in": ids } }).await?).await
    }

    pub async fn create_channel(&self, input: CreateChannelInput) -> Result<NotificationChannel> {
        let channel = NotificationChannel {
            id: None,
            name: input.name,
            config: input.config,
            enabled: input.enabled,
            created_at: Utc::now(),
        };
        let res = self.channels().insert_one(&channel).await?;
        Ok(NotificationChannel {
            id: res.inserted_id.as_object_id(),
            ..channel
        })
    }

    pub async fn update_channel(
        &self,
        id: &ObjectId,
        update: UpdateChannelInput,
    ) -> Result<Option<NotificationChannel>> {
        let mut set = Document::new();
        if let Some(name) = update.name {
            set.insert("name", name);
        }
        if let Some(config) = update.config {
            let cfg_doc = to_document(&config)?;
            // Config uses #[serde(flatten)] so replace top-level kind+config
            for (k, v) in cfg_doc {
                set.insert(k, v);
            }
        }
        if let Some(enabled) = update.enabled {
            set.insert("enabled", enabled);
        }
        if !set.is_empty() {
            self.channels()
                .update_one(doc! { "_id": id }, doc! { "$set": set })
                .await?;
        }
        self.get_channel(id).await
    }

    pub async fn delete_channel(&self, id: &ObjectId) -> Result<bool> {
        let res = self.channels().delete_one(doc! { "_id": id }).await?;
        Ok(res.deleted_count > 0)
    }

    // ----- watchlists -----------------------------------------------------

    pub async fn list_watchlists(&self) -> Result<Vec<Watchlist>> {
        collect(self.watchlists().find(doc! {}).await?).await
    }

    pub async fn get_watchlist(&self, id: &ObjectId) -> Result<Option<Watchlist>> {
        Ok(self.watchlists().find_one(doc! { "_id": id }).await?)
    }

    pub async fn create_watchlist(&self, input: CreateWatchlistInput) -> Result<Watchlist> {
        let now = Utc::now();
        let wl = Watchlist {
            id: None,
            name: input.name,
            symbols: dedupe_upper(input.symbols),
            created_at: now,
            updated_at: now,
        };
        let res = self.watchlists().insert_one(&wl).await?;
        Ok(Watchlist {
            id: res.inserted_id.as_object_id(),
            ..wl
        })
    }

    pub async fn update_watchlist(
        &self,
        id: &ObjectId,
        update: UpdateWatchlistInput,
    ) -> Result<Option<Watchlist>> {
        let mut set = doc! { "updated_at": mongodb::bson::DateTime::from_chrono(Utc::now()) };
        if let Some(name) = update.name {
            set.insert("name", name);
        }
        if let Some(symbols) = update.symbols {
            set.insert("symbols", dedupe_upper(symbols));
        }
        self.watchlists()
            .update_one(doc! { "_id": id }, doc! { "$set": set })
            .await?;
        self.get_watchlist(id).await
    }

    pub async fn add_symbol_to_watchlist(
        &self,
        id: &ObjectId,
        symbol: &str,
    ) -> Result<Option<Watchlist>> {
        let sym = crate::symbols::normalize_symbol_key(symbol);
        if sym.is_empty() {
            return Err(anyhow!("empty symbol"));
        }
        self.watchlists()
            .update_one(
                doc! { "_id": id },
                doc! {
                    "$addToSet": { "symbols": &sym },
                    "$set": { "updated_at": mongodb::bson::DateTime::from_chrono(Utc::now()) },
                },
            )
            .await?;
        self.get_watchlist(id).await
    }

    pub async fn remove_symbol_from_watchlist(
        &self,
        id: &ObjectId,
        symbol: &str,
    ) -> Result<Option<Watchlist>> {
        let sym = crate::symbols::normalize_symbol_key(symbol);
        self.watchlists()
            .update_one(
                doc! { "_id": id },
                doc! {
                    "$pull": { "symbols": &sym },
                    "$set": { "updated_at": mongodb::bson::DateTime::from_chrono(Utc::now()) },
                },
            )
            .await?;
        self.get_watchlist(id).await
    }

    pub async fn delete_watchlist(&self, id: &ObjectId) -> Result<bool> {
        let res = self.watchlists().delete_one(doc! { "_id": id }).await?;
        Ok(res.deleted_count > 0)
    }

    // ----- positions ------------------------------------------------------

    pub async fn list_positions(&self) -> Result<Vec<Position>> {
        collect(self.positions().find(doc! {}).await?).await
    }

    pub async fn get_position(&self, id: &ObjectId) -> Result<Option<Position>> {
        Ok(self.positions().find_one(doc! { "_id": id }).await?)
    }

    pub async fn create_position(&self, input: CreatePositionInput) -> Result<Position> {
        let symbol = crate::symbols::normalize_symbol_key(&input.symbol);
        if symbol.is_empty() {
            return Err(anyhow!("empty symbol"));
        }
        if !input.quantity.is_finite() || input.quantity == 0.0 {
            return Err(anyhow!("quantity must be a non-zero finite number"));
        }
        if !input.cost_basis_per_share.is_finite() || input.cost_basis_per_share < 0.0 {
            return Err(anyhow!(
                "cost_basis_per_share must be a non-negative finite number"
            ));
        }
        let now = Utc::now();
        let position = Position {
            id: None,
            symbol,
            quantity: input.quantity,
            cost_basis_per_share: input.cost_basis_per_share,
            opened_at: input.opened_at.unwrap_or(now),
            notes: input.notes.filter(|s| !s.trim().is_empty()),
            created_at: now,
            updated_at: now,
        };
        let res = self.positions().insert_one(&position).await?;
        Ok(Position {
            id: res.inserted_id.as_object_id(),
            ..position
        })
    }

    pub async fn update_position(
        &self,
        id: &ObjectId,
        update: UpdatePositionInput,
    ) -> Result<Option<Position>> {
        let mut set = doc! { "updated_at": mongodb::bson::DateTime::from_chrono(Utc::now()) };
        if let Some(quantity) = update.quantity {
            if !quantity.is_finite() || quantity == 0.0 {
                return Err(anyhow!("quantity must be a non-zero finite number"));
            }
            set.insert("quantity", quantity);
        }
        if let Some(cost) = update.cost_basis_per_share {
            if !cost.is_finite() || cost < 0.0 {
                return Err(anyhow!(
                    "cost_basis_per_share must be a non-negative finite number"
                ));
            }
            set.insert("cost_basis_per_share", cost);
        }
        if let Some(opened_at) = update.opened_at {
            set.insert("opened_at", mongodb::bson::DateTime::from_chrono(opened_at));
        }
        if let Some(notes) = update.notes {
            let trimmed = notes.trim();
            if trimmed.is_empty() {
                set.insert("notes", mongodb::bson::Bson::Null);
            } else {
                set.insert("notes", trimmed);
            }
        }
        self.positions()
            .update_one(doc! { "_id": id }, doc! { "$set": set })
            .await?;
        self.get_position(id).await
    }

    pub async fn delete_position(&self, id: &ObjectId) -> Result<bool> {
        let res = self.positions().delete_one(doc! { "_id": id }).await?;
        Ok(res.deleted_count > 0)
    }

    /// Union of every symbol across every watchlist (normalized upper-case).
    pub async fn all_watched_symbols(&self) -> Result<Vec<String>> {
        let mut cursor = self.watchlists().find(doc! {}).await?;
        let mut set = std::collections::HashSet::new();
        while let Some(doc) = cursor.next().await {
            if let Ok(wl) = doc {
                for s in wl.symbols {
                    set.insert(s);
                }
            }
        }
        Ok(set.into_iter().collect())
    }

    // ----- rules ----------------------------------------------------------

    pub async fn list_rules(&self) -> Result<Vec<AlertRule>> {
        collect(self.rules().find(doc! {}).await?).await
    }

    pub async fn list_enabled_rules(&self) -> Result<Vec<AlertRule>> {
        collect(self.rules().find(doc! { "enabled": true }).await?).await
    }

    pub async fn get_rule(&self, id: &ObjectId) -> Result<Option<AlertRule>> {
        Ok(self.rules().find_one(doc! { "_id": id }).await?)
    }

    pub async fn create_rule(&self, input: CreateAlertRuleInput) -> Result<AlertRule> {
        let now = Utc::now();
        let rule = AlertRule {
            id: None,
            name: input.name,
            enabled: input.enabled,
            scope: input.scope,
            conditions: input.conditions,
            cooldown_minutes: input.cooldown_minutes,
            quiet_hours: input.quiet_hours,
            channel_ids: input.channel_ids,
            message_template: input.message_template,
            require_consecutive: input.require_consecutive.max(1),
            created_at: now,
            updated_at: now,
        };
        let res = self.rules().insert_one(&rule).await?;
        Ok(AlertRule {
            id: res.inserted_id.as_object_id(),
            ..rule
        })
    }

    pub async fn update_rule(
        &self,
        id: &ObjectId,
        update: UpdateAlertRuleInput,
    ) -> Result<Option<AlertRule>> {
        let mut set = doc! { "updated_at": mongodb::bson::DateTime::from_chrono(Utc::now()) };
        if let Some(v) = update.name {
            set.insert("name", v);
        }
        if let Some(v) = update.enabled {
            set.insert("enabled", v);
        }
        if let Some(v) = update.scope {
            set.insert("scope", to_document(&v)?);
        }
        if let Some(v) = update.conditions {
            set.insert("conditions", to_document(&v)?);
        }
        if let Some(v) = update.cooldown_minutes {
            set.insert("cooldown_minutes", v as i64);
        }
        if let Some(opt) = update.quiet_hours {
            match opt {
                Some(qh) => {
                    set.insert("quiet_hours", to_document(&qh)?);
                }
                None => {
                    set.insert("quiet_hours", mongodb::bson::Bson::Null);
                }
            }
        }
        if let Some(v) = update.channel_ids {
            set.insert(
                "channel_ids",
                v.into_iter()
                    .map(mongodb::bson::Bson::ObjectId)
                    .collect::<Vec<_>>(),
            );
        }
        if let Some(opt) = update.message_template {
            match opt {
                Some(t) => {
                    set.insert("message_template", t);
                }
                None => {
                    set.insert("message_template", mongodb::bson::Bson::Null);
                }
            }
        }
        if let Some(v) = update.require_consecutive {
            set.insert("require_consecutive", v.max(1) as i64);
        }
        self.rules()
            .update_one(doc! { "_id": id }, doc! { "$set": set })
            .await?;
        self.get_rule(id).await
    }

    pub async fn toggle_rule(&self, id: &ObjectId) -> Result<Option<AlertRule>> {
        let current = self.get_rule(id).await?;
        if let Some(rule) = current.as_ref() {
            let new_val = !rule.enabled;
            self.rules()
                .update_one(
                    doc! { "_id": id },
                    doc! { "$set": { "enabled": new_val, "updated_at": mongodb::bson::DateTime::from_chrono(Utc::now()) } },
                )
                .await?;
        }
        self.get_rule(id).await
    }

    pub async fn delete_rule(&self, id: &ObjectId) -> Result<bool> {
        let res = self.rules().delete_one(doc! { "_id": id }).await?;
        // Also scrub per-rule state so a re-created rule doesn't inherit old cooldowns.
        self.state().delete_many(doc! { "rule_id": id }).await?;
        Ok(res.deleted_count > 0)
    }

    // ----- state ----------------------------------------------------------

    pub async fn get_state(&self, rule_id: &ObjectId, symbol: &str) -> Result<Option<AlertState>> {
        Ok(self
            .state()
            .find_one(doc! { "rule_id": rule_id, "symbol": symbol })
            .await?)
    }

    /// Upsert a full state doc. Used by the evaluator to persist its updated
    /// cooldown / hysteresis / last-histogram after every cycle.
    pub async fn upsert_state(&self, state: &AlertState) -> Result<()> {
        let mut setter = to_document(state)?;
        setter.remove("_id");
        self.state()
            .update_one(
                doc! { "rule_id": &state.rule_id, "symbol": &state.symbol },
                doc! { "$set": setter },
            )
            .upsert(true)
            .await?;
        Ok(())
    }

    pub async fn mark_state_triggered(
        &self,
        rule_id: &ObjectId,
        symbol: &str,
        triggered_at: chrono::DateTime<Utc>,
    ) -> Result<()> {
        self.state()
            .update_one(
                doc! { "rule_id": rule_id, "symbol": symbol },
                doc! { "$set": { "last_triggered_at": mongodb::bson::DateTime::from_chrono(triggered_at) } },
            )
            .upsert(true)
            .await?;
        Ok(())
    }

    // ----- history --------------------------------------------------------

    pub async fn record_history(&self, entry: &NotificationHistory) -> Result<ObjectId> {
        let res = self.history().insert_one(entry).await?;
        res.inserted_id
            .as_object_id()
            .ok_or_else(|| anyhow!("history insert returned non-oid"))
    }

    pub async fn list_history(
        &self,
        page: u32,
        page_size: u32,
        rule_id: Option<ObjectId>,
        symbol: Option<String>,
    ) -> Result<(Vec<NotificationHistory>, u64)> {
        let mut filter = Document::new();
        if let Some(rid) = rule_id {
            filter.insert("rule_id", rid);
        }
        if let Some(sym) = symbol {
            filter.insert("symbol", crate::symbols::normalize_symbol_key(&sym));
        }

        let total = self.history().count_documents(filter.clone()).await?;

        let page = page.max(1);
        let page_size = page_size.clamp(1, 200);
        let skip = (page - 1) * page_size;

        let options = FindOptions::builder()
            .sort(doc! { "created_at": -1 })
            .skip(skip as u64)
            .limit(page_size as i64)
            .build();

        let cursor = self.history().find(filter).with_options(options).await?;

        Ok((collect(cursor).await?, total))
    }

    pub async fn mark_history_read(&self, id: &ObjectId, read: bool) -> Result<bool> {
        let res = self
            .history()
            .update_one(doc! { "_id": id }, doc! { "$set": { "read": read } })
            .await?;
        Ok(res.modified_count > 0)
    }

    pub async fn unread_history_count(&self) -> Result<u64> {
        Ok(self
            .history()
            .count_documents(doc! { "read": { "$ne": true } })
            .await?)
    }
}

/// Drain a Mongo cursor into a `Vec<T>`, skipping (but logging) deserialization errors.
async fn collect<T>(mut cursor: mongodb::Cursor<T>) -> Result<Vec<T>>
where
    T: for<'de> serde::Deserialize<'de> + Unpin + Send + Sync,
{
    let mut out = Vec::new();
    while let Some(doc) = cursor.next().await {
        match doc {
            Ok(v) => out.push(v),
            Err(e) => tracing::warn!("notifications repo: skipping row: {}", e),
        }
    }
    Ok(out)
}

fn dedupe_upper(symbols: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::with_capacity(symbols.len());
    for s in symbols {
        let s = crate::symbols::normalize_symbol_key(&s);
        if s.is_empty() {
            continue;
        }
        if seen.insert(s.clone()) {
            out.push(s);
        }
    }
    out
}
