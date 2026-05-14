//! Email channel dispatch tests.
//!
//! These tests exercise the SMTP channel end-to-end *without* hitting a real
//! mail server by swapping the real `EmailSender` for a fake that captures
//! outgoing `lettre::Message`s.

use std::sync::{Arc, Mutex};

use anyhow::Result;
use async_trait::async_trait;
use chrono::Utc;
use lettre::Message;

use auto_analyser_2::models::StockAnalysis;
use auto_analyser_2::notifications::channels::email::{EmailChannel, EmailSender};
use auto_analyser_2::notifications::channels::{Channel, RenderedMessage};
use auto_analyser_2::notifications::models::EmailChannelConfig;

#[derive(Default)]
struct CapturingSender {
    sent: Mutex<Vec<Message>>,
}

impl CapturingSender {
    fn snapshot_raw(&self) -> Vec<String> {
        self.sent
            .lock()
            .unwrap()
            .iter()
            .map(|m| String::from_utf8_lossy(&m.formatted()).into_owned())
            .collect()
    }
}

#[async_trait]
impl EmailSender for CapturingSender {
    async fn send(&self, message: Message) -> Result<()> {
        self.sent.lock().unwrap().push(message);
        Ok(())
    }
}

fn sample_cfg() -> EmailChannelConfig {
    EmailChannelConfig {
        smtp_host: "smtp.example.com".into(),
        smtp_port: 587,
        smtp_username: "alerts@example.com".into(),
        smtp_password: "shh".into(),
        from_addr: "Alerts <alerts@example.com>".into(),
        to_addrs: vec!["dest@example.com".into()],
        use_tls: false,
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

fn sample_message(title: &str) -> RenderedMessage {
    RenderedMessage {
        title: title.to_string(),
        body: "AAPL @ $150.25 (RSI 28.5, -1.95%)".to_string(),
        symbol: "AAPL".into(),
        matched_conditions: vec!["RSI < 30".into()],
        snapshot: sample_snapshot(),
        rule_name: "Oversold scanner".into(),
        created_at: Utc::now(),
        stock_url: None,
    }
}

#[tokio::test]
async fn captures_subject_and_body() {
    let capture = Arc::new(CapturingSender::default());
    let channel = EmailChannel::with_sender(sample_cfg(), capture.clone() as Arc<dyn EmailSender>);

    channel
        .send(&sample_message("AAPL alert"))
        .await
        .expect("send should succeed with fake transport");

    let raw = capture.snapshot_raw();
    assert_eq!(raw.len(), 1, "exactly one email should be queued");
    let body = &raw[0];
    assert!(
        body.contains("Subject: AAPL alert"),
        "subject missing: {body}"
    );
    assert!(
        body.contains("AAPL @ $150.25 (RSI 28.5, -1.95%)"),
        "body missing: {body}"
    );
    assert!(
        body.contains("alerts@example.com"),
        "from address missing: {body}"
    );
    assert!(
        body.contains("dest@example.com"),
        "to address missing: {body}"
    );
}

#[tokio::test]
async fn falls_back_to_default_subject_when_title_blank() {
    let capture = Arc::new(CapturingSender::default());
    let channel = EmailChannel::with_sender(sample_cfg(), capture.clone() as Arc<dyn EmailSender>);

    channel
        .send(&sample_message("   "))
        .await
        .expect("send should succeed");

    let raw = capture.snapshot_raw();
    assert_eq!(raw.len(), 1);
    assert!(
        raw[0].contains("Subject: auto-analyser alert"),
        "default subject missing: {}",
        raw[0]
    );
}

#[tokio::test]
async fn fans_out_to_every_recipient() {
    let mut cfg = sample_cfg();
    cfg.to_addrs = vec!["a@example.com".into(), "b@example.com".into()];

    let capture = Arc::new(CapturingSender::default());
    let channel = EmailChannel::with_sender(cfg, capture.clone() as Arc<dyn EmailSender>);

    channel
        .send(&sample_message("multi"))
        .await
        .expect("send should succeed");

    let raw = capture.snapshot_raw();
    assert_eq!(raw.len(), 1);
    assert!(raw[0].contains("a@example.com"));
    assert!(raw[0].contains("b@example.com"));
}

#[tokio::test]
async fn rejects_invalid_from_address() {
    let mut cfg = sample_cfg();
    cfg.from_addr = "not an address".into();

    let capture = Arc::new(CapturingSender::default());
    let channel = EmailChannel::with_sender(cfg, capture.clone() as Arc<dyn EmailSender>);

    let err = channel
        .send(&sample_message("nope"))
        .await
        .expect_err("invalid from address must fail");
    assert!(err.to_string().contains("from_addr"));
    assert!(capture.snapshot_raw().is_empty());
}

#[tokio::test]
async fn surfaces_sender_errors() {
    struct FailingSender;

    #[async_trait]
    impl EmailSender for FailingSender {
        async fn send(&self, _message: Message) -> Result<()> {
            Err(anyhow::anyhow!("boom"))
        }
    }

    let channel = EmailChannel::with_sender(sample_cfg(), Arc::new(FailingSender));
    let err = channel
        .send(&sample_message("x"))
        .await
        .expect_err("downstream send failure must propagate");
    assert!(err.to_string().contains("boom"));
}
