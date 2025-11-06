import React, { useEffect, useState, useRef } from 'react';
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
} from '@chakra-ui/react';
import { StockAnalysis, HistoricalDataPoint } from '../types';
import { api } from '../api';
import { toaster } from './ui/toaster';

interface StockDetailModalProps {
  stock: StockAnalysis;
  isOpen: boolean;
  onClose: () => void;
}

// TradingView widget loader
declare global {
  interface Window {
    TradingView: any;
  }
}

const StockDetailModal: React.FC<StockDetailModalProps> = ({ stock, isOpen, onClose }) => {
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const profileContainerRef = useRef<HTMLDivElement>(null);
  const fundamentalsContainerRef = useRef<HTMLDivElement>(null);

  console.log('StockDetailModal render:', { symbol: stock.symbol, isOpen });

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

  // Load TradingView script
  useEffect(() => {
    if (!document.getElementById('tradingview-widget-script')) {
      const script = document.createElement('script');
      script.id = 'tradingview-widget-script';
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  // Initialize TradingView widgets when modal opens
  useEffect(() => {
    if (isOpen && stock) {
      fetchHistoricalData();

      // Wait for TradingView script to load
      const initWidgets = () => {
        if (typeof window.TradingView !== 'undefined') {
          // Advanced Chart Widget
          if (chartContainerRef.current) {
            chartContainerRef.current.innerHTML = '';
            new window.TradingView.widget({
              autosize: true,
              symbol: stock.symbol,
              interval: 'D',
              timezone: 'Etc/UTC',
              theme: 'light',
              style: '1',
              locale: 'en',
              toolbar_bg: '#f1f3f6',
              enable_publishing: false,
              hide_top_toolbar: false,
              hide_legend: false,
              save_image: false,
              container_id: chartContainerRef.current.id,
              studies: [
                'RSI@tv-basicstudies',
                'MASimple@tv-basicstudies',
                'MACD@tv-basicstudies'
              ],
            });
          }

          // Company Profile Widget (HTML embed)
          if (profileContainerRef.current) {
            profileContainerRef.current.innerHTML = `
              <div class="tradingview-widget-container" style="height:100%;width:100%">
                <div class="tradingview-widget-container__widget" style="height:calc(100% - 32px);width:100%"></div>
                <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-symbol-profile.js" async>
                {
                  "width": "100%",
                  "height": "100%",
                  "colorTheme": "light",
                  "isTransparent": false,
                  "symbol": "${stock.symbol}",
                  "locale": "en"
                }
                </script>
              </div>
            `;
          }

          // Fundamental Data Widget (HTML embed)
          if (fundamentalsContainerRef.current) {
            fundamentalsContainerRef.current.innerHTML = `
              <div class="tradingview-widget-container" style="height:100%;width:100%">
                <div class="tradingview-widget-container__widget" style="height:calc(100% - 32px);width:100%"></div>
                <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-financials.js" async>
                {
                  "width": "100%",
                  "height": "100%",
                  "colorTheme": "light",
                  "isTransparent": false,
                  "symbol": "${stock.symbol}",
                  "displayMode": "regular",
                  "locale": "en"
                }
                </script>
              </div>
            `;
          }
        } else {
          // Retry after 500ms if TradingView not loaded yet
          setTimeout(initWidgets, 500);
        }
      };

      setTimeout(initWidgets, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, stock]);

  const formatPrice = (price?: number | null) => {
    if (price === null || price === undefined) return 'N/A';
    return `$${price.toFixed(2)}`;
  };
  
  const formatMarketCap = (cap?: number | null) => {
    if (!cap || cap === null) return 'N/A';
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
    <Dialog.Root open={isOpen} onOpenChange={(details: any) => !details.open && onClose()}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content 
          maxW="95vw" 
          maxH="95vh" 
          overflowY="auto"
          bg="black"
          p={6}
          borderRadius="lg"
        >
          <Dialog.Header>
            <Dialog.Title>
              <HStack>
                <Text fontSize="2xl" fontWeight="bold">{stock.symbol}</Text>
                <Text fontSize="xl" color="blue.400">{formatPrice(stock.price)}</Text>
              </HStack>
            </Dialog.Title>
            <Dialog.CloseTrigger />
          </Dialog.Header>

          <Dialog.Body>
          <Tabs.Root defaultValue="overview" variant="enclosed">
            <Tabs.List>
              <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
              <Tabs.Trigger value="technicals">Technical Indicators</Tabs.Trigger>
              <Tabs.Trigger value="chart">Chart</Tabs.Trigger>
              <Tabs.Trigger value="company">Company Profile</Tabs.Trigger>
              <Tabs.Trigger value="fundamentals">Fundamentals</Tabs.Trigger>
            </Tabs.List>

            {/* Overview Tab */}
            <Tabs.Content value="overview">
              <VStack align="stretch" gap={4} py={4}>
                <Grid templateColumns="repeat(2, 1fr)" gap={4}>
                  <GridItem>
                    <Box p={3} bg="bg.muted" borderRadius="md">
                      <Text fontSize="sm" color="fg.muted" mb={1}>Current Price</Text>
                      <Text fontSize="2xl" fontWeight="bold">{formatPrice(stock.price)}</Text>
                    </Box>
                  </GridItem>

                  <GridItem>
                    <Box p={3} bg="bg.muted" borderRadius="md">
                      <Text fontSize="sm" color="fg.muted" mb={1}>Market Cap</Text>
                      <Text fontSize="2xl" fontWeight="bold">{formatMarketCap(stock.market_cap)}</Text>
                    </Box>
                  </GridItem>

                  {stock.volume && (
                    <GridItem>
                      <Box p={3} bg="bg.muted" borderRadius="md">
                        <Text fontSize="sm" color="fg.muted" mb={1}>Volume</Text>
                        <Text fontSize="xl" fontWeight="bold">{(stock.volume / 1e6).toFixed(2)}M</Text>
                      </Box>
                    </GridItem>
                  )}

                  {stock.sector && (
                    <GridItem>
                      <Box p={3} bg="bg.muted" borderRadius="md">
                        <Text fontSize="sm" color="fg.muted" mb={1}>Sector</Text>
                        <Text fontSize="xl" fontWeight="bold">{stock.sector}</Text>
                      </Box>
                    </GridItem>
                  )}
                </Grid>

                {/* Alerts */}
                {(stock.is_oversold || stock.is_overbought) && (
                  <Box p={4} bg="yellow.subtle" borderRadius="md" borderWidth="1px" borderColor="yellow.emphasized">
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
                  <Box p={4} bg="bg.muted" borderRadius="md">
                    <HStack justify="space-between" mb={2}>
                      <Text fontSize="md" fontWeight="semibold">RSI (Relative Strength Index)</Text>
                      <Badge colorScheme={getRsiBadgeColor(stock.rsi)} fontSize="lg" px={3} py={1}>
                        {stock.rsi.toFixed(2)}
                      </Badge>
                    </HStack>
                    <Box bg="bg.emphasized" h="8px" borderRadius="full" position="relative">
                      <Box
                        bg={stock.rsi < 30 ? 'green.500' : stock.rsi > 70 ? 'red.500' : 'blue.500'}
                        h="8px"
                        borderRadius="full"
                        width={`${stock.rsi}%`}
                      />
                    </Box>
                    <HStack justify="space-between" mt={1}>
                      <Text fontSize="xs" color="fg.muted">0 (Oversold)</Text>
                      <Text fontSize="xs" color="fg.muted">100 (Overbought)</Text>
                    </HStack>
                  </Box>
                )}

                {/* Moving Averages */}
                <Box p={4} bg="bg.muted" borderRadius="md">
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
                  <Box p={4} bg="bg.muted" borderRadius="md">
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
                {/* TradingView Advanced Chart Widget */}
                <Box>
                  <div
                    id={`tradingview_chart_${stock.symbol}`}
                    ref={chartContainerRef}
                    style={{ height: '600px', width: '100%' }}
                  />
                </Box>

                {/* Historical Data */}
                {loading ? (
                  <Box textAlign="center" py={8}>
                    <Spinner size="lg" />
                    <Text mt={2} color="fg.muted">Loading historical data...</Text>
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
                            bg="bg.muted"
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
                  <Box textAlign="center" py={4} color="fg.muted">
                    No historical data available
                  </Box>
                )}
              </VStack>
            </Tabs.Content>

            {/* Company Profile Tab */}
            <Tabs.Content value="company">
              <VStack align="stretch" gap={4} py={4}>
                <Box>
                  <Text fontSize="lg" fontWeight="semibold" mb={3}>Company Information</Text>
                  <div
                    id={`tradingview_profile_${stock.symbol}`}
                    ref={profileContainerRef}
                    style={{ height: '500px', width: '100%' }}
                  />
                </Box>
              </VStack>
            </Tabs.Content>

            {/* Fundamentals Tab */}
            <Tabs.Content value="fundamentals">
              <VStack align="stretch" gap={4} py={4}>
                <Box>
                  <Text fontSize="lg" fontWeight="semibold" mb={3}>Fundamental Data</Text>
                  <div
                    id={`tradingview_fundamentals_${stock.symbol}`}
                    ref={fundamentalsContainerRef}
                    style={{ height: '500px', width: '100%' }}
                  />
                </Box>
              </VStack>
            </Tabs.Content>
          </Tabs.Root>
        </Dialog.Body>
      </Dialog.Content>
    </Dialog.Positioner>
    </Dialog.Root>
  );
};

export default StockDetailModal;
