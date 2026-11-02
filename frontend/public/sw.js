/* Auto Analyser production service worker.
 * - App navigations: network first, canonical index.html only as offline fallback.
 * - Vite fingerprinted assets: cache first (the URL changes with the content).
 * - Market data, mutations, dev modules, and unrelated HTML: never intercept.
 * Vite copies this file from public/ to build/ unchanged.
 */
const CACHE_VERSION = 'aa-v3';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const SHELL_URLS = ['/index.html', '/manifest.json', '/favicon.ico', '/logo192.png', '/icons/icon-192.png', '/icons/icon-512.png'];
const CURRENT_CACHES = new Set([SHELL_CACHE, RUNTIME_CACHE]);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_URLS.map(path => new Request(new URL(path, self.location.origin), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('aa-') && !CURRENT_CACHES.has(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isBypassedPath(path) {
  return /^\/(?:api|health|metrics|ws)(?:\/|$)/.test(path)
    || /^\/(?:src|node_modules|@vite|@id|@fs)(?:\/|$)/.test(path)
    || path === '/@react-refresh'
    || path === '/sw.js';
}

function isAppNavigation(request, url) {
  if (request.mode !== 'navigate') return false;
  // A preview or another HTML document must never replace the cached app shell.
  if (/\.html?$/i.test(url.pathname)) return url.pathname === '/index.html';
  // Listing symbols can contain a dot, for example TD.TO and BRK.B.
  return url.pathname === '/' || /^\/stocks\/[^/]+\/?$/.test(url.pathname)
    || !url.pathname.split('/').pop().includes('.');
}

async function storeResponse(cacheName, key, response) {
  // Storage quota/unavailability must not turn a successful request into an error.
  try { await (await caches.open(cacheName)).put(key, response.clone()); } catch { /* optional cache */ }
}

async function readResponse(cacheName, key) {
  try { return await (await caches.open(cacheName)).match(key); } catch { return undefined; }
}

async function appNavigation(request, url) {
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if ((url.pathname === '/' || url.pathname === '/index.html')
      && response.ok && !response.redirected && response.headers.get('content-type')?.includes('text/html')) {
      await storeResponse(SHELL_CACHE, '/index.html', response);
    }
    return response;
  } catch {
    return await readResponse(SHELL_CACHE, '/index.html')
      || new Response('You are offline. Reconnect to load Auto Analyser.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function staticAsset(request) {
  const cached = await readResponse(RUNTIME_CACHE, request);
  if (cached) return cached;
  const response = await fetch(request);
  // nginx's SPA fallback may return HTML for a removed JS/CSS URL. Never cache it.
  if (response.ok && !response.redirected && !response.headers.get('content-type')?.includes('text/html')) {
    await storeResponse(RUNTIME_CACHE, request, response);
  }
  return response;
}

async function shellAsset(request) {
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok && !response.redirected) await storeResponse(SHELL_CACHE, request, response);
    return response;
  } catch (error) {
    const cached = await readResponse(SHELL_CACHE, request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() === 'websocket') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isBypassedPath(url.pathname)) return;

  if (isAppNavigation(request, url)) {
    event.respondWith(appNavigation(request, url));
  } else if (request.mode !== 'navigate' && /^\/assets\/[^/]+-[\w-]{8,}\.(?:js|css|woff2?|png|jpe?g|svg|webp|avif)$/.test(url.pathname)) {
    event.respondWith(staticAsset(request));
  } else if (request.mode !== 'navigate' && SHELL_URLS.includes(url.pathname) && url.pathname !== '/index.html') {
    event.respondWith(shellAsset(request));
  }
});
