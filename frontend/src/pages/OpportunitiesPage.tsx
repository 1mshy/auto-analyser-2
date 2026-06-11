import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Container,
  Heading,
  Text,
  SimpleGrid,
  Flex,
  HStack,
  VStack,
  Button,
} from '@chakra-ui/react';
import { Target, TrendingUp, Zap, RefreshCw } from 'lucide-react';
import MarkdownContent from '../components/MarkdownContent';
import { StockAnalysis, StockFilter } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { WatchButton } from '../components/alerts/WatchButton';
import { Surface, Num, SignalBadge, TierBadge, PageHeader, EmptyState, ErrorState, SkeletonCard, SkeletonText } from '../components/ui/primitives';
import { useFilterStocks, useAIStatus, useAIAnalysis } from '../queries';

// AI Analysis card with auto-trigger
const OpportunityCard: React.FC<{
  stock: StockAnalysis;
  /** Delay before auto-requesting AI analysis; null disables auto-trigger. */
  autoAnalyzeDelayMs: number | null;
}> = ({ stock, autoAnalyzeDelayMs }) => {
  const [requested, setRequested] = useState(false);

  // Staggered auto-trigger for top-priority stocks (avoids rate limiting).
  useEffect(() => {
    if (autoAnalyzeDelayMs == null) return;
    const timer = setTimeout(() => setRequested(true), autoAnalyzeDelayMs);
    return () => clearTimeout(timer);
  }, [autoAnalyzeDelayMs]);

  const aiQuery = useAIAnalysis(stock.symbol, requested);
  const aiAnalysis = aiQuery.data ?? null;
  const aiLoading = requested && aiQuery.isLoading;

  const getPriorityScore = () => {
    let score = 0;
    if (stock.rsi && stock.rsi < 25) score += 3;
    else if (stock.rsi && stock.rsi < 30) score += 2;

    if (stock.market_cap && stock.market_cap >= 200_000_000_000) score += 3;
    else if (stock.market_cap && stock.market_cap >= 10_000_000_000) score += 2;
    else if (stock.market_cap && stock.market_cap >= 2_000_000_000) score += 1;

    if (stock.macd && stock.macd.histogram > 0) score += 1;

    return score;
  };

  const priority = getPriorityScore();
  const accent = priority >= 5 ? 'up' : priority >= 3 ? 'warn' : undefined;
  const priorityTone = priority >= 5 ? 'up' : priority >= 3 ? 'warn' : 'neutral';

  return (
    <Surface p={4} accent={accent} variant="raised">
      <Flex justify="space-between" align="start" mb={3}>
        <VStack align="start" gap={1}>
          <HStack>
            <TierBadge marketCap={stock.market_cap} variant="subtle" />
            <SignalBadge tone={priorityTone}>Priority: {priority}</SignalBadge>
          </HStack>
          <HStack>
            <Link to={`/stocks/${encodeURIComponent(stock.symbol)}`}>
              <Heading size="md" color="fg.default" letterSpacing="tight" _hover={{ color: 'accent.fg' }}>
                {stock.symbol}
              </Heading>
            </Link>
            <WatchButton symbol={stock.symbol} size="xs" />
          </HStack>
        </VStack>
        <VStack align="end" gap={0}>
          <Num value={stock.price} prefix="$" fontWeight="semibold" color="fg.default" />
          <Num
            value={stock.price_change_percent}
            intent="auto"
            sign="always"
            suffix="%"
            fontSize="sm"
          />
        </VStack>
      </Flex>

      <HStack gap={2} mb={4} wrap="wrap">
        <SignalBadge
          tone={stock.rsi != null && stock.rsi < 30 ? 'up' : 'neutral'}
          size="md"
          className="num"
          data-num=""
        >
          RSI: <Num as="span" value={typeof stock.rsi === 'number' ? stock.rsi : null} decimals={1} color="inherit" fontSize="inherit" />
        </SignalBadge>
        {stock.macd && (
          <SignalBadge tone={stock.macd.histogram > 0 ? 'info' : 'warn'}>
            MACD: {stock.macd.histogram > 0 ? 'Bullish' : 'Bearish'}
          </SignalBadge>
        )}
        {stock.sma_20 && stock.sma_50 && (
          <SignalBadge tone={stock.sma_20 > stock.sma_50 ? 'up' : 'down'}>
            SMA: {stock.sma_20 > stock.sma_50 ? 'Golden' : 'Death'}
          </SignalBadge>
        )}
      </HStack>

      <Box bg="bg.inset" borderRadius="md" borderWidth="1px" borderColor="border.subtle" p={3}>
        <HStack justify="space-between" mb={2}>
          <HStack gap={2}>
            <Box color="accent.fg"><Zap size={14} /></Box>
            <Text fontWeight="semibold" color="fg.default" fontSize="sm">AI Analysis</Text>
          </HStack>
          {!aiAnalysis && !aiLoading && (
            <Button
              size="xs"
              variant="subtle"
              bg="accent.muted"
              color="accent.fg"
              _hover={{ bg: 'accent.subtle' }}
              onClick={() => (requested ? aiQuery.refetch() : setRequested(true))}
            >
              <RefreshCw size={12} /> Analyze
            </Button>
          )}
        </HStack>

        {aiLoading ? (
          <Box py={1}>
            <SkeletonText lines={2} />
            <Text mt={2} color="fg.muted" fontSize="sm">Analyzing…</Text>
          </Box>
        ) : aiAnalysis?.success ? (
          <Box>
            <Box maxH="6rem" overflow="hidden">
              <MarkdownContent fontSize="sm" color="fg.muted">{aiAnalysis.analysis || ''}</MarkdownContent>
            </Box>
            <Text color="fg.subtle" fontSize="xs" mt={2}>
              Model: {aiAnalysis.model_used}
            </Text>
          </Box>
        ) : aiAnalysis ? (
          <Text color="signal.down.fg" fontSize="sm">{aiAnalysis.error}</Text>
        ) : aiQuery.isError ? (
          <Text color="signal.down.fg" fontSize="sm">Failed to load AI analysis</Text>
        ) : (
          <Text color="fg.subtle" fontSize="sm" fontStyle="italic">
            Click "Analyze" to get AI insights
          </Text>
        )}
      </Box>

      <Flex justify="space-between" mt={3}>
        <HStack gap={1}>
          <Text color="fg.subtle" fontSize="xs">Market Cap:</Text>
          <Num value={stock.market_cap} prefix="$" compact color="fg.subtle" fontSize="xs" />
        </HStack>
        <Text color="fg.subtle" fontSize="xs">
          {stock.sector || 'Unknown Sector'}
        </Text>
      </Flex>
    </Surface>
  );
};

export const OpportunitiesPage: React.FC = () => {
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<'oversold' | 'macd'>('oversold');

  // Oversold stocks (RSI < 30) with global market cap + price change filters
  // applied server-side. Previously we over-fetched and filtered client-side,
  // which polluted the feed with runaway gainers.
  const oversoldFilter = useMemo<StockFilter>(() => ({
    max_rsi: 30,
    min_market_cap: settings.minMarketCap ?? undefined,
    max_abs_price_change_percent: settings.maxPriceChangePercent ?? undefined,
    sort_by: 'market_cap',
    sort_order: 'desc',
    page: 1,
    page_size: 50,
  }), [settings.minMarketCap, settings.maxPriceChangePercent]);

  // All stocks, filtered client-side for MACD bullish setups.
  const allFilter = useMemo<StockFilter>(() => ({
    min_market_cap: settings.minMarketCap ?? undefined,
    max_abs_price_change_percent: settings.maxPriceChangePercent ?? undefined,
    sort_by: 'market_cap',
    sort_order: 'desc',
    page: 1,
    page_size: 200,
  }), [settings.minMarketCap, settings.maxPriceChangePercent]);

  const oversoldQuery = useFilterStocks(oversoldFilter);
  const allQuery = useFilterStocks(allFilter);
  const { data: aiStatus } = useAIStatus();
  const aiEnabled = aiStatus?.enabled ?? false;

  const oversoldStocks = useMemo(
    () => oversoldQuery.data?.stocks ?? [],
    [oversoldQuery.data],
  );
  const macdBullish = useMemo(
    () =>
      (allQuery.data?.stocks ?? [])
        .filter(s => s.macd && s.macd.histogram > 0 && s.rsi && s.rsi < 50)
        .slice(0, 50),
    [allQuery.data],
  );

  const loading = oversoldQuery.isLoading || allQuery.isLoading;
  const isError = activeTab === 'oversold' ? oversoldQuery.isError : allQuery.isError;

  // Staggered auto-analysis delays for the top-5 priority oversold stocks
  // (higher market cap + lower RSI = higher priority).
  const autoAnalyzeDelays = useMemo(() => {
    const delays = new Map<string, number>();
    if (!aiEnabled) return delays;
    const prioritized = [...oversoldStocks].sort((a, b) => {
      const capA = a.market_cap || 0;
      const capB = b.market_cap || 0;
      const rsiA = a.rsi || 50;
      const rsiB = b.rsi || 50;
      return (capB - capA) + ((rsiA - rsiB) * 1_000_000_000);
    });
    prioritized.slice(0, 5).forEach((stock, idx) => {
      delays.set(stock.symbol, idx * 2000);
    });
    return delays;
  }, [aiEnabled, oversoldStocks]);

  const currentStocks = activeTab === 'oversold' ? oversoldStocks : macdBullish;

  return (
    <Container maxW="page" py={{ base: 5, md: 8 }}>
      <PageHeader
        eyebrow="Signals"
        title="Investment Opportunities"
        subtitle={`Stocks showing potential buying opportunities based on technical indicators.${aiEnabled ? ' AI analysis auto-triggered for top priority stocks.' : ''}`}
        icon={<Target size={22} />}
      />

      {/* Tab Buttons */}
      <Surface p={2} mb={5} variant="inset" overflowX="auto">
      <HStack gap={2} minW="max-content">
        <Button
          size="sm"
          variant="ghost"
          minH={{ base: '11', md: '8' }}
          bg={activeTab === 'oversold' ? 'signal.up.muted' : 'transparent'}
          color={activeTab === 'oversold' ? 'signal.up.fg' : 'fg.muted'}
          _hover={{
            bg: activeTab === 'oversold' ? 'signal.up.muted' : 'bg.muted',
            color: activeTab === 'oversold' ? 'signal.up.fg' : 'fg.default',
          }}
          onClick={() => setActiveTab('oversold')}
        >
          <Target size={14} />
          <Text ml={2}>Oversold (RSI &lt; 30)</Text>
          <SignalBadge ml={2} tone="up" size="sm">{oversoldStocks.length}</SignalBadge>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          minH={{ base: '11', md: '8' }}
          bg={activeTab === 'macd' ? 'signal.info.muted' : 'transparent'}
          color={activeTab === 'macd' ? 'signal.info.fg' : 'fg.muted'}
          _hover={{
            bg: activeTab === 'macd' ? 'signal.info.muted' : 'bg.muted',
            color: activeTab === 'macd' ? 'signal.info.fg' : 'fg.default',
          }}
          onClick={() => setActiveTab('macd')}
        >
          <TrendingUp size={14} />
          <Text ml={2}>MACD Bullish</Text>
          <SignalBadge ml={2} tone="info" size="sm">{macdBullish.length}</SignalBadge>
        </Button>
      </HStack>
      </Surface>

      {aiEnabled && (
        <Box
          bg="accent.subtle"
          borderWidth="1px"
          borderColor="border.subtle"
          borderLeftWidth="2px"
          borderLeftColor="accent.solid"
          borderRadius="md"
          p={3}
          mb={6}
        >
          <HStack gap={2}>
            <Box color="accent.fg"><Zap size={14} /></Box>
            <Text color="fg.default" fontSize="sm">
              <strong>AI Analysis Active:</strong> Top priority stocks are being analyzed automatically.
              Analysis prioritizes higher market cap stocks with lower RSI values.
            </Text>
          </HStack>
        </Box>
      )}

      {loading ? (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} lines={5} />
          ))}
        </SimpleGrid>
      ) : isError ? (
        <ErrorState
          title="Couldn’t load opportunities"
          description="The stock filter request failed. Check that the backend is reachable, then retry."
          onRetry={() => {
            if (oversoldQuery.isError) oversoldQuery.refetch();
            if (allQuery.isError) allQuery.refetch();
          }}
        />
      ) : currentStocks.length === 0 ? (
        <EmptyState
          icon={<Target size={44} />}
          title="No Opportunities Found"
          description={
            activeTab === 'oversold'
              ? 'No stocks currently have RSI below 30.'
              : 'No stocks currently show MACD bullish crossovers.'
          }
        />
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
          {currentStocks.map(stock => (
            <OpportunityCard
              key={stock.symbol}
              stock={stock}
              autoAnalyzeDelayMs={autoAnalyzeDelays.get(stock.symbol) ?? null}
            />
          ))}
        </SimpleGrid>
      )}
    </Container>
  );
};
