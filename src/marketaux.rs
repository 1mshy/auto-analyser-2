use crate::models::NewsArticle;
use anyhow::{anyhow, Result};
use serde::Deserialize;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{debug, warn};

const BASE_URL: &str = "https://api.marketaux.com/v1/news/all";

/// Marketaux API client. Fetches finance-focused news filtered by stock symbol.
#[derive(Clone)]
pub struct MarketauxClient {
    client: reqwest::Client,
    api_key: Option<String>,
    delay_ms: u64,
}

#[derive(Debug, Deserialize)]
struct MarketauxResponse {
    data: Option<Vec<MarketauxArticle>>,
    error: Option<MarketauxError>,
}

#[derive(Debug, Deserialize)]
struct MarketauxError {
    code: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MarketauxArticle {
    title: Option<String>,
    description: Option<String>,
    snippet: Option<String>,
    url: Option<String>,
    image_url: Option<String>,
    published_at: Option<String>,
    source: Option<String>,
    entities: Option<Vec<MarketauxEntity>>,
}

#[derive(Debug, Deserialize)]
struct MarketauxEntity {
    sentiment_score: Option<f64>,
}

impl MarketauxClient {
    pub fn new(api_key: Option<String>, delay_ms: u64) -> Self {
        let api_key = api_key.filter(|k| !k.is_empty());
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .timeout(Duration::from_secs(20))
            .build()
            .expect("Failed to build Marketaux HTTP client");

        MarketauxClient {
            client,
            api_key,
            delay_ms,
        }
    }

    pub fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    pub async fn apply_delay(&self) {
        if self.delay_ms > 0 {
            sleep(Duration::from_millis(self.delay_ms)).await;
        }
    }

    /// Fetch up to `limit` articles for `symbol` from Marketaux. Returns an
    /// error containing `429` / `Rate limited` so existing rate-limit
    /// detection upstream still trips on it.
    pub async fn fetch_news(&self, symbol: &str, limit: usize) -> Result<Vec<NewsArticle>> {
        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| anyhow!("Marketaux API key not configured"))?;

        let symbol = symbol.to_uppercase();
        let limit = limit.clamp(1, 100);
        let url = build_news_url(BASE_URL, api_key, &symbol, limit);

        debug!("Fetching Marketaux news for {}", symbol);

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| anyhow!("Marketaux request failed for {}: {}", symbol, e))?;

        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|e| anyhow!("Failed to read Marketaux body for {}: {}", symbol, e))?;

        if status == reqwest::StatusCode::TOO_MANY_REQUESTS || status.as_u16() == 429 {
            return Err(anyhow!(
                "Marketaux 429 Rate limited for {}: {}",
                symbol,
                text
            ));
        }
        if !status.is_success() {
            warn!(
                "Marketaux returned status {} for {}: {}",
                status, symbol, text
            );
            return Err(anyhow!(
                "Marketaux returned status {} for {}",
                status,
                symbol
            ));
        }

        parse_news_response(&text, &symbol)
    }
}

/// Minimal percent-encoder for query-string values. Encodes everything except
/// the unreserved set so an `&`/`=`/`+` in a key or symbol can't terminate
/// the query string early.
fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        let unreserved = matches!(b,
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~'
        );
        if unreserved {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

/// Build the request URL. Pure so it can be unit-tested without network.
fn build_news_url(base: &str, api_key: &str, symbol: &str, limit: usize) -> String {
    format!(
        "{}?symbols={}&filter_entities=true&language=en&limit={}&api_token={}",
        base,
        percent_encode(symbol),
        limit,
        percent_encode(api_key)
    )
}

/// Parse a Marketaux response into normalized articles. The API surfaces both
/// hard failures (status 429, 401) and soft failures (200 with an `error`
/// payload), so check the body either way.
pub(crate) fn parse_news_response(text: &str, symbol: &str) -> Result<Vec<NewsArticle>> {
    let parsed: MarketauxResponse = serde_json::from_str(text)
        .map_err(|e| anyhow!("Failed to parse Marketaux response for {}: {}", symbol, e))?;

    if let Some(err) = parsed.error {
        let code = err.code.unwrap_or_default();
        let message = err.message.unwrap_or_default();
        if code.eq_ignore_ascii_case("usage_limit_reached")
            || message.to_lowercase().contains("rate limit")
            || message.to_lowercase().contains("usage limit")
        {
            return Err(anyhow!(
                "Marketaux Rate limited for {}: {} {}",
                symbol,
                code,
                message
            ));
        }
        return Err(anyhow!(
            "Marketaux error for {}: {} {}",
            symbol,
            code,
            message
        ));
    }

    let rows = parsed.data.unwrap_or_default();

    let articles = rows
        .into_iter()
        .filter_map(|row| {
            let title = row.title?;
            let url = row.url?;
            let snippet = row.snippet.or(row.description);
            let sentiment = row
                .entities
                .as_ref()
                .and_then(|ents| ents.iter().find_map(|e| e.sentiment_score));
            Some(NewsArticle {
                title,
                url,
                source: row.source,
                published_at: row.published_at,
                snippet,
                sentiment_score: sentiment,
                image_url: row.image_url,
            })
        })
        .collect();

    Ok(articles)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_news_url_encodes_symbol_and_key() {
        let url = build_news_url("https://api.marketaux.com/v1/news/all", "key&with=stuff", "BRK.A", 5);
        assert!(url.starts_with("https://api.marketaux.com/v1/news/all?"));
        assert!(url.contains("symbols=BRK.A"));
        assert!(url.contains("limit=5"));
        // The ampersand and equals in the key must be percent-encoded so they
        // can't terminate the query string early.
        assert!(url.contains("api_token=key%26with%3Dstuff"));
        assert!(url.contains("filter_entities=true"));
        assert!(url.contains("language=en"));
    }

    #[test]
    fn test_parse_news_response_basic() {
        let json = r#"{
            "data": [
                {
                    "title": "Apple beats earnings",
                    "url": "https://example.com/1",
                    "snippet": "AAPL posted strong Q4 numbers.",
                    "published_at": "2026-01-01T13:00:00Z",
                    "source": "reuters.com",
                    "image_url": "https://img.example/1.jpg",
                    "entities": [
                        {"symbol": "AAPL", "sentiment_score": 0.6}
                    ]
                },
                {
                    "title": null,
                    "url": "https://example.com/no-title"
                },
                {
                    "title": "No URL",
                    "url": null
                }
            ]
        }"#;

        let parsed = parse_news_response(json, "AAPL").unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].title, "Apple beats earnings");
        assert_eq!(parsed[0].source.as_deref(), Some("reuters.com"));
        assert_eq!(parsed[0].sentiment_score, Some(0.6));
    }

    #[test]
    fn test_parse_news_response_falls_back_to_description() {
        let json = r#"{
            "data": [
                {
                    "title": "Story",
                    "url": "https://example.com",
                    "description": "Long description body.",
                    "snippet": null
                }
            ]
        }"#;
        let parsed = parse_news_response(json, "X").unwrap();
        assert_eq!(parsed[0].snippet.as_deref(), Some("Long description body."));
    }

    #[test]
    fn test_parse_news_response_empty() {
        let json = r#"{"data": []}"#;
        assert!(parse_news_response(json, "X").unwrap().is_empty());
    }

    #[test]
    fn test_parse_news_response_surfaces_rate_limit_error() {
        let json = r#"{"error": {"code": "usage_limit_reached", "message": "You have reached the daily quota."}}"#;
        let err = parse_news_response(json, "X").unwrap_err().to_string();
        assert!(err.contains("Rate limited"), "got: {}", err);
    }

    #[test]
    fn test_parse_news_response_surfaces_other_errors() {
        let json = r#"{"error": {"code": "invalid_token", "message": "Bad API key"}}"#;
        let err = parse_news_response(json, "X").unwrap_err().to_string();
        assert!(err.contains("invalid_token"));
    }

    // -----------------------------------------------------------------------
    // percent_encode
    // -----------------------------------------------------------------------

    #[test]
    fn test_percent_encode_empty_string() {
        assert_eq!(percent_encode(""), "");
    }

    #[test]
    fn test_percent_encode_unreserved_chars_pass_through() {
        // All chars in [A-Za-z0-9\-_.~] are unreserved RFC-3986 characters
        // and must not be encoded.
        let input = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~";
        assert_eq!(percent_encode(input), input);
    }

    #[test]
    fn test_percent_encode_reserved_chars() {
        assert_eq!(percent_encode("&"), "%26");
        assert_eq!(percent_encode("="), "%3D");
        assert_eq!(percent_encode("+"), "%2B");
        assert_eq!(percent_encode(" "), "%20");
        assert_eq!(percent_encode("/"), "%2F");
        assert_eq!(percent_encode("?"), "%3F");
        assert_eq!(percent_encode("#"), "%23");
    }

    #[test]
    fn test_percent_encode_mixed() {
        // "a=b&c=d" → "a%3Db%26c%3Dd"
        assert_eq!(percent_encode("a=b&c=d"), "a%3Db%26c%3Dd");
    }

    #[test]
    fn test_percent_encode_non_ascii() {
        // The euro sign is 3 UTF-8 bytes: 0xE2, 0x82, 0xAC
        let encoded = percent_encode("€");
        assert_eq!(encoded, "%E2%82%AC");
    }

    // -----------------------------------------------------------------------
    // build_news_url – structure tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_build_news_url_contains_all_required_params() {
        let url = build_news_url("https://api.marketaux.com/v1/news/all", "mykey", "AAPL", 10);
        assert!(url.starts_with("https://api.marketaux.com/v1/news/all?"));
        assert!(url.contains("symbols=AAPL"));
        assert!(url.contains("filter_entities=true"));
        assert!(url.contains("language=en"));
        assert!(url.contains("limit=10"));
        assert!(url.contains("api_token=mykey"));
    }

    #[test]
    fn test_build_news_url_encodes_slash_in_symbol() {
        // Symbols like BRK/A must have their slash percent-encoded so it cannot
        // be misinterpreted as a URL path separator.
        let url = build_news_url("https://base", "key", "BRK/A", 1);
        assert!(url.contains("symbols=BRK%2FA"), "got: {}", url);
    }

    #[test]
    fn test_build_news_url_uppercase_symbol_preserved() {
        let url = build_news_url("https://base", "key", "TSLA", 3);
        assert!(url.contains("symbols=TSLA"));
    }

    // -----------------------------------------------------------------------
    // parse_news_response – additional edge cases
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_news_response_first_entity_sentiment_wins() {
        // find_map returns the first Some; the second entity's score is ignored.
        let json = r#"{
            "data": [{
                "title": "Multi-entity article",
                "url": "https://example.com",
                "entities": [
                    {"sentiment_score": 0.8},
                    {"sentiment_score": -0.5}
                ]
            }]
        }"#;
        let parsed = parse_news_response(json, "AAPL").unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].sentiment_score, Some(0.8));
    }

    #[test]
    fn test_parse_news_response_no_entities_sentiment_is_none() {
        let json = r#"{
            "data": [{
                "title": "No-entity article",
                "url": "https://example.com"
            }]
        }"#;
        let parsed = parse_news_response(json, "AAPL").unwrap();
        assert_eq!(parsed[0].sentiment_score, None);
    }

    #[test]
    fn test_parse_news_response_entity_with_null_sentiment() {
        // An entity object where sentiment_score is JSON null should be treated
        // as absent and the overall field remains None.
        let json = r#"{
            "data": [{
                "title": "Null-sentiment article",
                "url": "https://example.com",
                "entities": [{"sentiment_score": null}]
            }]
        }"#;
        let parsed = parse_news_response(json, "AAPL").unwrap();
        assert_eq!(parsed[0].sentiment_score, None);
    }

    #[test]
    fn test_parse_news_response_image_url_forwarded() {
        let json = r#"{
            "data": [{
                "title": "Article with image",
                "url": "https://example.com",
                "image_url": "https://cdn.example.com/photo.jpg"
            }]
        }"#;
        let parsed = parse_news_response(json, "AAPL").unwrap();
        assert_eq!(
            parsed[0].image_url.as_deref(),
            Some("https://cdn.example.com/photo.jpg")
        );
    }

    #[test]
    fn test_parse_news_response_published_at_forwarded() {
        let json = r#"{
            "data": [{
                "title": "Timestamped article",
                "url": "https://example.com",
                "published_at": "2026-05-01T09:30:00Z"
            }]
        }"#;
        let parsed = parse_news_response(json, "AAPL").unwrap();
        assert_eq!(
            parsed[0].published_at.as_deref(),
            Some("2026-05-01T09:30:00Z")
        );
    }

    #[test]
    fn test_parse_news_response_snippet_preferred_over_description() {
        // When both snippet and description are present, snippet is used (it
        // appears first in `row.snippet.or(row.description)`).
        let json = r#"{
            "data": [{
                "title": "Both fields",
                "url": "https://example.com",
                "snippet": "Short snippet.",
                "description": "Longer description."
            }]
        }"#;
        let parsed = parse_news_response(json, "AAPL").unwrap();
        assert_eq!(parsed[0].snippet.as_deref(), Some("Short snippet."));
    }

    #[test]
    fn test_parse_news_response_multiple_valid_articles_in_order() {
        let json = r#"{
            "data": [
                {"title": "Article 1", "url": "https://example.com/1"},
                {"title": "Article 2", "url": "https://example.com/2"},
                {"title": "Article 3", "url": "https://example.com/3"}
            ]
        }"#;
        let parsed = parse_news_response(json, "AAPL").unwrap();
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[0].title, "Article 1");
        assert_eq!(parsed[2].title, "Article 3");
    }

    #[test]
    fn test_parse_news_response_rate_limit_message_variant() {
        // The rate-limit detector matches on message text as well as code.
        let json = r#"{"error": {"code": "other_code", "message": "You have hit the rate limit."}}"#;
        let err = parse_news_response(json, "X").unwrap_err().to_string();
        assert!(err.contains("Rate limited"), "got: {}", err);
    }

    #[test]
    fn test_parse_news_response_usage_limit_message_variant() {
        let json = r#"{"error": {"code": "quota", "message": "Usage limit exceeded for this plan."}}"#;
        let err = parse_news_response(json, "X").unwrap_err().to_string();
        assert!(err.contains("Rate limited"), "got: {}", err);
    }

    #[test]
    fn test_parse_news_response_generic_error_not_classified_as_rate_limit() {
        let json = r#"{"error": {"code": "server_error", "message": "Internal server error."}}"#;
        let err = parse_news_response(json, "X").unwrap_err().to_string();
        assert!(!err.contains("Rate limited"), "got: {}", err);
        assert!(err.contains("server_error"), "got: {}", err);
    }

    #[test]
    fn test_parse_news_response_invalid_json_returns_error() {
        let err = parse_news_response("not json at all", "AAPL").unwrap_err();
        assert!(err.to_string().contains("Failed to parse"));
    }

    // -----------------------------------------------------------------------
    // MarketauxClient – construction and is_configured guard
    // -----------------------------------------------------------------------

    #[test]
    fn test_client_is_configured_with_valid_key() {
        let client = MarketauxClient::new(Some("real_key_abc".to_string()), 0);
        assert!(client.is_configured());
    }

    #[test]
    fn test_client_is_not_configured_when_key_is_none() {
        let client = MarketauxClient::new(None, 0);
        assert!(!client.is_configured());
    }

    #[test]
    fn test_client_is_not_configured_when_key_is_empty_string() {
        // The constructor filters out empty strings via `.filter(|k| !k.is_empty())`.
        let client = MarketauxClient::new(Some("".to_string()), 0);
        assert!(!client.is_configured());
    }

    #[test]
    fn test_client_is_configured_when_key_is_whitespace_only() {
        // Whitespace-only strings are NOT filtered by the empty-string check,
        // so they are treated as a present (if probably wrong) key. This test
        // documents that boundary so any future tightening is explicit.
        let client = MarketauxClient::new(Some("   ".to_string()), 100);
        assert!(client.is_configured());
    }
}
