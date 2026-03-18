// ── 버전 번호 — 파일 수정할 때마다 이 숫자를 올리면 캐시 자동 갱신 ──
const CACHE_VERSION = 'jp-app-v10';
const CACHE_NAME = CACHE_VERSION;

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install: 새 버전 즉시 활성화 (skipWaiting)
self.addEventListener('install', function(event) {
  console.log('[SW] 설치 중:', CACHE_NAME);
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
      console.log('[SW] 설치 완료 — skipWaiting');
      return self.skipWaiting(); // 이전 SW 즉시 교체
    })
  );
});

// Activate: 이전 버전 캐시 모두 삭제 + 즉시 모든 탭 제어
self.addEventListener('activate', function(event) {
  console.log('[SW] 활성화 중:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(key) { return key !== CACHE_NAME; })
          .map(function(key) {
            console.log('[SW] 구버전 캐시 삭제:', key);
            return caches.delete(key);
          })
      );
    }).then(function() {
      console.log('[SW] 활성화 완료 — clients.claim');
      return self.clients.claim(); // 열려있는 모든 탭에 즉시 적용
    })
  );
});

// Fetch: skip non-http requests (chrome-extension, data:, etc.)
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Skip non-http(s) requests
  if (!url.startsWith('http')) return;

  // Gemini API — 항상 네트워크 (캐시 안 함)
  if (url.includes('generativelanguage.googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(
          JSON.stringify({error:{message:'오프라인 상태입니다.'}}),
          {status:503, headers:{'Content-Type':'application/json'}}
        );
      })
    );
    return;
  }

  var isSameOrigin = url.startsWith(self.location.origin);
  var isCDN = url.includes('fonts.googleapis.com') ||
              url.includes('fonts.gstatic.com') ||
              url.includes('cdnjs.cloudflare.com');

  if (!isSameOrigin && !isCDN) return;

  // index.html — 항상 네트워크 우선 (최신 버전 보장)
  if (url.endsWith('/') || url.endsWith('/index.html') || url.endsWith('/vocab-card/')) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(function() {
        return caches.match('./index.html');
      })
    );
    return;
  }

  // 나머지 정적 파일 — 캐시 우선
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
