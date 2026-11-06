const CACHE_NAME = 'billing-zones-v4.0';

const STATIC_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './logo.jpg',
  './logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const EXTERNAL_CACHE = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        for (const url of STATIC_CACHE) {
          try {
            await cache.add(url);
          } catch (err) {
            console.warn(`[SW] Пропуск ресурса: ${url}`);
          }
        }
        for (const url of EXTERNAL_CACHE) {
          try {
            const resp = await fetch(url, { mode: 'cors' });
            if (resp.ok) await cache.put(url, resp);
          } catch (err) {
            console.warn(`[SW] Внешний ресурс недоступен: ${url}`);
          }
        }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && !key.endsWith('-tiles'))
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (url.hostname.includes('tile') || 
      url.hostname.includes('openstreetmap') ||
      url.hostname.includes('arcgisonline') ||
      url.hostname.includes('cartocdn') ||
      url.hostname.includes('stadiamaps') ||
      url.hostname.includes('google') ||
      url.hostname.includes('yandex') ||
      url.hostname.includes('2gis')) {
    
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME + '-tiles').then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
