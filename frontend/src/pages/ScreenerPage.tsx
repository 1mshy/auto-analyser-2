import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  NativeSelect,
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Play,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import type { StockFilter } from '../types';
import { MARKET_CAP_TIERS } from '../types';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonRow,
  Surface,
} from '../components/ui/primitives';
import { Checkbox } from '../components/ui/checkbox';
import FilterPanel from '../components/FilterPanel';
import { useFilterStocks } from '../queries';
import { useIsMobile } from '../theme/responsive';
import { FilterRange } from '../features/stocks/FilterFields';
import {
  activeFilterChips,
  parseStockFilter,
  SCREENER_PREFERENCES,
  stockFilterParams,
  validateFilter,
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

const STARTERS: { name: string; description: string; filter: StockFilter }[] = [
  {
    name: 'Oversold',
    description: 'RSI below 30',
    filter: { only_oversold: true, sort_by: 'rsi', sort_order: 'asc' },
  },
  {
    name: 'Overbought',
    description: 'RSI above 70',
    filter: { only_overbought: true, sort_by: 'rsi', sort_order: 'desc' },
  },
  {
    name: 'Low stochastic',
    description: 'Stochastic %K ≤ 20',
    filter: { max_stochastic_k: 20, sort_by: 'market_cap', sort_order: 'desc' },
  },
];
function criteriaKey(filter: StockFilter) {
  return stockFilterParams({
    ...filter,
    page: undefined,
    page_size: undefined,
    sort_by: undefined,
    sort_order: undefined,
  }).toString();
}

export function ScreenerPage() {
  const [params, setParams] = useSearchParams();
  const committed = useMemo(() => parseStockFilter(params), [params]);
  const [draft, setDraft] = useState<StockFilter>(committed);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const workspace = useWorkspacePreferences('screener', SCREENER_PREFERENCES);
  const isMobile = useIsMobile();
  const query = useFilterStocks(committed);
  const stocks = query.data?.stocks ?? [];
  const pagination = query.data?.pagination ?? {
    page: committed.page ?? 1,
    page_size: committed.page_size ?? 50,
    total: 0,
    total_pages: 0,
  };
  const committedKey = criteriaKey(committed);
  // Page navigation never applies or discards a draft. A new shared URL or saved
  // view does replace criteria, and those controls should reflect that state.
  useEffect(() => {
    setDraft(committed);
  }, [committedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = criteriaKey(draft) !== committedKey;
  const error = validateFilter(draft);
  const apply = (next: StockFilter) => {
    const normalized = { ...next, page: 1, page_size: committed.page_size };
    setDraft(normalized);
    setParams(stockFilterParams(normalized));
  };
  const sort = (field: string, order?: string) => {
    const sort_order =
      order ??
      (committed.sort_by === field && committed.sort_order === 'desc'
        ? 'asc'
        : 'desc');
    setDraft((previous) => ({ ...previous, sort_by: field, sort_order }));
    setParams(
      stockFilterParams({ ...committed, sort_by: field, sort_order, page: 1 }),
    );
  };

  return (
    <Container maxW="page" py={{ base: 5, md: 8 }}>
      <PageHeader
        eyebrow="Research lab"
        title="Stock screener"
        subtitle="Turn a set of conditions into a focused shortlist."
        actions={
          <HStack wrap="wrap" gap={2}>
            <WorkspaceControls
              {...workspace}
              defaults={SCREENER_PREFERENCES}
              onPreferencesChange={workspace.updatePreferences}
              onSave={(name) => workspace.saveView(name, committed)}
              onDelete={workspace.deleteView}
              onLoad={(view) => {
                workspace.updatePreferences(view.preferences);
                apply(view.filter);
              }}
            />
          </HStack>
        }
      />

      <SimpleGrid columns={3} gap={{ base: 2, md: 3 }} mb={5}>
        {STARTERS.map((starter) => (
          <Button
            key={starter.name}
            variant="outline"
            h="auto"
            minW={0}
            py={3}
            px={{ base: 2, md: 4 }}
            justifyContent="space-between"
            bg="bg.surface"
            borderColor="border.subtle"
            onClick={() =>
              setDraft({ ...starter.filter, page_size: committed.page_size })
            }
          >
            <Box textAlign="left">
              <Text fontSize="sm" fontWeight="semibold" whiteSpace="normal">
                {starter.name}
              </Text>
              <Text
                display={{ base: 'none', md: 'block' }}
                fontSize="xs"
                fontWeight="normal"
                color="fg.muted"
                mt={1}
              >
                {starter.description}
              </Text>
            </Box>
            <Box display={{ base: 'none', md: 'block' }}>
              <ArrowRight size={16} />
            </Box>
          </Button>
        ))}
      </SimpleGrid>

      <Flex direction={{ base: 'column', xl: 'row' }} align="start" gap={5}>
        <Surface
          w={{ base: 'full', xl: '300px' }}
          flexShrink={0}
          p={4}
          variant="raised"
        >
          <HStack justify="space-between" mb={4}>
            <HStack gap={2}>
              <SlidersHorizontal size={16} />
              <Text fontWeight="semibold">Conditions</Text>
            </HStack>
            <HStack gap={1}>
              <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                  setDraft({
                    sort_by: committed.sort_by,
                    sort_order: committed.sort_order,
                  })
                }
              >
                Reset
              </Button>
              <Button
                display={{ base: 'inline-flex', xl: 'none' }}
                variant="outline"
                size="xs"
                aria-expanded={conditionsOpen}
                aria-controls="screener-conditions"
                onClick={() => setConditionsOpen(!conditionsOpen)}
              >
                {conditionsOpen ? 'Hide' : 'Edit'}
                {conditionsOpen ? (
                  <ChevronUp size={13} />
                ) : (
                  <ChevronDown size={13} />
                )}
              </Button>
            </HStack>
          </HStack>
          <VStack
            id="screener-conditions"
            display={{ base: conditionsOpen ? 'flex' : 'none', xl: 'flex' }}
            align="stretch"
            gap={5}
          >
            <FilterRange
              title="RSI"
              min="min_rsi"
              max="max_rsi"
              limit={100}
              filter={draft}
              onChange={setDraft}
            />
            <FilterRange
              title="Stochastic %K"
              min="min_stochastic_k"
              max="max_stochastic_k"
              limit={100}
              filter={draft}
              onChange={setDraft}
            />
            <FilterRange
              title="Bollinger bandwidth"
              min="min_bandwidth"
              max="max_bandwidth"
              filter={draft}
              onChange={setDraft}
            />
            <Box>
              <Text fontWeight="semibold" fontSize="sm" mb={2}>
                Minimum market cap
              </Text>
              <NativeSelect.Root size="sm">
                <NativeSelect.Field
                  aria-label="Minimum market cap"
                  value={draft.min_market_cap ?? ''}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      min_market_cap: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                >
                  {MARKET_CAP_TIERS.map((tier) => (
                    <option key={tier.label} value={tier.value ?? ''}>
                      {tier.label}
                      {tier.value ? ` · ${tier.description}` : ''}
                    </option>
                  ))}
                  {draft.min_market_cap != null &&
                    !MARKET_CAP_TIERS.some(
                      (tier) => tier.value === draft.min_market_cap,
                    ) && (
                      <option value={draft.min_market_cap}>
                        Custom · ${draft.min_market_cap.toLocaleString()}
                      </option>
                    )}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Box>
            <VStack align="stretch" gap={3}>
              <Checkbox
                checked={!!draft.only_oversold}
                onCheckedChange={(event) =>
                  setDraft({
                    ...draft,
                    only_oversold: !!event.checked || undefined,
                    only_overbought: undefined,
                  })
                }
              >
                Oversold only
              </Checkbox>
              <Checkbox
                checked={!!draft.only_overbought}
                onCheckedChange={(event) =>
                  setDraft({
                    ...draft,
                    only_overbought: !!event.checked || undefined,
                    only_oversold: undefined,
                  })
                }
              >
                Overbought only
              </Checkbox>
            </VStack>
            <FilterPanel
              value={draft}
              activeFilterCount={activeFilterChips(draft).length}
              onApplyFilter={(next) =>
                setDraft({
                  ...next,
                  sort_by: committed.sort_by,
                  sort_order: committed.sort_order,
                })
              }
            />
            {error && (
              <Text role="alert" color="signal.down.fg" fontSize="sm">
                {error}
              </Text>
            )}
          </VStack>
          <Box
            borderTopWidth="1px"
            borderColor="border.subtle"
            pt={4}
            mt={{ base: conditionsOpen ? 4 : 0, xl: 4 }}
          >
            <Button
              w="full"
              onClick={() => apply(draft)}
              disabled={!!error}
              loading={query.isFetching}
              loadingText="Screening…"
            >
              <Play size={15} />
              Run screener
            </Button>
            <Text
              fontSize="xs"
              color={pending ? 'accent.fg' : 'fg.muted'}
              mt={2}
              textAlign="center"
              role="status"
            >
              {pending
                ? 'You have unapplied changes'
                : 'Change conditions, then run your screen'}
            </Text>
          </Box>
        </Surface>

        <Box flex="1" minW={0} w="full">
          <Flex
            justify="space-between"
            align="center"
            gap={3}
            wrap="wrap"
            mb={3}
          >
            <Box>
              <Text fontSize="lg" fontWeight="semibold">
                Matches{' '}
                <Text
                  as="span"
                  color="fg.muted"
                  fontSize="sm"
                  fontWeight="normal"
                >
                  {pagination.total.toLocaleString()}
                </Text>
              </Text>
              <Text fontSize="xs" color="fg.muted">
                {query.isFetching && !query.isLoading
                  ? 'Updating results…'
                  : pending
                    ? 'Results reflect your last run'
                    : 'Across the analyzed stock universe'}
              </Text>
            </Box>
            <HStack wrap="wrap">
              <SortControl filter={committed} onChange={sort} />
              <ShareViewButton />
            </HStack>
          </Flex>
          <ActiveFilters
            filter={committed}
            onRemove={(key) => apply({ ...committed, [key]: undefined })}
            onClear={() =>
              apply({
                sort_by: committed.sort_by,
                sort_order: committed.sort_order,
              })
            }
          />
          {query.isLoading ? (
            <Surface p={4}>
              <VStack gap={3} align="stretch">
                {Array.from({ length: 8 }, (_, i) => (
                  <SkeletonRow key={i} cols={5} />
                ))}
              </VStack>
            </Surface>
          ) : query.isError ? (
            <ErrorState
              title="Screener request failed"
              description="The backend could not load these results. Your conditions are still here."
              onRetry={() => query.refetch()}
            />
          ) : stocks.length === 0 ? (
            <EmptyState
              icon={<Search size={30} />}
              title="No stocks match these conditions"
              description="Widen a range or remove a condition, then run your screen again."
            />
          ) : isMobile || workspace.preferences.view === 'card' ? (
            <SimpleGrid columns={{ base: 1, md: 2, '2xl': 3 }} gap={3}>
              {stocks.map((stock) => (
                <StockCardCompact key={stock.symbol} stock={stock} />
              ))}
            </SimpleGrid>
          ) : (
            <StockTable
              stocks={stocks}
              preferences={workspace.preferences}
              filter={committed}
              onSort={sort}
            />
          )}
          {!query.isLoading && !query.isError && (
            <StockPagination
              pagination={pagination}
              busy={query.isFetching}
              onPageChange={(page) =>
                setParams(stockFilterParams({ ...committed, page }))
              }
              onPageSizeChange={(page_size) =>
                setParams(
                  stockFilterParams({ ...committed, page_size, page: 1 }),
                )
              }
            />
          )}
        </Box>
      </Flex>
    </Container>
  );
}
