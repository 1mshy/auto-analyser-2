use crate::models::{AIAnalysisResponse, StockAnalysis};
use anyhow::{anyhow, Result};
use chrono::Utc;
use once_cell::sync::Lazy;
use openrouter_rs::{
    api::chat::{ChatCompletionRequest, Message},
    types::Role,
    OpenRouterClient as BaseOpenRouterClient,
};
use serde::Deserialize;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

/// API response structures for OpenRouter /api/v1/models endpoint
#[derive(Debug, Deserialize)]
struct ModelsResponse {
    data: Vec<ModelInfo>,
}

#[derive(Debug, Deserialize)]
struct ModelInfo {
    id: String,
    /// Context length in tokens - higher is better
    context_length: Option<u64>,
}

/// Cached list of free models fetched from OpenRouter API
static FREE_MODELS_CACHE: Lazy<RwLock<Vec<String>>> = Lazy::new(|| RwLock::new(Vec::new()));

/// Fallback models in case API fetch fails (ordered by quality)
const FALLBACK_FREE_MODELS: &[&str] = &[
    "qwen/qwen3-coder:free",
    "google/gemma-2-9b-it:free",
    "meta-llama/llama-3.2-3b-instruct:free",
];

/// Fetch free models from OpenRouter API, sorted by context length (largest first)
async fn fetch_free_models() -> Result<Vec<String>> {
    info!("Fetching available free models from OpenRouter API...");
    
    let client = reqwest::Client::new();
    let response = client
        .get("https://openrouter.ai/api/v1/models")
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| anyhow!("Failed to fetch models: {}", e))?;

    if !response.status().is_success() {
        return Err(anyhow!("OpenRouter API returned status: {}", response.status()));
    }

    let models_response: ModelsResponse = response
        .json()
        .await
        .map_err(|e| anyhow!("Failed to parse models response: {}", e))?;

    // Filter for models with :free suffix and sort by context_length (descending)
    let mut free_models: Vec<(String, u64)> = models_response
        .data
        .into_iter()
        .filter(|m| m.id.ends_with(":free"))
        .map(|m| (m.id, m.context_length.unwrap_or(0)))
        .collect();

    // Sort by context_length descending (bigger models first)
    free_models.sort_by(|a, b| b.1.cmp(&a.1));

    let sorted_models: Vec<String> = free_models.into_iter().map(|(id, _)| id).collect();

    info!("Found {} free models from OpenRouter API (sorted by context length)", sorted_models.len());
    
    Ok(sorted_models)
}

/// Get the list of free models, fetching from API if not cached
pub async fn get_free_models() -> Vec<String> {
    // Check if we already have cached models
    {
        let cache = FREE_MODELS_CACHE.read().await;
        if !cache.is_empty() {
            return cache.clone();
        }
    }

    // Fetch from API
    match fetch_free_models().await {
        Ok(models) if !models.is_empty() => {
            let mut cache = FREE_MODELS_CACHE.write().await;
            *cache = models.clone();
            models
        }
        Ok(_) => {
            warn!("No free models returned from API, using fallback list");
            FALLBACK_FREE_MODELS.iter().map(|s| s.to_string()).collect()
        }
        Err(e) => {
            error!("Failed to fetch free models: {}, using fallback list", e);
            FALLBACK_FREE_MODELS.iter().map(|s| s.to_string()).collect()
        }
    }
}

/// OpenRouter client wrapper with model fallback support
#[derive(Clone)]
pub struct OpenRouterClient {
    api_key: String,
    current_model_index: Arc<AtomicUsize>,
    enabled: bool,
}

impl OpenRouterClient {
    pub fn new(api_key: Option<String>, enabled: bool) -> Self {
        let is_configured = api_key.is_some();
        OpenRouterClient {
            api_key: api_key.unwrap_or_default(),
            current_model_index: Arc::new(AtomicUsize::new(0)),
            enabled: enabled && is_configured,
        }
    }

    /// Check if OpenRouter is enabled and configured
    pub fn is_enabled(&self) -> bool {
        self.enabled && !self.api_key.is_empty()
    }

    /// Get the current model index
    pub fn current_model_index(&self) -> usize {
        self.current_model_index.load(Ordering::SeqCst)
    }

    /// Get the current model name being used
    pub async fn current_model(&self) -> Option<String> {
        let models = get_free_models().await;
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
            return Err(anyhow!("OpenRouter is not enabled or API key not configured"));
        }

        // Fetch available free models (cached after first call)
        let free_models = get_free_models().await;
        if free_models.is_empty() {
            return Err(anyhow!("No free models available"));
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
                        warn!("Error on model {} (switching to {}): {}", model, next_model, e);
                        attempts += 1;
                    } else {
                        // Non-recoverable error, return immediately
                        return Err(anyhow!("OpenRouter API error with {}: {}", model, e));
                    }
                }
            }
        }

        Err(anyhow!("All {} free models are rate limited. Try again later.", free_models.len()))
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

    /// Send request to OpenRouter API
    async fn send_request(&self, model: &str, prompt: &str) -> Result<String> {
        info!("Sending AI analysis request to model: {}", model);

        let client = BaseOpenRouterClient::builder()
            .api_key(&self.api_key)
            .http_referer("https://github.com/1mshy/auto-analyser-2")
            .x_title("Auto Stock Analyser")
            .build()
            .map_err(|e| anyhow!("Failed to build OpenRouter client: {}", e))?;

        let request = ChatCompletionRequest::builder()
            .model(model)
            .messages(vec![
                Message::new(
                    Role::System,
                    "You are an expert stock analyst. Provide concise, actionable analysis based on technical indicators. Be objective and mention both opportunities and risks.",
                ),
                Message::new(Role::User, prompt),
            ])
            .max_tokens(1000_u32)
            .temperature(0.7)
            .build()
            .map_err(|e| anyhow!("Failed to build chat request: {}", e))?;

        let response = client
            .send_chat_completion(&request)
            .await
            .map_err(|e| anyhow!("OpenRouter request failed: {}", e))?;

        // Extract the response text
        response
            .choices
            .first()
            .and_then(|choice| choice.content().map(|s| s.to_string()))
            .ok_or_else(|| anyhow!("No response content from OpenRouter"))
    }

    /// Get list of available free models (async, fetches from API if not cached)
    pub async fn available_models() -> Vec<String> {
        get_free_models().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::MACDIndicator;

    #[test]
    fn test_fallback_models_list() {
        // Verify fallback models are properly configured
        assert!(FALLBACK_FREE_MODELS.len() >= 3);
        assert!(FALLBACK_FREE_MODELS.iter().all(|m| m.ends_with(":free")));
    }

    #[test]
    fn test_client_disabled_without_api_key() {
        let client = OpenRouterClient::new(None, true);
        assert!(!client.is_enabled());
    }

    #[test]
    fn test_client_disabled_when_flag_false() {
        let client = OpenRouterClient::new(Some("test-key".to_string()), false);
        assert!(!client.is_enabled());
    }

    #[test]
    fn test_client_enabled_with_key_and_flag() {
        let client = OpenRouterClient::new(Some("test-key".to_string()), true);
        assert!(client.is_enabled());
    }

    #[test]
    fn test_model_index_cycling() {
        let client = OpenRouterClient::new(Some("test-key".to_string()), true);
        
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
        let client = OpenRouterClient::new(Some("test-key".to_string()), true);
        
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
        let client = OpenRouterClient::new(Some("test-key".to_string()), true);
        
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
}
