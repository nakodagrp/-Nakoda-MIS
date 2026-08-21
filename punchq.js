/* ============================================================================================
 *  Nakoda MIS — PUNCH QUEUE (v333)
 *
 *  ONE file, loaded in TWO places:
 *    • the page          <script defer src="punchq.js">   (index.html)
 *    • the service worker importScripts('./punchq.js')     (sw.js)
 *
 *  It therefore touches no DOM and no page-only global. `self` is the window in one and the
 *  ServiceWorkerGlobalScope in the other, and IndexedDB exists in both — which is the whole
 *  reason the queue moved off localStorage.
 *
 *  ============================ WHY THIS FILE EXISTS ============================
 *
 *  Up to v325 a punch made with no internet was stored in localStorage under the single key
 *  `nk_att_q`, and it was re-sent by a setInterval running inside the page. Three things were
 *  wrong with that, and between them they produced every symptom reported from the branches.
 *
 *  1. THE RETRY LIVED IN THE PAGE, SO IT DID NOT RUN.
 *     "Will send automatically when internet returns" was a 60-second timer in the tab. Android
 *     freezes a backgrounded tab within minutes and iOS suspends the web view the moment the
 *     phone is locked. Staff punch in, see "saved on phone", pocket the phone — and from that
 *     second nothing is running. The internet comes back at ten o'clock and no code notices,
 *     because there is no code. The punch only moved when somebody re-opened the app AND walked
 *     to the Attendance screen, which for most staff was the next morning.
 *     FIX: the queue now lives in IndexedDB, which the SERVICE WORKER can read, and the flush is
 *     driven by Background Sync — the operating system wakes the worker when connectivity comes
 *     back, with the app closed and the phone in a pocket. The page triggers are kept as a
 *     fallback for iOS, which has no Background Sync.
 *
 *  2. THE QUEUE DID NOT KNOW WHOSE PUNCH IT HELD.
 *     A queued punch carried no employee id. At flush time it was sent with whatever token was
 *     in localStorage — that is, whoever was logged in AT THAT MOMENT. On a shared branch phone:
 *     Ankita punches in with no signal, logs out, Bhavesh logs in, the queue flushes, and
 *     Ankita's punch and Ankita's selfie are written onto BHAVESH's attendance record. That is
 *     the "punch-out appearing with somebody's old photo" report, and it is also a privacy leak.
 *     Note that api.js already namespaced its IndexedDB read-cache per employee for exactly this
 *     reason (see the v284 note there) — the punch queue was simply never given the same care,
 *     and logout's clearLocal() never emptied it.
 *     FIX: every record is stamped at TAP TIME with ownerEmpId and the owner's own token, and is
 *     always sent with that token. A different login can never flush it as themselves. If the
 *     owner has since logged out (logout destroys their session server-side) the punch is
 *     RELAYED: sent under the current user's valid token but addressed `relayFor: ownerEmpId`,
 *     so the server writes it for the right person, at the original tap time, and marks it
 *     pending approval so a manager sees it.
 *
 *  3. A PUNCH THE SERVER COULD NOT DATE WAS WRITTEN AS "NOW".
 *     Code.gs accepted an offline punch's own tap time only if it was within three days. Older
 *     than that and the `off` flag stayed false — and the punch was then recorded silently at
 *     TODAY's date and the server's current clock. So a stale queued check-OUT flushing seconds
 *     after today's check-IN was written as a check-out at the same minute:
 *         BHAVESH BORSE   In 12:04 · Out 12:04 → "Early out (under 4h) — half day"
 *         UMAKANT VERMA   In 11:07 · Out 11:07 → "Early out (under 4h) — half day"
 *     Half a day of pay, from a punch nobody made.
 *     FIX: the three-day window is GONE. A saved punch is recorded on THE DAY IT WAS MADE, however
 *     long it took to arrive — a check-out stuck for five days lands on its own day, beside its own
 *     check-in, where it belongs. Nobody types a day in by hand. Late/half-day is still judged on
 *     the original tap time, so an on-time arrival stays on time. Only four things can now stop a
 *     punch: a phone clock set in the future or over a year out (PUNCH_FUTURE / PUNCH_TOO_OLD), a
 *     check-out at the same minute as its check-in (PUNCH_TOO_SOON), and a payroll month that has
 *     already been approved and locked (PUNCH_MONTH_CLOSED). In all four the record is KEPT and
 *     shown to the staff member with its reason, never deleted in silence.
 *
 *  NOTHING IS EVER DELETED QUIETLY. A punch leaves this queue in exactly two ways: the server
 *  accepted it, or it is parked as `dead` with a reason the staff member and their manager can
 *  read. A day's attendance is somebody's pay; it does not get to vanish.
 * ============================================================================================ */
(function(GLOBAL){
'use strict';

var DB_NAME = 'nakoda_punch', DB_VER = 1, STORE = 'q';
var MAX_LIVE = 30;              /* live (not yet accepted) punches kept on the device */
var HOLD_MS  = 120000;          /* a "live attempt in flight" claim older than this is wreckage */
var DEAD_KEEP_MS = 30*864e5;    /* show an unrecordable punch for 30 days, then stop nagging */
var SYNC_TAG = 'nakoda-punch-sync';

/* ---------------------------------------------------------------- IndexedDB */
var _db = null;
function openDB(){
  if(_db) return Promise.resolve(_db);
  return new Promise(function(res, rej){
    var r;
    try{ r = indexedDB.open(DB_NAME, DB_VER); }catch(e){ return rej(e); }
    r.onupgradeneeded = function(){
      var db = r.result;
      if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, {keyPath:'punchId'});
    };
    r.onsuccess = function(){ _db = r.result; res(_db); };
    r.onerror   = function(){ rej(r.error); };
    r.onblocked = function(){ rej(new Error('punch db blocked')); };
  });
}
function store(mode){ return openDB().then(function(db){ return db.transaction(STORE, mode).objectStore(STORE); }); }
function idbAll(){
  return store('readonly').then(function(s){
    return new Promise(function(res){ var r=s.getAll(); r.onsuccess=function(){res(r.result||[]);}; r.onerror=function(){res([]);}; });
  }).catch(function(){ return []; });
}
function idbPut(rec){
  return store('readwrite').then(function(s){
    return new Promise(function(res,rej){ var r=s.put(rec); r.onsuccess=function(){res(rec);}; r.onerror=function(){rej(r.error);}; });
  });
}
function idbDel(punchId){
  return store('readwrite').then(function(s){
    return new Promise(function(res){ var r=s.delete(punchId); r.onsuccess=function(){res();}; r.onerror=function(){res();}; });
  }).catch(function(){});
}

/* ---------------------------------------------------------------- helpers */
function isDead(r){ return !!(r && r.dead); }
function live(list){ return (list||[]).filter(function(r){ return !isDead(r); }); }
function held(r, now){ return !!(r && r.hold && r.holdTs && (now - r.holdTs) < HOLD_MS); }
function byOldest(a,b){ return (a.ts||0) - (b.ts||0); }

/* A punch is judged PERMANENTLY unrecordable only on these. Everything else — a lapsed session,
   a Drive hiccup, a busy server, a dropped connection — is temporary and the punch is kept.
   The v225 comment in attendance.js explains why that distinction matters: before it existed,
   ANY error string deleted the punch and a transient failure silently cost somebody a day. */
var PERMANENT = /PUNCH_TOO_OLD|PUNCH_UNDATED|PUNCH_FUTURE|PUNCH_TOO_SOON|PUNCH_MONTH_CLOSED|not scheduled to work|already worked .*sundays|alternate sunday limit|selfie is required|not authorised|belongs to an employee/i;
var SESSION_GONE = /session expired|not signed in|please log ?in/i;
var LANDED_ALREADY = /already checked/i;
var BUSY = /server busy/i;

/* These are the ONLY four things that can now stop a saved punch recording itself on its own day.
   Note what is no longer here: "this punch is more than 3 days old". A saved punch is recorded on
   the day it was made however long it took to arrive, so nobody has to type a day in by hand. */
function plainReason(code, raw){
  if(/PUNCH_MONTH_CLOSED/.test(code)) return String(raw||'').replace(/^PUNCH_MONTH_CLOSED:\s*/,'') ||
      'That month\u2019s salary is already approved and locked, so this day cannot be added automatically. Ask HR.';
  if(/PUNCH_TOO_SOON/.test(code))  return 'This check-out is at the same time as the check-in, so it was not recorded. If you really did leave, punch out again.';
  if(/PUNCH_FUTURE/.test(code))    return 'The date on this phone is set in the future, so this punch cannot be recorded. Fix the phone\u2019s date and time.';
  if(/PUNCH_TOO_OLD/.test(code))   return 'The date on this phone is wrong (over a year out), so this punch cannot be recorded. Fix the phone\u2019s date and time.';
  if(/PUNCH_UNDATED/.test(code))   return 'This punch was saved without a usable time, so it cannot be recorded automatically.';
  return String(raw || 'This punch could not be recorded.');
}

/* ---------------------------------------------------------------- ordering
   ONE ordering rule matters and it is kept: a check-OUT may not be sent while its OWN owner's
   check-IN for the SAME day is still sitting in the queue unsent. A different day, or a
   different person, never blocks anything.

   v325 tried to express this as `!(hold && !held(...))` in order to stop a check-in frozen by a
   stale hold from blocking its check-out for ever. The expression inverted the test: a check-in
   with a STALE hold stopped blocking, so the check-out could be sent BEFORE the check-in and be
   rejected with "Please check in first". The rule here is stated the simple way instead — while
   the check-in is still in the queue it has not landed, so it blocks, hold or no hold — and the
   stale-hold problem is solved where it belongs, by held() timing out. */
function pick(list, now){
  var q = live(list).slice().sort(byOldest);
  for(var i=0;i<q.length;i++){
    var it = q[i];
    if(held(it, now)) continue;              /* a live attempt owns this punch right now */
    if(it.cool && now < it.cool) continue;   /* failed moments ago — give another punch a turn */
    if(it.needsOwnerLogin && !it.relayable) continue;   /* waiting for its owner to sign in again */
    if(it.kind === 'out'){
      var blocked = false;
      for(var j=0;j<q.length;j++){
        var o = q[j];
        if(o.kind==='in' && o.date===it.date && String(o.ownerEmpId||'')===String(it.ownerEmpId||'')){ blocked = true; break; }
      }
      if(blocked) continue;
    }
    return it;
  }
  return null;
}

/* ---------------------------------------------------------------- network
   Deliberately a bare fetch and not api.js's call(): this runs in the service worker too, where
   api.js does not exist, and a punch must never be routed through the generic outbox (which
   deletes an item on any logical rejection — see the v317 note in api.js). */
function post(apiUrl, action, payload, timeoutMs){
  var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var to = ctrl ? setTimeout(function(){ try{ ctrl.abort(); }catch(e){} }, timeoutMs || 45000) : null;
  return fetch(apiUrl, {
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify(Object.assign({action:action}, payload||{})),
    redirect:'follow',
    signal: ctrl ? ctrl.signal : undefined
  }).then(function(r){ return r.json(); })
    .then(function(j){ if(to) clearTimeout(to); return j; },
          function(e){ if(to) clearTimeout(to); throw e; });
}

function payloadOf(rec, token, relayFor){
  var p = {
    token: token,
    data: {
      punchId: rec.punchId,
      selfie:  rec.selfie || '',
      lat: rec.lat, lng: rec.lng,
      noGeo: !!rec.noGeo, wfh: !!rec.wfh, altShift: !!rec.altShift,
      remark: rec.remark || '',
      clientDate: rec.date, clientTime: rec.time,
      offline: 1
    }
  };
  if(relayFor) p.data.relayFor = String(relayFor);
  return p;
}

/* ---------------------------------------------------------------- flush
   opts: { currentToken, currentEmpId, apiUrl, onEvent(evt) }
   Resolves { sent, dead, left, stalled }. It NEVER rejects — the caller decides what a leftover
   means (the service worker rejects its sync event so the OS schedules another attempt). */
function flush(opts){
  opts = opts || {};
  var sent = 0, deadN = 0, stalled = false;

  function step(){
    return idbAll().then(function(list){
      var now = Date.now();

      /* Mark anything the owner must sign in for as relayable when we DO hold a valid session
         for somebody else on this device — that is what lets Ankita's punch go out today,
         under Ankita's name, from a phone Bhavesh is now holding. */
      var canRelay = !!(opts.currentToken && opts.currentEmpId);
      var changed = [];
      live(list).forEach(function(r){
        var want = canRelay && String(r.ownerEmpId||'') !== '' ;
        if(!!r.relayable !== !!want){ r.relayable = want; changed.push(r); }
      });

      var rec = pick(list, now);
      if(!rec){ return Promise.all(changed.map(idbPut)).then(function(){ return null; }); }
      return Promise.all(changed.map(idbPut)).then(function(){ return rec; });
    }).then(function(rec){
      if(!rec) return;

      var apiUrl = rec.apiUrl || opts.apiUrl;
      if(!apiUrl){ stalled = true; return; }

      /* Always the OWNER's token first. This is the line that stops one person's punch being
         written onto another person's record. */
      var useToken = rec.ownerToken || '';
      var relayFor = '';
      if(!useToken && opts.currentToken && rec.relayable){ useToken = opts.currentToken; relayFor = rec.ownerEmpId; }
      if(!useToken){
        return markKeep(rec, 'needs owner login', {needsOwnerLogin:1});
      }

      rec.hold = 1; rec.holdTs = Date.now();
      return idbPut(rec).then(function(){
        return post(apiUrl, rec.kind==='in' ? 'checkIn' : 'checkOut', payloadOf(rec, useToken, relayFor), 45000);
      }).then(function(r){
        return settle(rec, r, opts, relayFor);
      }, function(){
        /* No reply at all. The punch may well have landed — the replay is idempotent on punchId,
           so keeping it can never double-punch. Stop the pass; the connection is not there. */
        stalled = true;
        return markKeep(rec, 'no reply', {});
      });
    }).then(function(){
      if(stalled) return;
      return idbAll().then(function(list){
        if(pick(list, Date.now())) return step();     /* another punch is ready — keep going */
      });
    });
  }

  function markKeep(rec, why, extra){
    rec.tries = (rec.tries||0) + 1;
    rec.lastError = why;
    rec.cool = Date.now() + Math.min(10*60000, 20000 * rec.tries);
    delete rec.hold; delete rec.holdTs;
    Object.assign(rec, extra||{});
    return idbPut(rec).catch(function(){});
  }

  function markDead(rec, code, raw){
    rec.dead = 1;
    rec.deadCode = String(code||'');
    rec.deadReason = plainReason(code, raw);
    rec.deadAt = Date.now();
    rec.selfie = '';                       /* the photo is of no further use — reclaim the space */
    delete rec.hold; delete rec.holdTs; delete rec.cool;
    deadN++;
    emit(opts, {type:'dead', rec:rec});
    return idbPut(rec).catch(function(){});
  }

  function settle(rec, r, opts, relayFor){
    var em = String((r && r.error) || '');

    if(r && r.ok){
      sent++;
      emit(opts, {type:'sent', rec:rec, result:r, relayed:!!relayFor});
      return idbDel(rec.punchId);
    }
    /* Punched from outside the branch. Re-send once as work-from-home, which routes it to the
       manager for approval rather than refusing it. */
    if(r && r.wfhPrompt && !rec.wfh){
      rec.wfh = true; delete rec.hold; delete rec.holdTs; delete rec.cool;
      return idbPut(rec);
    }
    /* An earlier attempt already landed this punch. */
    if(LANDED_ALREADY.test(em)){
      sent++;
      emit(opts, {type:'sent', rec:rec, result:r, alreadyThere:true});
      return idbDel(rec.punchId);
    }
    /* The server was momentarily locked (the 9 am rush). Nothing is wrong with the punch. */
    if(BUSY.test(em)){ return markKeep(rec, 'server busy', {}); }

    /* Permanently unrecordable. Park it WITH ITS REASON — never delete it in silence. */
    if(PERMANENT.test(em)){ return markDead(rec, em, em); }

    /* The owner's session is gone (they logged out). If someone else is signed in here, relay it
       under their token but addressed to the owner, so it still lands today, on the right record.
       If nobody is signed in, hold it until its owner signs in on this phone. */
    if(SESSION_GONE.test(em)){
      if(!relayFor && opts.currentToken && opts.currentEmpId && String(opts.currentEmpId) !== String(rec.ownerEmpId||'')){
        rec.ownerToken = '';                       /* their token is dead — stop trying it */
        rec.relayable = true;
        delete rec.hold; delete rec.holdTs; delete rec.cool;
        return idbPut(rec);                        /* next step() picks it up and relays it */
      }
      if(!relayFor && opts.currentToken && String(opts.currentEmpId||'') === String(rec.ownerEmpId||'')){
        rec.ownerToken = opts.currentToken;        /* same person, fresh login — adopt the new token */
        delete rec.hold; delete rec.holdTs; delete rec.cool;
        return idbPut(rec);
      }
      return markKeep(rec, 'needs owner login', {needsOwnerLogin:1, ownerToken:''});
    }
    /* Anything else is treated as temporary. There is no attempt cap that deletes a punch any
       more: an unsendable punch becomes visible (see the dead list) rather than disappearing. */
    return markKeep(rec, em || 'server error', {});
  }

  return step().catch(function(){ stalled = true; })
    .then(prune)
    .then(idbAll)
    .then(function(list){
      return { sent: sent, dead: deadN, left: live(list).length, stalled: stalled, records: list };
    })
    .catch(function(){ return { sent: sent, dead: deadN, left: 0, stalled: true, records: [] }; });
}

function emit(opts, evt){ try{ if(opts && typeof opts.onEvent === 'function') opts.onEvent(evt); }catch(e){} }

/* Keep the store honest: forget very old dead records, and if the device is somehow carrying more
   live punches than makes sense, retire the oldest ones VISIBLY instead of dropping them. */
function prune(){
  return idbAll().then(function(list){
    var now = Date.now(), jobs = [];
    list.filter(isDead).forEach(function(r){
      if(r.dismissed || (r.deadAt && now - r.deadAt > DEAD_KEEP_MS)) jobs.push(idbDel(r.punchId));
    });
    var l = live(list).sort(byOldest);
    while(l.length > MAX_LIVE){
      var r = l.shift();
      r.dead = 1; r.deadCode = 'DEVICE_FULL';
      r.deadReason = 'Too many unsent punches built up on this phone, so this one was set aside. Ask your manager to add it by hand.';
      r.deadAt = now; r.selfie = '';
      jobs.push(idbPut(r));
    }
    return Promise.all(jobs).catch(function(){});
  }).catch(function(){});
}

/* ---------------------------------------------------------------- public */
var Q = {
  SYNC_TAG: SYNC_TAG,
  all: idbAll,
  put: idbPut,
  del: idbDel,
  flush: flush,
  prune: prune,
  pick: pick,
  isDead: isDead,
  live: live,

  /* Everything the staff member is waiting on, for THIS employee. Another person's punches are
     deliberately not counted — they are not this person's business and must not appear on their
     screen as if they were theirs. */
  mine: function(empId){
    return idbAll().then(function(list){
      var me = String(empId||'');
      return {
        waiting: live(list).filter(function(r){ return String(r.ownerEmpId||'')===me; }),
        dead:    list.filter(function(r){ return isDead(r) && !r.dismissed && String(r.ownerEmpId||'')===me; }),
        others:  live(list).filter(function(r){ return String(r.ownerEmpId||'')!==me; }).length
      };
    });
  },

  todayFor: function(empId, kind, dateStr){
    return idbAll().then(function(list){
      return live(list).filter(function(r){
        return String(r.ownerEmpId||'')===String(empId||'') && r.kind===kind && r.date===dateStr;
      })[0] || null;
    });
  },

  dismiss: function(punchId){
    return idbAll().then(function(list){
      var r = list.filter(function(x){ return x.punchId===punchId; })[0];
      if(!r) return;
      r.dismissed = 1; return idbPut(r);
    }).then(prune).catch(function(){});
  },

  /* Free every "a live attempt is running right now" claim. Called when the page loads and when
     the worker wakes, because at those moments nothing can possibly be in flight. */
  releaseHolds: function(){
    return idbAll().then(function(list){
      var now = Date.now(), jobs = [];
      live(list).forEach(function(r){ if(r.hold && !held(r, now)){ delete r.hold; delete r.holdTs; jobs.push(idbPut(r)); } });
      return Promise.all(jobs);
    }).catch(function(){});
  },

  /* A cool-off exists because a send failed. The connection just came back, so that reason is
     gone and waiting out the remaining minutes helps nobody. */
  clearCooldowns: function(){
    return idbAll().then(function(list){
      var jobs = [];
      live(list).forEach(function(r){ if(r.cool){ delete r.cool; jobs.push(idbPut(r)); } });
      return Promise.all(jobs);
    }).catch(function(){});
  },

  /* Ask the operating system to flush this queue when the network is back — with the app closed,
     the screen off and the phone in a pocket. This is the single most important line in the file;
     everything else is what happens once it fires. Chrome/Android only: iOS has no Background
     Sync, which is why attendance.js keeps its foreground triggers as well. */
  registerSync: function(){
    try{
      if(typeof navigator === 'undefined' || !navigator.serviceWorker || !GLOBAL.SyncManager) return Promise.resolve(false);
      return navigator.serviceWorker.ready
        .then(function(reg){
          /* Periodic sync is the safety net for a punch whose one-shot sync attempts were all
             used up — a phone that stayed offline overnight, say. The browser grants it only to
             an installed app the person uses regularly, and silently refuses otherwise, so it is
             asked for and then forgotten about. */
          try{
            if(reg.periodicSync && navigator.permissions){
              navigator.permissions.query({name:'periodic-background-sync'}).then(function(st){
                if(st.state==='granted') reg.periodicSync.register('nakoda-punch-periodic',{minInterval:2*3600*1000}).catch(function(){});
              }).catch(function(){});
            }
          }catch(e2){}
          return reg.sync.register(SYNC_TAG);
        })
        .then(function(){ return true; }, function(){ return false; });
    }catch(e){ return Promise.resolve(false); }
  }
};

GLOBAL.NKPunchQ = Q;

})(typeof self !== 'undefined' ? self : this);
