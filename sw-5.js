/* ============================================================
 *  Nakoda MIS — Service Worker
 *  Caches the app shell so the app OPENS with no internet.
 *  Bump CACHE_VERSION whenever you publish changes — users then
 *  see the "update available" banner.
 * ============================================================ */
var CACHE_VERSION = 'nakoda-mis-v415';  /* v415: BULK MESSAGE SEND — "ONE IMAGE FOR EVERYONE" for card templates (approved mockup 23 Sep). A card template with a picture header (nakoda_gold_card …) now shows a switch in Campaign Setup: "One image for everyone" (default) = the original simple way — drag-and-drop ONE image with preview, {{1}} branch + {{2}} lead name filled automatically, {{3}}..{{n}} (labels from the template's Variable hints, e.g. Card Type / Benefits / Validity) typed once; sent exactly like a plain template, no card lookup, no card creation, no card pictures. "Each member's own card picture" keeps the v403–v414 per-member cards + card design. Stored per campaign in Msg_Campaigns.cardMode (new column, appended automatically). Plain image templates get the same drag-and-drop + preview box. Needs 28_Messaging.gs (+ 03_Router.gs build number) redeployed — backend v415. */  /* v414: BULK MESSAGE SEND — CARD DESIGN PER TEMPLATE. Campaign Setup's v413 "sample card picture" box becomes a card design editor: upload a blank card design, drag Member name / Card number / Valid till / Card type / Branch phone / Valid from onto it (size + alignment + colour), live preview, Save — stored on the server for all staff (27_Messaging.gs: Script Property per template + background in Drive ▸ CardDesigns). Add Leads and "Fix pictures & retry failed" draw EVERY lead's card on that design in the browser and upload it to WhatsBizAPI (never Drive); the new Msg_DesignPics sheet remembers which picture belongs to which card, and the scheduler sends that one. The card's own Membership Cards picture is never touched. Saving a changed design remakes the pictures on the next Add Leads / Fix. Needs 27_Messaging.gs + 03_Router.gs redeployed (backend v414). */  /* v413: BULK MESSAGE SEND — built from the approved mockups. (1) Campaign Setup, card templates: a proper "Card picture for this template" box — drag-and-drop upload area + preview (file name, size, ✓ Uploaded to WhatsBizAPI, ✓ Saved with <template>), remembered per template on this device so the next campaign on that template already has it. Fallback only: each member's own drawn card picture still wins. (2) Patient Delivery: "Retry failed" is now "Fix pictures & retry failed (N)" — makes/rebuilds the card pictures first (v410), then re-queues; a green banner says what was done, and each retried row shows "✓ Fixed — was …" / "↻ Re-queued after fix — was …" instead of losing the reason. (3) Top bar also shows the BACKEND build ("Backend v413 ✓"), read from 03_Router.gs's BACKEND_BUILD — Apps Script's "Version 412" in Manage deployments is a different counter. Carries v410 + v409, which were built but never uploaded. Needs 27_Messaging.gs + 28_CardImport.gs + 03_Router.gs redeployed. */  /* v410: BULK MESSAGE SEND — card templates make their OWN card pictures. Root cause of "This card's own picture hasn't been generated yet": the 15-minute sender runs on Google's server and cannot DRAW a card, so a lead only worked if someone had pressed Membership Cards > Send Cards for that card first. Add Leads and "Retry failed" now draw every missing/broken picture on this device and upload it (same code as Send Cards). Root cause of "[100] Invalid parameter or missing required field": pictures saved as Google Drive links (upload fallback) — WhatsApp can't open those; they are now detected, cleared and rebuilt, and image headers upload to WhatsBizAPI instead of Drive. Add Leads creates missing cards for EVERY membership_card template tied to a card type (not only Gold / Platinum 7). New optional "Sample card picture" upload in Campaign Setup, used only as a fallback when a member's own picture can't be used. Needs 27_Messaging.gs + 28_CardImport.gs + 03_Router.gs redeployed. */  /* v409: BULK MESSAGE SEND — Add Leads on a Gold/Platinum 7 campaign no longer permanently skips someone who already holds the OTHER card type. Their old card is now closed (status cancelled, reason naming the new card) and a fresh card of the campaign's own type is issued in its place — works in either direction (Gold->Platinum or Platinum->Gold), not upgrade-only, and the old card's number is remembered on the new one so nothing is lost. The plan/summary now show a "Replacing older card" count and a "Who's being replaced" list alongside New/Already have/Skipped. Also fixes the "preparing card pictures" step getting stuck at "0 of N" for a long time on a branch with a lot of cards: it used to re-download the WHOLE company's card list just to find the handful of cards it had just created; it now gets those details directly from the create call and never needs that fetch. Needs the matching 28_CardImport.gs redeploy (Deploy -> Manage deployments -> New version). */  /* v408: BULK MESSAGE SEND / TIMELY MESSAGE — "Retry failed" on Patient Delivery. A failed lead used to be stuck forever: the automatic sender only ever looks at Pending leads, and re-uploading the same Excel just reports the number as a duplicate and skips it (this is exactly what happened to 6 real leads on a nakoda_gold_card campaign whose membership card did not exist yet when they were first sent — v406 fixes that going forward, but it can't reach back and fix leads that already failed). Patient Delivery now shows a "↻ Retry failed (N)" button whenever a campaign has failed leads; pressing it resets them to Pending in place — no delete, no re-upload — so the next automatic batch actually resends them. Needs the matching 27_Messaging.gs (new apiMsgRetryFailed) + 03_Router.gs (1 new case) redeploy. */  /* v406: BULK MESSAGE SEND — Gold / Platinum 7 CARD CAMPAIGNS. Add Leads on a campaign that uses ONLY nakoda_gold_card or nakoda_platinum_card_7 now makes a NEW membership card for every person in the Excel who has no active card of that type (auto number continuing the branch series, valid from today, active, amount 0, nothing to accounts), draws + uploads each card picture on this device, and only then adds the people to the campaign — so the scheduler can never reach a lead whose picture is not ready. People who already hold that card keep it; holders of another type, bad mobiles and nameless rows are skipped and listed; running the same file again is safe (it only retries what is missing). The new cards appear on Membership Cards in the normal row format, with a small pill before Benefits: ✓ Template sent 6:12 PM / ⏳ Queued · 6:00 PM / ✗ Failed — reason. Every other template behaves exactly as before. Needs the new 28_CardImport.gs file + the updated 03_Router.gs (3 new cases) redeployed. */  /* v405: BULK MESSAGE SEND — answers "why is it still Pending?" on the page. Campaign History now says "Next batch: today 6:00 PM · 459 waiting · about 2 more days (250 per day limit)" under an in-progress campaign; a new ⏰ Change time button moves the daily send time (so waiting leads go out earlier instead of after 6 PM); Patient Delivery opens with the same explanation (sending runs on Google's servers, laptop can be off) and its Total Leads tile now always shows the whole campaign instead of the filtered count. Needs the matching 27_Messaging.gs redeploy. */  /* v404: BULK MESSAGE SEND — a Completed (or Failed) campaign now has a Delete button, and the confirm says how many leads were sent vs never will be. Also (needs the matching 27_Messaging.gs redeploy): adding leads to a campaign the scheduler had already marked Completed re-opens it instead of leaving the new leads stuck, and Delete now waits for any running send so it cannot corrupt the sheet. */  /* v403: BULK MESSAGE SEND ROUND 3 — (1) the Template dropdown lists EVERY active template again (membership_card, nakoda_gold_card, nakoda_platinum_plus_card, nakoda_platinum_card_7, platinum_card_benefits_msg, the general/sample-collection ones …) — no template is hidden any more; an empty/failed first answer is retried once. (2) Membership-card templates are filled PER RECIPIENT from that person's OWN card instead of one shared value/picture for the whole campaign: benefits = {{1}} member name, {{2}} card type, {{3}} branch phone; card variants = {{1}} branch, {{2}} member, {{3}} card no., {{4}} type, {{5}} valid till, {{6}} contact; header picture = that card's own picture. A Gold/Platinum/Platinum+ template only goes to holders of that type; family cards sharing one phone are told apart by name; a wrong/missing picture or card fails the row with the reason (shown in Patient Delivery) instead of sending it. Needs the matching 27_Messaging.gs redeploy (see messaging.js + 27_Messaging.gs round-3 notes). Also removes the two stale "NEW"/"now works" banners from the page and syncs app.js APP_BUILD to this version so the ⋯ More / topbar build check reads up to date. */  /* v402: Bulk Message Send / Timely Message can now use "membership_benefits" WhatsApp templates safely -- previously ALL membership-purpose templates were hidden from these pages after the wrong-card incident, but that over-corrected: only "membership_card" (one template per card design, sent by card number -- still excluded, still belongs to Membership Cards) actually needed hiding. "membership_benefits" is ONE global template whose values/image are now resolved PER RECIPIENT, from their own card looked up by phone number, at send time (msgBuildPayload_/msgSchedulerTick_ in 27_Messaging.gs, reusing 13_OpsSamples-1.gs's wabnParams_ -- the exact function the Membership Cards Benefits button already trusts). A lead with no live card is skipped and reported failed, never sent a wrong or blank one. messaging.js updated to match: no campaign-wide upload/extra-fields box for these templates, updated Campaign Setup copy. Also carries v401: (1) Cancelled campaigns are now unconditionally excluded from Campaign History everywhere (apiMsgListCampaigns) -- reported twice, so no more per-row Delete click needed, they just dont come back once this backend redeploys. (2) The App vXXX / cache vYYY build-check + Check update button used to live ONLY inside the mobile ⋯ More drawer, which is display:none above 760px -- meaning it was literally unreachable on the desktop app, which is why deploy status could never be confirmed there. Now also in the desktop topbar (index.html), always visible. */
/* v349: PATIENT CRM ROUND 3 — three things. (1) PENDING CARD IS NO LONGER A LIE.
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