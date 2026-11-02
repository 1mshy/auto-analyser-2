import { useEffect, useState } from 'react';
import type { ChartRange, ChartScale } from './history';

export interface ChartPreferences {
  range: ChartRange;
  scale: ChartScale;
  sma20: boolean;
  sma50: boolean;
  volume: boolean;
  rsi: boolean;
}

export const CHART_PREFERENCES_KEY = 'auto-analyser.chart.v1';
export const defaultChartPreferences: ChartPreferences = {
  range: '3M',
  scale: 'price',
  sma20: true,
  sma50: false,
  volume: true,
  rsi: false,
};

export function readChartPreferences(): ChartPreferences {
  try {
    const saved = JSON.parse(
      localStorage.getItem(CHART_PREFERENCES_KEY) ?? '{}',
    );
    if (!saved || typeof saved !== 'object')
      return { ...defaultChartPreferences };
    return {
      range: ['1W', '1M', '3M'].includes(saved.range)
        ? saved.range
        : defaultChartPreferences.range,
      scale: saved.scale === 'percent' ? 'percent' : 'price',
      ...Object.fromEntries(
        (['sma20', 'sma50', 'volume', 'rsi'] as const).map((key) => [
          key,
          typeof saved[key] === 'boolean'
            ? saved[key]
            : defaultChartPreferences[key],
        ]),
      ),
    } as ChartPreferences;
  } catch {
    return { ...defaultChartPreferences };
  }
}

export function useChartPreferences() {
  const [preferences, setPreferences] = useState(readChartPreferences);
  useEffect(() => {
    try {
      localStorage.setItem(CHART_PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      /* Preferences remain usable when browser storage is unavailable. */
    }
  }, [preferences]);
  return [preferences, setPreferences] as const;
}
