// TapRater Service Worker — 2026-02-24-2
const CACHE = 'taprater-v7';

// Only cache truly static assets — NOT index.html.
// index.html is always fetched fresh so code changes show up immediately.
const STATIC = ['./manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Always fetch fresh: the HTML page, API calls, and CDN libraries.
  // This ensures code changes in index.html are never blocked by cache.
  if (
    url.includes('workers.dev') ||
    url.includes('cdn.jsdelivr') ||
    url.includes('index.html') ||
    url.endsWith('/')
  ) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for static assets (icon, manifest)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
