import type { HistoricalDataPoint } from '../../types';

export type ChartRange = '1W' | '1M' | '3M';
export type ChartScale = 'price' | 'percent';

export interface HistoryPoint extends Omit<HistoricalDataPoint, 'volume'> {
  volume: number | null;
  sma20: number | null;
  sma50: number | null;
  rsi: number | null;
}

export interface ChartPoint extends HistoryPoint {
  priceValue: number;
  sma20Value: number | null;
  sma50Value: number | null;
}

/** Validate, deduplicate and sort daily quotes before deriving any indicator. */
export function prepareHistory(history: HistoricalDataPoint[]): HistoryPoint[] {
  const days = new Map<string, HistoricalDataPoint>();
  for (const row of history) {
    if (typeof row.date !== 'string') continue;
    const date = row.date.slice(0, 10);
    const time = Date.parse(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(time) ||
      new Date(time).toISOString().slice(0, 10) !== date
    )
      continue;
    if (
      ![row.open, row.high, row.low, row.close].every(
        (value) => Number.isFinite(value) && value > 0,
      ) ||
      row.high < Math.max(row.open, row.close, row.low) ||
      row.low > Math.min(row.open, row.close)
    )
      continue;
    days.set(date, { ...row, date });
  }
  const rows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  let sum20 = 0;
  let sum50 = 0;
  let averageGain = 0;
  let averageLoss = 0;
  return rows.map((row, index) => {
    sum20 += row.close - (index >= 20 ? rows[index - 20].close : 0);
    sum50 += row.close - (index >= 50 ? rows[index - 50].close : 0);
    let rsi: number | null = null;
    if (index > 0) {
      const change = row.close - rows[index - 1].close;
      const gain = Math.max(change, 0);
      const loss = Math.max(-change, 0);
      if (index <= 14) {
        averageGain += gain / 14;
        averageLoss += loss / 14;
      } else {
        // Wilder's smoothing, matching the analysis engine's RSI (14).
        averageGain = (averageGain * 13 + gain) / 14;
        averageLoss = (averageLoss * 13 + loss) / 14;
      }
      if (index >= 14) {
        rsi =
          averageLoss === 0
            ? averageGain === 0
              ? 50
              : 100
            : 100 - 100 / (1 + averageGain / averageLoss);
      }
    }
    return {
      ...row,
      volume:
        Number.isFinite(row.volume) && row.volume >= 0 ? row.volume : null,
      sma20: index >= 19 ? sum20 / 20 : null,
      sma50: index >= 49 ? sum50 / 50 : null,
      rsi,
    };
  });
}

/** Anchor ranges to the latest available session, so stale data stays inspectable. */
export function selectRange(
  history: HistoryPoint[],
  range: ChartRange,
): HistoryPoint[] {
  if (history.length === 0) return history;
  const end = new Date(`${history[history.length - 1].date}T00:00:00Z`);
  if (range === '1W') end.setUTCDate(end.getUTCDate() - 7);
  else {
    const day = end.getUTCDate();
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() - (range === '3M' ? 3 : 1));
    const lastDay = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
    ).getUTCDate();
    end.setUTCDate(Math.min(day, lastDay));
  }
  const cutoff = end.toISOString().slice(0, 10);
  return history.filter((row) => row.date >= cutoff);
}

export function scaleHistory(
  history: HistoryPoint[],
  scale: ChartScale,
): ChartPoint[] {
  const baseline = history[0]?.close;
  const convert = (value: number | null) =>
    value == null
      ? null
      : scale === 'percent'
        ? (value / baseline - 1) * 100
        : value;
  return history.map((row) => ({
    ...row,
    priceValue: convert(row.close)!,
    sma20Value: convert(row.sma20),
    sma50Value: convert(row.sma50),
  }));
}

export function historySummary(history: HistoryPoint[]) {
  if (!history.length) return null;
  const first = history[0];
  const last = history[history.length - 1];
  const volumes = history.flatMap((row) =>
    row.volume == null ? [] : [row.volume],
  );
  return {
    first,
    last,
    change: last.close - first.close,
    changePercent: (last.close / first.close - 1) * 100,
    high: Math.max(...history.map((row) => row.high)),
    low: Math.min(...history.map((row) => row.low)),
    averageVolume: volumes.length
      ? volumes.reduce((sum, value) => sum + value, 0) / volumes.length
      : null,
  };
}

export function historyCsv(history: HistoryPoint[]): string {
  return [
    'Date,Open,High,Low,Close,Volume,SMA 20,SMA 50,RSI 14',
    ...history.map((row) =>
      [
        row.date,
        row.open,
        row.high,
        row.low,
        row.close,
        row.volume,
        row.sma20,
        row.sma50,
        row.rsi,
      ]
        .map((value) => value ?? '')
        .join(','),
    ),
  ].join('\r\n');
}
