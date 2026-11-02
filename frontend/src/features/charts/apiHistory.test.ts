import { expect, it, vi } from 'vitest';
import axios from 'axios';
import { api } from '../../api';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));

it('surfaces backend history errors instead of reporting an empty series', async () => {
  vi.mocked(axios.get).mockResolvedValueOnce({
    data: { success: false, error: 'Upstream unavailable' },
  });
  await expect(api.getStockHistory('A/B')).rejects.toThrow(
    'Upstream unavailable',
  );
  expect(axios.get).toHaveBeenCalledWith(
    expect.stringContaining('/api/stocks/A%2FB/history'),
  );
});

it('preserves a successful response with no available history', async () => {
  vi.mocked(axios.get).mockResolvedValueOnce({
    data: { success: true, history: [] },
  });
  await expect(api.getStockHistory('TEST')).resolves.toEqual([]);
});
