export interface StockAnalysis {
  id?: string;
  symbol: string;
  price: number;
  price_change?: number;
  price_change_percent?: number;
  rsi?: number;
  sma_20?: number;
  sma_50?: number;
  macd?: MACDIndicator;
  volume?: number;
  market_cap?: number;
  sector?: string;
  is_oversold: boolean;
  is_overbought: boolean;
  analyzed_at: string;
  technicals?: NasdaqTechnicals;
  news?: NasdaqNewsItem[];
}

export interface MACDIndicator {
  macd_line: number;
  signal_line: number;
  histogram: number;
}

export interface NasdaqTechnicals {
  exchange?: string;
  sector?: string;
  industry?: string;
  one_year_target?: number;
  todays_high?: number;
  todays_low?: number;
  share_volume?: number;
  average_volume?: number;
  previous_close?: number;
  fifty_two_week_high?: number;
  fifty_two_week_low?: number;
  pe_ratio?: number;
  forward_pe?: number;
  eps?: number;
  annualized_dividend?: number;
  ex_dividend_date?: string;
  dividend_pay_date?: string;
  current_yield?: number;
}

export interface NasdaqNewsItem {
  title: string;
  url: string;
  publisher?: string;
  created?: string;
  ago?: string;
}

export interface StockFilter {
  min_price?: number;
  max_price?: number;
  min_volume?: number;
  min_market_cap?: number;
  max_market_cap?: number;
  min_rsi?: number;
  max_rsi?: number;
  sectors?: string[];
  only_oversold?: boolean;
  only_overbought?: boolean;
  sort_by?: string;      // "market_cap", "price_change_percent", "rsi", "price"
  sort_order?: string;   // "asc" or "desc"
  page?: number;
  page_size?: number;
}

export interface PaginationInfo {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface MarketSummary {
  total_stocks: number;
  top_gainers: StockAnalysis[];
  top_losers: StockAnalysis[];
  most_oversold: StockAnalysis[];
  most_overbought: StockAnalysis[];
  mega_cap_highlights: StockAnalysis[];
  generated_at: string;
}

export interface AIAnalysisResponse {
  success: boolean;
  symbol?: string;
  analysis?: string;
  model_used?: string;
  generated_at?: string;
  stock_data?: {
    price: number;
    rsi?: number;
    sma_20?: number;
    sma_50?: number;
    is_oversold: boolean;
    is_overbought: boolean;
  };
  error?: string;
}

export interface AnalysisProgress {
  total_stocks: number;
  analyzed: number;
  current_symbol?: string;
  cycle_start: string;
  errors: number;
}

export interface SavedFilter {
  id: string;
  name: string;
  filter: StockFilter;
  createdAt: string;
}

export interface HistoricalDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Global settings for filtering across all views
export interface GlobalSettings {
  minMarketCap: number | null;  // In dollars (e.g., 1_000_000_000 for $1B)
  maxPriceChangePercent: number | null;  // Maximum allowed daily price change (e.g., 50 for 50%)
  preset: 'all' | 'quality' | 'large_cap' | 'custom';
}

// Preset configurations for quick settings
export const SETTINGS_PRESETS = {
  all: {
    minMarketCap: null,
    maxPriceChangePercent: null,
    preset: 'all' as const,
  },
  quality: {
    minMarketCap: 500_000_000, // $500M - filters out micro-caps but includes quality small caps
    maxPriceChangePercent: 25, // 25% - filters out extreme penny stock moves
    preset: 'quality' as const,
  },
  large_cap: {
    minMarketCap: 10_000_000_000, // $10B
    maxPriceChangePercent: 15, // 15% - more typical for large caps
    preset: 'large_cap' as const,
  },
};

// Default to 'quality' preset so home page shows recognizable stocks, not obscure penny stocks
export const DEFAULT_SETTINGS: GlobalSettings = SETTINGS_PRESETS.quality;

// Market cap tier thresholds for the settings UI
export const MARKET_CAP_TIERS = [
  { value: null, label: 'All Stocks', description: 'No minimum' },
  { value: 300_000_000, label: 'Small Cap+', description: '$300M+' },
  { value: 1_000_000_000, label: 'Mid Cap+', description: '$1B+' },
  { value: 2_000_000_000, label: 'Mid-Large Cap+', description: '$2B+' },
  { value: 10_000_000_000, label: 'Large Cap+', description: '$10B+' },
  { value: 50_000_000_000, label: 'Mega Cap+', description: '$50B+' },
  { value: 200_000_000_000, label: 'Ultra Cap+', description: '$200B+' },
];

// Market cap tier classification
export type MarketCapTier = 'mega' | 'large' | 'mid' | 'small' | 'micro';

export function getMarketCapTier(marketCap?: number): MarketCapTier {
  if (!marketCap) return 'micro';
  if (marketCap >= 200_000_000_000) return 'mega';  // $200B+
  if (marketCap >= 10_000_000_000) return 'large';   // $10B+
  if (marketCap >= 2_000_000_000) return 'mid';      // $2B+
  if (marketCap >= 300_000_000) return 'small';      // $300M+
  return 'micro';
}

export function getMarketCapTierLabel(tier: MarketCapTier): string {
  switch (tier) {
    case 'mega': return 'Mega Cap';
    case 'large': return 'Large Cap';
    case 'mid': return 'Mid Cap';
    case 'small': return 'Small Cap';
    case 'micro': return 'Micro Cap';
  }
}

export function getMarketCapTierColor(tier: MarketCapTier): string {
  switch (tier) {
    case 'mega': return 'purple';
    case 'large': return 'blue';
    case 'mid': return 'teal';
    case 'small': return 'orange';
    case 'micro': return 'gray';
  }
}
