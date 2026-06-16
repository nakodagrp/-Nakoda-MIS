/* Nakoda MIS — Calendar / Daily Scheduler (offline-first)
   Day + Week grid 4 AM–10 PM. Pending = lavender, Done = green.
   EA can switch to and manage the Director's calendar & tasks.
   Export PNG = the Daily Scheduler sheet (Time | Scheduled | Done | Pending tasks). */
(function(){
  var START_MIN=240, END_MIN=1320, STEP=30, ROWH=30;       // 4:00 → 22:00, 30-min slots
  var ROWS=(END_MIN-START_MIN)/STEP;                        // 36
  var DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  var CAL={ owner:null, ownerName:'Me', view:'week', anchor:new Date(), entries:[], tasks:[], canManage:true, targets:[] };

  function p2(n){ return (n<10?'0':'')+n; }
  function dstr(d){ return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate()); }
  function parseD(s){ var p=String(s).split('-'); return new Date(+p[0],(+p[1])-1,+p[2]); }
  function addDays(d,n){ var x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function startOfWeek(d){ var x=new Date(d); var k=(x.getDay()+6)%7; x.setDate(x.getDate()-k); x.setHours(0,0,0,0); return x; }
  function toMin(t){ if(!t) return 0; var p=String(t).split(':'); return (+p[0])*60+(+(p[1]||0)); }
  function fmtHour(min){ var h=Math.floor(min/60), m=min%60, ap=h<12?'am':'pm', hh=h%12; if(hh===0)hh=12; return hh+(m?(':'+p2(m)):'')+ap; }
  function byStart(a,b){ return (toMin(a.startTime)||0)-(toMin(b.startTime)||0); }
  function liveEntries(){ return (CAL.entries||[]).filter(function(e){ return String(e.status)!=='deleted'; }); }
  function pendingTasks(){ return (CAL.tasks||[]).filter(function(t){ var s=String(t.status); return s!=='done' && s!=='deleted'; }); }

  /* ---------- shell ---------- */
  function buildShell(){
    var pg=document.getElementById('page-calendar');
    var ownerSel = CAL.targets.length>1
      ? '<select id="calOwner" class="cal-owner">'+CAL.targets.map(function(t){ return '<option value="'+esc(t.EmpID)+'"'+(String(t.EmpID)===String(CAL.owner)?' selected':'')+'>'+esc(t.FullName)+'</option>'; }).join('')+'</select>'
      : '';
    pg.innerHTML =
      '<div class="cal-top">'+
        '<div class="cal-ttl"><h2>Calendar</h2><div class="cal-sub" id="calSub">'+esc(CAL.ownerName)+'’s schedule</div></div>'+
        ownerSel+
        '<div class="seg cal-seg" id="calView"><button data-v="day"'+(CAL.view==='day'?' class="on"':'')+'>Day</button><button data-v="week"'+(CAL.view==='week'?' class="on"':'')+'>Week</button></div>'+
        '<div class="cal-nav"><button id="calPrev">◀</button><button id="calToday">Today</button><button id="calNext">▶</button></div>'+
        '<button class="btn-png" id="calPng">⤓ PNG</button>'+
        '<button class="btn-add" id="calAdd">+ Add</button>'+
      '</div>'+
      '<div class="cal-range" id="calRange"></div>'+
      '<div id="calBody"></div>'+
      '<div class="cal-legend"><span class="lg pend"></span> Pending &nbsp; <span class="lg done"></span> Done '+
        '<span id="calOffline" class="cal-off hidden">&middot; offline (will sync)</span></div>';
    // bind
    pg.querySelectorAll('#calView button').forEach(function(b){ b.onclick=function(){ CAL.view=b.getAttribute('data-v'); buildShell(); draw(); }; });
    document.getElementById('calPrev').onclick=function(){ CAL.anchor=addDays(CAL.anchor, CAL.view==='week'?-7:-1); draw(); };
    document.getElementById('calNext').onclick=function(){ CAL.anchor=addDays(CAL.anchor, CAL.view==='week'?7:1); draw(); };
    document.getElementById('calToday').onclick=function(){ CAL.anchor=new Date(); draw(); };
    document.getElementById('calAdd').onclick=function(){ openEntry(null,{date:dstr(CAL.view==='week'?new Date():CAL.anchor)}); };
    document.getElementById('calPng').onclick=exportPng;
    var os=document.getElementById('calOwner'); if(os) os.onchange=function(){ var t=CAL.targets.filter(function(x){return String(x.EmpID)===os.value;})[0]; CAL.owner=os.value; CAL.ownerName=(t?t.FullName:'').replace(/\s*\(.*\)$/,''); reload(); };
  }

  /* ---------- draw ---------- */
  function draw(){
    var body=document.getElementById('calBody'); if(!body) return;
    var rg=document.getElementById('calRange');
    if(CAL.view==='week'){
      var ws=startOfWeek(CAL.anchor), we=addDays(ws,6);
      rg.textContent=DOW[ws.getDay()]+' '+MON[ws.getMonth()]+' '+ws.getDate()+'  —  '+DOW[we.getDay()]+' '+MON[we.getMonth()]+' '+we.getDate()+', '+we.getFullYear();
      body.innerHTML=buildWeek();
    } else {
      rg.textContent=DOW[CAL.anchor.getDay()]+', '+CAL.anchor.getDate()+' '+MON[CAL.anchor.getMonth()]+' '+CAL.anchor.getFullYear();
      body.innerHTML=buildDay();
    }
    bindGrid();
    var off=document.getElementById('calOffline'); if(off) off.classList.toggle('hidden', !liveEntries().some(function(e){return e._pending;}) && navigator.onLine);
  }

  function axisHtml(){
    var h='<div class="cw-axis">'; for(var m=START_MIN;m<END_MIN;m+=60){ h+='<div class="cw-hr" style="height:'+(ROWH*2)+'px">'+fmtHour(m)+'</div>'; } return h+'</div>';
  }
  function evHtml(e){
    var sMin=e.startTime?toMin(e.startTime):START_MIN, eMin=e.endTime?toMin(e.endTime):(sMin+STEP);
    if(eMin<=sMin) eMin=sMin+STEP;
    var top=Math.max(0,(sMin-START_MIN)/STEP*ROWH);
    var hgt=Math.max(ROWH-3,(eMin-sMin)/STEP*ROWH-3);
    var done=String(e.status)==='done';
    return '<div class="cw-ev '+(done?'done':'pend')+(e._pending?' sync':'')+'" style="top:'+top+'px;height:'+hgt+'px" data-id="'+esc(e.entryId)+'">'+
      '<div class="cw-evt">'+(done?'✓ ':'')+esc(e.title)+'</div>'+(e.startTime?'<div class="cw-eh">'+fmtHour(sMin)+(e.endTime?'–'+fmtHour(eMin):'')+'</div>':'')+'</div>';
  }
  function dayCol(d){
    var s=dstr(d);
    var evs=liveEntries().filter(function(e){return e.date===s;}).sort(byStart);
    return '<div class="cw-col" data-date="'+s+'" style="height:'+(ROWS*ROWH)+'px">'+evs.map(evHtml).join('')+'</div>';
  }
  function buildWeek(){
    var ws=startOfWeek(CAL.anchor), days=[], i; for(i=0;i<7;i++) days.push(addDays(ws,i));
    var todayS=dstr(new Date());
    var head='<div class="cw-head"><div class="cw-axhead"></div>'+days.map(function(d){ return '<div class="cw-dh'+(dstr(d)===todayS?' today':'')+'">'+DOW[d.getDay()]+' '+d.getDate()+'</div>'; }).join('')+'</div>';
    var body='<div class="cw-body">'+axisHtml()+'<div class="cw-cols cw-7">'+days.map(dayCol).join('')+'</div></div>';
    return '<div class="cw-grid">'+head+body+'</div>';
  }
  function buildDay(){
    var grid='<div class="cw-grid"><div class="cw-body">'+axisHtml()+'<div class="cw-cols cw-1">'+dayCol(CAL.anchor)+'</div></div></div>';
    var pend=pendingTasks();
    var panel='<div class="cal-tasks"><div class="cal-tk-h">Today’s pending tasks ('+pend.length+')</div>'+
      (pend.length?pend.map(function(t){ return '<div class="cal-tk"><span class="dot '+(String(t.priority||'').toLowerCase())+'"></span>'+esc(t.title)+(t.dueTime?'<span class="tm">'+esc(t.dueTime)+'</span>':'')+'</div>'; }).join('')
        :'<div class="cal-tk muted">No pending tasks — nice and clear.</div>')+'</div>';
    return '<div class="cal-daywrap">'+grid+panel+'</div>';
  }

  function bindGrid(){
    var pg=document.getElementById('page-calendar');
    pg.querySelectorAll('.cw-ev').forEach(function(node){ node.onclick=function(ev){ ev.stopPropagation(); var id=node.getAttribute('data-id'); var e=liveEntries().filter(function(x){return String(x.entryId)===id;})[0]; if(e) openEntry(e); }; });
    if(!CAL.canManage) return;
    pg.querySelectorAll('.cw-col').forEach(function(col){ col.onclick=function(ev){ if(ev.target!==col) return; var y=ev.offsetY; var min=START_MIN+Math.floor(y/ROWH)*STEP; openEntry(null,{date:col.getAttribute('data-date'), start:p2(Math.floor(min/60))+':'+p2(min%60)}); }; });
  }

  /* ---------- add / edit ---------- */
  function timeOpts(sel){ var o=''; for(var m=START_MIN;m<=END_MIN;m+=STEP){ var v=p2(Math.floor(m/60))+':'+p2(m%60); o+='<option value="'+v+'"'+(v===sel?' selected':'')+'>'+fmtHour(m)+'</option>'; } return o; }
  function openEntry(e, dflt){
    dflt=dflt||{}; var ed=!!e; e=e||{};
    var date=e.date||dflt.date||dstr(new Date());
    var st=e.startTime||dflt.start||'09:00';
    var et=e.endTime||(function(){ var m=toMin(st)+30; return p2(Math.floor(m/60))+':'+p2(m%60); })();
    var done=String(e.status)==='done';
    var body=
      '<label class="fl">Title</label><input id="ceTitle" class="inp" value="'+esc(e.title||'')+'" placeholder="What is scheduled?">'+
      '<label class="fl">Date</label><input id="ceDate" class="inp" type="date" value="'+esc(date)+'">'+
      '<div class="row2"><div><label class="fl">Start</label><select id="ceStart" class="inp">'+timeOpts(st)+'</select></div>'+
      '<div><label class="fl">End</label><select id="ceEnd" class="inp">'+timeOpts(et)+'</select></div></div>'+
      '<label class="fl">Notes</label><textarea id="ceNotes" class="inp" rows="2" placeholder="Optional">'+esc(e.notes||'')+'</textarea>'+
      (ed?'<div class="ce-stat">Status: <b class="'+(done?'st-done':'st-pend')+'">'+(done?'Completed':'Pending')+'</b></div>':'')+
      '<div id="ceMsg"></div>';
    var foot='';
    if(ed && CAL.canManage){
      foot+='<button class="btn-ghost danger" id="ceDel">Delete</button>'+
            '<button class="btn-ghost" id="ceToggle">'+(done?'Reopen':'Mark done')+'</button>';
    }
    foot+=(CAL.canManage?'<button class="btn-primary" id="ceSave">'+(ed?'Save':'Add')+'</button>':'<span class="muted">View only</span>');
    openModal(ed?'Edit entry':'New entry', body, foot);
    if(!CAL.canManage){ ['ceTitle','ceDate','ceStart','ceEnd','ceNotes'].forEach(function(id){ var n=document.getElementById(id); if(n) n.disabled=true; }); return; }
    document.getElementById('ceStart').onchange=function(){ var es=document.getElementById('ceEnd'); if(toMin(es.value)<=toMin(this.value)){ var m=toMin(this.value)+30; es.value=p2(Math.floor(m/60))+':'+p2(m%60); } };
    document.getElementById('ceSave').onclick=function(){
      var t=document.getElementById('ceTitle').value.trim(); if(!t){ document.getElementById('ceMsg').innerHTML='<div class="msg error">Title is required.</div>'; return; }
      var data={ ownerEmpId:CAL.owner, date:document.getElementById('ceDate').value, startTime:document.getElementById('ceStart').value, endTime:document.getElementById('ceEnd').value, title:t, notes:document.getElementById('ceNotes').value.trim() };
      this.disabled=true; this.textContent='Saving…';
      var p = ed ? API.updateCalEntry(e.entryId,data,CAL.owner) : API.createCalEntry(data);
      p.then(function(r){ if(r&&(r.ok||r.offline)){ closeModal(); toast(r.offline?'Saved offline — will sync':'Saved'); reload(); } else { document.getElementById('ceMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; } });
    };
    if(ed && CAL.canManage){
      document.getElementById('ceToggle').onclick=function(){ API.updateCalEntry(e.entryId,{status:done?'pending':'done'},CAL.owner).then(function(r){ if(r&&(r.ok||r.offline)){ closeModal(); reload(); } }); };
      document.getElementById('ceDel').onclick=function(){ if(!confirm('Delete this entry?')) return; API.updateCalEntry(e.entryId,{status:'deleted'},CAL.owner).then(function(r){ if(r&&(r.ok||r.offline)){ closeModal(); toast('Deleted'); reload(); } }); };
    }
  }

  /* ---------- export PNG (Daily Scheduler sheet) ---------- */
  function exportPng(){
    var ds=dstr(CAL.anchor);
    var evs=liveEntries().filter(function(e){return e.date===ds;}).sort(byStart);
    var pend=pendingTasks();
    var W=1040, headH=92, rowH=34, n=Math.max(evs.length, pend.length, 14);
    var H=headH+rowH*(n+1)+40;
    var c=document.createElement('canvas'); c.width=W; c.height=H; var x=c.getContext('2d');
    x.fillStyle='#ffffff'; x.fillRect(0,0,W,H);
    // header band
    x.fillStyle='#DA1017'; x.fillRect(0,0,W,6);
    x.fillStyle='#1f1f1f'; x.font='bold 26px Arial'; x.fillText('DAILY SCHEDULER',28,48);
    x.font='14px Arial'; x.fillStyle='#666';
    x.fillText(DOW[CAL.anchor.getDay()]+', '+CAL.anchor.getDate()+' '+MON[CAL.anchor.getMonth()]+' '+CAL.anchor.getFullYear()+'   ·   '+CAL.ownerName, 28, 70);
    x.textAlign='right'; x.fillStyle='#DA1017'; x.font='bold 20px Arial'; x.fillText('NAKODA',W-28,44);
    x.fillStyle='#999'; x.font='11px Arial'; x.fillText('Diagnostics & Research Center', W-28, 62); x.textAlign='left';
    // columns
    var cT=28, cTime=110, cSch=470, cDone=80, gap=24;
    var xTime=cT, xSch=xTime+cTime, xDone=xSch+cSch, xTasks=xDone+cDone+gap;
    var top=headH;
    // column headers
    x.fillStyle='#f3f4f7'; x.fillRect(cT,top,xDone+cDone-cT,rowH);
    x.fillStyle='#444'; x.font='bold 12px Arial';
    x.fillText('TIME',xTime+6,top+22); x.fillText('SCHEDULED',xSch+6,top+22); x.fillText('DONE',xDone+10,top+22);
    x.fillText('TODAY’S TASKS / WAITING',xTasks+2,top+22);
    top+=rowH;
    // scheduled rows
    x.font='13px Arial';
    for(var i=0;i<Math.max(evs.length,12);i++){
      var ry=top+i*rowH;
      if(i<evs.length){
        var e=evs[i], done=String(e.status)==='done';
        x.fillStyle=done?'#EAF6EE':'#ECEAFB'; x.fillRect(cT,ry,xDone+cDone-cT,rowH-1);
        x.fillStyle='#555'; x.fillText((e.startTime?fmtHour(toMin(e.startTime)):'')+(e.endTime?'–'+fmtHour(toMin(e.endTime)):''), xTime+6, ry+22);
        x.fillStyle=done?'#1a7f37':'#3c3489'; x.font='13px Arial';
        x.fillText(clip(x,e.title,cSch-14), xSch+6, ry+22);
        if(done){ x.fillStyle='#1a7f37'; x.font='bold 15px Arial'; x.fillText('✓', xDone+30, ry+23); x.font='13px Arial'; }
      }
      x.strokeStyle='#e7e9ee'; x.lineWidth=1; x.beginPath(); x.moveTo(cT,ry+rowH-0.5); x.lineTo(xDone+cDone,ry+rowH-0.5); x.stroke();
    }
    // vertical dividers
    x.strokeStyle='#dfe2e8'; [xSch-6,xDone-6,xDone+cDone].forEach(function(vx){ x.beginPath(); x.moveTo(vx,headH); x.lineTo(vx,headH+rowH*(Math.max(evs.length,12)+1)); x.stroke(); });
    // tasks column
    x.fillStyle='#444'; x.font='bold 12px Arial';
    var ty=headH+rowH+4;
    if(!pend.length){ x.fillStyle='#999'; x.font='13px Arial'; x.fillText('No pending tasks.', xTasks+2, ty+18); }
    pend.forEach(function(t,k){ var yy=ty+k*rowH; x.fillStyle='#DA1017'; x.fillText('•', xTasks+2, yy+18); x.fillStyle='#333'; x.font='13px Arial'; x.fillText(clip(x,t.title+(t.dueTime?'  ('+t.dueTime+')':''), W-xTasks-30), xTasks+18, yy+18); });
    // save
    c.toBlob(function(b){ var u=URL.createObjectURL(b); var a=document.createElement('a'); a.href=u; a.download='Daily-Scheduler-'+ds+'.png'; a.click(); setTimeout(function(){URL.revokeObjectURL(u);},2000); toast('Daily Scheduler image saved'); });
  }
  function clip(x,s,max){ s=String(s||''); if(x.measureText(s).width<=max) return s; while(s.length>1 && x.measureText(s+'…').width>max) s=s.slice(0,-1); return s+'…'; }

  /* ---------- load ---------- */
  function loadTargets(){
    API.calendarTargets().then(function(r){ if(r&&r.ok){ CAL.targets=r.targets||[]; if(CAL.targets.length>1) buildShell(); } });
  }
  function reload(){
    var sub=document.getElementById('calSub'); if(sub) sub.textContent=CAL.ownerName+'’s schedule';
    Promise.all([API.cachedCalendar(CAL.owner), API.cachedTasksFor(CAL.owner)]).then(function(a){ if(a[0]) CAL.entries=a[0]; if(a[1]) CAL.tasks=a[1]; draw(); });
    API.listCalendar(CAL.owner).then(function(r){ if(r&&r.ok){ CAL.entries=r.entries||[]; CAL.canManage=r.canManage!==false; draw(); } });
    API.listTasksFor(CAL.owner).then(function(r){ if(r&&r.ok){ CAL.tasks=r.tasks||[]; draw(); } });
  }

  window.renderCalendar=function(){
    if(!CAL.owner){ CAL.owner=S.user.EmpID; CAL.ownerName=(S.user.FullName||'Me'); CAL.canManage=true; }
    buildShell(); loadTargets(); reload();
  };
})();
