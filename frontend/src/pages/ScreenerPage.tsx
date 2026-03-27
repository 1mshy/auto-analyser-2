import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Container,
  Heading,
  Text,
  Flex,
  Badge,
  Spinner,
  HStack,
  VStack,
  Card,
  Button,
  SimpleGrid,
  Input,
} from '@chakra-ui/react';
import { Search, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Save, Trash2 } from 'lucide-react';
import { api, FilterResponse } from '../api';
import { StockAnalysis, StockFilter, MARKET_CAP_TIERS, getMarketCapTier, getMarketCapTierColor } from '../types';

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

  // Filter state
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
  }, [page]); // Auto-run on page change

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
      <Text color="gray.500" fontSize="xs" mb={1}>{label}</Text>
      <Input
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        bg="gray.900"
        borderColor="gray.600"
        color="white"
        _placeholder={{ color: 'gray.600' }}
        type="number"
      />
    </Box>
  );

  return (
    <Container maxW="container.xl" py={8}>
      <Flex align="center" gap={3} mb={6}>
        <Box color="orange.400"><Search size={28} /></Box>
        <Heading size="xl" color="white">Stock Screener</Heading>
        {total > 0 && <Badge colorPalette="orange" size="lg">{total} results</Badge>}
      </Flex>

      {/* Filter Panel */}
      <Card.Root bg="gray.800" borderColor="gray.700" mb={6}>
        <Card.Body p={5}>
          <VStack gap={4} align="stretch">
            {/* RSI & Stochastic */}
            <SimpleGrid columns={{ base: 2, md: 4, lg: 6 }} gap={3}>
              <FilterInput label="Min RSI" value={minRsi} onChange={setMinRsi} placeholder="0" />
              <FilterInput label="Max RSI" value={maxRsi} onChange={setMaxRsi} placeholder="100" />
              <FilterInput label="Min Stochastic %K" value={minStochK} onChange={setMinStochK} placeholder="0" />
              <FilterInput label="Max Stochastic %K" value={maxStochK} onChange={setMaxStochK} placeholder="100" />
              <FilterInput label="Min Bandwidth" value={minBandwidth} onChange={setMinBandwidth} placeholder="0" />
              <FilterInput label="Max Bandwidth" value={maxBandwidth} onChange={setMaxBandwidth} placeholder="1" />
            </SimpleGrid>

            {/* Market Cap Tiers */}
            <Box>
              <Text color="gray.500" fontSize="xs" mb={2}>Market Cap</Text>
              <HStack gap={2} wrap="wrap">
                {MARKET_CAP_TIERS.map(tier => (
                  <Badge
                    key={tier.label}
                    size="sm"
                    colorPalette={minMarketCap === tier.value ? 'orange' : 'gray'}
                    cursor="pointer"
                    onClick={() => setMinMarketCap(tier.value)}
                    _hover={{ opacity: 0.8 }}
                    px={3}
                    py={1}
                  >
                    {tier.label}
                  </Badge>
                ))}
              </HStack>
            </Box>

            {/* Toggles & Sort */}
            <Flex justify="space-between" wrap="wrap" gap={3}>
              <HStack gap={3}>
                <Badge
                  size="sm"
                  colorPalette={onlyOversold ? 'green' : 'gray'}
                  cursor="pointer"
                  onClick={() => { setOnlyOversold(!onlyOversold); setOnlyOverbought(false); }}
                  px={3} py={1}
                >
                  Oversold Only
                </Badge>
                <Badge
                  size="sm"
                  colorPalette={onlyOverbought ? 'red' : 'gray'}
                  cursor="pointer"
                  onClick={() => { setOnlyOverbought(!onlyOverbought); setOnlyOversold(false); }}
                  px={3} py={1}
                >
                  Overbought Only
                </Badge>
              </HStack>

              <HStack gap={2}>
                <Text color="gray.500" fontSize="xs">Sort:</Text>
                {['market_cap', 'price_change_percent', 'rsi', 'price'].map(field => (
                  <Badge
                    key={field}
                    size="sm"
                    colorPalette={sortBy === field ? 'orange' : 'gray'}
                    cursor="pointer"
                    onClick={() => {
                      if (sortBy === field) setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                      else { setSortBy(field); setSortOrder('desc'); }
                    }}
                    px={2} py={1}
                  >
                    {field.replace(/_/g, ' ')}{sortBy === field ? (sortOrder === 'desc' ? ' ↓' : ' ↑') : ''}
                  </Badge>
                ))}
              </HStack>
            </Flex>

            {/* Run & Presets */}
            <Flex justify="space-between" wrap="wrap" gap={3}>
              <Button colorPalette="orange" onClick={() => { setPage(1); runScreener(); }}>
                <Search size={16} /> Run Screener
              </Button>

              <HStack gap={2}>
                <Input
                  size="sm"
                  placeholder="Preset name..."
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  bg="gray.900"
                  borderColor="gray.600"
                  color="white"
                  _placeholder={{ color: 'gray.600' }}
                  w="150px"
                />
                <Button size="sm" variant="outline" colorPalette="gray" onClick={handleSavePreset} disabled={!presetName.trim()}>
                  <Save size={14} /> Save
                </Button>
              </HStack>
            </Flex>

            {/* Saved Presets */}
            {presets.length > 0 && (
              <HStack gap={2} wrap="wrap">
                <Text color="gray.500" fontSize="xs">Presets:</Text>
                {presets.map(preset => (
                  <HStack key={preset.id} gap={1}>
                    <Badge
                      colorPalette="orange"
                      size="sm"
                      cursor="pointer"
                      onClick={() => handleLoadPreset(preset)}
                      _hover={{ opacity: 0.8 }}
                      px={2}
                    >
                      {preset.name}
                    </Badge>
                    <Box
                      as="button"
                      color="gray.600"
                      _hover={{ color: 'red.400' }}
                      onClick={() => handleDeletePreset(preset.id)}
                    >
                      <Trash2 size={12} />
                    </Box>
                  </HStack>
                ))}
              </HStack>
            )}
          </VStack>
        </Card.Body>
      </Card.Root>

      {/* Results */}
      {loading ? (
        <Flex justify="center" py={12}>
          <Spinner size="xl" color="orange.400" />
        </Flex>
      ) : stocks.length === 0 ? (
        <Flex justify="center" py={12}>
          <Text color="gray.500">No stocks match your criteria. Try adjusting filters.</Text>
        </Flex>
      ) : (
        <VStack gap={2} align="stretch">
          {/* Header Row */}
          <Flex px={4} py={2} color="gray.500" fontSize="sm" fontWeight="semibold">
            <Text w="100px">Symbol</Text>
            <Text w="100px" textAlign="right">Price</Text>
            <Text w="100px" textAlign="right">Change</Text>
            <Text w="80px" textAlign="right">RSI</Text>
            <Text w="80px" textAlign="right">Stoch %K</Text>
            <Text w="100px" textAlign="right">BB Width</Text>
            <Text w="120px" textAlign="right">Market Cap</Text>
            <Text flex={1} textAlign="right">Sector</Text>
          </Flex>

          {stocks.map(stock => {
            const isPositive = (stock.price_change_percent ?? 0) >= 0;
            const tier = getMarketCapTier(stock.market_cap);
            return (
              <Link key={stock.symbol} to={`/stocks/${stock.symbol}`}>
                <Card.Root bg="gray.800" borderColor="gray.700" _hover={{ borderColor: 'gray.500', bg: 'gray.750' }} transition="all 0.15s">
                  <Card.Body px={4} py={3}>
                    <Flex align="center">
                      <Text w="100px" color="white" fontWeight="bold">{stock.symbol}</Text>
                      <Text w="100px" textAlign="right" color="white">${stock.price?.toFixed(2) ?? '-'}</Text>
                      <HStack w="100px" justify="end">
                        <Box color={isPositive ? 'green.400' : 'red.400'}>
                          {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        </Box>
                        <Text color={isPositive ? 'green.400' : 'red.400'} fontSize="sm">
                          {stock.price_change_percent != null ? `${stock.price_change_percent >= 0 ? '+' : ''}${stock.price_change_percent.toFixed(2)}%` : '-'}
                        </Text>
                      </HStack>
                      <Text w="80px" textAlign="right" color={stock.rsi != null && stock.rsi < 30 ? 'green.400' : stock.rsi != null && stock.rsi > 70 ? 'red.400' : 'gray.300'} fontSize="sm">
                        {stock.rsi?.toFixed(1) ?? '-'}
                      </Text>
                      <Text w="80px" textAlign="right" color={stock.stochastic?.k_line != null && stock.stochastic.k_line < 20 ? 'green.400' : stock.stochastic?.k_line != null && stock.stochastic.k_line > 80 ? 'red.400' : 'gray.300'} fontSize="sm">
                        {stock.stochastic?.k_line?.toFixed(1) ?? '-'}
                      </Text>
                      <Text w="100px" textAlign="right" color="gray.300" fontSize="sm">
                        {stock.bollinger?.bandwidth?.toFixed(4) ?? '-'}
                      </Text>
                      <Text w="120px" textAlign="right" fontSize="sm">
                        <Badge colorPalette={getMarketCapTierColor(tier)} size="sm">
                          {stock.market_cap ? `$${(stock.market_cap / 1e9).toFixed(1)}B` : '-'}
                        </Badge>
                      </Text>
                      <Text flex={1} textAlign="right" color="gray.500" fontSize="sm">{stock.sector || '-'}</Text>
                    </Flex>
                  </Card.Body>
                </Card.Root>
              </Link>
            );
          })}
        </VStack>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Flex justify="center" mt={6} gap={2}>
          <Button size="sm" variant="outline" colorPalette="gray" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>
            <ChevronLeft size={16} /> Prev
          </Button>
          <Flex align="center" px={4}>
            <Text color="gray.400" fontSize="sm">Page {page} of {totalPages}</Text>
          </Flex>
          <Button size="sm" variant="outline" colorPalette="gray" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
            Next <ChevronRight size={16} />
          </Button>
        </Flex>
      )}
    </Container>
  );
};
