/* ============================================================
 *  Nakoda MIS — Service Worker
 *  Caches the app shell so the app OPENS with no internet.
 *  Bump CACHE_VERSION whenever you publish changes — users then
 *  see the "update available" banner.
 * ============================================================ */
var CACHE_VERSION = 'nakoda-mis-v3';
var SHELL = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './api.js',
  './app.js',
  './manifest.webmanifest',
  './icons/login-logo.png',
  './icons/logo-white.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function(c){ return c.addAll(SHELL); })
  );
  // do NOT skipWaiting automatically — wait for the user to click "Install update"
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){ if(k!==CACHE_VERSION) return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('message', function(e){
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;                       // never cache POSTs (the API)
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // let API / cross-origin pass through to network

  // App shell: cache-first, then refresh in background
  e.respondWith(
    caches.match(req).then(function(cached){
      var net = fetch(req).then(function(res){
        if (res && res.status === 200){
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){ return cached; });
      return cached || net;
    })
  );
});
