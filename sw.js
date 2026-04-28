// =====================================================
// Service Worker — SELF-DESTRUCT MODE
// Deletes all caches, unregisters itself, forces every
// visitor to fetch fresh from network. No more stuck cache.
// =====================================================

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // Delete every cache this origin owns
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));

        // Take control of every open page immediately
        await self.clients.claim();

        // Tell every controlled page to reload once with network
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
            client.navigate(client.url).catch(() => null);
        }

        // Unregister self so no future caching happens until we
        // re-introduce a SW with a network-first strategy
        await self.registration.unregister();
    })());
});

self.addEventListener('fetch', (event) => {
    // Always go straight to network — bypass any leftover cache
    event.respondWith(fetch(event.request).catch(() =>
        new Response('', { status: 504, statusText: 'No cache, no network' })
    ));
});
