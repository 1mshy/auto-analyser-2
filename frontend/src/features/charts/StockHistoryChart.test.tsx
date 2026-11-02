import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StockHistoryChart } from './StockHistoryChart';
import { CHART_PREFERENCES_KEY } from './preferences';

const { query } = vi.hoisted(() => ({
  query: {
    data: [] as Array<{
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));
vi.mock('../../queries', () => ({ useStockHistory: () => query }));
// Layout is verified in-browser. Keep actual controls/table mounted in jsdom.
vi.mock('recharts', async () => {
  const { createElement } = await import('react');
  const Chart = ({
    children,
    title,
  }: {
    children?: React.ReactNode;
    title?: string;
  }) => createElement('div', { 'aria-label': title }, children);
  const Empty = () => null;
  return {
    ResponsiveContainer: Chart,
    ComposedChart: Chart,
    LineChart: Chart,
    Bar: Empty,
    CartesianGrid: Empty,
    Cell: Empty,
    Line: Empty,
    ReferenceArea: Empty,
    ReferenceLine: Empty,
    Tooltip: Empty,
    XAxis: Empty,
    YAxis: Empty,
  };
});

beforeEach(() => {
  localStorage.clear();
  query.isLoading = false;
  query.isError = false;
  query.refetch.mockClear();
  query.data = Array.from({ length: 60 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
    open: 100 + i,
    close: 101 + i,
    low: 99 + i,
    high: 102 + i,
    volume: 1000 + i,
  }));
});
afterEach(cleanup);

function mount() {
  return render(
    <ChakraProvider value={defaultSystem}>
      <StockHistoryChart symbol="TEST" currency="USD" />
    </ChakraProvider>,
  );
}

it('changes the visible sessions, exposes their actual data, and persists chart controls', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: '1W' }));
  expect(screen.getByRole('button', { name: '1W' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'RSI (14)' }));
  expect(
    screen.getByLabelText('TEST relative strength index'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '% change' }));
  fireEvent.click(screen.getByRole('button', { name: 'View data' }));
  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('row')).toHaveLength(9);
  expect(within(table).getByText('2026-02-22')).toBeInTheDocument();
  expect(within(table).getByText('2026-03-01')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'CSV' })).toHaveAttribute(
    'download',
    'TEST-1W-history.csv',
  );
  expect(
    JSON.parse(localStorage.getItem(CHART_PREFERENCES_KEY)!),
  ).toMatchObject({ range: '1W', rsi: true, scale: 'percent' });
});

it('provides retry for an error and distinguishes an empty data source', () => {
  query.isError = true;
  query.data = [];
  const view = mount();
  expect(screen.getByText('Price history is unavailable')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /retry/i }));
  expect(query.refetch).toHaveBeenCalledOnce();
  query.isError = false;
  view.rerender(
    <ChakraProvider value={defaultSystem}>
      <StockHistoryChart symbol="TEST" />
    </ChakraProvider>,
  );
  expect(screen.getByText('No daily history available')).toBeInTheDocument();
});
