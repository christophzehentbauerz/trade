// =====================================================
// Service Worker — Cache-First for static assets,
// Network-First with stale-fallback for API responses.
// =====================================================

const VERSION = 'v3';
const STATIC_CACHE = `btc-static-${VERSION}`;
const API_CACHE = `btc-api-${VERSION}`;

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/analysis-styles.css',
    '/bot-signal.css',
    '/modern.css',
    '/app.js',
    '/live-analysis.js',
    '/bot-signal.js',
    '/bot-trades.js',
    '/live-price.js',
    '/smart-money-strategy.js',
    '/smart-money-signals.js',
    '/backtester.js',
    '/trend-strategy.js',
    '/spot-strategy.js'
];

const API_PATHS = ['/api/'];
const NETWORK_FIRST_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(STATIC_ASSETS).catch(() => null))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== STATIC_CACHE && k !== API_CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

function isApiRequest(url) {
    return API_PATHS.some(p => url.pathname.startsWith(p));
}

async function networkFirst(request) {
    const cache = await caches.open(API_CACHE);
    try {
        const networkPromise = fetch(request);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), NETWORK_FIRST_TIMEOUT_MS)
        );
        const response = await Promise.race([networkPromise, timeoutPromise]);
        if (response && response.ok) {
            cache.put(request, response.clone()).catch(() => null);
        }
        return response;
    } catch (e) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw e;
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
        cache.put(request, response.clone()).catch(() => null);
    }
    return response;
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

    // Skip cross-origin (CDN, Binance WS upgrades, etc.)
    if (url.origin !== self.location.origin) return;

    if (isApiRequest(url)) {
        event.respondWith(networkFirst(request));
    } else {
        event.respondWith(cacheFirst(request).catch(() => fetch(request)));
    }
});
