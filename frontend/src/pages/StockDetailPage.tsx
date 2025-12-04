import React, { useEffect, useState, useCallback } from 'react';
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
import { 
  StockAnalysis, 
  StockFilter, 
  AIAnalysisResponse, 
  getMarketCapTier, 
  getMarketCapTierColor, 
  getMarketCapTierLabel 
} from '../types';

// TradingView widget integration
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
    <Box id="tradingview-widget" h="500px" w="100%" bg="gray.900" borderRadius="md" />
  );
};

// Stat Card component
const StatCard: React.FC<{ label: string; value: string | number; color?: string }> = ({ 
  label, 
  value, 
  color = 'white' 
}) => (
  <Card.Root bg="gray.800" borderColor="gray.700">
    <Card.Body p={4}>
      <Text color="gray.400" fontSize="sm" mb={1}>{label}</Text>
      <Text color={color} fontSize="xl" fontWeight="bold">{value}</Text>
    </Card.Body>
  </Card.Root>
);

export const StockDetailPage: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const [stock, setStock] = useState<StockAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'technicals' | 'chart' | 'ai' | 'news'>('overview');

  const fetchStock = useCallback(async () => {
    if (!symbol) return;
    
    try {
      setLoading(true);
      
      // Fetch stock data via filter
      const filter: StockFilter = {
        page: 1,
        page_size: 5000,
      };
      
      const response = await api.filterStocks(filter);
      const found = response.stocks.find(s => s.symbol.toUpperCase() === symbol.toUpperCase());
      if (found) {
        setStock(found);
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
    if (!symbol || aiLoading) return;

    setAiLoading(true);
    try {
      const analysis = await api.getAIAnalysis(symbol);
      setAiAnalysis(analysis);
    } catch (err) {
      setAiAnalysis({ success: false, error: 'Failed to load analysis' });
    } finally {
      setAiLoading(false);
    }
  }, [symbol, aiLoading]);

  useEffect(() => {
    fetchStock();
    checkAIStatus();
  }, [fetchStock, checkAIStatus]);

  // Auto-trigger AI analysis when enabled
  useEffect(() => {
    if (aiEnabled && stock && !aiAnalysis && !aiLoading) {
      fetchAIAnalysis();
    }
  }, [aiEnabled, stock, aiAnalysis, aiLoading, fetchAIAnalysis]);

  if (loading) {
    return (
      <Container maxW="container.xl" py={8}>
        <Flex justify="center" align="center" minH="50vh">
          <Spinner size="xl" color="blue.400" />
        </Flex>
      </Container>
    );
  }

  if (!stock) {
    return (
      <Container maxW="container.xl" py={8}>
        <VStack py={12}>
          <Heading color="gray.500">Stock Not Found</Heading>
          <Text color="gray.600">The symbol "{symbol}" was not found in our database.</Text>
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
  const changeColor = (stock.price_change_percent ?? 0) >= 0 ? 'green' : 'red';
  const rsiColor = stock.rsi && stock.rsi < 30 ? 'green' : stock.rsi && stock.rsi > 70 ? 'red' : 'gray';

  return (
    <Container maxW="container.xl" py={8}>
      {/* Back Button */}
      <Link to="/stocks">
        <Button variant="ghost" mb={4} size="sm">
          <ArrowLeft size={16} /> Back to Stocks
        </Button>
      </Link>

      {/* Header */}
      <Flex justify="space-between" align="start" mb={6} wrap="wrap" gap={4}>
        <VStack align="start" gap={2}>
          <HStack>
            <Badge colorPalette={tierColor} size="lg">{getMarketCapTierLabel(tier)}</Badge>
            {stock.is_oversold && <Badge colorPalette="green" size="lg">Oversold</Badge>}
            {stock.is_overbought && <Badge colorPalette="red" size="lg">Overbought</Badge>}
          </HStack>
          <Heading size="2xl" color="white">{stock.symbol}</Heading>
          <Text color="gray.400">{stock.sector || 'Unknown Sector'}</Text>
        </VStack>

        <VStack align="end" gap={1}>
          <Text fontSize="3xl" fontWeight="bold" color="white">
            ${stock.price != null && typeof stock.price === 'number' ? stock.price.toFixed(2) : '-'}
          </Text>
          <HStack>
            <Box color={changeColor === 'green' ? 'green.400' : 'red.400'}>
              {stock.price_change_percent != null && stock.price_change_percent >= 0 
                ? <TrendingUp size={20} /> 
                : <TrendingDown size={20} />
              }
            </Box>
            <Text 
              fontSize="lg" 
              fontWeight="semibold"
              color={changeColor === 'green' ? 'green.400' : 'red.400'}
            >
              {stock.price_change != null && typeof stock.price_change === 'number' && (
                <>
                  {stock.price_change >= 0 ? '+' : ''}${stock.price_change.toFixed(2)}
                </>
              )}
              {stock.price_change_percent != null && typeof stock.price_change_percent === 'number' && (
                <> ({stock.price_change_percent >= 0 ? '+' : ''}{stock.price_change_percent.toFixed(2)}%)</>
              )}
            </Text>
          </HStack>
        </VStack>
      </Flex>

      {/* Tab Buttons */}
      <HStack gap={2} mb={6} wrap="wrap">
        <Button
          size="sm"
          variant={activeTab === 'overview' ? 'solid' : 'outline'}
          colorPalette={activeTab === 'overview' ? 'blue' : 'gray'}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'technicals' ? 'solid' : 'outline'}
          colorPalette={activeTab === 'technicals' ? 'blue' : 'gray'}
          onClick={() => setActiveTab('technicals')}
        >
          Technical Analysis
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'chart' ? 'solid' : 'outline'}
          colorPalette={activeTab === 'chart' ? 'blue' : 'gray'}
          onClick={() => setActiveTab('chart')}
        >
          Chart
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'ai' ? 'solid' : 'outline'}
          colorPalette={activeTab === 'ai' ? 'purple' : 'gray'}
          onClick={() => setActiveTab('ai')}
        >
          <Zap size={14} /> AI Analysis
        </Button>
        {stock.news && stock.news.length > 0 && (
          <Button
            size="sm"
            variant={activeTab === 'news' ? 'solid' : 'outline'}
            colorPalette={activeTab === 'news' ? 'blue' : 'gray'}
            onClick={() => setActiveTab('news')}
          >
            News ({stock.news.length})
          </Button>
        )}
      </HStack>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          <SimpleGrid columns={{ base: 2, md: 4 }} gap={4} mb={6}>
            <StatCard 
              label="RSI (14)" 
              value={stock.rsi != null && typeof stock.rsi === 'number' ? stock.rsi.toFixed(1) : '-'} 
              color={rsiColor === 'green' ? 'green.400' : rsiColor === 'red' ? 'red.400' : 'white'} 
            />
            <StatCard label="SMA 20" value={stock.sma_20 != null && typeof stock.sma_20 === 'number' ? `$${stock.sma_20.toFixed(2)}` : '-'} />
            <StatCard label="SMA 50" value={stock.sma_50 != null && typeof stock.sma_50 === 'number' ? `$${stock.sma_50.toFixed(2)}` : '-'} />
            <StatCard 
              label="MACD" 
              value={stock.macd ? (stock.macd.histogram > 0 ? 'Bullish' : 'Bearish') : '-'} 
              color={stock.macd?.histogram != null && stock.macd.histogram > 0 ? 'green.400' : 'red.400'}
            />
          </SimpleGrid>

          <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
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

      {/* Technicals Tab */}
      {activeTab === 'technicals' && (
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={6}>
          {/* MACD Details */}
          <Card.Root bg="gray.800" borderColor="gray.700">
            <Card.Header>
              <Heading size="sm" color="white">MACD Indicator</Heading>
            </Card.Header>
            <Card.Body>
              {stock.macd ? (
                <VStack align="start" gap={2}>
                  <HStack justify="space-between" w="100%">
                    <Text color="gray.400">MACD Line</Text>
                    <Text color="white">{stock.macd.macd_line != null && typeof stock.macd.macd_line === 'number' ? stock.macd.macd_line.toFixed(4) : '-'}</Text>
                  </HStack>
                  <HStack justify="space-between" w="100%">
                    <Text color="gray.400">Signal Line</Text>
                    <Text color="white">{stock.macd.signal_line != null && typeof stock.macd.signal_line === 'number' ? stock.macd.signal_line.toFixed(4) : '-'}</Text>
                  </HStack>
                  <HStack justify="space-between" w="100%">
                    <Text color="gray.400">Histogram</Text>
                    <Text color={stock.macd.histogram != null && stock.macd.histogram > 0 ? 'green.400' : 'red.400'}>
                      {stock.macd.histogram != null && typeof stock.macd.histogram === 'number' ? stock.macd.histogram.toFixed(4) : '-'}
                    </Text>
                  </HStack>
                  <Separator my={2} />
                  <Badge colorPalette={stock.macd.histogram > 0 ? 'green' : 'red'} size="lg">
                    {stock.macd.histogram > 0 ? 'Bullish Signal' : 'Bearish Signal'}
                  </Badge>
                </VStack>
              ) : (
                <Text color="gray.500">MACD data not available</Text>
              )}
            </Card.Body>
          </Card.Root>

          {/* Moving Averages */}
          <Card.Root bg="gray.800" borderColor="gray.700">
            <Card.Header>
              <Heading size="sm" color="white">Moving Averages</Heading>
            </Card.Header>
            <Card.Body>
              <VStack align="start" gap={2}>
                <HStack justify="space-between" w="100%">
                  <Text color="gray.400">Price</Text>
                  <Text color="white">${stock.price != null && typeof stock.price === 'number' ? stock.price.toFixed(2) : '-'}</Text>
                </HStack>
                <HStack justify="space-between" w="100%">
                  <Text color="gray.400">SMA 20</Text>
                  <Text color={stock.sma_20 != null && stock.price != null && stock.price > stock.sma_20 ? 'green.400' : 'red.400'}>
                    ${stock.sma_20 != null && typeof stock.sma_20 === 'number' ? stock.sma_20.toFixed(2) : '-'}
                  </Text>
                </HStack>
                <HStack justify="space-between" w="100%">
                  <Text color="gray.400">SMA 50</Text>
                  <Text color={stock.sma_50 != null && stock.price != null && stock.price > stock.sma_50 ? 'green.400' : 'red.400'}>
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
            <Card.Root bg="gray.800" borderColor="gray.700">
              <Card.Header>
                <Heading size="sm" color="white">52-Week Range</Heading>
              </Card.Header>
              <Card.Body>
                <VStack align="start" gap={2}>
                  <HStack justify="space-between" w="100%">
                    <Text color="gray.400">52-Week High</Text>
                  <Text color="white">${stock.technicals.fifty_two_week_high != null && typeof stock.technicals.fifty_two_week_high === 'number' ? stock.technicals.fifty_two_week_high.toFixed(2) : '-'}</Text>
                  </HStack>
                  <HStack justify="space-between" w="100%">
                    <Text color="gray.400">52-Week Low</Text>
                  <Text color="white">${stock.technicals.fifty_two_week_low != null && typeof stock.technicals.fifty_two_week_low === 'number' ? stock.technicals.fifty_two_week_low.toFixed(2) : '-'}</Text>
                </HStack>
                <HStack justify="space-between" w="100%">
                  <Text color="gray.400">Previous Close</Text>
                  <Text color="white">${stock.technicals.previous_close != null && typeof stock.technicals.previous_close === 'number' ? stock.technicals.previous_close.toFixed(2) : '-'}</Text>
                  </HStack>
                </VStack>
              </Card.Body>
            </Card.Root>
          )}

          {/* Dividend Info */}
          {stock.technicals && stock.technicals.annualized_dividend && (
            <Card.Root bg="gray.800" borderColor="gray.700">
              <Card.Header>
                <Heading size="sm" color="white">Dividend Info</Heading>
              </Card.Header>
              <Card.Body>
                <VStack align="start" gap={2}>
                  <HStack justify="space-between" w="100%">
                    <Text color="gray.400">Annual Dividend</Text>
                    <Text color="white">${stock.technicals.annualized_dividend != null && typeof stock.technicals.annualized_dividend === 'number' ? stock.technicals.annualized_dividend.toFixed(2) : '-'}</Text>
                  </HStack>
                  <HStack justify="space-between" w="100%">
                    <Text color="gray.400">Yield</Text>
                    <Text color="green.400">{stock.technicals.current_yield != null && typeof stock.technicals.current_yield === 'number' ? stock.technicals.current_yield.toFixed(2) : '-'}%</Text>
                  </HStack>
                  {stock.technicals.ex_dividend_date && (
                    <HStack justify="space-between" w="100%">
                      <Text color="gray.400">Ex-Dividend Date</Text>
                      <Text color="white">{stock.technicals.ex_dividend_date}</Text>
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
        <Card.Root bg="gray.800" borderColor="gray.700">
          <Card.Header>
            <Flex justify="space-between" align="center">
              <HStack>
                <Box color="purple.400"><Zap size={20} /></Box>
                <Heading size="md" color="white">AI Analysis</Heading>
              </HStack>
              <Button 
                size="sm" 
                colorPalette="purple" 
                onClick={fetchAIAnalysis}
                loading={aiLoading}
                disabled={!aiEnabled}
              >
                <RefreshCw size={14} />
                {aiAnalysis ? 'Refresh' : 'Generate'}
              </Button>
            </Flex>
          </Card.Header>
          <Card.Body>
            {!aiEnabled ? (
              <Box bg="yellow.900" p={4} borderRadius="md">
                <Text color="yellow.200">
                  AI analysis is not enabled. Set the OPENROUTER_API_KEY_STOCKS environment variable to enable AI-powered insights.
                </Text>
              </Box>
            ) : aiLoading ? (
              <Flex justify="center" py={8}>
                <Spinner size="lg" color="purple.400" />
                <Text ml={3} color="gray.400">Generating AI analysis...</Text>
              </Flex>
            ) : aiAnalysis?.success ? (
              <Box>
                <Text color="gray.200" whiteSpace="pre-wrap" lineHeight="tall">
                  {aiAnalysis.analysis}
                </Text>
                <Separator my={4} />
                <HStack justify="space-between">
                  <Text color="gray.500" fontSize="sm">
                    Model: {aiAnalysis.model_used}
                  </Text>
                  <Text color="gray.500" fontSize="sm">
                    Generated: {aiAnalysis.generated_at ? new Date(aiAnalysis.generated_at).toLocaleString() : '-'}
                  </Text>
                </HStack>
              </Box>
            ) : aiAnalysis ? (
              <Box bg="red.900" p={4} borderRadius="md">
                <Text color="red.200">{aiAnalysis.error}</Text>
              </Box>
            ) : (
              <Text color="gray.500">
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
            <Card.Root key={idx} bg="gray.800" borderColor="gray.700">
              <Card.Body p={4}>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  <Flex justify="space-between" align="start">
                    <VStack align="start" gap={1} flex={1}>
                      <Text color="white" fontWeight="semibold" _hover={{ color: 'blue.400' }}>
                        {item.title}
                      </Text>
                      <HStack color="gray.500" fontSize="sm">
                        <Text>{item.publisher}</Text>
                        {item.ago && <Text>• {item.ago}</Text>}
                      </HStack>
                    </VStack>
                    <Box color="gray.500" ml={2}><ExternalLink size={16} /></Box>
                  </Flex>
                </a>
              </Card.Body>
            </Card.Root>
          ))}
        </VStack>
      )}
    </Container>
  );
};
