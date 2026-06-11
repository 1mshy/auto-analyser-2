import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { AIAnalysisResponse } from '../../types';

export interface StreamingStatus {
  stage: string;
  message: string;
}

export interface AIAnalysisStream {
  aiAnalysis: AIAnalysisResponse | null;
  aiLoading: boolean;
  isStreaming: boolean;
  streamingText: string;
  streamingStatus: StreamingStatus | null;
  streamingModel: string | null;
  startAnalysis: () => void;
}

/**
 * Imperative SSE stream for AI analysis. Lives at page level (not inside the
 * AI tab) so an in-flight stream survives tab switches; it is torn down only
 * when the page unmounts or a new stream starts.
 */
export function useAIAnalysisStream(symbol: string | undefined): AIAnalysisStream {
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingStatus, setStreamingStatus] = useState<StreamingStatus | null>(null);
  const [streamingModel, setStreamingModel] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const streamingModelRef = useRef<string | null>(null);

  const startAnalysis = useCallback(() => {
    if (!symbol) return;

    // Cleanup any existing stream
    if (streamCleanupRef.current) {
      streamCleanupRef.current();
    }

    // Reset streaming state
    setStreamingText('');
    setStreamingStatus(null);
    setStreamingModel(null);
    streamingModelRef.current = null;
    setIsStreaming(true);
    setAiLoading(true);
    setAiAnalysis(null);

    // Start streaming
    const cleanup = api.streamAIAnalysis(symbol, {
      onStatus: (stage, message) => {
        setStreamingStatus({ stage, message });
      },
      onModelInfo: (model) => {
        streamingModelRef.current = model;
        setStreamingModel(model);
      },
      onContent: (delta) => {
        setStreamingText(prev => prev + delta);
      },
      onDone: (doneSymbol) => {
        setIsStreaming(false);
        setAiLoading(false);
        setStreamingStatus(null);
        // Convert streaming result to AIAnalysisResponse format
        setAiAnalysis({
          success: true,
          symbol: doneSymbol,
          analysis: undefined, // Will use streamingText instead
          model_used: streamingModelRef.current || undefined,
          generated_at: new Date().toISOString(),
        });
      },
      onError: (message) => {
        setIsStreaming(false);
        setAiLoading(false);
        setStreamingStatus(null);
        setAiAnalysis({ success: false, error: message });
      },
    });

    streamCleanupRef.current = cleanup;
  }, [symbol]);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (streamCleanupRef.current) {
        streamCleanupRef.current();
      }
    };
  }, []);

  return {
    aiAnalysis,
    aiLoading,
    isStreaming,
    streamingText,
    streamingStatus,
    streamingModel,
    startAnalysis,
  };
}
