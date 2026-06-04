import { QueryClient } from '@tanstack/react-query';

/**
 * Single app-wide query client. Defaults tuned for this app's data shape:
 * - staleTime 120s sits just above the backend list cache TTL (150s) so we don't
 *   hammer the API, while still feeling fresh.
 * - Background revalidation is driven by analysis-cycle completion (see
 *   ProgressContext) and window focus, not aggressive polling.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 120_000,
      gcTime: 600_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
