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
import { AnalysisProgress } from '../types';

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
 * Owns the analysis-cycle progress (WebSocket + poll fallback) and turns it into
 * silent, stale-while-revalidate refreshes of the cached stock data:
 * - When a new cycle completes, invalidate the stock/list/summary query families.
 * - At US market open, do the same instead of a full page reload.
 *
 * Must be rendered inside QueryClientProvider (it calls useQueryClient).
 */
export const ProgressProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const queryClient = useQueryClient();
  const { progress: wsProgress, isConnected } = useWebSocket();
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const lastCycleRef = useRef<string | null>(null);

  const revalidateStockData = React.useCallback(() => {
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
