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
    SimpleGrid,
    Stat,
} from '@chakra-ui/react';
import { TrendingUp, TrendingDown, BarChart3, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { IndexInfo, IndexHeatmapData, StockHeatmapItem, HeatmapPeriod, HEATMAP_PERIODS } from '../types';

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

    // Color based on performance (gradient from red to green)
    const getColor = (changePercent: number): string => {
        if (changePercent >= 3) return 'green.400';
        if (changePercent >= 2) return 'green.500';
        if (changePercent >= 1) return 'green.600';
        if (changePercent >= 0.5) return 'green.700';
        if (changePercent >= 0) return 'green.800';
        if (changePercent >= -0.5) return 'red.800';
        if (changePercent >= -1) return 'red.700';
        if (changePercent >= -2) return 'red.600';
        if (changePercent >= -3) return 'red.500';
        return 'red.400';
    };

    const bgColor = getColor(stock.change_percent);

    return (
        <Link to={`/stocks/${stock.symbol}`}>
            <Box
                bg={bgColor}
                p={2}
                borderRadius="md"
                width={`${size}px`}
                height={`${size}px`}
                display="flex"
                flexDirection="column"
                justifyContent="center"
                alignItems="center"
                cursor="pointer"
                transition="all 0.2s"
                _hover={{ transform: 'scale(1.05)', zIndex: 10, boxShadow: 'lg' }}
                position="relative"
                title={`${stock.symbol}: ${stock.change_percent >= 0 ? '+' : ''}${stock.change_percent.toFixed(2)}% | Contribution: ${stock.contribution >= 0 ? '+' : ''}${stock.contribution.toFixed(3)}%`}
            >
                <Text
                    fontWeight="bold"
                    color="white"
                    fontSize={size > 80 ? 'md' : 'sm'}
                    textShadow="0 1px 2px rgba(0,0,0,0.5)"
                >
                    {stock.symbol}
                </Text>
                <Text
                    color="whiteAlpha.900"
                    fontSize={size > 80 ? 'sm' : 'xs'}
                    textShadow="0 1px 2px rgba(0,0,0,0.5)"
                >
                    {stock.change_percent >= 0 ? '+' : ''}{stock.change_percent.toFixed(2)}%
                </Text>
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
            <Box textAlign="center" py={10}>
                <Text color="gray.400">No stock data available for this index.</Text>
                <Text color="gray.500" fontSize="sm" mt={2}>
                    Stock data may still be loading. Please check back later.
                </Text>
            </Box>
        );
    }

    const maxMarketCap = Math.max(...data.stocks.map(s => s.market_cap || 0));

    return (
        <Flex flexWrap="wrap" gap={2} justifyContent="center" p={4}>
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
        <Card.Root bg="gray.800" borderColor="gray.700">
            <Card.Header>
                <HStack>
                    <Box color={type === 'contributors' ? 'green.400' : 'red.400'}>
                        {type === 'contributors' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                    </Box>
                    <Heading size="sm" color="white">
                        Top {type === 'contributors' ? 'Contributors' : 'Detractors'}
                    </Heading>
                </HStack>
            </Card.Header>
            <Card.Body>
                <VStack gap={2} align="stretch">
                    {top5.map((stock, index) => (
                        <Link key={stock.symbol} to={`/stocks/${stock.symbol}`}>
                            <Flex
                                justify="space-between"
                                align="center"
                                p={2}
                                borderRadius="md"
                                bg="whiteAlpha.50"
                                _hover={{ bg: 'whiteAlpha.100' }}
                            >
                                <HStack>
                                    <Text color="gray.500" fontSize="sm" width="20px">{index + 1}.</Text>
                                    <Text color="white" fontWeight="bold">{stock.symbol}</Text>
                                </HStack>
                                <Text
                                    color={stock.contribution >= 0 ? 'green.400' : 'red.400'}
                                    fontWeight="bold"
                                    fontSize="sm"
                                >
                                    {stock.contribution >= 0 ? '+' : ''}{stock.contribution.toFixed(3)}%
                                </Text>
                            </Flex>
                        </Link>
                    ))}
                </VStack>
            </Card.Body>
        </Card.Root>
    );
};

// ============================================================================
// Main FundsPage Component
// ============================================================================

export const FundsPage: React.FC = () => {
    const [indexes, setIndexes] = useState<IndexInfo[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<string>('sp500');
    const [selectedPeriod, setSelectedPeriod] = useState<HeatmapPeriod>('1d');
    const [heatmapData, setHeatmapData] = useState<IndexHeatmapData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch available indexes
    useEffect(() => {
        const fetchIndexes = async () => {
            try {
                const data = await api.getIndexes();
                setIndexes(data);
            } catch (err) {
                console.error('Failed to fetch indexes:', err);
            }
        };
        fetchIndexes();
    }, []);

    // Fetch heatmap data when index or period changes
    const fetchHeatmapData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.getIndexHeatmap(selectedIndex, selectedPeriod);
            if (response.success && response.heatmap) {
                setHeatmapData(response.heatmap);
            } else {
                setError(response.error || 'Failed to load heatmap data');
                setHeatmapData(null);
            }
        } catch (err) {
            setError('Failed to fetch heatmap data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [selectedIndex, selectedPeriod]);

    useEffect(() => {
        fetchHeatmapData();
    }, [fetchHeatmapData]);

    const currentIndex = indexes.find(i => i.id === selectedIndex);

    return (
        <Container maxW="container.xl" py={8}>
            {/* Page Header */}
            <Box mb={6}>
                <HStack gap={3} mb={2}>
                    <Box color="blue.400"><BarChart3 size={28} /></Box>
                    <Heading size="lg" color="white">Market Index Heatmaps</Heading>
                </HStack>
                <Text color="gray.400">
                    Visualize stock performance and contributions across major market indexes
                </Text>
            </Box>

            {/* Index Selector */}
            <Card.Root bg="gray.800" borderColor="gray.700" mb={6}>
                <Card.Body>
                    <VStack gap={4} align="stretch">
                        {/* Index Tabs */}
                        <HStack gap={2} flexWrap="wrap">
                            {indexes.map((index) => (
                                <Button
                                    key={index.id}
                                    size="md"
                                    variant={selectedIndex === index.id ? 'solid' : 'outline'}
                                    colorPalette={selectedIndex === index.id ? 'blue' : 'gray'}
                                    onClick={() => setSelectedIndex(index.id)}
                                >
                                    {index.name}
                                </Button>
                            ))}
                        </HStack>

                        {/* Period Selector */}
                        <HStack gap={2}>
                            <Text color="gray.400" fontSize="sm">Period:</Text>
                            {HEATMAP_PERIODS.map((period) => (
                                <Button
                                    key={period.value}
                                    size="sm"
                                    variant={selectedPeriod === period.value ? 'solid' : 'ghost'}
                                    colorPalette={selectedPeriod === period.value ? 'green' : 'gray'}
                                    onClick={() => setSelectedPeriod(period.value)}
                                >
                                    {period.label}
                                </Button>
                            ))}
                            <Box flex={1} />
                            <Button
                                size="sm"
                                variant="ghost"
                                colorPalette="gray"
                                onClick={fetchHeatmapData}
                                disabled={loading}
                            >
                                <RefreshCw size={16} />
                            </Button>
                        </HStack>
                    </VStack>
                </Card.Body>
            </Card.Root>

            {/* Index Summary Stats */}
            {!loading && heatmapData && (
                <SimpleGrid columns={{ base: 2, md: 4 }} gap={4} mb={6}>
                    <Card.Root bg="gray.800" borderColor="gray.700">
                        <Card.Body>
                            <Stat.Root>
                                <Stat.Label color="gray.400">{currentIndex?.name || 'Index'}</Stat.Label>
                                <Stat.ValueText
                                    color={heatmapData.index_performance >= 0 ? 'green.400' : 'red.400'}
                                >
                                    {heatmapData.index_performance >= 0 ? '+' : ''}
                                    {heatmapData.index_performance.toFixed(2)}%
                                </Stat.ValueText>
                            </Stat.Root>
                        </Card.Body>
                    </Card.Root>
                    <Card.Root bg="gray.800" borderColor="gray.700">
                        <Card.Body>
                            <Stat.Root>
                                <Stat.Label color="gray.400">Stocks Tracked</Stat.Label>
                                <Stat.ValueText color="white">{heatmapData.stocks.length}</Stat.ValueText>
                            </Stat.Root>
                        </Card.Body>
                    </Card.Root>
                    <Card.Root bg="gray.800" borderColor="gray.700">
                        <Card.Body>
                            <Stat.Root>
                                <Stat.Label color="gray.400">Gainers</Stat.Label>
                                <Stat.ValueText color="green.400">
                                    {heatmapData.stocks.filter(s => s.change_percent > 0).length}
                                </Stat.ValueText>
                            </Stat.Root>
                        </Card.Body>
                    </Card.Root>
                    <Card.Root bg="gray.800" borderColor="gray.700">
                        <Card.Body>
                            <Stat.Root>
                                <Stat.Label color="gray.400">Losers</Stat.Label>
                                <Stat.ValueText color="red.400">
                                    {heatmapData.stocks.filter(s => s.change_percent < 0).length}
                                </Stat.ValueText>
                            </Stat.Root>
                        </Card.Body>
                    </Card.Root>
                </SimpleGrid>
            )}

            {/* Heatmap */}
            <Card.Root bg="gray.800" borderColor="gray.700" mb={6}>
                <Card.Header>
                    <Flex justify="space-between" align="center">
                        <HStack>
                            <Heading size="sm" color="white">Performance Heatmap</Heading>
                            {!loading && heatmapData && (
                                <Badge colorPalette="blue">{selectedPeriod.toUpperCase()}</Badge>
                            )}
                        </HStack>
                        {!loading && heatmapData && (
                            <Text color="gray.500" fontSize="xs">
                                Updated: {new Date(heatmapData.generated_at).toLocaleTimeString()}
                            </Text>
                        )}
                    </Flex>
                </Card.Header>
                <Card.Body>
                    {loading ? (
                        <Flex justify="center" py={20}>
                            <Spinner size="xl" color="blue.400" />
                        </Flex>
                    ) : error ? (
                        <Box textAlign="center" py={10}>
                            <Text color="red.400">{error}</Text>
                        </Box>
                    ) : heatmapData ? (
                        <Heatmap data={heatmapData} />
                    ) : null}
                </Card.Body>
            </Card.Root>

            {/* Top Contributors and Detractors */}
            {!loading && heatmapData && heatmapData.stocks.length > 0 && (
                <SimpleGrid columns={{ base: 1, md: 2 }} gap={6}>
                    <ContributorsList stocks={heatmapData.stocks} type="contributors" />
                    <ContributorsList stocks={heatmapData.stocks} type="detractors" />
                </SimpleGrid>
            )}

            {/* Legend */}
            <Card.Root bg="gray.800" borderColor="gray.700" mt={6}>
                <Card.Body>
                    <VStack gap={3} align="start">
                        <Text color="gray.400" fontSize="sm" fontWeight="bold">How to read this heatmap:</Text>
                        <HStack gap={4} flexWrap="wrap">
                            <HStack>
                                <Box w={4} h={4} bg="green.400" borderRadius="sm" />
                                <Text color="gray.400" fontSize="sm">+3%+</Text>
                            </HStack>
                            <HStack>
                                <Box w={4} h={4} bg="green.600" borderRadius="sm" />
                                <Text color="gray.400" fontSize="sm">+1% to +3%</Text>
                            </HStack>
                            <HStack>
                                <Box w={4} h={4} bg="green.800" borderRadius="sm" />
                                <Text color="gray.400" fontSize="sm">0% to +1%</Text>
                            </HStack>
                            <HStack>
                                <Box w={4} h={4} bg="red.800" borderRadius="sm" />
                                <Text color="gray.400" fontSize="sm">0% to -1%</Text>
                            </HStack>
                            <HStack>
                                <Box w={4} h={4} bg="red.600" borderRadius="sm" />
                                <Text color="gray.400" fontSize="sm">-1% to -3%</Text>
                            </HStack>
                            <HStack>
                                <Box w={4} h={4} bg="red.400" borderRadius="sm" />
                                <Text color="gray.400" fontSize="sm">-3%+</Text>
                            </HStack>
                        </HStack>
                        <Text color="gray.500" fontSize="xs">
                            Cell size is proportional to market cap. Hover over cells for detailed contribution data.
                        </Text>
                    </VStack>
                </Card.Body>
            </Card.Root>
        </Container>
    );
};
