/* Nakoda MIS — Attendance (self check-in/out: selfie + geo, late=half-day; approver review). */
(function(){
  var ATT={ recs:[], coords:null, kind:'in' };
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function $id(i){ return document.getElementById(i); }
  function ymNow(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  function todayS(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function attMode(){ return String((S.user&&S.user.AttendanceMode)||''); }
  function needSelfie(){ return true; }  // selfie required for all modes
  function isFenced(){ var m=attMode().toLowerCase(); return m.indexOf('geo')>=0 || m.indexOf('office')>=0; }   // v242: ANY "geo" mode (Geo only, Geo + Selfie, Geo) is fenced to the branch (150 m) — must match Code.gs
  function hm2min(t){ var p=String(t||'').split(':'); return p.length>=2?(+p[0])*60+(+p[1]):null; }
  /* v284 — WHY YOUR SHIFT LINE SAID "04:38–13:38".
     A time-only cell is stored by Sheets against 1899-12-30 in the SHEET's timezone, and serialises to
     JSON in UTC. For India that epoch date carries the old Madras offset of +5:21:10, not +5:30 — which
     is why a 10:00 shift arrives as "1899-12-30T04:38:50.000Z". Reading the HH:MM straight out of the
     string, as this did, therefore printed 04:38 for a 10:00 shift: every staff member has been shown
     the wrong shift on their attendance card. (The server was never confused — it formats with the sheet
     timezone via taskTimeStr_, which is why the Approve list correctly says "Duty 15:00–22:00" while the
     employee's own card disagreed. Late/half-day was always judged on the server's value, so pay was not
     affected — only what people were told their shift was.)
     The real fix is server-side: publicUser_ now formats these with taskTimeStr_ (the sheet's timezone,
     authoritative, independent of whatever timezone the phone is set to) and sends a plain "HH:MM". This
     function keeps a fallback for phones still talking to an older backend, using the Date object's local
     getters rather than scraping digits — the engine applies the same historical offset Sheets did. */
  function fmtDutyTime(t){
    if(!t) return '';
    var s=String(t);
    if(/^\d{1,2}:\d{2}$/.test(s)) return s;                       // already formatted by the server — the normal path now
    if(!/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0,5);
    var d=new Date(s);
    if(isNaN(d.getTime())) return s.slice(11,16);
    return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  }
  function dayBadge(st){ var m={present:['Full day','#eaf7ef','#1a8f4c'],half:['Half day','#faeeda','#854F0B'],leave:['Leave','#e9f1fb','#185FA5'],absent:['Absent','#fdecec','#b23b3b']}; var b=m[String(st||'present')]||m.present; return ' <span style="font-size:11px;font-weight:700;padding:2px 9px;border-radius:10px;background:'+b[1]+';color:'+b[2]+'">'+b[0]+'</span>'; }
  function canApprove(){ if(S.user&&String(S.user.AttApproveDenied)==='yes') return false; var p=S.perms||{}; return p.level==='SUPER'||p.level==='HR_ADMIN'||p.level==='BRANCH_MGR'||(S.user&&S.user.Role==='Operations Manager'); }
  // v282 (bug D): every other date compare in this file defensively slices to 10 chars. This one used a
  // strict compare, so the moment the server returns a full ISO date (or a cached record from an older
  // build) it matched nothing — and paintMe then showed "Check in" to somebody who had already checked in.
  function todayRec(){ var t=todayS(); return (ATT.recs||[]).filter(function(r){return String(r.date).slice(0,10)===t;})[0]; }
  // v282: one id per TAP, reused across every retry and every queue replay, so the server can recognise
  // the same physical punch arriving twice and answer with the original result instead of writing it again.
  function punchUuid(){ return 'p'+Date.now().toString(36)+'-'+'xxxxxxxx'.replace(/x/g,function(){ return (Math.random()*16|0).toString(16); }); }

  /* ============================================================================================
     OFFLINE PUNCH QUEUE — v333 rewrite (was v201/v282/v295/v325)

     The queue itself now lives in punchq.js, in IndexedDB, because the SERVICE WORKER has to be
     able to read it. Everything below is the screen's side of that: a synchronous snapshot to
     paint from, and the triggers that ask for a flush.

     WHAT CHANGED AND WHY — the three faults that produced every symptom from the branches:

       1. "Will send automatically when internet returns" was never implemented. The retry was a
          setInterval inside this page, and phones freeze pages. Punch, pocket the phone, and no
          code is left running to notice the network. Background Sync (sw.js) now does it from
          the operating system, with the app closed. These foreground triggers stay as the
          fallback for iOS, which has no Background Sync.

       2. A queued punch did not record WHOSE it was, so it was flushed under whoever happened to
          be logged in. On a shared branch phone that wrote Ankita's punch and Ankita's selfie
          onto Bhavesh's record. Every punch is now stamped with its owner at tap time.

       3. Anything the server refused was eventually deleted after 12 tries, in silence, and the
          day quietly turned red. Nothing is deleted in silence any more — a punch that genuinely
          cannot be recorded is shown on this screen with the reason, to be handed to a manager.
     ============================================================================================ */
  var PQ = (typeof self!=='undefined' && self.NKPunchQ) ? self.NKPunchQ : null;

  /* The synchronous snapshot paintMe draws from. IndexedDB is async and painting is not, so the
     screen reads this and pqRefresh keeps it honest. `others` is only ever a COUNT — another
     employee's punches are never shown to this one. */
  ATT.q = {waiting:[], dead:[], others:0, photos:[]};

  /* ============================================================================================
     THESE THREE MUST NOT DEPEND ON api.js.

     v333 added API.token() / API.uid() / API.endpoint() so the punch queue could reach the session.
     But a phone can easily be running a NEWER attendance.js against an OLDER api.js — the files are
     uploaded separately, and GitHub Pages serves them with a ten-minute cache, so for a while after
     a deploy the browser hands out the old one. When that happens all three come back empty, the
     queued punch has no token and no URL, and it can never be sent: "2 punches saved on this phone"
     sits there on full 5G with nothing retrying, because nothing CAN.

     So each one now falls back to the underlying source, which is identical in every build ever
     shipped: the token lives in localStorage['nk_tok'], the employee in localStorage['nk_uid'], and
     the endpoint in config.js. api.js becomes a convenience, not a dependency. */
  function myEmpId(){
    var id = '';
    try{ id = String((S.user && (S.user.EmpID || S.user.empId)) || ''); }catch(e){}
    if(!id){ try{ id = String((API && API.uid) ? API.uid() : ''); }catch(e){} }
    if(!id){ try{ id = String(localStorage.getItem('nk_uid') || ''); }catch(e){} }
    return (id === 'anon') ? '' : id;   // api.js uses 'anon' for "nobody signed in" — not an employee
  }
  function myToken(){
    var t = '';
    try{ t = String((API && API.token) ? API.token() : ''); }catch(e){}
    if(!t){ try{ t = String(localStorage.getItem('nk_tok') || ''); }catch(e){} }
    return t;
  }
  function myApiUrl(){
    var u = '';
    try{ u = String((API && API.endpoint) ? API.endpoint() : ''); }catch(e){}
    if(!u){ try{ u = String((window.NAKODA_CONFIG && window.NAKODA_CONFIG.API_URL) || ''); }catch(e){} }
    return u;
  }
  /* The server's refusal codes are precise but not readable at a counter. Say the same thing in
     words the person can act on. */
  function _plainPunchError(em){
    em=String(em||'');
    if(/PUNCH_TOO_SOON/.test(em)) return 'That would record a check-out at the same time as your check-in, so it was not saved. Punch out when you actually leave.';
    if(/PUNCH_MONTH_CLOSED/.test(em)) return String(em).replace(/^.*PUNCH_MONTH_CLOSED:\s*/,'');
    if(/PUNCH_FUTURE|PUNCH_TOO_OLD/.test(em)) return 'The date and time on this phone are wrong, so this punch could not be recorded. Please fix the phone clock.';
    if(/PUNCH_UNDATED/.test(em))  return 'This saved punch has no usable time, so it could not be recorded automatically.';
    return em;
  }
  /* ============================================================================================
     v335 — IS THIS A DEVICE WHOSE FILE INPUT IS A CAMERA?

     <input type="file" accept="image/*" capture="user"> opens the phone's OWN full-screen camera
     app. On a laptop the same element opens a file browser, which is not what we want to hand
     somebody instead of a camera — hence this test rather than always using the input.

     Feature-detecting `capture` was tried and rejected: browsers only expose the IDL property on
     platforms that honour it, so it is FALSE on desktop Chromium — which sounds ideal until you
     consider what happens if a phone browser ever ships the behaviour without the property. Then
     every phone in the branches silently falls back to a camera permission prompt they keep
     denying, which is the bug being fixed. The user agent and the touchscreen are the honest
     question here: "is this a phone?" — and a browser that does not understand `capture` simply
     ignores it and shows a file picker, which is a working punch either way.
     ============================================================================================ */
  function phoneCam(){
    try{
      if(/Android|iPhone|iPod|Silk|Kindle|Windows Phone/i.test(navigator.userAgent||'')) return true;
      /* iPad, including iPadOS 13+ which reports itself as a Mac — maxTouchPoints gives it away. */
      if(/iPad/i.test(navigator.userAgent||'')) return true;
      if(/Macintosh/i.test(navigator.userAgent||'') && (navigator.maxTouchPoints||0) > 1) return true;
      return false;
    }catch(e){ return false; }
  }
  function qToday(kind){
    var t=todayS(), me=myEmpId();
    return (ATT.q.waiting||[]).filter(function(r){ return r.kind===kind && r.date===t && String(r.ownerEmpId||'')===me; })[0] || null;
  }
  function qWaitingCount(){ return (ATT.q.waiting||[]).length; }

  /* Reload the snapshot from IndexedDB, then repaint if the screen is open. */
  function pqRefresh(repaint){
    if(!PQ) return Promise.resolve();
    return PQ.mine(myEmpId()).then(function(m){
      m.photos = m.photos || [];   // an older punchq.js on the device does not report photo jobs
      ATT.q = m;
      if(repaint!==false && document.getElementById('attMe')) paintMe();
    }).catch(function(){});
  }

  /* Ask for a flush. Always passes the CURRENT session as well, which is what allows a punch
     whose owner has logged out to be relayed under this login but recorded against its real
     owner — see the relay note in punchq.js. */
  var _pqBusy=false, _pqBusyTs=0;
  function pqSync(){
    if(!PQ) return Promise.resolve();
    /* Watchdog: if a flush promise never settles at all the flag would stay true and the queue
       would stop for the rest of the session. */
    if(_pqBusy && (Date.now()-_pqBusyTs) > 90000) _pqBusy=false;
    if(_pqBusy) return Promise.resolve();
    _pqBusy=true; _pqBusyTs=Date.now();
    var opts={
      currentToken: myToken(),
      currentEmpId: myEmpId(),
      apiUrl: myApiUrl(),
      onEvent: function(evt){
        if(evt.type==='sent'){
          var mine = String(evt.rec.ownerEmpId||'')===myEmpId();
          if(mine) toast('Saved punch sent ✓ '+(evt.rec.kind==='in'?'In ':'Out ')+evt.rec.time);
        }
      }
    };
    return PQ.flush(opts).then(function(res){
      _pqBusy=false;
      return pqRefresh().then(function(){
        if(res.sent) refreshAfterSync();
        return res;
      });
    }, function(){ _pqBusy=false; });
  }

  /* Put a punch into the queue. Called from submitMark BEFORE the network is touched, so the
     punch is durable from the instant it is made. `hold` marks it as "a live attempt is running
     right now" so a background flush does not race the foreground one. */
  function pqStage(rec){
    if(!PQ) return Promise.resolve();
    ATT.q.waiting = (ATT.q.waiting||[]).concat([rec]);   // paint from it immediately
    return PQ.put(rec).then(function(){
      /* Register the OS-level wake-up as soon as there is something to send. If the app is
         killed one second later, this is the only thing that will still get the punch out. */
      return PQ.registerSync();
    }).catch(function(){});
  }
  /* v335: the selfie, queued as its own job once the punch has told us which row it belongs to.
     Same store, same Background Sync wake-up, so it survives the app being closed a second after
     the shutter — which is what staff actually do. */
  function pqPhoto(rec){
    if(!PQ) return Promise.resolve();
    ATT.q.photos = (ATT.q.photos||[]).concat([rec]);   // paint "photo uploading" immediately
    return PQ.put(rec).then(function(){ return PQ.registerSync(); }).catch(function(){});
  }
  function pqUnstage(punchId){
    ATT.q.waiting = (ATT.q.waiting||[]).filter(function(r){ return r.punchId!==punchId; });
    return PQ ? PQ.del(punchId).catch(function(){}) : Promise.resolve();
  }
  function pqRelease(punchId){
    if(!PQ) return Promise.resolve();
    return PQ.all().then(function(list){
      var r=list.filter(function(x){ return x.punchId===punchId; })[0];
      if(!r) return;
      delete r.hold; delete r.holdTs;
      return PQ.put(r);
    }).then(function(){ return PQ.registerSync(); }).catch(function(){});
  }

  /* ---------- one-time migration off localStorage ----------
     Phones updating from v325 are carrying punches in localStorage `nk_att_q`. Those records
     have no owner, because nothing recorded one — that is the bug. We can only safely attribute
     them to the person signed in on this device NOW, which is right in the overwhelming majority
     of cases (one phone, one person) and is the same assumption the old code made implicitly on
     every single flush. The difference is that from here on the attribution is FIXED at tap time
     and can never drift to somebody else. */
  function pqMigrateLegacy(){
    if(!PQ) return Promise.resolve();
    var raw;
    try{ raw = localStorage.getItem('nk_att_q'); }catch(e){ return Promise.resolve(); }
    if(!raw) return Promise.resolve();
    /* Nobody is signed in yet — which happens on a cold open of the login screen. Stamping the
       punches with an empty owner here would be the very mistake this release exists to remove,
       so leave them in localStorage and migrate on the `nk-login` event instead. */
    if(!myEmpId()) return Promise.resolve();
    var old=[]; try{ old=JSON.parse(raw)||[]; }catch(e){ old=[]; }
    var me=myEmpId(), tok=myToken(), url=myApiUrl();
    var jobs=old.filter(function(p){ return p && p.kind && p.date; }).map(function(p){
      return PQ.put({
        punchId: p.punchId || ('mig'+(p.ts||Date.now())+'-'+Math.random().toString(36).slice(2,8)),
        ownerEmpId: me, ownerToken: tok, apiUrl: url,
        kind: p.kind, date: p.date, time: p.time, ts: p.ts || Date.now(),
        selfie: p.selfie||'', lat: p.lat, lng: p.lng,
        noGeo: !!p.noGeo, wfh: !!p.wfh, altShift: !!p.altShift, remark: p.remark||'',
        migrated: 1
      }).catch(function(){});
    });
    return Promise.all(jobs).then(function(){
      try{ localStorage.removeItem('nk_att_q'); }catch(e){}
    }).catch(function(){});
  }
  /* ============================================================================================
     v295 — THE BUTTON THAT FLIPPED BACK.

     Every refresh in this file used to do `ATT.recs = x.records || []` — a wholesale replacement of
     what we know with whatever the server just said. That looks harmless until you notice two things
     about the call it replaces from:

       1. `API.myAttendance()` falls back to the copy in IndexedDB whenever the live call fails or
          times out. So `x.ok` can be true while `x.records` is a snapshot from BEFORE the punch.
       2. It is the slowest call the server ever answers, because the punch that just happened called
          invalidateMyAttCache_ on this exact employee and month — so it cannot answer from cache and
          has to re-read the Attendance sheet.

     Put together: punch succeeds → button correctly flips to "Check out" → a few seconds later a stale
     answer lands → ATT.recs is overwritten with records that do not contain the punch → the button
     flips BACK to "Check in" and the calendar square goes grey again. The staff member watches their
     successful punch visibly un-happen, concludes it failed, and punches again.

     This merge keeps today's locally-known punch whenever the server's copy has not caught up yet.
     The server still wins on everything it actually knows — times, status, approval, selfie URLs — it
     simply may not DELETE a check-in or check-out we have already seen land.
     ============================================================================================ */
  function mergeServerRecs(records){
    var recs=(records||[]).slice(), t=todayS(), loc=todayRec();
    if(!loc || (!loc.checkIn && !loc.checkOut)) return recs;
    var srv=null;
    for(var i=0;i<recs.length;i++){ if(String(recs[i].date).slice(0,10)===t){ srv=recs[i]; break; } }
    if(!srv){ recs.push(loc); return recs; }                       // server has nothing for today yet — keep ours
    if(loc.checkIn  && !srv.checkIn ){ srv.checkIn =loc.checkIn;  srv._local=true; }
    if(loc.checkOut && !srv.checkOut){ srv.checkOut=loc.checkOut; srv._local=true; }
    if(!srv.status && loc.status) srv.status=loc.status;
    return recs;
  }
  function refreshAfterSync(){ API.myAttendance(ymNow()).then(function(x){ if(x&&x.ok){ ATT.recs=mergeServerRecs(x.records); if(document.getElementById('attMe')) paintMe(); } }); }
  /* ============================================================================================
     WHEN THE QUEUE ACTUALLY GETS FLUSHED — v333

     The real work is done by Background Sync in the service worker: the operating system wakes
     the worker when connectivity returns, with the app closed and the phone in a pocket. That is
     the fix for "it doesn't send by itself", and nothing on this page is required for it.

     Everything below is the FALLBACK, and it exists for one specific reason: iOS has no
     Background Sync at all. On an iPhone the only moments code can run are moments the app is
     actually on screen, so every one of them is used.

     v325 had just two: a 60-second interval, and the `online` event. Both are near-useless in
     practice — the interval only ticks while the tab is unfrozen, and `online` fires only on a
     transition, which never happens on the far more common Indian-branch case of a phone that
     kept a cell connection the whole time and simply had no usable throughput. Note that api.js
     has had `focus` + 30s + `online` on its generic outbox for a long time; the punch queue, the
     one thing that decides people's pay, had the weakest triggers in the app. */
  function pqWake(why){
    if(!PQ) return;
    PQ.repair(myToken(), myEmpId(), myApiUrl())     /* un-strand anything left by an older api.js */
      .then(function(){ return PQ.releaseHolds(); })
      .then(function(){ return (why==='online'||why==='login') ? PQ.clearCooldowns() : null; })
      .then(function(){ return PQ.registerSync(); })
      .then(function(){ return pqSync(); })
      .catch(function(){});
  }
  try{ pqMigrateLegacy().then(function(){ pqRefresh(); pqWake('load'); }); }catch(e){}
  try{
    /* The connection came back. Cool-offs exist because a send failed, and that reason is gone. */
    window.addEventListener('online', function(){ setTimeout(function(){ pqWake('online'); }, 1200); });
    /* THE ONE THAT MATTERS ON iOS. A phone coming out of a pocket fires visibilitychange, not
       `online` and not a timer — the timer was frozen the whole time it was in there. */
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) pqWake('visible'); });
    window.addEventListener('pageshow', function(){ pqWake('pageshow'); });
    window.addEventListener('focus', function(){ pqWake('focus'); });
    /* Signing in is what unblocks a punch that was waiting for its owner to come back — and it is
       also the first moment we know who to attribute a punch left over from v325 to. */
    window.addEventListener('nk-login', function(){
      pqMigrateLegacy().then(function(){ pqRefresh(); pqWake('login'); });
    });
    /* The worker flushed something while we were idle — repaint so the ☁ disappears. */
    if(navigator.serviceWorker){
      navigator.serviceWorker.addEventListener('message', function(e){
        if(e.data && e.data.type==='PUNCH_SYNCED'){ pqRefresh(); if(e.data.sent) refreshAfterSync(); }
      });
    }
  }catch(e){}
  try{ setInterval(function(){ if(!document.hidden) pqWake('tick'); }, 45000); }catch(e){}

  function renderAttendance(){
    var v=$id('page-attendance');
    v.innerHTML='<div class="page-head"><h1>Attendance</h1></div>'+
      '<input type="file" id="attSelfie" accept="image/*" capture="user" style="display:none">'+
      '<div id="attMe"></div>'+
      (canApprove()?'<div class="section-label" style="margin-top:18px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">Approve — today<span id="attApSummary"></span></div>'+
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0 10px">'+
          '<input id="attApName" placeholder="Search name…" style="border:1px solid #d9d9d9;border-radius:8px;padding:6px 8px;font-size:13px;flex:1;min-width:130px;max-width:220px">'+
          '<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#888">From<input type="date" id="attApDate" value="'+todayS()+'" style="border:1px solid #d9d9d9;border-radius:8px;padding:6px 8px;font-size:13px">To<input type="date" id="attApDateTo" value="" title="Optional — leave blank for a single day" style="border:1px solid #d9d9d9;border-radius:8px;padding:6px 8px;font-size:13px"></span>'+
          '<button class="btn sm" id="attApGo">Show</button>'+
          '<button class="btn sm ghost" id="attPdfBtn" style="display:inline-flex;align-items:center;gap:5px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> Monthly PDF</button>'+
        '</div>'+
        '<div id="attApprove"></div>':'')+
      '<div style="height:110px"></div>';   // bottom spacer so the last approve card clears the mobile bottom nav
    $id('attSelfie').onchange=function(){
      var f=this.files[0];
      /* v333: some browsers DO fire `change` with an empty list when the picker is dismissed. The
         old code returned here and left the resolver dangling, which is one of the ways ATT.busy
         got stuck true and the punch button went dead. Resolve it as a cancellation instead. */
      if(!f){ var c0=_pendingSelfieCb; _pendingSelfieCb=null; if(c0) c0(null); return; }
      var fr=new FileReader();
      fr.onload=function(){
        resizeDataUrl(fr.result, function(b64){
          var cb=_pendingSelfieCb; _pendingSelfieCb=null;
          if(cb) cb(b64); else submitMark(ATT.kind, b64);   // no camera-flow resolver waiting — used standalone
        });
      };
      /* And if the file cannot be read at all, that must not strand the punch either. */
      fr.onerror=function(){ var c1=_pendingSelfieCb; _pendingSelfieCb=null; toast('Could not read that photo — please try again.',true); if(c1) c1(null); };
      fr.readAsDataURL(f); this.value='';
    };
    paintMe();
    /* v295 — TWO RACES ON ONE LINE EACH.

       (a) These two calls both assigned ATT.recs, and nothing decided who won. IndexedDB is usually
           quicker than the network, so usually the fresh answer landed second and everything looked
           fine — but "usually" is not a guarantee. When the server answered quickly and IndexedDB
           was slow (a cold DB, a busy phone), the CACHED copy landed last and overwrote the live
           one. The screen then showed attendance from the previous session.
       (b) Neither used mergeServerRecs, so both could erase a punch that had just landed — the same
           button-flips-back bug as the post-punch refresh, on the page-open path this time.

       Fixed with a sequence number: a stale reply is simply ignored if a fresher one already applied.
       The cached read is the low-priority one; it only paints if nothing better has arrived yet. */
    var _seq=(ATT._loadSeq=(ATT._loadSeq||0)+1);
    API.cachedAttendance().then(function(r){
      if(_seq!==ATT._loadSeq) return;              // a newer page-open superseded this one
      if(ATT._liveIn===_seq) return;               // the live answer already landed — don't go backwards
      if(r&&r.records){ ATT.recs=mergeServerRecs(r.records); paintMe(); }
    });
    API.myAttendance(ymNow()).then(function(r){
      if(_seq!==ATT._loadSeq) return;
      if(r&&r.ok){ ATT._liveIn=_seq; ATT.recs=mergeServerRecs(r.records); paintMe(); }
    });
    if(canApprove()){
      loadApprove(todayS());
      var apGo=$id('attApGo'); if(apGo) apGo.onclick=function(){ loadApprove($id('attApDate').value||todayS(), ($id('attApDateTo')||{}).value||''); };
      var apName=$id('attApName'); if(apName) apName.oninput=function(){ if(_approveCache&&_approveCache.recs) renderApproveRecs(_approveCache.recs); };
      var pdfBtn=$id('attPdfBtn'); if(pdfBtn) pdfBtn.onclick=function(){ downloadAttPdf(); };
    }
  }

  function downloadAttPdf(){
    var btn=$id('attPdfBtn'); if(btn){ btn.textContent='Generating…'; btn.disabled=true; }
    var dateVal=($id('attApDate')&&$id('attApDate').value)||todayS();
    var ym=dateVal.slice(0,7);
    API.monthlyAttendance('',ym).then(function(r){
      if(btn){ btn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> Monthly PDF'; btn.disabled=false; }
      if(!r||!r.ok){ toast((r&&r.error)||'Failed',true); return; }
      loadJsPDFAndGenerate(r.attendance||[], r.employees||[], ym);
    }).catch(function(){ if(btn){ btn.innerHTML='Monthly PDF'; btn.disabled=false; } toast('Failed to fetch data',true); });
  }

  function loadJsPDFAndGenerate(attRows, employees, ym){
    if(window.jspdf&&window.jspdf.jsPDF){ generateAttPdf(attRows,employees,ym); return; }
    var s1=document.createElement('script');
    s1.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s1.onload=function(){
      var s2=document.createElement('script');
      s2.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
      s2.onload=function(){ generateAttPdf(attRows,employees,ym); };
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  }

  function generateAttPdf(attRows, employees, ym){
    var jsPDF=window.jspdf.jsPDF;
    var parts=ym.split('-'), yr=parseInt(parts[0]), mo=parseInt(parts[1]);
    var daysInMonth=new Date(yr,mo,0).getDate();
    var attMap={};
    attRows.forEach(function(r){
      var day=parseInt((r.date||'').split('-')[2]||0); if(!day) return;
      if(!attMap[r.empId]) attMap[r.empId]={};
      var st=String(r.status||'').toLowerCase();
      attMap[r.empId][day]=st==='present'?'P':st==='half'?'P/2':st==='leave'?'L':st==='holiday'?'WO':'A';
    });
    var days=[]; for(var i=1;i<=daysInMonth;i++) days.push(i);
    var head=[['Emp','Name'].concat(days.map(String)).concat(['FD','HL','Abs'])];   // FD = full days only (half-days counted in HL, not here)
    var body=employees.map(function(e){
      var row=[e.EmpID||'',e.FullName||''], fd=0, hl=0, abs=0;
      for(var d=1;d<=daysInMonth;d++){
        var s=(attMap[e.EmpID]&&attMap[e.EmpID][d])||'A';
        if(s==='P') fd++; else if(s==='P/2'){ hl++; } else if(s==='A') abs++;   // FD = full days only, do not add half-days
        row.push(s);
      }
      row.push(String(fd),String(hl),String(abs)); return row;
    });
    var doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    doc.setFontSize(11); doc.setTextColor(218,16,23);
    doc.text('Nakoda Diagnostics And Research Center',10,8);
    doc.setTextColor(60,60,60); doc.setFontSize(9);
    doc.text('Attendance Report — '+ym,10,14);
    var colStyles={0:{cellWidth:12},1:{cellWidth:28}};
    for(var c=2;c<daysInMonth+2;c++) colStyles[c]={cellWidth:5.5};
    colStyles[daysInMonth+2]={cellWidth:8}; colStyles[daysInMonth+3]={cellWidth:8}; colStyles[daysInMonth+4]={cellWidth:8};
    doc.autoTable({
      head:head, body:body, startY:18,
      styles:{fontSize:5.5,cellPadding:1,halign:'center'},
      headStyles:{fillColor:[218,16,23],textColor:255,fontStyle:'bold'},
      columnStyles:colStyles,
      didParseCell:function(d){
        if(d.section==='body'&&d.column.index>=2&&d.column.index<=daysInMonth+1){
          var v=d.cell.text[0];
          if(v==='P') d.cell.styles.fillColor=[234,247,239];
          else if(v==='A') d.cell.styles.fillColor=[253,236,236];
          else if(v==='P/2') d.cell.styles.fillColor=[255,248,225];
          else if(v==='L') d.cell.styles.fillColor=[235,235,255];
        }
      }
    });
    doc.save('attendance-'+ym+'.pdf');
    toast('PDF downloaded');
  }

  function paintMe(){
    var box=$id('attMe'); if(!box) return;
    warmGeo();   // start GPS early so the fix is ready before the punch button is tapped
    var rec=todayRec(), now=new Date();
    /* v201: a punch saved on the phone counts as done locally — no double punching, clear "waiting" label */
    var qIn=qToday('in'), qOut=qToday('out'), qN=qWaitingCount();
    if(!rec && qIn) rec={checkIn:qIn.time, checkOut:(qOut?qOut.time:''), _queued:true};
    else if(rec && rec.checkIn && !rec.checkOut && qOut) rec={checkIn:rec.checkIn, checkOut:qOut.time, attId:rec.attId, selfieInUrl:rec.selfieInUrl, selfieOutUrl:'x', _queued:true};
    var dutyTxt=(S.user&&S.user.DutyStart)?('Shift '+fmtDutyTime(S.user.DutyStart)+(S.user.DutyEnd?('–'+fmtDutyTime(S.user.DutyEnd)):'')+((S.user.AltDutyStart)?(' (or alt shift '+fmtDutyTime(S.user.AltDutyStart)+(S.user.AltDutyEnd?('–'+fmtDutyTime(S.user.AltDutyEnd)):'')+')'):'')):'';
    var inb = !rec || !rec.checkIn;
    /* v295: a punch in flight now OWNS the button. Previously the only feedback was a toast that faded
       after a couple of seconds, so from the staff member's point of view the screen simply sat there
       looking exactly as it had before they tapped — which is why they tapped again. The button is
       disabled while sending, so a second tap is impossible rather than merely discouraged. */
    var btn;
    if(ATT.sending){
      btn='<button class="att-big sending" id="attBtn" disabled><span class="att-spin"></span> Sending punch…</button>';
    } else {
      btn = inb
        ? '<button class="att-big in" id="attBtn">⊕ Check in</button>'
        : (!rec.checkOut ? '<button class="att-big out" id="attBtn">⊖ Check out</button>' : '<div class="att-done">✓ Done for today</div>');
    }
    /* v335: for the first half-minute after a punch the live request is very probably still in
       flight, and telling the person their punch is "waiting to send" during that window is both
       untrue and exactly the ☁/amber noise this build set out to remove. It reappears the moment
       the send genuinely hands off to the queue — handOff clears optUntil — and it is never
       suppressed when there is more than one punch waiting, because then something really is
       stuck and they need to know. */
    var _opt = !!(ATT.optUntil && Date.now() < ATT.optUntil && qN === 1);
    var stat = rec ? ('In '+(rec.checkIn||'—')+(rec.checkOut?(' · Out '+rec.checkOut):'')+(rec.workHours?(' · '+rec.workHours+'h'):'')+(String(rec.late)==='yes'?' · ⚠ late (½ day)':'')+((rec._queued&&!_opt)?' · ☁ waiting to send':'')) : 'Not checked in yet';
    /* v325: a "Send now" the staff member can actually press, instead of watching a number that
       never moves and having no way to ask why.
       v333: the wording is now true. Before this build "will send automatically" was a promise
       nothing kept — the retry was a page timer and the page was frozen. It is Background Sync
       that keeps it, so the line says which phone state it survives. */
    var qNote = (qN && !_opt) ? '<div class="att-note" style="color:#854F0B;font-weight:600">☁ '+qN+' punch'+(qN>1?'es':'')+' saved on this phone — '+
        'will send by '+(PQ&&self.SyncManager?'itself, even with the app closed':'itself when you next open the app with internet')+
        '. <span id="attSendNow" style="text-decoration:underline;cursor:pointer;white-space:nowrap">Send now</span></div>' : '';
    /* v333 — PUNCHES THAT COULD NOT BE RECORDED ARE NOW SHOWN, NOT SWALLOWED.
       v325 counted a punch's failures and, on the twelfth, deleted it with a toast that was gone
       in three seconds. If the staff member was not looking at the screen at that exact moment —
       and they were not, because the retry ran in the background — the punch simply ceased to
       exist and the day turned red with no explanation anybody could act on. That is the "shows
       P and later shows L" report. A punch that genuinely cannot be recorded now stays on this
       screen, with its date, its time and the reason, until it is handed to a manager. */
    var deadNote='';
    (ATT.q.dead||[]).forEach(function(d){
      deadNote += '<div class="att-note" style="color:#b23b3b;font-weight:700;text-align:left;border:1px solid #f3c9c9;background:#fdf3f3;border-radius:8px;padding:8px 10px;margin-top:8px">'+
        '⚠ '+esc(d.kind==='in'?'Check-in':'Check-out')+' of '+esc(d.date)+' '+esc(d.time||'')+' was not recorded<br>'+
        '<span style="font-weight:500;color:#7a4a4a">'+esc(d.deadReason||'')+'</span><br>'+
        '<span class="attDeadOk" data-p="'+esc(d.punchId)+'" style="text-decoration:underline;cursor:pointer;font-weight:600">I have told my manager — hide this</span></div>';
    });
    // Alternate Sunday counter
    var sundayNote='';
    var sw__=String((S.user&&S.user.SundayWork)||'').toLowerCase().trim();
    if(sw__==='alternate'){
      var ym__=todayS().slice(0,7);
      var sunWorked=(ATT.recs||[]).filter(function(r){ if(String(r.date).slice(0,7)!==ym__) return false; var d__=new Date(String(r.date)); return !isNaN(d__.getTime())&&d__.getDay()===0&&r.checkIn; }).length;
      var sunLeft=Math.max(0,2-sunWorked);
      sundayNote='<div class="att-note" style="color:'+(sunLeft>0?'#1a8f4c':'#b23b3b')+';font-weight:600">📅 Alternate Sunday: '+sunWorked+'/2 Sundays worked this month'+(sunLeft>0?' · '+sunLeft+' remaining':' · limit reached — no more Sunday check-ins this month')+'</div>';
    }
    // Recovery path: if a punch went through but its selfie never made it to Drive (closed the app too
    // fast, storage cleared, repeated upload failures), don't leave it stuck blank forever — let the
    // employee attach one themselves straight from this screen.
    // v283: `!rec._local` matters. A record we have just painted optimistically from the punch response has
    // no selfie URL yet — not because the upload failed, but because we have not asked the server again.
    // Without this guard every successful punch would flash "your selfie didn't save" for a second or two.
    /* v335: the photo now travels a moment behind the punch, so there is a short window in which
       the row genuinely has no selfie URL and nothing is wrong. This phone is holding the photo
       job, so it knows the difference — say "uploading", not "didn't save". The red warning is
       still exactly right once the job is gone and the cell is still empty. */
    var _phPend = (ATT.q.photos||[]).filter(function(p){ return rec && rec.attId && String(p.attId)===String(rec.attId); }).length > 0;
    var photoNote = _phPend ? '<div class="att-note" style="color:#5f6672">📷 Photo uploading in the background — you can close the app.</div>' : '';
    var missingKind = _phPend ? '' : ((rec && !rec._local && rec.checkIn && !rec.selfieInUrl && rec.attId) ? 'in' : ((rec && !rec._local && rec.checkOut && !rec.selfieOutUrl && rec.attId) ? 'out' : ''));
    /* v339: same "photo missing" case as before (nothing about when a punch is blocked changes, and
       the fix is still captureSelfie → API.attachSelfie below) — just impossible to miss instead of a
       small red line low on the card. Punch time/location were never at risk either way. */
    var missingNote = missingKind ? '<div class="att-note" style="margin-top:8px;border:1px solid #f5c56b;background:#fff8ea;border-radius:10px;padding:10px 12px;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">'+
      '<span style="font-weight:700;color:#8a5a00">📷 Your '+(missingKind==='in'?'check-in':'check-out')+' photo is missing</span>'+
      '<span id="attFixSelfie" style="flex:none;background:#E4292E;color:#fff;font-weight:700;font-size:12.5px;padding:8px 16px;border-radius:999px;cursor:pointer;white-space:nowrap">📷 Add photo now</span>'+
      '</div>' : '';
    box.innerHTML='<div class="att-card"><div class="att-day">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()]+', '+now.getDate()+' '+MON[now.getMonth()]+'</div>'+
      '<div class="att-sub">'+esc(dutyTxt)+'</div>'+btn+
      '<div class="att-stat">'+esc(stat)+'</div>'+
      '<div class="att-note">'+[ (needSelfie()?'📷 selfie':''), ('📍 location'+(isFenced()?' verified at your branch':'')) ].filter(Boolean).join(' + ')+' · Late after shift+15 min = half day.</div>'+
      photoNote+
      missingNote+
      qNote+
      deadNote+
      sundayNote+'</div>'+
      monthStrip();
    if(!ATT.sending) pqSync();   // v201: any saved punches get a sync chance every time this screen paints
    var b=$id('attBtn'); if(b && !ATT.sending) b.onclick=function(){ doMark(inb?'in':'out'); };
    box.querySelectorAll('.attDeadOk').forEach(function(el){
      el.onclick=function(){ if(PQ) PQ.dismiss(el.getAttribute('data-p')).then(function(){ pqRefresh(); }); };
    });
    var sn=$id('attSendNow'); if(sn) sn.onclick=function(){
      if(!navigator.onLine){ toast('Still no internet — they will send by themselves the moment it returns.', true); return; }
      sn.textContent='Sending…';
      /* Force the queue wide open: free anything held or cooling, and clear the busy flag in case a
         previous attempt never settled. Re-sending is harmless — the server recognises the punchId
         and replays its original answer rather than writing the punch twice. */
      if(!PQ) return;
      _pqBusy=false;
      PQ.repair(myToken(), myEmpId(), myApiUrl()).then(PQ.releaseHolds).then(PQ.clearCooldowns).then(pqSync).then(function(res){
        res=res||{sent:0,dead:0,left:0};
        if(res.sent && !res.left) toast('All saved punches sent ✓');
        else if(res.sent) toast(res.sent+' sent ✓ · '+res.left+' still trying.');
        else if(res.dead) toast('A saved punch could not be recorded — see the red note above.', true);
        else if(res.left) toast(res.left+' punch'+(res.left>1?'es':'')+' still waiting — the phone will keep trying by itself.', true);
        else toast('Nothing left to send ✓');
        pqRefresh();
      }).catch(function(){ paintMe(); });
    };
    var fix=$id('attFixSelfie'); if(fix) fix.onclick=function(){
      fix.textContent='Opening camera…';
      captureSelfie(function(b64){
        API.attachSelfie({attId:rec.attId, kind:missingKind, base64:b64}).then(function(r){
          toast((r&&r.ok)?'Selfie added':'Saved on device — will sync');
          API.myAttendance(ymNow()).then(function(x){ if(x&&x.ok){ ATT.recs=mergeServerRecs(x.records); paintMe(); } });   // v295: never let a stale reply erase a punch we know landed
        });
      });
    };
  }
  function monthStrip(){
    var by={}; (ATT.recs||[]).forEach(function(r){ by[r.date]=r; });
    /* v201: phone-saved punch shows as pending P.
       v333: only THIS employee's queued punches. On a shared branch phone the queue can be
       holding a colleague's punch, and painting it here told the wrong person they had worked
       that day. `waiting` is already filtered to the signed-in employee; dead punches are
       deliberately excluded, because a punch that could not be recorded is not a day worked —
       the red note above the strip is what explains that day instead. */
    (ATT.q.waiting||[]).forEach(function(p){ if(!by[p.date]) by[p.date]={date:p.date, status:'present', checkIn:p.time, _queued:true}; });
    var sundayOn=['every','alternate'].indexOf(String((S.user&&S.user.SundayWork)||'').toLowerCase().trim())>=0;   // do they work Sundays?
    var punchExempt=String((S.user&&S.user.PunchRequired)||'').toLowerCase().trim()==='no';   // partners/exempt aren't expected to punch → never mark their blank days Absent
    var now=new Date(), y=now.getFullYear(), m=now.getMonth(), days=new Date(y,m+1,0).getDate(), cells='';
    var todayStr=y+'-'+String(m+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
    // Don't paint days before the person joined as absent. JoiningDate may be a date string or Date.
    var joinCut=''; try{ var _j=(S.user&&(S.user.JoiningDate||''))||''; if(_j){ var _jd=new Date(_j); if(!isNaN(_jd.getTime())) joinCut=_jd.getFullYear()+'-'+String(_jd.getMonth()+1).padStart(2,'0')+'-'+String(_jd.getDate()).padStart(2,'0'); } }catch(e){}
    for(var d=1;d<=days;d++){ var ds=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0'); var r=by[ds];
      var dt=new Date(ds+'T00:00'), isSun=dt.getDay()===0, future=dt>now, hasPunch=r&&(String(r.status)==='present'||String(r.status)==='half');
      var cls='wW',ch=''+d; if(r){ var st=String(r.status); cls=st==='present'?'wP':st==='half'?'wL':st==='leave'?'wL':st==='absent'?'wA':'wP'; ch=(st==='half'?'½':(st==='leave'?'L':(st==='absent'?'A':'P'))); if(r._queued){ cls+=' wQ'; } }
      else if(future){ cls='wF'; ch=''+d; }
      // v228: a PAST working day with no punch shows a red "A" (Absent). Genuine lost punches are now
      // repaired by the backfill tools and the root-cause offline-drop bug is fixed, so a blank working day
      // means the person really was absent (or needs a manual backfill). Punch-exempt partners are excluded.
      else if(!isSun && !punchExempt && ds<todayStr && (!joinCut || ds>=joinCut)){ cls='wA'; ch='A'; }
      // Sunday coloring: a weekly-off Sunday shows a blue date; a working Sunday with no punch shows a red L.
      if(isSun && !hasPunch){
        if(!sundayOn){ cls='wSun'; ch=''+d; }        // Sunday off in profile → blue date (not counted absent)
        else if(!future){ cls='wA'; ch='L'; }        // Sunday is a working day but no punch → red L
      }
      cells+='<span class="wd '+cls+'" title="'+ds+'">'+ch+'</span>';
    }
    return '<div class="att-month"><div class="att-mh">This month</div><div class="att-strip">'+cells+'</div><div class="att-legend">P present · ½ half · L leave · A absent</div></div>';
  }

  // Selfies only need to be big enough to identify someone in an 80x80 thumbnail — shrinking before upload
  // cuts the payload from a multi-MB camera frame down to well under 100KB, which is most of what made
  // punch-in/out feel slow on a normal mobile connection.
  var SELFIE_MAX_DIM=560, SELFIE_QUALITY=0.62;   // smaller payload = faster punch on slow phones/networks
  function resizeDataUrl(dataUrl, cb){
    var img=new Image();
    img.onload=function(){
      var scale=Math.min(1, SELFIE_MAX_DIM/Math.max(img.width,img.height));
      var c=document.createElement('canvas'); c.width=Math.max(1,Math.round(img.width*scale)); c.height=Math.max(1,Math.round(img.height*scale));
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      var d=c.toDataURL('image/jpeg',SELFIE_QUALITY), i=d.indexOf(',');
      cb(d.slice(i+1));
    };
    img.onerror=function(){ var i=dataUrl.indexOf(','); cb(dataUrl.slice(i+1)); };   // resize failed — send original rather than block the punch
    img.src=dataUrl;
  }
  var _pendingSelfieCb=null;
  /* ============================================================================================
     v333 — "THE CHECK OUT BUTTON IS NOT CLICKABLE".

     THE BUG. doMark sets ATT.busy=true and hands off to captureSelfie, and NOTHING clears it until
     the selfie callback fires. The callback fired on exactly one path: tapping 📸 Capture. Every
     other way out of that camera window called neither `cb` nor anything else:

         • the Cancel button          — stopCam(); closeModal();  …and then nothing
         • the × in the modal header  — openModal's own onclick="closeModal()"
         • tapping the dark backdrop  — openModal's mousedown handler on #ov
         • the file-picker fallback, dismissed without choosing a photo (no `change` event fires)

     So the moment anybody opened the camera and backed out of it, ATT.busy stayed true for the
     REST OF THE SESSION, and every later tap on Check in / Check out hit the guard at the top of
     doMark and returned. The button looked completely normal, and did nothing. The only clue was
     a toast saying "Your punch is being sent" — which is easy to miss and, worse, reads like the
     punch is on its way, so the person waits instead of reloading. Closing and re-opening the app
     was the only cure, and nobody knew that.

     This is not new in v333 — it is in the build running in the branches today.

     THE FIX, in three parts, because one is not enough:
       1. `done()` is a once-only resolver, and EVERY exit calls it — Cancel, ×, backdrop, a
          dismissed file picker. Cancelling now resolves with null, which startMark already knows
          how to handle ("nothing was captured, nothing to preserve").
       2. A poll watches for the camera window vanishing by any means at all, including routes
          added to openModal in future. If the video element is gone and we have not resolved, the
          user closed it.
       3. doMark carries a watchdog, so even a path nobody has thought of cannot leave the button
          permanently dead. A stuck flag now costs 90 seconds, not the whole day.
     ============================================================================================ */
  function captureSelfie(cb){
    var _done=false, _poll=null, _focusT=null;
    function done(v){
      if(_done) return;
      _done=true;
      if(_poll){ clearInterval(_poll); _poll=null; }
      if(_focusT){ clearTimeout(_focusT); _focusT=null; }
      try{ window.removeEventListener('focus', onFocusBack); }catch(e){}
      if(_pendingSelfieCb===done) _pendingSelfieCb=null;
      try{ cb(v); }catch(e){}
    }
    /* The file picker gives NO event when it is dismissed. The window regaining focus is the only
       signal there is, so if a moment later no photo has arrived, treat it as cancelled. */
    function onFocusBack(){
      if(_done) return;
      if(_focusT) clearTimeout(_focusT);
      _focusT=setTimeout(function(){ if(!_done && _pendingSelfieCb===done) done(null); }, 2500);
    }
    /* Opening the file dialog from JavaScript needs TRANSIENT USER ACTIVATION — the browser only
       allows it for a few seconds after a real tap, and it refuses SILENTLY otherwise: no dialog,
       no error, no console warning, nothing.

       That is fatal on the desktop path. The chain is
           click → doMark → startMark → captureSelfie → getUserMedia(...).catch → input.click()
       and that .catch runs after an async round trip. On a PC with no webcam, or where the camera
       permission prompt sat on screen for a few seconds before being dismissed, the activation has
       expired by the time we get there — so `input.click()` does absolutely nothing and the staff
       member sees the button do absolutely nothing. Combined with the stuck-busy flag (see above),
       every later click was dead too.

       So: use the direct call ONLY while we still hold the original tap (the synchronous path, when
       the browser has no camera API at all), and otherwise put a real button on screen. Clicking
       that button is itself a fresh user gesture, so the dialog always opens. */
    function pickNow(){
      _pendingSelfieCb=done;
      try{ window.addEventListener('focus', onFocusBack); }catch(e){}
      $id('attSelfie').click();
    }
    function useFilePicker(){ pickNow(); }          /* only safe inside the original tap */
    function askForPhoto(msg){                       /* safe anywhere — the user provides the gesture */
      if(_done) return;
      openModal('Add your photo',
        '<div style="text-align:center">'+
        '<div style="font-size:13px;color:#555;margin-bottom:14px">'+esc(msg)+'</div>'+
        '<button class="btn" id="selPick" style="cursor:pointer">📷 Choose or take photo</button> '+
        '<button class="btn ghost" id="selCancel" style="cursor:pointer">Cancel</button></div>','');
      var chose=false;
      var pick=document.getElementById('selPick');
      if(pick) pick.onclick=function(){ chose=true; closeModal(); pickNow(); };   // a REAL tap — the dialog opens
      var can=document.getElementById('selCancel');
      if(can) can.onclick=function(){ closeModal(); done(null); };
      /* If this window disappears by the × or the backdrop — i.e. without "Choose" being pressed —
         that is a cancellation, and the punch must be released rather than left hanging. */
      if(_poll) clearInterval(_poll);
      _poll=setInterval(function(){
        if(_done){ clearInterval(_poll); _poll=null; return; }
        if(document.getElementById('selPick')) return;      // still on screen
        clearInterval(_poll); _poll=null;
        if(!chose) done(null);
      }, 400);
    }
    /* ============================================================================================
       v335 — ON A PHONE THE CAMERA OPENS, AND NOTHING IS ASKED FIRST.

       THE COMPLAINT. "Don't ask like that — just open camera and take selfie like previous."
       Every punch on Android was showing an "Add your photo — 📷 Choose or take photo" window
       before the camera. Two extra taps and a paragraph of English, to take a selfie.

       WHY IT APPEARED. That window is v333's fix for a real desktop bug: on a PC the getUserMedia
       failure arrives after an async round trip, by which time the browser has withdrawn the
       transient user activation, and a file dialog opened from code is then refused SILENTLY —
       the button looked completely dead. The window solves that, because tapping ITS button is a
       fresh gesture.

       But on Android it fires on nearly every punch, because an INSTALLED PWA has its own camera
       permission, separate from Chrome's, and Android denies getUserMedia to it far more often
       than it grants it. So the desktop rescue became the normal mobile experience.

       THE FIX. A phone does not need getUserMedia at all. <input capture="user"> opens the phone's
       own full-screen camera — shutter button, flip button, the lot — and that is what this app
       used before v333. So on a phone we go straight there, still inside the original tap where
       the activation is unquestionably live. getUserMedia and the "Add your photo" window are now
       only for a desktop browser, which is the only place they were ever needed.

       Everything the v333 note above describes is untouched: done() is still a once-only resolver,
       the focus watchdog still catches a dismissed picker, and doMark still has its 90-second
       watchdog. The button cannot go dead on either path.
       ============================================================================================ */
    if(phoneCam()){ pickNow(); return; }
    if(!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)){ useFilePicker(); return; }  // fallback to file/camera input
    var stream=null;
    openModal('Take selfie','<div style="text-align:center"><video id="camV" autoplay playsinline muted style="width:100%;max-width:320px;border-radius:10px;background:#000"></video><canvas id="camC" style="display:none"></canvas><div style="margin-top:10px"><button class="btn" id="camSnap" disabled style="opacity:.55">Starting camera\u2026</button> <button class="btn ghost" id="camCancel">Cancel</button></div></div>','');
    var v=document.getElementById('camV');
    // BLACK-SELFIE FIX: capturing before the camera delivers its first frame produced an empty black
    // photo (punch went through with no face). Keep Capture disabled until real frames are flowing.
    function camReady(){ var s2=document.getElementById('camSnap'); if(s2&&v.videoWidth>0){ s2.disabled=false; s2.style.opacity=''; s2.innerHTML='📸 Capture'; } }
    navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}}).then(function(st){ stream=st; v.srcObject=st; v.onloadeddata=camReady; v.onplaying=camReady; setTimeout(camReady,1200); setTimeout(camReady,2500); }).catch(function(){ if(_poll){ clearInterval(_poll); _poll=null; } closeModal(); askForPhoto('This device has no camera available, or the camera is blocked. Choose a photo instead — your punch will still be recorded.'); });
    function stopCam(){ try{ if(stream) stream.getTracks().forEach(function(t){t.stop();}); }catch(e){} }
    var snap=document.getElementById('camSnap'); if(snap) snap.onclick=function(){
      if(!v.videoWidth){ toast('Camera is still starting — wait a second and tap again.',true); return; }
      var c=document.getElementById('camC'), vw=v.videoWidth||320, vh=v.videoHeight||240, scale=Math.min(1, SELFIE_MAX_DIM/Math.max(vw,vh));
      c.width=Math.max(1,Math.round(vw*scale)); c.height=Math.max(1,Math.round(vh*scale));
      c.getContext('2d').drawImage(v,0,0,c.width,c.height);
      var d=c.toDataURL('image/jpeg',SELFIE_QUALITY),i=d.indexOf(',');
      stopCam(); closeModal(); done(d.slice(i+1));
    };
    var cancel=document.getElementById('camCancel'); if(cancel) cancel.onclick=function(){ stopCam(); closeModal(); done(null); };
    /* The × and the backdrop are openModal's own, and neither knows about us. Rather than reach
       into app.js, notice that the camera window is gone. This also covers any future way of
       closing a modal without touching this file again. */
    _poll=setInterval(function(){
      if(_done){ clearInterval(_poll); _poll=null; return; }
      if(!document.getElementById('camV')){ stopCam(); done(null); }
    }, 400);
  }
  function promptEarlyReason(cb){
    openModal('Leaving early?','<div style="font-size:13px;color:#555;margin-bottom:8px">You’ve worked under 4 hours — this will be marked <b>half day</b> and sent for approval. Please add a reason:</div><textarea id="earlyReason" rows="2" placeholder="e.g. doctor appointment" style="width:100%;border:1px solid #d9d9d9;border-radius:8px;padding:8px;font-size:13px"></textarea>','<button class="btn ghost" onclick="closeModal()">Cancel</button> <button class="btn" id="earlyOk">Confirm check-out</button>');
    var ok=document.getElementById('earlyOk'); if(ok) ok.onclick=function(){ var v=(document.getElementById('earlyReason').value||'').trim(); if(!v){ toast('Please write a reason.',true); return; } closeModal(); cb(v); };
  }
  // Location and the selfie camera don't depend on each other, so fetch/open them at the same time instead
  // of waiting for GPS to resolve before even showing the camera — this alone can save several seconds,
  // especially on a weak signal (enableHighAccuracy can take up to 15s).
  // GPS WARM-UP (Vivo & similar phones need 2-3 taps because the FIRST high-accuracy fix from a cold
  // GPS chip takes longer than the 15s timeout — by the 2nd/3rd tap the chip is warm and it works).
  // Fix: start watching position as soon as the attendance screen opens (only if permission is already
  // granted — never pop the permission prompt early), so a fix is ready before the punch button is tapped.
  var _geoWatch=null, _lastFix=null;
  function warmGeo(){
    if(!navigator.geolocation || _geoWatch!=null) return;
    function start(){
      try{
        _geoWatch=navigator.geolocation.watchPosition(function(pos){ _lastFix={lat:pos.coords.latitude,lng:pos.coords.longitude,ts:Date.now()}; },function(){},{enableHighAccuracy:true,maximumAge:30000});
        setTimeout(function(){ if(_geoWatch!=null){ navigator.geolocation.clearWatch(_geoWatch); _geoWatch=null; } },120000);  // stop after 2 min — don't drain battery
      }catch(e){}
    }
    if(navigator.permissions&&navigator.permissions.query){ navigator.permissions.query({name:'geolocation'}).then(function(st){ if(st.state==='granted') start(); },function(){}); }
  }
  function getOnce_(hiAcc,timeoutMs){
    return new Promise(function(resolve,reject){
      navigator.geolocation.getCurrentPosition(function(pos){ resolve({lat:pos.coords.latitude,lng:pos.coords.longitude}); }, reject, {enableHighAccuracy:hiAcc, timeout:timeoutMs, maximumAge:60000});
    });
  }
  function getLocation_(){
    return new Promise(function(resolve,reject){
      if(!navigator.geolocation){ reject({code:0}); return; }
      if(_lastFix && (Date.now()-_lastFix.ts)<60000){ resolve({lat:_lastFix.lat,lng:_lastFix.lng}); return; }   // warm-up already got a recent fix — instant
      getOnce_(true,15000).then(resolve, function(err){
        if(err&&err.code===1){ reject(err); return; }   // permission denied — retrying won't help
        getOnce_(false,10000).then(resolve,reject);      // GPS timed out — fall back to network/cell location
      });
    });
  }
  function startMark(kind){
    if(!navigator.geolocation){ toast('Location not supported on this device.',true); return; }
    toast('Getting your location…');
    // An installed PWA (tap "Installed" / opened from the home-screen icon) runs as its OWN Android app —
    // granting location to "Chrome" does NOT grant it to this installed app. Different fix, so give different guidance.
    var installed=(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone===true;
    var geoP=getLocation_();
    var selfieP=needSelfie() ? new Promise(function(resolve){ captureSelfie(resolve); }) : Promise.resolve(null);
    geoP.then(function(loc){ ATT.coords=loc; }).catch(function(err){
      var msg;
      if(!err||err.code===1){
        msg = installed
          ? 'Location blocked. This installed app has its own Android permission — go to phone Settings → Apps → find this app by its own name/icon (not "Chrome") → Permissions → Location → Allow. Also check your phone\'s Location/GPS toggle is ON.'
          : 'Location blocked — go to phone Settings → Apps → Chrome/Browser → Permissions → Location → Allow. Also check your phone\'s Location/GPS toggle is ON.';
      } else if(err.code===3){ msg='Location timed out. Move to open area and try again.'; }
      else { msg='Location unavailable. Please try again.'; }
      toast(msg,true);
    });
    selfieP.then(function(b64){
      if(!b64){ ATT.busy=false; paintMe(); return; }   // the user cancelled the camera — nothing was captured, nothing to preserve
      /* v282 (bug A) — THE BIG ONE.
         This block used to `return` on a location failure. The selfie had already been taken, the camera
         had already closed, and the punch was then silently thrown away: nothing sent, nothing queued,
         no error at that moment. On an INSTALLED PWA this is the common case, not the edge case — Android
         gives the installed app its own location permission, separate from Chrome's, so staff who had
         "already allowed location" were denied here every single time. That is the "after photo capture,
         punch not done" report.
         A missing location must never destroy a punch. Attendance drives payroll. We now always submit —
         flagged noGeo so the approver can see the coordinates are absent and judge it — and the server
         records it rather than losing the day. Geo-fenced staff are still checked by the server; it simply
         cannot confirm the fence without coordinates, so the punch goes for approval instead of vanishing. */
      geoP.then(function(){ submitMark(kind,b64); }, function(err){
        var denied = (!err || err.code===1);
        if(denied){
          // Retrying a denied permission cannot succeed — submit immediately rather than stalling the user.
          ATT.coords=null; ATT.noGeo=true;
          toast('Sending your punch without location — it will go to your manager for approval.');
          submitMark(kind,b64);
          return;
        }
        // Timed out / unavailable: one automatic retry (the selfie is already taken, so never make her
        // retake it), and if that also fails we still submit rather than discard the punch.
        toast('Retrying location — keep the app open…');
        getLocation_().then(function(loc){ ATT.coords=loc; ATT.noGeo=false; submitMark(kind,b64); },
          function(){
            ATT.coords=null; ATT.noGeo=true;
            toast('Could not get location — punch sent without it, for manager approval.');
            submitMark(kind,b64);
          });
      });
    });
  }
  function doMark(kind){
    /* v295: a punch is already on its way (camera open, photo uploading, or waiting on the server).
       Without this, a staff member who taps twice while the camera is open gets TWO punchIds for what
       they intend as one punch — and two different punchIds are, correctly, two different punches as
       far as the server is concerned. The idempotency guard cannot help here; only this can. */
    /* v333 WATCHDOG — the punch button must never be permanently dead.
       ATT.busy covers the camera+GPS phase and ATT.sending covers the request. Both are cleared on
       every path we know about (see the note above captureSelfie for the ones that were missing),
       but a flag that can only ever be set by a tap and cleared by a callback is one unhandled exit
       away from bricking attendance for that person until they reinstall the app. So: a stuck flag
       now expires. Ninety seconds is far longer than any real camera+GPS round, and two minutes is
       longer than the longest request deadline (30 s) plus its retry. */
    if(ATT.busy && (!ATT.busyTs || (Date.now()-ATT.busyTs) > 90000)){ ATT.busy=false; }
    if(ATT.sending && ATT.sendingTs && (Date.now()-ATT.sendingTs) > 120000){ ATT.sending=null; }
    if(ATT.sending || ATT.busy){ toast('Your punch is being sent — one moment…'); return; }
    if(qToday(kind)){ toast('Already saved on this phone — it will send by itself. ✓'); return; }
    /* ============================================================================================
       v333 — THE SAME-MINUTE CHECK-OUT.

       Two of yesterday's approve cards read "In 12:04 · Out 12:04" and "In 11:07 · Out 11:07",
       both auto-marked "Early out (under 4h) — half day". Half a day of pay each, for a check-out
       nobody meant to make.

       There are two ways to arrive there and this guards the one that starts on the phone. With
       no internet, the check-in is staged locally and the button flips to "Check out" INSTANTLY
       (v295 made it optimistic, correctly — the old three-minute wait is what made people tap
       repeatedly). But an instant flip also invites the next tap: the staff member sees a red
       "Check out" where they expected confirmation, taps it to find out what it does, and the
       day is gone. Nothing anywhere refused it, and the server auto-approves an early-out without
       asking a manager.

       The second way in — a STALE queued check-out flushing on top of today's check-in — is
       fixed on the server (PUNCH_TOO_SOON), because only the server knows the recorded check-in
       time. Both ends are needed; neither alone is enough.
       ============================================================================================ */
    if(kind==='out'){
      var _in = qToday('in') || todayRec();
      var _inTs = _in && (_in.ts || null);
      var _mins = null;
      if(_inTs) _mins = (Date.now() - _inTs)/60000;
      else if(_in && _in.checkIn && /^\d{1,2}:\d{2}$/.test(String(_in.checkIn))){
        var _p=String(_in.checkIn).split(':'), _n=new Date();
        _mins = (_n.getHours()*60 + _n.getMinutes()) - ((+_p[0])*60 + (+_p[1]));
      }
      /* `_mins >= 0` is not decoration. The fallback branch above does plain minutes-since-midnight
         arithmetic, which goes NEGATIVE whenever the check-in time reads later in the day than the
         clock does — and for a night shift that is the normal case, not an edge case. Janvi Shah's
         duty is 11:00–08:30: she checks in at 11:00 and punches out at 08:00 the NEXT morning, so
         the sum is 480 − 660 = −180. Without this guard a negative number is "less than 3" and her
         Check out button would refuse for ever, every single night. A stale clock on any phone
         would do the same thing to a day shift. Only a genuinely just-now check-in should block. */
      if(_mins !== null && _mins >= 0 && _mins < 3){
        toast('You checked in less than 3 minutes ago. Checking out now would record a half day. Tap Check out when you actually leave.', true);
        return;
      }
    }
    ATT.kind=kind; ATT.outRemark=''; ATT.tapTs=Date.now();   // remember the REAL tap time for offline punches; under 4 hours auto-marks half day on the server — no reason prompt
    // v282: one id per TAP. Every retry, every WFH re-submit and every queue replay reuses it, so the
    // server can tell "the same punch arriving twice" apart from "the user punched twice".
    ATT.punchId=punchUuid(); ATT.noGeo=false;
    // v242: two-shift staff are no longer asked which shift they're on. The server infers it from the
    // punch time (see pickShift_ in Code.gs), so a 11:56 arrival on the 12:00 shift is simply on time.
    if(kind==='in') ATT.altShift=false;
    ATT.busy=true; ATT.busyTs=Date.now();   // v295: covers the camera + GPS phase, before submitMark takes over with ATT.sending
                                            // v333: busyTs is what lets the watchdog above tell a live tap from a stuck flag
    startMark(kind);
  }
  function stLabel(s){ return ({present:'Full day',half:'Half day',leave:'Leave',absent:'Absent'})[String(s)]||(s||'Full day'); }
  function promptWfh(r, cb){
    var dist=(r&&r.dist)?(Math.round(r.dist)+' m from '+esc(r.branch||'your branch')):'away from your branch';
    openModal('Not at the centre','<style>@keyframes wfhBlink{0%,100%{opacity:1}50%{opacity:.15}} .wfh-blink{animation:wfhBlink .8s steps(1,end) infinite}</style>'+
      '<div style="text-align:center"><div class="wfh-blink" style="font-size:19px;font-weight:800;color:#DA1017;margin:4px 0 10px">🏠 Work from home?</div>'+
      '<div style="font-size:13px;color:#555;margin-bottom:14px">You are '+dist+'. If you are working from home, tap <b>Yes</b> — your attendance will be sent for approval. Otherwise you cannot punch.</div>'+
      '<div style="display:flex;gap:10px;justify-content:center"><button class="btn ghost" id="wfhNo">No</button><button class="btn" id="wfhYes">Yes, work from home</button></div></div>','');
    var y=document.getElementById('wfhYes'), n=document.getElementById('wfhNo');
    if(y) y.onclick=function(){ closeModal(); cb(true); };
    if(n) n.onclick=function(){ closeModal(); cb(false); };
  }
  function submitMark(kind, selfie){
    // Selfie goes in the same call as the punch (uploaded synchronously server-side) so it can never go
    // missing — a background/queued upload was tried and lost photos when the app closed too soon after
    // check-in. Location+camera still run in parallel beforehand (startMark), and the photo is resized
    // before it gets here, so this is still much faster than the original version despite waiting on it.
    // RELIABILITY (slow phones/networks, e.g. Vivo V40E on weak data): the punch often LANDS on the
    // server but the reply times out, so the app used to show "failed" and force a 2nd–3rd tap.
    // Now: (1) a lost reply auto-retries once; (2) "Already checked in/out" counts as SUCCESS — it
    // means the first tap worked; (3) after a final network failure we double-check the server before
    // telling the user it failed. One tap is enough.
    // v225: stamp the REAL tap time on every (even online) punch. On a weak/flaky connection navigator.onLine
    // is still true, so the request goes out live but can land on the server minutes late — the server used to
    // record its own clock (arrival time), pushing an on-time 9:10 punch to 9:35 and wrongly marking half-day.
    // Sending the tap time lets the server record when the user actually tapped. (Distinct from the offline
    // clientDate/clientTime path so it is NOT labelled "Offline punch".)
    var _tt=new Date(ATT.tapTs||Date.now());
    var _tapDate=_tt.getFullYear()+'-'+String(_tt.getMonth()+1).padStart(2,'0')+'-'+String(_tt.getDate()).padStart(2,'0');
    var _tapTime=String(_tt.getHours()).padStart(2,'0')+':'+String(_tt.getMinutes()).padStart(2,'0');
    var _pid=ATT.punchId||(ATT.punchId=punchUuid());
    /* ============================================================================================
       v335 — THE PHOTO NO LONGER HOLDS THE PUNCH UP.

       "It takes too much time to upload attendance." It did, and here is exactly where the time
       went: apiCheckIn's FIRST act — before it took the lock, before it read the sheet — was to
       push this base64 photo into Google Drive, with up to three retries and a backoff sleep
       between them. Nothing about the punch was recorded until Drive answered. On a branch's
       mobile data that is four to eight seconds of somebody standing at the door watching a
       spinner, for a file that has no bearing on whether they arrived.

       So the punch now goes out WITHOUT the photo — a few hundred bytes — carrying selfiePending
       so the server knows one is coming and does not refuse the punch for having no selfie. The
       photo follows immediately afterwards as its own durable job in the punch queue (queuePhoto
       below), addressed to the attendance row the punch just created, and delivered by the same
       Background Sync that has carried offline punches since v333. If the app is killed one second
       after the shutter, the operating system still delivers it.

       The photo is STILL required and still stored on the phone the instant it is taken — this
       changes when it travels, not whether. If the punch has to fall back to the queue (no signal,
       server down) the photo travels inside it exactly as before, because at that point nobody is
       waiting on a screen and one request is simpler than two.
       ============================================================================================ */
    var _photo = selfie || '';
    var c=ATT.coords||{}, payload={punchId:_pid, selfie:'', selfiePending:(_photo?1:0), lat:c.lat, lng:c.lng, noGeo:!!ATT.noGeo, wfh:!!ATT.wfh, altShift:!!ATT.altShift, remark:(kind==='out'?(ATT.outRemark||''):''), tapDate:_tapDate, tapTime:_tapTime};
    function tdy(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
    /* v283 — WHY THE BUTTON TOOK SO LONG TO CHANGE.
       The punch itself finishes, and then this used to wait for a FULL myAttendance round trip before
       repainting — and that call was guaranteed to be the slowest possible one, because apiCheckIn had
       just called invalidateMyAttCache_ on this very employee+month. So the server could not answer from
       cache and had to re-read the entire Attendance sheet. The staff member stood there watching a button
       that still said "Check in" long after their punch had actually been recorded — so they tapped it
       again, which is how the same punch ended up being sent two and three times.
       The punch response already tells us everything the button needs (checkIn/checkOut/late/half), so we
       now paint from it IMMEDIATELY and let the authoritative refresh land quietly afterwards. */
    function applyLocalPunch(r){
      var t=todayS(), recs=(ATT.recs||[]), rec=null;
      for(var i=0;i<recs.length;i++){ if(String(recs[i].date).slice(0,10)===t){ rec=recs[i]; break; } }
      if(!rec){ rec={date:t}; recs.push(rec); ATT.recs=recs; }
      rec._local=true;   // marks this as not-yet-confirmed: paintMe must not read a missing selfie URL as "selfie failed to save"
      if(kind==='in'){
        rec.checkIn=(r&&r.checkIn)||rec.checkIn||'✓';
        rec.status=(r&&r.status)||rec.status||'present';
        if(r&&r.late) rec.late='yes';
      } else {
        rec.checkOut=(r&&r.checkOut)||rec.checkOut||'✓';
        if(r&&r.workHours) rec.workHours=r.workHours;
        if(r&&r.half) rec.status='half';
      }
      if(r&&r.attId) rec.attId=r.attId;
    }
    /* The punch is recorded and we now know WHICH ROW it went into. Hand the photo to the queue,
       addressed to that row. From here it is the queue's problem and nobody is waiting on it. */
    function queuePhoto(r){
      if(!_photo) return;
      var attId = (r && r.attId) || '';
      /* No attId means we cannot say which row the photo belongs to — an old server, or a replay
         of an answer from before this build. Drop it; the "⚠ selfie didn't save — tap to add it"
         line on this same screen is the recovery, and it already exists. */
      if(!attId){ _photo=''; return; }
      var d=new Date(ATT.tapTs||Date.now());
      var ph={
        punchId:'ph_'+_pid, job:'photo',
        attId:String(attId), kind:kind, selfie:_photo,
        ts:(ATT.tapTs||Date.now()), date:tdy(),
        time:String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'),
        ownerEmpId:myEmpId(), ownerName:String((S.user&&S.user.FullName)||''),
        ownerToken:myToken(), apiUrl:myApiUrl()
      };
      _photo='';
      pqPhoto(ph).then(function(){ setTimeout(pqSync, 400); });
    }
    function success(msg, r){
      ATT.wfh=false; ATT.optUntil=0; stopFast();
      toast(msg);
      queuePhoto(r);                                       // v335: the photo goes on its own way
      applyLocalPunch(r); paintMe();                       // instant — the button flips now, not in five seconds
      API.myAttendance(ymNow()).then(function(x){ if(x&&x.ok){ ATT.recs=mergeServerRecs(x.records); paintMe(); } });   // reconcile quietly
    }
    /* ============================================================================================
       v295 — STAGE FIRST, THEN SEND.  This is the change that fixes "photo taken, then nothing".

       WHAT USED TO HAPPEN. The punch was sent live, and it was only saved on the phone AFTER the
       network had already failed. With the 60-second default abort and one automatic retry, a slow
       server meant the sequence was: 60s of silence → "retrying…" → another 60s of silence → a
       myAttendance probe (another 60s) → and only then was the punch finally saved. Nearly three
       minutes during which the button still said "Check in", the calendar square stayed grey, and
       the dashboard showed nothing. Every staff member reasonably concluded it had failed, so they
       tapped again — and again — which is exactly how one punch became three.

       WHAT HAPPENS NOW. The punch is written to the phone's own queue BEFORE the network is touched.
       That makes it durable immediately: it survives a dead connection, a killed app, a flat battery.
       The screen is then painted from that queued punch straight away — the button flips to Check
       out, the calendar square goes green with a ☁ "waiting to send" marker — so the staff member
       gets an answer in well under a second regardless of how the server is behaving. The live send
       still runs; if it succeeds the queued copy is simply dropped and the ☁ disappears.

       WHY THIS IS SAFE. Every punch already carries a punchId that is generated once per tap and
       reused by every retry and every queue replay, and the server already recognises a repeated
       punchId and replays its original answer instead of writing again (apiCheckIn/apiCheckOut,
       v282). So a punch that is both sent live AND replayed from the queue can never be recorded
       twice. Staging first has no downside — it only removes the window in which a punch existed
       nowhere but in a pending network request.
       ============================================================================================ */
    var _staged=false;
    /* v333: the record is stamped with WHO tapped and with the token they were holding at that
       moment. Those two fields are the whole reason a shared branch phone can no longer post one
       person's punch onto another person's record: the queue sends it as its owner or not at all.
       apiUrl travels with it too, because the service worker that will eventually send it has no
       access to config.js. */
    function stagePunch(){
      if(_staged) return;
      _staged=true;
      var d=new Date(ATT.tapTs||Date.now());
      pqStage({
        ts: (ATT.tapTs||Date.now()),
        punchId: _pid,
        ownerEmpId: myEmpId(),
        ownerName: String((S.user&&S.user.FullName)||''),
        ownerToken: myToken(),
        apiUrl: myApiUrl(),
        kind: kind, date: tdy(),
        time: String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'),
        selfie: selfie, lat: c.lat, lng: c.lng,
        noGeo: !!ATT.noGeo, wfh: !!ATT.wfh, altShift: !!ATT.altShift,
        remark: (kind==='out'?(ATT.outRemark||''):''),
        hold: 1, holdTs: Date.now()   // a live attempt is in flight; a background flush must not race it
      });
    }
    /* The live attempt is over and did not land it — hand the punch back to the background queue. */
    function releaseStaged(){ pqRelease(_pid); _staged=false; }
    /* The punch is settled (landed, or permanently rejected) — the queued copy has no further job. */
    function dropStaged(){ pqUnstage(_pid); _staged=false; }
    /* Stop the live attempt and leave it to the queue. From v333 that queue is flushed by the
       operating system through Background Sync, so this hand-off is real even if the app is
       closed one second later — which is exactly what staff do after punching in. */
    function handOff(msg, isErr){
      ATT.sending=null; ATT.wfh=false; ATT.optUntil=0; stopFast(); releaseStaged();
      toast(msg, !!isErr); paintMe();
      setTimeout(pqSync, 3000);   // don't make them wait for the next tick
    }

    stagePunch();                 // durable before anything else can go wrong
    ATT.busy=false;               // the camera/GPS phase is over — ATT.sending guards from here
    ATT.sending=kind; ATT.sendingTs=Date.now();   // paints a disabled "Sending punch…" button instead of a vanishing toast
    paintMe();                    // button flips and the calendar goes green NOW, not in three minutes

    /* ============================================================================================
       v335 — THE SCREEN IS FINISHED IN ABOUT A SECOND, WHATEVER THE SERVER IS DOING.

       Taking the Drive upload out of the request (see the note on `payload` above) made the punch
       itself fast. This removes the second half of the wait, which was here in the app: the button
       showed a disabled "Sending punch…" until the reply came back, so however quick the server
       got, a weak signal still left somebody watching a spinner.

       That wait buys nothing any more. By the time this line runs the punch is already written to
       this phone's IndexedDB queue and the operating system has been asked to deliver it, so it
       will be recorded whether this page survives the next second or not. After FAST_MS we simply
       stop waiting and paint the punch as made, at the time it was actually tapped. The request
       carries on in the background and, when it lands, repaints with the server's own time.

       THIS IS A DISPLAY CHANGE, NOT AN ACCOUNTING ONE. Nothing is decided here. The server still
       records the punch, the 15-minutes-late rule is untouched, and a punch the server refuses
       comes straight back off this screen with its reason — the identical behaviour an offline
       punch has always had. What it removes is a spinner that was telling the staff member
       nothing they needed to know.
       ============================================================================================ */
    var FAST_MS = 1200;
    var _fastT = setTimeout(function(){
      if(ATT.sending !== kind) return;              // the reply already landed — nothing to do
      ATT.sending = null;
      ATT.optUntil = Date.now() + 30000;            // don't say "waiting to send" about a punch that is in flight
      applyLocalPunch(kind==='in' ? {checkIn:_tapTime, status:'present'} : {checkOut:_tapTime});
      paintMe();
    }, FAST_MS);
    function stopFast(){ if(_fastT){ clearTimeout(_fastT); _fastT=null; } }

    if(!navigator.onLine){ handOff('No internet — punch saved on this phone ✓ It will send by itself.'); return; }
    var tries=0, _forceFull=false, _resent=false;
    function attempt(){
      tries++;
      /* v282: the retry used to re-send the ENTIRE payload — including the base64 selfie — so a weak
         connection that had just failed to carry ~90 KB was immediately asked to carry it again.
         We cannot tell client-side whether the first attempt died BEFORE reaching the server (photo never
         uploaded) or AFTER (photo safely on Drive, only the reply lost). So the retry goes out lean, with
         selfieSent:1 meaning "I already sent this photo once". The server then either recognises the
         punchId and replies with the original result, or — if it has no record of this punch — replies
         needSelfie:true and we send the full payload once more. The common case (reply lost after landing)
         costs one small request; the rare case costs what it always did. */
      var lean = (tries>1 && !_forceFull && payload.selfie) ? Object.assign({}, payload, {selfie:'', selfieSent:1}) : payload;
      _forceFull=false;
      // v295: a short, explicit deadline. The first try carries the photo so it gets the longer one; the
      // lean retry is a few hundred bytes and has no business taking more than 20 seconds.
      var deadline = (lean===payload) ? 30000 : 20000;
      var p = kind==='in' ? API.checkIn(lean, deadline) : API.checkOut(lean, deadline);
      p.then(function(r){
        // Server has never seen this punch and the lean retry carried no photo — resend it in full, once.
        if(r && r.needSelfie && payload.selfie && !_resent){ _resent=true; _forceFull=true; attempt(); return; }
        if(r&&r.ok){ dropStaged(); ATT.sending=null; success(kind==='in'?('Checked in '+r.checkIn+(r.late?' (late)':'')):('Checked out '+r.checkOut+(r.half?' · half day':'')), r); return; }
        if(r&&r.wfhPrompt){
          // Not at the branch. The punch is not valid as it stands, so take the staged copy back out —
          // answering "Yes, work from home" re-enters submitMark and stages a fresh one.
          dropStaged(); ATT.sending=null; ATT.optUntil=0; stopFast(); paintMe();
          promptWfh(r, function(yes){ if(yes){ ATT.wfh=true; submitMark(kind, selfie); } else { ATT.wfh=false; toast('You are not at the centre — '+(kind==='in'?'check-in':'check-out')+' not allowed.',true); paintMe(); } });
          return;
        }
        var em=String((r&&r.error)||'');
        // v283: the guard message carries the real time ("Already checked out today at 18:42.") — lift it so
        // the button shows the correct time straight away instead of a placeholder until the refresh lands.
        if(/already checked/i.test(em)){
          dropStaged(); ATT.sending=null;
          var _t=(em.match(/(\d{1,2}:\d{2})/)||[])[1]||'';
          success(kind==='in'?'Checked in ✓ (your earlier tap worked)':'Checked out ✓ (your earlier tap worked)',
                  _t?(kind==='in'?{checkIn:_t}:{checkOut:_t}):null);
          return;
        }
        // v202: the server was momentarily locked (the 9 am punch rush). The punch is already staged —
        // just release it and let the background queue land it, which it will inside a minute.
        if(/server busy/i.test(em)){ handOff('Server is busy — your punch is saved ✓ It will send by itself.'); return; }
        /* A PERMANENT rejection: one that can never succeed however many times it is retried. These must
           come back OUT of the queue, otherwise the phone would retry a punch the server will keep
           refusing until the attempt counter finally drops it 12 tries later. Removing the staged copy
           also reverts the optimistic paint, so the button correctly goes back to "Check in". */
        /* v333: the server's new PUNCH_* codes join this list. They mean "this punch can never be
           recorded as sent" — too old to date, no usable time, dated in the future, or a check-out
           at the same minute as the check-in. Retrying any of them for ever would be pointless. */
        if(em && /PUNCH_TOO_OLD|PUNCH_UNDATED|PUNCH_FUTURE|PUNCH_TOO_SOON|PUNCH_MONTH_CLOSED|not scheduled to work|already worked .*sundays|alternate sunday limit|selfie is required|not authorised|please check in first/i.test(em)){
          dropStaged(); ATT.sending=null; ATT.optUntil=0; stopFast(); _photo=''; toast(_plainPunchError(em), true); paintMe(); return;
        }
        // Anything else (session expired, a Drive hiccup, an unexpected server error) is potentially
        // recoverable — keep the punch queued rather than throwing away someone's day.
        handOff((em||'Could not reach the server')+' — punch saved on phone, it will retry.', true);
      }).catch(function(){
        // Reply never came back. The punch may well have LANDED — the queue replay is idempotent
        // (same punchId), so releasing it costs nothing and can never double-punch.
        if(tries<2){ setTimeout(attempt,800); return; }
        handOff('Slow connection — punch saved on phone ✓ It will send automatically.');
      });
    }
    attempt();
  }

  /* ---------- approver ---------- */
  // Convert any Drive URL format to a direct image-renderable URL
  function driveImg(url){
    if(!url) return '';
    // Already a thumbnail/uc URL — extract ID and re-format
    var m=url.match(/[\/|=]([a-zA-Z0-9_-]{25,})/);
    if(m) return 'https://drive.google.com/thumbnail?id='+m[1]+'&sz=w200-h200';
    return url;
  }
  var _approveCache={ts:0,recs:null,date:null,activeStaff:0,notPunched:null};
  function chip(bg,fg,letter,n,statusKey,clickable){
    var active=(ATT.apFilter===statusKey);
    return '<span'+(clickable?' data-f="'+esc(statusKey)+'"':'')+' style="'+(clickable?'cursor:pointer;':'')+'font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+bg+';color:'+fg+';'+(active?'box-shadow:0 0 0 2px '+fg+';':'')+'" title="'+(clickable?('Tap to show '+esc(letter)):(esc(letter)+' = active staff minus Full day and Half day — staff with no punch today (on leave, absent, or not yet checked in)'))+'">'+esc(letter)+' '+n+'</span>';
  }
  function renderApSummary(recs){
    var box=$id('attApSummary'); if(!box) return;
    var c={present:0,half:0,leave:0,absent:0};
    (recs||[]).forEach(function(r){ var s=String(r.status||'present'); if(c[s]!==undefined) c[s]++; else c.present++; });
    // L = active staff in scope minus (Full day + Half day) — anyone with no punch today at all, not just explicit "leave" records
    var activeStaff=_approveCache.activeStaff||0;
    var leaveCount=Math.max(0, activeStaff-c.present-c.half);
    var wfhCount=(recs||[]).filter(function(r){ return /work from home/i.test(String(r.notes||'')); }).length;
    box.innerHTML='<span style="display:inline-flex;gap:6px;flex-wrap:wrap">'+
      chip('#eaf7ef','#1a8f4c','P',c.present,'present',true)+
      chip('#faeeda','#854F0B','H',c.half,'half',true)+
      chip('#e9f1fb','#185FA5','L',leaveCount,'leave',true)+
      chip('#eeedfe','#534AB7','W',wfhCount,'wfh',true)+
      (c.absent?chip('#fdecec','#b23b3b','A',c.absent,'absent',true):'')+
      '</span>';
    box.querySelectorAll('[data-f]').forEach(function(s){
      s.onclick=function(){
        var f=s.getAttribute('data-f');
        ATT.apFilter=(ATT.apFilter===f)?null:f;   // tap the same chip again to clear the filter and show everyone
        if(_approveCache.recs) renderApproveRecs(_approveCache.recs);
      };
    });
  }
  function notPunchedLabel(status){ return status==='leave'?'On leave':(status==='absent'?'Absent':'Not punched'); }
  function notPunchedColor(status){ return status==='leave'?['#e9f1fb','#185FA5']:(status==='absent'?['#fdecec','#b23b3b']:['#f1efe8','#5f5e5a']); }
  /* v338 — owner-requested authority: Operations Manager / MIS / Director can convert a day that
     shows Absent/Leave/not-punched to Present (or any status), with a reason. Deliberately narrower
     than canApprove() (which also lets HR and Branch Managers approve a pending punch) — this
     rewrites attendance HISTORY, so it stays with the three roles the owner named, matching
     attOverrideAllowed_ in Code.gs (the server enforces this independently; this is just the UI gate). */
  function canOverrideAtt(){ return S.user && ['Operations Manager','MIS','Director'].indexOf(String(S.user.Role))>=0; }
  function openOverrideModal(empId, name, date){
    openModal('Change attendance status',
      '<div style="text-align:left">'+
        '<div style="font-size:13px;color:#555;margin-bottom:12px">'+esc(name)+' · '+esc(date)+'</div>'+
        '<div class="field"><label>New status</label>'+
          '<select id="ovStatus" style="width:100%;border:1px solid #d9d9d9;border-radius:8px;padding:8px">'+
            '<option value="present">Present</option><option value="half">Half day</option>'+
            '<option value="leave">Leave</option><option value="absent">Absent</option>'+
          '</select></div>'+
        '<div class="field"><label>Check-in time (optional — e.g. 08:55)</label>'+
          '<input id="ovCheckIn" placeholder="HH:MM" style="width:100%;border:1px solid #d9d9d9;border-radius:8px;padding:8px;box-sizing:border-box"></div>'+
        '<div class="field"><label>Reason (required — saved to the audit log)</label>'+
          '<textarea id="ovReason" rows="3" style="width:100%;border:1px solid #d9d9d9;border-radius:8px;padding:8px;box-sizing:border-box" placeholder="e.g. Punch-in sync bug — selfie confirms she was on-site at 08:55"></textarea></div>'+
        '<div id="ovMsg" style="color:#b23b3b;font-size:12px;min-height:16px"></div>'+
      '</div>',
      '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="ovSubmit">Save</button>');
    var btn=document.getElementById('ovSubmit');
    if(btn) btn.onclick=function(){
      var status=document.getElementById('ovStatus').value;
      var checkIn=String(document.getElementById('ovCheckIn').value||'').trim();
      var reason=String(document.getElementById('ovReason').value||'').trim();
      var msg=document.getElementById('ovMsg');
      if(/^\d{1,2}:\d{2}$/.test(checkIn)){ var p=checkIn.split(':'); checkIn=String(p[0]).padStart(2,'0')+':'+p[1]; }
      else if(checkIn){ msg.textContent='Check-in time must look like 08:55, or leave it blank.'; return; }
      if(!reason){ msg.textContent='A reason is required.'; return; }
      btn.disabled=true; btn.textContent='Saving…';
      API.overrideAttendance(empId, date, {status:status, checkIn:checkIn, reason:reason}).then(function(r){
        if(!r||!r.ok){ msg.textContent=(r&&r.error)||'Could not save.'; btn.disabled=false; btn.textContent='Save'; return; }
        closeModal();
        toast((r.offline?'Saved on this phone — will send when online. ':'')+name+' marked '+stLabel(status).toLowerCase()+' for '+date+'.');
        loadApprove(_approveCache.date||todayS(), ($id('attApDateTo')||{}).value||'');   // refresh the list this button lives on
      }).catch(function(){ msg.textContent='Network error — please try again.'; btn.disabled=false; btn.textContent='Save'; });
    };
  }
  function renderNotPunched(){
    var box=$id('attApprove'); if(!box) return;
    var list=_approveCache.notPunched||[];
    var ovDate=_approveCache.date||todayS();
    var canOv=canOverrideAtt();
    var rows=list.map(function(e){
      var col=notPunchedColor(e.status);
      return '<div class="att-row" style="align-items:center">'+
        '<div class="att-av">'+esc(initials(e.name))+'</div>'+
        '<div class="att-mid" style="flex:1">'+
          '<div class="att-nm"><b>'+esc(e.name)+'</b></div>'+
          '<div class="att-m">ID '+esc(e.empId||'')+(e.branch?(' · '+esc(e.branch)):'')+(e.phone?(' · '+esc(e.phone)):'')+'</div>'+
        '</div>'+
        '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+col[0]+';color:'+col[1]+';flex-shrink:0">'+esc(notPunchedLabel(e.status))+'</span>'+
        (canOv?('<button class="btn sm ghost attOvBtn" data-emp="'+esc(e.empId)+'" data-name="'+esc(e.name)+'" style="flex-shrink:0;margin-left:8px">Change status…</button>'):'')+
        '</div>';
    }).join('');
    box.innerHTML='<div class="empty" style="text-align:left;padding:6px 2px 10px;font-size:12px;color:#888">Not punched '+(ovDate===todayS()?'today':('on '+ovDate))+' — '+list.length+'. Tap L again to go back.</div>'+
      (list.length?rows:'<div class="empty">Everyone active has punched in for this date.</div>');
    if(canOv) box.querySelectorAll('.attOvBtn').forEach(function(b){
      b.onclick=function(){ openOverrideModal(b.getAttribute('data-emp'), b.getAttribute('data-name'), ovDate); };
    });
  }
  function renderApproveRecs(recs){
    var box=$id('attApprove'); if(!box) return;
    renderApSummary(recs);
    if(ATT.apFilter==='leave'){ renderNotPunched(); return; }
    var shown=ATT.apFilter ? (ATT.apFilter==='wfh'
      ? recs.filter(function(r){ return /work from home/i.test(String(r.notes||'')); })
      : recs.filter(function(r){ return String(r.status||'present')===ATT.apFilter; })) : recs;
    var nq=(($id('attApName')||{}).value||'').trim().toLowerCase();
    if(nq) shown=shown.filter(function(r){ return String(r.empName||'').toLowerCase().indexOf(nq)>=0 || String(r.empId||'').toLowerCase().indexOf(nq)>=0; });
    if(!shown.length){ box.innerHTML='<div class="empty">'+(nq?'No one matches "'+esc(nq)+'".':('No '+(ATT.apFilter==='wfh'?'work-from-home ':ATT.apFilter?(stLabel(ATT.apFilter)+' '):'')+'attendance marked for this date.'))+'</div>'; return; }
    box.innerHTML=shown.map(function(a){
      var ap=String(a.approvalStatus)==='approved';
      // Inline selfie thumbnails — punch-in (IN) and punch-out (OUT) side by side, no PDF link.
      // Always render both boxes (with a placeholder when missing) so a missing selfie is visible on
      // the card instead of the whole row just silently not appearing.
      var inBox = a.selfieInUrl
        ? '<img src="'+esc(driveImg(a.selfieInUrl))+'" alt="In" style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:1px solid #ddd;display:block" onerror="this.style.background=\'#f3f4f6\';this.style.border=\'1px dashed #ccc\'">'
        : '<div style="width:80px;height:80px;border-radius:10px;border:1px dashed #e0a1a1;background:#fdf2f2;display:flex;align-items:center;justify-content:center;font-size:10px;color:#a3271f;text-align:center">No selfie</div>';
      var outBox;
      if(a.selfieOutUrl) outBox='<img src="'+esc(driveImg(a.selfieOutUrl))+'" alt="Out" style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:1px solid #ddd;display:block" onerror="this.style.background=\'#f3f4f6\';this.style.border=\'1px dashed #ccc\'">';
      else if(a.checkOut) outBox='<div style="width:80px;height:80px;border-radius:10px;border:1px dashed #e0a1a1;background:#fdf2f2;display:flex;align-items:center;justify-content:center;font-size:10px;color:#a3271f;text-align:center">No selfie</div>';
      else outBox='<div style="width:80px;height:80px;border-radius:10px;border:1px dashed #ccc;background:#f9fafb;display:flex;align-items:center;justify-content:center;font-size:10px;color:#aaa;text-align:center">No punch-out yet</div>';
      var thumbs='<div style="text-align:center;display:inline-block;margin-right:10px;vertical-align:top">'+inBox+'<span style="font-size:10px;font-weight:600;color:#888;letter-spacing:.04em">IN</span></div>'+
        '<div style="text-align:center;display:inline-block;vertical-align:top">'+outBox+'<span style="font-size:10px;font-weight:600;color:#888;letter-spacing:.04em">OUT</span></div>';
      var selfieBlock='<div style="margin:6px 0">'+thumbs+'</div>';
      return '<div class="att-row" data-id="'+esc(a.attId)+'" style="align-items:flex-start">'+
        '<div class="att-av" style="margin-top:4px">'+esc(initials(a.empName))+'</div>'+
        '<div class="att-mid" style="flex:1">'+
          '<div class="att-nm"><b>'+esc(a.empName)+'</b>'+dayBadge(a.status)+(ATT.apRangeOn&&a.date?(' <span style="font-size:10px;color:#888;font-weight:600">'+esc(String(a.date).split('-').reverse().join('-'))+'</span>'):'')+(String(a.late)==='yes'?' <span class="att-late">late</span>':'')+(/work from home/i.test(String(a.notes||''))?' <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:#eeedfe;color:#534AB7">🏠 WFH</span>':'')+'</div>'+
          '<div class="att-m">In '+esc(a.checkIn||'—')+(a.checkOut?(' · Out '+esc(a.checkOut)):'')+((a.workHours&&!isNaN(Number(a.workHours)))?(' · '+esc(a.workHours)+'h'):'')+' · '+esc(stLabel(a.status))+((a.latIn&&a.lngIn)?' · <a href="https://maps.google.com/?q='+esc(a.latIn)+','+esc(a.lngIn)+'" target="_blank">📍 '+esc(a.addrIn||'location')+'</a>':'')+'</div>'+
          '<div class="att-m">ID '+esc(a.empId||'')+(a.dutyStart?(' · Duty '+esc(a.dutyStart)+(a.dutyEnd?('–'+esc(a.dutyEnd)):'')):'')+(a.attMode?(' · '+esc(a.attMode)):'')+'</div>'+
          (a.notes?'<div class="att-m" style="color:#a3271f;font-weight:600">📝 '+esc(a.notes)+'</div>':'')+
          selfieBlock+
        '</div>'+
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">'+
          (ap?'<span class="att-ok">✓ approved</span>':'<button class="btn sm" data-ap="'+esc(a.attId)+'">Approve</button>')+
          '<select class="att-sel" data-nocombo data-st="'+esc(a.attId)+'" data-prev="'+esc(a.status)+'">'+['present','half','leave','absent'].map(function(s){return '<option value="'+s+'"'+(s===a.status?' selected':'')+'>'+esc(stLabel(s))+'</option>';}).join('')+'</select>'+
        '</div>'+
        '</div>';
    }).join('');
    // Approve in-place — update card DOM without full re-fetch (faster)
    box.querySelectorAll('[data-ap]').forEach(function(b){
      b.onclick=function(){
        var attId=b.getAttribute('data-ap');
        b.disabled=true; b.textContent='…';
        var retried=false;
        function saveAp(){
          API.setAttendance(attId,{approvalStatus:'approved'}).then(function(x){
            if(x&&x.ok){
              toast('Approved');
              var rec0=(_approveCache.recs||[]).filter(function(r){return String(r.attId)===attId;})[0]; if(rec0) rec0.approvalStatus='approved';   // keep in-memory cache in sync so a later status change re-render doesn't revert this button
              _approveCache.ts=0; // still invalidate so the NEXT open re-fetches fresh from the server
              var row=b.closest ? b.closest('.att-row') : null;
              if(row){ var btn=row.querySelector('[data-ap]'); if(btn) btn.outerHTML='<span class="att-ok">✓ approved</span>'; }
              return;
            }
            var em=String((x&&x.error)||'');
            if(/busy/i.test(em) && !retried){ retried=true; toast('Server busy — retrying…'); setTimeout(saveAp, 3000); return; }   // v202: one silent retry rides out a momentary lock
            b.disabled=false; b.textContent='Approve'; toast(em||'Failed',true);
          }).catch(function(){
            if(!retried){ retried=true; toast('Slow connection — retrying…'); setTimeout(saveAp, 3000); return; }
            b.disabled=false; b.textContent='Approve'; toast('Failed',true);
          });
        }
        saveAp();
      };
    });
    box.querySelectorAll('[data-st]').forEach(function(s){
      s.onchange=function(){
        var attId=s.getAttribute('data-st'), val=s.value, prev=s.getAttribute('data-prev')||val;
        s.disabled=true;
        var retried=false;
        function save(){
          API.setAttendance(attId,{status:val}).then(function(x){
            if(x&&x.ok){
              s.disabled=false; s.setAttribute('data-prev',val);
              toast('Updated');
              var rec=(_approveCache.recs||[]).filter(function(r){return String(r.attId)===attId;})[0];
              if(rec){ rec.status=val; renderApproveRecs(_approveCache.recs); }   // repaint so the badge + "· Full day/Half day" text next to the photo matches the new dropdown value
              return;
            }
            var em=String((x&&x.error)||'');
            if(/busy/i.test(em) && !retried){ retried=true; toast('Server busy — retrying…'); setTimeout(save, 3000); return; }   // v202: one silent retry rides out a momentary lock
            s.disabled=false; s.value=prev; toast(em||'Failed',true);
          }).catch(function(){
            if(!retried){ retried=true; toast('Slow connection — retrying…'); setTimeout(save, 3000); return; }
            s.disabled=false; s.value=prev; toast('Failed — check connection.',true);
          });
        }
        save();
      };
    });
  }
  function loadApprove(date, dateTo){
    date=date||todayS(); dateTo=dateTo||'';
    var box=$id('attApprove'); if(!box) return;
    var key=date+'|'+dateTo;
    // Use cached data if fresh (within 45 s) AND for the same date/range — avoids repeated API calls on re-render
    var now=Date.now();
    if(_approveCache.recs && _approveCache.key===key && (now-_approveCache.ts)<45000){ ATT.apRangeOn=!!dateTo; renderApproveRecs(_approveCache.recs); return; }
    box.innerHTML='<div class="center-load"><span class="loader dark"></span></div>';
    API.listAttendance('',date,dateTo).then(function(r){
      if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
      var recs=(r.records||[]).slice().sort(function(a,b){ var da=String(a.date||''),db=String(b.date||''); if(da!==db) return db>da?1:-1; var ta=String(a.checkIn||''),tb=String(b.checkIn||''); return tb>ta?1:tb<ta?-1:0; });
      ATT.apRangeOn=!!(r.dateTo);
      _approveCache={ts:Date.now(), recs:recs, date:date, key:key, activeStaff:r.activeStaff||0, notPunched:r.notPunched||[]};
      renderApproveRecs(recs);
    }).catch(function(){ if(box) box.innerHTML='<div class="empty">Connect to load attendance for this date.</div>'; });
  }
  window.renderAttendance=renderAttendance;
})();
