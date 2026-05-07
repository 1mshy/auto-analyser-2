import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  Flex,
  HStack,
  VStack,
  Text,
  Badge,
  Spinner,
  Heading,
} from '@chakra-ui/react';
import { ExternalLink, Sparkles } from 'lucide-react';
import { api } from '../api';
import { NewsCardPayload } from '../types';

interface Props {
  symbol: string;
}

function sentimentTone(score?: number): { label: string; color: string } | null {
  if (score === undefined || score === null) return null;
  if (score >= 0.15) return { label: 'Positive', color: 'green' };
  if (score <= -0.15) return { label: 'Negative', color: 'red' };
  return { label: 'Neutral', color: 'gray' };
}

function formatTimestamp(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

const NewsCard: React.FC<Props> = ({ symbol }) => {
  const [data, setData] = useState<NewsCardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getStockNews(symbol)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load news');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (loading) {
    return (
      <Card.Root bg="bg.surface" borderColor="border.default" borderRadius="lg" boxShadow="elevation.raised">
        <Card.Body>
          <Flex align="center" justify="center" py={8}>
            <Spinner size="md" color="accent.solid" />
            <Text ml={3} color="fg.muted">
              Loading news for {symbol}…
            </Text>
          </Flex>
        </Card.Body>
      </Card.Root>
    );
  }

  if (error) {
    return (
      <Card.Root bg="bg.surface" borderColor="border.default" borderRadius="lg" boxShadow="elevation.raised">
        <Card.Body>
          <Text color="fg.muted">Couldn't load news for {symbol}: {error}</Text>
        </Card.Body>
      </Card.Root>
    );
  }

  if (!data || data.articles.length === 0) {
    return (
      <Card.Root bg="bg.surface" borderColor="border.default" borderRadius="lg" boxShadow="elevation.raised">
        <Card.Body>
          <Text color="fg.subtle">No recent news for {symbol}.</Text>
        </Card.Body>
      </Card.Root>
    );
  }

  return (
    <VStack gap={3} align="stretch">
      {data.summary && (
        <Card.Root bg="bg.surface" borderColor="border.default" borderRadius="lg" boxShadow="elevation.raised">
          <Card.Body>
            <HStack mb={2}>
              <Badge colorPalette="purple" variant="subtle">
                <HStack gap={1}>
                  <Sparkles size={12} />
                  <Text>AI summary</Text>
                </HStack>
              </Badge>
              <Text color="fg.subtle" fontSize="xs">
                {data.summary.model_used} · {formatTimestamp(data.summary.generated_at)} · {data.summary.article_count} article{data.summary.article_count === 1 ? '' : 's'}
              </Text>
            </HStack>
            <Text color="fg.default" lineHeight="1.6">
              {data.summary.summary_text}
            </Text>
          </Card.Body>
        </Card.Root>
      )}

      <Card.Root bg="bg.surface" borderColor="border.default" borderRadius="lg" boxShadow="elevation.raised">
        <Card.Header>
          <Heading size="sm" color="fg.default">
            Recent headlines
          </Heading>
        </Card.Header>
        <Card.Body>
          <VStack gap={3} align="stretch">
            {data.articles.map((article, idx) => {
              const tone = sentimentTone(article.sentiment_score);
              return (
                <Box
                  key={idx}
                  borderTop={idx === 0 ? undefined : '1px'}
                  borderColor="border.subtle"
                  pt={idx === 0 ? 0 : 3}
                >
                  <a href={article.url} target="_blank" rel="noopener noreferrer">
                    <Flex justify="space-between" align="start" gap={3}>
                      <VStack align="start" gap={1} flex={1}>
                        <Text color="fg.default" fontWeight="semibold" _hover={{ color: 'accent.fg' }}>
                          {article.title}
                        </Text>
                        {article.snippet && (
                          <Text color="fg.muted" fontSize="sm" lineClamp={2}>
                            {article.snippet}
                          </Text>
                        )}
                        <HStack color="fg.subtle" fontSize="xs" gap={2} flexWrap="wrap">
                          {article.source && <Text>{article.source}</Text>}
                          {article.published_at && <Text>· {formatTimestamp(article.published_at)}</Text>}
                          {tone && (
                            <Badge colorPalette={tone.color} variant="subtle" size="sm">
                              {tone.label}
                            </Badge>
                          )}
                        </HStack>
                      </VStack>
                      <Box color="fg.subtle" mt={1}>
                        <ExternalLink size={16} />
                      </Box>
                    </Flex>
                  </a>
                </Box>
              );
            })}
          </VStack>
        </Card.Body>
      </Card.Root>
    </VStack>
  );
};

export default NewsCard;
