import { ChakraProvider } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../../api';
import type { AIResearchInput, AIResearchResponse } from '../../types';
import { system } from '../../theme/system';
import { ResearchDesk } from './ResearchDesk';

vi.mock('../../api', () => ({
  api: { getAIStatus: vi.fn(), researchStocks: vi.fn() },
}));
const status = vi.mocked(api.getAIStatus);
const request = vi.mocked(api.researchStocks);
const makeAnswer = (
  input: AIResearchInput,
  answer = 'The RSI is low, but this does not establish a reversal.',
): AIResearchResponse => ({
  success: true,
  answer,
  model_used: 'test-research-model',
  generated_at: '2026-09-19T10:00:00Z',
  question: input.question,
  sources: [
    {
      symbol: 'AAPL',
      price: 123.45,
      price_change_percent: -1.25,
      rsi: 28.4,
      sma_20: 125,
      sma_50: null,
      sector: 'Technology',
      volume: 2000000,
      market_cap: null,
      analyzed_at: '2026-09-18T20:00:00Z',
    },
  ],
  missing_symbols: ['MISSING'],
});
function mount(url = '/research?symbols=AAPL') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  return render(
    <ChakraProvider value={system}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[url]}>
          <ResearchDesk />
        </MemoryRouter>
      </QueryClientProvider>
    </ChakraProvider>,
  );
}
const questionInput = () =>
  screen.getByRole('textbox', { name: 'What would you like to understand?' });
const symbolInput = () =>
  screen.getByRole('textbox', { name: /Stock symbols/ });
async function ready() {
  await screen.findByText('Model available');
}

beforeEach(() => {
  status.mockResolvedValue({
    enabled: true,
    current_model: 'test-research-model',
    available_models_count: 1,
  });
  request.mockImplementation(async (input) => makeAnswer(input));
});
afterEach(cleanup);

it('prefills and normalizes linked symbols but never requests research before submit', async () => {
  mount('/research?symbols=brk.b,shop.to');
  await ready();
  expect(symbolInput()).toHaveValue('brk.b,shop.to');
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Explain the indicators' }),
  );
  expect((questionInput() as HTMLTextAreaElement).value).toContain(
    'Explain the latest RSI',
  );
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
  await screen.findByRole('heading', { name: 'Research note' });
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0][0]).toMatchObject({
    symbols: ['BRK-B', 'SHOP.TO'],
  });
  expect(request.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
});

it('validates symbol count and syntax, and requires a question', async () => {
  mount('/research');
  await ready();
  expect(screen.getByRole('button', { name: 'Ask AI' })).toBeDisabled();
  fireEvent.change(symbolInput(), {
    target: { value: 'AAPL, MSFT, NVDA, AMD, META' },
  });
  fireEvent.change(questionInput(), {
    target: { value: 'Compare their technical strength.' },
  });
  expect(
    screen.getByText('Choose up to four distinct symbols per question.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ask AI' })).toBeDisabled();
  fireEvent.change(symbolInput(), { target: { value: '<script>' } });
  expect(screen.getByText(/Use valid stock symbols/)).toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
});

it('shows actual answer sources and keeps the answer tied to its submitted question after edits', async () => {
  request.mockImplementation(async (input) =>
    makeAnswer(
      input,
      '**Snapshot analysis.** ![tracking](https://example.com/track.png) <script>bad()</script>',
    ),
  );
  const view = mount();
  await ready();
  fireEvent.change(questionInput(), {
    target: { value: 'Explain this snapshot.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
  await screen.findByRole('heading', { name: 'Research note' });
  expect(screen.getByText('123.45')).toBeInTheDocument();
  expect(screen.getByText('28.4')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'AAPL' })).toHaveAttribute(
    'href',
    '/stocks/AAPL',
  );
  expect(
    screen.getByText(/No stored analysis was available for MISSING/),
  ).toBeInTheDocument();
  expect(
    view.container.querySelector('time[datetime="2026-09-18T20:00:00Z"]'),
  ).not.toBeNull();
  expect(view.container.querySelector('img')).toBeNull();
  expect(view.container.querySelector('script')).toBeNull();
  fireEvent.change(symbolInput(), { target: { value: 'MSFT' } });
  fireEvent.change(questionInput(), {
    target: { value: 'A different question.' },
  });
  expect(screen.getByText('Explain this snapshot.')).toBeInTheDocument();
  expect(
    screen.getByText(/Your current edits have not been submitted/),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'AAPL' })).toBeInTheDocument();
  expect(request).toHaveBeenCalledOnce();
});

it('keeps failures visible and retries the failed question instead of an edited draft', async () => {
  request.mockRejectedValueOnce(new Error('The configured model is busy.'));
  mount();
  await ready();
  fireEvent.change(questionInput(), { target: { value: 'Original question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The configured model is busy.',
  );
  fireEvent.change(questionInput(), { target: { value: 'Edited draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Retry this question' }));
  await screen.findByRole('heading', { name: 'Research note' });
  expect(request.mock.calls[1][0].question).toBe('Original question');
  expect(questionInput()).toHaveValue('Edited draft');
});

it('disables research when the configured model is unavailable', async () => {
  status.mockResolvedValue({ enabled: false, available_models_count: 0 });
  mount();
  await screen.findByText(/AI research is unavailable/);
  fireEvent.change(questionInput(), {
    target: { value: 'Explain the signals.' },
  });
  expect(screen.getByRole('button', { name: 'Ask AI' })).toBeDisabled();
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
  await waitFor(() => expect(status).toHaveBeenCalledTimes(2));
});

it('cancels a request and ignores its late completion after a newer answer', async () => {
  let resolveFirst!: (answer: AIResearchResponse) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
  );
  mount();
  await ready();
  fireEvent.change(questionInput(), { target: { value: 'First question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
  await screen.findByRole('button', { name: 'Cancel request' });
  const firstInput = request.mock.calls[0][0];
  const firstSignal = request.mock.calls[0][1];
  fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
  expect(firstSignal?.aborted).toBe(true);
  expect(
    screen.getByRole('heading', { name: 'Request cancelled' }),
  ).toBeInTheDocument();
  fireEvent.change(questionInput(), { target: { value: 'Second question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
  await screen.findByRole('heading', { name: 'Research note' });
  await act(async () => {
    resolveFirst(makeAnswer(firstInput, 'Stale answer'));
  });
  expect(screen.queryByText('Stale answer')).not.toBeInTheDocument();
  expect(screen.getByRole('article')).toHaveTextContent('Second question');
});

it('aborts an in-flight research request when leaving the page', async () => {
  request.mockImplementationOnce(() => new Promise(() => {}));
  const view = mount();
  await ready();
  fireEvent.change(questionInput(), { target: { value: 'Question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
  await screen.findByRole('button', { name: 'Cancel request' });
  const signal = request.mock.calls[0][1];
  view.unmount();
  expect(signal?.aborted).toBe(true);
});

it('does not claim a model is available when discovery returns no models', async () => {
  status.mockResolvedValue({
    enabled: true,
    current_model: undefined,
    available_models_count: 0,
  });
  mount();
  await screen.findByText(/AI research is unavailable/);
  fireEvent.change(questionInput(), {
    target: { value: 'Explain the indicators.' },
  });
  expect(screen.queryByText('Model available')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ask AI' })).toBeDisabled();
  expect(request).not.toHaveBeenCalled();
});
