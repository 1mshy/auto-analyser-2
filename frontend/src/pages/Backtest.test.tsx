import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Backtest } from './Backtest';
import { api } from '../api';
import type { BacktestRun } from '../types';

// CRA's Jest (v27) resolver can't follow Chakra v3 → @ark-ui/react package
// `exports` subpaths, so importing the real @chakra-ui/react throws at load.
// Mock it with DOM passthroughs: this still mounts the *real* Backtest
// component (state, handlers, query/mutation wiring, ConditionBuilder logic,
// DataTable) — only the visual primitives are stubbed.
jest.mock('@chakra-ui/react', () => {
  const ReactLib = require('react');
  const KEEP = new Set([
    'onClick', 'onChange', 'onInput', 'onBlur', 'value', 'defaultValue',
    'placeholder', 'type', 'step', 'disabled', 'role', 'id', 'name', 'title',
    'checked', 'htmlFor', 'aria-label', 'data-testid',
  ]);
  const hostFor = (name: string) => {
    const base = String(name).split('.').pop();
    if (base === 'Button' || base === 'IconButton' || base === 'button') return 'button';
    if (base === 'Input') return 'input';
    if (base === 'Textarea') return 'textarea';
    if (base === 'Field') return 'select';
    return 'div';
  };
  const makeComponent = (name: string) => {
    const host = hostFor(name);
    const C = ReactLib.forwardRef(({ children, ...props }: any, ref: any) => {
      const filtered: any = { ref };
      for (const k of Object.keys(props)) if (KEEP.has(k)) filtered[k] = props[k];
      if (host === 'input') return ReactLib.createElement(host, filtered);
      return ReactLib.createElement(host, filtered, children);
    });
    C.displayName = String(name);
    return C;
  };
  const cache = new Map<string, any>();
  const handler: ProxyHandler<any> = {
    get(_t, prop: any) {
      if (prop === '__esModule') return true;
      if (typeof prop === 'symbol') return undefined;
      if (!cache.has(prop)) {
        if (prop === 'createToaster') {
          cache.set(prop, () => ({ create: () => {}, dismiss: () => {}, remove: () => {} }));
        } else if (['createSystem', 'defineConfig', 'mergeConfigs'].includes(prop)) {
          cache.set(prop, () => ({}));
        } else if (['defaultConfig', 'defaultSystem'].includes(prop)) {
          cache.set(prop, {});
        } else {
          const Component = makeComponent(prop);
          cache.set(
            prop,
            new Proxy(Component, {
              get(target: any, sub: any) {
                if (sub in target) return target[sub];
                if (typeof sub === 'string') {
                  const key = `${String(prop)}.${sub}`;
                  if (!cache.has(key)) cache.set(key, makeComponent(key));
                  return cache.get(key);
                }
                return target[sub];
              },
            }),
          );
        }
      }
      return cache.get(prop);
    },
  };
  return new Proxy({}, handler);
});

// recharts needs ResizeObserver / real layout that jsdom lacks.
jest.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Empty = () => null;
  return {
    ResponsiveContainer: Passthrough,
    LineChart: Passthrough,
    Line: Empty,
    XAxis: Empty,
    YAxis: Empty,
    CartesianGrid: Empty,
    Tooltip: Empty,
  };
});

jest.mock('../api', () => ({
  api: {
    backtest: {
      list: jest.fn().mockResolvedValue([]),
      run: jest.fn(),
      get: jest.fn(),
    },
  },
}));

const fakeRun: BacktestRun = {
  _id: 'abc123',
  label: 'AAPL',
  strategy: {
    entry: { op: 'and', children: [{ op: 'leaf', condition: { type: 'rsi_below', value: 30 } }] },
    exit: { op: 'and', children: [{ op: 'leaf', condition: { type: 'rsi_above', value: 70 } }] },
    position_size_pct: 1,
    initial_capital: 10000,
    commission_bps: 0,
    slippage_bps: 0,
  },
  symbols: ['AAPL'],
  ran_at: '2024-01-10T00:00:00Z',
  summary: {
    _id: 'abc123',
    label: 'AAPL',
    symbols: ['AAPL'],
    ran_at: '2024-01-10T00:00:00Z',
    symbol_count: 1,
    total_return_pct: 12.5,
    trade_count: 1,
    win_rate_pct: 100,
    max_drawdown_pct: 4.2,
    sharpe_ratio: 1.1,
  },
  results: [
    {
      symbol: 'AAPL',
      trades: [
        {
          entry_date: '2024-01-02T00:00:00Z',
          entry_price: 100,
          exit_date: '2024-01-08T00:00:00Z',
          exit_price: 112.5,
          shares: 100,
          return_pct: 12.5,
          pnl: 1250,
          bars_held: 4,
          exit_reason: 'exit_signal',
        },
      ],
      equity_curve: [
        { date: '2024-01-02T00:00:00Z', equity: 10000 },
        { date: '2024-01-08T00:00:00Z', equity: 11250 },
      ],
      metrics: {
        total_return_pct: 12.5,
        cagr_pct: null,
        win_rate_pct: 100,
        avg_win_pct: 12.5,
        avg_loss_pct: null,
        profit_factor: null,
        max_drawdown_pct: 4.2,
        sharpe_ratio: 1.1,
        trade_count: 1,
        winning_trades: 1,
        losing_trades: 0,
        exposure_pct: 80,
      },
      initial_capital: 10000,
      final_equity: 11250,
      bars: 2,
      start_date: '2024-01-02T00:00:00Z',
      end_date: '2024-01-08T00:00:00Z',
      error: null,
    },
  ],
};

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Backtest />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  // CRA's Jest resets mocks between tests, so (re)establish resolved values.
  (api.backtest.list as jest.Mock).mockResolvedValue([]);
  (api.backtest.run as jest.Mock).mockResolvedValue(fakeRun);
  // A successful run seeds the per-id query cache and the run query may
  // background-refetch; serve the same payload.
  (api.backtest.get as jest.Mock).mockResolvedValue(fakeRun);
});

test('renders the builder form', async () => {
  renderPage();
  expect(screen.getByText('Backtest')).toBeInTheDocument();
  expect(screen.getByText('Entry conditions')).toBeInTheDocument();
  expect(screen.getByText('Exit conditions')).toBeInTheDocument();
  // Recent runs come through the useBacktests query on mount.
  await waitFor(() => expect(api.backtest.list as jest.Mock).toHaveBeenCalled());
  expect(await screen.findByText('No saved runs yet.')).toBeInTheDocument();
});

test('submits a backtest and renders results without crashing', async () => {
  renderPage();

  const symbols = screen.getByPlaceholderText('AAPL, MSFT, NVDA');
  fireEvent.change(symbols, { target: { value: 'AAPL' } });

  fireEvent.click(screen.getByRole('button', { name: /run backtest/i }));

  await waitFor(() => expect(api.backtest.run as jest.Mock).toHaveBeenCalled());
  expect(await screen.findByText('Equity curve — AAPL')).toBeInTheDocument();
  expect(await screen.findByText('Final equity')).toBeInTheDocument();

  // Trade log renders through the DataTable primitive: sortable column
  // headers are real buttons, rows carry the formatted trade values.
  expect(screen.getByRole('button', { name: 'Entry' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'P&L' })).toBeInTheDocument();
  expect(screen.getByText('Exit signal')).toBeInTheDocument();
  expect(screen.getByText('$1,250')).toBeInTheDocument();
});

test('a run failure surfaces a toast-path error without rendering results', async () => {
  (api.backtest.run as jest.Mock).mockRejectedValue(new Error('yahoo unavailable'));
  renderPage();

  fireEvent.click(screen.getByRole('button', { name: /run backtest/i }));

  await waitFor(() => expect(api.backtest.run as jest.Mock).toHaveBeenCalled());
  // The empty state stays put; no results panel appears.
  expect(await screen.findByText('No backtest yet')).toBeInTheDocument();
  expect(screen.queryByText('Final equity')).not.toBeInTheDocument();
});
