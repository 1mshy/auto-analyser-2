//! Notifications subsystem.
//!
//! Public surface:
//! - [`AlertEngine`] — the one type the rest of the app interacts with; owns
//!   the evaluator, dispatcher, and repo.
//! - [`repo::NotificationsRepo`] — direct DB access for the HTTP layer (CRUD
//!   on channels / rules / watchlists / history).
//! - [`models::*`]   — serde-backed persisted types, re-exported for the API.
//!
//! Flow: `AnalysisEngine` calls `AlertEngine::evaluate_and_dispatch` once per
//! cycle. Evaluation is state-aware (cooldowns / hysteresis / MACD cross)
//! and dispatch is resilient (per-channel errors don't abort the batch).

pub mod api;
pub mod channels;
pub mod dispatcher;
pub mod evaluator;
pub mod models;
pub mod repo;
pub mod rules;

use std::sync::Arc;

use anyhow::Result;
use tracing::{info, warn};

use crate::db::MongoDB;
use crate::models::StockAnalysis;

use self::dispatcher::Dispatcher;
use self::evaluator::Evaluator;
use self::models::{DeliveryResult, PendingNotification};
use self::repo::NotificationsRepo;

#[derive(Clone)]
pub struct AlertEngine {
    inner: Arc<AlertEngineInner>,
}

struct AlertEngineInner {
    repo: NotificationsRepo,
    evaluator: Evaluator,
    dispatcher: Dispatcher,
    enabled: bool,
}

impl AlertEngine {
    pub async fn new(db: MongoDB, enabled: bool, public_base_url: Option<String>) -> Result<Self> {
        let repo = NotificationsRepo::new(db);
        // Best-effort: index creation is idempotent but we don't want to
        // hard-fail the app startup if Mongo is transient.
        if let Err(e) = repo.create_indexes().await {
            warn!("notifications: failed to create indexes: {}", e);
        }

        let http = reqwest::Client::builder()
            .user_agent("auto-analyser-2/0.1 (notifications)")
            .timeout(std::time::Duration::from_secs(10))
            .build()?;

        let evaluator = Evaluator::new(repo.clone());
        let dispatcher = Dispatcher::new(repo.clone(), http, public_base_url);

        if enabled {
            info!("🔔 Notifications enabled");
        } else {
            info!("🔔 Notifications disabled via config");
        }

        Ok(Self {
            inner: Arc::new(AlertEngineInner {
                repo,
                evaluator,
                dispatcher,
                enabled,
            }),
        })
    }

    pub fn repo(&self) -> &NotificationsRepo {
        &self.inner.repo
    }

    pub fn dispatcher(&self) -> &Dispatcher {
        &self.inner.dispatcher
    }

    pub fn is_enabled(&self) -> bool {
        self.inner.enabled
    }

    /// Called at the end of each analysis cycle. Bails silently if
    /// notifications are globally disabled.
    pub async fn evaluate_and_dispatch(&self, analyses: &[StockAnalysis]) -> Result<()> {
        if !self.inner.enabled {
            self.inner.evaluator.refresh_cycle_state(analyses).await?;
            return Ok(());
        }
        let pending = self.inner.evaluator.evaluate_cycle(analyses).await?;
        if pending.is_empty() {
            return Ok(());
        }
        info!("🔔 {} notifications queued for dispatch", pending.len());
        self.inner.dispatcher.dispatch_all(pending).await
    }

    /// Test a rule end-to-end against a caller-supplied snapshot.
    pub async fn test_rule(&self, pending: PendingNotification) -> Result<Vec<DeliveryResult>> {
        self.inner.dispatcher.dispatch_test(pending).await
    }
}
