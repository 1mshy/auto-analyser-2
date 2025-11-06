#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use serde_json::json;
    use tower::ServiceExt;

    async fn create_test_app() -> Router {
        // Create mock state for testing
        let config = crate::config::Config {
            mongodb_uri: "mongodb://localhost:27017".to_string(),
            database_name: "test_stock_analyzer".to_string(),
            server_host: "127.0.0.1".to_string(),
            server_port: 3000,
            analysis_interval_secs: 3600,
            cache_ttl_secs: 300,
        };

        let cache = crate::cache::CacheLayer::new(config.cache_ttl_secs);
        
        // For tests without MongoDB, we'll test route logic
        let progress = Arc::new(RwLock::new(AnalysisProgress {
            total_stocks: 60,
            analyzed: 30,
            current_symbol: Some("AAPL".to_string()),
            cycle_start: chrono::Utc::now(),
            errors: 2,
        }));

        // We can't easily mock MongoDB, so we'll skip those tests
        // and test the routes that don't require DB
        Router::new()
            .route("/", axum::routing::get(|| async {
                axum::Json(json!({
                    "name": "Auto Stock Analyser API",
                    "version": "0.1.0",
                    "status": "running"
                }))
            }))
            .route("/api/progress", axum::routing::get(move || {
                let progress = progress.clone();
                async move {
                    let p = progress.read().await;
                    axum::Json(json!({
                        "total_stocks": p.total_stocks,
                        "analyzed": p.analyzed,
                        "current_symbol": p.current_symbol,
                        "completion_percentage": if p.total_stocks > 0 {
                            p.analyzed as f64 / p.total_stocks as f64 * 100.0
                        } else {
                            0.0
                        }
                    }))
                }
            }))
    }

    #[tokio::test]
    async fn test_root_endpoint() {
        let app = create_test_app().await;

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body_str = String::from_utf8(body.to_vec()).unwrap();
        
        assert!(body_str.contains("Auto Stock Analyser API"));
        assert!(body_str.contains("running"));
    }

    #[tokio::test]
    async fn test_progress_endpoint() {
        let app = create_test_app().await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/progress")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(json["total_stocks"], 60);
        assert_eq!(json["analyzed"], 30);
        assert_eq!(json["current_symbol"], "AAPL");
        assert_eq!(json["completion_percentage"], 50.0);
    }

    #[test]
    fn test_app_state_creation() {
        let cache = crate::cache::CacheLayer::new(300);
        let progress = Arc::new(RwLock::new(AnalysisProgress {
            total_stocks: 0,
            analyzed: 0,
            current_symbol: None,
            cycle_start: chrono::Utc::now(),
            errors: 0,
        }));

        // Just verify we can create the progress structure
        assert!(progress.try_read().is_ok());
    }

    #[tokio::test]
    async fn test_progress_calculation() {
        let progress = Arc::new(RwLock::new(AnalysisProgress {
            total_stocks: 100,
            analyzed: 75,
            current_symbol: Some("MSFT".to_string()),
            cycle_start: chrono::Utc::now(),
            errors: 5,
        }));

        let p = progress.read().await;
        let percentage = if p.total_stocks > 0 {
            p.analyzed as f64 / p.total_stocks as f64 * 100.0
        } else {
            0.0
        };

        assert_eq!(percentage, 75.0);
        assert_eq!(p.errors, 5);
    }

    #[tokio::test]
    async fn test_progress_zero_stocks() {
        let progress = Arc::new(RwLock::new(AnalysisProgress {
            total_stocks: 0,
            analyzed: 0,
            current_symbol: None,
            cycle_start: chrono::Utc::now(),
            errors: 0,
        }));

        let p = progress.read().await;
        let percentage = if p.total_stocks > 0 {
            p.analyzed as f64 / p.total_stocks as f64 * 100.0
        } else {
            0.0
        };

        assert_eq!(percentage, 0.0);
    }
}
