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
  var canRec=S.perms.canManageRecurring||(S.perms.level==='SUPER')||(S.user && S.user.Role==='Executive Assistant');
  document.querySelectorAll('[data-page="recurring"]').forEach(function(n){ n.classList.toggle('hidden',!canRec); });
  buildMobileBottomNav();
}

/* nav */
function bindApp(){
  $('logoutBtn').addEventListener('click', function(){ API.logout(); API.clearLocal(); location.reload(); });
  $('menuBtn').addEventListener('click', function(){ $('sidebar').classList.toggle('open'); });
  document.querySelectorAll('.nav-item').forEach(function(n){ n.addEventListener('click', function(){ go(n.getAttribute('data-page')); $('sidebar').classList.remove('open'); }); });
  $('addEmpBtn').addEventListener('click', function(){ openEmpModal(null); });
  $('dashRefresh').addEventListener('click', loadDashboard);
  $('dashBranch').addEventListener('change', renderDashboard);
  var deb; $('empSearch').addEventListener('input', function(){ clearTimeout(deb); deb=setTimeout(renderEmpTable,200); });
  $('filterBranch').addEventListener('change', renderEmpTable);
  $('filterStatus').addEventListener('change', renderEmpTable);
}
var currentPage='dashboard';
function go(page){
  currentPage=page;
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.toggle('active', n.getAttribute('data-page')===page); });
  ['dashboard','tasks','calendar','recurring','taskmon','employees','profile','branches','cards','cardstatus'].forEach(function(p){ $('page-'+p).classList.toggle('hidden',p!==page); });
  if(page==='dashboard') loadDashboard();
  if(page==='tasks' && window.renderMyTasks) window.renderMyTasks();
  if(page==='calendar' && window.renderCalendar) window.renderCalendar();
  if(page==='recurring' && window.renderRecurring) window.renderRecurring();
  if(page==='taskmon' && window.renderTaskMonitor) window.renderTaskMonitor();
  if(page==='employees') loadEmployees();
  if(page==='profile') loadProfile();
  if(page==='branches' && window.renderBranches) window.renderBranches();
  if(page==='cards' && window.renderMembershipCards) window.renderMembershipCards();
  if(page==='cardstatus' && window.renderCardStatus) window.renderCardStatus();
  highlightBottomNav();
}

/* ---------- mobile bottom navigation + "More" sheet ---------- */
var NAVDEF=[['dashboard','▦','Home'],['tasks','✓','Tasks'],['calendar','📅','Calendar'],['recurring','🔁','Recurring'],['taskmon','📋','Monitor'],['employees','👥','Staff'],['cards','🏷','Cards'],['cardstatus','✅','Status'],['branches','🏢','Branches'],['profile','⚙','Profile']];
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
var DASH={emps:[],cards:[],prices:{}};
function priceMap(arr){ var m={}; (arr||[]).forEach(function(p){ m[p.typeId+'|'+p.branchId]=Number(p.price)||0; }); return m; }
function fmtMoney(n){ return Math.round(n||0).toLocaleString('en-IN'); }
function loadDashboard(){
  var u=S.user||{};
  $('greetHello').textContent=greetWord()+', '+(u.FullName||'');
  var lvl=S.perms&&S.perms.level;
  var scope=(S.perms&&S.perms.canManageAll)?'org-wide':(lvl==='BRANCH_MGR'?('branch: '+branchName(u.Branch)):(lvl==='BRANCH_VIEW'?('branch: '+branchName(u.Branch)+' (view)'):(S.perms&&S.perms.canViewAll?'all branches (view)':'self-service')));
  $('greetMeta').textContent=[u.Role,(u.OfficeType==='Branch'?branchName(u.Branch):'Corporate Office'),scope].filter(Boolean).join(' · ');
  if(!DASH.emps.length && !DASH.cards.length) $('kpis').innerHTML='<div class="kpi"><div class="n"><span class="loader dark"></span></div><div class="l">Loading…</div></div>';
  Promise.all([API.cachedEmployees(),API.cachedCards(),API.cachedPrices()]).then(function(a){
    if(a[0]) DASH.emps=a[0]; if(a[1]) DASH.cards=a[1]; DASH.prices=priceMap(a[2]||[]);
    if(DASH.emps.length||DASH.cards.length) renderDashboard();
  });
  Promise.all([API.listEmployees().catch(function(){return{};}),API.listCards({}).catch(function(){return{};}),API.listCardPrices().catch(function(){return{};})]).then(function(a){
    if(a[0]&&a[0].ok){ DASH.emps=a[0].employees; S.employees=a[0].employees; S.perms=a[0].perms||S.perms; }
    if(a[1]&&a[1].ok){ DASH.cards=a[1].cards; }
    if(a[2]&&a[2].ok){ DASH.prices=priceMap(a[2].prices); }
    renderDashboard();
  });
}
function renderDashboard(){
  var branch=$('dashBranch').value;
  var emp=(DASH.emps||[]).filter(function(e){ return !branch || String(e.Branch)===String(branch); });
  var cards=(DASH.cards||[]).filter(function(c){ return !branch || String(c.branchId)===String(branch); });
  var now=new Date(), m0=new Date(now.getFullYear(),now.getMonth(),1), soon=new Date(now.getTime()+7*864e5);
  var activeCards=cards.filter(function(c){return c.status==='active';});
  var cardsMTD=cards.filter(function(c){return new Date(c.issuedDate)>=m0;}).length;
  var expiring=activeCards.filter(function(c){var x=new Date(c.expiryDate);return x>=now&&x<=soon;}).length;
  var revenue=activeCards.reduce(function(s,c){return s+(Number(c.amount)||0);},0);
  var brs={}; emp.forEach(function(e){if(e.Branch)brs[e.Branch]=1;}); cards.forEach(function(c){if(c.branchId)brs[c.branchId]=1;});
  $('kpis').innerHTML=
    kpi(emp.filter(function(e){return e.Status==='Active';}).length,'Active staff')+
    kpi(activeCards.length,'Active cards')+
    kpi(cardsMTD,'Cards this month')+
    kpi('₹'+fmtMoney(revenue),'Card business')+
    kpi(expiring,'Expiring (7d)')+
    kpi(Object.keys(brs).length,'Branches');
  var html='';
  if((S.perms&&S.perms.canViewAll) && !branch && Object.keys(brs).length>1){
    var rows=Object.keys(brs).map(function(bid){
      var be=emp.filter(function(e){return String(e.Branch)===bid;}).length;
      var bc=activeCards.filter(function(c){return String(c.branchId)===bid;});
      var brev=bc.reduce(function(s,c){return s+(Number(c.amount)||0);},0);
      return {name:branchName(bid),staff:be,cards:bc.length,rev:brev};
    }).sort(function(a,b){return b.rev-a.rev;});
    html+='<div class="section-label">By branch</div><div class="card"><div class="table-wrap"><table><thead><tr><th>Branch</th><th>Staff</th><th>Active cards</th><th>Card business</th></tr></thead><tbody>'+
      rows.map(function(r){return '<tr><td><b>'+esc(r.name)+'</b></td><td>'+r.staff+'</td><td>'+r.cards+'</td><td>₹'+fmtMoney(r.rev)+'</td></tr>';}).join('')+'</tbody></table></div></div>';
  }
  var byType={}; activeCards.forEach(function(c){ byType[c.typeId]=(byType[c.typeId]||0)+1; });
  var tk=Object.keys(byType);
  if(tk.length){
    html+='<div class="section-label">Active cards by type</div><div class="card"><div class="table-wrap"><table><thead><tr><th>Type</th><th>Count</th></tr></thead><tbody>'+
      tk.sort(function(a,b){return byType[b]-byType[a];}).map(function(t){return '<tr><td><b>'+esc(t)+'</b></td><td>'+byType[t]+'</td></tr>';}).join('')+'</tbody></table></div></div>';
  }
  $('dashExtra').innerHTML=html;
  var recent=emp.slice().sort(function(a,b){return a.EmpID<b.EmpID?1:-1;}).slice(0,6);
  var tb=$('recentTable').querySelector('tbody'); var rhtml='';
  if(!recent.length){ rhtml='<tr><td class="empty">No staff yet.</td></tr>'; }
  else recent.forEach(function(e){ rhtml+='<tr><td><b>'+esc(e.FullName)+'</b>'+pend(e)+'</td><td>'+esc(e.Role)+'</td><td>'+officeBadge(e)+'</td><td>'+statusBadge(e.Status)+'</td></tr>'; });
  tb.innerHTML=rhtml;
}
function kpi(n,l){ return '<div class="kpi"><div class="n">'+n+'</div><div class="l">'+esc(l)+'</div></div>'; }

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
    '</div>'+
    (editing&&manage&&navigator.onLine?'<div style="margin-top:14px"><button class="btn ghost sm" onclick="resetPw(\''+e.EmpID+'\')">Reset login password</button></div>':'');
    var foot='<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="saveEmpBtn">'+(editing?'Save changes':'Create staff')+'</button>';
    openModal(editing?('Edit · '+e.FullName):'Add Staff', body, foot);
    var roleSel=$('f_Role');
    function syncBranch(){ if(!roleSel) return; var sel=S.meta.roles.filter(function(r){return r.Role===roleSel.value;})[0]; var bf=$('branchField'); if(bf) bf.style.display=(sel&&sel.OfficeType==='Branch')?'':'none'; }
    if(roleSel){ roleSel.addEventListener('change',syncBranch); syncBranch(); }
    if(S.perms.level==='BRANCH_MGR'){ var bs=$('f_Branch'); if(bs){ bs.value=S.perms.branch; bs.disabled=true; } }
    $('saveEmpBtn').addEventListener('click', function(){ saveEmp(editing?e.EmpID:null, manage); });
  }
  if(editing){ API.getEmployee(empId).then(function(r){ if(r.ok) build(r.employee); else toast(r.error,true); }); } else { build(null); }
}
function genderOpts(v){ return ['','Male','Female','Other'].map(function(g){return '<option'+(g===v?' selected':'')+'>'+g+'</option>';}).join(''); }
function val(id){ var e=$(id); return e?e.value.trim():undefined; }
function saveEmp(empId, manage){
  var data={ Phone:val('f_Phone'),Email:val('f_Email'),Gender:val('f_Gender'),DOB:val('f_DOB'),Address:val('f_Address'),EmergencyName:val('f_EmergencyName'),EmergencyPhone:val('f_EmergencyPhone') };
  if(manage){ data.FullName=val('f_FullName'); data.Role=val('f_Role'); data.JoiningDate=val('f_JoiningDate'); data.ReportsTo=val('f_ReportsTo'); var bs=$('f_Branch'); if(bs) data.Branch=bs.value; }
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
function loadProfile(){
  API.getEmployee(S.user.EmpID).then(function(r){
    if(!r.ok){ toast(r.error,true); return; }
    var e=r.employee;
    $('profileCard').innerHTML='<div class="grid2">'+
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
      '<button class="btn ghost" id="updBtn" title="Clear cache and load the latest version">↻ Check for updates</button></div>';
    $('updBtn').addEventListener('click', forceUpdate);
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
