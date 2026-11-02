import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Input,
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Search, SearchX } from 'lucide-react';
import type { StockFilter } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { useProgress } from '../contexts/ProgressContext';
import { useIsMobile } from '../theme/responsive';
import {
  AgeBadge,
  EmptyState,
  ErrorState,
  FreshnessChip,
  PageHeader,
  SkeletonRow,
  Surface,
} from '../components/ui/primitives';
import FilterPanel from '../components/FilterPanel';
import { useFilterStocks } from '../queries';
import {
  activeFilterChips,
  applyGlobalFilters,
  parseStockFilter,
  stockFilterParams,
} from '../features/stocks/workspace';
import { useWorkspacePreferences } from '../features/stocks/useWorkspacePreferences';
import {
  ActiveFilters,
  ShareViewButton,
  SortControl,
  WorkspaceControls,
} from '../features/stocks/WorkspaceControls';
import {
  StockCardCompact,
  StockPagination,
  StockTable,
} from '../features/stocks/StockResults';

export function StocksPage() {
  const { settings } = useSettings();
  const { progress, isConnected } = useProgress();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const urlSearch = params.get('symbol_search') ?? '';
  const [search, setSearch] = useState(urlSearch);
  const workspace = useWorkspacePreferences('stocks');
  const selectedFilter = useMemo(() => parseStockFilter(params), [params]);
  const filter = useMemo(
    () => applyGlobalFilters(selectedFilter, settings),
    [selectedFilter, settings],
  );
  const query = useFilterStocks(filter);
  const queryStocks = useMemo(
    () => query.data?.stocks ?? [],
    [query.data?.stocks],
  );
  const stocks = useDeferredValue(queryStocks);
  const pagination = query.data?.pagination ?? {
    page: filter.page ?? 1,
    page_size: filter.page_size ?? 50,
    total: 0,
    total_pages: 0,
  };

  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);
  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timeout = setTimeout(
      () =>
        setParams(
          (previous) => {
            const next = new URLSearchParams(previous);
            if (search.trim()) next.set('symbol_search', search.trim());
            else next.delete('symbol_search');
            next.set('page', '1');
            return next;
          },
          { replace: true },
        ),
      250,
    );
    return () => clearTimeout(timeout);
  }, [search, urlSearch, setParams]);

  const apply = (next: StockFilter) => {
    setSearch(next.symbol_search ?? '');
    setParams(stockFilterParams(next));
  };
  const clear = () =>
    apply({
      sort_by: selectedFilter.sort_by,
      sort_order: selectedFilter.sort_order,
      page_size: selectedFilter.page_size,
      page: 1,
    });
  const sort = (field: string, order?: string) =>
    apply({
      ...selectedFilter,
      sort_by: field,
      sort_order:
        order ??
        (selectedFilter.sort_by === field &&
        selectedFilter.sort_order === 'desc'
          ? 'asc'
          : 'desc'),
      page: 1,
    });
  const newestAnalyzedAt = stocks.reduce<string | null>(
    (newest, stock) =>
      stock.analyzed_at &&
      (!newest || Date.parse(stock.analyzed_at) > Date.parse(newest))
        ? stock.analyzed_at
        : newest,
    null,
  );
  const cards = isMobile || workspace.preferences.view === 'card';
  const globalNotes = [
    settings.minMarketCap != null
      ? `Market cap ≥ $${new Intl.NumberFormat('en-US', { notation: 'compact' }).format(settings.minMarketCap)}`
      : '',
    settings.maxPriceChangePercent != null
      ? `Absolute day change ≤ ${settings.maxPriceChangePercent}%`
      : '',
  ].filter(Boolean);

  return (
    <Container maxW="page" py={{ base: 5, md: 8 }}>
      <PageHeader
        eyebrow="Discover"
        title="Market explorer"
        subtitle="Find your next idea. Build a view you can come back to."
        actions={
          <HStack wrap="wrap">
            <AgeBadge
              timestamp={
                newestAnalyzedAt ?? progress?.last_successful_cycle ?? null
              }
            />
            <FreshnessChip cached={query.data?.cached} isLive={isConnected} />
          </HStack>
        }
      />

      <Surface p={0} mb={4} variant="raised">
        <Flex
          px={4}
          pt={4}
          pb={3}
          justify="space-between"
          align="center"
          gap={3}
          wrap="wrap"
        >
          <HStack gap={1} wrap="wrap">
            {[
              { label: 'All stocks', filter: {} },
              { label: 'Oversold', filter: { only_oversold: true } },
              { label: 'Overbought', filter: { only_overbought: true } },
            ].map((view) => {
              const active =
                view.label === 'All stocks'
                  ? !selectedFilter.only_oversold &&
                    !selectedFilter.only_overbought
                  : view.label === 'Oversold'
                    ? selectedFilter.only_oversold
                    : selectedFilter.only_overbought;
              return (
                <Button
                  key={view.label}
                  size="sm"
                  px={{ base: 2, md: 3 }}
                  fontSize={{ base: 'xs', md: 'sm' }}
                  variant="ghost"
                  color={active ? 'accent.fg' : 'fg.muted'}
                  bg={active ? 'accent.muted' : 'transparent'}
                  aria-pressed={!!active}
                  onClick={() =>
                    apply({
                      ...selectedFilter,
                      only_oversold: undefined,
                      only_overbought: undefined,
                      ...view.filter,
                      page: 1,
                    })
                  }
                >
                  {view.label}
                </Button>
              );
            })}
          </HStack>
          <HStack wrap="wrap" gap={2}>
            <WorkspaceControls
              {...workspace}
              onPreferencesChange={workspace.updatePreferences}
              onSave={(name) => workspace.saveView(name, selectedFilter)}
              onDelete={workspace.deleteView}
              onLoad={(view) => {
                workspace.updatePreferences(view.preferences);
                apply(view.filter);
              }}
            />
          </HStack>
        </Flex>
        <Flex px={4} pb={4} gap={3} wrap="wrap" align="center">
          <Box
            position="relative"
            flex="1"
            flexBasis={{ base: '100%', md: '0%' }}
            minW={{ base: 0, md: '200px' }}
          >
            <Box
              position="absolute"
              zIndex={1}
              left={3}
              top="50%"
              transform="translateY(-50%)"
              color="fg.muted"
              pointerEvents="none"
            >
              <Search size={16} />
            </Box>
            <Input
              aria-label="Search stock symbols"
              placeholder="Search any symbol…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              pl={10}
              bg="bg.inset"
              borderColor="border.subtle"
            />
          </Box>
          <FilterPanel
            value={selectedFilter}
            activeFilterCount={
              activeFilterChips(selectedFilter).filter(
                (chip) => chip.key !== 'symbol_search',
              ).length
            }
            onApplyFilter={(next) =>
              apply({
                ...next,
                symbol_search: selectedFilter.symbol_search,
                sort_by: selectedFilter.sort_by,
                sort_order: selectedFilter.sort_order,
                page_size: selectedFilter.page_size,
                page: 1,
              })
            }
          />
          <SortControl filter={selectedFilter} onChange={sort} />
        </Flex>
        <Box px={4}>
          <ActiveFilters
            filter={selectedFilter}
            onRemove={(key) =>
              apply({ ...selectedFilter, [key]: undefined, page: 1 })
            }
            onClear={clear}
          />
        </Box>
      </Surface>

      <Flex justify="space-between" align="center" gap={3} wrap="wrap" mb={3}>
        <Box>
          <Text fontSize="sm" fontWeight="medium" role="status">
            {pagination.total.toLocaleString()} matching stocks
            {query.isFetching && !query.isLoading ? ' · Updating…' : ''}
          </Text>
          {globalNotes.length > 0 && (
            <Text fontSize="xs" color="fg.muted" mt={1}>
              Workspace defaults: {globalNotes.join(' · ')}
            </Text>
          )}
        </Box>
        <ShareViewButton />
      </Flex>

      {query.isLoading ? (
        <Surface p={4}>
          <VStack gap={3} align="stretch">
            {Array.from({ length: 8 }, (_, i) => (
              <SkeletonRow key={i} cols={6} />
            ))}
          </VStack>
        </Surface>
      ) : query.isError ? (
        <ErrorState
          title="Couldn’t load stocks"
          description="The stock list request failed. Check that the backend is reachable, then retry."
          onRetry={() => query.refetch()}
        />
      ) : stocks.length === 0 ? (
        <EmptyState
          icon={<SearchX size={28} />}
          title="No matching stocks"
          description="Try a wider range or remove a filter. Your workspace defaults still apply."
          action={
            <Button variant="outline" onClick={clear}>
              Clear filters
            </Button>
          }
        />
      ) : cards ? (
        <SimpleGrid columns={{ base: 1, sm: 2, lg: 3, xl: 4 }} gap={3}>
          {stocks.map((stock) => (
            <StockCardCompact key={stock.symbol} stock={stock} />
          ))}
        </SimpleGrid>
      ) : (
        <StockTable
          stocks={stocks}
          preferences={workspace.preferences}
          filter={selectedFilter}
          onSort={sort}
        />
      )}

      {!query.isLoading && !query.isError && (
        <StockPagination
          pagination={pagination}
          busy={query.isFetching}
          onPageChange={(page) => apply({ ...selectedFilter, page })}
          onPageSizeChange={(page_size) =>
            apply({ ...selectedFilter, page_size, page: 1 })
          }
        />
      )}
    </Container>
  );
}
