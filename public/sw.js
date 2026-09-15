/* Đỗ Gia · service worker.
 * Deliberately narrow: family data is never cached, only the app shell and the
 * content-hashed build assets. A hashed asset can never go stale under its own
 * name, and the shell is fetched network-first so a deploy is picked up at once.
 */
const CACHE = 'coi-shell-v1';
const SHELL = '/';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Ancestors, photos, calendars, sessions: always live, never written to disk here.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        if (fresh.ok) (await caches.open(CACHE)).put(SHELL, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(SHELL)) || new Response(
          '<meta charset="utf-8"><p style="font:16px system-ui;padding:24px">Đỗ Gia cần mạng để mở lần này. Hãy thử lại khi có kết nối.</p>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/') || /\.(png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const hit = await caches.match(request);
      if (hit) return hit;
      const fresh = await fetch(request);
      if (fresh.ok) (await caches.open(CACHE)).put(request, fresh.clone());
      return fresh;
    })());
  }
});
