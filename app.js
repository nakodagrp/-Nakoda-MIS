/* Nakoda MIS — app UI (uses window.API offline data layer) */
var S={ user:null, perms:null, meta:null, employees:[] };

function $(id){ return document.getElementById(id); }
function el(h){ var d=document.createElement('div'); d.innerHTML=h.trim(); return d.firstChild; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function toast(m,err){ var t=$('toast'); t.textContent=m; t.className='show'+(err?' err':''); setTimeout(function(){t.className='';},2800); }
var _splashStart=Date.now(), _splashDone=false;
function show(id){
  function doShow(){ ['view-login','view-changepw','view-app'].forEach(function(v){ $(v).classList.toggle('hidden',v!==id); }); var sp=$('app-splash'); if(sp){ sp.classList.add('hidden'); setTimeout(function(){ sp.style.display='none'; },450); } }
  if(!_splashDone){ _splashDone=true; var wait=1500-(Date.now()-_splashStart); if(wait>0) setTimeout(doShow,wait); else doShow(); }
  else doShow();
}
function setMsg(id,t,ty){ var e=$(id); e.innerHTML=t?('<div class="msg '+(ty||'error')+'">'+esc(t)+'</div>'):''; }
function initials(n){ var p=String(n||'N').trim().split(/\s+/); return ((p[0]||'')[0]||'N').toUpperCase()+(p.length>1?(p[p.length-1][0]||'').toUpperCase():''); }

/* boot */
document.addEventListener('DOMContentLoaded', function(){
  registerSW(); initInstall(); bindAuth(); bindApp(); bindStatus(); setupTableLabels();
  if(!API.configured()){
    setMsg('loginMsg','This app is not connected yet. Open config.js and paste your Apps Script URL.','error');
    show('view-login'); return;
  }
  var token=API.getToken();
  Promise.all([kvRead('me'),kvRead('meta'),kvRead('perms')]).then(function(a){
    var cu=a[0], cm=a[1], cp=a[2];
    if(token && cu){
      S.user=cu; S.meta=cm; S.perms=cp; enterAppInstant();
      API.validate().then(function(r){
        if(r&&r.ok){ if(r.mustChange){ forcePw(); return; } refreshMeta(); }
        else if(r&&!r.offline){ API.clearLocal(); show('view-login'); }
      }).catch(function(){});
    } else if(token){
      API.validate().then(function(r){ if(r.ok){ afterAuth(r.mustChange); } else { show('view-login'); } }).catch(function(){ show('view-login'); });
    } else { show('view-login'); if(navigator.onLine&&API.warm) API.warm(); }   // v187: wake the server while the user types
  });
});
function kvRead(k){ return new Promise(function(res){ var r=indexedDB.open('nakoda_mis');r.onsuccess=function(){try{var s=r.result.transaction('kv','readonly').objectStore('kv').get(k);s.onsuccess=function(){res(s.result);};s.onerror=function(){res(null);};}catch(e){res(null);}};r.onerror=function(){res(null);}; }); }

/* manual update: clear caches + service worker, reload latest (stays logged in) */
function forceUpdate(){
  if(!confirm('Reinstall the latest version? The app will refresh. You stay logged in.')) return;
  var done=false, go=function(){ if(done) return; done=true; location.reload(true); };
  try{
    var jobs=[];
    if(window.caches&&caches.keys) jobs.push(caches.keys().then(function(ks){ return Promise.all(ks.map(function(k){return caches.delete(k);})); }));
    if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations) jobs.push(navigator.serviceWorker.getRegistrations().then(function(rs){ return Promise.all(rs.map(function(r){return r.unregister();})); }));
    Promise.all(jobs).then(go, go);
  }catch(e){ go(); }
  setTimeout(go,1500);
}
window.forceUpdate=forceUpdate;

/* mobile: auto-label table cells for stacked-card view */
function labelizeTables(){
  document.querySelectorAll('table').forEach(function(tbl){
    var ths=tbl.querySelectorAll('thead th'); if(!ths.length) return;
    var labels=Array.prototype.map.call(ths,function(th){ return th.textContent.trim(); });
    tbl.querySelectorAll('tbody tr').forEach(function(tr){
      Array.prototype.forEach.call(tr.children,function(td,i){ if(labels[i]!=null && td.getAttribute('data-label')===null) td.setAttribute('data-label',labels[i]); });
    });
  });
}
function setupTableLabels(){
  var t; var run=function(){ clearTimeout(t); t=setTimeout(labelizeTables,60); };
  try{ new MutationObserver(run).observe(document.body,{childList:true,subtree:true}); }catch(e){}
  run();
}

/* service worker + update banner */
function registerSW(){
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(function(reg){
    function watch(w){ if(!w) return; w.addEventListener('statechange',function(){ if(w.state==='installed' && navigator.serviceWorker.controller){ $('updateBar').classList.remove('hidden'); } }); }
    if(reg.waiting && navigator.serviceWorker.controller) $('updateBar').classList.remove('hidden');
    reg.addEventListener('updatefound', function(){ watch(reg.installing); });
    setInterval(function(){ reg.update(); }, 60000);
    $('updateBtn').addEventListener('click', function(){ if(reg.waiting){ reg.waiting.postMessage('SKIP_WAITING'); } });
  }).catch(function(){});
  var reloaded=false;
  navigator.serviceWorker.addEventListener('controllerchange', function(){ if(reloaded) return; reloaded=true; location.reload(); });
}

/* install app prompt */
var _deferredInstall=null;
function isStandalone(){ return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true; }
function isIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream; }
function showInstallBar(){ $('installBar').classList.remove('hidden'); }
function hideInstallBar(){ $('installBar').classList.add('hidden'); }
function _showTopInstall(){ var b=document.getElementById('topInstallBtn'); if(b) b.classList.remove('hidden'); }
function _hideTopInstall(){ var b=document.getElementById('topInstallBtn'); if(b) b.classList.add('hidden'); }
function _markTopInstalled(){ var b=document.getElementById('topInstallBtn'); if(b){ b.textContent='Installed'; b.classList.add('installed'); b.disabled=true; } }
function initInstall(){
  if(isStandalone()){ hideInstallBar(); _markTopInstalled(); _showTopInstall(); return; }
  if(sessionStorage.getItem('nk_install_dismiss')==='1') return;
  window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); _deferredInstall=e; showInstallBar(); _showTopInstall(); });
  window.addEventListener('appinstalled', function(){ hideInstallBar(); _deferredInstall=null; toast('App installed'); _markTopInstalled(); });
  if(isIOS()){ $('installText').textContent='Install this app: tap the Share button, then “Add to Home Screen”.'; showInstallBar(); }
  $('installBtn').addEventListener('click', function(){
    if(_deferredInstall){ _deferredInstall.prompt(); _deferredInstall.userChoice.then(function(){ _deferredInstall=null; hideInstallBar(); }); }
    else if(isIOS()){ openModal('Install on iPhone / iPad','<p>1. Tap the <b>Share</b> button at the bottom of Safari.</p><p>2. Tap <b>Add to Home Screen</b>.</p><p>3. Tap <b>Add</b>.</p>','<button class="btn" onclick="closeModal()">Got it</button>'); }
    else { toast('To install: open this site in Chrome, then use the install icon in the address bar.'); }
  });
  $('installDismiss').addEventListener('click', function(){ hideInstallBar(); try{ sessionStorage.setItem('nk_install_dismiss','1'); }catch(e){} });
  var _topBtn=document.getElementById('topInstallBtn');
  if(_topBtn) _topBtn.addEventListener('click', function(){
    if(_topBtn.disabled) return;
    if(_deferredInstall){ _deferredInstall.prompt(); _deferredInstall.userChoice.then(function(r){ _deferredInstall=null; hideInstallBar(); if(r&&r.outcome==='accepted') _markTopInstalled(); }); }
    else if(isIOS()){ openModal('Install on iPhone / iPad','<p>1. Tap the <b>Share</b> button at the bottom of Safari.<br>2. Tap <b>Add to Home Screen</b>.<br>3. Tap <b>Add</b>.</p>','<button class="btn" onclick="closeModal()">Got it</button>'); }
    else { toast('To install: open in Chrome then use the install icon in the address bar.'); }
  });
}

/* status chip / offline banner */
/* ============================================================ v288 — WHAT BUILD IS ACTUALLY RUNNING
   Every deploy so far has ended with "I uploaded it and it still shows the old screen", and there has
   been no way to tell from the app whether the new files arrived, the service worker served a stale
   copy, or the upload never landed. APP_BUILD is stamped into the page title tooltip and shown in the
   ⋯ More sheet, and the service worker is asked separately which version IT is serving. When those two
   disagree, the cache is stale; when both are old, the upload did not reach the server. */
var APP_BUILD='v294';
window.APP_BUILD=APP_BUILD;
window.SW_BUILD='?';
try{
  if(navigator.serviceWorker){
    navigator.serviceWorker.addEventListener('message', function(ev){
      if(ev.data && ev.data.type==='BUILD'){ window.SW_BUILD=String(ev.data.version||'?'); paintBuildStamp(); }
    });
    navigator.serviceWorker.ready.then(function(reg){
      if(reg.active) reg.active.postMessage('WHICH_BUILD');
    }).catch(function(){});
  }
}catch(e){}
function paintBuildStamp(){
  var el=document.getElementById('buildStamp'); if(!el) return;
  var sw=String(window.SW_BUILD||'?'), app='nakoda-mis-'+APP_BUILD;
  var agree=(sw===app);
  el.innerHTML='App <b>'+esc(APP_BUILD)+'</b> · cache <b>'+esc(sw.replace('nakoda-mis-',''))+'</b>'+
    (agree?' <span style="color:#1a7f37">✓ up to date</span>'
          :' <span style="color:#b23b3b">⚠ mismatch — tap Check update</span>');
}
window.paintBuildStamp=paintBuildStamp;

function bindStatus(){
  var chipEl=document.getElementById('syncChip');
  if(chipEl) chipEl.title='Build '+APP_BUILD;
  API.onStatus(function(st){
    var chip=$('syncChip'), txt=$('syncText');
    $('offlineBar').classList.toggle('hidden', st.online);
    if(!st.online){ chip.className='syncchip off'; txt.textContent=(st.pending?('Offline · '+st.pending+' to sync'):'Offline'); }
    else if(st.syncing){ chip.className='syncchip busy'; txt.textContent='Syncing…'; }
    else if(st.pending){ chip.className='syncchip busy'; txt.textContent=st.pending+' to sync'; }
    else { chip.className='syncchip'; txt.textContent='Online'; }
  });
}

/* password show/hide */
document.addEventListener('click', function(e){
  if(e.target.classList && e.target.classList.contains('toggle')){
    var f=$(e.target.getAttribute('data-for'));
    if(f){ f.type=f.type==='password'?'text':'password'; e.target.textContent=f.type==='password'?'show':'hide'; }
  }
});

/* auth */
function bindAuth(){
  $('loginForm').addEventListener('submit', function(e){
    e.preventDefault(); setMsg('loginMsg','');
    if(!navigator.onLine){ setMsg('loginMsg','You need internet for the first login. After that the app works offline.'); return; }
    var b=$('loginBtn'); b.disabled=true; b.innerHTML='<span class="loader"></span> Signing in…';
    /* v191: Apps Script allows only 30 simultaneous requests — during the morning punch-in rush a
       login can get dropped and used to show "Could not reach the server" immediately. Now it quietly
       retries twice (1.5s / 3s apart) and only shows the error if all three attempts fail. */
    /* v295: say WHICH attempt is running. A spinner that reads "Signing in…" for three minutes is
       indistinguishable from a frozen app, so people force-quit and start over — which puts a fourth
       request on a server that was already refusing the first three. */
    var _lTries=0;
    function tryLogin(){
      _lTries++;
      if(_lTries>1) b.innerHTML='<span class="loader"></span> Server is busy — retrying ('+_lTries+' of 3)…';
      API.login($('loginId').value, $('loginPw').value).then(function(r){
        if(!r.ok){ setMsg('loginMsg', r.error||'Login failed.'); b.disabled=false; b.textContent='Sign in'; return; }
        /* v187: metadata rides along with the login reply — no second server round-trip needed */
        if(r.perms){ S.user=r.me||r.user; S.meta={roles:r.roles||[],branches:r.branches||[]}; S.perms=r.perms; }
        afterAuth(r.mustChange);
        b.disabled=false; b.textContent='Sign in';
      }).catch(function(){
        if(_lTries<3){ setTimeout(tryLogin, _lTries===1?1500:3000); return; }
        setMsg('loginMsg','Could not reach the server. Check your internet.');
        b.disabled=false; b.textContent='Sign in';
      });
    }
    tryLogin();
  });
  $('cpwForm').addEventListener('submit', function(e){
    e.preventDefault(); setMsg('cpwMsg','');
    var n=$('newPw').value, n2=$('newPw2').value;
    if(n!==n2){ setMsg('cpwMsg','Passwords do not match.'); return; }
    if(n.length<6){ setMsg('cpwMsg','At least 6 characters.'); return; }
    var b=$('cpwBtn'); b.disabled=true; b.innerHTML='<span class="loader"></span> Saving…';
    API.changePassword($('oldPw').value, n).then(function(r){
      if(!r.ok){ setMsg('cpwMsg', r.error); return; }
      toast('Password updated'); enterApp();
    }).then(function(){ b.disabled=false; b.textContent='Update password'; });
  });
}
function forcePw(){ $('oldPwField').classList.add('hidden'); show('view-changepw'); }
function afterAuth(mustChange){ if(mustChange){ forcePw(); } else { enterApp(); } }
/* ============================================================================================
   v296 — WHY THE DASHBOARD COMES UP EMPTY AND JUST SITS THERE.

   These two functions ran five steps in a row, unguarded:

       renderIdentity(); show('view-app'); populateSelectors(); applyPerms(); go('dashboard');

   If ANY one of them throws, every step after it is skipped — including go('dashboard'), which is
   what actually loads the dashboard. The user is left looking at the app shell with the static
   placeholder text still in it: "Welcome" with no name, role "—", avatar "N", empty Overview, empty
   staff table, and the full unfiltered menu (because applyPerms never ran to hide anything).

   Nothing is shown, nothing is logged, no error appears. It looks EXACTLY like the app being slow —
   so you wait, and refresh, and wait again, and nothing will ever happen, because nothing is still
   loading. It already failed.

   populateSelectors() is the likeliest thrower: it does S.meta.branches.map(...) after only checking
   that S.meta exists. api.js line ~288 caches meta as {roles:r.roles, branches:r.branches} with no
   fallback (the login path at line ~262 correctly uses ||[]), so a reply that omits branches leaves
   {branches: undefined} in IndexedDB — and every boot from then on throws on that .map(), forever,
   until the cache happens to be replaced.

   Each step is now isolated. One failing step can no longer stop the dashboard from loading, and
   whatever went wrong is reported instead of swallowed.
   ============================================================================================ */
function bootStep_(name, fn){
  try{ fn(); return true; }
  catch(e){
    try{ console.error('boot step "'+name+'" failed:', e); }catch(_){}
    bootWarn_(name, e && e.message);
    return false;
  }
}
var _bootWarned_={};
function bootWarn_(where, msg){
  if(_bootWarned_[where]) return; _bootWarned_[where]=1;
  try{
    var bar=document.getElementById('bootWarn');
    if(!bar){
      bar=document.createElement('div'); bar.id='bootWarn';
      bar.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#8a1c17;color:#fff;'+
        'font:12px/1.45 system-ui,sans-serif;padding:9px 14px;display:flex;gap:10px;align-items:center';
      document.body.appendChild(bar);
    }
    bar.innerHTML='<span style="flex:1">Something failed while loading (<b>'+esc(where)+'</b>'+
      (msg?(': '+esc(String(msg).slice(0,120))):'')+'). Some parts of the screen may be blank.</span>'+
      '<button style="background:#fff;color:#8a1c17;border:0;border-radius:6px;padding:5px 11px;font-weight:700;cursor:pointer" '+
      'onclick="try{API.clearLocal&&API.clearLocal()}catch(e){};location.reload()">Reset &amp; reload</button>'+
      '<button style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5);border-radius:6px;padding:5px 11px;cursor:pointer" '+
      'onclick="this.parentNode.remove()">Dismiss</button>';
  }catch(_){}
}
/* Anything that throws outside a handler we control still gets surfaced rather than swallowed. */
try{ window.addEventListener('error', function(ev){ if(ev && ev.message) bootWarn_('script', ev.message); }); }catch(e){}

function enterApp(){
  show('view-app');
  if(S.meta&&S.perms){ enterAppInstant(); }
  else refreshMeta(true);
}   // v187: enter instantly when login already delivered metadata
function enterAppInstant(){
  bootStep_('identity',  renderIdentity);
  bootStep_('show',      function(){ show('view-app'); });
  bootStep_('selectors', populateSelectors);
  bootStep_('perms',     applyPerms);
  /* Always reached now, whatever happened above — this is the one that loads the dashboard. */
  bootStep_('dashboard', function(){ go('dashboard'); });
}
function refreshMeta(goDash){
  API.getMetadata().then(function(r){
    if(r.ok){ S.meta={roles:r.roles,branches:r.branches}; S.perms=r.perms; S.user=r.me||S.user; renderIdentity(); populateSelectors(); applyPerms(); if(goDash) go('dashboard'); }
    else { toast(r.error||'Could not load data',true); }
  });
}
function renderIdentity(){ var u=S.user||{}; $('meName').textContent=u.FullName||'—'; $('meRole').textContent=u.Role||''; $('meAvatar').textContent=initials(u.FullName); }
function populateSelectors(){
  if(!S.meta) return;
  /* v296: was S.meta.branches.map(...) after checking only that S.meta exists. A cached meta with
     branches undefined (see api.js getMetadata) made this throw on EVERY boot, which silently killed
     applyPerms() and go('dashboard') and left the dashboard permanently blank. */
  var _brs=(S.meta && S.meta.branches) || [];
  var opts='<option value="">All branches</option>'+_brs.map(function(b){ return '<option value="'+esc(b.BranchID)+'">'+esc(b.BranchName)+'</option>'; }).join('');
  $('filterBranch').innerHTML=opts;
  var ds=$('dashBranch'), canPick=S.perms&&S.perms.canViewAll;
  /* combo.js replaces every <select> with a visible input inside a .cmb-wrap and hides
     the native select. Resetting ds.style.display here used to un-hide the native select
     too, so the branch picker appeared TWICE. Toggle the wrapper instead. */
  var host=(ds.closest && ds.closest('.cmb-wrap')) || ds;
  host.style.display=canPick?'':'none';
  if(host!==ds) ds.style.display='none';
  if(canPick){
    ds.innerHTML=opts;
    var mirror=host.querySelector && host.querySelector('.cmb-input');
    if(mirror){ var so=ds.options[ds.selectedIndex]; mirror.value=so?so.textContent:''; }
  }
}
function applyPerms(){
  if(!S.perms) return;
  var canList=S.perms.canViewAll||S.perms.level==='BRANCH_MGR'||S.perms.level==='BRANCH_VIEW';
  document.querySelectorAll('[data-page="employees"]').forEach(function(n){ n.classList.toggle('hidden',!canList); });
  document.querySelectorAll('[data-page="branches"]').forEach(function(n){ n.classList.toggle('hidden',!S.perms.canManageAll); });
  document.querySelectorAll('[data-page="watemplates"]').forEach(function(n){ n.classList.toggle('hidden',!S.perms.canManageAll); });
  document.querySelectorAll('[data-page="cards"]').forEach(function(n){ n.classList.remove('hidden'); });
  document.querySelectorAll('[data-page="cardstatus"]').forEach(function(n){ n.classList.remove('hidden'); });
  $('addEmpBtn').classList.toggle('hidden', !S.perms.canCreate);
  /* v307: CRM / Process Builder / Staff Performance / Marketing removed — their gates went with them.
     The Follow-ups page (formerly "Process Flow Monitor") is KEPT: it never touched the process engine.
     Only its two process-driven tabs were removed. Same roles as before. */
  var canMon=(S.perms.level==='SUPER')||(S.user && ['Operations Manager','Process Coordinator'].indexOf(S.user.Role)>=0);
  document.querySelectorAll('[data-page="taskmon"]').forEach(function(n){ n.classList.toggle('hidden',!canMon); });
  /* v307: Quality Control and KPI & Scoring removed. "Log repeat test" moved to Inventory. */
  var canRec=S.perms.canManageRecurring||(S.perms.level==='SUPER')||(S.user && S.user.Role==='Executive Assistant');
  document.querySelectorAll('[data-page="recurring"]').forEach(function(n){ n.classList.toggle('hidden',!canRec); });
  /* v307: Partner and Consultant have been excluded from training since v276 — the server returns them
     an empty list, spawns them no task and strips their role from any video. The menu entry was never
     gated to match, so a Partner could still open Training and find a blank page. Same role list as the
     backend's TRAINING_EXCLUDED_ROLES; keep the two in step if either changes. */
  var canTrain=['Partner','Consultant'].indexOf(String((S.user||{}).Role||'').trim())<0;
  document.querySelectorAll('[data-page="training"]').forEach(function(n){ n.classList.toggle('hidden',!canTrain); });
  /* v262: Senior Technician gets the same daily-collection authority CRM has — nav entry here,
     the + Daily entry button in accounts.js canEnter(), and the server gate in Code.gs accEnter_. */
  var canAcc=S.perms.canViewAll||S.perms.level==='BRANCH_MGR'||S.perms.level==='BRANCH_VIEW'||(S.user && ['CRM','Accounts','Senior Technician'].indexOf(S.user.Role)>=0);
  document.querySelectorAll('[data-page="accounts"]').forEach(function(n){ n.classList.toggle('hidden',!canAcc); });
  var canMD=(S.perms.level==='SUPER')||(S.user && ['Director','Executive Assistant'].indexOf(S.user.Role)>=0);
  document.querySelectorAll('[data-page="mdinbox"]').forEach(function(n){ n.classList.toggle('hidden',!canMD); });
  /* v197: consultant — bare menu: Dashboard + My Profile ONLY (runs last so it overrides the grants
     above). Also hides the sidebar group labels; the mobile bottom nav rebuilds from visible items below.
     v307: the franchise-pipeline dashboard these roles were given went with the CRM engine — a consultant
     now lands on the ordinary staff dashboard (own tasks and calendar). */
  var _cons=isConsultantRole();
  if(_cons){
    var _keep={dashboard:1,profile:1};
    document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.toggle('hidden', !_keep[n.getAttribute('data-page')]); });
  }
  document.querySelectorAll('.nav-group').forEach(function(n){ n.classList.toggle('hidden', _cons); });
  buildMobileBottomNav();
}

/* nav */
function bindApp(){
  $('logoutBtn').addEventListener('click', function(){ API.logout(); API.clearLocal(); location.reload(); });
  $('menuBtn').addEventListener('click', function(){ $('sidebar').classList.toggle('open'); });
  document.querySelectorAll('.nav-item').forEach(function(n){ n.addEventListener('click', function(){ go(n.getAttribute('data-page')); $('sidebar').classList.remove('open'); }); });
  $('addEmpBtn').addEventListener('click', function(){ openEmpModal(null); });
  var efp=$('empFormPdfBtn'); if(efp) efp.addEventListener('click', downloadEmpFormPdf);
  $('dashRefresh').addEventListener('click', loadDashboard);
  $('dashBranch').addEventListener('change', renderDashboard);
  /* v277: repaint instantly from data already in memory (cards, employees — the card snapshot needs no
     server call), THEN refetch the month's business figures in the background. Without the first call
     the page sits on last month's numbers for the length of a round trip, and offline it would never
     update at all. */
  var dm=$('dashMonth'); if(dm) dm.addEventListener('change', function(){ renderDashboard(); loadDashboard(); });
  var deb; $('empSearch').addEventListener('input', function(){ clearTimeout(deb); deb=setTimeout(renderEmpTable,200); });
  $('filterBranch').addEventListener('change', renderEmpTable);
  $('filterStatus').addEventListener('change', renderEmpTable);
}
var currentPage='dashboard';
function go(page){
  currentPage=page;
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.toggle('active', n.getAttribute('data-page')===page); });
  ['dashboard','tasks','calendar','attendance','leave','field','policy','training','assets','fixedassets','inventory','payreq','payroll','accounts','recurring','taskmon','employees','profile','branches','watemplates','cards','cardstatus','suggest','mdinbox'].forEach(function(p){ var el=$('page-'+p); if(el) el.classList.toggle('hidden',p!==page); });
  if(page==='dashboard') loadDashboard();
  if(page==='tasks' && window.renderMyTasks) window.renderMyTasks();
  if(page==='calendar' && window.renderCalendar) window.renderCalendar();
  if(page==='attendance' && window.renderAttendance) window.renderAttendance();
  if(page==='leave' && window.renderLeave) window.renderLeave();
  if(page==='field' && window.renderField) window.renderField();
  if(page==='policy' && window.renderPolicy) window.renderPolicy();
  if(page==='training' && window.renderTraining) window.renderTraining();
  if(page==='assets' && window.renderAssets) window.renderAssets();
  if(page==='fixedassets' && window.renderFixedAssets) window.renderFixedAssets();
  if(page==='suggest' && window.renderSuggest) window.renderSuggest();
  if(page==='mdinbox' && window.renderMdInbox) window.renderMdInbox();
  if(page==='inventory' && window.renderInventory) window.renderInventory();
  if(page==='payreq' && window.renderPayReq) window.renderPayReq();
  if(page==='payroll' && window.renderPayroll) window.renderPayroll();
  if(page==='accounts' && window.renderAccounts) window.renderAccounts();
  if(page==='recurring' && window.renderRecurring) window.renderRecurring();
  if(page==='taskmon' && window.renderTaskMonitor) window.renderTaskMonitor();
  if(page==='employees') loadEmployees();
  if(page==='profile') loadProfile();
  if(page==='branches' && window.renderBranches) window.renderBranches();
  if(page==='watemplates' && window.renderWaTemplates) window.renderWaTemplates();
  if(page==='cards' && window.renderMembershipCards) window.renderMembershipCards();
  if(page==='cardstatus' && window.renderCardStatus) window.renderCardStatus();
  highlightBottomNav();
}

/* ---------- mobile bottom navigation + "More" sheet ---------- */
var NAVDEF=[['dashboard','▦','Home'],['tasks','✓','Tasks'],['calendar','📅','Calendar'],['attendance','🕒','Attend'],['recurring','🔁','Recurring'],['taskmon','📋','Follow-ups'],['employees','👥','Staff'],['leave','🌴','Leave'],['field','🚗','Field'],['policy','📋','Policy'],['training','🎓','Training'],['assets','🗂','Information'],['fixedassets','🛠','Asset Mgmt'],['inventory','📦','Inventory'],['payreq','🧾','Payments'],['payroll','💰','Payroll'],['accounts','📊','Accounts'],['cards','🏷','Cards'],['cardstatus','✅','Status'],['suggest','✉','Suggest'],['mdinbox','📨','MD Inbox'],['branches','🏢','Branches'],['watemplates','💬','WA Templates'],['profile','⚙','Profile']];
function visibleNav(){ return NAVDEF.filter(function(d){ var el=document.querySelector('.nav-item[data-page="'+d[0]+'"]'); return el && !el.classList.contains('hidden'); }); }
function navBtn(d){ return '<button data-page="'+d[0]+'"><span class="ic">'+d[1]+'</span><span>'+d[2]+'</span></button>'; }
function buildMobileBottomNav(){
  var bar=$('mobileBottomNav'); if(!bar) return;
  var vis=visibleNav();
  bar.innerHTML=vis.slice(0,4).map(navBtn).join('')+'<button id="moreBtn"><span class="ic">⋯</span><span>More</span></button>';
  bar.querySelectorAll('button[data-page]').forEach(function(b){ b.onclick=function(){ go(b.getAttribute('data-page')); }; });
  var mb=$('moreBtn'); if(mb) mb.onclick=openMobileMore;
  highlightBottomNav();
}
function highlightBottomNav(){ document.querySelectorAll('#mobileBottomNav button[data-page]').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-page')===currentPage); }); }
function openMobileMore(){
  var g=$('moreGrid'); if(!g) return;
  g.innerHTML=visibleNav().map(navBtn).join('')+
    '<button data-act="update"><span class="ic">↻</span><span>Check update</span></button>'+
    '<button data-act="logout"><span class="ic">⎋</span><span>Logout</span></button>';
  g.querySelectorAll('button[data-page]').forEach(function(b){ b.onclick=function(){ closeMobileMore(); go(b.getAttribute('data-page')); }; });
  var ub=g.querySelector('[data-act="update"]'); if(ub) ub.onclick=function(){ closeMobileMore(); forceUpdate(); };
  var lb=g.querySelector('[data-act="logout"]'); if(lb) lb.onclick=function(){ API.logout(); API.clearLocal(); location.reload(); };
  /* v288: the build stamp lives here, next to Check update — the one place someone looks when a
     deploy seems not to have taken. */
  var sheet=g.parentNode;
  var st=document.getElementById('buildStamp');
  if(!st && sheet){ st=document.createElement('div'); st.id='buildStamp';
    st.style.cssText='margin-top:14px;padding-top:11px;border-top:1px solid #eee;font-size:11.5px;color:#888;text-align:center';
    sheet.appendChild(st); }
  try{ if(navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('WHICH_BUILD'); }catch(e){}
  paintBuildStamp();
  $('mobileMoreDrawer').classList.add('show');
}
function closeMobileMore(){ var d=$('mobileMoreDrawer'); if(d) d.classList.remove('show'); }
window.openMobileMore=openMobileMore; window.closeMobileMore=closeMobileMore;

/* dashboard */
function greetWord(){ var h=new Date().getHours(); return h<12?'Good morning':(h<17?'Good afternoon':'Good evening'); }
var DASH={emps:[],cards:[],prices:{},tasks:[],cal:[],chaseT:0,chaseC:0,daily:[],pendingDaily:[],training:null};
function priceMap(arr){ var m={}; (arr||[]).forEach(function(p){ m[p.typeId+'|'+p.branchId]=Number(p.price)||0; }); return m; }
function fmtMoney(n){ return Math.round(n||0).toLocaleString('en-IN'); }
function todayD(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function dd10(v){ return String(v||'').slice(0,10); }
/* DATE-FIELD FIX: Sheets returns saved dates as full ISO timestamps (e.g. 2026-07-07T18:30:00.000Z
   for 8 July IST). <input type="date"> rejects that format, so Joining date / DOB / Anniversary
   looked EMPTY on reopen — and re-saving then wiped the stored value. Convert to local yyyy-mm-dd. */
function dateInp(v){ if(!v) return ''; var s=String(v); if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; var d=new Date(s); if(isNaN(d.getTime())) return ''; return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function dateNice(v){ var s=dateInp(v); if(!s) return ''; var p=s.split('-'); return p[2]+'-'+p[1]+'-'+p[0]; }
/* Same fix for TIME cells: Sheets returns duty times as timestamps like 1899-12-30T04:08:50Z,
   which <input type="time"> rejects — the Work & pay shift boxes looked empty and re-saving wiped
   them. Convert to clean HH:MM (attendance.js has long done this; the employee form never did). */
function timeInp(v){ if(!v) return ''; var s=String(v).trim(); var m=s.match(/^(\d{1,2}):(\d{2})/); if(m&&s.indexOf('T')<0) return ('0'+m[1]).slice(-2)+':'+m[2]; var d=new Date(s); if(!isNaN(d.getTime())) return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); return ''; }
/* "To chase" only counts items overdue within the last CHASE_WINDOW_DAYS so the KPI
   stays actionable instead of accumulating every stale task/event since launch.
   Change this one number to widen/narrow the window. */
var CHASE_WINDOW_DAYS=60;
function daysAgoD(n){ var d=new Date(); d.setDate(d.getDate()-n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function toMinD(t){ if(!t) return 0; var p=String(t).split(':'); return (+p[0])*60+(+(p[1]||0)); }
function e0(){ return {}; }
function isMonitorRole(){ var u=S.user||{}; return (S.perms&&S.perms.level==='SUPER')||u.Role==='Operations Manager'||u.Role==='Process Coordinator'; }
/* v197: franchise consultant — MANAGER-level access but a trimmed, franchise-only dashboard
   (no branch business/cash figures, no other departments' tiles, no staff list). */
function isConsultantRole(){ return /consultant/i.test(String((S.user||{}).Role||'')); }
/* ============================================================================
   v262: DASHBOARD "MY TASKS" BLOCK
   Sits under the greeting row. Four count tiles that double as filters, and a scrollable list of
   real task cards underneath — same .tcard markup and same popup as the My Tasks page.

   Counts and buckets come from window.taskShared (exported by tasks.js), NOT from a local copy.
   An earlier version reimplemented the bucket rules and counted only DASH.tasks, so the dashboard
   showed Overdue 4 / Upcoming 0 / Done 152 while My Tasks showed 13 / 4 / 188 — the page counts
   dedupTasks(tasks + calendar entries). Sharing the real functions makes drift impossible.

   Costs no extra server calls: DASH.tasks and DASH.cal are already loaded by loadDashboard.
   ============================================================================ */
var DT_FILTER='today';
var DT_SRC={ tasks:[], cal:[] };
/* Approval-type tasks can't be ticked off — completing them means approving something, which needs
   the popup (attendance figures, leave dates, daily-cash totals). Clicking their box opens it. */
var DT_APPROVAL={attendance:1,leave:1,accounts:1,deposit:1,training:1};
function dtBadge(t){
  var m={ training:['#eafaf3','#1aa37a','🎓 Training'],
          attendance:['#fdeaea','#a3271f','🕒 Attendance'], leave:['#eef7ee','#1a7f37','🌴 Leave'],
          accounts:['#eef2ff','#4253c5','📊 Daily cash'],
          deposit:['#eef2ff','#4253c5','🏦 Deposit'], recurring:['#f3f0ff','#6f63d6','🔁 Recurring'],
          calendar:['#ECEAFB','#5046b8','📅 Calendar'] };   /* v307: the 'process' → "📁 CRM stage" badge went with the engine */
  var d=m[String(t.source)];
  if(!d && String(t.source)==='assigned') d=['#eef2ff','#4253c5','Assigned by '+(t.assignedByName||'manager')];
  if(!d) return '';
  return '<span style="background:'+d[0]+';color:'+d[1]+';border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">'+esc(d[2])+'</span>';
}
function dtItems(){
  var S=window.taskShared;
  /* v307: process/CRM rows stay in the sheet but can no longer be opened anywhere, so they are filtered
     out here exactly as they are in My Tasks — otherwise the dashboard would count dead work as overdue. */
  var tasks=(DASH.tasks||[]).filter(function(t){ var s=String(t.source); return String(t.status)!=='deleted' && s!=='process' && s!=='nrlead'; });
  var cal=(DASH.cal||[]).filter(function(c){ return String(c.status)!=='deleted'; });
  DT_SRC={tasks:tasks, cal:cal};
  if(!S) return tasks;                                    /* tasks.js not loaded yet — degrade, never throw */
  return S.dedup(tasks.concat(cal.map(S.calToItem)));
}
function renderDashTasks(){
  var box=$('dashTasks'); if(!box) return;
  var S=window.taskShared, all=dtItems();
  var bucketOf=S?S.bucket:function(t){ return String(t.status)==='done'?'done':'today'; };
  var b={today:[],overdue:[],upcoming:[],done:[],nr:[]};
  all.forEach(function(t){ (b[bucketOf(t)]||b.today).push(t); });
  if(!all.length){
    box.innerHTML='<div class="card" style="padding:14px 16px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
        '<div class="section-label" style="margin:0">My tasks</div>'+
        '<a href="#" id="dtAll" style="font-size:12.5px;font-weight:600">View all ↗</a></div>'+
      '<div class="empty" style="padding:10px 0">Nothing assigned to you right now. 🎉</div></div>';
    var e0=$('dtAll'); if(e0) e0.onclick=function(ev){ ev.preventDefault(); go('tasks'); };
    return;
  }
  if(!b[DT_FILTER] || !b[DT_FILTER].length){
    DT_FILTER=b.today.length?'today':(b.overdue.length?'overdue':(b.upcoming.length?'upcoming':'done'));
  }
  var defs=[['today','Today','#fdecec','#C0392B'],['overdue','Overdue','#fdecec','#C0392B'],
            ['upcoming','Upcoming','#f6f7f9','#2b2b2b'],['done','Done','#eef7ee','#1a7f37']];
  box.innerHTML='<div class="card" style="padding:14px 16px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">'+
      '<div class="section-label" style="margin:0">My tasks</div>'+
      '<a href="#" id="dtAll" style="font-size:12.5px;font-weight:600">View all ↗</a>'+
    '</div>'+
    '<div class="kpis" style="margin-bottom:11px">'+defs.map(function(d){
      var on=(DT_FILTER===d[0]);
      return '<div class="kpi" data-dtf="'+d[0]+'" style="background:'+(on?d[2]:'#f6f7f9')+';cursor:pointer;border:2px solid '+(on?'var(--red)':'transparent')+'">'+
        '<div class="n" style="color:'+d[3]+'">'+b[d[0]].length+'</div><div class="l">'+d[1]+'</div></div>';
    }).join('')+'</div>'+
    /* ~4 cards then scroll, so Star performers and the KPI row stay within reach */
    '<div id="dtList" style="max-height:250px;overflow-y:auto;overscroll-behavior:contain;padding-right:4px;border-top:1px solid var(--line);padding-top:10px"></div>'+
  '</div>';
  var e1=$('dtAll'); if(e1) e1.onclick=function(ev){ ev.preventDefault(); go('tasks'); };
  document.querySelectorAll('#dashTasks [data-dtf]').forEach(function(el){
    el.onclick=function(){ DT_FILTER=el.getAttribute('data-dtf'); renderDashTasks(); };
  });
  var list=b[DT_FILTER]||[], lb=$('dtList');
  /* Overdue first within a bucket, then by due date/time — the order to work through. */
  list=list.slice().sort(function(x,y){
    return String(String(x.dueDate||'').slice(0,10)+(x.dueTime||'')).localeCompare(String(String(y.dueDate||'').slice(0,10)+(y.dueTime||'')));
  });
  if(DT_FILTER==='done') list.reverse();
  lb.innerHTML=list.map(function(t){
    var done=String(t.status)==='done', tag=dtBadge(t);
    var dl=S?S.dueLabel(t):(String(t.dueDate||'').slice(0,10)||'No date');
    var over=(bucketOf(t)==='overdue');
    var dot=t.isCal?'#7F77DD':((S&&S.pri[t.priority])||'#999');
    return '<div class="tcard'+(done?' tdone':'')+'" data-dtid="'+esc(t.taskId)+'">'+
      '<span class="tbox'+(done?' on':'')+'" data-dttog="'+esc(t.taskId)+'"></span>'+
      '<div class="tbody">'+
        '<div class="ttitle">'+esc(t.title||'')+'</div>'+
        (tag?'<div style="margin-top:3px">'+tag+'</div>':'')+
        '<div class="tmeta"><span class="pdot" style="background:'+dot+'"></span>'+
          '<span'+(over?' style="color:#C0392B;font-weight:600"':'')+'>'+esc(dl)+'</span>'+
          (t.isCal?'':' · '+esc(t.priority||'Normal'))+'</div>'+
      '</div></div>';
  }).join('')||'<div class="empty">Nothing here.</div>';
  lb.querySelectorAll('[data-dtid]').forEach(function(el){
    el.onclick=function(ev){
      var id=el.getAttribute('data-dtid'), tog=ev.target.getAttribute('data-dttog');
      var t=list.filter(function(x){ return String(x.taskId)===String(id); })[0];
      if(!t) return;
      if(tog && !DT_APPROVAL[String(t.source)] && !t.isCal){ dtToggle(t); return; }
      if(window.taskShared) window.taskShared.open(id, DT_SRC.tasks, DT_SRC.cal);
      else go('tasks');
    };
  });
}
/* Tick-to-complete straight from the dashboard. Optimistic: flip locally, repaint, then sync — the
   same shape My Tasks uses, and api.js queues the write if the device is offline. */
function dtToggle(t){
  var ns=(String(t.status)==='done')?'open':'done';
  (DASH.tasks||[]).forEach(function(x){ if(String(x.taskId)===String(t.taskId)) x.status=ns; });
  renderDashTasks();
  toast(ns==='done'?'Task completed':'Task reopened');
  API.setTaskStatus(t.taskId,ns).then(function(){ return API.listMyTasks(); })
    .then(function(r){ if(r&&r.ok){ DASH.tasks=r.tasks||[]; renderDashTasks(); } })
    .catch(function(){});
}
window.renderDashTasks=renderDashTasks;

/* v277 — ONE month for the whole dashboard.
   Every month-scoped block on this page reads dashYm(); nothing keeps its own copy. Blocks that are
   about "right now" (My Tasks chips, department health, recently added staff) deliberately ignore it —
   "overdue" inside a month that closed weeks ago is a meaningless number. */
function dashYm(){
  var dm=$('dashMonth');
  if(dm && !dm.value) dm.value=todayD().slice(0,7);
  return (dm&&dm.value)||todayD().slice(0,7);
}
function ymLabel(ym){
  var M=['January','February','March','April','May','June','July','August','September','October','November','December'];
  var s=String(ym||''), y=s.slice(0,4), m=Number(s.slice(5,7));
  return (M[m-1]||s)+' '+y;
}
function ymLastDay(ym){
  var y=Number(String(ym).slice(0,4)), m=Number(String(ym).slice(5,7));
  var d=new Date(y, m, 0);
  return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
}
window.dashYm=dashYm; window.ymLastDay=ymLastDay;
function loadDashboard(){
  var u=S.user||{};
  $('greetHello').textContent=greetWord()+', '+(u.FullName||'');
  var lvl=S.perms&&S.perms.level;
  var scope=(S.perms&&S.perms.canManageAll)?'org-wide':(lvl==='BRANCH_MGR'?('branch: '+branchName(u.Branch)):(lvl==='BRANCH_VIEW'?('branch: '+branchName(u.Branch)+' (view)'):(S.perms&&S.perms.canViewAll?'all branches (view)':'self-service')));
  $('greetMeta').textContent=[u.Role,(u.OfficeType==='Branch'?branchName(u.Branch):'Corporate Office'),scope].filter(Boolean).join(' · ');
  if(!DASH.emps.length && !DASH.cards.length) $('kpis').innerHTML='<div class="kpi"><div class="n"><span class="loader dark"></span></div><div class="l">Loading…</div></div>';
  Promise.all([API.cachedEmployees(),API.cachedCards(),API.cachedPrices(),API.cachedTasks(),API.cachedCalendar(u.EmpID)]).then(function(a){
    if(a[0]) DASH.emps=a[0]; if(a[1]) DASH.cards=a[1]; DASH.prices=priceMap(a[2]||[]); if(a[3]) DASH.tasks=a[3]; if(a[4]) DASH.cal=a[4];
    renderDashboard();
  });
  /* v189: one combined server call instead of six parallel ones — falls back to the old
     six-call path automatically if the Apps Script hasn't been redeployed yet. */
  function legacyDashLoad(){
    Promise.all([API.listEmployees().catch(e0),API.listCards({}).catch(e0),API.listCardPrices().catch(e0),API.listMyTasks().catch(e0),API.listCalendar(u.EmpID).catch(e0)]).then(function(a){
      if(a[0]&&a[0].ok){ DASH.emps=a[0].employees; S.employees=a[0].employees; S.perms=a[0].perms||S.perms; }
      if(a[1]&&a[1].ok){ DASH.cards=a[1].cards; }
      if(a[2]&&a[2].ok){ DASH.prices=priceMap(a[2].prices); }
      if(a[3]&&a[3].ok){ DASH.tasks=a[3].tasks||[]; }
      if(a[4]&&a[4].ok){ DASH.cal=a[4].entries||[]; }
      renderDashboard();
    });
  }
  API.dashboard().then(function(r){
    if(r&&r.ok){
      if(r.employees&&r.employees.length){ DASH.emps=r.employees; S.employees=r.employees; }
      if(r.perms) S.perms=r.perms;
      if(r.cards) DASH.cards=r.cards;
      if(r.prices) DASH.prices=priceMap(r.prices);
      if(r.tasks) DASH.tasks=r.tasks;
      if(r.entries) DASH.cal=r.entries;
      renderDashboard();
    } else legacyDashLoad();
  }).catch(function(){ legacyDashLoad(); });
  /* "To chase" — overdue work across the whole team, for the roles that chase it. Feeds the KPI tile
     and the row that opens Follow-ups. Unchanged from v306; the Follow-ups page it links to is kept. */
  if(isMonitorRole()){
    Promise.all([API.listAllTasks().catch(e0),API.listAllCalendar().catch(e0)]).then(function(a){
      var tdy=todayD(), nowMin=new Date().getHours()*60+new Date().getMinutes(), floor=daysAgoD(CHASE_WINDOW_DAYS);
      DASH.chaseT=((a[0]&&a[0].ok)?a[0].tasks:[]||[]).filter(function(t){ var d=dd10(t.dueDate); return t.status!=='done' && d && d<tdy && d>=floor; }).length;
      DASH.chaseC=((a[1]&&a[1].ok)?a[1].entries:[]||[]).filter(function(c){ var s=String(c.status); if(s==='done'||s==='deleted') return false; var d=dd10(c.date); return d && d>=floor && (d<tdy || (d===tdy && c.endTime && toMinD(c.endTime)<nowMin)); }).length;
      renderDashboard();
    });
  }
  /* Daily business figures (collection / patients / tests) for the SELECTED month, used by the
     "Business (MTD)" KPI and the By-branch table. Only roles that can see branch business fetch it. */
  var ym=dashYm();
  if(S.perms && (S.perms.canViewAll || S.perms.level==='BRANCH_MGR' || S.perms.level==='BRANCH_VIEW')){
    API.listDaily('', ym).then(function(r){ if(r&&r.ok){ DASH.daily=r.daily||[]; renderDashboard(); } }).catch(function(){});
    /* Verified bank deposits shift a branch's Cash → Bank/UPI on the by-branch table (total business unchanged). */
    API.listDeposits('', ym).then(function(r){ if(r&&r.ok){ DASH.deposits=r.deposits||[]; renderDashboard(); } }).catch(function(){});
    /* v305: how much money is filed but not yet verified. Without this the dashboard simply reads low
       with no explanation — the figure is correct, but "correct and unexplained" is indistinguishable
       from "wrong" to anyone looking at it, and that is how people stop trusting a number. */
    API.pendingDaily().then(function(r){ if(r&&r.ok){ DASH.pendingDaily=r.pending||[]; renderDashboard(); } }).catch(function(){});
  }
  /* v307: the org-wide trainingStats fetch is gone. Its only consumer was the "Staff Training" tile on
     the department board — with the board removed the call was a round trip whose result nothing read. */
}
function renderDashboard(){
  /* SCROLL STABILITY: this repaints as each background load resolves (tasks, cards, daily, training…).
     Replacing large chunks of DOM makes the page height dip for a frame, so the browser clamps the
     scroll and the user gets yanked back up. Remember where they were and restore it after painting. */
  var _se=document.scrollingElement||document.documentElement, _sy=_se?_se.scrollTop:0;
  try{
  var u=S.user||{}, lvl=S.perms&&S.perms.level, isManager=S.perms&&S.perms.canViewAll, isBranchMgr=lvl==='BRANCH_MGR', isMon=isMonitorRole();
  var tdy=todayD();
  /* v262: My tasks block under the greeting. Repaints here so it follows the same data as the rest of
     the dashboard; wrapped so a fault in it can never take the whole dashboard down. */
  try{ renderDashTasks(); }catch(_dt){}
  var myT=(DASH.tasks||[]).filter(function(t){return t.status!=='deleted';});
  var myToday=myT.filter(function(t){return t.status!=='done' && dd10(t.dueDate)===tdy;}).length;
  var myOver=myT.filter(function(t){var d=dd10(t.dueDate); return t.status!=='done' && d && d<tdy;}).length;
  var calToday=(DASH.cal||[]).filter(function(c){return String(c.status)!=='deleted' && dd10(c.date)===tdy;}).sort(function(a,b){return (a.startTime||'')<(b.startTime||'')?-1:1;});
  var branch=$('dashBranch').value;
  /* Effective branch scope for the WHOLE dashboard (staff, cards, revenue, pipelines):
     - managers (canViewAll) honour the branch picker ('' = all branches)
     - branch managers & branch-view users are pinned to their own branch
     - other staff see their personal totals (no branch scoping)
     This guarantees a branch-level user never sees org-wide numbers behind "Branch …" labels. */
  var effBranch=isManager?branch:((isBranchMgr||lvl==='BRANCH_VIEW')?String(u.Branch||''):'');
  var scopeBranch=effBranch;
  var emp=(DASH.emps||[]).filter(function(e){ return !effBranch || String(e.Branch)===String(effBranch); });
  var cards=(DASH.cards||[]).filter(function(c){ return !effBranch || String(c.branchId)===String(effBranch); });
  var now=new Date(), m0=new Date(now.getFullYear(),now.getMonth(),1), soon=new Date(now.getTime()+7*864e5);
  var activeCards=cards.filter(function(c){return c.status==='active';});
  var cardsMTD=cards.filter(function(c){return new Date(c.issuedDate)>=m0;}).length;
  var revenue=activeCards.reduce(function(s,c){return s+(Number(c.amount)||0);},0);
  var brs={}; emp.forEach(function(e){if(e.Branch)brs[e.Branch]=1;}); cards.forEach(function(c){if(c.branchId)brs[c.branchId]=1;});
  var staffN=emp.filter(function(e){return e.Status==='Active';}).length;
  /* Daily business for the selected month — per-branch map + scoped totals. business = cash + bank + other. */
  /* v305: only VERIFIED days are money. A day that has been filed but not yet checked is deliberately
     absent from every figure here — the accountant's banner in Accounts is what tells her it is
     missing, and verifying it puts it in. Summing unverified rows would make the check decorative. */
  var _dcounted=(DASH.daily||[]).filter(function(d){ return String(d.status)==='verified'; });
  var dailyByBr={};
  _dcounted.forEach(function(d){ var b=String(d.branchId||''); if(b)brs[b]=1; var o=dailyByBr[b]||(dailyByBr[b]={cash:0,bank:0,other:0,pat:0,test:0}); o.cash+=Number(d.cashIn)||0; o.bank+=Number(d.bankIn)||0; o.other+=Number(d.other)||0; o.pat+=Number(d.patients)||0; o.test+=Number(d.tests)||0; });
  /* Verified bank deposits move a branch's cash into the bank, but only up to the cash actually on hand —
     you can't deposit more cash than you collected, so cash never goes negative (business total unchanged). */
  var _depByBr={};
  (DASH.deposits||[]).forEach(function(d){ if(String(d.status)!=='approved') return; var b=String(d.branchId||''); if(!b) return; _depByBr[b]=(_depByBr[b]||0)+(Number(d.amount)||0); });
  Object.keys(_depByBr).forEach(function(b){ var o=dailyByBr[b]||(dailyByBr[b]={cash:0,bank:0,other:0,pat:0,test:0}); var shift=Math.min(_depByBr[b], Math.max(0,o.cash)); o.cash-=shift; o.bank+=shift; });
  var cashMTD=0,bankMTD=0,otherMTD=0,patMTD=0,testMTD=0;
  _dcounted.forEach(function(d){ if(effBranch && String(d.branchId)!==String(effBranch)) return; cashMTD+=Number(d.cashIn)||0; bankMTD+=Number(d.bankIn)||0; otherMTD+=Number(d.other)||0; patMTD+=Number(d.patients)||0; testMTD+=Number(d.tests)||0; });
  var _depScoped=0;
  (DASH.deposits||[]).forEach(function(d){ if(String(d.status)!=='approved') return; if(effBranch && String(d.branchId)!==String(effBranch)) return; _depScoped+=(Number(d.amount)||0); });
  var _shiftM=Math.min(_depScoped, Math.max(0,cashMTD)); cashMTD-=_shiftM; bankMTD+=_shiftM;
  var bizMTD=cashMTD+bankMTD+otherMTD;
  var avgPat=patMTD>0?Math.round(bizMTD/patMTD):0;
  /* v307: the CRM lead KPIs are gone with the process engine. Every tile below is now derived from
     data this build still owns — daily collections, cards, staff, tasks and the calendar. The
     consultant's franchise-only dashboard went with it; a consultant now sees the standard staff view. */
  var isCons=isConsultantRole();
  var K=kpiC(myToday,'Tasks today','amber')+kpiC(myOver,'My overdue','red');
  if(isManager){ K+=kpiC('₹'+fmtMoney(bizMTD),'Business (MTD)','green')+kpiC(patMTD,'Patients (MTD)','violet')+kpiC('₹'+fmtMoney(revenue),'Card revenue','green')+kpiC(staffN,'Active staff','blue')+kpiC(Object.keys(brs).length,'Branches','blue'); }
  else if(isBranchMgr){ K+=kpiC('₹'+fmtMoney(bizMTD),'Business (MTD)','green')+kpiC(patMTD,'Patients (MTD)','violet')+kpiC(staffN,'Branch staff','blue')+kpiC('₹'+fmtMoney(revenue),'Cards business','green'); }
  else { K+=kpiC(calToday.length,'Today’s events','blue'); }
  if(isMon){ K+=kpiC((DASH.chaseT||0)+(DASH.chaseC||0),'To chase','red'); }
  $('kpis').innerHTML=K;
  var att='', items='';
  function arow(color,txt,page){ return '<div class="dash-att" onclick="go(\''+page+'\')"><span class="dot" style="background:'+color+'"></span><span class="t">'+txt+'</span><span class="r">open ›</span></div>'; }
  if(myOver>0) items+=arow('#DA1017', myOver+' of your tasks are overdue','tasks');
  if(myToday>0) items+=arow('#c47f00', myToday+' task'+(myToday>1?'s':'')+' due today','tasks');
  if(isMon && (DASH.chaseT||DASH.chaseC)) items+=arow('#c47f00', (DASH.chaseT+DASH.chaseC)+' overdue across the team','taskmon');
  calToday.slice(0,5).forEach(function(c){ items+='<div class="dash-att" onclick="go(\'calendar\')"><span class="dot" style="background:'+(String(c.status)==='done'?'#1a7f37':'#7F77DD')+'"></span><span class="t">'+(c.startTime?esc(c.startTime)+' · ':'')+esc(c.title)+'</span><span class="r">calendar ›</span></div>'; });
  if(!items) items='<div class="dash-att muted"><span class="t">Nothing pending today. 🎉</span></div>';
  att+='<div class="section-label">Needs attention today</div>'+items;
  var html=att;
  /* v307: the "Department health" tile board is gone. Every tile on it was a process pipeline, and the
     pipelines went with the CRM/process engine. Nothing is put in its place — the branch business table,
     the card snapshot and the finance blocks below already answer the questions it was standing in for. */
  if(isManager && !branch && Object.keys(brs).length>1){
    var rows=Object.keys(brs).map(function(bid){
      var be=emp.filter(function(e){return String(e.Branch)===bid;}).length;
      var bc=activeCards.filter(function(c){return String(c.branchId)===bid;});
      var brev=bc.reduce(function(s,c){return s+(Number(c.amount)||0);},0);
      var dd=dailyByBr[bid]||{cash:0,bank:0,other:0,pat:0,test:0};
      var biz=dd.cash+dd.bank+dd.other;
      return {name:branchName(bid),staff:be,cards:bc.length,rev:brev,cash:dd.cash,bank:dd.bank,other:dd.other,biz:biz,pat:dd.pat,test:dd.test,
        avg:(dd.pat>0?Math.round(biz/dd.pat):0), rTest:(dd.test>0?Math.round(biz/dd.test):0), rStaff:(be>0?Math.round(biz/be):0)};
    }).sort(function(a,b){return b.biz-a.biz;});
    html+=heldBackStrip();
    html+='<div class="section-label">By branch · business this month</div><div class="card"><div class="table-wrap swipe"><table><thead><tr><th>Branch</th><th>Business (MTD)</th><th>Cash</th><th>Bank / UPI</th><th>Other</th><th>Patients</th><th>Avg / patient</th><th>Tests</th><th>Rev / test</th><th>No. of cards</th><th>Card business</th><th>Staff</th><th>Rev / staff</th></tr></thead><tbody>'+
      rows.map(function(r){return '<tr><td><b>'+esc(r.name)+'</b></td><td>₹'+fmtMoney(r.biz)+'</td><td>₹'+fmtMoney(r.cash)+'</td><td>₹'+fmtMoney(r.bank)+'</td><td>₹'+fmtMoney(r.other)+'</td><td>'+r.pat+'</td><td>₹'+fmtMoney(r.avg)+'</td><td>'+r.test+'</td><td>₹'+fmtMoney(r.rTest)+'</td><td>'+r.cards+'</td><td>₹'+fmtMoney(r.rev)+'</td><td>'+r.staff+'</td><td>₹'+fmtMoney(r.rStaff)+'</td></tr>';}).join('')+'</tbody></table></div></div>';
  }
  /* v276 (task 4): the cards board is a MONTH SNAPSHOT now, not "whatever is live right now".
     Two different questions get asked about cards: how many did we sell that month (Issued), and how
     many were live at the end of it (the type columns and Active total). Showing only the second made
     a month's sales invisible, and showing today's count beside a past month would be quietly wrong.
     "Live at month end" is DERIVED rather than read from status — issued on or before the month end,
     not expired by then, not cancelled. That is what makes an earlier month reproducible; the `status`
     field only ever describes today. */
  /* v277: the card snapshot month is the DASHBOARD month picker in the header — there is no longer a
     second picker inside this section. Two independent pickers showing the same month by coincidence
     read as a bug: changing one left the other behind. One control, one month, whole page. */
  var cardYm=dashYm();
  function monthEndOf(ym){ var y=Number(ym.slice(0,4)), m=Number(ym.slice(5,7)); return new Date(y, m, 0, 23, 59, 59); }
  function cd10(v){ if(!v) return ''; var d=new Date(v); return isNaN(d)?String(v).slice(0,10):(d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)); }
  var cardEnd=monthEndOf(cardYm);
  var liveAtEnd=cards.filter(function(c){
    if(String(c.status)==='cancelled') return false;
    var iss=c.issuedDate?new Date(c.issuedDate):null; if(!iss||isNaN(iss)||iss>cardEnd) return false;
    var exp=c.expiryDate?new Date(c.expiryDate):null; if(exp&&!isNaN(exp)&&exp<cardEnd) return false;
    return true;
  });
  var issuedIn=cards.filter(function(c){ return cd10(c.issuedDate).slice(0,7)===cardYm; });
  var types={}, byBT={}, byIss={}, brOrder=[];
  liveAtEnd.forEach(function(c){ var ty=String(c.typeId||'\u2014'); types[ty]=1; var b=String(c.branchId||''); if(!byBT[b]){ byBT[b]={}; brOrder.push(b); } byBT[b][ty]=(byBT[b][ty]||0)+1; });
  issuedIn.forEach(function(c){ var b=String(c.branchId||''); if(!byBT[b]){ byBT[b]={}; brOrder.push(b); } byIss[b]=(byIss[b]||0)+1; });
  var typeList=Object.keys(types).sort();
  if(typeList.length||issuedIn.length){
    var colTot={}; typeList.forEach(function(t){colTot[t]=0;}); var grand=0, issTot=0;
    var bodyRows=brOrder.sort(function(a,b){ var ta=0,tb=0; typeList.forEach(function(t){ta+=((byBT[a]||{})[t]||0);tb+=((byBT[b]||{})[t]||0);}); return tb-ta; }).map(function(b){
      var row=byBT[b]||{}, tot=0;
      var cells=typeList.map(function(t){ var n=row[t]||0; tot+=n; colTot[t]+=n; return '<td>'+n+'</td>'; }).join('');
      grand+=tot; var iss=byIss[b]||0; issTot+=iss;
      return '<tr><td><b>'+esc(branchName(b))+'</b></td><td><b>'+iss+'</b></td>'+cells+'<td><b>'+tot+'</b></td></tr>';
    }).join('');
    var totRow='<tr><td><b>Total</b></td><td><b>'+issTot+'</b></td>'+typeList.map(function(t){return '<td><b>'+colTot[t]+'</b></td>';}).join('')+'<td><b>'+grand+'</b></td></tr>';
    html+='<div class="section-label" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Membership cards \u00b7 by branch &amp; type'+
      '<span style="font-size:11px;color:#888;font-weight:400">'+esc(ymLabel(cardYm))+' \u00b7 issued = sold that month \u00b7 type columns = live at month end</span></div>'+
      '<div class="card"><div class="table-wrap swipe"><table><thead><tr><th>Branch</th><th>Issued</th>'+typeList.map(function(t){return '<th>'+esc(t)+'</th>';}).join('')+'<th>Active total</th></tr></thead><tbody>'+bodyRows+totRow+'</tbody></table></div></div>';
  }
  /* v286: partner review sits directly under the finance table — same month, same branch scope. */
  html+='<div id="finDash"></div><div id="stmtTable"></div><div id="partnerReview"></div>';
  $('dashExtra').innerHTML=html;
  /* v277: the inline cardYm picker is gone — the header month drives this section (see bindApp). */
  /* v307: Star performers board removed (it lived in staffperf.js, deleted with Staff Performance). */
  if(window.renderQuickLog){ try{ window.renderQuickLog(document.getElementById('quickLog')); }catch(_){} }
  var dashBr=(S.perms&&S.perms.canViewAll)?(($('dashBranch')||{}).value||''):'';
  if(window.renderFinDash){ try{ window.renderFinDash(document.getElementById('finDash'), dashBr); }catch(_){} }
  if(window.renderStatementTable){ try{ window.renderStatementTable(document.getElementById('stmtTable'), dashBr); }catch(_){} }
  if(window.renderPartnerReview){ try{ window.renderPartnerReview(document.getElementById('partnerReview'), dashBr); }catch(_){} }
  /* consultant: hide the business month picker and the "Recently added staff" block */
  var _rt=$('recentTable'), _rc=_rt&&_rt.closest?_rt.closest('.card'):null, _rl=_rc?_rc.previousElementSibling:null;
  if(_rc){ _rc.style.display=isCons?'none':''; } if(_rl && _rl.classList && _rl.classList.contains('section-label')){ _rl.style.display=isCons?'none':''; }
  var recent=emp.slice().sort(function(a,b){return a.EmpID<b.EmpID?1:-1;}).slice(0,6);
  var tb=$('recentTable').querySelector('tbody'); var rhtml='';
  if(!recent.length){ rhtml='<tr><td class="empty">No staff yet.</td></tr>'; }
  else recent.forEach(function(e){ rhtml+='<tr><td><b>'+esc(e.FullName)+'</b>'+pend(e)+'</td><td>'+esc(e.Role)+'</td><td>'+officeBadge(e)+'</td><td>'+statusBadge(e.Status)+'</td></tr>'; });
  tb.innerHTML=rhtml;
  if(_se && _sy>0){ _se.scrollTop=_sy; requestAnimationFrame(function(){ if(Math.abs(_se.scrollTop-_sy)>2) _se.scrollTop=_sy; }); }
  }catch(_dashErr){ try{ console.error('renderDashboard error:',_dashErr); var _de=document.getElementById('dashExtra'); if(_de && !String(_de.innerHTML||'').trim()){ _de.innerHTML='<div class="empty" style="padding:20px">Dashboard couldn\'t load fully — tap ⋯ More ▸ Check update, or reload the app. ('+esc((_dashErr&&_dashErr.message)||_dashErr)+')</div>'; } }catch(_e2){} }
}
function kpi(n,l){ return '<div class="kpi"><div class="n">'+n+'</div><div class="l">'+esc(l)+'</div></div>'; }
/* v305: the money the dashboard is deliberately NOT counting yet, and why.
   Only shown when there is something outstanding — a clean day shows nothing at all. Silent on any
   screen where the user cannot act on it either: it names the branches and the oldest day, so the
   answer to "why is business low today" is on the same screen as the low figure. */
function heldBackStrip(){
  var p=(DASH.pendingDaily||[]);
  if(!p.length) return '';
  var total=0, oldest=p[0], brs={};
  p.forEach(function(d){ total+=Number(d.total)||0; if(d.branchName) brs[d.branchName]=1; });
  var age=Number(oldest.ageDays)||0, aged=age>=2;
  var names=Object.keys(brs);
  var who=names.length>2 ? (names.length+' branches') : names.join(' and ');
  return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;'+
    'background:'+(aged?'#fdecec':'#faf4e2')+';border:1px solid '+(aged?'#e3b1b1':'#efc98a')+';'+
    'border-radius:10px;padding:10px 13px;margin:12px 0;font-size:13px;color:'+(aged?'#7a2020':'#5c3d00')+'">'+
    '<span style="flex:1;line-height:1.6"><b>₹'+fmtMoney(total)+' is not counted above</b> — '+
      p.length+' day'+(p.length===1?'':'s')+' filed but not yet verified'+(who?(' ('+esc(who)+')'):'')+'. '+
      'Oldest is '+esc(oldest.date)+(age?(' · '+age+' day'+(age===1?'':'s')+' ago'):' · today')+'. '+
      'It joins these figures as soon as it is verified in Accounts.</span></div>';
}
function kpiC(n,l,cls){ return '<div class="kpi k-'+(cls||'')+'"><div class="n">'+n+'</div><div class="l">'+esc(l)+'</div></div>'; }
/* v307: openDept / deptIcon / procCounts / deptCard removed with the department health board. */

/* employees */
function loadEmployees(){
  $('empEmpty').classList.add('hidden');
  API.cachedEmployees().then(function(c){ if(c&&c.length){ S.employees=c; $('empLoad').classList.add('hidden'); renderEmpTable(); } else { $('empLoad').classList.remove('hidden'); $('empTable').querySelector('tbody').innerHTML=''; } });
  API.listEmployees().then(function(r){ if(r&&r.employees){ S.employees=r.employees; S.perms=r.perms||S.perms; } $('empLoad').classList.add('hidden'); renderEmpTable(); }).catch(function(){ $('empLoad').classList.add('hidden'); });
}
function renderEmpTable(){
  var q=$('empSearch').value.trim().toLowerCase(), fb=$('filterBranch').value, fs=$('filterStatus').value;
  var list=S.employees.filter(function(e){
    if(fb && String(e.Branch)!==fb) return false;
    if(fs && String(e.Status)!==fs) return false;
    if(q && (e.FullName+' '+e.LoginID+' '+e.EmpID+' '+e.Role+' '+(e.Phone||'')+' '+(e.Email||'')).toLowerCase().indexOf(q)<0) return false;
    return true;
  });
  var tb=$('empTable').querySelector('tbody'); tb.innerHTML='';
  if(!list.length){ $('empEmpty').classList.remove('hidden'); return; }
  $('empEmpty').classList.add('hidden');
  var html='';
  list.forEach(function(e){
    var canEdit=S.perms&&(S.perms.canManageAll||S.perms.level==='BRANCH_MGR'||(S.user&&e.EmpID===S.user.EmpID));
    var acts='<button class="btn ghost sm" onclick="viewEmp(\''+e.EmpID+'\')">View</button>';
    if(canEdit && !e._pending) acts+=' <button class="btn ghost sm" onclick="openEmpModal(\''+e.EmpID+'\')">Edit</button>';
    html+='<tr>'+
      '<td>'+esc(e._pending?'—':e.EmpID)+'</td>'+
      '<td><b>'+esc(e.FullName)+'</b>'+pend(e)+'</td>'+
      '<td>'+esc(e.LoginID||'—')+'</td>'+
      '<td>'+esc(e.Role)+'</td>'+
      '<td>'+officeBadge(e)+'</td>'+
      '<td>'+esc(e.Phone||'—')+'</td>'+
      '<td>'+statusCell(e)+'</td>'+
      '<td><div class="row-actions">'+acts+'</div></td></tr>';
  });
  tb.innerHTML=html;
}
function pend(e){ return e._pending?' <span class="badge pending">syncing</span>':''; }
function officeBadge(e){ return e.OfficeType==='Corporate'?'<span class="badge office">Corporate</span>':'<span class="badge branch">'+esc(branchName(e.Branch))+'</span>'; }
function branchName(id){ var b=((S.meta&&S.meta.branches)||[]).filter(function(x){return x.BranchID===id;})[0]; return b?b.BranchName:(id||'—'); }
function statusBadge(s){ return '<span class="badge '+(s==='Active'?'active':'inactive')+'">'+esc(s||'Active')+'</span>'; }
/* Inline Active/Inactive dropdown — only managers (admin/HR, or a branch manager for their own branch) can change status; never your own row. */
function canMgStatus(e){ return !!(S.perms && (S.perms.canManageAll || (S.perms.level==='BRANCH_MGR' && String(e.Branch)===String((S.user&&S.user.Branch)||''))) && !(S.user&&String(e.EmpID)===String(S.user.EmpID))); }
function statusCell(e){
  if(e._pending || !canMgStatus(e)) return statusBadge(e.Status);
  var s=(e.Status==='Inactive')?'Inactive':'Active', on=(s==='Active');
  var st='border:1px solid '+(on?'#cfe3d4':'#f0cccc')+';border-radius:8px;padding:5px 26px 5px 9px;font-size:12.5px;font-weight:700;color:'+(on?'#1a8f4c':'#b23b3b')+';background:'+(on?'#f3fbf5':'#fdf3f3')+';';
  return '<select data-emp="'+esc(e.EmpID)+'" onchange="changeEmpStatus(this)" style="'+st+'">'+
    ['Active','Inactive'].map(function(o){ return '<option'+(o===s?' selected':'')+'>'+o+'</option>'; }).join('')+'</select>';
}
function changeEmpStatus(sel){
  var empId=sel.getAttribute('data-emp'), val=sel.value, e=(S.employees||[]).filter(function(x){return String(x.EmpID)===String(empId);})[0];
  var prev=e?e.Status:'Active'; if(val===prev) return;
  if(val==='Inactive' && !confirm('Make '+((e&&e.FullName)||'this staff member')+' inactive? They will no longer be able to log in.')){ sel.value=prev; return; }
  sel.disabled=true;
  API.setStatus(empId,val).then(function(r){
    if(r&&r.ok){ if(e) e.Status=val; toast(val==='Active'?'Activated':'Set inactive'); renderEmpTable(); }
    else { sel.disabled=false; toast((r&&r.error)||'Could not update status',true); sel.value=prev; }
  }).catch(function(){ sel.disabled=false; toast('Changing status needs an internet connection.',true); sel.value=prev; });
}

function viewEmp(empId){
  API.getEmployee(empId).then(function(r){
    if(!r.ok){ toast(r.error,true); return; }
    var e=r.employee;
    var rows=[['Employee ID',e.EmpID],['Login ID',e.LoginID],['Full name',e.FullName],['Role',e.Role],['Office',e.OfficeType],
      ['Branch',branchName(e.Branch)],['Reports to',e.ReportsTo],['Phone',e.Phone],['Email',e.Email],['Gender',e.Gender],
      ['Date of birth',dateNice(e.DOB)],['Joining date',dateNice(e.JoiningDate)],['Address',e.Address],
      ['Emergency contact',(e.EmergencyName||'')+(e.EmergencyPhone?(' · '+e.EmergencyPhone):'')],['Status',e.Status]];
    var body='<div class="grid2">'+rows.map(function(p){return '<div class="field"><label>'+esc(p[0])+'</label><div>'+esc(p[1]||'—')+'</div></div>';}).join('')+'</div>';
    var foot=r.canEdit?'<button class="btn" onclick="closeModal();openEmpModal(\''+e.EmpID+'\')">Edit</button>':'';
    openModal(e.FullName, body, '<button class="btn ghost" onclick="closeModal()">Close</button>'+foot);
  });
}

function openEmpModal(empId){
  var editing=!!empId, manage=S.perms&&(S.perms.canManageAll||S.perms.level==='BRANCH_MGR');
  function build(e){
    e=e||{Status:'Active'};
    var roleOpts=S.meta.roles.map(function(r){
      var allow=true; if(S.perms.level==='BRANCH_MGR'){ allow=(r.OfficeType==='Branch' && ['SUPER','HR_ADMIN','BRANCH_MGR','BRANCH_VIEW'].indexOf(r.AccessLevel)<0); }
      return allow?'<option value="'+esc(r.Role)+'"'+(r.Role===e.Role?' selected':'')+'>'+esc(r.Role)+' ('+esc(r.OfficeType)+')</option>':'';
    }).join('');
    var brOpts=S.meta.branches.filter(function(b){return b.Type==='Branch';}).map(function(b){ return '<option value="'+esc(b.BranchID)+'"'+(b.BranchID===e.Branch?' selected':'')+'>'+esc(b.BranchName)+'</option>'; }).join('');
    var adminBlock=manage?(
      '<div class="section-title full">Role &amp; posting</div>'+
      '<div class="field"><label>Role *</label><select id="f_Role">'+roleOpts+'</select></div>'+
      '<div class="field" id="branchField"><label>Branch *</label><select id="f_Branch"><option value="">Select branch</option>'+brOpts+'</select></div>'+
      '<div class="field full"><label>Reports to (name/role)</label><input id="f_ReportsTo" value="'+esc(e.ReportsTo||'')+'"></div>'
    ):'';
    var nameField=manage?'<div class="field"><label>Full name *</label><input id="f_FullName" value="'+esc(e.FullName||'')+'"></div>':'<div class="field"><label>Full name</label><div>'+esc(e.FullName||'')+'</div></div>';
    var joinField=manage?'<div class="field"><label>Joining date</label><input id="f_JoiningDate" type="date" value="'+esc(dateInp(e.JoiningDate))+'"></div>':'';
    function fld(lbl,id,v,t){ return '<div class="field"><label>'+lbl+'</label><input id="'+id+'"'+(t?(' type="'+t+'"'):'')+' value="'+esc(v||'')+'"></div>'; }
    function sel(lbl,id,arr,v){ return '<div class="field"><label>'+lbl+'</label><select id="'+id+'"><option value=""></option>'+arr.map(function(o){return '<option'+(String(o)===String(v)?' selected':'')+'>'+esc(o)+'</option>';}).join('')+'</select></div>'; }
    var eduArr=e.EduDocsUrl?String(e.EduDocsUrl).split(',').filter(Boolean):[];
    window._empDocs={Aadhaar:e.AadhaarUrl||'',Pan:e.PanUrl||'',DL:e.DLUrl||'',LightBill:e.LightBillUrl||'',Edu:eduArr.slice()};
    var extBlock=manage?(
      '<div class="section-title full">Family</div>'+
      fld('Father name','f_FatherName',e.FatherName)+fld('Father phone','f_FatherPhone',e.FatherPhone)+
      fld('Mother name','f_MotherName',e.MotherName)+fld('Mother phone','f_MotherPhone',e.MotherPhone)+
      fld('Spouse name','f_SpouseName',e.SpouseName)+fld('Spouse phone','f_SpousePhone',e.SpousePhone)+
      '<div class="field"><label>Anniversary</label><input id="f_Anniversary" type="date" value="'+esc(dateInp(e.Anniversary))+'"></div>'+
      '<div class="section-title full">Bank</div>'+
      fld('Bank name / prefix','f_BankPrefix',e.BankPrefix)+fld('IFSC','f_IFSC',e.IFSC)+fld('Account number','f_AccountNo',e.AccountNo)+
      '<div class="section-title full">Work &amp; pay</div>'+
      fld('Duty start','f_DutyStart',timeInp(e.DutyStart),'time')+fld('Duty end','f_DutyEnd',timeInp(e.DutyEnd),'time')+
      fld('Alt shift start','f_AltDutyStart',timeInp(e.AltDutyStart),'time')+fld('Alt shift end','f_AltDutyEnd',timeInp(e.AltDutyEnd),'time')+
      '<div class="field"><label>Actual salary (₹/month)</label><input id="f_ActualSalary" type="number" value="'+esc(e.ActualSalary===''||e.ActualSalary==null?(e.BasicSalary||''):e.ActualSalary)+'"><div id="salSplit" style="font-size:11px;color:#9aa0a6;margin-top:3px"></div></div>'+
      '<div class="field"><label>Pay mode</label><select id="f_PayMode"><option value="">Standard — deductions apply</option><option value="gross"'+(String(e.PayMode).toLowerCase()==='gross'?' selected':'')+'>Gross salary — no deductions</option></select></div>'+
      '<div class="field"><label>PF (provident fund)</label><select id="f_PfApplicable"><option value="">In PF scheme</option><option value="no"'+(String(e.PfApplicable).toLowerCase()==='no'?' selected':'')+'>Not in PF scheme</option></select><div style="font-size:11px;color:#9aa0a6;margin-top:3px">₹1,800 flat at ₹15,000+, otherwise 12% of basic.</div></div>'+
      '<div class="field"><label>Conveyance allowance</label><select id="f_ConveyAllow"><option value="">No — basic 55% / HRA 45%</option><option value="yes"'+(String(e.ConveyAllow).toLowerCase().charAt(0)==='y'?' selected':'')+'>Yes — basic 50% / HRA 40% / conveyance 10%</option></select><div style="font-size:11px;color:#9aa0a6;margin-top:3px">Only for staff whose salary is structured with a conveyance head. PF staff only.</div></div>'+
      '<div class="field"><label>ESIC</label><select id="f_EsiApplicable"><option value="">Deduct — 0.75% of basic</option><option value="no"'+(String(e.EsiApplicable).toLowerCase()==='no'?' selected':'')+'>Never deduct</option></select></div>'+
      '<div class="field"><label>Professional tax (₹/month)</label><input id="f_PtAmount" type="number" placeholder="auto" value="'+esc(e.PtAmount===''||e.PtAmount==null?'':e.PtAmount)+'"><div style="font-size:11px;color:#9aa0a6;margin-top:3px">Blank = ₹200 at ₹15,000+, nil below. Enter a number to override, 0 to skip.</div></div>'+
      sel('Attendance mode','f_AttendanceMode',['Geo only — lab staff','Geo — WFH','Selfie only — field staff','Geo + Selfie — both required'],e.AttendanceMode)+
      '<div class="field"><label>Punch in/out required</label><select id="f_PunchRequired"><option value="">Yes — normal staff</option><option value="no"'+(String(e.PunchRequired)==='no'?' selected':'')+'>No — partner / exempt</option></select><div style="font-size:11px;color:#9aa0a6;margin-top:3px">"No" = never chased for punch-in, never counted in the L (not punched) list.</div></div>'+
      '<div class="field"><label>Sunday work</label><select id="f_SundayWork"><option value="">No</option><option value="every"'+(String(e.SundayWork)==='every'?' selected':'')+'>Every Sunday</option><option value="alternate"'+(String(e.SundayWork)==='alternate'?' selected':'')+'>Alternate Sunday</option></select></div>'+
      '<div class="field"><label>Sunday time</label><input id="f_SundayHours" type="text" placeholder="e.g. 5:00 am to 9:00 am" value="'+esc(e.SundayHours||'')+'"></div>'+
      sel('Pay / visit type','f_PayType',['Fixed salary','Per km','Per visit'],e.PayType)+
      fld('Per-km rate (₹)','f_PerKmRate',e.PerKmRate,'number')+fld('Per-visit rate (₹)','f_PerVisitRate',e.PerVisitRate,'number')+
      '<div class="field full"><label>KRA (key responsibilities)</label><textarea id="f_KRA" rows="2">'+esc(e.KRA||'')+'</textarea></div>'+
      (['SUPER','HR_ADMIN'].indexOf(S.perms.level)>=0 ?
        '<div class="field full" style="display:flex;align-items:center;gap:8px;margin-top:4px"><input type="checkbox" id="f_AttApproveDenied" style="width:16px;height:16px" '+(String(e.AttApproveDenied)==='yes'?'checked':'')+'><label for="f_AttApproveDenied" style="margin:0;font-size:13px">Remove attendance-approval authority (even if their role normally grants it)</label></div>'
        : '')+
      '<div class="section-title full">Documents (upload)</div>'+
      docFieldRow('Aadhaar card','Aadhaar',e.AadhaarUrl,'up')+docFieldRow('PAN card','Pan',e.PanUrl,'up')+docFieldRow('Driving licence (if applicable)','DL',e.DLUrl,'up')+docFieldRow('Light bill','LightBill',e.LightBillUrl,'up')+
      '<div class="field full"><label>Education documents (multiple)</label><div id="upEduList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:6px">'+eduArr.map(function(u,i){return '<a href="'+esc(u)+'" target="_blank" style="font-size:13px;color:#185FA5;text-decoration:none">📄 Education document '+(i+1)+'</a>';}).join('')+'</div><input type="file" id="up_Edu" multiple accept="image/*,application/pdf"></div>'
    ):'';
    var body='<div class="grid2">'+
      '<div class="section-title full">Basic details</div>'+nameField+joinField+
      '<div class="field"><label>Phone</label><input id="f_Phone" value="'+esc(e.Phone||'')+'"></div>'+
      '<div class="field"><label>Email</label><input id="f_Email" type="email" value="'+esc(e.Email||'')+'"></div>'+
      '<div class="field"><label>Gender</label><select id="f_Gender">'+genderOpts(e.Gender)+'</select></div>'+
      '<div class="field"><label>Date of birth</label><input id="f_DOB" type="date" value="'+esc(dateInp(e.DOB))+'"></div>'+
      adminBlock+
      '<div class="section-title full">Contact &amp; emergency</div>'+
      '<div class="field full"><label>Address</label><textarea id="f_Address" rows="2">'+esc(e.Address||'')+'</textarea></div>'+
      '<div class="field"><label>Emergency contact name</label><input id="f_EmergencyName" value="'+esc(e.EmergencyName||'')+'"></div>'+
      '<div class="field"><label>Emergency contact phone</label><input id="f_EmergencyPhone" value="'+esc(e.EmergencyPhone||'')+'"></div>'+
      extBlock+
    '</div>'+
    (editing&&manage&&navigator.onLine?'<div style="margin-top:14px"><button class="btn ghost sm" onclick="resetPw(\''+e.EmpID+'\')">Reset login password</button></div>':'');
    var foot='<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="saveEmpBtn">'+(editing?'Save changes':'Create staff')+'</button>';
    openModal(editing?('Edit · '+e.FullName):'Add Staff', body, foot);
    var roleSel=$('f_Role');
    function syncBranch(){ if(!roleSel) return; var sel=S.meta.roles.filter(function(r){return r.Role===roleSel.value;})[0]; var bf=$('branchField'); if(bf) bf.style.display=(sel&&sel.OfficeType==='Branch')?'':'none'; }
    if(roleSel){ roleSel.addEventListener('change',syncBranch); syncBranch(); }
    /* Live Basic 55% / HRA 45% split under the salary box, plus which PF band the person falls in,
       so whoever types the number can see what it actually becomes. Mirrors payCalc_ in Code.gs. */
    (function(){
      var si=$('f_ActualSalary'), so=$('salSplit'); if(!si||!so) return;
      function money(n){ return '₹'+Math.round(n).toLocaleString('en-IN'); }
      function upd(){
        var a=Number(si.value)||0;
        if(a<=0){ so.innerHTML='Basic and HRA are worked out from this. Leave blank and the person stays at ₹0.'; return; }
        var basic=Math.round(a*0.55), hra=a-basic;
        var gross=(($('f_PayMode')||{}).value==='gross');
        var band=gross?'Gross pay — no PF, ESIC or professional tax.'
          :(a>=15000?('₹15,000+ band — PF ₹1,800 flat, professional tax ₹200.')
                    :('Below ₹15,000 — PF 12% of basic ('+money(basic*0.12)+'), no professional tax.'));
        so.innerHTML='Basic <b>'+money(basic)+'</b> (55%) · HRA <b>'+money(hra)+'</b> (45%)<br>'+band;
      }
      si.addEventListener('input',upd);
      var pm=$('f_PayMode'); if(pm) pm.addEventListener('change',upd);
      upd();
    })();
    if(S.perms.level==='BRANCH_MGR'){ var bs=$('f_Branch'); if(bs){ bs.value=S.perms.branch; bs.disabled=true; } }
    var empDocsPending=0;
    function empDocsSaveState(){ var b=$('saveEmpBtn'); if(!b) return; b.disabled=empDocsPending>0; if(empDocsPending>0) b.textContent='Uploading… ('+empDocsPending+') — please wait'; else b.textContent=editing?'Save changes':'Create staff'; }
    function empDocDone(key,url,name){
      if(key==='Edu'){ window._empDocs.Edu.push(url); var list=$('upEduList'); if(list) list.insertAdjacentHTML('beforeend','<a href="'+esc(url)+'" target="_blank" style="font-size:13px;color:#185FA5;text-decoration:none">📄 '+esc(name)+'</a>'); }
      else window._empDocs[key]=url;
    }
    ['Aadhaar','Pan','DL','LightBill'].forEach(function(k){ bindDocField('up',k,false,empDocDone,function(d){ empDocsPending+=d; empDocsSaveState(); }); });
    bindDocField('up','Edu',true,empDocDone,function(d){ empDocsPending+=d; empDocsSaveState(); });
    $('saveEmpBtn').addEventListener('click', function(){ if(empDocsPending>0){ toast('Still uploading — wait for uploads to finish before saving.',true); return; } saveEmp(editing?e.EmpID:null, manage); });
  }
  if(editing){ API.getEmployee(empId).then(function(r){ if(r.ok) build(r.employee); else toast(r.error,true); }); } else { build(null); }
}
function genderOpts(v){ return ['','Male','Female','Other'].map(function(g){return '<option'+(g===v?' selected':'')+'>'+g+'</option>';}).join(''); }
function downloadEmpFormPdf(){
  var logo=new Image(); logo.onload=function(){ draw(logo); }; logo.onerror=function(){ draw(null); }; logo.src='icons/login-logo.png';
  function draw(logo){
    var W=1240,H=1754,M=70; var c=document.createElement('canvas'); c.width=W; c.height=H; var x=c.getContext('2d');
    x.fillStyle='#fff'; x.fillRect(0,0,W,H); x.fillStyle='#DA1017'; x.fillRect(0,0,W,10);
    if(logo){ var lh=70, lw=Math.min(360, logo.width*(lh/logo.height)); x.drawImage(logo,M,38,lw,lh); } else { x.fillStyle='#DA1017'; x.font='bold 32px Arial'; x.fillText('NAKODA',M,86); }
    x.textAlign='right'; x.fillStyle='#888'; x.font='13px Arial'; x.fillText('Employee Details Form', W-M, 60); x.textAlign='left';
    x.fillStyle='#1f1f1f'; x.font='bold 26px Arial'; x.fillText('EMPLOYEE DETAILS FORM', M, 150);
    x.strokeStyle='#e2e5ea'; x.beginPath(); x.moveTo(M,168); x.lineTo(W-M,168); x.stroke();
    var y=200;
    function head(t){ x.fillStyle='#DA1017'; x.font='bold 15px Arial'; x.fillText(t,M,y); y+=24; }
    function line(lbl){ x.fillStyle='#444'; x.font='13px Arial'; x.fillText(lbl+':',M,y); x.strokeStyle='#cfd3da'; x.beginPath(); x.moveTo(M+230,y+3); x.lineTo(W-M,y+3); x.stroke(); y+=34; }
    function two(a,b){ x.fillStyle='#444'; x.font='13px Arial'; var midX=M+(W-2*M)/2; x.fillText(a+':',M,y); x.strokeStyle='#cfd3da'; x.beginPath(); x.moveTo(M+130,y+3); x.lineTo(midX-20,y+3); x.stroke(); x.fillText(b+':',midX,y); x.beginPath(); x.moveTo(midX+130,y+3); x.lineTo(W-M,y+3); x.stroke(); y+=34; }
    head('Personal'); two('Name','Date of birth'); two('Phone','Email'); two('Anniversary','Gender'); line('Address');
    head('Family'); two('Father name','Father phone'); two('Mother name','Mother phone'); two('Spouse name','Spouse phone');
    head('Bank'); two('Bank name','IFSC'); line('Account number');
    head('Work'); two('Role','Reports to'); two('Duty time','Basic salary'); line('KRA');
    head('Documents attached (tick)'); x.font='14px Arial';
    [['Aadhaar card','PAN card'],['Driving licence','Light bill'],['Education documents','Photo']].forEach(function(p){ x.strokeStyle='#888'; x.strokeRect(M,y-13,16,16); x.fillStyle='#333'; x.fillText(p[0],M+26,y); var mid=M+(W-2*M)/2; x.strokeRect(mid,y-13,16,16); x.fillText(p[1],mid+26,y); y+=30; });
    y+=20; x.strokeStyle='#bbb'; x.beginPath(); x.moveTo(M,y); x.lineTo(M+300,y); x.moveTo(W-M-300,y); x.lineTo(W-M,y); x.stroke();
    x.fillStyle='#333'; x.font='13px Arial'; x.fillText('Employee signature', M, y+24); x.fillText('HR verified by', W-M-300, y+24);
    x.fillStyle='#888'; x.font='italic 13px Arial'; x.textAlign='center'; x.fillText('Fill & attach documents · submit to HR · Nakoda Diagnostics And Research Center', W/2, H-40); x.textAlign='left';
    c.toBlob(function(b){ var u=URL.createObjectURL(b); var a=document.createElement('a'); a.href=u; a.download='Employee-Form.png'; a.click(); setTimeout(function(){URL.revokeObjectURL(u);},2000); toast('Employee form saved'); });
  }
}
/* ---------- Shared document-upload field: once a file is uploaded, the "Choose File" input disappears and is
   replaced by a clickable document name (opens the file); a small "Replace" link swaps the picker back in. ---------- */
function docFieldRow(lbl,key,url,idPrefix){
  return '<div class="field full"><label>'+lbl+'</label><div id="'+idPrefix+'wrap_'+key+'">'+
    (url?docFieldUploadedHtml(url,null,key,idPrefix):('<input type="file" id="'+idPrefix+'_'+key+'" accept="image/*,application/pdf">'))+
  '</div></div>';
}
function docFieldUploadedHtml(url,name,key,idPrefix){
  return '<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:#f9fafb">'+
    '<a href="'+esc(url)+'" target="_blank" style="flex:1;font-size:13px;color:#185FA5;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📄 '+esc(name||'Document uploaded — tap to view')+'</a>'+
    '<span data-replace="'+key+'" style="font-size:12px;color:#888;text-decoration:underline;cursor:pointer;flex-shrink:0">Replace</span>'+
  '</div>';
}
/* Wires one document field: attaches the file input's change handler (uploads, then swaps the row to the
   "uploaded" view) and the Replace link (swaps back to a fresh file input). `onDone(key,url)` is called with
   the new URL once a file finishes uploading so the caller can update its own state object. */
function bindDocField(idPrefix, key, multi, onDone, onPendingChange){
  function wireInput(){
    var inp=$(idPrefix+'_'+key); if(!inp) return;
    inp.onchange=function(){
      var files=inp.files; if(!files||!files.length) return;
      [].forEach.call(files,function(f){
        /* Photos of an Aadhaar or PAN card are the worst offenders for size — API.upload resizes
           them on the device, so the old 4MB rejection no longer turns people away. */
        if(onPendingChange) onPendingChange(1);
        function setSt(msg,bad){ var w=$(idPrefix+'wrap_'+key);
          if(w && !multi) w.innerHTML='<div class="upst" style="font-size:12px;color:'+(bad?'#b23b3b':'#666')+'">'+esc(msg)+'</div>'
            +(bad?'<input type="file" id="'+idPrefix+'_'+key+'" accept="image/*,application/pdf">':''); }
        setSt('Preparing '+f.name+'…');
        API.upload(f,'EmployeeDocs',function(m){ setSt(m); }).then(function(r){
          if(onPendingChange) onPendingChange(-1);
          onDone(key,r.url,f.name);
          if(!multi){ var w=$(idPrefix+'wrap_'+key); if(w) w.innerHTML=docFieldUploadedHtml(r.url,f.name,key,idPrefix); wireReplace(); }
        }, function(e){
          if(onPendingChange) onPendingChange(-1);
          setSt((e&&e.message)||'Upload failed',1); wireInput();
        });
      });
    };
  }
  function wireReplace(){
    var link=document.querySelector('[data-replace="'+key+'"]'); if(!link) return;
    link.onclick=function(){ var w=$(idPrefix+'wrap_'+key); if(w){ w.innerHTML='<input type="file" id="'+idPrefix+'_'+key+'" accept="image/*,application/pdf">'; } wireInput(); };
  }
  wireInput(); wireReplace();
}
function val(id){ var e=$(id); return e?e.value.trim():undefined; }
function saveEmp(empId, manage){
  var data={ Phone:val('f_Phone'),Email:val('f_Email'),Gender:val('f_Gender'),DOB:val('f_DOB'),Address:val('f_Address'),EmergencyName:val('f_EmergencyName'),EmergencyPhone:val('f_EmergencyPhone') };
  if(manage){ data.FullName=val('f_FullName'); data.Role=val('f_Role'); data.JoiningDate=val('f_JoiningDate'); data.ReportsTo=val('f_ReportsTo'); var bs=$('f_Branch'); if(bs) data.Branch=bs.value;
    ['FatherName','FatherPhone','MotherName','MotherPhone','SpouseName','SpousePhone','Anniversary','BankPrefix','IFSC','AccountNo','DutyStart','DutyEnd','AltDutyStart','AltDutyEnd','BasicSalary','AttendanceMode','SundayWork','SundayHours','PayType','PerKmRate','PerVisitRate','KRA','PunchRequired','PfApplicable','EsiApplicable','PtAmount','ActualSalary','PayMode','ConveyAllow'].forEach(function(f){ var v=val('f_'+f); if(v!==undefined) data[f]=v; });
    var dc=window._empDocs||{}; data.AadhaarUrl=dc.Aadhaar||''; data.PanUrl=dc.Pan||''; data.DLUrl=dc.DL||''; data.LightBillUrl=dc.LightBill||''; data.EduDocsUrl=(dc.Edu||[]).join(',');
    var adCb=$('f_AttApproveDenied'); if(adCb) data.AttApproveDenied=adCb.checked?'yes':''; }
  if(manage && !data.FullName){ toast('Full name is required.',true); return; }
  if(manage && !data.Role){ toast('Role is required.',true); return; }
  var b=$('saveEmpBtn'); b.disabled=true; b.innerHTML='<span class="loader"></span> Saving…';
  var p=empId?API.updateEmployee(empId,data):API.createEmployee(data);
  p.then(function(r){
    if(!r.ok){ toast(r.error,true); b.disabled=false; b.textContent=empId?'Save changes':'Create staff'; return; }
    if(!empId && r.loginId){ showCredentials(r.offline?'Staff created (will sync)':'Staff created', r.loginId, r.tempPassword); }
    else { closeModal(); toast(r.offline?'Saved on device — will sync':'Saved'); }
    loadEmployees();
  });
}
function resetPw(empId){
  if(!confirm('Reset this staff member’s password? They will get a new temporary password and must change it on next login.')) return;
  API.resetPassword(empId).then(function(r){ if(r.ok){ showCredentials('Password reset', r.loginId, r.tempPassword); } else toast(r.error,true); });
}
function showCredentials(title, loginId, pw){
  var body='<p>Share these credentials with the staff member. They will set their own password on first login.</p>'+
    '<div class="cred"><div class="pair"><span>Login ID</span><b>'+esc(loginId)+'</b></div><div class="pair"><span>Temporary password</span><b>'+esc(pw)+'</b></div></div>';
  openModal(title, body, '<button class="btn ghost" onclick="copyCred(\''+esc(loginId)+'\',\''+esc(pw)+'\')">Copy</button><button class="btn" onclick="closeModal()">Done</button>');
}
function copyCred(id,pw){ var t='Nakoda MIS login\nLogin ID: '+id+'\nPassword: '+pw; try{ navigator.clipboard.writeText(t); toast('Copied'); }catch(e){ toast('Copy not available',true); } }

/* profile */
function openVisitingCard(e){
  var c=document.createElement('canvas'); c.width=640; c.height=360; var x=c.getContext('2d');
  x.fillStyle='#ffffff'; x.fillRect(0,0,640,360);
  x.fillStyle='#DA1017'; x.fillRect(0,0,640,8);
  x.fillStyle='#999'; x.font='12px sans-serif'; x.fillText('NAKODA DIAGNOSTICS',36,54);
  x.fillStyle='#222'; x.font='bold 30px sans-serif'; x.fillText(String(e.FullName||''),36,98);
  x.fillStyle='#DA1017'; x.font='16px sans-serif'; x.fillText(String(e.Role||''),36,126);
  x.fillStyle='#333'; x.font='15px sans-serif';
  var y=174; [(e.Phone?('Phone: '+e.Phone):''),(e.Email?('Email: '+e.Email):''),('Branch: '+(branchName(e.Branch)||''))].forEach(function(l){ if(l){ x.fillText(l,36,y); y+=30; } });
  x.strokeStyle='#ccc'; x.strokeRect(478,150,116,116); x.fillStyle='#bbb'; x.font='11px sans-serif'; x.fillText('Scan to save',498,286);
  x.fillStyle='#f3f3f3'; x.fillRect(0,330,640,30); x.fillStyle='#666'; x.font='12px sans-serif'; x.fillText('For You, At Your Doorstep  ·  nakodadiagnostics.in',36,350);
  var data=c.toDataURL('image/png');
  var txt=encodeURIComponent(String(e.FullName||'')+'\n'+String(e.Role||'')+' · Nakoda Diagnostics\nPhone: '+(e.Phone||'')+'\nEmail: '+(e.Email||'')+'\nBranch: '+(branchName(e.Branch)||'')+'\nFor You, At Your Doorstep · nakodadiagnostics.in');
  var body='<img src="'+data+'" alt="card" style="width:100%;border-radius:10px;border:1px solid var(--line)"><div style="display:flex;gap:8px;margin-top:12px"><a class="btn" href="https://wa.me/?text='+txt+'" target="_blank" style="border-color:#1D7E47;color:#1D7E47">Share on WhatsApp</a><a class="btn ghost" href="'+data+'" download="nakoda-visiting-card.png">Download PNG</a></div>';
  openModal('My visiting card', body, '');
}
function loadProfile(){
  API.getEmployee(S.user.EmpID).then(function(r){
    if(!r.ok){ toast(r.error,true); return; }
    var e=r.employee;
    $('profileCard').innerHTML=
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">'+
        '<div id="pPhotoWrap" style="width:72px;height:72px;border-radius:50%;overflow:hidden;background:#f0f0f0;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;">'+
          (e.PhotoURL?'<img src="'+esc(e.PhotoURL)+'" style="width:100%;height:100%;object-fit:cover;" alt="">':'<span style="font-size:26px;color:#bbb;">'+esc((e.FullName||'?').slice(0,1).toUpperCase())+'</span>')+
        '</div>'+
        '<div><input type="file" id="pPhotoFile" accept="image/*" style="display:none;"><button class="btn ghost sm" id="pPhotoBtn">📷 Upload photo</button>'+
        '<div style="font-size:11px;color:var(--muted);margin-top:5px;">Shown beside your name across the app.</div></div>'+
      '</div>'+
      '<div class="grid2">'+
      '<div class="field"><label>Employee ID</label><div>'+esc(e.EmpID)+'</div></div>'+
      '<div class="field"><label>Login ID</label><div>'+esc(e.LoginID)+'</div></div>'+
      '<div class="field"><label>Name</label><div>'+esc(e.FullName)+'</div></div>'+
      '<div class="field"><label>Role</label><div>'+esc(e.Role)+'</div></div>'+
      '<div class="field"><label>Office / Branch</label><div>'+esc(e.OfficeType)+' · '+esc(branchName(e.Branch))+'</div></div>'+
      '<div class="field"><label>Phone</label><input id="p_Phone" value="'+esc(e.Phone||'')+'"></div>'+
      '<div class="field"><label>Email</label><input id="p_Email" value="'+esc(e.Email||'')+'"></div>'+
      '<div class="field full"><label>Address</label><textarea id="p_Address" rows="2">'+esc(e.Address||'')+'</textarea></div>'+
      '<div class="field"><label>Emergency name</label><input id="p_EmergencyName" value="'+esc(e.EmergencyName||'')+'"></div>'+
      '<div class="field"><label>Emergency phone</label><input id="p_EmergencyPhone" value="'+esc(e.EmergencyPhone||'')+'"></div>'+
    '</div><div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">'+
      '<button class="btn" id="saveProfileBtn">Save my details</button>'+
      '<button class="btn ghost" id="changePwBtn">Change password</button>'+
      '<button class="btn ghost" id="docUpBtn">📎 Upload documents</button>'+
      '<button class="btn ghost" id="updBtn" title="Clear cache and load the latest version">↻ Check for updates</button></div>'+
      '<div class="card" style="margin-top:14px"><div class="section-label" style="margin-top:0">My responsibility</div><div style="font-size:13px;white-space:pre-wrap;color:#444">'+(e.KRA?esc(e.KRA):'<span class="muted">No responsibilities set yet — ask HR to fill your KRA.</span>')+'</div></div>'+
      '<div class="card" style="margin-top:14px"><div class="section-label" style="margin-top:0">My key performance index · this month</div><div id="myKpi"><div class="muted" style="font-size:12px">Loading…</div></div></div>'+
      '<div style="margin-top:14px"><button class="btn" id="vcBtn">🪪 Create visiting card</button></div>';
    $('updBtn').addEventListener('click', forceUpdate);
    var vcb=$('vcBtn'); if(vcb) vcb.addEventListener('click', function(){ openVisitingCard(e); });
    (function(){ var d=new Date(), mf=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01';
      API.staffPerformance(mf, todayD(), '').then(function(r){ var box=$('myKpi'); if(!box) return;
        if(!r||!r.ok){ box.innerHTML='<div class="muted" style="font-size:12px">—</div>'; return; }
        var me=(r.rows||[]).filter(function(x){return String(x.emp)===String(S.user.EmpID);})[0];
        if(!me){ box.innerHTML='<div class="muted" style="font-size:12px">No activity yet this month.</div>'; return; }
        function bar(lbl,v){ var c=v>=85?'#1a7f37':v>=70?'#b08900':'#DA1017'; return '<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><span style="width:90px;font-size:12px;color:#555">'+lbl+'</span><div style="flex:1;height:7px;border-radius:4px;background:#eee;overflow:hidden"><div style="width:'+v+'%;height:100%;background:'+c+'"></div></div><b style="color:'+c+';font-size:12px;min-width:30px">'+v+'%</b></div>'; }
        box.innerHTML=bar('Dedication',me.dedication)+bar('Performance',me.performance)+
          '<div style="font-size:12px;color:#555;margin-top:8px">Attendance '+me.attPct+'% · Tasks '+me.tasksDone+'/'+me.tasksTotal+' · Calls '+me.calls+' · Meetings '+me.meetings+' · Output '+me.output+' · On-time '+me.onTimePct+'%</div>';
      }).catch(function(){ var box=$('myKpi'); if(box) box.innerHTML='<div class="muted" style="font-size:12px">—</div>'; });
    })();
    $('pPhotoBtn').addEventListener('click', function(){ $('pPhotoFile').click(); });
    $('pPhotoFile').addEventListener('change', function(){
      var f=this.files&&this.files[0]; if(!f) return;
      var rd=new FileReader(); rd.onload=function(){
        var img=new Image(); img.onload=function(){
          var sz=256, c=document.createElement('canvas'); c.width=sz; c.height=sz;
          var s=Math.min(img.width,img.height), sx=(img.width-s)/2, sy=(img.height-s)/2;
          c.getContext('2d').drawImage(img,sx,sy,s,s,0,0,sz,sz);
          var data=c.toDataURL('image/jpeg',0.7);
          var b=$('pPhotoBtn'); b.disabled=true; b.innerHTML='<span class="loader"></span> Uploading…';
          API.savePhoto(data).then(function(r){ b.disabled=false; b.textContent='📷 Upload photo';
            if(r&&r.ok){ toast('Photo updated'); $('pPhotoWrap').innerHTML='<img src="'+data+'" style="width:100%;height:100%;object-fit:cover;" alt="">'; }
            else toast((r&&r.error)||'Upload failed',true); });
        }; img.src=rd.result;
      }; rd.readAsDataURL(f);
    });
    $('saveProfileBtn').addEventListener('click', function(){
      var data={Phone:val('p_Phone'),Email:val('p_Email'),Address:val('p_Address'),EmergencyName:val('p_EmergencyName'),EmergencyPhone:val('p_EmergencyPhone')};
      var b=$('saveProfileBtn'); b.disabled=true; b.innerHTML='<span class="loader"></span> Saving…';
      API.updateEmployee(S.user.EmpID, data).then(function(r){ toast(r.ok?(r.offline?'Saved on device — will sync':'Profile updated'):(r.error||'Error'), !r.ok); b.disabled=false; b.textContent='Save my details'; });
    });
    $('changePwBtn').addEventListener('click', openChangePwModal);
    $('docUpBtn').addEventListener('click', function(){
      // Always re-fetch fresh before opening — reusing the page-load snapshot would show stale (pre-save) values
      // if this is opened a second time in the same session, e.g. right after a save.
      var b=$('docUpBtn'); b.disabled=true; var t0=b.textContent; b.textContent='Loading…';
      API.getEmployee(S.user.EmpID).then(function(r2){ b.disabled=false; b.textContent=t0; openMyDocsModal((r2&&r2.ok)?r2.employee:e); });
    });
  });
}
// Self-service document upload — same fields HR sees in the staff edit form (Documents section), so once an
// employee uploads their own KYC docs here, they show up automatically for HR without any extra step.
function openMyDocsModal(e){
  var eduArr=e.EduDocsUrl?String(e.EduDocsUrl).split(',').filter(Boolean):[];
  window._myDocs={Aadhaar:e.AadhaarUrl||'',Pan:e.PanUrl||'',DL:e.DLUrl||'',LightBill:e.LightBillUrl||'',Edu:eduArr.slice()};
  var body='<div class="grid2">'+
    docFieldRow('Aadhaar card','Aadhaar',e.AadhaarUrl,'md')+docFieldRow('PAN card','Pan',e.PanUrl,'md')+docFieldRow('Driving licence (if applicable)','DL',e.DLUrl,'md')+docFieldRow('Light bill','LightBill',e.LightBillUrl,'md')+
    '<div class="field full"><label>Education documents (multiple)</label><div id="mdEduList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:6px">'+eduArr.map(function(u,i){return '<a href="'+esc(u)+'" target="_blank" style="font-size:13px;color:#185FA5;text-decoration:none">📄 Education document '+(i+1)+'</a>';}).join('')+'</div><input type="file" id="md_Edu" multiple accept="image/*,application/pdf"></div>'+
  '</div><div id="mdMsg"></div>';
  openModal('Upload my documents', body, '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="mdSaveBtn">Save documents</button>');
  // Track uploads still in flight so Save can't fire (or silently overwrite a field with '') before a pick has finished linking its Drive URL.
  var mdPending=0;
  function mdSaveState(){ var b=$('mdSaveBtn'); if(!b) return; b.disabled=mdPending>0; b.textContent=mdPending>0?('Uploading… ('+mdPending+') — please wait'):'Save documents'; }
  function mdDocDone(key,url,name){
    if(key==='Edu'){ window._myDocs.Edu.push(url); var list=$('mdEduList'); if(list) list.insertAdjacentHTML('beforeend','<a href="'+esc(url)+'" target="_blank" style="font-size:13px;color:#185FA5;text-decoration:none">📄 '+esc(name)+'</a>'); }
    else window._myDocs[key]=url;
  }
  ['Aadhaar','Pan','DL','LightBill'].forEach(function(k){ bindDocField('md',k,false,mdDocDone,function(d){ mdPending+=d; mdSaveState(); }); });
  bindDocField('md','Edu',true,mdDocDone,function(d){ mdPending+=d; mdSaveState(); });
  $('mdSaveBtn').addEventListener('click', function(){
    if(mdPending>0){ toast('Still uploading — wait for uploads to finish before saving.',true); return; }
    var b=$('mdSaveBtn'); b.disabled=true; b.innerHTML='<span class="loader"></span> Saving…';
    var dc=window._myDocs||{};
    API.updateEmployee(S.user.EmpID, {AadhaarUrl:dc.Aadhaar||'',PanUrl:dc.Pan||'',DLUrl:dc.DL||'',LightBillUrl:dc.LightBill||'',EduDocsUrl:(dc.Edu||[]).join(',')}).then(function(r){
      if(r&&r.ok){ closeModal(); toast(r.offline?'Saved on device — will sync':'Documents saved'); }
      else { $('mdMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; b.disabled=false; b.textContent='Save documents'; }
    });
  });
}
function openChangePwModal(){
  var body='<div class="field"><label>Current password</label><div class="pw-row"><input id="cp_old" type="password"><span class="toggle" data-for="cp_old">show</span></div></div>'+
    '<div class="field"><label>New password (min 6)</label><div class="pw-row"><input id="cp_new" type="password"><span class="toggle" data-for="cp_new">show</span></div></div>'+
    '<div class="field"><label>Confirm new password</label><div class="pw-row"><input id="cp_new2" type="password"><span class="toggle" data-for="cp_new2">show</span></div></div>'+
    '<div id="cpModalMsg"></div>';
  openModal('Change password', body, '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="cpSave">Update</button>');
  $('cpSave').addEventListener('click', function(){
    var o=val('cp_old'),n=val('cp_new'),n2=val('cp_new2');
    if(n!==n2){ $('cpModalMsg').innerHTML='<div class="msg error">Passwords do not match.</div>'; return; }
    if((n||'').length<6){ $('cpModalMsg').innerHTML='<div class="msg error">At least 6 characters.</div>'; return; }
    var b=$('cpSave'); b.disabled=true; b.innerHTML='<span class="loader"></span>';
    API.changePassword(o,n).then(function(r){ if(r.ok){ closeModal(); toast('Password changed'); } else { $('cpModalMsg').innerHTML='<div class="msg error">'+esc(r.error)+'</div>'; b.disabled=false; b.textContent='Update'; } });
  });
}

/* modal */
function openModal(title, bodyHtml, footHtml){
  closeModal();
  var m=el('<div class="overlay" id="ov"><div class="modal"><div class="modal-head"><h3>'+esc(title)+'</h3><button class="x" onclick="closeModal()">&times;</button></div><div class="modal-body">'+bodyHtml+'</div><div class="modal-foot">'+(footHtml||'')+'</div></div></div>');
  m.addEventListener('mousedown', function(ev){ if(ev.target.id==='ov') closeModal(); });
  $('modalRoot').appendChild(m);
  document.body.classList.add('modal-open');
}
function closeModal(){ $('modalRoot').innerHTML=''; document.body.classList.remove('modal-open'); }
