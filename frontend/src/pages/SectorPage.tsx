import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Container,
  Text,
  Flex,
  Badge,
  Spinner,
  HStack,
  VStack,
  SimpleGrid,
  Button,
} from '@chakra-ui/react';
import { PieChart } from 'lucide-react';
import { api } from '../api';
import { SectorPerformance } from '../types';
import { Surface, Num, SignalBadge, PageHeader, EmptyState } from '../components/ui/primitives';

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
          <Badge colorPalette="gray" size="sm" variant="subtle">{sector.stock_count} stocks</Badge>
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
            <HStack gap={2} wrap="wrap">
              {sector.top_performers.slice(0, 3).map(stock => (
                <Link key={stock.symbol} to={`/stocks/${stock.symbol}`}>
                  <SignalBadge tone="up" size="sm" className="num" data-num="" _hover={{ opacity: 0.8 }}>
                    {stock.symbol} {stock.price_change_percent != null ? `+${stock.price_change_percent.toFixed(1)}%` : ''}
                  </SignalBadge>
                </Link>
              ))}
            </HStack>
          </Box>
        )}

        {sector.bottom_performers.length > 0 && (
          <Box w="100%">
            <Text color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider" mb={1}>Bottom Performers</Text>
            <HStack gap={2} wrap="wrap">
              {sector.bottom_performers.slice(0, 3).map(stock => (
                <Link key={stock.symbol} to={`/stocks/${stock.symbol}`}>
                  <SignalBadge tone="down" size="sm" className="num" data-num="" _hover={{ opacity: 0.8 }}>
                    {stock.symbol} {stock.price_change_percent != null ? `${stock.price_change_percent.toFixed(1)}%` : ''}
                  </SignalBadge>
                </Link>
              ))}
            </HStack>
          </Box>
        )}
      </VStack>
    </Surface>
  );
};

export const SectorPage: React.FC = () => {
  const [sectors, setSectors] = useState<SectorPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'performance' | 'rsi' | 'count'>('performance');

  useEffect(() => {
    const fetchSectors = async () => {
      try {
        setLoading(true);
        const data = await api.getSectorPerformance();
        setSectors(data);
      } catch (err) {
        console.error('Failed to fetch sector performance:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSectors();
  }, []);

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
        subtitle={`${sectors.length} sectors analyzed`}
        icon={<PieChart size={22} />}
        actions={
          <HStack gap={2}>
            <Text color="fg.muted" fontSize="sm">Sort:</Text>
            {(['performance', 'rsi', 'count'] as const).map(option => (
              <Button
                key={option}
                size="xs"
                variant={sortBy === option ? 'solid' : 'outline'}
                colorPalette={sortBy === option ? 'blue' : 'gray'}
                onClick={() => setSortBy(option)}
              >
                {option === 'performance' ? 'Performance' : option === 'rsi' ? 'RSI' : 'Stock Count'}
              </Button>
            ))}
          </HStack>
        }
      />

      {loading ? (
        <Flex justify="center" py={12}>
          <Spinner size="xl" color="accent.solid" />
        </Flex>
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
