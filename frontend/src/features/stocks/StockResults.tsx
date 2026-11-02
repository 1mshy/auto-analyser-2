import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Button,
  Flex,
  HStack,
  NativeSelect,
  Table,
  Text,
  VStack,
} from '@chakra-ui/react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationInfo, StockAnalysis, StockFilter } from '../../types';
import {
  Num,
  SignalBadge,
  Surface,
  TierBadge,
} from '../../components/ui/primitives';
import {
  STOCK_COLUMNS,
  type StockColumn,
  type WorkspacePreferences,
} from './workspace';

const FLASH_HOLD_MS = 600;

/**
 * Compares the previous render's price/RSI against the current one (rows keep
 * their `symbol` key but swap object identity when a WS merge lands) and
 * returns a `signal.*.muted` background token while the flash is active.
 */
function useChangeFlash(stock: StockAnalysis): string | undefined {
  const prevRef = useRef<{ price: number; rsi?: number | null }>({
    price: stock.price,
    rsi: stock.rsi,
  });
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { price: stock.price, rsi: stock.rsi };

    const priceMoved = stock.price !== prev.price;
    const rsiMoved =
      stock.rsi != null && prev.rsi != null && stock.rsi !== prev.rsi;
    if (!priceMoved && !rsiMoved) return;

    setDirection(
      priceMoved
        ? stock.price > prev.price
          ? 'up'
          : 'down'
        : stock.rsi! > prev.rsi!
          ? 'up'
          : 'down',
    );
    const t = setTimeout(() => setDirection(null), FLASH_HOLD_MS);
    return () => clearTimeout(t);
  }, [stock.price, stock.rsi]);

  if (!direction) return undefined;
  return direction === 'up' ? 'signal.up.muted' : 'signal.down.muted';
}

export const StockCardCompact = React.memo(function StockCardCompact({
  stock,
}: {
  stock: StockAnalysis;
}) {
  const flashBg = useChangeFlash(stock);

  return (
    <Link to={`/stocks/${encodeURIComponent(stock.symbol)}`}>
      <Surface
        interactive
        p={4}
        transitionDuration="slow"
        transitionTimingFunction="ease-out"
        {...(flashBg ? { bg: flashBg } : undefined)}
      >
        <Flex justify="space-between" align="start" mb={2}>
          <VStack align="start" gap={0}>
            <TierBadge marketCap={stock.market_cap} size="sm" />
            <Text
              fontWeight="semibold"
              fontSize="lg"
              color="fg.default"
              letterSpacing="tight"
            >
              {stock.symbol}
            </Text>
          </VStack>
          <VStack align="end" gap={0}>
            <Num
              value={stock.price}
              prefix="$"
              fontWeight="semibold"
              color="fg.default"
            />
            <Num
              value={stock.price_change_percent}
              intent="auto"
              sign="always"
              suffix="%"
              decimals={2}
              fontSize="sm"
              fontWeight="semibold"
            />
          </VStack>
        </Flex>

        <Flex justify="space-between" align="center">
          <HStack gap={2}>
            <SignalBadge
              tone={
                stock.rsi != null && stock.rsi < 30
                  ? 'up'
                  : stock.rsi != null && stock.rsi > 70
                    ? 'down'
                    : 'neutral'
              }
            >
              RSI:{' '}
              <Num
                as="span"
                value={stock.rsi}
                decimals={1}
                color="inherit"
                fontSize="inherit"
              />
            </SignalBadge>
            {stock.macd && (
              <SignalBadge tone={stock.macd.histogram > 0 ? 'info' : 'warn'}>
                MACD: {stock.macd.histogram > 0 ? '+' : '-'}
              </SignalBadge>
            )}
          </HStack>
          <Num
            value={stock.market_cap}
            prefix="$"
            compact
            color="fg.subtle"
            fontSize="xs"
          />
        </Flex>
      </Surface>
    </Link>
  );
});

function StockCell({
  stock,
  column,
}: {
  stock: StockAnalysis;
  column: StockColumn;
}) {
  switch (column) {
    case 'price':
      return <Num value={stock.price} prefix="$" color="fg.default" />;
    case 'change':
      return (
        <Num
          value={stock.price_change_percent}
          intent="auto"
          sign="always"
          suffix="%"
          decimals={2}
          fontWeight="semibold"
        />
      );
    case 'rsi':
      return (
        <SignalBadge
          tone={
            stock.rsi != null && stock.rsi < 30
              ? 'up'
              : stock.rsi != null && stock.rsi > 70
                ? 'down'
                : 'neutral'
          }
        >
          <Num
            as="span"
            value={stock.rsi}
            decimals={1}
            color="inherit"
            fontSize="inherit"
          />
        </SignalBadge>
      );
    case 'marketCap':
      return (
        <Num value={stock.market_cap} prefix="$" compact color="fg.muted" />
      );
    case 'volume':
      return <Num value={stock.volume} compact color="fg.muted" />;
    case 'stochastic':
      return (
        <Num value={stock.stochastic?.k_line} decimals={1} color="fg.muted" />
      );
    case 'bandwidth':
      return (
        <Num value={stock.bollinger?.bandwidth} decimals={4} color="fg.muted" />
      );
    case 'sector':
      return (
        <Text fontSize="sm" color="fg.muted" whiteSpace="nowrap">
          {stock.sector || '—'}
        </Text>
      );
    case 'signals':
      return (
        <HStack gap={1}>
          {stock.is_oversold && (
            <SignalBadge tone="up" size="sm">
              Oversold
            </SignalBadge>
          )}
          {stock.is_overbought && (
            <SignalBadge tone="down" size="sm">
              Overbought
            </SignalBadge>
          )}
          {stock.macd && stock.macd.histogram > 0 && (
            <SignalBadge tone="info" size="sm">
              MACD+
            </SignalBadge>
          )}
          {!stock.is_oversold &&
            !stock.is_overbought &&
            !(stock.macd && stock.macd.histogram > 0) && (
              <Text color="fg.subtle">—</Text>
            )}
        </HStack>
      );
  }
}

const StockRow = React.memo(function StockRow({
  stock,
  columns,
  density,
}: {
  stock: StockAnalysis;
  columns: StockColumn[];
  density: WorkspacePreferences['density'];
}) {
  const flashBg = useChangeFlash(stock);
  return (
    <Table.Row
      bg={flashBg}
      _hover={{ bg: 'bg.muted' }}
      transitionProperty="background-color"
      transitionDuration="slow"
    >
      <Table.Cell
        py={density === 'compact' ? 2 : 3.5}
        position="sticky"
        left={0}
        bg={flashBg ?? 'bg.surface'}
        zIndex={1}
      >
        <Link to={`/stocks/${encodeURIComponent(stock.symbol)}`}>
          <Text
            color="accent.fg"
            fontWeight="semibold"
            _hover={{ textDecoration: 'underline' }}
          >
            {stock.symbol}
          </Text>
        </Link>
      </Table.Cell>
      {columns.map((column) => (
        <Table.Cell
          key={column}
          py={density === 'compact' ? 2 : 3.5}
          textAlign={['sector', 'signals'].includes(column) ? 'left' : 'right'}
          whiteSpace="nowrap"
        >
          <StockCell stock={stock} column={column} />
        </Table.Cell>
      ))}
    </Table.Row>
  );
});

export function StockTable({
  stocks,
  preferences,
  filter,
  onSort,
}: {
  stocks: StockAnalysis[];
  preferences: WorkspacePreferences;
  filter: StockFilter;
  onSort: (field: string) => void;
}) {
  // Keep a predictable financial reading order even when a column is toggled.
  const columns = STOCK_COLUMNS.filter((column) =>
    preferences.columns.includes(column.id),
  );
  return (
    <Surface
      overflow="auto"
      maxH="min(70dvh, 800px)"
      p={0}
      variant="raised"
      role="region"
      aria-label="Scrollable stock results"
      tabIndex={0}
    >
      <Table.Root size="sm" aria-label="Stock screening results">
        <Table.Header bg="bg.inset" position="sticky" top={0} zIndex={2}>
          <Table.Row>
            <Table.ColumnHeader
              position="sticky"
              left={0}
              bg="bg.inset"
              zIndex={2}
              color="fg.muted"
              fontSize="xs"
              py={3}
              minW="110px"
            >
              Symbol
            </Table.ColumnHeader>
            {columns.map((column) => {
              const sort = 'sort' in column ? column.sort : undefined;
              const active = sort && filter.sort_by === sort;
              const align = ['sector', 'signals'].includes(column.id)
                ? 'left'
                : 'right';
              return (
                <Table.ColumnHeader
                  key={column.id}
                  textAlign={align}
                  color="fg.muted"
                  fontSize="xs"
                  whiteSpace="nowrap"
                  aria-sort={
                    active
                      ? filter.sort_order === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  {sort ? (
                    <Button
                      variant="plain"
                      size="xs"
                      h="auto"
                      minH="8"
                      color={active ? 'accent.fg' : 'fg.muted'}
                      onClick={() => onSort(sort)}
                      aria-label={`Sort by ${column.label}${active ? `, currently ${filter.sort_order === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                    >
                      {column.label}
                      {active &&
                        (filter.sort_order === 'asc' ? (
                          <ArrowUp size={12} />
                        ) : (
                          <ArrowDown size={12} />
                        ))}
                    </Button>
                  ) : (
                    column.label
                  )}
                </Table.ColumnHeader>
              );
            })}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {stocks.map((stock) => (
            <StockRow
              key={stock.symbol}
              stock={stock}
              columns={columns.map((column) => column.id)}
              density={preferences.density}
            />
          ))}
        </Table.Body>
      </Table.Root>
    </Surface>
  );
}

export function StockPagination({
  pagination,
  onPageChange,
  onPageSizeChange,
  busy = false,
}: {
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  busy?: boolean;
}) {
  const { page, page_size, total, total_pages } = pagination;
  return (
    <Flex justify="space-between" align="center" wrap="wrap" gap={3} py={4}>
      <HStack gap={3}>
        <Text fontSize="sm" color="fg.muted">
          {total === 0
            ? '0 results'
            : `${((page - 1) * page_size + 1).toLocaleString()}–${Math.min(page * page_size, total).toLocaleString()} of ${total.toLocaleString()}`}
        </Text>
        <NativeSelect.Root size="xs" w="auto" disabled={busy}>
          <NativeSelect.Field
            aria-label="Rows per page"
            value={page_size}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {[25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} rows
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </HStack>
      <HStack gap={2} wrap="wrap">
        <Button
          size="sm"
          variant="outline"
          minH={{ base: '11', md: '9' }}
          disabled={page <= 1 || busy}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={15} />
          Previous
        </Button>
        <Text
          display={{ base: 'block', md: 'none' }}
          color="fg.muted"
          fontSize="sm"
          px={1}
        >
          Page {page} of {Math.max(1, total_pages)}
        </Text>
        <HStack display={{ base: 'none', md: 'flex' }} gap={1}>
          {Array.from(
            { length: Math.min(5, Math.max(1, total_pages)) },
            (_, index) => {
              const first = Math.max(1, Math.min(page - 2, total_pages - 4));
              const target = first + index;
              return (
                <Button
                  key={target}
                  size="sm"
                  minW="8"
                  variant={page === target ? 'solid' : 'ghost'}
                  aria-current={page === target ? 'page' : undefined}
                  aria-label={`Page ${target}`}
                  disabled={busy}
                  onClick={() => onPageChange(target)}
                >
                  {target}
                </Button>
              );
            },
          )}
        </HStack>
        <Button
          size="sm"
          variant="outline"
          minH={{ base: '11', md: '9' }}
          disabled={page >= total_pages || busy}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight size={15} />
        </Button>
      </HStack>
    </Flex>
  );
}
