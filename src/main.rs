mod analysis;
mod api;
mod async_fetcher;
mod backtest;
mod cache;
mod config;
mod db;
mod indexes;
mod indicators;
mod marketaux;
mod metrics;
mod models;
mod nasdaq;
mod notifications;
mod openrouter;
mod symbols;
mod yahoo;

use analysis::AnalysisEngine;
use api::{create_router, AppState};
use cache::CacheLayer;
use config::Config;
use db::MongoDB;
use marketaux::MarketauxClient;
use nasdaq::NasdaqClient;
use notifications::AlertEngine;
use openrouter::OpenRouterClient;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use yahoo::YahooFinanceClient;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "auto_analyser_2=info,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("🚀 Starting Auto Stock Analyser...");

    // Load configuration
    let config = Config::from_env()?;
    tracing::info!("Configuration loaded");

    // Connect to MongoDB
    tracing::info!("Connecting to MongoDB at {}...", config.mongodb_uri);
    let db = MongoDB::new(&config.mongodb_uri, &config.database_name).await?;
    tracing::info!("✅ Connected to MongoDB database: {}", config.database_name);

    // Initialize cache
    let cache = CacheLayer::new(config.cache_ttl_secs, config.news_cache_ttl_secs);
    tracing::info!(
        "Cache layer initialized with TTL: {}s (news: {}s)",
        config.cache_ttl_secs,
        config.news_cache_ttl_secs
    );

    // Initialize Yahoo Finance client
    let yahoo_client = YahooFinanceClient::new();
    tracing::info!("Yahoo Finance client initialized");

    // Initialize OpenRouter client
    let openrouter_client = OpenRouterClient::new(
        config.OPENROUTER_API_KEY_STOCKS.clone(),
        config.openrouter_enabled,
    );
    if openrouter_client.is_enabled() {
        tracing::info!(
            "🤖 OpenRouter AI client enabled; model discovery will run in the background"
        );
        tokio::spawn(async {
            let models = openrouter::get_free_models().await;
            tracing::info!(
                "🤖 OpenRouter model discovery found {} free models",
                models.len()
            );
        });
    } else {
        tracing::info!("🤖 OpenRouter AI disabled (set OPENROUTER_API_KEY_STOCKS to enable)");
    }

    // Initialize the alert engine up-front so it can both (a) feed the analysis
    // cycle and (b) be reused by the HTTP API for CRUD on channels / rules / history.
    let alert_engine = AlertEngine::new(
        db.clone(),
        config.notifications_enabled,
        config.public_base_url.clone(),
    )
    .await?;

    // Marketaux client (powers the per-stock news card and daily prefetch)
    let marketaux_client = MarketauxClient::new(config.MARKETAUX_API_KEY.clone(), 250);
    if marketaux_client.is_configured() {
        tracing::info!(
            "📰 Marketaux news client enabled (free tier: 100 req/day; min articles for AI summary: {})",
            config.news_summary_min_articles
        );
    } else {
        tracing::info!("📰 Marketaux news client disabled (set MARKETAUX_API_KEY to enable)");
    }

    // Broadcast channel pushing each freshly saved analysis to WS clients.
    // The receiver half is created per-connection via `subscribe()`.
    let (stock_tx, _) = tokio::sync::broadcast::channel::<models::StockAnalysis>(512);

    // Create analysis engine
    let analysis_engine = AnalysisEngine::new(
        db.clone(),
        cache.clone(),
        config.analysis_interval_secs,
        config.yahoo_request_delay_ms,
        config.yahoo_concurrency,
        yahoo_client.clone(),
        config.nasdaq_request_delay_ms,
        config.min_market_cap_usd,
        config.max_abs_price_change_percent,
        config.canadian_symbols.clone(),
        Some(alert_engine.clone()),
        config.yahoo_circuit_failure_threshold,
        config.yahoo_circuit_skip_cycles,
        if marketaux_client.is_configured() {
            Some(marketaux_client.clone())
        } else {
            None
        },
        if openrouter_client.is_enabled() {
            Some(openrouter_client.clone())
        } else {
            None
        },
        config.news_summary_min_articles,
    )
    .with_stock_broadcast(stock_tx.clone());
    let progress = analysis_engine.get_progress();
    tracing::info!(
        "Yahoo Finance: concurrency={}, delay={}ms",
        config.yahoo_concurrency,
        config.yahoo_request_delay_ms
    );
    tracing::info!("NASDAQ request delay: {}ms", config.nasdaq_request_delay_ms);
    tracing::info!(
        "Canadian universe symbols configured: {}",
        config.canadian_symbols.len()
    );

    // Load existing data from MongoDB and populate cache
    tracing::info!("📥 Loading existing stock data from database...");
    match analysis_engine.load_existing_data().await {
        Ok(count) => {
            if count > 0 {
                tracing::info!("✅ Loaded {} stock analyses from database", count);
            } else {
                tracing::info!("📊 No existing data found. Will perform initial analysis.");
            }
        }
        Err(e) => {
            tracing::warn!("⚠️  Failed to load existing data: {}. Starting fresh.", e);
        }
    }

    // Start continuous analysis in background
    let analysis_handle = {
        let engine = analysis_engine;
        tokio::spawn(async move {
            engine.start_continuous_analysis().await;
        })
    };

    // Create NASDAQ client for API endpoints
    let nasdaq_client = NasdaqClient::new(config.nasdaq_request_delay_ms);

    // Create application state
    let app_state = AppState {
        db: db.clone(),
        cache: cache.clone(),
        progress,
        stock_tx,
        yahoo_client,
        openrouter_client,
        nasdaq_client,
        alert_engine,
        marketaux_client,
        news_summary_min_articles: config.news_summary_min_articles,
    };

    // Build API router with CORS
    let app = create_router(app_state).layer(
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any),
    );

    // Start HTTP server
    let addr = format!("{}:{}", config.server_host, config.server_port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;

    tracing::info!("🌐 Server listening on http://{}", addr);
    tracing::info!("📡 WebSocket endpoint: ws://{}/ws", addr);
    tracing::info!("📊 API docs: http://{}/", addr);
    tracing::info!(
        "🔄 Analysis interval: {}s ({}h)",
        config.analysis_interval_secs,
        config.analysis_interval_secs / 3600
    );

    // Run server
    axum::serve(listener, app).await?;

    // Wait for analysis engine (runs forever)
    analysis_handle.await?;

    Ok(())
}
