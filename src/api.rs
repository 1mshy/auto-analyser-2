use crate::{
    cache::CacheLayer,
    db::MongoDB,
    models::{AnalysisProgress, StockFilter},
    yahoo::YahooFinanceClient,
};
use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, State, WebSocketUpgrade,
    },
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

#[derive(Clone)]
pub struct AppState {
    pub db: MongoDB,
    pub cache: CacheLayer,
    pub progress: Arc<RwLock<AnalysisProgress>>,
    pub yahoo_client: YahooFinanceClient,
}

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/api/stocks", get(get_stocks))
        .route("/api/stocks/filter", post(filter_stocks))
        .route("/api/stocks/:symbol/history", get(get_stock_history))
        .route("/api/progress", get(get_progress))
        .route("/ws", get(websocket_handler))
        .with_state(state)
}

async fn root() -> impl IntoResponse {
    Json(json!({
        "name": "Auto Stock Analyser API",
        "version": "0.1.0",
        "status": "running"
    }))
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let count = state.db.get_analysis_count().await.unwrap_or(0);
    
    Json(json!({
        "status": "healthy",
        "database": "connected",
        "total_analyses": count
    }))
}

async fn get_progress(State(state): State<AppState>) -> impl IntoResponse {
    let progress = state.progress.read().await;
    Json(json!({
        "total_stocks": progress.total_stocks,
        "analyzed": progress.analyzed,
        "current_symbol": progress.current_symbol,
        "cycle_start": progress.cycle_start,
        "errors": progress.errors,
        "completion_percentage": if progress.total_stocks > 0 {
            progress.analyzed as f64 / progress.total_stocks as f64 * 100.0
        } else {
            0.0
        }
    }))
}

async fn get_stocks(State(state): State<AppState>) -> impl IntoResponse {
    let filter = StockFilter {
        min_price: None,
        max_price: None,
        min_volume: None,
        min_market_cap: None,
        max_market_cap: None,
        min_rsi: None,
        max_rsi: None,
        sectors: None,
        only_oversold: None,
        only_overbought: None,
    };

    match state.db.get_latest_analyses(filter).await {
        Ok(stocks) => Json(json!({
            "success": true,
            "count": stocks.len(),
            "stocks": stocks
        })),
        Err(e) => Json(json!({
            "success": false,
            "error": e.to_string()
        })),
    }
}

async fn filter_stocks(
    State(state): State<AppState>,
    Json(filter): Json<StockFilter>,
) -> impl IntoResponse {
    // Try cache first
    let cache_key = format!("{:?}", filter);
    if let Some(cached) = state.cache.get_list(&cache_key).await {
        return Json(json!({
            "success": true,
            "count": cached.len(),
            "stocks": cached,
            "cached": true
        }));
    }

    match state.db.get_latest_analyses(filter).await {
        Ok(stocks) => {
            // Cache the results
            state.cache.set_list(cache_key, stocks.clone()).await;
            
            Json(json!({
                "success": true,
                "count": stocks.len(),
                "stocks": stocks,
                "cached": false
            }))
        }
        Err(e) => Json(json!({
            "success": false,
            "error": e.to_string()
        })),
    }
}

async fn get_stock_history(
    State(state): State<AppState>,
    Path(symbol): Path<String>,
) -> impl IntoResponse {
    // Fetch from Yahoo Finance (90 days of historical data)
    match state.yahoo_client.fetch_historical_data(&symbol, 90).await {
        Ok(history) => {
            Json(json!({
                "success": true,
                "symbol": symbol,
                "history": history,
            }))
        }
        Err(e) => Json(json!({
            "success": false,
            "error": e.to_string()
        })),
    }
}

async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| websocket_connection(socket, state))
}

async fn websocket_connection(mut socket: WebSocket, state: AppState) {
    info!("WebSocket client connected");

    // Send initial progress
    let progress = state.progress.read().await;
    let msg = serde_json::to_string(&*progress).unwrap();
    if socket.send(Message::Text(msg)).await.is_err() {
        return;
    }
    drop(progress);

    // Send updates every 2 seconds
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        let progress = state.progress.read().await;
        let msg = serde_json::to_string(&*progress).unwrap();
        
        if socket.send(Message::Text(msg)).await.is_err() {
            info!("WebSocket client disconnected");
            break;
        }
    }
}
