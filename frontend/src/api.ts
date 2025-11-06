import axios from 'axios';
import { StockAnalysis, StockFilter, AnalysisProgress } from './types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3030';

export const api = {
  // Get all stocks
  getStocks: async (): Promise<StockAnalysis[]> => {
    const response = await axios.get(`${API_BASE_URL}/api/stocks`);
    return response.data;
  },

  // Filter stocks
  filterStocks: async (filter: StockFilter): Promise<StockAnalysis[]> => {
    const response = await axios.post(`${API_BASE_URL}/api/stocks/filter`, filter);
    return response.data;
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
    const host = process.env.REACT_APP_WS_URL || 'localhost:3030';
    return `${wsProtocol}//${host}/ws`;
  }
};
