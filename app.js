/* Nakoda MIS — app UI (uses window.API offline data layer) */
var S={ user:null, perms:null, meta:null, employees:[] };

function $(id){ return document.getElementById(id); }
function el(h){ var d=document.createElement('div'); d.innerHTML=h.trim(); return d.firstChild; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function toast(m,err){ var t=$('toast'); t.textContent=m; t.className='show'+(err?' err':''); setTimeout(function(){t.className='';},2800); }
function show(id){ ['view-login','view-changepw','view-app'].forEach(function(v){ $(v).classList.toggle('hidden',v!==id); }); }
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
    } else { show('view-login'); }
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
function initInstall(){
  if(isStandalone()){ hideInstallBar(); return; }
  if(sessionStorage.getItem('nk_install_dismiss')==='1') return;
  window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); _deferredInstall=e; showInstallBar(); });
  window.addEventListener('appinstalled', function(){ hideInstallBar(); _deferredInstall=null; toast('App installed'); });
  if(isIOS()){ $('installText').textContent='Install this app: tap the Share button, then “Add to Home Screen”.'; showInstallBar(); }
  $('installBtn').addEventListener('click', function(){
    if(_deferredInstall){ _deferredInstall.prompt(); _deferredInstall.userChoice.then(function(){ _deferredInstall=null; hideInstallBar(); }); }
    else if(isIOS()){ openModal('Install on iPhone / iPad','<p>1. Tap the <b>Share</b> button at the bottom of Safari.</p><p>2. Tap <b>Add to Home Screen</b>.</p><p>3. Tap <b>Add</b>.</p>','<button class="btn" onclick="closeModal()">Got it</button>'); }
    else { toast('To install: open this site in Chrome, then use the install icon in the address bar.'); }
  });
  $('installDismiss').addEventListener('click', function(){ hideInstallBar(); try{ sessionStorage.setItem('nk_install_dismiss','1'); }catch(e){} });
}

/* status chip / offline banner */
function bindStatus(){
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
    API.login($('loginId').value, $('loginPw').value).then(function(r){
      if(!r.ok){ setMsg('loginMsg', r.error||'Login failed.'); return; }
      afterAuth(r.mustChange);
    }).catch(function(){ setMsg('loginMsg','Could not reach the server. Check your internet.'); })
      .then(function(){ b.disabled=false; b.textContent='Sign in'; });
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
function enterApp(){ show('view-app'); refreshMeta(true); }
function enterAppInstant(){ renderIdentity(); show('view-app'); populateSelectors(); applyPerms(); go('dashboard'); }
function refreshMeta(goDash){
  API.getMetadata().then(function(r){
    if(r.ok){ S.meta={roles:r.roles,branches:r.branches}; S.perms=r.perms; S.user=r.me||S.user; renderIdentity(); populateSelectors(); applyPerms(); if(goDash) go('dashboard'); }
    else { toast(r.error||'Could not load data',true); }
  });
}
function renderIdentity(){ var u=S.user||{}; $('meName').textContent=u.FullName||'—'; $('meRole').textContent=u.Role||''; $('meAvatar').textContent=initials(u.FullName); }
function populateSelectors(){
  if(!S.meta) return;
  var opts='<option value="">All branches</option>'+S.meta.branches.map(function(b){ return '<option value="'+esc(b.BranchID)+'">'+esc(b.BranchName)+'</option>'; }).join('');
  $('filterBranch').innerHTML=opts;
  var ds=$('dashBranch'), canPick=S.perms&&S.perms.canViewAll;
  ds.style.display=canPick?'':'none';
  if(canPick){ ds.innerHTML=opts; }
}
function applyPerms(){
  if(!S.perms) return;
  var canList=S.perms.canViewAll||S.perms.level==='BRANCH_MGR'||S.perms.level==='BRANCH_VIEW';
  document.querySelectorAll('[data-page="employees"]').forEach(function(n){ n.classList.toggle('hidden',!canList); });
  document.querySelectorAll('[data-page="branches"]').forEach(function(n){ n.classList.toggle('hidden',!S.perms.canManageAll); });
  document.querySelectorAll('[data-page="cards"]').forEach(function(n){ n.classList.remove('hidden'); });
  document.querySelectorAll('[data-page="cardstatus"]').forEach(function(n){ n.classList.remove('hidden'); });
  $('addEmpBtn').classList.toggle('hidden', !S.perms.canCreate);
  var canMon=(S.perms.level==='SUPER')||(S.user && ['Operations Manager','Process Coordinator'].indexOf(S.user.Role)>=0);
  document.querySelectorAll('[data-page="taskmon"]').forEach(function(n){ n.classList.toggle('hidden',!canMon); });
  var canPerf=canMon||S.perms.level==='BRANCH_MGR';   // monitors see all branches; branch managers see their own
  document.querySelectorAll('[data-page="staffperf"]').forEach(function(n){ n.classList.toggle('hidden',!canPerf); });
  var canMkt=(S.perms.level==='SUPER')||S.perms.level==='BRANCH_MGR'||(S.user && ['Operations Manager','Marketing Manager','Director'].indexOf(S.user.Role)>=0);
  document.querySelectorAll('[data-page="marketing"]').forEach(function(n){ n.classList.toggle('hidden',!canMkt); });
  var canQc=(S.perms.level==='SUPER')||S.perms.level==='BRANCH_MGR'||(S.user && ['QC Manager','Pathologist','Lab Technician','Operations Manager','Director'].indexOf(S.user.Role)>=0);
  document.querySelectorAll('[data-page="qc"]').forEach(function(n){ n.classList.toggle('hidden',!canQc); });
  var canKpi=(S.perms.level==='SUPER')||(S.user && ['HR','Director','Operations Manager'].indexOf(S.user.Role)>=0);
  document.querySelectorAll('[data-page="kpiadmin"]').forEach(function(n){ n.classList.toggle('hidden',!canKpi); });
  var canRec=S.perms.canManageRecurring||(S.perms.level==='SUPER')||(S.user && S.user.Role==='Executive Assistant');
  document.querySelectorAll('[data-page="recurring"]').forEach(function(n){ n.classList.toggle('hidden',!canRec); });
  var canBuild=(S.perms.level==='SUPER')||(S.user && S.user.Role==='Executive Assistant');
  document.querySelectorAll('[data-page="builder"]').forEach(function(n){ n.classList.toggle('hidden',!canBuild); });
  var canAcc=S.perms.canViewAll||S.perms.level==='BRANCH_MGR'||S.perms.level==='BRANCH_VIEW'||(S.user && ['CRM','Accounts'].indexOf(S.user.Role)>=0);
  document.querySelectorAll('[data-page="accounts"]').forEach(function(n){ n.classList.toggle('hidden',!canAcc); });
  var canMD=(S.perms.level==='SUPER')||(S.user && ['Director','Executive Assistant'].indexOf(S.user.Role)>=0);
  document.querySelectorAll('[data-page="mdinbox"]').forEach(function(n){ n.classList.toggle('hidden',!canMD); });
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
  var dm=$('dashMonth'); if(dm) dm.addEventListener('change', loadDashboard);
  var deb; $('empSearch').addEventListener('input', function(){ clearTimeout(deb); deb=setTimeout(renderEmpTable,200); });
  $('filterBranch').addEventListener('change', renderEmpTable);
  $('filterStatus').addEventListener('change', renderEmpTable);
}
var currentPage='dashboard';
function go(page){
  currentPage=page;
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.toggle('active', n.getAttribute('data-page')===page); });
  ['dashboard','tasks','calendar','attendance','leave','field','policy','training','assets','fixedassets','inventory','payroll','accounts','recurring','crm','builder','taskmon','staffperf','marketing','qc','kpiadmin','employees','profile','branches','cards','cardstatus','suggest','mdinbox'].forEach(function(p){ $('page-'+p).classList.toggle('hidden',p!==page); });
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
  if(page==='payroll' && window.renderPayroll) window.renderPayroll();
  if(page==='accounts' && window.renderAccounts) window.renderAccounts();
  if(page==='recurring' && window.renderRecurring) window.renderRecurring();
  if(page==='crm' && window.renderCRM) window.renderCRM();
  if(page==='builder' && window.renderBuilder) window.renderBuilder();
  if(page==='taskmon' && window.renderTaskMonitor) window.renderTaskMonitor();
  if(page==='staffperf' && window.renderStaffPerf) window.renderStaffPerf();
  if(page==='marketing' && window.renderMarketing) window.renderMarketing();
  if(page==='qc' && window.renderQc) window.renderQc();
  if(page==='kpiadmin' && window.renderKpiAdmin) window.renderKpiAdmin();
  if(page==='employees') loadEmployees();
  if(page==='profile') loadProfile();
  if(page==='branches' && window.renderBranches) window.renderBranches();
  if(page==='cards' && window.renderMembershipCards) window.renderMembershipCards();
  if(page==='cardstatus' && window.renderCardStatus) window.renderCardStatus();
  highlightBottomNav();
}

/* ---------- mobile bottom navigation + "More" sheet ---------- */
var NAVDEF=[['dashboard','▦','Home'],['tasks','✓','Tasks'],['calendar','📅','Calendar'],['attendance','🕒','Attend'],['crm','📁','CRM'],['builder','🔧','Builder'],['recurring','🔁','Recurring'],['taskmon','📋','Monitor'],['staffperf','📈','Performance'],['marketing','📣','Marketing'],['qc','🧪','QC'],['kpiadmin','🎯','KPI'],['employees','👥','Staff'],['leave','🌴','Leave'],['field','🚗','Field'],['policy','📋','Policy'],['training','🎓','Training'],['assets','🗂','Information'],['fixedassets','🛠','Asset Mgmt'],['inventory','📦','Inventory'],['payroll','💰','Payroll'],['accounts','📊','Accounts'],['cards','🏷','Cards'],['cardstatus','✅','Status'],['suggest','✉','Suggest'],['mdinbox','📨','MD Inbox'],['branches','🏢','Branches'],['profile','⚙','Profile']];
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
  $('mobileMoreDrawer').classList.add('show');
}
function closeMobileMore(){ var d=$('mobileMoreDrawer'); if(d) d.classList.remove('show'); }
window.openMobileMore=openMobileMore; window.closeMobileMore=closeMobileMore;

/* dashboard */
function greetWord(){ var h=new Date().getHours(); return h<12?'Good morning':(h<17?'Good afternoon':'Good evening'); }
var DASH={emps:[],cards:[],prices:{},tasks:[],procs:[],cal:[],chaseT:0,chaseC:0,daily:[],training:null};
function priceMap(arr){ var m={}; (arr||[]).forEach(function(p){ m[p.typeId+'|'+p.branchId]=Number(p.price)||0; }); return m; }
function fmtMoney(n){ return Math.round(n||0).toLocaleString('en-IN'); }
function todayD(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function dd10(v){ return String(v||'').slice(0,10); }
/* "To chase" only counts items overdue within the last CHASE_WINDOW_DAYS so the KPI
   stays actionable instead of accumulating every stale task/event since launch.
   Change this one number to widen/narrow the window. */
var CHASE_WINDOW_DAYS=60;
function daysAgoD(n){ var d=new Date(); d.setDate(d.getDate()-n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function toMinD(t){ if(!t) return 0; var p=String(t).split(':'); return (+p[0])*60+(+(p[1]||0)); }
function e0(){ return {}; }
function isMonitorRole(){ var u=S.user||{}; return (S.perms&&S.perms.level==='SUPER')||u.Role==='Operations Manager'||u.Role==='Process Coordinator'; }
function loadDashboard(){
  var u=S.user||{};
  $('greetHello').textContent=greetWord()+', '+(u.FullName||'');
  var lvl=S.perms&&S.perms.level;
  var scope=(S.perms&&S.perms.canManageAll)?'org-wide':(lvl==='BRANCH_MGR'?('branch: '+branchName(u.Branch)):(lvl==='BRANCH_VIEW'?('branch: '+branchName(u.Branch)+' (view)'):(S.perms&&S.perms.canViewAll?'all branches (view)':'self-service')));
  $('greetMeta').textContent=[u.Role,(u.OfficeType==='Branch'?branchName(u.Branch):'Corporate Office'),scope].filter(Boolean).join(' · ');
  if(!DASH.emps.length && !DASH.cards.length) $('kpis').innerHTML='<div class="kpi"><div class="n"><span class="loader dark"></span></div><div class="l">Loading…</div></div>';
  Promise.all([API.cachedEmployees(),API.cachedCards(),API.cachedPrices(),API.cachedTasks(),API.cachedCalendar(u.EmpID),API.cachedProcesses()]).then(function(a){
    if(a[0]) DASH.emps=a[0]; if(a[1]) DASH.cards=a[1]; DASH.prices=priceMap(a[2]||[]); if(a[3]) DASH.tasks=a[3]; if(a[4]) DASH.cal=a[4]; if(a[5]) DASH.procs=a[5];
    renderDashboard();
  });
  Promise.all([API.listEmployees().catch(e0),API.listCards({}).catch(e0),API.listCardPrices().catch(e0),API.listMyTasks().catch(e0),API.listProcesses().catch(e0),API.listCalendar(u.EmpID).catch(e0)]).then(function(a){
    if(a[0]&&a[0].ok){ DASH.emps=a[0].employees; S.employees=a[0].employees; S.perms=a[0].perms||S.perms; }
    if(a[1]&&a[1].ok){ DASH.cards=a[1].cards; }
    if(a[2]&&a[2].ok){ DASH.prices=priceMap(a[2].prices); }
    if(a[3]&&a[3].ok){ DASH.tasks=a[3].tasks||[]; }
    if(a[4]&&a[4].ok){ DASH.procs=a[4].processes||[]; }
    if(a[5]&&a[5].ok){ DASH.cal=a[5].entries||[]; }
    renderDashboard();
  });
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
  var dm=$('dashMonth'); if(dm && !dm.value) dm.value=todayD().slice(0,7);
  var ym=(dm&&dm.value)||todayD().slice(0,7);
  if(S.perms && (S.perms.canViewAll || S.perms.level==='BRANCH_MGR' || S.perms.level==='BRANCH_VIEW')){
    API.listDaily('', ym).then(function(r){ if(r&&r.ok){ DASH.daily=r.daily||[]; renderDashboard(); } }).catch(function(){});
  }
  /* org-wide training progress for the dashboard "Staff Training" tile */
  if(isMonitorRole() || (S.perms && (S.perms.canViewAll||S.perms.level==='BRANCH_MGR'))){
    API.trainingStats().then(function(r){ if(r&&r.ok){ DASH.training=r; renderDashboard(); } }).catch(function(){});
  }
}
function renderDashboard(){
  var u=S.user||{}, lvl=S.perms&&S.perms.level, isManager=S.perms&&S.perms.canViewAll, isBranchMgr=lvl==='BRANCH_MGR', isMon=isMonitorRole();
  var tdy=todayD();
  var myT=(DASH.tasks||[]).filter(function(t){return t.status!=='deleted';});
  var myToday=myT.filter(function(t){return t.status!=='done' && dd10(t.dueDate)===tdy;}).length;
  var myOver=myT.filter(function(t){var d=dd10(t.dueDate); return t.status!=='done' && d && d<tdy;}).length;
  var myProcDue=myT.filter(function(t){var d=dd10(t.dueDate); return t.source==='process' && t.status!=='done' && d && d<=tdy;}).length;
  var calToday=(DASH.cal||[]).filter(function(c){return String(c.status)!=='deleted' && dd10(c.date)===tdy;}).sort(function(a,b){return (a.startTime||'')<(b.startTime||'')?-1:1;});
  var branch=$('dashBranch').value;
  /* Effective branch scope for the WHOLE dashboard (staff, cards, revenue, pipelines):
     - managers (canViewAll) honour the branch picker ('' = all branches)
     - branch managers & branch-view users are pinned to their own branch
     - other staff see their personal totals (no branch scoping)
     This guarantees a branch-level user never sees org-wide numbers behind "Branch …" labels. */
  var effBranch=isManager?branch:((isBranchMgr||lvl==='BRANCH_VIEW')?String(u.Branch||''):'');
  var scopeBranch=effBranch;
  var openLeads=(DASH.procs||[]).reduce(function(s,p){return s+procCounts(p,scopeBranch).open;},0);
  var emp=(DASH.emps||[]).filter(function(e){ return !effBranch || String(e.Branch)===String(effBranch); });
  var cards=(DASH.cards||[]).filter(function(c){ return !effBranch || String(c.branchId)===String(effBranch); });
  var now=new Date(), m0=new Date(now.getFullYear(),now.getMonth(),1), soon=new Date(now.getTime()+7*864e5);
  var activeCards=cards.filter(function(c){return c.status==='active';});
  var cardsMTD=cards.filter(function(c){return new Date(c.issuedDate)>=m0;}).length;
  var revenue=activeCards.reduce(function(s,c){return s+(Number(c.amount)||0);},0);
  var brs={}; emp.forEach(function(e){if(e.Branch)brs[e.Branch]=1;}); cards.forEach(function(c){if(c.branchId)brs[c.branchId]=1;});
  var staffN=emp.filter(function(e){return e.Status==='Active';}).length;
  /* Daily business for the selected month — per-branch map + scoped totals. business = cash + bank + other. */
  var dailyByBr={};
  (DASH.daily||[]).forEach(function(d){ var b=String(d.branchId||''); if(b)brs[b]=1; var o=dailyByBr[b]||(dailyByBr[b]={cash:0,bank:0,other:0,pat:0,test:0}); o.cash+=Number(d.cashIn)||0; o.bank+=Number(d.bankIn)||0; o.other+=Number(d.other)||0; o.pat+=Number(d.patients)||0; o.test+=Number(d.tests)||0; });
  var cashMTD=0,bankMTD=0,otherMTD=0,patMTD=0,testMTD=0;
  (DASH.daily||[]).forEach(function(d){ if(effBranch && String(d.branchId)!==String(effBranch)) return; cashMTD+=Number(d.cashIn)||0; bankMTD+=Number(d.bankIn)||0; otherMTD+=Number(d.other)||0; patMTD+=Number(d.patients)||0; testMTD+=Number(d.tests)||0; });
  var bizMTD=cashMTD+bankMTD+otherMTD;
  var avgPat=patMTD>0?Math.round(bizMTD/patMTD):0;
  var K=kpiC(myToday,'Tasks today','amber')+kpiC(myOver,'My overdue','red');
  if(isManager){ K+=kpiC('₹'+fmtMoney(bizMTD),'Business (MTD)','green')+kpiC(openLeads,'Open CRM leads','violet')+kpiC('₹'+fmtMoney(revenue),'Card revenue','green')+kpiC(staffN,'Active staff','blue')+kpiC(Object.keys(brs).length,'Branches','blue'); }
  else if(isBranchMgr){ K+=kpiC('₹'+fmtMoney(bizMTD),'Business (MTD)','green')+kpiC(openLeads,'Branch CRM leads','violet')+kpiC(staffN,'Branch staff','blue')+kpiC('₹'+fmtMoney(revenue),'Cards business','green'); }
  else { K+=kpiC(myProcDue,'My CRM leads due','violet')+kpiC(calToday.length,'Today’s events','blue'); }
  if(isMon){ K+=kpiC((DASH.chaseT||0)+(DASH.chaseC||0),'To chase','red'); }
  $('kpis').innerHTML=K;
  var att='', items='';
  function arow(color,txt,page){ return '<div class="dash-att" onclick="go(\''+page+'\')"><span class="dot" style="background:'+color+'"></span><span class="t">'+txt+'</span><span class="r">open ›</span></div>'; }
  if(myOver>0) items+=arow('#DA1017', myOver+' of your tasks are overdue','tasks');
  if(myToday>0) items+=arow('#c47f00', myToday+' task'+(myToday>1?'s':'')+' due today','tasks');
  if(myProcDue>0) items+=arow('#7F77DD', myProcDue+' CRM lead'+(myProcDue>1?'s':'')+' due/overdue','crm');
  if(isMon && (DASH.chaseT||DASH.chaseC)) items+=arow('#c47f00', (DASH.chaseT+DASH.chaseC)+' overdue across the team','taskmon');
  calToday.slice(0,5).forEach(function(c){ items+='<div class="dash-att" onclick="go(\'calendar\')"><span class="dot" style="background:'+(String(c.status)==='done'?'#1a7f37':'#7F77DD')+'"></span><span class="t">'+(c.startTime?esc(c.startTime)+' · ':'')+esc(c.title)+'</span><span class="r">calendar ›</span></div>'; });
  if(!items) items='<div class="dash-att muted"><span class="t">Nothing pending today. 🎉</span></div>';
  att+='<div class="section-label">Needs attention today</div>'+items;
  var html=att;
  /* Department health board (role-wise) — replaces the old module launcher + CRM pipelines list.
     Driven by the process pipelines the backend returns for this user's scope. Counts (open/due/overdue)
     are live; on-time % is an approximation = (open-overdue)/open; ₹ shown only where derivable. */
  var procs=(DASH.procs||[]);
  if(procs.length){
    /* ---- role-specific framing of the board ---- */
    var boardProcs=procs, boardLabel='Department health';
    if(isManager){ boardLabel='Department health · '+(branch?branchName(branch):'all branches'); }
    else if(isBranchMgr){ boardLabel='Department health · '+branchName(u.Branch); }
    else if(isMon){ boardLabel='Department health · operations'; }
    else {
      /* functional / self-service staff: only the pipelines where they actually have work */
      boardProcs=procs.filter(function(p){ var c=procCounts(p,scopeBranch); return (c.open+c.dueToday+c.overdue)>0; });
      if(!boardProcs.length) boardProcs=procs;
      boardLabel='My department'+(boardProcs.length>1?'s':'');
    }
    html+='<div class="section-label">'+esc(boardLabel)+'</div>';
    html+='<div class="dept-legend"><span><i class="ddot ok"></i>on track</span><span><i class="ddot warn"></i>watch</span><span><i class="ddot bad"></i>action needed</span></div>';
    /* Staff Training tile (org-wide progress) — managers/monitor roles only */
    var renderProcs=boardProcs.slice();
    if((isManager||isBranchMgr||isMon) && DASH.training && (DASH.training.open>0||DASH.training.total>0)){
      renderProcs.push({name:'Staff Training', processId:'', byBranch:DASH.training.byBranch, open:DASH.training.open, dueToday:DASH.training.dueToday, overdue:DASH.training.overdue});
    }
    html+='<div class="dept-board">'+renderProcs.map(function(p){ return deptCard(p,revenue,procCounts(p,scopeBranch)); }).join('')+'</div>';
    /* monitor roles (SUPER / Ops Manager / Process Coordinator): surface the worst offenders to chase */
    if(isMon){
      var bn=procs.map(function(p){ return {p:p,over:procCounts(p,scopeBranch).overdue}; }).filter(function(x){ return x.over>0; }).sort(function(a,b){ return b.over-a.over; }).slice(0,3);
      if(bn.length){
        html+='<div class="section-label">Top bottlenecks to chase</div>'+bn.map(function(x){
          return '<div class="dash-att" onclick="openDept(\''+esc(x.p.processId||'')+'\')"><span class="dot" style="background:#DA1017"></span><span class="t"><b>'+esc(x.p.name)+'</b> · '+x.over+' overdue</span><span class="r">work it ›</span></div>';
        }).join('');
      }
    }
  }
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
    html+='<div class="section-label">By branch · business this month</div><div class="card"><div class="table-wrap swipe"><table><thead><tr><th>Branch</th><th>Business (MTD)</th><th>Cash</th><th>Bank / UPI</th><th>Other</th><th>Patients</th><th>Avg / patient</th><th>Tests</th><th>Rev / test</th><th>No. of cards</th><th>Card business</th><th>Staff</th><th>Rev / staff</th></tr></thead><tbody>'+
      rows.map(function(r){return '<tr><td><b>'+esc(r.name)+'</b></td><td>₹'+fmtMoney(r.biz)+'</td><td>₹'+fmtMoney(r.cash)+'</td><td>₹'+fmtMoney(r.bank)+'</td><td>₹'+fmtMoney(r.other)+'</td><td>'+r.pat+'</td><td>₹'+fmtMoney(r.avg)+'</td><td>'+r.test+'</td><td>₹'+fmtMoney(r.rTest)+'</td><td>'+r.cards+'</td><td>₹'+fmtMoney(r.rev)+'</td><td>'+r.staff+'</td><td>₹'+fmtMoney(r.rStaff)+'</td></tr>';}).join('')+'</tbody></table></div></div>';
  }
  var types={}, byBT={}, brOrder=[];
  activeCards.forEach(function(c){ var ty=String(c.typeId||'—'); types[ty]=1; var b=String(c.branchId||''); if(!byBT[b]){ byBT[b]={}; brOrder.push(b); } byBT[b][ty]=(byBT[b][ty]||0)+1; });
  var typeList=Object.keys(types).sort();
  if(typeList.length){
    var colTot={}; typeList.forEach(function(t){colTot[t]=0;}); var grand=0;
    var bodyRows=brOrder.sort(function(a,b){ var ta=0,tb=0; typeList.forEach(function(t){ta+=(byBT[a][t]||0);tb+=(byBT[b][t]||0);}); return tb-ta; }).map(function(b){
      var row=byBT[b], tot=0;
      var cells=typeList.map(function(t){ var n=row[t]||0; tot+=n; colTot[t]+=n; return '<td>'+n+'</td>'; }).join('');
      grand+=tot;
      return '<tr><td><b>'+esc(branchName(b))+'</b></td>'+cells+'<td><b>'+tot+'</b></td></tr>';
    }).join('');
    var totRow='<tr><td><b>Total</b></td>'+typeList.map(function(t){return '<td><b>'+colTot[t]+'</b></td>';}).join('')+'<td><b>'+grand+'</b></td></tr>';
    html+='<div class="section-label">Active cards · by branch &amp; type</div><div class="card"><div class="table-wrap swipe"><table><thead><tr><th>Branch</th>'+typeList.map(function(t){return '<th>'+esc(t)+'</th>';}).join('')+'<th>Total</th></tr></thead><tbody>'+bodyRows+totRow+'</tbody></table></div></div>';
  }
  html+='<div id="finDash"></div><div id="mktDash"></div>';
  $('dashExtra').innerHTML=html;
  if(window.renderStarBlock){ try{ window.renderStarBlock(document.getElementById('starBlock')); }catch(_){} }
  if(window.renderQuickLog){ try{ window.renderQuickLog(document.getElementById('quickLog')); }catch(_){} }
  var dashBr=(S.perms&&S.perms.canViewAll)?(($('dashBranch')||{}).value||''):'';
  if(window.renderFinDash){ try{ window.renderFinDash(document.getElementById('finDash'), dashBr); }catch(_){} }
  if(window.renderMktDash){ try{ window.renderMktDash(document.getElementById('mktDash'), dashBr); }catch(_){} }
  var recent=emp.slice().sort(function(a,b){return a.EmpID<b.EmpID?1:-1;}).slice(0,6);
  var tb=$('recentTable').querySelector('tbody'); var rhtml='';
  if(!recent.length){ rhtml='<tr><td class="empty">No staff yet.</td></tr>'; }
  else recent.forEach(function(e){ rhtml+='<tr><td><b>'+esc(e.FullName)+'</b>'+pend(e)+'</td><td>'+esc(e.Role)+'</td><td>'+officeBadge(e)+'</td><td>'+statusBadge(e.Status)+'</td></tr>'; });
  tb.innerHTML=rhtml;
}
function kpi(n,l){ return '<div class="kpi"><div class="n">'+n+'</div><div class="l">'+esc(l)+'</div></div>'; }
function kpiC(n,l,cls){ return '<div class="kpi k-'+(cls||'')+'"><div class="n">'+n+'</div><div class="l">'+esc(l)+'</div></div>'; }
/* Open the CRM page straight to one pipeline (deep-link from the dashboard department cards).
   go('crm') paints the pipeline list; openPipeline() then replaces it with that pipeline's board. */
function openDept(pid){ go('crm'); if(pid && window.openPipeline) window.openPipeline(pid); }
window.openDept=openDept;
function deptIcon(n){ n=String(n||'').toLowerCase();
  if(/sample|report|diagnos|\blab\b|test/.test(n)) return '🔬';
  if(/home|collection|phlebo/.test(n)) return '🏠';
  if(/member|card/.test(n)) return '🏷';
  if(/vendor|payable|\bap\b/.test(n)) return '💳';
  if(/account|receiv|invoice|billing/.test(n)) return '📊';
  if(/train|learn|course|quiz/.test(n)) return '🎓';
  if(/onboard|employee|\bhr\b|joining/.test(n)) return '🧑‍💼';
  if(/procure|indent|purchase|supply/.test(n)) return '🛒';
  if(/complaint|grievance|escalat/.test(n)) return '⚠️';
  if(/asset|equip|mainten|amc/.test(n)) return '🛠';
  return '📁';
}
/* Scope a pipeline's counts to a branch using the backend's byBranch breakdown.
   branchId '' (or falsy) = org-wide totals. If a branch is chosen but the pipeline has no
   instances there, returns zeros. */
function procCounts(p,branchId){
  if(branchId){
    var b=(p.byBranch&&p.byBranch[branchId])||null;
    return b?{open:Number(b.open)||0,dueToday:Number(b.dueToday)||0,overdue:Number(b.overdue)||0}:{open:0,dueToday:0,overdue:0};
  }
  return {open:Number(p.open)||0,dueToday:Number(p.dueToday)||0,overdue:Number(p.overdue)||0};
}
function deptCard(p,cardRev,sc){
  sc=sc||procCounts(p,'');
  var open=sc.open||0, due=sc.dueToday||0, over=sc.overdue||0;
  var ot=open>0?Math.round((open-over)/open*100):100;
  var cls=over===0?'ok':((over/Math.max(open,1))>=0.18?'bad':'warn');
  var isCard=/member|card/i.test(p.name||'');
  var foot=(isCard&&cardRev)
    ? '<div class="dept-foot"><span class="rev">₹'+fmtMoney(cardRev)+'</span><span class="ot">'+ot+'% on-time</span></div>'
    : '<div class="dept-foot"><span class="ot">'+ot+'% on-time</span></div>';
  /* Display-only tile (not clickable) — it's a decision read-out, not a nav target. */
  return '<div class="dept-card">'+
    '<div class="dept-top"><span class="dept-ic">'+deptIcon(p.name)+'</span><span class="dept-nm">'+esc(p.name)+'</span><span class="ddot '+cls+'"></span></div>'+
    '<div class="dept-open"><b>'+open+'</b><span>open</span></div>'+
    '<div class="dept-sub"><span class="due">'+due+' due</span><span class="over">'+over+' overdue</span></div>'+
    foot+'</div>';
}

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
      '<td>'+statusBadge(e.Status)+'</td>'+
      '<td><div class="row-actions">'+acts+'</div></td></tr>';
  });
  tb.innerHTML=html;
}
function pend(e){ return e._pending?' <span class="badge pending">syncing</span>':''; }
function officeBadge(e){ return e.OfficeType==='Corporate'?'<span class="badge office">Corporate</span>':'<span class="badge branch">'+esc(branchName(e.Branch))+'</span>'; }
function branchName(id){ var b=((S.meta&&S.meta.branches)||[]).filter(function(x){return x.BranchID===id;})[0]; return b?b.BranchName:(id||'—'); }
function statusBadge(s){ return '<span class="badge '+(s==='Active'?'active':'inactive')+'">'+esc(s||'Active')+'</span>'; }

function viewEmp(empId){
  API.getEmployee(empId).then(function(r){
    if(!r.ok){ toast(r.error,true); return; }
    var e=r.employee;
    var rows=[['Employee ID',e.EmpID],['Login ID',e.LoginID],['Full name',e.FullName],['Role',e.Role],['Office',e.OfficeType],
      ['Branch',branchName(e.Branch)],['Reports to',e.ReportsTo],['Phone',e.Phone],['Email',e.Email],['Gender',e.Gender],
      ['Date of birth',e.DOB],['Joining date',e.JoiningDate],['Address',e.Address],
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
    var joinField=manage?'<div class="field"><label>Joining date</label><input id="f_JoiningDate" type="date" value="'+esc(e.JoiningDate||'')+'"></div>':'';
    function fld(lbl,id,v,t){ return '<div class="field"><label>'+lbl+'</label><input id="'+id+'"'+(t?(' type="'+t+'"'):'')+' value="'+esc(v||'')+'"></div>'; }
    function sel(lbl,id,arr,v){ return '<div class="field"><label>'+lbl+'</label><select id="'+id+'"><option value=""></option>'+arr.map(function(o){return '<option'+(String(o)===String(v)?' selected':'')+'>'+esc(o)+'</option>';}).join('')+'</select></div>'; }
    function docRow(lbl,key,url){ return '<div class="field full"><label>'+lbl+'</label><input type="file" id="up_'+key+'" accept="image/*,application/pdf"><div id="st_'+key+'" class="upst" style="font-size:12px;color:#666;margin-top:4px">'+(url?('Uploaded ✓ <a href="'+esc(url)+'" target="_blank">view</a>'):'')+'</div></div>'; }
    var eduArr=e.EduDocsUrl?String(e.EduDocsUrl).split(',').filter(Boolean):[];
    window._empDocs={Aadhaar:e.AadhaarUrl||'',Pan:e.PanUrl||'',DL:e.DLUrl||'',LightBill:e.LightBillUrl||'',Edu:eduArr.slice()};
    var extBlock=manage?(
      '<div class="section-title full">Family</div>'+
      fld('Father name','f_FatherName',e.FatherName)+fld('Father phone','f_FatherPhone',e.FatherPhone)+
      fld('Mother name','f_MotherName',e.MotherName)+fld('Mother phone','f_MotherPhone',e.MotherPhone)+
      fld('Spouse name','f_SpouseName',e.SpouseName)+fld('Spouse phone','f_SpousePhone',e.SpousePhone)+
      '<div class="field"><label>Anniversary</label><input id="f_Anniversary" type="date" value="'+esc(e.Anniversary||'')+'"></div>'+
      '<div class="section-title full">Bank</div>'+
      fld('Bank name / prefix','f_BankPrefix',e.BankPrefix)+fld('IFSC','f_IFSC',e.IFSC)+fld('Account number','f_AccountNo',e.AccountNo)+
      '<div class="section-title full">Work &amp; pay</div>'+
      fld('Duty start','f_DutyStart',e.DutyStart,'time')+fld('Duty end','f_DutyEnd',e.DutyEnd,'time')+
      fld('Basic salary (₹)','f_BasicSalary',e.BasicSalary,'number')+
      sel('Attendance mode','f_AttendanceMode',['Selfie + Geo','Selfie + Geo (double check)','Geo only (office)'],e.AttendanceMode)+
      sel('Sunday type','f_SundayType',['Type 1 — no Sundays','Type 2 — alternate Sundays'],e.SundayType)+
      sel('Pay / visit type','f_PayType',['Fixed salary','Per km','Per visit'],e.PayType)+
      fld('Per-km rate (₹)','f_PerKmRate',e.PerKmRate,'number')+fld('Per-visit rate (₹)','f_PerVisitRate',e.PerVisitRate,'number')+
      '<div class="field full"><label>KRA (key responsibilities)</label><textarea id="f_KRA" rows="2">'+esc(e.KRA||'')+'</textarea></div>'+
      '<div class="section-title full">Documents (upload)</div>'+
      docRow('Aadhaar card','Aadhaar',e.AadhaarUrl)+docRow('PAN card','Pan',e.PanUrl)+docRow('Driving licence','DL',e.DLUrl)+docRow('Light bill','LightBill',e.LightBillUrl)+
      '<div class="field full"><label>Education documents (multiple)</label><input type="file" id="up_Edu" multiple accept="image/*,application/pdf"><div id="st_Edu" class="upst" style="font-size:12px;color:#666;margin-top:4px">'+(eduArr.length?('Uploaded ✓ ('+eduArr.length+')'):'')+'</div></div>'
    ):'';
    var body='<div class="grid2">'+
      '<div class="section-title full">Basic details</div>'+nameField+joinField+
      '<div class="field"><label>Phone</label><input id="f_Phone" value="'+esc(e.Phone||'')+'"></div>'+
      '<div class="field"><label>Email</label><input id="f_Email" type="email" value="'+esc(e.Email||'')+'"></div>'+
      '<div class="field"><label>Gender</label><select id="f_Gender">'+genderOpts(e.Gender)+'</select></div>'+
      '<div class="field"><label>Date of birth</label><input id="f_DOB" type="date" value="'+esc(e.DOB||'')+'"></div>'+
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
    if(S.perms.level==='BRANCH_MGR'){ var bs=$('f_Branch'); if(bs){ bs.value=S.perms.branch; bs.disabled=true; } }
    function bindUp(key,multi){ var inp=$('up_'+key); if(!inp) return; inp.onchange=function(){ var files=inp.files; if(!files||!files.length) return; var st=$('st_'+key); st.textContent='Uploading…';
      [].forEach.call(files,function(f){ if(f.size>4*1024*1024){ toast(f.name+' too large (max 4MB)',true); return; } var fr=new FileReader(); fr.onload=function(){ var s=fr.result,i=s.indexOf(',');
        API.uploadFile({base64:s.slice(i+1),mimeType:f.type,fileName:f.name,subPath:'EmployeeDocs'}).then(function(r){ if(r.ok){ if(multi){ window._empDocs.Edu.push(r.url); st.innerHTML='Uploaded ✓ ('+window._empDocs.Edu.length+')'; } else { window._empDocs[key]=r.url; st.innerHTML='Uploaded ✓ <a href="'+esc(r.url)+'" target="_blank">view</a>'; } } else st.textContent=r.error||'Upload failed'; }).catch(function(){ st.textContent='Uploading a document needs internet.'; }); }; fr.readAsDataURL(f); }); }; }
    ['Aadhaar','Pan','DL','LightBill'].forEach(function(k){ bindUp(k,false); }); bindUp('Edu',true);
    $('saveEmpBtn').addEventListener('click', function(){ saveEmp(editing?e.EmpID:null, manage); });
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
function val(id){ var e=$(id); return e?e.value.trim():undefined; }
function saveEmp(empId, manage){
  var data={ Phone:val('f_Phone'),Email:val('f_Email'),Gender:val('f_Gender'),DOB:val('f_DOB'),Address:val('f_Address'),EmergencyName:val('f_EmergencyName'),EmergencyPhone:val('f_EmergencyPhone') };
  if(manage){ data.FullName=val('f_FullName'); data.Role=val('f_Role'); data.JoiningDate=val('f_JoiningDate'); data.ReportsTo=val('f_ReportsTo'); var bs=$('f_Branch'); if(bs) data.Branch=bs.value;
    ['FatherName','FatherPhone','MotherName','MotherPhone','SpouseName','SpousePhone','Anniversary','BankPrefix','IFSC','AccountNo','DutyStart','DutyEnd','BasicSalary','AttendanceMode','SundayType','PayType','PerKmRate','PerVisitRate','KRA'].forEach(function(f){ var v=val('f_'+f); if(v!==undefined) data[f]=v; });
    var dc=window._empDocs||{}; data.AadhaarUrl=dc.Aadhaar||''; data.PanUrl=dc.Pan||''; data.DLUrl=dc.DL||''; data.LightBillUrl=dc.LightBill||''; data.EduDocsUrl=(dc.Edu||[]).join(','); }
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
        '<div style="font-size:11px;color:var(--muted);margin-top:5px;">Appears on the Star performers board.</div></div>'+
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
