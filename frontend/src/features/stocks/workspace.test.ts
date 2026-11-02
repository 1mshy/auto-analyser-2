import { describe, expect, it } from 'vitest';
import {
  activeFilterChips,
  applyGlobalFilters,
  decodeSavedViews,
  DEFAULT_PREFERENCES,
  parseStockFilter,
  sanitizePreferences,
  stockFilterParams,
  validateFilter,
} from './workspace';
import type { StockFilter } from '../../types';

describe('stock workspace filters', () => {
  it('round trips all supported criteria and search pagination through shareable URLs', () => {
    const filter: StockFilter = {
      min_price: 2.5,
      max_price: 100,
      min_volume: 2e6,
      min_market_cap: 1e9,
      max_market_cap: 1e12,
      min_rsi: 0,
      max_rsi: 30,
      min_stochastic_k: 0,
      max_stochastic_k: 20,
      min_bandwidth: 0,
      max_bandwidth: 0.1,
      max_abs_price_change_percent: 10,
      sectors: ['Technology', 'Consumer Cyclical'],
      only_oversold: true,
      symbol_search: 'BRK.B',
      sort_by: 'rsi',
      sort_order: 'asc',
      page: 3,
      page_size: 25,
    };
    expect(parseStockFilter(stockFilterParams(filter))).toEqual(filter);
  });
  it('rejects malformed numeric and ordering URL inputs', () => {
    expect(
      parseStockFilter(
        new URLSearchParams(
          'page=-1&page_size=99999&min_price=NaN&min_volume=-2&max_rsi=20oops&min_bandwidth=Infinity&sort_by=bad&sort_order=bad',
        ),
      ),
    ).toEqual({
      page: 1,
      page_size: 50,
      sort_by: 'market_cap',
      sort_order: 'desc',
    });
  });
  it('keeps global floors and ceilings while allowing stricter page filters', () => {
    const settings = {
      preset: 'quality' as const,
      minMarketCap: 5e8,
      maxPriceChangePercent: 25,
    };
    expect(
      applyGlobalFilters(
        { min_market_cap: 1e8, max_abs_price_change_percent: 50 },
        settings,
      ),
    ).toMatchObject({ min_market_cap: 5e8, max_abs_price_change_percent: 25 });
    expect(
      applyGlobalFilters(
        { min_market_cap: 1e9, max_abs_price_change_percent: 10 },
        settings,
      ),
    ).toMatchObject({ min_market_cap: 1e9, max_abs_price_change_percent: 10 });
  });
  it('exposes removable criteria without counting ordering or pagination', () => {
    expect(
      activeFilterChips({
        min_rsi: 0,
        only_oversold: true,
        sort_by: 'rsi',
        page: 4,
      }).map((chip) => chip.key),
    ).toEqual(['min_rsi', 'only_oversold']);
  });
  it('prevents invalid ranges and contradictory signals', () => {
    expect(validateFilter({ min_rsi: 70, max_rsi: 20 })).toMatch(/Minimum RSI/);
    expect(validateFilter({ min_stochastic_k: 101 })).toMatch(
      /between 0 and 100/,
    );
    expect(validateFilter({ min_price: NaN })).toMatch(/valid/);
    expect(
      validateFilter({ only_oversold: true, only_overbought: true }),
    ).toMatch(/either/);
    expect(validateFilter({ min_rsi: 0, max_rsi: 0 })).toBeUndefined();
  });
});

describe('saved views and layout recovery', () => {
  it('recovers older saved filters without discarding their criteria', () => {
    expect(
      decodeSavedViews(
        JSON.stringify([
          { id: 'legacy', name: 'Low RSI', filter: { max_rsi: 30, page: 9 } },
        ]),
      ),
    ).toEqual([
      {
        id: 'legacy',
        name: 'Low RSI',
        filter: {
          max_rsi: 30,
          page: 1,
          page_size: 50,
          sort_by: 'market_cap',
          sort_order: 'desc',
        },
        preferences: DEFAULT_PREFERENCES,
      },
    ]);
  });
  it('isolates malformed saved entries and restores a usable layout', () => {
    expect(decodeSavedViews('{broken')).toEqual([]);
    expect(decodeSavedViews('{"wrong":true}')).toEqual([]);
    expect(
      decodeSavedViews(
        JSON.stringify([
          null,
          { id: 'no filter', name: 'Bad' },
          {
            id: 'ok',
            name: 'Valid',
            filter: {},
            preferences: { columns: ['unknown'], density: 'nonsense' },
          },
        ]),
      ),
    ).toHaveLength(1);
    expect(
      sanitizePreferences({
        columns: ['price', 'price', 'obsolete'],
        density: 'compact',
        view: 'card',
      }),
    ).toEqual({ columns: ['price'], density: 'compact', view: 'card' });
    expect(sanitizePreferences({ columns: [] }).columns).toEqual(
      DEFAULT_PREFERENCES.columns,
    );
  });
});
