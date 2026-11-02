import { Link } from 'react-router-dom';
import { Box, Button, Flex, HStack, Text, VStack } from '@chakra-ui/react';
import { ArrowDownRight, ArrowUpRight, Briefcase } from 'lucide-react';
import { Num, SignalBadge } from '../../components/ui/primitives';
import type { PortfolioPosition, RelatedStock } from '../../types';

function DayChange({ value }: { value: number | null | undefined }) {
  const color =
    value == null ? 'fg.muted' : value >= 0 ? 'signal.up.fg' : 'signal.down.fg';
  return (
    <HStack gap={1} color={color} justify="flex-end" minW="72px">
      {value != null &&
        (value >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />)}
      <Num
        value={value}
        decimals={2}
        sign="always"
        suffix="%"
        fontSize="sm"
        color="inherit"
      />
    </HStack>
  );
}

function RsiChip({ rsi }: { rsi: number | null | undefined }) {
  if (rsi == null) return null;
  const tone = rsi < 30 ? 'up' : rsi > 70 ? 'down' : 'neutral';
  return (
    <SignalBadge tone={tone} fontSize="2xs">
      RSI {rsi.toFixed(0)}
    </SignalBadge>
  );
}

export function PortfolioEmpty({ compact = false }: { compact?: boolean }) {
  return (
    <VStack align="start" py={compact ? 4 : 6} gap={3}>
      <Box color="fg.subtle">
        <Briefcase size={24} />
      </Box>
      <Text fontWeight="medium" fontSize="sm">
        Bring your portfolio in
      </Text>
      <Text fontSize="sm" color="fg.muted">
        Upload a brokerage export in any readable format and the overview will
        track what you hold and what moves around it.
      </Text>
      <Button asChild size="sm" variant="outline">
        <Link to="/portfolio">
          Upload holdings <ArrowUpRight size={14} />
        </Link>
      </Button>
    </VStack>
  );
}

/** Per-symbol rows: what is held, its live price, day change and RSI. */
export function PositionsList({
  positions,
  limit = 8,
}: {
  positions: PortfolioPosition[];
  limit?: number;
}) {
  const rows = positions.slice(0, limit);
  return (
    <Box>
      <Flex justify="space-between" color="fg.subtle" fontSize="xs" pb={2}>
        <Text>Symbol / weight</Text>
        <Text>Price · day change</Text>
      </Flex>
      {rows.map((position) => (
        <Link
          to={`/stocks/${encodeURIComponent(position.symbol)}`}
          key={position.symbol}
        >
          <Flex
            align="center"
            justify="space-between"
            gap={3}
            minH="54px"
            borderTopWidth="1px"
            borderColor="border.subtle"
            _hover={{ bg: 'bg.muted' }}
          >
            <Box minW={0} flex={1}>
              <HStack gap={2}>
                <Text fontSize="sm" fontWeight="semibold">
                  {position.symbol}
                </Text>
                <RsiChip rsi={position.market?.rsi} />
              </HStack>
              <Text fontSize="xs" color="fg.muted" truncate>
                {position.weight_pct != null
                  ? `${position.weight_pct.toFixed(1)}% · `
                  : ''}
                {position.quantity.toLocaleString()} units
                {position.lots > 1 ? ` · ${position.lots} lots` : ''}
                {position.description ? ` · ${position.description}` : ''}
              </Text>
            </Box>
            <VStack gap={0} align="flex-end">
              {position.market ? (
                <>
                  <Num value={position.market.price} fontSize="sm" />
                  <DayChange value={position.market.price_change_percent} />
                </>
              ) : (
                <Text fontSize="xs" color="fg.subtle">
                  Not analyzed yet
                </Text>
              )}
            </VStack>
          </Flex>
        </Link>
      ))}
      {positions.length > limit && (
        <Text color="fg.subtle" fontSize="xs" mt={3}>
          +{positions.length - limit} more on the portfolio page.
        </Text>
      )}
    </Box>
  );
}

/** Names relevant to what is held, with the reason they were picked. */
export function RelatedList({
  related,
  limit = 8,
}: {
  related: RelatedStock[];
  limit?: number;
}) {
  const rows = related.slice(0, limit);
  return (
    <Box>
      <Flex justify="space-between" color="fg.subtle" fontSize="xs" pb={2}>
        <Text>Symbol / why it is here</Text>
        <Text>Price · day change</Text>
      </Flex>
      {rows.map((stock) => (
        <Link to={`/stocks/${encodeURIComponent(stock.symbol)}`} key={stock.symbol}>
          <Flex
            align="center"
            justify="space-between"
            gap={3}
            minH="54px"
            borderTopWidth="1px"
            borderColor="border.subtle"
            _hover={{ bg: 'bg.muted' }}
          >
            <Box minW={0} flex={1}>
              <HStack gap={2}>
                <Text fontSize="sm" fontWeight="semibold">
                  {stock.symbol}
                </Text>
                {stock.is_oversold && (
                  <SignalBadge tone="up" fontSize="2xs">
                    Oversold
                  </SignalBadge>
                )}
                {stock.is_overbought && (
                  <SignalBadge tone="down" fontSize="2xs">
                    Overbought
                  </SignalBadge>
                )}
              </HStack>
              <Text fontSize="xs" color="fg.muted" truncate title={stock.reason}>
                {stock.reason}
              </Text>
            </Box>
            <VStack gap={0} align="flex-end">
              <Num value={stock.price} fontSize="sm" />
              <DayChange value={stock.price_change_percent} />
            </VStack>
          </Flex>
        </Link>
      ))}
      <Text color="fg.subtle" fontSize="xs" mt={3}>
        Same sector or similar size to what you hold, ranked by portfolio
        weight, then RSI. Research inputs, not recommendations.
      </Text>
    </Box>
  );
}
