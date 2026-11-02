import { ChakraProvider } from '@chakra-ui/react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { StockFilter } from '../../types';
import { system } from '../../theme/system';
import { StocksPage } from '../../pages/StocksPage';
import { ScreenerPage } from '../../pages/ScreenerPage';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../queries', () => ({ useFilterStocks: query }));
vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      minMarketCap: null,
      maxPriceChangePercent: null,
      preset: 'all',
    },
  }),
}));
vi.mock('../../contexts/ProgressContext', () => ({
  useProgress: () => ({ progress: null, isConnected: false }),
}));

function Location() {
  return <output data-testid="location">{useLocation().search}</output>;
}
function renderWorkspace(page: 'stocks' | 'screener', url = `/${page}`) {
  return render(
    <ChakraProvider value={system}>
      <MemoryRouter initialEntries={[url]}>
        {page === 'stocks' ? <StocksPage /> : <ScreenerPage />}
        <Location />
      </MemoryRouter>
    </ChakraProvider>,
  );
}
function lastFilter(): StockFilter {
  return query.mock.calls[query.mock.calls.length - 1][0];
}

beforeEach(() => {
  localStorage.clear();
  const stocks: never[] = [];
  query.mockImplementation((filter: StockFilter) => ({
    data: {
      stocks,
      pagination: {
        page: filter.page ?? 1,
        page_size: filter.page_size ?? 50,
        total: 150,
        total_pages: 3,
      },
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }));
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi
      .fn()
      .mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
  });
});
afterEach(cleanup);

it('keeps a symbol search in the URL and allows paging through matching results', async () => {
  renderWorkspace('stocks');
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Search stock symbols' }),
    { target: { value: 'A' } },
  );
  await waitFor(() => expect(lastFilter().symbol_search).toBe('A'));
  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent('symbol_search=A'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(lastFilter()).toMatchObject({ symbol_search: 'A', page: 2 }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove Symbol: A' }));
  await waitFor(() => expect(lastFilter().symbol_search).toBeUndefined());
  expect(lastFilter().page).toBe(1);
});

it('applies every linked filter, and restores search text from a shared link', () => {
  renderWorkspace(
    'stocks',
    '/stocks?symbol_search=BRK.B&min_price=10&min_volume=2000000&sectors=Technology&max_stochastic_k=20&page=2',
  );
  expect(
    screen.getByRole('textbox', { name: 'Search stock symbols' }),
  ).toHaveValue('BRK.B');
  expect(lastFilter()).toMatchObject({
    symbol_search: 'BRK.B',
    min_price: 10,
    min_volume: 2e6,
    sectors: ['Technology'],
    max_stochastic_k: 20,
    page: 2,
  });
});

it('does not apply edited screener conditions during pagination', async () => {
  renderWorkspace('screener', '/screener?max_rsi=30');
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Maximum rsi' }), {
    target: { value: '20' },
  });
  expect(screen.getByText('You have unapplied changes')).toBeInTheDocument();
  expect(lastFilter().max_rsi).toBe(30);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(lastFilter()).toMatchObject({ max_rsi: 30, page: 2 }),
  );
  expect(screen.getByRole('spinbutton', { name: 'Maximum rsi' })).toHaveValue(
    20,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Run screener' }));
  await waitFor(() =>
    expect(lastFilter()).toMatchObject({ max_rsi: 20, page: 1 }),
  );
});

it('prevents a screener request with an inverted range', () => {
  renderWorkspace('screener');
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Minimum rsi' }), {
    target: { value: '80' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Maximum rsi' }), {
    target: { value: '20' },
  });
  expect(screen.getByRole('button', { name: 'Run screener' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Minimum RSI');
  expect(lastFilter().min_rsi).toBeUndefined();
});

it('saves and reapplies an explorer view through the workspace controls', async () => {
  renderWorkspace('stocks', '/stocks?max_rsi=30&sort_by=rsi&sort_order=asc');
  fireEvent.click(screen.getByRole('button', { name: 'Saved views' }));
  fireEvent.change(await screen.findByRole('textbox', { name: 'View name' }), {
    target: { value: 'My low RSI' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save current view' }));
  expect(await screen.findByText('View saved')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove RSI ≤ 30' }));
  expect(lastFilter().max_rsi).toBeUndefined();
  fireEvent.click(screen.getByRole('button', { name: 'Saved views (1)' }));
  fireEvent.click(await screen.findByRole('button', { name: 'My low RSI' }));
  await waitFor(() =>
    expect(lastFilter()).toMatchObject({
      max_rsi: 30,
      sort_by: 'rsi',
      sort_order: 'asc',
      page: 1,
    }),
  );
});
