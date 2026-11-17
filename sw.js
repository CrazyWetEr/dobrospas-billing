const VERSION = 'billing-v8.0';
const TILES = 'billing-tiles-v1';
const MAX_TILES = 4000;

const SHELL = ['./', './index.html', './manifest.json', './logo.png', './icons/icon-192.png', './icons/icon-512.png'];
const EXTERNAL = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/@turf/turf@6.5.0/turf.min.js'
];
const TILE_HOSTS = ['tile', 'openstreetmap', 'arcgisonline', 'cartocdn', 'google', 'yandex', '2gis', 'opentopomap'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    for (const url of SHELL) { try { await cache.add(url); } catch (e) { console.warn('[SW] skip', url); } }
    for (const url of EXTERNAL) {
      try { const r = await fetch(url, { mode: 'cors' }); if (r.ok) await cache.put(url, r); } catch (e) { console.warn('[SW] ext skip', url); }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION && k !== TILES).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

let putCounter = 0;
async function trimTiles(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Геокодер — только сеть, без кэша
  if (url.hostname.startsWith('nominatim')) return;

  // Тайлы: сначала кэш (офлайн), иначе сеть + сохранение с лимитом
  if (TILE_HOSTS.some(h => url.hostname.includes(h))) {
    event.respondWith((async () => {
      const cache = await caches.open(TILES);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) {
          cache.put(req, res.clone());
          if (++putCounter % 100 === 0) trimTiles(cache);
        }
        return res;
      } catch (e) {
        return Response.error();
      }
    })());
    return;
  }

  // Страница: сначала сеть (чтобы не застрять на старой версии), офлайн — из кэша
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const c = res.clone(); caches.open(VERSION).then(cache => cache.put('./index.html', c)); }
        return res;
      }).catch(async () => (await caches.match('./index.html')) || (await caches.match('./')))
    );
    return;
  }

  // Остальное: кэш + обновление в фоне
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const net = fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') { const c = res.clone(); caches.open(VERSION).then(cache => cache.put(req, c)); }
      return res;
    }).catch(() => cached);
    return cached || net;
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
