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
  Button,
} from '@chakra-ui/react';
import { Target, TrendingUp, Zap, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { StockAnalysis, StockFilter, AIAnalysisResponse, getMarketCapTier, getMarketCapTierColor, getMarketCapTierLabel } from '../types';

// AI Analysis card with auto-trigger
const OpportunityCard: React.FC<{
  stock: StockAnalysis;
  aiAnalysis: AIAnalysisResponse | null;
  aiLoading: boolean;
  onRequestAnalysis: () => void;
}> = ({ stock, aiAnalysis, aiLoading, onRequestAnalysis }) => {
  const tier = getMarketCapTier(stock.market_cap);
  const tierColor = getMarketCapTierColor(tier);
  const changeColor = (stock.price_change_percent ?? 0) >= 0 ? 'green' : 'red';

  // Priority score based on market cap and RSI
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
  const priorityColor = priority >= 5 ? 'green' : priority >= 3 ? 'yellow' : 'gray';

  return (
    <Card.Root 
      bg="gray.800" 
      borderColor="gray.700"
      borderWidth={priority >= 5 ? 2 : 1}
      borderLeftColor={priority >= 5 ? 'green.400' : priority >= 3 ? 'yellow.400' : 'gray.600'}
      borderLeftWidth={4}
    >
      <Card.Header pb={2}>
        <Flex justify="space-between" align="start">
          <VStack align="start" gap={1}>
            <HStack>
              <Badge colorPalette={tierColor}>{getMarketCapTierLabel(tier)}</Badge>
              <Badge colorPalette={priorityColor}>Priority: {priority}</Badge>
            </HStack>
            <Link to={`/stocks/${stock.symbol}`}>
              <Heading size="md" color="white" _hover={{ color: 'blue.400' }}>
                {stock.symbol}
              </Heading>
            </Link>
          </VStack>
          <VStack align="end" gap={0}>
            <Text fontWeight="bold" color="white">${stock.price?.toFixed(2)}</Text>
            <Text 
              fontSize="sm" 
              color={changeColor === 'green' ? 'green.400' : 'red.400'}
            >
              {stock.price_change_percent !== undefined
                ? `${stock.price_change_percent >= 0 ? '+' : ''}${stock.price_change_percent.toFixed(2)}%`
                : ''}
            </Text>
          </VStack>
        </Flex>
      </Card.Header>

      <Card.Body pt={2}>
        {/* Technical Indicators */}
        <HStack gap={2} mb={4} wrap="wrap">
          <Badge 
            colorPalette={stock.rsi && stock.rsi < 30 ? 'green' : 'gray'}
            size="lg"
          >
            RSI: {stock.rsi?.toFixed(1) || '-'}
          </Badge>
          {stock.macd && (
            <Badge colorPalette={stock.macd.histogram > 0 ? 'blue' : 'orange'}>
              MACD: {stock.macd.histogram > 0 ? 'Bullish' : 'Bearish'}
            </Badge>
          )}
          {stock.sma_20 && stock.sma_50 && (
            <Badge colorPalette={stock.sma_20 > stock.sma_50 ? 'green' : 'red'}>
              SMA: {stock.sma_20 > stock.sma_50 ? 'Golden' : 'Death'}
            </Badge>
          )}
        </HStack>

        {/* AI Analysis */}
        <Box bg="gray.900" borderRadius="md" p={3}>
          <HStack justify="space-between" mb={2}>
            <HStack>
              <Box color="purple.400"><Zap size={16} /></Box>
              <Text fontWeight="semibold" color="white" fontSize="sm">AI Analysis</Text>
            </HStack>
            {!aiAnalysis && !aiLoading && (
              <Button size="xs" onClick={onRequestAnalysis} colorPalette="purple">
                <RefreshCw size={12} /> Analyze
              </Button>
            )}
          </HStack>

          {aiLoading ? (
            <Flex justify="center" py={3}>
              <Spinner size="sm" color="purple.400" />
              <Text ml={2} color="gray.400" fontSize="sm">Analyzing...</Text>
            </Flex>
          ) : aiAnalysis?.success ? (
            <Box>
              <Text color="gray.300" fontSize="sm" lineClamp={4}>
                {aiAnalysis.analysis}
              </Text>
              <Text color="gray.500" fontSize="xs" mt={2}>
                Model: {aiAnalysis.model_used}
              </Text>
            </Box>
          ) : aiAnalysis ? (
            <Text color="red.400" fontSize="sm">{aiAnalysis.error}</Text>
          ) : (
            <Text color="gray.500" fontSize="sm" fontStyle="italic">
              Click "Analyze" to get AI insights
            </Text>
          )}
        </Box>

        {/* Market Info */}
        <Flex justify="space-between" mt={3}>
          <Text color="gray.500" fontSize="xs">
            Market Cap: {stock.market_cap ? `$${(stock.market_cap / 1_000_000_000).toFixed(1)}B` : '-'}
          </Text>
          <Text color="gray.500" fontSize="xs">
            {stock.sector || 'Unknown Sector'}
          </Text>
        </Flex>
      </Card.Body>
    </Card.Root>
  );
};

export const OpportunitiesPage: React.FC = () => {
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

      // Fetch oversold stocks (RSI < 30)
      const oversoldFilter: StockFilter = {
        max_rsi: 30,
        sort_by: 'market_cap',
        sort_order: 'desc',
        page: 1,
        page_size: 50,
      };
      const oversoldResponse = await api.filterStocks(oversoldFilter);
      setOversoldStocks(oversoldResponse.stocks);

      // Fetch all stocks and filter for MACD bullish
      const allFilter: StockFilter = {
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
  }, []);

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
  }, [fetchOpportunities, checkAIStatus]);

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
    <Container maxW="container.xl" py={8}>
      {/* Header */}
      <Box mb={6}>
        <HStack mb={2}>
          <Box color="green.400"><Target size={24} /></Box>
          <Heading size="lg" color="white">Investment Opportunities</Heading>
        </HStack>
        <Text color="gray.400">
          Stocks showing potential buying opportunities based on technical indicators.
          {aiEnabled && ' AI analysis is auto-triggered for top priority stocks.'}
        </Text>
      </Box>

      {/* Tab Buttons */}
      <HStack gap={4} mb={6}>
        <Button
          size="md"
          variant={activeTab === 'oversold' ? 'solid' : 'outline'}
          colorPalette={activeTab === 'oversold' ? 'green' : 'gray'}
          onClick={() => setActiveTab('oversold')}
        >
          <Target size={16} />
          <Text ml={2}>Oversold (RSI &lt; 30)</Text>
          <Badge ml={2} colorPalette="green">{oversoldStocks.length}</Badge>
        </Button>
        <Button
          size="md"
          variant={activeTab === 'macd' ? 'solid' : 'outline'}
          colorPalette={activeTab === 'macd' ? 'blue' : 'gray'}
          onClick={() => setActiveTab('macd')}
        >
          <TrendingUp size={16} />
          <Text ml={2}>MACD Bullish</Text>
          <Badge ml={2} colorPalette="blue">{macdBullish.length}</Badge>
        </Button>
      </HStack>

      {/* AI Status Banner */}
      {aiEnabled && (
        <Box 
          bg="purple.900" 
          borderRadius="md" 
          p={3} 
          mb={6}
          borderLeft="4px solid"
          borderLeftColor="purple.400"
        >
          <HStack>
            <Box color="purple.400"><Zap size={16} /></Box>
            <Text color="white" fontSize="sm">
              <strong>AI Analysis Active:</strong> Top priority stocks are being analyzed automatically.
              Analysis prioritizes higher market cap stocks with lower RSI values.
            </Text>
          </HStack>
        </Box>
      )}

      {/* Content */}
      {loading ? (
        <Flex justify="center" align="center" minH="50vh">
          <Spinner size="xl" color="green.400" />
        </Flex>
      ) : currentStocks.length === 0 ? (
        <Box textAlign="center" py={12}>
          <Box color="gray.600" mb={4}><Target size={48} /></Box>
          <Heading size="md" color="gray.500" mb={2}>No Opportunities Found</Heading>
          <Text color="gray.600">
            {activeTab === 'oversold' 
              ? 'No stocks currently have RSI below 30.'
              : 'No stocks currently show MACD bullish crossovers.'}
          </Text>
        </Box>
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
