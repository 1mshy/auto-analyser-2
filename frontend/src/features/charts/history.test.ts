import { describe, expect, it } from 'vitest';
import type { HistoricalDataPoint } from '../../types';
import {
  historyCsv,
  historySummary,
  prepareHistory,
  scaleHistory,
  selectRange,
} from './history';
import {
  CHART_PREFERENCES_KEY,
  defaultChartPreferences,
  readChartPreferences,
} from './preferences';

function quotes(prices: number[], start = '2026-01-01'): HistoricalDataPoint[] {
  return prices.map((close, i) => ({
    date: new Date(
      Date.parse(`${start}T00:00:00Z`) + i * 86400000,
    ).toISOString(),
    close,
    open: close,
    high: close + 1,
    low: close - 1,
    volume: 100 + i,
  }));
}

describe('daily chart calculations', () => {
  it('sorts and deduplicates sessions, and excludes invalid OHLC or dates', () => {
    const [first, second] = quotes([10, 20]);
    const result = prepareHistory([
      second,
      first,
      { ...first, close: 10.5 },
      { ...first, date: '2026-02-30' },
      { ...first, date: 'bad' },
      { ...first, date: '2026-01-03', close: Number.NaN },
      { ...first, date: '2026-01-04', high: 2 },
    ]);
    expect(result.map((row) => [row.date, row.close])).toEqual([
      ['2026-01-01', 10.5],
      ['2026-01-02', 20],
    ]);
  });

  it('uses full history to warm up moving averages before filtering the visible range', () => {
    const full = prepareHistory(
      quotes(Array.from({ length: 60 }, (_, i) => i + 10)),
    );
    expect(full[18].sma20).toBeNull();
    expect(full[19].sma20).toBe(19.5);
    expect(full[48].sma50).toBeNull();
    expect(full[49].sma50).toBe(34.5);
    expect(selectRange(full, '1W')[0].sma50).not.toBeNull();
    const week = selectRange(full, '1W');
    expect(week[week.length - 1].sma20).toBe(59.5);
  });

  it('matches the published Wilder RSI example and handles flat or one-way markets', () => {
    const values = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08,
      45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03,
    ];
    const series = prepareHistory(quotes(values));
    expect(series[13].rsi).toBeNull();
    expect(series[14].rsi).toBeCloseTo(70.4641, 4);
    expect(series[15].rsi).toBeCloseTo(66.2496, 4);
    expect(series[16].rsi).toBeCloseTo(66.4809, 4);
    expect(prepareHistory(quotes(Array(15).fill(20)))[14].rsi).toBe(50);
    expect(
      prepareHistory(quotes(Array.from({ length: 15 }, (_, i) => i + 10)))[14]
        .rsi,
    ).toBe(100);
    expect(
      prepareHistory(quotes(Array.from({ length: 15 }, (_, i) => 30 - i)))[14]
        .rsi,
    ).toBe(0);
  });

  it('anchors ranges to the last available quote and clamps calendar months', () => {
    const full = prepareHistory(quotes(Array(90).fill(20)));
    const week = selectRange(full, '1W');
    expect(week[0].date).toBe('2026-03-24');
    expect(week[week.length - 1].date).toBe('2026-03-31');
    expect(selectRange(full, '1M')[0].date).toBe('2026-02-28');
    expect(selectRange(full, '3M')).toHaveLength(90);
  });

  it('scales overlays to the same baseline and keeps OHLC readouts in price units', () => {
    const rows = prepareHistory(quotes([20, 25]));
    rows[1].sma20 = 22;
    const scaled = scaleHistory(rows, 'percent');
    expect(scaled[0].priceValue).toBe(0);
    expect(scaled[1].priceValue).toBe(25);
    expect(scaled[1].sma20Value).toBeCloseTo(10);
    expect(scaled[1].close).toBe(25);
    expect(scaled[0].sma20Value).toBeNull();
  });

  it('limits 3M to calendar months even when the server supplies more sessions', () => {
    const full = prepareHistory(quotes(Array(130).fill(20), '2026-05-12'));
    expect(full[full.length - 1].date).toBe('2026-09-18');
    const quarter = selectRange(full, '3M');
    expect(quarter[0].date).toBe('2026-06-18');
    expect(quarter[quarter.length - 1].date).toBe('2026-09-18');
    expect(quarter[0].sma20).toBe(20);
  });

  it('clamps a three-month cutoff at February month-end in ordinary and leap years', () => {
    const ordinary = prepareHistory(quotes(Array(151).fill(20), '2026-01-01'));
    const leap = prepareHistory(quotes(Array(152).fill(20), '2024-01-01'));
    expect(ordinary[ordinary.length - 1].date).toBe('2026-05-31');
    expect(leap[leap.length - 1].date).toBe('2024-05-31');
    expect(selectRange(ordinary, '3M')[0].date).toBe('2026-02-28');
    expect(selectRange(leap, '3M')[0].date).toBe('2024-02-29');
  });

  it('does not turn unavailable volume or indicators into zero-valued data', () => {
    const rows = quotes([20, 25]);
    rows[0].volume = Number.NaN;
    rows[1].volume = 0;
    const history = prepareHistory(rows);
    expect(history[0].volume).toBeNull();
    expect(historySummary(history)?.averageVolume).toBe(0);
    expect(historySummary(history)?.changePercent).toBe(25);
    expect(historyCsv(history).split('\r\n')[1]).toBe(
      '2026-01-01,20,21,19,20,,,,',
    );
    expect(historySummary([])).toBeNull();
    expect(scaleHistory([], 'percent')).toEqual([]);
  });
});

describe('chart preference recovery', () => {
  it('recovers from corrupt storage and validates every saved option', () => {
    localStorage.setItem(CHART_PREFERENCES_KEY, 'bad JSON');
    expect(readChartPreferences()).toEqual(defaultChartPreferences);
    localStorage.setItem(
      CHART_PREFERENCES_KEY,
      JSON.stringify({ range: '5Y', scale: 'log', rsi: true, volume: 'false' }),
    );
    expect(readChartPreferences()).toEqual({
      ...defaultChartPreferences,
      rsi: true,
    });
    localStorage.removeItem(CHART_PREFERENCES_KEY);
  });
});
