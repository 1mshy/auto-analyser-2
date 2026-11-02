import { useState } from 'react';
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Box, Button, Flex, HStack, Text, VStack } from '@chakra-ui/react';
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  ExternalLink,
  TrendingUp,
} from 'lucide-react';
import {
  useAIAnalysis,
  useAIStatus,
  useNews,
  useSectorPerformance,
  useWatchlists,
} from '../../queries';
import { Num, SkeletonText } from '../../components/ui/primitives';
import MarkdownContent from '../../components/MarkdownContent';
import { fmtPct } from '../../format';
import {
  extractObjectId,
  type MarketSummary,
  type StockAnalysis,
} from '../../types';
import type { WidgetId } from '../workspace/model';

export function PanelMessage({
  children,
  retry,
}: {
  children: ReactNode;
  retry?: () => void;
}) {
  return (
    <VStack align="start" gap={3} py={6}>
      <Text fontSize="sm" color="fg.muted">
        {children}
      </Text>
      {retry && (
        <Button size="xs" variant="outline" onClick={retry}>
          Retry
        </Button>
      )}
    </VStack>
  );
}
function StockRows({
  stocks,
  rsi = false,
}: {
  stocks: StockAnalysis[];
  rsi?: boolean;
}) {
  if (!stocks.length)
    return (
      <PanelMessage>No matching stocks in the latest analysis.</PanelMessage>
    );
  return (
    <Box>
      <Flex justify="space-between" color="fg.subtle" fontSize="xs" pb={2}>
        <Text>Symbol / price</Text>
        <Text>{rsi ? 'RSI · 14 periods' : 'Day change'}</Text>
      </Flex>
      {stocks.slice(0, 6).map((stock) => (
        <Link
          to={`/stocks/${encodeURIComponent(stock.symbol)}`}
          key={stock.symbol}
        >
          <Flex
            align="center"
            justify="space-between"
            gap={2}
            minH="54px"
            borderTopWidth="1px"
            borderColor="border.subtle"
            _hover={{ bg: 'bg.muted' }}
          >
            <Box minW={0}>
              <Text fontSize="sm" fontWeight="semibold">
                {stock.symbol}
              </Text>
              <Num value={stock.price} fontSize="xs" color="fg.muted" />
            </Box>
            {rsi ? (
              <HStack gap={2}>
                <Box
                  w="48px"
                  h="4px"
                  bg="bg.emphasized"
                  borderRadius="full"
                  overflow="hidden"
                >
                  <Box
                    h="full"
                    w={`${Math.max(0, Math.min(100, stock.rsi ?? 0))}%`}
                    bg="signal.warn.solid"
                  />
                </Box>
                <Num value={stock.rsi} decimals={1} fontSize="sm" />
              </HStack>
            ) : (
              <HStack
                gap={1}
                color={
                  stock.price_change_percent == null
                    ? 'fg.muted'
                    : stock.price_change_percent >= 0
                      ? 'signal.up.fg'
                      : 'signal.down.fg'
                }
              >
                {stock.price_change_percent != null &&
                  (stock.price_change_percent >= 0 ? (
                    <ArrowUpRight size={14} />
                  ) : (
                    <ArrowDownRight size={14} />
                  ))}
                <Num
                  value={stock.price_change_percent}
                  decimals={2}
                  sign="always"
                  suffix="%"
                  fontSize="sm"
                  color="inherit"
                />
              </HStack>
            )}
          </Flex>
        </Link>
      ))}
      <Text color="fg.subtle" fontSize="xs" mt={3}>
        Prices in listing currency.
      </Text>
    </Box>
  );
}
function Movers({ summary }: { summary: MarketSummary }) {
  const [direction, setDirection] = useState<'gainers' | 'losers'>('gainers');
  return (
    <>
      <HStack gap={1} mb={3} aria-label="Market mover direction">
        {(['gainers', 'losers'] as const).map((value) => (
          <Button
            key={value}
            size="xs"
            variant={direction === value ? 'subtle' : 'ghost'}
            colorPalette={value === 'gainers' ? 'green' : 'red'}
            aria-pressed={direction === value}
            onClick={() => setDirection(value)}
          >
            {value === 'gainers' ? 'Gainers' : 'Decliners'}
          </Button>
        ))}
      </HStack>
      <StockRows
        stocks={
          direction === 'gainers' ? summary.top_gainers : summary.top_losers
        }
      />
    </>
  );
}
function Sectors() {
  const query = useSectorPerformance();
  if (query.isLoading) return <SkeletonText lines={8} />;
  if (query.isError && !query.data)
    return (
      <PanelMessage retry={() => query.refetch()}>
        Sector performance is unavailable.
      </PanelMessage>
    );
  const sectors = [...(query.data ?? [])]
    .filter((item) => Number.isFinite(item.avg_change_percent))
    .sort((a, b) => b.avg_change_percent - a.avg_change_percent);
  if (!sectors.length)
    return (
      <PanelMessage>
        No sector classifications are available in the current analysis.
      </PanelMessage>
    );
  const extent = Math.max(
    ...sectors.map((item) => Math.abs(item.avg_change_percent)),
    1,
  );
  return (
    <>
      <Flex justify="space-between" mb={3} gap={2}>
        <Text fontSize="xs" color="fg.subtle">
          Average daily change · analyzed stocks
        </Text>
        <Text fontSize="xs" color="fg.subtle">
          %
        </Text>
      </Flex>
      <Box role="list" aria-label="Sector daily performance">
        {sectors.map((sector) => (
          <Box role="listitem" key={sector.sector}>
            <Link to={`/stocks?sectors=${encodeURIComponent(sector.sector)}`}>
              <Flex
                align="center"
                gap={3}
                minH="31px"
                _hover={{ bg: 'bg.muted' }}
              >
                <Text
                  fontSize="xs"
                  w={{ base: '104px', sm: '142px' }}
                  flexShrink={0}
                  truncate
                  title={sector.sector}
                >
                  {sector.sector}
                </Text>
                <Box
                  position="relative"
                  flex={1}
                  h="20px"
                  minW="20px"
                  aria-hidden="true"
                >
                  <Box
                    position="absolute"
                    left="50%"
                    top={0}
                    bottom={0}
                    w="1px"
                    bg="border.emphasis"
                  />
                  <Box
                    position="absolute"
                    top="4px"
                    h="12px"
                    borderRadius="2px"
                    bg={
                      sector.avg_change_percent >= 0
                        ? 'signal.up.solid'
                        : 'signal.down.solid'
                    }
                    w={`${(Math.abs(sector.avg_change_percent) / extent) * 48}%`}
                    left={sector.avg_change_percent >= 0 ? '50%' : undefined}
                    right={sector.avg_change_percent < 0 ? '50%' : undefined}
                  />
                </Box>
                <Text
                  fontSize="xs"
                  className="num"
                  w="64px"
                  textAlign="right"
                  color={
                    sector.avg_change_percent >= 0
                      ? 'signal.up.fg'
                      : 'signal.down.fg'
                  }
                >
                  {fmtPct(sector.avg_change_percent, 2, { sign: true })}
                </Text>
              </Flex>
            </Link>
          </Box>
        ))}
      </Box>
      <Flex
        mt={3}
        pt={3}
        borderTopWidth="1px"
        borderColor="border.subtle"
        justify="space-between"
        gap={2}
      >
        <Text color="fg.subtle" fontSize="xs">
          Equal-weighted by stock, not an index return.
        </Text>
        <Link to="/sectors" aria-label="Explore sectors">
          <Box color="accent.fg">
            <ArrowRight size={16} />
          </Box>
        </Link>
      </Flex>
    </>
  );
}
function Watchlists() {
  const query = useWatchlists();
  if (query.isLoading) return <SkeletonText lines={5} />;
  if (query.isError && !query.data)
    return (
      <PanelMessage retry={() => query.refetch()}>
        Your watchlists could not be loaded.
      </PanelMessage>
    );
  if (!query.data?.length)
    return (
      <VStack align="start" py={5} gap={3}>
        <Box color="fg.subtle">
          <TrendingUp size={24} />
        </Box>
        <Text fontWeight="medium" fontSize="sm">
          Keep your research close
        </Text>
        <Text fontSize="sm" color="fg.muted">
          Build a watchlist to follow companies and connect them to your alert
          rules.
        </Text>
        <Button asChild size="sm" variant="outline">
          <Link to="/alerts?tab=watchlists">
            Create a watchlist <ArrowUpRight size={14} />
          </Link>
        </Button>
      </VStack>
    );
  return (
    <VStack align="stretch" gap={4}>
      {query.data.slice(0, 4).map((list, i) => (
        <Box key={extractObjectId(list._id) ?? i}>
          <Flex justify="space-between" mb={2}>
            <Text fontWeight="semibold" fontSize="sm">
              {list.name}
            </Text>
            <Text fontSize="xs" color="fg.subtle">
              {list.symbols.length} symbols
            </Text>
          </Flex>
          <Flex wrap="wrap" gap={1.5}>
            {list.symbols.slice(0, 8).map((symbol) => (
              <Button asChild key={symbol} size="xs" variant="subtle">
                <Link to={`/stocks/${encodeURIComponent(symbol)}`}>
                  {symbol}
                </Link>
              </Button>
            ))}
            {list.symbols.length > 8 && (
              <Text fontSize="xs" color="fg.subtle" py={1}>
                +{list.symbols.length - 8} more
              </Text>
            )}
          </Flex>
        </Box>
      ))}
    </VStack>
  );
}
function Headlines() {
  const query = useNews();
  if (query.isLoading) return <SkeletonText lines={7} />;
  if (query.isError && !query.data)
    return (
      <PanelMessage retry={() => query.refetch()}>
        The news feed is unavailable.
      </PanelMessage>
    );
  if (!query.data?.news.length)
    return <PanelMessage>No recent headlines are available.</PanelMessage>;
  return (
    <VStack align="stretch" gap={4}>
      {query.data.news.slice(0, 4).map((item, index) => (
        <Box key={`${item.url}-${index}`}>
          <HStack color="fg.subtle" fontSize="xs" mb={1}>
            <Text color="accent.fg">{item.symbol}</Text>
            <Text>
              · {item.publisher ?? 'Market news'}
              {item.ago ? ` · ${item.ago}` : ''}
            </Text>
          </HStack>
          <a
            href={/^https?:\/\//i.test(item.url) ? item.url : undefined}
            target="_blank"
            rel="noreferrer"
          >
            <Text
              fontSize="sm"
              lineHeight="1.5"
              _hover={{ color: 'accent.fg' }}
            >
              {item.title}{' '}
              <ExternalLink size={11} style={{ display: 'inline' }} />
            </Text>
          </a>
        </Box>
      ))}
    </VStack>
  );
}
function AIResearch({ stock }: { stock: StockAnalysis }) {
  const [requested, setRequested] = useState(false);
  const query = useAIAnalysis(stock.symbol, requested);
  return (
    <Box>
      <Text fontWeight="semibold" fontSize="sm" mb={2}>
        {stock.symbol}
      </Text>
      {!requested ? (
        <>
          <Text color="fg.muted" fontSize="sm" mb={3}>
            Request an AI summary for this oversold candidate.
          </Text>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRequested(true)}
          >
            Analyze {stock.symbol}
          </Button>
        </>
      ) : query.isLoading ? (
        <SkeletonText lines={5} />
      ) : query.isError || !query.data?.success ? (
        <PanelMessage retry={() => query.refetch()}>
          AI analysis is unavailable.
        </PanelMessage>
      ) : (
        <>
          <Box maxH="260px" overflowY="auto">
            <MarkdownContent fontSize="sm" color="fg.muted">
              {query.data.analysis ?? ''}
            </MarkdownContent>
          </Box>
          <Text color="fg.subtle" fontSize="xs" mt={3}>
            AI-generated · {query.data.model_used}
          </Text>
        </>
      )}
    </Box>
  );
}
function AIWidget({ summary }: { summary?: MarketSummary }) {
  const status = useAIStatus();
  if (status.isLoading) return <SkeletonText lines={3} />;
  if (status.isError)
    return (
      <PanelMessage retry={() => status.refetch()}>
        AI availability could not be checked.
      </PanelMessage>
    );
  if (!status.data?.enabled)
    return (
      <PanelMessage>
        AI research is not enabled on this server. Charts, screening, and alerts
        are still available.
      </PanelMessage>
    );
  if (!summary?.most_oversold.length)
    return (
      <PanelMessage>
        No oversold candidates are available for analysis.
      </PanelMessage>
    );
  return (
    <AIResearch
      key={summary.most_oversold[0].symbol}
      stock={summary.most_oversold[0]}
    />
  );
}
export function DashboardWidget({
  id,
  summary,
}: {
  id: WidgetId;
  summary: UseQueryResult<MarketSummary, Error>;
}) {
  if (id === 'sectors') return <Sectors />;
  if (id === 'watchlists') return <Watchlists />;
  if (id === 'news') return <Headlines />;
  if (id === 'ai') return <AIWidget summary={summary.data} />;
  if (summary.isLoading) return <SkeletonText lines={8} />;
  if (!summary.data)
    return (
      <PanelMessage retry={() => summary.refetch()}>
        Market analysis is unavailable. Check the server connection and retry.
      </PanelMessage>
    );
  return (
    <>
      {summary.isError && (
        <Text fontSize="xs" color="signal.warn.fg" mb={2}>
          Refresh failed · showing the last available analysis
        </Text>
      )}
      {id === 'movers' ? (
        <Movers summary={summary.data} />
      ) : (
        <StockRows
          stocks={
            id === 'oversold'
              ? summary.data.most_oversold
              : summary.data.mega_cap_highlights
          }
          rsi={id === 'oversold'}
        />
      )}
    </>
  );
}
