import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Heading,
  Input,
  SimpleGrid,
  Spinner,
  Table,
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
import { FlaskConical, Play, TrendingUp } from 'lucide-react';
import { PageHeader, Surface, StatBlock, EmptyState, SignalBadge } from '../components/ui/primitives';
import { ConditionBuilder } from '../components/alerts/ConditionBuilder';
import { toaster } from '../components/ui/toaster';
import { api } from '../api';
import {
  BacktestResult,
  BacktestRun,
  BacktestSummary,
  ConditionGroup,
  EXIT_REASON_LABELS,
  Strategy,
  Trade,
  defaultStrategy,
} from '../types';

// --- small formatting helpers ----------------------------------------------

const fmtMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtPct = (n: number) => `${n.toFixed(2)}%`;
const optPct = (n?: number | null) => (n === null || n === undefined ? '—' : fmtPct(n));
const optNum = (n?: number | null, d = 2) =>
  n === null || n === undefined ? '—' : n.toFixed(d);
const shortDate = (iso: string) => (iso ? iso.slice(0, 10) : '');

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
    <Text fontSize="xs" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
      {label}
    </Text>
    <Input
      size="sm"
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

  // Run state.
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<BacktestRun | null>(null);
  const [selected, setSelected] = useState('');
  const [recent, setRecent] = useState<BacktestSummary[]>([]);

  const loadRecent = useCallback(async () => {
    try {
      const list = await api.backtest.list();
      setRecent(Array.isArray(list) ? list : []);
    } catch {
      /* listing is best-effort */
    }
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const num = (s: string, fallback: number) => {
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : fallback;
  };

  const handleRun = async () => {
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

    setRunning(true);
    try {
      const result = await api.backtest.run({
        symbols,
        strategy,
        start_date: startDate ? new Date(startDate).toISOString() : null,
        end_date: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : null,
      });
      setRun(result);
      setSelected(result.results[0]?.symbol || '');
      loadRecent();
    } catch (e: any) {
      toaster.create({ title: 'Backtest failed', description: e.message, type: 'error' });
    } finally {
      setRunning(false);
    }
  };

  const openRun = async (id?: string) => {
    if (!id) return;
    try {
      const r = await api.backtest.get(id);
      setRun(r);
      setSelected(r.results[0]?.symbol || '');
    } catch (e: any) {
      toaster.create({ title: 'Failed to load run', description: e.message, type: 'error' });
    }
  };

  const selectedResult = useMemo(
    () => run?.results.find((r) => r.symbol === selected) || null,
    [run, selected],
  );

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
        <Surface variant="raised" p={4} flex={{ base: '1', xl: '0 0 460px' }}>
          <VStack align="stretch" gap={4}>
            <VStack align="stretch" gap={1}>
              <Text fontSize="xs" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
                Symbols (comma-separated)
              </Text>
              <Input
                size="sm"
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
                <Text fontSize="xs" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
                  Start date
                </Text>
                <Input
                  size="sm"
                  type="date"
                  bg="bg.surface"
                  borderColor="border.subtle"
                  color="fg.default"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </VStack>
              <VStack align="stretch" gap={1}>
                <Text fontSize="xs" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
                  End date
                </Text>
                <Input
                  size="sm"
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
              colorPalette="accent"
              onClick={handleRun}
              loading={running}
              loadingText="Running…"
            >
              <Play size={16} /> Run backtest
            </Button>

            {recent.length > 0 && (
              <Box>
                <Text fontSize="xs" color="fg.muted" textTransform="uppercase" letterSpacing="wide" mb={2}>
                  Recent runs
                </Text>
                <VStack align="stretch" gap={1}>
                  {recent.slice(0, 8).map((s) => (
                    <HStack
                      key={s._id}
                      justify="space-between"
                      bg="bg.inset"
                      borderWidth="1px"
                      borderColor="border.subtle"
                      borderRadius="md"
                      px={3}
                      py={2}
                      cursor="pointer"
                      _hover={{ bg: 'bg.muted' }}
                      onClick={() => openRun(s._id)}
                    >
                      <VStack align="start" gap={0}>
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
                  ))}
                </VStack>
              </Box>
            )}
          </VStack>
        </Surface>

        {/* ----- Results ----- */}
        <Box flex="1" minW={0}>
          {running ? (
            <Surface variant="raised" p={10}>
              <VStack gap={3}>
                <Spinner color="accent.solid" />
                <Text color="fg.muted">Fetching history and simulating…</Text>
              </VStack>
            </Surface>
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
          <StatBlock label="Trades" value={s.trade_count} bare />
          <StatBlock label="Avg win rate" value={s.win_rate_pct} valueSuffix="%" valueDecimals={1} bare />
          <StatBlock label="Worst drawdown" value={s.max_drawdown_pct} valueSuffix="%" valueDecimals={2} bare />
        </SimpleGrid>
      </Surface>

      {/* Symbol selector */}
      {run.results.length > 1 && (
        <HStack gap={2} flexWrap="wrap">
          {run.results.map((r) => (
            <Button
              key={r.symbol}
              size="xs"
              variant={r.symbol === selected ? 'subtle' : 'ghost'}
              colorPalette={r.symbol === selected ? 'accent' : 'gray'}
              onClick={() => onSelect(r.symbol)}
            >
              {r.symbol}
              {r.error ? ' ⚠' : ''}
            </Button>
          ))}
        </HStack>
      )}

      {result && <SymbolResult result={result} />}
    </VStack>
  );
};

const SymbolResult: React.FC<{ result: BacktestResult }> = ({ result }) => {
  if (result.error) {
    return (
      <EmptyState
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
        <StatBlock label="CAGR" value={optPct(m.cagr_pct)} />
        <StatBlock label="Final equity" value={fmtMoney(result.final_equity)} />
        <StatBlock label="Max drawdown" value={m.max_drawdown_pct} valueSuffix="%" valueDecimals={2} />
        <StatBlock label="Win rate" value={m.win_rate_pct} valueSuffix="%" valueDecimals={1} />
        <StatBlock label="Profit factor" value={optNum(m.profit_factor)} />
        <StatBlock label="Sharpe (ann.)" value={optNum(m.sharpe_ratio)} />
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
        <TradeTable trades={result.trades} />
      </Surface>
    </VStack>
  );
};

const EquityChart: React.FC<{ result: BacktestResult }> = ({ result }) => {
  const data = useMemo(
    () => result.equity_curve.map((p) => ({ date: shortDate(p.date), equity: p.equity })),
    [result],
  );
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
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chakra-colors-border-subtle)" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} stroke="var(--chakra-colors-fg-subtle)" />
          <YAxis
            tick={{ fontSize: 11 }}
            width={64}
            domain={['auto', 'auto']}
            stroke="var(--chakra-colors-fg-subtle)"
            tickFormatter={(v: number) => `$${Math.round(v).toLocaleString()}`}
          />
          <Tooltip
            formatter={(v: number) => [fmtMoney(v), 'Equity']}
            contentStyle={{ fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="equity"
            stroke="var(--chakra-colors-accent-solid)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
};

type SortKey = 'entry_date' | 'return_pct' | 'bars_held' | 'pnl';

const TradeTable: React.FC<{ trades: Trade[] }> = ({ trades }) => {
  const [sortKey, setSortKey] = useState<SortKey>('entry_date');
  const [asc, setAsc] = useState(true);

  const sorted = useMemo(() => {
    const copy = [...trades];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'entry_date') cmp = a.entry_date.localeCompare(b.entry_date);
      else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return asc ? cmp : -cmp;
    });
    return copy;
  }, [trades, sortKey, asc]);

  if (trades.length === 0) {
    return (
      <Box px={4} pb={4}>
        <Text color="fg.muted" fontSize="sm">
          No trades were taken with this strategy.
        </Text>
      </Box>
    );
  }

  const toggle = (k: SortKey) => {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(true);
    }
  };

  const Header: React.FC<{ k?: SortKey; label: string; align?: 'start' | 'end' }> = ({
    k,
    label,
    align = 'start',
  }) => (
    <Table.ColumnHeader
      color="fg.muted"
      fontSize="xs"
      textTransform="uppercase"
      textAlign={align === 'end' ? 'right' : 'left'}
      cursor={k ? 'pointer' : 'default'}
      onClick={k ? () => toggle(k) : undefined}
      userSelect="none"
    >
      {label}
      {k && sortKey === k ? (asc ? ' ▲' : ' ▼') : ''}
    </Table.ColumnHeader>
  );

  return (
    <Box overflowX="auto" maxH="420px" overflowY="auto">
      <Table.Root size="sm">
        <Table.Header bg="bg.inset" position="sticky" top={0} zIndex={1}>
          <Table.Row>
            <Header k="entry_date" label="Entry" />
            <Header label="Exit" />
            <Header k="return_pct" label="Return" align="end" />
            <Header k="pnl" label="P&L" align="end" />
            <Header k="bars_held" label="Bars" align="end" />
            <Header label="Reason" />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {sorted.map((t, i) => (
            <Table.Row key={i}>
              <Table.Cell>
                <Text fontSize="xs" color="fg.default">
                  {shortDate(t.entry_date)}
                </Text>
                <Text fontSize="xs" color="fg.subtle">
                  ${t.entry_price.toFixed(2)}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <Text fontSize="xs" color="fg.default">
                  {shortDate(t.exit_date)}
                </Text>
                <Text fontSize="xs" color="fg.subtle">
                  ${t.exit_price.toFixed(2)}
                </Text>
              </Table.Cell>
              <Table.Cell textAlign="right">
                <Text fontSize="sm" color={t.return_pct >= 0 ? 'signal.up.fg' : 'signal.down.fg'}>
                  {fmtPct(t.return_pct)}
                </Text>
              </Table.Cell>
              <Table.Cell textAlign="right">
                <Text fontSize="sm" color={t.pnl >= 0 ? 'signal.up.fg' : 'signal.down.fg'}>
                  {fmtMoney(t.pnl)}
                </Text>
              </Table.Cell>
              <Table.Cell textAlign="right">
                <Text fontSize="sm" color="fg.default">
                  {t.bars_held}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <SignalBadge tone="neutral" size="xs">
                  {EXIT_REASON_LABELS[t.exit_reason]}
                </SignalBadge>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
};

export default Backtest;
