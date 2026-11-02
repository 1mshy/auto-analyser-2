/// <reference types="node" />
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const ORIGIN = 'https://analyser.example';
const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const html = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/html' } });

function workerHarness() {
  const cacheMaps = new Map<string, Map<string, Response>>();
  const keyFor = (input: string | Request) => new URL(typeof input === 'string' ? input : input.url, ORIGIN).href;
  const fetch = vi.fn(async (_request: unknown, _options?: RequestInit) => html('Network shell'));
  const caches = {
    keys: vi.fn(async () => [...cacheMaps.keys()]),
    delete: vi.fn(async (key: string) => cacheMaps.delete(key)),
    open: vi.fn(async (name: string) => {
      if (!cacheMaps.has(name)) cacheMaps.set(name, new Map());
      const entries = cacheMaps.get(name)!;
      return {
        match: vi.fn(async (key: string | Request) => entries.get(keyFor(key))?.clone()),
        put: vi.fn(async (key: string | Request, response: Response) => { entries.set(keyFor(key), response.clone()); }),
        addAll: vi.fn(async (requests: Request[]) => {
          for (const request of requests) entries.set(keyFor(request), (await fetch(request)).clone());
        }),
      };
    }),
  };
  const handlers = new Map<string, (event: any) => void>();
  const self = {
    location: { origin: ORIGIN },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
    addEventListener: (name: string, handler: (event: any) => void) => { handlers.set(name, handler); },
  };
  runInNewContext(source, { self, caches, fetch, Request, Response, URL, Set });
  return {
    caches, fetch, self,
    async lifecycle(name: 'install' | 'activate') {
      const pending: Promise<unknown>[] = [];
      handlers.get(name)!({ waitUntil: (promise: Promise<unknown>) => pending.push(promise) });
      await Promise.all(pending);
    },
    request(path: string, options: { method?: string; mode?: string; headers?: Record<string, string> } = {}) {
      let response: Promise<Response> | undefined;
      const request = { url: new URL(path, ORIGIN).href, method: options.method ?? 'GET', mode: options.mode ?? 'navigate', headers: new Headers(options.headers) };
      handlers.get('fetch')!({ request, respondWith: (promise: Promise<Response>) => { response = promise; } });
      return response;
    },
  };
}

describe('production service worker', () => {
  it('serves fresh navigation HTML instead of the cached old build', async () => {
    const worker = workerHarness();
    const cache = await worker.caches.open('aa-v3-shell');
    await cache.put('/index.html', html('Old build'));
    worker.fetch.mockResolvedValue(html('New build'));
    expect(await (await worker.request('/'))!.text()).toBe('New build');
    expect(await (await cache.match('/index.html'))!.text()).toBe('New build');
    expect(worker.fetch).toHaveBeenCalledWith(expect.objectContaining({ url: `${ORIGIN}/` }), { cache: 'no-cache' });
  });

  it('cannot poison the shell with preview HTML or an arbitrary route response', async () => {
    const worker = workerHarness();
    const cache = await worker.caches.open('aa-v3-shell');
    await cache.put('/index.html', html('Real app shell'));
    expect(worker.request('/.chart-preview.html')).toBeUndefined();
    expect(worker.request('/report.HTML')).toBeUndefined();
    expect(worker.fetch).not.toHaveBeenCalled();
    worker.fetch.mockResolvedValue(html('Route-specific document'));
    expect(await (await worker.request('/stocks/AAPL'))!.text()).toBe('Route-specific document');
    expect(await (await cache.match('/index.html'))!.text()).toBe('Real app shell');
    worker.fetch.mockRejectedValue(new TypeError('Offline'));
    expect(await (await worker.request('/stocks/TD.TO'))!.text()).toBe('Real app shell');
  });

  it('bypasses APIs, health, metrics, websockets, and development requests even offline', async () => {
    const worker = workerHarness();
    const cache = await worker.caches.open('aa-v2-api');
    await cache.put('/api/stocks', new Response('["stale prices"]'));
    worker.fetch.mockRejectedValue(new TypeError('Offline'));
    for (const path of ['/api', '/api/stocks', '/health', '/metrics', '/ws', '/src/index.tsx', '/@vite/client', '/@react-refresh', '/@id/module', '/@fs/tmp/file.js', '/node_modules/.vite/deps/react.js', '/sw.js']) {
      expect(worker.request(path, { headers: { accept: 'text/html' } })).toBeUndefined();
    }
    expect(worker.request('/assets/index-abcdefgh.js', { method: 'POST', mode: 'cors' })).toBeUndefined();
    expect(worker.request('https://other.example/')).toBeUndefined();
    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it('caches fingerprinted build assets, but never nginx HTML returned for a missing asset', async () => {
    const worker = workerHarness();
    worker.fetch.mockResolvedValue(new Response('export default 1;', { headers: { 'Content-Type': 'text/javascript' } }));
    await worker.request('/assets/index-abcdefgh.js', { mode: 'cors' });
    worker.fetch.mockRejectedValue(new TypeError('Offline'));
    expect(await (await worker.request('/assets/index-abcdefgh.js', { mode: 'cors' }))!.text()).toBe('export default 1;');
    worker.fetch.mockResolvedValue(html('SPA fallback'));
    await worker.request('/assets/missing-12345678.js', { mode: 'cors' });
    expect(await (await worker.caches.open('aa-v3-runtime')).match('/assets/missing-12345678.js')).toBeUndefined();
  });

  it('installs an offline shell and removes only outdated app caches on activation', async () => {
    const worker = workerHarness();
    await worker.caches.open('aa-v2-shell');
    await worker.caches.open('aa-v2-api');
    await worker.caches.open('other-app-cache');
    await worker.lifecycle('install');
    expect(await (await worker.caches.open('aa-v3-shell')).match('/index.html')).toBeDefined();
    expect(worker.fetch.mock.calls.every(([request]) => (request as Request).cache === 'reload')).toBe(true);
    await worker.lifecycle('activate');
    expect(await worker.caches.keys()).toEqual(expect.arrayContaining(['aa-v3-shell', 'other-app-cache']));
    expect(await worker.caches.keys()).not.toContain('aa-v2-api');
    expect(await worker.caches.keys()).not.toContain('aa-v2-shell');
    expect(worker.self.clients.claim).toHaveBeenCalled();
    worker.fetch.mockRejectedValue(new TypeError('Offline'));
    expect(await (await worker.request('/stocks'))!.text()).toBe('Network shell');
  });
});
