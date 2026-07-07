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
          '<button class="btn sm ghost" id="attPdfBtn" style="display:inline-flex;align-items:center;gap:5px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> Monthly PDF</button>'+
        '</div>'+
        '<div id="attApprove"></div>':'')+
      '<div style="height:110px"></div>';   // bottom spacer so the last approve card clears the mobile bottom nav
    $id('attSelfie').onchange=function(){
      var f=this.files[0]; if(!f) return; var fr=new FileReader();
      fr.onload=function(){
        resizeDataUrl(fr.result, function(b64){
          var cb=_pendingSelfieCb; _pendingSelfieCb=null;
          if(cb) cb(b64); else submitMark(ATT.kind, b64);   // no camera-flow resolver waiting — used standalone
        });
      };
      fr.readAsDataURL(f); this.value='';
    };
    paintMe();
    API.cachedAttendance().then(function(r){ if(r&&r.records){ ATT.recs=r.records; paintMe(); } });
    API.myAttendance(ymNow()).then(function(r){ if(r&&r.ok){ ATT.recs=r.records||[]; paintMe(); } });
    if(canApprove()){
      loadApprove(todayS());
      var apGo=$id('attApGo'); if(apGo) apGo.onclick=function(){ loadApprove($id('attApDate').value||todayS()); };
      var pdfBtn=$id('attPdfBtn'); if(pdfBtn) pdfBtn.onclick=function(){ downloadAttPdf(); };
    }
  }

  function downloadAttPdf(){
    var btn=$id('attPdfBtn'); if(btn){ btn.textContent='Generating…'; btn.disabled=true; }
    var dateVal=($id('attApDate')&&$id('attApDate').value)||todayS();
    var ym=dateVal.slice(0,7);
    API.monthlyAttendance('',ym).then(function(r){
      if(btn){ btn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> Monthly PDF'; btn.disabled=false; }
      if(!r||!r.ok){ toast((r&&r.error)||'Failed',true); return; }
      loadJsPDFAndGenerate(r.attendance||[], r.employees||[], ym);
    }).catch(function(){ if(btn){ btn.innerHTML='Monthly PDF'; btn.disabled=false; } toast('Failed to fetch data',true); });
  }

  function loadJsPDFAndGenerate(attRows, employees, ym){
    if(window.jspdf&&window.jspdf.jsPDF){ generateAttPdf(attRows,employees,ym); return; }
    var s1=document.createElement('script');
    s1.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s1.onload=function(){
      var s2=document.createElement('script');
      s2.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
      s2.onload=function(){ generateAttPdf(attRows,employees,ym); };
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  }

  function generateAttPdf(attRows, employees, ym){
    var jsPDF=window.jspdf.jsPDF;
    var parts=ym.split('-'), yr=parseInt(parts[0]), mo=parseInt(parts[1]);
    var daysInMonth=new Date(yr,mo,0).getDate();
    var attMap={};
    attRows.forEach(function(r){
      var day=parseInt((r.date||'').split('-')[2]||0); if(!day) return;
      if(!attMap[r.empId]) attMap[r.empId]={};
      var st=String(r.status||'').toLowerCase();
      attMap[r.empId][day]=st==='present'?'P':st==='half'?'P/2':st==='leave'?'L':st==='holiday'?'WO':'A';
    });
    var days=[]; for(var i=1;i<=daysInMonth;i++) days.push(i);
    var head=[['Emp','Name'].concat(days.map(String)).concat(['Pre','HL','Abs'])];
    var body=employees.map(function(e){
      var row=[e.EmpID||'',e.FullName||''], pre=0, hl=0, abs=0;
      for(var d=1;d<=daysInMonth;d++){
        var s=(attMap[e.EmpID]&&attMap[e.EmpID][d])||'A';
        if(s==='P') pre++; else if(s==='P/2'){ hl++; pre+=0.5; } else if(s==='A') abs++;
        row.push(s);
      }
      row.push(String(pre),String(hl),String(abs)); return row;
    });
    var doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    doc.setFontSize(11); doc.setTextColor(218,16,23);
    doc.text('Nakoda Diagnostics And Research Center',10,8);
    doc.setTextColor(60,60,60); doc.setFontSize(9);
    doc.text('Attendance Report — '+ym,10,14);
    var colStyles={0:{cellWidth:12},1:{cellWidth:28}};
    for(var c=2;c<daysInMonth+2;c++) colStyles[c]={cellWidth:5.5};
    colStyles[daysInMonth+2]={cellWidth:8}; colStyles[daysInMonth+3]={cellWidth:8}; colStyles[daysInMonth+4]={cellWidth:8};
    doc.autoTable({
      head:head, body:body, startY:18,
      styles:{fontSize:5.5,cellPadding:1,halign:'center'},
      headStyles:{fillColor:[218,16,23],textColor:255,fontStyle:'bold'},
      columnStyles:colStyles,
      didParseCell:function(d){
        if(d.section==='body'&&d.column.index>=2&&d.column.index<=daysInMonth+1){
          var v=d.cell.text[0];
          if(v==='P') d.cell.styles.fillColor=[234,247,239];
          else if(v==='A') d.cell.styles.fillColor=[253,236,236];
          else if(v==='P/2') d.cell.styles.fillColor=[255,248,225];
          else if(v==='L') d.cell.styles.fillColor=[235,235,255];
        }
      }
    });
    doc.save('attendance-'+ym+'.pdf');
    toast('PDF downloaded');
  }

  function paintMe(){
    var box=$id('attMe'); if(!box) return;
    warmGeo();   // start GPS early so the fix is ready before the punch button is tapped
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
    // Recovery path: if a punch went through but its selfie never made it to Drive (closed the app too
    // fast, storage cleared, repeated upload failures), don't leave it stuck blank forever — let the
    // employee attach one themselves straight from this screen.
    var missingKind = (rec && rec.checkIn && !rec.selfieInUrl && rec.attId) ? 'in' : ((rec && rec.checkOut && !rec.selfieOutUrl && rec.attId) ? 'out' : '');
    var missingNote = missingKind ? '<div class="att-note" style="color:#b23b3b;font-weight:600">⚠ Your '+(missingKind==='in'?'check-in':'check-out')+' selfie didn\'t save — <span id="attFixSelfie" style="text-decoration:underline;cursor:pointer">tap to add it</span></div>' : '';
    box.innerHTML='<div class="att-card"><div class="att-day">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()]+', '+now.getDate()+' '+MON[now.getMonth()]+'</div>'+
      '<div class="att-sub">'+esc(dutyTxt)+'</div>'+btn+
      '<div class="att-stat">'+esc(stat)+'</div>'+
      '<div class="att-note">'+[ (needSelfie()?'📷 selfie':''), ('📍 location'+(isFenced()?' verified at your branch':'')) ].filter(Boolean).join(' + ')+' · Late after shift+15 min = half day.</div>'+
      missingNote+
      sundayNote+'</div>'+
      monthStrip();
    var b=$id('attBtn'); if(b) b.onclick=function(){ doMark(inb?'in':'out'); };
    var fix=$id('attFixSelfie'); if(fix) fix.onclick=function(){
      fix.textContent='Opening camera…';
      captureSelfie(function(b64){
        API.attachSelfie({attId:rec.attId, kind:missingKind, base64:b64}).then(function(r){
          toast((r&&r.ok)?'Selfie added':'Saved on device — will sync');
          API.myAttendance(ymNow()).then(function(x){ if(x&&x.ok){ ATT.recs=x.records||[]; paintMe(); } });
        });
      });
    };
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

  // Selfies only need to be big enough to identify someone in an 80x80 thumbnail — shrinking before upload
  // cuts the payload from a multi-MB camera frame down to well under 100KB, which is most of what made
  // punch-in/out feel slow on a normal mobile connection.
  var SELFIE_MAX_DIM=560, SELFIE_QUALITY=0.62;   // smaller payload = faster punch on slow phones/networks
  function resizeDataUrl(dataUrl, cb){
    var img=new Image();
    img.onload=function(){
      var scale=Math.min(1, SELFIE_MAX_DIM/Math.max(img.width,img.height));
      var c=document.createElement('canvas'); c.width=Math.max(1,Math.round(img.width*scale)); c.height=Math.max(1,Math.round(img.height*scale));
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      var d=c.toDataURL('image/jpeg',SELFIE_QUALITY), i=d.indexOf(',');
      cb(d.slice(i+1));
    };
    img.onerror=function(){ var i=dataUrl.indexOf(','); cb(dataUrl.slice(i+1)); };   // resize failed — send original rather than block the punch
    img.src=dataUrl;
  }
  var _pendingSelfieCb=null;
  function captureSelfie(cb){
    if(!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)){ _pendingSelfieCb=cb; $id('attSelfie').click(); return; }  // fallback to file/camera input
    var stream=null;
    openModal('Take selfie','<div style="text-align:center"><video id="camV" autoplay playsinline muted style="width:100%;max-width:320px;border-radius:10px;background:#000"></video><canvas id="camC" style="display:none"></canvas><div style="margin-top:10px"><button class="btn" id="camSnap">\ud83d\udcf8 Capture</button> <button class="btn ghost" id="camCancel">Cancel</button></div></div>','');
    var v=document.getElementById('camV');
    navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}}).then(function(st){ stream=st; v.srcObject=st; }).catch(function(){ closeModal(); toast('Camera blocked — pick a photo instead.',true); _pendingSelfieCb=cb; $id('attSelfie').click(); });
    function stopCam(){ try{ if(stream) stream.getTracks().forEach(function(t){t.stop();}); }catch(e){} }
    var snap=document.getElementById('camSnap'); if(snap) snap.onclick=function(){
      var c=document.getElementById('camC'), vw=v.videoWidth||320, vh=v.videoHeight||240, scale=Math.min(1, SELFIE_MAX_DIM/Math.max(vw,vh));
      c.width=Math.max(1,Math.round(vw*scale)); c.height=Math.max(1,Math.round(vh*scale));
      c.getContext('2d').drawImage(v,0,0,c.width,c.height);
      var d=c.toDataURL('image/jpeg',SELFIE_QUALITY),i=d.indexOf(',');
      stopCam(); closeModal(); cb(d.slice(i+1));
    };
    var cancel=document.getElementById('camCancel'); if(cancel) cancel.onclick=function(){ stopCam(); closeModal(); };
  }
  function promptEarlyReason(cb){
    openModal('Leaving early?','<div style="font-size:13px;color:#555;margin-bottom:8px">You’ve worked under 4 hours — this will be marked <b>half day</b> and sent for approval. Please add a reason:</div><textarea id="earlyReason" rows="2" placeholder="e.g. doctor appointment" style="width:100%;border:1px solid #d9d9d9;border-radius:8px;padding:8px;font-size:13px"></textarea>','<button class="btn ghost" onclick="closeModal()">Cancel</button> <button class="btn" id="earlyOk">Confirm check-out</button>');
    var ok=document.getElementById('earlyOk'); if(ok) ok.onclick=function(){ var v=(document.getElementById('earlyReason').value||'').trim(); if(!v){ toast('Please write a reason.',true); return; } closeModal(); cb(v); };
  }
  // Location and the selfie camera don't depend on each other, so fetch/open them at the same time instead
  // of waiting for GPS to resolve before even showing the camera — this alone can save several seconds,
  // especially on a weak signal (enableHighAccuracy can take up to 15s).
  // GPS WARM-UP (Vivo & similar phones need 2-3 taps because the FIRST high-accuracy fix from a cold
  // GPS chip takes longer than the 15s timeout — by the 2nd/3rd tap the chip is warm and it works).
  // Fix: start watching position as soon as the attendance screen opens (only if permission is already
  // granted — never pop the permission prompt early), so a fix is ready before the punch button is tapped.
  var _geoWatch=null, _lastFix=null;
  function warmGeo(){
    if(!navigator.geolocation || _geoWatch!=null) return;
    function start(){
      try{
        _geoWatch=navigator.geolocation.watchPosition(function(pos){ _lastFix={lat:pos.coords.latitude,lng:pos.coords.longitude,ts:Date.now()}; },function(){},{enableHighAccuracy:true,maximumAge:30000});
        setTimeout(function(){ if(_geoWatch!=null){ navigator.geolocation.clearWatch(_geoWatch); _geoWatch=null; } },120000);  // stop after 2 min — don't drain battery
      }catch(e){}
    }
    if(navigator.permissions&&navigator.permissions.query){ navigator.permissions.query({name:'geolocation'}).then(function(st){ if(st.state==='granted') start(); },function(){}); }
  }
  function getOnce_(hiAcc,timeoutMs){
    return new Promise(function(resolve,reject){
      navigator.geolocation.getCurrentPosition(function(pos){ resolve({lat:pos.coords.latitude,lng:pos.coords.longitude}); }, reject, {enableHighAccuracy:hiAcc, timeout:timeoutMs, maximumAge:60000});
    });
  }
  function getLocation_(){
    return new Promise(function(resolve,reject){
      if(!navigator.geolocation){ reject({code:0}); return; }
      if(_lastFix && (Date.now()-_lastFix.ts)<60000){ resolve({lat:_lastFix.lat,lng:_lastFix.lng}); return; }   // warm-up already got a recent fix — instant
      getOnce_(true,15000).then(resolve, function(err){
        if(err&&err.code===1){ reject(err); return; }   // permission denied — retrying won't help
        getOnce_(false,10000).then(resolve,reject);      // GPS timed out — fall back to network/cell location
      });
    });
  }
  function startMark(kind){
    if(!navigator.geolocation){ toast('Location not supported on this device.',true); return; }
    toast('Getting your location…');
    // An installed PWA (tap "Installed" / opened from the home-screen icon) runs as its OWN Android app —
    // granting location to "Chrome" does NOT grant it to this installed app. Different fix, so give different guidance.
    var installed=(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone===true;
    var geoP=getLocation_();
    var selfieP=needSelfie() ? new Promise(function(resolve){ captureSelfie(resolve); }) : Promise.resolve(null);
    geoP.then(function(loc){ ATT.coords=loc; }).catch(function(err){
      var msg;
      if(!err||err.code===1){
        msg = installed
          ? 'Location blocked. This installed app has its own Android permission — go to phone Settings → Apps → find this app by its own name/icon (not "Chrome") → Permissions → Location → Allow. Also check your phone\'s Location/GPS toggle is ON.'
          : 'Location blocked — go to phone Settings → Apps → Chrome/Browser → Permissions → Location → Allow. Also check your phone\'s Location/GPS toggle is ON.';
      } else if(err.code===3){ msg='Location timed out. Move to open area and try again.'; }
      else { msg='Location unavailable. Please try again.'; }
      toast(msg,true);
    });
    selfieP.then(function(b64){
      // Wait for location too (usually already done by the time the selfie is captured) before submitting.
      geoP.then(function(){ submitMark(kind,b64); }, function(err){
        if(err&&err.code===1) return;   // permission blocked — guidance already toasted above
        // Location failed but the selfie is already taken — retry location automatically instead of
        // making her tap punch (and retake the selfie) all over again.
        toast('Retrying location — keep the app open…');
        getLocation_().then(function(loc){ ATT.coords=loc; submitMark(kind,b64); },
          function(){ toast('Location still not available — move near a window/open area and tap once more.',true); });
      });
    });
  }
  function doMark(kind){
    ATT.kind=kind; ATT.outRemark='';   // under 4 hours auto-marks half day on the server — no reason prompt
    if(kind==='in'){ ATT.altShift=false; maybeAltShiftPrompt(function(){ startMark(kind); }); }
    else startMark(kind);
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
    // Selfie goes in the same call as the punch (uploaded synchronously server-side) so it can never go
    // missing — a background/queued upload was tried and lost photos when the app closed too soon after
    // check-in. Location+camera still run in parallel beforehand (startMark), and the photo is resized
    // before it gets here, so this is still much faster than the original version despite waiting on it.
    // RELIABILITY (slow phones/networks, e.g. Vivo V40E on weak data): the punch often LANDS on the
    // server but the reply times out, so the app used to show "failed" and force a 2nd–3rd tap.
    // Now: (1) a lost reply auto-retries once; (2) "Already checked in/out" counts as SUCCESS — it
    // means the first tap worked; (3) after a final network failure we double-check the server before
    // telling the user it failed. One tap is enough.
    var c=ATT.coords||{}, payload={selfie:selfie, lat:c.lat, lng:c.lng, wfh:!!ATT.wfh, altShift:!!ATT.altShift, remark:(kind==='out'?(ATT.outRemark||''):'')};
    function tdy(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
    function success(msg){ ATT.wfh=false; toast(msg); API.myAttendance(ymNow()).then(function(x){ if(x&&x.ok){ ATT.recs=x.records||[]; paintMe(); } }); }
    toast(selfie?'Marking… uploading photo':'Marking…');
    var tries=0;
    function attempt(){
      tries++;
      var p = kind==='in' ? API.checkIn(payload) : API.checkOut(payload);
      p.then(function(r){
        if(r&&r.ok){ success(kind==='in'?('Checked in '+r.checkIn+(r.late?' (late)':'')):('Checked out '+r.checkOut+(r.half?' · half day':''))); return; }
        if(r&&r.wfhPrompt){ promptWfh(r, function(yes){ if(yes){ ATT.wfh=true; submitMark(kind, selfie); } else { ATT.wfh=false; toast('You are not at the centre — '+(kind==='in'?'check-in':'check-out')+' not allowed.',true); } }); return; }
        var em=String((r&&r.error)||'');
        if(/already checked/i.test(em)){ success(kind==='in'?'Checked in ✓ (your earlier tap worked)':'Checked out ✓ (your earlier tap worked)'); return; }
        toast(em||'Could not mark — needs internet & location.',true);
      }).catch(function(){
        if(tries<2){ toast('Slow connection — retrying…'); setTimeout(attempt,1500); return; }
        // Reply lost twice — the punch may still have landed. Ask the server before claiming failure.
        API.myAttendance(ymNow()).then(function(x){
          var rec=((x&&x.records)||[]).filter(function(r){ return String(r.date).slice(0,10)===tdy(); })[0];
          if(rec && ((kind==='in'&&rec.checkIn)||(kind==='out'&&rec.checkOut))){ ATT.recs=x.records||[]; success(kind==='in'?('Checked in '+rec.checkIn+' ✓'):('Checked out '+rec.checkOut+' ✓')); return; }
          toast('Marking attendance needs an internet connection — please try again.',true);
        },function(){ toast('Marking attendance needs an internet connection — please try again.',true); });
      });
    }
    attempt();
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
  var _approveCache={ts:0,recs:null,date:null,activeStaff:0,notPunched:null};
  function chip(bg,fg,letter,n,statusKey,clickable){
    var active=(ATT.apFilter===statusKey);
    return '<span'+(clickable?' data-f="'+esc(statusKey)+'"':'')+' style="'+(clickable?'cursor:pointer;':'')+'font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+bg+';color:'+fg+';'+(active?'box-shadow:0 0 0 2px '+fg+';':'')+'" title="'+(clickable?('Tap to show '+esc(letter)):(esc(letter)+' = active staff minus Full day and Half day — staff with no punch today (on leave, absent, or not yet checked in)'))+'">'+esc(letter)+' '+n+'</span>';
  }
  function renderApSummary(recs){
    var box=$id('attApSummary'); if(!box) return;
    var c={present:0,half:0,leave:0,absent:0};
    (recs||[]).forEach(function(r){ var s=String(r.status||'present'); if(c[s]!==undefined) c[s]++; else c.present++; });
    // L = active staff in scope minus (Full day + Half day) — anyone with no punch today at all, not just explicit "leave" records
    var activeStaff=_approveCache.activeStaff||0;
    var leaveCount=Math.max(0, activeStaff-c.present-c.half);
    var wfhCount=(recs||[]).filter(function(r){ return /work from home/i.test(String(r.notes||'')); }).length;
    box.innerHTML='<span style="display:inline-flex;gap:6px;flex-wrap:wrap">'+
      chip('#eaf7ef','#1a8f4c','P',c.present,'present',true)+
      chip('#faeeda','#854F0B','H',c.half,'half',true)+
      chip('#e9f1fb','#185FA5','L',leaveCount,'leave',true)+
      chip('#eeedfe','#534AB7','W',wfhCount,'wfh',true)+
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
  function notPunchedLabel(status){ return status==='leave'?'On leave':(status==='absent'?'Absent':'Not punched'); }
  function notPunchedColor(status){ return status==='leave'?['#e9f1fb','#185FA5']:(status==='absent'?['#fdecec','#b23b3b']:['#f1efe8','#5f5e5a']); }
  function renderNotPunched(){
    var box=$id('attApprove'); if(!box) return;
    var list=_approveCache.notPunched||[];
    var rows=list.map(function(e){
      var col=notPunchedColor(e.status);
      return '<div class="att-row" style="align-items:center">'+
        '<div class="att-av">'+esc(initials(e.name))+'</div>'+
        '<div class="att-mid" style="flex:1">'+
          '<div class="att-nm"><b>'+esc(e.name)+'</b></div>'+
          '<div class="att-m">ID '+esc(e.empId||'')+(e.branch?(' · '+esc(e.branch)):'')+(e.phone?(' · '+esc(e.phone)):'')+'</div>'+
        '</div>'+
        '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+col[0]+';color:'+col[1]+';flex-shrink:0">'+esc(notPunchedLabel(e.status))+'</span>'+
        '</div>';
    }).join('');
    box.innerHTML='<div class="empty" style="text-align:left;padding:6px 2px 10px;font-size:12px;color:#888">Not punched today — '+list.length+'. Tap L again to go back.</div>'+
      (list.length?rows:'<div class="empty">Everyone active has punched in today.</div>');
  }
  function renderApproveRecs(recs){
    var box=$id('attApprove'); if(!box) return;
    renderApSummary(recs);
    if(ATT.apFilter==='leave'){ renderNotPunched(); return; }
    var shown=ATT.apFilter ? (ATT.apFilter==='wfh'
      ? recs.filter(function(r){ return /work from home/i.test(String(r.notes||'')); })
      : recs.filter(function(r){ return String(r.status||'present')===ATT.apFilter; })) : recs;
    if(!shown.length){ box.innerHTML='<div class="empty">No '+(ATT.apFilter==='wfh'?'work-from-home ':ATT.apFilter?(stLabel(ATT.apFilter)+' '):'')+'attendance marked for this date.</div>'; return; }
    box.innerHTML=shown.map(function(a){
      var ap=String(a.approvalStatus)==='approved';
      // Inline selfie thumbnails — punch-in (IN) and punch-out (OUT) side by side, no PDF link.
      // Always render both boxes (with a placeholder when missing) so a missing selfie is visible on
      // the card instead of the whole row just silently not appearing.
      var inBox = a.selfieInUrl
        ? '<img src="'+esc(driveImg(a.selfieInUrl))+'" alt="In" style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:1px solid #ddd;display:block" onerror="this.style.background=\'#f3f4f6\';this.style.border=\'1px dashed #ccc\'">'
        : '<div style="width:80px;height:80px;border-radius:10px;border:1px dashed #e0a1a1;background:#fdf2f2;display:flex;align-items:center;justify-content:center;font-size:10px;color:#a3271f;text-align:center">No selfie</div>';
      var outBox;
      if(a.selfieOutUrl) outBox='<img src="'+esc(driveImg(a.selfieOutUrl))+'" alt="Out" style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:1px solid #ddd;display:block" onerror="this.style.background=\'#f3f4f6\';this.style.border=\'1px dashed #ccc\'">';
      else if(a.checkOut) outBox='<div style="width:80px;height:80px;border-radius:10px;border:1px dashed #e0a1a1;background:#fdf2f2;display:flex;align-items:center;justify-content:center;font-size:10px;color:#a3271f;text-align:center">No selfie</div>';
      else outBox='<div style="width:80px;height:80px;border-radius:10px;border:1px dashed #ccc;background:#f9fafb;display:flex;align-items:center;justify-content:center;font-size:10px;color:#aaa;text-align:center">No punch-out yet</div>';
      var thumbs='<div style="text-align:center;display:inline-block;margin-right:10px;vertical-align:top">'+inBox+'<span style="font-size:10px;font-weight:600;color:#888;letter-spacing:.04em">IN</span></div>'+
        '<div style="text-align:center;display:inline-block;vertical-align:top">'+outBox+'<span style="font-size:10px;font-weight:600;color:#888;letter-spacing:.04em">OUT</span></div>';
      var selfieBlock='<div style="margin:6px 0">'+thumbs+'</div>';
      return '<div class="att-row" data-id="'+esc(a.attId)+'" style="align-items:flex-start">'+
        '<div class="att-av" style="margin-top:4px">'+esc(initials(a.empName))+'</div>'+
        '<div class="att-mid" style="flex:1">'+
          '<div class="att-nm"><b>'+esc(a.empName)+'</b>'+dayBadge(a.status)+(String(a.late)==='yes'?' <span class="att-late">late</span>':'')+(/work from home/i.test(String(a.notes||''))?' <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:#eeedfe;color:#534AB7">🏠 WFH</span>':'')+'</div>'+
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
    box.innerHTML='<div class="center-load"><span class="loader dark"></span></div>';
    API.listAttendance('',date).then(function(r){
      if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
      var recs=(r.records||[]).slice().sort(function(a,b){ var ta=String(a.checkIn||''),tb=String(b.checkIn||''); return tb>ta?1:tb<ta?-1:0; });
      _approveCache={ts:Date.now(), recs:recs, date:date, activeStaff:r.activeStaff||0, notPunched:r.notPunched||[]};
      renderApproveRecs(recs);
    }).catch(function(){ if(box) box.innerHTML='<div class="empty">Connect to load attendance for this date.</div>'; });
  }
  window.renderAttendance=renderAttendance;
})();
