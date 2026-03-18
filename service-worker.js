const CACHE_NAME = 'jp-app-v7';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install: cache only our own static files
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.allSettled(
        STATIC_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.log('[SW] 캐시 실패 (무시):', url, err);
          });
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate: remove old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch: skip non-http requests (chrome-extension, data:, etc.)
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Skip non-http(s) requests — fixes chrome-extension error
  if (!url.startsWith('http')) return;

  // Skip Gemini API — always network
  if (url.includes('generativelanguage.googleapis.com')) {
    event.respondWith(fetch(event.request).catch(function() {
      return new Response(JSON.stringify({error:{message:'오프라인 상태입니다.'}}),
        {status:503, headers:{'Content-Type':'application/json'}});
    }));
    return;
  }

  // Skip cross-origin requests except fonts/cdn
  var isSameOrigin = url.startsWith(self.location.origin);
  var isCDN = url.includes('fonts.googleapis.com') ||
              url.includes('fonts.gstatic.com') ||
              url.includes('cdnjs.cloudflare.com');

  if (!isSameOrigin && !isCDN) return;

  // Cache-first for same-origin static assets
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(function() {
        return caches.match('./index.html');
      });
    })
  );
});
