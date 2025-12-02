use crate::{
    cache::CacheLayer,
    db::MongoDB,
    models::StockFilter,
    openrouter::OpenRouterClient,
    yahoo::YahooFinanceClient,
};
use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, Query, State, WebSocketUpgrade,
    },
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};
use crate::models::AnalysisProgress;

#[derive(Clone)]
pub struct AppState {
    pub db: MongoDB,
    pub cache: CacheLayer,
    pub progress: Arc<RwLock<AnalysisProgress>>,
    pub yahoo_client: YahooFinanceClient,
    pub openrouter_client: OpenRouterClient,
}

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/api/stocks", get(get_stocks))
        .route("/api/stocks/filter", post(filter_stocks))
        .route("/api/stocks/:symbol/history", get(get_stock_history))
        .route("/api/stocks/:symbol/ai-analysis", get(get_ai_analysis))
        .route("/api/market-summary", get(get_market_summary))
        .route("/api/progress", get(get_progress))
        .route("/api/ai/status", get(get_ai_status))
        .route("/api/ai/models", get(get_ai_models))
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
        sort_by: Some("market_cap".to_string()),
        sort_order: Some("desc".to_string()),
        page: Some(1),
        page_size: Some(50),
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
    // Clone filter for counting
    let count_filter = StockFilter {
        min_price: filter.min_price,
        max_price: filter.max_price,
        min_volume: filter.min_volume,
        min_market_cap: filter.min_market_cap,
        max_market_cap: filter.max_market_cap,
        min_rsi: filter.min_rsi,
        max_rsi: filter.max_rsi,
        sectors: filter.sectors.clone(),
        only_oversold: filter.only_oversold,
        only_overbought: filter.only_overbought,
        sort_by: None,
        sort_order: None,
        page: None,
        page_size: None,
    };

    // Try cache first
    let cache_key = format!("{:?}", filter);
    if let Some(cached) = state.cache.get_list(&cache_key).await {
        let total = state.db.get_filtered_count(count_filter).await.unwrap_or(cached.len() as u64);
        let page = filter.page.unwrap_or(1);
        let page_size = filter.page_size.unwrap_or(50);
        let total_pages = ((total as f64) / (page_size as f64)).ceil() as u32;
        
        return Json(json!({
            "success": true,
            "count": cached.len(),
            "stocks": cached,
            "cached": true,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": total_pages
            }
        }));
    }

    // Get total count for pagination
    let total = state.db.get_filtered_count(count_filter).await.unwrap_or(0);
    let page = filter.page.unwrap_or(1);
    let page_size = filter.page_size.unwrap_or(50);
    let total_pages = ((total as f64) / (page_size as f64)).ceil() as u32;

    match state.db.get_latest_analyses(filter).await {
        Ok(stocks) => {
            // Cache the results
            state.cache.set_list(cache_key, stocks.clone()).await;
            
            Json(json!({
                "success": true,
                "count": stocks.len(),
                "stocks": stocks,
                "cached": false,
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": total,
                    "total_pages": total_pages
                }
            }))
        }
        Err(e) => Json(json!({
            "success": false,
            "error": e.to_string()
        })),
    }
}

/// Get market summary with top gainers, losers, and key highlights
async fn get_market_summary(State(state): State<AppState>) -> impl IntoResponse {
    match state.db.get_market_summary(10).await {
        Ok(summary) => Json(json!({
            "success": true,
            "summary": summary
        })),
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

/// On-demand AI analysis endpoint
async fn get_ai_analysis(
    State(state): State<AppState>,
    Path(symbol): Path<String>,
) -> impl IntoResponse {
    // Check if OpenRouter is enabled
    if !state.openrouter_client.is_enabled() {
        return Json(json!({
            "success": false,
            "error": "AI analysis is not enabled. Set OPENROUTER_API_KEY environment variable."
        }));
    }

    // First, get the stock analysis from cache or database
    let analysis = if let Some(cached) = state.cache.get_stock(&symbol).await {
        cached
    } else {
        match state.db.get_analysis_by_symbol(&symbol).await {
            Ok(Some(db_analysis)) => db_analysis,
            Ok(None) => {
                return Json(json!({
                    "success": false,
                    "error": format!("No analysis found for {}. Wait for the analysis cycle to complete.", symbol)
                }));
            }
            Err(e) => {
                return Json(json!({
                    "success": false,
                    "error": format!("Database error: {}", e)
                }));
            }
        }
    };

    // Run AI analysis
    match state.openrouter_client.analyze_stock(&analysis).await {
        Ok(ai_response) => {
            Json(json!({
                "success": true,
                "symbol": ai_response.symbol,
                "analysis": ai_response.analysis,
                "model_used": ai_response.model_used,
                "generated_at": ai_response.generated_at,
                "stock_data": {
                    "price": analysis.price,
                    "rsi": analysis.rsi,
                    "sma_20": analysis.sma_20,
                    "sma_50": analysis.sma_50,
                    "is_oversold": analysis.is_oversold,
                    "is_overbought": analysis.is_overbought,
                }
            }))
        }
        Err(e) => {
            warn!("AI analysis failed for {}: {}", symbol, e);
            Json(json!({
                "success": false,
                "error": format!("AI analysis failed: {}", e)
            }))
        }
    }
}

/// Get AI system status
async fn get_ai_status(State(state): State<AppState>) -> impl IntoResponse {
    let enabled = state.openrouter_client.is_enabled();
    let current_model = if enabled {
        Some(state.openrouter_client.current_model())
    } else {
        None
    };

    Json(json!({
        "enabled": enabled,
        "current_model": current_model,
        "available_models_count": crate::openrouter::FREE_MODELS.len(),
    }))
}

/// Get list of available AI models
async fn get_ai_models() -> impl IntoResponse {
    Json(json!({
        "models": crate::openrouter::FREE_MODELS,
        "count": crate::openrouter::FREE_MODELS.len(),
        "description": "Free models available on OpenRouter with automatic fallback on rate limits"
    }))
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
