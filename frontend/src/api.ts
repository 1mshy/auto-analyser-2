import axios from 'axios';
import { StockAnalysis, StockFilter, AnalysisProgress, HistoricalDataPoint, MarketSummary, PaginationInfo, AIAnalysisResponse, GlobalSettings, CompanyProfile, IndexInfo, IndexHeatmapResponse, AggregatedNewsItem, SectorPerformance, InsiderTrade, EarningsData, EarningsCalendarRow, CorrelationData, Watchlist, NotificationChannel, AlertRule, NotificationHistoryItem, DeliveryResult, AlertScope, ConditionGroup, QuietHours, DiscordChannelConfig, HealthStatus, PositionView, CreatePositionInput, UpdatePositionInput } from './types';

const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

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
  healthCheck: async (): Promise<HealthStatus> => {
    const response = await axios.get(`${API_BASE_URL}/health`);
    return response.data;
  },

  // WebSocket URL
  getWebSocketUrl: (): string => {
    const configured = process.env.REACT_APP_WS_URL;
    if (configured) {
      if (configured.startsWith('ws://') || configured.startsWith('wss://')) {
        return configured;
      }
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProtocol}//${configured.replace(/\/$/, '')}/ws`;
    }
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${window.location.host}/ws`;
  },

  // Get list of available market indexes
  getIndexes: async (): Promise<IndexInfo[]> => {
    const response = await axios.get(`${API_BASE_URL}/api/indexes`);
    if (response.data.success) {
      return response.data.indexes;
    }
    return [];
  },

  // Get index heatmap data with performance
  getIndexHeatmap: async (indexId: string, period: string = '1d'): Promise<IndexHeatmapResponse> => {
    const response = await axios.get(`${API_BASE_URL}/api/indexes/${indexId}/heatmap?period=${period}`);
    return response.data;
  },

  // Get aggregated news feed
  getNews: async (params?: { sector?: string; search?: string; page?: number; page_size?: number }): Promise<{ news: AggregatedNewsItem[]; pagination: PaginationInfo }> => {
    const queryParams = new URLSearchParams();
    if (params?.sector) queryParams.append('sector', params.sector);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    const qs = queryParams.toString();
    const url = qs ? `${API_BASE_URL}/api/news?${qs}` : `${API_BASE_URL}/api/news`;
    const response = await axios.get(url);
    return {
      news: response.data.news || [],
      pagination: response.data.pagination || { page: 1, page_size: 50, total: 0, total_pages: 0 },
    };
  },

  // Get earnings calendar
  getEarnings: async (daysAhead?: number): Promise<EarningsCalendarRow[]> => {
    const url = daysAhead
      ? `${API_BASE_URL}/api/earnings?days_ahead=${daysAhead}`
      : `${API_BASE_URL}/api/earnings`;
    const response = await axios.get(url);
    return response.data.earnings || [];
  },

  // Get insider trades for a stock
  getInsiderTrades: async (symbol: string): Promise<InsiderTrade[]> => {
    const response = await axios.get(`${API_BASE_URL}/api/stocks/${symbol}/insiders`);
    return response.data.trades || [];
  },

  // Get sector performance data
  getSectorPerformance: async (): Promise<SectorPerformance[]> => {
    const response = await axios.get(`${API_BASE_URL}/api/sectors`);
    return response.data.sectors || [];
  },

  // Get correlation matrix
  getCorrelationMatrix: async (symbols: string[], days?: number): Promise<CorrelationData> => {
    const params = new URLSearchParams();
    params.append('symbols', symbols.join(','));
    if (days) params.append('days', days.toString());
    const response = await axios.get(`${API_BASE_URL}/api/analytics/correlation?${params.toString()}`);
    return response.data;
  },

  // Get earnings data for a single stock
  getStockEarnings: async (symbol: string): Promise<EarningsData | null> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/stocks/${symbol}/earnings`);
      if (response.data.success) {
        return response.data.earnings;
      }
      return null;
    } catch {
      return null;
    }
  },

  // --------------------------------------------------------------
  // Notifications / alert engine
  // --------------------------------------------------------------

  alerts: {
    // ---- status ----
    status: async (): Promise<{ enabled: boolean }> => {
      const r = await axios.get(`${API_BASE_URL}/api/alerts/status`);
      return { enabled: !!r.data.enabled };
    },

    // ---- watchlists ----
    listWatchlists: async (): Promise<Watchlist[]> => {
      const r = await axios.get(`${API_BASE_URL}/api/watchlists`);
      return r.data.watchlists || [];
    },
    createWatchlist: async (name: string, symbols: string[] = []): Promise<Watchlist> => {
      const r = await axios.post(`${API_BASE_URL}/api/watchlists`, { name, symbols });
      return r.data.watchlist;
    },
    updateWatchlist: async (
      id: string,
      patch: { name?: string; symbols?: string[] },
    ): Promise<Watchlist> => {
      const r = await axios.patch(`${API_BASE_URL}/api/watchlists/${id}`, patch);
      return r.data.watchlist;
    },
    deleteWatchlist: async (id: string): Promise<void> => {
      await axios.delete(`${API_BASE_URL}/api/watchlists/${id}`);
    },
    addSymbol: async (id: string, symbol: string): Promise<Watchlist> => {
      const r = await axios.post(`${API_BASE_URL}/api/watchlists/${id}/symbols`, { symbol });
      return r.data.watchlist;
    },
    removeSymbol: async (id: string, symbol: string): Promise<Watchlist> => {
      const r = await axios.delete(`${API_BASE_URL}/api/watchlists/${id}/symbols/${symbol}`);
      return r.data.watchlist;
    },

    // ---- positions ----
    listPositions: async (): Promise<PositionView[]> => {
      const r = await axios.get(`${API_BASE_URL}/api/positions`);
      return r.data.positions || [];
    },
    createPosition: async (input: CreatePositionInput): Promise<PositionView> => {
      const r = await axios.post(`${API_BASE_URL}/api/positions`, input);
      return r.data.position;
    },
    getPosition: async (id: string): Promise<PositionView> => {
      const r = await axios.get(`${API_BASE_URL}/api/positions/${id}`);
      return r.data.position;
    },
    updatePosition: async (id: string, patch: UpdatePositionInput): Promise<PositionView> => {
      const r = await axios.patch(`${API_BASE_URL}/api/positions/${id}`, patch);
      return r.data.position;
    },
    deletePosition: async (id: string): Promise<void> => {
      await axios.delete(`${API_BASE_URL}/api/positions/${id}`);
    },

    // ---- channels ----
    listChannels: async (): Promise<NotificationChannel[]> => {
      const r = await axios.get(`${API_BASE_URL}/api/alerts/channels`);
      return r.data.channels || [];
    },
    createChannel: async (
      name: string,
      config: DiscordChannelConfig,
      enabled = true,
    ): Promise<NotificationChannel> => {
      const r = await axios.post(`${API_BASE_URL}/api/alerts/channels`, {
        name,
        kind: 'discord',
        ...config,
        enabled,
      });
      return r.data.channel;
    },
    updateChannel: async (
      id: string,
      patch: { name?: string; enabled?: boolean; config?: { kind: 'discord' } & DiscordChannelConfig },
    ): Promise<NotificationChannel> => {
      const r = await axios.put(`${API_BASE_URL}/api/alerts/channels/${id}`, patch);
      return r.data.channel;
    },
    deleteChannel: async (id: string): Promise<void> => {
      await axios.delete(`${API_BASE_URL}/api/alerts/channels/${id}`);
    },
    testChannel: async (id: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const r = await axios.post(`${API_BASE_URL}/api/alerts/channels/${id}/test`);
        return { success: !!r.data.success };
      } catch (e: any) {
        return { success: false, error: e?.response?.data?.error || 'test failed' };
      }
    },

    // ---- rules ----
    listRules: async (): Promise<AlertRule[]> => {
      const r = await axios.get(`${API_BASE_URL}/api/alerts/rules`);
      return r.data.rules || [];
    },
    getRule: async (id: string): Promise<AlertRule | null> => {
      const r = await axios.get(`${API_BASE_URL}/api/alerts/rules/${id}`);
      return r.data.rule || null;
    },
    createRule: async (input: {
      name: string;
      enabled?: boolean;
      scope: AlertScope;
      conditions: ConditionGroup;
      cooldown_minutes?: number;
      quiet_hours?: QuietHours | null;
      channel_ids: string[];
      message_template?: string | null;
      require_consecutive?: number;
    }): Promise<AlertRule> => {
      const r = await axios.post(`${API_BASE_URL}/api/alerts/rules`, input);
      return r.data.rule;
    },
    updateRule: async (id: string, patch: Partial<Omit<AlertRule, '_id' | 'created_at' | 'updated_at'>>): Promise<AlertRule> => {
      const r = await axios.put(`${API_BASE_URL}/api/alerts/rules/${id}`, patch);
      return r.data.rule;
    },
    toggleRule: async (id: string): Promise<AlertRule> => {
      const r = await axios.post(`${API_BASE_URL}/api/alerts/rules/${id}/toggle`);
      return r.data.rule;
    },
    deleteRule: async (id: string): Promise<void> => {
      await axios.delete(`${API_BASE_URL}/api/alerts/rules/${id}`);
    },
    testRule: async (
      id: string,
      symbol?: string,
    ): Promise<{ success: boolean; delivered?: DeliveryResult[]; symbol?: string; error?: string }> => {
      try {
        const r = await axios.post(`${API_BASE_URL}/api/alerts/rules/${id}/test`, { symbol });
        return {
          success: !!r.data.success,
          delivered: r.data.delivered,
          symbol: r.data.symbol,
        };
      } catch (e: any) {
        return { success: false, error: e?.response?.data?.error || 'test failed' };
      }
    },

    // ---- history ----
    listHistory: async (params?: {
      page?: number;
      page_size?: number;
      rule_id?: string;
      symbol?: string;
    }): Promise<{ history: NotificationHistoryItem[]; pagination: PaginationInfo }> => {
      const qp = new URLSearchParams();
      if (params?.page) qp.append('page', params.page.toString());
      if (params?.page_size) qp.append('page_size', params.page_size.toString());
      if (params?.rule_id) qp.append('rule_id', params.rule_id);
      if (params?.symbol) qp.append('symbol', params.symbol);
      const qs = qp.toString();
      const url = qs ? `${API_BASE_URL}/api/alerts/history?${qs}` : `${API_BASE_URL}/api/alerts/history`;
      const r = await axios.get(url);
      return {
        history: r.data.history || [],
        pagination: r.data.pagination || { page: 1, page_size: 50, total: 0, total_pages: 0 },
      };
    },
    unreadCount: async (): Promise<number> => {
      try {
        const r = await axios.get(`${API_BASE_URL}/api/alerts/history/unread-count`);
        return r.data.unread || 0;
      } catch {
        return 0;
      }
    },
    markRead: async (id: string, read = true): Promise<void> => {
      await axios.patch(`${API_BASE_URL}/api/alerts/history/${id}/read`, { read });
    },
  },
};

