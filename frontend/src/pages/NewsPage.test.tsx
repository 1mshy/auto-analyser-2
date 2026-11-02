import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { NewsPage } from './NewsPage';

vi.mock('../api', () => ({ api: {
  getNews: vi.fn().mockResolvedValue({
    news: [{ symbol: 'TD.TO', title: 'Company announces quarterly results', url: 'https://publisher.example/story', publisher: 'Publisher', sector: 'Financials', ago: '2h ago' }],
    pagination: { page: 1, page_size: 30, total: 1, total_pages: 1 },
  }),
  getSectorPerformance: vi.fn().mockResolvedValue([]),
} }));

function Location() {
  const location = useLocation();
  return <output data-testid="news-location">{location.pathname}</output>;
}

afterEach(cleanup);

it('keeps external article and internal ticker links independent', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <ChakraProvider value={defaultSystem}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/news']}><NewsPage /><Location /></MemoryRouter>
      </QueryClientProvider>
    </ChakraProvider>,
  );
  const article = await screen.findByRole('link', { name: 'Company announces quarterly results' });
  const ticker = screen.getByRole('link', { name: 'TD.TO' });
  expect(article).toHaveAttribute('href', 'https://publisher.example/story');
  expect(article).toHaveAttribute('target', '_blank');
  expect(article).toHaveAttribute('rel', 'noopener noreferrer');
  expect(ticker).toHaveAttribute('href', '/stocks/TD.TO');
  expect(container.querySelector('a a')).toBeNull();
  fireEvent.click(ticker);
  expect(screen.getByTestId('news-location')).toHaveTextContent('/stocks/TD.TO');
});
