import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Container,
  Heading,
  Text,
  Flex,
  Badge,
  Spinner,
  HStack,
  VStack,
  Card,
  SimpleGrid,
} from '@chakra-ui/react';
import { PieChart, TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '../api';
import { SectorPerformance } from '../types';

const SectorCard: React.FC<{ sector: SectorPerformance }> = ({ sector }) => {
  const isPositive = sector.avg_change_percent >= 0;
  const changeColor = isPositive ? 'green.400' : 'red.400';
  const rsiColor = sector.avg_rsi < 30 ? 'green.400' : sector.avg_rsi > 70 ? 'red.400' : 'gray.300';

  // Background tint based on performance
  const bgTint = isPositive
    ? sector.avg_change_percent > 2 ? 'rgba(72,187,120,0.08)' : 'rgba(72,187,120,0.04)'
    : sector.avg_change_percent < -2 ? 'rgba(245,101,101,0.08)' : 'rgba(245,101,101,0.04)';

  return (
    <Card.Root bg="gray.800" borderColor="gray.700" _hover={{ borderColor: 'gray.500' }} transition="all 0.2s" overflow="hidden">
      <Box position="absolute" top={0} left={0} right={0} h="3px" bg={isPositive ? 'green.500' : 'red.500'} />
      <Card.Body p={5} bg={bgTint}>
        <VStack align="start" gap={3}>
          <Flex justify="space-between" w="100%" align="center">
            <Heading size="md" color="white">{sector.sector || 'Unknown'}</Heading>
            <Badge colorPalette="gray" size="sm">{sector.stock_count} stocks</Badge>
          </Flex>

          <SimpleGrid columns={2} gap={4} w="100%">
            <Box>
              <Text color="gray.500" fontSize="xs">Avg Change</Text>
              <HStack>
                <Box color={changeColor}>
                  {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                </Box>
                <Text color={changeColor} fontSize="lg" fontWeight="bold">
                  {isPositive ? '+' : ''}{sector.avg_change_percent.toFixed(2)}%
                </Text>
              </HStack>
            </Box>
            <Box>
              <Text color="gray.500" fontSize="xs">Avg RSI</Text>
              <Text color={rsiColor} fontSize="lg" fontWeight="bold">
                {sector.avg_rsi.toFixed(1)}
              </Text>
            </Box>
          </SimpleGrid>

          {/* Top Performers */}
          {sector.top_performers.length > 0 && (
            <Box w="100%">
              <Text color="gray.500" fontSize="xs" mb={1}>Top Performers</Text>
              <HStack gap={2} wrap="wrap">
                {sector.top_performers.slice(0, 3).map(stock => (
                  <Link key={stock.symbol} to={`/stocks/${stock.symbol}`}>
                    <Badge colorPalette="green" size="sm" _hover={{ opacity: 0.8 }}>
                      {stock.symbol} {stock.price_change_percent != null ? `+${stock.price_change_percent.toFixed(1)}%` : ''}
                    </Badge>
                  </Link>
                ))}
              </HStack>
            </Box>
          )}

          {/* Bottom Performers */}
          {sector.bottom_performers.length > 0 && (
            <Box w="100%">
              <Text color="gray.500" fontSize="xs" mb={1}>Bottom Performers</Text>
              <HStack gap={2} wrap="wrap">
                {sector.bottom_performers.slice(0, 3).map(stock => (
                  <Link key={stock.symbol} to={`/stocks/${stock.symbol}`}>
                    <Badge colorPalette="red" size="sm" _hover={{ opacity: 0.8 }}>
                      {stock.symbol} {stock.price_change_percent != null ? `${stock.price_change_percent.toFixed(1)}%` : ''}
                    </Badge>
                  </Link>
                ))}
              </HStack>
            </Box>
          )}
        </VStack>
      </Card.Body>
    </Card.Root>
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
    <Container maxW="container.xl" py={8}>
      <Flex align="center" justify="space-between" mb={6} wrap="wrap" gap={4}>
        <HStack gap={3}>
          <Box color="teal.400"><PieChart size={28} /></Box>
          <Heading size="xl" color="white">Sector Performance</Heading>
          <Badge colorPalette="teal" size="lg">{sectors.length} sectors</Badge>
        </HStack>

        <HStack gap={2}>
          <Text color="gray.500" fontSize="sm">Sort:</Text>
          {(['performance', 'rsi', 'count'] as const).map(option => (
            <Badge
              key={option}
              size="sm"
              colorPalette={sortBy === option ? 'teal' : 'gray'}
              cursor="pointer"
              onClick={() => setSortBy(option)}
              _hover={{ opacity: 0.8 }}
              px={3}
              py={1}
            >
              {option === 'performance' ? 'Performance' : option === 'rsi' ? 'RSI' : 'Stock Count'}
            </Badge>
          ))}
        </HStack>
      </Flex>

      {loading ? (
        <Flex justify="center" py={12}>
          <Spinner size="xl" color="teal.400" />
        </Flex>
      ) : sectors.length === 0 ? (
        <Flex justify="center" py={12}>
          <Text color="gray.500">No sector data available yet. Wait for stocks to be analyzed.</Text>
        </Flex>
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
