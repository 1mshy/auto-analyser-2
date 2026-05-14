/* Auto Analyser — minimal service worker
 * Strategy:
 *   - App shell (/, /index.html): cache-first
 *   - Same-origin GETs (JS/CSS/images): cache-first, refill on miss
 *   - /api/*: network-first with cache fallback (short freshness)
 *   - Non-GET (POST/PUT/DELETE) and WebSocket upgrades: never intercept
 * No libraries; CRA copies this file from public/ to build/ unchanged.
 */

const CACHE_VERSION = 'aa-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const API_CACHE = `${CACHE_VERSION}-api`;

const SHELL_URLS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (_err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw _err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok && request.method === 'GET') {
    cache.put(request, fresh.clone());
  }
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Bypass non-GET — never cache POST/PUT/DELETE or WS upgrades.
  if (request.method !== 'GET') return;

  // Same-origin only; let cross-origin (Yahoo, CDNs, etc.) go straight through.
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Skip WebSocket upgrade handshakes (defensive — usually filtered by method/scheme already).
  if (request.headers.get('upgrade') === 'websocket') return;

  if (isApiRequest(url)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (isNavigationRequest(request)) {
    // App-shell navigation: prefer cached index.html for offline, refresh in background.
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match('/index.html');
        const networkFetch = fetch(request)
          .then((resp) => {
            if (resp && resp.ok) cache.put('/index.html', resp.clone());
            return resp;
          })
          .catch(() => null);
        return cached || (await networkFetch) || new Response('Offline', { status: 503 });
      })()
    );
    return;
  }

  event.respondWith(cacheFirst(request, RUNTIME_CACHE));
});
