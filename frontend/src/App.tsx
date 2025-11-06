import React, { useState, useEffect, createElement } from 'react';
import {
  Box,
  Container,
  Heading,
  VStack,
  HStack,
  Text,
  Badge,
  SimpleGrid,
  Spinner,
  Flex,
  Spacer,
  Button,
} from '@chakra-ui/react';
import { MdRefresh } from 'react-icons/md';
import StockCard from './components/StockCard';
import FilterPanel from './components/FilterPanel';
import ProgressBar from './components/ProgressBar';
import { useWebSocket } from './hooks';
import { api } from './api';
import { StockAnalysis, StockFilter, AnalysisProgress } from './types';
import { toaster } from './components/ui/toaster';

function App() {
  const { stocks: wsStocks, isConnected } = useWebSocket();
  const [stocks, setStocks] = useState<StockAnalysis[]>([]);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<StockFilter>({});

  // Fetch initial data
  useEffect(() => {
    fetchStocks();
    fetchProgress();
    const progressInterval = setInterval(fetchProgress, 5000);
    return () => clearInterval(progressInterval);
  }, []);

  // Update stocks from WebSocket
  useEffect(() => {
    if (Array.isArray(wsStocks) && wsStocks.length > 0) {
      setStocks(wsStocks);
      setLoading(false);
    }
  }, [wsStocks]);

  const fetchStocks = async () => {
    try {
      setLoading(true);
      const data = await api.getStocks();
      setStocks(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError('Failed to fetch stocks');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProgress = async () => {
    try {
      const data = await api.getProgress();
      setProgress(data);
    } catch (err) {
      console.error('Failed to fetch progress:', err);
    }
  };

  const handleApplyFilter = async (filter: StockFilter) => {
    try {
      setLoading(true);
      setActiveFilter(filter);
      
      // Check if filter is empty
      const isEmptyFilter = Object.keys(filter).length === 0 || 
        Object.values(filter).every(v => v === undefined || v === false);

      let data;
      if (isEmptyFilter) {
        data = await api.getStocks();
      } else {
        data = await api.filterStocks(filter);
      }
      
      const safeData = Array.isArray(data) ? data : [];
      setStocks(safeData);
      
      toaster.create({
        title: 'Filters applied',
        description: `Showing ${safeData.length} stocks`,
        type: 'success',
        duration: 3000,
      });
    } catch (err) {
      toaster.create({
        title: 'Filter failed',
        description: 'Failed to apply filters',
        type: 'error',
        duration: 3000,
      });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const countActiveFilters = () => {
    return Object.values(activeFilter).filter(v => v !== undefined && v !== false).length;
  };

  const oversoldCount = Array.isArray(stocks) ? stocks.filter(s => s.is_oversold).length : 0;
  const overboughtCount = Array.isArray(stocks) ? stocks.filter(s => s.is_overbought).length : 0;

  return (
    <Box bg="gray.50" minH="100vh" py={8}>
        <Container maxW="container.xl">
          <VStack gap={6} align="stretch">
            {/* Header */}
            <Box>
              <Heading as="h1" size="2xl" color="blue.600" mb={2}>
                🚀 Auto Stock Analyser
              </Heading>
              <Text fontSize="lg" color="gray.600">
                Real-time stock analysis with technical indicators
              </Text>
            </Box>

            {/* Connection Status */}
            <HStack>
              <Badge colorScheme={isConnected ? 'green' : 'red'} fontSize="sm" px={3} py={1}>
                {isConnected ? '🟢 Live Updates' : '🔴 Disconnected'}
              </Badge>
              <Badge colorScheme="blue" fontSize="sm" px={3} py={1}>
                📊 {Array.isArray(stocks) ? stocks.length : 0} Stocks
              </Badge>
              {oversoldCount > 0 && (
                <Badge colorScheme="green" fontSize="sm" px={3} py={1}>
                  ⚠️ {oversoldCount} Oversold
                </Badge>
              )}
              {overboughtCount > 0 && (
                <Badge colorScheme="red" fontSize="sm" px={3} py={1}>
                  ⚠️ {overboughtCount} Overbought
                </Badge>
              )}
            </HStack>

            {/* Progress Bar */}
            {progress && <ProgressBar progress={progress} />}

            {/* Controls */}
            <Flex>
              <HStack gap={3}>
                <FilterPanel
                  onApplyFilter={handleApplyFilter}
                  activeFilterCount={countActiveFilters()}
                />
                <Button
                  onClick={fetchStocks}
                  variant="outline"
                  colorScheme="blue"
                  display="flex"
                  alignItems="center"
                  gap={2}
                >
                  {createElement(MdRefresh as any)}
                  Refresh
                </Button>
              </HStack>
              <Spacer />
            </Flex>

            {/* Error Message */}
            {error && (
              <Box bg="red.100" p={4} borderRadius="md" color="red.800">
                <Text fontWeight="bold">Error!</Text>
                <Text>{error}</Text>
              </Box>
            )}

            {/* Loading State */}
            {loading && (!Array.isArray(stocks) || stocks.length === 0) && (
              <Box textAlign="center" py={10}>
                <Spinner size="xl" color="blue.500" borderWidth="4px" />
                <Text mt={4} fontSize="lg" color="gray.600">
                  Loading stocks...
                </Text>
              </Box>
            )}

            {/* Empty State */}
            {!loading && (!Array.isArray(stocks) || stocks.length === 0) && (
              <Box bg="blue.100" p={4} borderRadius="md" color="blue.800">
                <Text fontWeight="bold">No stocks found</Text>
                <Text>
                  The analysis engine is still running. Stocks will appear here once analyzed.
                </Text>
              </Box>
            )}

            {/* Stock Grid */}
            {Array.isArray(stocks) && stocks.length > 0 && (
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={6}>
                {stocks.map((stock) => (
                  <StockCard key={stock.symbol} stock={stock} />
                ))}
              </SimpleGrid>
            )}
          </VStack>
        </Container>
      </Box>
  );
}

export default App;
