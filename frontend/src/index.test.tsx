import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-dom/client', () => ({ default: { createRoot: vi.fn(() => ({ render: vi.fn() })) } }));
vi.mock('./App', () => ({ default: () => null }));
vi.mock('./components/ui/provider', () => ({ Provider: () => null }));
vi.mock('./components/ui/toaster', () => ({ Toaster: () => null }));

const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (originalServiceWorker) Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
  else Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('service worker lifecycle at app startup', () => {
  it('registers only in production and does not clear existing caches', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    const register = vi.fn().mockResolvedValue({});
    const getRegistrations = vi.fn();
    const keys = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register, getRegistrations } });
    vi.stubGlobal('caches', { keys });
    await import('./index');
    expect(register).toHaveBeenCalledExactlyOnceWith('/sw.js', { updateViaCache: 'none' });
    expect(getRegistrations).not.toHaveBeenCalled();
    expect(keys).not.toHaveBeenCalled();
  });

  it('in development unregisters only this origin’s app worker and deletes only app caches', async () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('DEV', true);
    const own = { active: { scriptURL: `${window.location.origin}/sw.js` }, unregister: vi.fn().mockResolvedValue(true) };
    const ownWaiting = { waiting: { scriptURL: `${window.location.origin}/sw.js?v=2` }, unregister: vi.fn().mockResolvedValue(true) };
    const otherPath = { active: { scriptURL: `${window.location.origin}/another-app/sw.js` }, unregister: vi.fn() };
    const otherOrigin = { active: { scriptURL: 'https://other.example/sw.js' }, unregister: vi.fn() };
    const register = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      register, getRegistrations: vi.fn().mockResolvedValue([own, ownWaiting, otherPath, otherOrigin]),
    } });
    const removeCache = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue(['aa-v2-shell', 'aa-v2-api', 'another-app']), delete: removeCache });
    await import('./index');
    await waitFor(() => expect(own.unregister).toHaveBeenCalledOnce());
    expect(ownWaiting.unregister).toHaveBeenCalledOnce();
    expect(otherPath.unregister).not.toHaveBeenCalled();
    expect(otherOrigin.unregister).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(removeCache.mock.calls.map(([name]) => name)).toEqual(['aa-v2-shell', 'aa-v2-api']);
  });
});
