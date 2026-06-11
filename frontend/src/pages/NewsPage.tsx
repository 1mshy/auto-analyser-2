import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Container,
  Text,
  Flex,
  HStack,
  VStack,
  Button,
  Input,
} from '@chakra-ui/react';
import { useQuery, keepPreviousData, type UseQueryResult } from '@tanstack/react-query';
import { Newspaper, ExternalLink, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api } from '../api';
import { queryKeys, useSectorPerformance } from '../queries';
import { AggregatedNewsItem, PaginationInfo } from '../types';
import {
  Surface,
  SignalBadge,
  PageHeader,
  EmptyState,
  ErrorState,
  SkeletonCard,
} from '../components/ui/primitives';

const PAGE_SIZE = 30;

type NewsFeedResponse = { news: AggregatedNewsItem[]; pagination: PaginationInfo };

export const NewsPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('');

  const newsQuery: UseQueryResult<NewsFeedResponse, Error> = useQuery<NewsFeedResponse>({
    queryKey: [...queryKeys.news, { search: search || null, sector: selectedSector || null, page }],
    queryFn: () =>
      api.getNews({
        search: search || undefined,
        sector: selectedSector || undefined,
        page,
        page_size: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const news = newsQuery.data?.news ?? [];
  const pagination: PaginationInfo =
    newsQuery.data?.pagination ?? { page: 1, page_size: PAGE_SIZE, total: 0, total_pages: 0 };

  // Sectors are an optional filter facet; if the query fails we just hide the chips.
  const sectorsQuery = useSectorPerformance();
  const sectors = useMemo(
    () => (sectorsQuery.data ?? []).map((s) => s.sector).filter(Boolean).sort(),
    [sectorsQuery.data],
  );

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const selectSector = (sector: string) => {
    setSelectedSector(sector);
    setPage(1);
  };

  return (
    <Container maxW="page" py={{ base: 5, md: 8 }}>
      <PageHeader
        eyebrow="Market Feed"
        icon={<Newspaper size={22} />}
        title="News Feed"
        subtitle={
          newsQuery.data ? `${pagination.total.toLocaleString()} articles` : 'Loading articles…'
        }
      />

      <Surface mb={4} p={4} variant="raised">
        <Flex gap={4} wrap="wrap" align="center">
          <HStack flex={1} minW={{ base: '100%', sm: '250px' }}>
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
              minH={{ base: 11, md: 9 }}
            />
            <Button
              onClick={handleSearch}
              size="sm"
              aria-label="Search news"
              color="accent.fg"
              bg="accent.subtle"
              borderWidth="1px"
              borderColor="accent.muted"
              _hover={{ bg: 'accent.muted' }}
              minH={{ base: 11, md: 9 }}
              minW={{ base: 11, md: 9 }}
            >
              <Search size={14} />
            </Button>
          </HStack>

          <HStack gap={2} wrap="wrap">
            {['', ...sectors.slice(0, 8)].map((sector) => {
              const isActive = selectedSector === sector;
              return (
                <Button
                  key={sector || 'all'}
                  size="xs"
                  variant="ghost"
                  onClick={() => selectSector(sector)}
                  minH={{ base: 11, md: 6 }}
                  color={isActive ? 'accent.fg' : 'fg.muted'}
                  bg={isActive ? 'accent.subtle' : 'transparent'}
                  borderWidth="1px"
                  borderColor={isActive ? 'accent.muted' : 'transparent'}
                  _hover={{
                    bg: isActive ? 'accent.subtle' : 'bg.muted',
                    color: isActive ? 'accent.fg' : 'fg.default',
                  }}
                >
                  {sector || 'All Sectors'}
                </Button>
              );
            })}
          </HStack>
        </Flex>
      </Surface>

      {newsQuery.isLoading ? (
        <VStack gap={2} align="stretch">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </VStack>
      ) : newsQuery.isError ? (
        <ErrorState
          title="Failed to load news"
          description="The news feed could not be fetched. Check your connection and try again."
          onRetry={() => newsQuery.refetch()}
        />
      ) : news.length === 0 ? (
        <EmptyState
          icon={<Newspaper size={32} />}
          title="No news articles found"
          description="Try adjusting your search or sector filter."
        />
      ) : (
        <VStack gap={2} align="stretch" opacity={newsQuery.isFetching ? 0.6 : 1}>
          {news.map((item, idx) => (
            <Surface key={`${item.symbol}-${item.url}-${idx}`} interactive p={4} variant="raised">
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                <Flex justify="space-between" align="start">
                  <VStack align="start" gap={2} flex={1}>
                    <Text color="fg.default" fontWeight="semibold" _hover={{ color: 'accent.fg' }}>
                      {item.title}
                    </Text>
                    <HStack gap={2} wrap="wrap">
                      <Link to={`/stocks/${encodeURIComponent(item.symbol)}`} onClick={(e) => e.stopPropagation()}>
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

      {!newsQuery.isLoading && !newsQuery.isError && pagination.total_pages > 1 && (
        <Flex justify="center" mt={6} gap={2} align="center">
          <Button
            size="sm"
            variant="outline"
            borderColor="border.default"
            color="fg.default"
            _hover={{ bg: 'bg.muted', borderColor: 'border.emphasis' }}
            minH={{ base: 11, md: 9 }}
            onClick={() => setPage(pagination.page - 1)}
            disabled={pagination.page <= 1 || newsQuery.isFetching}
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
            borderColor="border.default"
            color="fg.default"
            _hover={{ bg: 'bg.muted', borderColor: 'border.emphasis' }}
            minH={{ base: 11, md: 9 }}
            onClick={() => setPage(pagination.page + 1)}
            disabled={pagination.page >= pagination.total_pages || newsQuery.isFetching}
          >
            Next <ChevronRight size={14} />
          </Button>
        </Flex>
      )}
    </Container>
  );
};
