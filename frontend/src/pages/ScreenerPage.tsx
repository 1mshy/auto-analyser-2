import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Container,
  Text,
  Flex,
  HStack,
  VStack,
  Button,
  SimpleGrid,
  Input,
} from '@chakra-ui/react';
import { Search, ChevronLeft, ChevronRight, Save, Trash2, ArrowDown, ArrowUp } from 'lucide-react';
import { StockFilter, MARKET_CAP_TIERS, getMarketCapTier, getMarketCapTierColor } from '../types';
import { Surface, Num, SignalBadge, PageHeader, EmptyState, ErrorState, SkeletonRow } from '../components/ui/primitives';
import { useFilterStocks } from '../queries';
import { fmtMarketCap } from '../format';

interface ScreenerPreset {
  id: string;
  name: string;
  filter: StockFilter;
}

const STORAGE_KEY = 'screener_presets';

const loadPresets = (): ScreenerPreset[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const savePresets = (presets: ScreenerPreset[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
};

/**
 * Hoisted to module scope (and memoized) so its component identity is stable
 * across ScreenerPage renders. Previously declared inside the component body,
 * which created a brand-new component type every render and remounted each
 * input — losing focus after a single keystroke.
 */
const FilterInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}> = React.memo(({ label, value, onChange, placeholder }) => (
  <Box>
    <Text color="fg.muted" fontSize="xs" mb={1} textTransform="uppercase" letterSpacing="wider">{label}</Text>
    <Input
      size="sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      bg="bg.inset"
      borderColor="border.subtle"
      color="fg.default"
      _placeholder={{ color: 'fg.subtle' }}
      type="number"
    />
  </Box>
));
FilterInput.displayName = 'FilterInput';

export const ScreenerPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [presets, setPresets] = useState<ScreenerPreset[]>(loadPresets);
  const [presetName, setPresetName] = useState('');

  const [minRsi, setMinRsi] = useState('');
  const [maxRsi, setMaxRsi] = useState('');
  const [minStochK, setMinStochK] = useState('');
  const [maxStochK, setMaxStochK] = useState('');
  const [minBandwidth, setMinBandwidth] = useState('');
  const [maxBandwidth, setMaxBandwidth] = useState('');
  const [minMarketCap, setMinMarketCap] = useState<number | null>(null);
  const [onlyOversold, setOnlyOversold] = useState(false);
  const [onlyOverbought, setOnlyOverbought] = useState(false);
  const [sortBy, setSortBy] = useState('market_cap');
  const [sortOrder, setSortOrder] = useState('desc');

  const buildFilter = useCallback((overridePage?: number): StockFilter => ({
    min_rsi: minRsi ? parseFloat(minRsi) : undefined,
    max_rsi: maxRsi ? parseFloat(maxRsi) : undefined,
    min_stochastic_k: minStochK ? parseFloat(minStochK) : undefined,
    max_stochastic_k: maxStochK ? parseFloat(maxStochK) : undefined,
    min_bandwidth: minBandwidth ? parseFloat(minBandwidth) : undefined,
    max_bandwidth: maxBandwidth ? parseFloat(maxBandwidth) : undefined,
    min_market_cap: minMarketCap || undefined,
    only_oversold: onlyOversold || undefined,
    only_overbought: onlyOverbought || undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
    page: overridePage ?? page,
    page_size: 50,
  }), [minRsi, maxRsi, minStochK, maxStochK, minBandwidth, maxBandwidth, minMarketCap, onlyOversold, onlyOverbought, sortBy, sortOrder, page]);

  // Filters are applied on demand: the query only re-runs when the committed
  // filter changes (Run Screener click or page change), not on every keystroke.
  const [committedFilter, setCommittedFilter] = useState<StockFilter>(() => ({
    sort_by: 'market_cap',
    sort_order: 'desc',
    page: 1,
    page_size: 50,
  }));

  const screenerQuery = useFilterStocks(committedFilter);
  const stocks = screenerQuery.data?.stocks ?? [];
  const total = screenerQuery.data?.pagination.total ?? 0;
  const totalPages = screenerQuery.data?.pagination.total_pages ?? 0;
  const loading = screenerQuery.isLoading || screenerQuery.isFetching;

  const runScreener = useCallback((overridePage?: number) => {
    const nextPage = overridePage ?? 1;
    setPage(nextPage);
    setCommittedFilter(buildFilter(nextPage));
  }, [buildFilter]);

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    const preset: ScreenerPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      filter: buildFilter(),
    };
    const updated = [...presets, preset];
    setPresets(updated);
    savePresets(updated);
    setPresetName('');
  };

  const handleDeletePreset = (id: string) => {
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    savePresets(updated);
  };

  const handleLoadPreset = (preset: ScreenerPreset) => {
    const f = preset.filter;
    setMinRsi(f.min_rsi?.toString() || '');
    setMaxRsi(f.max_rsi?.toString() || '');
    setMinStochK(f.min_stochastic_k?.toString() || '');
    setMaxStochK(f.max_stochastic_k?.toString() || '');
    setMinBandwidth(f.min_bandwidth?.toString() || '');
    setMaxBandwidth(f.max_bandwidth?.toString() || '');
    setMinMarketCap(f.min_market_cap || null);
    setOnlyOversold(f.only_oversold || false);
    setOnlyOverbought(f.only_overbought || false);
    setSortBy(f.sort_by || 'market_cap');
    setSortOrder(f.sort_order || 'desc');
    setPage(1);
  };

  return (
    <Container maxW="page" py={{ base: 5, md: 8 }}>
      <PageHeader
        eyebrow="Screener"
        title="Stock Screener"
        subtitle={total > 0 ? `${total.toLocaleString()} results` : 'Tune indicators and filters to surface matches'}
        icon={<Search size={22} />}
      />

      <Surface p={4} mb={5} variant="raised">
        <VStack gap={4} align="stretch">
          <SimpleGrid columns={{ base: 2, md: 3, xl: 6 }} gap={3}>
            <FilterInput label="Min RSI" value={minRsi} onChange={setMinRsi} placeholder="0" />
            <FilterInput label="Max RSI" value={maxRsi} onChange={setMaxRsi} placeholder="100" />
            <FilterInput label="Min Stoch %K" value={minStochK} onChange={setMinStochK} placeholder="0" />
            <FilterInput label="Max Stoch %K" value={maxStochK} onChange={setMaxStochK} placeholder="100" />
            <FilterInput label="Min Bandwidth" value={minBandwidth} onChange={setMinBandwidth} placeholder="0" />
            <FilterInput label="Max Bandwidth" value={maxBandwidth} onChange={setMaxBandwidth} placeholder="1" />
          </SimpleGrid>

          <Box>
            <Text color="fg.muted" fontSize="xs" mb={2} textTransform="uppercase" letterSpacing="wider">Market Cap</Text>
            <HStack gap={2} wrap="wrap">
              {MARKET_CAP_TIERS.map(tier => (
                <Button
                  key={tier.label}
                  size="xs"
                  variant="outline"
                  minH={{ base: '11', md: '6' }}
                  bg={minMarketCap === tier.value ? 'accent.muted' : 'transparent'}
                  color={minMarketCap === tier.value ? 'accent.fg' : 'fg.muted'}
                  borderColor={minMarketCap === tier.value ? 'accent.solid' : 'border.default'}
                  _hover={{
                    bg: minMarketCap === tier.value ? 'accent.muted' : 'bg.muted',
                    color: minMarketCap === tier.value ? 'accent.fg' : 'fg.default',
                  }}
                  onClick={() => setMinMarketCap(tier.value)}
                >
                  {tier.label}
                </Button>
              ))}
            </HStack>
          </Box>

          <Flex justify="space-between" wrap="wrap" gap={3} align="center">
            <HStack gap={2} wrap="wrap">
              <Button
                size="xs"
                variant="outline"
                minH={{ base: '11', md: '6' }}
                bg={onlyOversold ? 'signal.up.muted' : 'transparent'}
                color={onlyOversold ? 'signal.up.fg' : 'fg.muted'}
                borderColor={onlyOversold ? 'signal.up.solid' : 'border.default'}
                _hover={{
                  bg: onlyOversold ? 'signal.up.muted' : 'bg.muted',
                  color: onlyOversold ? 'signal.up.fg' : 'fg.default',
                }}
                onClick={() => { setOnlyOversold(!onlyOversold); setOnlyOverbought(false); }}
              >
                Oversold Only
              </Button>
              <Button
                size="xs"
                variant="outline"
                minH={{ base: '11', md: '6' }}
                bg={onlyOverbought ? 'signal.down.muted' : 'transparent'}
                color={onlyOverbought ? 'signal.down.fg' : 'fg.muted'}
                borderColor={onlyOverbought ? 'signal.down.solid' : 'border.default'}
                _hover={{
                  bg: onlyOverbought ? 'signal.down.muted' : 'bg.muted',
                  color: onlyOverbought ? 'signal.down.fg' : 'fg.default',
                }}
                onClick={() => { setOnlyOverbought(!onlyOverbought); setOnlyOversold(false); }}
              >
                Overbought Only
              </Button>
            </HStack>

            <HStack gap={2} wrap="wrap">
              <Text color="fg.muted" fontSize="xs">Sort:</Text>
              {['market_cap', 'price_change_percent', 'rsi', 'price'].map(field => (
                <Button
                  key={field}
                  size="xs"
                  variant="outline"
                  minH={{ base: '11', md: '6' }}
                  bg={sortBy === field ? 'accent.muted' : 'transparent'}
                  color={sortBy === field ? 'accent.fg' : 'fg.muted'}
                  borderColor={sortBy === field ? 'accent.solid' : 'border.default'}
                  _hover={{
                    bg: sortBy === field ? 'accent.muted' : 'bg.muted',
                    color: sortBy === field ? 'accent.fg' : 'fg.default',
                  }}
                  onClick={() => {
                    if (sortBy === field) setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                    else { setSortBy(field); setSortOrder('desc'); }
                  }}
                >
                  {field.replace(/_/g, ' ')}
                  {sortBy === field && (sortOrder === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                </Button>
              ))}
            </HStack>
          </Flex>

          <Flex justify="space-between" wrap="wrap" gap={3} align="center">
            <Button
              bg="accent.solid"
              color="white"
              _hover={{ bg: 'accent.emphasis' }}
              minH="11"
              onClick={() => runScreener(1)}
              loading={loading}
              loadingText="Screening…"
            >
              <Search size={16} /> Run Screener
            </Button>

            <HStack gap={2} wrap="wrap">
              <Input
                size="sm"
                placeholder="Preset name..."
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                bg="bg.inset"
                borderColor="border.subtle"
                color="fg.default"
                _placeholder={{ color: 'fg.subtle' }}
                w="150px"
              />
              <Button
                size="sm"
                variant="outline"
                minH={{ base: '11', md: '8' }}
                borderColor="border.default"
                color="fg.muted"
                _hover={{ bg: 'bg.muted', color: 'fg.default' }}
                onClick={handleSavePreset}
                disabled={!presetName.trim()}
              >
                <Save size={14} /> Save
              </Button>
            </HStack>
          </Flex>

          {presets.length > 0 && (
            <HStack gap={2} wrap="wrap">
              <Text color="fg.muted" fontSize="xs">Presets:</Text>
              {presets.map(preset => (
                <HStack key={preset.id} gap={1}>
                  <SignalBadge
                    tone="accent"
                    size="sm"
                    cursor="pointer"
                    onClick={() => handleLoadPreset(preset)}
                    _hover={{ opacity: 0.8 }}
                    px={2}
                  >
                    {preset.name}
                  </SignalBadge>
                  <Box
                    as="button"
                    color="fg.subtle"
                    _hover={{ color: 'signal.down.fg' }}
                    onClick={() => handleDeletePreset(preset.id)}
                  >
                    <Trash2 size={12} />
                  </Box>
                </HStack>
              ))}
            </HStack>
          )}
        </VStack>
      </Surface>

      {loading ? (
        <Surface p={0} variant="raised">
          {Array.from({ length: 10 }).map((_, i) => (
            <Box key={i} px={4} py={2} borderBottomWidth={i < 9 ? '1px' : '0'} borderColor="border.subtle">
              <SkeletonRow cols={6} />
            </Box>
          ))}
        </Surface>
      ) : screenerQuery.isError ? (
        <ErrorState
          title="Screener request failed"
          description="The stock filter request failed. Check that the backend is reachable, then retry."
          onRetry={() => screenerQuery.refetch()}
        />
      ) : stocks.length === 0 ? (
        <EmptyState
          icon={<Search size={44} />}
          title="No stocks match your criteria"
          description="Try adjusting filters and run again."
        />
      ) : (
        <Surface p={0} overflowX="auto" variant="raised">
          <Flex minW="860px" px={4} py={2} bg="bg.inset" borderBottomWidth="1px" borderColor="border.subtle" color="fg.muted" fontSize="xs" fontWeight="semibold" textTransform="uppercase" letterSpacing="wider" position="sticky" top={0} zIndex={1}>
            <Text w="100px">Symbol</Text>
            <Text w="100px" textAlign="right">Price</Text>
            <Text w="100px" textAlign="right">Change</Text>
            <Text w="80px" textAlign="right">RSI</Text>
            <Text w="80px" textAlign="right">Stoch %K</Text>
            <Text w="100px" textAlign="right">BB Width</Text>
            <Text w="120px" textAlign="right">Market Cap</Text>
            <Text flex={1} textAlign="right">Sector</Text>
          </Flex>

          {stocks.map((stock, idx) => {
            const tier = getMarketCapTier(stock.market_cap);
            const rsiIntent = stock.rsi != null && stock.rsi < 30 ? 'up' : stock.rsi != null && stock.rsi > 70 ? 'down' : 'neutral';
            const stochIntent = stock.stochastic?.k_line != null && stock.stochastic.k_line < 20 ? 'up' : stock.stochastic?.k_line != null && stock.stochastic.k_line > 80 ? 'down' : 'neutral';
            return (
              <Link key={stock.symbol} to={`/stocks/${encodeURIComponent(stock.symbol)}`}>
                <Flex
                  minW="860px"
                  px={4}
                  py={3}
                  align="center"
                  borderBottomWidth={idx < stocks.length - 1 ? '1px' : '0'}
                  borderColor="border.subtle"
                  _hover={{ bg: 'bg.muted' }}
                  transition="background 120ms ease"
                >
                  <Text w="100px" color="accent.fg" fontWeight="semibold">{stock.symbol}</Text>
                  <Box w="100px" textAlign="right">
                    <Num value={stock.price} prefix="$" color="fg.default" fontSize="sm" />
                  </Box>
                  <Box w="100px" textAlign="right">
                    <Num
                      value={stock.price_change_percent}
                      intent="auto"
                      sign="always"
                      suffix="%"
                      fontSize="sm"
                    />
                  </Box>
                  <Box w="80px" textAlign="right">
                    <Num value={stock.rsi} intent={rsiIntent} decimals={1} fontSize="sm" />
                  </Box>
                  <Box w="80px" textAlign="right">
                    <Num value={stock.stochastic?.k_line} intent={stochIntent} decimals={1} fontSize="sm" />
                  </Box>
                  <Box w="100px" textAlign="right">
                    <Num value={stock.bollinger?.bandwidth} decimals={4} color="fg.muted" fontSize="sm" />
                  </Box>
                  <Box w="120px" textAlign="right">
                    <SignalBadge
                      tone={getMarketCapTierColor(tier) === 'purple' ? 'accent' : getMarketCapTierColor(tier) === 'blue' ? 'info' : 'neutral'}
                      size="sm"
                      className="num"
                      data-num=""
                    >
                      {fmtMarketCap(stock.market_cap)}
                    </SignalBadge>
                  </Box>
                  <Text flex={1} textAlign="right" color="fg.subtle" fontSize="sm">{stock.sector || '-'}</Text>
                </Flex>
              </Link>
            );
          })}
        </Surface>
      )}

      {totalPages > 1 && (
        <Flex justify="center" mt={6} gap={2}>
          <Button
            size="sm"
            variant="outline"
            minH={{ base: '11', md: '8' }}
            borderColor="border.default"
            color="fg.muted"
            _hover={{ bg: 'bg.muted', color: 'fg.default' }}
            onClick={() => runScreener(page - 1)}
            disabled={page <= 1 || loading}
          >
            <ChevronLeft size={16} /> Prev
          </Button>
          <Flex align="center" px={4}>
            <Text color="fg.muted" fontSize="sm">Page {page} of {totalPages}</Text>
          </Flex>
          <Button
            size="sm"
            variant="outline"
            minH={{ base: '11', md: '8' }}
            borderColor="border.default"
            color="fg.muted"
            _hover={{ bg: 'bg.muted', color: 'fg.default' }}
            onClick={() => runScreener(page + 1)}
            disabled={page >= totalPages || loading}
          >
            Next <ChevronRight size={16} />
          </Button>
        </Flex>
      )}
    </Container>
  );
};
