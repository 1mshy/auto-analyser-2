import React, { useState, useEffect, createElement } from 'react';
import {
  Box,
  Button,
  VStack,
  HStack,
  Input,
  Drawer,
  useDisclosure,
  Badge,
  Text,
  IconButton,
} from '@chakra-ui/react';
import { IoSettings, IoBookmark, IoTrash } from 'react-icons/io5';
import { Checkbox } from './ui/checkbox';
import { StockFilter, SavedFilter } from '../types';
import { toaster } from './ui/toaster';

interface FilterPanelProps {
  onApplyFilter: (filter: StockFilter) => void;
  activeFilterCount: number;
}

const SAVED_FILTERS_KEY = 'stock_analyzer_saved_filters';

const FilterPanel: React.FC<FilterPanelProps> = ({ onApplyFilter, activeFilterCount }) => {
  const { open, onOpen, onClose } = useDisclosure();
  const [filter, setFilter] = useState<StockFilter>({});
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [filterName, setFilterName] = useState('');

  // Load saved filters from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(SAVED_FILTERS_KEY);
    if (saved) {
      try {
        setSavedFilters(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load saved filters:', e);
      }
    }
  }, []);

  // Save filters to localStorage
  const saveFiltersToStorage = (filters: SavedFilter[]) => {
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(filters));
    setSavedFilters(filters);
  };

  const handleApply = () => {
    onApplyFilter(filter);
    onClose();
  };

  const handleClear = () => {
    setFilter({});
    onApplyFilter({});
  };

  const handleSaveFilter = () => {
    if (!filterName.trim()) {
      toaster.create({
        title: 'Name required',
        description: 'Please enter a name for this filter',
        type: 'error',
        duration: 3000,
      });
      return;
    }

    const newFilter: SavedFilter = {
      id: Date.now().toString(),
      name: filterName,
      filter: filter,
      createdAt: new Date().toISOString(),
    };

    const updated = [...savedFilters, newFilter];
    saveFiltersToStorage(updated);
    setFilterName('');
    
    toaster.create({
      title: 'Filter saved',
      description: `"${filterName}" saved successfully`,
      type: 'success',
      duration: 3000,
    });
  };

  const handleLoadFilter = (savedFilter: SavedFilter) => {
    setFilter(savedFilter.filter);
    toaster.create({
      title: 'Filter loaded',
      description: `"${savedFilter.name}" applied`,
      type: 'success',
      duration: 2000,
    });
  };

  const handleDeleteFilter = (id: string) => {
    const updated = savedFilters.filter(f => f.id !== id);
    saveFiltersToStorage(updated);
    
    toaster.create({
      title: 'Filter deleted',
      type: 'success',
      duration: 2000,
    });
  };

  const loadPreset = (preset: 'oversold' | 'overbought' | 'all') => {
    switch (preset) {
      case 'oversold':
        setFilter({ max_rsi: 30 });
        break;
      case 'overbought':
        setFilter({ min_rsi: 70 });
        break;
      case 'all':
        setFilter({});
        break;
    }
  };

  const updateFilter = (key: keyof StockFilter, value: any) => {
    setFilter((prev) => ({ ...prev, [key]: value }));
  };

  const handleNumberInput = (key: keyof StockFilter, value: string, multiplier: number = 1) => {
    if (value === '' || value === null) {
      updateFilter(key, undefined);
      return;
    }
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0) {
      updateFilter(key, parsed * multiplier);
    }
  };

  return (
    <>
      <Button
        colorScheme="blue"
        variant="solid"
        onClick={onOpen}
        position="relative"
        display="flex"
        alignItems="center"
        gap={2}
      >
        {createElement(IoSettings as any)}
        Filters
        {activeFilterCount > 0 && (
          <Badge
            position="absolute"
            top="-2"
            right="-2"
            colorScheme="red"
            borderRadius="full"
            fontSize="xs"
          >
            {activeFilterCount}
          </Badge>
        )}
      </Button>

      <Drawer.Root open={open} onOpenChange={(e: any) => e.open ? null : onClose()} placement="end" size="md">
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Title>Filter Stocks</Drawer.Title>
              <Drawer.CloseTrigger />
            </Drawer.Header>

            <Drawer.Body>
            <VStack gap={4} align="stretch">
              {/* Quick Presets */}
              <Box>
                <Text fontSize="lg" fontWeight="semibold" mb={2}>
                  Quick Presets
                </Text>
                <HStack gap={2} flexWrap="wrap">
                  <Button size="sm" onClick={() => loadPreset('oversold')} colorScheme="green">
                    Low RSI (&lt;30)
                  </Button>
                  <Button size="sm" onClick={() => loadPreset('overbought')} colorScheme="red">
                    High RSI (&gt;70)
                  </Button>
                  <Button size="sm" onClick={() => loadPreset('all')} variant="outline">
                    All Stocks
                  </Button>
                </HStack>
              </Box>

              {/* Saved Filters */}
              {savedFilters.length > 0 && (
                <Box>
                  <Text fontSize="lg" fontWeight="semibold" mb={2}>
                    Saved Filters
                  </Text>
                  <VStack gap={2} align="stretch">
                    {savedFilters.map((sf) => (
                      <HStack key={sf.id} justify="space-between" p={2} bg="bg.muted" borderRadius="md">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleLoadFilter(sf)}
                          flex="1"
                          justifyContent="flex-start"
                          display="flex"
                          alignItems="center"
                          gap={2}
                        >
                          {createElement(IoBookmark as any)}
                          {sf.name}
                        </Button>
                        <IconButton
                          aria-label="Delete filter"
                          size="sm"
                          variant="ghost"
                          colorScheme="red"
                          onClick={() => handleDeleteFilter(sf.id)}
                        >
                          {createElement(IoTrash as any)}
                        </IconButton>
                      </HStack>
                    ))}
                  </VStack>
                </Box>
              )}
              {/* Price Range */}
              <Box>
                <Text fontSize="lg" fontWeight="semibold" mb={2}>
                  Price Range
                </Text>
                <HStack>
                  <Box flex="1">
                    <Text fontSize="sm" mb={1}>Min Price</Text>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={filter.min_price ?? ''}
                      onChange={(e) => handleNumberInput('min_price', e.target.value)}
                      placeholder="$0"
                    />
                  </Box>
                  <Box flex="1">
                    <Text fontSize="sm" mb={1}>Max Price</Text>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={filter.max_price ?? ''}
                      onChange={(e) => handleNumberInput('max_price', e.target.value)}
                      placeholder="$1000"
                    />
                  </Box>
                </HStack>
              </Box>

              {/* RSI Range */}
              <Box>
                <Text fontSize="lg" fontWeight="semibold" mb={2}>
                  RSI Range
                </Text>
                <HStack>
                  <Box flex="1">
                    <Text fontSize="sm" mb={1}>Min RSI</Text>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={filter.min_rsi ?? ''}
                      onChange={(e) => handleNumberInput('min_rsi', e.target.value)}
                      placeholder="0"
                    />
                  </Box>
                  <Box flex="1">
                    <Text fontSize="sm" mb={1}>Max RSI</Text>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={filter.max_rsi ?? ''}
                      onChange={(e) => handleNumberInput('max_rsi', e.target.value)}
                      placeholder="100"
                    />
                  </Box>
                </HStack>
              </Box>

              {/* Market Cap Range */}
              <Box>
                <Text fontSize="lg" fontWeight="semibold" mb={2}>
                  Market Cap
                </Text>
                <HStack>
                  <Box flex="1">
                    <Text fontSize="sm" mb={1}>Min (Billions)</Text>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={filter.min_market_cap != null && typeof filter.min_market_cap === 'number' && filter.min_market_cap > 0 ? (filter.min_market_cap / 1e9).toFixed(2) : ''}
                      onChange={(e) => handleNumberInput('min_market_cap', e.target.value, 1e9)}
                      placeholder="0"
                    />
                  </Box>
                  <Box flex="1">
                    <Text fontSize="sm" mb={1}>Max (Billions)</Text>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={filter.max_market_cap != null && typeof filter.max_market_cap === 'number' && filter.max_market_cap > 0 ? (filter.max_market_cap / 1e9).toFixed(2) : ''}
                      onChange={(e) => handleNumberInput('max_market_cap', e.target.value, 1e9)}
                      placeholder="5000"
                    />
                  </Box>
                </HStack>
              </Box>

              {/* Volume */}
              <Box>
                <Text fontSize="sm" mb={1}>Min Volume (Millions)</Text>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={filter.min_volume != null && typeof filter.min_volume === 'number' && filter.min_volume > 0 ? (filter.min_volume / 1e6).toFixed(2) : ''}
                  onChange={(e) => handleNumberInput('min_volume', e.target.value, 1e6)}
                  placeholder="0"
                />
              </Box>

              {/* Quick Filters */}
              <Box>
                <Text fontSize="lg" fontWeight="semibold" mb={2}>
                  Quick Filters
                </Text>
                <VStack align="start" gap={2}>
                  <Checkbox
                    checked={filter.only_oversold || false}
                    onCheckedChange={(e: any) => updateFilter('only_oversold', e.checked)}
                  >
                    Only Oversold (RSI &lt; 30)
                  </Checkbox>
                  <Checkbox
                    checked={filter.only_overbought || false}
                    onCheckedChange={(e: any) => updateFilter('only_overbought', e.checked)}
                  >
                    Only Overbought (RSI &gt; 70)
                  </Checkbox>
                </VStack>
              </Box>
            </VStack>
          </Drawer.Body>

          <Drawer.Footer>
            <VStack gap={3} width="100%">
              {/* Save Current Filter */}
              <HStack width="100%">
                <Input
                  placeholder="Filter name..."
                  value={filterName}
                  onChange={(e) => setFilterName(e.target.value)}
                  size="sm"
                />
                <Button size="sm" onClick={handleSaveFilter} colorScheme="green">
                  Save
                </Button>
              </HStack>
              
              {/* Action Buttons */}
              <HStack width="100%" justify="flex-end">
                <Button variant="outline" onClick={handleClear}>
                  Clear All
                </Button>
                <Button colorScheme="blue" onClick={handleApply}>
                  Apply Filters
                </Button>
              </HStack>
            </VStack>
          </Drawer.Footer>
        </Drawer.Content>
        </Drawer.Positioner>
      </Drawer.Root>
    </>
  );
};

export default FilterPanel;
