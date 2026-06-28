/* Nakoda MIS — Attendance (self check-in/out: selfie + geo, late=half-day; approver review). */
(function(){
  var ATT={ recs:[], coords:null, kind:'in' };
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function $id(i){ return document.getElementById(i); }
  function ymNow(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  function todayS(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function attMode(){ return String((S.user&&S.user.AttendanceMode)||''); }
  function needSelfie(){ return true; }  // selfie required for all modes
  function isFenced(){ var m=attMode().toLowerCase(); return m.indexOf('geo only')>=0 || m.indexOf('office')>=0; }   // "Geo only" mode is fenced to the branch (150 m)
  function hm2min(t){ var p=String(t||'').split(':'); return p.length>=2?(+p[0])*60+(+p[1]):null; }
  function dayBadge(st){ var m={present:['Full day','#eaf7ef','#1a8f4c'],half:['Half day','#faeeda','#854F0B'],leave:['Leave','#e9f1fb','#185FA5'],absent:['Absent','#fdecec','#b23b3b']}; var b=m[String(st||'present')]||m.present; return ' <span style="font-size:11px;font-weight:700;padding:2px 9px;border-radius:10px;background:'+b[1]+';color:'+b[2]+'">'+b[0]+'</span>'; }
  function canApprove(){ var p=S.perms||{}; return p.level==='SUPER'||p.level==='HR_ADMIN'||p.level==='BRANCH_MGR'||(S.user&&S.user.Role==='Operations Manager'); }
  function todayRec(){ var t=todayS(); return (ATT.recs||[]).filter(function(r){return String(r.date)===t;})[0]; }

  function renderAttendance(){
    var v=$id('page-attendance');
    v.innerHTML='<div class="page-head"><h1>Attendance</h1></div>'+
      '<input type="file" id="attSelfie" accept="image/*" capture="user" style="display:none">'+
      '<div id="attMe"></div>'+
      (canApprove()?'<div class="section-label" style="margin-top:18px">Approve — today</div><div id="attApprove"></div>':'')+
      '<div style="height:110px"></div>';   // bottom spacer so the last approve card clears the mobile bottom nav
    $id('attSelfie').onchange=function(){ var f=this.files[0]; if(!f) return; var fr=new FileReader(); fr.onload=function(){ var s=fr.result,i=s.indexOf(','); submitMark(ATT.kind, s.slice(i+1)); }; fr.readAsDataURL(f); this.value=''; };
    paintMe();
    API.cachedAttendance().then(function(r){ if(r&&r.records){ ATT.recs=r.records; paintMe(); } });
    API.myAttendance(ymNow()).then(function(r){ if(r&&r.ok){ ATT.recs=r.records||[]; paintMe(); } });
    if(canApprove()) loadApprove();
  }

  function paintMe(){
    var box=$id('attMe'); if(!box) return;
    var rec=todayRec(), now=new Date();
    var dutyTxt=(S.user&&S.user.DutyStart)?('Shift from '+S.user.DutyStart+(S.user.DutyEnd?('–'+S.user.DutyEnd):'')):'';
    var inb = !rec || !rec.checkIn;
    var btn = inb
      ? '<button class="att-big in" id="attBtn">⊕ Check in</button>'
      : (!rec.checkOut ? '<button class="att-big out" id="attBtn">⊖ Check out</button>' : '<div class="att-done">✓ Done for today</div>');
    var stat = rec ? ('In '+(rec.checkIn||'—')+(rec.checkOut?(' · Out '+rec.checkOut):'')+(rec.workHours?(' · '+rec.workHours+'h'):'')+(String(rec.late)==='yes'?' · ⚠ late (½ day)':'')) : 'Not checked in yet';
    box.innerHTML='<div class="att-card"><div class="att-day">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()]+', '+now.getDate()+' '+MON[now.getMonth()]+'</div>'+
      '<div class="att-sub">'+esc(dutyTxt)+'</div>'+btn+
      '<div class="att-stat">'+esc(stat)+'</div>'+
      '<div class="att-note">'+[ (needSelfie()?'📷 selfie':''), ('📍 location'+(isFenced()?' verified at your branch':'')) ].filter(Boolean).join(' + ')+' · Late after shift+15 min = half day.</div></div>'+
      monthStrip();
    var b=$id('attBtn'); if(b) b.onclick=function(){ doMark(inb?'in':'out'); };
  }
  function monthStrip(){
    var by={}; (ATT.recs||[]).forEach(function(r){ by[r.date]=r; });
    var now=new Date(), y=now.getFullYear(), m=now.getMonth(), days=new Date(y,m+1,0).getDate(), cells='';
    for(var d=1;d<=days;d++){ var ds=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0'); var r=by[ds];
      var cls='wW',ch=''+d; if(r){ var st=String(r.status); cls=st==='present'?'wP':st==='half'?'wL':st==='leave'?'wL':st==='absent'?'wA':'wP'; ch=(st==='half'?'½':(st==='leave'?'L':(st==='absent'?'A':'P'))); }
      else if(new Date(ds)>now){ cls='wF'; ch=''+d; }
      cells+='<span class="wd '+cls+'" title="'+ds+'">'+ch+'</span>';
    }
    return '<div class="att-month"><div class="att-mh">This month</div><div class="att-strip">'+cells+'</div><div class="att-legend">P present · ½ half · L leave · A absent</div></div>';
  }

  function captureSelfie(cb){
    if(!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)){ $id('attSelfie').click(); return; }  // fallback to file/camera input
    var stream=null;
    openModal('Take selfie','<div style="text-align:center"><video id="camV" autoplay playsinline muted style="width:100%;max-width:320px;border-radius:10px;background:#000"></video><canvas id="camC" style="display:none"></canvas><div style="margin-top:10px"><button class="btn" id="camSnap">\ud83d\udcf8 Capture</button> <button class="btn ghost" id="camCancel">Cancel</button></div></div>','');
    var v=document.getElementById('camV');
    navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}}).then(function(st){ stream=st; v.srcObject=st; }).catch(function(){ closeModal(); toast('Camera blocked — pick a photo instead.',true); $id('attSelfie').click(); });
    function stopCam(){ try{ if(stream) stream.getTracks().forEach(function(t){t.stop();}); }catch(e){} }
    var snap=document.getElementById('camSnap'); if(snap) snap.onclick=function(){ var c=document.getElementById('camC'); c.width=v.videoWidth||320; c.height=v.videoHeight||240; c.getContext('2d').drawImage(v,0,0,c.width,c.height); var d=c.toDataURL('image/jpeg',0.8),i=d.indexOf(','); stopCam(); closeModal(); cb(d.slice(i+1)); };
    var cancel=document.getElementById('camCancel'); if(cancel) cancel.onclick=function(){ stopCam(); closeModal(); };
  }
  function promptEarlyReason(cb){
    openModal('Leaving early?','<div style="font-size:13px;color:#555;margin-bottom:8px">You’ve worked under 4 hours — this will be marked <b>half day</b> and sent for approval. Please add a reason:</div><textarea id="earlyReason" rows="2" placeholder="e.g. doctor appointment" style="width:100%;border:1px solid #d9d9d9;border-radius:8px;padding:8px;font-size:13px"></textarea>','<button class="btn ghost" onclick="closeModal()">Cancel</button> <button class="btn" id="earlyOk">Confirm check-out</button>');
    var ok=document.getElementById('earlyOk'); if(ok) ok.onclick=function(){ var v=(document.getElementById('earlyReason').value||'').trim(); if(!v){ toast('Please write a reason.',true); return; } closeModal(); cb(v); };
  }
  function geoThen(kind){
    if(!navigator.geolocation){ toast('Location not supported on this device.',true); return; }
    toast('Getting your location…');
    navigator.geolocation.getCurrentPosition(function(pos){          // always capture location in every mode (so the approval card can show the address)
      ATT.coords={lat:pos.coords.latitude, lng:pos.coords.longitude};
      if(needSelfie()){ captureSelfie(function(b64){ submitMark(kind,b64); }); } else submitMark(kind,null);
    }, function(){ toast('Please allow location to mark attendance.',true); }, {enableHighAccuracy:true, timeout:12000});
  }
  function doMark(kind){
    ATT.kind=kind; ATT.outRemark='';   // under 4 hours auto-marks half day on the server — no reason prompt
    geoThen(kind);
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
    var c=ATT.coords||{}, payload={selfie:selfie, lat:c.lat, lng:c.lng, wfh:!!ATT.wfh, remark:(kind==='out'?(ATT.outRemark||''):'')};
    toast('Marking…');
    var p = kind==='in' ? API.checkIn(payload) : API.checkOut(payload);
    p.then(function(r){
      if(r&&r.ok){ ATT.wfh=false; toast(kind==='in'?('Checked in '+r.checkIn+(r.late?' (late)':'')):('Checked out '+r.checkOut+(r.half?' · half day':''))); API.myAttendance(ymNow()).then(function(x){ if(x&&x.ok){ ATT.recs=x.records||[]; paintMe(); } }); }
      else if(r&&r.wfhPrompt){ promptWfh(r, function(yes){ if(yes){ ATT.wfh=true; submitMark(kind, selfie); } else { ATT.wfh=false; toast('You are not at the centre — '+(kind==='in'?'check-in':'check-out')+' not allowed.',true); } }); }
      else toast((r&&r.error)||'Could not mark — needs internet & location.',true); })
      .catch(function(){ toast('Marking attendance needs an internet connection.',true); });
  }

  /* ---------- approver ---------- */
  function loadApprove(){
    API.listAttendance('',todayS()).then(function(r){ var box=$id('attApprove'); if(!box) return;
      if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
      var recs=(r.records||[]).slice().sort(function(a,b){
        var ta=String(a.checkIn||''), tb=String(b.checkIn||'');
        return tb>ta?1:tb<ta?-1:0;
      });
      if(!recs.length){ box.innerHTML='<div class="empty">No attendance marked yet today.</div>'; return; }
      box.innerHTML=recs.map(function(a){
        var ap=String(a.approvalStatus)==='approved';
        var selfieThumb=a.selfieInUrl
          ? '<a href="'+esc(a.selfieInUrl)+'" target="_blank"><img src="'+esc(a.selfieInUrl)+'" alt="selfie" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1.5px solid #ddd;margin:4px 0;display:block"></a>'
          : '';
        return '<div class="att-row" data-id="'+esc(a.attId)+'" style="align-items:flex-start">'+
          '<div class="att-av" style="margin-top:4px">'+esc(initials(a.empName))+'</div>'+
          '<div class="att-mid" style="flex:1">'+
            '<div class="att-nm"><b>'+esc(a.empName)+'</b>'+dayBadge(a.status)+(String(a.late)==='yes'?' <span class="att-late">late</span>':'')+'</div>'+
            '<div class="att-m">In '+esc(a.checkIn||'—')+(a.checkOut?(' · Out '+esc(a.checkOut)):'')+((a.workHours&&!isNaN(Number(a.workHours)))?(' · '+esc(a.workHours)+'h'):'')+' · '+esc(stLabel(a.status))+((a.latIn&&a.lngIn)?' · <a href="https://maps.google.com/?q='+esc(a.latIn)+','+esc(a.lngIn)+'" target="_blank">📍 '+esc(a.addrIn||'location')+'</a>':'')+'</div>'+
            '<div class="att-m">ID '+esc(a.empId||'')+(a.dutyStart?(' · Duty '+esc(a.dutyStart)+(a.dutyEnd?('–'+esc(a.dutyEnd)):'')):'')+(a.attMode?(' · '+esc(a.attMode)):'')+'</div>'+
            (a.notes?'<div class="att-m" style="color:#a3271f;font-weight:600">📝 '+esc(a.notes)+'</div>':'')+
            selfieThumb+
          '</div>'+
          '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">'+
            (ap?'<span class="att-ok">✓ approved</span>':'<button class="btn sm" data-ap="'+esc(a.attId)+'">Approve</button>')+
            '<select class="att-sel" data-st="'+esc(a.attId)+'">'+['present','half','leave','absent'].map(function(s){return '<option value="'+s+'"'+(s===a.status?' selected':'')+'>'+esc(stLabel(s))+'</option>';}).join('')+'</select>'+
          '</div>'+
          '</div>';
      }).join('');
      box.querySelectorAll('[data-ap]').forEach(function(b){ b.onclick=function(){ API.setAttendance(b.getAttribute('data-ap'),{approvalStatus:'approved'}).then(function(x){ if(x&&x.ok){ toast('Approved'); loadApprove(); } else toast((x&&x.error)||'Failed',true); }); }; });
      box.querySelectorAll('[data-st]').forEach(function(s){ s.onchange=function(){ API.setAttendance(s.getAttribute('data-st'),{status:s.value}).then(function(x){ if(x&&x.ok) toast('Updated'); else toast((x&&x.error)||'Failed',true); }); }; });
    }).catch(function(){ var box=$id('attApprove'); if(box) box.innerHTML='<div class="empty">Connect to load today’s attendance.</div>'; });
  }
  window.renderAttendance=renderAttendance;
})();
