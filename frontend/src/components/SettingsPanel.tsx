import React, { useState, createElement } from 'react';
import {
  Box,
  Button,
  VStack,
  HStack,
  Text,
  Drawer,
  useDisclosure,
  Badge,
  IconButton,
  Slider,
  SimpleGrid,
  Card,
  Separator,
} from '@chakra-ui/react';
import { IoSettingsSharp, IoCheckmarkCircle, IoSparkles, IoBusinessSharp, IoGlobeOutline } from 'react-icons/io5';
import { useSettings } from '../contexts/SettingsContext';
import { MARKET_CAP_TIERS, SETTINGS_PRESETS } from '../types';
import { toaster } from './ui/toaster';

interface SettingsPanelProps {
  showBadge?: boolean;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ showBadge = true }) => {
  const { open, onOpen, onClose } = useDisclosure();
  const { settings, updateSettings, applyPreset, isFiltered } = useSettings();
  
  // Local state for slider (to avoid too many re-renders)
  const [localMinMarketCap, setLocalMinMarketCap] = useState<number | null>(settings.minMarketCap);
  const [localMaxPriceChange, setLocalMaxPriceChange] = useState<number | null>(settings.maxPriceChangePercent);

  // Sync local state when drawer opens
  const handleOpen = () => {
    setLocalMinMarketCap(settings.minMarketCap);
    setLocalMaxPriceChange(settings.maxPriceChangePercent);
    onOpen();
  };

  const handleApply = () => {
    updateSettings({
      minMarketCap: localMinMarketCap,
      maxPriceChangePercent: localMaxPriceChange,
    });
    toaster.create({
      title: 'Settings Applied',
      description: 'Your filter preferences have been saved',
      type: 'success',
      duration: 2000,
    });
    onClose();
  };

  const handlePreset = (preset: 'all' | 'quality' | 'large_cap') => {
    applyPreset(preset);
    setLocalMinMarketCap(SETTINGS_PRESETS[preset].minMarketCap);
    setLocalMaxPriceChange(SETTINGS_PRESETS[preset].maxPriceChangePercent);
    toaster.create({
      title: 'Preset Applied',
      description: `Switched to "${preset === 'all' ? 'Show All' : preset === 'quality' ? 'Quality Stocks' : 'Large Cap Only'}" preset`,
      type: 'success',
      duration: 2000,
    });
  };

  // Find the market cap tier label
  const getMarketCapLabel = (value: number | null) => {
    const tier = MARKET_CAP_TIERS.find(t => t.value === value);
    return tier?.label || 'Custom';
  };

  // Find slider index from value
  const getSliderIndex = (value: number | null): number => {
    const index = MARKET_CAP_TIERS.findIndex(t => t.value === value);
    return index >= 0 ? index : 0;
  };

  const handleSliderChange = (details: { value: number[] }) => {
    const index = details.value[0];
    const tier = MARKET_CAP_TIERS[index];
    setLocalMinMarketCap(tier?.value ?? null);
  };

  return (
    <>
      <Box position="relative">
        <IconButton
          aria-label="Settings"
          variant="ghost"
          colorPalette="gray"
          size="sm"
          onClick={handleOpen}
          _hover={{ bg: 'whiteAlpha.200' }}
        >
          {createElement(IoSettingsSharp as any, { size: 20 })}
        </IconButton>
        {showBadge && isFiltered && (
          <Badge
            position="absolute"
            top="-1"
            right="-1"
            colorPalette="orange"
            borderRadius="full"
            fontSize="9px"
            px={1.5}
          >
            ON
          </Badge>
        )}
      </Box>

      <Drawer.Root open={open} onOpenChange={(e: any) => e.open ? null : onClose()} placement="end" size="md">
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content bg="gray.900">
            <Drawer.Header borderBottomWidth="1px" borderColor="gray.700">
              <Drawer.Title color="white">
                <HStack gap={2}>
                  {createElement(IoSettingsSharp as any, { size: 24 })}
                  <Text>Global Settings</Text>
                </HStack>
              </Drawer.Title>
              <Text fontSize="sm" color="gray.400" mt={1}>
                Filter settings apply across all views
              </Text>
              <Drawer.CloseTrigger />
            </Drawer.Header>

            <Drawer.Body>
              <VStack gap={6} align="stretch" py={4}>
                {/* Quick Presets */}
                <Box>
                  <Text fontSize="lg" fontWeight="semibold" color="white" mb={3}>
                    Quick Presets
                  </Text>
                  <SimpleGrid columns={3} gap={3}>
                    <Card.Root
                      bg={settings.preset === 'all' ? 'blue.900' : 'gray.800'}
                      borderColor={settings.preset === 'all' ? 'blue.500' : 'gray.700'}
                      borderWidth="2px"
                      cursor="pointer"
                      onClick={() => handlePreset('all')}
                      _hover={{ borderColor: 'blue.400' }}
                      transition="all 0.2s"
                    >
                      <Card.Body p={3} textAlign="center">
                        <Box color="gray.400" mb={2}>
                          {createElement(IoGlobeOutline as any, { size: 24 })}
                        </Box>
                        <Text fontWeight="semibold" color="white" fontSize="sm">Show All</Text>
                        <Text fontSize="xs" color="gray.400">No filtering</Text>
                      </Card.Body>
                    </Card.Root>

                    <Card.Root
                      bg={settings.preset === 'quality' ? 'green.900' : 'gray.800'}
                      borderColor={settings.preset === 'quality' ? 'green.500' : 'gray.700'}
                      borderWidth="2px"
                      cursor="pointer"
                      onClick={() => handlePreset('quality')}
                      _hover={{ borderColor: 'green.400' }}
                      transition="all 0.2s"
                    >
                      <Card.Body p={3} textAlign="center">
                        <Box color="green.400" mb={2}>
                          {createElement(IoSparkles as any, { size: 24 })}
                        </Box>
                        <Text fontWeight="semibold" color="white" fontSize="sm">Quality</Text>
                        <Text fontSize="xs" color="gray.400">$1B+ / ±50%</Text>
                      </Card.Body>
                    </Card.Root>

                    <Card.Root
                      bg={settings.preset === 'large_cap' ? 'purple.900' : 'gray.800'}
                      borderColor={settings.preset === 'large_cap' ? 'purple.500' : 'gray.700'}
                      borderWidth="2px"
                      cursor="pointer"
                      onClick={() => handlePreset('large_cap')}
                      _hover={{ borderColor: 'purple.400' }}
                      transition="all 0.2s"
                    >
                      <Card.Body p={3} textAlign="center">
                        <Box color="purple.400" mb={2}>
                          {createElement(IoBusinessSharp as any, { size: 24 })}
                        </Box>
                        <Text fontWeight="semibold" color="white" fontSize="sm">Large Cap</Text>
                        <Text fontSize="xs" color="gray.400">$10B+ / ±30%</Text>
                      </Card.Body>
                    </Card.Root>
                  </SimpleGrid>
                </Box>

                <Separator borderColor="gray.700" />

                {/* Minimum Market Cap */}
                <Box>
                  <HStack justify="space-between" mb={3}>
                    <Text fontSize="lg" fontWeight="semibold" color="white">
                      Minimum Market Cap
                    </Text>
                    <Badge colorPalette={localMinMarketCap ? 'blue' : 'gray'} size="lg">
                      {getMarketCapLabel(localMinMarketCap)}
                    </Badge>
                  </HStack>
                  <Text fontSize="sm" color="gray.400" mb={4}>
                    Filter out small-cap stocks that often have unreliable price data
                  </Text>
                  <Box px={2}>
                    <Slider.Root
                      min={0}
                      max={MARKET_CAP_TIERS.length - 1}
                      step={1}
                      value={[getSliderIndex(localMinMarketCap)]}
                      onValueChange={handleSliderChange}
                    >
                      <Slider.Control>
                        <Slider.Track bg="gray.700">
                          <Slider.Range bg="blue.500" />
                        </Slider.Track>
                        <Slider.Thumb index={0} bg="white" boxSize={5} />
                      </Slider.Control>
                    </Slider.Root>
                  </Box>
                  <HStack justify="space-between" mt={2}>
                    <Text fontSize="xs" color="gray.500">All</Text>
                    <Text fontSize="xs" color="gray.500">$200B+</Text>
                  </HStack>
                </Box>

                {/* Max Price Change Filter */}
                <Box>
                  <HStack justify="space-between" mb={3}>
                    <Text fontSize="lg" fontWeight="semibold" color="white">
                      Max Price Change
                    </Text>
                    <Badge colorPalette={localMaxPriceChange ? 'orange' : 'gray'} size="lg">
                      {localMaxPriceChange ? `±${localMaxPriceChange}%` : 'No Limit'}
                    </Badge>
                  </HStack>
                  <Text fontSize="sm" color="gray.400" mb={4}>
                    Exclude stocks with extreme daily price movements (often data errors)
                  </Text>
                  <Box px={2}>
                    <Slider.Root
                      min={0}
                      max={5}
                      step={1}
                      value={[
                        localMaxPriceChange === null ? 0 :
                        localMaxPriceChange === 20 ? 1 :
                        localMaxPriceChange === 30 ? 2 :
                        localMaxPriceChange === 50 ? 3 :
                        localMaxPriceChange === 100 ? 4 : 5
                      ]}
                      onValueChange={(details: { value: number[] }) => {
                        const values = [null, 20, 30, 50, 100, null];
                        setLocalMaxPriceChange(values[details.value[0]]);
                      }}
                    >
                      <Slider.Control>
                        <Slider.Track bg="gray.700">
                          <Slider.Range bg="orange.500" />
                        </Slider.Track>
                        <Slider.Thumb index={0} bg="white" boxSize={5} />
                      </Slider.Control>
                    </Slider.Root>
                  </Box>
                  <HStack justify="space-between" mt={2}>
                    <Text fontSize="xs" color="gray.500">No Limit</Text>
                    <Text fontSize="xs" color="gray.500">±100% max</Text>
                  </HStack>
                </Box>

                <Separator borderColor="gray.700" />

                {/* Current Settings Summary */}
                <Box bg="gray.800" p={4} borderRadius="lg">
                  <Text fontWeight="semibold" color="white" mb={2}>
                    Current Filter Summary
                  </Text>
                  <VStack align="start" gap={1}>
                    <HStack>
                      {createElement(IoCheckmarkCircle as any, { color: localMinMarketCap ? '#48BB78' : '#718096' })}
                      <Text fontSize="sm" color={localMinMarketCap ? 'green.400' : 'gray.400'}>
                        {localMinMarketCap 
                          ? `Minimum: ${getMarketCapLabel(localMinMarketCap)}`
                          : 'No market cap filter'}
                      </Text>
                    </HStack>
                    <HStack>
                      {createElement(IoCheckmarkCircle as any, { color: localMaxPriceChange ? '#ED8936' : '#718096' })}
                      <Text fontSize="sm" color={localMaxPriceChange ? 'orange.400' : 'gray.400'}>
                        {localMaxPriceChange 
                          ? `Max change: ±${localMaxPriceChange}%`
                          : 'No price change filter'}
                      </Text>
                    </HStack>
                  </VStack>
                </Box>
              </VStack>
            </Drawer.Body>

            <Drawer.Footer borderTopWidth="1px" borderColor="gray.700">
              <HStack width="100%" justify="flex-end" gap={3}>
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button colorPalette="blue" onClick={handleApply}>
                  Apply Settings
                </Button>
              </HStack>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer.Positioner>
      </Drawer.Root>
    </>
  );
};

export default SettingsPanel;


