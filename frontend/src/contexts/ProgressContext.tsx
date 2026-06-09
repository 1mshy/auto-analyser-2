import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket, useMarketOpenRefresh } from '../hooks';
import { api } from '../api';
import type { FilterResponse } from '../api';
import { AnalysisProgress, StockAnalysis } from '../types';

interface ProgressContextValue {
  progress: AnalysisProgress | null;
  isConnected: boolean;
}

const ProgressContext = createContext<ProgressContextValue>({
  progress: null,
  isConnected: false,
});

export const useProgress = () => useContext(ProgressContext);

/**
 * Merge a lean stock_update payload into a cached row. Only defined, non-null
 * fields overwrite, so heavy fields (news/earnings) and previously-fetched
 * technicals survive on the existing row. Returns a new object so changed rows
 * get fresh identities.
 */
function mergeStock(existing: StockAnalysis, update: StockAnalysis): StockAnalysis {
  const merged: Record<string, unknown> = { ...existing };
  const source = update as unknown as Record<string, unknown>;
  Object.keys(source).forEach((key) => {
    if (key === 'type' || key === 'news' || key === 'earnings') return;
    const value = source[key];
    if (value === undefined || value === null) return;
    if (key === 'technicals') {
      const fresh: Record<string, unknown> = {};
      Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
        if (v !== undefined && v !== null) fresh[k] = v;
      });
      merged.technicals = {
        ...((existing.technicals ?? {}) as Record<string, unknown>),
        ...fresh,
      };
      return;
    }
    merged[key] = value;
  });
  return merged as unknown as StockAnalysis;
}

/** Returns the same array reference when no row matched (no re-render). */
function mergeRows(
  rows: StockAnalysis[],
  updates: Map<string, StockAnalysis>,
): StockAnalysis[] {
  let changed = false;
  const next = rows.map((row) => {
    const update = updates.get(row.symbol);
    if (!update) return row;
    changed = true;
    return mergeStock(row, update);
  });
  return changed ? next : rows;
}

/**
 * Owns the analysis-cycle progress (WebSocket + poll fallback) and turns it into
 * silent, stale-while-revalidate refreshes of the cached stock data:
 * - When a new cycle completes, invalidate the stock/list/summary query families.
 * - At US market open, do the same instead of a full page reload.
 * - Mid-cycle stock_update frames are buffered and merged into the list caches
 *   in 5s batches; matching detail queries are invalidated to refetch in full.
 * - On resync (client lagged the broadcast), drop the buffer and revalidate.
 *
 * Must be rendered inside QueryClientProvider (it calls useQueryClient).
 */
export const ProgressProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const queryClient = useQueryClient();
  const pendingRef = useRef<Map<string, StockAnalysis>>(new Map());

  const handleStockUpdate = React.useCallback((stock: StockAnalysis) => {
    pendingRef.current.set(stock.symbol, stock);
  }, []);

  const handleResync = React.useCallback(() => {
    pendingRef.current.clear();
    queryClient.invalidateQueries({ queryKey: ['stocks'] });
    queryClient.invalidateQueries({ queryKey: ['market-summary'] });
  }, [queryClient]);

  const { progress: wsProgress, isConnected } = useWebSocket({
    onStockUpdate: handleStockUpdate,
    onResync: handleResync,
  });
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const lastCycleRef = useRef<string | null>(null);

  const revalidateStockData = React.useCallback(() => {
    pendingRef.current.clear();
    queryClient.invalidateQueries({ queryKey: ['stocks'] });
    queryClient.invalidateQueries({ queryKey: ['stock'] });
    queryClient.invalidateQueries({ queryKey: ['market-summary'] });
  }, [queryClient]);

  // WebSocket pushes progress; mirror it into state.
  useEffect(() => {
    if (wsProgress) setProgress(wsProgress);
  }, [wsProgress]);

  // Poll fallback only while the WebSocket is down.
  useEffect(() => {
    if (isConnected) return;
    let active = true;
    const fetchProgress = async () => {
      try {
        const data = await api.getProgress();
        if (active) setProgress(data);
      } catch {
        /* transient; keep last known progress */
      }
    };
    fetchProgress();
    const interval = setInterval(fetchProgress, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isConnected]);

  // Batch mid-cycle stock_update frames into the query cache every 5s so
  // per-symbol pushes never cause a render storm.
  useEffect(() => {
    const flush = () => {
      if (pendingRef.current.size === 0) return;
      const updates = new Map(pendingRef.current);
      pendingRef.current.clear();

      queryClient.setQueriesData<unknown>({ queryKey: ['stocks'] }, (old: unknown) => {
        if (Array.isArray(old)) {
          return mergeRows(old as StockAnalysis[], updates);
        }
        if (
          old &&
          typeof old === 'object' &&
          Array.isArray((old as FilterResponse).stocks)
        ) {
          const prev = old as FilterResponse;
          const nextRows = mergeRows(prev.stocks, updates);
          return nextRows === prev.stocks ? prev : { ...prev, stocks: nextRows };
        }
        return old;
      });

      // Detail views refetch the full object instead of being clobbered by
      // the lean payload; inactive ones are just marked stale.
      updates.forEach((_stock, symbol) => {
        const query = queryClient
          .getQueryCache()
          .find({ queryKey: ['stock', symbol], exact: true });
        if (!query) return;
        queryClient.invalidateQueries({
          queryKey: ['stock', symbol],
          exact: true,
          refetchType: query.isActive() ? 'active' : 'none',
        });
      });
    };
    const interval = setInterval(flush, 5000);
    return () => clearInterval(interval);
  }, [queryClient]);

  // Cycle-signal revalidation: when a cycle finishes, refresh stock data (SWR).
  const cycleSignal =
    progress?.last_cycle_completed || progress?.last_successful_cycle || null;
  useEffect(() => {
    if (!cycleSignal) return;
    if (lastCycleRef.current === null) {
      // First observed value — adopt as baseline, don't refetch on mount.
      lastCycleRef.current = cycleSignal;
      return;
    }
    if (lastCycleRef.current !== cycleSignal) {
      lastCycleRef.current = cycleSignal;
      revalidateStockData();
    }
  }, [cycleSignal, revalidateStockData]);

  // Market-open refresh now revalidates the cache instead of reloading the page.
  useMarketOpenRefresh(revalidateStockData);

  return (
    <ProgressContext.Provider value={{ progress, isConnected }}>
      {children}
    </ProgressContext.Provider>
  );
};
