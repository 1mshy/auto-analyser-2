use crate::models::{AIAnalysisResponse, NewsArticle, NewsSummary, StockAnalysis};
use anyhow::{anyhow, Result};
use chrono::Utc;
use once_cell::sync::Lazy;
use serde::Deserialize;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::{OwnedSemaphorePermit, RwLock, Semaphore};
use tracing::{error, info, warn};

/// Default OpenAI-compatible API root. Point `AI_BASE_URL` at a self-hosted
/// server (vLLM, llama.cpp, LM Studio, ...) to run analysis locally instead.
pub const OPENROUTER_BASE_URL: &str = "https://openrouter.ai/api/v1";

/// System prompt shared by the blocking and streaming analysis paths.
const ANALYST_SYSTEM_PROMPT: &str = "You are an expert stock analyst. Provide concise, actionable analysis based on technical indicators. Be objective and mention both opportunities and risks.";

/// True when `base_url` points at OpenRouter rather than a self-hosted endpoint.
/// Gates the things that are OpenRouter-specific: the `:free` model filter, the
/// attribution headers, and the mandatory API key.
fn is_openrouter(base_url: &str) -> bool {
    base_url.contains("openrouter.ai")
}

/// API response structures for the OpenAI-compatible `/models` endpoint
#[derive(Debug, Deserialize)]
struct ModelsResponse {
    data: Vec<ModelInfo>,
}

#[derive(Debug, Deserialize)]
struct ModelInfo {
    id: String,
    /// Context length in tokens - higher is better. OpenRouter reports this as
    /// `context_length`, vLLM as `max_model_len`.
    context_length: Option<u64>,
    max_model_len: Option<u64>,
}

impl ModelInfo {
    fn context_window(&self) -> u64 {
        self.context_length.or(self.max_model_len).unwrap_or(0)
    }
}

/// Minimal shape of an OpenAI-compatible `/chat/completions` response. Only the
/// fields we actually read are declared, so provider-specific extras are ignored.
#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: Option<String>,
}

/// `(base URL, model ids)` — the endpoint is part of the key so a reconfigured
/// endpoint can never be served a stale list.
type CachedModels = Option<(String, Vec<String>)>;

/// Models discovered from the configured endpoint.
static MODELS_CACHE: Lazy<RwLock<CachedModels>> = Lazy::new(|| RwLock::new(None));

/// Fallback models in case API fetch fails (ordered by quality). OpenRouter
/// only — a self-hosted server serves whatever it was launched with, so there
/// is nothing sensible to guess at.
const FALLBACK_FREE_MODELS: &[&str] = &[
    "qwen/qwen3-coder:free",
    "google/gemma-2-9b-it:free",
    "meta-llama/llama-3.2-3b-instruct:free",
];

/// Fetch usable models from an OpenAI-compatible `/models` endpoint, sorted by
/// context length (largest first)
async fn fetch_models(base_url: &str, api_key: &str) -> Result<Vec<String>> {
    info!("Fetching available models from {}/models ...", base_url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| anyhow!("Failed to build AI HTTP client: {}", e))?;

    let mut request = client
        .get(format!("{}/models", base_url))
        .header("Content-Type", "application/json");
    if !api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {}", api_key));
    }

    let response = request
        .send()
        .await
        .map_err(|e| anyhow!("Failed to fetch models: {}", e))?;

    if !response.status().is_success() {
        return Err(anyhow!(
            "Model list endpoint returned status: {}",
            response.status()
        ));
    }

    let models_response: ModelsResponse = response
        .json()
        .await
        .map_err(|e| anyhow!("Failed to parse models response: {}", e))?;

    // Most of OpenRouter's catalogue is paid, so only the `:free` tier is usable
    // here. A self-hosted endpoint exposes exactly what it loaded — take it all.
    let only_free = is_openrouter(base_url);
    let mut models: Vec<(String, u64)> = models_response
        .data
        .into_iter()
        .filter(|m| !only_free || m.id.ends_with(":free"))
        .map(|m| {
            let context = m.context_window();
            (m.id, context)
        })
        .collect();

    // Sort by context length descending (bigger models first)
    models.sort_by_key(|(_, context)| std::cmp::Reverse(*context));

    let sorted_models: Vec<String> = models.into_iter().map(|(id, _)| id).collect();

    info!(
        "Found {} usable models at {} (sorted by context length)",
        sorted_models.len(),
        base_url
    );

    Ok(sorted_models)
}

/// Get the model list for `base_url`, fetching from the API if not cached
pub async fn get_models(base_url: &str, api_key: &str) -> Vec<String> {
    // Check if we already have cached models for this endpoint
    {
        let cache = MODELS_CACHE.read().await;
        if let Some((cached_url, models)) = cache.as_ref() {
            if cached_url == base_url && !models.is_empty() {
                return models.clone();
            }
        }
    }

    // Fetch from API
    match fetch_models(base_url, api_key).await {
        Ok(models) if !models.is_empty() => {
            let mut cache = MODELS_CACHE.write().await;
            *cache = Some((base_url.to_string(), models.clone()));
            models
        }
        Ok(_) => {
            warn!("No models returned by {}, using fallback list", base_url);
            fallback_models(base_url)
        }
        Err(e) => {
            error!(
                "Failed to fetch models from {}: {}, using fallback list",
                base_url, e
            );
            fallback_models(base_url)
        }
    }
}

/// Last-resort model list when discovery fails. Only OpenRouter has one.
fn fallback_models(base_url: &str) -> Vec<String> {
    if is_openrouter(base_url) {
        FALLBACK_FREE_MODELS.iter().map(|s| s.to_string()).collect()
    } else {
        Vec::new()
    }
}

/// OpenAI-compatible AI client wrapper with model fallback support.
/// Talks to OpenRouter by default, or to any self-hosted endpoint set via
/// `AI_BASE_URL` (e.g. a vLLM server).
#[derive(Clone)]
pub struct OpenRouterClient {
    api_key: String,
    base_url: String,
    current_model_index: Arc<AtomicUsize>,
    enabled: bool,
    research_slot: Arc<Semaphore>,
}

#[derive(Debug, thiserror::Error)]
pub enum ResearchGenerationError {
    #[error("AI research is disabled on this server.")]
    Disabled,
    #[error("Another AI research request is running. Try again after it finishes.")]
    Busy,
    #[error("No research model is available from the configured AI endpoint.")]
    NoModels,
    #[error("The AI research request timed out. Try again later.")]
    Timeout,
    #[error("The AI endpoint could not be reached. Try again later.")]
    Unavailable,
    #[error("The AI endpoint returned HTTP {0}. Try again later.")]
    Upstream(u16),
    #[error("The AI endpoint did not return a usable research answer.")]
    InvalidResponse,
    #[error("The AI research answer was cut short. Try a more focused question.")]
    TruncatedResponse,
}

// Research has stricter completion requirements than legacy analysis responses.
#[derive(Deserialize)]
struct ResearchCompletionResponse {
    choices: Vec<ResearchChoice>,
}

#[derive(Deserialize)]
struct ResearchChoice {
    message: ChatMessage,
    finish_reason: Option<String>,
}

pub struct ResearchCompletion {
    pub answer: String,
    pub model_used: String,
}

fn research_transport_error(error: reqwest::Error) -> ResearchGenerationError {
    if error.is_timeout() {
        ResearchGenerationError::Timeout
    } else {
        ResearchGenerationError::Unavailable
    }
}

impl OpenRouterClient {
    /// `base_url` is an OpenAI-compatible API root without a trailing slash
    /// (e.g. `http://10.150.0.30:1234/v1`); `None` keeps the OpenRouter default.
    pub fn new(api_key: Option<String>, enabled: bool, base_url: Option<String>) -> Self {
        let base_url = base_url.unwrap_or_else(|| OPENROUTER_BASE_URL.to_string());
        // Self-hosted endpoints are usually keyless, so only OpenRouter needs one.
        let is_configured = api_key.is_some() || !is_openrouter(&base_url);
        OpenRouterClient {
            api_key: api_key.unwrap_or_default(),
            base_url,
            current_model_index: Arc::new(AtomicUsize::new(0)),
            enabled: enabled && is_configured,
            research_slot: Arc::new(Semaphore::new(1)),
        }
    }

    /// Check if the AI layer is enabled and configured
    pub fn is_enabled(&self) -> bool {
        self.enabled && (!self.api_key.is_empty() || !is_openrouter(&self.base_url))
    }

    /// The OpenAI-compatible endpoint this client talks to
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// The permit is held across source loading and generation by the research
    /// endpoint. Cloning the client shares the same limit; requests never queue.
    pub fn try_acquire_research(
        &self,
    ) -> std::result::Result<OwnedSemaphorePermit, ResearchGenerationError> {
        self.research_slot
            .clone()
            .try_acquire_owned()
            .map_err(|_| ResearchGenerationError::Busy)
    }

    /// One bounded completion for the grounded research workflow. Deliberately
    /// separate from the older analysis fallback loops: local inference must not
    /// start another long request after an error or rate limit.
    pub async fn generate_research(
        &self,
        system: &str,
        prompt: &str,
    ) -> std::result::Result<ResearchCompletion, ResearchGenerationError> {
        if !self.is_enabled() {
            return Err(ResearchGenerationError::Disabled);
        }
        let model = self
            .current_model()
            .await
            .ok_or(ResearchGenerationError::NoModels)?;
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(5))
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|_| ResearchGenerationError::Unavailable)?;
        let mut body = serde_json::json!({
            "model": model,
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": prompt }
            ],
            "max_tokens": 1200,
            "temperature": 0.2,
            "stream": false
        });
        if !is_openrouter(&self.base_url) {
            // Supported by the configured local Qwen endpoint. Keep this local
            // option out of OpenRouter requests and all existing analysis paths.
            body["chat_template_kwargs"] = serde_json::json!({ "enable_thinking": false });
        }
        let mut response = self
            .authorize(client.post(format!("{}/chat/completions", self.base_url)))
            .json(&body)
            .send()
            .await
            .map_err(research_transport_error)?;
        if !response.status().is_success() {
            return Err(ResearchGenerationError::Upstream(
                response.status().as_u16(),
            ));
        }
        // Bound unexpected provider responses, including any unused reasoning.
        const MAX_RESPONSE_BYTES: usize = 65_536;
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err(ResearchGenerationError::InvalidResponse);
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(research_transport_error)? {
            if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
                return Err(ResearchGenerationError::InvalidResponse);
            }
            bytes.extend_from_slice(&chunk);
        }
        let completion: ResearchCompletionResponse =
            serde_json::from_slice(&bytes).map_err(|_| ResearchGenerationError::InvalidResponse)?;
        let choice = completion
            .choices
            .into_iter()
            .next()
            .ok_or(ResearchGenerationError::InvalidResponse)?;
        match choice.finish_reason.as_deref() {
            Some("length") => return Err(ResearchGenerationError::TruncatedResponse),
            Some("stop") | None => {}
            _ => return Err(ResearchGenerationError::InvalidResponse),
        }
        let answer = choice
            .message
            .content
            .map(|content| content.trim().to_string())
            .filter(|content| {
                // Never expose reasoning-only or mixed reasoning content as a
                // final answer when a local provider ignores thinking=false.
                let lower = content.to_ascii_lowercase();
                !content.is_empty()
                    && content.chars().count() <= 12_000
                    && !lower.contains("<think")
                    && !lower.contains("</think")
            })
            .ok_or(ResearchGenerationError::InvalidResponse)?;
        Ok(ResearchCompletion {
            answer,
            model_used: model,
        })
    }

    /// Models available on the configured endpoint (cached after first call)
    pub async fn models(&self) -> Vec<String> {
        get_models(&self.base_url, &self.api_key).await
    }

    /// Get the current model index
    pub fn current_model_index(&self) -> usize {
        self.current_model_index.load(Ordering::SeqCst)
    }

    /// Get the current model name being used
    pub async fn current_model(&self) -> Option<String> {
        let models = self.models().await;
        if models.is_empty() {
            None
        } else {
            let idx = self.current_model_index();
            Some(models[idx % models.len()].clone())
        }
    }

    /// Switch to the next model in the list (called on rate limit)
    fn advance_model_index(&self) -> usize {
        self.current_model_index.fetch_add(1, Ordering::SeqCst) + 1
    }

    /// Analyze a stock using AI, with automatic model fallback on rate limits
    pub async fn analyze_stock(&self, analysis: &StockAnalysis) -> Result<AIAnalysisResponse> {
        if !self.is_enabled() {
            return Err(anyhow!("AI analysis is not enabled or not configured"));
        }

        // Fetch available models (cached after first call)
        let free_models = self.models().await;
        if free_models.is_empty() {
            return Err(anyhow!("No models available at {}", self.base_url));
        }

        let prompt = self.build_analysis_prompt(analysis);
        let mut attempts = 0;
        let max_attempts = free_models.len();

        while attempts < max_attempts {
            let current_idx = self.current_model_index();
            let model = &free_models[current_idx % free_models.len()];

            match self.send_request(model, &prompt).await {
                Ok(response) => {
                    return Ok(AIAnalysisResponse {
                        symbol: analysis.symbol.clone(),
                        analysis: response,
                        model_used: model.clone(),
                        generated_at: Utc::now(),
                    });
                }
                Err(e) => {
                    let err_msg = e.to_string().to_lowercase();

                    // Check for rate limit, quota errors, or parsing errors
                    // Parsing errors can occur when model response format is incompatible
                    if err_msg.contains("rate")
                        || err_msg.contains("limit")
                        || err_msg.contains("429")
                        || err_msg.contains("quota")
                        || err_msg.contains("exceeded")
                        || err_msg.contains("did not match")
                        || err_msg.contains("untagged enum")
                        || err_msg.contains("parse")
                        || err_msg.contains("deserialize")
                    {
                        let new_idx = self.advance_model_index();
                        let next_model = &free_models[new_idx % free_models.len()];
                        warn!(
                            "Error on model {} (switching to {}): {}",
                            model, next_model, e
                        );
                        attempts += 1;
                    } else {
                        // Non-recoverable error, return immediately
                        return Err(anyhow!("AI API error with {}: {}", model, e));
                    }
                }
            }
        }

        Err(anyhow!(
            "All {} models are rate limited. Try again later.",
            free_models.len()
        ))
    }

    /// Summarize a batch of news articles for `symbol` using the cycling free
    /// model list. Mirrors `analyze_stock`'s rate-limit/retry loop — only the
    /// system message, prompt, and response shape differ.
    pub async fn summarize_news(
        &self,
        symbol: &str,
        articles: &[NewsArticle],
    ) -> Result<NewsSummary> {
        if !self.is_enabled() {
            return Err(anyhow!("AI analysis is not enabled or not configured"));
        }
        if articles.is_empty() {
            return Err(anyhow!("No articles to summarize for {}", symbol));
        }

        let free_models = self.models().await;
        if free_models.is_empty() {
            return Err(anyhow!("No models available at {}", self.base_url));
        }

        let prompt = build_news_prompt(symbol, articles);
        let system = "You are a financial news summarizer. Given a batch of recent headlines and snippets for a single stock, produce a concise 3-4 sentence summary that highlights the main catalysts, overall market sentiment, and any notable risks. Stay neutral, do not invent facts, and refer to information that's actually present in the input.";

        let mut attempts = 0;
        let max_attempts = free_models.len();

        while attempts < max_attempts {
            let current_idx = self.current_model_index();
            let model = &free_models[current_idx % free_models.len()];

            match self
                .send_request_with_params(model, system, &prompt, 350, 0.3)
                .await
            {
                Ok(text) => {
                    let date = Utc::now().format("%Y-%m-%d").to_string();
                    return Ok(NewsSummary {
                        id: None,
                        symbol: symbol.to_uppercase(),
                        date,
                        summary_text: text.trim().to_string(),
                        model_used: model.clone(),
                        article_count: articles.len(),
                        generated_at: Utc::now(),
                    });
                }
                Err(e) => {
                    let err_msg = e.to_string().to_lowercase();
                    if err_msg.contains("rate")
                        || err_msg.contains("limit")
                        || err_msg.contains("429")
                        || err_msg.contains("quota")
                        || err_msg.contains("exceeded")
                        || err_msg.contains("did not match")
                        || err_msg.contains("untagged enum")
                        || err_msg.contains("parse")
                        || err_msg.contains("deserialize")
                    {
                        let new_idx = self.advance_model_index();
                        let next_model = &free_models[new_idx % free_models.len()];
                        warn!(
                            "News summary error on model {} (switching to {}): {}",
                            model, next_model, e
                        );
                        attempts += 1;
                    } else {
                        return Err(anyhow!("AI news summary error with {}: {}", model, e));
                    }
                }
            }
        }

        Err(anyhow!(
            "All {} models are rate limited for news summary. Try again later.",
            free_models.len()
        ))
    }

    /// Build the analysis prompt from stock data
    fn build_analysis_prompt(&self, analysis: &StockAnalysis) -> String {
        let mut prompt = format!(
            "Analyze the following stock data for {} and provide a brief investment analysis:\n\n",
            analysis.symbol
        );

        prompt.push_str(&format!("**Current Price:** ${:.2}\n", analysis.price));

        if let Some(rsi) = analysis.rsi {
            prompt.push_str(&format!("**RSI (14):** {:.2}", rsi));
            if analysis.is_oversold {
                prompt.push_str(" (OVERSOLD)");
            } else if analysis.is_overbought {
                prompt.push_str(" (OVERBOUGHT)");
            }
            prompt.push('\n');
        }

        if let Some(sma_20) = analysis.sma_20 {
            prompt.push_str(&format!("**SMA 20:** ${:.2}\n", sma_20));
        }

        if let Some(sma_50) = analysis.sma_50 {
            prompt.push_str(&format!("**SMA 50:** ${:.2}\n", sma_50));
        }

        if let Some(ref macd) = analysis.macd {
            prompt.push_str(&format!(
                "**MACD:** Line={:.4}, Signal={:.4}, Histogram={:.4}\n",
                macd.macd_line, macd.signal_line, macd.histogram
            ));
        }

        if let Some(volume) = analysis.volume {
            prompt.push_str(&format!("**Volume:** {:.0}\n", volume));
        }

        if let Some(market_cap) = analysis.market_cap {
            prompt.push_str(&format!("**Market Cap:** ${:.0}\n", market_cap));
        }

        // Add technicals if available
        if let Some(ref technicals) = analysis.technicals {
            prompt.push_str("\n**Additional Technicals:**\n");

            if let Some(ref sector) = technicals.sector {
                prompt.push_str(&format!("- Sector: {}\n", sector));
            }
            if let Some(ref industry) = technicals.industry {
                prompt.push_str(&format!("- Industry: {}\n", industry));
            }
            if let Some(pe) = technicals.pe_ratio {
                prompt.push_str(&format!("- P/E Ratio: {:.2}\n", pe));
            }
            if let Some(eps) = technicals.eps {
                prompt.push_str(&format!("- EPS: ${:.2}\n", eps));
            }
            if let Some(target) = technicals.one_year_target {
                prompt.push_str(&format!("- 1 Year Target: ${:.2}\n", target));
            }
            if let Some(high) = technicals.fifty_two_week_high {
                if let Some(low) = technicals.fifty_two_week_low {
                    prompt.push_str(&format!("- 52 Week Range: ${:.2} - ${:.2}\n", low, high));
                }
            }
            if let Some(yield_pct) = technicals.current_yield {
                prompt.push_str(&format!("- Dividend Yield: {:.2}%\n", yield_pct));
            }
        }

        prompt.push_str("\nProvide a concise analysis (2-3 paragraphs) covering:\n");
        prompt.push_str("1. Current technical stance (bullish/bearish/neutral)\n");
        prompt.push_str("2. Key support/resistance levels based on moving averages\n");
        prompt.push_str("3. Brief recommendation with risk factors\n");

        prompt
    }

    /// Send an analysis request to the configured endpoint
    async fn send_request(&self, model: &str, prompt: &str) -> Result<String> {
        self.send_request_with_params(model, ANALYST_SYSTEM_PROMPT, prompt, 1000, 0.7)
            .await
    }

    /// Send a chat completion with a custom system message and tuning. Speaks
    /// raw OpenAI-compatible JSON so the same path serves OpenRouter and any
    /// self-hosted server behind `AI_BASE_URL`.
    async fn send_request_with_params(
        &self,
        model: &str,
        system: &str,
        prompt: &str,
        max_tokens: u32,
        temperature: f64,
    ) -> Result<String> {
        info!("Sending AI request to model {} at {}", model, self.base_url);

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|e| anyhow!("Failed to build AI HTTP client: {}", e))?;

        let body = serde_json::json!({
            "model": model,
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": prompt },
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
        });

        let response = self
            .authorize(client.post(format!("{}/chat/completions", self.base_url)))
            .json(&body)
            .send()
            .await
            .map_err(|e| anyhow!("AI request failed: {}", e))?;

        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        if !status.is_success() {
            // Keep the status code in the message — the retry loops above key
            // off "429"/"rate"/"quota" to rotate onto the next model.
            return Err(anyhow!("AI API error ({}): {}", status, text));
        }

        let completion: ChatCompletionResponse = serde_json::from_str(&text)
            .map_err(|e| anyhow!("Failed to parse AI response: {}", e))?;

        completion
            .choices
            .into_iter()
            .find_map(|choice| choice.message.content)
            .filter(|content| !content.trim().is_empty())
            .ok_or_else(|| anyhow!("No response content from {}", model))
    }

    /// Attach auth plus the attribution headers OpenRouter asks for. A
    /// self-hosted endpoint gets neither unless an API key is configured.
    fn authorize(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        let mut request = request.header("Content-Type", "application/json");
        if !self.api_key.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", self.api_key));
        }
        if is_openrouter(&self.base_url) {
            request = request
                .header("HTTP-Referer", "https://github.com/1mshy/auto-analyser-2")
                .header("X-Title", "Auto Stock Analyser");
        }
        request
    }

    /// Stream AI analysis response for real-time token display
    /// Yields StreamEvent variants for status updates and content chunks
    pub async fn analyze_stock_streaming(
        &self,
        analysis: &StockAnalysis,
    ) -> Result<impl futures::Stream<Item = StreamEvent>> {
        use async_stream::stream;

        if !self.is_enabled() {
            return Err(anyhow!("AI analysis is not enabled or not configured"));
        }

        let free_models = self.models().await;
        if free_models.is_empty() {
            return Err(anyhow!("No models available at {}", self.base_url));
        }

        let prompt = self.build_analysis_prompt(analysis);
        let endpoint = self.clone();
        let symbol = analysis.symbol.clone();
        let current_idx = self.current_model_index();
        let model = free_models[current_idx % free_models.len()].clone();

        Ok(stream! {
            // Status: Connecting to AI
            yield StreamEvent::Status {
                stage: "connecting".to_string(),
                message: format!("Connecting to AI model: {}", model),
            };

            let client = reqwest::Client::new();

            yield StreamEvent::Status {
                stage: "analyzing".to_string(),
                message: format!("Analyzing {} with {}", symbol, model),
            };

            let request_body = serde_json::json!({
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": ANALYST_SYSTEM_PROMPT
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "max_tokens": 1000,
                "temperature": 0.7,
                "stream": true
            });

            let response = endpoint
                .authorize(client.post(format!("{}/chat/completions", endpoint.base_url())))
                .json(&request_body)
                .send()
                .await;

            match response {
                Ok(resp) if resp.status().is_success() => {
                    yield StreamEvent::Status {
                        stage: "streaming".to_string(),
                        message: "Receiving analysis...".to_string(),
                    };

                    yield StreamEvent::ModelInfo {
                        model: model.clone(),
                    };

                    // Process SSE stream from OpenRouter
                    let mut stream = resp.bytes_stream();
                    let mut buffer = String::new();

                    use futures::StreamExt;
                    while let Some(chunk_result) = stream.next().await {
                        match chunk_result {
                            Ok(bytes) => {
                                let text = String::from_utf8_lossy(&bytes);
                                buffer.push_str(&text);

                                // Process complete SSE lines
                                while let Some(line_end) = buffer.find('\n') {
                                    let line = buffer[..line_end].trim().to_string();
                                    buffer = buffer[line_end + 1..].to_string();

                                    if line.starts_with("data: ") {
                                        let data = &line[6..];
                                        if data == "[DONE]" {
                                            yield StreamEvent::Done {
                                                symbol: symbol.clone(),
                                            };
                                            return;
                                        }

                                        // Parse the SSE data as JSON
                                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                                            if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                                                if !content.is_empty() {
                                                    yield StreamEvent::Content {
                                                        delta: content.to_string(),
                                                    };
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                yield StreamEvent::Error {
                                    message: format!("Stream error: {}", e),
                                };
                                return;
                            }
                        }
                    }

                    yield StreamEvent::Done {
                        symbol: symbol.clone(),
                    };
                }
                Ok(resp) => {
                    let status = resp.status();
                    let body = resp.text().await.unwrap_or_default();
                    yield StreamEvent::Error {
                        message: format!("API error ({}): {}", status, body),
                    };
                }
                Err(e) => {
                    yield StreamEvent::Error {
                        message: format!("Request failed: {}", e),
                    };
                }
            }
        })
    }
}

/// Render a list of news articles into a compact prompt for the summarizer.
/// Pure function so it can be unit-tested without network or API key.
fn build_news_prompt(symbol: &str, articles: &[NewsArticle]) -> String {
    let mut prompt = format!(
        "Summarize the following recent news for stock ticker {}.\n\nArticles:\n",
        symbol.to_uppercase()
    );

    for (idx, article) in articles.iter().take(8).enumerate() {
        prompt.push_str(&format!("{}. {}", idx + 1, article.title.trim()));
        if let Some(source) = article.source.as_deref() {
            prompt.push_str(&format!(" ({})", source));
        }
        if let Some(published) = article.published_at.as_deref() {
            prompt.push_str(&format!(" [{}]", published));
        }
        prompt.push('\n');
        if let Some(snippet) = article.snippet.as_deref() {
            let trimmed = snippet.trim();
            if !trimmed.is_empty() {
                prompt.push_str("   ");
                prompt.push_str(trimmed);
                prompt.push('\n');
            }
        }
        if let Some(score) = article.sentiment_score {
            prompt.push_str(&format!("   sentiment_score: {:.2}\n", score));
        }
    }

    prompt.push_str(
        "\nWrite 3-4 sentences covering the main catalysts driving these stories, the overall sentiment (bullish, bearish, mixed), and any notable risk factors. Do not invent quotes or numbers. Do not list the articles back; produce a single short paragraph.",
    );

    prompt
}

/// Events emitted during streaming AI analysis
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    /// Status update about current processing stage
    Status { stage: String, message: String },
    /// Information about which AI model is being used
    ModelInfo { model: String },
    /// A chunk of the AI response content
    Content { delta: String },
    /// Analysis is complete
    Done { symbol: String },
    /// An error occurred
    Error { message: String },
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::MACDIndicator;

    const VLLM_BASE_URL: &str = "http://10.150.0.30:1234/v1";

    #[test]
    fn research_limit_is_shared_by_client_clones_and_releases_on_drop() {
        let client = OpenRouterClient::new(None, true, Some(VLLM_BASE_URL.to_string()));
        let clone = client.clone();
        let permit = client.try_acquire_research().unwrap();
        assert!(matches!(
            clone.try_acquire_research(),
            Err(ResearchGenerationError::Busy)
        ));
        drop(permit);
        assert!(clone.try_acquire_research().is_ok());
    }

    async fn research_server(
        status: axum::http::StatusCode,
        completion: serde_json::Value,
    ) -> (
        OpenRouterClient,
        Arc<tokio::sync::Mutex<Vec<serde_json::Value>>>,
        tokio::task::JoinHandle<()>,
    ) {
        use axum::{
            routing::{get, post},
            Json, Router,
        };
        let requests = Arc::new(tokio::sync::Mutex::new(Vec::new()));
        let captured = requests.clone();
        let app = Router::new()
            .route("/models", get(|| async { Json(serde_json::json!({ "data": [{ "id": "test-research-model" }, { "id": "unused-fallback-model" }] })) }))
            .route("/chat/completions", post(move |Json(body): Json<serde_json::Value>| {
                let captured = captured.clone();
                let completion = completion.clone();
                async move { captured.lock().await.push(body); (status, Json(completion)) }
            }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        (
            OpenRouterClient::new(None, true, Some(base_url)),
            requests,
            server,
        )
    }

    #[tokio::test]
    async fn research_completion_uses_single_bounded_local_request_and_content_only() {
        let (client, requests, server) = research_server(axum::http::StatusCode::OK, serde_json::json!({
            "choices": [{ "message": { "content": "  Snapshot observation [AAPL].  ", "reasoning_content": "private reasoning" } }]
        })).await;
        let result = client
            .generate_research("Grounded system instructions", "Snapshot JSON")
            .await
            .unwrap();
        assert_eq!(result.answer, "Snapshot observation [AAPL].");
        assert_eq!(result.model_used, "test-research-model");
        let requests = requests.lock().await;
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0]["max_tokens"], 1200);
        assert_eq!(requests[0]["stream"], false);
        assert_eq!(
            requests[0]["chat_template_kwargs"]["enable_thinking"],
            false
        );
        assert_eq!(requests[0]["messages"][0]["role"], "system");
        assert_eq!(requests[0]["messages"][1]["content"], "Snapshot JSON");
        assert!(requests[0].get("tools").is_none());
        server.abort();
    }

    #[tokio::test]
    async fn research_completion_does_not_retry_provider_failures() {
        let (client, requests, server) = research_server(
            axum::http::StatusCode::TOO_MANY_REQUESTS,
            serde_json::json!({ "error": "quota" }),
        )
        .await;
        assert!(matches!(
            client.generate_research("system", "facts").await,
            Err(ResearchGenerationError::Upstream(429))
        ));
        assert_eq!(requests.lock().await.len(), 1);
        assert_eq!(client.current_model_index(), 0);
        server.abort();
    }

    #[tokio::test]
    async fn research_completion_rejects_empty_or_reasoning_only_answers() {
        for completion in [
            serde_json::json!({ "choices": [] }),
            serde_json::json!({ "choices": [{ "message": { "content": "  " } }] }),
            serde_json::json!({ "choices": [{ "message": { "content": null, "reasoning_content": "unfinished" } }] }),
            serde_json::json!({ "choices": [{ "message": { "content": "<think>unfinished reasoning</think>" } }] }),
            serde_json::json!({ "choices": [{ "message": { "content": "<THINK>reasoning</THINK> Final answer" } }] }),
            serde_json::json!({ "choices": [{ "finish_reason": "tool_calls", "message": { "content": "Run a tool" } }] }),
            serde_json::json!({ "unexpected": true }),
        ] {
            let (client, requests, server) =
                research_server(axum::http::StatusCode::OK, completion).await;
            assert!(matches!(
                client.generate_research("system", "facts").await,
                Err(ResearchGenerationError::InvalidResponse)
            ));
            assert_eq!(requests.lock().await.len(), 1);
            server.abort();
        }
    }

    #[tokio::test]
    async fn research_completion_rejects_truncated_answers() {
        let (client, requests, server) = research_server(axum::http::StatusCode::OK,
            serde_json::json!({ "choices": [{ "finish_reason": "length", "message": { "content": "Incomplete note [AAPL]" } }] })
        ).await;
        assert!(matches!(
            client.generate_research("system", "facts").await,
            Err(ResearchGenerationError::TruncatedResponse)
        ));
        assert_eq!(requests.lock().await.len(), 1);
        server.abort();
    }

    #[test]
    fn test_fallback_models_list() {
        // Verify fallback models are properly configured
        assert!(FALLBACK_FREE_MODELS.len() >= 3);
        assert!(FALLBACK_FREE_MODELS.iter().all(|m| m.ends_with(":free")));
    }

    #[test]
    fn test_client_disabled_without_api_key() {
        let client = OpenRouterClient::new(None, true, None);
        assert!(!client.is_enabled());
    }

    #[test]
    fn test_client_disabled_when_flag_false() {
        let client = OpenRouterClient::new(Some("test-key".to_string()), false, None);
        assert!(!client.is_enabled());
    }

    #[test]
    fn test_client_enabled_with_key_and_flag() {
        let client = OpenRouterClient::new(Some("test-key".to_string()), true, None);
        assert!(client.is_enabled());
    }

    #[test]
    fn test_self_hosted_endpoint_enabled_without_api_key() {
        // vLLM and friends are usually keyless — the base URL is enough.
        let client = OpenRouterClient::new(None, true, Some(VLLM_BASE_URL.to_string()));
        assert!(client.is_enabled());
        assert_eq!(client.base_url(), VLLM_BASE_URL);
    }

    #[test]
    fn test_self_hosted_endpoint_respects_disable_flag() {
        let client = OpenRouterClient::new(None, false, Some(VLLM_BASE_URL.to_string()));
        assert!(!client.is_enabled());
    }

    #[test]
    fn test_is_openrouter_detection() {
        assert!(is_openrouter(OPENROUTER_BASE_URL));
        assert!(!is_openrouter(VLLM_BASE_URL));
        assert!(!is_openrouter("http://localhost:8000/v1"));
    }

    #[test]
    fn test_fallback_models_only_for_openrouter() {
        assert!(!fallback_models(OPENROUTER_BASE_URL).is_empty());
        // A self-hosted server serves what it loaded; guessing ids would only
        // produce 404s on every request.
        assert!(fallback_models(VLLM_BASE_URL).is_empty());
    }

    #[test]
    fn test_model_info_context_window_prefers_context_length() {
        let openrouter_model = ModelInfo {
            id: "x:free".to_string(),
            context_length: Some(128_000),
            max_model_len: None,
        };
        assert_eq!(openrouter_model.context_window(), 128_000);

        // vLLM reports `max_model_len` instead
        let vllm_model = ModelInfo {
            id: "nvidia/Gemma-4-31B-IT-NVFP4".to_string(),
            context_length: None,
            max_model_len: Some(32_768),
        };
        assert_eq!(vllm_model.context_window(), 32_768);

        let unknown = ModelInfo {
            id: "mystery".to_string(),
            context_length: None,
            max_model_len: None,
        };
        assert_eq!(unknown.context_window(), 0);
    }

    #[test]
    fn test_model_index_cycling() {
        let client = OpenRouterClient::new(Some("test-key".to_string()), true, None);

        // Initial index should be 0
        assert_eq!(client.current_model_index(), 0);

        // Advance the index
        let new_idx = client.advance_model_index();
        assert_eq!(new_idx, 1);
        assert_eq!(client.current_model_index(), 1);

        // Advance again
        let new_idx = client.advance_model_index();
        assert_eq!(new_idx, 2);
        assert_eq!(client.current_model_index(), 2);
    }

    #[test]
    fn test_model_index_wraps_around() {
        let client = OpenRouterClient::new(Some("test-key".to_string()), true, None);

        // Cycle through model indices (modulo operation happens at access time)
        for _ in 0..10 {
            client.advance_model_index();
        }

        // Index should be 10, but when accessing models, it wraps via modulo
        let idx = client.current_model_index();
        assert_eq!(idx, 10);
        // When actually accessing models: idx % models.len() handles wrap-around
    }

    #[test]
    fn test_build_analysis_prompt() {
        let client = OpenRouterClient::new(Some("test-key".to_string()), true, None);

        let analysis = StockAnalysis {
            id: None,
            symbol: "AAPL".to_string(),
            price: 175.50,
            price_change: Some(2.50),
            price_change_percent: Some(1.45),
            rsi: Some(45.0),
            sma_20: Some(172.0),
            sma_50: Some(168.0),
            macd: Some(MACDIndicator {
                macd_line: 1.5,
                signal_line: 1.2,
                histogram: 0.3,
            }),
            volume: Some(50_000_000.0),
            market_cap: Some(2_800_000_000_000.0),
            sector: Some("Technology".to_string()),
            is_oversold: false,
            is_overbought: false,
            analyzed_at: Utc::now(),
            bollinger: None,
            stochastic: None,
            earnings: None,
            technicals: None,
            news: None,
        };

        let prompt = client.build_analysis_prompt(&analysis);

        assert!(prompt.contains("AAPL"));
        assert!(prompt.contains("175.50"));
        assert!(prompt.contains("RSI"));
        assert!(prompt.contains("SMA 20"));
        assert!(prompt.contains("MACD"));
    }

    #[test]
    fn test_build_news_prompt_includes_titles_and_symbol() {
        let articles = vec![
            NewsArticle {
                title: "Apple beats earnings".to_string(),
                url: "https://example.com/1".to_string(),
                source: Some("reuters".to_string()),
                published_at: Some("2026-01-01T13:00:00Z".to_string()),
                snippet: Some("AAPL posted strong Q4 results.".to_string()),
                sentiment_score: Some(0.6),
                image_url: None,
            },
            NewsArticle {
                title: "Supplier issues flagged".to_string(),
                url: "https://example.com/2".to_string(),
                source: None,
                published_at: None,
                snippet: None,
                sentiment_score: None,
                image_url: None,
            },
        ];

        let prompt = build_news_prompt("aapl", &articles);
        assert!(prompt.contains("AAPL"));
        assert!(prompt.contains("Apple beats earnings"));
        assert!(prompt.contains("AAPL posted strong"));
        assert!(prompt.contains("Supplier issues flagged"));
        assert!(prompt.contains("sentiment_score: 0.60"));
        assert!(prompt.contains("3-4 sentences"));
    }

    #[test]
    fn test_build_news_prompt_caps_at_eight() {
        let articles: Vec<NewsArticle> = (0..20)
            .map(|i| NewsArticle {
                title: format!("Headline {}", i),
                url: format!("https://example.com/{}", i),
                source: None,
                published_at: None,
                snippet: None,
                sentiment_score: None,
                image_url: None,
            })
            .collect();

        let prompt = build_news_prompt("X", &articles);
        assert!(prompt.contains("Headline 0"));
        assert!(prompt.contains("Headline 7"));
        assert!(!prompt.contains("Headline 8"));
    }
}
