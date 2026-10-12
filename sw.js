const CACHE_NAME = 'visionplus-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/cadastro.html',
  '/login.html',
  '/painel.html',
  '/suporte.html',
  '/css/style.css',
  '/css/admin.css',
  '/css/auth.css',
  '/css/painel.css',
  '/js/app.js',
  '/js/admin.js',
  '/js/auth.js',
  '/js/painel.js',
  '/js/pwa-install.js',
  '/manifest.json',
  '/images/logo.png',
  '/images/icon-192.png',
  '/images/icon-512.png'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event (Cleanup old caches)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', (e) => {
  // Skip non-GET requests and API requests
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) {
    return;
  }

  const url = new URL(e.request.url);

  // For HTML files / navigation requests, use Network First
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          // Cache the latest version
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline fallback
          return caches.match(e.request);
        })
    );
  } else {
    // For other static assets (CSS, JS, Images), use Stale-While-Revalidate
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        const fetchPromise = fetch(e.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return networkResponse;
        }).catch(() => {/* Ignore network errors for static asset background updates */});

        return cachedResponse || fetchPromise;
      })
    );
  }
});
