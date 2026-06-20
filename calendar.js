/* Nakoda MIS — Calendar / Daily Scheduler (offline-first)
   Day + Week grid 4 AM–10 PM. Pending = lavender, Done = green.
   EA can switch to and manage the Director's calendar & tasks.
   Export PNG = the Daily Scheduler sheet (Time | Scheduled | Done | Pending tasks). */
(function(){
  var START_MIN=240, END_MIN=1320, STEP=30, ROWH=30;       // 4:00 → 22:00, 30-min slots (full scrollable range)
  var ROWS=(END_MIN-START_MIN)/STEP;                        // 36
  var VIEW_START=480, VIEW_END=1080;                        // default visible window 8:00 → 18:00 (scroll for the rest)
  var DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  var CAL={ owner:null, ownerName:'Me', ownerRole:'', view:'week', anchor:new Date(), entries:[], tasks:[], canManage:true, targets:[] };

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
        '<button class="btn-png" id="calFootBtn">✎ Footer</button>'+
        '<button class="btn-add" id="calAdd">+ Add</button>'+
      '</div>'+
      '<div class="cal-range" id="calRange"></div>'+
      '<div id="calBody"></div>'+
      '<div class="cal-legend"><span class="lg pend"></span> Pending &nbsp; <span class="lg done"></span> Done '+
        '<span id="calOffline" class="cal-off hidden">&middot; offline (will sync)</span>'+
        '<a href="javascript:void(0)" id="calFootEdit" class="cal-footedit">✎ Edit PNG footer line</a></div>';
    // bind
    pg.querySelectorAll('#calView button').forEach(function(b){ b.onclick=function(){ CAL.view=b.getAttribute('data-v'); buildShell(); draw(); }; });
    document.getElementById('calPrev').onclick=function(){ CAL.anchor=addDays(CAL.anchor, CAL.view==='week'?-7:-1); draw(); };
    document.getElementById('calNext').onclick=function(){ CAL.anchor=addDays(CAL.anchor, CAL.view==='week'?7:1); draw(); };
    document.getElementById('calToday').onclick=function(){ CAL.anchor=new Date(); draw(); };
    document.getElementById('calAdd').onclick=function(){ openEntry(null,{date:dstr(CAL.view==='week'?new Date():CAL.anchor)}); };
    document.getElementById('calPng').onclick=exportPng;
    var os=document.getElementById('calOwner'); if(os) os.onchange=function(){ var t=CAL.targets.filter(function(x){return String(x.EmpID)===os.value;})[0]; CAL.owner=os.value; CAL.ownerName=(t?t.FullName:'').replace(/\s*\(.*\)$/,''); CAL.ownerRole=(t&&t.Role)||''; reload(); };
    var fe=document.getElementById('calFootEdit'); if(fe) fe.onclick=openFooterEditor;
    var fb=document.getElementById('calFootBtn'); if(fb) fb.onclick=openFooterEditor;
  }
  function footerKey(){ return 'nk_sched_footer_'+((typeof S!=='undefined'&&S.user&&S.user.EmpID)||''); }
  function footerLine(){
    try{
      var sv=(typeof S!=='undefined'&&S.user&&S.user.SchedFooter)||'';   // server value follows the user across devices
      if(sv) return sv;
      return localStorage.getItem(footerKey()) || localStorage.getItem('nk_sched_footer') || 'For You, At Your Doorstep · Nakoda Diagnostics & Research Center';
    }catch(e){ return 'Nakoda Diagnostics & Research Center'; }
  }
  function openFooterEditor(){
    var cur=footerLine();
    openModal('PNG footer line',
      '<div class="grid2"><div class="field full"><label>Your line printed at the bottom of your Daily Scheduler PNG</label><input id="ffText" value="'+esc(cur)+'" placeholder="e.g. For You, At Your Doorstep"></div></div><div style="font-size:11px;color:#9aa0a6">Each staff member has their own footer line (saved on this device).</div>',
      '<button class="btn ghost sm" id="ffReset">Reset to default</button><button class="btn" id="ffSave">Save</button>');
    document.getElementById('ffSave').onclick=function(){ var v=document.getElementById('ffText').value.trim(); try{ localStorage.setItem(footerKey(), v); }catch(e){} if(typeof S!=='undefined'&&S.user) S.user.SchedFooter=v; if(window.API&&API.saveSchedFooter) API.saveSchedFooter(v); closeModal(); toast('Footer line saved'); };
    document.getElementById('ffReset').onclick=function(){ try{ localStorage.removeItem(footerKey()); }catch(e){} if(typeof S!=='undefined'&&S.user) S.user.SchedFooter=''; if(window.API&&API.saveSchedFooter) API.saveSchedFooter(''); closeModal(); toast('Reset to default'); };
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
    // default view = 8am–6pm: scroll so 8:00 sits at the top (earlier/later hours reachable by scrolling).
    // Desktop: .cw-body is the vertical scroller. Mobile week view: the whole .cw-grid scrolls (single
    // 2D scroll container), so set scrollTop on both — the non-scrollable one is a harmless no-op.
    var topY=Math.max(0,(VIEW_START-START_MIN)/STEP*ROWH);
    var sc=body.querySelector('.cw-body'); if(sc) sc.scrollTop=topY;
    var grid=body.querySelector('.cw-grid'); if(grid) grid.scrollTop=topY;
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
    /* 7-column time grid in both Day & Week, on desktop and mobile (mobile scrolls sideways). */
    var ws=startOfWeek(CAL.anchor), days=[], i; for(i=0;i<7;i++) days.push(addDays(ws,i));
    var todayS=dstr(new Date());
    var head='<div class="cw-head"><div class="cw-axhead"></div>'+days.map(function(d){ return '<div class="cw-dh'+(dstr(d)===todayS?' today':'')+'">'+DOW[d.getDay()]+' '+d.getDate()+'</div>'; }).join('')+'</div>';
    var body='<div class="cw-body">'+axisHtml()+'<div class="cw-cols cw-7">'+days.map(dayCol).join('')+'</div></div>';
    /* Mobile-only ◀ ▶ buttons scroll the week grid sideways via JS — reliable even where touch-swipe
       scrolling of the grid fails in the device WebView. Hidden on desktop. */
    var hs='<div class="cw-hscroll"><button type="button" class="cw-sl" data-dir="-1">◀ Earlier</button><button type="button" class="cw-sl" data-dir="1">Later ▶</button></div>';
    return '<div class="cal-weekwrap">'+hs+'<div class="cw-grid cw-week">'+head+body+'</div>'+tasksPanel('Pending tasks')+'</div>';
  }
  function tasksPanel(heading){
    var pend=pendingTasks();
    return '<div class="cal-tasks"><div class="cal-tk-h">'+(heading||'Pending tasks')+' ('+pend.length+')</div>'+
      (pend.length?pend.map(function(t){ return '<div class="cal-tk"><span class="dot '+(String(t.priority||'').toLowerCase())+'"></span>'+esc(t.title)+(t.dueDate?'<span class="tm">'+esc(t.dueDate)+(t.dueTime?(' '+esc(t.dueTime)):'')+'</span>':(t.dueTime?'<span class="tm">'+esc(t.dueTime)+'</span>':''))+'</div>'; }).join('')
        :'<div class="cal-tk muted">No pending tasks — nice and clear.</div>')+'</div>';
  }
  function buildDay(){
    var grid='<div class="cw-grid cw-day"><div class="cw-body">'+axisHtml()+'<div class="cw-cols cw-1">'+dayCol(CAL.anchor)+'</div></div></div>';
    return '<div class="cal-daywrap">'+grid+tasksPanel('Today’s pending tasks')+'</div>';
  }

  function bindGrid(){
    var pg=document.getElementById('page-calendar');
    pg.querySelectorAll('.cw-ev,.cwa-ev').forEach(function(node){ node.onclick=function(ev){ ev.stopPropagation(); var id=node.getAttribute('data-id'); var e=liveEntries().filter(function(x){return String(x.entryId)===id;})[0]; if(e) openEntry(e); }; });
    pg.querySelectorAll('.cw-sl').forEach(function(b){ b.onclick=function(){ var g=pg.querySelector('.cw-grid.cw-week'); if(!g) return; var amt=Math.max(160,Math.round(g.clientWidth*0.7)); g.scrollBy({left:(b.getAttribute('data-dir')==='1'?amt:-amt), behavior:'smooth'}); }; });
    if(!CAL.canManage) return;
    pg.querySelectorAll('.cwa-add').forEach(function(a){ a.onclick=function(){ openEntry(null,{date:a.getAttribute('data-add')}); }; });
    pg.querySelectorAll('.cw-col').forEach(function(col){ col.onclick=function(ev){ if(ev.target!==col) return; var y=ev.offsetY; var min=START_MIN+Math.floor(y/ROWH)*STEP; openEntry(null,{date:col.getAttribute('data-date'), start:p2(Math.floor(min/60))+':'+p2(min%60)}); }; });
  }

  /* ---------- add / edit ---------- */
  function p2h(m){ return p2(Math.floor(m/60))+':'+p2(m%60); }
  function bookedRanges(date,excludeId){ return liveEntries().filter(function(x){ return x.date===date && String(x.entryId)!==String(excludeId||''); }).map(function(b){ var s=b.startTime?toMin(b.startTime):START_MIN; var en=b.endTime?toMin(b.endTime):s+STEP; return [s,en]; }); }
  function slotFree(m,ranges){ for(var i=0;i<ranges.length;i++) if(m>=ranges[i][0]&&m<ranges[i][1]) return false; return true; }
  function startOpts(date,excludeId,sel){ var r=bookedRanges(date,excludeId),o=''; for(var m=START_MIN;m<END_MIN;m+=STEP){ if(!slotFree(m,r)) continue; var v=p2h(m); o+='<option value="'+v+'"'+(v===sel?' selected':'')+'>'+fmtHour(m)+'</option>'; } return o; }
  function endOpts(date,excludeId,startVal){ var r=bookedRanges(date,excludeId),o='',s=toMin(startVal),nb=END_MIN; r.forEach(function(rg){ if(rg[0]>=s&&rg[0]<nb) nb=rg[0]; }); for(var m=s+STEP;m<=nb;m+=STEP){ var v=p2h(m); o+='<option value="'+v+'">'+fmtHour(m)+'</option>'; } return o; }
  var ceCl=[];
  function parseCl(v){ try{ var a=Array.isArray(v)?v:JSON.parse(v||'[]'); return Array.isArray(a)?a:[]; }catch(_){ return []; } }
  function ceClRows(){ return ceCl.length? ceCl.map(function(it,i){ return '<div class="ce-cl-row" data-cr="'+i+'"><input type="checkbox" class="ce-cl-box" data-cd="'+i+'"'+(it.done?' checked':'')+'><input class="ce-cl-text" data-ct="'+i+'" value="'+esc(it.text||'')+'" placeholder="Sub-step"><button type="button" class="ce-cl-rm" data-rm="'+i+'">✕</button></div>'; }).join('') : '<div class="muted" style="font-size:12px">No sub-steps yet — tap “Add sub-step”.</div>'; }
  function syncCe(){ var box=document.getElementById('ceClist'); if(!box) return; ceCl=[].slice.call(box.querySelectorAll('.ce-cl-row')).map(function(row){ return { text:((row.querySelector('.ce-cl-text')||{}).value||'').trim(), done:!!(row.querySelector('[data-cd]')||{}).checked }; }); }
  function rerenderCe(){ var box=document.getElementById('ceClist'); if(box){ box.innerHTML=ceClRows(); wireCe(); } }
  function wireCe(){ var box=document.getElementById('ceClist'); if(!box) return; box.querySelectorAll('[data-rm]').forEach(function(b){ b.onclick=function(){ syncCe(); ceCl.splice(+b.getAttribute('data-rm'),1); rerenderCe(); }; }); }
  function openEntry(e, dflt, onDone){
    dflt=dflt||{}; var ed=!!e; e=e||{}; var after=onDone||reload;
    var date=e.date||dflt.date||dstr(new Date());
    var st=e.startTime||dflt.start||'09:00';
    var done=String(e.status)==='done';
    ceCl=parseCl(e.checklist);
    var body=
      '<div class="grid2">'+
        '<div class="field full"><label>Title *</label><input id="ceTitle" value="'+esc(e.title||'')+'" placeholder="What is scheduled?"></div>'+
        '<div class="field full"><label>Date</label><input id="ceDate" type="date" value="'+esc(date)+'"></div>'+
        '<div class="field"><label>Start time</label><select id="ceStart">'+startOpts(date,e.entryId,st)+'</select></div>'+
        '<div class="field"><label>End time</label><select id="ceEnd">'+endOpts(date,e.entryId,st)+'</select></div>'+
        '<div class="field full"><label>Notes</label><textarea id="ceNotes" rows="2" placeholder="Optional">'+esc(e.notes||'')+'</textarea></div>'+
        '<div class="field full"><label>Checklist (sub-steps)</label><div id="ceClist">'+ceClRows()+'</div><button type="button" class="btn ghost sm" id="ceAddCl" style="margin-top:6px">+ Add sub-step</button></div>'+
        '<div class="field full" id="ceBusy"></div>'+
        (ed?'<div class="field full"><div class="ce-stat">Status: <b class="'+(done?'st-done':'st-pend')+'">'+(done?'Completed':'Pending')+'</b></div></div>':'')+
      '</div>'+
      '<div id="ceMsg"></div>';
    var foot='';
    if(ed && CAL.canManage){
      foot+='<button class="btn ghost sm" id="ceDel" style="color:var(--red)">Delete</button>'+
            '<button class="btn ghost sm" id="ceToggle">'+(done?'Reopen':'Mark done')+'</button>';
    }
    foot+=(CAL.canManage?'<button class="btn" id="ceSave">'+(ed?'Save':'Add')+'</button>':'<span class="muted">View only</span>');
    openModal(ed?'Edit entry':'New entry', body, foot);
    if(!CAL.canManage){ ['ceTitle','ceDate','ceStart','ceEnd','ceNotes'].forEach(function(id){ var n=document.getElementById(id); if(n) n.disabled=true; }); return; }
    function rebuildEnd(){ var d=document.getElementById('ceDate').value; document.getElementById('ceEnd').innerHTML=endOpts(d,e.entryId,document.getElementById('ceStart').value); }
    function rebuildStart(){ var d=document.getElementById('ceDate').value, cur=document.getElementById('ceStart').value; var sEl=document.getElementById('ceStart'); sEl.innerHTML=startOpts(d,e.entryId,cur); if(!sEl.value && sEl.options.length) sEl.selectedIndex=0; rebuildEnd(); }
    function renderBusy(){
      var d=document.getElementById('ceDate').value;
      var busy=liveEntries().filter(function(x){ return x.date===d && String(x.entryId)!==String(e.entryId||''); }).sort(byStart);
      var box=document.getElementById('ceBusy'); if(!box) return;
      box.innerHTML = busy.length
        ? '<label>Already booked this day (these times are blocked)</label><div class="ce-busy">'+busy.map(function(b){ return '<span>'+(b.startTime?fmtHour(toMin(b.startTime)):'')+(b.endTime?'–'+fmtHour(toMin(b.endTime)):'')+' · '+esc(b.title)+'</span>'; }).join('')+'</div>'
        : '';
    }
    renderBusy(); wireCe();
    document.getElementById('ceAddCl').onclick=function(){ syncCe(); ceCl.push({text:'',done:false}); rerenderCe(); };
    document.getElementById('ceDate').onchange=function(){ renderBusy(); rebuildStart(); };
    document.getElementById('ceStart').onchange=rebuildEnd;
    document.getElementById('ceSave').onclick=function(){
      var t=document.getElementById('ceTitle').value.trim(); if(!t){ document.getElementById('ceMsg').innerHTML='<div class="msg error">Title is required.</div>'; return; }
      syncCe(); var cl=ceCl.filter(function(x){return x.text;});
      var data={ ownerEmpId:CAL.owner, date:document.getElementById('ceDate').value, startTime:document.getElementById('ceStart').value, endTime:document.getElementById('ceEnd').value, title:t, notes:document.getElementById('ceNotes').value.trim(), checklist:JSON.stringify(cl) };
      this.disabled=true; this.textContent='Saving…';
      var p = ed ? API.updateCalEntry(e.entryId,data,CAL.owner) : API.createCalEntry(data);
      p.then(function(r){ if(r&&(r.ok||r.offline)){ closeModal(); toast(r.offline?'Saved offline — will sync':'Saved'); after(); } else { document.getElementById('ceMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; } });
    };
    if(ed && CAL.canManage){
      document.getElementById('ceToggle').onclick=function(){ syncCe(); API.updateCalEntry(e.entryId,{status:done?'pending':'done',checklist:JSON.stringify(ceCl.filter(function(x){return x.text;}))},CAL.owner).then(function(r){ if(r&&(r.ok||r.offline)){ closeModal(); toast(done?'Reopened':'Completed'); after(); } }); };
      document.getElementById('ceDel').onclick=function(){ if(!confirm('Delete this entry?')) return; API.updateCalEntry(e.entryId,{status:'deleted'},CAL.owner).then(function(r){ if(r&&(r.ok||r.offline)){ closeModal(); toast('Deleted'); after(); } }); };
    }
  }
  window.openCalendarEntryById=function(id, onDone){
    if(!CAL.owner){ CAL.owner=S.user.EmpID; CAL.ownerName=(S.user.FullName||'Me'); CAL.ownerRole=(S.user.Role||''); CAL.canManage=true; }
    function find(list){ return (list||[]).filter(function(x){return String(x.entryId)===String(id) && String(x.status)!=='deleted';})[0]; }
    API.cachedCalendar(CAL.owner).then(function(list){ CAL.entries=list||CAL.entries||[]; var e=find(list);
      if(e){ openEntry(e,null,onDone); }
      else API.listCalendar(CAL.owner).then(function(r){ if(r&&r.ok){ CAL.entries=r.entries||[]; var e2=find(r.entries); if(e2) openEntry(e2,null,onDone); else toast('Entry not found',true); } });
    });
  };

  /* ---------- export PNG — choose Day or Week + date ---------- */
  function exportPng(){ openExportModal(); }
  function openExportModal(){
    openModal('Download scheduler',
      '<div class="grid2">'+
        '<div class="field full"><label>What to download</label><div class="seg" id="exType"><div data-x="day" class="on">Day schedule</div><div data-x="week">Week review</div></div></div>'+
        '<div class="field full"><label>Date</label><input id="exDate" class="in" type="date" value="'+dstr(CAL.anchor)+'"></div>'+
        '<div class="field full" style="font-size:11.5px;color:#888">Day = that date’s Daily Scheduler. Week = Mon–Sun review with every entry marked done ✓ or pending ○, plus completed &amp; pending lists for the week.</div>'+
      '</div>',
      '<button class="btn" id="exGo">⤓ Download PNG</button>');
    document.querySelectorAll('#exType div').forEach(function(z){ z.onclick=function(){ document.querySelectorAll('#exType div').forEach(function(y){y.classList.remove('on');}); z.classList.add('on'); }; });
    document.getElementById('exGo').onclick=function(){
      var type=document.querySelector('#exType .on').getAttribute('data-x');
      var dv=document.getElementById('exDate').value, dObj=dv?parseD(dv):CAL.anchor;
      closeModal();
      var logo=new Image(); logo.onload=function(){ run(logo); }; logo.onerror=function(){ run(null); }; logo.src='icons/login-logo.png';
      function run(lg){ if(type==='week') renderWeekSheet(lg,dObj); else renderSheet(lg,dObj); }
    };
  }
  function pngHeader(x,logo,W,M,title,sub){
    x.fillStyle='#ffffff'; x.fillRect(0,0,W,x.canvas.height);
    x.fillStyle='#DA1017'; x.fillRect(0,0,W,9);
    if(logo){ var lh=64, lw=Math.min(330, logo.width*(lh/logo.height)); x.drawImage(logo, M, 34, lw, lh); }
    else { x.fillStyle='#DA1017'; x.font='bold 30px Arial'; x.fillText('NAKODA', M, 76); }
    x.textAlign='right'; x.fillStyle='#1f1f1f'; x.font='bold 20px Arial'; x.fillText(sub, W-M, 56);
    x.fillStyle='#777'; x.font='15px Arial'; x.fillText(CAL.ownerName+(CAL.ownerRole?(' · '+CAL.ownerRole):''), W-M, 82); x.textAlign='left';
    x.fillStyle='#1f1f1f'; x.font='bold 34px Arial'; x.fillText(title, M, 150);
    x.strokeStyle='#e2e5ea'; x.lineWidth=1; x.beginPath(); x.moveTo(M,176); x.lineTo(W-M,176); x.stroke();
  }
  function renderWeekSheet(logo, dObj){
    var ws=startOfWeek(dObj), wend=addDays(ws,6), wsS=dstr(ws), weS=dstr(wend);
    var inWk=function(d){ return d && d>=wsS && d<=weS; };
    var entries=liveEntries(), tasks=(CAL.tasks||[]).filter(function(t){return String(t.status)!=='deleted';});
    var days=[]; for(var i=0;i<7;i++) days.push(addDays(ws,i));
    var dayEv=days.map(function(dd){ var ds=dstr(dd); return entries.filter(function(e){return e.date===ds;}).sort(byStart); });
    var completed=[], pending=[];
    entries.forEach(function(e){ if(inWk(e.date)) (String(e.status)==='done'?completed:pending).push((e.startTime?fmtHour(toMin(e.startTime))+' ':'')+e.title); });
    tasks.forEach(function(t){ if(inWk(t.dueDate)) (String(t.status)==='done'?completed:pending).push(t.title+(t.dueTime?(' ('+t.dueTime+')'):'')); });
    var W=1240,M=44,lineH=30,dayHdrH=36, top=200;
    var bodyH=0; dayEv.forEach(function(de){ bodyH += dayHdrH + Math.max(de.length,1)*lineH; });
    var sumTop=top+bodyH+34, sumRows=Math.max(completed.length,pending.length,1);
    var H=Math.max(1500, sumTop+50+sumRows*26+70);
    var c=document.createElement('canvas'); c.width=W; c.height=H; var x=c.getContext('2d');
    pngHeader(x,logo,W,M,'WEEKLY REVIEW', DOW[ws.getDay()]+' '+ws.getDate()+' '+MON[ws.getMonth()]+' – '+DOW[wend.getDay()]+' '+wend.getDate()+' '+MON[wend.getMonth()]+' '+wend.getFullYear());
    var y=top;
    days.forEach(function(dd,di){
      x.fillStyle='#f3f4f7'; x.fillRect(M,y,W-2*M,dayHdrH);
      x.fillStyle='#444'; x.font='bold 15px Arial'; x.fillText(DOW[dd.getDay()]+' · '+dd.getDate()+' '+MON[dd.getMonth()], M+10, y+24);
      y+=dayHdrH;
      var de=dayEv[di];
      if(!de.length){ x.fillStyle='#bbb'; x.font='14px Arial'; x.fillText('—', M+16, y+20); y+=lineH; }
      de.forEach(function(e){ var dn=String(e.status)==='done';
        x.fillStyle=dn?'#1a7f37':'#c47f00'; x.font='bold 15px Arial'; x.fillText(dn?'✓':'○', M+14, y+21);
        x.fillStyle='#333'; x.font='14px Arial';
        x.fillText(clip(x,(e.startTime?fmtHour(toMin(e.startTime))+(e.endTime?'–'+fmtHour(toMin(e.endTime)):'')+'  ':'')+e.title, W-2*M-50), M+40, y+21);
        x.strokeStyle='#f0f1f4'; x.beginPath(); x.moveTo(M+10,y+lineH-2); x.lineTo(W-M-10,y+lineH-2); x.stroke(); y+=lineH; });
    });
    // summaries (two columns)
    var colW=(W-2*M-20)/2, lx=M, rx=M+colW+20;
    x.fillStyle='#EAF6EE'; x.fillRect(lx,sumTop,colW,40); x.fillStyle='#1a7f37'; x.font='bold 15px Arial'; x.fillText('Completed this week ('+completed.length+')', lx+12, sumTop+26);
    x.fillStyle='#ECEAFB'; x.fillRect(rx,sumTop,colW,40); x.fillStyle='#5046b8'; x.font='bold 15px Arial'; x.fillText('Pending this week ('+pending.length+')', rx+12, sumTop+26);
    x.font='14px Arial';
    completed.forEach(function(s,k){ x.fillStyle='#333'; x.fillText('✓ '+clip(x,s,colW-30), lx+10, sumTop+40+24+k*26); });
    pending.forEach(function(s,k){ x.fillStyle='#333'; x.fillText('○ '+clip(x,s,colW-30), rx+10, sumTop+40+24+k*26); });
    x.fillStyle='#888'; x.font='italic 15px Arial'; x.textAlign='center'; x.fillText(footerLine(), W/2, H-26); x.textAlign='left';
    c.toBlob(function(b){ var u=URL.createObjectURL(b); var a=document.createElement('a'); a.href=u; a.download='Weekly-Review-'+wsS+'.png'; a.click(); setTimeout(function(){URL.revokeObjectURL(u);},2000); toast('Weekly Review (A4) saved'); });
  }
  function renderSheet(logo, dObj){
    dObj=dObj||CAL.anchor;
    var ds=dstr(dObj);
    var evs=liveEntries().filter(function(e){return e.date===ds;}).sort(byStart);
    var pend=pendingTasks();
    /* Mobile-friendly portrait: narrower canvas + bigger text so it stays legible when a phone fits
       the image to screen width; only a few blank rows instead of a full A4 page. */
    var W=640, M=26, headH=212, colH=40, rowH=46;
    var schRows=Math.max(evs.length, 9);
    var schBottom=headH+colH+schRows*rowH;
    var taskTop=schBottom+30, taskHeadH=40;
    /* footer can be a long custom line — wrap it so it never gets cut off, and reserve height for it */
    var mc=document.createElement('canvas').getContext('2d'); mc.font='bold 14px Arial';
    var footLines=wrapText(mc, footerLine(), W-2*M);
    var H=taskTop+taskHeadH+Math.max(pend.length,3)*40+30+footLines.length*20+24;
    var c=document.createElement('canvas'); c.width=W; c.height=H; var x=c.getContext('2d');
    pngHeader(x,logo,W,M,'DAILY SCHEDULER', DOW[dObj.getDay()]+', '+dObj.getDate()+' '+MON[dObj.getMonth()]+' '+dObj.getFullYear());
    x.fillStyle='#555'; x.font='15px Arial'; x.fillText('Prepared for: '+CAL.ownerName+(CAL.ownerRole?('  ·  '+CAL.ownerRole):''), M, 200);
    // schedule table columns
    var xTime=M, wTime=128, wDone=72, xDone=W-M-wDone, xSch=xTime+wTime, wSch=xDone-xSch;
    var top=headH;
    x.fillStyle='#f3f4f7'; x.fillRect(M,top,W-2*M,colH);
    x.fillStyle='#555'; x.font='bold 14px Arial';
    x.fillText('TIME',xTime+8,top+26); x.fillText('SCHEDULED',xSch+8,top+26); x.fillText('DONE',xDone+12,top+26);
    var sy=top+colH;
    for(var i=0;i<schRows;i++){
      var ry=sy+i*rowH;
      if(i<evs.length){
        var e=evs[i], done=String(e.status)==='done';
        x.fillStyle=done?'#EAF6EE':'#ECEAFB'; x.fillRect(M,ry,W-2*M,rowH-1);
        x.fillStyle='#555'; x.font='14px Arial';
        x.fillText((e.startTime?fmtHour(toMin(e.startTime)):'')+(e.endTime?'–'+fmtHour(toMin(e.endTime)):''), xTime+8, ry+29);
        x.fillStyle=done?'#1a7f37':'#3c3489'; x.font='bold 16px Arial';
        x.fillText(clip(x,e.title,wSch-14), xSch+8, ry+29);
        if(done){ x.fillStyle='#1a7f37'; x.font='bold 19px Arial'; x.fillText('✓', xDone+30, ry+30); }
      }
      x.strokeStyle='#e7e9ee'; x.lineWidth=1; x.beginPath(); x.moveTo(M,ry+rowH-0.5); x.lineTo(W-M,ry+rowH-0.5); x.stroke();
    }
    // borders + dividers
    x.strokeStyle='#d7dbe2'; x.lineWidth=1.2;
    x.strokeRect(M,top,W-2*M,colH+schRows*rowH);
    [xSch, xDone].forEach(function(vx){ x.beginPath(); x.moveTo(vx,top); x.lineTo(vx,top+colH+schRows*rowH); x.stroke(); });
    // tasks section
    x.fillStyle='#fbeceA'; x.fillRect(M,taskTop,W-2*M,taskHeadH);
    x.fillStyle='#DA1017'; x.font='bold 15px Arial'; x.fillText('TODAY’S TASKS / WAITING LIST',M+10,taskTop+26);
    var ty=taskTop+taskHeadH+6;
    if(!pend.length){ x.fillStyle='#999'; x.font='15px Arial'; x.fillText('No pending tasks.', M+12, ty+22); }
    pend.forEach(function(t,k){ var yy=ty+k*40; x.fillStyle='#DA1017'; x.font='bold 16px Arial'; x.fillText('•', M+12, yy+22); x.fillStyle='#333'; x.font='15px Arial'; x.fillText(clip(x,t.title+(t.dueTime?'   ('+t.dueTime+')':''), W-2*M-34), M+32, yy+22); x.strokeStyle='#f0f1f4'; x.beginPath(); x.moveTo(M+10,yy+32); x.lineTo(W-M-10,yy+32); x.stroke(); });
    // footer — BOLD, per-staff, wraps across lines so a long line is never cut off
    x.fillStyle='#444'; x.font='bold 14px Arial'; x.textAlign='center';
    var fy=H-18-(footLines.length-1)*20;
    footLines.forEach(function(ln,i){ x.fillText(ln, W/2, fy+i*20); });
    x.textAlign='left';
    c.toBlob(function(b){ var u=URL.createObjectURL(b); var a=document.createElement('a'); a.href=u; a.download='Daily-Scheduler-'+ds+'.png'; a.click(); setTimeout(function(){URL.revokeObjectURL(u);},2000); toast('Daily Scheduler saved'); });
  }
  function clip(x,s,max){ s=String(s||''); if(x.measureText(s).width<=max) return s; while(s.length>1 && x.measureText(s+'…').width>max) s=s.slice(0,-1); return s+'…'; }
  function wrapText(x,text,maxW){ var words=String(text||'').split(/\s+/), lines=[], cur=''; words.forEach(function(w){ var t=cur?(cur+' '+w):w; if(x.measureText(t).width<=maxW||!cur){ cur=t; } else { lines.push(cur); cur=w; } }); if(cur) lines.push(cur); return lines.length?lines:['']; }

  /* ---------- load ---------- */
  function loadTargets(){
    API.calendarTargets().then(function(r){
      if(!(r&&r.ok)) return;
      CAL.targets=r.targets||[];
      /* Inject the calendar (owner) picker IN PLACE — do NOT rebuild the whole toolbar+grid.
         The old buildShell() rebuild wiped the toolbar a second after load (options "disappeared"). */
      if(CAL.targets.length>1 && !document.getElementById('calOwner')){
        var top=document.querySelector('#page-calendar .cal-top'); if(!top) return;
        var sel=document.createElement('select'); sel.id='calOwner'; sel.className='cal-owner';
        sel.innerHTML=CAL.targets.map(function(t){ return '<option value="'+esc(t.EmpID)+'"'+(String(t.EmpID)===String(CAL.owner)?' selected':'')+'>'+esc(t.FullName)+'</option>'; }).join('');
        var ttl=top.querySelector('.cal-ttl');
        if(ttl && ttl.nextSibling) top.insertBefore(sel, ttl.nextSibling); else top.appendChild(sel);
        sel.onchange=function(){ var t=CAL.targets.filter(function(x){return String(x.EmpID)===sel.value;})[0]; CAL.owner=sel.value; CAL.ownerName=(t?t.FullName:'').replace(/\s*\(.*\)$/,''); CAL.ownerRole=(t&&t.Role)||''; reload(); };
      }
    });
  }
  function reload(){
    var sub=document.getElementById('calSub'); if(sub) sub.textContent=CAL.ownerName+'’s schedule';
    Promise.all([API.cachedCalendar(CAL.owner), API.cachedTasksFor(CAL.owner)]).then(function(a){ if(a[0]) CAL.entries=a[0]; if(a[1]) CAL.tasks=a[1]; draw(); });
    API.listCalendar(CAL.owner).then(function(r){ if(r&&r.ok){ CAL.entries=r.entries||[]; CAL.canManage=r.canManage!==false; draw(); } });
    API.listTasksFor(CAL.owner).then(function(r){ if(r&&r.ok){ CAL.tasks=r.tasks||[]; draw(); } });
  }

  window.renderCalendar=function(){
    if(!CAL.owner){ CAL.owner=S.user.EmpID; CAL.ownerName=(S.user.FullName||'Me'); CAL.ownerRole=(S.user.Role||''); CAL.canManage=true; }
    buildShell(); loadTargets(); reload();
  };
})();
