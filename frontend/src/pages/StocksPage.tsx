import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Box,
  Container,
  Text,
  SimpleGrid,
  Flex,
  HStack,
  VStack,
  Button,
  Input,
  Table,
  IconButton,
} from '@chakra-ui/react';
import {
  Grid,
  List,
  ChevronLeft,
  ChevronRight,
  Search,
  SearchX,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { StockAnalysis, StockFilter, PaginationInfo } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { useProgress } from '../contexts/ProgressContext';
import { useIsMobile } from '../theme/responsive';
import {
  Surface,
  Num,
  SignalBadge,
  PageHeader,
  ErrorState,
  EmptyState,
  SkeletonRow,
  TierBadge,
  AgeBadge,
  FreshnessChip,
} from '../components/ui/primitives';
import { useFilterStocks } from '../queries';

// How long the changed-value highlight stays on before easing back out. The
// CSS transition itself uses the registered `slow` duration token; the global
// reduced-motion rule in index.css disables it for users who opt out.
const FLASH_HOLD_MS = 600;

/**
 * Compares the previous render's price/RSI against the current one (rows keep
 * their `symbol` key but swap object identity when a WS merge lands) and
 * returns a `signal.*.muted` background token while the flash is active.
 */
function useChangeFlash(stock: StockAnalysis): string | undefined {
  const prevRef = useRef<{ price: number; rsi?: number | null }>({
    price: stock.price,
    rsi: stock.rsi,
  });
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { price: stock.price, rsi: stock.rsi };

    const priceMoved = stock.price !== prev.price;
    const rsiMoved =
      stock.rsi != null && prev.rsi != null && stock.rsi !== prev.rsi;
    if (!priceMoved && !rsiMoved) return;

    setDirection(
      priceMoved
        ? stock.price > prev.price
          ? 'up'
          : 'down'
        : stock.rsi! > prev.rsi!
        ? 'up'
        : 'down'
    );
    const t = setTimeout(() => setDirection(null), FLASH_HOLD_MS);
    return () => clearTimeout(t);
  }, [stock.price, stock.rsi]);

  if (!direction) return undefined;
  return direction === 'up' ? 'signal.up.muted' : 'signal.down.muted';
}

const StockTableRow = React.memo(function StockTableRow({
  stock,
}: {
  stock: StockAnalysis;
}) {
  const flashBg = useChangeFlash(stock);
  const rsiTone =
    stock.rsi && stock.rsi < 30 ? 'up' : stock.rsi && stock.rsi > 70 ? 'down' : 'neutral';

  return (
    <Table.Row
      {...(flashBg ? { bg: flashBg } : undefined)}
      transitionProperty="background-color"
      transitionDuration="slow"
      transitionTimingFunction="ease-out"
      _hover={{ bg: 'bg.muted' }}
      borderBottomWidth="1px"
      borderColor="border.subtle"
    >
      <Table.Cell>
        <Link to={`/stocks/${encodeURIComponent(stock.symbol)}`}>
          <HStack>
            <TierBadge marketCap={stock.market_cap} size="sm" />
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
        <SignalBadge tone={rsiTone}>
          <Num as="span" value={stock.rsi} decimals={1} color="inherit" fontSize="inherit" />
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
});

const StockCardCompact = React.memo(function StockCardCompact({
  stock,
}: {
  stock: StockAnalysis;
}) {
  const flashBg = useChangeFlash(stock);

  return (
    <Link to={`/stocks/${encodeURIComponent(stock.symbol)}`}>
      <Surface
        interactive
        p={4}
        transitionDuration="slow"
        transitionTimingFunction="ease-out"
        {...(flashBg ? { bg: flashBg } : undefined)}
      >
        <Flex justify="space-between" align="start" mb={2}>
          <VStack align="start" gap={0}>
            <TierBadge marketCap={stock.market_cap} size="sm" />
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
            >
              RSI:{' '}
              <Num as="span" value={stock.rsi} decimals={1} color="inherit" fontSize="inherit" />
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
});

const Pagination: React.FC<{
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
}> = ({ pagination, onPageChange }) => {
  const { page, total_pages, total } = pagination;

  return (
    <Flex justify="space-between" align="center" wrap="wrap" gap={3} mt={4}>
      <Text color="fg.muted" fontSize="sm">
        Showing page {page} of {total_pages} ({total.toLocaleString()} total)
      </Text>
      <HStack>
        <IconButton
          aria-label="Previous page"
          variant="outline"
          size="sm"
          minH={{ base: '44px', md: 'auto' }}
          minW={{ base: '44px', md: 'auto' }}
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
                minH={{ base: '44px', md: 'auto' }}
                variant={page === pageNum ? 'solid' : 'outline'}
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
          minH={{ base: '44px', md: 'auto' }}
          minW={{ base: '44px', md: 'auto' }}
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
  const { progress, isConnected } = useProgress();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => {
      startTransition(() => setDebouncedSearch(searchTerm.trim()));
    }, 200);
    return () => clearTimeout(t);
  }, [searchTerm, startTransition]);

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
      max_abs_price_change_percent: settings.maxPriceChangePercent ?? undefined,
    };
  }, [searchParams, settings, debouncedSearch]);

  const filter = useMemo(() => getFilterFromParams(), [getFilterFromParams]);
  const { data, isLoading, isError, isFetching, refetch } = useFilterStocks(filter);
  const stocks = useMemo(() => data?.stocks ?? [], [data]);
  const pagination: PaginationInfo =
    data?.pagination ?? { page: 1, page_size: 50, total: 0, total_pages: 0 };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    startTransition(() => setSearchParams(params));
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
    startTransition(() => setSearchParams(params));
  };

  const handlePageSizeChange = (size: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page_size', size.toString());
    params.set('page', '1');
    startTransition(() => setSearchParams(params));
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    startTransition(() => {
      setDebouncedSearch('');
      setSearchParams(new URLSearchParams());
    });
  };

  // Backend handles symbol search across the entire universe via
  // `symbol_search`; the deferred value keeps typing/sorting responsive while
  // the large list re-renders at transition priority.
  const filteredStocks = useDeferredValue(stocks);

  // Freshness: newest analyzed_at in the current page, falling back to the
  // engine's last successful cycle.
  const newestAnalyzedAt = useMemo(() => {
    let newest: string | null = null;
    let newestMs = -Infinity;
    for (const s of stocks) {
      if (!s.analyzed_at) continue;
      const ms = Date.parse(s.analyzed_at);
      if (!Number.isNaN(ms) && ms > newestMs) {
        newestMs = ms;
        newest = s.analyzed_at;
      }
    }
    return newest;
  }, [stocks]);
  const freshnessTimestamp = newestAnalyzedAt ?? progress?.last_successful_cycle ?? null;

  const currentSort = searchParams.get('sort_by') || 'market_cap';
  const currentOrder = searchParams.get('sort_order') || 'desc';
  const effectiveViewMode = isMobile ? 'card' : viewMode;
  const sortArrow = currentOrder === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />;

  return (
    <Container maxW="page" py={{ base: 5, md: 8 }}>
      <PageHeader
        eyebrow="Universe"
        title="All Stocks"
        subtitle={`${pagination.total.toLocaleString()} analyzed stocks · ${filteredStocks.length.toLocaleString()} visible${(isFetching && !isLoading) || isPending ? ' · updating…' : ' in this view'}`}
        actions={
          <HStack wrap="wrap" justify="flex-end">
            <AgeBadge timestamp={freshnessTimestamp} />
            <FreshnessChip cached={data?.cached} isLive={isConnected} />
            <HStack display={{ base: 'none', md: 'flex' }}>
              <IconButton
                aria-label="Table view"
                variant={viewMode === 'table' ? 'solid' : 'outline'}
                size="sm"
                onClick={() => setViewMode('table')}
              >
                <List />
              </IconButton>
              <IconButton
                aria-label="Card view"
                variant={viewMode === 'card' ? 'solid' : 'outline'}
                size="sm"
                onClick={() => setViewMode('card')}
              >
                <Grid />
              </IconButton>
            </HStack>
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
              h={{ base: '11', md: '10' }}
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
            minH={{ base: '44px', md: 'auto' }}
            variant={currentSort === 'market_cap' ? 'solid' : 'outline'}
            onClick={() => handleSortChange('market_cap')}
          >
            Market Cap
            {currentSort === 'market_cap' && sortArrow}
          </Button>
          <Button
            size="sm"
            minH={{ base: '44px', md: 'auto' }}
            variant={currentSort === 'price_change_percent' ? 'solid' : 'outline'}
            onClick={() => handleSortChange('price_change_percent')}
          >
            Change %
            {currentSort === 'price_change_percent' && sortArrow}
          </Button>
          <Button
            size="sm"
            minH={{ base: '44px', md: 'auto' }}
            variant={currentSort === 'rsi' ? 'solid' : 'outline'}
            onClick={() => handleSortChange('rsi')}
          >
            RSI
            {currentSort === 'rsi' && sortArrow}
          </Button>
        </HStack>

        {/* Page Size */}
        <HStack>
          <Text color="fg.subtle" fontSize="xs" textTransform="uppercase" letterSpacing="wider">Rows</Text>
          {[25, 50, 100].map(size => (
            <Button
              key={size}
              size="sm"
              minH={{ base: '44px', md: 'auto' }}
              variant={pagination.page_size === size ? 'solid' : 'outline'}
              onClick={() => handlePageSizeChange(size)}
            >
              {size}
            </Button>
          ))}
        </HStack>
      </Flex>
      </Surface>

      {/* Content */}
      {isLoading ? (
        <Surface p={4} variant="raised">
          <VStack gap={3} align="stretch">
            {Array.from({ length: 10 }).map((_, i) => (
              <SkeletonRow key={i} cols={7} />
            ))}
          </VStack>
        </Surface>
      ) : isError ? (
        <ErrorState
          title="Couldn’t load stocks"
          description="The stock list request failed. Check that the backend is reachable, then retry."
          onRetry={() => refetch()}
        />
      ) : filteredStocks.length === 0 ? (
        <EmptyState
          icon={<SearchX size={28} />}
          title="No matching stocks"
          description="Nothing in the analyzed universe matches the current search and filters."
          action={
            <Button
              size="sm"
              minH={{ base: '44px', md: 'auto' }}
              variant="outline"
              onClick={handleClearFilters}
            >
              Clear filters
            </Button>
          }
        />
      ) : effectiveViewMode === 'table' ? (
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
      {!isLoading && pagination.total_pages > 1 && (
        <Pagination pagination={pagination} onPageChange={handlePageChange} />
      )}
    </Container>
  );
};
