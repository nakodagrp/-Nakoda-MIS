/* ============================================================
 *  Nakoda MIS — Service Worker
 *  Caches the app shell so the app OPENS with no internet.
 *  Bump CACHE_VERSION whenever you publish changes — users then
 *  see the "update available" banner.
 * ============================================================ */
var CACHE_VERSION = 'nakoda-mis-v103';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css',
  './config.js',
  './api.js',
  './app.js',
  './branches.js',
  './membership.js',
  './cardadmin.js',
  './tasks.js',
  './calendar.js',
  './attendance.js',
  './hrmodules.js',
  './accounts.js',
  './training.js',
  './assets.js',
  './inventory.js',
  './recurring.js',
  './process.js',
  './builder.js',
  './staffperf.js',
  './marketing.js',
  './finance.js',
  './quicklog.js',
  './kpiadmin.js',
  './qc.js',
  './extras.js',
  './icons/login-logo.png',
  './icons/logo-white.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function(c){
      return Promise.all(SHELL.map(function(u){ return c.add(u).catch(function(){}); }));
    })
  );
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
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
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
