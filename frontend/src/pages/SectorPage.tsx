import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Container,
  Text,
  Flex,
  HStack,
  VStack,
  SimpleGrid,
  Button,
} from '@chakra-ui/react';
import { PieChart, BarChart3, ArrowUpRight } from 'lucide-react';
import { SectorPerformance, MarketIndexQuote } from '../types';
import { useSectorPerformance, useMarketIndexes } from '../queries';
import {
  Surface,
  Num,
  SignalBadge,
  PageHeader,
  EmptyState,
  ErrorState,
  SkeletonCard,
} from '../components/ui/primitives';

const IndexFundCard: React.FC<{ index: MarketIndexQuote }> = ({ index }) => {
  const cp = index.change_percent;
  const accent: 'up' | 'down' | undefined =
    cp == null ? undefined : cp >= 0 ? 'up' : 'down';
  const hasError = index.value == null;

  const body = (
    <Surface accent={accent} p={4} variant="raised" position="relative" overflow="hidden" h="100%">
      <VStack align="start" gap={2}>
        <Flex justify="space-between" w="100%" align="start" gap={2}>
          <Box>
            <Text fontSize="sm" fontWeight="semibold" color="fg.default" letterSpacing="tight">
              {index.name}
            </Text>
            <Text color="fg.subtle" fontSize="xs" className="num" data-num="">
              {index.yahoo_ticker}
            </Text>
          </Box>
          {index.heatmap_id && (
            <SignalBadge tone="info" size="xs">
              <HStack gap={1}>
                <Text>Heatmap</Text>
                <ArrowUpRight size={10} />
              </HStack>
            </SignalBadge>
          )}
        </Flex>

        {hasError ? (
          <Text color="fg.muted" fontSize="xs">
            {index.error || 'Quote unavailable'}
          </Text>
        ) : (
          <SimpleGrid columns={2} gap={3} w="100%">
            <Box>
              <Text color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider" mb={1}>
                Value
              </Text>
              <Num
                value={index.value as number}
                decimals={2}
                fontSize="md"
                fontWeight="semibold"
              />
            </Box>
            <Box>
              <Text color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider" mb={1}>
                Daily
              </Text>
              {cp != null ? (
                <Num
                  value={cp}
                  intent="auto"
                  sign="always"
                  suffix="%"
                  decimals={2}
                  fontSize="md"
                  fontWeight="semibold"
                />
              ) : (
                <Text color="fg.muted" fontSize="sm">—</Text>
              )}
            </Box>
          </SimpleGrid>
        )}

        <Text color="fg.subtle" fontSize="xs" lineClamp={2}>
          {index.description}
        </Text>
      </VStack>
    </Surface>
  );

  return index.heatmap_id ? (
    <Link to="/funds" style={{ textDecoration: 'none' }}>
      {body}
    </Link>
  ) : (
    body
  );
};

const PerformerChip: React.FC<{
  symbol: string;
  changePercent: number | null | undefined;
  tone: 'up' | 'down';
}> = ({ symbol, changePercent, tone }) => (
  <Link to={`/stocks/${encodeURIComponent(symbol)}`}>
    <HStack gap={1.5} minH="6" _hover={{ opacity: 0.8 }}>
      <SignalBadge tone={tone} size="sm" className="num" data-num="">
        {symbol}
      </SignalBadge>
      <Num
        value={changePercent}
        intent="auto"
        sign="always"
        suffix="%"
        decimals={1}
        fontSize="xs"
        fontWeight="medium"
      />
    </HStack>
  </Link>
);

const SectorCard: React.FC<{ sector: SectorPerformance }> = ({ sector }) => {
  const isPositive = sector.avg_change_percent >= 0;
  const accent: 'up' | 'down' = isPositive ? 'up' : 'down';
  const rsiIntent = sector.avg_rsi < 30 ? 'up' : sector.avg_rsi > 70 ? 'down' : 'neutral';

  return (
    <Surface accent={accent} p={5} variant="raised" position="relative" overflow="hidden">
      <VStack align="start" gap={3}>
        <Flex justify="space-between" w="100%" align="center">
          <Text fontSize="md" fontWeight="semibold" color="fg.default" letterSpacing="tight">
            {sector.sector || 'Unknown'}
          </Text>
          <SignalBadge tone="neutral" variant="subtle" size="sm">
            {sector.stock_count} stocks
          </SignalBadge>
        </Flex>

        <SimpleGrid columns={2} gap={4} w="100%">
          <Box>
            <Text color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider" mb={1}>Avg Change</Text>
            <Num
              value={sector.avg_change_percent}
              intent="auto"
              sign="always"
              suffix="%"
              fontSize="lg"
              fontWeight="semibold"
            />
          </Box>
          <Box>
            <Text color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider" mb={1}>Avg RSI</Text>
            <Num
              value={sector.avg_rsi}
              intent={rsiIntent}
              decimals={1}
              fontSize="lg"
              fontWeight="semibold"
            />
          </Box>
        </SimpleGrid>

        {sector.top_performers.length > 0 && (
          <Box w="100%">
            <Text color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider" mb={1}>Top Performers</Text>
            <HStack gap={3} wrap="wrap">
              {sector.top_performers.slice(0, 3).map(stock => (
                <PerformerChip
                  key={stock.symbol}
                  symbol={stock.symbol}
                  changePercent={stock.price_change_percent}
                  tone="up"
                />
              ))}
            </HStack>
          </Box>
        )}

        {sector.bottom_performers.length > 0 && (
          <Box w="100%">
            <Text color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider" mb={1}>Bottom Performers</Text>
            <HStack gap={3} wrap="wrap">
              {sector.bottom_performers.slice(0, 3).map(stock => (
                <PerformerChip
                  key={stock.symbol}
                  symbol={stock.symbol}
                  changePercent={stock.price_change_percent}
                  tone="down"
                />
              ))}
            </HStack>
          </Box>
        )}
      </VStack>
    </Surface>
  );
};

export const SectorPage: React.FC = () => {
  const [sortBy, setSortBy] = useState<'performance' | 'rsi' | 'count'>('performance');
  const sectorsQuery = useSectorPerformance();
  const indexesQuery = useMarketIndexes();

  const sectors = sectorsQuery.data ?? [];
  const indexes = indexesQuery.data ?? [];

  const sortedSectors = [...sectors].sort((a, b) => {
    switch (sortBy) {
      case 'performance': return b.avg_change_percent - a.avg_change_percent;
      case 'rsi': return a.avg_rsi - b.avg_rsi;
      case 'count': return b.stock_count - a.stock_count;
      default: return 0;
    }
  });

  return (
    <Container maxW="page" py={{ base: 5, md: 8 }}>
      <PageHeader
        eyebrow="Market Breadth"
        title="Sector Performance"
        subtitle={sectorsQuery.isLoading ? 'Loading sectors…' : `${sectors.length} sectors analyzed`}
        icon={<PieChart size={22} />}
        actions={
          <HStack gap={2} wrap="wrap">
            <Text color="fg.muted" fontSize="sm">Sort:</Text>
            {(['performance', 'rsi', 'count'] as const).map(option => (
              <Button
                key={option}
                size="xs"
                variant="outline"
                minH={{ base: '11', md: '6' }}
                bg={sortBy === option ? 'accent.muted' : 'transparent'}
                color={sortBy === option ? 'accent.fg' : 'fg.muted'}
                borderColor={sortBy === option ? 'accent.solid' : 'border.default'}
                _hover={{
                  bg: sortBy === option ? 'accent.muted' : 'bg.muted',
                  color: sortBy === option ? 'accent.fg' : 'fg.default',
                }}
                onClick={() => setSortBy(option)}
              >
                {option === 'performance' ? 'Performance' : option === 'rsi' ? 'RSI' : 'Stock Count'}
              </Button>
            ))}
          </HStack>
        }
      />

      <Box mb={6}>
        <Flex align="center" gap={2} mb={3}>
          <BarChart3 size={18} />
          <Text fontSize="sm" fontWeight="semibold" color="fg.default" textTransform="uppercase" letterSpacing="wider">
            Index Funds
          </Text>
          <Text color="fg.subtle" fontSize="xs">
            Live values from Yahoo Finance
          </Text>
        </Flex>
        {indexesQuery.isLoading ? (
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 4 }} gap={3}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} lines={2} />
            ))}
          </SimpleGrid>
        ) : indexesQuery.isError ? (
          <ErrorState
            py={6}
            title="Couldn't load index funds"
            description={indexesQuery.error.message}
            onRetry={() => indexesQuery.refetch()}
          />
        ) : indexes.length === 0 ? (
          <EmptyState
            icon={<BarChart3 size={32} />}
            title="No index data available"
            description="Index fund quotes will appear once fetched from Yahoo Finance."
          />
        ) : (
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 4 }} gap={3}>
            {indexes.map(idx => (
              <IndexFundCard key={idx.id} index={idx} />
            ))}
          </SimpleGrid>
        )}
      </Box>

      {sectorsQuery.isLoading ? (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} lines={4} />
          ))}
        </SimpleGrid>
      ) : sectorsQuery.isError ? (
        <ErrorState
          title="Couldn't load sector performance"
          description={sectorsQuery.error.message}
          onRetry={() => sectorsQuery.refetch()}
        />
      ) : sectors.length === 0 ? (
        <EmptyState
          icon={<PieChart size={44} />}
          title="No sector data available yet"
          description="Wait for stocks to be analyzed."
        />
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
          {sortedSectors.map(sector => (
            <SectorCard key={sector.sector} sector={sector} />
          ))}
        </SimpleGrid>
      )}
    </Container>
  );
};
