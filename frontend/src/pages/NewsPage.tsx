import React, { useEffect, useState, useCallback } from 'react';
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
  Button,
  Input,
} from '@chakra-ui/react';
import { Newspaper, ExternalLink, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api } from '../api';
import { AggregatedNewsItem, PaginationInfo } from '../types';

export const NewsPage: React.FC = () => {
  const [news, setNews] = useState<AggregatedNewsItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, page_size: 30, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('');
  const [sectors, setSectors] = useState<string[]>([]);

  const fetchNews = useCallback(async (page: number = 1) => {
    try {
      setLoading(true);
      const result = await api.getNews({
        search: search || undefined,
        sector: selectedSector || undefined,
        page,
        page_size: 30,
      });
      setNews(result.news);
      setPagination(result.pagination);
    } catch (err) {
      console.error('Failed to fetch news:', err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedSector]);

  // Load sectors from sector performance endpoint
  useEffect(() => {
    const loadSectors = async () => {
      try {
        const sectorData = await api.getSectorPerformance();
        setSectors(sectorData.map(s => s.sector).filter(Boolean).sort());
      } catch {
        // Sectors are optional for filtering
      }
    };
    loadSectors();
  }, []);

  useEffect(() => {
    fetchNews(1);
  }, [fetchNews]);

  const handleSearch = () => {
    setSearch(searchInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <Container maxW="container.xl" py={8}>
      <Flex align="center" gap={3} mb={6}>
        <Box color="blue.400"><Newspaper size={28} /></Box>
        <Heading size="xl" color="white">News Feed</Heading>
        <Badge colorPalette="blue" size="lg">{pagination.total} articles</Badge>
      </Flex>

      {/* Filters */}
      <Card.Root bg="gray.800" borderColor="gray.700" mb={6}>
        <Card.Body p={4}>
          <Flex gap={4} wrap="wrap" align="center">
            <HStack flex={1} minW="250px">
              <Input
                placeholder="Search news..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
                bg="gray.900"
                borderColor="gray.600"
                color="white"
                _placeholder={{ color: 'gray.500' }}
              />
              <Button colorPalette="blue" onClick={handleSearch} size="sm">
                <Search size={16} />
              </Button>
            </HStack>

            <HStack gap={2} wrap="wrap">
              <Button
                size="sm"
                variant={selectedSector === '' ? 'solid' : 'outline'}
                colorPalette={selectedSector === '' ? 'blue' : 'gray'}
                onClick={() => setSelectedSector('')}
              >
                All Sectors
              </Button>
              {sectors.slice(0, 8).map(sector => (
                <Button
                  key={sector}
                  size="sm"
                  variant={selectedSector === sector ? 'solid' : 'outline'}
                  colorPalette={selectedSector === sector ? 'blue' : 'gray'}
                  onClick={() => setSelectedSector(sector)}
                >
                  {sector}
                </Button>
              ))}
            </HStack>
          </Flex>
        </Card.Body>
      </Card.Root>

      {/* News List */}
      {loading ? (
        <Flex justify="center" py={12}>
          <Spinner size="xl" color="blue.400" />
        </Flex>
      ) : news.length === 0 ? (
        <Flex justify="center" py={12}>
          <Text color="gray.500">No news articles found.</Text>
        </Flex>
      ) : (
        <VStack gap={3} align="stretch">
          {news.map((item, idx) => (
            <Card.Root key={idx} bg="gray.800" borderColor="gray.700" _hover={{ borderColor: 'gray.500' }} transition="all 0.2s">
              <Card.Body p={4}>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  <Flex justify="space-between" align="start">
                    <VStack align="start" gap={2} flex={1}>
                      <Text color="white" fontWeight="semibold" _hover={{ color: 'blue.400' }}>
                        {item.title}
                      </Text>
                      <HStack gap={2} wrap="wrap">
                        <Link to={`/stocks/${item.symbol}`} onClick={(e) => e.stopPropagation()}>
                          <Badge colorPalette="blue" size="sm" _hover={{ opacity: 0.8 }}>
                            {item.symbol}
                          </Badge>
                        </Link>
                        {item.sector && (
                          <Badge colorPalette="purple" size="sm">{item.sector}</Badge>
                        )}
                        {item.publisher && (
                          <Text color="gray.500" fontSize="sm">{item.publisher}</Text>
                        )}
                        {item.ago && (
                          <Text color="gray.600" fontSize="sm">{item.ago}</Text>
                        )}
                      </HStack>
                    </VStack>
                    <Box color="gray.500" ml={2} flexShrink={0}><ExternalLink size={16} /></Box>
                  </Flex>
                </a>
              </Card.Body>
            </Card.Root>
          ))}
        </VStack>
      )}

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <Flex justify="center" mt={6} gap={2}>
          <Button
            size="sm"
            variant="outline"
            colorPalette="gray"
            onClick={() => fetchNews(pagination.page - 1)}
            disabled={pagination.page <= 1}
          >
            <ChevronLeft size={16} /> Prev
          </Button>
          <Flex align="center" px={4}>
            <Text color="gray.400" fontSize="sm">
              Page {pagination.page} of {pagination.total_pages}
            </Text>
          </Flex>
          <Button
            size="sm"
            variant="outline"
            colorPalette="gray"
            onClick={() => fetchNews(pagination.page + 1)}
            disabled={pagination.page >= pagination.total_pages}
          >
            Next <ChevronRight size={16} />
          </Button>
        </Flex>
      )}
    </Container>
  );
};
