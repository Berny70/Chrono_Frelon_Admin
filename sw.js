const CACHE = 'cf-admin-v3.5';
const ASSETS = []; // ← vide, on ne précache plus rien au démarrage

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => {
    if (ASSETS.length) return c.addAll(ASSETS);
  }));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co')) return;
  const url = e.request.url;
  if (url.includes('access_token')  ||
      url.includes('refresh_token') ||
      url.includes('error_code')    ||
      url.includes('type=recovery') ||
      url.includes('#')) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
