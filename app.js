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
  registerSW(); initInstall(); bindAuth(); bindApp(); bindStatus();
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
  var fb=$('filterBranch'); fb.innerHTML='<option value="">All branches</option>';
  S.meta.branches.forEach(function(b){ fb.appendChild(el('<option value="'+esc(b.BranchID)+'">'+esc(b.BranchName)+'</option>')); });
  var ds=$('dashBranch'), canPick=S.perms&&S.perms.canViewAll;
  ds.style.display=canPick?'':'none';
  if(canPick){ ds.innerHTML='<option value="">All branches</option>'; S.meta.branches.forEach(function(b){ ds.appendChild(el('<option value="'+esc(b.BranchID)+'">'+esc(b.BranchName)+'</option>')); }); }
}
function applyPerms(){
  if(!S.perms) return;
  var canList=S.perms.canViewAll||S.perms.level==='BRANCH_MGR';
  document.querySelectorAll('[data-page="employees"]').forEach(function(n){ n.classList.toggle('hidden',!canList); });
  $('addEmpBtn').classList.toggle('hidden', !S.perms.canCreate);
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
function go(page){
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.toggle('active', n.getAttribute('data-page')===page); });
  ['dashboard','employees','profile'].forEach(function(p){ $('page-'+p).classList.toggle('hidden',p!==page); });
  if(page==='dashboard') loadDashboard();
  if(page==='employees') loadEmployees();
  if(page==='profile') loadProfile();
}

/* dashboard */
function greetWord(){ var h=new Date().getHours(); return h<12?'Good morning':(h<17?'Good afternoon':'Good evening'); }
function loadDashboard(){
  var u=S.user||{};
  $('greetHello').textContent=greetWord()+', '+(u.FullName||'');
  var scope=(S.perms&&S.perms.canManageAll)?'org-wide':((S.perms&&S.perms.level==='BRANCH_MGR')?('branch: '+branchName(u.Branch)):(S.perms&&S.perms.canViewAll?'all staff (view)':'self-service'));
  $('greetMeta').textContent=[u.Role,(u.OfficeType==='Branch'?branchName(u.Branch):'Corporate Office'),scope].filter(Boolean).join(' · ');
  $('kpis').innerHTML='<div class="kpi"><div class="n"><span class="loader dark"></span></div><div class="l">Loading…</div></div>';
  API.listEmployees().then(function(r){ if(r.ok){ S.employees=r.employees; S.perms=r.perms||S.perms; renderDashboard(); } });
}
function renderDashboard(){
  var branch=$('dashBranch').value;
  var emp=S.employees.filter(function(e){ return !branch || String(e.Branch)===String(branch); });
  var active=emp.filter(function(e){return e.Status==='Active';}).length;
  var corp=emp.filter(function(e){return e.OfficeType==='Corporate';}).length;
  var br=emp.filter(function(e){return e.OfficeType==='Branch';}).length;
  $('kpis').innerHTML=kpi(emp.length,'Total staff')+kpi(active,'Active')+kpi(corp,'Corporate office')+kpi(br,'Branch staff');
  var recent=emp.slice().sort(function(a,b){return a.EmpID<b.EmpID?1:-1;}).slice(0,6);
  var tb=$('recentTable').querySelector('tbody'); tb.innerHTML='';
  if(!recent.length){ tb.innerHTML='<tr><td class="empty">No staff yet. Go to Employees → Add Staff.</td></tr>'; return; }
  recent.forEach(function(e){ tb.appendChild(el('<tr><td><b>'+esc(e.FullName)+'</b>'+pend(e)+'</td><td>'+esc(e.Role)+'</td><td>'+officeBadge(e)+'</td><td>'+statusBadge(e.Status)+'</td></tr>')); });
}
function kpi(n,l){ return '<div class="kpi"><div class="n">'+n+'</div><div class="l">'+esc(l)+'</div></div>'; }

/* employees */
function loadEmployees(){
  $('empLoad').classList.remove('hidden'); $('empEmpty').classList.add('hidden'); $('empTable').querySelector('tbody').innerHTML='';
  API.listEmployees().then(function(r){ S.employees=r.employees||[]; S.perms=r.perms||S.perms; $('empLoad').classList.add('hidden'); renderEmpTable(); });
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
  list.forEach(function(e){
    var canEdit=S.perms&&(S.perms.canManageAll||S.perms.level==='BRANCH_MGR'||(S.user&&e.EmpID===S.user.EmpID));
    var acts='<button class="btn ghost sm" onclick="viewEmp(\''+e.EmpID+'\')">View</button>';
    if(canEdit && !e._pending) acts+=' <button class="btn ghost sm" onclick="openEmpModal(\''+e.EmpID+'\')">Edit</button>';
    tb.appendChild(el('<tr>'+
      '<td>'+esc(e._pending?'—':e.EmpID)+'</td>'+
      '<td><b>'+esc(e.FullName)+'</b>'+pend(e)+'</td>'+
      '<td>'+esc(e.LoginID||'—')+'</td>'+
      '<td>'+esc(e.Role)+'</td>'+
      '<td>'+officeBadge(e)+'</td>'+
      '<td>'+esc(e.Phone||'—')+'</td>'+
      '<td>'+statusBadge(e.Status)+'</td>'+
      '<td><div class="row-actions">'+acts+'</div></td></tr>'));
  });
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
      var allow=true; if(S.perms.level==='BRANCH_MGR'){ allow=(r.OfficeType==='Branch' && ['SUPER','HR_ADMIN','BRANCH_MGR'].indexOf(r.AccessLevel)<0); }
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
    '</div><div style="margin-top:16px;display:flex;gap:10px">'+
      '<button class="btn" id="saveProfileBtn">Save my details</button>'+
      '<button class="btn ghost" id="changePwBtn">Change password</button></div>';
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
}
function closeModal(){ $('modalRoot').innerHTML=''; }
