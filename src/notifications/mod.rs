//! Notifications subsystem.
//!
//! Public surface:
//! - [`AlertEngine`] — the one type the rest of the app interacts with; owns
//!   the evaluator, dispatcher, and repo.
//! - [`repo::NotificationsRepo`] — direct DB access for the HTTP layer (CRUD
//!   on channels / rules / watchlists / history).
//! - [`models::*`]   — serde-backed persisted types, re-exported for the API.
//!
//! Flow: `AnalysisEngine` calls `AlertEngine::submit(analysis)` for every
//! freshly-saved snapshot. A background worker drains an mpsc queue and
//! evaluates rules per-symbol, so alert latency tracks fetch latency rather
//! than full-cycle latency. State (cooldowns / hysteresis / MACD cross)
//! persists in Mongo per `(rule_id, symbol)` and is therefore safe to update
//! one symbol at a time.

pub mod api;
pub mod channels;
pub mod dispatcher;
pub mod evaluator;
pub mod models;
pub mod repo;
pub mod rules;

use std::sync::Arc;

use anyhow::Result;
use tokio::sync::mpsc;
use tracing::{info, warn};

use crate::db::MongoDB;
use crate::models::StockAnalysis;

use self::dispatcher::Dispatcher;
use self::evaluator::Evaluator;
use self::models::{DeliveryResult, PendingNotification};
use self::repo::NotificationsRepo;

/// Buffer capacity of the analysis-submission queue. Sized generously so the
/// fetch loop never blocks on a slow Mongo write or webhook; the worker
/// drains continuously. If the queue ever fills, we drop new submissions and
/// log a warning (the next cycle will re-evaluate the dropped symbols).
const QUEUE_CAPACITY: usize = 256;

#[derive(Clone)]
pub struct AlertEngine {
    inner: Arc<AlertEngineInner>,
}

struct AlertEngineInner {
    repo: NotificationsRepo,
    evaluator: Evaluator,
    dispatcher: Dispatcher,
    enabled: bool,
    /// Sender half of the worker queue. `None` means no worker is running
    /// (e.g. in tests where `new` was never called).
    tx: Option<mpsc::Sender<StockAnalysis>>,
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

        let (tx, rx) = mpsc::channel::<StockAnalysis>(QUEUE_CAPACITY);

        let engine = Self {
            inner: Arc::new(AlertEngineInner {
                repo,
                evaluator,
                dispatcher,
                enabled,
                tx: Some(tx),
            }),
        };

        engine.spawn_worker(rx);
        Ok(engine)
    }

    /// Spawn the background worker that drains the submission queue and
    /// evaluates rules one analysis at a time. Runs for the process lifetime;
    /// exits cleanly when all `Sender`s are dropped.
    fn spawn_worker(&self, mut rx: mpsc::Receiver<StockAnalysis>) {
        let engine = self.clone();
        tokio::spawn(async move {
            while let Some(analysis) = rx.recv().await {
                if let Err(e) = engine.evaluate_one(&analysis).await {
                    warn!(
                        "notifications: evaluation failed for {}: {}",
                        analysis.symbol, e
                    );
                }
            }
            info!("notifications: worker stopped (all senders dropped)");
        });
    }

    /// Non-blocking submit. Drops the analysis and warns if the queue is full
    /// or the worker has exited — never blocks the analysis loop.
    pub fn submit(&self, analysis: StockAnalysis) {
        let Some(tx) = self.inner.tx.as_ref() else {
            return;
        };
        if let Err(err) = tx.try_send(analysis) {
            match err {
                mpsc::error::TrySendError::Full(a) => {
                    warn!(
                        "notifications: queue full, dropping {} (next cycle will retry)",
                        a.symbol
                    );
                }
                mpsc::error::TrySendError::Closed(_) => {
                    warn!("notifications: queue closed; worker is gone");
                }
            }
        }
    }

    /// Evaluate a single analysis. Used both by the worker and by the
    /// (legacy) batch path so the disabled-engine state-refresh behaviour
    /// stays in one place.
    async fn evaluate_one(&self, analysis: &StockAnalysis) -> Result<()> {
        if !self.inner.enabled {
            // Even when disabled, refresh MACD cross state so re-enabling
            // doesn't fire stale cross signals on the next message.
            return self
                .inner
                .evaluator
                .refresh_cycle_state(std::slice::from_ref(analysis))
                .await;
        }
        let pending = self
            .inner
            .evaluator
            .evaluate_cycle(std::slice::from_ref(analysis))
            .await?;
        if pending.is_empty() {
            return Ok(());
        }
        info!(
            "🔔 {} notifications queued for dispatch ({})",
            pending.len(),
            analysis.symbol
        );
        self.inner.dispatcher.dispatch_all(pending).await
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

    /// Batch evaluation entry point — kept for tests and any caller that
    /// already has a complete `Vec<StockAnalysis>` in hand. The hot fetch
    /// path should use [`Self::submit`] instead.
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
