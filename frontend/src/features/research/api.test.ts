import axios from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../../api';

const input = { symbols: ['AAPL'], question: 'Explain the indicators.' };
afterEach(() => vi.restoreAllMocks());

it('sends a bounded, cancellable request through the application API', async () => {
  const response = {
    success: true,
    answer: 'A source-grounded note.',
    model_used: 'model',
    generated_at: '2026-09-19T00:00:00Z',
    question: input.question,
    sources: [],
    missing_symbols: [],
  };
  const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: response });
  const controller = new AbortController();
  expect(await api.researchStocks(input, controller.signal)).toEqual(response);
  expect(post).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/ai\/research$/),
    input,
    { signal: controller.signal, timeout: 130000 },
  );
});

it('rejects empty answers and exposes server error details', async () => {
  const post = vi.spyOn(axios, 'post');
  post.mockResolvedValueOnce({ data: { success: true, answer: '  ' } });
  await expect(api.researchStocks(input)).rejects.toThrow('empty answer');
  post.mockRejectedValueOnce({
    isAxiosError: true,
    response: {
      data: { success: false, error: 'No analysis found for these symbols.' },
    },
  });
  await expect(api.researchStocks(input)).rejects.toThrow(
    'No analysis found for these symbols.',
  );
});

it('provides a useful timeout error without retrying generation', async () => {
  const post = vi
    .spyOn(axios, 'post')
    .mockRejectedValue({ isAxiosError: true, code: 'ECONNABORTED' });
  await expect(api.researchStocks(input)).rejects.toThrow('timed out');
  expect(post).toHaveBeenCalledOnce();
});
