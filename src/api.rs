use crate::{
    cache::CacheLayer,
    db::MongoDB,
    indicators::TechnicalIndicators,
    indexes::{IndexDataProvider, IndexHeatmapData, StockHeatmapItem},
    models::StockFilter,
    nasdaq::NasdaqClient,
    openrouter::{OpenRouterClient, StreamEvent},
    yahoo::YahooFinanceClient,
};
use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, Query, State, WebSocketUpgrade,
    },
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Json,
    },
    routing::{get, post},
    Router,
};
use std::convert::Infallible;
use serde::Deserialize;
use serde_json::json;

/// Query parameters for market summary endpoint
#[derive(Debug, Deserialize)]
pub struct MarketSummaryQuery {
    pub min_market_cap: Option<f64>,
    pub max_price_change_percent: Option<f64>,
}
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
    pub nasdaq_client: NasdaqClient,
}

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/api/stocks", get(get_stocks))
        .route("/api/stocks/filter", post(filter_stocks))
        .route("/api/stocks/:symbol", get(get_stock_by_symbol))
        .route("/api/stocks/:symbol/history", get(get_stock_history))
        .route("/api/stocks/:symbol/ai-analysis", get(get_ai_analysis))
        .route("/api/stocks/:symbol/ai-analysis/stream", get(stream_ai_analysis))
        .route("/api/stocks/:symbol/profile", get(get_stock_profile))
        .route("/api/market-summary", get(get_market_summary))
        .route("/api/progress", get(get_progress))
        .route("/api/ai/status", get(get_ai_status))
        .route("/api/ai/models", get(get_ai_models))
        // New analytics endpoints
        .route("/api/news", get(get_all_news))
        .route("/api/sectors", get(get_sector_performance))
        .route("/api/earnings", get(get_earnings_calendar))
        .route("/api/stocks/:symbol/insiders", get(get_insider_trades))
        .route("/api/stocks/:symbol/earnings", get(get_stock_earnings))
        .route("/api/analytics/correlation", get(get_correlation_matrix))
        // Index/Fund heatmap endpoints
        .route("/api/indexes", get(get_indexes))
        .route("/api/indexes/:index_id", get(get_index_detail))
        .route("/api/indexes/:index_id/heatmap", get(get_index_heatmap))
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
        min_stochastic_k: None,
        max_stochastic_k: None,
        min_bandwidth: None,
        max_bandwidth: None,
        max_abs_price_change_percent: None,
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
        min_stochastic_k: filter.min_stochastic_k,
        max_stochastic_k: filter.max_stochastic_k,
        min_bandwidth: filter.min_bandwidth,
        max_bandwidth: filter.max_bandwidth,
        max_abs_price_change_percent: filter.max_abs_price_change_percent,
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
async fn get_market_summary(
    State(state): State<AppState>,
    Query(query): Query<MarketSummaryQuery>,
) -> impl IntoResponse {
    match state.db.get_market_summary(10, query.min_market_cap, query.max_price_change_percent).await {
        Ok(summary) => Json(json!({
            "success": true,
            "summary": summary,
            "filters_applied": {
                "min_market_cap": query.min_market_cap,
                "max_price_change_percent": query.max_price_change_percent
            }
        })),
        Err(e) => Json(json!({
            "success": false,
            "error": e.to_string()
        })),
    }
}

/// Get a single stock by symbol
async fn get_stock_by_symbol(
    State(state): State<AppState>,
    Path(symbol): Path<String>,
) -> impl IntoResponse {
    // Try cache first
    if let Some(cached) = state.cache.get_stock(&symbol).await {
        return Json(json!({
            "success": true,
            "stock": cached,
            "cached": true
        }));
    }

    // Fetch from database
    match state.db.get_analysis_by_symbol(&symbol).await {
        Ok(Some(analysis)) => {
            Json(json!({
                "success": true,
                "stock": analysis,
                "cached": false
            }))
        }
        Ok(None) => {
            Json(json!({
                "success": false,
                "error": format!("Stock '{}' not found. It may not have been analyzed yet or failed during analysis.", symbol)
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

/// Get company profile from Yahoo Finance (description, industry, website, etc.)
async fn get_stock_profile(
    State(state): State<AppState>,
    Path(symbol): Path<String>,
) -> impl IntoResponse {
    match state.yahoo_client.get_company_profile(&symbol).await {
        Ok(profile) => {
            Json(json!({
                "success": true,
                "symbol": symbol,
                "profile": profile,
            }))
        }
        Err(e) => {
            warn!("Failed to fetch company profile for {}: {}", symbol, e);
            Json(json!({
                "success": false,
                "error": e.to_string()
            }))
        }
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
            "error": "AI analysis is not enabled. Set OPENROUTER_API_KEY_STOCKS environment variable."
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

/// Stream AI analysis via Server-Sent Events for real-time updates
async fn stream_ai_analysis(
    State(state): State<AppState>,
    Path(symbol): Path<String>,
) -> Sse<std::pin::Pin<Box<dyn futures::Stream<Item = Result<Event, Infallible>> + Send>>> {
    use futures::stream::StreamExt;

    // Helper to create error stream
    fn error_stream(msg: String) -> std::pin::Pin<Box<dyn futures::Stream<Item = Result<Event, Infallible>> + Send>> {
        Box::pin(futures::stream::once(async move {
            Ok::<_, Infallible>(Event::default()
                .event("error")
                .data(format!(r#"{{"type":"error","message":"{}"}}"#, msg)))
        }))
    }

    // Check if OpenRouter is enabled
    if !state.openrouter_client.is_enabled() {
        return Sse::new(error_stream("AI analysis is not enabled. Set OPENROUTER_API_KEY_STOCKS environment variable.".to_string()))
            .keep_alive(KeepAlive::default());
    }

    // First, get the stock analysis from cache or database
    let analysis = if let Some(cached) = state.cache.get_stock(&symbol).await {
        Some(cached)
    } else {
        match state.db.get_analysis_by_symbol(&symbol).await {
            Ok(Some(db_analysis)) => Some(db_analysis),
            _ => None,
        }
    };

    let Some(analysis) = analysis else {
        return Sse::new(error_stream(format!("No analysis found for {}. Wait for the analysis cycle to complete.", symbol)))
            .keep_alive(KeepAlive::default());
    };

    // Create the streaming response
    match state.openrouter_client.analyze_stock_streaming(&analysis).await {
        Ok(event_stream) => {
            let sse_stream = event_stream.map(|event: StreamEvent| {
                let data = serde_json::to_string(&event).unwrap_or_default();
                let event_type = match &event {
                    StreamEvent::Status { .. } => "status",
                    StreamEvent::ModelInfo { .. } => "model_info",
                    StreamEvent::Content { .. } => "content",
                    StreamEvent::Done { .. } => "done",
                    StreamEvent::Error { .. } => "error",
                };
                Ok::<_, Infallible>(Event::default().event(event_type).data(data))
            });
            let boxed: std::pin::Pin<Box<dyn futures::Stream<Item = Result<Event, Infallible>> + Send>> = Box::pin(sse_stream);
            Sse::new(boxed).keep_alive(KeepAlive::default())
        }
        Err(e) => {
            Sse::new(error_stream(format!("Failed to start streaming: {}", e)))
                .keep_alive(KeepAlive::default())
        }
    }
}

/// Get AI system status
async fn get_ai_status(State(state): State<AppState>) -> impl IntoResponse {
    let enabled = state.openrouter_client.is_enabled();
    let current_model = if enabled {
        state.openrouter_client.current_model().await
    } else {
        None
    };
    let available_models = crate::openrouter::get_free_models().await;

    Json(json!({
        "enabled": enabled,
        "current_model": current_model,
        "available_models_count": available_models.len(),
    }))
}

/// Get list of available AI models
async fn get_ai_models() -> impl IntoResponse {
    let models = crate::openrouter::get_free_models().await;
    let count = models.len();
    Json(json!({
        "models": models,
        "count": count,
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

// ============================================================================
// News, Sectors, Earnings, Insiders, Correlation Endpoints
// ============================================================================

/// Query parameters for news endpoint
#[derive(Debug, Deserialize)]
pub struct NewsQuery {
    pub sector: Option<String>,
    pub search: Option<String>,
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

/// Get aggregated news from all stocks
async fn get_all_news(
    State(state): State<AppState>,
    Query(query): Query<NewsQuery>,
) -> impl IntoResponse {
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(50).min(100);

    match state.db.get_all_news(query.sector, query.search, page, page_size).await {
        Ok((news, total)) => {
            let total_pages = ((total as f64) / (page_size as f64)).ceil() as u32;
            Json(json!({
                "success": true,
                "news": news,
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

/// Get sector performance aggregation
async fn get_sector_performance(State(state): State<AppState>) -> impl IntoResponse {
    // Check generic cache first
    if let Some(cached) = state.cache.get_generic("sectors").await {
        return Json(serde_json::from_str(&cached).unwrap_or(json!({
            "success": false,
            "error": "Cache parse error"
        })));
    }

    match state.db.get_sector_performance().await {
        Ok(sectors) => {
            let response = json!({
                "success": true,
                "sectors": sectors
            });
            // Cache the result
            if let Ok(serialized) = serde_json::to_string(&response) {
                state.cache.set_generic("sectors".to_string(), serialized).await;
            }
            Json(response)
        }
        Err(e) => Json(json!({
            "success": false,
            "error": e.to_string()
        })),
    }
}

/// Query parameters for earnings calendar
#[derive(Debug, Deserialize)]
pub struct EarningsQuery {
    pub days_ahead: Option<u32>,
}

/// Get earnings calendar for top stocks
async fn get_earnings_calendar(
    State(state): State<AppState>,
    Query(query): Query<EarningsQuery>,
) -> impl IntoResponse {
    let _days_ahead = query.days_ahead.unwrap_or(30);

    // Get top stocks by market cap
    let filter = StockFilter {
        min_price: None,
        max_price: None,
        min_volume: None,
        min_market_cap: Some(10_000_000_000.0), // Only large caps for earnings calendar
        max_market_cap: None,
        min_rsi: None,
        max_rsi: None,
        sectors: None,
        only_oversold: None,
        only_overbought: None,
        min_stochastic_k: None,
        max_stochastic_k: None,
        min_bandwidth: None,
        max_bandwidth: None,
        max_abs_price_change_percent: None,
        sort_by: Some("market_cap".to_string()),
        sort_order: Some("desc".to_string()),
        page: Some(1),
        page_size: Some(100),
    };

    let stocks = match state.db.get_latest_analyses(filter).await {
        Ok(s) => s,
        Err(e) => {
            return Json(json!({ "success": false, "error": e.to_string() }));
        }
    };

    let mut earnings = Vec::new();

    for stock in &stocks {
        // Check cache first
        if let Some(cached) = state.cache.get_earnings(&stock.symbol).await {
            if cached.earnings_date.is_some() {
                earnings.push(json!({
                    "symbol": stock.symbol,
                    "sector": stock.sector,
                    "market_cap": stock.market_cap,
                    "price": stock.price,
                    "earnings": cached
                }));
            }
            continue;
        }

        // Fetch from Yahoo (with rate limiting awareness)
        match state.yahoo_client.get_earnings_data(&stock.symbol).await {
            Ok(data) => {
                state.cache.set_earnings(stock.symbol.clone(), data.clone()).await;
                if data.earnings_date.is_some() {
                    earnings.push(json!({
                        "symbol": stock.symbol,
                        "sector": stock.sector,
                        "market_cap": stock.market_cap,
                        "price": stock.price,
                        "earnings": data
                    }));
                }
            }
            Err(e) => {
                warn!("Failed to fetch earnings for {}: {}", stock.symbol, e);
            }
        }
    }

    // Sort by earnings date ascending
    earnings.sort_by(|a, b| {
        let date_a = a.get("earnings").and_then(|e| e.get("earnings_date")).and_then(|d| d.as_str());
        let date_b = b.get("earnings").and_then(|e| e.get("earnings_date")).and_then(|d| d.as_str());
        date_a.cmp(&date_b)
    });

    Json(json!({
        "success": true,
        "earnings": earnings,
        "count": earnings.len()
    }))
}

/// Get insider trades for a stock
async fn get_insider_trades(
    State(state): State<AppState>,
    Path(symbol): Path<String>,
) -> impl IntoResponse {
    // Check cache
    if let Some(cached) = state.cache.get_insiders(&symbol).await {
        return Json(json!({
            "success": true,
            "symbol": symbol,
            "trades": cached,
            "cached": true
        }));
    }

    match state.nasdaq_client.get_insider_trades(&symbol, 20).await {
        Ok(trades) => {
            state.cache.set_insiders(symbol.clone(), trades.clone()).await;
            Json(json!({
                "success": true,
                "symbol": symbol,
                "trades": trades,
                "cached": false
            }))
        }
        Err(e) => {
            warn!("Failed to fetch insider trades for {}: {}", symbol, e);
            Json(json!({
                "success": false,
                "error": e.to_string()
            }))
        }
    }
}

/// Get earnings data for a single stock
async fn get_stock_earnings(
    State(state): State<AppState>,
    Path(symbol): Path<String>,
) -> impl IntoResponse {
    // Check cache
    if let Some(cached) = state.cache.get_earnings(&symbol).await {
        return Json(json!({
            "success": true,
            "symbol": symbol,
            "earnings": cached,
            "cached": true
        }));
    }

    match state.yahoo_client.get_earnings_data(&symbol).await {
        Ok(data) => {
            state.cache.set_earnings(symbol.clone(), data.clone()).await;
            Json(json!({
                "success": true,
                "symbol": symbol,
                "earnings": data,
                "cached": false
            }))
        }
        Err(e) => {
            warn!("Failed to fetch earnings for {}: {}", symbol, e);
            Json(json!({
                "success": false,
                "error": e.to_string()
            }))
        }
    }
}

/// Query parameters for correlation matrix
#[derive(Debug, Deserialize)]
pub struct CorrelationQuery {
    pub symbols: String,       // Comma-separated
    pub days: Option<i64>,
}

/// Get correlation matrix for a set of symbols
async fn get_correlation_matrix(
    State(state): State<AppState>,
    Query(query): Query<CorrelationQuery>,
) -> impl IntoResponse {
    let symbols: Vec<String> = query.symbols
        .split(',')
        .map(|s| s.trim().to_uppercase())
        .filter(|s| !s.is_empty())
        .take(20) // Max 20 symbols
        .collect();

    if symbols.len() < 2 {
        return Json(json!({
            "success": false,
            "error": "Need at least 2 symbols for correlation"
        }));
    }

    let days = query.days.unwrap_or(90);

    // Fetch historical prices for all symbols
    let mut price_map: std::collections::HashMap<String, Vec<f64>> = std::collections::HashMap::new();

    for symbol in &symbols {
        match state.yahoo_client.get_historical_prices(symbol, days).await {
            Ok(prices) => {
                let closes: Vec<f64> = prices.iter().map(|p| p.close).collect();
                price_map.insert(symbol.clone(), closes);
            }
            Err(e) => {
                warn!("Failed to fetch history for {}: {}", symbol, e);
            }
        }
    }

    // Only keep symbols we have data for
    let valid_symbols: Vec<String> = symbols.into_iter()
        .filter(|s| price_map.contains_key(s))
        .collect();

    let n = valid_symbols.len();
    let mut matrix = vec![vec![0.0f64; n]; n];

    for i in 0..n {
        for j in 0..n {
            if i == j {
                matrix[i][j] = 1.0;
            } else if j > i {
                let corr = TechnicalIndicators::calculate_correlation(
                    &price_map[&valid_symbols[i]],
                    &price_map[&valid_symbols[j]],
                ).unwrap_or(0.0);
                matrix[i][j] = corr;
                matrix[j][i] = corr;
            }
        }
    }

    Json(json!({
        "success": true,
        "symbols": valid_symbols,
        "matrix": matrix,
        "days": days
    }))
}

// ============================================================================
// Index/Fund Heatmap Endpoints
// ============================================================================

/// Query parameters for index heatmap endpoint
#[derive(Debug, Deserialize)]
pub struct IndexHeatmapQuery {
    /// Time period: "1d", "1w", "1m", "6m", "1y"
    pub period: Option<String>,
}

/// Get list of available indexes
async fn get_indexes() -> impl IntoResponse {
    let indexes = IndexDataProvider::get_indexes();
    Json(json!({
        "success": true,
        "indexes": indexes
    }))
}

/// Get details for a specific index
async fn get_index_detail(Path(index_id): Path<String>) -> impl IntoResponse {
    match IndexDataProvider::get_index_info(&index_id) {
        Some(info) => {
            let symbols = IndexDataProvider::get_index_symbols(&index_id).unwrap_or_default();
            Json(json!({
                "success": true,
                "index": {
                    "id": info.id,
                    "name": info.name,
                    "description": info.description,
                    "symbol_count": info.symbol_count,
                    "symbols": symbols
                }
            }))
        }
        None => Json(json!({
            "success": false,
            "error": format!("Index '{}' not found. Available indexes: sp500, nasdaq100, dow30, russell2000", index_id)
        })),
    }
}

/// Get heatmap data for an index with performance calculations
async fn get_index_heatmap(
    State(state): State<AppState>,
    Path(index_id): Path<String>,
    Query(query): Query<IndexHeatmapQuery>,
) -> impl IntoResponse {
    let period = query.period.unwrap_or_else(|| "1d".to_string());
    
    // Convert period to number of days for historical data fetch
    let days: i64 = match period.as_str() {
        "1d" => 2,    // Need at least 2 days to get previous close
        "1w" => 7,
        "1m" => 30,
        "6m" => 180,
        "1y" => 365,
        _ => {
            return Json(json!({
                "success": false,
                "error": format!("Invalid period '{}'. Valid periods: 1d, 1w, 1m, 6m, 1y", period)
            }));
        }
    };

    // Get index info and symbols
    let Some(info) = IndexDataProvider::get_index_info(&index_id) else {
        return Json(json!({
            "success": false,
            "error": format!("Index '{}' not found", index_id)
        }));
    };

    let Some(symbols) = IndexDataProvider::get_index_symbols(&index_id) else {
        return Json(json!({
            "success": false,
            "error": format!("No symbols found for index '{}'", index_id)
        }));
    };

    // Fetch stock data from database
    let mut stocks: Vec<StockHeatmapItem> = Vec::new();
    let mut total_market_cap: f64 = 0.0;
    let mut weighted_change: f64 = 0.0;

    // Get all analyses at once for efficiency
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
        min_stochastic_k: None,
        max_stochastic_k: None,
        min_bandwidth: None,
        max_bandwidth: None,
        max_abs_price_change_percent: None,
        sort_by: Some("market_cap".to_string()),
        sort_order: Some("desc".to_string()),
        page: None,
        page_size: Some(1000), // Get more stocks for index matching
    };

    let all_stocks = match state.db.get_latest_analyses(filter).await {
        Ok(s) => s,
        Err(e) => {
            return Json(json!({
                "success": false,
                "error": format!("Database error: {}", e)
            }));
        }
    };

    // Create a lookup map for quick access
    let stock_map: std::collections::HashMap<String, _> = all_stocks
        .into_iter()
        .map(|s| (s.symbol.clone(), s))
        .collect();

    // Match index symbols with database stocks and calculate period performance
    let symbol_count = symbols.len();
    
    for symbol in &symbols {
        if let Some(stock) = stock_map.get(&symbol.to_string()) {
            let market_cap = stock.market_cap.unwrap_or(0.0);
            
            // For 1d period, use the daily price_change_percent (fast path)
            // For longer periods, fetch historical data and calculate
            let change_percent = if period == "1d" {
                stock.price_change_percent.unwrap_or(0.0)
            } else {
                // Try to fetch historical data for period-based calculation
                match state.yahoo_client.get_historical_prices(*symbol, days).await {
                    Ok(prices) if prices.len() >= 2 => {
                        let first_price = prices.first().map(|p| p.close).unwrap_or(0.0);
                        let last_price = prices.last().map(|p| p.close).unwrap_or(0.0);
                        if first_price > 0.0 {
                            ((last_price - first_price) / first_price) * 100.0
                        } else {
                            0.0
                        }
                    }
                    _ => {
                        // Fallback to daily change if historical fetch fails
                        stock.price_change_percent.unwrap_or(0.0)
                    }
                }
            };
            
            total_market_cap += market_cap;
            
            stocks.push(StockHeatmapItem {
                symbol: symbol.to_string(),
                name: None,
                price: stock.price,
                change_percent,
                contribution: 0.0, // Will be calculated after total is known
                market_cap: Some(market_cap),
                sector: stock.sector.clone(),
            });
        }
    }

    // Calculate weighted index performance and individual contributions
    for stock in &mut stocks {
        if let Some(market_cap) = stock.market_cap {
            if total_market_cap > 0.0 {
                let weight = market_cap / total_market_cap;
                let contribution = weight * stock.change_percent;
                stock.contribution = contribution;
                weighted_change += contribution;
            }
        }
    }

    // Sort by market cap descending for heatmap display
    stocks.sort_by(|a, b| {
        b.market_cap.unwrap_or(0.0)
            .partial_cmp(&a.market_cap.unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let heatmap_data = IndexHeatmapData {
        index_id: info.id.clone(),
        index_name: info.name.clone(),
        period: period.clone(),
        index_performance: weighted_change,
        generated_at: chrono::Utc::now().to_rfc3339(),
        stocks,
    };

    Json(json!({
        "success": true,
        "heatmap": heatmap_data,
        "stats": {
            "total_constituents": symbol_count,
            "stocks_with_data": heatmap_data.stocks.len(),
            "total_market_cap": total_market_cap,
            "period": period
        }
    }))
}

