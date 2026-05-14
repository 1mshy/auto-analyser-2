//! Email (SMTP) notification channel.
//!
//! Sends alerts as plain-text emails over SMTP. The transport is constructed
//! once in `EmailChannel::new` and reused for every send — building a new
//! `AsyncSmtpTransport` per message would be wasteful and breaks lettre's
//! internal connection pooling.
//!
//! The actual send is factored behind a small [`EmailSender`] trait so tests
//! can inject a fake sender that captures the outgoing message instead of
//! hitting a real SMTP server.

use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use std::sync::Arc;
use tracing::debug;

use lettre::message::Mailbox;
use lettre::transport::smtp::authentication::Credentials;
use lettre::transport::smtp::AsyncSmtpTransport;
use lettre::{AsyncTransport, Message, Tokio1Executor};

use super::{Channel, RenderedMessage};
use crate::notifications::models::EmailChannelConfig;

const DEFAULT_SUBJECT: &str = "auto-analyser alert";

/// Pluggable send hook. The real implementation drives an
/// `AsyncSmtpTransport`; tests swap in a fake that records the message.
#[async_trait]
pub trait EmailSender: Send + Sync {
    async fn send(&self, message: Message) -> Result<()>;
}

/// Real lettre-backed sender. Holds the transport so connection pooling works.
pub struct SmtpSender {
    transport: AsyncSmtpTransport<Tokio1Executor>,
}

#[async_trait]
impl EmailSender for SmtpSender {
    async fn send(&self, message: Message) -> Result<()> {
        self.transport
            .send(message)
            .await
            .map(|_| ())
            .map_err(|e| anyhow!("smtp send failed: {}", e))
    }
}

struct Prepared {
    sender: Arc<dyn EmailSender>,
    from: Mailbox,
    to: Vec<Mailbox>,
}

pub struct EmailChannel {
    cfg: EmailChannelConfig,
    /// Parsed addresses + ready sender, or the error that prevented setup.
    /// Failures are deferred to `send`/`send_test` so a single misconfigured
    /// channel can't break the dispatcher's factory.
    prepared: Result<Prepared, String>,
}

impl EmailChannel {
    /// Build a channel backed by a real SMTP transport.
    pub fn new(cfg: EmailChannelConfig) -> Self {
        let prepared = build_transport(&cfg).and_then(|transport| {
            let sender: Arc<dyn EmailSender> = Arc::new(SmtpSender { transport });
            prepare(&cfg, sender)
        });
        Self::from_prepared(cfg, prepared)
    }

    /// Build a channel with a caller-supplied sender. Used by tests to inject
    /// a fake that records outgoing messages.
    pub fn with_sender(cfg: EmailChannelConfig, sender: Arc<dyn EmailSender>) -> Self {
        let prepared = prepare(&cfg, sender);
        Self::from_prepared(cfg, prepared)
    }

    fn from_prepared(cfg: EmailChannelConfig, prepared: Result<Prepared>) -> Self {
        Self {
            cfg,
            prepared: prepared.map_err(|e| e.to_string()),
        }
    }

    fn ready(&self) -> Result<&Prepared> {
        self.prepared
            .as_ref()
            .map_err(|e| anyhow!("email channel not initialised: {}", e))
    }

    fn build_message(prepared: &Prepared, subject: String, body: String) -> Result<Message> {
        let mut builder = Message::builder()
            .from(prepared.from.clone())
            .subject(subject);
        for to in &prepared.to {
            builder = builder.to(to.clone());
        }
        builder
            .body(body)
            .map_err(|e| anyhow!("failed to build email: {}", e))
    }
}

fn prepare(cfg: &EmailChannelConfig, sender: Arc<dyn EmailSender>) -> Result<Prepared> {
    let from = cfg
        .from_addr
        .parse::<Mailbox>()
        .with_context(|| format!("invalid from_addr `{}`", cfg.from_addr))?;
    if cfg.to_addrs.is_empty() {
        return Err(anyhow!("email channel has no recipients"));
    }
    let to = cfg
        .to_addrs
        .iter()
        .map(|addr| {
            addr.parse::<Mailbox>()
                .with_context(|| format!("invalid recipient `{}`", addr))
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(Prepared { sender, from, to })
}

fn build_transport(cfg: &EmailChannelConfig) -> Result<AsyncSmtpTransport<Tokio1Executor>> {
    if cfg.smtp_host.trim().is_empty() {
        return Err(anyhow!("smtp_host is empty"));
    }
    let builder = if cfg.use_tls {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&cfg.smtp_host)
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&cfg.smtp_host)
    }
    .with_context(|| format!("failed to configure SMTP relay {}", cfg.smtp_host))?;

    let creds = Credentials::new(cfg.smtp_username.clone(), cfg.smtp_password.clone());
    Ok(builder.port(cfg.smtp_port).credentials(creds).build())
}

#[async_trait]
impl Channel for EmailChannel {
    async fn send(&self, msg: &RenderedMessage) -> Result<()> {
        let prepared = self.ready()?;
        let subject = if msg.title.trim().is_empty() {
            DEFAULT_SUBJECT.to_string()
        } else {
            msg.title.clone()
        };
        let message = Self::build_message(prepared, subject, msg.body.clone())?;
        debug!(
            "email: sending alert for {} to {} recipient(s)",
            msg.symbol,
            prepared.to.len()
        );
        prepared.sender.send(message).await
    }

    async fn send_test(&self) -> Result<()> {
        let prepared = self.ready()?;
        let subject = format!("{} — test notification", DEFAULT_SUBJECT);
        let body = format!(
            "If you can read this, your auto-analyser SMTP channel is wired correctly.\n\
             SMTP host: {}:{}\nFrom: {}\nRecipients: {}",
            self.cfg.smtp_host,
            self.cfg.smtp_port,
            self.cfg.from_addr,
            self.cfg.to_addrs.join(", "),
        );
        let message = Self::build_message(prepared, subject, body)?;
        debug!(
            "email: sending test message to {} recipient(s)",
            prepared.to.len()
        );
        prepared.sender.send(message).await
    }
}
