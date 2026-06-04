import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api, FilterResponse } from './api';
import {
  GlobalSettings,
  StockFilter,
  StockAnalysis,
  MarketSummary,
  HistoricalDataPoint,
} from './types';

type AIStatus = {
  enabled: boolean;
  current_model?: string;
  available_models_count: number;
};

type StockResult = { stock: StockAnalysis | null; cached: boolean };

/**
 * Centralised query keys. Prefixes are deliberately hierarchical so the
 * cycle-signal revalidation in ProgressContext can invalidate broad families:
 *   ['stocks']          -> getStocks + every filtered list
 *   ['stock', symbol]   -> a stock and its history
 *   ['market-summary']  -> every settings variant
 */
export const queryKeys = {
  stocks: ['stocks'] as const,
  stocksFilter: (filter: StockFilter) => ['stocks', 'filter', filter] as const,
  stock: (symbol: string) => ['stock', symbol] as const,
  stockHistory: (symbol: string) => ['stock', symbol, 'history'] as const,
  marketSummary: (settings?: GlobalSettings) =>
    ['market-summary', settings ?? null] as const,
  aiStatus: ['ai-status'] as const,
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
