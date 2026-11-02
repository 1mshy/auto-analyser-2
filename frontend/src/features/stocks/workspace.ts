import type { GlobalSettings, StockFilter } from '../../types';

export const NUMERIC_FILTERS = {
  min_price: 'Price ≥',
  max_price: 'Price ≤',
  min_volume: 'Volume ≥',
  min_market_cap: 'Market cap ≥',
  max_market_cap: 'Market cap ≤',
  min_rsi: 'RSI ≥',
  max_rsi: 'RSI ≤',
  min_stochastic_k: 'Stoch %K ≥',
  max_stochastic_k: 'Stoch %K ≤',
  min_bandwidth: 'BB width ≥',
  max_bandwidth: 'BB width ≤',
  max_abs_price_change_percent: 'Absolute day change ≤',
} as const;
export type NumericFilter = keyof typeof NUMERIC_FILTERS;
export const SORT_OPTIONS = [
  { value: 'market_cap', label: 'Market cap' },
  { value: 'price_change_percent', label: 'Day change' },
  { value: 'rsi', label: 'RSI' },
  { value: 'price', label: 'Price' },
];
export const STOCK_COLUMNS = [
  { id: 'price', label: 'Price', sort: 'price' },
  { id: 'change', label: 'Day change', sort: 'price_change_percent' },
  { id: 'rsi', label: 'RSI (14)', sort: 'rsi' },
  { id: 'marketCap', label: 'Market cap', sort: 'market_cap' },
  { id: 'volume', label: 'Volume' },
  { id: 'stochastic', label: 'Stoch %K' },
  { id: 'bandwidth', label: 'BB width' },
  { id: 'sector', label: 'Sector' },
  { id: 'signals', label: 'Signals' },
] as const;
export type StockColumn = (typeof STOCK_COLUMNS)[number]['id'];
export interface WorkspacePreferences {
  columns: StockColumn[];
  density: 'comfortable' | 'compact';
  view: 'table' | 'card';
}
export interface SavedView {
  id: string;
  name: string;
  filter: StockFilter;
  preferences: WorkspacePreferences;
}
export const DEFAULT_PREFERENCES: WorkspacePreferences = {
  columns: ['price', 'change', 'rsi', 'marketCap', 'sector', 'signals'],
  density: 'comfortable',
  view: 'table',
};
export const SCREENER_PREFERENCES: WorkspacePreferences = {
  ...DEFAULT_PREFERENCES,
  columns: [
    'price',
    'change',
    'rsi',
    'stochastic',
    'bandwidth',
    'marketCap',
    'sector',
  ],
};

/** A single codec keeps links, saved views and server requests in agreement. */
export function parseStockFilter(params: URLSearchParams): StockFilter {
  const filter: StockFilter = {};
  for (const key of Object.keys(NUMERIC_FILTERS) as NumericFilter[]) {
    const raw = params.get(key);
    const value = raw?.trim() ? Number(raw) : NaN;
    if (Number.isFinite(value) && value >= 0) filter[key] = value;
  }
  for (const key of ['only_oversold', 'only_overbought'] as const) {
    if (params.get(key) === 'true') filter[key] = true;
  }
  const search = params.get('symbol_search')?.trim();
  if (search) filter.symbol_search = search;
  const sectors = params
    .getAll('sectors')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  if (sectors.length) filter.sectors = [...new Set(sectors)];
  filter.sort_by = SORT_OPTIONS.some(
    (option) => option.value === params.get('sort_by'),
  )
    ? params.get('sort_by')!
    : 'market_cap';
  filter.sort_order = params.get('sort_order') === 'asc' ? 'asc' : 'desc';
  const page = Number(params.get('page'));
  const pageSize = Number(params.get('page_size'));
  filter.page = Number.isSafeInteger(page) && page > 0 ? page : 1;
  filter.page_size = [25, 50, 100].includes(pageSize) ? pageSize : 50;
  return filter;
}

export function stockFilterParams(filter: StockFilter): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== false &&
      value !== ''
    ) {
      if (Array.isArray(value))
        value.forEach((item) => params.append(key, item));
      else params.set(key, String(value));
    }
  }
  return params;
}

export function applyGlobalFilters(
  filter: StockFilter,
  settings: GlobalSettings,
): StockFilter {
  return {
    ...filter,
    min_market_cap:
      settings.minMarketCap == null
        ? filter.min_market_cap
        : Math.max(filter.min_market_cap ?? 0, settings.minMarketCap),
    max_abs_price_change_percent:
      settings.maxPriceChangePercent == null
        ? filter.max_abs_price_change_percent
        : Math.min(
            filter.max_abs_price_change_percent ?? Infinity,
            settings.maxPriceChangePercent,
          ),
  };
}

export function activeFilterChips(
  filter: StockFilter,
): { key: keyof StockFilter; label: string }[] {
  const chips: { key: keyof StockFilter; label: string }[] = [];
  for (const key of Object.keys(NUMERIC_FILTERS) as NumericFilter[]) {
    const value = filter[key];
    if (value != null) {
      const formatted = new Intl.NumberFormat('en-US', {
        notation: value >= 100_000 ? 'compact' : 'standard',
        maximumFractionDigits: 4,
      }).format(value);
      chips.push({
        key,
        label: `${NUMERIC_FILTERS[key]} ${(key.includes('price') && !key.includes('percent')) || key.includes('market_cap') ? '$' : ''}${formatted}${key.includes('percent') ? '%' : ''}`,
      });
    }
  }
  if (filter.symbol_search)
    chips.push({
      key: 'symbol_search',
      label: `Symbol: ${filter.symbol_search}`,
    });
  if (filter.sectors?.length)
    chips.push({
      key: 'sectors',
      label: `Sector: ${filter.sectors.join(', ')}`,
    });
  if (filter.only_oversold)
    chips.push({ key: 'only_oversold', label: 'Oversold · RSI < 30' });
  if (filter.only_overbought)
    chips.push({ key: 'only_overbought', label: 'Overbought · RSI > 70' });
  return chips;
}

export function validateFilter(filter: StockFilter): string | undefined {
  const pairs = [
    ['min_price', 'max_price', 'price'],
    ['min_market_cap', 'max_market_cap', 'market cap'],
    ['min_rsi', 'max_rsi', 'RSI'],
    ['min_stochastic_k', 'max_stochastic_k', 'stochastic'],
    ['min_bandwidth', 'max_bandwidth', 'bandwidth'],
  ] as const;
  for (const [min, max, label] of pairs) {
    if (
      filter[min] != null &&
      filter[max] != null &&
      filter[min]! > filter[max]!
    )
      return `Minimum ${label} must be lower than or equal to the maximum.`;
  }
  for (const key of Object.keys(NUMERIC_FILTERS) as NumericFilter[]) {
    if (
      filter[key] != null &&
      (!Number.isFinite(filter[key]) || filter[key]! < 0)
    )
      return 'Enter a valid, non-negative number.';
  }
  if (
    ['min_rsi', 'max_rsi', 'min_stochastic_k', 'max_stochastic_k'].some(
      (key) => (filter[key as NumericFilter] ?? 0) > 100,
    )
  )
    return 'RSI and stochastic values must be between 0 and 100.';
  if (filter.only_oversold && filter.only_overbought)
    return 'Choose either oversold or overbought.';
  return undefined;
}

export function sanitizePreferences(
  value: unknown,
  defaults = DEFAULT_PREFERENCES,
): WorkspacePreferences {
  if (!value || typeof value !== 'object')
    return { ...defaults, columns: [...defaults.columns] };
  const input = value as Partial<WorkspacePreferences>;
  const columns = Array.isArray(input.columns)
    ? [
        ...new Set(
          input.columns.filter((id) =>
            STOCK_COLUMNS.some((column) => column.id === id),
          ),
        ),
      ]
    : defaults.columns;
  return {
    columns: columns.length ? columns : [...defaults.columns],
    density: input.density === 'compact' ? 'compact' : 'comfortable',
    view: input.view === 'card' ? 'card' : 'table',
  };
}

export function decodeSavedViews(
  raw: string | null,
  defaults = DEFAULT_PREFERENCES,
): SavedView[] {
  try {
    const data: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (item): item is SavedView =>
          item &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          item.name.trim() &&
          item.filter &&
          typeof item.filter === 'object' &&
          !Array.isArray(item.filter),
      )
      .map((item) => ({
        id: item.id,
        name: item.name.slice(0, 80),
        filter: {
          ...parseStockFilter(stockFilterParams(item.filter)),
          page: 1,
        },
        preferences: sanitizePreferences(item.preferences, defaults),
      }));
  } catch {
    return [];
  }
}
