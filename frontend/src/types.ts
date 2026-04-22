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
  bollinger?: BollingerBands;
  stochastic?: StochasticOscillator;
  earnings?: EarningsData;
  technicals?: NasdaqTechnicals;
  news?: NasdaqNewsItem[];
}

export interface MACDIndicator {
  macd_line: number;
  signal_line: number;
  histogram: number;
}

export interface BollingerBands {
  upper_band: number;
  lower_band: number;
  middle_band: number;
  bandwidth: number;
}

export interface StochasticOscillator {
  k_line: number;
  d_line: number;
}

export interface EarningsData {
  earnings_date?: string;
  eps_estimate?: number;
  revenue_estimate?: number;
}

export interface InsiderTrade {
  insider_name: string;
  relation?: string;
  transaction_type: string;
  date?: string;
  shares_traded?: number;
  price?: number;
  shares_held?: number;
}

export interface SectorPerformance {
  sector: string;
  stock_count: number;
  avg_change_percent: number;
  avg_rsi: number;
  top_performers: StockAnalysis[];
  bottom_performers: StockAnalysis[];
}

export interface AggregatedNewsItem {
  symbol: string;
  sector?: string;
  title: string;
  url: string;
  publisher?: string;
  created?: string;
  ago?: string;
}

export interface CorrelationData {
  symbols: string[];
  matrix: number[][];
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

export interface CompanyProfile {
  // Asset Profile fields
  long_business_summary?: string;
  industry?: string;
  sector?: string;
  website?: string;
  full_time_employees?: number;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  // Financial Data fields
  current_price?: number;
  target_high_price?: number;
  target_low_price?: number;
  target_mean_price?: number;
  recommendation_key?: string;
  number_of_analyst_opinions?: number;
  total_revenue?: number;
  revenue_per_share?: number;
  profit_margins?: number;
  gross_margins?: number;
  operating_margins?: number;
  return_on_equity?: number;
  free_cash_flow?: number;
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
  min_stochastic_k?: number;
  max_stochastic_k?: number;
  min_bandwidth?: number;
  max_bandwidth?: number;
  /** Drop rows whose |price_change_percent| exceeds this. Server-side. */
  max_abs_price_change_percent?: number;
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

// Streaming AI Analysis Event Types
export type StreamEventType = 'status' | 'model_info' | 'content' | 'done' | 'error';

export interface StreamEventStatus {
  type: 'status';
  stage: string;
  message: string;
}

export interface StreamEventModelInfo {
  type: 'model_info';
  model: string;
}

export interface StreamEventContent {
  type: 'content';
  delta: string;
}

export interface StreamEventDone {
  type: 'done';
  symbol: string;
}

export interface StreamEventError {
  type: 'error';
  message: string;
}

export type StreamEvent =
  | StreamEventStatus
  | StreamEventModelInfo
  | StreamEventContent
  | StreamEventDone
  | StreamEventError;

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

// Index/Fund Heatmap Types
export interface IndexInfo {
  id: string;
  name: string;
  description: string;
  symbol_count: number;
}

export interface IndexHeatmapData {
  index_id: string;
  index_name: string;
  period: string;
  index_performance: number;
  generated_at: string;
  stocks: StockHeatmapItem[];
}

export interface StockHeatmapItem {
  symbol: string;
  name?: string;
  price: number;
  change_percent: number;
  contribution: number;
  market_cap?: number;
  sector?: string;
}

export interface IndexHeatmapResponse {
  success: boolean;
  heatmap?: IndexHeatmapData;
  stats?: {
    total_constituents: number;
    stocks_with_data: number;
    total_market_cap: number;
    period: string;
  };
  error?: string;
}

// Time period options for heatmap
export type HeatmapPeriod = '1d' | '1w' | '1m' | '6m' | '1y';

export const HEATMAP_PERIODS: { value: HeatmapPeriod; label: string }[] = [
  { value: '1d', label: '1 Day' },
  { value: '1w', label: '1 Week' },
  { value: '1m', label: '1 Month' },
  { value: '6m', label: '6 Months' },
  { value: '1y', label: '1 Year' },
];

// ---------------------------------------------------------------------------
// Notifications / alert engine
// ---------------------------------------------------------------------------

export interface DiscordChannelConfig {
  webhook_url: string;
  username?: string;
  avatar_url?: string;
}

/** Mirrors Rust `ChannelConfig` (tagged by `kind`). Flattened onto the parent. */
export type ChannelConfig = { kind: 'discord' } & DiscordChannelConfig;

export interface NotificationChannel {
  _id?: string;
  name: string;
  kind: 'discord';
  webhook_url: string;
  username?: string;
  avatar_url?: string;
  enabled: boolean;
  created_at: string;
}

export interface Watchlist {
  _id?: string;
  name: string;
  symbols: string[];
  created_at: string;
  updated_at: string;
}

/** Tagged union — one variant per `type`. Keep in sync with Rust `Condition`. */
export type Condition =
  | { type: 'rsi_below'; value: number }
  | { type: 'rsi_above'; value: number }
  | { type: 'price_below'; value: number }
  | { type: 'price_above'; value: number }
  | { type: 'price_change_pct_below'; value: number }
  | { type: 'price_change_pct_above'; value: number }
  | { type: 'near_52_week_low'; within_pct: number }
  | { type: 'near_52_week_high'; within_pct: number }
  | { type: 'macd_bullish_cross' }
  | { type: 'macd_bearish_cross' }
  | { type: 'stochastic_k_below'; value: number }
  | { type: 'stochastic_k_above'; value: number }
  | { type: 'bollinger_bandwidth_below'; value: number }
  | { type: 'is_oversold' }
  | { type: 'is_overbought' }
  | { type: 'volume_above'; value: number }
  | { type: 'sector_equals'; sector: string }
  | { type: 'drop_from_high_pct'; value: number };

export type ConditionType = Condition['type'];

export type ConditionGroup =
  | { op: 'and'; children: ConditionGroup[] }
  | { op: 'or'; children: ConditionGroup[] }
  | { op: 'not'; child: ConditionGroup }
  | { op: 'leaf'; condition: Condition };

export type AlertScope =
  | { type: 'all_watched' }
  | { type: 'watchlist'; watchlist_id: string }
  | { type: 'symbols'; symbols: string[] }
  | { type: 'all_analyzed' };

export interface QuietHours {
  start_hour: number;
  end_hour: number;
  tz?: string;
}

export interface AlertRule {
  _id?: string;
  name: string;
  enabled: boolean;
  scope: AlertScope;
  conditions: ConditionGroup;
  cooldown_minutes: number;
  quiet_hours?: QuietHours | null;
  channel_ids: string[];
  message_template?: string | null;
  require_consecutive: number;
  created_at: string;
  updated_at: string;
}

export interface DeliveryResult {
  channel_id: string;
  channel_name: string;
  ok: boolean;
  error?: string;
  sent_at: string;
}

export interface NotificationHistoryItem {
  _id?: string;
  rule_id: string;
  rule_name: string;
  symbol: string;
  matched_conditions: string[];
  message: string;
  channel_ids: string[];
  delivered: DeliveryResult[];
  snapshot: StockAnalysis;
  created_at: string;
  read: boolean;
}

/** Pretty labels for each leaf condition type — shared by the rule builder UI. */
export const CONDITION_LABELS: Record<ConditionType, string> = {
  rsi_below: 'RSI below',
  rsi_above: 'RSI above',
  price_below: 'Price below ($)',
  price_above: 'Price above ($)',
  price_change_pct_below: 'Day change % below',
  price_change_pct_above: 'Day change % above',
  near_52_week_low: 'Within % of 52-week low',
  near_52_week_high: 'Within % of 52-week high',
  macd_bullish_cross: 'MACD bullish cross',
  macd_bearish_cross: 'MACD bearish cross',
  stochastic_k_below: 'Stochastic %K below',
  stochastic_k_above: 'Stochastic %K above',
  bollinger_bandwidth_below: 'Bollinger bandwidth below',
  is_oversold: 'Is oversold (RSI < 30)',
  is_overbought: 'Is overbought (RSI > 70)',
  volume_above: 'Volume above',
  sector_equals: 'Sector equals',
  drop_from_high_pct: 'Down % from 52w high',
};

/** Construct a default value for a freshly-picked condition type. */
export function defaultCondition(type: ConditionType): Condition {
  switch (type) {
    case 'rsi_below': return { type, value: 30 };
    case 'rsi_above': return { type, value: 70 };
    case 'price_below': return { type, value: 100 };
    case 'price_above': return { type, value: 100 };
    case 'price_change_pct_below': return { type, value: -5 };
    case 'price_change_pct_above': return { type, value: 5 };
    case 'near_52_week_low': return { type, within_pct: 5 };
    case 'near_52_week_high': return { type, within_pct: 5 };
    case 'macd_bullish_cross': return { type };
    case 'macd_bearish_cross': return { type };
    case 'stochastic_k_below': return { type, value: 20 };
    case 'stochastic_k_above': return { type, value: 80 };
    case 'bollinger_bandwidth_below': return { type, value: 0.05 };
    case 'is_oversold': return { type };
    case 'is_overbought': return { type };
    case 'volume_above': return { type, value: 1_000_000 };
    case 'sector_equals': return { type, sector: 'Technology' };
    case 'drop_from_high_pct': return { type, value: 20 };
  }
}

