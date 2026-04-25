import React, { createElement } from 'react';
import {
  Text,
  VStack,
  HStack,
  Grid,
  GridItem,
  Separator,
} from '@chakra-ui/react';
import { IoTrendingUp, IoTrendingDown } from 'react-icons/io5';
import { AiOutlineMinus } from 'react-icons/ai';
import { StockAnalysis } from '../types';
import { Surface, Num, SignalBadge } from './ui/primitives';
import type { SignalTone } from './ui/primitives';

interface StockCardProps {
  stock: StockAnalysis;
  onClick?: () => void;
}

const StockCard: React.FC<StockCardProps> = ({ stock, onClick }) => {
  const formatMarketCap = (cap?: number | null) => {
    if (!cap) return null;
    return cap;
  };

  const getRsiTone = (rsi?: number): SignalTone => {
    if (!rsi) return 'neutral';
    if (rsi < 30) return 'up';
    if (rsi > 70) return 'down';
    return 'info';
  };

  const trend: 'up' | 'down' | 'neutral' = (() => {
    if (!stock.price || !stock.sma_20 || !stock.sma_50) return 'neutral';
    if (stock.price > stock.sma_20 && stock.sma_20 > stock.sma_50) return 'up';
    if (stock.price < stock.sma_20 && stock.sma_20 < stock.sma_50) return 'down';
    return 'neutral';
  })();

  const trendIcon = trend === 'up' ? IoTrendingUp : trend === 'down' ? IoTrendingDown : AiOutlineMinus;
  const trendColor =
    trend === 'up' ? 'signal.up.fg' : trend === 'down' ? 'signal.down.fg' : 'fg.muted';

  const accent = stock.is_oversold ? 'up' : stock.is_overbought ? 'down' : undefined;

  return (
    <Surface
      p={5}
      interactive={!!onClick}
      accent={accent}
      onClick={onClick}
    >
      <VStack align="stretch" gap={3}>
        <HStack justify="space-between" align="center">
          <Text fontSize="xl" fontWeight="semibold" color="fg.default" letterSpacing="tight">
            {stock.symbol}
          </Text>
          <Num
            value={stock.price}
            prefix="$"
            intent="neutral"
            fontSize="lg"
            fontWeight="semibold"
            color="accent.fg"
          />
        </HStack>

        <Separator borderColor="border.subtle" />

        <Grid templateColumns="repeat(2, 1fr)" gap={3}>
          {stock.rsi != null && typeof stock.rsi === 'number' && (
            <GridItem>
              <Text fontSize="xs" color="fg.muted" mb={1} textTransform="uppercase" letterSpacing="wider">RSI</Text>
              <SignalBadge tone={getRsiTone(stock.rsi)} fontSize="sm" className="num" data-num="">
                {stock.rsi.toFixed(2)}
              </SignalBadge>
            </GridItem>
          )}

          {stock.sma_20 !== undefined && (
            <GridItem>
              <Text fontSize="xs" color="fg.muted" mb={1} textTransform="uppercase" letterSpacing="wider">SMA 20</Text>
              <Num value={stock.sma_20} prefix="$" fontSize="md" fontWeight="semibold" />
            </GridItem>
          )}

          {stock.sma_50 !== undefined && (
            <GridItem>
              <Text fontSize="xs" color="fg.muted" mb={1} textTransform="uppercase" letterSpacing="wider">SMA 50</Text>
              <Num value={stock.sma_50} prefix="$" fontSize="md" fontWeight="semibold" />
            </GridItem>
          )}

          {stock.market_cap !== undefined && (
            <GridItem>
              <Text fontSize="xs" color="fg.muted" mb={1} textTransform="uppercase" letterSpacing="wider">Market Cap</Text>
              <Num
                value={formatMarketCap(stock.market_cap)}
                prefix="$"
                compact
                fontSize="md"
                fontWeight="semibold"
              />
            </GridItem>
          )}

          {stock.volume != null && typeof stock.volume === 'number' && (
            <GridItem colSpan={2}>
              <Text fontSize="xs" color="fg.muted" mb={1} textTransform="uppercase" letterSpacing="wider">Volume</Text>
              <Num value={stock.volume} compact fontSize="md" fontWeight="semibold" />
            </GridItem>
          )}
        </Grid>

        <HStack justify="center" py={2} gap={2}>
          {createElement(trendIcon as any, { style: { width: '18px', height: '18px' } })}
          <Text fontSize="sm" fontWeight="medium" color={trendColor}>
            {trend === 'up' ? 'Bullish' : trend === 'down' ? 'Bearish' : 'Neutral'}
          </Text>
        </HStack>

        {(stock.is_oversold || stock.is_overbought) && (
          <HStack justify="center" gap={2}>
            {stock.is_oversold && (
              <SignalBadge tone="up" fontSize="xs" px={2} py={1}>
                Oversold
              </SignalBadge>
            )}
            {stock.is_overbought && (
              <SignalBadge tone="down" fontSize="xs" px={2} py={1}>
                Overbought
              </SignalBadge>
            )}
          </HStack>
        )}

        <Separator borderColor="border.subtle" />

        <Text fontSize="xs" color="fg.subtle" textAlign="center">
          Updated: {new Date(stock.analyzed_at).toLocaleTimeString()}
        </Text>
      </VStack>
    </Surface>
  );
};

export default StockCard;
