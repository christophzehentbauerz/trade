// =====================================================
// Service Worker — NETWORK-FIRST everywhere with cache
// fallback. No more stuck stale cache. Cache only serves
// when the network is dead (offline mode).
// =====================================================

const VERSION = 'v7';
const STATIC_CACHE = `btc-static-${VERSION}`;
const NETWORK_TIMEOUT_MS = 5000;

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // Delete every old cache from previous SW versions
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

async function networkFirst(request) {
    const cache = await caches.open(STATIC_CACHE);
    try {
        const networkPromise = fetch(request);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)
        );
        const response = await Promise.race([networkPromise, timeoutPromise]);
        if (response && response.ok && response.type === 'basic') {
            // Only cache successful same-origin responses
            cache.put(request, response.clone()).catch(() => null);
        }
        return response;
    } catch (e) {
        // Network failed — try cached fallback so the page still loads offline
        const cached = await cache.match(request);
        if (cached) return cached;
        throw e;
    }
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    let url;
    try {
        url = new URL(request.url);
    } catch {
        return;
    }

    // Skip cross-origin requests (CDN, Binance WS, CryptoCompare, CoinGecko, etc.)
    // Browser handles those itself, no SW interference.
    if (url.origin !== self.location.origin) return;

    event.respondWith(networkFirst(request));
});
