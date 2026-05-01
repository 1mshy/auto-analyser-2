import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';
import { AnalysisProgress } from './types';

/**
 * Hook that triggers a callback shortly after US market open (9:30 ET)
 * to refresh stock data with updated opening prices.
 */
export const useMarketOpenRefresh = (onRefresh: () => void) => {
  const lastRefreshDateRef = useRef<string | null>(null);

  useEffect(() => {
    const checkMarketOpen = () => {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(now);
      const get = (type: string) => parts.find(p => p.type === type)?.value || '';
      const weekday = get('weekday');
      const hours = Number(get('hour'));
      const minutes = Number(get('minute'));

      const isWeekday = !['Sat', 'Sun'].includes(weekday);

      // Trigger in the first five minutes after 9:30 ET.
      const isMarketOpenWindow = hours === 9 && minutes >= 30 && minutes < 35;

      // Create a date string to prevent multiple refreshes on the same day
      const todayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);

      if (isWeekday && isMarketOpenWindow && lastRefreshDateRef.current !== todayStr) {
        console.log('Market open refresh triggered at 9:30 AM ET');
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

  // Calculate time until next 9:30am ET for display purposes
  const getTimeUntilNextMarketOpen = useCallback((): { hours: number; minutes: number } | null => {
    const now = new Date();
    const easternNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = easternNow.getDay();
    if (day === 0 || day === 6) return null;
    const targetEastern = new Date(easternNow);
    targetEastern.setHours(9, 30, 0, 0);
    if (easternNow >= targetEastern) return null;
    const diffMs = targetEastern.getTime() - easternNow.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return { hours, minutes };
  }, []);

  return { getTimeUntilNextMarketOpen };
};

export const useWebSocket = () => {
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const closedRef = useRef(false);

  const connect = useCallback(() => {
    try {
      closedRef.current = false;
      const ws = new WebSocket(api.getWebSocketUrl());

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (
            data &&
            typeof data === 'object' &&
            typeof data.total_stocks === 'number' &&
            typeof data.analyzed === 'number'
          ) {
            setProgress(data as AnalysisProgress);
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
        if (!closedRef.current) {
          reconnectTimerRef.current = window.setTimeout(connect, 5000);
        }
      };

      return ws;
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Failed to create WebSocket connection');
      setIsConnected(false);
      if (!closedRef.current) {
        reconnectTimerRef.current = window.setTimeout(connect, 5000);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    const ws = connect();
    return () => {
      closedRef.current = true;
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (ws) {
        ws.close();
      }
    };
  }, [connect]);

  return { progress, isConnected, error };
};
