/* ============================================================
 *  Nakoda MIS — Service Worker
 *  Caches the app shell so the app OPENS with no internet.
 *  Bump CACHE_VERSION whenever you publish changes — users then
 *  see the "update available" banner.
 * ============================================================ */
var CACHE_VERSION = 'nakoda-mis-v369';  /* v349: PATIENT CRM ROUND 3 — three things. (1) PENDING CARD IS NO LONGER A LIE.
   It decided who holds a membership card from one column on the patient row, and that column is only written when a card is
   issued through the CRM — so counter-issued cards, imported cards and a relative's card on the same family mobile number all
   read as NO CARD forever. It now looks the patient's number up in Membership_Cards and counts any LIVE card (active, not
   expired); a family card says so on the chip. (2) THE NEXT-CALL-DATE FIELD NO LONGER OPENS A DATE PICKER. Type the gap
   instead — 3m, 2w, 7, 1y, 25/11, tom — and the real date appears beside it spelled out with its weekday, so a wrong year is
   visible instead of invisible. It fills itself from the tag, so the ordinary call needs no typing. If that day is already
   overloaded it says so and offers the next lighter one. "pick exact date" still opens the calendar. (3) FROM A CALL YOU NOW
   BOOK A VISIT. "Book a home visit" opens the dashboard's own booking popup — phlebotomist, diary, day, time — with name,
   mobile, address and branch pre-filled and the identity locked, instead of the log-a-collected-sample form that demanded
   tests, an amount and a prescription that do not exist while the patient is still on the phone. From the CRM the amount may
   be left for the phlebotomist to fill in at the door. Backend: Code_PatientCRM.gs and the new 24_CrmTools.gs. */  /* v348: SELFIES ACTUALLY SAVE. Since v335 the photo was sent as a second, separate
   request after the punch — so the punch could be recorded while the photo quietly failed on its own, leaving the approver
   looking at "No selfie" with nothing to act on. The photo now rides inside the punch itself: one request, one row, written
   complete, or nothing written and the punch stays queued for retry. The speed reason for splitting it no longer applies,
   because the screen already finishes in 1.2s on its own (FAST_MS) without waiting for the server. A missing selfie also now
   shows red on the Approve screen rather than a soft grey word. No backend change. Carries v345, below, which was built but
   never uploaded to GitHub. */
/* v345: fixes the attendance "punch flips back" bug — a punch confirmed by a background
   queue flush now writes into the screen's own record the instant it's confirmed, before it disappears from the visible queue,
   closing the gap where a just-confirmed Check-out briefly reappeared as Check-in / Not checked in yet (attendance.js —
   applyPunchToRecs). Adds a plain "You're offline — punch saved, will send by itself" banner when the device has no
   connection, in place of the easy-to-miss "☁ waiting to send" note. Also removes punchq.js's shared-phone relay
   machinery (relayFor/relayable/needsOwnerLogin) — every device is one phone, one employee, so a queued punch now
   simply uses its own stored token or the current session's, with no "hand off to whoever else is signed in" path.
   No backend change; Code.gs is untouched by this build. */  /* v344: a patient who already holds a live card now sees the card itself in the Membership card box — type, number and validity — with no status dropdown and no Issue button, because neither applies. An expired card no longer counts as active, so a renewal is still offered. Also carries v343: the Log call / Log meeting / Log activity tiles are removed from the dashboard — they wrote to Activity_Log, which no screen in this app displays. The Collect sample, Outsource and Order to delivery tiles beside them are untouched. Also carries v342: Patient CRM round 2 — typing a mobile number now pulls that person's cards and past samples out of the sheet instead of asking someone to retype them, a card can be issued straight from the add-patient form, the Assign-to dropdown is full width so long names fit, and the dashboard gained a call/issue-card bar with a number box that jumps straight to the call screen. Also carries v341: ONE BUNDLED SCRIPT — the thirty module files are now served as nakoda.bundle.js, so publishing an update means uploading three files instead of thirty and no file can be silently left behind. config.js stays separate (it holds the live /exec URL). Also carries v340: PATIENT CRM (patients.js + Code_PatientCRM.gs) replaces the Sales CRM — patient database, follow-up calling with tag-driven intervals, bulk branch-wise import, hand-offs into the existing Collect-sample and Issue-card modals, and a per-person performance dashboard. Also carries v339: apiCheckIn/apiCheckOut backend fix for the selfiePending punch protocol (Code.gs — see the v339 header comment there) plus a more visible "photo missing — tap to add it" banner in attendance.js. Also carries v338: attendance override authority (Operations Manager/MIS/Director can convert Absent/Leave to Present, with a reason) added to the "not punched" list in attendance.js — see openOverrideModal/canOverrideAtt. Also fixes app.js's APP_BUILD, which had drifted out of sync with this CACHE_VERSION since v294 and made the "which build am I on" self-check always show a false mismatch. */  /* v332d: QR codes may name their branch in words (pal / udhna / nvs), card picture trimmed to 864px so the send carries the same weight as the old front-only card. */  /* v332: the WhatsApp/card picture is now card front + benefits + card no. + lab no. in one image — membership.js, bulksend.js. */  /* v316: bulk WhatsApp membership-card send — tick cards or “send unsent”, images uploaded in parallel and cached on the card row, all template sends fired together server-side. Includes all of v308. */  /* v308: expenses file as pending (no self-approval), reject needs a reason, duplicate expense/deposit writes made idempotent, card issuing halved its sheet reads. Includes all of v307. */
var SHELL = [
  './index.html',
  './manifest.webmanifest',
  './styles.css',
  './config.js',
  './nakoda.bundle.js',
  './icons/login-logo.png',
  './icons/logo-white.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.png',
];
/* The minimum set needed to render a styled, working login screen. These are cached all-or-nothing,
   so a device can NEVER end up with index.html but a missing styles.css (the broken unstyled state). */
/* v341: api.js and app.js are gone — they live inside nakoda.bundle.js now. Leaving them here
   would be fatal, not cosmetic: CRITICAL is all-or-nothing, so one 404 makes install() REJECT
   and the new version would never activate. */
var CRITICAL = ['./','./index.html','./styles.css','./manifest.webmanifest','./config.js','./nakoda.bundle.js'];
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