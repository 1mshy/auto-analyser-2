import React, { useEffect, useState } from 'react';
import {
  Box,
  Text,
  VStack,
  HStack,
  Badge,
  Grid,
  GridItem,
  Spinner,
  Tabs,
  Dialog,
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from '@chakra-ui/react';
import { StockAnalysis, HistoricalDataPoint } from '../types';
import { api } from '../api';
import { toaster } from './ui/toaster';

interface StockDetailModalProps {
  stock: StockAnalysis;
  isOpen: boolean;
  onClose: () => void;
}

const StockDetailModal: React.FC<StockDetailModalProps> = ({ stock, isOpen, onClose }) => {
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistoricalData = async () => {
    try {
      setLoading(true);
      const data = await api.getStockHistory(stock.symbol);
      setHistoricalData(data);
    } catch (err) {
      console.error('Failed to fetch historical data:', err);
      toaster.create({
        title: 'Failed to load history',
        description: 'Could not fetch historical data',
        type: 'error',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && stock) {
      fetchHistoricalData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, stock]);

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatMarketCap = (cap?: number) => {
    if (!cap) return 'N/A';
    if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
    if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
    if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`;
    return `$${cap.toFixed(0)}`;
  };

  const getRsiBadgeColor = (rsi?: number) => {
    if (!rsi) return 'gray';
    if (rsi < 30) return 'green';
    if (rsi > 70) return 'red';
    return 'blue';
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(e: any) => !e.open && onClose()} size="xl">
      <DialogBackdrop />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <HStack>
              <Text fontSize="2xl" fontWeight="bold">{stock.symbol}</Text>
              <Text fontSize="xl" color="blue.600">{formatPrice(stock.price)}</Text>
            </HStack>
          </DialogTitle>
          <DialogCloseTrigger />
        </DialogHeader>

        <DialogBody>
          <Tabs.Root defaultValue="overview" variant="enclosed">
            <Tabs.List>
              <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
              <Tabs.Trigger value="technicals">Technical Indicators</Tabs.Trigger>
              <Tabs.Trigger value="chart">Chart</Tabs.Trigger>
            </Tabs.List>

            {/* Overview Tab */}
            <Tabs.Content value="overview">
              <VStack align="stretch" gap={4} py={4}>
                <Grid templateColumns="repeat(2, 1fr)" gap={4}>
                  <GridItem>
                    <Box p={3} bg="gray.50" borderRadius="md">
                      <Text fontSize="sm" color="gray.600" mb={1}>Current Price</Text>
                      <Text fontSize="2xl" fontWeight="bold">{formatPrice(stock.price)}</Text>
                    </Box>
                  </GridItem>

                  <GridItem>
                    <Box p={3} bg="gray.50" borderRadius="md">
                      <Text fontSize="sm" color="gray.600" mb={1}>Market Cap</Text>
                      <Text fontSize="2xl" fontWeight="bold">{formatMarketCap(stock.market_cap)}</Text>
                    </Box>
                  </GridItem>

                  {stock.volume && (
                    <GridItem>
                      <Box p={3} bg="gray.50" borderRadius="md">
                        <Text fontSize="sm" color="gray.600" mb={1}>Volume</Text>
                        <Text fontSize="xl" fontWeight="bold">{(stock.volume / 1e6).toFixed(2)}M</Text>
                      </Box>
                    </GridItem>
                  )}

                  {stock.sector && (
                    <GridItem>
                      <Box p={3} bg="gray.50" borderRadius="md">
                        <Text fontSize="sm" color="gray.600" mb={1}>Sector</Text>
                        <Text fontSize="xl" fontWeight="bold">{stock.sector}</Text>
                      </Box>
                    </GridItem>
                  )}
                </Grid>

                {/* Alerts */}
                {(stock.is_oversold || stock.is_overbought) && (
                  <Box p={4} bg="yellow.50" borderRadius="md" borderWidth="1px" borderColor="yellow.300">
                    <Text fontSize="sm" fontWeight="semibold" mb={2}>⚠️ Alerts</Text>
                    <HStack gap={2}>
                      {stock.is_oversold && (
                        <Badge colorScheme="green" fontSize="sm" px={3} py={1}>
                          Oversold - Potential Buy Signal
                        </Badge>
                      )}
                      {stock.is_overbought && (
                        <Badge colorScheme="red" fontSize="sm" px={3} py={1}>
                          Overbought - Potential Sell Signal
                        </Badge>
                      )}
                    </HStack>
                  </Box>
                )}
              </VStack>
            </Tabs.Content>

            {/* Technical Indicators Tab */}
            <Tabs.Content value="technicals">
              <VStack align="stretch" gap={4} py={4}>
                {/* RSI */}
                {stock.rsi !== undefined && (
                  <Box p={4} bg="gray.50" borderRadius="md">
                    <HStack justify="space-between" mb={2}>
                      <Text fontSize="md" fontWeight="semibold">RSI (Relative Strength Index)</Text>
                      <Badge colorScheme={getRsiBadgeColor(stock.rsi)} fontSize="lg" px={3} py={1}>
                        {stock.rsi.toFixed(2)}
                      </Badge>
                    </HStack>
                    <Box bg="gray.200" h="8px" borderRadius="full" position="relative">
                      <Box
                        bg={stock.rsi < 30 ? 'green.500' : stock.rsi > 70 ? 'red.500' : 'blue.500'}
                        h="8px"
                        borderRadius="full"
                        width={`${stock.rsi}%`}
                      />
                    </Box>
                    <HStack justify="space-between" mt={1}>
                      <Text fontSize="xs" color="gray.600">0 (Oversold)</Text>
                      <Text fontSize="xs" color="gray.600">100 (Overbought)</Text>
                    </HStack>
                  </Box>
                )}

                {/* Moving Averages */}
                <Box p={4} bg="gray.50" borderRadius="md">
                  <Text fontSize="md" fontWeight="semibold" mb={3}>Moving Averages</Text>
                  <VStack align="stretch" gap={2}>
                    {stock.sma_20 !== undefined && (
                      <HStack justify="space-between">
                        <Text fontSize="sm">SMA 20</Text>
                        <Text fontSize="md" fontWeight="semibold">{formatPrice(stock.sma_20)}</Text>
                      </HStack>
                    )}
                    {stock.sma_50 !== undefined && (
                      <HStack justify="space-between">
                        <Text fontSize="sm">SMA 50</Text>
                        <Text fontSize="md" fontWeight="semibold">{formatPrice(stock.sma_50)}</Text>
                      </HStack>
                    )}
                  </VStack>
                </Box>

                {/* MACD */}
                {stock.macd && (
                  <Box p={4} bg="gray.50" borderRadius="md">
                    <Text fontSize="md" fontWeight="semibold" mb={3}>MACD</Text>
                    <VStack align="stretch" gap={2}>
                      <HStack justify="space-between">
                        <Text fontSize="sm">MACD Line</Text>
                        <Text fontSize="md" fontWeight="semibold">{stock.macd.macd_line.toFixed(4)}</Text>
                      </HStack>
                      <HStack justify="space-between">
                        <Text fontSize="sm">Signal Line</Text>
                        <Text fontSize="md" fontWeight="semibold">{stock.macd.signal_line.toFixed(4)}</Text>
                      </HStack>
                      <HStack justify="space-between">
                        <Text fontSize="sm">Histogram</Text>
                        <Badge colorScheme={stock.macd.histogram > 0 ? 'green' : 'red'}>
                          {stock.macd.histogram.toFixed(4)}
                        </Badge>
                      </HStack>
                    </VStack>
                  </Box>
                )}
              </VStack>
            </Tabs.Content>

            {/* Chart Tab */}
            <Tabs.Content value="chart">
              <VStack align="stretch" gap={4} py={4}>
                {/* TradingView Widget */}
                <Box>
                  <div
                    className="tradingview-widget-container"
                    style={{ height: '500px', width: '100%' }}
                  >
                    <div
                      className="tradingview-widget-container__widget"
                      style={{ height: 'calc(100% - 32px)', width: '100%' }}
                    >
                      <iframe
                        title={`TradingView Chart for ${stock.symbol}`}
                        scrolling="no"
                        allowTransparency
                        frameBorder="0"
                        src={`https://www.tradingview.com/widgetembed/?frameElementId=tradingview_${stock.symbol}&symbol=${stock.symbol}&interval=D&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=[]&theme=light&style=1&timezone=Etc%2FUTC&withdateranges=1&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en&utm_source=localhost&utm_medium=widget_new&utm_campaign=chart&utm_term=${stock.symbol}`}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  </div>
                </Box>

                {/* Historical Data */}
                {loading ? (
                  <Box textAlign="center" py={8}>
                    <Spinner size="lg" />
                    <Text mt={2} color="gray.600">Loading historical data...</Text>
                  </Box>
                ) : historicalData.length > 0 ? (
                  <Box>
                    <Text fontSize="md" fontWeight="semibold" mb={3}>Recent Price History</Text>
                    <Box maxH="300px" overflowY="auto">
                      <VStack align="stretch" gap={2}>
                        {historicalData.slice(0, 10).map((data, idx) => (
                          <HStack
                            key={idx}
                            justify="space-between"
                            p={2}
                            bg="gray.50"
                            borderRadius="md"
                            fontSize="sm"
                          >
                            <Text fontWeight="medium">
                              {new Date(data.date).toLocaleDateString()}
                            </Text>
                            <HStack gap={4}>
                              <Text>O: {formatPrice(data.open)}</Text>
                              <Text>H: {formatPrice(data.high)}</Text>
                              <Text>L: {formatPrice(data.low)}</Text>
                              <Text fontWeight="bold">C: {formatPrice(data.close)}</Text>
                            </HStack>
                          </HStack>
                        ))}
                      </VStack>
                    </Box>
                  </Box>
                ) : (
                  <Box textAlign="center" py={4} color="gray.500">
                    No historical data available
                  </Box>
                )}
              </VStack>
            </Tabs.Content>
          </Tabs.Root>
        </DialogBody>
      </DialogContent>
    </Dialog.Root>
  );
};

export default StockDetailModal;
