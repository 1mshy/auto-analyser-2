import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Heading,
  Input,
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FlaskConical, Play, TrendingUp } from 'lucide-react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  Num,
  PageHeader,
  SectionLabel,
  SignalBadge,
  Skeleton,
  SkeletonRow,
  SkeletonStat,
  StatBlock,
  Surface,
} from '../components/ui/primitives';
import type { DataTableColumn } from '../components/ui/primitives';
import { ConditionBuilder } from '../components/alerts/ConditionBuilder';
import { toaster } from '../components/ui/toaster';
import { api } from '../api';
import { queryKeys, useBacktestRun, useBacktests } from '../queries';
import { fmtMoney, fmtPct, shortDate } from '../format';
import { axisProps, gridProps, seriesColor, tooltipStyles } from '../theme/chartTheme';
import {
  BacktestResult,
  BacktestRun,
  ConditionGroup,
  CreateBacktestInput,
  EXIT_REASON_LABELS,
  Strategy,
  Trade,
  defaultStrategy,
  extractObjectId,
} from '../types';

// A labeled numeric input. `value` is the string state so the field can be
// cleared; empty maps to "unset" for the optional risk knobs.
const NumberField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  step?: string;
}> = ({ label, value, onChange, placeholder, step }) => (
  <VStack align="stretch" gap={1}>
    <SectionLabel>{label}</SectionLabel>
    <Input
      size={{ base: 'md', md: 'sm' }}
      type="number"
      step={step}
      bg="bg.surface"
      borderColor="border.subtle"
      color="fg.default"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  </VStack>
);

export const Backtest: React.FC = () => {
  // Strategy builder state.
  const [symbolsText, setSymbolsText] = useState('AAPL, MSFT');
  const [entry, setEntry] = useState<ConditionGroup>(() => defaultStrategy().entry);
  const [exit, setExit] = useState<ConditionGroup>(() => defaultStrategy().exit);
  const [capital, setCapital] = useState('10000');
  const [posSize, setPosSize] = useState('100');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [maxHold, setMaxHold] = useState('');
  const [commission, setCommission] = useState('0');
  const [slippage, setSlippage] = useState('0');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Which stored run is open and which symbol within it is selected.
  const [openRunId, setOpenRunId] = useState('');
  const [selected, setSelected] = useState('');

  const queryClient = useQueryClient();
  const recentQuery = useBacktests();
  const recent = recentQuery.data ?? [];
  const runQuery = useBacktestRun(openRunId, openRunId !== '');

  const runMutation = useMutation<BacktestRun, Error, CreateBacktestInput>({
    mutationFn: (input: CreateBacktestInput) => api.backtest.run(input),
    onSuccess: (result: BacktestRun) => {
      const id = extractObjectId(result._id);
      if (id) {
        queryClient.setQueryData(queryKeys.backtestRun(id), result);
      }
      setOpenRunId(id || '');
      queryClient.invalidateQueries({ queryKey: queryKeys.backtests });
    },
    onError: (e: Error) => {
      toaster.create({ title: 'Backtest failed', description: e.message, type: 'error' });
    },
  });

  // A fresh run is seeded into the query cache under its id; until an id
  // exists (or when none came back) fall back to the mutation payload.
  const run: BacktestRun | null = openRunId
    ? runQuery.data ?? null
    : runMutation.data ?? null;

  useEffect(() => {
    if (!run) return;
    setSelected((prev) =>
      run.results.some((r) => r.symbol === prev) ? prev : run.results[0]?.symbol || '',
    );
  }, [run]);

  const selectedResult = useMemo(
    () => run?.results.find((r) => r.symbol === selected) || null,
    [run, selected],
  );

  const num = (s: string, fallback: number) => {
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : fallback;
  };

  const handleRun = () => {
    const symbols = symbolsText
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (symbols.length === 0) {
      toaster.create({ title: 'Add at least one symbol', type: 'error' });
      return;
    }

    const strategy: Strategy = {
      entry,
      exit,
      stop_loss_pct: stopLoss.trim() ? num(stopLoss, 0) : null,
      take_profit_pct: takeProfit.trim() ? num(takeProfit, 0) : null,
      max_holding_bars: maxHold.trim() ? Math.max(1, Math.round(num(maxHold, 0))) : null,
      position_size_pct: Math.min(1, Math.max(0, num(posSize, 100) / 100)),
      initial_capital: num(capital, 10000),
      commission_bps: num(commission, 0),
      slippage_bps: num(slippage, 0),
    };

    runMutation.mutate({
      symbols,
      strategy,
      start_date: startDate ? new Date(startDate).toISOString() : null,
      end_date: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : null,
    });
  };

  const resultsLoading = runMutation.isPending || (openRunId !== '' && runQuery.isLoading);

  return (
    <Container maxW="page" py={{ base: 5, md: 8 }}>
      <PageHeader
        eyebrow="Strategy"
        icon={<FlaskConical size={22} />}
        title="Backtest"
        subtitle="Replay a rule-based strategy over historical prices and measure how it would have performed."
      />

      <Flex gap={4} align="stretch" direction={{ base: 'column', xl: 'row' }}>
        {/* ----- Builder ----- */}
        <Surface variant="raised" p={4} flex={{ base: '1', xl: '0 0 460px' }} minW={0}>
          <VStack align="stretch" gap={4}>
            <VStack align="stretch" gap={1}>
              <SectionLabel>Symbols (comma-separated)</SectionLabel>
              <Input
                size={{ base: 'md', md: 'sm' }}
                bg="bg.surface"
                borderColor="border.subtle"
                color="fg.default"
                placeholder="AAPL, MSFT, NVDA"
                value={symbolsText}
                onChange={(e) => setSymbolsText(e.target.value)}
              />
            </VStack>

            <Box>
              <Text fontSize="sm" fontWeight="semibold" color="fg.default" mb={2}>
                Entry conditions
              </Text>
              <ConditionBuilder value={entry} onChange={setEntry} isRoot />
            </Box>

            <Box>
              <Text fontSize="sm" fontWeight="semibold" color="fg.default" mb={2}>
                Exit conditions
              </Text>
              <ConditionBuilder value={exit} onChange={setExit} isRoot />
            </Box>

            <SimpleGrid columns={2} gap={3}>
              <NumberField label="Initial capital ($)" value={capital} onChange={setCapital} />
              <NumberField label="Position size (%)" value={posSize} onChange={setPosSize} />
              <NumberField label="Stop loss (%)" value={stopLoss} onChange={setStopLoss} placeholder="none" />
              <NumberField label="Take profit (%)" value={takeProfit} onChange={setTakeProfit} placeholder="none" />
              <NumberField label="Max holding (bars)" value={maxHold} onChange={setMaxHold} placeholder="none" />
              <NumberField label="Commission (bps)" value={commission} onChange={setCommission} />
              <NumberField label="Slippage (bps)" value={slippage} onChange={setSlippage} />
            </SimpleGrid>

            <SimpleGrid columns={2} gap={3}>
              <VStack align="stretch" gap={1}>
                <SectionLabel>Start date</SectionLabel>
                <Input
                  size={{ base: 'md', md: 'sm' }}
                  type="date"
                  bg="bg.surface"
                  borderColor="border.subtle"
                  color="fg.default"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </VStack>
              <VStack align="stretch" gap={1}>
                <SectionLabel>End date</SectionLabel>
                <Input
                  size={{ base: 'md', md: 'sm' }}
                  type="date"
                  bg="bg.surface"
                  borderColor="border.subtle"
                  color="fg.default"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </VStack>
            </SimpleGrid>

            <Button
              bg="accent.solid"
              color="white"
              _hover={{ bg: 'accent.emphasis' }}
              minH="11"
              onClick={handleRun}
              loading={runMutation.isPending}
              loadingText="Running…"
            >
              <Play size={16} /> Run backtest
            </Button>

            <Box>
              <SectionLabel mb={2}>Recent runs</SectionLabel>
              {recentQuery.isLoading ? (
                <VStack align="stretch" gap={2}>
                  {[0, 1, 2].map((i) => (
                    <SkeletonRow key={i} cols={2} />
                  ))}
                </VStack>
              ) : recentQuery.isError ? (
                <ErrorState
                  title="Couldn't load recent runs"
                  description={recentQuery.error?.message}
                  onRetry={() => recentQuery.refetch()}
                  py={4}
                />
              ) : recent.length === 0 ? (
                <Text fontSize="sm" color="fg.subtle">
                  No saved runs yet.
                </Text>
              ) : (
                <VStack align="stretch" gap={1}>
                  {recent.slice(0, 8).map((s, i) => {
                    const id = extractObjectId(s._id);
                    return (
                      <HStack
                        key={id || i}
                        justify="space-between"
                        bg="bg.inset"
                        borderWidth="1px"
                        borderColor="border.subtle"
                        borderRadius="md"
                        px={3}
                        py={2}
                        minH="11"
                        cursor="pointer"
                        _hover={{ bg: 'bg.muted' }}
                        onClick={() => id && setOpenRunId(id)}
                      >
                        <VStack align="start" gap={0} minW={0}>
                          <Text fontSize="sm" color="fg.default" truncate maxW="220px">
                            {s.label}
                          </Text>
                          <Text fontSize="xs" color="fg.subtle">
                            {shortDate(s.ran_at)} · {s.trade_count} trades
                          </Text>
                        </VStack>
                        <SignalBadge tone={s.total_return_pct >= 0 ? 'up' : 'down'} size="sm">
                          {fmtPct(s.total_return_pct)}
                        </SignalBadge>
                      </HStack>
                    );
                  })}
                </VStack>
              )}
            </Box>
          </VStack>
        </Surface>

        {/* ----- Results ----- */}
        <Box flex="1" minW={0}>
          {resultsLoading ? (
            <VStack align="stretch" gap={3}>
              {runMutation.isPending && (
                <Text fontSize="sm" color="fg.muted">
                  Fetching history and simulating…
                </Text>
              )}
              <ResultsSkeleton />
            </VStack>
          ) : openRunId !== '' && runQuery.isError && !runQuery.data ? (
            <ErrorState
              title="Failed to load run"
              description={runQuery.error?.message}
              onRetry={() => runQuery.refetch()}
            />
          ) : run ? (
            <ResultsPanel
              run={run}
              selected={selected}
              onSelect={setSelected}
              result={selectedResult}
            />
          ) : (
            <EmptyState
              icon={<TrendingUp size={28} />}
              title="No backtest yet"
              description="Build a strategy on the left and run it to see the equity curve, metrics, and trade log."
            />
          )}
        </Box>
      </Flex>
    </Container>
  );
};

// --- Results --------------------------------------------------------------

const ResultsSkeleton: React.FC = () => (
  <VStack align="stretch" gap={4}>
    <Surface variant="raised" p={4}>
      <Skeleton h="4" w="40%" mb={4} />
      <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonStat key={i} />
        ))}
      </SimpleGrid>
    </Surface>
    <Surface variant="raised" p={4}>
      <Skeleton h="4" w="30%" mb={3} />
      <Skeleton h="280px" w="100%" />
    </Surface>
    <Surface variant="raised" p={4}>
      <Skeleton h="4" w="25%" mb={3} />
      <VStack align="stretch" gap={2}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <SkeletonRow key={i} cols={6} />
        ))}
      </VStack>
    </Surface>
  </VStack>
);

const ResultsPanel: React.FC<{
  run: BacktestRun;
  selected: string;
  onSelect: (s: string) => void;
  result: BacktestResult | null;
}> = ({ run, selected, onSelect, result }) => {
  const s = run.summary;
  return (
    <VStack align="stretch" gap={4}>
      {/* Aggregate summary */}
      <Surface variant="raised" p={4}>
        <HStack justify="space-between" mb={3} flexWrap="wrap" gap={2}>
          <Heading size="sm" color="fg.default">
            {run.label}
          </Heading>
          <Text fontSize="xs" color="fg.subtle">
            {s.symbol_count} symbol{s.symbol_count === 1 ? '' : 's'} · {shortDate(run.ran_at)}
          </Text>
        </HStack>
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
          <StatBlock label="Avg total return" value={s.total_return_pct} valueSuffix="%" valueIntent="auto" valueDecimals={2} bare />
          <StatBlock label="Trades" value={s.trade_count} valueDecimals={0} bare />
          <StatBlock label="Avg win rate" value={s.win_rate_pct} valueSuffix="%" valueDecimals={1} bare />
          <StatBlock label="Worst drawdown" value={s.max_drawdown_pct} valueSuffix="%" valueDecimals={2} bare />
        </SimpleGrid>
      </Surface>

      {/* Symbol selector */}
      {run.results.length > 1 && (
        <HStack gap={2} flexWrap="wrap">
          {run.results.map((r) => {
            const isSelected = r.symbol === selected;
            return (
              <Button
                key={r.symbol}
                size="xs"
                minH={{ base: '11', md: '8' }}
                variant={isSelected ? 'subtle' : 'ghost'}
                bg={isSelected ? 'accent.muted' : undefined}
                color={isSelected ? 'accent.fg' : 'fg.muted'}
                _hover={{ bg: isSelected ? 'accent.muted' : 'bg.muted' }}
                onClick={() => onSelect(r.symbol)}
              >
                {r.symbol}
                {r.error ? <AlertTriangle size={12} /> : null}
              </Button>
            );
          })}
        </HStack>
      )}

      {result && <SymbolResult result={result} />}
    </VStack>
  );
};

const SymbolResult: React.FC<{ result: BacktestResult }> = ({ result }) => {
  if (result.error) {
    return (
      <ErrorState
        title={`${result.symbol}: could not simulate`}
        description={result.error}
      />
    );
  }

  const m = result.metrics;
  return (
    <VStack align="stretch" gap={4}>
      <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
        <StatBlock label="Total return" value={m.total_return_pct} valueSuffix="%" valueIntent="auto" valueDecimals={2} />
        <StatBlock label="CAGR" value={m.cagr_pct} valueSuffix="%" valueDecimals={2} />
        <StatBlock label="Final equity" value={result.final_equity} valuePrefix="$" valueDecimals={0} />
        <StatBlock label="Max drawdown" value={m.max_drawdown_pct} valueSuffix="%" valueDecimals={2} />
        <StatBlock label="Win rate" value={m.win_rate_pct} valueSuffix="%" valueDecimals={1} />
        <StatBlock label="Profit factor" value={m.profit_factor} valueDecimals={2} />
        <StatBlock label="Sharpe (ann.)" value={m.sharpe_ratio} valueDecimals={2} />
        <StatBlock label="Exposure" value={m.exposure_pct} valueSuffix="%" valueDecimals={1} />
      </SimpleGrid>

      <Surface variant="raised" p={4}>
        <Text fontSize="sm" fontWeight="semibold" color="fg.default" mb={3}>
          Equity curve — {result.symbol}
        </Text>
        <EquityChart result={result} />
      </Surface>

      <Surface variant="raised" p={0} overflow="hidden">
        <Box px={4} pt={4} pb={2}>
          <Text fontSize="sm" fontWeight="semibold" color="fg.default">
            Trades ({result.trades.length})
          </Text>
        </Box>
        {result.trades.length === 0 ? (
          <Text px={4} pb={4} fontSize="sm" color="fg.subtle">
            This strategy generated no trades.
          </Text>
        ) : (
          <Box px={{ base: 3, md: 0 }} pb={{ base: 3, md: 0 }}>
            <TradeTable trades={result.trades} />
          </Box>
        )}
      </Surface>
    </VStack>
  );
};

// Above this many points the line chart pays for pixels it can't show;
// stride-sample while always keeping the first and last point.
const MAX_CHART_POINTS = 1500;

const EquityChart = React.memo(function EquityChart({ result }: { result: BacktestResult }) {
  const data = useMemo(() => {
    const points = result.equity_curve;
    let sampled = points;
    if (points.length > MAX_CHART_POINTS) {
      const stride = Math.ceil(points.length / MAX_CHART_POINTS);
      sampled = points.filter((_, i) => i % stride === 0 || i === points.length - 1);
    }
    return sampled.map((p) => ({ date: shortDate(p.date), equity: p.equity }));
  }, [result]);
  if (data.length === 0) {
    return (
      <Text color="fg.muted" fontSize="sm">
        No equity data.
      </Text>
    );
  }
  return (
    <Box h="280px" w="100%">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="date" {...axisProps} minTickGap={40} />
          <YAxis
            {...axisProps}
            width={64}
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => fmtMoney(v, 0)}
          />
          <Tooltip
            {...tooltipStyles}
            formatter={(v: number) => [fmtMoney(v, 0), 'Equity']}
          />
          <Line
            type="monotone"
            dataKey="equity"
            stroke={seriesColor(0)}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
});

const tradeColumns: DataTableColumn<Trade>[] = [
  {
    key: 'entry',
    header: 'Entry',
    sortable: true,
    sortValue: (t: Trade) => t.entry_date,
    cell: (t: Trade) => (
      <Box>
        <Text fontSize="xs" color="fg.default">
          {shortDate(t.entry_date)}
        </Text>
        <Num value={t.entry_price} prefix="$" fontSize="xs" color="fg.subtle" />
      </Box>
    ),
  },
  {
    key: 'exit',
    header: 'Exit',
    cell: (t: Trade) => (
      <Box>
        <Text fontSize="xs" color="fg.default">
          {shortDate(t.exit_date)}
        </Text>
        <Num value={t.exit_price} prefix="$" fontSize="xs" color="fg.subtle" />
      </Box>
    ),
  },
  {
    key: 'return_pct',
    header: 'Return',
    numeric: true,
    sortable: true,
    sortValue: (t: Trade) => t.return_pct,
    cell: (t: Trade) => <Num value={t.return_pct} intent="auto" suffix="%" fontSize="sm" />,
  },
  {
    key: 'pnl',
    header: 'P&L',
    numeric: true,
    sortable: true,
    sortValue: (t: Trade) => t.pnl,
    cell: (t: Trade) => <Num value={t.pnl} intent="auto" prefix="$" decimals={0} fontSize="sm" />,
  },
  {
    key: 'bars_held',
    header: 'Bars',
    numeric: true,
    sortable: true,
    sortValue: (t: Trade) => t.bars_held,
    cell: (t: Trade) => (
      <Num value={t.bars_held} decimals={0} fontSize="sm" color="fg.default" />
    ),
  },
  {
    key: 'exit_reason',
    header: 'Reason',
    cell: (t: Trade) => (
      <SignalBadge tone="neutral" size="xs">
        {EXIT_REASON_LABELS[t.exit_reason]}
      </SignalBadge>
    ),
  },
];

const tradeKey = (t: Trade) =>
  `${t.entry_date}|${t.exit_date}|${t.exit_reason}|${t.pnl}`;

const TradeTable: React.FC<{ trades: Trade[] }> = ({ trades }) => (
  <DataTable<Trade>
    columns={tradeColumns}
    rows={trades}
    rowKey={tradeKey}
    defaultSort={{ key: 'entry', desc: false }}
    maxH="420px"
    size="sm"
    renderCard={(t: Trade) => (
      <Surface variant="inset" p={3}>
        <HStack justify="space-between" mb={2} gap={2}>
          <Text fontSize="xs" color="fg.muted">
            {shortDate(t.entry_date)} → {shortDate(t.exit_date)}
          </Text>
          <SignalBadge tone="neutral" size="xs">
            {EXIT_REASON_LABELS[t.exit_reason]}
          </SignalBadge>
        </HStack>
        <HStack justify="space-between" align="end">
          <VStack align="start" gap={0}>
            <SectionLabel>P&L</SectionLabel>
            <HStack gap={2}>
              <Num value={t.pnl} intent="auto" prefix="$" decimals={0} fontSize="sm" fontWeight="semibold" />
              <Num value={t.return_pct} intent="auto" suffix="%" fontSize="xs" />
            </HStack>
          </VStack>
          <VStack align="end" gap={0}>
            <SectionLabel>Held</SectionLabel>
            <Num value={t.bars_held} decimals={0} suffix=" bars" fontSize="sm" color="fg.default" />
          </VStack>
        </HStack>
      </Surface>
    )}
  />
);

export default Backtest;
