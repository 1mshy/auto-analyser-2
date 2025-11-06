export interface StockAnalysis {
  id?: string;
  symbol: string;
  price: number;
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
}

export interface MACDIndicator {
  macd_line: number;
  signal_line: number;
  histogram: number;
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
