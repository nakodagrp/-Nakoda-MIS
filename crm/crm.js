/* ============================================================================================
 *  NAKODA CRM — the app                                                     crm.js  v1.0
 *  One file, no framework (same approach as the MIS). Screens:
 *    followups · cold · nocard · add (single + bulk) · bulk (WhatsApp) · mis · exec
 *  Login = MIS login. The token is shared with the MIS through localStorage 'nk_tok'
 *  (the CRM lives at /crm/ on the same site), so opening it from the MIS needs no sign-in.
 * ============================================================================================ */
(function(){
'use strict';
var CFG = window.CRM_CONFIG || {};
var S = {token:'', me:null, branches:[], branchId:'', cardTypes:[], staff:[], types:['Healthy','Chronic','New lead'], sources:[], pitch:{}, recall:{}, settings:{}, page:'', badge:0, today:''};
var TOKEN_KEY = 'nk_tok', BRANCH_KEY = 'crm_branch';

/* ---------------- small helpers ---------------- */
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function tcls(t){ return t === 'New lead' ? 'New' : String(t || ''); }
function tag(t){ return t ? '<span class="tag t-' + tcls(t) + '"><span class="dot d-' + tcls(t) + '"></span>' + esc(t) + '</span>' : ''; }
function cardTag(p){ return p.cardNo ? '<span class="tag t-card">' + esc(p.cardNo) + '</span>' : '<span class="tag t-nc">No card</span>'; }
function initials(n){ var w = String(n || '?').trim().split(/\s+/); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); }
var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fd(s){ var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? (+m[3]) + ' ' + MON[+m[2] - 1] : ''; }
function fdy(s){ var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? (+m[3]) + ' ' + MON[+m[2] - 1] + ' ' + m[1] : ''; }
function dmy(s){ var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
function hm12(t){ var m = String(t || '').match(/^(\d{2}):(\d{2})/); if(!m) return t || ''; var h = +m[1]; return ((h + 11) % 12 + 1) + ':' + m[2] + (h < 12 ? ' AM' : ' PM'); }
function ymdLocal(d){ return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function today(){ return S.today || ymdLocal(new Date()); }
function pd(s){ var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : new Date(); }
function addDays(s, n){ var d = pd(s); d.setDate(d.getDate() + n); return ymdLocal(d); }
function addMonths(s, n){ var d = pd(s), day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return ymdLocal(d); }
function m10(v){ var d = String(v == null ? '' : v).replace(/\D/g, ''); if(d.length > 10 && /^(91|0)/.test(d)) d = d.slice(-10); return /^[6-9]\d{9}$/.test(d) ? d : ''; }
function fmtMob(m){ m = String(m || ''); return m.length === 10 ? m.slice(0,5) + ' ' + m.slice(5) : m; }
function branch(){ for(var i = 0; i < S.branches.length; i++) if(S.branches[i].id === S.branchId) return S.branches[i]; return {id:S.branchId, name:S.branchId, phone:''}; }
function isMgr(){ return S.me && S.me.level !== 'staff'; }
function debounce(fn, ms){ var t; return function(){ var a = arguments; clearTimeout(t); t = setTimeout(function(){ fn.apply(null, a); }, ms); }; }
function pct(a, b){ return b ? Math.round(a * 100 / b) : 0; }
function opt(v, label, sel){ return '<option value="' + esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + esc(label) + '</option>'; }

function toast(m, bad){
  var t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = m;
  document.body.appendChild(t); setTimeout(function(){ t.remove(); }, bad ? 5200 : 3200);
}
function modal(html, wide){
  var w = document.createElement('div'); w.className = 'modal';
  w.innerHTML = '<div class="box' + (wide ? ' wide' : '') + '">' + html + '</div>';
  $('layer').appendChild(w);
  w.addEventListener('click', function(e){ if(e.target === w) w.remove(); });
  w.close = function(){ w.remove(); };
  w.q = function(sel){ return w.querySelector(sel); };
  return w;
}
function ask(title, text, okLabel, danger){
  return new Promise(function(res){
    var m = modal('<h2>' + esc(title) + '</h2><p class="sub" style="margin:10px 0 18px">' + text + '</p><div class="row"><span class="sp"></span><button class="btn ghost" data-a="0">Back</button><button class="btn' + (danger ? '' : '') + '" data-a="1">' + esc(okLabel || 'OK') + '</button></div>');
    m.querySelectorAll('[data-a]').forEach(function(b){ b.onclick = function(){ m.close(); res(b.getAttribute('data-a') === '1'); }; });
  });
}
function busy(btn, on, label){
  if(!btn) return;
  if(on){ btn.dataset.l = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> ' + (label || 'Saving…'); }
  else { btn.disabled = false; if(btn.dataset.l) btn.innerHTML = btn.dataset.l; }
}
function getTok(){ try{ return localStorage.getItem(TOKEN_KEY) || ''; }catch(e){ return ''; } }
function setTok(t){ try{ t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }catch(e){} }
function lsGet(k){ try{ return localStorage.getItem(k) || ''; }catch(e){ return ''; } }
function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }

/* ---------------- server ---------------- */
function configured(){ return /^https:\/\/script\.google\.com\//.test(String(CFG.API_URL || '')) || /^http:\/\/(localhost|127\.)/.test(String(CFG.API_URL || '')); }
function api(action, payload){
  var body = {action:action, token:S.token, branchId:S.branchId};
  for(var k in (payload || {})) body[k] = payload[k];
  return fetch(CFG.API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(body), redirect:'follow'})
    .then(function(r){ return r.json(); })
    .catch(function(){ return {ok:false, error:navigator.onLine ? 'Could not reach the CRM server. Try again.' : 'You are offline. Connect to the internet and try again.'}; })
    .then(function(r){ if(r && r.session){ signedOut(r.error); } return r || {ok:false, error:'No answer'}; });
}

/* ---------------- sign in / boot ---------------- */
function show(id){ ['vLogin','vBoot','vApp'].forEach(function(v){ $(v).classList.toggle('hidden', v !== id); }); }
function loginMsg(m, kind){ $('loginMsg').innerHTML = m ? '<div class="msg ' + (kind || 'error') + '">' + m + '</div>' : ''; }
function signedOut(msg){ setTok(''); S.token = ''; show('vLogin'); loginMsg(msg || ''); }
function applyBoot(r){
  S.token = r.token; S.me = r.me; S.branches = r.branches || []; S.cardTypes = r.cardTypes || []; S.staff = r.staff || [];
  S.types = r.types || S.types; S.sources = r.sources || []; S.pitch = r.pitch || {}; S.recall = r.recall || {}; S.settings = r.settings || {}; S.today = r.today;
  var saved = lsGet(BRANCH_KEY), ok = S.branches.some(function(b){ return b.id === saved; });
  S.branchId = ok ? saved : (r.branchId && S.branches.some(function(b){ return b.id === r.branchId; }) ? r.branchId : (S.branches[0] || {}).id || '');
  setTok(S.token);
  $('meAv').textContent = initials(S.me.name); $('meName').textContent = String(S.me.name).toUpperCase();
  $('meRole').textContent = (S.me.role || 'Staff') + ' · ' + (branch().name || '');
  $('buildChip').textContent = 'CRM ' + String(r.build || '').replace('crm-', '');
  var sel = $('branchSel');
  sel.innerHTML = S.branches.map(function(b){ return opt(b.id, b.name, S.branchId); }).join('');
  sel.disabled = S.branches.length < 2;
  sel.onchange = function(){ S.branchId = sel.value; lsSet(BRANCH_KEY, S.branchId); go(S.page, true); };
  buildNav(); show('vApp');
  go((location.hash || '').replace('#', '') || 'followups', true);
}
function boot(){
  $('loginForm').onsubmit = function(e){
    e.preventDefault();
    if(!configured()){ loginMsg('The CRM is not connected yet: put the CRM Web App URL in <b>crm/config.js</b> (install guide, step 6).'); return; }
    var b = $('loginBtn'); busy(b, true, 'Signing in…'); loginMsg('');
    S.token = '';
    api('login', {loginId:$('loginId').value.trim(), password:$('loginPw').value}).then(function(r){
      busy(b, false);
      if(!r.ok){ loginMsg(esc(r.error)); return; }
      $('loginPw').value = ''; applyBoot(r);
    });
  };
  $('logoutBtn').onclick = function(){ ask('Log out?', 'This also logs you out of the MIS on this device (it is the same login).', 'Log out').then(function(y){ if(!y) return; api('logout'); signedOut(''); }); };
  window.addEventListener('online', net); window.addEventListener('offline', net); net();
  window.addEventListener('hashchange', function(){ var p = location.hash.replace('#', ''); if(p && p !== S.page && S.me) go(p); });
  if(!configured()){ show('vLogin'); loginMsg('The CRM is not connected yet: put the CRM Web App URL in <b>crm/config.js</b> (install guide, step 6).', 'warn'); return; }
  S.token = getTok();
  if(!S.token){ show('vLogin'); return; }
  show('vBoot');
  api('boot', {branchId:lsGet(BRANCH_KEY)}).then(function(r){ if(r.ok) applyBoot(r); else if(!r.session){ show('vLogin'); loginMsg(esc(r.error)); } });
}
function net(){ var on = navigator.onLine, c = $('netChip'); if(!c) return; c.classList.toggle('off', !on); c.lastChild.textContent = on ? 'Online' : 'Offline'; }

/* ---------------- navigation ---------------- */
var NAV = [['followups','☰','My Follow-ups','Follow-ups','Calling'],['cold','✳','Cold Data','Cold',''],['nocard','▭','Without Card','No card',''],
           ['add','＋','Add Patient','Add',''],['bulk','💬','Bulk Message','Bulk','Messaging'],['mis','📊','My MIS','MIS','Reports'],['exec','▦','Executive','Exec','']];
function navItems(){ return NAV.filter(function(n){ return n[0] !== 'exec' || isMgr(); }); }
function buildNav(){
  var h = '';
  navItems().forEach(function(n){
    if(n[4]) h += '<div class="grp">' + n[4] + '</div>';
    h += '<div class="nav" data-p="' + n[0] + '"><span class="ic">' + n[1] + '</span>' + n[2] + (n[0] === 'followups' ? '<span class="badge hidden" id="navBadge"></span>' : '') + '</div>';
  });
  h += '<div class="foot">Connected to <b style="color:var(--red)">Nakoda MIS</b><br>Login · Branches · Cards · WhatsApp</div>';
  $('side').innerHTML = h;
  $('bottom').innerHTML = navItems().filter(function(n){ return n[0] !== 'exec'; }).map(function(n){
    return '<div data-p="' + n[0] + '"><span class="i">' + n[1] + '</span>' + n[3] + (n[0] === 'followups' ? '<span class="badge hidden" id="botBadge"></span>' : '') + '</div>';
  }).join('');
  document.querySelectorAll('[data-p]').forEach(function(el){ el.onclick = function(){ go(el.getAttribute('data-p')); }; });
}
function setBadge(n){
  S.badge = n;
  ['navBadge','botBadge'].forEach(function(id){ var b = $(id); if(!b) return; b.textContent = n; b.classList.toggle('hidden', !n); });
}
var PAGES = {};
function go(p, force){
  if(!PAGES[p]) p = 'followups';
  if(p === 'exec' && !isMgr()) p = 'mis';
  if(p === S.page && !force) return;
  S.page = p; closeDrawer();
  if(location.hash !== '#' + p) history.replaceState(null, '', '#' + p);
  document.querySelectorAll('[data-p]').forEach(function(el){ el.classList.toggle('on', el.getAttribute('data-p') === p); });
  $('main').innerHTML = '<div class="loading"><span class="spin"></span> Loading…</div>';
  window.scrollTo(0, 0);
  PAGES[p]();
}
function head(title, sub, right){
  return '<div class="head"><div><h1>' + title + '</h1><div class="sub">' + (sub || '') + '</div></div><span class="sp"></span>' + (right || '') + '</div>';
}
function kpi(l, v, h, o){
  o = o || {};
  return '<div class="kpi' + (o.hl ? ' hl' : '') + '"><div class="l">' + l + '</div><div class="v" style="' + (o.color ? 'color:' + o.color : '') + '">' + v + '</div>' +
    (o.bar != null ? '<div class="bar"><i style="width:' + Math.min(100, o.bar) + '%"></i></div>' : '') + '<div class="h">' + (h || '') + '</div></div>';
}
function staffOptions(sel, withBranch){
  var list = S.staff.filter(function(s){ return s.branch === S.branchId && s.empId !== S.me.empId; });
  list.sort(function(a, b){ return (b.isCrm - a.isCrm) || (a.name < b.name ? -1 : 1); });
  return (withBranch ? opt('branch', 'Whole branch', sel) : '') + opt('mine', 'Me (' + S.me.name + ')', sel) +
    list.map(function(s){ return opt(s.empId, s.name + (s.isCrm ? '' : ' · ' + s.role), sel); }).join('');
}

/* ================================================================== FOLLOW-UPS */
var F = {type:'', q:'', scope:'', rows:[], kpis:{}, cur:-1};
PAGES.followups = function(){
  if(!F.scope || (S.me.level === 'staff')) F.scope = isMgr() ? 'branch' : 'mine';
  var title = !isMgr() ? 'My Follow-ups' : (F.scope === 'branch' ? 'Branch follow-ups' : (F.scope === 'mine' ? 'My Follow-ups' : 'Follow-ups'));
  var right = (isMgr() ? '<select class="inp" id="fScope" style="width:220px">' + staffOptions(F.scope, true) + '</select>' : '') + '<button class="btn ghost" id="fRef">Refresh</button>';
  $('main').innerHTML = head(title, fdy(today()) + ' · patients due in the next 7 days', right) +
    '<div class="kpis" id="fK"></div>' +
    '<div class="pills" style="margin-bottom:12px"><span class="pill" data-t="">All</span><span class="pill" data-t="New lead"><span class="dot d-New"></span>New lead</span>' +
    '<span class="pill" data-t="Healthy"><span class="dot d-Healthy"></span>Healthy</span><span class="pill" data-t="Chronic"><span class="dot d-Chronic"></span>Chronic</span>' +
    '<input class="inp" id="fQ" placeholder="🔍 Search name or mobile (all your patients)…" style="flex:1;min-width:200px;padding:8px 12px" value="' + esc(F.q) + '"></div>' +
    '<div class="card flush" id="fL"><div class="loading"><span class="spin"></span></div></div>';
  document.querySelectorAll('[data-t]').forEach(function(p){ p.classList.toggle('on', p.getAttribute('data-t') === F.type); p.onclick = function(){ F.type = p.getAttribute('data-t'); PAGES.followups(); }; });
  $('fQ').oninput = debounce(function(){ F.q = $('fQ').value.trim(); fLoad(); }, 450);
  $('fRef').onclick = fLoad;
  if($('fScope')) $('fScope').onchange = function(){ F.scope = this.value; PAGES.followups(); };
  fLoad();
};
function fLoad(){
  api('followups', {opts:{scope:F.scope, type:F.type, q:F.q}}).then(function(r){
    if(S.page !== 'followups') return;
    if(!r.ok){ $('fL').innerHTML = '<div class="empty">' + esc(r.error) + '</div>'; return; }
    F.rows = r.rows; F.kpis = r.kpis;
    if(r.scope === 'mine' || !isMgr()) setBadge(r.kpis.overdue + r.kpis.dueToday);
    fPaint();
  });
}
function fPaint(){
  var k = F.kpis;
  $('fK').innerHTML = kpi('Calls today', k.callsToday + '<small> / ' + k.target + '</small>', '', {bar:pct(k.callsToday, k.target)}) +
    kpi('Overdue', k.overdue, 'call these first', {hl:k.overdue > 0, color:'var(--red)'}) + kpi('Due today', k.dueToday, fd(today())) + kpi('Next 7 days', k.next7, 'plan ahead');
  if(!F.rows.length){ $('fL').innerHTML = '<div class="empty">' + (F.q ? 'No patient matches “' + esc(F.q) + '”.' : '🎉 Nothing due. Add patients or work the cold data.') + '</div>'; return; }
  $('fL').innerHTML = F.rows.map(function(p, i){
    var d = p.overdueDays ? '<span class="od">' + p.overdueDays + (p.overdueDays === 1 ? ' day' : ' days') + ' overdue</span>'
          : (p.dueToday ? '<span class="od today">Due today</span>' : (p.nextCall ? '<span class="od later">' + fd(p.nextCall) + '</span>' : ''));
    return '<div class="prow' + (i === F.cur ? ' sel' : '') + '" data-i="' + i + '"><span class="av lt">' + esc(initials(p.name || p.mobile)) + '</span><div style="min-width:0">' +
      '<div class="l1"><span class="nm">' + esc(p.name || 'No name') + '</span>' + tag(p.type) + cardTag(p) + '</div>' +
      '<div class="meta">' + esc(p.mobile) + (p.area ? ' · ' + esc(p.area) : '') + (isMgr() && p.assignedName ? ' · ' + esc(p.assignedName) : '') + '</div>' +
      (p.lastOutcome || p.lastNote ? '<div class="ln"><b>Last:</b> ' + esc(p.lastNote || p.lastOutcome) + '</div>' : '') +
      '<div class="pt">Pitch: ' + esc(p.pitch) + '</div></div><div class="rt">' + d + '</div></div>';
  }).join('');
  $('fL').querySelectorAll('.prow').forEach(function(r){ r.onclick = function(){ openCall(+r.getAttribute('data-i')); }; });
}

/* ---------- the call screen ---------- */
var D = null;
function closeDrawer(){ $('layer').querySelectorAll('.scrim,.drawer').forEach(function(e){ e.remove(); }); D = null; }
function openCall(i){
  F.cur = i; var p = F.rows[i]; if(!p) return;
  D = {p:p, i:i, outcome:'', date:'', newType:'', note:'', hist:null};
  closeDrawer(); D = {p:p, i:i, outcome:'', date:'', newType:'', note:'', hist:null};
  var s = document.createElement('div'); s.className = 'scrim'; s.onclick = closeDrawer;
  var d = document.createElement('div'); d.className = 'drawer'; d.id = 'drawer';
  $('layer').appendChild(s); $('layer').appendChild(d);
  dPaint();
  document.querySelectorAll('.prow').forEach(function(r){ r.classList.toggle('sel', +r.getAttribute('data-i') === i); });
  api('patient', {patientId:p.patientId}).then(function(r){ if(!D || D.p !== p) return; if(r.ok){ D.p = r.patient; F.rows[i] = r.patient; D.hist = r.history; } else D.hist = []; dPaint(); });
}
function nextPreview(){
  var p = D.p, t = today(), rc = S.recall[p.type] || 3, max = S.settings.notReachableTries || 3;
  switch(D.outcome){
    case 'gave_date': return D.date ? 'Next call: <b>' + fd(D.date) + '</b> <span class="muted">(date given by patient)</span>' : 'Pick the date the patient gave.';
    case 'visited': var v = D.date || t; return 'New cycle from ' + fd(v) + '. Next call: <b>' + fd(addMonths(v, rc)) + '</b> <span class="muted">(' + rc + ' months, ' + esc(p.type) + ')</span>';
    case 'not_now': return 'Next call: <b>' + fd(addMonths(t, rc)) + '</b> <span class="muted">(after one cycle)</span>';
    case 'not_reachable': var n = (p.tries || 0) + 1; return n >= max ? 'Not reachable ' + max + ' times → next cycle: <b>' + fd(addMonths(t, rc)) + '</b>' : 'Next call: <b>' + fd(addDays(t, 1)) + '</b> <span class="muted">(try ' + (n + 1) + ' of ' + max + ')</span>';
    case 'change_type': return D.newType ? 'Now <b>' + esc(D.newType) + '</b> — next call about <b>' + fd(addMonths(t, S.recall[D.newType] || 3)) + '</b>' : 'Pick the new type.';
    case 'block': return '<span style="color:var(--red)">This number will <b>never</b> be called or messaged again, from any branch.</span>';
  }
  return '';
}
var QUICK = ['Busy, asked to call later','Will come this week','Out of town','Already tested elsewhere','Wants home collection','Asked for package price','Switched off','Report discussed'];
function waLink(mobile, text){ return 'https://wa.me/91' + mobile + (text ? '?text=' + encodeURIComponent(text) : ''); }
function dPaint(){
  var d = $('drawer'); if(!d || !D) return;
  var p = D.p, b = branch();
  var outs = [['gave_date','Gave a date','call on that date'],['visited','Visited','test done → new cycle'],['not_now','Not now','after one cycle'],
              ['not_reachable','Not reachable','retry tomorrow'],['change_type','Change type','Healthy ↔ Chronic'],['block','Block','never call again']];
  var extra = '';
  if(D.outcome === 'gave_date') extra = '<div class="field" style="margin-top:12px"><label>Date patient gave</label><input type="date" id="dDate" min="' + today() + '" value="' + esc(D.date) + '"></div>';
  if(D.outcome === 'visited') extra = '<div class="field" style="margin-top:12px"><label>Visit / test date</label><input type="date" id="dDate" max="' + today() + '" value="' + esc(D.date || today()) + '"></div>';
  if(D.outcome === 'change_type') extra = '<div class="field" style="margin-top:12px"><label>New type</label><div class="typebtns">' + S.types.filter(function(t){ return t !== p.type; }).map(function(t){
      return '<button type="button" data-nt="' + esc(t) + '" class="' + (D.newType === t ? 'sel' : '') + '"><span class="dot d-' + tcls(t) + '"></span> ' + esc(t) + '</button>'; }).join('') + '</div></div>';
  var hist = D.hist == null ? '<div class="muted"><span class="spin"></span> loading…</div>' : (D.hist.length ? '<div class="hist">' + D.hist.map(function(h){
      return '<div><span class="w">' + esc(fd(h.at) + ', ' + String(h.at).slice(11, 16)) + ' · ' + esc(h.empName) + ' · <b style="color:var(--ink)">' + esc(outLabel(h)) + '</b>' + (h.nextCall ? ' → ' + fd(h.nextCall) : '') + '</span><br>' + esc(h.note || '') + '</div>'; }).join('') + '</div>' : '<div class="muted">No calls yet.</div>');
  d.innerHTML = '<div class="dh"><div class="row"><span class="av" style="width:48px;height:48px;font-size:16px">' + esc(initials(p.name || p.mobile)) + '</span><div style="flex:1;min-width:0">' +
    '<div style="font-size:20px;font-weight:700">' + esc(p.name || 'No name') + '</div><div class="row wrap" style="gap:6px"><span class="sub">' + esc(p.mobile) + '</span>' + tag(p.type) + cardTag(p) + '</div></div>' +
    '<button class="x" id="dX">×</button></div>' +
    '<div class="sub" style="margin-top:8px">Next call: <b style="color:var(--ink)">' + (fd(p.nextCall) || '—') + '</b>' + (p.lastVisit ? ' · Last visit: ' + fd(p.lastVisit) : '') + (p.source ? ' · Source: ' + esc(p.source) + (p.sourceDetail ? ' (' + esc(p.sourceDetail) + ')' : '') : '') + '</div>' +
    '<div class="sub">' + (p.assignedName ? 'CRM: ' + esc(p.assignedName) : '') + (p.area ? ' · Area: ' + esc(p.area) : '') + (p.age ? ' · Age ' + esc(p.age) : '') + '</div></div>' +
    '<div class="db"><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">' +
    '<a class="btn" href="tel:+91' + esc(p.mobile) + '">☎ Call</a>' +
    '<a class="btn green" target="_blank" rel="noopener" href="' + waLink(p.mobile, 'Hello ' + (p.name || '') + ', greetings from Nakoda Diagnostics & Research Center, ' + b.name + '. ') + '">WhatsApp</a>' +
    '<button class="btn ghost" id="dCard">▭ ' + (p.cardNo ? 'Card ✓' : 'Card') + '</button></div>' +
    '<div class="pitch"><b>SUGGESTED PITCH</b>' + esc(p.pitch || S.pitch[p.type] || '') + '</div>' +
    '<div style="font-weight:700;margin-bottom:8px">Call outcome</div><div class="ob">' + outs.map(function(o){
      return '<button type="button" data-o="' + o[0] + '" class="' + (D.outcome === o[0] ? 'sel' : '') + '">' + o[1] + '<small>' + o[2] + '</small></button>'; }).join('') + '</div>' +
    extra + (D.outcome ? '<div class="nextbox">' + nextPreview() + '</div>' : '') +
    '<div class="field" style="margin-top:12px"><label>What did you talk about? <span style="color:var(--red)">*</span></label><textarea id="dNote" placeholder="e.g. Busy this week, will come Saturday morning with wife.">' + esc(D.note) + '</textarea></div>' +
    '<div>' + QUICK.map(function(q){ return '<span class="qc">' + esc(q) + '</span>'; }).join('') + '</div>' +
    '<div style="font-weight:700;margin:14px 0 8px">Call history ' + (D.hist ? '<span class="muted" style="font-weight:400">(' + D.hist.length + ')</span>' : '') + '</div>' + hist + '</div>' +
    '<div class="df"><button class="btn ghost" id="dSave">Save</button><button class="btn" id="dNext">Save &amp; next patient →</button></div>';
  d.querySelector('#dX').onclick = closeDrawer;
  d.querySelectorAll('[data-o]').forEach(function(x){ x.onclick = function(){ D.note = $('dNote').value; D.outcome = x.getAttribute('data-o'); D.date = ''; D.newType = ''; dPaint(); }; });
  d.querySelectorAll('[data-nt]').forEach(function(x){ x.onclick = function(){ D.note = $('dNote').value; D.newType = x.getAttribute('data-nt'); dPaint(); }; });
  var dd = d.querySelector('#dDate'); if(dd){ if(D.outcome === 'visited' && !D.date) D.date = today(); dd.onchange = function(){ D.note = $('dNote').value; D.date = dd.value; dPaint(); }; }
  d.querySelectorAll('.qc').forEach(function(q){ q.onclick = function(){ var t = $('dNote'); t.value = (t.value ? t.value.replace(/[.\s]*$/, '') + '. ' : '') + q.textContent; D.note = t.value; }; });
  $('dNote').oninput = function(){ D.note = this.value; };
  d.querySelector('#dCard').onclick = function(){ if(p.cardNo) cardInfo(p); else issueOne(p, function(np){ D.p = np; F.rows[D.i] = np; dPaint(); fPaint(); }); };
  d.querySelector('#dSave').onclick = function(){ dSave(false, this); };
  d.querySelector('#dNext').onclick = function(){ dSave(true, this); };
}
function outLabel(h){
  var L = {gave_date:'Gave a date', visited:'Visited', not_now:'Not now', not_reachable:'Not reachable', change_type:'Type changed', block:'Blocked',
    added:'Added', readded:'Came again — new funnel', card_issued:'Card issued', card_existing:'Card found', useful:'Useful (cold)', not_useful:'Not useful (cold)', wrong:'Wrong (cold)', call_later:'Call later (cold)'};
  return L[h.outcome] || h.outcome;
}
function dSave(next, btn){
  if(!D) return;
  D.note = $('dNote').value.trim();
  if(!D.outcome){ toast('Pick a call outcome.', true); return; }
  if(D.note.length < 2){ toast('Write what you talked about.', true); $('dNote').focus(); return; }
  if(D.outcome === 'gave_date' && !D.date){ toast('Pick the date the patient gave.', true); return; }
  if(D.outcome === 'change_type' && !D.newType){ toast('Pick the new type.', true); return; }
  var go2 = function(){
    busy(btn, true);
    api('logCall', {data:{patientId:D.p.patientId, outcome:D.outcome, note:D.note, date:D.date, newType:D.newType}}).then(function(r){
      busy(btn, false);
      if(!r.ok){ toast(r.error, true); return; }
      toast(r.message || 'Saved.');
      var i = D.i, np = r.patient, horizon = addDays(today(), 7);
      var keep = np.status !== 'blocked' && (F.q || (np.nextCall && np.nextCall <= horizon));
      if(keep) F.rows[i] = np; else F.rows.splice(i, 1);
      F.kpis.callsToday = (F.kpis.callsToday || 0) + 1;
      var nextI = keep ? i + 1 : i;
      F.cur = -1; fPaint();
      if(next && F.rows[nextI]) openCall(nextI); else closeDrawer();
      setTimeout(fLoad, 600);
    });
  };
  if(D.outcome === 'block') ask('Block this patient?', 'They will never be called or messaged again, from any branch.', 'Block').then(function(y){ if(y) go2(); }); else go2();
}

/* ---------- membership cards (issued by the MIS) ---------- */
function cardText(p, x){
  var b = branch();
  return 'Dear ' + (p.name || 'Member') + ', greetings from NAKODA DIAGNOSTICS AND RESEARCH CENTER - ' + b.name + '. Your membership card is ready!\n' +
    'Membership Number: ' + (x.cardNo || p.cardNo) + '\nCard Type: ' + (x.typeName || p.cardType || '') + (x.validTill || p.cardValidTill ? '\nValid up to: ' + dmy(x.validTill || p.cardValidTill) : '') +
    (b.phone ? '\nPlease save ' + b.phone + ' as *Nakoda Lab* in your contacts.' : '');
}
function cardInfo(p){
  var m = modal('<h2>Membership card</h2><div style="margin:14px 0"><span class="tag t-card" style="font-size:15px">' + esc(p.cardNo) + '</span> <span class="sub">' + esc(p.cardType || '') + (p.cardValidTill ? ' · valid till ' + dmy(p.cardValidTill) : '') + '</span></div>' +
    '<div class="sub">The card is in the MIS (Membership Cards). Send the card picture from there, or send the number now:</div>' +
    '<div class="row" style="margin-top:16px"><span class="sp"></span><button class="btn ghost" id="mC">Close</button><a class="btn green" target="_blank" rel="noopener" href="' + waLink(p.mobile, cardText(p, {})) + '">WhatsApp the number</a></div>');
  m.q('#mC').onclick = m.close;
}
function cardTypeSelect(id, sel){
  return '<select class="inp" id="' + id + '">' + (S.cardTypes.length ? S.cardTypes.map(function(t){ return opt(t.typeId, t.name + (t.validityMonths ? ' · ' + t.validityMonths + ' months' : ''), sel); }).join('') : '<option value="">No card types in the MIS</option>') + '</select>';
}
function issueOne(p, done){
  if(!p.name){ toast('Add the patient name first (Add Patient with the same mobile).', true); return; }
  var m = modal('<h2>Generate membership card</h2><div class="sub" style="margin:6px 0 14px">' + esc(p.name) + ' · ' + esc(p.mobile) + ' — the card number comes from the MIS card register.</div>' +
    '<div class="field"><label>Card type</label>' + cardTypeSelect('mT', '') + '</div><div id="mR"></div>' +
    '<div class="row"><span class="sp"></span><button class="btn ghost" id="mC">Cancel</button><button class="btn" id="mG">Generate card</button></div>');
  m.q('#mC').onclick = m.close;
  m.q('#mG').onclick = function(){
    var btn = this; busy(btn, true, 'Issuing…');
    api('issueCards', {patientIds:[p.patientId], typeId:m.q('#mT').value}).then(function(r){
      busy(btn, false);
      var x = r.ok && r.results && r.results[0];
      if(!x || !x.ok){ m.q('#mR').innerHTML = '<div class="msg error">' + esc((x && x.error) || r.error) + '</div>'; return; }
      var np = Object.assign({}, p, {cardNo:x.cardNo, cardType:x.typeName, cardValidTill:x.validTill});
      m.q('.box').innerHTML = '<h2>' + (x.existing ? 'Card already existed' : 'Card ready ✓') + '</h2><div style="margin:14px 0"><span class="tag t-card" style="font-size:15px">' + esc(x.cardNo) + '</span> <span class="sub">' + esc(x.typeName) + (x.validTill ? ' · valid till ' + dmy(x.validTill) : '') + '</span></div>' +
        '<div class="row"><span class="sp"></span><button class="btn ghost" id="mC2">Close</button><a class="btn green" target="_blank" rel="noopener" href="' + waLink(p.mobile, cardText(np, x)) + '">WhatsApp Send</a></div>';
      m.q('#mC2').onclick = m.close;
      if(done) done(np);
    });
  };
}

/* ================================================================== COLD DATA */
var C = {source:'', st:null, open:{}, tmp:{}};
PAGES.cold = function(){
  $('main').innerHTML = head('Cold data', 'Call each number and sort it. Numbers are reserved for you so no one else calls them.',
    '<select class="inp" id="cSrc" style="width:210px"><option value="">All sources</option></select><button class="btn" id="cGet">Get ' + (S.settings.coldBatch || 20) + ' numbers</button>') +
    '<div class="kpis" id="cK"></div><div id="cG"><div class="loading"><span class="spin"></span></div></div>';
  $('cSrc').onchange = function(){ C.source = this.value; cLoad('cold'); };
  $('cGet').onclick = function(){ cLoad('coldGet', this); };
  cLoad('cold');
};
function cLoad(action, btn){
  busy(btn, true, 'Reserving…');
  api(action, {source:C.source}).then(function(r){
    busy(btn, false);
    if(S.page !== 'cold') return;
    if(!r.ok){ $('cG').innerHTML = '<div class="card empty">' + esc(r.error) + '</div>'; return; }
    C.st = r; if(action === 'coldGet' && !r.mine.length) toast('No numbers left in the pool' + (C.source ? ' for ' + C.source : '') + '.', true);
    cPaint();
  });
}
function cPaint(){
  var st = C.st, k = st.kpis;
  $('cSrc').innerHTML = '<option value="">All sources</option>' + st.sources.map(function(s){ return opt(s.source, s.source + ' (' + s.count + ')', C.source); }).join('');
  if(C.source && !st.sources.some(function(s){ return s.source === C.source; })) $('cSrc').innerHTML += opt(C.source, C.source + ' (0)', C.source);
  $('cK').innerHTML = kpi('In my hand', k.inHand, st.until ? 'reserved till ' + hm12(st.until) : 'press Get numbers') + kpi('Waiting in pool', k.pool, C.source || 'all sources') +
    kpi('Sorted today', k.sortedToday, k.usefulToday + ' useful · ' + pct(k.usefulToday, k.sortedToday) + '%', {color:'var(--ok)'}) + kpi('Do-not-call', k.dnc, 'never called again');
  if(!st.mine.length){ $('cG').innerHTML = '<div class="card empty">No numbers in your hand. Press <b>Get ' + (S.settings.coldBatch || 20) + ' numbers</b>.' + (k.pool ? '' : '<br>The pool is empty — upload purchased data in <b>Add Patient ▸ Bulk upload ▸ Cold data pool</b>.') + '</div>'; return; }
  $('cG').innerHTML = '<div class="cgrid">' + st.mine.map(function(c){
    var o = C.open[c.coldId] || '', t = C.tmp[c.coldId] || (C.tmp[c.coldId] = {name:c.name, area:c.area, type:'New lead', note:'', giveCard:false, cardTypeId:(S.cardTypes[0] || {}).typeId || '', date:addDays(today(), 1)});
    var form = '';
    if(o === 'useful') form = '<div class="grid2" style="margin-top:12px"><div class="field"><label>Name</label><input data-f="name" value="' + esc(t.name) + '"></div><div class="field"><label>Area / society</label><input data-f="area" value="' + esc(t.area) + '"></div></div>' +
      '<div class="field"><label>Patient type</label><div class="typebtns">' + S.types.map(function(x){ return '<button type="button" data-ty="' + esc(x) + '" class="' + (t.type === x ? 'sel' : '') + '"><span class="dot d-' + tcls(x) + '"></span> ' + esc(x) + '</button>'; }).join('') + '</div></div>' +
      '<div class="field"><label>Note</label><input data-f="note" placeholder="What did they say?" value="' + esc(t.note) + '"></div>' +
      '<label class="row" style="font-size:14px;margin-bottom:10px;cursor:pointer"><input type="checkbox" data-f="giveCard"' + (t.giveCard ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--red)"> Give membership card now <span class="muted">(issued by MIS)</span></label>' +
      (t.giveCard ? '<div class="field">' + cardTypeSelect('ct_' + c.coldId, t.cardTypeId).replace('<select ', '<select data-f="cardTypeId" ') + '</div>' : '') +
      '<button class="btn block" data-save="useful">Save as patient</button>';
    else if(o === 'call_later') form = '<div class="grid2" style="margin-top:12px"><div class="field"><label>Call again on</label><input type="date" data-f="date" min="' + addDays(today(), 1) + '" value="' + esc(t.date) + '"></div><div class="field"><label>Note</label><input data-f="note" value="' + esc(t.note) + '"></div></div><button class="btn block" data-save="call_later">Save — back to pool</button>';
    else if(o) form = '<div class="field" style="margin-top:12px"><label>Note (optional)</label><input data-f="note" value="' + esc(t.note) + '"></div><button class="btn block" data-save="' + o + '">' + (o === 'not_useful' ? 'Confirm — never call again' : 'Confirm — wrong / switched off') + '</button>';
    return '<div class="card" data-c="' + c.coldId + '"><div class="row"><span class="cnum">' + fmtMob(c.mobile) + '</span><span class="sp"></span><span class="tag t-nc">' + esc(c.source) + '</span></div>' +
      '<div class="sub">' + esc(c.name || 'No name') + (c.area ? ' · ' + esc(c.area) : '') + (c.batchId ? ' · <span class="muted">' + esc(c.batchId) + '</span>' : '') + '</div>' +
      '<a class="btn block" style="margin-top:12px" href="tel:+91' + esc(c.mobile) + '">☎ Call</a><div class="cob">' +
      '<button class="u' + (o === 'useful' ? ' sel' : '') + '" data-o="useful">✓ Useful</button><button class="nu' + (o === 'not_useful' ? ' sel' : '') + '" data-o="not_useful">✕ Not useful</button>' +
      '<button class="w' + (o === 'wrong' ? ' sel' : '') + '" data-o="wrong">Wrong / off</button><button class="' + (o === 'call_later' ? 'sel' : '') + '" data-o="call_later">Call later</button></div>' + form + '</div>';
  }).join('') + '</div>';
  $('cG').querySelectorAll('[data-c]').forEach(function(card){
    var id = card.getAttribute('data-c'), t = C.tmp[id];
    card.querySelectorAll('[data-o]').forEach(function(b){ b.onclick = function(){ C.open[id] = C.open[id] === b.getAttribute('data-o') ? '' : b.getAttribute('data-o'); cPaint(); }; });
    card.querySelectorAll('[data-ty]').forEach(function(b){ b.onclick = function(){ t.type = b.getAttribute('data-ty'); cPaint(); }; });
    card.querySelectorAll('[data-f]').forEach(function(f){
      var k = f.getAttribute('data-f');
      f.oninput = f.onchange = function(){ t[k] = f.type === 'checkbox' ? f.checked : f.value; if(k === 'giveCard') cPaint(); };
    });
    var sv = card.querySelector('[data-save]');
    if(sv) sv.onclick = function(){
      var o = sv.getAttribute('data-save');
      busy(sv, true);
      api('coldOutcome', {coldId:id, outcome:o, data:{name:t.name, area:t.area, type:t.type, note:t.note, date:t.date, giveCard:t.giveCard, cardTypeId:t.cardTypeId}}).then(function(r){
        busy(sv, false);
        if(!r.ok){ toast(r.error, true); return; }
        toast(r.message + (r.card ? (r.card.ok ? ' Card ' + r.card.cardNo + '.' : ' Card not issued: ' + r.card.error) : ''), r.card && !r.card.ok);
        C.st.mine = C.st.mine.filter(function(x){ return x.coldId !== id; });
        C.st.kpis.inHand--; C.st.kpis.sortedToday++; if(o === 'useful') C.st.kpis.usefulToday++; if(o === 'not_useful') C.st.kpis.dnc++;
        delete C.open[id]; delete C.tmp[id];
        cPaint();
        if(r.card && r.card.ok && r.patient) setTimeout(function(){ cardSent(r.patient, r.card); }, 300);
      });
    };
  });
}
function cardSent(p, x){
  var m = modal('<h2>Card ready ✓</h2><div style="margin:14px 0">' + esc(p.name || p.mobile) + ' · <span class="tag t-card" style="font-size:14px">' + esc(x.cardNo) + '</span></div>' +
    '<div class="row"><span class="sp"></span><button class="btn ghost" id="mC">Close</button><a class="btn green" target="_blank" rel="noopener" href="' + waLink(p.mobile, cardText(p, x)) + '">WhatsApp Send</a></div>');
  m.q('#mC').onclick = m.close;
}

/* ================================================================== WITHOUT CARD */
var N = {type:'', scope:'', rows:[], sel:{}, typeId:'', results:null, total:0};
PAGES.nocard = function(){
  if(!N.scope) N.scope = isMgr() ? 'branch' : 'mine';
  if(!N.typeId) N.typeId = (S.cardTypes[0] || {}).typeId || '';
  var max = S.settings.cardBatchMax || 25;
  $('main').innerHTML = head('Without card', '<span id="nSub">Loading…</span>', isMgr() ? '<select class="inp" id="nScope" style="width:200px">' + staffOptions(N.scope, true) + '</select>' : '') +
    '<div class="row wrap" style="margin:14px 0"><div class="pills"><span class="pill" data-t="">All</span><span class="pill" data-t="New lead">New lead</span><span class="pill" data-t="Healthy">Healthy</span><span class="pill" data-t="Chronic">Chronic</span></div><span class="sp"></span>' +
    '<div style="width:230px">' + cardTypeSelect('nType', N.typeId) + '</div><button class="btn ghost" id="nFirst">Select first ' + max + '</button><button class="btn" id="nGen" disabled>Generate cards</button></div>' +
    '<div id="nRes"></div><div class="card flush" id="nL"><div class="loading"><span class="spin"></span></div></div>';
  document.querySelectorAll('[data-t]').forEach(function(p){ p.classList.toggle('on', p.getAttribute('data-t') === N.type); p.onclick = function(){ N.type = p.getAttribute('data-t'); N.sel = {}; PAGES.nocard(); }; });
  $('nType').onchange = function(){ N.typeId = this.value; };
  if($('nScope')) $('nScope').onchange = function(){ N.scope = this.value; N.sel = {}; PAGES.nocard(); };
  $('nFirst').onclick = function(){ N.sel = {}; N.rows.slice(0, max).forEach(function(p){ if(p.name) N.sel[p.patientId] = 1; }); nPaint(); };
  $('nGen').onclick = nGenerate;
  if(N.results) nResults();
  api('withoutCard', {opts:{type:N.type, scope:N.scope}}).then(function(r){
    if(S.page !== 'nocard') return;
    if(!r.ok){ $('nL').innerHTML = '<div class="empty">' + esc(r.error) + '</div>'; return; }
    N.rows = r.rows; N.total = r.total;
    $('nSub').innerHTML = '<b>' + r.total + '</b> active patients have no membership card. Generate up to ' + max + ' at once — cards are issued by the MIS, then sent on WhatsApp.';
    nPaint();
  });
};
function nPaint(){
  var n = Object.keys(N.sel).length, max = S.settings.cardBatchMax || 25;
  $('nGen').disabled = !n || !N.typeId; $('nGen').textContent = n ? 'Generate ' + n + ' card' + (n > 1 ? 's' : '') : 'Generate cards';
  if(!N.rows.length){ $('nL').innerHTML = '<div class="empty">Every patient here has a membership card. 🎉</div>'; return; }
  $('nL').innerHTML = '<div class="tw"><table><tr><th style="width:36px"></th><th>Patient</th><th>Mobile</th><th>Type</th><th>Area</th><th>CRM</th><th>Added</th></tr>' + N.rows.map(function(p){
    return '<tr><td><input type="checkbox" data-id="' + p.patientId + '"' + (N.sel[p.patientId] ? ' checked' : '') + (p.name ? '' : ' disabled title="Add the name first"') + ' style="width:18px;height:18px;accent-color:var(--red)"></td>' +
      '<td><b>' + esc(p.name || '— no name —') + '</b></td><td>' + esc(p.mobile) + '</td><td>' + tag(p.type) + '</td><td>' + esc(p.area) + '</td><td>' + esc(p.assignedName) + '</td><td>' + fd(p.createdAt) + '</td></tr>';
  }).join('') + '</table></div>';
  $('nL').querySelectorAll('[data-id]').forEach(function(c){ c.onchange = function(){
    var id = c.getAttribute('data-id');
    if(c.checked){ if(Object.keys(N.sel).length >= max){ c.checked = false; toast('At most ' + max + ' at once.', true); return; } N.sel[id] = 1; } else delete N.sel[id];
    nPaint(); }; });
}
function nGenerate(){
  var ids = Object.keys(N.sel), btn = $('nGen');
  ask('Generate ' + ids.length + ' membership cards?', 'Card type: <b>' + esc(($('nType').selectedOptions[0] || {}).textContent || '') + '</b>. Numbers are issued by the MIS for branch <b>' + esc(branch().name) + '</b>.', 'Generate').then(function(y){
    if(!y) return;
    busy(btn, true, 'Issuing ' + ids.length + ' cards…');
    api('issueCards', {patientIds:ids, typeId:N.typeId}).then(function(r){
      busy(btn, false);
      if(!r.ok){ toast(r.error, true); return; }
      N.results = r.results; N.sel = {}; PAGES.nocard();
    });
  });
}
function nResults(){
  var ok = N.results.filter(function(x){ return x.ok; });
  $('nRes').innerHTML = '<div class="card flush" style="margin-bottom:16px"><div class="card-h"><b style="color:var(--ok)">✓ ' + ok.length + ' card' + (ok.length === 1 ? '' : 's') + ' ready — numbers come from the MIS card register · send each on WhatsApp</b><span class="sp"></span><button class="btn ghost sm" id="nResX">Hide</button></div>' +
    '<div class="tw"><table><tr><th>Patient</th><th>Mobile</th><th>Type</th><th>Card no.</th><th>Card</th><th></th></tr>' + N.results.map(function(x){
      return '<tr><td><b>' + esc(x.name || '') + '</b></td><td>' + esc(x.mobile || '') + '</td><td>' + tag(x.type) + '</td>' +
        (x.ok ? '<td><span class="tag t-card" style="font-size:13px">' + esc(x.cardNo) + '</span>' + (x.existing ? ' <span class="small muted">(already had it)</span>' : '') + '</td><td class="sub">' + esc(x.typeName) + (x.validTill ? ' · valid till ' + dmy(x.validTill) : '') + '</td>' +
          '<td class="n"><a class="btn green sm" target="_blank" rel="noopener" href="' + waLink(x.mobile, cardText({name:x.name}, x)) + '">WhatsApp Send</a></td>'
        : '<td colspan="3"><span class="tag t-bad">' + esc(x.error) + '</span></td>') + '</tr>';
    }).join('') + '</table></div></div>';
  $('nResX').onclick = function(){ N.results = null; $('nRes').innerHTML = ''; };
}

/* ================================================================== ADD PATIENT (single + bulk) */
var A = {tab:'single', type:'New lead', check:null, giveCard:false, B:null};
PAGES.add = function(){
  $('main').innerHTML = head('Add patients', 'Add one patient after the feedback call, or upload a list from a camp / purchased data.') +
    '<div class="tabs"><span data-tab="single">Single patient</span><span data-tab="bulk">Bulk upload</span></div><div id="aBody"></div>';
  document.querySelectorAll('[data-tab]').forEach(function(t){ t.classList.toggle('on', t.getAttribute('data-tab') === A.tab); t.onclick = function(){ A.tab = t.getAttribute('data-tab'); PAGES.add(); }; });
  if(A.tab === 'single') aSingle(); else bForm();
};
function assignSelect(id){
  if(!isMgr()) return '<select class="inp" id="' + id + '" disabled><option value="">Me (' + esc(S.me.name) + ')</option></select>';
  return '<select class="inp" id="' + id + '">' + staffOptions('mine', false).replace('value="mine"', 'value=""') + '</select>';
}
function aSingle(){
  var srcs = S.sources.filter(function(s){ return s !== 'Cold data'; });
  $('aBody').innerHTML = '<div class="row" style="align-items:flex-start;gap:18px;flex-wrap:wrap"><div class="card" style="flex:1;min-width:300px"><div id="aMsg"></div>' +
    '<div class="grid2"><div class="field"><label>Mobile *</label><input id="aMob" inputmode="numeric" maxlength="14" placeholder="10-digit mobile"></div><div class="field"><label>Patient name *</label><input id="aName"></div></div>' +
    '<div id="aCheck"></div>' +
    '<div class="field"><label>Patient type *</label><div class="typebtns" id="aTypes"></div></div>' +
    '<div class="grid2"><div class="field"><label>Gender</label><select id="aGen"><option value="">—</option><option>Female</option><option>Male</option><option>Other</option></select></div><div class="field"><label>Age</label><input id="aAge" inputmode="numeric" maxlength="3"></div>' +
    '<div class="field"><label>Source</label><select id="aSrc">' + srcs.map(function(s){ return opt(s, s, 'Walk-in'); }).join('') + '</select></div><div class="field"><label>Detail (doctor / referrer / camp)</label><input id="aDet"></div>' +
    '<div class="field"><label>Area / society</label><input id="aArea"></div><div class="field"><label>Visit date</label><input type="date" id="aVd" max="' + today() + '" value="' + today() + '"></div>' +
    '<div class="field"><label>Assign to CRM</label>' + assignSelect('aAsg') + '</div><div class="field"><label>Existing card no. (if any)</label><input id="aCard" placeholder="Auto-filled from MIS if found"></div></div>' +
    '<div class="field"><label>Feedback call note</label><textarea id="aNote" placeholder="e.g. Report collected, happy with service."></textarea></div>' +
    '<label class="row" style="font-size:14px;cursor:pointer;margin-bottom:10px"><input type="checkbox" id="aGive" style="width:18px;height:18px;accent-color:var(--red)"> Give membership card now <span class="muted">(issued by MIS)</span></label><div id="aGiveT" class="field hidden">' + cardTypeSelect('aCT', '') + '</div>' +
    '<div class="row wrap"><span class="sp"></span><button class="btn ghost" id="aSave2">Save &amp; add another</button><button class="btn" id="aSave">Save patient</button></div></div>' +
    '<div style="width:340px;max-width:100%"><div class="card"><b>Next call</b><div style="font-size:30px;font-weight:700;margin:6px 0" id="aNext"></div><div class="sub" id="aNextS"></div></div>' +
    '<div class="card" style="margin-top:14px"><b>Rules</b><div class="sub" style="line-height:1.7;margin-top:6px">' + S.types.map(function(t){ return esc(t) + ' → call after ' + (S.recall[t] || 3) + ' months.'; }).join('<br>') +
    '<br>If the mobile already exists, the old funnel closes and a new one starts from the visit date. Call history is kept.<br>Numbers blocked on the do-not-call list are refused.</div></div></div></div>';
  function types(){ $('aTypes').innerHTML = S.types.map(function(t){ return '<button type="button" data-ty="' + esc(t) + '" class="' + (A.type === t ? 'sel' : '') + '"><span class="dot d-' + tcls(t) + '"></span> ' + esc(t) + ' · ' + (S.recall[t] || 3) + 'm</button>'; }).join('');
    $('aTypes').querySelectorAll('[data-ty]').forEach(function(b){ b.onclick = function(){ A.type = b.getAttribute('data-ty'); types(); nextCall(); }; }); }
  function nextCall(){ var vd = $('aVd').value || today(), rc = S.recall[A.type] || 3; $('aNext').textContent = fdy(addMonths(vd, rc)); $('aNextS').textContent = rc + ' months after visit on ' + fd(vd); }
  types(); nextCall();
  $('aVd').onchange = nextCall;
  $('aGive').onchange = function(){ $('aGiveT').classList.toggle('hidden', !this.checked); };
  var lastChecked = '';
  $('aMob').oninput = function(){
    var m = m10(this.value);
    if(!m){ $('aCheck').innerHTML = ''; lastChecked = ''; A.check = null; return; }
    if(m === lastChecked) return; lastChecked = m;
    $('aCheck').innerHTML = '<div class="msg info"><span class="spin"></span> Checking this number…</div>';
    api('checkMobile', {mobile:m}).then(function(r){
      if(m10($('aMob').value) !== m) return;
      A.check = r.ok ? r : null; var h = '';
      if(!r.ok){ $('aCheck').innerHTML = ''; return; }
      if(r.here){ var p = r.here;
        h += '<div class="msg warn"><b>Already a patient:</b> ' + esc(p.name || 'No name') + ' · ' + esc(p.type) + (p.nextCall ? ' · next call ' + fd(p.nextCall) : '') + (p.assignedName ? ' · ' + esc(p.assignedName) : '') + (p.status === 'blocked' ? ' · <b>BLOCKED</b>' : '') +
          '.<br>Saving will <b>close the old funnel and start a new one</b> from the visit date. History is kept.</div>';
        if(!$('aName').value) $('aName').value = p.name || ''; if(!$('aArea').value) $('aArea').value = p.area || '';
        if(p.type){ A.type = p.type; types(); nextCall(); } }
      if(r.otherBranches && r.otherBranches.length) h += '<div class="msg info">Also a patient at <b>' + r.otherBranches.map(function(b){ return esc(b.name); }).join(', ') + '</b>.</div>';
      if(r.dnc) h += /^Blocked/.test(r.dnc) ? '<div class="msg error">On the do-not-call list: ' + esc(r.dnc) + '. It cannot be added.</div>' : '<div class="msg warn">Was marked “' + esc(r.dnc) + '”. Saving makes them a patient and removes that mark.</div>';
      if(r.card){ h += '<div class="msg ok">Has MIS membership card <b>' + esc(r.card.cardNumber) + '</b> (' + esc(r.card.typeName) + (r.card.expiryDate ? ', valid till ' + dmy(r.card.expiryDate) : '') + ').</div>'; $('aCard').value = r.card.cardNumber; }
      $('aCheck').innerHTML = h;
    });
  };
  function save(again, btn){
    var d = {mobile:$('aMob').value, name:$('aName').value.trim(), type:A.type, gender:$('aGen').value, age:$('aAge').value.trim(), source:$('aSrc').value, sourceDetail:$('aDet').value.trim(),
      area:$('aArea').value.trim(), visitDate:$('aVd').value, assignTo:$('aAsg').value, cardNo:$('aCard').value.trim(), note:$('aNote').value.trim(), giveCard:$('aGive').checked, cardTypeId:$('aCT') ? $('aCT').value : ''};
    if(!m10(d.mobile)){ toast('Enter a valid 10-digit mobile number.', true); $('aMob').focus(); return; }
    if(!d.name){ toast('Enter the patient name.', true); $('aName').focus(); return; }
    busy(btn, true);
    api('addPatient', {data:d}).then(function(r){
      busy(btn, false);
      if(!r.ok){ $('aMsg').innerHTML = '<div class="msg error">' + esc(r.error) + '</div>'; return; }
      var p = r.patient, msg = (r.existed ? 'New funnel started for ' : 'Saved ') + esc(p.name) + ' (' + esc(p.type) + '). Next call <b>' + fdy(p.nextCall) + '</b>.' +
        (r.card ? (r.card.ok ? ' Card <b>' + esc(r.card.cardNo) + '</b> issued.' : ' Card not issued: ' + esc(r.card.error)) : (p.cardNo ? ' Card ' + esc(p.cardNo) + '.' : ''));
      toast((r.existed ? 'New funnel started' : 'Patient saved') + '.');
      aSingle();
      $('aMsg').innerHTML = '<div class="msg ok">✓ ' + msg + (r.card && r.card.ok ? ' <a target="_blank" rel="noopener" href="' + waLink(p.mobile, cardText(p, r.card)) + '"><b>WhatsApp the card number</b></a>' : '') + '</div>';
      if(again) $('aMob').focus();
    });
  }
  $('aSave').onclick = function(){ save(false, this); };
  $('aSave2').onclick = function(){ save(true, this); };
}

/* ---------- bulk upload ---------- */
var COLS = [['mobile',/mob|phone|contact|number|cell|whats/i],['name',/name|patient/i],['type',/type|category|tag|group/i],['area',/area|society|locality|address|location|village|city/i],
            ['gender',/gender|sex/i],['age',/^age|age$/i],['visitDate',/visit|date/i],['cardNo',/card/i]];
function mapHeader(row){
  var map = {}, used = {};
  COLS.forEach(function(c){ for(var j = 0; j < row.length; j++){ if(used[j]) continue; if(c[1].test(String(row[j] || ''))){ map[c[0]] = j; used[j] = 1; return; } } });
  return map;
}
function parseRows(grid, label){
  grid = grid.filter(function(r){ return r && r.some(function(x){ return String(x == null ? '' : x).trim(); }); });
  if(!grid.length) return null;
  var map = mapHeader(grid[0]), body = grid.slice(1), found = [];
  if(map.mobile == null){
    var mc = -1; grid[0].forEach(function(x, j){ if(mc < 0 && m10(x)) mc = j; });
    if(mc < 0) return {error:'No Mobile column found. Name a column “Mobile” (or Phone).'};
    map = {mobile:mc}; if(grid[0].length > 1) map.name = mc === 0 ? 1 : 0; body = grid;
  } else Object.keys(map).forEach(function(k){ found.push('<b>' + k + '</b> ← “' + esc(grid[0][map[k]]) + '”'); });
  var seen = {}, rows = body.map(function(r, i){
    var o = {_n:i + (body === grid ? 1 : 2)}; Object.keys(map).forEach(function(k){ o[k] = String(r[map[k]] == null ? '' : r[map[k]]).trim(); });
    if(o.visitDate && /^\d{5}$/.test(o.visitDate)){ var d = new Date(Math.round((+o.visitDate - 25569) * 86400000)); o.visitDate = ymdLocal(d); }
    var m = m10(o.mobile); o._st = !m ? 'bad' : (seen[m] ? 'dup' : 'ok'); if(m) seen[m] = 1;
    return o;
  });
  return {rows:rows, label:label, found:found};
}
function parseCSV(text){
  var sep = (text.split('\n')[0].match(/\t/) ? '\t' : ((text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ','));
  var out = [], row = [], cur = '', q = false;
  for(var i = 0; i < text.length; i++){
    var ch = text[i];
    if(q){ if(ch === '"'){ if(text[i + 1] === '"'){ cur += '"'; i++; } else q = false; } else cur += ch; }
    else if(ch === '"') q = true;
    else if(ch === sep){ row.push(cur); cur = ''; }
    else if(ch === '\n'){ row.push(cur.replace(/\r$/, '')); out.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if(cur || row.length){ row.push(cur.replace(/\r$/, '')); out.push(row); }
  return out;
}
function loadXlsx(){
  return new Promise(function(res, rej){
    if(window.XLSX) return res(window.XLSX);
    var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = function(){ res(window.XLSX); }; s.onerror = function(){ rej(new Error('Could not load the Excel reader. Save the file as CSV and try again.')); };
    document.head.appendChild(s);
  });
}
function readFile(file){
  if(/\.csv$|\.txt$/i.test(file.name)) return file.text().then(function(t){ return parseCSV(t.replace(/^﻿/, '')); });
  return loadXlsx().then(function(X){ return file.arrayBuffer().then(function(buf){ var wb = X.read(buf, {type:'array'}); return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, raw:false, defval:''}); }); });
}
function bForm(){
  var B = A.B || (A.B = {target:'patients', type:'Healthy', source:'Camp', detail:'', coldSource:'', vd:today(), parsed:null, result:null});
  var pat = B.target === 'patients';
  $('aBody').innerHTML = '<div class="card"><div class="grid4">' +
    '<div class="field"><label>Upload goes to</label><select id="bT">' + opt('patients', 'Patients (camp / walk-in / old data)', B.target) + opt('cold', 'Cold data pool (purchased numbers)', B.target) + '</select></div>' +
    (pat ? '<div class="field"><label>Default type</label><select id="bTy">' + S.types.map(function(t){ return opt(t, t, B.type); }).join('') + '</select></div>' +
      '<div class="field"><label>Source</label><select id="bSrc">' + S.sources.filter(function(s){ return s !== 'Cold data'; }).map(function(s){ return opt(s, s, B.source); }).join('') + '</select></div>' +
      '<div class="field"><label>Camp / society / detail</label><input id="bDet" placeholder="e.g. Shanti Park" value="' + esc(B.detail) + '"></div>' +
      '<div class="field"><label>Visit date</label><input type="date" id="bVd" max="' + today() + '" value="' + esc(B.vd) + '"></div><div class="field"><label>Assign to CRM</label>' + assignSelect('bAsg') + '</div>'
    : '<div class="field" style="grid-column:span 2"><label>Data source (who sold / gave the numbers)</label><input id="bCs" placeholder="e.g. DataVendor A, JustDial leads" value="' + esc(B.coldSource) + '"></div>') +
    '</div>' +
    '<div class="drop" id="bDrop"><b style="font-size:16px">Drop an Excel or CSV file here</b><div class="sub" style="margin:6px 0 12px">Needs a Mobile column. Optional: Name' + (pat ? ', Type, Area/Society, Gender, Age, Visit date, Card no.' : ', Area.') + '</div>' +
    '<label class="btn ghost">Choose file<input type="file" id="bFile" accept=".csv,.xlsx,.xls,.txt" class="hidden"></label></div>' +
    '<details' + (B.parsed ? '' : ' open') + '><summary style="font-weight:600;cursor:pointer;margin-bottom:8px">…or paste rows from Excel</summary><textarea class="inp" id="bPaste" style="font-family:monospace;height:110px" placeholder="Mobile\tName\tType\tSociety"></textarea>' +
    '<button class="btn ghost" id="bRead" style="margin-top:8px">Read pasted rows</button></details><div id="bPrev"></div></div>';
  $('bT').onchange = function(){ B.target = this.value; B.parsed = null; B.result = null; bForm(); };
  if($('bTy')) $('bTy').onchange = function(){ B.type = this.value; };
  if($('bSrc')) $('bSrc').onchange = function(){ B.source = this.value; };
  if($('bDet')) $('bDet').oninput = function(){ B.detail = this.value; };
  if($('bVd')) $('bVd').onchange = function(){ B.vd = this.value; };
  if($('bCs')) $('bCs').oninput = function(){ B.coldSource = this.value; };
  function take(p){ if(!p){ toast('Nothing found to read.', true); return; } if(p.error){ toast(p.error, true); return; } B.parsed = p; B.result = null; bPreview(); }
  $('bFile').onchange = function(){ var f = this.files[0]; if(!f) return; readFile(f).then(function(g){ take(parseRows(g, f.name)); }).catch(function(e){ toast(e.message, true); }); };
  var dz = $('bDrop');
  dz.ondragover = function(e){ e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = function(){ dz.classList.remove('over'); };
  dz.ondrop = function(e){ e.preventDefault(); dz.classList.remove('over'); var f = e.dataTransfer.files[0]; if(f) readFile(f).then(function(g){ take(parseRows(g, f.name)); }).catch(function(er){ toast(er.message, true); }); };
  $('bRead').onclick = function(){ var t = $('bPaste').value; if(!t.trim()) return; take(parseRows(t.split(/\r?\n/).map(function(l){ return l.split('\t'); }), 'pasted rows')); };
  if(B.parsed) bPreview();
}
function bPreview(){
  var B = A.B, p = B.parsed, ok = p.rows.filter(function(r){ return r._st === 'ok'; }).length, skip = p.rows.length - ok, pat = B.target === 'patients';
  var cols = ['mobile','name'].concat(pat ? ['type','area','gender','age','visitDate','cardNo'] : ['area']).filter(function(k){ return k === 'mobile' || p.rows.some(function(r){ return r[k]; }); });
  var st = {ok:'<span class="tag t-ok">OK</span>', bad:'<span class="tag t-bad">Bad mobile</span>', dup:'<span class="tag t-warn">Duplicate in file</span>'};
  var res = B.result;
  $('bPrev').innerHTML = '<div class="msg warn" style="margin-top:14px"><b>' + esc(p.label) + ':</b> ' + p.rows.length + ' rows · ' + ok + ' valid mobiles' + (skip ? ' · ' + skip + ' will be skipped' : '') + (p.found.length ? '. Columns found: ' + p.found.join(', ') : '') + '</div>' +
    '<div class="tw" style="max-height:380px;overflow:auto;border:1px solid var(--line);border-radius:12px"><table><tr><th>#</th>' + cols.map(function(c){ return '<th>' + c + '</th>'; }).join('') + '<th>Check</th></tr>' +
    p.rows.slice(0, 200).map(function(r){ return '<tr class="' + (r._st === 'ok' ? '' : 'bad') + '"><td class="muted">' + r._n + '</td>' + cols.map(function(c){ return '<td>' + esc(r[c] || '') + '</td>'; }).join('') + '<td>' + st[r._st] + '</td></tr>'; }).join('') +
    (p.rows.length > 200 ? '<tr><td colspan="9" class="muted">…and ' + (p.rows.length - 200) + ' more rows</td></tr>' : '') + '</table></div>' +
    '<div class="row" style="margin-top:14px"><button class="btn" id="bGo"' + (ok && !res ? '' : ' disabled') + '>' + (pat ? 'Upload ' + ok + ' patients' : 'Add ' + ok + ' numbers to the cold pool') + '</button>' +
    '<div class="bar" style="flex:1;height:10px;margin:0"><i id="bBar" style="width:' + (res ? 100 : 0) + '%"></i></div><span class="small muted" id="bProg"></span></div>' +
    (res ? '<div class="kpis" style="margin-bottom:0">' + Object.keys(res).map(function(k){
      var L = {added:pat ? 'Added' : 'Added to pool', existing:'Existing → new funnel', dnc:'Do-not-call', duplicates:'Duplicates', bad:'Bad mobile', alreadyPatient:'Already a patient', alreadyInPool:'Already in pool', cardsFound:'MIS cards found'};
      return kpi(L[k] || k, res[k], '', {color:k === 'added' ? 'var(--ok)' : (k === 'bad' ? 'var(--red)' : '')}); }).join('') + '</div>' : '');
  var go2 = $('bGo'); if(go2) go2.onclick = bUpload;
}
function bUpload(){
  var B = A.B, pat = B.target === 'patients', rows = B.parsed.rows.filter(function(r){ return r._st === 'ok'; }).map(function(r){ var o = {}; Object.keys(r).forEach(function(k){ if(k[0] !== '_') o[k] = r[k]; }); return o; });
  if(!pat && !String(B.coldSource || '').trim()){ toast('Write the data source (who gave the numbers).', true); $('bCs').focus(); return; }
  var def = pat ? {type:B.type, source:B.source, sourceDetail:B.detail, visitDate:B.vd, assignTo:$('bAsg') ? $('bAsg').value : ''} : {source:B.coldSource.trim()};
  var btn = $('bGo'), total = {}, i = 0, CH = 500;
  busy(btn, true, 'Uploading…');
  function next(){
    if(i >= rows.length){
      busy(btn, false); B.result = total; bPreview();
      toast('Upload finished.'); return;
    }
    var part = rows.slice(i, i + CH);
    $('bProg').textContent = Math.min(i + CH, rows.length) + ' / ' + rows.length;
    api('bulkUpload', {target:B.target, rows:part, defaults:def}).then(function(r){
      if(!r.ok){ busy(btn, false); toast(r.error + ' (stopped at row ' + (i + 1) + ')', true); return; }
      Object.keys(r.counts).forEach(function(k){ total[k] = (total[k] || 0) + r.counts[k]; });
      i += CH; $('bBar').style.width = Math.round(Math.min(i, rows.length) * 100 / rows.length) + '%';
      next();
    });
  }
  next();
}

/* ================================================================== BULK MESSAGE (the CRM's own system) */
var M = {meta:null, tpl:'', f:{type:'', due:'7d', card:'any', source:'', area:''}, time:'10:00', limit:'', params:[], header:'', mode:'filter', rows:null, prev:null, tab:'all', list:[]};
var MSTAT = {draft:['Draft','t-nc'], scheduled:['Scheduled','t-New'], in_progress:['Sending','t-ok'], paused:['Paused','t-warn'], completed:['Completed','t-ok'], cancelled:['Cancelled','t-bad']};
PAGES.bulk = function(){
  $('main').innerHTML = head('Bulk Message Send', 'Send one approved WhatsApp template to a list of CRM patients, for one branch and filter, on a daily schedule.',
    '<button class="btn ghost" id="mExp">Export History</button>') +
    '<div class="kpis" id="mK"></div><div class="card" id="mSet"><div class="loading"><span class="spin"></span></div></div>' +
    '<div class="card flush" style="margin-top:18px"><div class="card-h"><b style="font-size:19px">Campaign History</b><span class="sp"></span><div class="pills" id="mTabs">' +
    [['all','All'],['pending','Pending'],['sent','Sent'],['scheduled','Scheduled']].map(function(t){ return '<span class="pill' + (M.tab === t[0] ? ' on' : '') + '" data-mt="' + t[0] + '">' + t[1] + '</span>'; }).join('') +
    '</div></div><div id="mH"><div class="loading"><span class="spin"></span></div></div></div>';
  document.querySelectorAll('[data-mt]').forEach(function(p){ p.onclick = function(){ M.tab = p.getAttribute('data-mt'); document.querySelectorAll('[data-mt]').forEach(function(x){ x.classList.toggle('on', x === p); }); mHist(); }; });
  $('mExp').onclick = mExport;
  api('msgMeta').then(function(r){
    if(S.page !== 'bulk') return;
    if(!r.ok){ $('mSet').innerHTML = '<div class="empty">' + esc(r.error) + '</div>'; return; }
    M.meta = r; if(!M.tpl && r.templates.length) M.tpl = r.templates[0].name;
    mKpis(); mSetup(); mPreview();
  });
  mHist();
};
function tplOf(n){ var t = null; ((M.meta || {}).templates || []).forEach(function(x){ if(x.name === n) t = x; }); return t; }
function mKpis(){
  var r = M.meta, q = r.quota, used = q.used || 0, cap = q.cap || 250;
  $('mK').innerHTML = kpi('Leads in queue', r.kpis.inQueue, 'waiting in this branch’s campaigns', {color:'var(--red)'}) + kpi('Sent today', r.kpis.sentToday, r.kpis.sentToday ? 'by CRM campaigns' : 'no batch yet today', {color:'var(--ok)'}) +
    kpi('Pending in queue', r.kpis.pendingAfterToday, r.kpis.pendingAfterToday ? 'goes out on the next days' : 'queue fits in today', {color:'#c98a00'}) +
    '<div class="kpi row" style="gap:14px"><div class="ring" style="background:conic-gradient(var(--red) ' + pct(used, cap) + '%,#eee 0)"><div>' + used + '/' + cap + '</div></div><div><div class="l">Today’s daily limit</div><b>' + pct(used, cap) + '% used</b><div class="h">shared with MIS · resets 12:00 AM' + (q.hasKey === false ? '<br><span style="color:var(--red)">No WhatsApp key for this branch in the MIS</span>' : '') + '</div></div></div>';
}
function mSetup(){
  var r = M.meta, t = tplOf(M.tpl), np = t ? Math.max(0, t.paramCount - 2) : 0, hdr = t ? t.headerType : 'none', fl = M.mode === 'filter';
  var hints = t && t.paramHints ? String(t.paramHints).split(/\s*[|,;]\s*/) : [];
  while(M.params.length < np){
    var h = String(hints[M.params.length + 2] || '').toLowerCase();
    M.params.push(/date|due|when/.test(h) ? '{due}' : /test|package|pitch|check/.test(h) ? '{test}' : /contact|phone|number|mobile/.test(h) ? '{phone}' : /card/.test(h) ? '{card}' : /type/.test(h) ? '{type}' : '');
  }
  $('mSet').innerHTML = '<div style="font-size:20px;font-weight:700">Campaign Setup</div><div class="sub" style="margin-bottom:14px">Choose who gets the message, which template, and when it should go out.</div>' +
    '<div class="grid5"><div class="field"><label>Branch</label><input value="' + esc(branch().name) + '" disabled></div>' +
    '<div class="field"><label>Template</label><select id="mTpl">' + (r.templates.length ? r.templates.map(function(x){ return opt(x.name, x.name, M.tpl); }).join('') : '<option value="">No templates in the MIS</option>') + '</select></div>' +
    '<div class="field"><label>Patient type</label><select id="mTy" ' + (fl ? '' : 'disabled') + '>' + opt('', 'All Tags', M.f.type) + S.types.map(function(x){ return opt(x, x, M.f.type); }).join('') + '</select></div>' +
    '<div class="field"><label>Send Time</label><input type="time" id="mTime" value="' + esc(M.time) + '"></div>' +
    '<div class="field"><label>Daily Limit</label><input id="mLim" inputmode="numeric" placeholder="' + ((r.quota || {}).cap || 250) + ' / day (default)" value="' + esc(M.limit) + '"></div></div>' +
    (fl ? '<div class="grid4"><div class="field"><label>Follow-up</label><select id="mDue">' + opt('7d', 'Due in next 7 days', M.f.due) + opt('overdue', 'Overdue', M.f.due) + opt('today', 'Due today', M.f.due) + opt('30d', 'Due in next 30 days', M.f.due) + opt('any', 'Any time', M.f.due) + '</select></div>' +
      '<div class="field"><label>Membership card</label><select id="mCard">' + opt('any', 'Any', M.f.card) + opt('with', 'Has a card', M.f.card) + opt('without', 'No card', M.f.card) + '</select></div>' +
      '<div class="field"><label>Source</label><select id="mSrc">' + opt('', 'All sources', M.f.source) + r.sources.map(function(x){ return opt(x, x, M.f.source); }).join('') + '</select></div>' +
      '<div class="field"><label>Area / society</label><select id="mArea">' + opt('', 'All areas', M.f.area) + r.areas.map(function(x){ return opt(x, x, M.f.area); }).join('') + '</select></div></div>'
    : '<div class="field"><label>Paste rows from Excel (Mobile, Name)</label><textarea class="inp" id="mRows" style="font-family:monospace;height:96px" placeholder="9825012345\tRamesh Patel"></textarea><button class="btn ghost sm" id="mRead" style="margin-top:6px">Read rows</button></div>') +
    (np || ['image','video','document'].indexOf(hdr) >= 0 ? '<div class="grid3">' + (['image','video','document'].indexOf(hdr) >= 0 ? '<div class="field"><label>Header ' + hdr + ' link (public URL)</label><input id="mHdr" value="' + esc(M.header) + '" placeholder="https://…"></div>' : '') +
      M.params.slice(0, np).map(function(v, i){ return '<div class="field"><label>{{' + (i + 3) + '}} ' + esc(hints[i + 2] || '') + '</label><input data-pi="' + i + '" value="' + esc(v) + '"></div>'; }).join('') + '</div>' +
      '<div class="small muted" style="margin:-6px 0 8px">Per-patient words you can use: {due} next call date · {test} suggested test · {type} · {card} card no. · {phone} branch contact · {area}</div>' : '') +
    '<div class="msg ok" id="mBox" style="margin-top:6px"></div>' +
    '<div class="row wrap" style="border-top:1px solid var(--line);padding-top:14px;margin-top:6px"><div class="sub" id="mSched"></div><span class="sp"></span>' +
    '<a href="#" id="mMode" class="small" style="margin-right:6px">' + (fl ? 'or Upload Excel instead' : 'or pick CRM patients instead') + '</a>' +
    '<button class="btn ghost" id="mDraft">Save as Draft</button><button class="btn" id="mStart">Start Campaign</button></div>';
  function sched(){ var lim = +M.limit || (r.quota || {}).cap || 250; $('mSched').innerHTML = 'Scheduled for <b style="color:var(--ink)">' + hm12(M.time) + '</b> — auto-sends the next <b style="color:var(--ink)">' + lim + '</b> leads daily until the queue is cleared.'; }
  sched();
  $('mTpl').onchange = function(){ M.tpl = this.value; M.params = []; mSetup(); mBox(); };
  $('mTime').onchange = function(){ M.time = this.value; sched(); };
  $('mLim').oninput = function(){ M.limit = this.value.replace(/\D/g, ''); sched(); };
  var refresh = debounce(mPreview, 300);
  [['mTy','type'],['mDue','due'],['mCard','card'],['mSrc','source'],['mArea','area']].forEach(function(x){ var el = $(x[0]); if(el) el.onchange = function(){ M.f[x[1]] = this.value; refresh(); }; });
  document.querySelectorAll('[data-pi]').forEach(function(i){ i.oninput = function(){ M.params[+i.getAttribute('data-pi')] = i.value; }; });
  if($('mHdr')) $('mHdr').oninput = function(){ M.header = this.value.trim(); };
  if($('mRead')) $('mRead').onclick = function(){
    var p = parseRows($('mRows').value.split(/\r?\n/).map(function(l){ return l.split('\t'); }), 'pasted rows');
    if(!p || p.error){ toast(p ? p.error : 'Nothing to read.', true); return; }
    M.rows = p.rows.filter(function(x){ return x._st === 'ok'; }).map(function(x){ return {mobile:x.mobile, name:x.name || ''}; });
    M.prev = {match:M.rows.length, skipDnc:0, skipBad:p.rows.length - M.rows.length}; mBox();
  };
  $('mMode').onclick = function(e){ e.preventDefault(); M.mode = fl ? 'excel' : 'filter'; M.rows = null; M.prev = null; mSetup(); if(M.mode === 'filter') mPreview(); else mBox(); };
  $('mDraft').onclick = function(){ mSave(false, this); };
  $('mStart').onclick = function(){ mSave(true, this); };
  mBox();
}
function mBox(){
  var t = tplOf(M.tpl), b = $('mBox'); if(!b) return;
  if(!t){ b.className = 'msg warn'; b.innerHTML = 'No WhatsApp template available. Templates are added in the MIS (WhatsApp Templates).'; return; }
  b.className = 'msg ok';
  var v = '<b>{{1}} branch name · {{2}} patient name</b>' + (t.paramCount > 2 ? ' · {{3}}… as set above' : '');
  var p = M.prev;
  b.innerHTML = '✓ <b>' + esc(t.name) + '</b> — nothing else to fill per patient. Each patient gets THEIR OWN values: ' + v + '<br>' +
    (p ? '<b>' + p.match + ' patients</b> ' + (M.mode === 'filter' ? 'match' : 'read') + (p.skipDnc ? ' · ' + p.skipDnc + ' on the do-not-call list skipped automatically' : '') + (p.skipBad ? ' · ' + p.skipBad + ' bad mobiles skipped' : '') : (M.mode === 'filter' ? '<span class="spin"></span> counting…' : 'Paste rows and press Read rows.'));
}
function mPreview(){
  if(M.mode !== 'filter') return;
  M.prev = null; mBox();
  api('msgPreview', {filter:M.f}).then(function(r){ if(r.ok){ M.prev = r; mBox(); } });
}
function mSave(start, btn){
  var t = tplOf(M.tpl);
  if(!t){ toast('Pick a template.', true); return; }
  if(M.mode === 'excel' && !(M.rows && M.rows.length)){ toast('Paste rows and press Read rows first.', true); return; }
  if(M.prev && !M.prev.match){ toast('No patients match this filter.', true); return; }
  busy(btn, true);
  api('msgSave', {data:{branchId:S.branchId, templateName:M.tpl, params:M.params.slice(0, Math.max(0, t.paramCount - 2)), headerMediaUrl:M.header, sendTime:M.time, dailyLimit:+M.limit || 0,
    start:start, useFilter:M.mode === 'filter', filter:M.f, rows:M.mode === 'excel' ? M.rows : null}}).then(function(r){
    busy(btn, false);
    if(!r.ok){ toast(r.error, true); return; }
    toast(r.campaign.code + ' ' + (start ? 'started' : 'saved as draft') + ' with ' + r.counts.added + ' leads.');
    M.rows = null; PAGES.bulk();
  });
}
function mHist(){
  api('msgList', {tab:M.tab}).then(function(r){
    if(S.page !== 'bulk') return;
    if(!r.ok){ $('mH').innerHTML = '<div class="empty">' + esc(r.error) + '</div>'; return; }
    M.list = r.rows;
    if(!r.rows.length){ $('mH').innerHTML = '<div class="empty">No campaigns yet.</div>'; return; }
    $('mH').innerHTML = '<div class="tw"><table><tr><th>Code</th><th>Template</th><th>Branch</th><th>Tag</th><th>Time</th><th>Leads</th><th>Status</th><th>Date</th><th></th></tr>' + r.rows.map(function(c){
      var s = MSTAT[c.status] || [c.status, 't-nc'], acts = ['View','+ Leads'];
      if(c.status === 'draft') acts = acts.concat(['Change time','Limit','Start','Delete']);
      else if(c.status === 'scheduled' || c.status === 'in_progress') acts = acts.concat(['Change time','Limit','Pause','Cancel']);
      else if(c.status === 'paused') acts = acts.concat(['Change time','Limit','Start','Cancel']);
      else acts = c.status === 'completed' ? acts.concat(['Delete']) : ['View','Delete'];
      var done = c.sent + c.failed + c.skipped;
      return '<tr><td><b>' + esc(c.code) + '</b><div class="small muted">' + esc(c.createdByName) + '</div></td><td>' + esc(c.templateName) + '</td><td>' + esc(String(c.branchName).toUpperCase()) + '</td><td><span class="tag t-New">' + esc(c.tagLabel) + '</span></td>' +
        '<td style="white-space:nowrap">' + hm12(c.sendTime) + (c.dailyLimit ? '<div class="small muted">' + c.dailyLimit + '/day</div>' : '') + '</td>' +
        '<td style="white-space:nowrap">' + c.sent + ' / ' + c.total + (c.failed ? ' <span class="small" style="color:var(--red)">' + c.failed + ' failed</span>' : '') + '<div class="bar g" style="width:110px"><i style="width:' + pct(done, c.total) + '%"></i></div></td>' +
        '<td><span class="tag ' + s[1] + '">' + s[0] + '</span>' + (c.lastError ? '<div class="small" style="color:var(--red);max-width:180px">' + esc(c.lastError) + '</div>' : '') + '</td><td style="white-space:nowrap">' + fdy(c.createdAt) + '</td>' +
        '<td><div class="row wrap" style="gap:5px;min-width:250px">' + acts.map(function(a){ return '<button class="btn ' + (a === 'Cancel' || a === 'Delete' ? 'danger' : 'ghost') + ' sm" data-ca="' + a + '" data-id="' + c.campaignId + '">' + a + '</button>'; }).join('') + '</div></td></tr>';
    }).join('') + '</table></div>';
    $('mH').querySelectorAll('[data-ca]').forEach(function(b){ b.onclick = function(){ mAct(b.getAttribute('data-id'), b.getAttribute('data-ca')); }; });
  });
}
function mAct(id, a){
  var c = M.list.filter(function(x){ return x.campaignId === id; })[0]; if(!c) return;
  function run(op, value){ return api('msgAction', {campaignId:id, op:op, value:value}).then(function(r){ if(!r.ok){ toast(r.error, true); return false; } toast(c.code + ' updated.'); mHist(); return true; }); }
  if(a === 'Start') return run('start');
  if(a === 'Pause') return run('pause');
  if(a === 'Cancel') return ask('Cancel ' + c.code + '?', 'Leads not sent yet will not be sent.', 'Cancel campaign').then(function(y){ if(y) run('cancel'); });
  if(a === 'Delete') return ask('Delete ' + c.code + '?', 'It disappears from the history.', 'Delete').then(function(y){ if(y) run('delete'); });
  if(a === 'Change time'){
    var m = modal('<h2>Change send time</h2><div class="field" style="margin-top:14px"><label>' + esc(c.code) + ' sends daily at</label><input type="time" id="xT" value="' + esc(c.sendTime) + '"></div><div class="row"><span class="sp"></span><button class="btn ghost" id="xC">Cancel</button><button class="btn" id="xS">Save</button></div>');
    m.q('#xC').onclick = m.close; m.q('#xS').onclick = function(){ run('time', m.q('#xT').value).then(function(ok){ if(ok) m.close(); }); }; return;
  }
  if(a === 'Limit'){
    var m2 = modal('<h2>Messages per day</h2><div class="sub" style="margin:6px 0 12px">Never above the branch limit (shared with the MIS). Empty = branch limit.</div><div class="field"><input id="xL" inputmode="numeric" value="' + (c.dailyLimit || '') + '"></div><div class="row"><span class="sp"></span><button class="btn ghost" id="xC">Cancel</button><button class="btn" id="xS">Save</button></div>');
    m2.q('#xC').onclick = m2.close; m2.q('#xS').onclick = function(){ run('limit', m2.q('#xL').value).then(function(ok){ if(ok) m2.close(); }); }; return;
  }
  if(a === '+ Leads'){
    var f = {type:'', due:'7d', card:'any'};
    var m3 = modal('<h2>Add leads to ' + esc(c.code) + '</h2><div class="sub" style="margin:6px 0 12px">Numbers already in this campaign and do-not-call numbers are skipped.</div>' +
      '<div class="grid3"><div class="field"><label>Patient type</label><select id="xTy">' + opt('', 'All', '') + S.types.map(function(x){ return opt(x, x, ''); }).join('') + '</select></div>' +
      '<div class="field"><label>Follow-up</label><select id="xDue">' + opt('7d', 'Due in 7 days', '7d') + opt('overdue', 'Overdue', '') + opt('30d', 'Due in 30 days', '') + opt('any', 'Any time', '') + '</select></div>' +
      '<div class="field"><label>Card</label><select id="xCd">' + opt('any', 'Any', 'any') + opt('with', 'Has a card', '') + opt('without', 'No card', '') + '</select></div></div>' +
      '<label class="row small" style="margin-bottom:8px"><input type="checkbox" id="xUse" checked> Add CRM patients matching this filter</label>' +
      '<div class="field"><label>…and/or paste rows (Mobile, Name)</label><textarea class="inp" id="xRows" style="font-family:monospace;height:80px"></textarea></div>' +
      '<div class="row"><span class="sp"></span><button class="btn ghost" id="xC">Cancel</button><button class="btn" id="xS">Add leads</button></div>');
    m3.q('#xC').onclick = m3.close;
    m3.q('#xS').onclick = function(){
      var btn = this, rows = null, txt = m3.q('#xRows').value.trim();
      if(txt){ var p = parseRows(txt.split(/\r?\n/).map(function(l){ return l.split('\t'); }), 'rows'); if(p && !p.error) rows = p.rows.filter(function(x){ return x._st === 'ok'; }).map(function(x){ return {mobile:x.mobile, name:x.name || ''}; }); }
      f = {type:m3.q('#xTy').value, due:m3.q('#xDue').value, card:m3.q('#xCd').value};
      busy(btn, true, 'Adding…');
      api('msgAddLeads', {campaignId:id, data:{filter:m3.q('#xUse').checked ? f : null, rows:rows}}).then(function(r){
        busy(btn, false); if(!r.ok){ toast(r.error, true); return; }
        toast(r.counts.added + ' leads added' + (r.counts.duplicates ? ', ' + r.counts.duplicates + ' already there' : '') + '.'); m3.close(); mHist();
      });
    };
    return;
  }
  if(a === 'View'){
    var m4 = modal('<div class="row"><h2>' + esc(c.code) + ' · ' + esc(c.templateName) + '</h2><span class="sp"></span><button class="x" id="xX">×</button></div><div id="xB" class="loading"><span class="spin"></span></div>', true);
    m4.q('#xX').onclick = m4.close;
    api('msgRecipients', {campaignId:id}).then(function(r){
      if(!r.ok){ m4.q('#xB').innerHTML = esc(r.error); return; }
      var cnt = {}; r.rows.forEach(function(x){ cnt[x.status] = (cnt[x.status] || 0) + 1; });
      m4.q('#xB').className = '';
      m4.q('#xB').innerHTML = '<div class="pills" style="margin:12px 0">' + Object.keys(cnt).map(function(k){ return '<span class="tag ' + (k === 'sent' ? 't-ok' : k === 'failed' ? 't-bad' : 't-nc') + '">' + k + ': ' + cnt[k] + '</span>'; }).join(' ') + '</div>' +
        '<div class="tw" style="max-height:60vh;overflow:auto"><table><tr><th>Name</th><th>Mobile</th><th>Status</th><th>Sent</th><th>Note</th></tr>' + r.rows.map(function(x){
          return '<tr><td>' + esc(x.name) + '</td><td>' + esc(x.phone) + '</td><td>' + esc(x.status) + '</td><td>' + esc(x.sentAt) + '</td><td class="small">' + esc(x.error) + '</td></tr>'; }).join('') + '</table></div>';
    });
  }
}
function csvDownload(name, rows){
  var csv = rows.map(function(r){ return r.map(function(v){ v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], {type:'text/csv'})); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
function mExport(){
  csvDownload('crm-campaigns-' + today() + '.csv', [['Code','Template','Branch','Tag','Send time','Total','Sent','Failed','Skipped','Pending','Status','Created','By']].concat(M.list.map(function(c){
    return [c.code, c.templateName, c.branchName, c.tagLabel, c.sendTime, c.total, c.sent, c.failed, c.skipped, c.pending, c.status, c.createdAt, c.createdByName]; })));
}

/* ================================================================== MY MIS */
var R = {who:'', range:'month'};
var RANGES = [['today','Today'],['yesterday','Yesterday'],['week','This week'],['month','This month'],['lastmonth','Last month'],['30d','Last 30 days']];
function rangePills(sel){ return '<div class="pills" style="margin:12px 0">' + RANGES.map(function(r){ return '<span class="pill' + (r[0] === sel ? ' on' : '') + '" data-rg="' + r[0] + '">' + r[1] + '</span>'; }).join('') + '</div>'; }
PAGES.mis = function(){
  if(!R.who) R.who = 'mine';
  $('main').innerHTML = head('My MIS', '<span id="rSub"></span>', isMgr() ? '<select class="inp" id="rWho" style="width:230px">' + staffOptions(R.who, true) + '</select>' : '') + rangePills(R.range) + '<div id="rB"><div class="loading"><span class="spin"></span></div></div>';
  document.querySelectorAll('[data-rg]').forEach(function(p){ p.onclick = function(){ R.range = p.getAttribute('data-rg'); PAGES.mis(); }; });
  if($('rWho')) $('rWho').onchange = function(){ R.who = this.value; PAGES.mis(); };
  api('myMis', {empId:R.who === 'mine' ? S.me.empId : R.who, range:R.range}).then(function(r){
    if(S.page !== 'mis') return;
    if(!r.ok){ $('rB').innerHTML = '<div class="card empty">' + esc(r.error) + '</div>'; return; }
    var k = r.kpis;
    $('rSub').textContent = fd(r.range.from) + ' – ' + fd(r.range.to);
    $('rB').innerHTML = '<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:4px">' +
      kpi('Calls', k.calls, k.targetPct + '% of target ' + k.target, {bar:k.targetPct}) + kpi('Connected', k.connected + '%', k.answered + ' calls answered') +
      kpi('Dates given', k.datesGiven, 'patients gave a date') + kpi('Visits', k.visits, k.visitsPer100 + ' per 100 calls') + kpi('Cards issued', k.cards, 'via MIS') +
      kpi('Overdue now', k.overdue, k.dueToday + ' due today', {color:k.overdue ? 'var(--red)' : ''}) + '</div>' +
      '<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:0">' + kpi('Cold calls', k.coldCalls, k.coldUseful + '% useful') + kpi('Patients added', k.added, '') + kpi('Messages sent', k.messages, 'bulk WhatsApp') + '</div>' +
      '<div class="card"><b>Calls per day</b> <span class="sub">· dashed line = daily target ' + r.dailyTarget + '</span>' + barChart(r.perDay, r.dailyTarget) + '</div>' +
      '<div class="grid2" style="gap:16px;margin-top:16px"><div class="card"><b>Call outcomes</b><div style="margin-top:14px">' + hbars(r.outcomes.map(function(o){ return [o.label, o.n]; })) + '</div></div>' +
      '<div class="card"><b>By patient type</b><div class="tw"><table style="margin-top:8px"><tr><th>Type</th><th class="n">Calls</th><th class="n">Connected</th><th class="n">Visits</th><th class="n">Visits/100</th></tr>' +
      r.byType.map(function(t){ return '<tr><td>' + tag(t.type) + '</td><td class="n">' + t.calls + '</td><td class="n">' + t.connected + '%</td><td class="n">' + t.visits + '</td><td class="n"><b>' + t.per100 + '</b></td></tr>'; }).join('') + '</table></div>' +
      '<b style="display:block;margin:16px 0 10px">Visits by source</b>' + hbars(r.visitsBySource.map(function(o){ return [o.source, o.n]; })) + '</div></div>';
  });
};
function hbars(list){
  if(!list.length) return '<div class="muted">Nothing yet.</div>';
  var max = Math.max.apply(null, list.map(function(x){ return x[1]; })) || 1;
  return list.map(function(x){ return '<div class="hbar"><span>' + esc(x[0]) + '</span><div class="bar"><i style="width:' + Math.round(x[1] * 100 / max) + '%"></i></div><b>' + x[1] + '</b></div>'; }).join('');
}
function barChart(days, target){
  var W = 1000, H = 230, P = 30, n = days.length || 1, max = Math.max(target * 1.25, Math.max.apply(null, days.map(function(d){ return d.calls; })) || 1);
  var bw = (W - P) / n, y = function(v){ return H - 22 - v * (H - 40) / max; };
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;margin-top:10px" role="img">';
  [0, 0.5, 1].forEach(function(f){ var v = Math.round(max * f); s += '<line x1="' + P + '" x2="' + W + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#eef0f3"/><text x="0" y="' + (y(v) + 4) + '" font-size="12" fill="#9aa0a6">' + v + '</text>'; });
  days.forEach(function(d, i){
    var h = H - 22 - y(d.calls), x = P + i * bw + bw * 0.18;
    s += '<rect x="' + x + '" y="' + y(d.calls) + '" width="' + (bw * 0.64) + '" height="' + Math.max(0, h) + '" rx="4" fill="' + (d.calls >= target ? '#DA1017' : '#e88a8d') + '"><title>' + fd(d.day) + ': ' + d.calls + ' calls</title></rect>';
    if(n <= 16 || i % Math.ceil(n / 16) === 0) s += '<text x="' + (x + bw * 0.32) + '" y="' + (H - 4) + '" font-size="12" fill="#686868" text-anchor="middle">' + (+d.day.slice(8)) + '</text>';
  });
  s += '<line x1="' + P + '" x2="' + W + '" y1="' + y(target) + '" y2="' + y(target) + '" stroke="#555" stroke-width="1.5" stroke-dasharray="6 5"/></svg>';
  return s;
}

/* ================================================================== EXECUTIVE */
var E = {range:'month', data:null};
PAGES.exec = function(refresh){
  $('main').innerHTML = head('Executive dashboard', '<span id="eSub">Loading…</span>', '<button class="btn ghost" id="eExp">Export</button><button class="btn ghost" id="eRef">Refresh</button>') + rangePills(E.range) + '<div id="eB"><div class="loading"><span class="spin"></span></div></div>';
  document.querySelectorAll('[data-rg]').forEach(function(p){ p.onclick = function(){ E.range = p.getAttribute('data-rg'); PAGES.exec(); }; });
  $('eRef').onclick = function(){ PAGES.exec(true); };
  $('eExp').onclick = eExport;
  api('exec', {range:E.range, refresh:refresh === true}).then(function(r){
    if(S.page !== 'exec') return;
    if(!r.ok){ $('eB').innerHTML = '<div class="card empty">' + esc(r.error) + '</div>'; return; }
    E.data = r; ePaint();
  });
};
function ePaint(){
  var r = E.data, k = r.kpis;
  $('eSub').textContent = fd(r.range.from) + ' – ' + fd(r.range.to) + ' · ' + r.workDays + ' working days · updated ' + hm12(r.updated);
  var mix = function(b){ var t = b.healthy + b.chronic + b.newLead || 1; return '<div class="mix"><i style="width:' + (b.healthy * 100 / t) + '%;background:#1a7f37"></i><i style="width:' + (b.chronic * 100 / t) + '%;background:#E2611B"></i><i style="width:' + (b.newLead * 100 / t) + '%;background:#185FA5"></i></div>'; };
  var bnames = r.branches;
  $('eB').innerHTML = '<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:4px">' + kpi('Active patients', k.active.toLocaleString('en-IN'), k.blocked + ' blocked') + kpi('Calls', k.calls.toLocaleString('en-IN'), k.callsToday + ' today') +
    kpi('Connected', k.connected + '%', '') + kpi('Visits', k.visits, k.per100 + ' per 100 calls') + kpi('Overdue', k.overdue, k.dueToday + ' due today', {color:'var(--red)'}) + kpi('Cards issued', k.cards, k.noCard + ' still without') + '</div>' +
    '<div class="row" style="align-items:stretch;gap:16px;flex-wrap:wrap"><div class="card flush" style="flex:2.4;min-width:320px"><div class="card-h"><b>Branch comparison</b></div><div class="tw"><table><tr><th>Branch</th><th class="n">Active</th><th>Mix</th><th class="n">Overdue</th><th class="n">Calls today</th><th class="n">Calls</th><th class="n">Conn.</th><th class="n">Visits</th><th class="n">Cards</th><th class="n">No card</th><th class="n">Cold useful</th></tr>' +
    r.rows.map(function(b){ return '<tr><td><b>' + esc(b.name) + '</b></td><td class="n">' + b.active + '</td><td>' + mix(b) + '</td><td class="n" style="color:var(--red);font-weight:700">' + b.overdue + '</td><td class="n">' + b.callsToday + '</td><td class="n">' + b.calls + '</td><td class="n">' + b.connected + '%</td><td class="n">' + b.visits + '</td><td class="n">' + b.cards + '</td><td class="n">' + b.noCard + '</td><td class="n">' + (b.cold ? b.coldUsefulPct + '%' : '—') + '</td></tr>'; }).join('') +
    '</table></div><div class="small sub" style="padding:10px 20px"><span class="dot d-Healthy"></span> Healthy &nbsp; <span class="dot d-Chronic"></span> Chronic &nbsp; <span class="dot d-New"></span> New lead</div></div>' +
    '<div class="card" style="flex:1;min-width:260px"><b>Alerts</b><div style="margin-top:12px">' + (r.alerts.length ? r.alerts.map(function(a){ return '<div class="al ' + a.level + '">⚠ <b>' + a.level.charAt(0).toUpperCase() + a.level.slice(1) + ':</b> ' + esc(a.text) + '</div>'; }).join('') : '<div class="muted">All good.</div>') + '</div></div></div>' +
    '<div class="card flush" style="margin-top:16px"><div class="card-h"><b>Staff leaderboard</b><span class="sub">· target ' + r.perDayTarget + ' calls/day</span></div><div class="tw"><table><tr><th>#</th><th>Staff</th><th>Branch</th><th class="n">Calls</th><th class="n">Today</th><th>Target</th><th class="n">Connected</th><th class="n">Dates</th><th class="n">Visits</th><th class="n">Visits/100</th><th class="n">Cards</th><th class="n">Cold useful</th><th class="n">Overdue</th></tr>' +
    (r.leaderboard.length ? r.leaderboard.map(function(s, i){ return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.branch) + '</td><td class="n">' + s.calls + '</td><td class="n">' + s.today + '</td><td><div class="row" style="gap:7px">' + s.targetPct + '%<div class="bar" style="width:80px;margin:0"><i style="width:' + Math.min(100, s.targetPct) + '%"></i></div></div></td><td class="n">' + s.connected + '%</td><td class="n">' + s.dates + '</td><td class="n">' + s.visits + '</td><td class="n">' + s.per100 + '</td><td class="n">' + s.cards + '</td><td class="n">' + (s.coldUsefulPct == null ? '—' : s.coldUsefulPct + '%') + '</td><td class="n" style="color:var(--red);font-weight:700">' + s.overdue + '</td></tr>'; }).join('') : '<tr><td colspan="13" class="empty">No calls in this period.</td></tr>') + '</table></div></div>' +
    '<div class="row" style="align-items:stretch;gap:16px;margin-top:16px;flex-wrap:wrap"><div class="card flush" style="flex:1;min-width:300px"><div class="card-h"><b>Active patients by source</b></div><div class="tw"><table><tr><th>Source</th>' + bnames.map(function(b){ return '<th class="n">' + esc(b.name) + '</th>'; }).join('') + '<th class="n">Total</th></tr>' +
    r.bySource.map(function(s){ return '<tr><td>' + esc(s.source) + '</td>' + bnames.map(function(b){ return '<td class="n">' + (s.by[b.id] || 0) + '</td>'; }).join('') + '<td class="n"><b>' + s.total + '</b></td></tr>'; }).join('') + '</table></div></div>' +
    '<div class="card flush" style="flex:1.6;min-width:320px"><div class="card-h"><b>Cold data batch quality</b></div><div class="tw"><table><tr><th>Batch</th><th>Source</th><th class="n">Total</th><th class="n">Useful</th><th class="n">Not useful</th><th class="n">Wrong</th><th class="n">Pending</th><th>Useful %</th></tr>' +
    (r.batches.length ? r.batches.map(function(x){ return '<tr><td style="white-space:nowrap"><b>' + esc(x.batchId) + '</b></td><td>' + esc(x.source) + '</td><td class="n">' + x.total + '</td><td class="n">' + x.useful + '</td><td class="n">' + x.notUseful + '</td><td class="n">' + x.wrong + '</td><td class="n">' + x.pending + '</td><td><div class="row" style="gap:7px">' + (x.useful + x.notUseful + x.wrong ? x.usefulPct + '%' : '—') + '<div class="bar" style="width:70px;margin:0"><i style="width:' + x.usefulPct + '%"></i></div></div></td></tr>'; }).join('') : '<tr><td colspan="8" class="empty">No cold data uploaded yet.</td></tr>') + '</table></div></div></div>' +
    '<div class="card row wrap" style="margin-top:16px;gap:10px"><b>Reassign patients</b><span class="sub">· when a CRM leaves or is on long leave</span><span class="sp"></span>' +
    '<select class="inp" id="eRB" style="width:150px">' + bnames.map(function(b){ return opt(b.id, b.name, S.branchId); }).join('') + '</select>from<input class="inp" id="eRF" placeholder="Login ID" style="width:160px">to<input class="inp" id="eRT" placeholder="Login ID" style="width:160px"><button class="btn danger" id="eRGo">Move all patients</button></div>';
  $('eRGo').onclick = function(){
    var f = $('eRF').value.trim(), t = $('eRT').value.trim(), b = $('eRB').value, btn = this;
    if(!f || !t){ toast('Enter both login IDs.', true); return; }
    ask('Move all patients?', 'Every active patient of <b>' + esc(f) + '</b> at this branch goes to <b>' + esc(t) + '</b>.', 'Move').then(function(y){
      if(!y) return; busy(btn, true, 'Moving…');
      api('reassign', {branchId:b, from:f, to:t}).then(function(r){ busy(btn, false); if(!r.ok){ toast(r.error, true); return; } toast(r.moved + ' patients moved from ' + r.from + ' to ' + r.to + '.'); });
    });
  };
}
function eExport(){
  if(!E.data) return;
  csvDownload('crm-leaderboard-' + today() + '.csv', [['Staff','Branch','Calls','Today','Target %','Connected %','Dates given','Visits','Visits/100','Cards','Cold useful %','Overdue']].concat(E.data.leaderboard.map(function(s){
    return [s.name, s.branch, s.calls, s.today, s.targetPct, s.connected, s.dates, s.visits, s.per100, s.cards, s.coldUsefulPct == null ? '' : s.coldUsefulPct, s.overdue]; })));
}

/* ---------------- install as an app (like the MIS) ---------------- */
var deferred = null;
window.addEventListener('beforeinstallprompt', function(e){
  e.preventDefault(); deferred = e;
  if(lsGet('crm_noinstall')) return;
  $('installBar').classList.remove('hidden');
});
document.addEventListener('DOMContentLoaded', function(){
  $('installBtn').onclick = function(){ if(!deferred) return; deferred.prompt(); deferred.userChoice.then(function(){ deferred = null; $('installBar').classList.add('hidden'); }); };
  $('installNo').onclick = function(){ lsSet('crm_noinstall', '1'); $('installBar').classList.add('hidden'); };
  boot();
});
if('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function(){});
window.CRM = {S:S, go:go};
})();
