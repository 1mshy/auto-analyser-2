import { useState } from 'react';
import {
  Box,
  Button,
  CloseButton,
  Drawer,
  Field,
  HStack,
  Input,
  Text,
  VStack,
} from '@chakra-ui/react';
import { SlidersHorizontal } from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import type { StockFilter } from '../types';
import {
  FilterRange,
  NumericFilterField,
} from '../features/stocks/FilterFields';
import { validateFilter } from '../features/stocks/workspace';

interface FilterPanelProps {
  onApplyFilter: (filter: StockFilter) => void;
  activeFilterCount: number;
  value?: StockFilter;
}

export default function FilterPanel({
  onApplyFilter,
  activeFilterCount,
  value = {},
}: FilterPanelProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<StockFilter>({});
  const [sectors, setSectors] = useState('');
  const error = validateFilter(filter);
  const show = () => {
    setFilter({ ...value });
    setSectors(value.sectors?.join(', ') ?? '');
    setOpen(true);
  };

  return (
    <>
      <Button
        size="sm"
        px={{ base: 2, md: 3 }}
        variant="outline"
        onClick={show}
      >
        <SlidersHorizontal size={15} />
        Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
      </Button>
      <Drawer.Root
        open={open}
        onOpenChange={(event) => setOpen(event.open)}
        placement="end"
        size="md"
      >
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content bg="bg.surface" color="fg.default" maxW="100vw">
            <Drawer.Header borderBottomWidth="1px" borderColor="border.subtle">
              <Drawer.Title>Refine your universe</Drawer.Title>
              <Drawer.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body>
              <VStack align="stretch" gap={6}>
                <Text fontSize="sm" color="fg.muted">
                  Combine ranges to focus your results. Changes take effect when
                  you apply them.
                </Text>
                <Box>
                  <Text fontWeight="semibold" fontSize="sm" mb={3}>
                    Technical signals
                  </Text>
                  <HStack gap={3} wrap="wrap">
                    <Checkbox
                      checked={!!filter.only_oversold}
                      onCheckedChange={(event) =>
                        setFilter({
                          ...filter,
                          only_oversold: !!event.checked || undefined,
                          only_overbought: undefined,
                        })
                      }
                    >
                      Oversold (RSI &lt; 30)
                    </Checkbox>
                    <Checkbox
                      checked={!!filter.only_overbought}
                      onCheckedChange={(event) =>
                        setFilter({
                          ...filter,
                          only_overbought: !!event.checked || undefined,
                          only_oversold: undefined,
                        })
                      }
                    >
                      Overbought (RSI &gt; 70)
                    </Checkbox>
                  </HStack>
                </Box>
                <FilterRange
                  title="RSI"
                  min="min_rsi"
                  max="max_rsi"
                  limit={100}
                  filter={filter}
                  onChange={setFilter}
                />
                <FilterRange
                  title="Stochastic %K"
                  min="min_stochastic_k"
                  max="max_stochastic_k"
                  limit={100}
                  filter={filter}
                  onChange={setFilter}
                />
                <Box>
                  <FilterRange
                    title="Bollinger bandwidth"
                    min="min_bandwidth"
                    max="max_bandwidth"
                    filter={filter}
                    onChange={setFilter}
                  />
                  <Text fontSize="xs" color="fg.muted" mt={2}>
                    Use the raw indicator value, e.g. 0.1 for a narrow band.
                  </Text>
                </Box>
                <FilterRange
                  title="Price ($)"
                  min="min_price"
                  max="max_price"
                  filter={filter}
                  onChange={setFilter}
                />
                <FilterRange
                  title="Market cap ($ billions)"
                  min="min_market_cap"
                  max="max_market_cap"
                  multiplier={1e9}
                  filter={filter}
                  onChange={setFilter}
                />
                <NumericFilterField
                  label="Minimum volume (millions)"
                  field="min_volume"
                  multiplier={1e6}
                  filter={filter}
                  onChange={setFilter}
                />
                <NumericFilterField
                  label="Maximum absolute day change (%)"
                  field="max_abs_price_change_percent"
                  filter={filter}
                  onChange={setFilter}
                />
                <Field.Root>
                  <Field.Label>Sector</Field.Label>
                  <Input
                    value={sectors}
                    onChange={(event) => setSectors(event.target.value)}
                    placeholder="e.g. Technology, Healthcare"
                  />
                  <Field.HelperText>
                    Exact sector names, separated by commas.
                  </Field.HelperText>
                </Field.Root>
                {error && (
                  <Text role="alert" color="signal.down.fg" fontSize="sm">
                    {error}
                  </Text>
                )}
              </VStack>
            </Drawer.Body>
            <Drawer.Footer
              borderTopWidth="1px"
              borderColor="border.subtle"
              justifyContent="space-between"
              flexWrap="wrap"
              gap={2}
            >
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFilter({});
                  setSectors('');
                }}
              >
                Reset fields
              </Button>
              <HStack w={{ base: 'full', sm: 'auto' }}>
                <Button
                  flex={{ base: 1, sm: 'initial' }}
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  flex={{ base: 1, sm: 'initial' }}
                  disabled={!!error}
                  onClick={() => {
                    onApplyFilter({
                      ...filter,
                      sectors: sectors
                        .split(',')
                        .map((sector) => sector.trim())
                        .filter(Boolean),
                    });
                    setOpen(false);
                  }}
                >
                  Apply filters
                </Button>
              </HStack>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer.Positioner>
      </Drawer.Root>
    </>
  );
}
