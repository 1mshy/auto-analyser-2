use crate::{
    cache::CacheLayer,
    db::MongoDB,
    indexes::{
        IndexDataProvider, IndexHeatmapData, MarketIndexQuote, StockHeatmapItem, MARKET_INDEXES,
    },
    indicators::TechnicalIndicators,
    marketaux::MarketauxClient,
    models::{
        AggregatedNewsItem, BacktestResult, BacktestRun, CreateBacktestInput, NasdaqNewsItem,
        NewsCardPayload, StockAnalysis, StockFilter, WsMessage,
    },
    nasdaq::NasdaqClient,
    notifications::AlertEngine,
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
use chrono::{Duration as ChronoDuration, Utc};
use futures::stream::{self, StreamExt};
use serde::Deserialize;
use serde_json::json;
use std::convert::Infallible;

/// Query parameters for market summary endpoint
#[derive(Debug, Deserialize)]
pub struct MarketSummaryQuery {
    pub min_market_cap: Option<f64>,
    pub max_price_change_percent: Option<f64>,
}
use crate::models::AnalysisProgress;
use mongodb::bson::oid::ObjectId;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tracing::{info, warn};

#[derive(Clone)]
pub struct AppState {
    pub db: MongoDB,
    pub cache: CacheLayer,
    pub progress: Arc<RwLock<AnalysisProgress>>,
    /// Per-symbol analyses broadcast as they're saved; each WS connection
    /// subscribes for live `stock_update` pushes.
    pub stock_tx: broadcast::Sender<StockAnalysis>,
    pub yahoo_client: YahooFinanceClient,
    pub openrouter_client: OpenRouterClient,
    pub nasdaq_client: NasdaqClient,
    pub alert_engine: AlertEngine,
    pub marketaux_client: MarketauxClient,
    /// Skip the OpenRouter summarizer when fewer than this many articles came
    /// back. Mirrors the field on `Config`.
    pub news_summary_min_articles: usize,
}

pub fn create_router(state: AppState) -> Router {
    let router: Router<AppState> = Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/api/stocks", get(get_stocks))
        .route("/api/stocks/filter", post(filter_stocks))
        .route("/api/stocks/:symbol", get(get_stock_by_symbol))
        .route("/api/stocks/:symbol/history", get(get_stock_history))
        .route("/api/stocks/:symbol/ai-analysis", get(get_ai_analysis))
        .route(
            "/api/stocks/:symbol/ai-analysis/stream",
            get(stream_ai_analysis),
        )
        .route("/api/stocks/:symbol/profile", get(get_stock_profile))
        .route("/api/market-summary", get(get_market_summary))
        .route("/api/progress", get(get_progress))
        .route("/api/ai/status", get(get_ai_status))
        .route("/api/ai/models", get(get_ai_models))
        // Marketaux + AI news card (per-stock)
        .route("/api/stocks/:symbol/news", get(get_stock_news_card))
        .route(
            "/api/news/daily-symbols",
            get(list_daily_news_symbols).post(add_daily_news_symbol),
        )
        .route(
            "/api/news/daily-symbols/:symbol",
            axum::routing::delete(remove_daily_news_symbol),
        )
        // New analytics endpoints
        .route("/api/news", get(get_all_news))
        .route("/api/sectors", get(get_sector_performance))
        .route("/api/earnings", get(get_earnings_calendar))
        .route("/api/stocks/:symbol/insiders", get(get_insider_trades))
        .route("/api/stocks/:symbol/earnings", get(get_stock_earnings))
        .route("/api/analytics/correlation", get(get_correlation_matrix))
        // Backtesting / strategy performance
        .route("/api/backtest", post(run_backtest))
        .route("/api/backtests", get(list_backtests))
        .route("/api/backtest/:id", get(get_backtest))
        // Index/Fund heatmap endpoints
        .route("/api/market-indexes", get(get_market_indexes))
        .route("/api/indexes", get(get_indexes))
        .route("/api/indexes/:index_id", get(get_index_detail))
        .route("/api/indexes/:index_id/heatmap", get(get_index_heatmap))
        .route("/metrics", get(crate::metrics::metrics_handler))
        .route("/ws", get(websocket_handler));

    crate::notifications::api::mount(router).with_state(state)
}

async fn root() -> impl IntoResponse {
    Json(json!({
        "name": "Auto Stock Analyser API",
        "version": "0.1.0",
        "status": "running"
    }))
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let db_ok = state.db.get_analysis_count().await;
    let count = db_ok.as_ref().copied().unwrap_or(0);
    let progress = state.progress.read().await;
    let status = if db_ok.is_ok() { "healthy" } else { "degraded" };

    Json(json!({
        "status": status,
        "database": if db_ok.is_ok() { "connected" } else { "error" },
        "total_analyses": count,
        "last_cycle_started": progress.last_cycle_started,
        "last_cycle_completed": progress.last_cycle_completed,
        "last_successful_cycle": progress.last_successful_cycle,
        "last_error": progress.last_error
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
        "last_cycle_started": progress.last_cycle_started,
        "last_cycle_completed": progress.last_cycle_completed,
        "last_successful_cycle": progress.last_successful_cycle,
        "last_error": progress.last_error,
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
        symbol_search: None,
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
        symbol_search: filter.symbol_search.clone(),
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
        let total = state
            .db
            .get_filtered_count(count_filter)
            .await
            .unwrap_or(cached.len() as u64);
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
    match state
        .db
        .get_market_summary(10, query.min_market_cap, query.max_price_change_percent)
        .await
    {
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
        Ok(Some(analysis)) => Json(json!({
            "success": true,
            "stock": analysis,
            "cached": false
        })),
        Ok(None) => Json(json!({
            "success": false,
            "error": format!("Stock '{}' not found. It may not have been analyzed yet or failed during analysis.", symbol)
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
        Ok(history) => Json(json!({
            "success": true,
            "symbol": symbol,
            "history": history,
        })),
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
    let cache_key = symbol.to_uppercase();

    if let Some(profile) = state.cache.get_company_profile(&cache_key).await {
        return Json(json!({
            "success": true,
            "symbol": symbol,
            "profile": profile,
            "cached": true,
        }));
    }

    match state.yahoo_client.get_company_profile(&cache_key).await {
        Ok(profile) => {
            state
                .cache
                .set_company_profile(cache_key, profile.clone())
                .await;
            Json(json!({
                "success": true,
                "symbol": symbol,
                "profile": profile,
                "cached": false,
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
        Ok(ai_response) => Json(json!({
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
        })),
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
    fn error_stream(
        msg: String,
    ) -> std::pin::Pin<Box<dyn futures::Stream<Item = Result<Event, Infallible>> + Send>> {
        Box::pin(futures::stream::once(async move {
            Ok::<_, Infallible>(
                Event::default()
                    .event("error")
                    .data(format!(r#"{{"type":"error","message":"{}"}}"#, msg)),
            )
        }))
    }

    // Check if OpenRouter is enabled
    if !state.openrouter_client.is_enabled() {
        return Sse::new(error_stream(
            "AI analysis is not enabled. Set OPENROUTER_API_KEY_STOCKS environment variable."
                .to_string(),
        ))
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
        return Sse::new(error_stream(format!(
            "No analysis found for {}. Wait for the analysis cycle to complete.",
            symbol
        )))
        .keep_alive(KeepAlive::default());
    };

    // Create the streaming response
    match state
        .openrouter_client
        .analyze_stock_streaming(&analysis)
        .await
    {
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
            let boxed: std::pin::Pin<
                Box<dyn futures::Stream<Item = Result<Event, Infallible>> + Send>,
            > = Box::pin(sse_stream);
            Sse::new(boxed).keep_alive(KeepAlive::default())
        }
        Err(e) => Sse::new(error_stream(format!("Failed to start streaming: {}", e)))
            .keep_alive(KeepAlive::default()),
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

    let mut stock_rx = state.stock_tx.subscribe();
    // First tick fires immediately, so the client gets its initial progress
    // snapshot right away; subsequent ticks act as a 2s keepalive.
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(2));

    loop {
        tokio::select! {
            _ = interval.tick() => {
                let progress = state.progress.read().await.clone();
                let msg = serde_json::to_string(&WsMessage::Progress(progress)).unwrap();
                if socket.send(Message::Text(msg)).await.is_err() {
                    info!("WebSocket client disconnected");
                    break;
                }
            }
            result = stock_rx.recv() => match result {
                Ok(analysis) => {
                    let msg =
                        serde_json::to_string(&WsMessage::StockUpdate(Box::new(analysis)))
                            .unwrap();
                    if socket.send(Message::Text(msg)).await.is_err() {
                        info!("WebSocket client disconnected");
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    warn!(
                        "WebSocket client lagged behind stock broadcast ({} updates dropped); requesting resync",
                        skipped
                    );
                    let msg = serde_json::to_string(&WsMessage::Resync).unwrap();
                    if socket.send(Message::Text(msg)).await.is_err() {
                        info!("WebSocket client disconnected");
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Closed) => break,
            },
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
    let sector = query.sector.clone();
    let search = query.search.clone();

    match state
        .db
        .get_all_news(sector.clone(), search.clone(), page, page_size)
        .await
    {
        Ok((mut news, mut total)) => {
            if let Some(on_demand) = get_on_demand_symbol_news(
                &state,
                sector.as_deref(),
                search.as_deref(),
                page,
                page_size,
            )
            .await
            {
                merge_news_items(&mut news, on_demand);
                total = total.max(news.len() as u64);
            }

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

fn news_search_symbol(search: Option<&str>) -> Option<String> {
    let raw = search?.trim();
    if raw.is_empty() || raw.len() > 16 {
        return None;
    }
    if !raw
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '/'))
    {
        return None;
    }

    Some(crate::symbols::normalize_symbol_key(raw))
}

async fn get_on_demand_symbol_news(
    state: &AppState,
    sector: Option<&str>,
    search: Option<&str>,
    page: u32,
    page_size: u32,
) -> Option<Vec<AggregatedNewsItem>> {
    if page != 1 {
        return None;
    }

    let symbol = news_search_symbol(search)?;
    let analysis = state
        .db
        .get_analysis_by_symbol(&symbol)
        .await
        .ok()
        .flatten();
    let symbol_sector = analysis.as_ref().and_then(|a| a.sector.clone());
    if let Some(required_sector) = sector {
        if symbol_sector.as_deref() != Some(required_sector) {
            return None;
        }
    }

    let limit = page_size.clamp(1, 100) as usize;
    let articles = match get_cached_or_fetch_nasdaq_news(state, &symbol, limit).await {
        Ok(articles) => articles,
        Err(e) => {
            warn!("On-demand NASDAQ news fetch failed for {}: {}", symbol, e);
            return None;
        }
    };

    if articles.is_empty() {
        return None;
    }

    Some(news_articles_to_aggregated(
        &symbol,
        symbol_sector,
        articles,
    ))
}

async fn get_cached_or_fetch_nasdaq_news(
    state: &AppState,
    symbol: &str,
    limit: usize,
) -> anyhow::Result<Vec<NasdaqNewsItem>> {
    if let Some(cached) = state.cache.get_news(symbol).await {
        return Ok(cached);
    }

    state.nasdaq_client.apply_delay().await;
    let articles = state.nasdaq_client.get_news(symbol, limit).await?;

    if !articles.is_empty() {
        state
            .cache
            .set_news(symbol.to_string(), articles.clone())
            .await;
        match state.db.set_analysis_news(symbol, &articles).await {
            Ok(true) => {
                state.cache.invalidate_stock(symbol).await;
                state.cache.invalidate_all_lists().await;
            }
            Ok(false) => {}
            Err(e) => warn!("Failed to persist on-demand news for {}: {}", symbol, e),
        }
    }

    Ok(articles)
}

fn news_articles_to_aggregated(
    symbol: &str,
    sector: Option<String>,
    articles: Vec<NasdaqNewsItem>,
) -> Vec<AggregatedNewsItem> {
    articles
        .into_iter()
        .map(|item| AggregatedNewsItem {
            symbol: symbol.to_string(),
            sector: sector.clone(),
            title: item.title,
            url: item.url,
            publisher: item.publisher,
            created: item.created,
            ago: item.ago,
        })
        .collect()
}

fn merge_news_items(news: &mut Vec<AggregatedNewsItem>, on_demand: Vec<AggregatedNewsItem>) {
    for item in on_demand.into_iter().rev() {
        if !news.iter().any(|existing| existing.url == item.url) {
            news.insert(0, item);
        }
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
                state
                    .cache
                    .set_generic("sectors".to_string(), serialized)
                    .await;
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
    let days_ahead = query.days_ahead.unwrap_or(30);
    let cutoff = Utc::now() + ChronoDuration::days(days_ahead as i64);

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
        symbol_search: None,
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

    let cache = state.cache.clone();
    let yahoo = state.yahoo_client.clone();
    let results = stream::iter(stocks)
        .map(|stock| {
            let cache = cache.clone();
            let yahoo = yahoo.clone();
            async move {
                let data = if let Some(cached) = cache.get_earnings(&stock.symbol).await {
                    cached
                } else {
                    match yahoo.get_earnings_data(&stock.symbol).await {
                        Ok(data) => {
                            cache.set_earnings(stock.symbol.clone(), data.clone()).await;
                            data
                        }
                        Err(e) => {
                            warn!("Failed to fetch earnings for {}: {}", stock.symbol, e);
                            return (None, Some(stock.symbol));
                        }
                    }
                };

                let Some(date) = data.earnings_date.as_ref() else {
                    return (None, None);
                };
                if *date > cutoff {
                    return (None, None);
                }

                (
                    Some(json!({
                        "symbol": stock.symbol,
                        "sector": stock.sector,
                        "market_cap": stock.market_cap,
                        "price": stock.price,
                        "earnings": data
                    })),
                    None,
                )
            }
        })
        .buffer_unordered(5)
        .collect::<Vec<_>>()
        .await;

    let mut earnings = Vec::new();
    let mut failed_symbols = Vec::new();
    for (row, failed) in results {
        if let Some(row) = row {
            earnings.push(row);
        }
        if let Some(symbol) = failed {
            failed_symbols.push(symbol);
        }
    }

    // Sort by earnings date ascending
    earnings.sort_by(|a, b| {
        let date_a = a
            .get("earnings")
            .and_then(|e| e.get("earnings_date"))
            .and_then(|d| d.as_str());
        let date_b = b
            .get("earnings")
            .and_then(|e| e.get("earnings_date"))
            .and_then(|d| d.as_str());
        date_a.cmp(&date_b)
    });

    Json(json!({
        "success": true,
        "earnings": earnings,
        "count": earnings.len(),
        "days_ahead": days_ahead,
        "failed_symbols": failed_symbols
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
            state
                .cache
                .set_insiders(symbol.clone(), trades.clone())
                .await;
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
    pub symbols: String, // Comma-separated
    pub days: Option<i64>,
}

/// Get correlation matrix for a set of symbols
async fn get_correlation_matrix(
    State(state): State<AppState>,
    Query(query): Query<CorrelationQuery>,
) -> impl IntoResponse {
    let symbols: Vec<String> = query
        .symbols
        .split(',')
        .map(crate::symbols::normalize_symbol_key)
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
    let requested_symbols = symbols.clone();

    // Fetch historical prices with bounded concurrency.
    let yahoo = state.yahoo_client.clone();
    let history_results = stream::iter(symbols.iter().cloned())
        .map(|symbol| {
            let yahoo = yahoo.clone();
            async move {
                match yahoo.get_historical_prices(&symbol, days).await {
                    Ok(prices) => {
                        let closes: Vec<f64> = prices.iter().map(|p| p.close).collect();
                        (symbol, Some(closes), None)
                    }
                    Err(e) => {
                        warn!("Failed to fetch history for {}: {}", symbol, e);
                        let err = e.to_string();
                        (symbol, None, Some(err))
                    }
                }
            }
        })
        .buffer_unordered(5)
        .collect::<Vec<_>>()
        .await;

    let mut price_map: std::collections::HashMap<String, Vec<f64>> =
        std::collections::HashMap::new();
    let mut failed_symbols = Vec::new();
    for (symbol, closes, err) in history_results {
        if let Some(closes) = closes {
            price_map.insert(symbol, closes);
        } else {
            failed_symbols.push(
                json!({ "symbol": symbol, "error": err.unwrap_or_else(|| "unknown".to_string()) }),
            );
        }
    }

    // Only keep symbols we have data for
    let valid_symbols: Vec<String> = symbols
        .into_iter()
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
                )
                .unwrap_or(0.0);
                matrix[i][j] = corr;
                matrix[j][i] = corr;
            }
        }
    }

    Json(json!({
        "success": true,
        "requested_symbols": requested_symbols,
        "symbols": valid_symbols,
        "matrix": matrix,
        "days": days,
        "failed_symbols": failed_symbols
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

/// Get live quotes for the broad market indexes shown on the Sectors page.
async fn get_market_indexes(State(state): State<AppState>) -> impl IntoResponse {
    const CACHE_KEY: &str = "market_indexes";

    if let Some(cached) = state.cache.get_generic(CACHE_KEY).await {
        return Json(serde_json::from_str(&cached).unwrap_or(json!({
            "success": false,
            "error": "Cache parse error"
        })));
    }

    let yahoo = state.yahoo_client.clone();
    let quotes: Vec<MarketIndexQuote> = stream::iter(MARKET_INDEXES.iter().copied())
        .map(|entry| {
            let yahoo = yahoo.clone();
            async move {
                let mut q = MarketIndexQuote {
                    id: entry.id.to_string(),
                    name: entry.name.to_string(),
                    description: entry.description.to_string(),
                    yahoo_ticker: entry.yahoo_ticker.to_string(),
                    heatmap_id: entry.heatmap_id.map(|s| s.to_string()),
                    value: None,
                    change: None,
                    change_percent: None,
                    error: None,
                };

                match yahoo.get_historical_prices(entry.yahoo_ticker, 5).await {
                    Ok(prices) if prices.len() >= 2 => {
                        let last = prices.last().unwrap();
                        let prev = &prices[prices.len() - 2];
                        let change = last.close - prev.close;
                        let change_percent = if prev.close.abs() > f64::EPSILON {
                            (change / prev.close) * 100.0
                        } else {
                            0.0
                        };
                        q.value = Some(last.close);
                        q.change = Some(change);
                        q.change_percent = Some(change_percent);
                    }
                    Ok(prices) if prices.len() == 1 => {
                        q.value = Some(prices[0].close);
                        q.error = Some("Only one bar available".to_string());
                    }
                    Ok(_) => {
                        q.error = Some("No price data".to_string());
                    }
                    Err(e) => {
                        q.error = Some(e.to_string());
                    }
                }

                q
            }
        })
        .buffer_unordered(6)
        .collect::<Vec<_>>()
        .await;

    // Preserve catalog order regardless of completion order.
    let order: std::collections::HashMap<&str, usize> = MARKET_INDEXES
        .iter()
        .enumerate()
        .map(|(i, e)| (e.id, i))
        .collect();
    let mut quotes = quotes;
    quotes.sort_by_key(|q| order.get(q.id.as_str()).copied().unwrap_or(usize::MAX));

    let response = json!({
        "success": true,
        "indexes": quotes,
        "generated_at": chrono::Utc::now().to_rfc3339(),
    });

    if let Ok(serialized) = serde_json::to_string(&response) {
        state
            .cache
            .set_generic(CACHE_KEY.to_string(), serialized)
            .await;
    }

    Json(response)
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
        "1d" => 2, // Need at least 2 days to get previous close
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
        symbol_search: None,
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

    // Match index symbols with database stocks and calculate period performance.
    // Longer periods need Yahoo calls, so fetch those with bounded concurrency.
    let symbol_count = symbols.len();
    let stock_inputs: Vec<_> = symbols
        .iter()
        .filter_map(|symbol| {
            let lookup_symbol = crate::symbols::normalize_symbol_key(symbol);
            stock_map
                .get(&lookup_symbol)
                .cloned()
                .map(|stock| (lookup_symbol, stock))
        })
        .collect();
    let yahoo = state.yahoo_client.clone();
    let period_for_tasks = period.clone();
    let rows = stream::iter(stock_inputs)
        .map(|(lookup_symbol, stock)| {
            let yahoo = yahoo.clone();
            let period = period_for_tasks.clone();
            async move {
                let mut used_fallback = false;
                let change_percent = if period == "1d" {
                    stock.price_change_percent.unwrap_or(0.0)
                } else {
                    match yahoo.get_historical_prices(&lookup_symbol, days).await {
                        Ok(prices) if prices.len() >= 2 => {
                            let first_price = prices.first().map(|p| p.close).unwrap_or(0.0);
                            let last_price = prices.last().map(|p| p.close).unwrap_or(0.0);
                            if first_price > 0.0 {
                                ((last_price - first_price) / first_price) * 100.0
                            } else {
                                used_fallback = true;
                                stock.price_change_percent.unwrap_or(0.0)
                            }
                        }
                        Ok(_) | Err(_) => {
                            used_fallback = true;
                            stock.price_change_percent.unwrap_or(0.0)
                        }
                    }
                };

                let market_cap = stock.market_cap.unwrap_or(0.0);
                (
                    StockHeatmapItem {
                        symbol: lookup_symbol,
                        name: None,
                        price: stock.price,
                        change_percent,
                        contribution: 0.0,
                        market_cap: Some(market_cap),
                        sector: stock.sector.clone(),
                    },
                    used_fallback,
                )
            }
        })
        .buffer_unordered(5)
        .collect::<Vec<_>>()
        .await;

    let mut fallback_symbols = Vec::new();
    for (item, used_fallback) in rows {
        total_market_cap += item.market_cap.unwrap_or(0.0);
        if used_fallback {
            fallback_symbols.push(item.symbol.clone());
        }
        stocks.push(item);
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
        b.market_cap
            .unwrap_or(0.0)
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
            "period": period,
            "fallback_symbols": fallback_symbols
        }
    }))
}

// ============================================================================
// Marketaux + AI news card endpoints
// ============================================================================

/// `GET /api/stocks/:symbol/news` — fetch news articles for `symbol` and an
/// AI-generated summary, served from cache when fresh.
async fn get_stock_news_card(
    State(state): State<AppState>,
    Path(symbol): Path<String>,
) -> impl IntoResponse {
    let symbol_upper = symbol.to_uppercase();

    if !state.marketaux_client.is_configured() {
        return Json(json!({
            "success": false,
            "error": "Marketaux is not configured. Set MARKETAUX_API_KEY to enable news."
        }));
    }

    if let Some(cached) = state.cache.get_news_card(&symbol_upper).await {
        return Json(json!({
            "success": true,
            "data": cached,
            "cached": true,
        }));
    }

    let articles = match state.marketaux_client.fetch_news(&symbol_upper, 10).await {
        Ok(a) => a,
        Err(e) => {
            warn!("Marketaux fetch failed for {}: {}", symbol_upper, e);
            return Json(json!({
                "success": false,
                "error": format!("News fetch failed: {}", e)
            }));
        }
    };

    let date_today = Utc::now().format("%Y-%m-%d").to_string();
    let mut summary = match state
        .db
        .get_news_summary_for_date(&symbol_upper, &date_today)
        .await
    {
        Ok(maybe) => maybe,
        Err(e) => {
            warn!(
                "Failed to read existing news summary for {}: {}",
                symbol_upper, e
            );
            None
        }
    };

    if summary.is_none()
        && articles.len() >= state.news_summary_min_articles
        && state.openrouter_client.is_enabled()
    {
        match state
            .openrouter_client
            .summarize_news(&symbol_upper, &articles)
            .await
        {
            Ok(generated) => {
                if let Err(e) = state.db.upsert_news_summary(&generated).await {
                    warn!("Failed to persist news summary for {}: {}", symbol_upper, e);
                }
                summary = Some(generated);
            }
            Err(e) => {
                warn!("News summarization failed for {}: {}", symbol_upper, e);
            }
        }
    }

    let payload = NewsCardPayload {
        symbol: symbol_upper.clone(),
        articles,
        summary,
        fetched_at: Utc::now(),
    };

    state
        .cache
        .set_news_card(symbol_upper.clone(), payload.clone())
        .await;

    Json(json!({
        "success": true,
        "data": payload,
        "cached": false,
    }))
}

/// `GET /api/news/daily-symbols` — list symbols enrolled in the daily prefetch.
async fn list_daily_news_symbols(State(state): State<AppState>) -> impl IntoResponse {
    match state.db.list_daily_news_symbols().await {
        Ok(symbols) => Json(json!({
            "success": true,
            "symbols": symbols,
        })),
        Err(e) => Json(json!({
            "success": false,
            "error": e.to_string(),
        })),
    }
}

#[derive(Debug, Deserialize)]
pub struct DailyNewsSymbolBody {
    pub symbol: String,
}

/// `POST /api/news/daily-symbols` — add a symbol to the daily prefetch list.
async fn add_daily_news_symbol(
    State(state): State<AppState>,
    Json(body): Json<DailyNewsSymbolBody>,
) -> impl IntoResponse {
    let symbol = body.symbol.trim().to_uppercase();
    if symbol.is_empty() {
        return Json(json!({
            "success": false,
            "error": "symbol must not be empty",
        }));
    }
    match state.db.add_daily_news_symbol(&symbol).await {
        Ok(record) => Json(json!({
            "success": true,
            "symbol": record.symbol,
        })),
        Err(e) => Json(json!({
            "success": false,
            "error": e.to_string(),
        })),
    }
}

/// `DELETE /api/news/daily-symbols/:symbol` — drop a symbol from the daily list.
async fn remove_daily_news_symbol(
    State(state): State<AppState>,
    Path(symbol): Path<String>,
) -> impl IntoResponse {
    let upper = symbol.to_uppercase();
    match state.db.remove_daily_news_symbol(&upper).await {
        Ok(removed) => Json(json!({
            "success": true,
            "symbol": upper,
            "removed": removed,
        })),
        Err(e) => Json(json!({
            "success": false,
            "error": e.to_string(),
        })),
    }
}

// ============================================================================
// Backtesting endpoints
// ============================================================================

/// Default Yahoo lookback (~2 years) when the request gives neither an explicit
/// `lookback_days` nor a `start_date`.
const BACKTEST_DEFAULT_LOOKBACK_DAYS: i64 = 730;
/// Extra calendar days fetched before the requested window so indicators
/// (SMA-50, MACD, …) are warm by the time entries are allowed at `start_date`.
const BACKTEST_WARMUP_BUFFER_DAYS: i64 = 120;
const BACKTEST_MIN_LOOKBACK_DAYS: i64 = 30;
const BACKTEST_MAX_LOOKBACK_DAYS: i64 = 3650;
/// Cap on symbols per run to bound the number of Yahoo fetches.
const BACKTEST_MAX_SYMBOLS: usize = 25;

/// Effective starting capital, falling back to the engine default when the
/// client supplies a non-positive value (mirrors `backtest::simulate_from`).
fn effective_initial_capital(strategy: &crate::models::Strategy) -> f64 {
    if strategy.initial_capital.is_finite() && strategy.initial_capital > 0.0 {
        strategy.initial_capital
    } else {
        10_000.0
    }
}

/// `POST /api/backtest` — run a strategy over one or more symbols (and/or a
/// watchlist), persist the run, and return it. History is fetched via the
/// existing Yahoo client; the simulation itself is network-free.
async fn run_backtest(
    State(state): State<AppState>,
    Json(input): Json<CreateBacktestInput>,
) -> impl IntoResponse {
    // Resolve the symbol universe: explicit list ∪ watchlist members.
    let mut symbols: Vec<String> = input
        .symbols
        .iter()
        .map(|s| crate::symbols::normalize_symbol_key(s))
        .filter(|s| !s.is_empty())
        .collect();

    if let Some(wl_id) = input.watchlist_id.as_ref() {
        match ObjectId::parse_str(wl_id) {
            Ok(oid) => {
                if let Ok(Some(wl)) = state.alert_engine.repo().get_watchlist(&oid).await {
                    for s in wl.symbols {
                        let n = crate::symbols::normalize_symbol_key(&s);
                        if !n.is_empty() {
                            symbols.push(n);
                        }
                    }
                }
            }
            Err(_) => {
                return Json(json!({
                    "success": false,
                    "error": format!("invalid watchlist id '{}'", wl_id)
                }));
            }
        }
    }

    // Dedupe preserving order, then cap.
    let mut seen = std::collections::HashSet::new();
    symbols.retain(|s| seen.insert(s.clone()));
    symbols.truncate(BACKTEST_MAX_SYMBOLS);

    if symbols.is_empty() {
        return Json(json!({
            "success": false,
            "error": "no symbols provided (give `symbols` and/or a `watchlist_id`)"
        }));
    }

    // Derive the Yahoo lookback so the requested window has warmup ahead of it.
    let now = Utc::now();
    let span_days = input
        .start_date
        .map(|s| now.signed_duration_since(s).num_days().max(0))
        .unwrap_or(BACKTEST_DEFAULT_LOOKBACK_DAYS);
    let days = input
        .lookback_days
        .unwrap_or(span_days + BACKTEST_WARMUP_BUFFER_DAYS)
        .clamp(BACKTEST_MIN_LOOKBACK_DAYS, BACKTEST_MAX_LOOKBACK_DAYS);

    let initial_capital = effective_initial_capital(&input.strategy);
    let start_date = input.start_date;
    let end_date = input.end_date;
    let yahoo = state.yahoo_client.clone();

    // Fetch + simulate per symbol with bounded concurrency; preserve request order.
    let indexed: Vec<(usize, String)> = symbols.iter().cloned().enumerate().collect();
    let mut computed = stream::iter(indexed)
        .map(|(idx, symbol)| {
            let yahoo = yahoo.clone();
            let strategy = input.strategy.clone();
            async move {
                let result = match yahoo.get_historical_prices(&symbol, days).await {
                    Ok(mut prices) => {
                        // Upper bound: drop bars after end_date (warmup bars before
                        // start_date are kept so indicators are warm).
                        if let Some(end) = end_date {
                            prices.retain(|p| p.date <= end);
                        }
                        match start_date {
                            // No lower bound → simulate the whole fetched series.
                            None => crate::backtest::simulate(&symbol, &prices, &strategy),
                            // Allow entries only from the first in-window bar; the
                            // earlier bars still warm the indicators.
                            Some(start) => {
                                let start_index = prices
                                    .iter()
                                    .position(|p| p.date >= start)
                                    .unwrap_or(prices.len());
                                crate::backtest::simulate_from(
                                    &symbol,
                                    &prices,
                                    &strategy,
                                    start_index,
                                )
                            }
                        }
                    }
                    Err(e) => {
                        warn!("Backtest history fetch failed for {}: {}", symbol, e);
                        crate::backtest::error_result(&symbol, initial_capital, e.to_string())
                    }
                };
                (idx, result)
            }
        })
        .buffer_unordered(5)
        .collect::<Vec<_>>()
        .await;
    computed.sort_by_key(|(idx, _)| *idx);
    let results: Vec<BacktestResult> = computed.into_iter().map(|(_, r)| r).collect();

    let label = input
        .label
        .clone()
        .filter(|l| !l.trim().is_empty())
        .unwrap_or_else(|| {
            let head: Vec<&str> = symbols.iter().take(5).map(|s| s.as_str()).collect();
            let mut l = head.join(", ");
            if symbols.len() > 5 {
                l.push_str(&format!(" +{}", symbols.len() - 5));
            }
            l
        });

    let ran_at = Utc::now();
    let summary = crate::backtest::summarize(&label, &symbols, ran_at, &results);
    let run = BacktestRun {
        id: None,
        label,
        strategy: input.strategy,
        symbols,
        results,
        summary,
        ran_at,
    };

    match state.db.save_backtest(run).await {
        Ok(saved) => Json(json!({ "success": true, "run": saved })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

/// `GET /api/backtests` — list run summaries, most recent first.
async fn list_backtests(State(state): State<AppState>) -> impl IntoResponse {
    match state.db.list_backtest_summaries(100).await {
        Ok(summaries) => Json(json!({
            "success": true,
            "count": summaries.len(),
            "backtests": summaries
        })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

/// `GET /api/backtest/:id` — fetch a full run (per-symbol trades + equity curves).
async fn get_backtest(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let oid = match ObjectId::parse_str(&id) {
        Ok(o) => o,
        Err(_) => {
            return Json(json!({
                "success": false,
                "error": format!("invalid backtest id '{}'", id)
            }));
        }
    };
    match state.db.get_backtest_by_id(&oid).await {
        Ok(Some(run)) => Json(json!({ "success": true, "run": run })),
        Ok(None) => Json(json!({
            "success": false,
            "error": format!("backtest '{}' not found", id)
        })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn news_search_symbol_accepts_ticker_shapes() {
        assert_eq!(news_search_symbol(Some("aapl")).as_deref(), Some("AAPL"));
        assert_eq!(news_search_symbol(Some("brk.b")).as_deref(), Some("BRK-B"));
        assert_eq!(
            news_search_symbol(Some("shop.to")).as_deref(),
            Some("SHOP.TO")
        );
    }

    #[test]
    fn news_search_symbol_rejects_keyword_queries() {
        assert!(news_search_symbol(Some("apple earnings")).is_none());
        assert!(news_search_symbol(Some("")).is_none());
        assert!(news_search_symbol(Some("THISQUERYISTOOLONG")).is_none());
    }

    #[test]
    fn merge_news_items_dedupes_by_url_and_prefers_on_demand_first() {
        let mut news = vec![AggregatedNewsItem {
            symbol: "MSFT".to_string(),
            sector: None,
            title: "Existing".to_string(),
            url: "https://example.com/existing".to_string(),
            publisher: None,
            created: None,
            ago: None,
        }];
        let on_demand = vec![
            AggregatedNewsItem {
                symbol: "AAPL".to_string(),
                sector: None,
                title: "Fetched".to_string(),
                url: "https://example.com/fetched".to_string(),
                publisher: None,
                created: None,
                ago: None,
            },
            AggregatedNewsItem {
                symbol: "AAPL".to_string(),
                sector: None,
                title: "Duplicate".to_string(),
                url: "https://example.com/existing".to_string(),
                publisher: None,
                created: None,
                ago: None,
            },
        ];

        merge_news_items(&mut news, on_demand);

        assert_eq!(news.len(), 2);
        assert_eq!(news[0].title, "Fetched");
        assert_eq!(news[1].title, "Existing");
    }
}
