import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Box,
  Container,
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
  IconButton,
} from '@chakra-ui/react';
import { Grid, List, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api, FilterResponse } from '../api';
import { StockAnalysis, StockFilter, PaginationInfo, getMarketCapTier, getMarketCapTierColor, getMarketCapTierLabel } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { Surface, Num, SignalBadge, PageHeader } from '../components/ui/primitives';

const StockTableRow: React.FC<{ stock: StockAnalysis }> = ({ stock }) => {
  const tier = getMarketCapTier(stock.market_cap);
  const tierColor = getMarketCapTierColor(tier);
  const rsiTone = stock.rsi && stock.rsi < 30 ? 'up' : stock.rsi && stock.rsi > 70 ? 'down' : 'neutral';

  return (
    <Table.Row _hover={{ bg: 'bg.muted' }} borderBottomWidth="1px" borderColor="border.subtle">
      <Table.Cell>
        <Link to={`/stocks/${stock.symbol}`}>
          <HStack>
            <Badge colorPalette={tierColor} size="sm" variant="subtle">{tier.charAt(0).toUpperCase()}</Badge>
            <Text fontWeight="semibold" color="accent.fg" _hover={{ textDecoration: 'underline' }}>
              {stock.symbol}
            </Text>
          </HStack>
        </Link>
      </Table.Cell>
      <Table.Cell textAlign="right">
        <Num value={stock.price} prefix="$" color="fg.default" />
      </Table.Cell>
      <Table.Cell textAlign="right">
        <Num
          value={stock.price_change_percent}
          intent="auto"
          sign="always"
          suffix="%"
          fontWeight="semibold"
        />
      </Table.Cell>
      <Table.Cell textAlign="right">
        <SignalBadge tone={rsiTone} className="num" data-num="">
          {stock.rsi != null && typeof stock.rsi === 'number' ? stock.rsi.toFixed(1) : '-'}
        </SignalBadge>
      </Table.Cell>
      <Table.Cell textAlign="right">
        <Num
          value={stock.market_cap}
          prefix="$"
          compact
          color="fg.muted"
          fontSize="sm"
        />
      </Table.Cell>
      <Table.Cell>
        <Text color="fg.muted" fontSize="sm">
          {stock.sector || '-'}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <HStack gap={1}>
          {stock.is_oversold && <SignalBadge tone="up" size="sm">Oversold</SignalBadge>}
          {stock.is_overbought && <SignalBadge tone="down" size="sm">Overbought</SignalBadge>}
          {stock.macd && stock.macd.histogram > 0 && (
            <SignalBadge tone="info" size="sm">MACD+</SignalBadge>
          )}
        </HStack>
      </Table.Cell>
    </Table.Row>
  );
};

const StockCardCompact: React.FC<{ stock: StockAnalysis }> = ({ stock }) => {
  const tier = getMarketCapTier(stock.market_cap);
  const tierColor = getMarketCapTierColor(tier);

  return (
    <Link to={`/stocks/${stock.symbol}`}>
      <Surface interactive p={4}>
        <Flex justify="space-between" align="start" mb={2}>
          <VStack align="start" gap={0}>
            <Badge colorPalette={tierColor} size="sm" variant="subtle">{getMarketCapTierLabel(tier)}</Badge>
            <Text fontWeight="semibold" fontSize="lg" color="fg.default" letterSpacing="tight">{stock.symbol}</Text>
          </VStack>
          <VStack align="end" gap={0}>
            <Num value={stock.price} prefix="$" fontWeight="semibold" color="fg.default" />
            <Num
              value={stock.price_change_percent}
              intent="auto"
              sign="always"
              suffix="%"
              fontSize="sm"
              fontWeight="semibold"
            />
          </VStack>
        </Flex>

        <Flex justify="space-between" align="center">
          <HStack gap={2}>
            <SignalBadge
              tone={stock.rsi != null && stock.rsi < 30 ? 'up' : stock.rsi != null && stock.rsi > 70 ? 'down' : 'neutral'}
              className="num"
              data-num=""
            >
              RSI: {stock.rsi != null && typeof stock.rsi === 'number' ? stock.rsi.toFixed(1) : '-'}
            </SignalBadge>
            {stock.macd && (
              <SignalBadge tone={stock.macd.histogram > 0 ? 'info' : 'warn'}>
                MACD: {stock.macd.histogram > 0 ? '+' : '-'}
              </SignalBadge>
            )}
          </HStack>
          <Num value={stock.market_cap} prefix="$" compact color="fg.subtle" fontSize="xs" />
        </Flex>
      </Surface>
    </Link>
  );
};

const Pagination: React.FC<{
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
}> = ({ pagination, onPageChange }) => {
  const { page, total_pages, total } = pagination;

  return (
    <Flex justify="space-between" align="center" mt={4}>
      <Text color="fg.muted" fontSize="sm">
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
  const { settings } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stocks, setStocks] = useState<StockAnalysis[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, page_size: 50, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 200);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Parse filter from URL params and apply global settings
  const getFilterFromParams = useCallback((): StockFilter => {
    // Get URL-based min market cap or use global settings
    const urlMinMarketCap = searchParams.get('min_market_cap') ? parseFloat(searchParams.get('min_market_cap')!) : undefined;
    const globalMinMarketCap = settings.minMarketCap ?? undefined;
    
    // Use the larger of the two (URL takes precedence if explicitly higher)
    const effectiveMinMarketCap = urlMinMarketCap !== undefined && globalMinMarketCap !== undefined
      ? Math.max(urlMinMarketCap, globalMinMarketCap)
      : urlMinMarketCap ?? globalMinMarketCap;

    return {
      sort_by: searchParams.get('sort_by') || 'market_cap',
      sort_order: searchParams.get('sort_order') || 'desc',
      // When a search is active, always start at page 1 — page in the URL is
      // bound to the unfiltered result set and would otherwise overshoot.
      page: debouncedSearch ? 1 : parseInt(searchParams.get('page') || '1'),
      page_size: parseInt(searchParams.get('page_size') || '50'),
      min_market_cap: effectiveMinMarketCap,
      max_market_cap: searchParams.get('max_market_cap') ? parseFloat(searchParams.get('max_market_cap')!) : undefined,
      min_rsi: searchParams.get('min_rsi') ? parseFloat(searchParams.get('min_rsi')!) : undefined,
      max_rsi: searchParams.get('max_rsi') ? parseFloat(searchParams.get('max_rsi')!) : undefined,
      only_oversold: searchParams.get('only_oversold') === 'true',
      only_overbought: searchParams.get('only_overbought') === 'true',
      symbol_search: debouncedSearch || undefined,
    };
  }, [searchParams, settings, debouncedSearch]);

  const fetchStocks = useCallback(async () => {
    try {
      setLoading(true);
      const filter = getFilterFromParams();
      const response: FilterResponse = await api.filterStocks(filter);
      
      // Apply max price change filter client-side if global setting is set
      let filteredStocks = response.stocks;
      if (settings.maxPriceChangePercent) {
        filteredStocks = filteredStocks.filter(s => 
          s.price_change_percent === undefined || 
          Math.abs(s.price_change_percent) <= settings.maxPriceChangePercent!
        );
      }
      
      setStocks(filteredStocks);
      setPagination(response.pagination);
    } catch (err) {
      console.error('Failed to fetch stocks:', err);
    } finally {
      setLoading(false);
    }
  }, [getFilterFromParams, settings]);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks, settings]);

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
  // Backend now handles symbol search across the entire universe via
  // `symbol_search`, so we just render whatever the API returned.
  const filteredStocks = stocks;

  const currentSort = searchParams.get('sort_by') || 'market_cap';
  const currentOrder = searchParams.get('sort_order') || 'desc';

  return (
    <Container maxW="page" py={{ base: 5, md: 8 }}>
      <PageHeader
        eyebrow="Universe"
        title="All Stocks"
        subtitle={`${pagination.total.toLocaleString()} analyzed stocks · ${filteredStocks.length.toLocaleString()} visible in this view`}
        actions={
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
        }
      />

      {/* Controls */}
      <Surface p={3} mb={5} variant="raised">
      <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
        <HStack flex={1} minW={{ base: '100%', md: '260px' }} maxW={{ base: '100%', md: '360px' }}>
          <Box position="relative" flex={1}>
            <Box
              position="absolute"
              left={3}
              top="50%"
              transform="translateY(-50%)"
              color="fg.muted"
              zIndex={1}
            >
              <Search size={16} />
            </Box>
            <Input
              placeholder="Search symbol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              pl={10}
              bg="bg.inset"
              borderColor="border.subtle"
              color="fg.default"
              _placeholder={{ color: 'fg.subtle' }}
            />
          </Box>
        </HStack>

        {/* Sort Buttons */}
        <HStack wrap="wrap">
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
          <Text color="fg.subtle" fontSize="xs" textTransform="uppercase" letterSpacing="wider">Rows</Text>
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
      </Flex>
      </Surface>

      {/* Content */}
      {loading ? (
        <Flex justify="center" align="center" minH="50vh">
          <Spinner size="xl" color="accent.solid" />
        </Flex>
      ) : viewMode === 'table' ? (
        <Surface overflowX="auto" p={0} variant="raised">
          <Table.Root size="sm">
            <Table.Header bg="bg.inset" position="sticky" top={0} zIndex={1}>
              <Table.Row>
                <Table.ColumnHeader color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider">Symbol</Table.ColumnHeader>
                <Table.ColumnHeader color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider" textAlign="right">Price</Table.ColumnHeader>
                <Table.ColumnHeader color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider" textAlign="right">Change</Table.ColumnHeader>
                <Table.ColumnHeader color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider" textAlign="right">RSI</Table.ColumnHeader>
                <Table.ColumnHeader color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider" textAlign="right">Market Cap</Table.ColumnHeader>
                <Table.ColumnHeader color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider">Sector</Table.ColumnHeader>
                <Table.ColumnHeader color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider">Signals</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {filteredStocks.map(stock => (
                <StockTableRow key={stock.symbol} stock={stock} />
              ))}
            </Table.Body>
          </Table.Root>
        </Surface>
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
