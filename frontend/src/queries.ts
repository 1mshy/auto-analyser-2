import { useQuery, keepPreviousData, type UseQueryResult } from '@tanstack/react-query';
import { api, FilterResponse } from './api';
import {
  GlobalSettings,
  StockFilter,
  StockAnalysis,
  MarketSummary,
  HistoricalDataPoint,
  IndexInfo,
  IndexHeatmapResponse,
  AggregatedNewsItem,
  PaginationInfo,
  SectorPerformance,
  MarketIndexQuote,
  NewsCardPayload,
  CompanyProfile,
  InsiderTrade,
  EarningsData,
  AIAnalysisResponse,
  Watchlist,
  PositionView,
  AlertRule,
  NotificationChannel,
  NotificationHistoryItem,
  BacktestSummary,
  BacktestRun,
} from './types';

type AIStatus = {
  enabled: boolean;
  current_model?: string;
  available_models_count: number;
};

type StockResult = { stock: StockAnalysis | null; cached: boolean };

type NewsResponse = { news: AggregatedNewsItem[]; pagination: PaginationInfo };

type AlertHistoryResponse = {
  history: NotificationHistoryItem[];
  pagination: PaginationInfo;
};

/**
 * Centralised query keys. Prefixes are deliberately hierarchical so the
 * cycle-signal revalidation in ProgressContext can invalidate broad families:
 *   ['stocks']          -> getStocks + every filtered list
 *   ['stock', symbol]   -> a stock and all its per-symbol detail data
 *                          (history, news, profile, insiders, earnings, AI)
 *   ['market-summary']  -> every settings variant
 * ['alerts'] is user data, not market data — deliberately NOT cycle-invalidated.
 */
export const queryKeys = {
  stocks: ['stocks'] as const,
  stocksFilter: (filter: StockFilter) => ['stocks', 'filter', filter] as const,
  stock: (symbol: string) => ['stock', symbol] as const,
  stockHistory: (symbol: string) => ['stock', symbol, 'history'] as const,
  marketSummary: (settings?: GlobalSettings) =>
    ['market-summary', settings ?? null] as const,
  aiStatus: ['ai-status'] as const,
  indexes: ['indexes'] as const,
  indexHeatmap: (id: string, period: string) =>
    ['indexes', id, 'heatmap', period] as const,
  news: ['news'] as const,
  sectorPerformance: ['sectors'] as const,
  marketIndexes: ['market-indexes'] as const,
  stockNews: (symbol: string) => ['stock', symbol, 'news'] as const,
  companyProfile: (symbol: string) => ['stock', symbol, 'profile'] as const,
  insiderTrades: (symbol: string) => ['stock', symbol, 'insiders'] as const,
  stockEarnings: (symbol: string) => ['stock', symbol, 'earnings'] as const,
  aiAnalysis: (symbol: string) => ['stock', symbol, 'ai-analysis'] as const,
  watchlists: ['alerts', 'watchlists'] as const,
  positions: ['alerts', 'positions'] as const,
  rules: ['alerts', 'rules'] as const,
  channels: ['alerts', 'channels'] as const,
  alertHistory: (limit?: number) => ['alerts', 'history', limit ?? null] as const,
  unreadCount: ['alerts', 'unread'] as const,
  backtests: ['backtests'] as const,
  backtestRun: (id: string) => ['backtest', id] as const,
};

// Explicit TData generics: react-query's inference degrades to `any` under the
// project's TS 4.9, so we pin the result type on every hook.

export function useStocks(): UseQueryResult<StockAnalysis[], Error> {
  return useQuery<StockAnalysis[]>({
    queryKey: queryKeys.stocks,
    queryFn: api.getStocks,
  });
}

export function useFilterStocks(
  filter: StockFilter,
  enabled = true,
): UseQueryResult<FilterResponse, Error> {
  return useQuery<FilterResponse>({
    queryKey: queryKeys.stocksFilter(filter),
    queryFn: () => api.filterStocks(filter),
    enabled,
    // Keep showing the current page while the next one loads (smooth paging).
    placeholderData: keepPreviousData,
  });
}

export function useStock(symbol: string): UseQueryResult<StockResult, Error> {
  return useQuery<StockResult>({
    queryKey: queryKeys.stock(symbol),
    queryFn: () => api.getStock(symbol),
    enabled: !!symbol,
  });
}

export function useStockHistory(
  symbol: string,
): UseQueryResult<HistoricalDataPoint[], Error> {
  return useQuery<HistoricalDataPoint[]>({
    queryKey: queryKeys.stockHistory(symbol),
    queryFn: () => api.getStockHistory(symbol),
    enabled: !!symbol,
  });
}

export function useMarketSummary(
  settings?: GlobalSettings,
): UseQueryResult<MarketSummary, Error> {
  return useQuery<MarketSummary>({
    queryKey: queryKeys.marketSummary(settings),
    queryFn: () => api.getMarketSummary(settings),
  });
}

export function useAIStatus(): UseQueryResult<AIStatus, Error> {
  return useQuery<AIStatus>({
    queryKey: queryKeys.aiStatus,
    queryFn: api.getAIStatus,
    staleTime: 5 * 60_000,
  });
}

export function useIndexes(): UseQueryResult<IndexInfo[], Error> {
  return useQuery<IndexInfo[]>({
    queryKey: queryKeys.indexes,
    queryFn: api.getIndexes,
  });
}

export function useIndexHeatmap(
  id: string,
  period: string,
  enabled = true,
): UseQueryResult<IndexHeatmapResponse, Error> {
  return useQuery<IndexHeatmapResponse>({
    queryKey: queryKeys.indexHeatmap(id, period),
    queryFn: () => api.getIndexHeatmap(id, period),
    enabled: !!id && enabled,
  });
}

export function useNews(): UseQueryResult<NewsResponse, Error> {
  return useQuery<NewsResponse>({
    queryKey: queryKeys.news,
    queryFn: () => api.getNews(),
  });
}

export function useSectorPerformance(): UseQueryResult<SectorPerformance[], Error> {
  return useQuery<SectorPerformance[]>({
    queryKey: queryKeys.sectorPerformance,
    queryFn: api.getSectorPerformance,
  });
}

export function useMarketIndexes(): UseQueryResult<MarketIndexQuote[], Error> {
  return useQuery<MarketIndexQuote[]>({
    queryKey: queryKeys.marketIndexes,
    queryFn: api.getMarketIndexes,
  });
}

export function useStockNews(
  symbol: string,
  enabled = true,
): UseQueryResult<NewsCardPayload, Error> {
  return useQuery<NewsCardPayload>({
    queryKey: queryKeys.stockNews(symbol),
    queryFn: () => api.getStockNews(symbol),
    enabled: !!symbol && enabled,
  });
}

export function useCompanyProfile(
  symbol: string,
  enabled = true,
): UseQueryResult<CompanyProfile | null, Error> {
  return useQuery<CompanyProfile | null>({
    queryKey: queryKeys.companyProfile(symbol),
    queryFn: () => api.getCompanyProfile(symbol),
    enabled: !!symbol && enabled,
  });
}

export function useInsiderTrades(
  symbol: string,
  enabled = true,
): UseQueryResult<InsiderTrade[], Error> {
  return useQuery<InsiderTrade[]>({
    queryKey: queryKeys.insiderTrades(symbol),
    queryFn: () => api.getInsiderTrades(symbol),
    enabled: !!symbol && enabled,
  });
}

export function useStockEarnings(
  symbol: string,
  enabled = true,
): UseQueryResult<EarningsData | null, Error> {
  return useQuery<EarningsData | null>({
    queryKey: queryKeys.stockEarnings(symbol),
    queryFn: () => api.getStockEarnings(symbol),
    enabled: !!symbol && enabled,
  });
}

export function useAIAnalysis(
  symbol: string,
  enabled = true,
): UseQueryResult<AIAnalysisResponse, Error> {
  return useQuery<AIAnalysisResponse>({
    queryKey: queryKeys.aiAnalysis(symbol),
    queryFn: () => api.getAIAnalysis(symbol),
    enabled: !!symbol && enabled,
  });
}

export function useWatchlists(): UseQueryResult<Watchlist[], Error> {
  return useQuery<Watchlist[]>({
    queryKey: queryKeys.watchlists,
    queryFn: api.alerts.listWatchlists,
    staleTime: 30_000,
  });
}

export function usePositions(): UseQueryResult<PositionView[], Error> {
  return useQuery<PositionView[]>({
    queryKey: queryKeys.positions,
    queryFn: api.alerts.listPositions,
    staleTime: 30_000,
  });
}

export function useRules(): UseQueryResult<AlertRule[], Error> {
  return useQuery<AlertRule[]>({
    queryKey: queryKeys.rules,
    queryFn: api.alerts.listRules,
    staleTime: 30_000,
  });
}

export function useChannels(): UseQueryResult<NotificationChannel[], Error> {
  return useQuery<NotificationChannel[]>({
    queryKey: queryKeys.channels,
    queryFn: api.alerts.listChannels,
    staleTime: 30_000,
  });
}

export function useAlertHistory(
  limit?: number,
): UseQueryResult<AlertHistoryResponse, Error> {
  return useQuery<AlertHistoryResponse>({
    queryKey: queryKeys.alertHistory(limit),
    queryFn: () =>
      api.alerts.listHistory(limit != null ? { page_size: limit } : undefined),
    staleTime: 30_000,
  });
}

export function useUnreadCount(): UseQueryResult<number, Error> {
  return useQuery<number>({
    queryKey: queryKeys.unreadCount,
    queryFn: api.alerts.unreadCount,
    refetchInterval: 30_000,
  });
}

export function useBacktests(): UseQueryResult<BacktestSummary[], Error> {
  return useQuery<BacktestSummary[]>({
    queryKey: queryKeys.backtests,
    queryFn: api.backtest.list,
    staleTime: 30_000,
  });
}

export function useBacktestRun(
  id: string,
  enabled = true,
): UseQueryResult<BacktestRun, Error> {
  return useQuery<BacktestRun>({
    queryKey: queryKeys.backtestRun(id),
    queryFn: () => api.backtest.get(id),
    enabled: !!id && enabled,
  });
}
