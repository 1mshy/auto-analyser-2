import { Link } from 'react-router-dom';
import { Box, Flex, Heading, HStack, SimpleGrid, Text } from '@chakra-ui/react';
import { ArrowUpRight, Database } from 'lucide-react';
import type { AIResearchSource } from '../../types';
import { Num, Surface } from '../../components/ui/primitives';
import { researchTimestamp } from './model';

function SourceCard({ source }: { source: AIResearchSource }) {
  const metrics = [
    { label: 'Price', value: source.price, decimals: 2 },
    {
      label: 'Day change',
      value: source.price_change_percent,
      decimals: 2,
      percent: true,
    },
    { label: 'RSI (14)', value: source.rsi, decimals: 1 },
    { label: 'SMA (20)', value: source.sma_20, decimals: 2 },
    { label: 'SMA (50)', value: source.sma_50, decimals: 2 },
    { label: 'Volume', value: source.volume, compact: true },
    { label: 'Market cap', value: source.market_cap, compact: true },
  ];
  return (
    <Surface p={4} minW={0}>
      <Flex justify="space-between" align="start" gap={3} mb={3}>
        <Box minW={0} overflowWrap="anywhere">
          <Link to={`/stocks/${encodeURIComponent(source.symbol)}`}>
            <HStack gap={1} color="accent.fg">
              <Text fontWeight="semibold" minW={0}>
                {source.symbol}
              </Text>
              <Box flexShrink={0}>
                <ArrowUpRight size={14} />
              </Box>
            </HStack>
          </Link>
          <Text fontSize="xs" color="fg.muted" mt={1}>
            {source.sector || 'Sector unavailable'}
          </Text>
        </Box>
        <Text fontSize="xs" color="fg.subtle" textAlign="right" maxW="145px">
          Analyzed
          <br />
          <time dateTime={source.analyzed_at}>
            {researchTimestamp(source.analyzed_at)}
          </time>
        </Text>
      </Flex>
      <SimpleGrid as="dl" columns={{ base: 2, sm: 3 }} gap={3}>
        {metrics.map((metric) => (
          <Box key={metric.label} minW={0}>
            <Text as="dt" color="fg.muted" fontSize="xs" mb={1}>
              {metric.label}
            </Text>
            <Box as="dd">
              <Num
                value={metric.value}
                decimals={metric.decimals}
                compact={metric.compact}
                suffix={metric.percent ? '%' : undefined}
                sign={metric.percent ? 'always' : 'auto'}
                intent={metric.percent ? 'auto' : 'neutral'}
                fontSize="sm"
                fontWeight="medium"
              />
            </Box>
          </Box>
        ))}
      </SimpleGrid>
    </Surface>
  );
}

export function ResearchSources({
  sources,
  missingSymbols,
}: {
  sources: AIResearchSource[];
  missingSymbols: string[];
}) {
  return (
    <Box as="section" aria-labelledby="research-sources-title" mt={6}>
      <HStack gap={2} mb={1}>
        <Database size={16} />
        <Heading id="research-sources-title" as="h2" size="sm">
          Source snapshots
        </Heading>
      </HStack>
      <Text color="fg.muted" fontSize="sm" mb={4}>
        The stored figures used for this answer. A dash means the value was
        unavailable. Prices use each listing's currency; no currency conversion
        is applied.
      </Text>
      {missingSymbols.length > 0 && (
        <Box
          role="status"
          bg="signal.warn.muted"
          borderWidth="1px"
          borderColor="border.subtle"
          borderRadius="md"
          p={3}
          mb={4}
        >
          <Text fontSize="sm" color="fg.default">
            No stored analysis was available for {missingSymbols.join(', ')}.
            These symbols were excluded from the answer.
          </Text>
        </Box>
      )}
      <SimpleGrid columns={{ base: 1, '2xl': 2 }} gap={3}>
        {sources.map((source) => (
          <SourceCard key={source.symbol} source={source} />
        ))}
      </SimpleGrid>
      {sources.length === 0 && (
        <Text fontSize="sm" color="fg.muted">
          No source snapshots were returned.
        </Text>
      )}
    </Box>
  );
}
