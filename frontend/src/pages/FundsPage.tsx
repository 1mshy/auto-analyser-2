import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Box,
    Container,
    Text,
    Flex,
    HStack,
    VStack,
    Button,
    SimpleGrid,
} from '@chakra-ui/react';
import { TrendingUp, TrendingDown, BarChart3, RefreshCw } from 'lucide-react';
import { IndexHeatmapData, StockHeatmapItem, HeatmapPeriod, HEATMAP_PERIODS } from '../types';
import { Surface, Num, SignalBadge, PageHeader, StatBlock, EmptyState, ErrorState, Skeleton } from '../components/ui/primitives';
import { useIndexes, useIndexHeatmap } from '../queries';
import { fmtPct } from '../format';

// ============================================================================
// Heatmap Component
// ============================================================================

interface HeatmapCellProps {
    stock: StockHeatmapItem;
    maxMarketCap: number;
}

const HeatmapCell: React.FC<HeatmapCellProps> = ({ stock, maxMarketCap }) => {
    // Calculate cell size based on market cap (proportional to sqrt for better visual distribution)
    const sizeRatio = Math.sqrt((stock.market_cap || 0) / maxMarketCap);
    const minSize = 60;
    const maxSize = 120;
    const size = minSize + sizeRatio * (maxSize - minSize);

    const getColor = (changePercent: number): string => {
        if (changePercent >= 3) return 'signalUp.400';
        if (changePercent >= 2) return 'signalUp.500';
        if (changePercent >= 1) return 'signalUp.600';
        if (changePercent >= 0.5) return 'signalUp.700';
        if (changePercent >= 0) return 'signalUp.800';
        if (changePercent >= -0.5) return 'signalDown.800';
        if (changePercent >= -1) return 'signalDown.700';
        if (changePercent >= -2) return 'signalDown.600';
        if (changePercent >= -3) return 'signalDown.500';
        return 'signalDown.400';
    };

    const bgColor = getColor(stock.change_percent);

    return (
        <Link to={`/stocks/${encodeURIComponent(stock.symbol)}`}>
            <Box
                bg={bgColor}
                p={2}
                borderRadius="sm"
                width={`${size}px`}
                height={`${size}px`}
                display="flex"
                flexDirection="column"
                justifyContent="center"
                alignItems="center"
                cursor="pointer"
                transition="all 0.15s"
                _hover={{ transform: 'scale(1.04)', zIndex: 10, outline: '1px solid', outlineColor: 'fg.default' }}
                position="relative"
                title={`${stock.symbol}: ${fmtPct(stock.change_percent, 2, { sign: true })} | Contribution: ${fmtPct(stock.contribution, 3, { sign: true })}`}
            >
                <Text
                    fontWeight="semibold"
                    color="white"
                    fontSize={size > 80 ? 'md' : 'sm'}
                    letterSpacing="tight"
                    textShadow="0 1px 2px rgba(0,0,0,0.55)"
                >
                    {stock.symbol}
                </Text>
                <Num
                    value={stock.change_percent}
                    sign="always"
                    suffix="%"
                    decimals={2}
                    color="whiteAlpha.900"
                    fontSize={size > 80 ? 'sm' : 'xs'}
                    textShadow="0 1px 2px rgba(0,0,0,0.55)"
                />
            </Box>
        </Link>
    );
};

interface HeatmapProps {
    data: IndexHeatmapData;
}

const Heatmap: React.FC<HeatmapProps> = ({ data }) => {
    if (!data.stocks || data.stocks.length === 0) {
        return (
            <EmptyState
                icon={<BarChart3 size={32} />}
                title="No stock data available"
                description="Stock data may still be loading. Please check back later."
            />
        );
    }

    const maxMarketCap = Math.max(...data.stocks.map(s => s.market_cap || 0));

    return (
        <Flex flexWrap="wrap" gap={1} justifyContent="center" p={4}>
            {data.stocks.map((stock) => (
                <HeatmapCell key={stock.symbol} stock={stock} maxMarketCap={maxMarketCap} />
            ))}
        </Flex>
    );
};

// ============================================================================
// Top Contributors/Detractors Component
// ============================================================================

interface ContributorsListProps {
    stocks: StockHeatmapItem[];
    type: 'contributors' | 'detractors';
}

const ContributorsList: React.FC<ContributorsListProps> = ({ stocks, type }) => {
    const sorted = [...stocks].sort((a, b) =>
        type === 'contributors'
            ? b.contribution - a.contribution
            : a.contribution - b.contribution
    );
    const top5 = sorted.slice(0, 5);

    return (
        <Surface p={4} variant="raised">
            <HStack mb={3}>
                <Box color={type === 'contributors' ? 'signal.up.fg' : 'signal.down.fg'}>
                    {type === 'contributors' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                </Box>
                <Text fontSize="sm" fontWeight="semibold" color="fg.default" textTransform="uppercase" letterSpacing="wider">
                    Top {type === 'contributors' ? 'Contributors' : 'Detractors'}
                </Text>
            </HStack>
            <VStack gap={1} align="stretch">
                {top5.map((stock, index) => (
                    <Link key={stock.symbol} to={`/stocks/${encodeURIComponent(stock.symbol)}`}>
                        <Flex
                            justify="space-between"
                            align="center"
                            px={2}
                            py={1.5}
                            borderRadius="sm"
                            _hover={{ bg: 'bg.muted' }}
                        >
                            <HStack>
                                <Text color="fg.subtle" fontSize="xs" width="20px" className="num" data-num="">{index + 1}.</Text>
                                <Text color="fg.default" fontWeight="semibold">{stock.symbol}</Text>
                            </HStack>
                            <Num
                                value={stock.contribution}
                                intent="auto"
                                sign="always"
                                suffix="%"
                                decimals={3}
                                fontWeight="semibold"
                                fontSize="sm"
                            />
                        </Flex>
                    </Link>
                ))}
            </VStack>
        </Surface>
    );
};

// ============================================================================
// Main FundsPage Component
// ============================================================================

export const FundsPage: React.FC = () => {
    const [selectedIndex, setSelectedIndex] = useState<string>('sp500');
    const [selectedPeriod, setSelectedPeriod] = useState<HeatmapPeriod>('1d');

    const { data: indexes = [] } = useIndexes();
    const heatmapQuery = useIndexHeatmap(selectedIndex, selectedPeriod);

    const heatmapData: IndexHeatmapData | null =
        heatmapQuery.data?.success && heatmapQuery.data.heatmap
            ? heatmapQuery.data.heatmap
            : null;
    const loading = heatmapQuery.isLoading || heatmapQuery.isFetching;
    const error = heatmapQuery.isError
        ? 'Failed to fetch heatmap data'
        : heatmapQuery.data && !heatmapData
            ? heatmapQuery.data.error || 'Failed to load heatmap data'
            : null;

    const currentIndex = indexes.find(i => i.id === selectedIndex);

    return (
        <Container maxW="page" py={{ base: 5, md: 8 }}>
            <PageHeader
                eyebrow="Indexes"
                icon={<BarChart3 size={22} />}
                title="Market Index Heatmaps"
                subtitle="Visualize stock performance and contributions across major market indexes"
            />

            <Surface mb={4} p={4} variant="raised">
                <VStack gap={4} align="stretch">
                    <HStack gap={2} flexWrap="wrap">
                        {indexes.map((index) => (
                            <Button
                                key={index.id}
                                size="sm"
                                variant="outline"
                                minH={{ base: '11', md: '8' }}
                                bg={selectedIndex === index.id ? 'accent.muted' : 'transparent'}
                                color={selectedIndex === index.id ? 'accent.fg' : 'fg.muted'}
                                borderColor={selectedIndex === index.id ? 'accent.solid' : 'border.default'}
                                _hover={{
                                    bg: selectedIndex === index.id ? 'accent.muted' : 'bg.muted',
                                    color: selectedIndex === index.id ? 'accent.fg' : 'fg.default',
                                }}
                                onClick={() => setSelectedIndex(index.id)}
                            >
                                {index.name}
                            </Button>
                        ))}
                    </HStack>

                    <HStack gap={2} flexWrap="wrap">
                        <Text color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider">Period</Text>
                        {HEATMAP_PERIODS.map((period) => (
                            <Button
                                key={period.value}
                                size="xs"
                                variant="ghost"
                                minH={{ base: '11', md: '6' }}
                                bg={selectedPeriod === period.value ? 'accent.muted' : 'transparent'}
                                color={selectedPeriod === period.value ? 'accent.fg' : 'fg.muted'}
                                _hover={{
                                    bg: selectedPeriod === period.value ? 'accent.muted' : 'bg.muted',
                                    color: selectedPeriod === period.value ? 'accent.fg' : 'fg.default',
                                }}
                                onClick={() => setSelectedPeriod(period.value)}
                            >
                                {period.label}
                            </Button>
                        ))}
                        <Box flex={1} />
                        <Button
                            size="xs"
                            variant="ghost"
                            minH={{ base: '11', md: '6' }}
                            color="fg.muted"
                            _hover={{ bg: 'bg.muted', color: 'fg.default' }}
                            aria-label="Refresh heatmap"
                            onClick={() => heatmapQuery.refetch()}
                            disabled={loading}
                        >
                            <RefreshCw size={14} />
                        </Button>
                    </HStack>
                </VStack>
            </Surface>

            {!loading && heatmapData && (
                <SimpleGrid columns={{ base: 2, md: 4 }} gap={3} mb={4}>
                    <StatBlock
                        label={currentIndex?.name || 'Index'}
                        value={heatmapData.index_performance}
                        valueIntent="auto"
                        valueSign="always"
                        valueSuffix="%"
                    />
                    <StatBlock label="Stocks Tracked" value={heatmapData.stocks.length} />
                    <StatBlock
                        label="Gainers"
                        value={heatmapData.stocks.filter(s => s.change_percent > 0).length}
                        valueIntent="up"
                    />
                    <StatBlock
                        label="Losers"
                        value={heatmapData.stocks.filter(s => s.change_percent < 0).length}
                        valueIntent="down"
                    />
                </SimpleGrid>
            )}

            <Surface mb={4} variant="raised">
                <Flex justify="space-between" align="center" p={4} borderBottomWidth="1px" borderColor="border.subtle">
                    <HStack>
                        <Text fontSize="sm" fontWeight="semibold" color="fg.default" textTransform="uppercase" letterSpacing="wider">
                            Performance Heatmap
                        </Text>
                        {!loading && heatmapData && (
                            <SignalBadge tone="info" size="xs">{selectedPeriod.toUpperCase()}</SignalBadge>
                        )}
                    </HStack>
                    {!loading && heatmapData && (
                        <Text color="fg.subtle" fontSize="xs" className="num" data-num="">
                            Updated {new Date(heatmapData.generated_at).toLocaleTimeString()}
                        </Text>
                    )}
                </Flex>
                {loading ? (
                    <Flex flexWrap="wrap" gap={1} justifyContent="center" p={4}>
                        {Array.from({ length: 24 }).map((_, i) => (
                            <Skeleton key={i} w="20" h="20" borderRadius="sm" />
                        ))}
                    </Flex>
                ) : error ? (
                    <ErrorState
                        title="Couldn’t load heatmap"
                        description={error}
                        onRetry={() => heatmapQuery.refetch()}
                    />
                ) : heatmapData ? (
                    <Heatmap data={heatmapData} />
                ) : null}
            </Surface>

            {!loading && heatmapData && heatmapData.stocks.length > 0 && (
                <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
                    <ContributorsList stocks={heatmapData.stocks} type="contributors" />
                    <ContributorsList stocks={heatmapData.stocks} type="detractors" />
                </SimpleGrid>
            )}

            <Surface mt={4} p={4} variant="inset">
                <VStack gap={3} align="start">
                    <Text color="fg.muted" fontSize="xs" fontWeight="semibold" textTransform="uppercase" letterSpacing="wider">
                        Legend
                    </Text>
                    <HStack gap={4} flexWrap="wrap">
                        <HStack>
                            <Box w={4} h={4} bg="signalUp.400" borderRadius="sm" />
                            <Text color="fg.muted" fontSize="xs">+3%+</Text>
                        </HStack>
                        <HStack>
                            <Box w={4} h={4} bg="signalUp.600" borderRadius="sm" />
                            <Text color="fg.muted" fontSize="xs">+1% to +3%</Text>
                        </HStack>
                        <HStack>
                            <Box w={4} h={4} bg="signalUp.800" borderRadius="sm" />
                            <Text color="fg.muted" fontSize="xs">0% to +1%</Text>
                        </HStack>
                        <HStack>
                            <Box w={4} h={4} bg="signalDown.800" borderRadius="sm" />
                            <Text color="fg.muted" fontSize="xs">0% to -1%</Text>
                        </HStack>
                        <HStack>
                            <Box w={4} h={4} bg="signalDown.600" borderRadius="sm" />
                            <Text color="fg.muted" fontSize="xs">-1% to -3%</Text>
                        </HStack>
                        <HStack>
                            <Box w={4} h={4} bg="signalDown.400" borderRadius="sm" />
                            <Text color="fg.muted" fontSize="xs">-3%+</Text>
                        </HStack>
                    </HStack>
                    <Text color="fg.subtle" fontSize="xs">
                        Cell size is proportional to market cap. Hover over cells for detailed contribution data.
                    </Text>
                </VStack>
            </Surface>
        </Container>
    );
};
