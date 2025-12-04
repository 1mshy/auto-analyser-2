import axios from 'axios';
import { StockAnalysis, StockFilter, AnalysisProgress, HistoricalDataPoint, MarketSummary, PaginationInfo, AIAnalysisResponse } from './types';

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
  getMarketSummary: async (): Promise<MarketSummary> => {
    const response = await axios.get(`${API_BASE_URL}/api/market-summary`);
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
