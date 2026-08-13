/* ============================================================
 *  Nakoda MIS — Service Worker
 *  Caches the app shell so the app OPENS with no internet.
 *  Bump CACHE_VERSION whenever you publish changes — users then
 *  see the "update available" banner.
 * ============================================================ */
var CACHE_VERSION = 'nakoda-mis-v313';  /* v313: Send via removed and the report attachment
     made optional; the daily collection task moved off every CRM onto the accountant; and the card
     system stopped re-reading the whole sheet — with its stored images — on every write, which was
     also silently wiping those images whenever a card expired. Includes v312 back to v308. */
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
  './finance.js',
  './statementtable.js',
  './partnerreview.js',
  './bankpreview.js',
  './ops.js',
  './quicklog.js',
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

/* ============================================================ v288 — WHY BUMPING THE VERSION DIDN'T WORK
   THE BUG. c.addAll() and c.add() fetch through the browser's ordinary HTTP cache. GitHub Pages serves
   these files with Cache-Control: max-age=600, so for ten minutes after an upload the browser will hand
   the service worker its OLD copy of a file — and the service worker will faithfully store that old copy
   in its brand-new cache. Bumping CACHE_VERSION does nothing about this: you get a fresh cache carefully
   filled with stale files, and the app keeps showing the previous build. Uploading again does not help,
   because the browser is still inside the same ten-minute window.

   That is why the finance table kept coming back with B2C/B2D/B2B and ₹0 cells after every deploy.

   THE FIX. Fetch each shell file with {cache:'reload'}, which bypasses the HTTP cache and goes to the
   network. What lands in the service worker cache is then genuinely what is on the server. */
function freshRequest_(u){ return new Request(u, {cache:'reload'}); }
function addFresh_(c,u){
  return fetch(freshRequest_(u)).then(function(res){
    if(!res || res.status!==200) throw new Error('bad status '+(res&&res.status)+' for '+u);
    return c.put(u, res);
  });
}
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function(c){
      // Critical files are all-or-nothing: if any can't be fetched, install REJECTS and the browser
      // retries later — so we never activate a half-cached (unstyled) shell.
      return Promise.all(CRITICAL.map(function(u){ return addFresh_(c,u); })).then(function(){
        // Everything else is best-effort; a single missing module/icon must not block install.
        return Promise.all(OPTIONAL.map(function(u){ return addFresh_(c,u).catch(function(){}); }));
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
  /* v288: lets the app ask "which build are you actually serving?" — the question that has been
     impossible to answer from the outside every time a deploy appeared not to take. */
  if (e.data === 'WHICH_BUILD' && e.source && e.source.postMessage){
    e.source.postMessage({ type:'BUILD', version:CACHE_VERSION });
  }
});

/* ============================================================ v295 — THE DOUBLE-FETCH BUG
   THE BUG. The old handler read:

       var net = fetch(req).then(...);
       return cached || net;

   `fetch(req)` is a function CALL, evaluated the moment that line runs — long before
   `cached || net` decides which one to return. So a cache hit still fired a full network
   request; the response was simply thrown away. index.html pulls in 35 scripts, styles.css
   and five icons, so EVERY page load quietly put ~40 needless requests on the wire even
   though all 40 files were already sitting in the cache.

   WHY THAT BROKE PUNCHING. On a branch's mobile connection those 40 requests compete with
   the one request that actually matters — the check-in POST carrying a photo. The punch
   waits behind them for its share of a narrow pipe, and on a bad morning it loses the race
   and aborts. "Photo taken, then nothing happened."

   THE FIX. Serve the cached copy IMMEDIATELY and revalidate in the background at most once
   per file per service-worker lifetime, so a file is refreshed but never re-fetched forty
   times a day. Nothing is fetched at all when the device is offline. Updates still arrive
   the normal way — a CACHE_VERSION bump re-installs the whole shell.
   ============================================================ */
var REVALIDATED_ = {};   /* url -> 1, reset whenever the service worker restarts */

function revalidate_(req){
  var key = req.url;
  if (REVALIDATED_[key]) return;        // already refreshed this file since the SW woke up
  if (!self.navigator || self.navigator.onLine !== false) {
    REVALIDATED_[key] = 1;
    fetch(req).then(function(res){
      if (res && res.status === 200){
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function(c){ c.put(req, copy); });
      }
    }).catch(function(){ delete REVALIDATED_[key]; });   // failed — allow another try later
  }
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then(function(cached){
      if (cached){
        /* Answer from cache NOW. Refresh quietly afterwards, once, and never block on it. */
        e.waitUntil(Promise.resolve().then(function(){ revalidate_(req); }));
        return cached;
      }
      /* Genuine miss — only now do we touch the network. */
      return fetch(req).then(function(res){
        if (res && res.status === 200){
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){
        if (req.mode === 'navigate') return caches.match('./index.html');   // offline page loads → cached shell
        return cached;
      });
    })
  );
});

/* v307: the push + notificationclick handlers were removed with the notification system.
   Nothing sends web-push to this worker any more. */