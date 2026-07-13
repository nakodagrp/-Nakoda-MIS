/* ============================================================
 *  Nakoda MIS — Leave Management Module  (leave.js)
 *  Exposes: window.renderLeave
 *
 *  Tabs (role-aware):
 *    My Leaves   — balance cards + leave history with approver name
 *    Approvals   — Action Required (can approve) + Monitoring (HR sees all)
 *    Team View   — who's on leave (managers+)
 *    Holidays    — public holiday calendar (view / manage)
 *    Reports     — monthly leave summary (HR / Director)
 * ============================================================ */
(function () {
  /* ---- helpers ---- */
  function $id(i) { return document.getElementById(i); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function todayS() { var d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function pad(n) { return String(n).padStart(2,'0'); }
  function ymNow() { var d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1); }
  function fmtDate(s) { if(!s) return '—'; try{ var d=new Date(s); return d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear(); }catch(e){ return s; } }
  function daysBetween(a,b) { return Math.max(1,Math.round((new Date(b+'T00:00')-new Date(a+'T00:00'))/86400000)+1); }
  function lvl() { return (window.S&&window.S.perms&&window.S.perms.level)||''; }
  function role() { return (window.S&&window.S.user&&window.S.user.Role)||''; }
  function canApprove() { return lvl()==='BRANCH_MGR'||lvl()==='SUPER'||role()==='Operations Manager'; }
  function canAdmin()   { return lvl()==='SUPER'||lvl()==='HR_ADMIN'||role()==='HR'||role()==='Accounts'||role()==='Admin'; }
  function isManager()  { return canApprove()||canAdmin(); }

  /* status badge */
  function badge(s) {
    var map = {
      approved:  ['#1a7f37','#e7f6ec','✓ APPROVED'],
      rejected:  ['#DA1017','#fbecea','✗ REJECTED'],
      cancelled: ['#888',   '#f0f0f0','CANCELLED'],
      pending:   ['#c47f00','#fff8e6','⏳ PENDING']
    };
    var m = map[String(s)] || ['#555','#f0f0f0',String(s).toUpperCase()];
    return '<span style="font-size:10px;font-weight:700;color:'+m[0]+';background:'+m[1]+';border-radius:6px;padding:2px 8px;white-space:nowrap">'+m[2]+'</span>';
  }

  /* Approval chain track label */
  var TRACK_LABEL = {staff:'Staff',bm:'Branch Manager',om:'Operations Manager',coop:'Co-operative'};

  /* All leaves go to ALL managers at once — any one can approve */
  var ALL_APPROVERS = ['Branch Manager','Operations Manager','Director','HR'];
  var TRACK_APPROVERS = { staff:ALL_APPROVERS, bm:ALL_APPROVERS, om:ALL_APPROVERS, coop:ALL_APPROVERS };

  /* ---- Leave type config ---- */
  var LTYPES = ['CL','Paid'];
  var LENT   = {CL:12,Paid:12};
  var LLABEL = {CL:'CL', Paid:'Paid Leave'};   // stored type stays 'Paid'; UI shows 'Paid Leave'

  /* ============================================================
   *  BALANCE CARDS
   * ============================================================ */
  function balanceHTML(balance) {
    return LTYPES.map(function(t) {
      var b = (balance||{})[t] || {ent:LENT[t]||0,used:0,bal:LENT[t]||0};
      var pct = b.ent>0 ? Math.round((b.used/b.ent)*100) : 0;
      var col = pct>=100?'#DA1017':pct>=75?'#c47f00':'#1a7f37';
      return '<div class="lv-bal-card">'+
        '<div class="lv-bal-top"><div class="lv-bal-type">'+(LLABEL[t]||t)+'</div>'+
        '<div class="lv-bal-num" style="color:'+col+'">'+b.bal+'</div></div>'+
        '<div class="lv-bal-bar"><div class="lv-bal-fill" style="width:'+Math.min(100,pct)+'%;background:'+col+'"></div></div>'+
        '<div class="lv-bal-meta">'+b.used+' used · '+b.ent+' total</div>'+
      '</div>';
    }).join('');
  }

  /* ============================================================
   *  APPROVERS PILLS — who can approve this leave (shown on cards)
   * ============================================================ */
  function approversHTML(l) {
    if(String(l.status)==='approved')  return '<div class="lv-chain"><span class="lv-cnode lv-cn-done">✓ Approved'+(l.approvedBy?' by '+esc(l.approvedBy):'')+'</span></div>';
    if(String(l.status)==='rejected')  return '<div class="lv-chain"><span class="lv-cnode lv-cn-rej">✗ Rejected</span></div>';
    if(String(l.status)==='cancelled') return '<div class="lv-chain"><span class="lv-cnode lv-cn-cancel">Cancelled</span></div>';
    // pending — show who can approve
    var roles = l.approverRoles || TRACK_APPROVERS[String(l.track||'staff')] || [];
    var pills = roles.map(function(r){ return '<span class="lv-cnode lv-cn-curr">⏳ '+esc(r)+'</span>'; }).join(' ');
    return '<div class="lv-chain" style="gap:5px"><span style="font-size:10.5px;color:#888;margin-right:3px">Pending from:</span>'+pills+'</div>';
  }

  /* ============================================================
   *  MY LEAVES TAB
   * ============================================================ */
  var _myData = null;

  function renderMyTab(data) {
    _myData = data;
    var balance = data.balance||{};
    var leaves  = (data.leaves||[]).slice().sort(function(a,b){ return a.createdAt<b.createdAt?1:-1; });
    var balBox = $id('lv-balance'); if(balBox) balBox.innerHTML = balanceHTML(balance);
    var box = $id('lv-mine'); if(!box) return;

    if(!leaves.length) {
      box.innerHTML='<div class="empty" style="padding:28px 0">No leave requests yet. Click <b>+ Apply Leave</b>.</div>'; return;
    }

    box.innerHTML = leaves.map(function(l) {
      var canCancel = String(l.status)==='pending';
      var awaitLine = '';
      if(String(l.status)==='pending') {
        var roles = l.approverRoles || TRACK_APPROVERS[String(l.track||'staff')] || [];
        if(roles.length) awaitLine = '<div class="lv-await">⏳ Pending approval from: <b>'+roles.map(esc).join(', ')+'</b></div>';
      }
      return '<div class="lv-leave-card">'+
        '<div class="lv-lc-top">'+
          '<div class="lv-lc-type">'+esc(LLABEL[l.type]||l.type)+'</div>'+
          '<div class="lv-lc-dates">'+esc(fmtDate(l.fromDate))+' → '+esc(fmtDate(l.toDate))+' &nbsp;·&nbsp; <b>'+esc(l.days)+'d</b></div>'+
          '<div class="lv-lc-right">'+badge(l.status)+(canCancel?' &nbsp;<button class="btn ghost sm" data-cancel="'+esc(l.leaveId)+'">Cancel</button>':'')+'</div>'+
        '</div>'+
        (l.reason?'<div class="lv-lc-reason">'+esc(l.reason)+'</div>':'')+
        awaitLine+
        approversHTML(l)+
      '</div>';
    }).join('');

    box.querySelectorAll('[data-cancel]').forEach(function(btn) {
      btn.onclick = function() {
        if(!confirm('Cancel this leave request?')) return;
        btn.disabled=true; btn.textContent='…';
        API.cancelLeave(btn.getAttribute('data-cancel')).then(function(r) {
          if(r&&r.ok){ toast('Leave cancelled'); loadMyLeaves(); }
          else { toast((r&&r.error)||'Failed',true); btn.disabled=false; btn.textContent='Cancel'; }
        });
      };
    });
  }

  function loadMyLeaves() {
    API.cachedMyLeaves().then(function(r){ if(r&&r.ok) renderMyTab(r); });
    API.myLeaves().then(function(r){ if(r&&r.ok) renderMyTab(r); });
  }

  /* ============================================================
   *  APPLY LEAVE FORM
   * ============================================================ */
  function openApplyForm() {
    var today = todayS();
    var body =
      '<div class="grid2">'+
        '<div class="field"><label>Leave type</label>'+
          '<select id="lvType" class="in">'+LTYPES.map(function(t){return '<option value="'+t+'">'+(LLABEL[t]||t)+'</option>';}).join('')+'</select></div>'+
        '<div class="field"><label>Half day?</label>'+
          '<select id="lvHalf" class="in"><option value="">Full days</option><option value="first">First half</option><option value="second">Second half</option></select></div>'+
        '<div class="field"><label>From date</label><input id="lvFrom" type="date" class="in" value="'+today+'"></div>'+
        '<div id="lvToWrap" class="field"><label>To date</label><input id="lvTo" type="date" class="in" value="'+today+'"></div>'+
        '<div class="field full"><label>Reason</label><input id="lvReason" class="in" placeholder="Brief reason for leave…"></div>'+
        '<div class="field full"><label>Supporting document <span style="font-size:11px;color:#aaa">(optional)</span></label>'+
          '<input id="lvDoc" type="file" accept=".pdf,.jpg,.jpeg,.png">'+
          '<div id="lvDocSt" style="font-size:11px;color:#888;margin-top:4px"></div></div>'+
        '<div class="field full" id="lvPreview" style="display:none">'+
          '<div id="lvDayCount" style="font-size:13px;font-weight:600;padding:6px 0;color:#444"></div></div>'+
      '</div><div id="lvMsg"></div>';

    openModal('Apply Leave', body, '<button class="btn" id="lvSaveBtn">Apply for Leave</button>');

    var docB64='', docMime='', docName='';
    function updatePreview() {
      var f=$id('lvFrom').value, t=$id('lvTo').value, h=$id('lvHalf').value;
      var tw=$id('lvToWrap'); if(tw){ tw.style.display=h?'none':''; if(h) $id('lvTo').value=f; }
      var pr=$id('lvPreview'), dc=$id('lvDayCount');
      if(f&&t&&t>=f){ var days=h?0.5:daysBetween(f,t); if(pr)pr.style.display=''; if(dc)dc.innerHTML='📅 <b>'+days+(days===1?' day':' days')+'</b> of leave'; }
      else { if(pr)pr.style.display='none'; }
    }
    $id('lvFrom').oninput=$id('lvTo').oninput=$id('lvHalf').onchange=updatePreview; updatePreview();

    var docInp=$id('lvDoc');
    if(docInp) docInp.onchange=function(){
      var file=docInp.files[0]; if(!file) return; docMime=file.type; docName=file.name;
      var st=$id('lvDocSt'); if(st) st.textContent='Reading…';
      var fr=new FileReader(); fr.onload=function(){ var res=fr.result,idx=res.indexOf(','); docB64=res.slice(idx+1); if(st) st.innerHTML='✓ '+esc(file.name); }; fr.readAsDataURL(file);
    };

    $id('lvSaveBtn').onclick=function(){
      var f=$id('lvFrom').value, t=$id('lvTo').value, h=$id('lvHalf').value;
      if(!f){ $id('lvMsg').innerHTML='<div class="msg error">Pick a start date.</div>'; return; }
      if(!t) t=f; if(t<f){ $id('lvMsg').innerHTML='<div class="msg error">End date must be ≥ start date.</div>'; return; }
      this.disabled=true; this.textContent='Applying…';
      var d={type:$id('lvType').value,fromDate:f,toDate:t,reason:$id('lvReason').value,halfDay:h};
      if(docB64){ d.docBase64=docB64; d.docMime=docMime; d.docName=docName; }
      API.applyLeave(d).then(function(r){
        if(r&&r.ok){ closeModal(); toast('Leave applied ('+r.days+'d) — approval task sent to your manager'); loadMyLeaves(); }
        else{ $id('lvMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; var b=$id('lvSaveBtn'); if(b){b.disabled=false;b.textContent='Apply for Leave';} }
      });
    };
  }

  /* ============================================================
   *  APPROVALS TAB  — Action Required + Monitoring split
   * ============================================================ */
  function renderApprovalTab() {
    var box=$id('lv-approvals'); if(!box) return;
    box.innerHTML='<div class="center-load" style="padding:28px 0"><span class="loader dark"></span> Loading…</div>';
    API.leaveApprovals().then(function(r) {
      if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'Not authorised.')+'</div>'; return; }
      var all  = r.leaves||[];
      var html = '';

      if(all.length) {
        html += '<div class="lv-sec-hdr lv-sec-action">⚡ '+all.length+' leave request'+(all.length===1?'':'s')+' pending your approval</div>';
        html += all.map(function(l){ return apprCard(l, true); }).join('');
      } else {
        html = '<div class="empty" style="padding:28px 0">✓ No pending leave requests for you right now.</div>';
      }

      box.innerHTML = html;

      /* Approve buttons */
      box.querySelectorAll('[data-ap]').forEach(function(btn){
        btn.onclick=function(){
          btn.disabled=true; btn.textContent='…';
          API.setLeave(btn.getAttribute('data-ap'),'approve').then(function(x){
            if(x&&x.ok){ toast('Approved — moved to next stage'); renderApprovalTab(); }
            else{ toast((x&&x.error)||'Failed',true); btn.disabled=false; btn.textContent='Approve'; }
          });
        };
      });
      /* Reject buttons */
      box.querySelectorAll('[data-rj]').forEach(function(btn){
        btn.onclick=function(){ openRejectDialog(btn.getAttribute('data-rj'), function(){ renderApprovalTab(); }); };
      });
    });
  }

  function apprCard(l, canAct) {
    var trackLbl = TRACK_LABEL[String(l.track||'staff')]||'Staff';
    var roles = l.approverRoles || TRACK_APPROVERS[String(l.track||'staff')] || [];
    var rolePills = roles.map(function(r){ return '<span class="lv-apvr-pill">'+esc(r)+'</span>'; }).join(' ');
    return '<div class="lv-appr-row lv-appr-action" data-id="'+esc(l.leaveId)+'">'+
      '<div class="att-av" style="margin-right:12px">'+esc(initials(l.empName||'?'))+'</div>'+
      '<div class="hx-mid" style="flex:1">'+
        '<div style="font-size:14px;font-weight:700">'+esc(l.empName)+
          ' <span style="font-size:10px;font-weight:400;color:#888">('+esc(trackLbl)+')</span>'+
          ' — <b>'+esc(LLABEL[l.type]||l.type)+'</b> &nbsp;·&nbsp; '+esc(l.days)+'d'+
        '</div>'+
        '<div style="font-size:12.5px;color:#555;margin-top:2px">'+
          esc(fmtDate(l.fromDate))+' → '+esc(fmtDate(l.toDate))+
          (l.empBranch?' &nbsp;·&nbsp; '+esc(l.empBranch):'')+
          (l.reason?' &nbsp;·&nbsp; <i>'+esc(l.reason)+'</i>':'')+'</div>'+
        '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:5px;align-items:center">'+
          '<span style="font-size:10px;color:#888">Approvers:</span>'+rolePills+
        '</div>'+
      '</div>'+
      '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0;margin-left:10px">'+
        '<button class="btn sm" data-ap="'+esc(l.leaveId)+'">Approve</button>'+
        '<button class="btn ghost sm" data-rj="'+esc(l.leaveId)+'">Reject</button>'+
      '</div>'+
    '</div>';
  }

  function openRejectDialog(leaveId, onDone) {
    openModal('Reject Leave',
      '<div class="field"><label>Reason for rejection <span style="color:#DA1017">*</span></label>'+
      '<input id="rjReason" class="in" placeholder="Required…"></div><div id="rjMsg"></div>',
      '<button class="btn" id="rjBtn" style="background:#DA1017">Reject</button>');
    $id('rjBtn').onclick=function(){
      var reason=($id('rjReason').value||'').trim();
      if(!reason){ $id('rjMsg').innerHTML='<div class="msg error">Please give a reason.</div>'; return; }
      this.disabled=true; this.textContent='…';
      API.setLeave(leaveId,'reject',reason).then(function(x){
        if(x&&x.ok){ closeModal(); toast('Rejected'); onDone(); }
        else{ toast((x&&x.error)||'Failed',true); var b=$id('rjBtn'); if(b){b.disabled=false;b.textContent='Reject';} }
      });
    };
  }

  /* ============================================================
   *  TEAM VIEW TAB
   * ============================================================ */
  function renderTeamTab() {
    var box=$id('lv-team'); if(!box) return;
    box.innerHTML='<div class="center-load" style="padding:28px 0"><span class="loader dark"></span> Loading…</div>';
    API.allLeaves({status:'approved',upcoming:true}).then(function(r) {
      if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
      var today=todayS();
      var twoW=new Date(); twoW.setDate(twoW.getDate()+14);
      var twS=twoW.getFullYear()+'-'+pad(twoW.getMonth()+1)+'-'+pad(twoW.getDate());
      var curr=(r.leaves||[]).filter(function(l){ return String(l.toDate)>=today&&String(l.fromDate)<=twS; });
      var past=(r.leaves||[]).filter(function(l){ return String(l.toDate)<today; }).slice(0,15);
      var html='';
      if(curr.length){
        html+='<div class="section-label" style="margin-top:0">On Leave / Upcoming (next 2 weeks)</div>'+
          '<div class="table-wrap"><table><thead><tr><th>Staff</th><th>Branch</th><th>Type</th><th>From</th><th>To</th><th>Days</th></tr></thead><tbody>'+
          curr.map(function(l){
            var onNow=String(l.fromDate)<=today&&String(l.toDate)>=today;
            return '<tr style="'+(onNow?'background:#fff8e6':'')+'">'+
              '<td><b>'+esc(l.empName)+'</b>'+(onNow?' <span style="font-size:10px;color:#c47f00;font-weight:700">ON LEAVE</span>':'')+'</td>'+
              '<td style="font-size:12.5px;color:#666">'+esc(l.branchId||'—')+'</td>'+
              '<td>'+esc(l.type)+'</td><td>'+esc(fmtDate(l.fromDate))+'</td><td>'+esc(fmtDate(l.toDate))+'</td>'+
              '<td style="text-align:center">'+esc(l.days)+'</td></tr>';
          }).join('')+'</tbody></table></div>';
      } else {
        html+='<div class="empty" style="padding:18px 0">No approved leaves in the next 2 weeks.</div>';
      }
      if(past.length){
        html+='<div class="section-label" style="margin-top:18px">Recent Past (last 30 days)</div>'+
          '<div class="table-wrap"><table><thead><tr><th>Staff</th><th>Type</th><th>From</th><th>To</th><th>Days</th></tr></thead><tbody>'+
          past.map(function(l){ return '<tr><td>'+esc(l.empName)+'</td><td>'+esc(l.type)+'</td>'+
            '<td>'+esc(fmtDate(l.fromDate))+'</td><td>'+esc(fmtDate(l.toDate))+'</td>'+
            '<td style="text-align:center">'+esc(l.days)+'</td></tr>'; }).join('')+'</tbody></table></div>';
      }
      box.innerHTML=html||'<div class="empty">No recent leaves.</div>';
    });
  }

  /* ============================================================
   *  HOLIDAYS TAB
   * ============================================================ */
  var _holidays=[];
  function renderHolidaysTab() {
    var box=$id('lv-holidays'); if(!box) return;
    box.innerHTML='<div class="center-load" style="padding:28px 0"><span class="loader dark"></span> Loading…</div>';
    API.listHolidays(new Date().getFullYear()).then(function(r){
      _holidays=(r&&r.holidays)||[];
      paintHolidays(_holidays,r&&r.canManage);
    }).catch(function(){ paintHolidays([]); });
  }
  function paintHolidays(holidays,canManage) {
    var box=$id('lv-holidays'); if(!box) return;
    var today=todayS();
    var upcoming=holidays.filter(function(h){ return String(h.date)>=today; });
    var past=holidays.filter(function(h){ return String(h.date)<today; });
    var html=(canManage?'<div style="display:flex;justify-content:flex-end;margin-bottom:12px"><button class="btn sm" id="holAddBtn">+ Add Holiday</button></div>':'');
    if(upcoming.length) html+='<div class="section-label" style="margin-top:0">Upcoming Holidays</div><div class="lv-hol-grid">'+upcoming.map(function(h){return holCard(h,canManage);}).join('')+'</div>';
    if(past.length) html+='<div class="section-label" style="margin-top:16px">Past (This Year)</div><div class="lv-hol-grid lv-hol-past">'+past.map(function(h){return holCard(h,canManage);}).join('')+'</div>';
    if(!holidays.length) html+='<div class="empty" style="padding:28px 0">No holidays defined yet.</div>';
    box.innerHTML=html;
    if(canManage){
      var ab=$id('holAddBtn'); if(ab) ab.onclick=function(){ openHolidayForm(null); };
      box.querySelectorAll('[data-hol-edit]').forEach(function(b){ b.onclick=function(){ var h=_holidays.filter(function(x){return String(x.holidayId)===b.getAttribute('data-hol-edit');})[0]; openHolidayForm(h); }; });
      box.querySelectorAll('[data-hol-del]').forEach(function(b){ b.onclick=function(){
        if(!confirm('Delete this holiday?')) return;
        API.saveHoliday({holidayId:b.getAttribute('data-hol-del'),_delete:true}).then(function(r){ if(r&&r.ok){ toast('Deleted'); renderHolidaysTab(); } else toast((r&&r.error)||'Failed',true); });
      }; });
    }
  }
  function holCard(h,canManage){
    var d=new Date(h.date+'T00:00');
    var days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var col=h.type==='National'?'#DA1017':h.type==='Regional'?'#1a5fa8':'#2e7d32';
    return '<div class="lv-hol-card">'+
      '<div class="lv-hol-date" style="background:'+col+'"><div class="lv-hol-dd">'+d.getDate()+'</div><div class="lv-hol-dm">'+months[d.getMonth()]+' '+days[d.getDay()]+'</div></div>'+
      '<div class="lv-hol-info"><div class="lv-hol-name">'+esc(h.name)+'</div><div class="lv-hol-type">'+esc(h.type||'Holiday')+'</div></div>'+
      (canManage?'<div class="lv-hol-acts"><button class="btn ghost sm" data-hol-edit="'+esc(h.holidayId)+'">✎</button><button class="btn ghost sm" style="color:#DA1017" data-hol-del="'+esc(h.holidayId)+'">✕</button></div>':'')+
    '</div>';
  }
  function openHolidayForm(h){
    h=h||{};
    var body='<div class="grid2">'+
      '<div class="field"><label>Date</label><input id="holDate" type="date" class="in" value="'+esc(h.date||todayS())+'"></div>'+
      '<div class="field"><label>Type</label><select id="holType" class="in">'+['National','Regional','Company'].map(function(t){return '<option value="'+t+'"'+(h.type===t?' selected':'')+'>'+t+'</option>';}).join('')+'</select></div>'+
      '<div class="field full"><label>Name</label><input id="holName" class="in" value="'+esc(h.name||'')+'"></div>'+
    '</div><div id="holMsg"></div>';
    openModal(h.holidayId?'Edit Holiday':'Add Holiday',body,'<button class="btn" id="holSave">'+(h.holidayId?'Save':'Add')+'</button>');
    $id('holSave').onclick=function(){
      var name=($id('holName').value||'').trim(); if(!name){ $id('holMsg').innerHTML='<div class="msg error">Name required.</div>'; return; }
      this.disabled=true; this.textContent='Saving…';
      API.saveHoliday({holidayId:h.holidayId||'',name:name,date:$id('holDate').value,type:$id('holType').value}).then(function(r){
        if(r&&r.ok){ closeModal(); toast(h.holidayId?'Updated':'Added'); renderHolidaysTab(); }
        else{ $id('holMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; var b=$id('holSave');if(b){b.disabled=false;b.textContent=(h.holidayId?'Save':'Add');} }
      });
    };
  }

  /* ============================================================
   *  REPORTS TAB
   * ============================================================ */
  function renderReportTab() {
    var box=$id('lv-report'); if(!box) return;
    var brs=(window.S&&window.S.meta&&window.S.meta.branches)||[];
    box.innerHTML=
      '<div class="lv-rpt-filt">'+
        '<div class="field"><label>Month</label><input id="rptMonth" type="month" class="in" value="'+ymNow()+'"></div>'+
        '<div class="field"><label>Branch</label><select id="rptBranch" class="in"><option value="">All branches</option>'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'">'+esc(b.BranchName)+'</option>';}).join('')+'</select></div>'+
        '<div style="align-self:end"><button class="btn" id="rptLoad">Load Report</button></div>'+
      '</div><div id="rptBody"></div>';
    $id('rptLoad').onclick=loadReport; loadReport();
  }
  function loadReport(){
    var box=$id('rptBody'); if(!box) return;
    var ym=($id('rptMonth')||{}).value||ymNow(), br=($id('rptBranch')||{}).value||'';
    box.innerHTML='<div class="center-load" style="padding:28px 0"><span class="loader dark"></span> Loading…</div>';
    API.leaveReport(ym,br).then(function(r){
      if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'No data')+'</div>'; return; }
      var rows=r.rows||[];
      if(!rows.length){ box.innerHTML='<div class="empty">No approved leaves in '+ym+'.</div>'; return; }
      var totals={CL:0,Paid:0,total:0};
      rows.forEach(function(row){ Object.keys(totals).forEach(function(k){ totals[k]+=(Number(row[k])||0); }); });
      var summary='<div class="lv-rpt-summary">'+Object.keys(totals).map(function(k){return '<div class="lv-rpt-tile"><div class="lv-rpt-tile-n">'+totals[k]+'</div><div class="lv-rpt-tile-l">'+k+'</div></div>';}).join('')+'</div>';
      var table='<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Staff</th><th>Branch</th><th>CL</th><th>Paid</th><th>Total</th></tr></thead><tbody>'+
        rows.map(function(row){return '<tr><td><b>'+esc(row.name)+'</b></td><td style="font-size:12.5px;color:#666">'+esc(row.branch)+'</td>'+
          ['CL','Paid','total'].map(function(k){var v=Number(row[k])||0;return '<td style="text-align:center'+(v>0?';font-weight:700':'')+'">'+v+'</td>';}).join('')+'</tr>';}).join('')+
        '</tbody></table></div>';
      box.innerHTML=summary+table;
    });
  }

  /* ============================================================
   *  TAB SWITCHER
   * ============================================================ */
  var _activeTab='my';
  function switchTab(tab) {
    _activeTab=tab;
    ['my','approvals','team','holidays','report'].forEach(function(t){
      var el=$id('lvtab-'+t); if(el) el.classList.toggle('active',t===tab);
      var pn=$id('lvpane-'+t); if(pn) pn.classList.toggle('hidden',t!==tab);
    });
    if(tab==='approvals') renderApprovalTab();
    if(tab==='team')      renderTeamTab();
    if(tab==='holidays')  renderHolidaysTab();
    if(tab==='report')    renderReportTab();
  }

  /* ============================================================
   *  MAIN RENDER
   * ============================================================ */
  window.renderLeave = function() {
    var v=$id('page-leave'); if(!v) return;
    var hasApprovals=canApprove()||canAdmin();
    var hasTeam=isManager();
    var hasReport=canAdmin();

    var tabs=[
      {id:'my',label:'My Leaves'},
      hasApprovals?{id:'approvals',label:'Approvals'}:null,
      hasTeam?{id:'team',label:'Team View'}:null,
      {id:'holidays',label:'Holidays'},
      hasReport?{id:'report',label:'Reports'}:null
    ].filter(Boolean);

    v.innerHTML=
      '<div class="page-head"><h1>🌴 Leave</h1><div class="spacer"></div><button class="btn" id="lvApplyBtn">+ Apply Leave</button></div>'+
      '<div id="lv-balance" class="lv-balance-row"></div>'+
      '<div class="lv-tabs">'+tabs.map(function(t){return '<button class="lv-tab'+(t.id==='my'?' active':'')+'" id="lvtab-'+t.id+'" data-tab="'+t.id+'">'+esc(t.label)+'</button>';}).join('')+'</div>'+
      /* My Leaves pane */
      '<div id="lvpane-my"><div class="section-label" style="margin-top:8px">Leave History</div><div id="lv-mine"><div class="center-load" style="padding:28px 0"><span class="loader dark"></span> Loading…</div></div></div>'+
      /* Approvals pane */
      (hasApprovals?'<div id="lvpane-approvals" class="hidden"><div id="lv-approvals"></div></div>':'')+
      /* Team pane */
      (hasTeam?'<div id="lvpane-team" class="hidden"><div id="lv-team"></div></div>':'')+
      /* Holidays pane */
      '<div id="lvpane-holidays" class="hidden"><div id="lv-holidays"></div></div>'+
      /* Reports pane */
      (hasReport?'<div id="lvpane-report" class="hidden"><div id="lv-report"></div></div>':'');

    v.querySelectorAll('.lv-tab').forEach(function(btn){ btn.onclick=function(){ switchTab(btn.getAttribute('data-tab')); }; });
    $id('lvApplyBtn').onclick=openApplyForm;
    loadMyLeaves();
  };

  /* ============================================================
   *  STYLES (injected once)
   * ============================================================ */
  if(!document.getElementById('leave-styles')){
    var s=document.createElement('style'); s.id='leave-styles';
    s.textContent=[
      /* Balance */
      '.lv-balance-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}',
      '.lv-bal-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 18px;min-width:150px;flex:1;box-shadow:var(--shadow)}',
      '.lv-bal-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}',
      '.lv-bal-type{font-size:11px;font-weight:700;color:var(--grey);text-transform:uppercase;letter-spacing:.07em}',
      '.lv-bal-num{font-size:28px;font-weight:800;line-height:1}',
      '.lv-bal-bar{height:5px;background:var(--line);border-radius:4px;overflow:hidden;margin-bottom:5px}',
      '.lv-bal-fill{height:100%;border-radius:4px;transition:width .4s}',
      '.lv-bal-meta{font-size:11px;color:var(--muted)}',
      /* Tabs */
      '.lv-tabs{display:flex;gap:3px;border-bottom:2px solid var(--line);margin-bottom:0}',
      '.lv-tab{border:0;background:transparent;padding:9px 16px;font-size:13.5px;font-weight:600;color:var(--grey);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;border-radius:8px 8px 0 0;transition:.15s}',
      '.lv-tab:hover{background:var(--bg);color:var(--ink)}',
      '.lv-tab.active{color:var(--red);border-bottom-color:var(--red);background:var(--red-soft)}',
      /* Leave cards (My Leaves) */
      '.lv-leave-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:10px;box-shadow:var(--shadow)}',
      '.lv-lc-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px}',
      '.lv-lc-type{font-size:13px;font-weight:800;background:var(--red-soft);color:var(--red);border-radius:7px;padding:3px 10px}',
      '.lv-lc-dates{font-size:13px;color:var(--ink);flex:1}',
      '.lv-lc-right{display:flex;align-items:center;gap:8px;margin-left:auto}',
      '.lv-lc-reason{font-size:12.5px;color:var(--grey);margin-bottom:6px}',
      /* Await line */
      '.lv-await{font-size:12px;color:#c47f00;margin:4px 0 6px;display:flex;align-items:center;gap:5px}',
      '.lv-await-role{font-weight:400;color:#888}',
      /* Approval chain */
      '.lv-chain{display:flex;align-items:center;flex-wrap:wrap;gap:0;margin-top:8px}',
      '.lv-cnode{font-size:10.5px;font-weight:600;border-radius:6px;padding:3px 8px;white-space:nowrap}',
      '.lv-cn-done{background:#e7f6ec;color:#1a7f37}',
      '.lv-cn-curr{background:#fff8e6;color:#c47f00;font-weight:800}',
      '.lv-cn-wait{background:#f4f5f7;color:#9aa0a6}',
      '.lv-cn-rej{background:#fbecea;color:#DA1017}',
      '.lv-cn-cancel{background:#f0f0f0;color:#888}',
      '.lv-carrow{font-size:12px;color:#9aa0a6;padding:0 4px}',
      /* Approval section headers */
      '.lv-sec-hdr{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;padding:8px 12px;border-radius:9px;margin-bottom:10px}',
      '.lv-sec-action{background:#fff8e6;color:#c47f00}',
      '.lv-sec-monitor{background:#eef1f5;color:#516072}',
      /* Approval rows */
      '.lv-appr-row{display:flex;align-items:flex-start;gap:10px;padding:14px;background:#fff;border:1px solid var(--line);border-radius:13px;margin-bottom:10px;box-shadow:var(--shadow)}',
      '.lv-appr-action{border-left:3px solid #c47f00}',
      '.lv-appr-monitor{border-left:3px solid #d7dce3;opacity:.9}',
      /* Stage / approver pills */
      '.lv-stage-pill{font-size:10px;font-weight:700;background:#fff8e6;color:#c47f00;border-radius:6px;padding:2px 7px}',
      '.lv-apvr-pill{font-size:10px;font-weight:600;background:#eaf0ff;color:#1a5fa8;border-radius:6px;padding:2px 7px}',
      /* Holiday grid */
      '.lv-hol-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin-bottom:14px}',
      '.lv-hol-past{opacity:.65}',
      '.lv-hol-card{display:flex;align-items:center;background:#fff;border:1px solid var(--line);border-radius:13px;overflow:hidden;box-shadow:var(--shadow)}',
      '.lv-hol-date{min-width:60px;padding:12px 8px;text-align:center;color:#fff;flex-shrink:0}',
      '.lv-hol-dd{font-size:22px;font-weight:800;line-height:1}',
      '.lv-hol-dm{font-size:10px;font-weight:600;opacity:.9;margin-top:2px}',
      '.lv-hol-info{flex:1;padding:10px 12px}',
      '.lv-hol-name{font-weight:700;font-size:13.5px}',
      '.lv-hol-type{font-size:11px;color:var(--muted);margin-top:1px}',
      '.lv-hol-acts{display:flex;flex-direction:column;gap:4px;padding:8px;flex-shrink:0}',
      /* Report */
      '.lv-rpt-filt{display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;margin-bottom:18px}',
      '.lv-rpt-summary{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:4px}',
      '.lv-rpt-tile{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 18px;text-align:center;min-width:80px;box-shadow:var(--shadow)}',
      '.lv-rpt-tile-n{font-size:26px;font-weight:800;color:var(--red)}',
      '.lv-rpt-tile-l{font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;margin-top:2px}',
      /* Mobile */
      '@media(max-width:640px){',
        '.lv-bal-card{min-width:130px}',
        '.lv-rpt-filt{grid-template-columns:1fr 1fr}.lv-rpt-filt>*:last-child{grid-column:1/-1}',
        '.lv-tabs{overflow-x:auto;flex-wrap:nowrap}.lv-tab{white-space:nowrap}',
        '.lv-appr-row{flex-wrap:wrap}.lv-appr-row>*:last-child{width:100%;margin-left:0;margin-top:8px}',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }
})();
