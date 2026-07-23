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
    if(pf) pf.onchange=function(){ var f=this.files[0]; if(!f) return; if(f.size>8*1024*1024){ toast('File too large (max 8MB)',true); this.value=''; return; }
      var s=$id('poFileSt'); s.textContent='Uploading…'; var fr=new FileReader();
      fr.onload=function(){ var d=fr.result,i=d.indexOf(',');
        API.uploadFile({base64:d.slice(i+1),fileName:f.name,mimeType:f.type,subPath:'Policies'}).then(function(r){ if(r&&r.ok){ fileUrl=r.url; s.textContent='✓ '+f.name+' — tap to replace'; } else { s.textContent='Upload failed — tap to retry'; } },function(){ s.textContent='Upload failed — tap to retry'; }); };
      fr.readAsDataURL(f); };
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
      v.innerHTML='<div class="page-head"><h1>My Payslip</h1></div><div class="grid2" style="max-width:340px"><div class="field"><label>Month</label><input id="pyMonth" class="in" type="month" value="'+ymNow()+'"></div></div><div id="pySlip"></div>';
      $id('pyMonth').onchange=loadMySlip; loadMySlip(); return;
    }
    var brs=(S.meta&&S.meta.branches)||[];
    v.innerHTML='<div class="page-head"><h1>Payroll</h1></div>'+
      '<div class="pm2-filt" style="grid-template-columns:1fr 1fr auto"><div><label>Month</label><input id="pyMonth" class="in" type="month" value="'+ymNow()+'"></div>'+
      '<div><label>Branch</label><select id="pyBranch" class="in"><option value="">All</option>'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'">'+esc(b.BranchName)+'</option>';}).join('')+'</select></div>'+
      '<div style="align-self:end"><button class="btn" id="pyRun">Run payroll</button></div></div>'+
      '<div id="pyActions" class="pm2-bar" style="display:none"><button class="btn ghost sm" id="pyBank">⤓ Bank file (CMS)</button> <button class="btn ghost sm" id="pyReg">⤓ Salary register (Excel)</button> <button class="btn ghost sm" id="pyRegPdf">⤓ Salary register (PDF)</button></div>'+
      '<div id="pyTable"></div>';
    $id('pyRun').onclick=runPay;
    loadPayslips();
  }
  var PAY={slips:[],month:ymNow()};
  var R='#A32D2D', G='#0F6E56';
  function m0(n){ return '₹'+money(n); }
  function numv(v){ return Math.max(0,Math.round(Number(v)||0)); }
  function stop(e){ e.stopPropagation(); }
  /* mirror of the backend statutory maths, so Net previews live as you type additions/deductions */
  function pcCalc(s){
    var inc=numv(s._inc), bon=numv(s._bon), trv=numv(s._trv);
    var addOther=0; (s._other||[]).forEach(function(o){ addOther+=numv(o.amt); });
    var additions=inc+bon+trv+addOther, basic=Number(s.basic)||0, lopAmt=Number(s.lopAmt)||0, gross=basic+additions;
    var pfOn=(s.pfOn===false)?false:true;
    var esiMode=s.esiMode||'auto';
    var esiOn=esiMode==='yes'?true:(esiMode==='no'?false:(gross>0&&gross<=21000));
    var ptAmt=(s.ptAmt===undefined||s.ptAmt===''||s.ptAmt===null)?200:(Number(s.ptAmt)||0);
    var pf=pfOn?Math.round(basic*0.12):0;
    var esi=esiOn?Math.round(gross*0.0075):0;
    var pt=basic>0?ptAmt:0;
    var otherDed=numv(s._otherDed);
    var ded=lopAmt+pf+esi+pt+otherDed;
    return {inc:inc,bon:bon,trv:trv,addOther:addOther,other:(s._other||[]),additions:additions,gross:gross,lopAmt:lopAmt,pf:pf,esi:esi,pt:pt,otherDed:otherDed,otherDedLabel:s._otherDedLabel||'',ded:ded,net:gross-ded};
  }
  function loadPayslips(){ PAY.month=$id('pyMonth').value||ymNow(); API.listPayslips(PAY.month, ($id('pyBranch')||{}).value||'').then(function(r){ if(r&&r.ok){ PAY.slips=(r.slips||[]).map(initSlip); paintPay(); } }); }
  function initSlip(s){
    s._inc=Number(s.addIncentive)||0; s._bon=Number(s.addBonus)||0; s._trv=Number(s.addTravel)||0;
    s._other=[]; if(s.addOtherJson){ try{ s._other=JSON.parse(s.addOtherJson)||[]; }catch(e){ s._other=[]; } }
    if(!s._inc&&!s._bon&&!s._trv&&!s._other.length&&Number(s.additions)>0) s._inc=Number(s.additions);
    s._otherDed=Number(s.otherDed)||0; s._otherDedLabel=s.otherDedLabel||'';
    return s;
  }
  /* gather each employee's split additions + other deduction for the backend */
  function collectAdj(){ var m={}; PAY.slips.forEach(function(s){
    var inc=numv(s._inc),bon=numv(s._bon),trv=numv(s._trv);
    var other=(s._other||[]).map(function(o){return {label:String((o&&o.label)||'Other'),amt:numv(o&&o.amt)};}).filter(function(o){return o.amt>0;});
    var od=numv(s._otherDed);
    if(inc||bon||trv||other.length||od) m[s.empId]={incentive:inc,bonus:bon,travel:trv,other:other,otherDed:od,otherDedLabel:s._otherDedLabel||''};
  }); return m; }
  function runPay(){ var b=$id('pyRun'); b.disabled=true; b.textContent='Running…'; PAY.month=$id('pyMonth').value||ymNow();
    API.runPayroll(PAY.month, ($id('pyBranch')||{}).value||'', collectAdj()).then(function(r){ b.disabled=false; b.textContent='Run payroll'; if(r&&r.ok){ PAY.slips=(r.slips||[]).map(initSlip); toast('Payroll saved for '+r.slips.length+' staff'); paintPay(); } else toast((r&&r.error)||'Failed',true); }); }
  function paintPay(){
    var box=$id('pyTable'); if(!box) return; var act=$id('pyActions'); if(act) act.style.display=PAY.slips.length?'flex':'none';
    if(!PAY.slips.length){ box.innerHTML='<div class="empty">No payslips. Pick a month and Run payroll.</div>'; return; }
    box.innerHTML=
      '<div id="pyKpi" class="pyk-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px"></div>'+
      '<div class="py2 py2-head"><div>Employee</div><div class="r">Base</div><div class="r" style="color:'+G+'">Additions</div><div class="r" style="color:'+R+'">Deductions</div><div class="r">Net payable</div><div></div></div>'+
      '<div id="pyRows"></div>'+
      '<div style="font-size:11px;color:#9aa0a6;margin-top:10px">Tap a row to open its Additions &amp; Deductions detail. Edit amounts and Net updates live; press <b>Run payroll</b> to save. PF 12% of basic · ESI 0.75% if gross ≤ ₹21,000 (adding pay can switch ESI off) · PT ₹200 · LOP = base ÷ days × absent.</div>';
    var rows=$id('pyRows');
    PAY.slips.forEach(function(s,i){
      var c=pcCalc(s);
      var row=document.createElement('div'); row.className='py-row'; row.setAttribute('data-i',i);
      row.innerHTML=
        '<div class="py2 py-main">'+
          '<div><b>'+esc(s.name)+'</b><div class="py-sub">'+s.paidDays+(s.totalDays?'/'+s.totalDays:'')+' paid'+(Number(s.lopDays)>0?' · '+s.lopDays+' LOP':'')+'</div></div>'+
          '<div class="r">'+m0(s.basic||s.earned)+'</div>'+
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
  }
  /* Whole-payroll Salary Register PDF (all staff, grouped earnings/deductions + totals) via print iframe. */
  function registerPdf(slips,month){
    if(!slips||!slips.length){ toast('No payslips to export.',true); return; }
    var brSel=$id('pyBranch'); var brLabel=(brSel&&brSel.value)?(brSel.options[brSel.selectedIndex].text):'All branches';
    var mlabel=month; try{ var p=String(month).split('-'); mlabel=new Date(+p[0],+p[1]-1,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'}); }catch(e){}
    var today=new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
    var keys=['basic','addIncentive','addBonus','addTravel','addOther','gross','lopAmt','pf','esi','pt','otherDed','deductions','net'];
    var tot={}; keys.forEach(function(k){tot[k]=0;});
    function c(v){ return Number(v)>0?money(v):'—'; }
    function n(v){ return money(Number(v)||0); }
    var body=slips.map(function(s){
      keys.forEach(function(k){ tot[k]+=Number(s[k])||0; });
      var zero=!(Number(s.basic)||Number(s.net));
      return '<tr'+(zero?' class="z"':'')+'>'+
        '<td class="l">'+esc(s.name||'')+'<div class="sub">'+esc(s.empId||'')+' · '+(s.paidDays||0)+'/'+(s.totalDays||0)+(Number(s.lopDays)>0?' · '+s.lopDays+' abs':'')+'</div></td>'+
        '<td>'+n(s.basic)+'</td><td>'+c(s.addIncentive)+'</td><td>'+c(s.addBonus)+'</td><td>'+c(s.addTravel)+'</td><td>'+c(s.addOther)+'</td><td class="b">'+n(s.gross)+'</td>'+
        '<td>'+c(s.lopAmt)+'</td><td>'+c(s.pf)+'</td><td>'+c(s.esi)+'</td><td>'+c(s.pt)+'</td><td>'+c(s.otherDed)+'</td><td class="b">'+n(s.deductions)+'</td>'+
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
      '<div class="ft">Generated '+today+' · Nakoda MIS · PF 12% of basic · ESI 0.75% (gross ≤ ₹21,000) · PT ₹200 · LOP = base ÷ days × absent</div>'+
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
    return '<div class="py-box"><div class="py-bt" style="color:'+G+'">ADDITIONS (+)</div>'+
        addLi(i,'Incentive','_inc',s._inc)+addLi(i,'Bonus','_bon',s._bon)+addLi(i,'Travel / arrears','_trv',s._trv)+
        otherAddLines(i,s._other)+
        '<button class="py-addbtn" data-oadd="'+i+'">+ Add other addition</button>'+
        '<div class="py-lt"><span>Total additions</span><span data-c="addtot" style="color:'+G+'">'+m0(c.additions)+'</span></div></div>'+
      '<div class="py-box"><div class="py-bt" style="color:'+R+'">DEDUCTIONS (−)</div>'+
        dedLi('Absent / half-day (LOP '+(s.lopDays||0)+'d)',c.lopAmt)+dedLi('Provident fund (12%)',c.pf)+
        '<div class="py-li"><span>ESI (0.75%)</span><span data-c="esi">'+(c.esi>0?'−'+m0(c.esi):'—')+'</span></div>'+
        dedLi('Professional tax',c.pt)+
        '<div class="py-li" style="gap:6px"><input data-otherlbl="'+i+'" value="'+esc(s._otherDedLabel||'')+'" placeholder="Other deduction (advance / loan)" style="flex:1;min-width:0"><input type="number" min="0" data-otherded="'+i+'" value="'+(Number(s._otherDed)>0?Number(s._otherDed):'')+'" placeholder="0" style="width:80px"></div>'+
        '<div class="py-lt"><span>Total deductions</span><span data-c="dedtot" style="color:'+R+'">−'+m0(c.ded)+'</span></div>'+
        '<div style="margin-top:8px;text-align:right"><button class="btn ghost sm" data-pdf="'+esc(s.empId)+'">⤓ Download PDF</button></div></div>';
  }
  function addLi(i,label,key,val){ return '<div class="py-li"><span>'+label+'</span><input type="number" min="0" data-i="'+i+'" data-key="'+key+'" value="'+(Number(val)>0?Number(val):'')+'" placeholder="0"></div>'; }
  function dedLi(label,val){ return '<div class="py-li"><span>'+label+'</span><span>'+(Number(val)>0?'−'+m0(val):'—')+'</span></div>'; }
  function otherAddLines(i,arr){ return (arr||[]).map(function(o,k){ return '<div class="py-li" style="gap:6px"><input data-oi="'+i+'" data-ok="'+k+'" data-of="label" value="'+esc((o&&o.label)||'')+'" placeholder="Reason (e.g. Overtime)" style="flex:1;min-width:0"><input type="number" min="0" data-oi="'+i+'" data-ok="'+k+'" data-of="amt" value="'+(Number(o&&o.amt)>0?Number(o.amt):'')+'" placeholder="0" style="width:80px"><span class="py-rem" data-orem="'+i+'" data-ok="'+k+'">×</span></div>'; }).join(''); }
  /* live view of every slip with its typed additions/deductions applied (for KPIs, exports, slips, PDF) */
  function computed(){ return PAY.slips.map(function(s){ var c=pcCalc(s); var oth=(c.other||[]).map(function(o){return {label:String((o&&o.label)||'Other'),amt:numv(o&&o.amt)};}).filter(function(o){return o.amt>0;});
    return Object.assign({},s,{additions:c.additions,addIncentive:c.inc,addBonus:c.bon,addTravel:c.trv,addOther:c.addOther,addOtherJson:(oth.length?JSON.stringify(oth):''),otherDed:c.otherDed,otherDedLabel:c.otherDedLabel,gross:c.gross,lopAmt:c.lopAmt,pf:c.pf,esi:c.esi,pt:c.pt,deductions:c.ded,net:c.net,fieldPay:c.additions}); }); }
  function paintKpi(){
    var t={g:0,a:0,d:0,n:0}; PAY.slips.forEach(function(s){ var c=pcCalc(s); t.g+=(Number(s.basic)||0)+c.additions; t.a+=c.additions; t.d+=c.ded; t.n+=c.net; });
    var k=$id('pyKpi'); if(!k) return;
    k.innerHTML=
      '<div class="pyk"><div class="pyk-l">Gross salary</div><div class="pyk-v">'+m0(t.g)+'</div></div>'+
      '<div class="pyk"><div class="pyk-l">Additions (+)</div><div class="pyk-v" style="color:'+G+'">+'+m0(t.a)+'</div></div>'+
      '<div class="pyk"><div class="pyk-l">Deductions (−)</div><div class="pyk-v" style="color:'+R+'">−'+m0(t.d)+'</div></div>'+
      '<div class="pyk"><div class="pyk-l">Net payout</div><div class="pyk-v">'+m0(t.n)+'</div></div>';
  }
  function wireRows(){
    var rows=$id('pyRows'); if(!rows) return;
    rows.querySelectorAll('.py-row').forEach(function(row){
      var main=row.querySelector('.py-main'), det=row.querySelector('.py-det');
      main.onclick=function(e){ if(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON'||e.target.className==='py-rem') return; var open=det.style.display!=='none'; det.style.display=open?'none':'grid'; row.classList.toggle('open',!open); };
      wireDetail(row, +row.getAttribute('data-i'));
    });
  }
  function wireDetail(row,i){
    var s=PAY.slips[i];
    row.querySelectorAll('input[data-key]').forEach(function(inp){ inp.onclick=stop; inp.oninput=function(){ s[inp.getAttribute('data-key')]=numv(inp.value); refreshRow(row,s); paintKpi(); }; });
    row.querySelectorAll('input[data-oi]').forEach(function(inp){ inp.onclick=stop; inp.oninput=function(){ var k=+inp.getAttribute('data-ok'), f=inp.getAttribute('data-of'); s._other[k]=s._other[k]||{label:'',amt:0}; if(f==='amt') s._other[k].amt=numv(inp.value); else s._other[k].label=inp.value; refreshRow(row,s); paintKpi(); }; });
    row.querySelectorAll('[data-orem]').forEach(function(x){ x.onclick=function(e){ e.stopPropagation(); s._other.splice(+x.getAttribute('data-ok'),1); redrawDetail(row,i); }; });
    var addb=row.querySelector('[data-oadd]'); if(addb) addb.onclick=function(e){ e.stopPropagation(); s._other=s._other||[]; s._other.push({label:'',amt:0}); redrawDetail(row,i); };
    var od=row.querySelector('[data-otherded]'); if(od){ od.onclick=stop; od.oninput=function(){ s._otherDed=numv(od.value); refreshRow(row,s); paintKpi(); }; }
    var ol=row.querySelector('[data-otherlbl]'); if(ol){ ol.onclick=stop; ol.oninput=function(){ s._otherDedLabel=ol.value; }; }
    var pdf=row.querySelector('[data-pdf]'); if(pdf) pdf.onclick=function(e){ e.stopPropagation(); var sc=computed().filter(function(x){return String(x.empId)===pdf.getAttribute('data-pdf');})[0]; payslipPdf(sc,sc.name,PAY.month); };
  }
  function redrawDetail(row,i){ var det=row.querySelector('.py-det'); det.innerHTML=buildDetail(PAY.slips[i],i); det.style.display='grid'; row.classList.add('open'); wireDetail(row,i); refreshRow(row,PAY.slips[i]); paintKpi(); }
  function refreshRow(row,s){
    var c=pcCalc(s);
    row.querySelector('[data-c="add"]').innerHTML=c.additions?'+'+m0(c.additions):'—';
    row.querySelector('[data-c="ded"]').innerHTML='−'+m0(c.ded);
    row.querySelector('[data-c="net"]').innerHTML=m0(c.net);
    var at=row.querySelector('[data-c="addtot"]'); if(at) at.innerHTML=m0(c.additions);
    var dt=row.querySelector('[data-c="dedtot"]'); if(dt) dt.innerHTML='−'+m0(c.ded);
    var es=row.querySelector('[data-c="esi"]'); if(es) es.innerHTML=c.esi>0?'−'+m0(c.esi):'—';
  }
  /* Per-staff payslip PDF via a hidden print iframe — lists base, every addition (incl custom) and deduction line. */
  function payslipPdf(s,name,month){
    function ln(l,v,neg){ return '<tr><td style="padding:5px 0;color:#444">'+esc(l)+'</td><td style="padding:5px 0;text-align:right;color:'+(neg?'#A32D2D':'#111')+'">'+(neg?'−':'')+'₹'+money(v)+'</td></tr>'; }
    var earn=ln('Basic salary',(s.basic!=null?s.basic:s.earned));
    if(Number(s.addIncentive)>0) earn+=ln('Incentive',s.addIncentive);
    if(Number(s.addBonus)>0) earn+=ln('Bonus',s.addBonus);
    if(Number(s.addTravel)>0) earn+=ln('Travel / arrears',s.addTravel);
    var oth=[]; if(s.addOtherJson){ try{ oth=JSON.parse(s.addOtherJson)||[]; }catch(e){} }
    oth.forEach(function(o){ if(Number(o.amt)>0) earn+=ln(o.label||'Other',o.amt); });
    var grossV=Number(s.basic||s.earned||0)+Number(s.additions||0);
    var ded=''; if(Number(s.lopAmt)>0) ded+=ln('Absent / half-day (LOP '+(s.lopDays||0)+'d)',s.lopAmt,true);
    if(Number(s.pf)>0) ded+=ln('Provident fund (12%)',s.pf,true);
    if(Number(s.esi)>0) ded+=ln('ESI (0.75%)',s.esi,true);
    if(Number(s.pt)>0) ded+=ln('Professional tax',s.pt,true);
    if(Number(s.otherDed)>0) ded+=ln(s.otherDedLabel||'Other deduction',s.otherDed,true);
    if(!ded) ded=ln('Deductions',0,false);
    var html='<!doctype html><html><head><meta charset="utf-8"><title>Payslip '+esc(name)+' '+esc(month)+'</title>'+
      '<style>@page{size:A4;margin:16mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0}.hd{border-top:6px solid #DA1017;padding:14px 0;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e2e5ea}.h1{color:#DA1017;font-size:22px;font-weight:800}.sub{color:#666;font-size:12px;margin-top:2px}.meta{font-size:13px;color:#444;margin:12px 0}.sect{color:#DA1017;font-weight:700;font-size:13px;margin:14px 0 4px}table{width:100%;border-collapse:collapse;font-size:13px}.tot td{border-top:1px solid #ccc;font-weight:700;padding-top:6px}.net{margin-top:14px;background:#eafaf3;color:#1a7f37;border-radius:8px;padding:12px 14px;display:flex;justify-content:space-between;font-size:18px;font-weight:800}.ft{margin-top:18px;color:#999;font-size:11px;text-align:center}</style></head><body>'+
      '<div class="hd"><div><div class="h1">NAKODA</div><div class="sub">Diagnostics And Research Center</div></div><div style="text-align:right"><div style="font-weight:700">PAYSLIP — '+esc(month)+'</div><div class="sub">'+esc(name)+' · '+esc(s.empId||'')+'</div></div></div>'+
      '<div class="meta">Paid days '+s.paidDays+' / '+s.totalDays+'  ·  LOP '+s.lopDays+'  ·  Leave '+(s.leaveDays||0)+'</div>'+
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
    var drow=''; if(Number(s.lopAmt)>0) drow+='<div class="psrow"><span>Absent / half-day (LOP)</span><span style="color:#A32D2D">−₹'+money(s.lopAmt)+'</span></div>'; if(Number(s.pf)>0) drow+='<div class="psrow"><span>Provident fund (12%)</span><span style="color:#A32D2D">−₹'+money(s.pf)+'</span></div>'; if(Number(s.esi)>0) drow+='<div class="psrow"><span>ESI (0.75%)</span><span style="color:#A32D2D">−₹'+money(s.esi)+'</span></div>'; if(Number(s.pt)>0) drow+='<div class="psrow"><span>Professional tax</span><span style="color:#A32D2D">−₹'+money(s.pt)+'</span></div>'; if(Number(s.otherDed)>0) drow+='<div class="psrow"><span>'+esc(s.otherDedLabel||'Other deduction')+'</span><span style="color:#A32D2D">−₹'+money(s.otherDed)+'</span></div>';
    box.innerHTML='<div class="att-card" style="text-align:left"><div style="font-size:11px;color:#666">Paid '+s.paidDays+'/'+s.totalDays+' · LOP '+s.lopDays+'</div><div class="psrow"><span>Basic salary</span><span>₹'+money(s.basic!=null?s.basic:s.earned)+'</span></div>'+(Number(s.additions)>0?'<div class="psrow"><span>Additions</span><span style="color:#0F6E56">+₹'+money(s.additions)+'</span></div>':'')+drow+'<div class="net2">Net ₹'+money(s.net)+'</div><button class="btn" id="myslipDl" style="margin-top:10px">⤓ Download payslip</button></div>';
    $id('myslipDl').onclick=function(){ payslipPng(s,(S.user&&S.user.FullName)||'',m); }; }); }
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
      rowL('Basic salary',(s.basic!=null?s.basic:s.earned));
      if(Number(s.addIncentive)>0) rowL('Incentive',s.addIncentive);
      if(Number(s.addBonus)>0) rowL('Bonus',s.addBonus);
      if(Number(s.addTravel)>0) rowL('Travel / arrears',s.addTravel);
      if(!(Number(s.addIncentive)||Number(s.addBonus)||Number(s.addTravel)) && Number(s.additions)>0) rowL('Additions',s.additions);
      y+=6; x.fillStyle='#DA1017';x.font='bold 14px Arial';x.fillText('DEDUCTIONS',M,y);y+=28;
      var anyDed=false;
      if(Number(s.lopAmt)>0){ rowL('Absent / half-day (LOP '+s.lopDays+' days)',s.lopAmt,true); anyDed=true; }
      if(Number(s.pf)>0){ rowL('Provident fund (PF 12%)',s.pf,true); anyDed=true; }
      if(Number(s.esi)>0){ rowL('ESI (0.75%)',s.esi,true); anyDed=true; }
      if(Number(s.pt)>0){ rowL('Professional tax',s.pt,true); anyDed=true; }
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
  /* Salary register — full itemised earnings & deductions sheet for HR / audit. */
  function registerXls(slips,month){
    if(!slips||!slips.length){ toast('No payslips to export.',true); return; }
    var cols=['Employee','Emp ID','Paid days','LOP days','Base salary','Incentive','Bonus','Travel','Other additions','Additions total','LOP cut','PF','ESI','Prof. tax','Other deduction','Total deductions','Net payable'];
    var head='<tr>'+cols.map(function(c){return '<th>'+esc(c)+'</th>';}).join('')+'</tr>';
    var sumKeys=['basic','addIncentive','addBonus','addTravel','addOther','additions','lopAmt','pf','esi','pt','otherDed','deductions','net'];
    var tot={}; sumKeys.forEach(function(k){tot[k]=0;});
    var rows=slips.map(function(s){
      sumKeys.forEach(function(k){ tot[k]+=Number(s[k])||0; });
      var vals=[s.name||'',s.empId||'',s.paidDays,s.lopDays,Math.round(Number(s.basic||s.earned||0)),Math.round(Number(s.addIncentive||0)),Math.round(Number(s.addBonus||0)),Math.round(Number(s.addTravel||0)),Math.round(Number(s.addOther||0)),Math.round(Number(s.additions||0)),Math.round(Number(s.lopAmt||0)),Math.round(Number(s.pf||0)),Math.round(Number(s.esi||0)),Math.round(Number(s.pt||0)),Math.round(Number(s.otherDed||0)),Math.round(Number(s.deductions||0)),Math.round(Number(s.net||0))];
      return '<tr>'+vals.map(function(v){return '<td>'+esc(String(v))+'</td>';}).join('')+'</tr>';
    }).join('');
    var totRow='<tr><td colspan="4"><b>Total</b></td>'+sumKeys.map(function(k){return '<td><b>'+Math.round(tot[k])+'</b></td>';}).join('')+'</tr>';
    xlsDownload('<table>'+head+rows+totRow+'</table>','Salary-Register-'+month+'.xls');
  }

  window.renderField=renderField;
  window.renderPolicy=renderPolicy;
  window.renderPayroll=renderPayroll;
})();