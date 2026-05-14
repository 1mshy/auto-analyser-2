//! Integration test for the Telegram notification channel.
//!
//! Uses a stub [`TelegramTransport`] so no real HTTP requests are made.

use std::sync::{Arc, Mutex};

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use chrono::Utc;
use serde_json::Value;

use auto_analyser_2::models::StockAnalysis;
use auto_analyser_2::notifications::channels::telegram::{TelegramChannel, TelegramTransport};
use auto_analyser_2::notifications::channels::{Channel, RenderedMessage};
use auto_analyser_2::notifications::models::TelegramChannelConfig;

/// Captured arguments for one `send_message` call.
#[derive(Clone)]
struct Capture {
    bot_token: String,
    payload: Value,
}

/// Stub transport: records every call, returns a configurable outcome.
struct StubTransport {
    calls: Arc<Mutex<Vec<Capture>>>,
    /// When `Some`, the stub returns `Err(<msg>)` instead of `Ok(())`.
    fail_with: Option<String>,
}

impl StubTransport {
    fn ok() -> (Arc<Mutex<Vec<Capture>>>, Box<dyn TelegramTransport>) {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let stub = StubTransport {
            calls: calls.clone(),
            fail_with: None,
        };
        (calls, Box::new(stub))
    }

    fn failing(msg: &str) -> (Arc<Mutex<Vec<Capture>>>, Box<dyn TelegramTransport>) {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let stub = StubTransport {
            calls: calls.clone(),
            fail_with: Some(msg.to_string()),
        };
        (calls, Box::new(stub))
    }
}

#[async_trait]
impl TelegramTransport for StubTransport {
    async fn send_message(&self, bot_token: &str, payload: &Value) -> Result<()> {
        self.calls.lock().unwrap().push(Capture {
            bot_token: bot_token.to_string(),
            payload: payload.clone(),
        });
        match &self.fail_with {
            Some(msg) => Err(anyhow!(msg.clone())),
            None => Ok(()),
        }
    }
}

fn sample_snapshot() -> StockAnalysis {
    StockAnalysis {
        id: None,
        symbol: "AAPL".into(),
        price: 150.25,
        price_change: Some(-3.0),
        price_change_percent: Some(-1.95),
        rsi: Some(28.5),
        sma_20: None,
        sma_50: None,
        macd: None,
        volume: None,
        market_cap: Some(3_000_000_000_000.0),
        sector: Some("Technology".into()),
        is_oversold: true,
        is_overbought: false,
        analyzed_at: Utc::now(),
        bollinger: None,
        stochastic: None,
        earnings: None,
        technicals: None,
        news: None,
    }
}

fn sample_message() -> RenderedMessage {
    RenderedMessage {
        title: "AAPL — Oversold".into(),
        body: "AAPL @ $150.25 (RSI 28.5, -1.95%)".into(),
        symbol: "AAPL".into(),
        matched_conditions: vec!["RSI 28.5 < 30".into()],
        snapshot: sample_snapshot(),
        rule_name: "Oversold".into(),
        created_at: Utc::now(),
        stock_url: None,
    }
}

#[tokio::test]
async fn send_posts_to_telegram_with_plain_text_body() {
    let cfg = TelegramChannelConfig {
        bot_token: "BOT-TOKEN".into(),
        chat_id: "@my_chat".into(),
        parse_mode: None,
    };
    let (calls, transport) = StubTransport::ok();
    let channel = TelegramChannel::with_transport(cfg, transport);

    channel
        .send(&sample_message())
        .await
        .expect("send should succeed");

    let captured = calls.lock().unwrap();
    assert_eq!(captured.len(), 1, "expected exactly one transport call");
    let call = &captured[0];
    assert_eq!(call.bot_token, "BOT-TOKEN");
    assert_eq!(call.payload["chat_id"], "@my_chat");
    let text = call.payload["text"]
        .as_str()
        .expect("text should be a string");
    assert!(text.contains("AAPL"), "text should contain symbol: {text}");
    assert!(text.contains("RSI 28.5"), "text should contain RSI: {text}");
    assert!(
        call.payload.get("parse_mode").is_none(),
        "parse_mode should be omitted when None"
    );
}

#[tokio::test]
async fn send_passes_through_markdownv2_parse_mode() {
    let cfg = TelegramChannelConfig {
        bot_token: "BOT-TOKEN".into(),
        chat_id: "123".into(),
        parse_mode: Some("MarkdownV2".into()),
    };
    let (calls, transport) = StubTransport::ok();
    let channel = TelegramChannel::with_transport(cfg, transport);

    channel
        .send(&sample_message())
        .await
        .expect("send should succeed");

    let captured = calls.lock().unwrap();
    assert_eq!(captured[0].payload["parse_mode"], "MarkdownV2");
}

#[tokio::test]
async fn send_passes_through_html_parse_mode() {
    let cfg = TelegramChannelConfig {
        bot_token: "BOT-TOKEN".into(),
        chat_id: "123".into(),
        parse_mode: Some("HTML".into()),
    };
    let (calls, transport) = StubTransport::ok();
    let channel = TelegramChannel::with_transport(cfg, transport);

    channel
        .send(&sample_message())
        .await
        .expect("send should succeed");

    let captured = calls.lock().unwrap();
    assert_eq!(captured[0].payload["parse_mode"], "HTML");
}

#[tokio::test]
async fn send_drops_unrecognized_parse_mode() {
    let cfg = TelegramChannelConfig {
        bot_token: "BOT-TOKEN".into(),
        chat_id: "123".into(),
        parse_mode: Some("Markdown".into()), // legacy mode, not accepted
    };
    let (calls, transport) = StubTransport::ok();
    let channel = TelegramChannel::with_transport(cfg, transport);

    channel
        .send(&sample_message())
        .await
        .expect("send should succeed");

    let captured = calls.lock().unwrap();
    assert!(
        captured[0].payload.get("parse_mode").is_none(),
        "unrecognized parse_mode must be dropped"
    );
}

#[tokio::test]
async fn send_propagates_transport_failure() {
    let cfg = TelegramChannelConfig {
        bot_token: "BOT-TOKEN".into(),
        chat_id: "123".into(),
        parse_mode: None,
    };
    let (_calls, transport) = StubTransport::failing("telegram api returned 400: bad chat id");
    let channel = TelegramChannel::with_transport(cfg, transport);

    let err = channel
        .send(&sample_message())
        .await
        .expect_err("send must surface transport failure");
    let msg = format!("{err}");
    assert!(msg.contains("400"), "error should carry status: {msg}");
    assert!(
        msg.contains("bad chat id"),
        "error should carry body: {msg}"
    );
}

#[tokio::test]
async fn send_appends_stock_url_when_present() {
    let cfg = TelegramChannelConfig {
        bot_token: "BOT-TOKEN".into(),
        chat_id: "123".into(),
        parse_mode: None,
    };
    let (calls, transport) = StubTransport::ok();
    let channel = TelegramChannel::with_transport(cfg, transport);

    let mut msg = sample_message();
    msg.stock_url = Some("https://example.com/stocks/AAPL".into());
    channel.send(&msg).await.expect("send should succeed");

    let captured = calls.lock().unwrap();
    let text = captured[0].payload["text"].as_str().unwrap();
    assert!(
        text.contains("https://example.com/stocks/AAPL"),
        "text should include the stock URL: {text}"
    );
}

#[tokio::test]
async fn send_test_dispatches_a_message() {
    let cfg = TelegramChannelConfig {
        bot_token: "BOT-TOKEN".into(),
        chat_id: "123".into(),
        parse_mode: None,
    };
    let (calls, transport) = StubTransport::ok();
    let channel = TelegramChannel::with_transport(cfg, transport);

    channel.send_test().await.expect("send_test should succeed");

    let captured = calls.lock().unwrap();
    assert_eq!(captured.len(), 1);
    assert_eq!(captured[0].bot_token, "BOT-TOKEN");
    assert_eq!(captured[0].payload["chat_id"], "123");
    let text = captured[0].payload["text"].as_str().unwrap();
    assert!(text.to_lowercase().contains("test"));
}
