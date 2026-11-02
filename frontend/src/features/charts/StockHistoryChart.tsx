/* Hallmark · pre-emit critique: P5 H4 E4 S5 R5 V4
 * Component: financial chart workspace. Uses the application's shared tokens.
 */
import { useId, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  SimpleGrid,
  Table,
  Text,
} from '@chakra-ui/react';
import { Download, RefreshCw, Table2 } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  EmptyState,
  ErrorState,
  Skeleton,
  Surface,
} from '../../components/ui/primitives';
import { useStockHistory } from '../../queries';
import {
  axisProps,
  chartColors,
  gridProps,
  seriesColor,
} from '../../theme/chartTheme';
import { system } from '../../theme/system';
import {
  historyCsv,
  historySummary,
  prepareHistory,
  scaleHistory,
  selectRange,
  type ChartPoint,
  type ChartRange,
} from './history';
import { useChartPreferences } from './preferences';

const chartMargin = { top: 12, right: 10, left: 0, bottom: 0 };
const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const number = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const formatValue = (value: number | null | undefined) =>
  value == null ? '—' : number.format(value);
const formatDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

function HistoryTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartPoint }>;
  currency?: string;
}) {
  const point = payload?.find((item) => item.payload)?.payload;
  if (!active || !point) return null;
  return (
    <Surface p={3} variant="raised" maxW="240px" role="status">
      <Text fontSize="xs" fontWeight="semibold" mb={2}>
        {point.date} · {currency || 'Quote currency'}
      </Text>
      <SimpleGrid
        columns={2}
        gapX={5}
        gapY={1}
        fontSize="xs"
        fontVariantNumeric="tabular-nums"
      >
        {(
          [
            ['Open', formatValue(point.open)],
            ['High', formatValue(point.high)],
            ['Low', formatValue(point.low)],
            ['Close', formatValue(point.close)],
            [
              'Volume',
              point.volume == null ? '—' : compact.format(point.volume),
            ],
            ['RSI (14)', formatValue(point.rsi)],
            ['SMA 20', formatValue(point.sma20)],
            ['SMA 50', formatValue(point.sma50)],
          ] as const
        ).map(([label, value]) => (
          <Box key={label}>
            <Text color="fg.muted">{label}</Text>
            <Text color="fg.default">{value}</Text>
          </Box>
        ))}
      </SimpleGrid>
    </Surface>
  );
}

export interface StockHistoryChartProps {
  symbol: string;
  currency?: string;
}

/** Daily OHLCV with local overlays; no external chart script or fabricated series. */
export function StockHistoryChart({
  symbol,
  currency,
}: StockHistoryChartProps) {
  const query = useStockHistory(symbol);
  const [preferences, setPreferences] = useChartPreferences();
  const [showTable, setShowTable] = useState(false);
  const chartId = useId();
  // Reset hover coordinates when the domain changes; otherwise a keyboard
  // tooltip can retain its old screen position against the new range.
  const chartRevision = `${chartId}-${preferences.range}-${preferences.scale}`;
  const points = useMemo(() => prepareHistory(query.data ?? []), [query.data]);
  const visible = useMemo(
    () => selectRange(points, preferences.range),
    [points, preferences.range],
  );
  const chartPoints = useMemo(
    () => scaleHistory(visible, preferences.scale),
    [visible, preferences.scale],
  );
  const summary = useMemo(() => historySummary(visible), [visible]);
  const csvHref = useMemo(
    () =>
      `data:text/csv;charset=utf-8,${encodeURIComponent(historyCsv(visible))}`,
    [visible],
  );
  const priceColor = seriesColor(0);
  const xAxis = (
    <XAxis
      dataKey="date"
      scale="point"
      padding={{ left: 10, right: 10 }}
      tickFormatter={formatDate}
      minTickGap={36}
      {...axisProps}
      height={28}
    />
  );
  const commonTooltip = (
    <Tooltip
      content={<HistoryTooltip currency={currency} />}
      cursor={{ stroke: chartColors.axis, strokeDasharray: '3 3' }}
      isAnimationActive={false}
    />
  );

  return (
    <Surface overflow="hidden" aria-labelledby={`${chartId}-title`}>
      <Flex
        align="center"
        justify="space-between"
        p={{ base: 4, md: 5 }}
        gap={3}
        wrap="wrap"
      >
        <Box>
          <Heading as="h2" size="md" color="fg.default" id={`${chartId}-title`}>
            Price history
          </Heading>
          <Text fontSize="xs" color="fg.muted" mt={1}>
            Daily sessions · {currency || 'Prices in quote currency'}
          </Text>
        </Box>
        <HStack
          role="group"
          aria-label="Chart timeframe"
          gap={1}
          bg="bg.inset"
          p={1}
          borderRadius="md"
        >
          {(['1W', '1M', '3M'] as ChartRange[]).map((range) => (
            <Button
              key={range}
              size="xs"
              minH="9"
              px={3}
              variant="ghost"
              aria-pressed={preferences.range === range}
              color={preferences.range === range ? 'fg.default' : 'fg.muted'}
              bg={preferences.range === range ? 'bg.emphasized' : 'transparent'}
              onClick={() => setPreferences((prev) => ({ ...prev, range }))}
            >
              {range}
            </Button>
          ))}
        </HStack>
      </Flex>

      {query.isLoading ? (
        <Box p={5} aria-label="Loading price history">
          <Skeleton h="320px" />
        </Box>
      ) : query.isError && !points.length ? (
        <ErrorState
          title="Price history is unavailable"
          description="Try loading the daily prices again."
          onRetry={() => query.refetch()}
        />
      ) : !summary ? (
        <EmptyState
          title="No daily history available"
          description="The data source has not returned usable prices for this symbol."
          action={
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              <RefreshCw size={14} /> Retry
            </Button>
          }
        />
      ) : (
        <>
          {query.isError && (
            <Text px={5} color="signal.warn.fg" fontSize="sm" role="status">
              Refresh failed. Showing the previously loaded history.
            </Text>
          )}
          <Flex
            px={{ base: 4, md: 5 }}
            pb={4}
            align="end"
            justify="space-between"
            gap={4}
            wrap="wrap"
          >
            <Box>
              <HStack gap={3} wrap="wrap" align="baseline">
                <Text fontSize="2xl" fontWeight="semibold" fontFamily="mono">
                  {formatValue(summary.last.close)}
                </Text>
                <Text
                  color={
                    summary.change >= 0 ? 'signal.up.fg' : 'signal.down.fg'
                  }
                  fontSize="sm"
                  fontFamily="mono"
                >
                  {summary.change >= 0 ? '+' : ''}
                  {summary.changePercent.toFixed(2)}%
                </Text>
              </HStack>
              <Text fontSize="xs" color="fg.muted">
                Last available close · {formatDate(summary.first.date)} –{' '}
                {formatDate(summary.last.date)} · {visible.length} sessions
              </Text>
            </Box>
            <HStack gap={5} fontSize="xs" flexWrap="wrap">
              <Box>
                <Text color="fg.muted">Period low / high</Text>
                <Text fontFamily="mono">
                  {formatValue(summary.low)} / {formatValue(summary.high)}
                </Text>
              </Box>
              <Box>
                <Text color="fg.muted">Avg. volume</Text>
                <Text fontFamily="mono">
                  {summary.averageVolume == null
                    ? '—'
                    : compact.format(summary.averageVolume)}
                </Text>
              </Box>
            </HStack>
          </Flex>

          <Flex
            px={{ base: 3, md: 5 }}
            py={2}
            borderYWidth="1px"
            borderColor="border.subtle"
            gap={2}
            justify="space-between"
            flexWrap="wrap"
          >
            <HStack
              gap={1}
              flexWrap="wrap"
              role="group"
              aria-label="Chart indicators"
            >
              {(
                [
                  ['sma20', 'SMA 20', seriesColor(2)],
                  ['sma50', 'SMA 50', seriesColor(5)],
                  ['volume', 'Volume', undefined],
                  ['rsi', 'RSI (14)', undefined],
                ] as const
              ).map(([key, label, color]) => (
                <Button
                  key={key}
                  size="xs"
                  minH="9"
                  variant="ghost"
                  aria-pressed={preferences[key]}
                  bg={preferences[key] ? 'bg.emphasized' : 'transparent'}
                  color={preferences[key] ? 'fg.default' : 'fg.muted'}
                  onClick={() =>
                    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }))
                  }
                >
                  {color && (
                    <Box
                      as="span"
                      w="3"
                      borderTopWidth="2px"
                      borderTopStyle={key === 'sma50' ? 'dashed' : 'solid'}
                      style={{ borderTopColor: color }}
                    />
                  )}
                  {label}
                </Button>
              ))}
            </HStack>
            <HStack gap={1} role="group" aria-label="Chart price scale">
              {(['price', 'percent'] as const).map((scale) => (
                <Button
                  key={scale}
                  size="xs"
                  minH="9"
                  variant="ghost"
                  aria-pressed={preferences.scale === scale}
                  bg={
                    preferences.scale === scale
                      ? 'bg.emphasized'
                      : 'transparent'
                  }
                  color={
                    preferences.scale === scale ? 'fg.default' : 'fg.muted'
                  }
                  onClick={() => setPreferences((prev) => ({ ...prev, scale }))}
                >
                  {scale === 'price' ? 'Price' : '% change'}
                </Button>
              ))}
            </HStack>
          </Flex>

          <Box px={{ base: 1, md: 3 }} pt={3}>
            <Text px={3} fontSize="xs" color="fg.muted" mb={1}>
              {preferences.scale === 'percent'
                ? 'Change from first visible close (%)'
                : `Closing price${currency ? ` (${currency})` : ''}`}
            </Text>
            <Box h={{ base: '250px', md: '320px' }} minW={0}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart
                  key={chartRevision}
                  data={chartPoints}
                  syncId={chartRevision}
                  margin={chartMargin}
                  accessibilityLayer
                  title={`${symbol} daily closing price`}
                  desc="Use left and right arrow keys to inspect each session, or open the data table below."
                >
                  <CartesianGrid {...gridProps} vertical={false} />
                  {xAxis}
                  <YAxis
                    {...axisProps}
                    orientation="right"
                    width={62}
                    domain={['auto', 'auto']}
                    tickFormatter={(value) =>
                      preferences.scale === 'percent'
                        ? `${value.toFixed(1)}%`
                        : compact.format(value)
                    }
                  />
                  {commonTooltip}
                  {preferences.scale === 'percent' && (
                    <ReferenceLine
                      y={0}
                      stroke={chartColors.axis}
                      strokeDasharray="3 3"
                    />
                  )}
                  <Line
                    type="linear"
                    dataKey="priceValue"
                    name="Close"
                    stroke={priceColor}
                    strokeWidth={2}
                    dot={chartPoints.length === 1}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                  {preferences.sma20 && (
                    <Line
                      type="linear"
                      dataKey="sma20Value"
                      name="SMA 20"
                      stroke={seriesColor(2)}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                  {preferences.sma50 && (
                    <Line
                      type="linear"
                      dataKey="sma50Value"
                      name="SMA 50"
                      stroke={seriesColor(5)}
                      strokeDasharray="5 3"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </Box>

          {preferences.volume && (
            <Box
              px={{ base: 1, md: 3 }}
              pt={3}
              borderTopWidth="1px"
              borderColor="border.subtle"
            >
              <Flex
                px={3}
                fontSize="xs"
                color="fg.muted"
                justify="space-between"
                gap={2}
                wrap="wrap"
              >
                <Text>Volume · shares</Text>
                <Text>Bar color: close versus open</Text>
              </Flex>
              <Box h="120px" minW={0}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <ComposedChart
                    key={chartRevision}
                    data={chartPoints}
                    syncId={chartRevision}
                    margin={chartMargin}
                    accessibilityLayer
                    title={`${symbol} daily trading volume`}
                  >
                    <CartesianGrid {...gridProps} vertical={false} />
                    {xAxis}
                    <YAxis
                      {...axisProps}
                      orientation="right"
                      width={62}
                      tickFormatter={(value) => compact.format(value)}
                      tickCount={3}
                      domain={[0, 'auto']}
                    />
                    {commonTooltip}
                    <Bar
                      dataKey="volume"
                      name="Volume"
                      isAnimationActive={false}
                      maxBarSize={24}
                    >
                      {chartPoints.map((point) => (
                        <Cell
                          key={point.date}
                          fill={system.token.var(
                            point.close >= point.open
                              ? 'colors.signal.up.solid'
                              : 'colors.signal.down.solid',
                          )}
                          fillOpacity={0.65}
                        />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </Box>
            </Box>
          )}

          {preferences.rsi && (
            <Box
              px={{ base: 1, md: 3 }}
              pt={3}
              borderTopWidth="1px"
              borderColor="border.subtle"
            >
              <Flex
                px={3}
                fontSize="xs"
                color="fg.muted"
                justify="space-between"
                gap={2}
                wrap="wrap"
              >
                <Text>RSI (14) · Wilder smoothing</Text>
                <Text>30 oversold / 70 overbought</Text>
              </Flex>
              <Box h="150px" minW={0}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart
                    key={chartRevision}
                    data={chartPoints}
                    syncId={chartRevision}
                    margin={chartMargin}
                    accessibilityLayer
                    title={`${symbol} relative strength index`}
                  >
                    <CartesianGrid {...gridProps} vertical={false} />
                    {xAxis}
                    <YAxis
                      {...axisProps}
                      orientation="right"
                      width={62}
                      domain={[0, 100]}
                      ticks={[0, 30, 70, 100]}
                    />
                    <ReferenceArea
                      y1={30}
                      y2={70}
                      fill={seriesColor(5)}
                      fillOpacity={0.05}
                    />
                    <ReferenceLine
                      y={30}
                      stroke={chartColors.axis}
                      strokeDasharray="3 3"
                    />
                    <ReferenceLine
                      y={70}
                      stroke={chartColors.axis}
                      strokeDasharray="3 3"
                    />
                    {commonTooltip}
                    <Line
                      type="linear"
                      dataKey="rsi"
                      name="RSI (14)"
                      stroke={seriesColor(5)}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Box>
          )}

          <Flex
            align="center"
            justify="space-between"
            p={{ base: 3, md: 4 }}
            borderTopWidth="1px"
            borderColor="border.subtle"
            gap={3}
            wrap="wrap"
          >
            <Text fontSize="xs" color="fg.muted" flex="1" minW="180px">
              History available: {points.length} daily sessions,{' '}
              {points[0].date} – {points[points.length - 1].date}. Hover or use
              arrow keys to inspect. Indicators need enough prior sessions.
            </Text>
            <HStack gap={1}>
              <Button
                size="xs"
                minH="9"
                variant="ghost"
                color="fg.muted"
                aria-expanded={showTable}
                aria-controls={`${chartId}-data`}
                onClick={() => setShowTable((value) => !value)}
              >
                <Table2 size={14} />
                {showTable ? 'Hide data' : 'View data'}
              </Button>
              <Button
                asChild
                size="xs"
                minH="9"
                variant="ghost"
                color="fg.muted"
              >
                <a
                  href={csvHref}
                  download={`${symbol.replace(/[^a-zA-Z0-9._-]/g, '_')}-${preferences.range}-history.csv`}
                >
                  <Download size={14} /> CSV
                </a>
              </Button>
            </HStack>
          </Flex>
          {showTable && (
            <Box
              id={`${chartId}-data`}
              overflowX="auto"
              maxH="360px"
              borderTopWidth="1px"
              borderColor="border.subtle"
              tabIndex={0}
              role="region"
              aria-label={`${symbol} historical price data`}
            >
              <Table.Root
                size="sm"
                variant="line"
                fontVariantNumeric="tabular-nums"
              >
                <Table.Caption>
                  {symbol} daily history · {visible.length} sessions · prices in{' '}
                  {currency || 'quote currency'}
                </Table.Caption>
                <Table.Header>
                  <Table.Row>
                    {[
                      'Date',
                      'Open',
                      'High',
                      'Low',
                      'Close',
                      'Volume',
                      'SMA 20',
                      'SMA 50',
                      'RSI 14',
                    ].map((label, index) => (
                      <Table.ColumnHeader
                        key={label}
                        whiteSpace="nowrap"
                        textAlign={index ? 'end' : 'start'}
                      >
                        {label}
                      </Table.ColumnHeader>
                    ))}
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {visible.map((row) => (
                    <Table.Row key={row.date}>
                      <Table.Cell whiteSpace="nowrap">{row.date}</Table.Cell>
                      {[row.open, row.high, row.low, row.close].map(
                        (value, i) => (
                          <Table.Cell key={i} textAlign="end">
                            {formatValue(value)}
                          </Table.Cell>
                        ),
                      )}
                      <Table.Cell textAlign="end">
                        {row.volume?.toLocaleString('en-US') ?? '—'}
                      </Table.Cell>
                      {[row.sma20, row.sma50, row.rsi].map((value, i) => (
                        <Table.Cell key={i} textAlign="end">
                          {formatValue(value)}
                        </Table.Cell>
                      ))}
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          )}
        </>
      )}
    </Surface>
  );
}
