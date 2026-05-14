/**
 * Responsive helpers — breakpoint constants and a SSR-safe `useIsMobile()` hook.
 *
 * Kept independent of Chakra's responsive system: many existing components use
 * Chakra's `{ base, md, lg }` token syntax for CSS-level responsiveness, but a
 * few JS-level branches (e.g. swapping a horizontal nav for a hamburger
 * drawer) need a boolean, hence this module.
 */
import { useMemo, useSyncExternalStore } from 'react';

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS;

// Mobile = below md (matches Chakra `base` vs `md` cutoff).
export const MOBILE_MEDIA_QUERY = `(max-width: ${BREAKPOINTS.md - 1}px)`;

// SSR-safe: pre-hydration always report `false` (desktop), then the first
// client effect re-evaluates against the real viewport.
const getServerSnapshot = () => false;

export function useMediaQuery(mediaQuery: string): boolean {
  // Memoize per-query so useSyncExternalStore sees stable subscribe/snapshot
  // identities and does not unsubscribe+resubscribe on every render.
  const { subscribe, getSnapshot } = useMemo(() => {
    const supported =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function';
    const mql = supported ? window.matchMedia(mediaQuery) : null;

    const sub = (onStoreChange: () => void) => {
      if (!mql) return () => {};
      // Safari < 14 only supports addListener/removeListener.
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onStoreChange);
        return () => mql.removeEventListener('change', onStoreChange);
      }
      mql.addListener(onStoreChange);
      return () => mql.removeListener(onStoreChange);
    };

    const snap = () => (mql ? mql.matches : false);
    return { subscribe: sub, getSnapshot: snap };
  }, [mediaQuery]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_MEDIA_QUERY);
}
