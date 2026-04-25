import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Container,
  Text,
  Flex,
  Spinner,
  HStack,
  VStack,
  Button,
  SimpleGrid,
  Input,
} from '@chakra-ui/react';
import { Search, ChevronLeft, ChevronRight, Save, Trash2 } from 'lucide-react';
import { api, FilterResponse } from '../api';
import { StockAnalysis, StockFilter, MARKET_CAP_TIERS, getMarketCapTier, getMarketCapTierColor } from '../types';
import { Surface, Num, SignalBadge, PageHeader, EmptyState } from '../components/ui/primitives';

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

export const ScreenerPage: React.FC = () => {
  const [stocks, setStocks] = useState<StockAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
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

  const buildFilter = useCallback((): StockFilter => ({
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
    page,
    page_size: 50,
  }), [minRsi, maxRsi, minStochK, maxStochK, minBandwidth, maxBandwidth, minMarketCap, onlyOversold, onlyOverbought, sortBy, sortOrder, page]);

  const runScreener = useCallback(async () => {
    try {
      setLoading(true);
      const filter = buildFilter();
      const result: FilterResponse = await api.filterStocks(filter);
      setStocks(result.stocks);
      setTotal(result.pagination.total);
      setTotalPages(result.pagination.total_pages);
    } catch (err) {
      console.error('Screener error:', err);
    } finally {
      setLoading(false);
    }
  }, [buildFilter]);

  useEffect(() => {
    runScreener();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

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

  const FilterInput: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder: string }> = ({ label, value, onChange, placeholder }) => (
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
  );

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
                  variant={minMarketCap === tier.value ? 'solid' : 'outline'}
                  colorPalette={minMarketCap === tier.value ? 'blue' : 'gray'}
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
                variant={onlyOversold ? 'solid' : 'outline'}
                colorPalette={onlyOversold ? 'green' : 'gray'}
                onClick={() => { setOnlyOversold(!onlyOversold); setOnlyOverbought(false); }}
              >
                Oversold Only
              </Button>
              <Button
                size="xs"
                variant={onlyOverbought ? 'solid' : 'outline'}
                colorPalette={onlyOverbought ? 'red' : 'gray'}
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
                  variant={sortBy === field ? 'solid' : 'outline'}
                  colorPalette={sortBy === field ? 'blue' : 'gray'}
                  onClick={() => {
                    if (sortBy === field) setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                    else { setSortBy(field); setSortOrder('desc'); }
                  }}
                >
                  {field.replace(/_/g, ' ')}{sortBy === field ? (sortOrder === 'desc' ? ' ↓' : ' ↑') : ''}
                </Button>
              ))}
            </HStack>
          </Flex>

          <Flex justify="space-between" wrap="wrap" gap={3} align="center">
            <Button colorPalette="blue" onClick={() => { setPage(1); runScreener(); }}>
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
              <Button size="sm" variant="outline" colorPalette="gray" onClick={handleSavePreset} disabled={!presetName.trim()}>
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
        <Flex justify="center" py={12}>
          <Spinner size="xl" color="accent.solid" />
        </Flex>
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
              <Link key={stock.symbol} to={`/stocks/${stock.symbol}`}>
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
                      {stock.market_cap ? `$${(stock.market_cap / 1e9).toFixed(1)}B` : '-'}
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
          <Button size="sm" variant="outline" colorPalette="gray" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>
            <ChevronLeft size={16} /> Prev
          </Button>
          <Flex align="center" px={4}>
            <Text color="fg.muted" fontSize="sm">Page {page} of {totalPages}</Text>
          </Flex>
          <Button size="sm" variant="outline" colorPalette="gray" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
            Next <ChevronRight size={16} />
          </Button>
        </Flex>
      )}
    </Container>
  );
};
