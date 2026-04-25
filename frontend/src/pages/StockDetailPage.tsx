import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Box,
  Container,
  Heading,
  Text,
  SimpleGrid,
  Card,
  Flex,
  Badge,
  Spinner,
  HStack,
  VStack,
  Button,
  Separator,
} from '@chakra-ui/react';
import { ArrowLeft, TrendingUp, TrendingDown, Zap, RefreshCw, ExternalLink } from 'lucide-react';
import { api } from '../api';
import MarkdownContent from '../components/MarkdownContent';
import {
  StockAnalysis,
  AIAnalysisResponse,
  CompanyProfile,
  InsiderTrade,
  EarningsData,
  getMarketCapTier,
  getMarketCapTierColor,
  getMarketCapTierLabel
} from '../types';
import { WatchButton } from '../components/alerts/WatchButton';
import { Surface, Num, SignalBadge } from '../components/ui/primitives';

const TradingViewWidget: React.FC<{ symbol: string }> = ({ symbol }) => {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      "autosize": true,
      "symbol": symbol,
      "interval": "D",
      "timezone": "Etc/UTC",
      "theme": "dark",
      "style": "1",
      "locale": "en",
      "enable_publishing": false,
      "hide_top_toolbar": false,
      "hide_legend": false,
      "save_image": false,
      "calendar": false,
      "support_host": "https://www.tradingview.com"
    });

    const container = document.getElementById('tradingview-widget');
    if (container) {
      container.innerHTML = '';
      const widgetContainer = document.createElement('div');
      widgetContainer.className = 'tradingview-widget-container__widget';
      widgetContainer.style.height = '100%';
      widgetContainer.style.width = '100%';
      container.appendChild(widgetContainer);
      widgetContainer.appendChild(script);
    }

    return () => {
      const container = document.getElementById('tradingview-widget');
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [symbol]);

  return (
    <Box id="tradingview-widget" h="500px" w="100%" bg="bg.inset" borderWidth="1px" borderColor="border.subtle" borderRadius="md" />
  );
};

const StatCard: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color }) => (
  <Surface p={4} variant="raised">
    <Text color="fg.muted" fontSize="xs" mb={1} textTransform="uppercase" letterSpacing="wider">{label}</Text>
    <Text className="num" data-num="" color={color || 'fg.default'} fontSize="xl" fontWeight="semibold">{value}</Text>
  </Surface>
);

export const StockDetailPage: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const [stock, setStock] = useState<StockAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'about' | 'technicals' | 'chart' | 'ai' | 'news' | 'insiders'>('overview');
  const [insiderTrades, setInsiderTrades] = useState<InsiderTrade[]>([]);
  const [insidersLoading, setInsidersLoading] = useState(false);
  const [stockEarnings, setStockEarnings] = useState<EarningsData | null>(null);

  // Streaming AI state
  const [streamingText, setStreamingText] = useState('');
  const [streamingStatus, setStreamingStatus] = useState<{ stage: string; message: string } | null>(null);
  const [streamingModel, setStreamingModel] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  const fetchStock = useCallback(async () => {
    if (!symbol) return;

    try {
      setLoading(true);
      setStock(null);

      // Fetch stock data directly by symbol
      const result = await api.getStock(symbol.toUpperCase());
      if (result.stock) {
        setStock(result.stock);
      }

    } catch (err) {
      console.error('Failed to fetch stock:', err);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  const checkAIStatus = useCallback(async () => {
    try {
      const status = await api.getAIStatus();
      setAiEnabled(status.enabled);
    } catch (err) {
      console.error('Failed to check AI status:', err);
    }
  }, []);

  const fetchAIAnalysis = useCallback(async () => {
    if (!symbol) return;

    // Cleanup any existing stream
    if (streamCleanupRef.current) {
      streamCleanupRef.current();
    }

    // Reset streaming state
    setStreamingText('');
    setStreamingStatus(null);
    setStreamingModel(null);
    setIsStreaming(true);
    setAiLoading(true);
    setAiAnalysis(null);

    // Start streaming
    const cleanup = api.streamAIAnalysis(symbol, {
      onStatus: (stage, message) => {
        setStreamingStatus({ stage, message });
      },
      onModelInfo: (model) => {
        setStreamingModel(model);
      },
      onContent: (delta) => {
        setStreamingText(prev => prev + delta);
      },
      onDone: (doneSymbol) => {
        setIsStreaming(false);
        setAiLoading(false);
        setStreamingStatus(null);
        // Convert streaming result to AIAnalysisResponse format
        setAiAnalysis({
          success: true,
          symbol: doneSymbol,
          analysis: undefined, // Will use streamingText instead
          model_used: streamingModel || undefined,
          generated_at: new Date().toISOString(),
        });
      },
      onError: (message) => {
        setIsStreaming(false);
        setAiLoading(false);
        setStreamingStatus(null);
        setAiAnalysis({ success: false, error: message });
      },
    });

    streamCleanupRef.current = cleanup;
  }, [symbol, streamingModel]);

  const fetchCompanyProfile = useCallback(async () => {
    if (!symbol) return;

    setProfileLoading(true);
    try {
      const profile = await api.getCompanyProfile(symbol);
      setCompanyProfile(profile);
    } catch (err) {
      console.error('Failed to fetch company profile:', err);
    } finally {
      setProfileLoading(false);
    }
  }, [symbol]);

  const fetchInsiderTrades = useCallback(async () => {
    if (!symbol) return;
    setInsidersLoading(true);
    try {
      const trades = await api.getInsiderTrades(symbol);
      setInsiderTrades(trades);
    } catch (err) {
      console.error('Failed to fetch insider trades:', err);
    } finally {
      setInsidersLoading(false);
    }
  }, [symbol]);

  const fetchEarnings = useCallback(async () => {
    if (!symbol) return;
    try {
      const earnings = await api.getStockEarnings(symbol);
      setStockEarnings(earnings);
    } catch (err) {
      console.error('Failed to fetch earnings:', err);
    }
  }, [symbol]);

  useEffect(() => {
    fetchStock();
    checkAIStatus();
    fetchCompanyProfile();
    fetchEarnings();
  }, [fetchStock, checkAIStatus, fetchCompanyProfile, fetchEarnings]);

  // Auto-trigger AI analysis when enabled
  useEffect(() => {
    if (aiEnabled && stock && !aiAnalysis && !aiLoading && !streamingText) {
      fetchAIAnalysis();
    }
  }, [aiEnabled, stock, aiAnalysis, aiLoading, streamingText, fetchAIAnalysis]);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (streamCleanupRef.current) {
        streamCleanupRef.current();
      }
    };
  }, []);

  if (loading) {
    return (
      <Container maxW="page" py={{ base: 5, md: 8 }}>
        <Flex justify="center" align="center" minH="50vh">
          <Spinner size="xl" color="accent.solid" />
        </Flex>
      </Container>
    );
  }

  if (!stock) {
    return (
      <Container maxW="page" py={{ base: 5, md: 8 }}>
        <VStack py={12}>
          <Heading color="fg.subtle">Stock Not Found</Heading>
          <Text color="fg.subtle" textAlign="center" maxW="md">
            The symbol "{symbol}" was not found in our database.
            This may happen if:
          </Text>
          <VStack align="start" color="fg.subtle" fontSize="sm" mt={2}>
            <Text>• The stock hasn't been analyzed yet (check progress)</Text>
            <Text>• Yahoo Finance doesn't have data for this symbol</Text>
            <Text>• It's a warrant, unit, or special security type</Text>
          </VStack>
          <Link to="/stocks">
            <Button colorPalette="blue" mt={4}>
              <ArrowLeft size={16} /> Back to Stocks
            </Button>
          </Link>
        </VStack>
      </Container>
    );
  }

  const tier = getMarketCapTier(stock.market_cap);
  const tierColor = getMarketCapTierColor(tier);
  const isPositive = (stock.price_change_percent ?? 0) >= 0;
  const rsiIntent = stock.rsi && stock.rsi < 30 ? 'up' : stock.rsi && stock.rsi > 70 ? 'down' : 'neutral';
  const displaySector = companyProfile?.sector || stock.sector || 'Unknown Sector';

  return (
    <Container maxW="page" py={{ base: 5, md: 8 }}>
      <Link to="/stocks">
        <Button variant="ghost" mb={4} size="sm">
          <ArrowLeft size={16} /> Back to Stocks
        </Button>
      </Link>

      <Surface p={{ base: 4, md: 5 }} mb={4} variant="raised">
        <Flex justify="space-between" align={{ base: 'stretch', md: 'start' }} direction={{ base: 'column', md: 'row' }} gap={5}>
          <VStack align="start" gap={3}>
            <HStack wrap="wrap">
              <Badge colorPalette={tierColor} size="md" variant="subtle">{getMarketCapTierLabel(tier)}</Badge>
              <SignalBadge tone="info" size="md">{displaySector}</SignalBadge>
              {stock.is_oversold && <SignalBadge tone="up" size="md">Oversold</SignalBadge>}
              {stock.is_overbought && <SignalBadge tone="down" size="md">Overbought</SignalBadge>}
            </HStack>
            <HStack align="center">
              <Heading size="2xl" color="fg.default" letterSpacing="tight">{stock.symbol}</Heading>
              <WatchButton symbol={stock.symbol} size="md" />
            </HStack>
            <Text color="fg.muted" maxW="2xl">
              {companyProfile?.long_business_summary
                ? companyProfile.long_business_summary.slice(0, 180) + (companyProfile.long_business_summary.length > 180 ? '...' : '')
                : 'Real-time technical profile, company context, charting, news, AI analysis, and insider activity.'}
            </Text>
          </VStack>

          <VStack align={{ base: 'start', md: 'end' }} gap={1}>
            <Num value={stock.price} prefix="$" fontSize={{ base: '3xl', md: '4xl' }} fontWeight="semibold" color="fg.default" lineHeight="1" />
            <HStack>
              <Box color={isPositive ? 'signal.up.fg' : 'signal.down.fg'}>
                {isPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              </Box>
              <Num
                value={stock.price_change}
                intent="auto"
                sign="always"
                prefix="$"
                fontSize="md"
                fontWeight="semibold"
              />
              <Num
                value={stock.price_change_percent}
                intent="auto"
                sign="always"
                prefix="("
                suffix="%)"
                fontSize="md"
                fontWeight="semibold"
              />
            </HStack>
            <Text color="fg.subtle" fontSize="xs" className="num" data-num="">
              Updated {new Date(stock.analyzed_at).toLocaleString()}
            </Text>
          </VStack>
        </Flex>
      </Surface>

      {/* Tab Buttons */}
      <Surface p={2} mb={5} overflowX="auto" variant="inset">
      <HStack gap={2} wrap="nowrap" minW="max-content">
        <Button
          size="sm"
          variant={activeTab === 'overview' ? 'solid' : 'ghost'}
          colorPalette={activeTab === 'overview' ? 'blue' : 'gray'}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'about' ? 'solid' : 'ghost'}
          colorPalette={activeTab === 'about' ? 'blue' : 'gray'}
          onClick={() => setActiveTab('about')}
        >
          About
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'technicals' ? 'solid' : 'ghost'}
          colorPalette={activeTab === 'technicals' ? 'blue' : 'gray'}
          onClick={() => setActiveTab('technicals')}
        >
          Technical Analysis
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'chart' ? 'solid' : 'ghost'}
          colorPalette={activeTab === 'chart' ? 'blue' : 'gray'}
          onClick={() => setActiveTab('chart')}
        >
          Chart
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'ai' ? 'solid' : 'ghost'}
          colorPalette={activeTab === 'ai' ? 'blue' : 'gray'}
          onClick={() => setActiveTab('ai')}
        >
          <Zap size={14} /> AI Analysis
        </Button>
        {stock.news && stock.news.length > 0 && (
          <Button
            size="sm"
            variant={activeTab === 'news' ? 'solid' : 'ghost'}
            colorPalette={activeTab === 'news' ? 'blue' : 'gray'}
            onClick={() => setActiveTab('news')}
          >
            News ({stock.news.length})
          </Button>
        )}
        <Button
          size="sm"
          variant={activeTab === 'insiders' ? 'solid' : 'ghost'}
          colorPalette={activeTab === 'insiders' ? 'blue' : 'gray'}
          onClick={() => { setActiveTab('insiders'); if (insiderTrades.length === 0 && !insidersLoading) fetchInsiderTrades(); }}
        >
          Insider Trades
        </Button>
      </HStack>
      </Surface>

      {/* Earnings Card (shown on overview) */}
      {activeTab === 'overview' && stockEarnings && stockEarnings.earnings_date && (
        <Surface mb={4} p={4}>
          <Flex align="center" gap={6} wrap="wrap">
            <Box>
              <Text color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider">Upcoming Earnings</Text>
              <Text color="signal.warn.fg" fontWeight="semibold" className="num" data-num="">
                {new Date(stockEarnings.earnings_date).toLocaleDateString()}
                {' '}
                ({Math.ceil((new Date(stockEarnings.earnings_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days)
              </Text>
            </Box>
            {stockEarnings.eps_estimate != null && (
              <Box>
                <Text color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider">EPS Estimate</Text>
                <Num value={stockEarnings.eps_estimate} prefix="$" fontWeight="semibold" />
              </Box>
            )}
            {stockEarnings.revenue_estimate != null && (
              <Box>
                <Text color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider">Revenue Estimate</Text>
                <Num value={stockEarnings.revenue_estimate} prefix="$" compact fontWeight="semibold" />
              </Box>
            )}
          </Flex>
        </Surface>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          <SimpleGrid columns={{ base: 2, md: 4 }} gap={3} mb={4}>
            <StatCard
              label="RSI (14)"
              value={stock.rsi != null && typeof stock.rsi === 'number' ? stock.rsi.toFixed(1) : '-'}
              color={rsiIntent === 'up' ? 'signal.up.fg' : rsiIntent === 'down' ? 'signal.down.fg' : 'fg.default'}
            />
            <StatCard label="SMA 20" value={stock.sma_20 != null && typeof stock.sma_20 === 'number' ? `$${stock.sma_20.toFixed(2)}` : '-'} />
            <StatCard label="SMA 50" value={stock.sma_50 != null && typeof stock.sma_50 === 'number' ? `$${stock.sma_50.toFixed(2)}` : '-'} />
            <StatCard
              label="MACD"
              value={stock.macd ? (stock.macd.histogram > 0 ? 'Bullish' : 'Bearish') : '-'}
              color={stock.macd?.histogram != null && stock.macd.histogram > 0 ? 'signal.up.fg' : 'signal.down.fg'}
            />
          </SimpleGrid>

          <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
            <StatCard label="Market Cap" value={stock.market_cap != null && typeof stock.market_cap === 'number' ? `$${(stock.market_cap / 1_000_000_000).toFixed(1)}B` : '-'} />
            <StatCard label="Volume" value={stock.volume != null && typeof stock.volume === 'number' ? `${(stock.volume / 1_000_000).toFixed(1)}M` : '-'} />
            {stock.technicals?.pe_ratio != null && typeof stock.technicals.pe_ratio === 'number' && (
              <StatCard label="P/E Ratio" value={stock.technicals.pe_ratio.toFixed(2)} />
            )}
            {stock.technicals?.eps != null && typeof stock.technicals.eps === 'number' && (
              <StatCard label="EPS" value={`$${stock.technicals.eps.toFixed(2)}`} />
            )}
          </SimpleGrid>
        </>
      )}

      {/* About Tab */}
      {activeTab === 'about' && (
        <Card.Root bg="bg.surface" borderColor="border.default" borderRadius="lg" boxShadow="elevation.raised">
          <Card.Header>
            <Heading size="md" color="fg.default">About {stock.symbol}</Heading>
          </Card.Header>
          <Card.Body>
            {profileLoading ? (
              <Flex justify="center" py={8}>
                <Spinner size="lg" color="accent.solid" />
                <Text ml={3} color="fg.muted">Loading company info...</Text>
              </Flex>
            ) : companyProfile ? (
              <VStack align="start" gap={4}>
                {/* Analyst Recommendation Badge */}
                {companyProfile.recommendation_key && (
                  <Flex align="center" gap={3}>
                    <Badge
                      size="lg"
                      colorPalette={
                        companyProfile.recommendation_key === 'strong_buy' || companyProfile.recommendation_key === 'buy' ? 'green' :
                          companyProfile.recommendation_key === 'hold' ? 'yellow' :
                            companyProfile.recommendation_key === 'sell' || companyProfile.recommendation_key === 'strong_sell' ? 'red' : 'gray'
                      }
                      px={3}
                      py={1}
                      fontSize="md"
                    >
                      {companyProfile.recommendation_key.replace('_', ' ').toUpperCase()}
                    </Badge>
                    {companyProfile.number_of_analyst_opinions && (
                      <Text color="fg.muted" fontSize="sm">
                        Based on {companyProfile.number_of_analyst_opinions} analyst{companyProfile.number_of_analyst_opinions > 1 ? 's' : ''}
                      </Text>
                    )}
                  </Flex>
                )}

                {/* Price Targets Section */}
                {(companyProfile.target_mean_price || companyProfile.target_high_price || companyProfile.target_low_price) && (
                  <Box w="100%" p={4} bg="bg.inset" borderWidth="1px" borderColor="border.subtle" borderRadius="md">
                    <Text color="fg.muted" fontSize="sm" mb={3}>Analyst Price Targets</Text>
                    <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
                      {companyProfile.current_price && (
                        <Box>
                          <Text color="fg.subtle" fontSize="xs">Current</Text>
                          <Text color="fg.default" fontSize="lg" fontWeight="bold">
                            ${companyProfile.current_price.toFixed(2)}
                          </Text>
                        </Box>
                      )}
                      {companyProfile.target_low_price && (
                        <Box>
                          <Text color="fg.subtle" fontSize="xs">Target Low</Text>
                          <Text color="signal.down.fg" fontSize="lg" fontWeight="bold">
                            ${companyProfile.target_low_price.toFixed(2)}
                          </Text>
                        </Box>
                      )}
                      {companyProfile.target_mean_price && (
                        <Box>
                          <Text color="fg.subtle" fontSize="xs">Target Mean</Text>
                          <Text color="accent.fg" fontSize="lg" fontWeight="bold">
                            ${companyProfile.target_mean_price.toFixed(2)}
                            {companyProfile.current_price && (
                              <Text as="span" fontSize="sm" ml={2} color={companyProfile.target_mean_price > companyProfile.current_price ? 'signal.up.fg' : 'signal.down.fg'}>
                                ({companyProfile.target_mean_price > companyProfile.current_price ? '+' : ''}
                                {(((companyProfile.target_mean_price - companyProfile.current_price) / companyProfile.current_price) * 100).toFixed(1)}%)
                              </Text>
                            )}
                          </Text>
                        </Box>
                      )}
                      {companyProfile.target_high_price && (
                        <Box>
                          <Text color="fg.subtle" fontSize="xs">Target High</Text>
                          <Text color="signal.up.fg" fontSize="lg" fontWeight="bold">
                            ${companyProfile.target_high_price.toFixed(2)}
                          </Text>
                        </Box>
                      )}
                    </SimpleGrid>
                  </Box>
                )}

                {/* Business Description */}
                {companyProfile.long_business_summary && (
                  <Box>
                    <Text color="fg.muted" fontSize="sm" mb={2}>Description</Text>
                    <Text color="fg.default" lineHeight="tall">
                      {companyProfile.long_business_summary}
                    </Text>
                  </Box>
                )}

                <Separator />

                {/* Financial Metrics Grid */}
                {(companyProfile.profit_margins || companyProfile.gross_margins || companyProfile.return_on_equity || companyProfile.total_revenue) && (
                  <>
                    <Text color="fg.muted" fontSize="sm">Financial Metrics</Text>
                    <SimpleGrid columns={{ base: 2, md: 4 }} gap={4} w="100%">
                      {companyProfile.profit_margins != null && (
                        <Box p={3} bg="bg.inset" borderWidth="1px" borderColor="border.subtle" borderRadius="md">
                          <Text color="fg.subtle" fontSize="xs">Profit Margin</Text>
                          <Text color={companyProfile.profit_margins > 0 ? 'signal.up.fg' : 'signal.down.fg'} fontSize="lg" fontWeight="bold">
                            {(companyProfile.profit_margins * 100).toFixed(1)}%
                          </Text>
                        </Box>
                      )}
                      {companyProfile.gross_margins != null && (
                        <Box p={3} bg="bg.inset" borderWidth="1px" borderColor="border.subtle" borderRadius="md">
                          <Text color="fg.subtle" fontSize="xs">Gross Margin</Text>
                          <Text color="fg.default" fontSize="lg" fontWeight="bold">
                            {(companyProfile.gross_margins * 100).toFixed(1)}%
                          </Text>
                        </Box>
                      )}
                      {companyProfile.operating_margins != null && (
                        <Box p={3} bg="bg.inset" borderWidth="1px" borderColor="border.subtle" borderRadius="md">
                          <Text color="fg.subtle" fontSize="xs">Operating Margin</Text>
                          <Text color={companyProfile.operating_margins > 0 ? 'signal.up.fg' : 'signal.down.fg'} fontSize="lg" fontWeight="bold">
                            {(companyProfile.operating_margins * 100).toFixed(1)}%
                          </Text>
                        </Box>
                      )}
                      {companyProfile.return_on_equity != null && (
                        <Box p={3} bg="bg.inset" borderWidth="1px" borderColor="border.subtle" borderRadius="md">
                          <Text color="fg.subtle" fontSize="xs">Return on Equity</Text>
                          <Text color={companyProfile.return_on_equity > 0 ? 'signal.up.fg' : 'signal.down.fg'} fontSize="lg" fontWeight="bold">
                            {(companyProfile.return_on_equity * 100).toFixed(1)}%
                          </Text>
                        </Box>
                      )}
                      {companyProfile.total_revenue != null && (
                        <Box p={3} bg="bg.inset" borderWidth="1px" borderColor="border.subtle" borderRadius="md">
                          <Text color="fg.subtle" fontSize="xs">Total Revenue</Text>
                          <Text color="fg.default" fontSize="lg" fontWeight="bold">
                            ${(companyProfile.total_revenue / 1_000_000_000).toFixed(1)}B
                          </Text>
                        </Box>
                      )}
                      {companyProfile.revenue_per_share != null && (
                        <Box p={3} bg="bg.inset" borderWidth="1px" borderColor="border.subtle" borderRadius="md">
                          <Text color="fg.subtle" fontSize="xs">Revenue/Share</Text>
                          <Text color="fg.default" fontSize="lg" fontWeight="bold">
                            ${companyProfile.revenue_per_share.toFixed(2)}
                          </Text>
                        </Box>
                      )}
                      {companyProfile.free_cash_flow != null && (
                        <Box p={3} bg="bg.inset" borderWidth="1px" borderColor="border.subtle" borderRadius="md">
                          <Text color="fg.subtle" fontSize="xs">Free Cash Flow</Text>
                          <Text color={companyProfile.free_cash_flow > 0 ? 'signal.up.fg' : 'signal.down.fg'} fontSize="lg" fontWeight="bold">
                            ${companyProfile.free_cash_flow > 0 ? '' : '-'}
                            {(Math.abs(companyProfile.free_cash_flow) / 1_000_000_000).toFixed(1)}B
                          </Text>
                        </Box>
                      )}
                    </SimpleGrid>
                    <Separator />
                  </>
                )}

                {/* Key Info Grid */}
                <SimpleGrid columns={{ base: 1, md: 2 }} gap={4} w="100%">
                  {(companyProfile.industry || companyProfile.sector) && (
                    <Box>
                      <Text color="fg.muted" fontSize="sm">Industry / Sector</Text>
                      <HStack mt={1}>
                        {companyProfile.industry && (
                          <Badge colorPalette="blue">{companyProfile.industry}</Badge>
                        )}
                        {companyProfile.sector && (
                          <Badge colorPalette="purple">{companyProfile.sector}</Badge>
                        )}
                      </HStack>
                    </Box>
                  )}

                  {companyProfile.website && (
                    <Box>
                      <Text color="fg.muted" fontSize="sm">Website</Text>
                      <a
                        href={companyProfile.website}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <HStack color="accent.fg" _hover={{ color: 'accent.solid' }} mt={1}>
                          <Text>{companyProfile.website.replace(/^https?:\/\//, '')}</Text>
                          <ExternalLink size={14} />
                        </HStack>
                      </a>
                    </Box>
                  )}

                  {companyProfile.full_time_employees && (
                    <Box>
                      <Text color="fg.muted" fontSize="sm">Employees</Text>
                      <Text color="fg.default" fontWeight="semibold" mt={1}>
                        {companyProfile.full_time_employees.toLocaleString()}
                      </Text>
                    </Box>
                  )}

                  {(companyProfile.city || companyProfile.state || companyProfile.country) && (
                    <Box>
                      <Text color="fg.muted" fontSize="sm">Headquarters</Text>
                      <Text color="fg.default" mt={1}>
                        {[companyProfile.city, companyProfile.state, companyProfile.country]
                          .filter(Boolean)
                          .join(', ')}
                      </Text>
                    </Box>
                  )}

                  {companyProfile.phone && (
                    <Box>
                      <Text color="fg.muted" fontSize="sm">Phone</Text>
                      <Text color="fg.default" mt={1}>{companyProfile.phone}</Text>
                    </Box>
                  )}
                </SimpleGrid>
              </VStack>
            ) : (
              <Text color="fg.subtle">
                Company profile information is not available for this stock.
              </Text>
            )}
          </Card.Body>
        </Card.Root>
      )}

      {/* Technicals Tab */}
      {activeTab === 'technicals' && (
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={6}>
          {/* MACD Details */}
          <Card.Root bg="bg.surface" borderColor="border.default" borderRadius="lg" boxShadow="elevation.raised">
            <Card.Header>
              <Heading size="sm" color="fg.default">MACD Indicator</Heading>
            </Card.Header>
            <Card.Body>
              {stock.macd ? (
                <VStack align="start" gap={2}>
                  <HStack justify="space-between" w="100%">
                    <Text color="fg.muted">MACD Line</Text>
                    <Text color="fg.default">{stock.macd.macd_line != null && typeof stock.macd.macd_line === 'number' ? stock.macd.macd_line.toFixed(4) : '-'}</Text>
                  </HStack>
                  <HStack justify="space-between" w="100%">
                    <Text color="fg.muted">Signal Line</Text>
                    <Text color="fg.default">{stock.macd.signal_line != null && typeof stock.macd.signal_line === 'number' ? stock.macd.signal_line.toFixed(4) : '-'}</Text>
                  </HStack>
                  <HStack justify="space-between" w="100%">
                    <Text color="fg.muted">Histogram</Text>
                    <Text color={stock.macd.histogram != null && stock.macd.histogram > 0 ? 'signal.up.fg' : 'signal.down.fg'}>
                      {stock.macd.histogram != null && typeof stock.macd.histogram === 'number' ? stock.macd.histogram.toFixed(4) : '-'}
                    </Text>
                  </HStack>
                  <Separator my={2} />
                  <Badge colorPalette={stock.macd.histogram > 0 ? 'green' : 'red'} size="lg">
                    {stock.macd.histogram > 0 ? 'Bullish Signal' : 'Bearish Signal'}
                  </Badge>
                </VStack>
              ) : (
                <Text color="fg.subtle">MACD data not available</Text>
              )}
            </Card.Body>
          </Card.Root>

          {/* Moving Averages */}
          <Card.Root bg="bg.surface" borderColor="border.default" borderRadius="lg" boxShadow="elevation.raised">
            <Card.Header>
              <Heading size="sm" color="fg.default">Moving Averages</Heading>
            </Card.Header>
            <Card.Body>
              <VStack align="start" gap={2}>
                <HStack justify="space-between" w="100%">
                  <Text color="fg.muted">Price</Text>
                  <Text color="fg.default">${stock.price != null && typeof stock.price === 'number' ? stock.price.toFixed(2) : '-'}</Text>
                </HStack>
                <HStack justify="space-between" w="100%">
                  <Text color="fg.muted">SMA 20</Text>
                  <Text color={stock.sma_20 != null && stock.price != null && stock.price > stock.sma_20 ? 'signal.up.fg' : 'signal.down.fg'}>
                    ${stock.sma_20 != null && typeof stock.sma_20 === 'number' ? stock.sma_20.toFixed(2) : '-'}
                  </Text>
                </HStack>
                <HStack justify="space-between" w="100%">
                  <Text color="fg.muted">SMA 50</Text>
                  <Text color={stock.sma_50 != null && stock.price != null && stock.price > stock.sma_50 ? 'signal.up.fg' : 'signal.down.fg'}>
                    ${stock.sma_50 != null && typeof stock.sma_50 === 'number' ? stock.sma_50.toFixed(2) : '-'}
                  </Text>
                </HStack>
                <Separator my={2} />
                {stock.sma_20 && stock.sma_50 && (
                  <Badge colorPalette={stock.sma_20 > stock.sma_50 ? 'green' : 'red'} size="lg">
                    {stock.sma_20 > stock.sma_50 ? 'Golden Cross' : 'Death Cross'}
                  </Badge>
                )}
              </VStack>
            </Card.Body>
          </Card.Root>

          {/* 52-Week Range */}
          {stock.technicals && (
            <Card.Root bg="bg.surface" borderColor="border.default" borderRadius="lg" boxShadow="elevation.raised">
              <Card.Header>
                <Heading size="sm" color="fg.default">52-Week Range</Heading>
              </Card.Header>
              <Card.Body>
                <VStack align="start" gap={2}>
                  <HStack justify="space-between" w="100%">
                    <Text color="fg.muted">52-Week High</Text>
                    <Text color="fg.default">${stock.technicals.fifty_two_week_high != null && typeof stock.technicals.fifty_two_week_high === 'number' ? stock.technicals.fifty_two_week_high.toFixed(2) : '-'}</Text>
                  </HStack>
                  <HStack justify="space-between" w="100%">
                    <Text color="fg.muted">52-Week Low</Text>
                    <Text color="fg.default">${stock.technicals.fifty_two_week_low != null && typeof stock.technicals.fifty_two_week_low === 'number' ? stock.technicals.fifty_two_week_low.toFixed(2) : '-'}</Text>
                  </HStack>
                  <HStack justify="space-between" w="100%">
                    <Text color="fg.muted">Previous Close</Text>
                    <Text color="fg.default">${stock.technicals.previous_close != null && typeof stock.technicals.previous_close === 'number' ? stock.technicals.previous_close.toFixed(2) : '-'}</Text>
                  </HStack>
                </VStack>
              </Card.Body>
            </Card.Root>
          )}

          {/* Bollinger Bands */}
          <Card.Root bg="bg.surface" borderColor="border.default" borderRadius="lg" boxShadow="elevation.raised">
            <Card.Header>
              <Heading size="sm" color="fg.default">Bollinger Bands (20, 2)</Heading>
            </Card.Header>
            <Card.Body>
              {stock.bollinger ? (
                <VStack align="start" gap={2}>
                  <HStack justify="space-between" w="100%">
                    <Text color="fg.muted">Upper Band</Text>
                    <Text color="signal.down.fg">${stock.bollinger.upper_band.toFixed(2)}</Text>
                  </HStack>
                  <HStack justify="space-between" w="100%">
                    <Text color="fg.muted">Middle Band (SMA 20)</Text>
                    <Text color="fg.default">${stock.bollinger.middle_band.toFixed(2)}</Text>
                  </HStack>
                  <HStack justify="space-between" w="100%">
                    <Text color="fg.muted">Lower Band</Text>
                    <Text color="signal.up.fg">${stock.bollinger.lower_band.toFixed(2)}</Text>
                  </HStack>
                  <HStack justify="space-between" w="100%">
                    <Text color="fg.muted">Bandwidth</Text>
                    <Text color="fg.default">{stock.bollinger.bandwidth.toFixed(4)}</Text>
                  </HStack>
                  <Separator my={2} />
                  <Badge
                    colorPalette={
                      stock.price <= stock.bollinger.lower_band ? 'green' :
                      stock.price >= stock.bollinger.upper_band ? 'red' : 'gray'
                    }
                    size="lg"
                  >
                    {stock.price <= stock.bollinger.lower_band ? 'Near Lower Band (Potential Buy)' :
                     stock.price >= stock.bollinger.upper_band ? 'Near Upper Band (Potential Sell)' :
                     'Within Bands'}
                  </Badge>
                </VStack>
              ) : (
                <Text color="fg.subtle">Bollinger Bands data not available</Text>
              )}
            </Card.Body>
          </Card.Root>

          {/* Stochastic Oscillator */}
          <Card.Root bg="bg.surface" borderColor="border.default" borderRadius="lg" boxShadow="elevation.raised">
            <Card.Header>
              <Heading size="sm" color="fg.default">Stochastic Oscillator (14, 3)</Heading>
            </Card.Header>
            <Card.Body>
              {stock.stochastic ? (
                <VStack align="start" gap={2}>
                  <HStack justify="space-between" w="100%">
                    <Text color="fg.muted">%K Line</Text>
                    <Text color={stock.stochastic.k_line < 20 ? 'signal.up.fg' : stock.stochastic.k_line > 80 ? 'signal.down.fg' : 'fg.default'}>
                      {stock.stochastic.k_line.toFixed(2)}
                    </Text>
                  </HStack>
                  <HStack justify="space-between" w="100%">
                    <Text color="fg.muted">%D Line</Text>
                    <Text color={stock.stochastic.d_line < 20 ? 'signal.up.fg' : stock.stochastic.d_line > 80 ? 'signal.down.fg' : 'fg.default'}>
                      {stock.stochastic.d_line.toFixed(2)}
                    </Text>
                  </HStack>
                  <Separator my={2} />
                  <Badge
                    colorPalette={stock.stochastic.k_line < 20 ? 'green' : stock.stochastic.k_line > 80 ? 'red' : 'gray'}
                    size="lg"
                  >
                    {stock.stochastic.k_line < 20 ? 'Oversold (<20)' :
                     stock.stochastic.k_line > 80 ? 'Overbought (>80)' :
                     'Neutral'}
                  </Badge>
                  {stock.stochastic.k_line > stock.stochastic.d_line ? (
                    <Badge colorPalette="green" size="sm">%K above %D (Bullish)</Badge>
                  ) : (
                    <Badge colorPalette="red" size="sm">%K below %D (Bearish)</Badge>
                  )}
                </VStack>
              ) : (
                <Text color="fg.subtle">Stochastic data not available</Text>
              )}
            </Card.Body>
          </Card.Root>

          {/* Dividend Info */}
          {stock.technicals && stock.technicals.annualized_dividend && (
            <Card.Root bg="bg.surface" borderColor="border.default" borderRadius="lg" boxShadow="elevation.raised">
              <Card.Header>
                <Heading size="sm" color="fg.default">Dividend Info</Heading>
              </Card.Header>
              <Card.Body>
                <VStack align="start" gap={2}>
                  <HStack justify="space-between" w="100%">
                    <Text color="fg.muted">Annual Dividend</Text>
                    <Text color="fg.default">${stock.technicals.annualized_dividend != null && typeof stock.technicals.annualized_dividend === 'number' ? stock.technicals.annualized_dividend.toFixed(2) : '-'}</Text>
                  </HStack>
                  <HStack justify="space-between" w="100%">
                    <Text color="fg.muted">Yield</Text>
                    <Text color="signal.up.fg">{stock.technicals.current_yield != null && typeof stock.technicals.current_yield === 'number' ? stock.technicals.current_yield.toFixed(2) : '-'}%</Text>
                  </HStack>
                  {stock.technicals.ex_dividend_date && (
                    <HStack justify="space-between" w="100%">
                      <Text color="fg.muted">Ex-Dividend Date</Text>
                      <Text color="fg.default">{stock.technicals.ex_dividend_date}</Text>
                    </HStack>
                  )}
                </VStack>
              </Card.Body>
            </Card.Root>
          )}
        </SimpleGrid>
      )}

      {/* Chart Tab */}
      {activeTab === 'chart' && (
        <TradingViewWidget symbol={stock.symbol} />
      )}

      {/* AI Analysis Tab */}
      {activeTab === 'ai' && (
        <Card.Root bg="bg.surface" borderColor="border.default" borderRadius="lg" boxShadow="elevation.raised">
          <Card.Header>
            <Flex justify="space-between" align="center">
              <HStack>
                <Box color="accent.solid"><Zap size={20} /></Box>
                <Heading size="md" color="fg.default">AI Analysis</Heading>
                {streamingModel && (
                  <Badge colorPalette="purple" size="sm">{streamingModel}</Badge>
                )}
              </HStack>
              <Button
                size="sm"
                colorPalette="purple"
                onClick={fetchAIAnalysis}
                loading={aiLoading && !isStreaming}
                disabled={!aiEnabled || isStreaming}
              >
                <RefreshCw size={14} />
                {aiAnalysis || streamingText ? 'Refresh' : 'Generate'}
              </Button>
            </Flex>
          </Card.Header>
          <Card.Body>
            {!aiEnabled ? (
              <Box bg="signal.warn.subtle" borderWidth="1px" borderColor="signal.warn.muted" p={4} borderRadius="md">
                <Text color="signal.warn.fg">
                  AI analysis is not enabled. Set the OPENROUTER_API_KEY_STOCKS environment variable to enable AI-powered insights.
                </Text>
              </Box>
            ) : isStreaming || streamingText ? (
              <Box>
                {/* Streaming Status Indicator */}
                {streamingStatus && (
                  <Flex align="center" mb={4} p={3} bg="accent.subtle" borderWidth="1px" borderColor="accent.muted" borderRadius="md">
                    <Spinner size="sm" color="accent.solid" mr={3} />
                    <VStack align="start" gap={0}>
                      <Text color="accent.fg" fontSize="sm" fontWeight="semibold">
                        {streamingStatus.stage === 'connecting' && '🔌 Connecting...'}
                        {streamingStatus.stage === 'analyzing' && '🧠 Analyzing...'}
                        {streamingStatus.stage === 'streaming' && '✨ Generating...'}
                      </Text>
                      <Text color="fg.muted" fontSize="xs">
                        {streamingStatus.message}
                      </Text>
                    </VStack>
                  </Flex>
                )}

                {/* Streaming Text with Cursor */}
                <Box position="relative">
                  <MarkdownContent>{streamingText}</MarkdownContent>
                  {isStreaming && (
                    <Box
                      as="span"
                      display="inline-block"
                      w="2px"
                      h="1em"
                      bg="accent.solid"
                      ml="1px"
                      animation="blink 1s infinite"
                      verticalAlign="text-bottom"
                      css={{
                        '@keyframes blink': {
                          '0%, 50%': { opacity: 1 },
                          '51%, 100%': { opacity: 0 },
                        },
                      }}
                    />
                  )}
                </Box>

                {/* Completion Info */}
                {!isStreaming && streamingText && (
                  <>
                    <Separator my={4} />
                    <HStack justify="space-between">
                      <Text color="fg.subtle" fontSize="sm">
                        Model: {streamingModel || aiAnalysis?.model_used || 'Unknown'}
                      </Text>
                      <Text color="fg.subtle" fontSize="sm">
                        Generated: {aiAnalysis?.generated_at ? new Date(aiAnalysis.generated_at).toLocaleString() : new Date().toLocaleString()}
                      </Text>
                    </HStack>
                  </>
                )}
              </Box>
            ) : aiLoading ? (
              <Flex justify="center" py={8}>
                <Spinner size="lg" color="accent.solid" />
                <Text ml={3} color="fg.muted">Initializing AI analysis...</Text>
              </Flex>
            ) : aiAnalysis?.success ? (
              <Box>
                <MarkdownContent>{aiAnalysis.analysis || ''}</MarkdownContent>
                <Separator my={4} />
                <HStack justify="space-between">
                  <Text color="fg.subtle" fontSize="sm">
                    Model: {aiAnalysis.model_used}
                  </Text>
                  <Text color="fg.subtle" fontSize="sm">
                    Generated: {aiAnalysis.generated_at ? new Date(aiAnalysis.generated_at).toLocaleString() : '-'}
                  </Text>
                </HStack>
              </Box>
            ) : aiAnalysis ? (
              <Box bg="signal.down.subtle" borderWidth="1px" borderColor="signal.down.muted" p={4} borderRadius="md">
                <Text color="signal.down.fg">{aiAnalysis.error}</Text>
              </Box>
            ) : (
              <Text color="fg.subtle">
                Click "Generate" to get AI-powered analysis for this stock.
              </Text>
            )}
          </Card.Body>
        </Card.Root>
      )}

      {/* News Tab */}
      {activeTab === 'news' && stock.news && stock.news.length > 0 && (
        <VStack gap={3} align="stretch">
          {stock.news.map((item, idx) => (
            <Card.Root key={idx} bg="bg.surface" borderColor="border.default" borderRadius="lg" boxShadow="elevation.raised">
              <Card.Body p={4}>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  <Flex justify="space-between" align="start">
                    <VStack align="start" gap={1} flex={1}>
                      <Text color="fg.default" fontWeight="semibold" _hover={{ color: 'accent.fg' }}>
                        {item.title}
                      </Text>
                      <HStack color="fg.subtle" fontSize="sm">
                        <Text>{item.publisher}</Text>
                        {item.ago && <Text>• {item.ago}</Text>}
                      </HStack>
                    </VStack>
                    <Box color="fg.subtle" ml={2}><ExternalLink size={16} /></Box>
                  </Flex>
                </a>
              </Card.Body>
            </Card.Root>
          ))}
        </VStack>
      )}

      {/* Insiders Tab */}
      {activeTab === 'insiders' && (
        <Card.Root bg="bg.surface" borderColor="border.default" borderRadius="lg" boxShadow="elevation.raised">
          <Card.Header>
            <Heading size="md" color="fg.default">Insider Trades</Heading>
          </Card.Header>
          <Card.Body>
            {insidersLoading ? (
              <Flex justify="center" py={8}>
                <Spinner size="lg" color="accent.solid" />
                <Text ml={3} color="fg.muted">Loading insider trades...</Text>
              </Flex>
            ) : insiderTrades.length === 0 ? (
              <Text color="fg.subtle">No insider trading data available for this stock.</Text>
            ) : (
              <VStack align="stretch" gap={0}>
                {/* Header */}
                <Flex px={3} py={2} color="fg.subtle" fontSize="xs" fontWeight="semibold" borderBottom="1px" borderColor="border.subtle">
                  <Text w="120px">Date</Text>
                  <Text flex={1}>Name</Text>
                  <Text w="100px">Relation</Text>
                  <Text w="80px" textAlign="center">Type</Text>
                  <Text w="100px" textAlign="right">Shares</Text>
                  <Text w="80px" textAlign="right">Price</Text>
                  <Text w="100px" textAlign="right">Held After</Text>
                </Flex>
                {insiderTrades.map((trade, idx) => (
                  <Flex
                    key={idx}
                    px={3}
                    py={2}
                    fontSize="sm"
                    borderBottom="1px"
                    borderColor="border.subtle"
                    _hover={{ bg: 'bg.muted' }}
                    align="center"
                  >
                    <Text w="120px" color="fg.muted">{trade.date || '-'}</Text>
                    <Text flex={1} color="fg.default" fontWeight="medium">{trade.insider_name}</Text>
                    <Text w="100px" color="fg.muted" fontSize="xs">{trade.relation || '-'}</Text>
                    <Flex w="80px" justify="center">
                      <Badge
                        colorPalette={
                          trade.transaction_type.toLowerCase().includes('buy') || trade.transaction_type.toLowerCase().includes('purchase')
                            ? 'green'
                            : trade.transaction_type.toLowerCase().includes('sell') || trade.transaction_type.toLowerCase().includes('sale')
                            ? 'red'
                            : 'gray'
                        }
                        size="sm"
                      >
                        {trade.transaction_type}
                      </Badge>
                    </Flex>
                    <Text w="100px" textAlign="right" color="fg.default">
                      {trade.shares_traded != null ? trade.shares_traded.toLocaleString() : '-'}
                    </Text>
                    <Text w="80px" textAlign="right" color="fg.default">
                      {trade.price != null ? `$${trade.price.toFixed(2)}` : '-'}
                    </Text>
                    <Text w="100px" textAlign="right" color="fg.muted">
                      {trade.shares_held != null ? trade.shares_held.toLocaleString() : '-'}
                    </Text>
                  </Flex>
                ))}
              </VStack>
            )}
          </Card.Body>
        </Card.Root>
      )}
    </Container>
  );
};
