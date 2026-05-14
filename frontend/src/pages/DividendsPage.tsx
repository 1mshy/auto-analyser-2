import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Container,
  Text,
  Flex,
  HStack,
  VStack,
  Spinner,
  Input,
  Button,
  Table,
  Badge,
} from '@chakra-ui/react';
import { Coins, ArrowUpDown, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { DividendSummary } from '../types';
import {
  Surface,
  Num,
  SignalBadge,
  PageHeader,
  EmptyState,
} from '../components/ui/primitives';

type SortKey =
  | 'symbol'
  | 'trailing_yield_pct'
  | 'five_year_growth_rate_pct'
  | 'payout_frequency'
  | 'next_ex_date'
  | 'next_payment_amount'
  | 'trailing_annual_dividend';

type SortDir = 'asc' | 'desc';

const formatDate = (iso?: string): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch {
    return '—';
  }
};


export const DividendsPage: React.FC = () => {
  const [rows, setRows] = useState<DividendSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minYieldInput, setMinYieldInput] = useState<string>('');
  const [appliedMinYield, setAppliedMinYield] = useState<number | undefined>(
    undefined,
  );
  const [sortKey, setSortKey] = useState<SortKey>('trailing_yield_pct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const load = async (minYield?: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDividends(
        minYield !== undefined ? { min_yield: minYield } : {},
      );
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dividends');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Triggering once on mount; backend lazy-refreshes in background.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onApplyFilter = () => {
    const parsed = parseFloat(minYieldInput);
    const next = Number.isFinite(parsed) ? parsed : undefined;
    setAppliedMinYield(next);
    load(next);
  };

  const onClearFilter = () => {
    setMinYieldInput('');
    setAppliedMinYield(undefined);
    load();
  };

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // null/undefined go to the bottom regardless of direction
      const aMissing = av == null;
      const bMissing = bv == null;
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'symbol' ? 'asc' : 'desc');
    }
  };

  const SortableHeader: React.FC<{ k: SortKey; label: string; align?: 'start' | 'end' }> = ({
    k,
    label,
    align = 'start',
  }) => (
    <Table.ColumnHeader textAlign={align}>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => handleSort(k)}
        px={1}
        color={sortKey === k ? 'fg.default' : 'fg.muted'}
        fontWeight={sortKey === k ? 'semibold' : 'medium'}
      >
        <HStack gap={1}>
          <Text fontSize="xs" textTransform="uppercase" letterSpacing="wider">
            {label}
          </Text>
          <ArrowUpDown size={12} />
        </HStack>
      </Button>
    </Table.ColumnHeader>
  );

  return (
    <Container maxW="container.xl" py={6}>
      <PageHeader
        icon={<Coins size={20} />}
        title="Dividends"
        subtitle="Dividend yield + 5-year growth screener. Sortable; filter by minimum trailing yield."
      />

      <Surface variant="raised" p={4} mb={4}>
        <Flex
          gap={3}
          align={{ base: 'stretch', md: 'center' }}
          direction={{ base: 'column', md: 'row' }}
          wrap="wrap"
        >
          <HStack gap={2} flex="1" minW="220px">
            <Text fontSize="sm" color="fg.muted" whiteSpace="nowrap">
              Min yield %
            </Text>
            <Input
              size="sm"
              value={minYieldInput}
              onChange={e => setMinYieldInput(e.target.value)}
              placeholder="e.g. 3"
              maxW="120px"
              type="number"
              step="0.1"
            />
            <Button size="sm" colorPalette="blue" onClick={onApplyFilter}>
              Apply
            </Button>
            {appliedMinYield !== undefined && (
              <Button size="sm" variant="ghost" onClick={onClearFilter}>
                Clear
              </Button>
            )}
          </HStack>

          <HStack gap={2}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => load(appliedMinYield)}
              disabled={loading}
            >
              <RefreshCw size={14} />
              <Text ml={1}>Refresh</Text>
            </Button>
            <SignalBadge tone="neutral" size="sm">
              {rows.length} symbols
            </SignalBadge>
            {appliedMinYield !== undefined && (
              <SignalBadge tone="warn" size="sm">
                ≥ {appliedMinYield}%
              </SignalBadge>
            )}
          </HStack>
        </Flex>
      </Surface>

      {error && (
        <Surface variant="raised" accent="down" p={4} mb={4}>
          <Text color="red.500" fontSize="sm">
            {error}
          </Text>
        </Surface>
      )}

      {loading ? (
        <Flex justify="center" py={12}>
          <Spinner size="xl" color="accent.solid" />
        </Flex>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<Coins size={44} />}
          title="No dividend data yet"
          description="Dividend data is fetched in the background. Check back in a few minutes."
        />
      ) : (
        <Surface variant="raised" p={0} overflow="hidden">
          <Box overflowX="auto">
            <Table.Root size="sm" variant="line">
              <Table.Header>
                <Table.Row>
                  <SortableHeader k="symbol" label="Symbol" />
                  <SortableHeader k="trailing_yield_pct" label="Yield" align="end" />
                  <SortableHeader
                    k="five_year_growth_rate_pct"
                    label="5y growth"
                    align="end"
                  />
                  <SortableHeader k="payout_frequency" label="Frequency" />
                  <SortableHeader k="next_ex_date" label="Next ex-date" />
                  <SortableHeader
                    k="next_payment_amount"
                    label="Next payment"
                    align="end"
                  />
                  <SortableHeader
                    k="trailing_annual_dividend"
                    label="TTM div"
                    align="end"
                  />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {sorted.map(row => (
                  <Table.Row
                    key={row.symbol}
                    _hover={{ bg: 'bg.subtle' }}
                  >
                    <Table.Cell>
                      <Link to={`/stocks/${row.symbol}`}>
                        <VStack align="start" gap={0}>
                          <Text fontWeight="semibold" color="fg.default">
                            {row.symbol}
                          </Text>
                          {row.company_name && (
                            <Text fontSize="xs" color="fg.muted" lineClamp={1}>
                              {row.company_name}
                            </Text>
                          )}
                        </VStack>
                      </Link>
                    </Table.Cell>
                    <Table.Cell textAlign="end">
                      <Num
                        value={row.trailing_yield_pct}
                        intent={row.trailing_yield_pct >= 4 ? 'up' : 'neutral'}
                        decimals={2}
                        suffix="%"
                        fontWeight="semibold"
                      />
                    </Table.Cell>
                    <Table.Cell textAlign="end">
                      {row.five_year_growth_rate_pct != null ? (
                        <Num
                          value={row.five_year_growth_rate_pct}
                          intent="auto"
                          sign="always"
                          decimals={2}
                          suffix="%"
                        />
                      ) : (
                        <Text color="fg.muted" fontSize="sm">
                          —
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {row.payout_frequency ? (
                        <Badge
                          colorPalette="gray"
                          variant="subtle"
                          size="sm"
                          textTransform="capitalize"
                        >
                          {row.payout_frequency}
                        </Badge>
                      ) : (
                        <Text color="fg.muted" fontSize="sm">
                          —
                        </Text>
                      )}
                      {row.payout_frequency === 'monthly' && (
                        <SignalBadge tone="up" size="sm" ml={2}>
                          12x/yr
                        </SignalBadge>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontSize="sm" color="fg.default">
                        {formatDate(row.next_ex_date)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell textAlign="end">
                      {row.next_payment_amount != null ? (
                        <Num
                          value={row.next_payment_amount}
                          intent="neutral"
                          decimals={4}
                          prefix="$"
                        />
                      ) : (
                        <Text color="fg.muted" fontSize="sm">
                          —
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell textAlign="end">
                      <Num
                        value={row.trailing_annual_dividend}
                        intent="neutral"
                        decimals={4}
                        prefix="$"
                      />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        </Surface>
      )}
    </Container>
  );
};
