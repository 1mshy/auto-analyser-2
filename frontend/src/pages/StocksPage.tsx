import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
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
  Input,
  Table,
  Card,
  IconButton,
} from '@chakra-ui/react';
import { Grid, List, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api, FilterResponse } from '../api';
import { StockAnalysis, StockFilter, PaginationInfo, getMarketCapTier, getMarketCapTierColor, getMarketCapTierLabel } from '../types';

// Compact table row component
const StockTableRow: React.FC<{ stock: StockAnalysis }> = ({ stock }) => {
  const tier = getMarketCapTier(stock.market_cap);
  const tierColor = getMarketCapTierColor(tier);
  const changeColor = (stock.price_change_percent ?? 0) >= 0 ? 'green' : 'red';
  const rsiColor = stock.rsi && stock.rsi < 30 ? 'green' : stock.rsi && stock.rsi > 70 ? 'red' : 'gray';

  return (
    <Table.Row _hover={{ bg: 'whiteAlpha.50' }}>
      <Table.Cell>
        <Link to={`/stocks/${stock.symbol}`}>
          <HStack>
            <Badge colorPalette={tierColor} size="sm">{tier.charAt(0).toUpperCase()}</Badge>
            <Text fontWeight="bold" color="blue.400" _hover={{ textDecoration: 'underline' }}>
              {stock.symbol}
            </Text>
          </HStack>
        </Link>
      </Table.Cell>
      <Table.Cell>
        <Text color="white">${stock.price?.toFixed(2)}</Text>
      </Table.Cell>
      <Table.Cell>
        <Text color={changeColor === 'green' ? 'green.400' : 'red.400'} fontWeight="semibold">
          {stock.price_change_percent !== undefined 
            ? `${stock.price_change_percent >= 0 ? '+' : ''}${stock.price_change_percent.toFixed(2)}%`
            : '-'}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Badge colorPalette={rsiColor}>
          {stock.rsi?.toFixed(1) || '-'}
        </Badge>
      </Table.Cell>
      <Table.Cell>
        <Text color="gray.300" fontSize="sm">
          {stock.market_cap
            ? `$${(stock.market_cap / 1_000_000_000).toFixed(1)}B`
            : '-'}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text color="gray.400" fontSize="sm">
          {stock.sector || '-'}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <HStack gap={1}>
          {stock.is_oversold && <Badge colorPalette="green" size="sm">Oversold</Badge>}
          {stock.is_overbought && <Badge colorPalette="red" size="sm">Overbought</Badge>}
          {stock.macd && stock.macd.histogram > 0 && (
            <Badge colorPalette="blue" size="sm">MACD+</Badge>
          )}
        </HStack>
      </Table.Cell>
    </Table.Row>
  );
};

// Card view component
const StockCardCompact: React.FC<{ stock: StockAnalysis }> = ({ stock }) => {
  const tier = getMarketCapTier(stock.market_cap);
  const tierColor = getMarketCapTierColor(tier);
  const changeColor = (stock.price_change_percent ?? 0) >= 0 ? 'green' : 'red';

  return (
    <Link to={`/stocks/${stock.symbol}`}>
      <Card.Root 
        bg="gray.800" 
        borderColor="gray.700" 
        _hover={{ borderColor: 'blue.500', transform: 'translateY(-2px)' }}
        transition="all 0.2s"
        cursor="pointer"
      >
        <Card.Body p={4}>
          <Flex justify="space-between" align="start" mb={2}>
            <VStack align="start" gap={0}>
              <HStack>
                <Badge colorPalette={tierColor} size="sm">{getMarketCapTierLabel(tier)}</Badge>
              </HStack>
              <Text fontWeight="bold" fontSize="lg" color="white">{stock.symbol}</Text>
            </VStack>
            <VStack align="end" gap={0}>
              <Text fontWeight="bold" color="white">${stock.price?.toFixed(2)}</Text>
              <Text 
                fontSize="sm" 
                fontWeight="semibold"
                color={changeColor === 'green' ? 'green.400' : 'red.400'}
              >
                {stock.price_change_percent !== undefined
                  ? `${stock.price_change_percent >= 0 ? '+' : ''}${stock.price_change_percent.toFixed(2)}%`
                  : '-'}
              </Text>
            </VStack>
          </Flex>

          <Flex justify="space-between" align="center">
            <HStack gap={2}>
              <Badge 
                colorPalette={stock.rsi && stock.rsi < 30 ? 'green' : stock.rsi && stock.rsi > 70 ? 'red' : 'gray'}
              >
                RSI: {stock.rsi?.toFixed(1) || '-'}
              </Badge>
              {stock.macd && (
                <Badge colorPalette={stock.macd.histogram > 0 ? 'blue' : 'orange'}>
                  MACD: {stock.macd.histogram > 0 ? '+' : '-'}
                </Badge>
              )}
            </HStack>
            <Text color="gray.500" fontSize="xs">
              {stock.market_cap ? `$${(stock.market_cap / 1_000_000_000).toFixed(1)}B` : ''}
            </Text>
          </Flex>
        </Card.Body>
      </Card.Root>
    </Link>
  );
};

// Pagination component
const Pagination: React.FC<{
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
}> = ({ pagination, onPageChange }) => {
  const { page, total_pages, total } = pagination;

  return (
    <Flex justify="space-between" align="center" mt={4}>
      <Text color="gray.400" fontSize="sm">
        Showing page {page} of {total_pages} ({total.toLocaleString()} total)
      </Text>
      <HStack>
        <IconButton
          aria-label="Previous page"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft />
        </IconButton>
        <HStack gap={1}>
          {[...Array(Math.min(5, total_pages))].map((_, i) => {
            let pageNum: number;
            if (total_pages <= 5) {
              pageNum = i + 1;
            } else if (page <= 3) {
              pageNum = i + 1;
            } else if (page >= total_pages - 2) {
              pageNum = total_pages - 4 + i;
            } else {
              pageNum = page - 2 + i;
            }
            return (
              <Button
                key={pageNum}
                size="sm"
                variant={page === pageNum ? 'solid' : 'outline'}
                colorPalette={page === pageNum ? 'blue' : 'gray'}
                onClick={() => onPageChange(pageNum)}
              >
                {pageNum}
              </Button>
            );
          })}
        </HStack>
        <IconButton
          aria-label="Next page"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= total_pages}
        >
          <ChevronRight />
        </IconButton>
      </HStack>
    </Flex>
  );
};

export const StocksPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [stocks, setStocks] = useState<StockAnalysis[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, page_size: 50, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [searchTerm, setSearchTerm] = useState('');

  // Parse filter from URL params
  const getFilterFromParams = useCallback((): StockFilter => {
    return {
      sort_by: searchParams.get('sort_by') || 'market_cap',
      sort_order: searchParams.get('sort_order') || 'desc',
      page: parseInt(searchParams.get('page') || '1'),
      page_size: parseInt(searchParams.get('page_size') || '50'),
      min_market_cap: searchParams.get('min_market_cap') ? parseFloat(searchParams.get('min_market_cap')!) : undefined,
      max_market_cap: searchParams.get('max_market_cap') ? parseFloat(searchParams.get('max_market_cap')!) : undefined,
      min_rsi: searchParams.get('min_rsi') ? parseFloat(searchParams.get('min_rsi')!) : undefined,
      max_rsi: searchParams.get('max_rsi') ? parseFloat(searchParams.get('max_rsi')!) : undefined,
      only_oversold: searchParams.get('only_oversold') === 'true',
      only_overbought: searchParams.get('only_overbought') === 'true',
    };
  }, [searchParams]);

  const fetchStocks = useCallback(async () => {
    try {
      setLoading(true);
      const filter = getFilterFromParams();
      const response: FilterResponse = await api.filterStocks(filter);
      setStocks(response.stocks);
      setPagination(response.pagination);
    } catch (err) {
      console.error('Failed to fetch stocks:', err);
    } finally {
      setLoading(false);
    }
  }, [getFilterFromParams]);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    setSearchParams(params);
  };

  const handleSortChange = (sortBy: string) => {
    const params = new URLSearchParams(searchParams);
    const currentSortBy = params.get('sort_by') || 'market_cap';
    const currentOrder = params.get('sort_order') || 'desc';
    
    if (currentSortBy === sortBy) {
      // Toggle order
      params.set('sort_order', currentOrder === 'desc' ? 'asc' : 'desc');
    } else {
      params.set('sort_by', sortBy);
      params.set('sort_order', 'desc');
    }
    params.set('page', '1');
    setSearchParams(params);
  };

  const handlePageSizeChange = (size: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page_size', size.toString());
    params.set('page', '1');
    setSearchParams(params);
  };

  // Filter stocks by search term (client-side)
  const filteredStocks = searchTerm
    ? stocks.filter(s => s.symbol.toLowerCase().includes(searchTerm.toLowerCase()))
    : stocks;

  const currentSort = searchParams.get('sort_by') || 'market_cap';
  const currentOrder = searchParams.get('sort_order') || 'desc';

  return (
    <Container maxW="container.xl" py={8}>
      {/* Header */}
      <Box mb={6}>
        <Heading size="lg" color="white" mb={2}>All Stocks</Heading>
        <Text color="gray.400">
          Browse and filter all analyzed stocks
        </Text>
      </Box>

      {/* Controls */}
      <Flex justify="space-between" align="center" mb={6} wrap="wrap" gap={4}>
        {/* Search */}
        <HStack flex={1} maxW="300px">
          <Box position="relative" flex={1}>
            <Box 
              position="absolute" 
              left={3} 
              top="50%" 
              transform="translateY(-50%)" 
              color="gray.400"
            >
              <Search />
            </Box>
            <Input
              placeholder="Search symbol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              pl={10}
              bg="gray.800"
              borderColor="gray.600"
              color="white"
            />
          </Box>
        </HStack>

        {/* Sort Buttons */}
        <HStack>
          <Button
            size="sm"
            variant={currentSort === 'market_cap' ? 'solid' : 'outline'}
            colorPalette={currentSort === 'market_cap' ? 'blue' : 'gray'}
            onClick={() => handleSortChange('market_cap')}
          >
            Market Cap {currentSort === 'market_cap' ? (currentOrder === 'desc' ? '↓' : '↑') : ''}
          </Button>
          <Button
            size="sm"
            variant={currentSort === 'price_change_percent' ? 'solid' : 'outline'}
            colorPalette={currentSort === 'price_change_percent' ? 'blue' : 'gray'}
            onClick={() => handleSortChange('price_change_percent')}
          >
            Change % {currentSort === 'price_change_percent' ? (currentOrder === 'desc' ? '↓' : '↑') : ''}
          </Button>
          <Button
            size="sm"
            variant={currentSort === 'rsi' ? 'solid' : 'outline'}
            colorPalette={currentSort === 'rsi' ? 'blue' : 'gray'}
            onClick={() => handleSortChange('rsi')}
          >
            RSI {currentSort === 'rsi' ? (currentOrder === 'desc' ? '↓' : '↑') : ''}
          </Button>
        </HStack>

        {/* Page Size */}
        <HStack>
          {[25, 50, 100].map(size => (
            <Button
              key={size}
              size="sm"
              variant={pagination.page_size === size ? 'solid' : 'outline'}
              colorPalette={pagination.page_size === size ? 'gray' : 'gray'}
              onClick={() => handlePageSizeChange(size)}
            >
              {size}
            </Button>
          ))}
        </HStack>

        {/* View Toggle */}
        <HStack>
          <IconButton
            aria-label="Table view"
            variant={viewMode === 'table' ? 'solid' : 'outline'}
            colorPalette={viewMode === 'table' ? 'blue' : 'gray'}
            size="sm"
            onClick={() => setViewMode('table')}
          >
            <List />
          </IconButton>
          <IconButton
            aria-label="Card view"
            variant={viewMode === 'card' ? 'solid' : 'outline'}
            colorPalette={viewMode === 'card' ? 'blue' : 'gray'}
            size="sm"
            onClick={() => setViewMode('card')}
          >
            <Grid />
          </IconButton>
        </HStack>
      </Flex>

      {/* Content */}
      {loading ? (
        <Flex justify="center" align="center" minH="50vh">
          <Spinner size="xl" color="blue.400" />
        </Flex>
      ) : viewMode === 'table' ? (
        <Box overflowX="auto">
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader color="gray.400">Symbol</Table.ColumnHeader>
                <Table.ColumnHeader color="gray.400">Price</Table.ColumnHeader>
                <Table.ColumnHeader color="gray.400">Change</Table.ColumnHeader>
                <Table.ColumnHeader color="gray.400">RSI</Table.ColumnHeader>
                <Table.ColumnHeader color="gray.400">Market Cap</Table.ColumnHeader>
                <Table.ColumnHeader color="gray.400">Sector</Table.ColumnHeader>
                <Table.ColumnHeader color="gray.400">Signals</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {filteredStocks.map(stock => (
                <StockTableRow key={stock.symbol} stock={stock} />
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      ) : (
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 4 }} gap={4}>
          {filteredStocks.map(stock => (
            <StockCardCompact key={stock.symbol} stock={stock} />
          ))}
        </SimpleGrid>
      )}

      {/* Pagination */}
      {!loading && pagination.total_pages > 1 && (
        <Pagination pagination={pagination} onPageChange={handlePageChange} />
      )}
    </Container>
  );
};
