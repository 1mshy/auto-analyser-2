import React, { useState, createElement } from 'react';
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
} from '@chakra-ui/react';
import { IoSettings } from 'react-icons/io5';
import { Checkbox } from './ui/checkbox';
import { StockFilter } from '../types';

interface FilterPanelProps {
  onApplyFilter: (filter: StockFilter) => void;
  activeFilterCount: number;
}

const FilterPanel: React.FC<FilterPanelProps> = ({ onApplyFilter, activeFilterCount }) => {
  const { open, onOpen, onClose } = useDisclosure();
  const [filter, setFilter] = useState<StockFilter>({});

  const handleApply = () => {
    onApplyFilter(filter);
    onClose();
  };

  const handleClear = () => {
    setFilter({});
    onApplyFilter({});
  };

  const updateFilter = (key: keyof StockFilter, value: any) => {
    setFilter((prev) => ({ ...prev, [key]: value }));
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
                      value={filter.min_price || ''}
                      onChange={(e) => updateFilter('min_price', e.target.value ? parseFloat(e.target.value) : undefined)}
                      placeholder="$0"
                    />
                  </Box>
                  <Box flex="1">
                    <Text fontSize="sm" mb={1}>Max Price</Text>
                    <Input
                      type="number"
                      value={filter.max_price || ''}
                      onChange={(e) => updateFilter('max_price', e.target.value ? parseFloat(e.target.value) : undefined)}
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
                      value={filter.min_rsi || ''}
                      onChange={(e) => updateFilter('min_rsi', e.target.value ? parseFloat(e.target.value) : undefined)}
                      placeholder="0"
                    />
                  </Box>
                  <Box flex="1">
                    <Text fontSize="sm" mb={1}>Max RSI</Text>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={filter.max_rsi || ''}
                      onChange={(e) => updateFilter('max_rsi', e.target.value ? parseFloat(e.target.value) : undefined)}
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
                      value={filter.min_market_cap ? filter.min_market_cap / 1e9 : ''}
                      onChange={(e) => updateFilter('min_market_cap', e.target.value ? parseFloat(e.target.value) * 1e9 : undefined)}
                      placeholder="0"
                    />
                  </Box>
                  <Box flex="1">
                    <Text fontSize="sm" mb={1}>Max (Billions)</Text>
                    <Input
                      type="number"
                      value={filter.max_market_cap ? filter.max_market_cap / 1e9 : ''}
                      onChange={(e) => updateFilter('max_market_cap', e.target.value ? parseFloat(e.target.value) * 1e9 : undefined)}
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
                  value={filter.min_volume ? filter.min_volume / 1e6 : ''}
                  onChange={(e) => updateFilter('min_volume', e.target.value ? parseFloat(e.target.value) * 1e6 : undefined)}
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
            <Button variant="outline" mr={3} onClick={handleClear}>
              Clear All
            </Button>
            <Button colorScheme="blue" onClick={handleApply}>
              Apply Filters
            </Button>
          </Drawer.Footer>
        </Drawer.Content>
        </Drawer.Positioner>
      </Drawer.Root>
    </>
  );
};

export default FilterPanel;
