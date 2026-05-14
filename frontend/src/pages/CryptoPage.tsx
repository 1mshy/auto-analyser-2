import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Container,
  Flex,
  HStack,
  Image,
  Input,
  Spinner,
  Table,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Bitcoin, Search } from 'lucide-react';
import { api } from '../api';
import { CryptoAsset } from '../types';
import {
  EmptyState,
  Num,
  PageHeader,
  SignalBadge,
  StatBlock,
  Surface,
} from '../components/ui/primitives';

const REFRESH_INTERVAL_MS = 60_000;

function formatRelative(isoTs: string | undefined): string {
  if (!isoTs) return '—';
  const updated = new Date(isoTs).getTime();
  if (Number.isNaN(updated)) return '—';
  const deltaSec = Math.max(0, Math.round((Date.now() - updated) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const min = Math.floor(deltaSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

const CryptoTableRow: React.FC<{ asset: CryptoAsset }> = ({ asset }) => {
  const tone = asset.price_change_pct_24h > 0
    ? 'up'
    : asset.price_change_pct_24h < 0
      ? 'down'
      : 'neutral';

  return (
    <Table.Row _hover={{ bg: 'bg.muted' }} borderBottomWidth="1px" borderColor="border.subtle">
      <Table.Cell>
        <HStack>
          {asset.image ? (
            <Image
              src={asset.image}
              alt={asset.name}
              boxSize="22px"
              borderRadius="full"
              loading="lazy"
            />
          ) : (
            <Box boxSize="22px" borderRadius="full" bg="bg.muted" />
          )}
          <VStack align="start" gap={0}>
            <Text fontWeight="semibold" color="fg.default">
              {asset.symbol}
            </Text>
            <Text fontSize="xs" color="fg.muted">
              {asset.name}
            </Text>
          </VStack>
        </HStack>
      </Table.Cell>
      <Table.Cell textAlign="right">
        <Num
          value={asset.current_price}
          prefix="$"
          decimals={asset.current_price >= 1 ? 2 : 6}
          color="fg.default"
        />
      </Table.Cell>
      <Table.Cell textAlign="right">
        <Num
          value={asset.price_change_pct_24h}
          intent="auto"
          sign="always"
          suffix="%"
          decimals={2}
          fontWeight="semibold"
        />
      </Table.Cell>
      <Table.Cell textAlign="right">
        <Num
          value={asset.market_cap}
          prefix="$"
          compact
          color="fg.muted"
          fontSize="sm"
        />
      </Table.Cell>
      <Table.Cell textAlign="right">
        <Num
          value={asset.volume_24h}
          prefix="$"
          compact
          color="fg.muted"
          fontSize="sm"
        />
      </Table.Cell>
      <Table.Cell textAlign="right">
        <SignalBadge tone={tone} size="sm">
          24h
        </SignalBadge>
      </Table.Cell>
    </Table.Row>
  );
};

export const CryptoPage: React.FC = () => {
  const [assets, setAssets] = useState<CryptoAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.getCrypto();
        if (!cancelled) {
          setAssets(data);
          setError(null);
        }
      } catch (err) {
        console.error('Failed to fetch crypto:', err);
        if (!cancelled) {
          setError('Failed to load crypto market data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter(
      (a) =>
        a.symbol.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q),
    );
  }, [assets, searchTerm]);

  const stats = useMemo(() => {
    let totalMarketCap = 0;
    let total24hVolume = 0;
    let gainers = 0;
    let losers = 0;
    let latestUpdate: string | undefined;
    for (const a of assets) {
      totalMarketCap += a.market_cap || 0;
      total24hVolume += a.volume_24h || 0;
      if (a.price_change_pct_24h > 0) gainers += 1;
      else if (a.price_change_pct_24h < 0) losers += 1;
      if (!latestUpdate || a.updated_at > latestUpdate) latestUpdate = a.updated_at;
    }
    return { totalMarketCap, total24hVolume, gainers, losers, latestUpdate };
  }, [assets]);

  return (
    <Container maxW="page" py={6}>
      <PageHeader
        icon={<Bitcoin size={20} />}
        title="Crypto"
        subtitle={`Top ${assets.length || 100} assets by market cap · CoinGecko · updated ${formatRelative(stats.latestUpdate)}`}
      />

      <Box mt={4}>
        <Flex
          gap={3}
          mb={4}
          direction={{ base: 'column', md: 'row' }}
          align={{ base: 'stretch', md: 'center' }}
        >
          <StatBlock
            label="Total Market Cap"
            value={stats.totalMarketCap}
            valuePrefix="$"
            valueCompact
            flex={1}
          />
          <StatBlock
            label="24h Volume"
            value={stats.total24hVolume}
            valuePrefix="$"
            valueCompact
            flex={1}
          />
          <StatBlock
            label="Gainers"
            value={stats.gainers}
            valueIntent="up"
            valueDecimals={0}
            flex={1}
          />
          <StatBlock
            label="Losers"
            value={stats.losers}
            valueIntent="down"
            valueDecimals={0}
            flex={1}
          />
        </Flex>

        <Surface p={4}>
          <Flex mb={3} align="center">
            <HStack flex={1} maxW="md">
              <Search size={16} />
              <Input
                placeholder="Search by name, symbol, or id (e.g. bitcoin, BTC)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                size="sm"
              />
            </HStack>
            <Text fontSize="sm" color="fg.muted">
              {filtered.length} of {assets.length} shown
            </Text>
          </Flex>

          {loading ? (
            <Flex justify="center" py={10}>
              <Spinner />
            </Flex>
          ) : error ? (
            <EmptyState
              icon={<Bitcoin size={32} />}
              title="Couldn't load crypto data"
              description={error}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Bitcoin size={32} />}
              title="No matches"
              description={
                assets.length === 0
                  ? 'Crypto cache is empty. Refresh in a few seconds.'
                  : `No crypto assets match "${searchTerm}".`
              }
            />
          ) : (
            <Box overflowX="auto">
              <Table.Root size="sm" variant="line">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>Asset</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Price</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">24h %</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Market Cap</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">24h Volume</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Trend</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filtered.map((asset) => (
                    <CryptoTableRow key={asset.id} asset={asset} />
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          )}
        </Surface>
      </Box>
    </Container>
  );
};
