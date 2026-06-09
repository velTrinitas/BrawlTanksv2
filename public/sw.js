/**
 * Brawl Tanks Season 2 — Service Worker (FAZA 6e.3)
 *
 * Strategie cache:
 * 1. PRECACHE (install): manifest, icons, favicon - critical PWA bootstrap
 * 2. CACHE-FIRST: images (jpg/png/svg/webp/ico), audio (mp3/ogg/wav)
 *    - Media rzadko sie zmienia, cache-first daje instant load offline
 * 3. NETWORK-FIRST: HTML, JS, CSS (always fresh code)
 *    - Cache as fallback dla offline mode
 *
 * Versioning: CACHE_VERSION = game version. Bump przy kazdym release
 * (auto-purge starego cache w activate event).
 *
 * Skip: non-GET requests, cross-origin (np. Google Fonts CDN sami cache'uja).
 *
 * Lifecycle:
 *   install   → cache.addAll(PRECACHE_URLS) + skipWaiting
 *   activate  → delete old caches + clients.claim
 *   fetch     → strategy per URL pattern (media vs code)
 */

// linie ~25-26 w public/sw.js
const CACHE_VERSION = 'bt-s2-v0.19.0';   // bump z v0.18.7
const RUNTIME_CACHE = 'bt-runtime-v0.19.0';  // bump z v0.18.7

/**
 * Precache list — minimal essentials for PWA bootstrap.
 * Intro slides + audio celowo NOT w precache (lazy: cache-first runtime catches je).
 */
const PRECACHE_URLS = [
    './',
    './manifest.webmanifest',
    './icon-192.png',
    './icon-512.png',
    './apple-touch-icon.png',
    './favicon.png',
];

// === INSTALL: precache critical assets ===
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting()) // Activate immediately on next load
            .catch(err => {
                console.warn('[SW] Precache failed:', err);
            })
    );
});

// === ACTIVATE: purge old caches ===
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== CACHE_VERSION && key !== RUNTIME_CACHE)
                    .map(key => {
                        console.log('[SW] Purging old cache:', key);
                        return caches.delete(key);
                    })
            ))
            .then(() => self.clients.claim())
    );
});

// === FETCH: routing per asset type ===
self.addEventListener('fetch', (event) => {
    const req = event.request;

    // Skip non-GET (POST, etc.)
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Skip cross-origin (e.g. Google Fonts handles its own caching)
    if (url.origin !== self.location.origin) return;

    const path = url.pathname.toLowerCase();
    const isMedia = /\.(jpg|jpeg|png|svg|webp|ico|gif|mp3|ogg|wav|m4a)$/i.test(path);

    if (isMedia) {
        // CACHE-FIRST: media (rarely changes, instant load)
        event.respondWith(cacheFirst(req));
    } else {
        // NETWORK-FIRST: HTML/JS/CSS (always fresh, cache as offline fallback)
        event.respondWith(networkFirst(req));
    }
});

/**
 * Cache-first strategy: serve from cache if exists, else fetch + cache.
 * Used for media (rarely changes).
 */
async function cacheFirst(req) {
    try {
        const cached = await caches.match(req);
        if (cached) return cached;

        const res = await fetch(req);
        if (res.ok) {
            const clone = res.clone();
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(req, clone);
        }
        return res;
    } catch (err) {
        // Network failed AND no cache - return error response
        console.warn('[SW] cacheFirst failed:', req.url, err);
        return new Response('Asset unavailable offline', {
            status: 503,
            statusText: 'Service Unavailable',
        });
    }
}

/**
 * Network-first strategy: try fetch, fallback to cache (offline mode).
 * Used for HTML/JS/CSS (always fresh code when online).
 */
async function networkFirst(req) {
    try {
        const res = await fetch(req);
        if (res.ok) {
            const clone = res.clone();
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(req, clone);
        }
        return res;
    } catch (err) {
        // Network failed - try cache
        const cached = await caches.match(req);
        if (cached) {
            console.log('[SW] Serving from cache (offline):', req.url);
            return cached;
        }
        // Both failed - return offline fallback (root HTML if available)
        const offlineFallback = await caches.match('./');
        if (offlineFallback) return offlineFallback;

        return new Response('Offline and no cached version available.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' },
        });
    }
}

// === MESSAGE: support skipWaiting from client (for update flow) ===
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});