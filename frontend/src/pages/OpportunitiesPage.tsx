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
  Button,
} from '@chakra-ui/react';
import { Target, TrendingUp, Zap, RefreshCw } from 'lucide-react';
import { api } from '../api';
import MarkdownContent from '../components/MarkdownContent';
import { StockAnalysis, StockFilter, AIAnalysisResponse, getMarketCapTier, getMarketCapTierColor, getMarketCapTierLabel } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { WatchButton } from '../components/alerts/WatchButton';
import { Surface, Num, SignalBadge, PageHeader, EmptyState } from '../components/ui/primitives';

// AI Analysis card with auto-trigger
const OpportunityCard: React.FC<{
  stock: StockAnalysis;
  aiAnalysis: AIAnalysisResponse | null;
  aiLoading: boolean;
  onRequestAnalysis: () => void;
}> = ({ stock, aiAnalysis, aiLoading, onRequestAnalysis }) => {
  const tier = getMarketCapTier(stock.market_cap);
  const tierColor = getMarketCapTierColor(tier);

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
            <Badge colorPalette={tierColor} variant="subtle">{getMarketCapTierLabel(tier)}</Badge>
            <SignalBadge tone={priorityTone}>Priority: {priority}</SignalBadge>
          </HStack>
          <HStack>
            <Link to={`/stocks/${stock.symbol}`}>
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
          RSI: {stock.rsi != null && typeof stock.rsi === 'number' ? stock.rsi.toFixed(1) : '-'}
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
            <Button size="xs" onClick={onRequestAnalysis} colorPalette="blue" variant="subtle">
              <RefreshCw size={12} /> Analyze
            </Button>
          )}
        </HStack>

        {aiLoading ? (
          <Flex justify="center" py={3}>
            <Spinner size="sm" color="accent.solid" />
            <Text ml={2} color="fg.muted" fontSize="sm">Analyzing...</Text>
          </Flex>
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
  const [oversoldStocks, setOversoldStocks] = useState<StockAnalysis[]>([]);
  const [macdBullish, setMacdBullish] = useState<StockAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiAnalyses, setAiAnalyses] = useState<Record<string, AIAnalysisResponse>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'oversold' | 'macd'>('oversold');

  const fetchOpportunities = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch oversold stocks (RSI < 30) with global market cap + price
      // change filters applied server-side. Previously we over-fetched and
      // filtered client-side, which polluted the feed with runaway gainers.
      const oversoldFilter: StockFilter = {
        max_rsi: 30,
        min_market_cap: settings.minMarketCap ?? undefined,
        max_abs_price_change_percent: settings.maxPriceChangePercent ?? undefined,
        sort_by: 'market_cap',
        sort_order: 'desc',
        page: 1,
        page_size: 50,
      };
      const oversoldResponse = await api.filterStocks(oversoldFilter);
      setOversoldStocks(oversoldResponse.stocks);

      // Fetch all stocks and filter for MACD bullish with global market cap filter
      const allFilter: StockFilter = {
        min_market_cap: settings.minMarketCap ?? undefined,
        max_abs_price_change_percent: settings.maxPriceChangePercent ?? undefined,
        sort_by: 'market_cap',
        sort_order: 'desc',
        page: 1,
        page_size: 200,
      };
      const allResponse = await api.filterStocks(allFilter);
      const bullish = allResponse.stocks.filter(
        s => s.macd && s.macd.histogram > 0 && s.rsi && s.rsi < 50
      );
      setMacdBullish(bullish.slice(0, 50));

    } catch (err) {
      console.error('Failed to fetch opportunities:', err);
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
    fetchOpportunities();
    checkAIStatus();
    // Re-fetch when settings change
  }, [fetchOpportunities, checkAIStatus, settings]);

  // Auto-trigger AI analysis for top priority stocks when AI is enabled
  useEffect(() => {
    if (aiEnabled && oversoldStocks.length > 0) {
      // Sort by priority (market cap + low RSI)
      const prioritized = [...oversoldStocks].sort((a, b) => {
        const capA = a.market_cap || 0;
        const capB = b.market_cap || 0;
        const rsiA = a.rsi || 50;
        const rsiB = b.rsi || 50;
        // Higher market cap and lower RSI = higher priority
        return (capB - capA) + ((rsiA - rsiB) * 1_000_000_000);
      });

      // Auto-analyze top 5 priority stocks
      prioritized.slice(0, 5).forEach((stock, idx) => {
        if (!aiAnalyses[stock.symbol] && !aiLoading[stock.symbol]) {
          // Stagger requests to avoid rate limiting
          setTimeout(() => fetchAIAnalysis(stock.symbol), idx * 2000);
        }
      });
    }
  }, [aiEnabled, oversoldStocks, aiAnalyses, aiLoading, fetchAIAnalysis]);

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
          variant={activeTab === 'oversold' ? 'solid' : 'ghost'}
          colorPalette={activeTab === 'oversold' ? 'green' : 'gray'}
          onClick={() => setActiveTab('oversold')}
        >
          <Target size={14} />
          <Text ml={2}>Oversold (RSI &lt; 30)</Text>
          <SignalBadge ml={2} tone="up" size="sm">{oversoldStocks.length}</SignalBadge>
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'macd' ? 'solid' : 'ghost'}
          colorPalette={activeTab === 'macd' ? 'blue' : 'gray'}
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
        <Flex justify="center" align="center" minH="50vh">
          <Spinner size="xl" color="accent.solid" />
        </Flex>
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
              aiAnalysis={aiAnalyses[stock.symbol] || null}
              aiLoading={aiLoading[stock.symbol] || false}
              onRequestAnalysis={() => fetchAIAnalysis(stock.symbol)}
            />
          ))}
        </SimpleGrid>
      )}
    </Container>
  );
};
