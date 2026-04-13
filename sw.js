/* The Bones Zone — Service Worker
   Caches cover images on first fetch so subsequent visits load instantly.
   Notion S3 URLs contain expiring query params — we strip them for the
   cache key so the stored image is still served even after the URL expires. */

const CACHE_NAME = 'tbz-covers-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  // Only intercept image requests
  if (event.request.destination !== 'image') return;

  const url = new URL(event.request.url);

  // Normalize cache key: strip expiring S3/Notion query params, keep just origin + path
  const cacheKey = new Request(url.origin + url.pathname);

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;

      try {
        const response = await fetch(event.request);
        if (response.ok) {
          cache.put(cacheKey, response.clone());
        }
        return response;
      } catch {
        // Network failed and nothing cached — let it fail naturally
        return new Response('', { status: 503 });
      }
    })
  );
});
