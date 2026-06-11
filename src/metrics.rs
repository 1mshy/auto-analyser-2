//! Prometheus `/metrics` endpoint.
//!
//! Exposes counters and gauges scraped by Prometheus. All metrics live on a
//! dedicated `REGISTRY` so they don't collide with the (unused) global default
//! registry, and they're declared as `Lazy` statics so increment sites can
//! reference them without any runtime lookup.
//!
//! Metric names:
//!   - `analysis_cycle_completed_total` (IntCounter)
//!   - `yahoo_requests_total{status}` (IntCounterVec)
//!   - `alerts_dispatched_total{channel,status}` (IntCounterVec)
//!
//! Cache size gauges are intentionally omitted — `CacheLayer` does not
//! currently expose entry counts publicly and we don't want to broaden its
//! surface for an observability stub. They can be added later once the cache
//! exposes a counter.
//!
//! The handler returns Prometheus text format (`text/plain; version=0.0.4`),
//! NOT JSON — `/metrics` is the one endpoint exempt from the project's JSON
//! response convention.

use axum::{
    http::{header, StatusCode},
    response::IntoResponse,
};
use once_cell::sync::Lazy;
use prometheus::{IntCounter, IntCounterVec, Opts, Registry, TextEncoder};

/// Dedicated registry. We do NOT use `prometheus::default_registry()` — keeping
/// our own registry avoids collisions with any transitive dependency that
/// might register its own metrics globally.
pub static REGISTRY: Lazy<Registry> = Lazy::new(Registry::new);

/// Count of successful analysis cycles. Incremented at the end of each cycle.
pub static ANALYSIS_CYCLE_COMPLETED_TOTAL: Lazy<IntCounter> = Lazy::new(|| {
    let counter = IntCounter::new(
        "analysis_cycle_completed_total",
        "Number of analysis cycles that ran to completion.",
    )
    .expect("metric construction must succeed");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("analysis_cycle_completed_total must register only once");
    counter
});

/// Count of Yahoo HTTP fetches, labelled by status (`ok` | `error`).
pub static YAHOO_REQUESTS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let counter = IntCounterVec::new(
        Opts::new("yahoo_requests_total", "Yahoo Finance HTTP fetch outcomes."),
        &["status"],
    )
    .expect("metric construction must succeed");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("yahoo_requests_total must register only once");
    counter
});

/// Count of alert dispatch attempts, labelled by channel kind and status.
pub static ALERTS_DISPATCHED_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let counter = IntCounterVec::new(
        Opts::new(
            "alerts_dispatched_total",
            "Alert dispatch outcomes per channel.",
        ),
        &["channel", "status"],
    )
    .expect("metric construction must succeed");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("alerts_dispatched_total must register only once");
    counter
});

/// Force-initialise all `Lazy` metrics so they appear in scrape output even
/// before any increment site has fired. Call once at startup (idempotent) or
/// rely on the handler — `gather()` will only see metrics that have been
/// touched, so this matters for empty-startup visibility.
pub fn init() {
    Lazy::force(&ANALYSIS_CYCLE_COMPLETED_TOTAL);
    Lazy::force(&YAHOO_REQUESTS_TOTAL);
    Lazy::force(&ALERTS_DISPATCHED_TOTAL);
}

/// Axum handler. Returns the Prometheus text exposition format.
///
/// On encoder failure (essentially impossible for the text encoder) returns
/// 500 with a plain-text error body — Prometheus servers will mark the scrape
/// as failed rather than ingesting garbage.
pub async fn metrics_handler() -> impl IntoResponse {
    // Ensure metrics are registered even if no increment has fired yet.
    init();

    let encoder = TextEncoder::new();
    let metric_families = REGISTRY.gather();
    match encoder.encode_to_string(&metric_families) {
        Ok(body) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/plain; version=0.0.4")],
            body,
        )
            .into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
            format!("metrics encode error: {}", err),
        )
            .into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;

    #[tokio::test]
    async fn handler_renders_expected_metric_names() {
        // Trigger increments so the counters show up in the gathered output.
        ANALYSIS_CYCLE_COMPLETED_TOTAL.inc();
        YAHOO_REQUESTS_TOTAL.with_label_values(&["ok"]).inc();
        YAHOO_REQUESTS_TOTAL.with_label_values(&["error"]).inc();
        ALERTS_DISPATCHED_TOTAL
            .with_label_values(&["discord", "ok"])
            .inc();

        let response = metrics_handler().await.into_response();
        assert_eq!(response.status(), StatusCode::OK);

        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_string();
        assert!(
            content_type.starts_with("text/plain"),
            "unexpected content-type: {}",
            content_type
        );

        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("read body");
        let body = String::from_utf8(bytes.to_vec()).expect("utf8");

        assert!(
            body.contains("analysis_cycle_completed_total"),
            "missing analysis_cycle_completed_total: {}",
            body
        );
        assert!(
            body.contains("yahoo_requests_total"),
            "missing yahoo_requests_total: {}",
            body
        );
        assert!(
            body.contains("alerts_dispatched_total"),
            "missing alerts_dispatched_total: {}",
            body
        );
        // Sanity-check that labels render.
        assert!(body.contains("status=\"ok\""), "missing status=ok label");
        assert!(
            body.contains("channel=\"discord\""),
            "missing channel=discord label"
        );
    }
}
