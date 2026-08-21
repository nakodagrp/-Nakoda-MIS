/* ============================================================
 *  Nakoda MIS — Service Worker
 *  Caches the app shell so the app OPENS with no internet.
 *  Bump CACHE_VERSION whenever you publish changes — users then
 *  see the "update available" banner.
 * ============================================================ */
var CACHE_VERSION = 'nakoda-mis-v333';  /* v333: offline punches now sync in the BACKGROUND — the queue moved to IndexedDB and is flushed by the service worker via Background Sync, so a punch made with no signal is sent by the phone itself while the app is closed. Each punch also carries WHOSE it is, so a shared phone can never write one person's punch onto another person's record. punchq.js is new. Includes all of v332. */  /* v316: bulk WhatsApp membership-card send — tick cards or “send unsent”, images uploaded in parallel and cached on the card row, all template sends fired together server-side. Includes all of v308. */  /* v308: expenses file as pending (no self-approval), reject needs a reason, duplicate expense/deposit writes made idempotent, card issuing halved its sheet reads. Includes all of v307. */
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css',
  './config.js',
  './api.js',
  './punchq.js',
  './ops.js',
  './app.js',
  './branches.js',
  './watemplates.js',
  './membership.js',
  './bulksend.js',
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
var CRITICAL = ['./','./index.html','./styles.css','./manifest.webmanifest','./config.js','./api.js','./punchq.js','./app.js'];
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

/* ============================================================ v333 — BACKGROUND PUNCH SYNC

   THE BUG THIS FIXES. The attendance screen has promised, since v201, that a punch made with no
   internet "will send automatically when internet returns". It never did. The retry was a
   setInterval living inside the PAGE, and a page is exactly the thing a phone stops running: on
   Android a backgrounded tab is frozen within minutes, and on iOS the web view is suspended the
   moment the screen locks. The staff member punches in, reads "saved on phone", pockets the
   phone, and from that instant there is no code left alive to notice the network coming back.
   The queue moved only when somebody re-opened the app AND navigated to Attendance — usually the
   next morning, which is exactly when a stale punch-out landed on top of a fresh punch-in and
   produced "In 12:04 · Out 12:04 — half day".

   THE FIX. The queue now lives in IndexedDB, which a service worker can read, and this worker
   asks the operating system to be woken when connectivity returns. Android/Chrome delivers that
   as a `sync` event, with the app closed and the phone asleep. If anything is still queued when
   the flush finishes, we REJECT the event: that is the documented way to tell the browser "not
   done — wake me again", and it schedules another attempt with backoff, for hours, by itself.

   iOS has no Background Sync at all. Nothing here helps an iPhone, which is why attendance.js
   also flushes on every visibilitychange, pageshow, focus, online event and login. Between the
   two, every phone in the branches is covered by at least one of them.

   The punch queue deliberately does NOT go through api.js. That file is not available in a
   worker, and its generic outbox deletes an item on any logical rejection so the queue can never
   jam (see the v317 note there) — sane for a task update, catastrophic for somebody's pay.
   ============================================================ */
var PUNCHQ_OK = false;
try{ importScripts('./punchq.js'); PUNCHQ_OK = !!self.NKPunchQ; }catch(e){ PUNCHQ_OK = false; }

function tellClients_(msg){
  return self.clients.matchAll({includeUncontrolled:true, type:'window'}).then(function(cs){
    cs.forEach(function(c){ try{ c.postMessage(msg); }catch(e){} });
  }).catch(function(){});
}

/* Runs with no page open, so there is no "currently logged-in user" to relay under. Every punch
   is sent with the token its own owner was holding when they tapped — which is the normal case
   and the only one that needs no human present. A punch whose owner has since logged out is left
   for the page to relay, because only the page knows who is signed in now. */
function flushPunches_(){
  if(!PUNCHQ_OK || !self.NKPunchQ) return Promise.reject(new Error('punch queue unavailable'));
  var Q = self.NKPunchQ;
  return Q.releaseHolds().then(function(){ return Q.flush({}); }).then(function(res){
    if(res.sent || res.dead) tellClients_({type:'PUNCH_SYNCED', sent:res.sent, dead:res.dead, left:res.left});
    /* Still holding punches? Reject, and the browser schedules another wake-up for us. */
    if(res.left > 0) throw new Error('punches still queued: ' + res.left);
    return res;
  });
}

self.addEventListener('sync', function(e){
  if(e.tag === 'nakoda-punch-sync') e.waitUntil(flushPunches_());
});

/* Periodic Background Sync, where the browser grants it (an installed PWA that the person uses
   often). This is the safety net for a punch whose one-shot sync was exhausted — for instance a
   phone that stayed offline all evening. Harmless where unsupported: the event simply never fires. */
self.addEventListener('periodicsync', function(e){
  if(e.tag === 'nakoda-punch-periodic') e.waitUntil(flushPunches_().catch(function(){}));
});

/* The page can also ask for a flush directly — used the moment somebody logs in, so a punch that
   was waiting for its owner to come back goes out at once instead of on the next timer. */
self.addEventListener('message', function(e){
  if(e.data && e.data.type === 'FLUSH_PUNCHES'){
    e.waitUntil(
      (PUNCHQ_OK && self.NKPunchQ
        ? self.NKPunchQ.flush({currentToken:e.data.token||'', currentEmpId:e.data.empId||'', apiUrl:e.data.apiUrl||''})
        : Promise.resolve({sent:0,dead:0,left:0})
      ).then(function(res){ return tellClients_({type:'PUNCH_SYNCED', sent:res.sent, dead:res.dead, left:res.left}); })
       .catch(function(){})
    );
  }
});