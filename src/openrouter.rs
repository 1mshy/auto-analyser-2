use crate::models::{AIAnalysisResponse, StockAnalysis};
use anyhow::{anyhow, Result};
use chrono::Utc;
use openrouter_rs::{
    api::chat::{ChatCompletionRequest, Message},
    types::Role,
    OpenRouterClient as BaseOpenRouterClient,
};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tracing::{info, warn};

/// Top free models on OpenRouter (as of Dec 2025)
/// These models are free to use and will be cycled through when rate limits or parsing errors occur
/// Ordered by reliability and response quality
pub const FREE_MODELS: &[&str] = &[
    "qwen/qwen3-coder:free",
    "qwen/qwen3-4b:free",
    // "alibaba/tongyi-deepresearch-30b-a3b:free",
    "amazon/nova-2-lite-v1:free",
    "google/gemma-2-9b-it:free",                  // Google Gemma 2 9B - reliable
    "meta-llama/llama-3.2-3b-instruct:free",      // Meta Llama 3.2 3B - reliable
    "nvidia/nemotron-nano-12b-v2-vl:free",        // NVIDIA Nemotron Nano - 128K context
    "tngtech/deepseek-r1t2-chimera:free",         // DeepSeek R1T2 Chimera - 164K context
    "tngtech/deepseek-r1t-chimera:free",          // DeepSeek R1T Chimera - 164K context
    "tngtech/tng-r1t-chimera:free",               // TNG R1T Chimera - 164K context
    "z-ai/glm-4.5-air:free",                      // Z.AI GLM 4.5 Air - 131K context
    "kwaipilot/kat-coder-pro:free",               // KAT-Coder-Pro - 256K context
    // x-ai/grok models removed due to response parsing issues with openrouter-rs
];

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

    /// Get the current model being used
    pub fn current_model(&self) -> &'static str {
        let index = self.current_model_index.load(Ordering::SeqCst);
        FREE_MODELS[index % FREE_MODELS.len()]
    }

    /// Switch to the next model in the list (called on rate limit)
    fn next_model(&self) -> &'static str {
        let new_index = self.current_model_index.fetch_add(1, Ordering::SeqCst) + 1;
        let model = FREE_MODELS[new_index % FREE_MODELS.len()];
        warn!("Switching to next free model: {}", model);
        model
    }

    /// Analyze a stock using AI, with automatic model fallback on rate limits
    pub async fn analyze_stock(&self, analysis: &StockAnalysis) -> Result<AIAnalysisResponse> {
        if !self.is_enabled() {
            return Err(anyhow!("OpenRouter is not enabled or API key not configured"));
        }

        let prompt = self.build_analysis_prompt(analysis);
        let mut attempts = 0;
        let max_attempts = FREE_MODELS.len();

        while attempts < max_attempts {
            let model = self.current_model();
            
            match self.send_request(model, &prompt).await {
                Ok(response) => {
                    return Ok(AIAnalysisResponse {
                        symbol: analysis.symbol.clone(),
                        analysis: response,
                        model_used: model.to_string(),
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
                        warn!("Error on model {} (will try next): {}", model, e);
                        self.next_model();
                        attempts += 1;
                    } else {
                        // Non-recoverable error, return immediately
                        return Err(anyhow!("OpenRouter API error with {}: {}", model, e));
                    }
                }
            }
        }

        Err(anyhow!("All {} free models are rate limited. Try again later.", FREE_MODELS.len()))
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

    /// Get list of available free models
    pub fn available_models() -> &'static [&'static str] {
        FREE_MODELS
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::MACDIndicator;

    #[test]
    fn test_free_models_list() {
        assert_eq!(FREE_MODELS.len(), 9);
        assert!(FREE_MODELS.iter().all(|m| m.ends_with(":free")));
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
    fn test_model_cycling() {
        let client = OpenRouterClient::new(Some("test-key".to_string()), true);
        
        let first = client.current_model();
        assert_eq!(first, FREE_MODELS[0]);
        
        let second = client.next_model();
        assert_eq!(second, FREE_MODELS[1]);
        
        let current = client.current_model();
        assert_eq!(current, FREE_MODELS[1]);
    }

    #[test]
    fn test_model_wraps_around() {
        let client = OpenRouterClient::new(Some("test-key".to_string()), true);
        
        // Cycle through all models
        for _ in 0..FREE_MODELS.len() {
            client.next_model();
        }
        
        // Should wrap back to first model
        let current = client.current_model();
        assert_eq!(current, FREE_MODELS[0]);
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
