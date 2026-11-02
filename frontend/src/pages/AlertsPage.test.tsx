import React from 'react';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertsPage } from './AlertsPage';
import { api } from '../api';

vi.mock('../components/ui/toaster', () => ({ toaster: { create: vi.fn() } }));
vi.mock('../api', () => ({
  api: {
    alerts: {
      listWatchlists: vi.fn(),
      listHistory: vi.fn(),
    },
  },
}));

function LocationControls() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output data-testid="location">{location.search}</output>
    <button onClick={() => navigate(-1)}>Browser back</button>
  </>;
}

function renderPage(url: string) {
  return render(
    <ChakraProvider value={defaultSystem}>
      <MemoryRouter initialEntries={[url]}>
        <AlertsPage />
        <LocationControls />
      </MemoryRouter>
    </ChakraProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.alerts.listHistory).mockResolvedValue({
    history: [], pagination: { page: 1, page_size: 100, total: 0, total_pages: 0 },
  });
  vi.mocked(api.alerts.listWatchlists).mockResolvedValue([
    { _id: 'one', name: 'Core', symbols: ['AAPL'], created_at: '', updated_at: '' },
    { _id: 'two', name: 'Research', symbols: ['MSFT'], created_at: '', updated_at: '' },
  ]);
});

afterEach(cleanup);

describe('alerts navigation', () => {
  it('opens the inbox directly and preserves other URL parameters and browser history', async () => {
    renderPage('/alerts?tab=inbox&source=dashboard');
    expect(await screen.findByText('Inbox is empty')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('link', { name: 'Watchlists' }));
    expect(await screen.findByRole('button', { name: 'Open Core watchlist' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('?tab=watchlists&source=dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
    expect(await screen.findByText('Inbox is empty')).toBeInTheDocument();
  });

  it('supports the history alias and defaults unknown sections to watchlists', async () => {
    const view = renderPage('/alerts?tab=history');
    expect(await screen.findByText('Inbox is empty')).toBeInTheDocument();
    view.unmount();
    renderPage('/alerts?tab=unknown');
    expect(await screen.findByRole('button', { name: 'Open Core watchlist' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: 'Watchlists' })).toHaveAttribute('aria-current', 'page');
  });

  it('uses native selection buttons and separate descriptive delete actions', async () => {
    renderPage('/alerts?tab=watchlists');
    const research = await screen.findByRole('button', { name: 'Open Research watchlist' });
    expect(research.tagName).toBe('BUTTON');
    research.focus();
    expect(research).toHaveFocus();
    fireEvent.click(research);
    await waitFor(() => expect(research).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('link', { name: 'MSFT' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Research watchlist' })).not.toContainElement(research);
  });
});
