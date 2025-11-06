import React, { createElement } from 'react';
import {
  Box,
  Text,
  Badge,
  VStack,
  HStack,
  Grid,
  GridItem,
  Separator,
} from '@chakra-ui/react';
import { IoTrendingUp, IoTrendingDown } from 'react-icons/io5';
import { AiOutlineMinus } from 'react-icons/ai';
import { StockAnalysis } from '../types';

interface StockCardProps {
  stock: StockAnalysis;
  onClick?: () => void;
}

const StockCard: React.FC<StockCardProps> = ({ stock, onClick }) => {
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

  const getTrendIcon = () => {
    if (!stock.price || !stock.sma_20 || !stock.sma_50) return AiOutlineMinus;
    if (stock.price > stock.sma_20 && stock.sma_20 > stock.sma_50) {
      return IoTrendingUp;
    }
    if (stock.price < stock.sma_20 && stock.sma_20 < stock.sma_50) {
      return IoTrendingDown;
    }
    return AiOutlineMinus;
  };

  const getTrendColor = () => {
    if (!stock.price || !stock.sma_20 || !stock.sma_50) return 'gray';
    if (stock.price > stock.sma_20 && stock.sma_20 > stock.sma_50) return 'green';
    if (stock.price < stock.sma_20 && stock.sma_20 < stock.sma_50) return 'red';
    return 'gray';
  };

  const borderColor = stock.is_oversold ? 'green.400' : stock.is_overbought ? 'red.400' : 'border';
  const bgColor = stock.is_oversold 
    ? 'green.subtle' 
    : stock.is_overbought 
    ? 'red.subtle' 
    : 'bg.panel';

  return (
    <Box
      borderWidth="2px"
      borderColor={borderColor}
      borderRadius="lg"
      p={5}
      bg={bgColor}
      boxShadow="md"
      cursor={onClick ? 'pointer' : 'default'}
      _hover={{
        boxShadow: 'xl',
        transform: 'translateY(-2px)',
        transition: 'all 0.2s',
      }}
      transition="all 0.2s"
      onClick={onClick}
    >
      <VStack align="stretch" gap={3}>
        {/* Header */}
        <HStack justify="space-between" align="center">
          <Text fontSize="2xl" fontWeight="bold" color="fg">
            {stock.symbol}
          </Text>
          <Text fontSize="xl" fontWeight="semibold" color="blue.400">
            {formatPrice(stock.price)}
          </Text>
        </HStack>

        <Separator />

        {/* Indicators Grid */}
        <Grid templateColumns="repeat(2, 1fr)" gap={3}>
          {stock.rsi !== undefined && stock.rsi !== null && (
            <GridItem>
              <Box>
                <Text fontSize="xs" color="fg.muted" mb={1}>RSI</Text>
                <Badge colorScheme={getRsiBadgeColor(stock.rsi)} fontSize="sm">
                  {stock.rsi.toFixed(2)}
                </Badge>
              </Box>
            </GridItem>
          )}

          {stock.sma_20 !== undefined && (
            <GridItem>
              <Box>
                <Text fontSize="xs" color="fg.muted" mb={1}>SMA 20</Text>
                <Text fontSize="md" fontWeight="semibold">{formatPrice(stock.sma_20)}</Text>
              </Box>
            </GridItem>
          )}

          {stock.sma_50 !== undefined && (
            <GridItem>
              <Box>
                <Text fontSize="xs" color="fg.muted" mb={1}>SMA 50</Text>
                <Text fontSize="md" fontWeight="semibold">{formatPrice(stock.sma_50)}</Text>
              </Box>
            </GridItem>
          )}

          {stock.market_cap !== undefined && (
            <GridItem>
              <Box>
                <Text fontSize="xs" color="fg.muted" mb={1}>Market Cap</Text>
                <Text fontSize="md" fontWeight="semibold">{formatMarketCap(stock.market_cap)}</Text>
              </Box>
            </GridItem>
          )}

          {stock.volume !== undefined && stock.volume !== null && (
            <GridItem colSpan={2}>
              <Box>
                <Text fontSize="xs" color="fg.muted" mb={1}>Volume</Text>
                <Text fontSize="md" fontWeight="semibold">{(stock.volume / 1e6).toFixed(2)}M</Text>
              </Box>
            </GridItem>
          )}
        </Grid>

        {/* Trend Indicator */}
        <HStack justify="center" py={2}>
          {createElement(getTrendIcon() as any, { style: { width: '20px', height: '20px', color: `var(--chakra-colors-${getTrendColor()}-500)` } })}
          <Text fontSize="sm" fontWeight="medium" color={`${getTrendColor()}.600`}>
            {getTrendColor() === 'green' ? 'Bullish' : getTrendColor() === 'red' ? 'Bearish' : 'Neutral'}
          </Text>
        </HStack>

        {/* Alerts */}
        {(stock.is_oversold || stock.is_overbought) && (
          <HStack justify="center" gap={2}>
            {stock.is_oversold && (
              <Badge colorScheme="green" fontSize="xs" px={2} py={1}>
                ⚠️ Oversold
              </Badge>
            )}
            {stock.is_overbought && (
              <Badge colorScheme="red" fontSize="xs" px={2} py={1}>
                ⚠️ Overbought
              </Badge>
            )}
          </HStack>
        )}

        <Separator />

        {/* Footer */}
        <Text fontSize="xs" color="fg.muted" textAlign="center">
          Updated: {new Date(stock.analyzed_at).toLocaleTimeString()}
        </Text>
      </VStack>
    </Box>
  );
};

export default StockCard;
