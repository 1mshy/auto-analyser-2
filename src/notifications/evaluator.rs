//! Rule evaluator.
//!
//! Owned by `AlertEngine`. Called once per analysis cycle with the full set
//! of freshly-computed `StockAnalysis` snapshots. Loads every enabled rule
//! and its prior state, applies scope filtering, cooldowns, quiet hours, and
//! hysteresis gates, and emits a flat list of `PendingNotification`s to be
//! fanned out by the dispatcher.

use std::collections::{HashMap, HashSet};

use anyhow::Result;
use chrono::{Timelike, Utc};
use mongodb::bson::oid::ObjectId;
use tracing::{debug, warn};

use crate::models::StockAnalysis;
use crate::notifications::models::{
    AlertRule, AlertScope, AlertState, PendingNotification, QuietHours,
};
use crate::notifications::repo::NotificationsRepo;
use crate::notifications::rules::{evaluate, EvalContext};

pub struct Evaluator {
    repo: NotificationsRepo,
}

impl Evaluator {
    pub fn new(repo: NotificationsRepo) -> Self {
        Self { repo }
    }

    /// Evaluate every enabled rule against the given analyses.
    ///
    /// Side-effects: persists per-(rule, symbol) state updates (consecutive
    /// matches, last-macd-histogram). Delivery commits last-triggered. Returns the pending
    /// notifications the dispatcher should deliver.
    pub async fn evaluate_cycle(
        &self,
        analyses: &[StockAnalysis],
    ) -> Result<Vec<PendingNotification>> {
        let rules = self.repo.list_enabled_rules().await?;
        if rules.is_empty() {
            debug!("notifications: no enabled rules, skipping eval");
            return Ok(Vec::new());
        }

        // Index analyses by symbol for O(1) lookup.
        let by_symbol: HashMap<&str, &StockAnalysis> =
            analyses.iter().map(|a| (a.symbol.as_str(), a)).collect();

        let all_watched = match self.repo.all_watched_symbols().await {
            Ok(symbols) => symbols,
            Err(e) => {
                warn!(
                    "notifications: failed to load watchlists, scoped rules may be skipped: {}",
                    e
                );
                Vec::new()
            }
        };
        let all_watched_set: HashSet<String> = all_watched.into_iter().collect();

        let now = Utc::now();
        let mut pending = Vec::new();

        for rule in rules {
            let rule_id = match rule.id {
                Some(id) => id,
                None => {
                    warn!("notifications: skipping rule without _id: {}", rule.name);
                    continue;
                }
            };

            if in_quiet_hours(&rule.quiet_hours, now) {
                debug!(
                    "rule {}: quiet hours, refreshing cross state only",
                    rule.name
                );
                let symbols = self
                    .resolve_scope(&rule.scope, &all_watched_set, &by_symbol)
                    .await?;
                self.refresh_rule_cross_state(&rule_id, &symbols, &by_symbol)
                    .await;
                continue;
            }

            let symbols = self
                .resolve_scope(&rule.scope, &all_watched_set, &by_symbol)
                .await?;
            if symbols.is_empty() {
                continue;
            }

            for symbol in symbols {
                let analysis = match by_symbol.get(symbol.as_str()) {
                    Some(a) => *a,
                    None => continue, // symbol not analyzed this cycle
                };

                if let Err(e) = self
                    .evaluate_one(&rule, &rule_id, analysis, &mut pending, now)
                    .await
                {
                    warn!("rule {} / {}: eval error: {}", rule.name, symbol, e);
                }
            }
        }

        Ok(pending)
    }

    /// Refresh previous-cycle indicator state without emitting notifications.
    /// Used when notifications are globally paused so MACD cross rules do not
    /// compare against stale pre-pause values when alerts resume.
    pub async fn refresh_cycle_state(&self, analyses: &[StockAnalysis]) -> Result<()> {
        let rules = self.repo.list_enabled_rules().await?;
        let by_symbol: HashMap<&str, &StockAnalysis> =
            analyses.iter().map(|a| (a.symbol.as_str(), a)).collect();
        let all_watched = self.repo.all_watched_symbols().await.unwrap_or_default();
        let all_watched_set: HashSet<String> = all_watched.into_iter().collect();

        for rule in rules {
            let Some(rule_id) = rule.id else {
                warn!("notifications: skipping rule without _id: {}", rule.name);
                continue;
            };
            let symbols = self
                .resolve_scope(&rule.scope, &all_watched_set, &by_symbol)
                .await?;
            self.refresh_rule_cross_state(&rule_id, &symbols, &by_symbol)
                .await;
        }
        Ok(())
    }

    async fn refresh_rule_cross_state(
        &self,
        rule_id: &ObjectId,
        symbols: &[String],
        by_symbol: &HashMap<&str, &StockAnalysis>,
    ) {
        for symbol in symbols {
            let Some(analysis) = by_symbol.get(symbol.as_str()).copied() else {
                continue;
            };
            if let Err(e) = self.refresh_one_cross_state(rule_id, analysis).await {
                warn!("rule {} / {}: state refresh error: {}", rule_id, symbol, e);
            }
        }
    }

    async fn refresh_one_cross_state(
        &self,
        rule_id: &ObjectId,
        analysis: &StockAnalysis,
    ) -> Result<()> {
        let mut state = self
            .repo
            .get_state(rule_id, &analysis.symbol)
            .await?
            .unwrap_or_else(|| AlertState::new(*rule_id, analysis.symbol.clone()));
        state.last_macd_histogram = analysis.macd.as_ref().map(|m| m.histogram);
        self.repo.upsert_state(&state).await
    }

    async fn evaluate_one(
        &self,
        rule: &AlertRule,
        rule_id: &ObjectId,
        analysis: &StockAnalysis,
        out: &mut Vec<PendingNotification>,
        now: chrono::DateTime<Utc>,
    ) -> Result<()> {
        let mut state = self
            .repo
            .get_state(rule_id, &analysis.symbol)
            .await?
            .unwrap_or_else(|| AlertState::new(*rule_id, analysis.symbol.clone()));

        let ctx = EvalContext {
            analysis,
            prev_macd_histogram: state.last_macd_histogram,
        };
        let (matched, descs) = evaluate(&rule.conditions, &ctx);

        // Always refresh the last histogram so the next cycle's cross detection works.
        state.last_macd_histogram = analysis.macd.as_ref().map(|m| m.histogram);

        if !matched {
            state.consecutive_matches = 0;
            self.repo.upsert_state(&state).await?;
            return Ok(());
        }

        state.consecutive_matches = state.consecutive_matches.saturating_add(1);
        state.last_matched_at = Some(now);

        // Hysteresis gate.
        let required = rule.require_consecutive.max(1);
        if state.consecutive_matches < required {
            debug!(
                "rule {} / {}: matched but needs {} consecutive (have {})",
                rule.name, analysis.symbol, required, state.consecutive_matches
            );
            self.repo.upsert_state(&state).await?;
            return Ok(());
        }

        // Cooldown gate.
        if let Some(last) = state.last_triggered_at {
            let cooldown_secs = (rule.cooldown_minutes as i64) * 60;
            if cooldown_secs > 0 {
                let elapsed = now.signed_duration_since(last).num_seconds();
                if elapsed < cooldown_secs {
                    debug!(
                        "rule {} / {}: cooldown ({}s remaining)",
                        rule.name,
                        analysis.symbol,
                        cooldown_secs - elapsed
                    );
                    self.repo.upsert_state(&state).await?;
                    return Ok(());
                }
            }
        }

        self.repo.upsert_state(&state).await?;

        out.push(PendingNotification {
            rule: rule.clone(),
            symbol: analysis.symbol.clone(),
            matched_conditions: descs,
            snapshot: analysis.clone(),
        });

        Ok(())
    }

    /// Resolve a rule's scope into the concrete set of symbols to evaluate.
    async fn resolve_scope(
        &self,
        scope: &AlertScope,
        all_watched: &HashSet<String>,
        by_symbol: &HashMap<&str, &StockAnalysis>,
    ) -> Result<Vec<String>> {
        let out: Vec<String> = match scope {
            AlertScope::AllWatched => all_watched.iter().cloned().collect(),
            AlertScope::Watchlist { watchlist_id } => {
                match self.repo.get_watchlist(watchlist_id).await? {
                    Some(wl) => wl.symbols,
                    None => Vec::new(),
                }
            }
            AlertScope::Symbols { symbols } => symbols
                .iter()
                .map(|s| crate::symbols::normalize_symbol_key(s))
                .filter(|s| !s.is_empty())
                .collect(),
            AlertScope::AllAnalyzed => by_symbol.keys().map(|s| s.to_string()).collect(),
        };
        Ok(out)
    }
}

/// Is `now` currently inside the quiet-hours window? Invalid timezone names
/// fall back to UTC so bad user input never breaks alert evaluation.
fn in_quiet_hours(qh: &Option<QuietHours>, now: chrono::DateTime<Utc>) -> bool {
    let Some(qh) = qh else { return false };
    let tz = qh.tz.parse::<chrono_tz::Tz>().unwrap_or(chrono_tz::UTC);
    let h = now.with_timezone(&tz).hour() as u8;
    if qh.start_hour == qh.end_hour {
        return false;
    }
    if qh.start_hour < qh.end_hour {
        // e.g. 09..17
        h >= qh.start_hour && h < qh.end_hour
    } else {
        // wraps midnight, e.g. 22..7
        h >= qh.start_hour || h < qh.end_hour
    }
}

// One integration-level eval test (public evaluator end-to-end; the per-
// condition coverage lives in rules.rs).
#[cfg(test)]
mod tests {
    use super::*;
    use crate::notifications::models::QuietHours;
    use chrono::{TimeZone, Utc};

    #[test]
    fn quiet_hours_wrap_midnight() {
        let qh = Some(QuietHours {
            start_hour: 22,
            end_hour: 7,
            tz: "UTC".into(),
        });
        // 23:00 UTC
        let t = Utc.with_ymd_and_hms(2024, 1, 1, 23, 0, 0).unwrap();
        assert!(in_quiet_hours(&qh, t));
        // 05:00 UTC
        let t = Utc.with_ymd_and_hms(2024, 1, 1, 5, 0, 0).unwrap();
        assert!(in_quiet_hours(&qh, t));
        // 10:00 UTC
        let t = Utc.with_ymd_and_hms(2024, 1, 1, 10, 0, 0).unwrap();
        assert!(!in_quiet_hours(&qh, t));
    }

    #[test]
    fn quiet_hours_same_day() {
        let qh = Some(QuietHours {
            start_hour: 9,
            end_hour: 17,
            tz: "UTC".into(),
        });
        let t = Utc.with_ymd_and_hms(2024, 1, 1, 12, 0, 0).unwrap();
        assert!(in_quiet_hours(&qh, t));
        let t = Utc.with_ymd_and_hms(2024, 1, 1, 18, 0, 0).unwrap();
        assert!(!in_quiet_hours(&qh, t));
    }

    #[test]
    fn quiet_hours_honor_timezone() {
        let qh = Some(QuietHours {
            start_hour: 9,
            end_hour: 17,
            tz: "America/New_York".into(),
        });
        // 14:00 UTC is 09:00 New York during standard time.
        let t = Utc.with_ymd_and_hms(2024, 1, 1, 14, 0, 0).unwrap();
        assert!(in_quiet_hours(&qh, t));
        // 23:00 UTC is 18:00 New York.
        let t = Utc.with_ymd_and_hms(2024, 1, 1, 23, 0, 0).unwrap();
        assert!(!in_quiet_hours(&qh, t));
    }

    #[test]
    fn no_quiet_hours_means_always_allowed() {
        let t = Utc::now();
        assert!(!in_quiet_hours(&None, t));
    }
}
