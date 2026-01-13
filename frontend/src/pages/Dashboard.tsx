import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
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
  Stat,
} from '@chakra-ui/react';
import { TrendingUp, TrendingDown, AlertCircle, Target, DollarSign } from 'lucide-react';
import { api } from '../api';
import { StockAnalysis, MarketSummary, getMarketCapTier, getMarketCapTierColor, AIAnalysisResponse } from '../types';
import { useSettings } from '../contexts/SettingsContext';

// Compact stock row for dashboard sections
const CompactStockRow: React.FC<{
  stock: StockAnalysis;
  showChange?: boolean;
  showRSI?: boolean;
}> = ({ stock, showChange = true, showRSI = false }) => {
  const tier = getMarketCapTier(stock.market_cap);
  const tierColor = getMarketCapTierColor(tier);
  const changeColor = (stock.price_change_percent ?? 0) >= 0 ? 'green' : 'red';

  return (
    <Link to={`/stocks/${stock.symbol}`} style={{ width: '100%' }}>
      <Flex
        justify="space-between"
        align="center"
        p={3}
        borderRadius="md"
        bg="whiteAlpha.50"
        _hover={{ bg: 'whiteAlpha.100' }}
        transition="all 0.2s"
        cursor="pointer"
      >
        <HStack gap={3}>
          <Badge colorPalette={tierColor} size="sm">{tier.toUpperCase()}</Badge>
          <VStack align="start" gap={0}>
            <Text fontWeight="bold" color="white">{stock.symbol}</Text>
            <Text fontSize="xs" color="gray.400">
              ${stock.price != null && typeof stock.price === 'number' ? stock.price.toFixed(2) : '-'}
            </Text>
          </VStack>
        </HStack>

        <HStack gap={4}>
          {showRSI && stock.rsi != null && typeof stock.rsi === 'number' && (
            <Badge 
              colorPalette={stock.rsi < 30 ? 'green' : stock.rsi > 70 ? 'red' : 'gray'}
              size="sm"
            >
              RSI: {stock.rsi.toFixed(1)}
            </Badge>
          )}
          {showChange && stock.price_change_percent != null && typeof stock.price_change_percent === 'number' && (
            <Text 
              fontWeight="bold" 
              color={changeColor === 'green' ? 'green.400' : 'red.400'}
            >
              {stock.price_change_percent >= 0 ? '+' : ''}
              {stock.price_change_percent.toFixed(2)}%
            </Text>
          )}
        </HStack>
      </Flex>
    </Link>
  );
};

// AI Analysis Card for featured stocks
const AIAnalysisCard: React.FC<{
  stock: StockAnalysis;
  analysis: AIAnalysisResponse | null;
  isLoading: boolean;
}> = ({ stock, analysis, isLoading }) => {
  const tier = getMarketCapTier(stock.market_cap);
  const tierColor = getMarketCapTierColor(tier);

  return (
    <Card.Root bg="gray.800" borderColor="gray.700">
      <Card.Header>
        <Flex justify="space-between" align="center">
          <HStack>
            <Badge colorPalette={tierColor}>{tier.toUpperCase()}</Badge>
            <Heading size="md" color="white">{stock.symbol}</Heading>
          </HStack>
          <Text color="gray.400">${stock.price != null && typeof stock.price === 'number' ? stock.price.toFixed(2) : '-'}</Text>
        </Flex>
      </Card.Header>
      <Card.Body>
        {isLoading ? (
          <Flex justify="center" py={4}>
            <Spinner color="blue.400" />
          </Flex>
        ) : analysis?.success ? (
          <Box>
            <Text color="gray.300" fontSize="sm" lineClamp={6}>
              {analysis.analysis}
            </Text>
            <Text color="gray.500" fontSize="xs" mt={2}>
              Model: {analysis.model_used}
            </Text>
          </Box>
        ) : (
          <Text color="gray.500" fontSize="sm">
            {analysis?.error || 'AI analysis not available'}
          </Text>
        )}
      </Card.Body>
    </Card.Root>
  );
};

// Section Card for dashboard
const SectionCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  linkTo?: string;
  linkText?: string;
}> = ({ title, icon, children, linkTo, linkText }) => (
  <Card.Root bg="gray.800" borderColor="gray.700">
    <Card.Header>
      <Flex justify="space-between" align="center">
        <HStack>
          {icon}
          <Heading size="sm" color="white">{title}</Heading>
        </HStack>
        {linkTo && (
          <Link to={linkTo}>
            <Text color="blue.400" fontSize="sm" _hover={{ textDecoration: 'underline' }}>
              {linkText || 'View All →'}
            </Text>
          </Link>
        )}
      </Flex>
    </Card.Header>
    <Card.Body>
      {children}
    </Card.Body>
  </Card.Root>
);

export const Dashboard: React.FC = () => {
  const { settings } = useSettings();
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiAnalyses, setAiAnalyses] = useState<Record<string, AIAnalysisResponse>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});

  const fetchMarketSummary = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getMarketSummary(settings);
      setSummary(data);
      setError(null);
    } catch (err) {
      setError('Failed to load market summary');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [settings]);

  const checkAIStatus = useCallback(async () => {
    try {
      const status = await api.getAIStatus();
      setAiEnabled(status.enabled);
    } catch (err) {
      console.error('Failed to check AI status:', err);
    }
  }, []);

  const fetchAIAnalysis = useCallback(async (symbol: string) => {
    if (aiAnalyses[symbol] || aiLoading[symbol]) return;

    setAiLoading(prev => ({ ...prev, [symbol]: true }));
    try {
      const analysis = await api.getAIAnalysis(symbol);
      setAiAnalyses(prev => ({ ...prev, [symbol]: analysis }));
    } catch (err) {
      setAiAnalyses(prev => ({ ...prev, [symbol]: { success: false, error: 'Failed to load' } }));
    } finally {
      setAiLoading(prev => ({ ...prev, [symbol]: false }));
    }
  }, [aiAnalyses, aiLoading]);

  useEffect(() => {
    fetchMarketSummary();
    checkAIStatus();

    // Refresh every 5 minutes
    const interval = setInterval(fetchMarketSummary, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchMarketSummary, checkAIStatus]);

  // Auto-trigger AI analysis for top oversold stocks
  useEffect(() => {
    if (aiEnabled && summary?.most_oversold) {
      // Analyze top 3 oversold stocks automatically
      summary.most_oversold.slice(0, 3).forEach(stock => {
        fetchAIAnalysis(stock.symbol);
      });
    }
  }, [aiEnabled, summary?.most_oversold, fetchAIAnalysis]);

  if (loading) {
    return (
      <Container maxW="container.xl" py={8}>
        <Flex justify="center" align="center" minH="50vh">
          <Spinner size="xl" color="blue.400" />
        </Flex>
      </Container>
    );
  }

  if (error || !summary) {
    return (
      <Container maxW="container.xl" py={8}>
        <Flex justify="center" align="center" minH="50vh">
          <VStack>
            <Box color="red.400"><AlertCircle size={48} /></Box>
            <Text color="red.400">{error || 'Failed to load data'}</Text>
          </VStack>
        </Flex>
      </Container>
    );
  }

  return (
    <Container maxW="container.xl" py={8}>
      {/* Market Stats Header */}
      <Box mb={8}>
        <Heading size="lg" color="white" mb={2}>Market Overview</Heading>
        <Text color="gray.400">
          Analyzing {summary.total_stocks.toLocaleString()} stocks • 
          Last updated: {new Date(summary.generated_at).toLocaleTimeString()}
        </Text>
      </Box>

      {/* Quick Stats */}
      <SimpleGrid columns={{ base: 2, md: 4 }} gap={4} mb={8}>
        <Card.Root bg="gray.800" borderColor="gray.700">
          <Card.Body>
            <Stat.Root>
              <Stat.Label color="gray.400">Total Stocks</Stat.Label>
              <Stat.ValueText color="white">{summary.total_stocks.toLocaleString()}</Stat.ValueText>
            </Stat.Root>
          </Card.Body>
        </Card.Root>
        <Card.Root bg="gray.800" borderColor="gray.700">
          <Card.Body>
            <Stat.Root>
              <Stat.Label color="gray.400">Top Gainers</Stat.Label>
              <Stat.ValueText color="green.400">{summary.top_gainers.length}</Stat.ValueText>
            </Stat.Root>
          </Card.Body>
        </Card.Root>
        <Card.Root bg="gray.800" borderColor="gray.700">
          <Card.Body>
            <Stat.Root>
              <Stat.Label color="gray.400">Top Losers</Stat.Label>
              <Stat.ValueText color="red.400">{summary.top_losers.length}</Stat.ValueText>
            </Stat.Root>
          </Card.Body>
        </Card.Root>
        <Card.Root bg="gray.800" borderColor="gray.700">
          <Card.Body>
            <Stat.Root>
              <Stat.Label color="gray.400">Oversold (RSI &lt; 30)</Stat.Label>
              <Stat.ValueText color="yellow.400">{summary.most_oversold.length}</Stat.ValueText>
            </Stat.Root>
          </Card.Body>
        </Card.Root>
      </SimpleGrid>

      {/* Main Content Grid */}
      <SimpleGrid columns={{ base: 1, lg: 2 }} gap={6} mb={8}>
        {/* Top Gainers */}
        <SectionCard
          title="Top Gainers"
          icon={<Box color="green.400"><TrendingUp size={20} /></Box>}
          linkTo="/stocks?sort_by=price_change_percent&sort_order=desc"
        >
          <VStack gap={2} align="stretch">
            {summary.top_gainers.slice(0, 5).map(stock => (
              <CompactStockRow key={stock.symbol} stock={stock} />
            ))}
            {summary.top_gainers.length === 0 && (
              <Text color="gray.500">No gainers data available</Text>
            )}
          </VStack>
        </SectionCard>

        {/* Top Losers */}
        <SectionCard
          title="Top Losers"
          icon={<Box color="red.400"><TrendingDown size={20} /></Box>}
          linkTo="/stocks?sort_by=price_change_percent&sort_order=asc"
        >
          <VStack gap={2} align="stretch">
            {summary.top_losers.slice(0, 5).map(stock => (
              <CompactStockRow key={stock.symbol} stock={stock} />
            ))}
            {summary.top_losers.length === 0 && (
              <Text color="gray.500">No losers data available</Text>
            )}
          </VStack>
        </SectionCard>

        {/* Most Oversold */}
        <SectionCard
          title="Most Oversold (Opportunities)"
          icon={<Box color="yellow.400"><Target size={20} /></Box>}
          linkTo="/opportunities"
        >
          <VStack gap={2} align="stretch">
            {summary.most_oversold.slice(0, 5).map(stock => (
              <CompactStockRow key={stock.symbol} stock={stock} showChange={false} showRSI />
            ))}
            {summary.most_oversold.length === 0 && (
              <Text color="gray.500">No oversold stocks found</Text>
            )}
          </VStack>
        </SectionCard>

        {/* Mega Cap Highlights */}
        <SectionCard
          title="Mega Cap Highlights ($200B+)"
          icon={<Box color="purple.400"><DollarSign size={20} /></Box>}
          linkTo="/stocks?min_market_cap=200000000000"
        >
          <VStack gap={2} align="stretch">
            {summary.mega_cap_highlights.slice(0, 5).map(stock => (
              <CompactStockRow key={stock.symbol} stock={stock} />
            ))}
            {summary.mega_cap_highlights.length === 0 && (
              <Text color="gray.500">No mega cap stocks found</Text>
            )}
          </VStack>
        </SectionCard>
      </SimpleGrid>

      {/* AI Analysis Section (if enabled) */}
      {aiEnabled && summary.most_oversold.length > 0 && (
        <Box mb={8}>
          <Heading size="md" color="white" mb={4}>
            🤖 AI Analysis - Top Oversold Opportunities
          </Heading>
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
            {summary.most_oversold.slice(0, 3).map(stock => (
              <AIAnalysisCard
                key={stock.symbol}
                stock={stock}
                analysis={aiAnalyses[stock.symbol] || null}
                isLoading={aiLoading[stock.symbol] || false}
              />
            ))}
          </SimpleGrid>
        </Box>
      )}
    </Container>
  );
};
