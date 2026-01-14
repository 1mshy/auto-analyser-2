//! Rate Limit Tester for Yahoo Finance API
//!
//! This binary tests different concurrency levels and request delays
//! to find the optimal settings before hitting rate limits.
//!
//! Run with: cargo run --bin rate_limit_tester

use auto_analyser_2::async_fetcher::{AsyncStockFetcher, FetcherConfig};
use std::time::Duration;
use tokio::time::sleep;

/// Test symbols for rate limit testing
const TEST_SYMBOLS: [&str; 20] = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META",
    "NVDA", "TSLA", "JPM", "V", "JNJ",
    "WMT", "PG", "MA", "HD", "DIS",
    "PYPL", "NFLX", "ADBE", "CRM", "INTC",
];

#[derive(Debug)]
struct TestResult {
    concurrency: usize,
    delay_ms: u64,
    total_requests: usize,
    successful: usize,
    rate_limited: usize,
    success_rate: f64,
    rate_limit_rate: f64,
    avg_time_ms: u64,
}

#[tokio::main]
async fn main() {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("auto_analyser_2=info".parse().unwrap())
                .add_directive("rate_limit_tester=info".parse().unwrap()),
        )
        .init();

    println!("\n");
    println!("╔══════════════════════════════════════════════════════════════════╗");
    println!("║         YAHOO FINANCE RATE LIMIT TESTER                          ║");
    println!("║         Finding optimal request rates                            ║");
    println!("╚══════════════════════════════════════════════════════════════════╝");
    println!();

    let mut results: Vec<TestResult> = Vec::new();

    // Phase 1: Concurrency tests with minimal delay
    println!("═══════════════════════════════════════════════════════════════════");
    println!("  PHASE 1: CONCURRENCY TESTS");
    println!("  Testing different concurrency levels with 100ms delay");
    println!("═══════════════════════════════════════════════════════════════════\n");

    for concurrency in [10, 5, 3, 2, 1] {
        let result = run_test(concurrency, 100, 10).await;
        print_result(&result);
        results.push(result);
        
        // Cool-down between tests
        println!("  ⏳ Cooling down for 5 seconds...\n");
        sleep(Duration::from_secs(5)).await;
    }

    // Phase 2: Delay sweep tests (sequential)
    println!("\n═══════════════════════════════════════════════════════════════════");
    println!("  PHASE 2: DELAY SWEEP TESTS");
    println!("  Testing different delays with concurrency=1");
    println!("═══════════════════════════════════════════════════════════════════\n");

    for delay_ms in [50, 100, 250, 500, 1000, 2000, 3000] {
        let result = run_test(1, delay_ms, 5).await;
        print_result(&result);
        results.push(result);
        
        // Cool-down between tests
        println!("  ⏳ Cooling down for 3 seconds...\n");
        sleep(Duration::from_secs(3)).await;
    }

    // Phase 3: Find sweet spot
    println!("\n═══════════════════════════════════════════════════════════════════");
    println!("  PHASE 3: COMBINED TESTS");
    println!("  Testing promising combinations");
    println!("═══════════════════════════════════════════════════════════════════\n");

    let combinations = [
        (2, 500),
        (2, 1000),
        (3, 500),
        (3, 1000),
        (5, 1000),
        (5, 2000),
    ];

    for (concurrency, delay_ms) in combinations {
        let result = run_test(concurrency, delay_ms, 10).await;
        print_result(&result);
        results.push(result);
        
        // Cool-down between tests
        println!("  ⏳ Cooling down for 5 seconds...\n");
        sleep(Duration::from_secs(5)).await;
    }

    // Print summary and recommendations
    print_summary(&results);
}

async fn run_test(concurrency: usize, delay_ms: u64, num_symbols: usize) -> TestResult {
    let config = FetcherConfig {
        concurrency,
        delay_between_requests_ms: delay_ms,
        days: 7, // Short range for faster tests
    };

    let fetcher = AsyncStockFetcher::new(config);
    let symbols: Vec<String> = TEST_SYMBOLS
        .iter()
        .take(num_symbols)
        .map(|s| s.to_string())
        .collect();

    println!(
        "  Testing: concurrency={}, delay={}ms, symbols={}",
        concurrency, delay_ms, num_symbols
    );

    let result = fetcher.fetch_batch(symbols).await;

    TestResult {
        concurrency,
        delay_ms,
        total_requests: result.successful.len() + result.failed.len(),
        successful: result.successful.len(),
        rate_limited: result.rate_limit_errors,
        success_rate: result.success_rate(),
        rate_limit_rate: result.rate_limit_rate(),
        avg_time_ms: result.avg_time_per_request.as_millis() as u64,
    }
}

fn print_result(result: &TestResult) {
    let status = if result.rate_limit_rate < 1.0 {
        "✅"
    } else if result.rate_limit_rate < 20.0 {
        "⚠️"
    } else {
        "❌"
    };

    println!(
        "  {} c={}, d={}ms | success: {:.0}% ({}/{}), rate_limited: {:.0}%, avg: {}ms",
        status,
        result.concurrency,
        result.delay_ms,
        result.success_rate,
        result.successful,
        result.total_requests,
        result.rate_limit_rate,
        result.avg_time_ms
    );
}

fn print_summary(results: &[TestResult]) {
    println!("\n");
    println!("╔══════════════════════════════════════════════════════════════════╗");
    println!("║                      SUMMARY & RECOMMENDATIONS                   ║");
    println!("╚══════════════════════════════════════════════════════════════════╝");
    println!();

    // Find best configurations
    let safe_configs: Vec<_> = results
        .iter()
        .filter(|r| r.rate_limit_rate < 1.0 && r.successful > 0)
        .collect();

    let aggressive_configs: Vec<_> = results
        .iter()
        .filter(|r| r.rate_limit_rate < 20.0 && r.rate_limit_rate >= 1.0 && r.successful > 0)
        .collect();

    println!("  SAFE CONFIGURATIONS (0% rate limited):");
    println!("  ─────────────────────────────────────────");
    if safe_configs.is_empty() {
        println!("  ⚠️  No completely safe configurations found!");
        println!("  Consider using longer delays (3000ms+) or external proxy.");
    } else {
        // Sort by throughput (concurrency / delay)
        let mut sorted = safe_configs.clone();
        sorted.sort_by(|a, b| {
            let throughput_a = a.concurrency as f64 / (a.delay_ms as f64 + 1.0);
            let throughput_b = b.concurrency as f64 / (b.delay_ms as f64 + 1.0);
            throughput_b.partial_cmp(&throughput_a).unwrap()
        });

        for (i, config) in sorted.iter().take(3).enumerate() {
            let rank = match i {
                0 => "🥇 BEST",
                1 => "🥈",
                2 => "🥉",
                _ => "",
            };
            println!(
                "  {} concurrency={}, delay={}ms (success: {:.0}%)",
                rank, config.concurrency, config.delay_ms, config.success_rate
            );
        }
    }

    println!();
    println!("  AGGRESSIVE CONFIGURATIONS (<20% rate limited):");
    println!("  ─────────────────────────────────────────────────");
    if aggressive_configs.is_empty() {
        println!("  No aggressive configurations available.");
    } else {
        for config in aggressive_configs.iter().take(3) {
            println!(
                "  ⚡ concurrency={}, delay={}ms (success: {:.0}%, rate_limited: {:.0}%)",
                config.concurrency, config.delay_ms, config.success_rate, config.rate_limit_rate
            );
        }
    }

    // Environment-specific recommendations
    println!();
    println!("  ENVIRONMENT RECOMMENDATIONS:");
    println!("  ────────────────────────────");
    
    if let Some(best_safe) = safe_configs.first() {
        println!(
            "  📦 Docker:     YAHOO_REQUEST_DELAY_MS={}, concurrency={}",
            best_safe.delay_ms.max(2000),
            1
        );
        println!(
            "  💻 Local dev:  YAHOO_REQUEST_DELAY_MS={}, concurrency={}",
            best_safe.delay_ms,
            best_safe.concurrency.min(3)
        );
    } else {
        println!(
            "  📦 Docker:     YAHOO_REQUEST_DELAY_MS=5000, concurrency=1"
        );
        println!(
            "  💻 Local dev:  YAHOO_REQUEST_DELAY_MS=2000, concurrency=2"
        );
    }

    println!();
    println!("  ─────────────────────────────────────────────────────────────────");
    println!("  💡 TIP: If rate limiting persists, consider using a proxy service");
    println!("          or switching to Alpha Vantage / Twelve Data APIs.");
    println!();
}
