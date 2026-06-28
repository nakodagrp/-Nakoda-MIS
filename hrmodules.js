/* Nakoda MIS — HR: Leave, Field claims (km/visit), Company Policy, Payroll. */
(function(){
  function $id(i){ return document.getElementById(i); }
  function ymNow(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  function todayS(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function money(n){ return Math.round(Number(n)||0).toLocaleString('en-IN'); }
  function lvl(){ return (S.perms&&S.perms.level)||''; }
  function canLeaveApprove(){ return lvl()==='BRANCH_MGR'||lvl()==='SUPER'||(S.user&&String(S.user.Role)==='Operations Manager'); }
  function canClaimApprove(){ return lvl()==='BRANCH_MGR'||lvl()==='HR_ADMIN'||lvl()==='SUPER'||(S.user&&S.user.Role==='Operations Manager'); }
  function payAllowed(){ return lvl()==='SUPER'||lvl()==='HR_ADMIN'; }
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
  function renderPolicy(){
    var v=$id('page-policy');
    v.innerHTML='<div class="page-head"><h1>Company Policy</h1><div class="spacer"></div><button class="btn" id="polAdd" style="display:none">+ New policy</button></div><div id="polList"></div>';
    API.cachedPolicies().then(function(r){ if(r) paintPolicies(r); });
    API.listPolicies().then(function(r){ if(r&&r.ok) paintPolicies(r); });
  }
  function paintPolicies(r){
    var add=$id('polAdd'); if(add){ add.style.display=r.canManage?'':'none'; add.onclick=function(){ openPolicyForm(null); }; }
    var box=$id('polList'); if(!box) return; var pols=r.policies||[];
    if(!pols.length){ box.innerHTML='<div class="empty">No policies yet.</div>'; return; }
    box.innerHTML=pols.map(function(p){ return '<div class="pol-card"><div class="pol-h"><b>'+esc(p.title)+'</b> <span style="font-size:10px;color:#aaa">v'+p.version+'</span>'+(p.acked?'<span class="att-ok" style="margin-left:auto">✓ Understood</span>':'<span style="margin-left:auto;font-size:10px;color:#c47f00;font-weight:700">NEW</span>')+'</div>'+
      '<div class="pol-body">'+esc(p.body||'').replace(/\n/g,'<br>')+'</div>'+
      (p.acked?'':'<button class="und-btn" data-ack="'+esc(p.policyId)+'">I have read &amp; UNDERSTOOD</button>')+
      (r.canManage?'<div class="pol-admin"><a href="javascript:void(0)" data-edit="'+esc(p.policyId)+'">✎ Edit</a> · <a href="javascript:void(0)" data-acks="'+esc(p.policyId)+'">Who acknowledged</a></div>':'')+'</div>'; }).join('');
    box.querySelectorAll('[data-ack]').forEach(function(b){ b.onclick=function(){ API.ackPolicy(b.getAttribute('data-ack')).then(function(x){ if(x&&x.ok){ toast('Acknowledged'); renderPolicy(); } }); }; });
    box.querySelectorAll('[data-edit]').forEach(function(b){ b.onclick=function(){ var p=pols.filter(function(x){return x.policyId===b.getAttribute('data-edit');})[0]; openPolicyForm(p); }; });
    box.querySelectorAll('[data-acks]').forEach(function(b){ b.onclick=function(){ showAcks(b.getAttribute('data-acks')); }; });
  }
  function openPolicyForm(p){ p=p||{};
    var body='<div class="grid2"><div class="field full"><label>Title</label><input id="poT" class="in" value="'+esc(p.title||'')+'"></div>'+
      '<div class="field full"><label>Policy text</label><textarea id="poB" class="in" rows="8">'+esc(p.body||'')+'</textarea></div></div><div style="font-size:11px;color:#888">Saving notifies all staff &amp; resets the UNDERSTOOD acknowledgement.</div><div id="poMsg"></div>';
    openModal(p.policyId?'Edit policy':'New policy', body, '<button class="btn" id="poSave">'+(p.policyId?'Save (new version)':'Post')+'</button>');
    $id('poSave').onclick=function(){ var t=$id('poT').value.trim(); if(!t){ $id('poMsg').innerHTML='<div class="msg error">Title required.</div>'; return; } this.disabled=true;
      API.savePolicy({policyId:p.policyId,title:t,body:$id('poB').value}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Policy posted'); renderPolicy(); } else $id('poMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
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
      '<div id="pyActions" class="pm2-bar" style="display:none"><button class="btn ghost sm" id="pyBank">⤓ Bank file (CMS)</button> <button class="btn ghost sm" id="pyReg">⤓ Salary register</button></div>'+
      '<div id="pyTable"></div>';
    $id('pyRun').onclick=runPay;
    loadPayslips();
  }
  var PAY={slips:[],month:ymNow()};
  function loadPayslips(){ PAY.month=$id('pyMonth').value||ymNow(); API.listPayslips(PAY.month, ($id('pyBranch')||{}).value||'').then(function(r){ if(r&&r.ok){ PAY.slips=r.slips||[]; paintPay(); } }); }
  function runPay(){ var b=$id('pyRun'); b.disabled=true; b.textContent='Running…'; PAY.month=$id('pyMonth').value||ymNow();
    API.runPayroll(PAY.month, ($id('pyBranch')||{}).value||'').then(function(r){ b.disabled=false; b.textContent='Run payroll'; if(r&&r.ok){ PAY.slips=r.slips||[]; toast('Payroll run for '+r.slips.length+' staff'); paintPay(); } else toast((r&&r.error)||'Failed',true); }); }
  function paintPay(){
    var box=$id('pyTable'); if(!box) return; var act=$id('pyActions'); if(act) act.style.display=PAY.slips.length?'flex':'none';
    if(!PAY.slips.length){ box.innerHTML='<div class="empty">No payslips. Pick a month and Run payroll.</div>'; return; }
    box.innerHTML='<div class="table-wrap"><table><thead><tr><th>Name</th><th>Paid</th><th>LOP</th><th>Earned</th><th>Field</th><th>Net</th><th></th></tr></thead><tbody>'+
      PAY.slips.map(function(s){ return '<tr><td><b>'+esc(s.name)+'</b></td><td>'+s.paidDays+'</td><td>'+s.lopDays+'</td><td>₹'+money(s.earned)+'</td><td>₹'+money(s.fieldPay)+'</td><td><b>₹'+money(s.net)+'</b></td><td><button class="btn ghost sm" data-slip="'+esc(s.empId)+'">Slip</button></td></tr>'; }).join('')+'</tbody></table></div>';
    box.querySelectorAll('[data-slip]').forEach(function(b){ b.onclick=function(){ var s=PAY.slips.filter(function(x){return String(x.empId)===b.getAttribute('data-slip');})[0]; payslipPng(s,s.name,PAY.month); }; });
    var bk=$id('pyBank'); if(bk) bk.onclick=function(){ bankXls(PAY.slips,PAY.month); };
    var rg=$id('pyReg'); if(rg) rg.onclick=function(){ registerXls(PAY.slips,PAY.month); };
  }
  function loadMySlip(){ var m=$id('pyMonth').value||ymNow(); API.myPayslip(m).then(function(r){ var box=$id('pySlip'); if(!box) return; var s=r&&r.ok?r.slip:null; if(!s){ box.innerHTML='<div class="empty">No payslip for '+m+' yet.</div>'; return; }
    box.innerHTML='<div class="att-card" style="text-align:left"><div style="font-size:11px;color:#666">Paid '+s.paidDays+'/'+s.totalDays+' · LOP '+s.lopDays+'</div><div class="psrow"><span>Earned</span><span>₹'+money(s.earned)+'</span></div><div class="psrow"><span>Field pay</span><span>₹'+money(s.fieldPay)+'</span></div><div class="net2">Net ₹'+money(s.net)+'</div><button class="btn" id="myslipDl" style="margin-top:10px">⤓ Download payslip</button></div>';
    $id('myslipDl').onclick=function(){ payslipPng(s,(S.user&&S.user.FullName)||'',m); }; }); }
  function payslipPng(s,name,month){
    var logo=new Image(); logo.onload=function(){ draw(logo); }; logo.onerror=function(){ draw(null); }; logo.src='icons/login-logo.png';
    function draw(logo){ var W=1000,H=620,M=50,c=document.createElement('canvas'); c.width=W;c.height=H; var x=c.getContext('2d');
      x.fillStyle='#fff';x.fillRect(0,0,W,H); x.fillStyle='#DA1017';x.fillRect(0,0,W,8);
      if(logo){var lh=54,lw=Math.min(280,logo.width*(lh/logo.height));x.drawImage(logo,M,28,lw,lh);} else {x.fillStyle='#DA1017';x.font='bold 26px Arial';x.fillText('NAKODA',M,62);}
      x.fillStyle='#1f1f1f';x.font='bold 22px Arial';x.textAlign='right';x.fillText('PAYSLIP — '+month,W-M,46);x.textAlign='left';
      x.fillStyle='#444';x.font='15px Arial';x.fillText(name+' · '+(s.empId||''),M,108);
      x.fillStyle='#888';x.font='13px Arial';x.fillText('Paid days '+s.paidDays+' / '+s.totalDays+'  ·  LOP '+s.lopDays+'  ·  Leave '+s.leaveDays,M,132);
      x.strokeStyle='#e2e5ea';x.beginPath();x.moveTo(M,150);x.lineTo(W-M,150);x.stroke();
      var y=190; function rowL(l,v){ x.fillStyle='#555';x.font='15px Arial';x.fillText(l,M,y); x.fillStyle='#222';x.textAlign='right';x.fillText('₹'+money(v),W-M,y);x.textAlign='left'; y+=34; }
      x.fillStyle='#DA1017';x.font='bold 14px Arial';x.fillText('EARNINGS',M,y);y+=28;
      rowL('Basic / earned (for paid days)',s.earned); rowL('Field / incentive (km/visit)',s.fieldPay);
      x.fillStyle='#DA1017';x.font='bold 14px Arial';x.fillText('DEDUCTIONS',M,y);y+=28; rowL('Deductions',s.deductions||0);
      x.fillStyle='#EAF6EE';x.fillRect(M,y,W-2*M,46);x.fillStyle='#1a7f37';x.font='bold 20px Arial';x.fillText('NET PAY',M+14,y+30);x.textAlign='right';x.fillText('₹'+money(s.net),W-M-14,y+30);x.textAlign='left';
      x.fillStyle='#999';x.font='italic 12px Arial';x.textAlign='center';x.fillText('Computer-generated payslip · Nakoda Diagnostics And Research Center',W/2,H-24);x.textAlign='left';
      c.toBlob(function(b){var u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='Payslip-'+(name||'').replace(/\s+/g,'_')+'-'+month+'.png';a.click();setTimeout(function(){URL.revokeObjectURL(u);},2000);toast('Payslip saved');});
    }
  }
  function xlsDownload(html,name){ var blob=new Blob(['﻿<html><head><meta charset="utf-8"></head><body>'+html+'</body></html>'],{type:'application/vnd.ms-excel'}); var u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(u);},2000); toast('Excel exported'); }
  function bankXls(slips,month){
    var cols=['Client_Code','Product_Code','Payment_Type','Payment_Ref_No.','Payment_Date','Instrument Date','Dr_Ac_No','Amount','Bank_Code_Indicator','Beneficiary_Code','Beneficiary_Name','Beneficiary_Bank','IFSC Code','Beneficiary_Acc_No','Location','Print_Location','Instrument_Number','Ben_Add1','Ben_Add2','Ben_Add3','Ben_Add4','Beneficiary_Email','Beneficiary_Mobile','Debit_Narration','Credit_Narration'];
    var today=new Date(),dt=today.getDate()+'/'+(today.getMonth()+1)+'/'+today.getFullYear();
    var head='<tr>'+cols.map(function(c){return '<th>'+c+'</th>';}).join('')+'</tr>';
    var rows=slips.filter(function(s){return Number(s.net)>0;}).map(functio