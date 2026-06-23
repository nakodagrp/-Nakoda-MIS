/* Nakoda MIS — Attendance (self check-in/out: selfie + geo, late=half-day; approver review). */
(function(){
  var ATT={ recs:[], coords:null, kind:'in' };
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function $id(i){ return document.getElementById(i); }
  function ymNow(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  function todayS(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function attMode(){ return String((S.user&&S.user.AttendanceMode)||''); }
  function needSelfie(){ var m=attMode(); return m.indexOf('Selfie')>=0 || m===''; }
  function canApprove(){ var p=S.perms||{}; return p.level==='SUPER'||p.level==='HR_ADMIN'||p.level==='BRANCH_MGR'||(S.user&&S.user.Role==='Operations Manager'); }
  function todayRec(){ var t=todayS(); return (ATT.recs||[]).filter(function(r){return String(r.date)===t;})[0]; }

  function renderAttendance(){
    var v=$id('page-attendance');
    v.innerHTML='<div class="page-head"><h1>Attendance</h1></div>'+
      '<input type="file" id="attSelfie" accept="image/*" capture="user" style="display:none">'+
      '<div id="attMe"></div>'+
      (canApprove()?'<div class="section-label" style="margin-top:18px">Approve — today</div><div id="attApprove"></div>':'');
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
      '<div class="att-note">'+(needSelfie()?'📷 selfie':'')+(needSelfie()?' + ':'')+'📍 location verified at your branch. Late after shift+15 min = half day.</div></div>'+
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
  function doMark(kind){
    ATT.kind=kind;
    if(!navigator.geolocation){ toast('Location not supported on this device.',true); return; }
    toast('Getting your location…');
    navigator.geolocation.getCurrentPosition(function(pos){
      ATT.coords={lat:pos.coords.latitude, lng:pos.coords.longitude};
      if(needSelfie()){ captureSelfie(function(b64){ submitMark(kind,b64); }); } else submitMark(kind,null);
    }, function(){ toast('Please allow location to mark attendance.',true); }, {enableHighAccuracy:true, timeout:12000});
  }
  function submitMark(kind, selfie){
    var c=ATT.coords||{}, payload={selfie:selfie, lat:c.lat, lng:c.lng};
    toast('Marking…');
    var p = kind==='in' ? API.checkIn(payload) : API.checkOut(payload);
    p.then(function(r){ if(r&&r.ok){ toast(kind==='in'?('Checked in '+r.checkIn+(r.late?' (late)':'')):('Checked out '+r.checkOut)); API.myAttendance(ymNow()).then(function(x){ if(x&&x.ok){ ATT.recs=x.records||[]; paintMe(); } }); }
      else toast((r&&r.error)||'Could not mark — needs internet & location.',true); })
      .catch(function(){ toast('Marking attendance needs an internet connection.',true); });
  }

  /* ---------- approver ---------- */
  function loadApprove(){
    API.listAttendance('',todayS()).then(function(r){ var box=$id('attApprove'); if(!box) return;
      if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
      var recs=r.records||[];
      if(!recs.length){ box.innerHTML='<div class="empty">No attendance marked yet today.</div>'; return; }
      box.innerHTML=recs.map(function(a){
        var ap=String(a.approvalStatus)==='approved';
        return '<div class="att-row" data-id="'+esc(a.attId)+'"><div class="att-av">'+esc(initials(a.empName))+'</div>'+
          '<div class="att-mid"><div class="att-nm"><b>'+esc(a.empName)+'</b>'+(String(a.late)==='yes'?' <span class="att-late">late</span>':'')+'</div>'+
          '<div class="att-m">In '+esc(a.checkIn||'—')+(a.checkOut?(' · Out '+esc(a.checkOut)):'')+(a.workHours?(' · '+esc(a.workHours)+'h'):'')+' · '+esc(a.status||'')+(a.selfieInUrl?' · <a href="'+esc(a.selfieInUrl)+'" target="_blank">selfie</a>':'')+'</div></div>'+
          (ap?'<span class="att-ok">✓ approved</span>':'<button class="btn sm" data-ap="'+esc(a.attId)+'">Approve</button>')+
          '<select class="att-sel" data-st="'+esc(a.attId)+'">'+['present','half','leave','absent'].map(function(s){return '<option'+(s===a.status?' selected':'')+'>'+s+'</option>';}).join('')+'</select>'+
          '</div>';
      }).join('');
      box.querySelectorAll('[data-ap]').forEach(function(b){ b.onclick=function(){ API.setAttendance(b.getAttribute('data-ap'),{approvalStatus:'approved'}).then(function(x){ if(x&&x.ok){ toast('Approved'); loadApprove(); } else toast((x&&x.error)||'Failed',true); }); }; });
      box.querySelectorAll('[data-st]').forEach(function(s){ s.onchange=function(){ API.setAttendance(s.getAttribute('data-st'),{status:s.value}).then(function(x){ if(x&&x.ok) toast('Updated'); else toast((x&&x.error)||'Failed',true); }); }; });
    }).catch(function(){ var box=$id('attApprove'); if(box) box.innerHTML='<div class="empty">Connect to load today’s attendance.</div>'; });
  }

  window.renderAttendance=renderAttendance;
})();
