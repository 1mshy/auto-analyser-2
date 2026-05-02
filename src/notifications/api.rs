//! HTTP routes for the notifications subsystem.
//!
//! Mounted under `/api/watchlists`, `/api/alerts/rules`, `/api/alerts/channels`,
//! `/api/alerts/history`. Returns JSON with a consistent shape:
//! `{ "success": true, ...payload }` on 200 or
//! `{ "success": false, "error": "..." }` on 4xx/5xx.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{delete, get, patch, post},
    Router,
};
use mongodb::bson::oid::ObjectId;
use serde::Deserialize;
use serde_json::json;

use crate::api::AppState;
use crate::notifications::models::{
    AddSymbolInput, CreateAlertRuleInput, CreateChannelInput, CreatePositionInput,
    CreateWatchlistInput, PendingNotification, Position, PositionView, UpdateAlertRuleInput,
    UpdateChannelInput, UpdatePositionInput, UpdateWatchlistInput,
};

/// Attach every notifications route to the given router.
///
/// Split out of `api::create_router` so that file doesn't keep growing.
pub fn mount(router: Router<AppState>) -> Router<AppState> {
    router
        // Watchlists
        .route(
            "/api/watchlists",
            get(list_watchlists).post(create_watchlist),
        )
        .route(
            "/api/watchlists/:id",
            get(get_watchlist)
                .patch(update_watchlist)
                .delete(delete_watchlist),
        )
        .route("/api/watchlists/:id/symbols", post(add_watchlist_symbol))
        .route(
            "/api/watchlists/:id/symbols/:symbol",
            delete(remove_watchlist_symbol),
        )
        // Rules
        .route("/api/alerts/rules", get(list_rules).post(create_rule))
        .route(
            "/api/alerts/rules/:id",
            get(get_rule).put(update_rule).delete(delete_rule),
        )
        .route("/api/alerts/rules/:id/toggle", post(toggle_rule))
        .route("/api/alerts/rules/:id/test", post(test_rule))
        // Channels
        .route(
            "/api/alerts/channels",
            get(list_channels).post(create_channel),
        )
        .route(
            "/api/alerts/channels/:id",
            get(get_channel).put(update_channel).delete(delete_channel),
        )
        .route("/api/alerts/channels/:id/test", post(test_channel))
        // History / inbox
        .route("/api/alerts/history", get(list_history))
        .route("/api/alerts/history/unread-count", get(unread_count))
        .route("/api/alerts/history/:id/read", patch(mark_history_read))
        // Positions
        .route("/api/positions", get(list_positions).post(create_position))
        .route(
            "/api/positions/:id",
            get(get_position)
                .patch(update_position)
                .delete(delete_position),
        )
        // Meta
        .route("/api/alerts/status", get(alerts_status))
}

// ---------- helpers ----------------------------------------------------------

fn err(status: StatusCode, msg: impl Into<String>) -> (StatusCode, Json<serde_json::Value>) {
    (
        status,
        Json(json!({ "success": false, "error": msg.into() })),
    )
}

fn parse_oid(s: &str) -> Result<ObjectId, (StatusCode, Json<serde_json::Value>)> {
    ObjectId::parse_str(s).map_err(|_| err(StatusCode::BAD_REQUEST, "invalid id"))
}

// ---------- watchlists -------------------------------------------------------

async fn list_watchlists(State(state): State<AppState>) -> impl IntoResponse {
    match state.alert_engine.repo().list_watchlists().await {
        Ok(items) => Json(json!({ "success": true, "watchlists": items })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn create_watchlist(
    State(state): State<AppState>,
    Json(input): Json<CreateWatchlistInput>,
) -> impl IntoResponse {
    if input.name.trim().is_empty() {
        return err(StatusCode::BAD_REQUEST, "name required").into_response();
    }
    match state.alert_engine.repo().create_watchlist(input).await {
        Ok(wl) => Json(json!({ "success": true, "watchlist": wl })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_watchlist(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    match state.alert_engine.repo().get_watchlist(&oid).await {
        Ok(Some(wl)) => Json(json!({ "success": true, "watchlist": wl })).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "not found").into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn update_watchlist(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpdateWatchlistInput>,
) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    match state
        .alert_engine
        .repo()
        .update_watchlist(&oid, input)
        .await
    {
        Ok(Some(wl)) => Json(json!({ "success": true, "watchlist": wl })).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "not found").into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn delete_watchlist(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    match state.alert_engine.repo().delete_watchlist(&oid).await {
        Ok(true) => Json(json!({ "success": true })).into_response(),
        Ok(false) => err(StatusCode::NOT_FOUND, "not found").into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn add_watchlist_symbol(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<AddSymbolInput>,
) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    match state
        .alert_engine
        .repo()
        .add_symbol_to_watchlist(&oid, &input.symbol)
        .await
    {
        Ok(Some(wl)) => Json(json!({ "success": true, "watchlist": wl })).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "not found").into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

async fn remove_watchlist_symbol(
    State(state): State<AppState>,
    Path((id, symbol)): Path<(String, String)>,
) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    match state
        .alert_engine
        .repo()
        .remove_symbol_from_watchlist(&oid, &symbol)
        .await
    {
        Ok(Some(wl)) => Json(json!({ "success": true, "watchlist": wl })).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "not found").into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ---------- rules ------------------------------------------------------------

async fn list_rules(State(state): State<AppState>) -> impl IntoResponse {
    match state.alert_engine.repo().list_rules().await {
        Ok(rules) => Json(json!({ "success": true, "rules": rules })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn create_rule(
    State(state): State<AppState>,
    Json(input): Json<CreateAlertRuleInput>,
) -> impl IntoResponse {
    if input.name.trim().is_empty() {
        return err(StatusCode::BAD_REQUEST, "name required").into_response();
    }
    if input.channel_ids.is_empty() {
        return err(
            StatusCode::BAD_REQUEST,
            "at least one notification channel is required",
        )
        .into_response();
    }
    match state.alert_engine.repo().create_rule(input).await {
        Ok(rule) => Json(json!({ "success": true, "rule": rule })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_rule(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    match state.alert_engine.repo().get_rule(&oid).await {
        Ok(Some(r)) => Json(json!({ "success": true, "rule": r })).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "not found").into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn update_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpdateAlertRuleInput>,
) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    if matches!(input.channel_ids.as_ref(), Some(ids) if ids.is_empty()) {
        return err(
            StatusCode::BAD_REQUEST,
            "at least one notification channel is required",
        )
        .into_response();
    }
    match state.alert_engine.repo().update_rule(&oid, input).await {
        Ok(Some(r)) => Json(json!({ "success": true, "rule": r })).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "not found").into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn delete_rule(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    match state.alert_engine.repo().delete_rule(&oid).await {
        Ok(true) => Json(json!({ "success": true })).into_response(),
        Ok(false) => err(StatusCode::NOT_FOUND, "not found").into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn toggle_rule(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    match state.alert_engine.repo().toggle_rule(&oid).await {
        Ok(Some(r)) => Json(json!({ "success": true, "rule": r })).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "not found").into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[derive(Debug, Deserialize)]
struct TestRuleInput {
    /// Optional — if omitted, the endpoint picks the first in-scope symbol
    /// that has a fresh analysis. Required when scope=AllAnalyzed.
    symbol: Option<String>,
}

/// Evaluate a rule against the latest analysis for a chosen symbol and
/// dispatch a one-off notification (does NOT update cooldown / hysteresis).
async fn test_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<TestRuleInput>,
) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    let rule = match state.alert_engine.repo().get_rule(&oid).await {
        Ok(Some(r)) => r,
        Ok(None) => return err(StatusCode::NOT_FOUND, "rule not found").into_response(),
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // Pick a symbol to simulate against.
    let symbol = match input.symbol {
        Some(s) => s.trim().to_uppercase(),
        None => {
            // Try to pull a candidate from the rule's scope.
            use crate::notifications::models::AlertScope;
            match &rule.scope {
                AlertScope::Symbols { symbols } => symbols.first().cloned().unwrap_or_default(),
                AlertScope::Watchlist { watchlist_id } => state
                    .alert_engine
                    .repo()
                    .get_watchlist(watchlist_id)
                    .await
                    .ok()
                    .flatten()
                    .and_then(|w| w.symbols.first().cloned())
                    .unwrap_or_default(),
                _ => String::new(),
            }
        }
    };
    if symbol.is_empty() {
        return err(
            StatusCode::BAD_REQUEST,
            "No symbol provided and couldn't infer one from rule scope",
        )
        .into_response();
    }

    let analysis = match state.db.get_analysis_by_symbol(&symbol).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            return err(
                StatusCode::NOT_FOUND,
                format!("no analysis found for {}", symbol),
            )
            .into_response()
        }
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let pending = PendingNotification {
        rule: rule.clone(),
        symbol: symbol.clone(),
        matched_conditions: vec!["Test send".into()],
        snapshot: analysis,
    };

    match state.alert_engine.test_rule(pending).await {
        Ok(delivered) => Json(json!({
            "success": true,
            "delivered": delivered,
            "symbol": symbol,
        }))
        .into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ---------- channels ---------------------------------------------------------

async fn list_channels(State(state): State<AppState>) -> impl IntoResponse {
    match state.alert_engine.repo().list_channels().await {
        Ok(channels) => {
            // Mask webhook URLs in list responses — the raw URL is a secret.
            let masked: Vec<_> = channels
                .into_iter()
                .map(|mut c| {
                    match &mut c.config {
                        crate::notifications::models::ChannelConfig::Discord(d) => {
                            d.webhook_url = mask_secret(&d.webhook_url);
                        }
                    }
                    c
                })
                .collect();
            Json(json!({ "success": true, "channels": masked })).into_response()
        }
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn create_channel(
    State(state): State<AppState>,
    Json(input): Json<CreateChannelInput>,
) -> impl IntoResponse {
    if input.name.trim().is_empty() {
        return err(StatusCode::BAD_REQUEST, "name required").into_response();
    }
    match state.alert_engine.repo().create_channel(input).await {
        Ok(ch) => Json(json!({ "success": true, "channel": ch })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_channel(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    match state.alert_engine.repo().get_channel(&oid).await {
        Ok(Some(mut ch)) => {
            match &mut ch.config {
                crate::notifications::models::ChannelConfig::Discord(d) => {
                    d.webhook_url = mask_secret(&d.webhook_url);
                }
            }
            Json(json!({ "success": true, "channel": ch })).into_response()
        }
        Ok(None) => err(StatusCode::NOT_FOUND, "not found").into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn update_channel(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpdateChannelInput>,
) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    match state.alert_engine.repo().update_channel(&oid, input).await {
        Ok(Some(mut ch)) => {
            match &mut ch.config {
                crate::notifications::models::ChannelConfig::Discord(d) => {
                    d.webhook_url = mask_secret(&d.webhook_url);
                }
            }
            Json(json!({ "success": true, "channel": ch })).into_response()
        }
        Ok(None) => err(StatusCode::NOT_FOUND, "not found").into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn delete_channel(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    match state.alert_engine.repo().delete_channel(&oid).await {
        Ok(true) => Json(json!({ "success": true })).into_response(),
        Ok(false) => err(StatusCode::NOT_FOUND, "not found").into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn test_channel(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    match state.alert_engine.dispatcher().test_channel(&oid).await {
        Ok(()) => Json(json!({ "success": true })).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

// ---------- history ----------------------------------------------------------

#[derive(Debug, Deserialize)]
struct HistoryQuery {
    #[serde(default)]
    page: Option<u32>,
    #[serde(default)]
    page_size: Option<u32>,
    #[serde(default)]
    rule_id: Option<String>,
    #[serde(default)]
    symbol: Option<String>,
}

async fn list_history(
    State(state): State<AppState>,
    Query(q): Query<HistoryQuery>,
) -> impl IntoResponse {
    let rule_id = match q.rule_id.as_deref() {
        Some(s) => match parse_oid(s) {
            Ok(v) => Some(v),
            Err(e) => return e.into_response(),
        },
        None => None,
    };
    let page = q.page.unwrap_or(1);
    let page_size = q.page_size.unwrap_or(50);
    match state
        .alert_engine
        .repo()
        .list_history(page, page_size, rule_id, q.symbol)
        .await
    {
        Ok((items, total)) => Json(json!({
            "success": true,
            "history": items,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": ((total as f64) / (page_size.max(1) as f64)).ceil() as u32,
            }
        }))
        .into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn unread_count(State(state): State<AppState>) -> impl IntoResponse {
    match state.alert_engine.repo().unread_history_count().await {
        Ok(n) => Json(json!({ "success": true, "unread": n })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[derive(Debug, Deserialize)]
struct MarkReadInput {
    #[serde(default = "default_read")]
    read: bool,
}
fn default_read() -> bool {
    true
}

async fn mark_history_read(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<MarkReadInput>,
) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    match state
        .alert_engine
        .repo()
        .mark_history_read(&oid, input.read)
        .await
    {
        Ok(true) => Json(json!({ "success": true })).into_response(),
        Ok(false) => err(StatusCode::NOT_FOUND, "not found").into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ---------- positions -------------------------------------------------------

/// Build a `PositionView` for a single position by joining against the cached
/// `StockAnalysis.price`. On cache miss, computed fields are `None` and the
/// frontend renders dashes.
async fn build_position_view(state: &AppState, position: Position) -> PositionView {
    let current_price = state
        .cache
        .get_stock(&position.symbol)
        .await
        .map(|s| s.price);
    PositionView::from_position(position, current_price)
}

async fn list_positions(State(state): State<AppState>) -> impl IntoResponse {
    match state.alert_engine.repo().list_positions().await {
        Ok(items) => {
            let mut views = Vec::with_capacity(items.len());
            for p in items {
                views.push(build_position_view(&state, p).await);
            }
            Json(json!({ "success": true, "positions": views })).into_response()
        }
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn create_position(
    State(state): State<AppState>,
    Json(input): Json<CreatePositionInput>,
) -> impl IntoResponse {
    match state.alert_engine.repo().create_position(input).await {
        Ok(p) => {
            let view = build_position_view(&state, p).await;
            Json(json!({ "success": true, "position": view })).into_response()
        }
        Err(e) => err(StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

async fn get_position(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    match state.alert_engine.repo().get_position(&oid).await {
        Ok(Some(p)) => {
            let view = build_position_view(&state, p).await;
            Json(json!({ "success": true, "position": view })).into_response()
        }
        Ok(None) => err(StatusCode::NOT_FOUND, "not found").into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn update_position(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpdatePositionInput>,
) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    match state.alert_engine.repo().update_position(&oid, input).await {
        Ok(Some(p)) => {
            let view = build_position_view(&state, p).await;
            Json(json!({ "success": true, "position": view })).into_response()
        }
        Ok(None) => err(StatusCode::NOT_FOUND, "not found").into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

async fn delete_position(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let oid = match parse_oid(&id) {
        Ok(v) => v,
        Err(e) => return e.into_response(),
    };
    match state.alert_engine.repo().delete_position(&oid).await {
        Ok(true) => Json(json!({ "success": true })).into_response(),
        Ok(false) => err(StatusCode::NOT_FOUND, "not found").into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ---------- meta -------------------------------------------------------------

async fn alerts_status(State(state): State<AppState>) -> impl IntoResponse {
    Json(json!({
        "success": true,
        "enabled": state.alert_engine.is_enabled(),
    }))
}

// ---------- helpers ----------------------------------------------------------

/// Mask everything except the final 6 characters of a webhook URL so clients
/// can identify which channel they're editing without exposing the secret.
fn mask_secret(url: &str) -> String {
    if url.len() <= 12 {
        return "••••••".to_string();
    }
    format!(
        "{}••••{}",
        &url[..20.min(url.len())],
        &url[url.len().saturating_sub(6)..]
    )
}
