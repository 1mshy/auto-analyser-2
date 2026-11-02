import { Link } from 'react-router-dom';
import { Box, Button, HStack, Text } from '@chakra-ui/react';
import { Trash2 } from 'lucide-react';
import { DataTable, Num, SignalBadge } from '../../components/ui/primitives';
import type { DataTableColumn } from '../../components/ui/primitives';
import type { PortfolioHoldingView } from '../../types';
import { fmtCurrency, holdingId, holdingKey } from './model';

function pnlIntent(value: number | null | undefined) {
  if (value == null) return 'neutral' as const;
  return value >= 0 ? ('up' as const) : ('down' as const);
}

export function HoldingsTable({
  holdings,
  onDelete,
  deleting,
}: {
  holdings: PortfolioHoldingView[];
  onDelete: (id: string, label: string) => void;
  deleting: boolean;
}) {
  const columns: DataTableColumn<PortfolioHoldingView>[] = [
    {
      key: 'symbol',
      header: 'Symbol',
      sortable: true,
      sortValue: (row) => row.symbol,
      cell: (row) => (
        <Box minW={0}>
          <HStack gap={2}>
            <Link to={`/stocks/${encodeURIComponent(row.symbol)}`}>
              <Text fontWeight="semibold" _hover={{ color: 'accent.fg' }}>
                {row.symbol}
              </Text>
            </Link>
            {row.is_cdr && (
              <SignalBadge tone="info" fontSize="2xs">
                CDR
              </SignalBadge>
            )}
            {row.source === 'manual' && (
              <SignalBadge tone="neutral" fontSize="2xs">
                Manual
              </SignalBadge>
            )}
          </HStack>
          <Text fontSize="xs" color="fg.muted" truncate maxW="240px">
            {row.description ?? row.market?.sector ?? '—'}
          </Text>
        </Box>
      ),
    },
    {
      key: 'account',
      header: 'Account',
      sortable: true,
      sortValue: (row) => row.account ?? '',
      cell: (row) => (
        <Text fontSize="sm">
          {row.account ?? '—'}
          {row.currency ? (
            <Text as="span" color="fg.subtle">
              {' '}
              · {row.currency}
            </Text>
          ) : null}
        </Text>
      ),
    },
    {
      key: 'quantity',
      header: 'Qty',
      numeric: true,
      sortable: true,
      sortValue: (row) => row.quantity,
      cell: (row) => row.quantity.toLocaleString(),
    },
    {
      key: 'avg_cost',
      header: 'Avg cost',
      numeric: true,
      sortable: true,
      sortValue: (row) => row.avg_cost ?? null,
      cell: (row) => fmtCurrency(row.avg_cost, row.currency),
    },
    {
      key: 'price',
      header: 'Price',
      numeric: true,
      sortable: true,
      sortValue: (row) =>
        row.value_source === 'live' ? row.market?.price ?? null : row.market_price ?? null,
      cell: (row) => (
        <Box>
          <Text fontSize="sm">
            {row.value_source === 'live'
              ? fmtCurrency(row.market?.price, row.currency)
              : fmtCurrency(row.market_price, row.currency)}
          </Text>
          <Text fontSize="2xs" color="fg.subtle">
            {row.value_source === 'live'
              ? 'live'
              : row.value_source === 'import'
                ? 'from file'
                : 'no data'}
          </Text>
        </Box>
      ),
    },
    {
      key: 'value',
      header: 'Value',
      numeric: true,
      sortable: true,
      sortValue: (row) => row.current_value ?? null,
      cell: (row) => fmtCurrency(row.current_value, row.currency),
    },
    {
      key: 'pnl',
      header: 'P&L',
      numeric: true,
      sortable: true,
      sortValue: (row) => row.unrealized_pnl_pct ?? null,
      cell: (row) => (
        <Box>
          <Num
            value={row.unrealized_pnl_pct}
            decimals={1}
            sign="always"
            suffix="%"
            intent={pnlIntent(row.unrealized_pnl_pct)}
            fontSize="sm"
          />
          <Text fontSize="2xs" color="fg.subtle">
            {fmtCurrency(row.unrealized_pnl, row.currency)}
          </Text>
        </Box>
      ),
    },
    {
      key: 'day',
      header: 'Day',
      numeric: true,
      sortable: true,
      sortValue: (row) => row.market?.price_change_percent ?? null,
      cell: (row) => (
        <Num
          value={row.market?.price_change_percent}
          decimals={2}
          sign="always"
          suffix="%"
          intent={pnlIntent(row.market?.price_change_percent)}
          fontSize="sm"
        />
      ),
    },
    {
      key: 'rsi',
      header: 'RSI',
      numeric: true,
      sortable: true,
      sortValue: (row) => row.market?.rsi ?? null,
      cell: (row) => (
        <HStack gap={2} justify="flex-end">
          <Num value={row.market?.rsi} decimals={0} fontSize="sm" />
          {row.market?.is_oversold && (
            <SignalBadge tone="up" fontSize="2xs">
              Oversold
            </SignalBadge>
          )}
          {row.market?.is_overbought && (
            <SignalBadge tone="down" fontSize="2xs">
              Overbought
            </SignalBadge>
          )}
        </HStack>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '48px',
      cell: (row) => {
        const id = holdingId(row);
        if (!id) return null;
        return (
          <Button
            size="xs"
            variant="ghost"
            colorPalette="red"
            aria-label={`Remove ${row.symbol}${row.account ? ` in ${row.account}` : ''}`}
            disabled={deleting}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(id, `${row.symbol}${row.account ? ` · ${row.account}` : ''}`);
            }}
          >
            <Trash2 size={14} />
          </Button>
        );
      },
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={holdings}
      rowKey={(row) => holdingKey(row, holdings.indexOf(row))}
      defaultSort={{ key: 'value', desc: true }}
      size="sm"
    />
  );
}
