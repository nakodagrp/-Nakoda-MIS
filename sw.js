/* ============================================================
 *  Nakoda MIS — Service Worker
 *  Caches the app shell so the app OPENS with no internet.
 *  Bump CACHE_VERSION whenever you publish changes — users then
 *  see the "update available" banner.
 * ============================================================ */
var CACHE_VERSION = 'nakoda-mis-v110';
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
/* The minimum set needed to render a styled, working login screen. These are cached all-or-nothing,
   so a device can NEVER end up with index.html but a missing styles.css (the broken unstyled state). */
var CRITICAL = ['./','./index.html','./styles.css','./manifest.webmanifest','./config.js','./api.js','./app.js'];
var OPTIONAL = SHELL.filter(function(u){ return CRITICAL.indexOf(u)<0; });

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function(c){
      // Critical files are all-or-nothing: if any can't be fetched, install REJECTS and the browser
      // retries later — so we never activate a half-cached (unstyled) shell.
      return c.addAll(CRITICAL).then(function(){
        // Everything else is best-effort; a single missing module/icon must not block install.
        return Promise.all(OPTIONAL.map(function(u){ return c.add(u).catch(function(){}); }));
      });
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
      }).catch(function(){
        if (req.mode === 'navigate') return caches.match('./index.html');   // offline page loads → cached shell
        return cached;
      });
      return cached || net;
    })
  );
});
