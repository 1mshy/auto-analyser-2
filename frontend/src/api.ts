import axios from 'axios';
import { StockAnalysis, StockFilter, AnalysisProgress, HistoricalDataPoint, MarketSummary, PaginationInfo, AIAnalysisResponse, GlobalSettings, CompanyProfile } from './types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3333';

export interface FilterResponse {
  stocks: StockAnalysis[];
  pagination: PaginationInfo;
  cached: boolean;
}

export const api = {
  // Get all stocks (paginated)
  getStocks: async (): Promise<StockAnalysis[]> => {
    const response = await axios.get(`${API_BASE_URL}/api/stocks`);
    return response.data.stocks || response.data;
  },

  // Get a single stock by symbol
  getStock: async (symbol: string): Promise<{ stock: StockAnalysis | null; cached: boolean }> => {
    const response = await axios.get(`${API_BASE_URL}/api/stocks/${symbol}`);
    if (response.data.success) {
      return { stock: response.data.stock, cached: response.data.cached };
    }
    return { stock: null, cached: false };
  },

  // Filter stocks with pagination
  filterStocks: async (filter: StockFilter): Promise<FilterResponse> => {
    const response = await axios.post(`${API_BASE_URL}/api/stocks/filter`, filter);
    return {
      stocks: response.data.stocks || [],
      pagination: response.data.pagination || { page: 1, page_size: 50, total: 0, total_pages: 0 },
      cached: response.data.cached || false,
    };
  },

  // Get market summary (top gainers, losers, etc.)
  getMarketSummary: async (settings?: GlobalSettings): Promise<MarketSummary> => {
    // Build query params from settings
    const params = new URLSearchParams();
    if (settings?.minMarketCap) {
      params.append('min_market_cap', settings.minMarketCap.toString());
    }
    if (settings?.maxPriceChangePercent) {
      params.append('max_price_change_percent', settings.maxPriceChangePercent.toString());
    }

    const queryString = params.toString();
    const url = queryString
      ? `${API_BASE_URL}/api/market-summary?${queryString}`
      : `${API_BASE_URL}/api/market-summary`;

    const response = await axios.get(url);
    if (response.data.success) {
      return response.data.summary;
    }
    throw new Error(response.data.error || 'Failed to fetch market summary');
  },

  // Get AI analysis for a stock
  getAIAnalysis: async (symbol: string): Promise<AIAnalysisResponse> => {
    const response = await axios.get(`${API_BASE_URL}/api/stocks/${symbol}/ai-analysis`);
    return response.data;
  },

  // Stream AI analysis for a stock with real-time updates
  streamAIAnalysis: (
    symbol: string,
    callbacks: {
      onStatus?: (stage: string, message: string) => void;
      onModelInfo?: (model: string) => void;
      onContent?: (delta: string) => void;
      onDone?: (symbol: string) => void;
      onError?: (message: string) => void;
    }
  ): (() => void) => {
    const eventSource = new EventSource(`${API_BASE_URL}/api/stocks/${symbol}/ai-analysis/stream`);

    eventSource.addEventListener('status', (event) => {
      const data = JSON.parse(event.data);
      callbacks.onStatus?.(data.stage, data.message);
    });

    eventSource.addEventListener('model_info', (event) => {
      const data = JSON.parse(event.data);
      callbacks.onModelInfo?.(data.model);
    });

    eventSource.addEventListener('content', (event) => {
      const data = JSON.parse(event.data);
      callbacks.onContent?.(data.delta);
    });

    eventSource.addEventListener('done', (event) => {
      const data = JSON.parse(event.data);
      callbacks.onDone?.(data.symbol);
      eventSource.close();
    });

    eventSource.addEventListener('error', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        callbacks.onError?.(data.message);
      } catch {
        callbacks.onError?.('Connection error');
      }
      eventSource.close();
    });

    // Return cleanup function
    return () => {
      eventSource.close();
    };
  },

  // Get AI status
  getAIStatus: async (): Promise<{ enabled: boolean; current_model?: string; available_models_count: number }> => {
    const response = await axios.get(`${API_BASE_URL}/api/ai/status`);
    return response.data;
  },

  // Get stock historical data
  getStockHistory: async (symbol: string): Promise<HistoricalDataPoint[]> => {
    const response = await axios.get(`${API_BASE_URL}/api/stocks/${symbol}/history`);
    return response.data.history || [];
  },

  // Get company profile (description, industry, website, etc.)
  getCompanyProfile: async (symbol: string): Promise<CompanyProfile | null> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/stocks/${symbol}/profile`);
      if (response.data.success) {
        return response.data.profile;
      }
      return null;
    } catch {
      return null;
    }
  },

  // Get analysis progress
  getProgress: async (): Promise<AnalysisProgress> => {
    const response = await axios.get(`${API_BASE_URL}/api/progress`);
    return response.data;
  },

  // Health check
  healthCheck: async (): Promise<{ status: string }> => {
    const response = await axios.get(`${API_BASE_URL}/health`);
    return response.data;
  },

  // WebSocket URL
  getWebSocketUrl: (): string => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.REACT_APP_WS_URL || 'localhost:3333';
    return `${wsProtocol}//${host}/ws`;
  }
};
