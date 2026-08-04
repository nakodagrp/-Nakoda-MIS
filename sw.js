/* ============================================================
 *  Nakoda MIS — Service Worker
 *  Caches the app shell so the app OPENS with no internet.
 *  Bump CACHE_VERSION whenever you publish changes — users then
 *  see the "update available" banner.
 * ============================================================ */
var CACHE_VERSION = 'nakoda-mis-v284';   /* v284: per-user cache (it was leaking between users), chunked server cache, correct shift times, plus the v283 GPS/check-out fixes */
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css',
  './config.js',
  './api.js',
  './app.js',
  './branches.js',
  './watemplates.js',
  './membership.js',
  './cardadmin.js',
  './tasks.js',
  './calendar.js',
  './attendance.js',
  './hrmodules.js',
  './leave.js',
  './accounts.js',
  './training.js',
  './assets.js',
  './inventory.js',
  './stockauto.js',
  './purchase.js',
  './payreq.js',
  './combo.js',
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
  './notifications.js',
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

/* ============================================================
 *  PUSH  (v274)
 *  FCM delivers here as a JSON body. We render it, and on tap we focus an
 *  already-open tab rather than spawning a second one — matching how a native
 *  app behaves, and avoiding two live copies of the PWA fighting over state.
 * ============================================================ */
self.addEventListener('push', function(e){
  var payload = {};
  try{ payload = e.data ? e.data.json() : {}; }catch(err){
    try{ payload = { notification:{ title:'Nakoda MIS', body:e.data.text() } }; }catch(e2){}
  }
  var n = payload.notification || {};
  var d = payload.data || {};
  var title = n.title || 'Nakoda MIS';
  var opts = {
    body: n.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/favicon.png',
    tag: d.notifId || n.tag || 'nakoda',
    renotify: true,
    data: { url: d.url || '#tasks', notifId: d.notifId || '' }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var target = (e.notification.data && e.notification.data.url) || '#tasks';
  e.waitUntil(
    self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(list){
      for(var i=0;i<list.length;i++){
        if(list[i].url.indexOf(self.registration.scope) === 0 && 'focus' in list[i]){
          list[i].postMessage({ type:'NOTIFICATION_CLICK', url:target });
          return list[i].focus();
        }
      }
      if(self.clients.openWindow) return self.clients.openWindow('./' + target);
    })
  );
});
