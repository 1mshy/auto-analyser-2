import React, { useMemo } from 'react';
import { Box, Flex, Heading, HStack, Text, VStack } from '@chakra-ui/react';
import { Users } from 'lucide-react';
import { InsiderTrade } from '../../types';
import {
  DataTable,
  EmptyState,
  ErrorState,
  Num,
  SignalBadge,
  SkeletonRow,
  Surface,
  type DataTableColumn,
  type SignalTone,
} from '../../components/ui/primitives';
import { shortDate } from '../../format';

type InsiderRow = InsiderTrade & { __id: string };

const tradeTone = (transactionType: string): SignalTone => {
  const t = transactionType.toLowerCase();
  if (t.includes('buy') || t.includes('purchase')) return 'up';
  if (t.includes('sell') || t.includes('sale')) return 'down';
  return 'neutral';
};

const columns: DataTableColumn<InsiderRow>[] = [
  {
    key: 'date',
    header: 'Date',
    width: '120px',
    sortable: true,
    sortValue: (r) => r.date ?? null,
    cell: (r) => (
      <Text color="fg.muted" fontSize="sm">
        {shortDate(r.date)}
      </Text>
    ),
  },
  {
    key: 'name',
    header: 'Name',
    cell: (r) => (
      <Text color="fg.default" fontWeight="medium" fontSize="sm">
        {r.insider_name}
      </Text>
    ),
  },
  {
    key: 'relation',
    header: 'Relation',
    width: '120px',
    cell: (r) => (
      <Text color="fg.muted" fontSize="xs">
        {r.relation || '—'}
      </Text>
    ),
  },
  {
    key: 'type',
    header: 'Type',
    align: 'center',
    width: '110px',
    cell: (r) => (
      <SignalBadge tone={tradeTone(r.transaction_type)} size="sm">
        {r.transaction_type}
      </SignalBadge>
    ),
  },
  {
    key: 'shares',
    header: 'Shares',
    numeric: true,
    width: '110px',
    sortable: true,
    sortValue: (r) => r.shares_traded ?? null,
    cell: (r) => <Num value={r.shares_traded} decimals={0} fontSize="sm" />,
  },
  {
    key: 'price',
    header: 'Price',
    numeric: true,
    width: '100px',
    sortable: true,
    sortValue: (r) => r.price ?? null,
    cell: (r) => <Num value={r.price} prefix="$" decimals={2} fontSize="sm" />,
  },
  {
    key: 'held',
    header: 'Held After',
    numeric: true,
    width: '120px',
    cell: (r) => <Num value={r.shares_held} decimals={0} fontSize="sm" color="fg.muted" />,
  },
];

export interface InsidersTabProps {
  trades: InsiderTrade[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export const InsidersTab: React.FC<InsidersTabProps> = ({
  trades,
  isLoading,
  isError,
  onRetry,
}) => {
  const rows = useMemo<InsiderRow[]>(
    () => (trades ?? []).map((trade, idx) => ({ ...trade, __id: String(idx) })),
    [trades]
  );

  return (
    <Surface variant="raised" p={{ base: 4, md: 5 }}>
      <Heading size="md" color="fg.default" mb={4}>
        Insider Trades
      </Heading>
      {isLoading ? (
        <VStack align="stretch" gap={3} py={2}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} cols={6} />
          ))}
        </VStack>
      ) : isError ? (
        <ErrorState
          title="Couldn’t load insider trades"
          description="The insider trades request failed. Retry to fetch it again."
          onRetry={onRetry}
          py={8}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users size={28} />}
          title="No insider trades"
          description="No insider trading data available for this stock."
          py={8}
        />
      ) : (
        <DataTable<InsiderRow>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.__id}
          renderCard={(r) => (
            <Surface variant="flat" p={3}>
              <Flex justify="space-between" align="flex-start" gap={2}>
                <Box minW={0}>
                  <Text color="fg.default" fontWeight="medium" truncate>
                    {r.insider_name}
                  </Text>
                  <Text color="fg.muted" fontSize="xs">
                    {[r.relation, shortDate(r.date)].filter(Boolean).join(' · ')}
                  </Text>
                </Box>
                <SignalBadge tone={tradeTone(r.transaction_type)} size="sm" flexShrink={0}>
                  {r.transaction_type}
                </SignalBadge>
              </Flex>
              <HStack mt={3} gap={5} wrap="wrap">
                <Box>
                  <Text color="fg.subtle" fontSize="xs">
                    Shares
                  </Text>
                  <Num value={r.shares_traded} decimals={0} fontSize="sm" />
                </Box>
                <Box>
                  <Text color="fg.subtle" fontSize="xs">
                    Price
                  </Text>
                  <Num value={r.price} prefix="$" decimals={2} fontSize="sm" />
                </Box>
                <Box>
                  <Text color="fg.subtle" fontSize="xs">
                    Held After
                  </Text>
                  <Num value={r.shares_held} decimals={0} fontSize="sm" />
                </Box>
              </HStack>
            </Surface>
          )}
        />
      )}
    </Surface>
  );
};
