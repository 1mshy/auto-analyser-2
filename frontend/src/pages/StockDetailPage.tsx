import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Box, Button, Container, Flex, HStack, SimpleGrid, Text, VStack } from '@chakra-ui/react';
import { ArrowLeft, SearchX, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { WatchButton } from '../components/alerts/WatchButton';
import NewsCard from '../components/NewsCard';
import {
  AgeBadge,
  EmptyState,
  ErrorState,
  FreshnessChip,
  Num,
  PageHeader,
  SignalBadge,
  Skeleton,
  SkeletonText,
  Surface,
  TierBadge,
} from '../components/ui/primitives';
import {
  useAIStatus,
  useCompanyProfile,
  useInsiderTrades,
  useStock,
  useStockEarnings,
} from '../queries';
import { TabBar, StockDetailTab, StockDetailTabId } from './stock-detail/TabBar';
import { OverviewTab } from './stock-detail/OverviewTab';
import { AboutTab } from './stock-detail/AboutTab';
import { TechnicalsTab } from './stock-detail/TechnicalsTab';
import { AITab } from './stock-detail/AITab';
import { InsidersTab } from './stock-detail/InsidersTab';
import { TradingViewWidget } from './stock-detail/TradingViewWidget';
import { useAIAnalysisStream } from './stock-detail/useAIAnalysisStream';

const TABS: StockDetailTab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'about', label: 'About' },
  { id: 'technicals', label: 'Technical Analysis' },
  { id: 'chart', label: 'Chart' },
  { id: 'ai', label: 'AI Analysis', icon: <Zap size={14} /> },
  { id: 'news', label: 'News' },
  { id: 'insiders', label: 'Insider Trades' },
];

export const StockDetailPage: React.FC = () => {
  const { symbol: rawSymbol } = useParams<{ symbol: string }>();
  const symbol = rawSymbol ? decodeURIComponent(rawSymbol) : rawSymbol;

  const { data: stockData, isLoading, isError, refetch } = useStock(
    symbol ? symbol.toUpperCase() : ''
  );
  const stock = stockData?.stock ?? null;

  const [activeTab, setActiveTab] = useState<StockDetailTabId>('overview');
  const [insidersActivated, setInsidersActivated] = useState(false);

  const {
    data: companyProfile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useCompanyProfile(symbol ?? '');
  const { data: stockEarnings } = useStockEarnings(symbol ?? '');
  const { data: aiStatus } = useAIStatus();
  const insidersQuery = useInsiderTrades(symbol ?? '', insidersActivated);
  const aiStream = useAIAnalysisStream(symbol);

  const handleTabChange = (id: StockDetailTabId) => {
    setActiveTab(id);
    if (id === 'insiders') setInsidersActivated(true);
  };

  if (isLoading) {
    return (
      <Container maxW="page" py={{ base: 5, md: 8 }}>
        <VStack align="stretch" gap={4}>
          <Skeleton h="10" w="64" />
          <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Surface key={i} p={4}><SkeletonText lines={2} /></Surface>
            ))}
          </SimpleGrid>
          <Surface p={4}><SkeletonText lines={8} /></Surface>
        </VStack>
      </Container>
    );
  }

  if (isError) {
    return (
      <Container maxW="page" py={{ base: 5, md: 8 }}>
        <ErrorState
          title="Couldn’t load this stock"
          description={`The request for "${symbol}" failed — a network or server error, not a missing symbol. Check that the backend is reachable, then retry.`}
          onRetry={() => refetch()}
        />
      </Container>
    );
  }

  if (!stock) {
    return (
      <Container maxW="page" py={{ base: 5, md: 8 }}>
        <EmptyState
          icon={<SearchX size={28} />}
          title="Stock not found"
          description={`The symbol "${symbol}" was not found in our database. It may not have been analyzed yet (check progress), Yahoo Finance may not have data for it, or it may be a warrant, unit, or special security type.`}
          action={
            <Link to="/stocks">
              <Button
                size="sm"
                minH={{ base: 11, md: 8 }}
                variant="outline"
                borderColor="border.default"
                color="fg.default"
                _hover={{ bg: 'bg.muted', borderColor: 'border.emphasis' }}
              >
                <ArrowLeft size={16} /> Back to Stocks
              </Button>
            </Link>
          }
        />
      </Container>
    );
  }

  const isPositive = (stock.price_change_percent ?? 0) >= 0;
  const displaySector = companyProfile?.sector || stock.sector || 'Unknown Sector';
  const displayName = companyProfile?.long_name || companyProfile?.short_name;
  const displayExchange =
    companyProfile?.exchange_name ||
    companyProfile?.exchange ||
    stock.technicals?.exchange ||
    (stock.symbol.endsWith('.TO') || stock.symbol.endsWith('.V') ? 'TSX/TSXV' : undefined);
  const showName =
    displayName && displayName.toUpperCase() !== stock.symbol.toUpperCase()
      ? displayName
      : undefined;

  return (
    <Container maxW="page" py={{ base: 5, md: 8 }}>
      <Link to="/stocks">
        <Button
          variant="ghost"
          mb={4}
          size="sm"
          minH={{ base: 11, md: 8 }}
          color="fg.muted"
          _hover={{ bg: 'bg.muted', color: 'fg.default' }}
        >
          <ArrowLeft size={16} /> Back to Stocks
        </Button>
      </Link>

      <PageHeader
        mb={4}
        title={showName ? `${stock.symbol} — ${showName}` : stock.symbol}
        subtitle={[displaySector, displayExchange].filter(Boolean).join(' · ')}
        actions={
          <>
            <AgeBadge timestamp={stock.analyzed_at} />
            <FreshnessChip cached={stockData?.cached} />
            <WatchButton symbol={stock.symbol} size="md" />
          </>
        }
      />

      <Surface p={{ base: 4, md: 5 }} mb={4} variant="raised">
        <Flex
          justify="space-between"
          align={{ base: 'stretch', md: 'flex-start' }}
          direction={{ base: 'column', md: 'row' }}
          gap={5}
        >
          <VStack align="flex-start" gap={3} minW={0}>
            <HStack wrap="wrap">
              <TierBadge marketCap={stock.market_cap} size="md" />
              {stock.is_oversold && (
                <SignalBadge tone="up" size="md">
                  Oversold
                </SignalBadge>
              )}
              {stock.is_overbought && (
                <SignalBadge tone="down" size="md">
                  Overbought
                </SignalBadge>
              )}
            </HStack>
            <Text color="fg.muted" maxW="2xl">
              {companyProfile?.long_business_summary
                ? companyProfile.long_business_summary.slice(0, 180) +
                  (companyProfile.long_business_summary.length > 180 ? '…' : '')
                : 'Real-time technical profile, company context, charting, news, AI analysis, and insider activity.'}
            </Text>
          </VStack>

          <VStack align={{ base: 'flex-start', md: 'flex-end' }} gap={1} flexShrink={0}>
            <Num
              value={stock.price}
              prefix="$"
              fontSize={{ base: '3xl', md: '4xl' }}
              fontWeight="semibold"
              color="fg.default"
              lineHeight="1"
            />
            <HStack>
              <Box color={isPositive ? 'signal.up.fg' : 'signal.down.fg'}>
                {isPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              </Box>
              <Num
                value={stock.price_change}
                intent="auto"
                sign="always"
                prefix="$"
                fontSize="md"
                fontWeight="semibold"
              />
              <Num
                value={stock.price_change_percent}
                intent="auto"
                sign="always"
                prefix="("
                suffix="%)"
                fontSize="md"
                fontWeight="semibold"
              />
            </HStack>
          </VStack>
        </Flex>
      </Surface>

      <TabBar tabs={TABS} active={activeTab} onChange={handleTabChange} />

      {activeTab === 'overview' && <OverviewTab stock={stock} earnings={stockEarnings} />}

      {activeTab === 'about' && (
        <AboutTab
          symbol={stock.symbol}
          profile={companyProfile}
          isLoading={profileLoading}
          isError={profileError}
          onRetry={() => refetchProfile()}
        />
      )}

      {activeTab === 'technicals' && <TechnicalsTab stock={stock} />}

      {activeTab === 'chart' && <TradingViewWidget symbol={stock.symbol} />}

      {activeTab === 'ai' && (
        <AITab
          aiEnabled={aiStatus?.enabled ?? false}
          aiAnalysis={aiStream.aiAnalysis}
          aiLoading={aiStream.aiLoading}
          isStreaming={aiStream.isStreaming}
          streamingText={aiStream.streamingText}
          streamingStatus={aiStream.streamingStatus}
          streamingModel={aiStream.streamingModel}
          onGenerate={aiStream.startAnalysis}
        />
      )}

      {/* News tab — Marketaux + AI summary */}
      {activeTab === 'news' && <NewsCard symbol={symbol!} />}

      {activeTab === 'insiders' && (
        <InsidersTab
          trades={insidersQuery.data}
          isLoading={insidersQuery.isLoading}
          isError={insidersQuery.isError}
          onRetry={() => insidersQuery.refetch()}
        />
      )}
    </Container>
  );
};
