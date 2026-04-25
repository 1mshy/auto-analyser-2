import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Container,
  Heading,
  Text,
  SimpleGrid,
  Flex,
  Badge,
  Spinner,
  HStack,
  VStack,
} from '@chakra-ui/react';
import { TrendingUp, TrendingDown, AlertCircle, Target, DollarSign, Sparkles } from 'lucide-react';
import { api } from '../api';
import MarkdownContent from '../components/MarkdownContent';
import { StockAnalysis, MarketSummary, getMarketCapTier, getMarketCapTierColor, AIAnalysisResponse } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { Surface, Num, SignalBadge, PageHeader, StatBlock } from '../components/ui/primitives';

const CompactStockRow: React.FC<{
  stock: StockAnalysis;
  showChange?: boolean;
  showRSI?: boolean;
}> = ({ stock, showChange = true, showRSI = false }) => {
  const tier = getMarketCapTier(stock.market_cap);
  const tierColor = getMarketCapTierColor(tier);

  return (
    <Link to={`/stocks/${stock.symbol}`} style={{ width: '100%' }}>
      <Flex
        justify="space-between"
        align="center"
        px={3}
        py={2}
        borderRadius="md"
        _hover={{ bg: 'bg.muted' }}
        transition="background 120ms ease"
        cursor="pointer"
      >
        <HStack gap={3}>
          <Badge colorPalette={tierColor} size="sm" variant="subtle">{tier.toUpperCase()}</Badge>
          <VStack align="start" gap={0}>
            <Text fontWeight="semibold" color="fg.default" letterSpacing="tight">{stock.symbol}</Text>
            <Num value={stock.price} prefix="$" fontSize="xs" color="fg.muted" />
          </VStack>
        </HStack>

        <HStack gap={4}>
          {showRSI && stock.rsi != null && typeof stock.rsi === 'number' && (
            <SignalBadge
              tone={stock.rsi < 30 ? 'up' : stock.rsi > 70 ? 'down' : 'neutral'}
              size="sm"
              className="num"
              data-num=""
            >
              RSI: {stock.rsi.toFixed(1)}
            </SignalBadge>
          )}
          {showChange && stock.price_change_percent != null && typeof stock.price_change_percent === 'number' && (
            <Num
              value={stock.price_change_percent}
              intent="auto"
              sign="always"
              suffix="%"
              fontWeight="semibold"
            />
          )}
        </HStack>
      </Flex>
    </Link>
  );
};

const AIAnalysisCard: React.FC<{
  stock: StockAnalysis;
  analysis: AIAnalysisResponse | null;
  isLoading: boolean;
}> = ({ stock, analysis, isLoading }) => {
  const tier = getMarketCapTier(stock.market_cap);
  const tierColor = getMarketCapTierColor(tier);

  return (
    <Surface p={4}>
      <Flex justify="space-between" align="center" mb={3}>
        <HStack>
          <Badge colorPalette={tierColor} variant="subtle">{tier.toUpperCase()}</Badge>
          <Heading size="sm" color="fg.default" letterSpacing="tight">{stock.symbol}</Heading>
        </HStack>
        <Num value={stock.price} prefix="$" color="fg.muted" fontSize="sm" />
      </Flex>
      {isLoading ? (
        <Flex justify="center" py={4}>
          <Spinner color="accent.solid" />
        </Flex>
      ) : analysis?.success ? (
        <Box>
          <Box maxH="9rem" overflow="hidden">
            <MarkdownContent fontSize="sm" color="fg.muted">{analysis.analysis || ''}</MarkdownContent>
          </Box>
          <Text color="fg.subtle" fontSize="xs" mt={2}>
            Model: {analysis.model_used}
          </Text>
        </Box>
      ) : (
        <Text color="fg.subtle" fontSize="sm">
          {analysis?.error || 'AI analysis not available'}
        </Text>
      )}
    </Surface>
  );
};

const SectionCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  linkTo?: string;
  linkText?: string;
}> = ({ title, icon, children, linkTo, linkText }) => (
  <Surface p={4}>
    <Flex justify="space-between" align="center" mb={3}>
      <HStack gap={2}>
        {icon}
        <Heading size="sm" color="fg.default" fontWeight="semibold">{title}</Heading>
      </HStack>
      {linkTo && (
        <Link to={linkTo}>
          <Text color="accent.fg" fontSize="sm" _hover={{ textDecoration: 'underline' }}>
            {linkText || 'View All →'}
          </Text>
        </Link>
      )}
    </Flex>
    <Box>{children}</Box>
  </Surface>
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

    const interval = setInterval(fetchMarketSummary, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchMarketSummary, checkAIStatus]);

  useEffect(() => {
    if (aiEnabled && summary?.most_oversold) {
      summary.most_oversold.slice(0, 3).forEach(stock => {
        fetchAIAnalysis(stock.symbol);
      });
    }
  }, [aiEnabled, summary?.most_oversold, fetchAIAnalysis]);

  if (loading) {
    return (
      <Container maxW="container.xl" py={8}>
        <Flex justify="center" align="center" minH="50vh">
          <Spinner size="xl" color="accent.solid" />
        </Flex>
      </Container>
    );
  }

  if (error || !summary) {
    return (
      <Container maxW="container.xl" py={8}>
        <Flex justify="center" align="center" minH="50vh">
          <VStack>
            <Box color="signal.down.fg"><AlertCircle size={48} /></Box>
            <Text color="signal.down.fg">{error || 'Failed to load data'}</Text>
          </VStack>
        </Flex>
      </Container>
    );
  }

  return (
    <Container maxW="container.xl" py={8}>
      <PageHeader
        title="Market Overview"
        subtitle={
          <>
            Analyzing {summary.total_stocks.toLocaleString()} stocks · Last updated {new Date(summary.generated_at).toLocaleTimeString()}
          </>
        }
      />

      {/* Quick Stats */}
      <SimpleGrid columns={{ base: 2, md: 4 }} gap={3} mb={6}>
        <StatBlock label="Total Stocks" value={summary.total_stocks} valueDecimals={0} size="md" />
        <StatBlock label="Top Gainers" value={summary.top_gainers.length} valueIntent="up" valueDecimals={0} size="md" />
        <StatBlock label="Top Losers" value={summary.top_losers.length} valueIntent="down" valueDecimals={0} size="md" />
        <StatBlock label="Oversold (RSI < 30)" value={summary.most_oversold.length} valueIntent="warn" valueDecimals={0} size="md" />
      </SimpleGrid>

      {/* Main Content Grid */}
      <SimpleGrid columns={{ base: 1, lg: 2 }} gap={4} mb={6}>
        <SectionCard
          title="Top Gainers"
          icon={<Box color="signal.up.fg"><TrendingUp size={18} /></Box>}
          linkTo="/stocks?sort_by=price_change_percent&sort_order=desc"
        >
          <VStack gap={0} align="stretch">
            {summary.top_gainers.slice(0, 5).map(stock => (
              <CompactStockRow key={stock.symbol} stock={stock} />
            ))}
            {summary.top_gainers.length === 0 && (
              <Text color="fg.subtle">No gainers data available</Text>
            )}
          </VStack>
        </SectionCard>

        <SectionCard
          title="Top Losers"
          icon={<Box color="signal.down.fg"><TrendingDown size={18} /></Box>}
          linkTo="/stocks?sort_by=price_change_percent&sort_order=asc"
        >
          <VStack gap={0} align="stretch">
            {summary.top_losers.slice(0, 5).map(stock => (
              <CompactStockRow key={stock.symbol} stock={stock} />
            ))}
            {summary.top_losers.length === 0 && (
              <Text color="fg.subtle">No losers data available</Text>
            )}
          </VStack>
        </SectionCard>

        <SectionCard
          title="Most Oversold (Opportunities)"
          icon={<Box color="signal.warn.fg"><Target size={18} /></Box>}
          linkTo="/opportunities"
        >
          <VStack gap={0} align="stretch">
            {summary.most_oversold.slice(0, 5).map(stock => (
              <CompactStockRow key={stock.symbol} stock={stock} showChange={false} showRSI />
            ))}
            {summary.most_oversold.length === 0 && (
              <Text color="fg.subtle">No oversold stocks found</Text>
            )}
          </VStack>
        </SectionCard>

        <SectionCard
          title="Mega Cap Highlights ($200B+)"
          icon={<Box color="accent.fg"><DollarSign size={18} /></Box>}
          linkTo="/stocks?min_market_cap=200000000000"
        >
          <VStack gap={0} align="stretch">
            {summary.mega_cap_highlights.slice(0, 5).map(stock => (
              <CompactStockRow key={stock.symbol} stock={stock} />
            ))}
            {summary.mega_cap_highlights.length === 0 && (
              <Text color="fg.subtle">No mega cap stocks found</Text>
            )}
          </VStack>
        </SectionCard>
      </SimpleGrid>

      {aiEnabled && summary.most_oversold.length > 0 && (
        <Box mb={8}>
          <HStack gap={2} mb={4} color="accent.fg">
            <Sparkles size={18} />
            <Heading size="md" color="fg.default" fontWeight="semibold">
              AI Analysis — Top Oversold Opportunities
            </Heading>
          </HStack>
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
