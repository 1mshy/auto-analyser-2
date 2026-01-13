mod analysis;
mod api;
mod cache;
mod config;
mod db;
mod indicators;
mod models;
mod nasdaq;
mod openrouter;
mod yahoo;

use analysis::AnalysisEngine;
use api::{create_router, AppState};
use cache::CacheLayer;
use config::Config;
use db::MongoDB;
use openrouter::OpenRouterClient;
use yahoo::YahooFinanceClient;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

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
    tracing::info!("Cache layer initialized with TTL: {}s (news: {}s)", 
        config.cache_ttl_secs, config.news_cache_ttl_secs);

    // Initialize Yahoo Finance client
    let yahoo_client = YahooFinanceClient::new();
    tracing::info!("Yahoo Finance client initialized");

    // Initialize OpenRouter client
    let openrouter_client = OpenRouterClient::new(
        config.OPENROUTER_API_KEY_STOCKS.clone(),
        config.openrouter_enabled,
    );
    if openrouter_client.is_enabled() {
        let models = openrouter::get_free_models().await;
        tracing::info!("🤖 OpenRouter AI client enabled with {} free models", 
            models.len());
    } else {
        tracing::info!("🤖 OpenRouter AI disabled (set OPENROUTER_API_KEY_STOCKS to enable)");
    }

    // Create analysis engine
    let analysis_engine = AnalysisEngine::new(
        db.clone(),
        cache.clone(),
        config.analysis_interval_secs,
        config.yahoo_request_delay_ms,
        config.nasdaq_request_delay_ms,
    );
    let progress = analysis_engine.get_progress();
    tracing::info!("NASDAQ request delay: {}ms", config.nasdaq_request_delay_ms);

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

    // Create application state
    let app_state = AppState {
        db: db.clone(),
        cache: cache.clone(),
        progress,
        yahoo_client,
        openrouter_client,
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
    tracing::info!("🔄 Analysis interval: {}s ({}h)", 
        config.analysis_interval_secs,
        config.analysis_interval_secs / 3600
    );

    // Run server
    axum::serve(listener, app)
        .await?;

    // Wait for analysis engine (runs forever)
    analysis_handle.await?;

    Ok(())
}
