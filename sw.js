const CACHE_NAME = 'billing-zones-v1.2';

// Файлы для кэширования
const STATIC_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Внешние ресурсы для кэширования
const EXTERNAL_CACHE = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Установка Service Worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Кэширование статических файлов');
        
        // Кэшируем локальные файлы (игнорируем ошибки для отсутствующих)
        const staticPromises = STATIC_CACHE.map(url => {
          return cache.add(url).catch(err => {
            console.warn(`[SW] Не удалось кэшировать: ${url}`, err);
          });
        });
        
        // Кэшируем внешние ресурсы
        const externalPromises = EXTERNAL_CACHE.map(url => {
          return fetch(url, { mode: 'cors' })
            .then(response => {
              if (response.ok) {
                return cache.put(url, response);
              }
            })
            .catch(err => {
              console.warn(`[SW] Не удалось кэшировать внешний ресурс: ${url}`, err);
            });
        });
        
        return Promise.all([...staticPromises, ...externalPromises]);
      })
      .then(() => {
        console.log('[SW] Установка завершена');
        return self.skipWaiting();
      })
  );
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Активация Service Worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log(`[SW] Удаление старого кэша: ${name}`);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Активация завершена');
        return self.clients.claim();
      })
  );
});

// Перехват запросов
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Пропускаем не-GET запросы
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Для тайлов карт - сначала сеть, потом кэш
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
          // Кэшируем тайлы для офлайн использования
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME + '-tiles')
              .then((cache) => {
                cache.put(event.request, responseClone);
              });
          }
          return response;
        })
        .catch(() => {
          // Если сеть недоступна - берём из кэша
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // Для остальных запросов - сначала кэш, потом сеть
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Обновляем кэш в фоне
          fetch(event.request)
            .then((response) => {
              if (response.ok) {
                caches.open(CACHE_NAME)
                  .then((cache) => {
                    cache.put(event.request, response);
                  });
              }
            })
            .catch(() => {});
          
          return cachedResponse;
        }
        
        // Если нет в кэше - загружаем из сети
        return fetch(event.request)
          .then((response) => {
            // Кэшируем успешные ответы
            if (response.ok && response.type === 'basic') {
              const responseClone = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseClone);
                });
            }
            return response;
          });
      })
  );
});

// Обработка сообщений
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Service Worker загружен');