import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';
import { StockAnalysis } from './types';

/**
 * Hook that triggers a callback at 10am on weekdays (market open time)
 * to refresh stock data with updated opening prices.
 */
export const useMarketOpenRefresh = (onRefresh: () => void) => {
  const lastRefreshDateRef = useRef<string | null>(null);

  useEffect(() => {
    const checkMarketOpen = () => {
      const now = new Date();
      const day = now.getDay();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      // Check if it's a weekday (Monday = 1, Friday = 5)
      const isWeekday = day >= 1 && day <= 5;

      // Check if it's 10:00 AM (within the first minute to avoid multiple triggers)
      const is10AM = hours === 10 && minutes === 0;

      // Create a date string to prevent multiple refreshes on the same day
      const todayStr = now.toDateString();

      if (isWeekday && is10AM && lastRefreshDateRef.current !== todayStr) {
        console.log('🔔 Market open refresh triggered at 10:00 AM');
        lastRefreshDateRef.current = todayStr;
        onRefresh();
      }
    };

    // Check immediately on mount
    checkMarketOpen();

    // Check every 30 seconds
    const interval = setInterval(checkMarketOpen, 30000);

    return () => clearInterval(interval);
  }, [onRefresh]);

  // Calculate time until next 10am for display purposes
  const getTimeUntilNextMarketOpen = useCallback((): { hours: number; minutes: number } | null => {
    const now = new Date();
    const day = now.getDay();

    // Skip weekends
    if (day === 0 || day === 6) {
      return null;
    }

    const target = new Date(now);
    target.setHours(10, 0, 0, 0);

    // If we're past 10am today, return null (market already opened)
    if (now >= target) {
      return null;
    }

    const diffMs = target.getTime() - now.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return { hours, minutes };
  }, []);

  return { getTimeUntilNextMarketOpen };
};

export const useWebSocket = () => {
  const [stocks, setStocks] = useState<StockAnalysis[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(api.getWebSocketUrl());

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data)) {
            setStocks(data);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket connection error');
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        setTimeout(connect, 5000);
      };

      return ws;
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Failed to create WebSocket connection');
      setIsConnected(false);
      setTimeout(connect, 5000);
      return null;
    }
  }, []);

  useEffect(() => {
    const ws = connect();
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [connect]);

  return { stocks, isConnected, error };
};
