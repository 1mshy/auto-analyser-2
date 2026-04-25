import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Container,
  Text,
  Flex,
  Spinner,
  HStack,
  VStack,
  Button,
  Input,
} from '@chakra-ui/react';
import { Newspaper, ExternalLink, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api } from '../api';
import { AggregatedNewsItem, PaginationInfo } from '../types';
import { Surface, SignalBadge, PageHeader, EmptyState } from '../components/ui/primitives';

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
      <PageHeader
        icon={<Newspaper size={22} />}
        title="News Feed"
        subtitle={`${pagination.total.toLocaleString()} articles`}
      />

      <Surface mb={4} p={4}>
        <Flex gap={4} wrap="wrap" align="center">
          <HStack flex={1} minW="250px">
            <Input
              placeholder="Search news..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleKeyDown}
              bg="bg.inset"
              borderColor="border.subtle"
              color="fg.default"
              _placeholder={{ color: 'fg.subtle' }}
              size="sm"
            />
            <Button colorPalette="accent" onClick={handleSearch} size="sm">
              <Search size={14} />
            </Button>
          </HStack>

          <HStack gap={2} wrap="wrap">
            <Button
              size="xs"
              variant={selectedSector === '' ? 'subtle' : 'ghost'}
              colorPalette={selectedSector === '' ? 'accent' : 'gray'}
              onClick={() => setSelectedSector('')}
            >
              All Sectors
            </Button>
            {sectors.slice(0, 8).map(sector => (
              <Button
                key={sector}
                size="xs"
                variant={selectedSector === sector ? 'subtle' : 'ghost'}
                colorPalette={selectedSector === sector ? 'accent' : 'gray'}
                onClick={() => setSelectedSector(sector)}
              >
                {sector}
              </Button>
            ))}
          </HStack>
        </Flex>
      </Surface>

      {loading ? (
        <Flex justify="center" py={12}>
          <Spinner size="xl" color="accent.solid" />
        </Flex>
      ) : news.length === 0 ? (
        <EmptyState
          icon={<Newspaper size={32} />}
          title="No news articles found"
          description="Try adjusting your search or sector filter."
        />
      ) : (
        <VStack gap={2} align="stretch">
          {news.map((item, idx) => (
            <Surface key={idx} interactive p={4}>
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                <Flex justify="space-between" align="start">
                  <VStack align="start" gap={2} flex={1}>
                    <Text color="fg.default" fontWeight="semibold" _hover={{ color: 'accent.fg' }}>
                      {item.title}
                    </Text>
                    <HStack gap={2} wrap="wrap">
                      <Link to={`/stocks/${item.symbol}`} onClick={(e) => e.stopPropagation()}>
                        <SignalBadge tone="accent" size="xs">{item.symbol}</SignalBadge>
                      </Link>
                      {item.sector && (
                        <SignalBadge tone="info" size="xs">{item.sector}</SignalBadge>
                      )}
                      {item.publisher && (
                        <Text color="fg.subtle" fontSize="xs">{item.publisher}</Text>
                      )}
                      {item.ago && (
                        <Text color="fg.subtle" fontSize="xs">• {item.ago}</Text>
                      )}
                    </HStack>
                  </VStack>
                  <Box color="fg.subtle" ml={2} flexShrink={0}><ExternalLink size={14} /></Box>
                </Flex>
              </a>
            </Surface>
          ))}
        </VStack>
      )}

      {pagination.total_pages > 1 && (
        <Flex justify="center" mt={6} gap={2} align="center">
          <Button
            size="sm"
            variant="outline"
            colorPalette="gray"
            onClick={() => fetchNews(pagination.page - 1)}
            disabled={pagination.page <= 1}
          >
            <ChevronLeft size={14} /> Prev
          </Button>
          <Flex align="center" px={4}>
            <Text color="fg.muted" fontSize="sm" className="num" data-num="">
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
            Next <ChevronRight size={14} />
          </Button>
        </Flex>
      )}
    </Container>
  );
};
