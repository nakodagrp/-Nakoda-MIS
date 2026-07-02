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
  // Sheets time cells arrive as ISO strings like "1899-12-30T06:38:50.000Z" — extract HH:MM only
  function fmtDutyTime(t){ if(!t) return ''; var s=String(t); var m=s.match(/T(\d{2}):(\d{2})/); if(m) return m[1]+':'+m[2]; return s; }
  function dayBadge(st){ var m={present:['Full day','#eaf7ef','#1a8f4c'],half:['Half day','#faeeda','#854F0B'],leave:['Leave','#e9f1fb','#185FA5'],absent:['Absent','#fdecec','#b23b3b']}; var b=m[String(st||'present')]||m.present; return ' <span style="font-size:11px;font-weight:700;padding:2px 9px;border-radius:10px;background:'+b[1]+';color:'+b[2]+'">'+b[0]+'</span>'; }
  function canApprove(){ if(S.user&&String(S.user.AttApproveDenied)==='yes') return false; var p=S.perms||{}; return p.level==='SUPER'||p.level==='HR_ADMIN'||p.level==='BRANCH_MGR'||(S.user&&S.user.Role==='Operations Manager'); }
  function todayRec(){ var t=todayS(); return (ATT.recs||[]).filter(function(r){return String(r.date)===t;})[0]; }

  function renderAttendance(){
    var v=$id('page-attendance');
    v.innerHTML='<div class="page-head"><h1>Attendance</h1></div>'+
      '<input type="file" id="attSelfie" accept="image/*" capture="user" style="display:none">'+
      '<div id="attMe"></div>'+
      (canApprove()?'<div class="section-label" style="margin-top:18px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">Approve — today<span id="attApSummary"></span></div>'+
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0 10px">'+
          '<input type="date" id="attApDate" value="'+todayS()+'" style="border:1px solid #d9d9d9;border-radius:8px;padding:6px 8px;font-size:13px">'+
          '<button class="btn sm" id="attApGo">Show</button>'+
        '</div>'+
        '<div id="attApprove"></div>':'')+
      '<div style="height:110px"></div>';   // bottom spacer so the last approve card clears the mobile bottom nav
    $id('attSelfie').onchange=function(){ var f=this.files[0]; if(!f) return; var fr=new FileReader(); fr.onload=function(){ var s=fr.result,i=s.indexOf(','); submitMark(ATT.kind, s.slice(i+1)); }; fr.readAsDataURL(f); this.value=''; };
    paintMe();
    API.cachedAttendance().then(function(r){ if(r&&r.records){ ATT.recs=r.records; paintMe(); } });
    API.myAttendance(ymNow()).then(function(r){ if(r&&r.ok){ ATT.recs=r.records||[]; paintMe(); } });
    if(canApprove()){
      loadApprove(todayS());
      var apGo=$id('attApGo'); if(apGo) apGo.onclick=function(){ loadApprove($id('attApDate').value||todayS()); };
    }
  }

  function paintMe(){
    var box=$id('attMe'); if(!box) return;
    var rec=todayRec(), now=new Date();
    var dutyTxt=(S.user&&S.user.DutyStart)?('Shift '+fmtDutyTime(S.user.DutyStart)+(S.user.DutyEnd?('–'+fmtDutyTime(S.user.DutyEnd)):'')+((S.user.AltDutyStart)?(' (or alt shift '+fmtDutyTime(S.user.AltDutyStart)+(S.user.AltDutyEnd?('–'+fmtDutyTime(S.user.AltDutyEnd)):'')+')'):'')):'';
    var inb = !rec || !rec.checkIn;
    var btn = inb
      ? '<button class="att-big in" id="attBtn">⊕ Check in</button>'
      : (!rec.checkOut ? '<button class="att-big out" id="attBtn">⊖ Check out</button>' : '<div class="att-done">✓ Done for today</div>');
    var stat = rec ? ('In '+(rec.checkIn||'—')+(rec.checkOut?(' · Out '+rec.checkOut):'')+(rec.workHours?(' · '+rec.workHours+'h'):'')+(String(rec.late)==='yes'?' · ⚠ late (½ day)':'')) : 'Not checked in yet';
    // Alternate Sunday counter
    var sundayNote='';
    var sw__=String((S.user&&S.user.SundayWork)||'').toLowerCase().trim();
    if(sw__==='alternate'){
      var ym__=todayS().slice(0,7);
      var sunWorked=(ATT.recs||[]).filter(function(r){ if(String(r.date).slice(0,7)!==ym__) return false; var d__=new Date(String(r.date)); return !isNaN(d__.getTime())&&d__.getDay()===0&&r.checkIn; }).length;
      var sunLeft=Math.max(0,2-sunWorked);
      sundayNote='<div class="att-note" style="color:'+(sunLeft>0?'#1a8f4c':'#b23b3b')+';font-weight:600">📅 Alternate Sunday: '+sunWorked+'/2 Sundays worked this month'+(sunLeft>0?' · '+sunLeft+' remaining':' · limit reached — no more Sunday check-ins this month')+'</div>';
    }
    box.innerHTML='<div class="att-card"><div class="att-day">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()]+', '+now.getDate()+' '+MON[now.getMonth()]+'</div>'+
      '<div class="att-sub">'+esc(dutyTxt)+'</div>'+btn+
      '<div class="att-stat">'+esc(stat)+'</div>'+
      '<div class="att-note">'+[ (needSelfie()?'📷 selfie':''), ('📍 location'+(isFenced()?' verified at your branch':'')) ].filter(Boolean).join(' + ')+' · Late after shift+15 min = half day.</div>'+
      sundayNote+'</div>'+
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
    // An installed PWA (tap "Installed" / opened from the home-screen icon) runs as its OWN Android app —
    // granting location to "Chrome" does NOT grant it to this installed app. Different fix, so give different guidance.
    var installed=(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone===true;
    navigator.geolocation.getCurrentPosition(function(pos){          // always capture location in every mode (so the approval card can show the address)
      ATT.coords={lat:pos.coords.latitude, lng:pos.coords.longitude};
      if(needSelfie()){ captureSelfie(function(b64){ submitMark(kind,b64); }); } else submitMark(kind,null);
    }, function(err){
      var msg;
      if(!err||err.code===1){
        msg = installed
          ? 'Location blocked. This installed app has its own Android permission — go to phone Settings → Apps → find this app by its own name/icon (not "Chrome") → Permissions → Location → Allow. Also check your phone\'s Location/GPS toggle is ON.'
          : 'Location blocked — go to phone Settings → Apps → Chrome/Browser → Permissions → Location → Allow. Also check your phone\'s Location/GPS toggle is ON.';
      } else if(err.code===3){ msg='Location timed out. Move to open area and try again.'; }
      else { msg='Location unavailable. Please try again.'; }
      toast(msg,true);
    }, {enableHighAccuracy:true, timeout:15000});
  }
  function doMark(kind){
    ATT.kind=kind; ATT.outRemark='';   // under 4 hours auto-marks half day on the server — no reason prompt
    if(kind==='in'){ ATT.altShift=false; maybeAltShiftPrompt(function(){ geoThen(kind); }); }
    else geoThen(kind);
  }
  // Two-shift staff (e.g. Angel branch: 8–4 and 12–8): if this employee has an alternate shift configured
  // and they're punching in near its start time, ask which shift they're on today.
  function maybeAltShiftPrompt(cb){
    var alt=(S.user&&S.user.AltDutyStart)||'';
    if(!alt){ cb(); return; }
    var altMin=hm2min(alt), n=new Date(), nowMin=n.getHours()*60+n.getMinutes();
    if(altMin==null || Math.abs(nowMin-altMin)>90){ cb(); return; }   // only ask when punching in near the alt shift's start
    var altEnd=(S.user&&S.user.AltDutyEnd)||'';
    openModal('Alternate shift?','<div style="text-align:center"><div style="font-size:15px;font-weight:700;margin-bottom:8px">Working your alternate shift today?</div><div style="font-size:13px;color:#555;margin-bottom:14px">'+esc(fmtDutyTime(alt))+(altEnd?('–'+esc(fmtDutyTime(altEnd))):'')+' shift</div><div style="display:flex;gap:10px;justify-content:center"><button class="btn ghost" id="altNo">No</button><button class="btn" id="altYes">Yes</button></div></div>','');
    var y=document.getElementById('altYes'), n2=document.getElementById('altNo');
    if(y) y.onclick=function(){ ATT.altShift=true; closeModal(); cb(); };
    if(n2) n2.onclick=function(){ ATT.altShift=false; closeModal(); cb(); };
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
    var c=ATT.coords||{}, payload={selfie:selfie, lat:c.lat, lng:c.lng, wfh:!!ATT.wfh, altShift:!!ATT.altShift, remark:(kind==='out'?(ATT.outRemark||''):'')};
    toast('Marking…');
    var p = kind==='in' ? API.checkIn(payload) : API.checkOut(payload);
    p.then(function(r){
      if(r&&r.ok){ ATT.wfh=false; toast(kind==='in'?('Checked in '+r.checkIn+(r.late?' (late)':'')):('Checked out '+r.checkOut+(r.half?' · half day':''))); API.myAttendance(ymNow()).then(function(x){ if(x&&x.ok){ ATT.recs=x.records||[]; paintMe(); } }); }
      else if(r&&r.wfhPrompt){ promptWfh(r, function(yes){ if(yes){ ATT.wfh=true; submitMark(kind, selfie); } else { ATT.wfh=false; toast('You are not at the centre — '+(kind==='in'?'check-in':'check-out')+' not allowed.',true); } }); }
      else toast((r&&r.error)||'Could not mark — needs internet & location.',true); })
      .catch(function(){ toast('Marking attendance needs an internet connection.',true); });
  }

  /* ---------- approver ---------- */
  // Convert any Drive URL format to a direct image-renderable URL
  function driveImg(url){
    if(!url) return '';
    // Already a thumbnail/uc URL — extract ID and re-format
    var m=url.match(/[\/|=]([a-zA-Z0-9_-]{25,})/);
    if(m) return 'https://drive.google.com/thumbnail?id='+m[1]+'&sz=w200-h200';
    return url;
  }
  var _approveCache={ts:0,recs:null,date:null,activeStaff:0};
  function chip(bg,fg,letter,n,statusKey,clickable){
    var active=(ATT.apFilter===statusKey);
    return '<span'+(clickable?' data-f="'+esc(statusKey)+'"':'')+' style="'+(clickable?'cursor:pointer;':'')+'font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+bg+';color:'+fg+';'+(active?'box-shadow:0 0 0 2px '+fg+';':'')+'" title="'+(clickable?('Tap to show only '+esc(letter)):(esc(letter)+' = active staff minus Full day and Half day — staff with no punch today (on leave, absent, or not yet checked in)'))+'">'+esc(letter)+' '+n+'</span>';
  }
  function renderApSummary(recs){
    var box=$id('attApSummary'); if(!box) return;
    var c={present:0,half:0,leave:0,absent:0};
    (recs||[]).forEach(function(r){ var s=String(r.status||'present'); if(c[s]!==undefined) c[s]++; else c.present++; });
    // L = active staff in scope minus (Full day + Half day) — anyone with no punch today at all, not just explicit "leave" records
    var activeStaff=_approveCache.activeStaff||0;
    var leaveCount=Math.max(0, activeStaff-c.present-c.half);
    box.innerHTML='<span style="display:inline-flex;gap:6px;flex-wrap:wrap">'+
      chip('#eaf7ef','#1a8f4c','P',c.present,'present',true)+
      chip('#faeeda','#854F0B','H',c.half,'half',true)+
      chip('#e9f1fb','#185FA5','L',leaveCount,'leave',false)+
      (c.absent?chip('#fdecec','#b23b3b','A',c.absent,'absent',true):'')+
      '</span>';
    box.querySelectorAll('[data-f]').forEach(function(s){
      s.onclick=function(){
        var f=s.getAttribute('data-f');
        ATT.apFilter=(ATT.apFilter===f)?null:f;   // tap the same chip again to clear the filter and show everyone
        if(_approveCache.recs) renderApproveRecs(_approveCache.recs);
      };
    });
  }
  function renderApproveRecs(recs){
    var box=$id('attApprove'); if(!box) return;
    renderApSummary(recs);
    var shown=ATT.apFilter ? recs.filter(function(r){ return String(r.status||'present')===ATT.apFilter; }) : recs;
    if(!shown.length){ box.innerHTML='<div class="empty">No '+(ATT.apFilter?(stLabel(ATT.apFilter)+' '):'')+'attendance marked for this date.</div>'; return; }
    box.innerHTML=shown.map(function(a){
      var ap=String(a.approvalStatus)==='approved';
      // Inline selfie thumbnails — punch-in (IN) and punch-out (OUT) side by side, no PDF link
      var thumbs='';
      if(a.selfieInUrl) thumbs+='<div style="text-align:center;display:inline-block;margin-right:10px;vertical-align:top"><img src="'+esc(driveImg(a.selfieInUrl))+'" alt="In" style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:1px solid #ddd;display:block" onerror="this.style.background=\'#f3f4f6\';this.style.border=\'1px dashed #ccc\'"><span style="font-size:10px;font-weight:600;color:#888;letter-spacing:.04em">IN</span></div>';
      if(a.selfieOutUrl) thumbs+='<div style="text-align:center;display:inline-block;vertical-align:top"><img src="'+esc(driveImg(a.selfieOutUrl))+'" alt="Out" style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:1px solid #ddd;display:block" onerror="this.style.background=\'#f3f4f6\';this.style.border=\'1px dashed #ccc\'"><span style="font-size:10px;font-weight:600;color:#888;letter-spacing:.04em">OUT</span></div>';
      else if(a.selfieInUrl) thumbs+='<div style="text-align:center;display:inline-block;vertical-align:top"><div style="width:80px;height:80px;border-radius:10px;border:1px dashed #ccc;background:#f9fafb;display:flex;align-items:center;justify-content:center;font-size:10px;color:#aaa;text-align:center">No punch-out yet</div><span style="font-size:10px;font-weight:600;color:#888;letter-spacing:.04em">OUT</span></div>';
      var selfieBlock=thumbs?('<div style="margin:6px 0">'+thumbs+'</div>'):'';
      return '<div class="att-row" data-id="'+esc(a.attId)+'" style="align-items:flex-start">'+
        '<div class="att-av" style="margin-top:4px">'+esc(initials(a.empName))+'</div>'+
        '<div class="att-mid" style="flex:1">'+
          '<div class="att-nm"><b>'+esc(a.empName)+'</b>'+dayBadge(a.status)+(String(a.late)==='yes'?' <span class="att-late">late</span>':'')+'</div>'+
          '<div class="att-m">In '+esc(a.checkIn||'—')+(a.checkOut?(' · Out '+esc(a.checkOut)):'')+((a.workHours&&!isNaN(Number(a.workHours)))?(' · '+esc(a.workHours)+'h'):'')+' · '+esc(stLabel(a.status))+((a.latIn&&a.lngIn)?' · <a href="https://maps.google.com/?q='+esc(a.latIn)+','+esc(a.lngIn)+'" target="_blank">📍 '+esc(a.addrIn||'location')+'</a>':'')+'</div>'+
          '<div class="att-m">ID '+esc(a.empId||'')+(a.dutyStart?(' · Duty '+esc(a.dutyStart)+(a.dutyEnd?('–'+esc(a.dutyEnd)):'')):'')+(a.attMode?(' · '+esc(a.attMode)):'')+'</div>'+
          (a.notes?'<div class="att-m" style="color:#a3271f;font-weight:600">📝 '+esc(a.notes)+'</div>':'')+
          selfieBlock+
        '</div>'+
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">'+
          (ap?'<span class="att-ok">✓ approved</span>':'<button class="btn sm" data-ap="'+esc(a.attId)+'">Approve</button>')+
          '<select class="att-sel" data-st="'+esc(a.attId)+'">'+['present','half','leave','absent'].map(function(s){return '<option value="'+s+'"'+(s===a.status?' selected':'')+'>'+esc(stLabel(s))+'</option>';}).join('')+'</select>'+
        '</div>'+
        '</div>';
    }).join('');
    // Approve in-place — update card DOM without full re-fetch (faster)
    box.querySelectorAll('[data-ap]').forEach(function(b){
      b.onclick=function(){
        var attId=b.getAttribute('data-ap');
        b.disabled=true; b.textContent='…';
        API.setAttendance(attId,{approvalStatus:'approved'}).then(function(x){
          if(x&&x.ok){
            toast('Approved');
            var rec0=(_approveCache.recs||[]).filter(function(r){return String(r.attId)===attId;})[0]; if(rec0) rec0.approvalStatus='approved';   // keep in-memory cache in sync so a later status change re-render doesn't revert this button
            _approveCache.ts=0; // still invalidate so the NEXT open re-fetches fresh from the server
            var row=b.closest ? b.closest('.att-row') : null;
            if(row){ var btn=row.querySelector('[data-ap]'); if(btn) btn.outerHTML='<span class="att-ok">✓ approved</span>'; }
          } else { b.disabled=false; b.textContent='Approve'; toast((x&&x.error)||'Failed',true); }
        }).catch(function(){ b.disabled=false; b.textContent='Approve'; toast('Failed',true); });
      };
    });
    box.querySelectorAll('[data-st]').forEach(function(s){
      s.onchange=function(){
        var attId=s.getAttribute('data-st'), val=s.value, prev=s.getAttribute('data-prev')||val;
        s.disabled=true;
        API.setAttendance(attId,{status:val}).then(function(x){
          s.disabled=false;
          if(x&&x.ok){
            toast('Updated');
            var rec=(_approveCache.recs||[]).filter(function(r){return String(r.attId)===attId;})[0];
            if(rec){ rec.status=val; renderApproveRecs(_approveCache.recs); }   // repaint so the badge + "· Full day/Half day" text next to the photo matches the new dropdown value
          } else { s.value=prev; toast((x&&x.error)||'Failed',true); }
        }).catch(function(){ s.disabled=false; s.value=prev; toast('Failed — check connection.',true); });
      };
    });
  }
  function loadApprove(date){
    date=date||todayS();
    var box=$id('attApprove'); if(!box) return;
    // Use cached data if fresh (within 45 s) AND for the same date — avoids repeated API calls on re-render
    var now=Date.now();
    if(_approveCache.recs && _approveCache.date===date && (now-_approveCache.ts)<45000){ renderApproveRecs(_approveCache.recs); return; }
    box.innerHTML='<div class="empty">Loading…</div>';
    API.listAttendance('',date).then(function(r){
      if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
      var recs=(r.records||[]).slice().sort(function(a,b){ var ta=String(a.checkIn||''),tb=String(b.checkIn||''); return tb>ta?1:tb<ta?-1:0; });
      _approveCache={ts:Date.now(), recs:recs, date:date, activeStaff:r.activeStaff||0};
      renderApproveRecs(recs);
    }).catch(function(){ if(box) box.innerHTML='<div class="empty">Connect to load attendance for this date.</div>'; });
  }
  window.renderAttendance=renderAttendance;
})();
