/* Nakoda MIS — HR: Leave, Field claims (km/visit), Company Policy, Payroll. */
(function(){
  function $id(i){ return document.getElementById(i); }
  function ymNow(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  function todayS(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function money(n){ return Math.round(Number(n)||0).toLocaleString('en-IN'); }
  function lvl(){ return (S.perms&&S.perms.level)||''; }
  function canLeaveApprove(){ return lvl()==='BRANCH_MGR'||lvl()==='SUPER'||(S.user&&String(S.user.Role)==='Operations Manager'); }
  function canClaimApprove(){ return lvl()==='BRANCH_MGR'||lvl()==='HR_ADMIN'||lvl()==='SUPER'||(S.user&&S.user.Role==='Operations Manager'); }
  function payAllowed(){ return lvl()==='SUPER'||lvl()==='HR_ADMIN'||(S.user && ['Operations Manager','Accounts'].indexOf(String(S.user.Role))>=0); }
  function lstat(s){ s=String(s||''); var c=s==='approved'?'#1a7f37':s==='rejected'?'#DA1017':'#c47f00'; return '<span style="font-size:10px;font-weight:700;color:'+c+'">'+s.toUpperCase()+'</span>'; }

  /* Leave is handled by leave.js (renderLeave exposed on window.renderLeave) */

  /* ---------------- FIELD CLAIMS (km / visit) ---------------- */
  function renderField(){
    var v=$id('page-field');
    v.innerHTML='<div class="page-head"><h1>Field Work (Km / Visit)</h1><div class="spacer"></div><button class="btn" id="fcAdd">+ New claim</button></div>'+
      '<div class="section-label">My claims this month</div><div id="fcMine"></div>'+
      (canClaimApprove()?'<div class="section-label" style="margin-top:18px">Claim approvals</div><div id="fcApp"></div>':'');
    $id('fcAdd').onclick=openClaimForm;
    API.myClaims(ymNow()).then(function(r){ var box=$id('fcMine'); if(!box) return; if(r&&r.ok){ var rows=r.claims||[]; box.innerHTML=rows.length?rows.map(function(c){ return '<div class="hx-row"><div class="hx-mid"><b>'+esc(c.date)+'</b> · '+esc(c.type)+' '+(c.type==='km'?(c.totalKm+' km'):(c.visits+' visits'))+'<div class="hx-m">₹'+money(c.amount)+'</div></div>'+lstat(c.status)+'</div>'; }).join(''):'<div class="empty">No claims this month.</div>'; } });
    if(canClaimApprove()) loadClaimApprovals();
  }
  function openClaimForm(){
    var pt=String((S.user&&S.user.PayType)||''), defType=pt.indexOf('visit')>=0?'visit':'km';
    var st={startPhoto:'',endPhoto:'',sLat:'',sLng:'',eLat:'',eLng:''};
    var body='<div class="grid2"><div class="field"><label>Type</label><select id="fcType" class="in"><option value="km"'+(defType==='km'?' selected':'')+'>Per km</option><option value="visit"'+(defType==='visit'?' selected':'')+'>Per visit</option></select></div>'+
      '<div class="field"><label>Date</label><input id="fcDate" class="in" type="date" value="'+todayS()+'"></div>'+
      '<div id="fcKm"><div class="field"><label>Start km</label><input id="fcStartKm" class="in" type="number"></div><div class="field"><label>End km</label><input id="fcEndKm" class="in" type="number"></div>'+
        '<div class="field full"><label>Start photo + location</label><input type="file" id="fcStartPhoto" accept="image/*" capture="environment"><div class="upst" id="fcStartSt" style="font-size:11px;color:#888"></div></div>'+
        '<div class="field full"><label>End photo + location</label><input type="file" id="fcEndPhoto" accept="image/*" capture="environment"><div class="upst" id="fcEndSt" style="font-size:11px;color:#888"></div></div></div>'+
      '<div id="fcVisitWrap" class="field" style="display:none"><label>Number of visits</label><input id="fcVisits" class="in" type="number"></div>'+
      '<div class="field full"><label>Notes</label><input id="fcNotes" class="in"></div></div><div id="fcMsg"></div>';
    openModal('New field claim', body, '<button class="btn" id="fcSave">Submit for approval</button>');
    function tog(){ var t=$id('fcType').value; $id('fcKm').style.display=t==='km'?'':'none'; $id('fcVisitWrap').style.display=t==='visit'?'':'none'; }
    $id('fcType').onchange=tog; tog();
    function geoThen(setLat,setLng,stId){ if(navigator.geolocation) navigator.geolocation.getCurrentPosition(function(p){ st[setLat]=p.coords.latitude; st[setLng]=p.coords.longitude; var e=$id(stId); if(e) e.innerHTML+=' 📍'; },function(){}); }
    function pick(inputId,key,stId,setLat,setLng){ var inp=$id(inputId); if(!inp) return; inp.onchange=function(){ var f=inp.files[0]; if(!f) return; var st2=$id(stId); st2.textContent='Reading…'; geoThen(setLat,setLng,stId); var fr=new FileReader(); fr.onload=function(){ var s=fr.result,i=s.indexOf(','); st[key]=s.slice(i+1); st2.innerHTML='Photo ✓'; }; fr.readAsDataURL(f); }; }
    pick('fcStartPhoto','startPhoto','fcStartSt','sLat','sLng'); pick('fcEndPhoto','endPhoto','fcEndSt','eLat','eLng');
    $id('fcSave').onclick=function(){ var t=$id('fcType').value;
      var d={type:t,date:$id('fcDate').value,notes:$id('fcNotes').value,startPhoto:st.startPhoto,endPhoto:st.endPhoto,startLat:st.sLat,startLng:st.sLng,endLat:st.eLat,endLng:st.eLng};
      if(t==='km'){ d.startKm=$id('fcStartKm').value; d.endKm=$id('fcEndKm').value; } else d.visits=$id('fcVisits').value;
      this.disabled=true; this.textContent='Submitting…';
      API.submitClaim(d).then(function(r){ if(r&&r.ok){ closeModal(); toast('Claim submitted (₹'+money(r.amount)+')'); renderField(); } else $id('fcMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed — needs internet for photos')+'</div>'; })
        .catch(function(){ $id('fcMsg').innerHTML='<div class="msg error">Submitting needs internet.</div>'; }); };
  }
  function loadClaimApprovals(){
    API.claimApprovals().then(function(r){ var box=$id('fcApp'); if(!box) return; if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
      var rows=r.claims||[]; if(!rows.length){ box.innerHTML='<div class="empty">No pending claims.</div>'; return; }
      box.innerHTML=rows.map(function(c){ return '<div class="hx-row" data-id="'+esc(c.claimId)+'"><div class="att-av">'+esc(initials(c.empName))+'</div><div class="hx-mid"><b>'+esc(c.empName)+'</b> · '+esc(c.type)+' '+(c.type==='km'?(c.totalKm+'km'):(c.visits+' visits'))+'<div class="hx-m">'+esc(c.date)+' · ₹'+money(c.amount)+(c.startPhotoUrl?' · <a href="'+esc(c.startPhotoUrl)+'" target="_blank">start</a>':'')+(c.endPhotoUrl?' · <a href="'+esc(c.endPhotoUrl)+'" target="_blank">end</a>':'')+'</div></div><button class="btn sm" data-ap="'+esc(c.claimId)+'">Approve</button> <button class="btn ghost sm" data-rj="'+esc(c.claimId)+'">Reject</button></div>'; }).join('');
      box.querySelectorAll('[data-ap]').forEach(function(b){ b.onclick=function(){ API.setClaim(b.getAttribute('data-ap'),'approve').then(function(x){ if(x&&x.ok){ toast('Approved'); renderField(); } }); }; });
      box.querySelectorAll('[data-rj]').forEach(function(b){ b.onclick=function(){ API.setClaim(b.getAttribute('data-rj'),'reject').then(function(x){ if(x&&x.ok){ toast('Rejected'); renderField(); } }); }; });
    });
  }

  /* ---------------- COMPANY POLICY ---------------- */
  /* HR sees the upload button INSTANTLY from the local role — no waiting on the network. */
  function canManagePolicy(){ return (S.perms&&(S.perms.level==='SUPER'||S.perms.level==='HR_ADMIN'))||String((S.user||{}).Role)==='HR'; }
  /* Download PDF is for HR / Admin / Director / MIS only (staff just open/read the 📎 link). */
  function canDownloadPolicy(){ if(S.perms&&(S.perms.level==='SUPER'||S.perms.level==='HR_ADMIN')) return true; var r=String((S.user||{}).Role||'').toLowerCase(); return ['hr','admin','director','mis'].indexOf(r)>=0; }
  /* Turn any Drive link into a direct-download URL — works any number of times. */
  function policyDlUrl(u){ var m=String(u||'').match(/[\/=]([a-zA-Z0-9_-]{25,})/); return m?('https://drive.google.com/uc?export=download&id='+m[1]):u; }
  function renderPolicy(){
    var v=$id('page-policy');
    v.innerHTML='<div class="page-head"><h1>Company Policy</h1><div class="spacer"></div><button class="btn" id="polAdd" style="display:'+(canManagePolicy()?'':'none')+'">⬆ Upload policy (PDF)</button></div><div id="polList"><div class="center-load"><span class="loader dark"></span> Loading…</div></div>';
    var add0=$id('polAdd'); if(add0) add0.onclick=function(){ openPolicyForm(null); };
    API.cachedPolicies().then(function(r){ if(r) paintPolicies(r); });
    API.listPolicies().then(function(r){ if(r&&r.ok) paintPolicies(r); else { var b=$id('polList'); if(b&&b.querySelector('.center-load')) b.innerHTML='<div class="empty">'+esc((r&&r.error)||'Could not load policies — check internet.')+'</div>'; } });
  }
  function paintPolicies(r){
    var can=!!(r.canManage||canManagePolicy());
    var add=$id('polAdd'); if(add){ add.style.display=can?'':'none'; add.onclick=function(){ openPolicyForm(null); }; }
    var box=$id('polList'); if(!box) return; var pols=r.policies||[];
    if(!pols.length){ box.innerHTML='<div class="empty">No policies yet.'+(can?' Tap “⬆ Upload policy (PDF)” to post the first one.':'')+'</div>'; return; }
    box.innerHTML=pols.map(function(p){ return '<div class="pol-card"><div class="pol-h"><b>'+esc(p.title)+'</b> <span style="font-size:10px;color:#aaa">v'+p.version+'</span>'+(p.acked?'<span class="att-ok" style="margin-left:auto">✓ Understood</span>':'<span style="margin-left:auto;font-size:10px;color:#c47f00;font-weight:700">NEW</span>')+'</div>'+
      '<div class="pol-body">'+esc(p.body||'').replace(/\n/g,'<br>')+'</div>'+
      (p.fileUrl?'<div style="margin:8px 0"><a href="'+esc(p.fileUrl)+'" target="_blank" rel="noopener" style="color:var(--red);font-weight:600;font-size:13px">📎 Policy document (PDF) — tap to open</a></div>':'')+
      (p.fileUrl&&canDownloadPolicy()?'<div style="margin:8px 0"><a class="btn" href="'+esc(policyDlUrl(p.fileUrl))+'" target="_blank" rel="noopener" download style="display:inline-block;text-decoration:none;font-size:13px">⬇ Download PDF</a></div>':'')+
      (p.acked?'':'<button class="und-btn" data-ack="'+esc(p.policyId)+'">I have read &amp; UNDERSTOOD</button>')+
      (can?'<div class="pol-admin"><a href="javascript:void(0)" data-edit="'+esc(p.policyId)+'">✎ Edit</a> · <a href="javascript:void(0)" data-acks="'+esc(p.policyId)+'">Who acknowledged</a></div>':'')+'</div>'; }).join('');
    box.querySelectorAll('[data-ack]').forEach(function(b){ b.onclick=function(){ API.ackPolicy(b.getAttribute('data-ack')).then(function(x){ if(x&&x.ok){ toast('Acknowledged'); renderPolicy(); } }); }; });
    box.querySelectorAll('[data-edit]').forEach(function(b){ b.onclick=function(){ var p=pols.filter(function(x){return x.policyId===b.getAttribute('data-edit');})[0]; openPolicyForm(p); }; });
    box.querySelectorAll('[data-acks]').forEach(function(b){ b.onclick=function(){ showAcks(b.getAttribute('data-acks')); }; });
  }
  function openPolicyForm(p){ p=p||{};
    var fileUrl=p.fileUrl||'';
    var body='<div class="grid2"><div class="field full"><label>Title</label><input id="poT" class="in" value="'+esc(p.title||'')+'"></div>'+
      '<div class="field full"><label>Policy text</label><textarea id="poB" class="in" rows="8">'+esc(p.body||'')+'</textarea></div>'+
      '<div class="field full"><label>Policy document (PDF) — optional</label>'+
        '<label class="dl-file"><span id="poFileSt">'+(fileUrl?'✓ Document attached — tap to replace':'📎 Upload policy file (PDF)')+'</span><input id="poFile" type="file" accept="application/pdf,image/*" hidden></label></div>'+
      '</div><div style="font-size:11px;color:#888">Saving notifies all staff &amp; resets the UNDERSTOOD acknowledgement.</div><div id="poMsg"></div>';
    openModal(p.policyId?'Edit policy':'New policy', body, '<button class="btn" id="poSave">'+(p.policyId?'Save (new version)':'Post')+'</button>');
    var pf=$id('poFile');
    if(pf) pf.onchange=function(){ var f=this.files[0], input=this; if(!f) return;
      var s=$id('poFileSt');
      API.upload(f,'Policies',function(m){ s.textContent=m; })
        .then(function(r){ fileUrl=r.url; s.textContent='✓ '+f.name+' — tap to replace'; },
              function(e){ s.innerHTML='<span style="color:#A32D2D">'+esc(e&&e.message?e.message:'Upload failed')+'</span> — tap to retry'; input.value=''; });
    };
    $id('poSave').onclick=function(){ var t=$id('poT').value.trim(); if(!t){ $id('poMsg').innerHTML='<div class="msg error">Title required.</div>'; return; } this.disabled=true;
      API.savePolicy({policyId:p.policyId,title:t,body:$id('poB').value,fileUrl:fileUrl}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Policy posted'); renderPolicy(); } else $id('poMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }
  function showAcks(pid){
    openModal('Acknowledgements','<div id="akBody"><div class="center-load"><span class="loader dark"></span> Loading…</div></div>','');
    API.policyAcks(pid).then(function(r){ var b=$id('akBody'); if(!b) return; if(!r||!r.ok){ b.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
      var done=r.acks.filter(function(a){return a.acked;}).length;
      b.innerHTML='<div style="font-size:13px;margin-bottom:8px"><b>'+esc(r.title)+'</b> v'+r.version+' · acknowledged '+done+'/'+r.acks.length+'</div>'+r.acks.map(function(a){ return '<div class="hx-row"><div class="hx-mid">'+esc(a.name)+' <span style="font-size:10px;color:#aaa">'+esc(a.branch||'')+'</span></div>'+(a.acked?'<span class="att-ok">✓</span>':'<span style="font-size:10px;color:#c47f00">pending</span>')+'</div>'; }).join('');
    });
  }

  /* ---------------- PAYROLL ---------------- */
  function renderPayroll(){
    var v=$id('page-payroll');
    if(!payAllowed()){
      var who=(S.user&&S.user.FullName)||'', wid=(S.user&&S.user.EmpID)||'';
      v.innerHTML='<div class="page-head"><h1>My Payroll</h1></div>'+
        '<div class="pm2-filt" style="grid-template-columns:1fr 1fr"><div><label>Month</label><input id="pyMonth" class="in" type="month" value="'+ymNow()+'"></div>'+
        '<div style="align-self:end;font-size:12px;color:#666">'+esc(who)+(wid?(' · '+esc(wid)):'')+'</div></div>'+
        '<div id="pyKpiMe" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:14px 0"></div><div id="pySlip"></div><div id="pyHist"></div>';
      $id('pyMonth').onchange=function(){ loadMySlip(); };
      loadMySlip(); loadMyHistory(); return;
    }
    var brs=(S.meta&&S.meta.branches)||[];
    v.innerHTML='<div class="page-head"><h1>Payroll</h1></div>'+
      '<div class="pm2-filt" style="grid-template-columns:1fr 1fr auto"><div><label>Month</label><input id="pyMonth" class="in" type="month" value="'+ymNow()+'"></div>'+
      '<div><label>Branch</label><select id="pyBranch" class="in"><option value="">All</option>'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'">'+esc(b.BranchName)+'</option>';}).join('')+'</select></div>'+
      '<div style="align-self:end"><span id="pyStatus" class="py-status"></span></div></div>'+
      '<div id="pyActions" class="pm2-bar" style="display:none"><button class="btn ghost sm" id="pyBank">⤓ Bank file (CMS)</button> <button class="btn ghost sm" id="pyReg">⤓ Salary register (Excel)</button> <button class="btn ghost sm" id="pyRegPdf">⤓ Salary register (PDF)</button><span id="pyLockWrap"></span></div>'+
      '<div class="field" style="margin:10px 0 0"><label>Find employee</label><input id="pyFind" class="in" placeholder="Type a name or code…" autocomplete="off"></div>'+
      '<div id="pyDirty"></div><div id="pyWarn"></div><div id="pyTable"></div>';
    /* v298: no Run payroll button. Pick a month and the payroll for it appears; type a figure and it
       saves itself. See the auto-save block below for why this is safe on a payroll screen. */
    $id('pyMonth').onchange=function(){ payFlushNow(); loadPayslips(); };
    var _pb=$id('pyBranch'); if(_pb) _pb.onchange=function(){ payFlushNow(); loadPayslips(); };
    loadPayslips();
  }
  var PAY={slips:[],month:ymNow(),locked:false};

  /* ============================================================================================
     v297 — PAYROLL EDITS WERE BEING LOST WITHOUT A WORD.

     Typing into an addition or deduction only ever did this:

         s._other[k].amt = numv(inp.value); refreshRow(row,s); paintKpi();

     — it updated the in-memory slip and repainted the total. Nothing was sent anywhere. The ONLY
     thing that persists an edit is the "Run payroll" button (collectAdj() -> API.runPayroll).

     So you could type a ₹2,000 addition, watch the net go up to the rupee, close the app, come back,
     and find it gone. Not lost in transit — never saved at all, and nothing on screen ever said so.
     On payroll that is the worst possible failure: it looks exactly like success.

     Three layers now stand between a typed figure and losing it:
       1. A visible bar the moment anything is edited, with the count of affected staff and a Save
          button. It does not go away until the edit is saved.
       2. The browser's own "leave site?" prompt if the tab/app is closed while dirty.
       3. A draft on the device. If the app is killed, the phone dies, or the browser is force-quit —
          none of which fire step 2 — reopening the payroll screen offers the typing back.

     Deliberately NOT auto-saved. runPayroll recalculates every slip and replaces PAY.slips wholesale,
     so a save landing while somebody is mid-figure would redraw the row under their cursor. On payroll,
     an explicit Save is worth the extra tap.
     ============================================================================================ */
  var PAY_DIRTY=false;
  function payDraftKey(){ return 'nk_pay_draft_'+(PAY.month||ymNow())+'_'+((($id('pyBranch')||{}).value)||'all'); }

  /* ============================================================================================
     v298 — NO BUTTON AT ALL.

     Pick a month, the payroll appears. Type a figure, it saves itself. Nothing to press.

     THE DANGER, AND HOW IT IS AVOIDED. runPayroll recalculates every slip and returns a fresh set.
     The old runPay() then did PAY.slips = r.slips.map(initSlip) and paintPay() — a full redraw. Do
     that while somebody is halfway through typing "2000" and the input is destroyed and rebuilt from
     the server's copy: the caret jumps, and the two digits typed since the request went out are gone.
     On payroll that is not a cosmetic bug, it silently changes what a person is paid.

     So an auto-save NEVER repaints. It sends the figures, and on success does nothing to the DOM
     beyond a small "Saved" tick. The screen is already correct — pcCalc() computes every displayed
     total on the client from the same rules, so there is nothing on screen waiting to be corrected.
     The server's authoritative version is picked up on the next month change or page open.

     WRITES ARE SERIALISED. Payroll writes take a script-wide lock. Two saves in flight at once means
     the second waits, and if the user is still typing a third is already queued. So only one request
     is ever in the air; anything typed while it flies sets _payAgain, and exactly one more save runs
     when it lands. Typing fast can never queue up twenty writes.

     IF A SAVE FAILS, the amber unsaved bar comes straight back with a Retry, and the draft stays on
     the device. Nothing is ever quietly dropped.
     ============================================================================================ */
  var _payTimer=null, _paySaving=false, _payAgain=false, _payLastErr='';
  var PAY_AUTOSAVE_MS=1200;

  function payStatus(kind, text){
    var el=$id('pyStatus'); if(!el) return;
    if(!kind){ el.className='py-status'; el.innerHTML=''; return; }
    el.className='py-status py-status-'+kind;
    el.innerHTML=(kind==='saving'?'<span class="loader dark"></span> ':(kind==='saved'?'✓ ':'⚠ '))+esc(text||'');
  }
  /* Called when the month/branch is about to change — get anything pending onto the server first. */
  function payFlushNow(){ if(_payTimer){ clearTimeout(_payTimer); _payTimer=null; } if(PAY_DIRTY && !PAY.locked) paySave(); }

  function paySchedule(){
    if(PAY.locked) return;                       // a locked month is never written to
    if(_payTimer) clearTimeout(_payTimer);
    _payTimer=setTimeout(function(){ _payTimer=null; paySave(); }, PAY_AUTOSAVE_MS);
  }
  function paySave(){
    if(PAY.locked) return;
    if(_paySaving){ _payAgain=true; return; }    // one write at a time; remember that more arrived
    _paySaving=true; _payLastErr='';
    payStatus('saving','Saving…');
    var month=PAY.month||ymNow(), branch=(($id('pyBranch')||{}).value)||'';
    API.runPayroll(month, branch, collectAdj()).then(function(r){
      _paySaving=false;
      if(r&&r.ok){
        /* Deliberately NOT touching PAY.slips or calling paintPay() — see the note above. */
        payClearDirty();
        payStatus('saved','Saved');
        setTimeout(function(){ if(!PAY_DIRTY && !_paySaving) payStatus(null); }, 2500);
      } else {
        _payLastErr=(r&&r.error)||'Could not save';
        PAY_DIRTY=true; paintDirtyBar(); payStatus('err',_payLastErr);
      }
      if(_payAgain){ _payAgain=false; paySchedule(); }
    }).catch(function(){
      _paySaving=false; _payLastErr='No connection';
      PAY_DIRTY=true; paintDirtyBar(); payStatus('err','Not saved — will retry');
      if(_payAgain){ _payAgain=false; }
      setTimeout(function(){ if(PAY_DIRTY) paySchedule(); }, 8000);   // come back to it
    });
  }

  function payMarkDirty(){
    PAY_DIRTY=true;
    try{ localStorage.setItem(payDraftKey(), JSON.stringify({ts:Date.now(), adj:collectAdj()})); }catch(e){}
    paintDirtyBar();
    paySchedule();
  }
  function payClearDirty(){
    PAY_DIRTY=false;
    try{ localStorage.removeItem(payDraftKey()); }catch(e){}
    paintDirtyBar();
  }
  function dirtyCount(){ var a=collectAdj(); return Object.keys(a).length; }
  /* v298: with auto-save doing the work, this bar is now only for the case that MATTERS — a save that
     did not land. Normal typing shows the quiet "Saving…/Saved" tick by the month picker instead, so
     the screen is not shouting at somebody who has done nothing wrong. */
  function paintDirtyBar(){
    var box=$id('pyDirty'); if(!box) return;
    if(!PAY_DIRTY || !_payLastErr){ box.innerHTML=''; return; }
    var n=dirtyCount();
    box.innerHTML='<div class="py-dirty"><span class="py-dirty-ic">!</span>'+
      '<span style="flex:1"><b>Not saved</b> — '+esc(_payLastErr)+'. Changes for '+n+' staff member'+(n===1?'':'s')+
      ' are still only on this device.</span>'+
      '<button class="btn sm" id="pyDirtySave">Retry</button></div>';
    var b=$id('pyDirtySave'); if(b) b.onclick=function(){ _payLastErr=''; paintDirtyBar(); paySave(); };
  }
  /* The app being killed does not fire beforeunload, so the draft above is the real safety net.
     This covers the ordinary case of closing the tab or navigating away. */
  try{ window.addEventListener('beforeunload', function(e){
    if(!PAY_DIRTY) return;
    e.preventDefault(); e.returnValue='You have unsaved payroll changes.'; return e.returnValue;
  }); }catch(e){}

  /* Offer back anything the device still holds for this month+branch. */
  function payOfferDraft(){
    var raw=null; try{ raw=localStorage.getItem(payDraftKey()); }catch(e){}
    if(!raw) return;
    var d=null; try{ d=JSON.parse(raw); }catch(e){}
    if(!d || !d.adj || !Object.keys(d.adj).length){ try{ localStorage.removeItem(payDraftKey()); }catch(e){} return; }
    var when=new Date(d.ts||Date.now());
    var box=$id('pyDirty'); if(!box) return;
    box.innerHTML='<div class="py-draft"><span style="flex:1">Unsaved payroll edits from '+
      esc(when.toLocaleDateString()+', '+when.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))+
      ' were found on this device.</span>'+
      '<button class="btn sm" id="pyDraftYes">Restore</button> '+
      '<button class="btn sm ghost" id="pyDraftNo">Discard</button></div>';
    var y=$id('pyDraftYes'), n=$id('pyDraftNo');
    if(y) y.onclick=function(){ payApplyDraft(d.adj); };
    if(n) n.onclick=function(){ try{ localStorage.removeItem(payDraftKey()); }catch(e){} box.innerHTML=''; };
  }
  /* Put a restored draft back onto the slips currently on screen. Anyone who has left since the draft
     was written is simply skipped — we never invent a slip for somebody payroll no longer lists. */
  function payApplyDraft(adj){
    var applied=0;
    PAY.slips.forEach(function(s){
      var a=adj[s.empId]; if(!a) return;
      applied++;
      s._inc=a.incentive||''; s._bon=a.bonus||''; s._trv=a.travel||''; s._pet=a.petrol||''; s._mis=a.misExp||'';
      s._other=(a.other||[]).slice(); s._dedOther=(a.dedOther||[]).slice();
      s._otherDed=a.otherDed||''; s._otherDedLabel=a.otherDedLabel||'';
      s._lab=a.labTest||''; s._adv=a.advLab||'';
      if(a.pfOv!=='') s._pfOv=a.pfOv; if(a.esiOv!=='') s._esiOv=a.esiOv; if(a.ptOv!=='') s._ptOv=a.ptOv;
    });
    paintPay(); PAY_DIRTY=true; paintDirtyBar();
    toast(applied?('Restored unsaved edits for '+applied+' staff — press Save now to keep them'):'Those staff are not in this payroll run any more', !applied);
  }
  var R='#A32D2D', G='#0F6E56';
  function m0(n){ return '₹'+money(n); }
  function myActual(s){ return Number(s.actualSalary)||Number(s.basic)||0; }
  function myBasic(s){ return Math.round(myActual(s)*0.55); }
  function numv(v){ return Math.max(0,Math.round(Number(v)||0)); }
  /* Blank means "use the calculated figure". 0 is a real override meaning deduct nothing. */
  function hasOv(v){ return v!==undefined && v!==null && String(v).trim()!==''; }
  function stop(e){ e.stopPropagation(); }
  /* Constants, kept identical to Code.gs. Track A = PF-deducted staff, track B = gross / no-PF. */
  var PC_BAS=0.55, PC_PFBAS=0.50, PC_PFHRA=0.40, PC_STD_DAYS=26, PC_PT_FREE=12000, PC_BONUS_DAYS=2;
  /* Exact mirror of payCalc_ in Code.gs, so the number on screen is always the number that gets saved.
     PF staff: basic 50% / HRA 40% / conveyance 10%, a fixed 26 pay days, each head scaled and rounded
     on its own; PF = 12% of earned basic capped 1,800; ESIC = 0.75% of earned basic rounded down;
     PT = nil up to 12,000 earned, then 200. Gross / no-PF staff: no split, per day = actual x 12/365. */
  function pcCalc(s){
    var inc=numv(s._inc), bon=numv(s._bon), trv=numv(s._trv), pet=numv(s._pet), mis=numv(s._mis);
    var addOther=0; (s._other||[]).forEach(function(o){ addOther+=numv(o.amt); });
    var additions=inc+bon+trv+pet+mis+addOther;   /* attBonus is added below, once perDay is known */
    var actual=Number(s.actualSalary)||Number(s.basic)||0;
    var grossMode=String(s.payMode||'')==='gross';
    var pfOn=!grossMode && s.pfOn!==false;
    var esiOn=!grossMode && s.esiOn!==false;
    var lop=Number(s.lopDays)||0, days=Number(s.totalDays)||30;
    var basic,hra,conv,perDay,payDays,attDays,eB,eH,eC,earned,lopAmt;
    var convOn=pfOn && s.convOn===true;
    if(pfOn){
      payDays=PC_STD_DAYS; attDays=Math.max(0,Math.min(payDays,payDays-lop));
      if(convOn){ basic=Math.round(actual*PC_PFBAS); hra=Math.round(actual*PC_PFHRA); }
      else      { basic=Math.round(actual*PC_BAS);   hra=Math.round(actual*0.45);     }
      conv=actual-basic-hra;
      perDay=payDays?actual/payDays:0;
      eB=Math.round(basic/payDays*attDays); eH=Math.round(hra/payDays*attDays); eC=Math.round(conv/payDays*attDays);
      earned=eB+eH+eC; lopAmt=actual-earned;
    } else {
      payDays=days; attDays=Math.max(0,days-lop);
      basic=Math.round(actual*PC_BAS); hra=actual-basic; conv=0;
      perDay=actual*12/365;
      lopAmt=Math.min(actual,Math.round(perDay*lop)); earned=actual-lopAmt;
      var br=actual>0?(earned/actual):0;
      eB=Math.round(basic*br); eH=earned-eB; eC=0;
    }
    /* Full attendance bonus — exact mirror of payCalc_. Present every working day AND no leave of any
       kind (paid or unpaid) earns 2 extra days at the person's own daily rate, on top of full salary.
       It is an addition, so it never enters the PF / ESIC / PT base. */
    var paidLeave=Number(s.leaveDays)||0, freeLeave=Number(s.lopFree)||0;
    var worksSunday=(s.worksSunday===true);
    /* Sunday-working staff only. Everyone else already has their rest day paid inside the salary. */
    var attBonus=(actual>0 && worksSunday && lop===0 && paidLeave===0 && freeLeave===0)
                 ? Math.round(perDay*PC_BONUS_DAYS) : 0;
    additions+=attBonus;
    var gross=earned+additions;
    var pf=0, esi=0, pt=0, pfAuto=0, esiAuto=0, ptAuto=0;
    if(actual>0 && !grossMode){
      pfAuto=pfOn?Math.min(1800,Math.round(eB*0.12)):0;
      esiAuto=esiOn?Math.floor(eB*0.0075):0;
      ptAuto=(s.ptAmt===undefined||s.ptAmt===''||s.ptAmt===null)?((earned>PC_PT_FREE)?200:0):(Number(s.ptAmt)||0);
      pf=pfAuto; esi=esiAuto; pt=ptAuto;
      if(hasOv(s._pfOv))  pf=numv(s._pfOv);
      if(hasOv(s._esiOv)) esi=numv(s._esiOv);
      if(hasOv(s._ptOv))  pt=numv(s._ptOv);
    }
    var otherDed=numv(s._otherDed);
    /* Recoveries — lab tests, the advance lab / oblic loan instalment and any ad-hoc rows. They come
       off net pay only; PF, ESIC and PT are never computed on them. */
    var lab=numv(s._lab), adv=numv(s._adv), dedOther=0;
    (s._dedOther||[]).forEach(function(o){ dedOther+=numv(o.amt); });
    var statutory=pf+esi+pt+otherDed+lab+adv+dedOther;
    return {inc:inc,bon:bon,trv:trv,pet:pet,mis:mis,addOther:addOther,other:(s._other||[]),additions:additions,
      actual:actual,basic:basic,hra:hra,conv:conv,convOn:convOn,payDays:payDays,attDays:attDays,perDay:Math.round(perDay),
      attBonus:attBonus,attBonusDays:(attBonus>0?PC_BONUS_DAYS:0),paidLeave:paidLeave,lopDays:lop,
      freeLeave:freeLeave,worksSunday:worksSunday,
      earnBasic:eB,earnHra:eH,earnConv:eC,earned:earned,gross:gross,lopAmt:lopAmt,
      pf:pf,esi:esi,pt:pt,pfAuto:pfAuto,esiAuto:esiAuto,ptAuto:ptAuto,
      otherDed:otherDed,otherDedLabel:s._otherDedLabel||'',
      lab:lab,adv:adv,dedOther:dedOther,dedOtherList:(s._dedOther||[]),
      ded:lopAmt+statutory,net:gross-statutory,grossMode:grossMode,pfOn:pfOn,noSalary:actual<=0};
  }
  /* v298: picking a month is now the whole interaction. If that month has never been run, listPayslips
     returns nothing (it only READS the Payslips sheet) — which is exactly what the Run payroll button
     used to be for. Generate it automatically instead of showing an empty screen with nothing to press. */
  function loadPayslips(){
    PAY.month=$id('pyMonth').value||ymNow();
    payStatus('saving','Loading…');
    API.listPayslips(PAY.month, ($id('pyBranch')||{}).value||'').then(function(r){
      if(!(r&&r.ok)){ payStatus('err',(r&&r.error)||'Could not load'); return; }
      PAY.slips=(r.slips||[]).map(initSlip); PAY.locked=!!r.locked;
      PAY_DIRTY=false; _payLastErr='';
      if(!PAY.slips.length && !PAY.locked){
        payStatus('saving','Preparing '+PAY.month+'…');
        runPay(true);            // first time this month has been opened — build it
        return;
      }
      payStatus(null); paintPay(); payOfferDraft();
    }).catch(function(){ payStatus('err','Could not load'); });
  }
  function initSlip(s){
    s._inc=Number(s.addIncentive)||0; s._bon=Number(s.addBonus)||0; s._trv=Number(s.addTravel)||0;
    s._other=[]; if(s.addOtherJson){ try{ s._other=JSON.parse(s.addOtherJson)||[]; }catch(e){ s._other=[]; } }
    /* Legacy rescue for pre-split slips: if nothing was itemised but a total exists, show it as
       Incentive. The attendance bonus is generated by the engine, not typed, so it must be taken out
       of that total first - otherwise it lands in the Incentive box and gets counted a second time. */
    var _legacy=Number(s.additions)-(Number(s.attBonus)||0);
    if(!s._inc&&!s._bon&&!s._trv&&!s._other.length&&_legacy>0) s._inc=_legacy;
    s._pet=Number(s.addPetrol)||0; s._mis=Number(s.addMis)||0;
    s._lab=Number(s.labTest)||0; s._adv=Number(s.advLab)||0;
    s._dedOther=[]; if(s.dedOtherJson){ try{ s._dedOther=JSON.parse(s.dedOtherJson)||[]; }catch(e){ s._dedOther=[]; } }
    s._otherDed=Number(s.otherDed)||0; s._otherDedLabel=s.otherDedLabel||'';
    if(!Number(s.actualSalary)) s.actualSalary=Number(s.basic)||0;   // pre-migration slips
    s._pfOv=(s.pfOverride===0||s.pfOverride)?String(s.pfOverride):'';
    s._esiOv=(s.esiOverride===0||s.esiOverride)?String(s.esiOverride):'';
    s._ptOv=(s.ptOverride===0||s.ptOverride)?String(s.ptOverride):'';
    return s;
  }
  /* gather each employee's split additions + other deduction for the backend */
  function collectAdj(){ var m={}; PAY.slips.forEach(function(s){
    var inc=numv(s._inc),bon=numv(s._bon),trv=numv(s._trv),pet=numv(s._pet),mis=numv(s._mis);
    var other=(s._other||[]).map(function(o){return {label:String((o&&o.label)||'Other'),amt:numv(o&&o.amt)};}).filter(function(o){return o.amt>0;});
    var dedOther=(s._dedOther||[]).map(function(o){return {label:String((o&&o.label)||'Other deduction'),amt:numv(o&&o.amt)};}).filter(function(o){return o.amt>0;});
    var od=numv(s._otherDed), lab=numv(s._lab), adv=numv(s._adv);
    var hasO=hasOv(s._pfOv)||hasOv(s._esiOv)||hasOv(s._ptOv);
    if(inc||bon||trv||pet||mis||other.length||od||lab||adv||dedOther.length||hasO)
      m[s.empId]={incentive:inc,bonus:bon,travel:trv,petrol:pet,misExp:mis,other:other,
      otherDed:od,otherDedLabel:s._otherDedLabel||'',
      labTest:lab,advLab:adv,dedOther:dedOther,
      pfOv:(hasOv(s._pfOv)?s._pfOv:''),esiOv:(hasOv(s._esiOv)?s._esiOv:''),ptOv:(hasOv(s._ptOv)?s._ptOv:'')};
  }); return m; }
  /* quiet=true is the automatic re-run fired by an attendance change - same call, softer message. */
  function runPay(quiet){ var b=$id('pyRun'); if(b){ b.disabled=true; b.textContent='Running…'; } PAY.month=$id('pyMonth').value||ymNow();
    var find=$id('pyFind'), q=find?find.value:'';
    API.runPayroll(PAY.month, ($id('pyBranch')||{}).value||'', collectAdj()).then(function(r){
      if(b){ b.disabled=false; b.textContent='Run payroll'; }   /* v298: button removed; harmless no-op kept for older cached markup */
      if(r&&r.ok){ PAY.slips=(r.slips||[]).map(initSlip);
        payClearDirty(); _payLastErr=''; payStatus(null);
        /* v298: runPay is now only reached for a month being built for the first time, or an attendance
           edit forcing a recalc — never while somebody is typing. Repainting here is safe. */
        if(quiet!==true) toast('Payroll ready for '+r.slips.length+' staff');
        else toast('Attendance applied — payroll updated');
        paintPay();
        /* keep whatever the user was searching for */
        var f2=$id('pyFind'); if(f2&&q){ f2.value=q; f2.oninput(); }
      } else toast((r&&r.error)||'Failed',true); }); }
  /* Working days with no attendance record at all. Nothing is deducted from here directly —
     ticking a day writes a normal approved 'absent' row into Attendance, and the next payroll run
     picks it up through the same LOP maths as any other absence. One source of truth. */
  function openBlankDays(){
    openModal('Missing attendance days','<div id="bdBody"><div class="center-load"><span class="loader dark"></span> Loading…</div></div>',
      '<button class="btn ghost" onclick="closeModal()">Close</button><button class="btn ghost" id="bdPresent">Mark present</button><button class="btn" id="bdSave">Mark absent</button>');
    var b0=$id('bdSave'); if(b0) b0.disabled=true;
    var b1=$id('bdPresent'); if(b1) b1.disabled=true;
    API.listBlankDays(PAY.month, ($id('pyBranch')||{}).value||'').then(function(r){
      var b=$id('bdBody'); if(!b) return;
      if(!r||!r.ok){ b.innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; return; }
      var people=r.people||[];
      if(!people.length){ b.innerHTML='<div class="empty">No gaps — every working day this month has a record.</div>'; return; }
      var total=0; people.forEach(function(p){ total+=p.days.length; });
      b.innerHTML='<div class="bd-alert"><b>'+total+' working days</b> across <b>'+people.length+' staff</b> have no attendance record, and every one of them is <b>already being deducted</b> as lost pay.<br>Sundays, holidays, approved leave and days before joining are excluded.</div>'+
        '<div style="font-size:12px;color:#9aa0a6;margin:8px 0 10px;line-height:1.6">Tick the days where the punch simply failed and press <b>Mark present</b> — that writes a present day into Attendance and the deduction goes away. Use <b>Mark absent</b> to make a genuine absence explicit.</div>'+
        people.map(function(p,pi){
          return '<div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px">'+
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><b style="font-size:13px">'+esc(p.name)+'</b>'+
            '<span style="font-size:11px;color:#9aa0a6">'+p.days.length+' day'+(p.days.length>1?'s':'')+' <button class="btn ghost sm" data-bdall="'+pi+'" style="margin-left:6px;padding:3px 8px;font-size:11px">All</button></span></div>'+
            '<div style="display:flex;flex-wrap:wrap;gap:6px">'+p.days.map(function(d,di){
              return '<label class="bd-day"><input type="checkbox" data-bd="'+pi+'" data-bdd="'+di+'"> '+esc(dLabel(d))+'</label>'; }).join('')+'</div></div>';
        }).join('');
      function sync(){ var n=b.querySelectorAll('input[data-bd]:checked').length;
        var bt=$id('bdSave'), bp=$id('bdPresent');
        if(bt){ bt.disabled=!n; bt.textContent=n?('Mark '+n+' absent'):'Mark absent'; }
        if(bp){ bp.disabled=!n; bp.textContent=n?('Mark '+n+' present'):'Mark present'; } }
      b.querySelectorAll('input[data-bd]').forEach(function(c){ c.onchange=sync; });
      b.querySelectorAll('[data-bdall]').forEach(function(x){ x.onclick=function(){
        var pi=x.getAttribute('data-bdall'), boxes=b.querySelectorAll('input[data-bd="'+pi+'"]'), any=false;
        boxes.forEach(function(c){ if(!c.checked) any=true; });
        boxes.forEach(function(c){ c.checked=any; }); sync(); }; });
      sync();
      function apply(status){
        var rows=[];
        b.querySelectorAll('input[data-bd]:checked').forEach(function(c){
          var p=people[+c.getAttribute('data-bd')];
          rows.push({empId:p.empId, date:p.days[+c.getAttribute('data-bdd')], status:status}); });
        if(!rows.length) return;
        var msg=(status==='present')
          ? 'Mark '+rows.length+' day'+(rows.length>1?'s':'')+' as PRESENT? The pay currently deducted for them is restored automatically.'
          : 'Mark '+rows.length+' day'+(rows.length>1?'s':'')+' as ABSENT? They are already deducted; this makes the absence explicit in Attendance.';
        if(!confirm(msg)) return;
        var bt=$id('bdSave'), bp=$id('bdPresent');
        if(bt) bt.disabled=true; if(bp) bp.disabled=true;
        API.confirmAbsent(rows).then(function(r2){
          if(r2&&r2.ok){ closeModal(); toast(r2.saved+' day'+(r2.saved>1?'s':'')+' marked '+status+' — applying…'); loadPayslips(); }
          else { toast((r2&&r2.error)||'Failed',true); sync(); } });
      }
      $id('bdSave').onclick=function(){ apply('absent'); };
      $id('bdPresent').onclick=function(){ apply('present'); };
    });
  }
  function dLabel(ds){ try{ var p=String(ds).split('-'), d=new Date(+p[0],+p[1]-1,+p[2]);
    return d.getDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]+' · '+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]; }catch(e){ return ds; } }

  function paintPay(){
    var box=$id('pyTable'); if(!box) return; var act=$id('pyActions'); if(act) act.style.display=PAY.slips.length?'flex':'none';
    if(!PAY.slips.length){ box.innerHTML='<div class="empty">No staff to show for this month.</div>'; return; }
    box.innerHTML=
      '<div id="pyKpi" class="pyk-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px"></div>'+
      '<div class="py2 py2-head"><div>Employee</div><div class="r">Actual / Basic</div><div class="r" style="color:'+G+'">Additions</div><div class="r" style="color:'+R+'">Deductions</div><div class="r">Net payable</div><div></div></div>'+
      '<div id="pyRows"></div>'+
      '<div style="font-size:11px;color:#9aa0a6;margin-top:10px">Tap a row to open its Additions &amp; Deductions detail. Edit an amount and it saves by itself — watch the tick beside the month. PF 12% of basic · ESI 0.75% if gross ≤ ₹21,000 (adding pay can switch ESI off) · PT ₹200 · LOP = base ÷ days × absent.</div>';
    var rows=$id('pyRows');
    PAY.slips.forEach(function(s,i){
      var c=pcCalc(s);
      var row=document.createElement('div'); row.className='py-row'; row.setAttribute('data-i',i);
      row.setAttribute('data-find',((s.name||'')+' '+(s.empId||'')).toLowerCase());
      row.innerHTML=
        '<div class="py2 py-main">'+
          '<div><b>'+esc(s.name)+'</b><div class="py-sub">'+(c.noSalary?'<span class="py-setsal" data-setsal="'+esc(s.empId)+'">set salary →</span>':(c.attDays+'/'+c.payDays+(c.pfOn?' pay days':' paid')+(Number(s.lopDays)>0?' · '+s.lopDays+' LOP':'')))+(c.grossMode?' · gross':'')+(Number(s.blankDays)>0?' · <span style="color:#A32D2D">'+s.blankDays+'d no record</span>':'')+'</div></div>'+
          '<div class="r">'+(c.noSalary?'—':m0(c.actual)+'<div class="py-sub">basic '+m0(c.basic)+'</div>')+'</div>'+
          '<div class="r" data-c="add" style="color:'+G+'">'+(c.additions?'+'+m0(c.additions):'—')+'</div>'+
          '<div class="r" data-c="ded" style="color:'+R+'">−'+m0(c.ded)+'</div>'+
          '<div class="r" data-c="net" style="font-weight:600">'+m0(c.net)+'</div>'+
          '<div class="r"><span class="py-chev">▶</span></div>'+
        '</div>'+
        '<div class="py-det" style="display:none">'+buildDetail(s,i)+'</div>';
      rows.appendChild(row);
    });
    wireRows();
    paintKpi();
    var bk=$id('pyBank'); if(bk) bk.onclick=function(){ bankXls(computed(),PAY.month); };
    var rg=$id('pyReg'); if(rg) rg.onclick=function(){ registerXls(computed(),PAY.month); };
    var rgp=$id('pyRegPdf'); if(rgp) rgp.onclick=function(){ registerPdf(computed(),PAY.month); };
    wireFind();
    paintLock();
  }
  /* Type-ahead over the rows already on screen. Hiding beats re-rendering: an open row keeps its
     typed additions, and nothing has to be fetched again. */
  function wireFind(){
    var box=$id('pyFind'); if(!box) return;
    box.oninput=function(){
      var q=box.value.trim().toLowerCase(), n=0;
      document.querySelectorAll('#pyRows .py-row').forEach(function(r){
        var hit=!q||r.getAttribute('data-find').indexOf(q)>=0;
        r.style.display=hit?'':'none'; if(hit) n++;
      });
      var e=$id('pyFindEmpty');
      if(e) e.style.display=(q&&!n)?'':'none';
    };
  }
  /* Only the Director sees the lock control. Locking freezes a month so a run that has already been
     paid out cannot be silently recomputed by anyone else. */
  function isDirector(){ var r=String((S.user&&S.user.Role)||''); return r==='Director'||r==='MD'||r==='Owner'; }
  function paintLock(){
    var w=$id('pyLockWrap'); if(!w) return;
    if(PAY.locked){
      w.innerHTML=' <span class="py-lockchip">🔒 Locked</span>'+(isDirector()?' <button class="btn ghost sm" id="pyUnlock">Reopen month</button>':'');
      var ub=$id('pyUnlock'); if(ub) ub.onclick=function(){ setLock('unlock'); };
    } else {
      w.innerHTML=isDirector()?' <button class="btn ghost sm" id="pyLock">🔒 Approve &amp; lock</button>':'';
      var lb=$id('pyLock'); if(lb) lb.onclick=function(){ setLock('lock'); };
    }
    var run=$id('pyRun'); if(run){ run.disabled=!!PAY.locked; run.title=PAY.locked?'This month is locked — reopen it first.':''; }
  }
  function setLock(mode){
    var msg=mode==='lock'
      ? 'Lock '+PAY.month+'? Nobody will be able to re-run or change these figures until you reopen it.'
      : 'Reopen '+PAY.month+'? Payroll can then be recomputed, which will overwrite the figures already approved.';
    if(!confirm(msg)) return;
    API.approvePayroll(PAY.month, ($id('pyBranch')||{}).value||'', mode).then(function(r){
      if(r&&r.ok){ PAY.locked=(mode==='lock'); toast(mode==='lock'?'Month locked':'Month reopened'); paintLock(); }
      else toast((r&&r.error)||'Failed',true);
    });
  }
  /* Whole-payroll Salary Register PDF (all staff, grouped earnings/deductions + totals) via print iframe. */
  function registerPdf(slips,month){
    if(!slips||!slips.length){ toast('No payslips to export.',true); return; }
    var brSel=$id('pyBranch'); var brLabel=(brSel&&brSel.value)?(brSel.options[brSel.selectedIndex].text):'All branches';
    var mlabel=month; try{ var p=String(month).split('-'); mlabel=new Date(+p[0],+p[1]-1,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'}); }catch(e){}
    var today=new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
    /* Landscape A4 only takes so many columns, so petrol + MIS ride in "Other add." and the lab-test /
       advance-loan / ad-hoc recoveries ride in "Other ded." Every rupee is still counted; the itemised
       breakdown is on the Excel register and on each payslip. */
    var keys=['earnBasic','addIncentive','addBonus','addTravel','addOtherAll','gross','lopAmt','pf','esi','pt','otherDedAll','deductions','net'];
    var tot={}; keys.forEach(function(k){tot[k]=0;});
    function c(v){ return Number(v)>0?money(v):'—'; }
    function n(v){ return money(Number(v)||0); }
    var body=slips.map(function(s){
      s.addOtherAll=(Number(s.addOther)||0)+(Number(s.addPetrol)||0)+(Number(s.addMis)||0);
      s.otherDedAll=(Number(s.otherDed)||0)+(Number(s.labTest)||0)+(Number(s.advLab)||0)+(Number(s.dedOther)||0);
      keys.forEach(function(k){ tot[k]+=Number(s[k])||0; });
      var zero=!(Number(s.basic)||Number(s.net));
      return '<tr'+(zero?' class="z"':'')+'>'+
        '<td class="l">'+esc(s.name||'')+'<div class="sub">'+esc(s.empId||'')+' · '+(s.paidDays||0)+'/'+(s.totalDays||0)+(Number(s.lopDays)>0?' · '+s.lopDays+' abs':'')+(Number(s.perDay)>0?' · ₹'+money(s.perDay)+'/day':'')+'</div></td>'+
        '<td>'+n(s.earnBasic||s.basic)+'</td><td>'+c(s.addIncentive)+'</td><td>'+c(s.addBonus)+'</td><td>'+c(s.addTravel)+'</td><td>'+c(s.addOtherAll)+'</td><td class="b">'+n(s.gross)+'</td>'+
        '<td>'+c(s.lopAmt)+'</td><td>'+c(s.pf)+'</td><td>'+c(s.esi)+'</td><td>'+c(s.pt)+'</td><td>'+c(s.otherDedAll)+'</td><td class="b">'+n(s.deductions)+'</td>'+
        '<td class="b">'+n(s.net)+'</td></tr>';
    }).join('');
    var totRow='<tr class="tot"><td class="l">TOTAL ('+slips.length+' staff)</td>'+keys.map(function(k){return '<td>'+money(tot[k])+'</td>';}).join('')+'</tr>';
    var html='<!doctype html><html><head><meta charset="utf-8"><title>Salary Register '+esc(mlabel)+'</title>'+
      '<style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0}'+
      '.hd{border-bottom:2px solid #DA1017;padding-bottom:8px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:flex-start}'+
      '.h1{color:#DA1017;font-size:20px;font-weight:800}.sub{color:#666;font-size:11px}'+
      'table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:0.5px solid #cfcfcf;padding:3px 5px;text-align:right;white-space:nowrap}'+
      'th{background:#f3f4f6}td.l,th.l{text-align:left}td.l .sub{font-size:8px;color:#999}td.b{font-weight:700}'+
      '.ge{background:#e1f5ee;color:#0f6e56}.gd{background:#fcebeb;color:#a32d2d}'+
      'tr.z td{color:#9aa0a6}tr.tot td{font-weight:700;background:#f3f4f6;border-top:1.5px solid #999}'+
      '.sign{display:flex;justify-content:space-between;margin-top:26px;font-size:11px;color:#444}'+
      '.sign div{border-top:0.5px solid #999;padding-top:4px;width:30%;text-align:center}.ft{margin-top:12px;color:#999;font-size:9px;text-align:center}</style></head><body>'+
      '<div class="hd"><div><div class="h1">NAKODA</div><div class="sub">Diagnostics And Research Center</div></div>'+
        '<div style="text-align:right"><div style="font-weight:700;font-size:14px">Salary Register</div><div class="sub">'+esc(mlabel)+' · '+esc(brLabel)+' · '+slips.length+' staff</div></div></div>'+
      '<table><thead>'+
        '<tr><th rowspan="2" class="l">Employee</th><th colspan="6" class="ge">Earnings (+)</th><th colspan="6" class="gd">Deductions (−)</th><th rowspan="2">Net</th></tr>'+
        '<tr><th>Basic</th><th>Incent.</th><th>Bonus</th><th>Travel</th><th>Other</th><th>Gross</th><th>LOP</th><th>PF</th><th>ESI</th><th>PT</th><th>Other</th><th>Total</th></tr>'+
      '</thead><tbody>'+body+totRow+'</tbody></table>'+
      '<div class="sign"><div>Prepared by</div><div>Verified by</div><div>Authorised signatory</div></div>'+
      '<div class="ft">Generated '+today+' · Nakoda MIS · PF staff: basic 50% / HRA 40% / conveyance 10%, 26 pay days, PF 12% of earned basic (max ₹1,800), ESIC 0.75% of earned basic, PT nil to ₹12,000 then ₹200 · Gross staff: no split, per day = salary × 12 ÷ 365 · Basic column shows EARNED basic · Other add. includes petrol &amp; MIS expenses · Other ded. includes lab test &amp; advance lab / loan</div>'+
      '</body></html>';
    var ifr=document.createElement('iframe'); ifr.style.position='fixed'; ifr.style.right='0'; ifr.style.bottom='0'; ifr.style.width='0'; ifr.style.height='0'; ifr.style.border='0';
    document.body.appendChild(ifr);
    var d=ifr.contentWindow.document; d.open(); d.write(html); d.close();
    setTimeout(function(){ try{ ifr.contentWindow.focus(); ifr.contentWindow.print(); }catch(e){} setTimeout(function(){ if(ifr.parentNode) ifr.parentNode.removeChild(ifr); },60000); }, 400);
    toast('Opening Salary Register PDF — choose "Save as PDF"');
  }
  /* the two-column detail (additions with custom lines + button, deductions with other-deduction + PDF) */
  function buildDetail(s,i){
    var c=pcCalc(s);
    /* Staff with no PF cut are paid a flat gross, so a 50/40/10 split would mean nothing to whoever is
       checking the sheet. They get one line instead. The figures are still calculated and saved. */
    var showSplit=(!c.grossMode && c.pfOn!==false);
    return '<div class="py-box"><div class="py-bt" style="color:'+G+'">EARNINGS (+)</div>'+
        (showSplit?(splitHead()+
                    splitLi('Basic · '+(c.convOn?'50':'55')+'%',c.basic,c.earnBasic)+
                    splitLi('HRA · '+(c.convOn?'40':'45')+'%',c.hra,c.earnHra)+
                    (c.convOn?splitLi('Conveyance · 10%',c.conv,c.earnConv):'')+
                    '<div class="py-li" style="border-top:0.5px solid #e2e5ea;padding-top:5px"><span>Gross earned</span>'+
                      '<span style="width:150px;text-align:right"><span style="display:inline-block;width:72px;color:#9aa0a6">'+m0(c.actual)+'</span>'+
                      '<span style="display:inline-block;width:78px;font-weight:600">'+m0(c.earned)+'</span></span></div>'):
                   ('<div class="py-li"><span>Gross salary</span><span>'+m0(c.actual)+'</span></div>'))+
        bonusLi(c)+
        addLi(i,'Incentive','_inc',s._inc)+addLi(i,'Bonus','_bon',s._bon)+addLi(i,'Travel / arrears','_trv',s._trv)+
        addLi(i,'Petrol cost','_pet',s._pet)+addLi(i,'MIS expenses','_mis',s._mis)+
        otherAddLines(i,s._other)+
        '<button class="py-addbtn" data-oadd="'+i+'">+ Add other addition</button>'+
        '<div class="py-lt"><span>Total additions</span><span data-c="addtot" style="color:'+G+'">'+m0(c.additions)+'</span></div></div>'+
      '<div class="py-box"><div class="py-bt" style="color:'+R+'">DEDUCTIONS (−)</div>'+
        dedLop(s,c.lopAmt)+dedPresent(s)+
        (c.grossMode?'':(dedOv(i,'Provident fund <span class="py-lopsub">12% of earned basic, max ₹1,800</span>','_pfOv',s._pfOv,c.pfAuto)+
                    dedOv(i,'ESIC <span class="py-lopsub">0.75% of earned basic</span>','_esiOv',s._esiOv,c.esiAuto)+
                    dedOv(i,'Professional tax <span class="py-lopsub">nil to ₹12,000 earned, then ₹200</span>','_ptOv',s._ptOv,c.ptAuto)))+
        addLi(i,'Lab test charges','_lab',s._lab)+
        addLi(i,'Advance lab / oblic loan','_adv',s._adv)+
        '<div class="py-li" style="gap:6px"><input data-otherlbl="'+i+'" value="'+esc(s._otherDedLabel||'')+'" placeholder="Other deduction (advance / loan)" style="flex:1;min-width:0"><input type="number" min="0" data-otherded="'+i+'" value="'+(Number(s._otherDed)>0?Number(s._otherDed):'')+'" placeholder="0" style="width:80px"></div>'+
        otherDedLines(i,s._dedOther)+
        '<button class="py-addbtn" data-dadd="'+i+'">+ Add other deduction</button>'+
        '<div class="py-lt"><span>Total deductions</span><span data-c="dedtot" style="color:'+R+'">−'+m0(c.ded)+'</span></div>'+
        '<div style="margin-top:8px;text-align:right"><button class="btn ghost sm" data-pdf="'+esc(s.empId)+'">⤓ Download PDF</button></div></div>'+
      '<div class="py-att" data-att="'+i+'"><div class="py-bt" style="color:#185FA5">ATTENDANCE</div><div class="center-load" style="padding:8px 0"><span class="loader dark"></span></div></div>';
  }
  function addLi(i,label,key,val){ return '<div class="py-li"><span>'+label+'</span><input type="number" min="0" data-i="'+i+'" data-key="'+key+'" value="'+(Number(val)>0?Number(val):'')+'" placeholder="0"></div>'; }
  /* Rate vs Earned, side by side, the same two blocks the accountant's PF workbook uses. Rate is the
     full month; Earned is after attendance. Every deduction downstream is charged on Earned. */
  function splitHead(){ return '<div class="py-li" style="padding-bottom:2px"><span></span>'+
    '<span style="width:150px;text-align:right;font-size:10px;color:#9aa0a6">'+
      '<span style="display:inline-block;width:72px">RATE</span><span style="display:inline-block;width:78px">EARNED</span></span></div>'; }
  /* Read-only. Earned automatically by a completely clean month; there is nothing to type. Shown as a
     dash when it was not earned so the row does not vanish and leave people wondering. */
  function bonusLi(c){
    if(!(c.actual>0) || !c.worksSunday) return '';   /* hidden entirely for staff with Sunday off */
    var got=c.attBonus>0;
    return '<div class="py-li"'+(got?' style="color:#0F6E56"':'')+'><span>Full attendance bonus · '+PC_BONUS_DAYS+'d'+
      '<div class="py-lopsub">'+(got?('₹'+money(c.perDay)+' × '+PC_BONUS_DAYS+' — no leave taken'):
        ('not earned — '+(!c.worksSunday?'Sunday is a day off'
                        :c.lopDays>0?((c.lopDays%1?c.lopDays.toFixed(1):c.lopDays)+' LOP day'+(c.lopDays===1?'':'s')+' this month')
                        :c.paidLeave>0?(c.paidLeave+' day'+(c.paidLeave===1?'':'s')+' leave taken this month')
                        :(c.freeLeave+' free leave day'+(c.freeLeave===1?'':'s')+' used'))))+'</div></span>'+
      '<span>'+(got?('+'+m0(c.attBonus)):'—')+'</span></div>';
  }
  function splitLi(label,rate,earned){ return '<div class="py-li"><span>'+label+'</span>'+
    '<span style="width:150px;text-align:right"><span style="display:inline-block;width:72px;color:#9aa0a6">'+m0(rate)+'</span>'+
    '<span style="display:inline-block;width:78px">'+m0(earned)+'</span></span></div>'; }
  /* An editable deduction: leave it blank and the calculated figure (shown greyed as the placeholder)
     applies; type a number and that wins for this month only. */
  function dedOv(i,label,key,val,auto){
    var ov=hasOv(val);
    return '<div class="py-li"><span>'+label+'</span><span class="py-ovw">'+
      (ov?'<span class="py-reset" data-drst="'+i+'" data-dk="'+key+'" title="Back to the calculated amount">↺</span>':'')+
      '<input type="number" min="0" data-dov="'+i+'" data-dk="'+key+'" class="'+(ov?'ov':'auto')+'" value="'+(ov?esc(val):numv(auto))+'"></span></div>';
  }
  /* Read-only, driven entirely by Attendance. The sub-line shows exactly what made up the days so
     an unexpected cut can be traced without leaving the screen. */
  function dedLop(s,val){
    var d=Number(s.lopDays)||0, parts=[];
    if(Number(s.lopAbsent)>0) parts.push(s.lopAbsent+' absent');
    if(Number(s.lopHalf)>0) parts.push(s.lopHalf+' half-day');
    if(Number(s.lopUnpaid)>0) parts.push(s.lopUnpaid+' unpaid leave');
    if(Number(s.blankDays)>0) parts.push(s.blankDays+' no record');
    if(Number(s.lopFree)>0) parts.push('<span style="color:#0F6E56">'+s.lopFree+' free (Sunday staff)</span>');
    var c=pcCalc(s);
    /* The arithmetic is spelled out on whichever line it actually ties out on.
       PF staff are on a 26-day basis, so pay days x per day == the salary and the sensible thing to
       show is what was EARNED - that goes on the Present days row below, not here.
       Gross / no-PF staff are on the annual rate (salary x 12 / 365). Their present days x per day
       does NOT come back to the salary, because a 31-day month is longer than the 30.42 the annual
       rate assumes - so for them the only figure that ties out exactly is the leave cut, and it
       belongs here. */
    if(c.perDay>0 && !c.pfOn && d>0)
      parts.push('<b style="color:#444">'+money(c.actual)+' × 12 ÷ 365 × '+(d%1?d.toFixed(1):d)+' = ₹'+money(val)+'</b>');
    else if(c.perDay>0)
      parts.push('₹'+money(c.perDay)+'/day'+(c.pfOn?(' ('+money(c.actual)+' ÷ '+c.payDays+')'):' (× 12 ÷ 365)'));
    return '<div class="py-li" style="align-items:flex-start"><span>Absent / half-day (LOP '+(d%1?d.toFixed(1):d)+'d)'+
      (parts.length?'<div class="py-lopsub">'+parts.join(' · ')+'</div>':'')+'</span>'+
      '<span>'+(Number(val)>0?'−'+m0(val):'—')+'</span></div>';
  }
  /* Days actually paid for. Read straight off the same two numbers the leave cut uses, so the two
     lines can never tell different stories: present = pay days - LOP days. */
  function dedPresent(s){
    var c=pcCalc(s), d=Number(s.lopDays)||0;
    var pres=c.attDays, lbl=(pres%1?pres.toFixed(1):pres);
    /* For PF staff this is where the earned figure is proved: salary / 26 x present days is exactly
       the Gross earned shown opposite, so anyone querying their pay can follow it in one line. */
    var sub=c.payDays+(c.pfOn?' pay days':' days')+' − '+(d%1?d.toFixed(1):d)+' LOP';
    if(c.pfOn && c.actual>0)
      sub+='<div><b style="color:#444">'+money(c.actual)+' ÷ '+c.payDays+' × '+lbl+' = ₹'+money(c.earned)+'</b></div>';
    return '<div class="py-li" style="align-items:flex-start"><span>Present days'+
      '<div class="py-lopsub">'+sub+'</div></span>'+
      '<span style="color:#0F6E56;font-weight:600">'+lbl+'</span></div>';
  }
  function dedLi(label,val){ return '<div class="py-li"><span>'+label+'</span><span>'+(Number(val)>0?'−'+m0(val):'—')+'</span></div>'; }
  function otherAddLines(i,arr){ return (arr||[]).map(function(o,k){ return '<div class="py-li" style="gap:6px"><input data-oi="'+i+'" data-ok="'+k+'" data-of="label" value="'+esc((o&&o.label)||'')+'" placeholder="Reason (e.g. Overtime)" style="flex:1;min-width:0"><input type="number" min="0" data-oi="'+i+'" data-ok="'+k+'" data-of="amt" value="'+(Number(o&&o.amt)>0?Number(o.amt):'')+'" placeholder="0" style="width:80px"><span class="py-rem" data-orem="'+i+'" data-ok="'+k+'">×</span></div>'; }).join(''); }
  /* Same pattern on the deduction side: unlimited label + amount rows for one-off recoveries. */
  function otherDedLines(i,arr){ return (arr||[]).map(function(o,k){ return '<div class="py-li" style="gap:6px"><input data-di="'+i+'" data-dki="'+k+'" data-df="label" value="'+esc((o&&o.label)||'')+'" placeholder="Reason (e.g. Uniform)" style="flex:1;min-width:0"><input type="number" min="0" data-di="'+i+'" data-dki="'+k+'" data-df="amt" value="'+(Number(o&&o.amt)>0?Number(o.amt):'')+'" placeholder="0" style="width:80px"><span class="py-rem" data-drem="'+i+'" data-dki="'+k+'">×</span></div>'; }).join(''); }
  /* live view of every slip with its typed additions/deductions applied (for KPIs, exports, slips, PDF) */
  function computed(){ return PAY.slips.map(function(s){ var c=pcCalc(s); var oth=(c.other||[]).map(function(o){return {label:String((o&&o.label)||'Other'),amt:numv(o&&o.amt)};}).filter(function(o){return o.amt>0;});
    var dth=(c.dedOtherList||[]).map(function(o){return {label:String((o&&o.label)||'Other deduction'),amt:numv(o&&o.amt)};}).filter(function(o){return o.amt>0;});
    return Object.assign({},s,{additions:c.additions,addIncentive:c.inc,addBonus:c.bon,addTravel:c.trv,addPetrol:c.pet,addMis:c.mis,attBonus:c.attBonus,attBonusDays:c.attBonusDays,addOther:c.addOther,addOtherJson:(oth.length?JSON.stringify(oth):''),otherDed:c.otherDed,otherDedLabel:c.otherDedLabel,
      labTest:c.lab,advLab:c.adv,dedOther:c.dedOther,dedOtherJson:(dth.length?JSON.stringify(dth):''),gross:c.gross,lopAmt:c.lopAmt,pf:c.pf,esi:c.esi,pt:c.pt,deductions:c.ded,net:c.net,fieldPay:c.additions,actualSalary:c.actual,basic:c.basic,hra:c.hra,conv:c.conv,convOn:c.convOn,payDays:c.payDays,attDays:c.attDays,perDay:c.perDay,earnBasic:c.earnBasic,earnHra:c.earnHra,earnConv:c.earnConv,earned:c.earned,pfOn:c.pfOn,payMode:(c.grossMode?'gross':'standard'),pfOverride:(hasOv(s._pfOv)?numv(s._pfOv):''),esiOverride:(hasOv(s._esiOv)?numv(s._esiOv):''),ptOverride:(hasOv(s._ptOv)?numv(s._ptOv):'')}); }); }
  function paintKpi(){
    var t={g:0,a:0,d:0,n:0,zero:0,neg:0,gap:0,gapd:0}; PAY.slips.forEach(function(s){ var c=pcCalc(s);
      t.g+=c.actual; t.a+=c.additions; t.d+=c.ded; t.n+=c.net;
      if(c.noSalary) t.zero++; if(c.net<0) t.neg++;
      var bd=Number(s.blankDays)||0; if(bd>0){ t.gap++; t.gapd+=bd; } });
    var k=$id('pyKpi'); if(!k) return;
    k.innerHTML=
      '<div class="pyk"><div class="pyk-l">Actual salary</div><div class="pyk-v">'+m0(t.g)+'</div></div>'+
      '<div class="pyk"><div class="pyk-l">Additions (+)</div><div class="pyk-v" style="color:'+G+'">+'+m0(t.a)+'</div></div>'+
      '<div class="pyk"><div class="pyk-l">Deductions (−)</div><div class="pyk-v" style="color:'+R+'">−'+m0(t.d)+'</div></div>'+
      '<div class="pyk"><div class="pyk-l">Net payout</div><div class="pyk-v">'+m0(t.n)+'</div></div>';
    var w=$id('pyWarn'); if(w){
      var msgs=[];
      if(t.zero) msgs.push('<b>'+t.zero+' staff have no actual salary set</b> — they stay at ₹0 and are left out of the bank file.');
      if(t.neg) msgs.push('<b>'+t.neg+' staff have a negative net</b> — deductions exceed their pay this month. Review before paying.');
      if(t.gap) msgs.push('<b>'+t.gap+' staff have working days with no attendance record</b> ('+t.gapd+' days in total) and these <b>are being deducted</b>. If a punch simply failed, fix it in <b>Review missing days</b>.');
      w.innerHTML=msgs.length?('<div class="py-warn">'+msgs.join('<br>')+'</div>'):'';
    }
  }
  function wireRows(){
    var rows=$id('pyRows'); if(!rows) return;
    rows.querySelectorAll('.py-row').forEach(function(row){
      var main=row.querySelector('.py-main'), det=row.querySelector('.py-det');
      var sset=main.querySelector('[data-setsal]');
      if(sset) sset.onclick=function(e){ e.stopPropagation();
        if(typeof openEmpModal==='function') openEmpModal(sset.getAttribute('data-setsal'));
        else toast('Open Staff → Edit → Work & pay to set the salary.',true); };
      main.onclick=function(e){ if(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON'||e.target.className==='py-rem'||e.target.hasAttribute('data-setsal')) return;
        var open=det.style.display!=='none'; det.style.display=open?'none':'grid'; row.classList.toggle('open',!open);
        if(!open) loadAtt(row, +row.getAttribute('data-i')); };
      wireDetail(row, +row.getAttribute('data-i'));
    });
  }
  function wireDetail(row,i){
    var s=PAY.slips[i];
    /* v297: every one of these handlers used to end at paintKpi() — the figure was on screen and
       nowhere else. touched() marks the field visibly and arms the unsaved-changes bar + device draft. */
    function touched(inp){ if(inp&&inp.classList) inp.classList.add('py-edited'); payMarkDirty(); }
    row.querySelectorAll('input[data-key]').forEach(function(inp){ inp.onclick=stop; inp.oninput=function(){ s[inp.getAttribute('data-key')]=numv(inp.value); refreshRow(row,s); paintKpi(); touched(inp); }; });
    row.querySelectorAll('input[data-oi]').forEach(function(inp){ inp.onclick=stop; inp.oninput=function(){ var k=+inp.getAttribute('data-ok'), f=inp.getAttribute('data-of'); s._other[k]=s._other[k]||{label:'',amt:0}; if(f==='amt') s._other[k].amt=numv(inp.value); else s._other[k].label=inp.value; refreshRow(row,s); paintKpi(); touched(inp); }; });
    row.querySelectorAll('[data-orem]').forEach(function(x){ x.onclick=function(e){ e.stopPropagation(); s._other.splice(+x.getAttribute('data-ok'),1); redrawDetail(row,i); payMarkDirty(); }; });
    var addb=row.querySelector('[data-oadd]'); if(addb) addb.onclick=function(e){ e.stopPropagation(); s._other=s._other||[]; s._other.push({label:'',amt:0}); redrawDetail(row,i); };
    row.querySelectorAll('input[data-di]').forEach(function(inp){ inp.onclick=stop; inp.oninput=function(){ var k=+inp.getAttribute('data-dki'), f=inp.getAttribute('data-df'); s._dedOther=s._dedOther||[]; s._dedOther[k]=s._dedOther[k]||{label:'',amt:0}; if(f==='amt') s._dedOther[k].amt=numv(inp.value); else s._dedOther[k].label=inp.value; refreshRow(row,s); paintKpi(); touched(inp); }; });
    row.querySelectorAll('[data-drem]').forEach(function(x){ x.onclick=function(e){ e.stopPropagation(); s._dedOther.splice(+x.getAttribute('data-dki'),1); redrawDetail(row,i); payMarkDirty(); }; });
    var dedb=row.querySelector('[data-dadd]'); if(dedb) dedb.onclick=function(e){ e.stopPropagation(); s._dedOther=s._dedOther||[]; s._dedOther.push({label:'',amt:0}); redrawDetail(row,i); };
    row.querySelectorAll('input[data-dov]').forEach(function(inp){ inp.onclick=stop; inp.oninput=function(){
      s[inp.getAttribute('data-dk')]=inp.value; inp.className=hasOv(inp.value)?'ov':'auto'; refreshRow(row,s); paintKpi(); payMarkDirty(); }; });
    row.querySelectorAll('[data-drst]').forEach(function(x){ x.onclick=function(e){ e.stopPropagation();
      s[x.getAttribute('data-dk')]=''; redrawDetail(row,i); payMarkDirty(); }; });
    var od=row.querySelector('[data-otherded]'); if(od){ od.onclick=stop; od.oninput=function(){ s._otherDed=numv(od.value); refreshRow(row,s); paintKpi(); touched(od); }; }
    var ol=row.querySelector('[data-otherlbl]'); if(ol){ ol.onclick=stop; ol.oninput=function(){ s._otherDedLabel=ol.value; touched(ol); }; }
    var pdf=row.querySelector('[data-pdf]'); if(pdf) pdf.onclick=function(e){ e.stopPropagation(); var sc=computed().filter(function(x){return String(x.empId)===pdf.getAttribute('data-pdf');})[0]; payslipPdf(sc,sc.name,PAY.month); };
  }
  /* The month, day by day, on the row itself. Tap a day to change it; the change is written straight
     into Attendance (with an audit note) and payroll recalculates itself straight afterwards. */
  var ATT={};
  var ASTYLE={ present:['py-d-p','P'], half:['py-d-h','½'], absent:['py-d-a','A'], leave:['py-d-l','L'],
    holiday:['py-d-o','H'], off:['py-d-o','·'], blank:['py-d-b','—'], future:['py-d-f',''] };
  function loadAtt(row,i){
    var box=row.querySelector('[data-att="'+i+'"]'); if(!box) return;
    var s=PAY.slips[i]; if(!s) return;
    if(ATT[s.empId]){ paintAtt(row,i); return; }
    API.monthAttendance(PAY.month, s.empId).then(function(r){
      if(r&&r.ok){ ATT[s.empId]=r; paintAtt(row,i); }
      else box.innerHTML='<div class="py-lopsub">'+esc((r&&r.error)||'Could not load attendance.')+'</div>';
    });
  }
  function paintAtt(row,i){
    var box=row.querySelector('[data-att="'+i+'"]'); if(!box) return;
    var s=PAY.slips[i], d=ATT[s.empId]; if(!d) return;
    box.innerHTML='<div class="py-bt" style="color:#185FA5">ATTENDANCE · tap a day to change it</div>'+
      '<div class="py-days">'+d.days.map(function(x){
        var y=ASTYLE[x.status]||ASTYLE.blank;
        return '<span class="py-d '+y[0]+(x.locked?' py-d-lock':'')+'" data-day="'+esc(x.date)+'" title="'+esc(x.date+(x.label?(' · '+x.label):''))+'"><b>'+x.day+'</b>'+y[1]+'</span>';
      }).join('')+'</div>'+
      '<div class="py-lopsub" style="margin-top:6px">P present · ½ half · A absent · L leave · H holiday · · weekly off · — no record'+
        (d.sundayWorks?(' · <span style="color:#0F6E56">works Sundays, '+d.freeLeave+' free leave days</span>'):'')+'</div>';
    box.querySelectorAll('[data-day]').forEach(function(el){
      if(el.className.indexOf('py-d-lock')>=0) return;
      el.onclick=function(ev){ ev.stopPropagation(); pickDay(s, el.getAttribute('data-day'), row, i); };
    });
  }
  function pickDay(s,date,row,i){
    var opts=[['present','Present'],['half','Half day'],['absent','Absent']];
    openModal('Change '+date,'<div style="font-size:13px;color:#666;margin-bottom:10px">'+esc(s.name)+' · '+esc(date)+'</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+opts.map(function(o){
        return '<button class="btn ghost" data-set="'+o[0]+'">'+o[1]+'</button>'; }).join('')+'</div>'+
      '<div style="font-size:11.5px;color:#9aa0a6;margin-top:10px">Writes straight into Attendance with a note recording the change, then payroll recalculates by itself.</div><div id="pdMsg"></div>',
      '<button class="btn ghost" onclick="closeModal()">Cancel</button>');
    document.querySelectorAll('[data-set]').forEach(function(b){
      b.onclick=function(){
        var st=b.getAttribute('data-set');
        document.querySelectorAll('[data-set]').forEach(function(x){ x.disabled=true; });
        API.confirmAbsent([{empId:s.empId,date:date,status:st}]).then(function(r){
          if(r&&r.ok){ delete ATT[s.empId]; closeModal();
            /* Re-run straight away. The old flow saved the day and left it to the user to press Run
               payroll; until they did, the LOP, PF, net and every export still showed the old figure. */
            toast(date+' set to '+st+' — recalculating…');
            runPay(true); }
          else { var m=$id('pdMsg'); if(m) m.innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>';
                 document.querySelectorAll('[data-set]').forEach(function(x){ x.disabled=false; }); }
        });
      };
    });
  }
  function redrawDetail(row,i){ var det=row.querySelector('.py-det'); det.innerHTML=buildDetail(PAY.slips[i],i); det.style.display='grid'; row.classList.add('open'); wireDetail(row,i); refreshRow(row,PAY.slips[i]); paintKpi(); }
  function refreshRow(row,s){
    var c=pcCalc(s);
    row.querySelector('[data-c="add"]').innerHTML=c.additions?'+'+m0(c.additions):'—';
    row.querySelector('[data-c="ded"]').innerHTML='−'+m0(c.ded);
    row.querySelector('[data-c="net"]').innerHTML=m0(c.net);
    var at=row.querySelector('[data-c="addtot"]'); if(at) at.innerHTML=m0(c.additions);
    var dt=row.querySelector('[data-c="dedtot"]'); if(dt) dt.innerHTML='−'+m0(c.ded);
    var autos={_pfOv:c.pfAuto,_esiOv:c.esiAuto,_ptOv:c.ptAuto};
    row.querySelectorAll('input[data-dov]').forEach(function(inp){ var k=inp.getAttribute('data-dk');
      if(!hasOv(s[k])){ inp.value=numv(autos[k]); inp.className='auto'; } });

  }
  /* Per-staff payslip PDF via a hidden print iframe — lists base, every addition (incl custom) and deduction line. */
  function payslipPdf(s,name,month){
    function ln(l,v,neg){ return '<tr><td style="padding:5px 0;color:#444">'+esc(l)+'</td><td style="padding:5px 0;text-align:right;color:'+(neg?'#A32D2D':'#111')+'">'+(neg?'−':'')+'₹'+money(v)+'</td></tr>'; }
    var actualV=Number(s.actualSalary)||Number(s.basic)||0;
    var isPf=(String(s.payMode||'')!=='gross' && s.pfOn!==false);
    /* Earned figures, not the rate — the payslip has to show what the person was actually paid for. */
    var cv=Number(s.earnConv)>0;
    var earn = isPf
      ? ln('Basic ('+(cv?'50':'55')+'%)',Number(s.earnBasic)||0)+ln('HRA ('+(cv?'40':'45')+'%)',Number(s.earnHra)||0)+
        (cv?ln('Conveyance (10%)',s.earnConv):'')
      : ln('Gross salary',Number(s.earned)||actualV);
    if(Number(s.addIncentive)>0) earn+=ln('Incentive',s.addIncentive);
    if(Number(s.addBonus)>0) earn+=ln('Bonus',s.addBonus);
    if(Number(s.addTravel)>0) earn+=ln('Travel / arrears',s.addTravel);
    if(Number(s.attBonus)>0) earn+=ln('Full attendance bonus ('+(Number(s.attBonusDays)||2)+' days)',s.attBonus);
    if(Number(s.addPetrol)>0) earn+=ln('Petrol cost',s.addPetrol);
    if(Number(s.addMis)>0) earn+=ln('MIS expenses',s.addMis);
    var oth=[]; if(s.addOtherJson){ try{ oth=JSON.parse(s.addOtherJson)||[]; }catch(e){} }
    oth.forEach(function(o){ if(Number(o.amt)>0) earn+=ln(o.label||'Other',o.amt); });
    var grossV=actualV-Number(s.lopAmt||0)+Number(s.additions||0);
    var ded=''; if(Number(s.lopAmt)>0) ded+=ln('Absent / half-day (LOP '+(s.lopDays||0)+'d)',s.lopAmt,true);
    if(Number(s.pf)>0) ded+=ln('Provident fund (12% of earned basic)',s.pf,true);
    if(Number(s.esi)>0) ded+=ln('ESIC (0.75% of earned basic)',s.esi,true);
    if(Number(s.pt)>0) ded+=ln('Professional tax',s.pt,true);
    if(Number(s.otherDed)>0) ded+=ln(s.otherDedLabel||'Other deduction',s.otherDed,true);
    if(Number(s.labTest)>0) ded+=ln('Lab test charges',s.labTest,true);
    if(Number(s.advLab)>0) ded+=ln('Advance lab / oblic loan',s.advLab,true);
    var dth=[]; if(s.dedOtherJson){ try{ dth=JSON.parse(s.dedOtherJson)||[]; }catch(e){} }
    dth.forEach(function(o){ if(Number(o.amt)>0) ded+=ln(o.label||'Other deduction',o.amt,true); });
    if(!ded) ded=ln('Deductions',0,false);
    var html='<!doctype html><html><head><meta charset="utf-8"><title>Payslip '+esc(name)+' '+esc(month)+'</title>'+
      '<style>@page{size:A4;margin:16mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0}.hd{border-top:6px solid #DA1017;padding:14px 0;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e2e5ea}.h1{color:#DA1017;font-size:22px;font-weight:800}.sub{color:#666;font-size:12px;margin-top:2px}.meta{font-size:13px;color:#444;margin:12px 0}.sect{color:#DA1017;font-weight:700;font-size:13px;margin:14px 0 4px}table{width:100%;border-collapse:collapse;font-size:13px}.tot td{border-top:1px solid #ccc;font-weight:700;padding-top:6px}.net{margin-top:14px;background:#eafaf3;color:#1a7f37;border-radius:8px;padding:12px 14px;display:flex;justify-content:space-between;font-size:18px;font-weight:800}.ft{margin-top:18px;color:#999;font-size:11px;text-align:center}</style></head><body>'+
      '<div class="hd"><div><div class="h1">NAKODA</div><div class="sub">Diagnostics And Research Center</div></div><div style="text-align:right"><div style="font-weight:700">PAYSLIP — '+esc(month)+'</div><div class="sub">'+esc(name)+' · '+esc(s.empId||'')+'</div></div></div>'+
      '<div class="meta">'+(isPf?('Pay days '+(Number(s.attDays)||0)+' / '+(Number(s.payDays)||26)):('Paid days '+s.paidDays+' / '+s.totalDays))+'  ·  LOP '+s.lopDays+'  ·  Leave '+(s.leaveDays||0)+(Number(s.perDay)>0?('  ·  ₹'+money(s.perDay)+'/day'):'')+'</div>'+
      '<div class="sect">EARNINGS</div><table>'+earn+'<tr class="tot"><td>Gross</td><td style="text-align:right">₹'+money(grossV)+'</td></tr></table>'+
      '<div class="sect">DEDUCTIONS</div><table>'+ded+'<tr class="tot"><td>Total deductions</td><td style="text-align:right;color:#A32D2D">−₹'+money(s.deductions||0)+'</td></tr></table>'+
      '<div class="net"><span>NET PAY</span><span>₹'+money(s.net||0)+'</span></div>'+
      '<div class="ft">Computer-generated payslip · Nakoda Diagnostics And Research Center</div></body></html>';
    var ifr=document.createElement('iframe'); ifr.style.position='fixed'; ifr.style.right='0'; ifr.style.bottom='0'; ifr.style.width='0'; ifr.style.height='0'; ifr.style.border='0';
    document.body.appendChild(ifr);
    var d=ifr.contentWindow.document; d.open(); d.write(html); d.close();
    setTimeout(function(){ try{ ifr.contentWindow.focus(); ifr.contentWindow.print(); }catch(e){} setTimeout(function(){ if(ifr.parentNode) ifr.parentNode.removeChild(ifr); },60000); }, 400);
    toast('Opening payslip PDF — choose "Save as PDF"');
  }
  function loadMySlip(){ var m=$id('pyMonth').value||ymNow(); API.myPayslip(m).then(function(r){ var box=$id('pySlip'); if(!box) return; var s=r&&r.ok?r.slip:null; if(!s){ box.innerHTML='<div class="empty">No payslip for '+m+' yet.</div>'; return; }
    var drow=''; if(Number(s.lopAmt)>0) drow+='<div class="psrow"><span>Absent / half-day (LOP)</span><span style="color:#A32D2D">−₹'+money(s.lopAmt)+'</span></div>'; if(Number(s.pf)>0) drow+='<div class="psrow"><span>Provident fund (12%)</span><span style="color:#A32D2D">−₹'+money(s.pf)+'</span></div>'; if(Number(s.esi)>0) drow+='<div class="psrow"><span>ESI (0.75%)</span><span style="color:#A32D2D">−₹'+money(s.esi)+'</span></div>'; if(Number(s.pt)>0) drow+='<div class="psrow"><span>Professional tax</span><span style="color:#A32D2D">−₹'+money(s.pt)+'</span></div>'; if(Number(s.otherDed)>0) drow+='<div class="psrow"><span>'+esc(s.otherDedLabel||'Other deduction')+'</span><span style="color:#A32D2D">−₹'+money(s.otherDed)+'</span></div>'; if(Number(s.labTest)>0) drow+='<div class="psrow"><span>Lab test charges</span><span style="color:#A32D2D">−₹'+money(s.labTest)+'</span></div>'; if(Number(s.advLab)>0) drow+='<div class="psrow"><span>Advance lab / oblic loan</span><span style="color:#A32D2D">−₹'+money(s.advLab)+'</span></div>'; if(Number(s.dedOther)>0) drow+='<div class="psrow"><span>Other recoveries</span><span style="color:#A32D2D">−₹'+money(s.dedOther)+'</span></div>';
    /* Staff paid a flat gross see the gross figure, not a 55/45 split that means nothing to them. */
    var isPfC=(String(s.payMode||'')!=='gross' && s.pfOn!==false);
    var cvC=Number(s.earnConv)>0;
    var splitRows = isPfC
      ? '<div class="psrow"><span>Basic ('+(cvC?'50':'55')+'%)</span><span>₹'+money(Number(s.earnBasic)||0)+'</span></div><div class="psrow"><span>HRA ('+(cvC?'40':'45')+'%)</span><span>₹'+money(Number(s.earnHra)||0)+'</span></div>'+(cvC?'<div class="psrow"><span>Conveyance (10%)</span><span>₹'+money(s.earnConv)+'</span></div>':'')
      : '<div class="psrow"><span>Gross salary</span><span>₹'+money(Number(s.earned)||myActual(s))+'</span></div>';
    box.innerHTML='<div class="att-card" style="text-align:left"><div style="font-size:11px;color:#666">'+(isPfC?('Pay days '+(Number(s.attDays)||0)+'/'+(Number(s.payDays)||26)):('Paid '+s.paidDays+'/'+s.totalDays))+' · LOP '+s.lopDays+(Number(s.perDay)>0?' · ₹'+money(s.perDay)+'/day':'')+'</div>'+splitRows+(Number(s.additions)>0?'<div class="psrow"><span>Additions</span><span style="color:#0F6E56">+₹'+money(s.additions)+'</span></div>':'')+drow+'<div class="net2">Net ₹'+money(s.net)+'</div><button class="btn" id="myslipDl" style="margin-top:10px">⤓ Download payslip</button></div>';
    $id('myslipDl').onclick=function(){ payslipPng(s,(S.user&&S.user.FullName)||'',m); };
    paintMyKpi(s,isPfC); }); }
  /* Four headline numbers above the breakdown, so the answer to "what am I paid" is the first thing
     on screen rather than something to be assembled from the rows below. */
  function paintMyKpi(s,isPf){
    var k=$id('pyKpiMe'); if(!k) return;
    var pres=isPf?((Number(s.attDays)||0)+' / '+(Number(s.payDays)||26)):((s.paidDays||0)+' / '+(s.totalDays||0));
    k.innerHTML=
      '<div class="pyk"><div class="pyk-l">Present days</div><div class="pyk-v">'+pres+'</div></div>'+
      '<div class="pyk"><div class="pyk-l">Gross earned</div><div class="pyk-v">'+m0(Number(s.gross)||Number(s.earned)||0)+'</div></div>'+
      '<div class="pyk"><div class="pyk-l">Deductions (−)</div><div class="pyk-v" style="color:'+R+'">−'+m0(Number(s.deductions)||0)+'</div></div>'+
      '<div class="pyk"><div class="pyk-l">Net paid</div><div class="pyk-v" style="color:'+G+'">'+m0(Number(s.net)||0)+'</div></div>';
  }
  /* Last six months of net pay. Read-only and scoped server-side to the token holder, so a staff
     member can never see a colleague's figure however they poke at it. */
  function loadMyHistory(){
    API.myPayHistory(6).then(function(r){
      var box=$id('pyHist'); if(!box) return;
      var h=(r&&r.ok&&r.history)||[]; if(!h.length){ box.innerHTML=''; return; }
      var max=Math.max.apply(null,h.map(function(x){ return Number(x.net)||0; }))||1;
      box.innerHTML='<div class="att-card" style="text-align:left;margin-top:12px">'+
        '<div style="font-size:11px;color:#666;letter-spacing:.04em;margin-bottom:8px">LAST '+h.length+' MONTHS · NET PAID</div>'+
        '<div style="display:flex;align-items:flex-end;gap:8px;height:70px">'+
        h.map(function(x,i){
          var pc=Math.max(6,Math.round((Number(x.net)||0)/max*60));
          var lastOne=(i===h.length-1);
          return '<div style="flex:1;text-align:center" title="'+esc(x.month)+' · ₹'+money(x.net)+'">'+
            '<div style="background:'+(lastOne?'#185FA5':'#B5D4F4')+';height:'+pc+'px;border-radius:3px 3px 0 0"></div>'+
            '<div style="font-size:10px;color:#9aa0a6;margin-top:3px">'+esc(String(x.month).slice(5))+'</div></div>';
        }).join('')+'</div>'+
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:#666;margin-top:8px">'+
          '<span>'+esc(h[0].month)+' · ₹'+money(h[0].net)+'</span>'+
          '<span>'+esc(h[h.length-1].month)+' · ₹'+money(h[h.length-1].net)+'</span></div></div>';
    });
  }
  function payslipPng(s,name,month){
    var logo=new Image(); logo.onload=function(){ draw(logo); }; logo.onerror=function(){ draw(null); }; logo.src='icons/login-logo.png';
    function draw(logo){ var W=1000,H=780,M=50,c=document.createElement('canvas'); c.width=W;c.height=H; var x=c.getContext('2d');
      x.fillStyle='#fff';x.fillRect(0,0,W,H); x.fillStyle='#DA1017';x.fillRect(0,0,W,8);
      if(logo){var lh=54,lw=Math.min(280,logo.width*(lh/logo.height));x.drawImage(logo,M,28,lw,lh);} else {x.fillStyle='#DA1017';x.font='bold 26px Arial';x.fillText('NAKODA',M,62);}
      x.fillStyle='#1f1f1f';x.font='bold 22px Arial';x.textAlign='right';x.fillText('PAYSLIP — '+month,W-M,46);x.textAlign='left';
      x.fillStyle='#444';x.font='15px Arial';x.fillText(name+' · '+(s.empId||''),M,108);
      x.fillStyle='#888';x.font='13px Arial';x.fillText('Paid days '+s.paidDays+' / '+s.totalDays+'  ·  LOP '+s.lopDays+'  ·  Leave '+s.leaveDays,M,132);
      x.strokeStyle='#e2e5ea';x.beginPath();x.moveTo(M,150);x.lineTo(W-M,150);x.stroke();
      var y=190; function rowL(l,v,neg){ x.fillStyle='#555';x.font='15px Arial';x.fillText(l,M,y); x.fillStyle=neg?'#A32D2D':'#222';x.textAlign='right';x.fillText((neg?'−₹':'₹')+money(v),W-M,y);x.textAlign='left'; y+=34; }
      x.fillStyle='#DA1017';x.font='bold 14px Arial';x.fillText('EARNINGS',M,y);y+=28;
      var isPfP=(String(s.payMode||'')!=='gross' && s.pfOn!==false);
      var cvP=Number(s.earnConv)>0;
      if(isPfP){ rowL('Basic ('+(cvP?'50':'55')+'%)',Number(s.earnBasic)||0); rowL('HRA ('+(cvP?'40':'45')+'%)',Number(s.earnHra)||0); if(cvP) rowL('Conveyance (10%)',s.earnConv); }
      else rowL('Gross salary',Number(s.earned)||myActual(s));
      if(Number(s.addIncentive)>0) rowL('Incentive',s.addIncentive);
      if(Number(s.addBonus)>0) rowL('Bonus',s.addBonus);
      if(Number(s.addTravel)>0) rowL('Travel / arrears',s.addTravel);
      if(Number(s.attBonus)>0) rowL('Full attendance bonus ('+(Number(s.attBonusDays)||2)+'d)',s.attBonus);
      if(Number(s.addPetrol)>0) rowL('Petrol cost',s.addPetrol);
      if(Number(s.addMis)>0) rowL('MIS expenses',s.addMis);
      if(!(Number(s.addIncentive)||Number(s.addBonus)||Number(s.addTravel)||Number(s.addPetrol)||Number(s.addMis)) && Number(s.additions)>0) rowL('Additions',s.additions);
      y+=6; x.fillStyle='#DA1017';x.font='bold 14px Arial';x.fillText('DEDUCTIONS',M,y);y+=28;
      var anyDed=false;
      if(Number(s.lopAmt)>0){ rowL('Absent / half-day (LOP '+s.lopDays+' days)',s.lopAmt,true); anyDed=true; }
      if(Number(s.pf)>0){ rowL('Provident fund (12% of earned basic)',s.pf,true); anyDed=true; }
      if(Number(s.esi)>0){ rowL('ESI (0.75%)',s.esi,true); anyDed=true; }
      if(Number(s.pt)>0){ rowL('Professional tax',s.pt,true); anyDed=true; }
      if(Number(s.labTest)>0){ rowL('Lab test charges',s.labTest,true); anyDed=true; }
      if(Number(s.advLab)>0){ rowL('Advance lab / oblic loan',s.advLab,true); anyDed=true; }
      if(Number(s.otherDed)>0){ rowL(s.otherDedLabel||'Other deduction',s.otherDed,true); anyDed=true; }
      if(Number(s.dedOther)>0){ rowL('Other recoveries',s.dedOther,true); anyDed=true; }
      if(!anyDed) rowL('Deductions',s.deductions||0,Number(s.deductions)>0);
      y+=6; x.fillStyle='#EAF6EE';x.fillRect(M,y,W-2*M,46);x.fillStyle='#1a7f37';x.font='bold 20px Arial';x.fillText('NET PAY',M+14,y+30);x.textAlign='right';x.fillText('₹'+money(s.net),W-M-14,y+30);x.textAlign='left';
      x.fillStyle='#999';x.font='italic 12px Arial';x.textAlign='center';x.fillText('Computer-generated payslip · Nakoda Diagnostics And Research Center',W/2,H-24);x.textAlign='left';
      c.toBlob(function(b){var u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='Payslip-'+(name||'').replace(/\s+/g,'_')+'-'+month+'.png';a.click();setTimeout(function(){URL.revokeObjectURL(u);},2000);toast('Payslip saved');});
    }
  }
  function xlsDownload(html,name){ var blob=new Blob(['﻿<html><head><meta charset="utf-8"></head><body>'+html+'</body></html>'],{type:'application/vnd.ms-excel'}); var u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(u);},2000); toast('Excel exported'); }
  function bankXls(slips,month){
    var cols=['Client_Code','Product_Code','Payment_Type','Payment_Ref_No.','Payment_Date','Instrument Date','Dr_Ac_No','Amount','Bank_Code_Indicator','Beneficiary_Code','Beneficiary_Name','Beneficiary_Bank','IFSC Code','Beneficiary_Acc_No','Location','Print_Location','Instrument_Number','Ben_Add1','Ben_Add2','Ben_Add3','Ben_Add4','Beneficiary_Email','Beneficiary_Mobile','Debit_Narration','Credit_Narration'];
    var today=new Date(),dt=today.getDate()+'/'+(today.getMonth()+1)+'/'+today.getFullYear();
    var head='<tr>'+cols.map(function(c){return '<th>'+c+'</th>';}).join('')+'</tr>';
    var rows=slips.filter(function(s){return Number(s.net)>0;}).map(function(s){
      var vals=['','','NEFT','',dt,dt,'',Number(s.net).toFixed(2),'M','',s.name||'','',s.ifsc||'',s.acct||'','','','','','','','','',s.mobile||'','SALARY '+month,'Salary '+month+' '+(s.name||'')];
      return '<tr>'+vals.map(function(v){return '<td>'+esc(String(v))+'</td>';}).join('')+'</tr>';
    }).join('');
    if(!rows){ toast('No payslips with net pay to export.',true); return; }
    xlsDownload('<table>'+head+rows+'</table>','Bank-Salary-'+month+'.xls');
  }
  /* ============================================================ SALARY REGISTER
     Written as SpreadsheetML (Excel 2003 XML) rather than an HTML table, because that format can
     carry LIVE FORMULAS. Open the file and change anyone's ATT or their "other" deduction and PF,
     PTAX, ESIC, the totals and the grand total all recalculate — exactly like the accountant's own
     PF SHEET workbook, but with nothing hardcoded.
     Layout is column-for-column the same as that workbook: A SR, B CODE, C NAME, D ATT,
     E-J RATE, K-P EARNED, Q-V DEDUCTION, W NET, X SIGNATURE, Z PETROL, AA MIS EXP, AB TOTAL.
     NOTE: formulas in SpreadsheetML must be written in R1C1, not A1. R4C15 is cell O4 (PAY DAYS). */
  function xesc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function xNum(v,st,fml){ return '<Cell'+(st?' ss:StyleID="'+st+'"':'')+(fml?' ss:Formula="'+xesc(fml)+'"':'')+'><Data ss:Type="Number">'+(Math.round(Number(v)||0))+'</Data></Cell>'; }
  function xStr(v,st){ return '<Cell'+(st?' ss:StyleID="'+st+'"':'')+'><Data ss:Type="String">'+xesc(v)+'</Data></Cell>'; }
  function xAt(i){ return '<Cell ss:Index="'+i+'"'; }
  function xCellAt(i,v,st){ return xAt(i)+(st?' ss:StyleID="'+st+'"':'')+'><Data ss:Type="'+(typeof v==='number'?'Number':'String')+'">'+xesc(v)+'</Data></Cell>'; }
  function xRow(cells){ return '<Row>'+cells+'</Row>'; }

  function registerXls(slips,month){
    if(!slips||!slips.length){ toast('No payslips to export.',true); return; }
    var brSel=$id('pyBranch'), brLabel=(brSel&&brSel.value)?(brSel.options[brSel.selectedIndex].text):'All branches';
    var mlabel=month; try{ var mp=String(month).split('-'); mlabel=new Date(+mp[0],+mp[1]-1,1).toLocaleDateString('en-IN',{month:'short',year:'numeric'}).toUpperCase(); }catch(e){}
    var pf=slips.filter(function(s){ return String(s.payMode||'')!=='gross' && s.pfOn!==false; });
    var gr=slips.filter(function(s){ return String(s.payMode||'')==='gross' || s.pfOn===false; });
    var mdays=Number(slips[0]&&slips[0].totalDays)||30;
    var payDays=Number((pf[0]||{}).payDays)||26;

    var xml='<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n'+
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" '+
      'xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'+
      '<Styles>'+
        '<Style ss:ID="t"><Font ss:Bold="1" ss:Size="12"/></Style>'+
        '<Style ss:ID="h"><Font ss:Bold="1" ss:Size="9"/><Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>'+
        '<Style ss:ID="ge"><Font ss:Bold="1" ss:Size="9" ss:Color="#0F6E56"/><Interior ss:Color="#E1F5EE" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>'+
        '<Style ss:ID="gd"><Font ss:Bold="1" ss:Size="9" ss:Color="#A32D2D"/><Interior ss:Color="#FCEBEB" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>'+
        '<Style ss:ID="n"><NumberFormat ss:Format="#,##0"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous"/><Border ss:Position="Top" ss:LineStyle="Continuous"/><Border ss:Position="Left" ss:LineStyle="Continuous"/><Border ss:Position="Right" ss:LineStyle="Continuous"/></Borders></Style>'+
        '<Style ss:ID="f"><NumberFormat ss:Format="#,##0"/><Interior ss:Color="#F2FBF7" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous"/><Border ss:Position="Top" ss:LineStyle="Continuous"/><Border ss:Position="Left" ss:LineStyle="Continuous"/><Border ss:Position="Right" ss:LineStyle="Continuous"/></Borders></Style>'+
        '<Style ss:ID="s"><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous"/><Border ss:Position="Top" ss:LineStyle="Continuous"/><Border ss:Position="Left" ss:LineStyle="Continuous"/><Border ss:Position="Right" ss:LineStyle="Continuous"/></Borders></Style>'+
        '<Style ss:ID="tot"><Font ss:Bold="1"/><NumberFormat ss:Format="#,##0"/><Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/><Border ss:Position="Bottom" ss:LineStyle="Continuous"/><Border ss:Position="Left" ss:LineStyle="Continuous"/><Border ss:Position="Right" ss:LineStyle="Continuous"/></Borders></Style>'+
      '</Styles>';

    if(pf.length) xml+=pfSheetXml(pf,mlabel,brLabel,mdays,payDays);
    if(gr.length) xml+=grossSheetXml(gr,mlabel,brLabel);
    xml+='</Workbook>';

    var blob=new Blob(['﻿'+xml],{type:'application/vnd.ms-excel'});
    var u=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=u; a.download='Salary-Register-'+month+'.xls'; a.click();
    setTimeout(function(){URL.revokeObjectURL(u);},2000);
    toast('Salary register exported — formulas are live');
  }

  /* PF staff, in the exact shape of the accountant's PF SHEET. */
  /* BranchID -> readable name, so the register shows "UDHNA" rather than a code. */
  function brName(id){
    var bs=(S.meta&&S.meta.branches)||[];
    for(var i=0;i<bs.length;i++){ if(String(bs[i].BranchID)===String(id)) return bs[i].BranchName||String(id); }
    return id?String(id):'';
  }
  function pfSheetXml(rows,mlabel,brLabel,mdays,payDays){
    var W=[6,9,30,14,6, 9,9,9,9,9,10, 9,9,9,9,9,10, 9,8,8,10,8,10, 11,12,3, 11,9,10,11];
    var x='<Worksheet ss:Name="PF SHEET"><Table>'+
      W.map(function(w){ return '<Column ss:Width="'+(w*7)+'"/>'; }).join('');

    x+=xRow(xStr('NAKODA DIAGNOSTICS PVT LTD','t')+xAt(11)+' ss:StyleID="t"><Data ss:Type="String">MONTH — '+xesc(mlabel)+'</Data></Cell>');
    x+=xRow(xStr('ESTABLISHMENT NAME:')+xAt(11)+'><Data ss:Type="String">TOTAL MONTH DAYS</Data></Cell>'+xAt(15)+'><Data ss:Type="Number">'+mdays+'</Data></Cell>');
    x+=xRow(xStr('NAKODA DIAGNOSTICS PVT LTD')+xAt(11)+'><Data ss:Type="String">WEEKLY OFF</Data></Cell>'+xAt(15)+' ss:Formula="=R[-1]C-R[1]C"><Data ss:Type="Number">'+(mdays-payDays)+'</Data></Cell>');
    x+=xRow(xStr(brLabel)+xAt(11)+' ss:StyleID="t"><Data ss:Type="String">PAY DAYS</Data></Cell>'+xAt(15)+' ss:StyleID="t"><Data ss:Type="Number">'+payDays+'</Data></Cell>');
    x+=xRow('');
    x+=xRow(xAt(5)+' ss:StyleID="ge"><Data ss:Type="String">RATE</Data></Cell>'+
            xAt(11)+' ss:StyleID="ge"><Data ss:Type="String">EARNED</Data></Cell>'+
            xAt(17)+' ss:StyleID="gd"><Data ss:Type="String">DEDUCTION</Data></Cell>'+
            xAt(23)+' ss:StyleID="h"><Data ss:Type="String">NET SALARY</Data></Cell>'+
            xAt(24)+' ss:StyleID="h"><Data ss:Type="String">SIGNATURE</Data></Cell>'+
            xAt(26)+' ss:StyleID="ge"><Data ss:Type="String">REIMBURSEMENT</Data></Cell>');
    var hd=['SR','CODE','NAME OF EMP','BRANCH','ATT','SALARY','HRA','Convey Allow','PER ALL','OTHER','TOTAL',
            'SALARY','HRA','Convey Allow','PER ALL','OTHER','TOTAL','PF','PTAX','ESIC','other','TDS','TOTAL',
            'NET SALARY','SIGNATURE','','ATT BONUS','PETROL','MIS EXP','TOTAL'];
    x+=xRow(hd.map(function(h){ return xStr(h,'h'); }).join(''));

    var first=8, sr=0;
    rows.forEach(function(r){
      sr++;
      var att=Number(r.attDays)||0;
      x+=xRow(
        xNum(sr,'s')+xStr(r.empId||'','s')+xStr(r.name||'','s')+xStr(brName(r.branchId),'s')+
        '<Cell ss:StyleID="n"><Data ss:Type="Number">'+att+'</Data></Cell>'+
        xNum(r.basic,'n')+xNum(r.hra,'n')+xNum(r.conv,'n')+xNum(0,'n')+xNum(0,'n')+
        xNum(r.actualSalary,'f','=SUM(RC[-5]:RC[-1])')+
        xNum(r.earnBasic,'f','=ROUND((RC[-6]/R4C15)*RC[-7],0)')+
        xNum(r.earnHra ,'f','=ROUND((RC[-6]/R4C15)*RC[-8],0)')+
        xNum(r.earnConv,'f','=ROUND((RC[-6]/R4C15)*RC[-9],0)')+
        xNum(0,'f','=ROUND((RC[-6]/R4C15)*RC[-10],0)')+
        xNum(0,'f','=ROUND((RC[-6]/R4C15)*RC[-11],0)')+
        xNum(r.earned,'f','=SUM(RC[-5]:RC[-1])')+
        xNum(r.pf ,'f','=MIN(1800,ROUND(RC[-6]*0.12,0))')+
        xNum(r.pt ,'f','=IF(RC[-2]<=12000,0,200)')+
        xNum(r.esi,'f','=ROUNDDOWN(RC[-8]*0.0075,0)')+
        xNum((Number(r.otherDed)||0)+(Number(r.labTest)||0)+(Number(r.advLab)||0)+(Number(r.dedOther)||0),'n')+
        xNum(0,'n')+
        xNum(r.deductions-(Number(r.lopAmt)||0),'f','=SUM(RC[-5]:RC[-1])')+
        xNum(r.earned-(r.deductions-(Number(r.lopAmt)||0)),'f','=RC[-7]-RC[-1]')+
        xStr('','s')+xStr('')+
        xNum(r.attBonus,'n')+xNum(r.addPetrol,'n')+xNum(r.addMis,'n')+
        xNum(r.net,'f','=RC[-6]+RC[-3]+RC[-2]+RC[-1]'));
    });
    var last=first+rows.length-1;
    function sm(){ return '=SUM(R'+first+'C:R'+last+'C)'; }
    x+=xRow(xAt(3)+' ss:StyleID="tot"><Data ss:Type="String">TOTAL ('+rows.length+' staff)</Data></Cell>'+xStr('','tot')+xStr('','tot')+
      [5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23].map(function(){ return xNum(0,'tot',sm()); }).join('')+
      xStr('','tot')+xStr('','tot')+xNum(0,'tot',sm())+xNum(0,'tot',sm())+xNum(0,'tot',sm())+xNum(0,'tot',sm()));
    /* AutoFilter on the header row - one click to isolate a branch, sort by ATT or find a name. */
    x+='</Table><AutoFilter x:Range="R7C1:R'+last+'C'+W.length+'" xmlns="urn:schemas-microsoft-com:office:excel"/>'+
       '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><SplitHorizontal>7</SplitHorizontal><TopRowBottomPane>7</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions></Worksheet>';
    return x;
  }

  /* Gross / non-PF staff. They are not on the 26-day basis, so they get their own simple tab
     rather than being forced into a sheet whose formulas would not apply to them. */
  function grossSheetXml(rows,mlabel,brLabel){
    var x='<Worksheet ss:Name="GROSS STAFF"><Table>'+
      [8,10,30,14,10,10,10,12,12,12,12,12].map(function(w){ return '<Column ss:Width="'+(w*7)+'"/>'; }).join('');
    x+=xRow(xStr('GROSS-PAY / NON-PF STAFF — '+mlabel+' · '+brLabel,'t'));
    x+=xRow(xStr('Per day = salary × 12 ÷ 365. No PF. No 26-day basis.'));
    x+=xRow('');
    x+=xRow(['SR','CODE','NAME','BRANCH','SALARY','LOP DAYS','PER DAY','LOP CUT','EARNED','ADDITIONS','DEDUCTIONS','NET']
      .map(function(h){ return xStr(h,'h'); }).join(''));
    var first=5, sr=0;
    rows.forEach(function(r){
      sr++;
      x+=xRow(xNum(sr,'s')+xStr(r.empId||'','s')+xStr(r.name||'','s')+xStr(brName(r.branchId),'s')+
        xNum(r.actualSalary,'n')+
        '<Cell ss:StyleID="n"><Data ss:Type="Number">'+(Number(r.lopDays)||0)+'</Data></Cell>'+
        xNum(r.perDay,'f','=ROUND(RC[-2]*12/365,0)')+
        xNum(r.lopAmt,'f','=ROUND(RC[-3]*12/365*RC[-2],0)')+
        xNum(r.earned,'f','=RC[-4]-RC[-1]')+
        xNum(r.additions,'n')+
        xNum(r.deductions-(Number(r.lopAmt)||0),'n')+
        xNum(r.net,'f','=RC[-3]+RC[-2]-RC[-1]'));
    });
    var last=first+rows.length-1;
    /* col 4 is BRANCH (blank), 5 SALARY (sum), 6 LOP DAYS and 7 PER DAY (blank), 8-12 money (sum). */
    x+=xRow(xAt(3)+' ss:StyleID="tot"><Data ss:Type="String">TOTAL ('+rows.length+' staff)</Data></Cell>'+
      xStr('','tot')+xNum(0,'tot','=SUM(R'+first+'C:R'+last+'C)')+xStr('','tot')+xStr('','tot')+
      [8,9,10,11,12].map(function(){ return xNum(0,'tot','=SUM(R'+first+'C:R'+last+'C)'); }).join(''));
    x+='</Table><AutoFilter x:Range="R4C1:R'+last+'C12" xmlns="urn:schemas-microsoft-com:office:excel"/></Worksheet>';
    return x;
  }

  window.renderField=renderField;
  window.renderPolicy=renderPolicy;
  window.renderPayroll=renderPayroll;
})();