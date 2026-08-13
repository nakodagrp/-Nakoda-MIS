/* Nakoda MIS — My Tasks. EA/admin can switch the 'Viewing' owner to see a Director's tasks. Loads after app.js; reuses globals. */
(function(){
  var TASKS=[], CALITEMS=[], DELEG=[], FILTER='today';
  var VIEW_OWNER=null, OWNER_NAME='', TARGETS=[];   // EA/admin can view another person's (e.g. Director's) tasks
  var PRI={High:'#C0392B',Normal:'#1A8AC2',Low:'#9aa0a6'};
  function meId(){ return S.user&&S.user.EmpID; }
  function calToItem(e){ return { taskId:'CAL::'+e.entryId, calId:e.entryId, isCal:true, source:'calendar', title:e.title, dueDate:e.date, dueTime:e.startTime, endTime:e.endTime, priority:'', status:(String(e.status)==='done'?'done':'open'), checklist:(e.checklist||'[]'), notes:(e.notes||'') }; }
  function combined(){ return TASKS.concat(CALITEMS); }
  /* v307: the CRM/process engine is gone, but its rows are still in the Tasks sheet — deliberately, so
     the history survives. Nothing can open them any more (there is no stage board to open), so a
     "CRM stage" row here would be a dead end: tappable, unresolvable, and permanently overdue. Filter
     them out of every list on the way in. No row is modified or deleted; they simply stop being shown. */
  function live(arr){ return (arr||[]).filter(function(t){ var s=String(t&&t.source); return s!=='process' && s!=='nrlead'; }); }

  function pc(t){ try{ return Array.isArray(t.checklist)?t.checklist:JSON.parse(t.checklist||'[]'); }catch(e){ return []; } }
  function todayStr(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function dd10(t){ return String(t.dueDate||'').slice(0,10); }
  function dueLabel(t){
    var ds=dd10(t);
    if(!ds) return t.dueTime?('Today '+t.dueTime):'No date';
    var d=new Date(ds+'T00:00'), tdy=todayStr();
    var nm=(ds===tdy)?'Today':(isNaN(d)?ds:d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}));
    return nm+(t.dueTime?(' '+t.dueTime):'');
  }
  function bucket(t){
    if(String(t.status)==='done') return 'done';
    if(String(t.source)==='nrlead') return 'nr';   // Not-responding follow-ups stay out of Today/Overdue; show under All
    // Approval tasks (leave, attendance) always show in Today — they need immediate action
    if(String(t.source)==='leave'||String(t.source)==='attendance') return 'today';
    var tdy=todayStr(), ds=dd10(t);
    if(ds && ds<tdy) return 'overdue';
    if(ds && ds>tdy) return 'upcoming';
    return 'today';
  }

  function canViewOthers(){ return (typeof S!=='undefined' && S.perms && S.perms.level==='SUPER') || (S.user && S.user.Role==='Executive Assistant'); }
  function curOwner(){ return VIEW_OWNER||meId(); }
  function isSelfView(){ return String(curOwner())===String(meId()); }

  function renderMyTasks(){
    var v=document.getElementById('page-tasks');
    var ttl=isSelfView()?'My Tasks':(esc(OWNER_NAME||'Director')+'’s Tasks');
    v.innerHTML='<div class="page-head"><h1 id="tkHead">'+ttl+'</h1><div class="spacer"></div>'+
      '<span id="tkOwnerWrap"></span>'+
      (isSelfView()?'<button class="btn" id="addTaskBtn">+ Add task</button>':'')+'</div>'+
      '<div id="taskChips" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px"></div>'+
      '<div id="taskList"></div>';
    var ab=document.getElementById('addTaskBtn'); if(ab) ab.onclick=function(){ openTaskForm(null); };
    paintChips();
    if(canViewOthers()) buildOwnerSwitch();
    loadData();
  }
  function buildOwnerSwitch(){
    API.calendarTargets().then(function(r){
      if(!(r&&r.ok)) return; TARGETS=r.targets||[];
      if(TARGETS.length<2) return;                 // only self in the list — nobody to switch to
      var wrap=document.getElementById('tkOwnerWrap'); if(!wrap) return;
      var cur=String(curOwner());
      wrap.innerHTML='<select id="tkOwner" class="cal-owner" style="margin-right:8px">'+TARGETS.map(function(t){ return '<option value="'+esc(t.EmpID)+'"'+(String(t.EmpID)===cur?' selected':'')+'>'+esc(t.FullName)+'</option>'; }).join('')+'</select>';
      document.getElementById('tkOwner').onchange=function(){
        var id=this.value, t=TARGETS.filter(function(x){return String(x.EmpID)===String(id);})[0];
        VIEW_OWNER=(String(id)===String(meId()))?null:id;
        OWNER_NAME=(t?t.FullName:'').replace(/\s*\(.*\)$/,'');
        FILTER='all';                              // a Director's tasks may not be due "today" — show everything by default
        renderMyTasks();
      };
    });
  }
  function loadData(){
    var owner=curOwner(), self=isSelfView(); DELEG=[];
    if(self){
      API.cachedTasks().then(function(t){ t=live(t); if(t&&t.length){ TASKS=t; paintList(); } else { var b=document.getElementById('taskList'); if(b) b.innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>'; } });
      API.listMyTasks().then(function(r){ if(r.ok){ TASKS=live(r.tasks); paintList(); } });
      API.cachedCalendar(owner).then(function(e){ if(e){ CALITEMS=e.filter(function(x){return String(x.status)!=='deleted';}).map(calToItem); paintList(); } });
      API.listCalendar(owner).then(function(r){ if(r&&r.ok){ CALITEMS=(r.entries||[]).map(calToItem); paintList(); } });
      API.listAssignedByMe().then(function(r){ if(r&&r.ok){ DELEG=(r.tasks||[]).map(function(t){ t.isDeleg=true; return t; }); paintList(); } });
    } else {
      TASKS=[]; CALITEMS=[]; var b=document.getElementById('taskList'); if(b) b.innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>';
      API.cachedTasksFor(owner).then(function(t){ t=live(t); if(t&&t.length){ TASKS=t; paintList(); } });
      API.listTasksFor(owner).then(function(r){ if(r&&r.ok){ TASKS=live(r.tasks); paintList(); } });
      API.cachedCalendar(owner).then(function(e){ if(e){ CALITEMS=e.filter(function(x){return String(x.status)!=='deleted';}).map(calToItem); paintList(); } });
      API.listCalendar(owner).then(function(r){ if(r&&r.ok){ CALITEMS=(r.entries||[]).map(calToItem); paintList(); } });
    }
  }
  function typeCount(key){
    if(key==='others') return dedupTasks(DELEG).filter(function(t){return t.status!=='deleted';}).length;
    return dedupTasks(combined()).filter(function(t){ if(t.status==='deleted') return false;
      if(key==='me') return t.source==='assigned'||t.source==='training';
      if(key==='recurring') return t.source==='recurring' && t.status!=='done';
      if(key==='calendar') return t.isCal;
      return false; }).length;
  }
  function paintChips(){
    /* v312 — THIS WAS THE "Cannot set properties of null" CRASH.
       #taskChips and #taskList only exist once renderMyTasks() has drawn the My Tasks page. Every
       popup action button finishes by calling paintList(), and since v311 restored window.taskShared
       those popups can be opened straight from the DASHBOARD — where that page has never been drawn.
       So Complete wrote innerHTML onto null and threw, leaving the task ticked locally but the error
       banner up. Guarding here rather than at each of the ~8 call sites, so no future caller can
       reintroduce it. */
    var host=document.getElementById('taskChips'); if(!host) return;
    var ALL=dedupTasks(combined());
    var defs=[['today','Today'],['upcoming','Upcoming'],['overdue','Overdue'],['done','Done'],['all','All'],
              ['me','Assigned to me'],['others','Assigned to others'],['recurring','Recurring'],['calendar','Calendar']];
    host.innerHTML=defs.map(function(d){
      var on=FILTER===d[0], n;
      if(['today','upcoming','overdue','done'].indexOf(d[0])>=0) n=ALL.filter(function(t){return bucket(t)===d[0];}).length;
      else if(d[0]==='all') n=ALL.filter(function(t){return t.status!=='deleted';}).length;
      else n=typeCount(d[0]);
      return '<button class="tchip'+(on?' on':'')+'" data-f="'+d[0]+'">'+d[1]+' <span style="opacity:.7">'+n+'</span></button>';
    }).join('');
    document.querySelectorAll('#taskChips .tchip').forEach(function(b){ b.onclick=function(){ FILTER=b.getAttribute('data-f'); paintChips(); paintList(); }; });
  }
  /* Collapse duplicate cards so the same lead/task never shows more than once.
     Key: process/CRM cards by instance+stage; everything else by taskId; fall back to title+date+source.
     When two rows share a key we keep the "best" one — an open task beats a done one, then the most
     recently updated / most checklist progress. Fixes leads (e.g. "Prospectus — Aakash Daman") showing 3×. */
  function dedupTasks(arr){
    function keyOf(t){
      if((String(t.source)==='process'||String(t.source)==='nrlead') && t.instanceId)
        return 'proc:'+t.instanceId+'|'+(t.stageId||'');
      if(t.taskId) return 'id:'+t.taskId;
      return 'k:'+(t.title||'')+'|'+dd10(t)+'|'+(t.source||'');
    }
    function betterThan(a,b){                       // is a a better keeper than b?
      var ad=String(a.status)==='done'?1:0, bd=String(b.status)==='done'?1:0;
      if(ad!==bd) return ad<bd;                     // prefer not-done
      var au=new Date(a.updatedAt||a.completedAt||0).getTime()||0, bu=new Date(b.updatedAt||b.completedAt||0).getTime()||0;
      if(au!==bu) return au>bu;                      // prefer most recently updated
      return pc(a).filter(function(x){return x.done;}).length >= pc(b).filter(function(x){return x.done;}).length;
    }
    var seen={}, out=[];
    arr.forEach(function(t){
      var k=keyOf(t), i=seen[k];
      if(i===undefined){ seen[k]=out.length; out.push(t); }
      else if(betterThan(t,out[i])){ out[i]=t; }
    });
    return out;
  }
  function paintList(){
    paintChips();
    var box=document.getElementById('taskList');
    /* Off the My Tasks page (i.e. the popup came from the dashboard) there is nothing here to paint.
       Rather than silently do nothing, mirror the statuses this file now holds into the dashboard's
       own copy and repaint that — otherwise you complete a task, the popup closes, and the card sits
       there still looking open until the next full refresh. Same optimistic pattern as dtToggle. */
    if(!box){
      try{
        if(window.DASH && window.renderDashTasks){
          var mine={}; combined().forEach(function(t){ mine[String(t.taskId)]=String(t.status); });
          (window.DASH.tasks||[]).forEach(function(x){
            var st=mine[String(x.taskId)]; if(st) x.status=st;
          });
          window.renderDashTasks();
        }
      }catch(e){}
      return;
    }
    var src=(FILTER==='others')?DELEG:combined();
    var list=dedupTasks(src.filter(function(t){ if(t.status==='deleted') return false;
      switch(FILTER){
        case 'all': case 'others': return true;
        case 'today': case 'upcoming': case 'overdue': case 'done': return bucket(t)===FILTER;
        case 'me': return t.source==='assigned'||t.source==='training';
        case 'recurring': return t.source==='recurring' && t.status!=='done';
        case 'calendar': return t.isCal;
      }
      return true;
    }));
    list.sort(function(a,b){
      var ad=(String(a.status)==='done')?1:0, bd=(String(b.status)==='done')?1:0;
      if(ad!==bd) return ad-bd;                                   // pending first, completed sink to bottom
      return (a.dueDate||'9999')+(a.dueTime||'')>(b.dueDate||'9999')+(b.dueTime||'')?1:-1;
    });
    if(!list.length){ box.innerHTML='<div class="empty">No tasks here. Tap “+ Add task”.</div>'; return; }
    box.innerHTML=list.map(function(t){
      var done=t.status==='done', cl=pc(t), cldone=cl.filter(function(x){return x.done;}).length;
      var over=bucket(t)==='overdue';
      var tag=t.isDeleg?'<span style="background:#fff4e8;color:#c47f00;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">→ Assigned to '+esc(t.assigneeName||'')+'</span>'
              :t.isCal?'<span style="background:#ECEAFB;color:#5046b8;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">📅 Meeting / Calendar</span>'
              :(t.source==='recurring'?'<span style="background:#ECEAFB;color:#5046b8;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">🔁 Recurring</span>'
              :(t.source==='training'?'<span style="background:#eafaf3;color:#1aa37a;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">🎓 Training</span>'
              :(t.source==='process'?'<span style="background:#eafaf3;color:#1aa37a;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">📁 CRM stage</span>'
              :(t.source==='attendance'?'<span style="background:#fdeaea;color:#a3271f;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">🕒 Attendance</span>'
              :(t.source==='leave'?'<span style="background:#eef7ee;color:#1a7f37;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">🌴 Leave</span>'
              :(t.source==='nrlead'?'<span style="background:#fff4e8;color:#c47f00;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">↻ Not responding</span>'
              :(t.source==='assigned'?'<span style="background:#eef2ff;color:#4253c5;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">Assigned by '+esc(t.assignedByName||'manager')+'</span>':'')))))));
      return '<div class="tcard'+(done?' tdone':'')+'" data-id="'+esc(t.taskId)+'">'+
        '<span class="tbox'+(done?' on':'')+'" data-tog="'+esc(t.taskId)+'"></span>'+
        '<div class="tbody">'+
          '<div class="ttitle">'+esc(t.title)+pend(t)+'</div>'+
          (tag?'<div style="margin-top:3px">'+tag+'</div>':'')+
          '<div class="tmeta"><span class="pdot" style="background:'+(t.isCal?'#7F77DD':(PRI[t.priority]||'#999'))+'"></span>'+
            '<span'+(over?' style="color:#C0392B;font-weight:600"':'')+'>'+esc(dueLabel(t))+'</span>'+(t.isCal?'':' · '+esc(t.priority||'Normal'))+
            (cl.length?(' · ☑ '+cldone+'/'+cl.length):'')+'</div>'+
        '</div></div>';
    }).join('');
    box.querySelectorAll('.tcard').forEach(function(el){ el.onclick=function(ev){ if(ev.target.getAttribute('data-tog')) return; var id=el.getAttribute('data-id'); var tk=byId(id);
      if(id.indexOf('CAL::')===0){ if(window.openCalendarEntryById && tk) window.openCalendarEntryById(tk.calId, function(){ if(window.renderMyTasks) window.renderMyTasks(); }); return; }
      /* v307: the branch that opened a CRM stage board from a task is gone with the board. */
      openTaskDetail(id); }; });
    box.querySelectorAll('[data-tog]').forEach(function(b){ b.onclick=function(ev){ ev.stopPropagation(); toggleDone(b.getAttribute('data-tog')); }; });
  }
  function pend(t){ return t._pending?' <span class="badge pending">syncing</span>':''; }
  function byId(id){ return combined().concat(DELEG).filter(function(t){return String(t.taskId)===String(id);})[0]; }

  function toggleDone(id){ var t=byId(id); if(!t) return;
    if(t.isCal){ var nc=t.status==='done'?'pending':'done'; t.status=(nc==='done'?'done':'open'); t._pending=true; paintList();
      API.updateCalEntry(t.calId,{status:nc},curOwner()).then(function(){
        API.listCalendar(curOwner()).then(function(r){ if(r&&r.ok){ CALITEMS=(r.entries||[]).map(calToItem); paintList(); } }).catch(function(){});
      }); return; }
    var ns=t.status==='done'?'open':'done'; t.status=ns; t._pending=true; paintList(); API.setTaskStatus(id,ns).then(function(){ return API.listMyTasks(); }).then(function(r){ if(r&&r.ok) TASKS=live(r.tasks); paintList(); }); }

  /* v262: inline attendance panel for the "Approve attendance" task. Before this the task carried only
     a sentence telling the approver to go and look the punch up in the Attendance screen, which meant
     leaving My Tasks, finding the row, deciding, then coming back to tick the task. Everything needed
     to decide now renders in the task itself. Mirrors dailyPanelHtml above, which the daily-collection
     verify task already uses. */
  function attPanelHtml(a){
    var late=(a.lateMin==null)?null:Number(a.lateMin);
    var lateTxt=late==null?'—':(late<=0?'<span style="color:#1a7f37">On time</span>'
      :'<span style="color:#b08900">'+(late>=60?(Math.floor(late/60)+'h '+(late%60)+'m'):(late+' min'))+'</span>');
    var geo=String(a.geoOkIn||'').toLowerCase();
    var geoTxt=geo==='yes'||geo==='true'?'<span style="color:#1a7f37">In range</span>'
      :geo==='no'||geo==='false'?'<span style="color:#A32D2D">Out of range</span>':'—';
    var shift=(a.shiftStart||'')+(a.shiftEnd?('–'+a.shiftEnd):'');
    var mapUrl=(a.latIn!==''&&a.latIn!=null&&a.lngIn!==''&&a.lngIn!=null)
      ? ('https://maps.google.com/?q='+encodeURIComponent(a.latIn+','+a.lngIn)) : '';
    /* Drive's "uc?export=view" links no longer render inside an <img> — Google returns a redirect/403,
       which is why the selfie showed as a broken image. The thumbnail endpoint does render. Same
       conversion attendance.js:driveImg() already uses; duplicated here because that one lives inside
       attendance.js's IIFE and is not reachable from this file. */
    function driveImg(url){
      if(!url) return '';
      var m=String(url).match(/[\/|=]([a-zA-Z0-9_-]{25,})/);
      return m ? ('https://drive.google.com/thumbnail?id='+m[1]+'&sz=w600') : url;
    }
    /* One stat tile. Value may be pre-built HTML (coloured On time / Out of range), so it is NOT
       escaped here — every caller escapes its own plain-text values before passing them in. */
    function stat(label,valueHtml){
      return '<div style="background:#f6f7f9;border-radius:7px;padding:7px 9px;min-width:0">'+
        '<div style="font-size:10.5px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+label+'</div>'+
        '<div style="font-size:14px;margin-top:1px;overflow-wrap:anywhere">'+valueHtml+'</div></div>';
    }
    function shot(url,label,empty){
      if(!url) return '<div style="flex:1;min-width:0"><div style="font-size:11px;color:#888;margin-bottom:4px">'+label+'</div>'+
        '<div style="height:130px;background:#f6f7f9;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11.5px;color:#b6b9be">'+empty+'</div></div>';
      /* onerror keeps a failed image from showing browser chrome/alt text — it becomes a neutral tile
         with a link, so the approver can still open the original in Drive. */
      /* 130px tall — at the old 78px a face was not identifiable on a phone, which defeats the point
         of showing the selfie to an approver. Still side by side so in and out can be compared. */
      return '<div style="flex:1;min-width:0"><div style="font-size:11px;color:#888;margin-bottom:4px">'+label+'</div>'+
        '<a href="'+esc(url)+'" target="_blank" rel="noopener" style="display:block;position:relative">'+
        '<img src="'+esc(driveImg(url))+'" alt="'+label+'" loading="lazy" '+
        'style="width:100%;height:130px;object-fit:cover;border-radius:6px;background:#e8eaed;display:block" '+
        'onerror="this.style.display=\'none\';this.parentNode.insertAdjacentHTML(\'beforeend\',\'<div style=&quot;height:130px;background:#f6f7f9;border:1px dashed #ccc;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11.5px;color:#9aa0a6&quot;>Open photo &#8599;</div>\')">'+
        '</a></div>';
    }
    return '<div id="tdAtt" style="border:1px solid var(--line);border-radius:10px;padding:11px;margin-top:10px">'+
      '<div style="font-weight:700;font-size:12.5px;margin-bottom:8px">'+esc(a.empName||a.empId||'')+' · '+esc(a.date||'')+
        (String(a.approvalStatus)==='approved'?' · <span style="color:#1a7f37">approved</span>':'')+'</div>'+
      /* v262 mobile fix: this was a 4-column table with table-layout:fixed. On a phone each cell was
         far too narrow, so every label and value wrapped onto its own line and right-aligned — the
         panel became a tall stack of half-empty boxes. A grid of small stat tiles with
         repeat(auto-fit,minmax(88px,1fr)) works out its own column count from the available width:
         2 across on a phone, 3 across in the desktop modal. No media query, one code path. */
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:8px">'+
        stat('Check in', esc(a.checkIn||'—'))+
        stat('Check out', a.checkOut?esc(a.checkOut):'<span style="color:#9aa0a6">—</span>')+
        stat('Shift', esc(shift||'—'))+
        stat('Late by', lateTxt)+
        stat('Geo', geoTxt)+
        /* v263: Status is editable here. Same four values and the same labels as the dropdown on the
           Attendance screen (attendance.js stLabel), so the two can never disagree. The choice is held
           locally and written together with the approval — see tdComplete — so closing the popup
           discards it rather than half-applying a change. */
        (a.canApprove
          ? '<div style="background:#fff;border:1.5px solid var(--red);border-radius:7px;padding:5px 7px;min-width:0">'+
              '<div style="font-size:10.5px;color:#888">Status</div>'+
              '<select id="tdAttStatus" data-nocombo data-was="'+esc(a.status||'')+'" style="width:100%;border:0;background:transparent;font-size:14px;padding:0;margin-top:1px;outline:none">'+
                ['present','half','leave','absent'].map(function(v){
                  var lbl={present:'Full day',half:'Half day',leave:'Leave',absent:'Absent'}[v];
                  return '<option value="'+v+'"'+(String(a.status)===v?' selected':'')+'>'+lbl+'</option>';
                }).join('')+
              '</select></div>'
          : stat('Status', esc(a.status||'—')))+
      '</div>'+
      /* Changing status changes that month's pay, so say so plainly if the payslip already exists. */
      (a.canApprove && a.payrollStatus
        ? '<div style="margin-top:7px;font-size:11.5px;color:#b08900;background:#fff7e6;border-radius:6px;padding:6px 8px">'+
          '⚠ Payroll for this month is already '+esc(a.payrollStatus)+'. Changing the status will not update the payslip on its own.</div>'
        : '')+
      (a.addrIn?('<div style="border-top:1px solid var(--line);margin-top:7px;padding-top:7px;font-size:12.5px;color:#686868">📍 '+esc(a.addrIn)+
        (mapUrl?(' · <a href="'+esc(mapUrl)+'" target="_blank" rel="noopener" style="color:var(--red);font-weight:600">open map ↗</a>'):'')+'</div>')
        :(mapUrl?('<div style="border-top:1px solid var(--line);margin-top:7px;padding-top:7px;font-size:12.5px"><a href="'+esc(mapUrl)+'" target="_blank" rel="noopener" style="color:var(--red);font-weight:600">📍 open punch-in location ↗</a></div>'):''))+
      '<div style="display:flex;gap:10px;margin-top:10px">'+shot(a.selfieInUrl,'Selfie in','No selfie')+shot(a.selfieOutUrl,'Selfie out','Not yet')+'</div>'+
      (a.notes?('<div style="margin-top:8px;font-size:12.5px;color:#686868">'+esc(a.notes)+'</div>'):'')+
      '</div>';
  }

  /* ============================================================================================
     v263: GENERIC TASK DETAIL PANEL
     Every task type that links to a record (indent, bank deposit, leave, CRM stage, asset audit,
     stock deduction) renders through this one function. The server decides WHAT to show and returns
     a normalised spec — see apiGetTaskDetail — so adding another task type later needs no change
     here at all. Same stat-tile layout as the attendance panel, so it reflows on a phone.
     ============================================================================================ */
  var TD_TONE={ok:'#1a7f37', warn:'#b08900', bad:'#A32D2D', '':''};
  function specPanelHtml(sp){
    function tone(t){ var c=TD_TONE[String(t||'')]; return c?(' style="color:'+c+'"'):''; }
    function stat(l,v,t){
      return '<div style="background:#f6f7f9;border-radius:7px;padding:7px 9px;min-width:0">'+
        '<div style="font-size:10.5px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(l)+'</div>'+
        '<div style="font-size:14px;margin-top:1px;overflow-wrap:anywhere"'+tone(t)+'>'+esc(v)+'</div></div>';
    }
    var h='<div id="tdSpec" style="border:1px solid var(--line);border-radius:10px;padding:11px;margin-top:10px">';
    h+='<div style="font-weight:700;font-size:12.5px;margin-bottom:8px">'+esc(sp.header||'')+
       (sp.badge?(' · <span style="font-weight:600;color:#686868">'+esc(sp.badge)+'</span>'):'')+'</div>';
    if(sp.stats && sp.stats.length){
      h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:8px">'+
         sp.stats.map(function(s){ return stat(s.l,s.v,s.tone); }).join('')+'</div>';
    }
    if(sp.rows && sp.rows.length){
      h+='<div style="border-top:1px solid var(--line);margin-top:9px;padding-top:8px;font-size:12.5px">'+
         sp.rows.map(function(r){ return '<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0">'+
           '<span style="color:#888;flex:none">'+esc(r.l)+'</span><span style="text-align:right;overflow-wrap:anywhere">'+esc(r.v)+'</span></div>'; }).join('')+'</div>';
    }
    if(sp.items && sp.items.list && sp.items.list.length){
      h+='<div style="border-top:1px solid var(--line);margin-top:9px;padding-top:8px">'+
         '<div style="font-size:10.5px;color:#888;letter-spacing:.3px;margin-bottom:5px">'+esc(sp.items.label||'ITEMS')+'</div>'+
         sp.items.list.map(function(i,ix,arr){
           return '<div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:4px 0'+
             (ix<arr.length-1?';border-bottom:1px solid #f4f5f7':'')+'">'+
             '<span style="overflow-wrap:anywhere">'+esc(i.l)+'</span><span'+tone(i.tone)+' style="color:#686868;flex:none">'+esc(i.v)+'</span></div>';
         }).join('')+'</div>';
    }
    if(sp.note) h+='<div style="background:#f6f7f9;border-radius:7px;padding:8px;margin-top:9px;font-size:12.5px;color:#686868;white-space:pre-line">'+esc(sp.note)+'</div>';
    if(sp.chips && sp.chips.length){
      h+='<div style="border-top:1px solid var(--line);margin-top:8px;padding-top:8px;display:flex;gap:6px;flex-wrap:wrap;font-size:10.5px">'+
         sp.chips.map(function(c){ var ok=String(c.tone)==='ok';
           return '<span style="background:'+(ok?'#EAF3DE':'#f1efe8')+';color:'+(ok?'#3B6D11':'#5F5E5A')+';padding:2px 8px;border-radius:12px">'+esc(c.t)+'</span>'; }).join('')+'</div>';
    }
    if(sp.files && sp.files.length){
      h+='<div style="margin-top:9px;display:flex;flex-direction:column;gap:5px;font-size:12.5px">'+
         sp.files.map(function(f){ return '<a href="'+esc(f.url)+'" target="_blank" rel="noopener" style="color:var(--red);font-weight:600">📎 '+esc(f.l)+' ↗</a>'; }).join('')+'</div>';
    }
    return h+'</div>';
  }

  /* v305: the day's expenses, each approved or rejected on its own line. They are NOT swept in with
     the day — an expense with no bill attached should be stoppable without holding up the collection
     figures, and the collection should be verifiable without waiting on a queried expense. */
  function expLinesHtml(exps, canV){
    function m(n){ return '₹'+Math.round(Number(n)||0).toLocaleString('en-IN'); }
    if(!exps || !exps.length)
      return '<div style="margin-top:12px;font-size:12px;color:#9aa0a6">No expenses filed for this day.</div>';
    var tot=0; exps.forEach(function(x){ tot+=Number(x.amount)||0; });
    var rows=exps.map(function(x){
      var st=String(x.status||'pending');
      var badge = st==='approved' ? '<span style="font-size:11px;background:#eaf7ef;color:#1a8f4c;padding:3px 9px;border-radius:20px;font-weight:600">✓ approved</span>'
                : st==='rejected' ? '<span style="font-size:11px;background:#fdecec;color:#b23b3b;padding:3px 9px;border-radius:20px;font-weight:600">✗ rejected</span>'
                : '';
      var acts = (canV && st!=='approved' && st!=='rejected')
        ? '<button class="btn ghost sm" data-expok="'+esc(x.ledId)+'" style="color:#1a8f4c;border-color:#1a8f4c;padding:3px 10px;font-size:11.5px">Approve</button>'+
          ' <button class="btn ghost sm" data-expno="'+esc(x.ledId)+'" style="color:#b23b3b;border-color:#b23b3b;padding:3px 10px;font-size:11.5px">Reject</button>'
        : badge;
      /* A cash expense with no bill is the one worth looking at twice, so it is called out rather than
         left for somebody to notice the missing paperclip. */
      var noBill = !x.billUrl;
      return '<div data-exprow="'+esc(x.ledId)+'" style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--line)">'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:12.5px">'+esc(x.category||'Expense')+(x.party?(' <span style="color:#9aa0a6">· '+esc(x.party)+'</span>'):'')+'</div>'+
          '<div style="font-size:11px;color:'+(noBill?'#b23b3b':'#9aa0a6')+'">'+esc(x.mode||'')+' · '+
            (x.billUrl?('<a href="'+esc(x.billUrl)+'" target="_blank" rel="noopener" style="color:var(--red)">bill ↗</a>'):'no bill attached')+'</div>'+
        '</div>'+
        '<span style="font-size:12.5px;white-space:nowrap">'+m(x.amount)+'</span>'+
        '<span style="white-space:nowrap" data-expact="'+esc(x.ledId)+'">'+acts+'</span></div>';
    }).join('');
    return '<div style="margin-top:12px">'+
      '<div style="font-size:11px;color:#9aa0a6;letter-spacing:.04em;margin-bottom:2px">EXPENSES THIS DAY — approved one by one</div>'+
      rows+
      '<div style="display:flex;justify-content:space-between;border-top:1px solid var(--line);margin-top:6px;padding-top:6px;font-size:12.5px;font-weight:700">'+
        '<span>Total expenses</span><span style="color:#A32D2D">'+m(tot)+'</span></div></div>';
  }
  /* Approve/reject a single line without closing the task or reloading the day. */
  function wireDailyExpenses(t){
    document.querySelectorAll('#modalRoot [data-expok],#modalRoot [data-expno]').forEach(function(b){
      b.onclick=function(){
        var id=b.getAttribute('data-expok')||b.getAttribute('data-expno');
        var act=b.hasAttribute('data-expok')?'approve':'reject';
        var cell=document.querySelector('#modalRoot [data-expact="'+id+'"]');
        if(cell) cell.innerHTML='<span style="font-size:11px;color:#9aa0a6">saving…</span>';
        API.setLedger(id,act).then(function(r){
          if(r&&r.ok){
            if(cell) cell.innerHTML = act==='approve'
              ? '<span style="font-size:11px;background:#eaf7ef;color:#1a8f4c;padding:3px 9px;border-radius:20px;font-weight:600">✓ approved</span>'
              : '<span style="font-size:11px;background:#fdecec;color:#b23b3b;padding:3px 9px;border-radius:20px;font-weight:600">✗ rejected</span>';
            toast(act==='approve'?'Expense approved':'Expense rejected');
          } else {
            toast((r&&r.error)||'Could not update the expense',true);
            if(cell) cell.innerHTML='<button class="btn ghost sm" data-expok="'+id+'" style="color:#1a8f4c;border-color:#1a8f4c;padding:3px 10px;font-size:11.5px">Approve</button>'+
              ' <button class="btn ghost sm" data-expno="'+id+'" style="color:#b23b3b;border-color:#b23b3b;padding:3px 10px;font-size:11.5px">Reject</button>';
            wireDailyExpenses(t);
          }
        });
      };
    });
  }
  function dailyPanelHtml(e, exps, canV, files){
    function m(n){ return '₹'+Math.round(Number(n)||0).toLocaleString('en-IN'); }
    var b2cCash=Number(e.b2cCash)||0,b2cBank=Number(e.b2cBank)||0,b2dCash=Number(e.b2dCash)||0,b2dBank=Number(e.b2dBank)||0;
    var total=b2cCash+b2cBank+b2dCash+b2dBank;
    /* v305: name the file. "B2C document" told you something was attached but not which file, so the
       only way to check a day was to open every one. The server now resolves the real name and size
       from Drive; when it cannot (a deleted file, a link from before this change) the label falls back
       to what it always said, so the row never goes blank. */
    files=files||{};
    function fsize(b){ b=Number(b)||0; if(!b) return ''; return b<1048576?(Math.round(b/1024)+' KB'):((b/1048576).toFixed(1)+' MB'); }
    function docLink(url,label,key){
      if(!url) return '';
      var meta=files[key]||{}, nm=String(meta.name||'').trim(), sz=fsize(meta.size);
      var main=nm||label;
      return '<a href="'+esc(url)+'" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:7px;color:var(--red);font-weight:600;text-decoration:none">'+
        '<span style="flex:none">📎</span>'+
        '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(main)+
          (nm?('<span style="color:#9aa0a6;font-weight:400"> · '+esc(label)+(sz?(' · '+sz):'')+'</span>'):'')+'</span>'+
        '<span style="flex:none;color:#9aa0a6">↗</span></a>';
    }
    var docs=[];
    var d1=docLink(e.b2cDocUrl,'B2C report','b2cDocUrl'); if(d1) docs.push(d1);
    var d2=docLink(e.b2dDocUrl,'B2D report','b2dDocUrl'); if(d2) docs.push(d2);
    var d3=docLink(e.otherDocUrl,'Other document','otherDocUrl'); if(d3) docs.push(d3);
    var d4=docLink(e.testXlUrl,'Tests Excel','testXlUrl'); if(d4) docs.push(d4);
    return '<div style="border:1px solid var(--line);border-radius:10px;padding:11px;margin-top:10px">'+
      '<div style="font-weight:700;font-size:12.5px;margin-bottom:8px">'+esc(e.branchName||e.branchId||'')+' · '+esc(e.date||'')+(String(e.status)==='verified'?' · <span style="color:#1a7f37">verified</span>':'')+'</div>'+
      '<table style="width:100%;font-size:13px;border-collapse:collapse">'+
      '<tr><td style="color:#888;padding:3px 0">B2C — Cash</td><td style="text-align:right">'+m(b2cCash)+'</td><td style="color:#888;text-align:right;padding-left:10px">Bank/UPI</td><td style="text-align:right">'+m(b2cBank)+'</td></tr>'+
      '<tr><td style="color:#888;padding:3px 0">B2D — Cash</td><td style="text-align:right">'+m(b2dCash)+'</td><td style="color:#888;text-align:right;padding-left:10px">Bank/UPI</td><td style="text-align:right">'+m(b2dBank)+'</td></tr>'+
      '<tr><td style="color:#888;padding:3px 0">Patients</td><td style="text-align:right">'+(Number(e.patients)||0)+'</td><td style="color:#888;text-align:right;padding-left:10px">Tests</td><td style="text-align:right">'+(Number(e.tests)||0)+'</td></tr>'+
      '</table>'+
      '<div style="display:flex;justify-content:space-between;border-top:1px solid var(--line);margin-top:7px;padding-top:7px;font-weight:700"><span>Total business</span><span style="color:#1a7f37">'+m(total)+'</span></div>'+
      '<div style="font-size:11px;color:#9aa0a6;letter-spacing:.04em;margin-top:12px;margin-bottom:4px">ATTACHED DOCUMENTS — tap to open</div>'+
      '<div style="font-size:13px;display:flex;flex-direction:column;gap:7px">'+
        (docs.length?docs.join(''):'<span style="color:#999">No documents attached</span>')+
        /* Money was taken but nothing was attached to account for it — say so here rather than leave a
           gap that reads the same as "this day had no B2C business". */
        ((b2cCash+b2cBank)>0 && !e.b2cDocUrl ? '<span style="color:#A32D2D;font-size:12px">⚠ B2C report not attached</span>' : '')+
      '</div>'+
      expLinesHtml(exps, canV)+
      (String(e.status)==='verified'?'':'<div style="margin-top:11px;font-size:11.5px;color:#854f0b;background:#faf4e2;border-radius:8px;padding:7px 9px;line-height:1.5">Not counted anywhere yet. Verifying puts this day into the dashboard and releases its stock batch.</div>')+
      '</div>';
  }
  /* The meeting, as a meeting: when it is, what it is, and the two things you actually want to do to
     it. Both buttons act on the calendar entry, which is the record that really exists. */
  function openCalDetail(t){
    var when=esc(dueLabel(t))+(t.dueTime?(' · '+esc(t.dueTime)+(t.endTime?('–'+esc(t.endTime)):'')):'');
    var done=(t.status==='done');
    var body='<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'+
        '<span style="background:#ECEAFB;color:#5046b8;border-radius:12px;font-size:10px;padding:2px 9px;font-weight:600">📅 Meeting / Calendar</span>'+
        (done?'<span style="background:#eaf7ef;color:#1a8f4c;border-radius:12px;font-size:10px;padding:2px 9px;font-weight:600">done</span>':'')+
      '</div>'+
      '<div style="font-size:13px;color:#444;margin-bottom:4px"><b>When</b> · '+when+'</div>'+
      (t.notes?('<div style="font-size:13px;background:#f6f7f9;border-radius:8px;padding:10px;white-space:pre-line;margin-top:8px">'+esc(t.notes)+'</div>'):'')+
      '<div style="font-size:11.5px;color:#9aa0a6;margin-top:10px;line-height:1.5">This is a calendar entry, not an assigned task. Deleting it removes it from the calendar and from this list.</div>'+
      '<div id="cdMsg"></div>';
    var foot='<button class="btn ghost" onclick="closeModal()">Close</button>'+
      '<button class="btn ghost" id="cdDel" style="color:#A32D2D;border-color:#e3b1b1">Delete</button>'+
      '<button class="btn" id="cdDone">'+(done?'Mark not done':'✓ Mark done')+'</button>';
    openModal(t.title, body, foot);
    /* v306.3: re-pull from the SERVER, not the device copy. The device copy is exactly what goes stale
       — it can hold an entry the sheet never received — so refreshing from it would leave the phantom
       on screen. listCalendar overwrites the local copy with the server's, which is what clears it. */
    function refresh(){
      API.listCalendar(curOwner()).then(function(r){
        if(r&&r.ok){ CALITEMS=(r.entries||[]).map(calToItem); paintList(); }
      }).catch(function(){});
    }
    /* A failure here usually means the entry is not on the server at all. Say so plainly and resync,
       so the row disappears instead of sitting there failing every time it is tapped. */
    function calFail(msg,btn){
      var box=document.getElementById('cdMsg');
      if(box) box.innerHTML='<div class="msg error">'+esc(msg||'Failed')+'</div>';
      if(btn) btn.disabled=false;
      refresh();
    }
    document.getElementById('cdDone').onclick=function(){
      var b=this; b.disabled=true;
      API.updateCalEntry(t.calId,{status:(done?'pending':'done')},curOwner()).then(function(r){
        if(r&&(r.ok||r.offline)){ closeModal(); toast(done?'Marked not done':'Marked done'); refresh(); }
        else calFail((r&&r.error)==='Entry not found.'
          ? 'This meeting is not on the server — it was only ever saved on this device. Refreshing the list; it should disappear.'
          : ((r&&r.error)||'Failed'), b);
      });
    };
    document.getElementById('cdDel').onclick=function(){
      if(!confirm('Delete "'+(t.title||'this meeting')+'"?')) return;
      var b=this; b.disabled=true;
      /* The server treats deleting an absent entry as already done, so this now succeeds either way
         and the refresh clears it off the list. */
      API.updateCalEntry(t.calId,{status:'deleted'},curOwner()).then(function(r){
        if(r&&(r.ok||r.offline)){ closeModal(); toast('Deleted'); refresh(); }
        else calFail((r&&r.error)||'Failed', b);
      });
    };
  }
  function openTaskDetail(id){
    var t=byId(id); if(!t) return; var cl=pc(t);
    /* A training task is not a tick-box — open the actual lesson (video + quiz).
       The task auto-closes server-side when the quiz is passed, so there is no manual Complete. */
    if(t.source==='training' && t.instanceId && window.openTrainingVideo){ window.openTrainingVideo(t.instanceId); return; }
    /* v306: A MEETING IS NOT A TASK, AND PRETENDING IT WAS BROKE IT.
       Calendar entries are folded into My Tasks with a synthetic id of the form CAL::<entryId>. Every
       branch of this modal then treated them as ordinary tasks — so Complete called updateTask with an
       id the Tasks sheet has never contained and came back "Task not found", and there was no way to
       delete from here at all. Hence "I open it and it does nothing". They get their own panel. */
    if(t.isCal){ openCalDetail(t); return; }
    /* v309: a "Send report" task is not a tick-box either — open the sample, where the patient's
       number, the prescription and the report all already are. Sending closes this task server-side
       (opsCloseSendTask_), so there is no manual Complete for it. */
    if(t.source==='sample' && t.instanceId && window.openSendReport){ window.openSendReport(t.instanceId, t.taskId); return; }
    var isDaily=(t.source==='accounts' && t.instanceId);
    var isDep=(t.source==='deposit' && t.instanceId);
    var isAtt=(t.source==='attendance' && t.instanceId);   /* instanceId holds the attId — see ensureAttApprovalTasks_ */
    /* v263: every other task type that links to a record renders through the generic spec panel.
       The server decides what to show (apiGetTaskDetail), so this list is the only place the client
       needs to know a type exists. Tasks with no instanceId — indents raised before this build —
       simply keep showing their description, which is why nothing needed backfilling. */
    var SPEC_SRC={purchase:1,deposit:1,leave:1,process:1,asset:1,stock:1};
    var isSpec=(SPEC_SRC[String(t.source)] && t.instanceId);
    /* v272: a leave task was approve-only — the single Complete button approved, and the only way to
       refuse was to leave the office and go to Leave → Approvals. So refusing was harder than agreeing,
       which is the wrong way round for a decision that costs the company money. Reject now sits beside
       Approve here, with the same reason-required rule the daily cash rejection has. */
    var isLeave=(String(t.source)==='leave' && t.instanceId);
    var clHtml=cl.length?('<div style="background:#f6f7f9;border-radius:8px;padding:10px;margin-top:10px">'+cl.map(function(it,i){
      return '<label style="display:flex;align-items:flex-start;gap:9px;padding:4px 0;font-size:13px;cursor:pointer"><input type="checkbox" data-ci="'+i+'"'+(it.done?' checked':'')+' style="transform:scale(1.2);margin-top:2px"><span'+(it.done?' style="text-decoration:line-through;color:#999"':'')+'>'+esc(it.text)+'</span></label>';
    }).join('')+'</div>'):'';
    var body='<div style="font-size:13px;color:#8a8f98;margin-bottom:8px"><span class="pdot" style="background:'+(PRI[t.priority]||'#999')+'"></span> Due '+esc(dueLabel(t))+' · '+esc(t.priority||'Normal')+' · <b style="color:'+(t.status==='done'?'#1a7f37':'#DA1017')+'">'+(t.status==='done'?'Done':'Open')+'</b></div>'+
      /* The attendance task's own description just repeats "go and review it in Attendance", which the
         inline panel now makes redundant — so it is suppressed in favour of the real figures. */
      /* Once a panel is showing the real figures the task's own description just repeats
         "go and open X to review it", so it is suppressed for those types. */
      ((t.description && !isAtt && !isSpec)?'<div style="font-size:13px;background:#f6f7f9;border-radius:8px;padding:10px;white-space:pre-line">'+esc(t.description)+'</div>':'')+
      clHtml+
      (isDaily?'<div id="tdDaily" style="font-size:13px;color:#888;margin-top:10px">Loading entry…</div>':'')+
      (isAtt?'<div id="tdAtt" style="font-size:13px;color:#888;margin-top:10px">Loading attendance…</div>':'')+
      (isSpec?'<div id="tdSpec" style="font-size:13px;color:#888;margin-top:10px">Loading details…</div>':'')+
      ((isDaily||isDep||isAtt||isLeave)?'<div style="margin-top:10px"><label style="font-size:12px;color:#666;display:block;margin-bottom:3px">Notes</label>'+
        '<textarea id="tdNote" rows="2" placeholder="Optional note — required as the reason if you Reject" style="width:100%;border:1px solid #d9d9d9;border-radius:8px;padding:8px;font-size:13px"></textarea></div>':'')+
      '<div style="font-size:11px;color:#aaa;margin-top:10px">'+(t.source==='assigned'?('Assigned by '+esc(t.assignedByName||'manager')):'Created by you · self task')+'</div>';
    var completeLabel=(isDaily||isDep)?(t.status==='done'?'Reopen':'✓ Verify & complete')
      :isAtt?(t.status==='done'?'Reopen':'✓ Approve & complete')
      :isLeave?(t.status==='done'?'Reopen':'✓ Approve')
      :(t.status==='done'?'Reopen':'✓ Complete');
    /* v305: no Reject on a daily-collection task. The accountant files the day and then verifies it,
       so "reject" would mean rejecting her own entry — the honest fix for a wrong figure is to re-file
       that day from Accounts, which overwrites the row and reopens this task. Deposits, attendance and
       leave are filed by somebody else, so they keep their Reject. */
    var rejectBtn=((isDep||isAtt||isLeave)&&t.status!=='done')?'<button class="btn ghost" id="tdReject" style="color:#A32D2D;border-color:#e3b1b1">✕ Reject</button>':'';
    var foot='<button class="btn ghost" onclick="closeModal()">Close</button><button class="btn ghost" id="tdEdit">Edit</button>'+rejectBtn+'<button class="btn" id="tdComplete">'+completeLabel+'</button>';
    openModal(t.title, body, foot);
    document.querySelectorAll('#modalRoot [data-ci]').forEach(function(cb){ cb.onchange=function(){ cl[parseInt(cb.getAttribute('data-ci'),10)].done=cb.checked; var sp=cb.parentNode.querySelector('span'); if(sp) sp.style.cssText=cb.checked?'text-decoration:line-through;color:#999':''; t.checklist=cl; t._pending=true; API.updateTask(t.taskId,{checklist:cl}); }; });
    document.getElementById('tdEdit').onclick=function(){ closeModal(); openTaskForm(t); };
    /* v194: reject a daily-collection entry with a reason — the sender gets a task in their My Tasks */
    var rj=document.getElementById('tdReject'); if(rj) rj.onclick=function(){
      var note=((document.getElementById('tdNote')||{}).value||'').trim();
      if(!note){ toast('Write the reason in the Notes box first, then tap Reject.',true); return; }
      rj.disabled=true;
      /* v262: rejecting an attendance punch marks it absent and leaves the task open with the reason,
         so the employee and the approver both still see it. It is deliberately NOT a silent close. */
      /* v272: leave rejection goes through setLeave, which marks the row rejected, closes the approval
         tasks for every other approver, and raises a "Leave REJECTED" task in the applicant's My Tasks
         carrying this reason. */
      var rp=isAtt?API.setAttendance(t.instanceId,{approvalStatus:'rejected',status:'absent',notes:note})
        :isLeave?API.setLeave(t.instanceId,'reject',note)
        :isDep?API.rejectDeposit(t.instanceId,note):API.rejectDaily(t.instanceId,note);
      rp.then(function(r){ if(r&&r.ok){ closeModal(); toast(isAtt?'Attendance rejected':isDep?'Deposit rejected':isLeave?'Leave rejected — the applicant has been notified':'Entry rejected — the sender has been notified'); if(window.renderMyTasks) window.renderMyTasks(); else paintList(); } else { toast((r&&r.error)||'Could not reject',true); rj.disabled=false; } });
    };
    if(isDaily){
      API.getDaily(t.instanceId).then(function(r){ var box=document.getElementById('tdDaily'); if(!box) return;
        if(r&&r.ok&&r.entry){ box.outerHTML=dailyPanelHtml(r.entry, r.expenses||[], !!r.canVerify, r.files||{}); wireDailyExpenses(t); }
        else { box.textContent=(r&&r.error)||'Could not load entry.'; } });
    }
    if(isAtt){
      API.getAttendance(t.instanceId).then(function(r){ var box=document.getElementById('tdAtt'); if(!box) return;
        if(r&&r.ok&&r.entry){ box.outerHTML=attPanelHtml(r.entry); }
        else { box.textContent=(r&&r.error)||'Could not load the attendance record.'; } });
    }
    if(isSpec){
      API.getTaskDetail(t.taskId).then(function(r){ var box=document.getElementById('tdSpec'); if(!box) return;
        if(r&&r.ok&&r.spec){ box.outerHTML=specPanelHtml(r.spec); }
        /* spec:null means the linked record could not be resolved (an older task, or one whose record
           was deleted). Fall back to the task's own description rather than showing an error. */
        else if(r&&r.ok){ box.outerHTML=t.description
          ? '<div style="font-size:13px;background:#f6f7f9;border-radius:8px;padding:10px;white-space:pre-line;margin-top:10px">'+esc(t.description)+'</div>'
          : '<div style="font-size:12.5px;color:#9aa0a6;margin-top:10px">No linked record for this task.</div>'; }
        else { box.textContent=(r&&r.error)||'Could not load the details.'; } });
    }
    document.getElementById('tdComplete').onclick=function(){
      /* Approving writes approvalStatus=approved on the attendance row. The server then closes EVERY
         "Approve attendance" task for that employee+date (markAttTasksDone_ / markAttTasksDoneForEmpDate_),
         so this button does not need to set the task status itself. */
      if(isAtt && t.status!=='done'){
        var ab=this; ab.disabled=true;
        var an=((document.getElementById('tdNote')||{}).value||'').trim();
        var ap={approvalStatus:'approved'}; if(an) ap.notes=an;
        /* v263: carry the Status dropdown along with the approval — one write, and picking a status
           then closing without approving deliberately discards it. Only sent when it differs from
           what the record already says, so a plain approval does not rewrite the status column. */
        var sel=document.getElementById('tdAttStatus');
        if(sel && sel.value && sel.value!==String(sel.getAttribute('data-was')||'')) ap.status=sel.value;
        API.setAttendance(t.instanceId,ap).then(function(r){
          if(r&&r.ok){ closeModal(); toast('Attendance approved'); if(window.renderMyTasks) window.renderMyTasks(); else paintList(); }
          else { toast((r&&r.error)||'Could not approve',true); ab.disabled=false; }
        });
        return;
      }
      if((isDaily||isDep) && t.status!=='done'){
        var btn=this; btn.disabled=true;
        var vp=isDep?API.verifyDeposit(t.instanceId):API.verifyDaily(t.instanceId);
        vp.then(function(r){ if(r&&r.ok){ closeModal(); toast('Verified & completed'); if(window.renderMyTasks) window.renderMyTasks(); else paintList(); } else { toast((r&&r.error)||'Could not verify',true); btn.disabled=false; } });
        return;
      }
      var ns=t.status==='done'?'open':'done'; t.status=ns; t._pending=true; closeModal(); paintList(); toast(ns==='done'?'Task completed':'Task reopened'); API.setTaskStatus(t.taskId,ns).then(function(){ return API.listMyTasks(); }).then(function(r){ if(r&&r.ok) TASKS=live(r.tasks); paintList(); });
    };
  }

  function openTaskForm(t){
    var editing=!!t; t=t||{priority:'Normal'}; var cl=pc(t);
    var pri=t.priority||'Normal';
    var seg=['Normal','High','Low'].map(function(p){ return '<div class="pseg'+(p===pri?' on':'')+'" data-p="'+p+'">'+p+'</div>'; }).join('');
    function clRows(){ return cl.map(function(it,i){ return '<div style="display:flex;gap:6px;margin-bottom:6px" data-cr="'+i+'"><input class="fld clitem" value="'+esc(it.text)+'" style="flex:1" placeholder="Sub-step"><button class="btn ghost sm" data-rm="'+i+'" type="button">✕</button></div>'; }).join(''); }
    var body='<div class="grid2">'+
      '<div class="field full"><label>Title *</label><input id="tk_title" value="'+esc(t.title||'')+'"></div>'+
      '<div class="field full" id="tk_assignWrap" style="display:none"><label>Assign to</label><select id="tk_assign"></select><div style="font-size:11px;color:#9aa0a6;margin-top:4px">You can assign to anyone below you.</div></div>'+
      '<div class="field"><label>Due date</label><input id="tk_date" type="date" value="'+esc(t.dueDate||'')+'"></div>'+
      '<div class="field"><label>Due time</label><input id="tk_time" type="time" value="'+esc(t.dueTime||'')+'"></div>'+
      '<div class="field full"><label>Priority</label><div class="pseggrp" id="tk_pri">'+seg+'</div><input type="hidden" id="tk_priv" value="'+esc(pri)+'"></div>'+
      '<div class="field full"><label>Notes</label><textarea id="tk_notes" rows="2">'+esc(t.description||'')+'</textarea></div>'+
      '<div class="field full"><label>Checklist (sub-steps)</label><div id="tk_clist">'+clRows()+'</div><button class="btn ghost sm" id="tk_addcl" type="button">+ Add sub-step</button></div>'+
    '</div>';
    openModal(editing?'Edit task':'New Task', body, '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="tk_save">'+(editing?'Save':'Create task')+'</button>');
    document.querySelectorAll('#tk_pri .pseg').forEach(function(s){ s.onclick=function(){ document.querySelectorAll('#tk_pri .pseg').forEach(function(x){x.classList.remove('on');}); s.classList.add('on'); document.getElementById('tk_priv').value=s.getAttribute('data-p'); }; });
    function syncClFromInputs(){ var ins=document.querySelectorAll('#tk_clist .clitem'); var arr=[]; ins.forEach(function(inp,i){ arr.push({text:inp.value, done:(cl[i]&&cl[i].done)||false}); }); cl=arr; }
    function rerenderCl(){ document.getElementById('tk_clist').innerHTML=clRows(); wireCl(); }
    function wireCl(){ document.querySelectorAll('#tk_clist [data-rm]').forEach(function(b){ b.onclick=function(){ syncClFromInputs(); cl.splice(parseInt(b.getAttribute('data-rm'),10),1); rerenderCl(); }; }); }
    wireCl();
    document.getElementById('tk_addcl').onclick=function(){ syncClFromInputs(); cl.push({text:'',done:false}); rerenderCl(); };
    if(!editing){ API.assignableEmployees().then(function(r){ if(r.ok && r.canAssign && (r.employees||[]).length){ var s=document.getElementById('tk_assign'); s.innerHTML='<option value="">Myself</option>'+r.employees.map(function(e){ return '<option value="'+esc(e.EmpID)+'">'+esc(e.FullName)+' ('+esc(e.Role)+(e.Branch&&e.Branch!=='HQ'?' · '+esc(e.Branch):'')+')</option>'; }).join(''); document.getElementById('tk_assignWrap').style.display=''; } }); }
    document.getElementById('tk_save').onclick=function(){
      syncClFromInputs(); var checklist=cl.filter(function(x){return (x.text||'').trim();});
      var data={ title:val('tk_title'), dueDate:val('tk_date'), dueTime:val('tk_time'), priority:document.getElementById('tk_priv').value, description:val('tk_notes'), checklist:checklist };
      var asg=document.getElementById('tk_assign'); if(asg && asg.value) data.assignedToEmpId=asg.value;
      if(!data.title){ toast('Title is required.',true); return; }
      var btn=document.getElementById('tk_save'); btn.disabled=true; btn.innerHTML='<span class="loader"></span>';
      var p=editing?API.updateTask(t.taskId,data):API.createTask(data);
      p.then(function(r){ if(!r.ok){ toast(r.error,true); btn.disabled=false; btn.textContent=editing?'Save':'Create task'; return; } closeModal(); toast(r.offline?'Saved on device — will sync':'Saved'); API.cachedTasks().then(function(c){ if(c){TASKS=live(c);} renderMyTasks(); }); });
    };
  }

  /* ---------- PC Task Monitor ---------- */
  function tbn(id){ var b=((S.meta&&S.meta.branches)||[]).filter(function(x){return String(x.BranchID)===String(id);})[0]; return b?b.BranchName:(id||'—'); }
  function daysAgo(ds){ if(!ds) return ''; var d=new Date(ds+'T00:00'), now=new Date(); now.setHours(0,0,0,0); var n=Math.round((now-d)/86400000); return n<=0?'today':(n+' day'+(n>1?'s':'')); }
  function toMinTM(t){ if(!t) return 0; var p=String(t).split(':'); return (+p[0])*60+(+(p[1]||0)); }
  function lateLabel(item){
    var tdy=todayStr();
    if(item.kind==='task'){ return daysAgo(item.dueDate)+' overdue'; }
    if(item.date<tdy) return daysAgo(item.date)+' late';
    return 'late, not done';
  }
  function renderTaskMonitor(){
    var v=document.getElementById('page-taskmon'), ALLT=[], ALLC=[], FUP=[], FILT='all', EMP='';
    var canPick=S.perms&&S.perms.canViewAll, branches=(S.meta&&S.meta.branches)||[];
    var brOpts='<option value="">All branches</option>'+branches.map(function(b){return '<option value="'+esc(b.BranchID)+'">'+esc(b.BranchName)+'</option>';}).join('');
    v.innerHTML='<div class="page-head"><h1>Follow-ups</h1></div>'+
      '<div id="saOverdue"></div>'+
      '<div id="puOverdue"></div>'+
      '<div id="tmMain">'+
        '<div style="color:#888;font-size:13px;margin:10px 0 12px">Everyone’s overdue tasks &amp; missed scheduled items — call or message the person.</div>'+
        '<div class="tm-filters" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">'+
          (canPick?'<select id="tmBranch" class="greet-select">'+brOpts+'</select>':'')+
          '<select id="tmEmp" class="greet-select"><option value="">All people</option></select>'+
        '</div>'+
        '<div id="tmKpis" class="kpis"></div>'+
        '<div id="tmFilt" class="tmfilt"></div>'+
        '<div class="section-label">Overdue — follow up</div><div id="tmList"></div>'+
      '</div>';
    /* v307: the segmented control is gone. Two of its three tabs — "Processes (stage by stage)" and
       "Activity scorecard" — were views over the CRM/process engine and went with it. What is left is
       the follow-up list, which was always the useful half and never touched processes at all. */
    if(canPick){ var sel=document.getElementById('tmBranch'); if(sel) sel.addEventListener('change',function(){ EMP=''; var e=document.getElementById('tmEmp'); if(e) e.value=''; paint(); }); }
    var esel=document.getElementById('tmEmp'); if(esel) esel.addEventListener('change',function(){ EMP=this.value; paint(); });

    function collect(){
      var tdy=todayStr(), nowMin=new Date().getHours()*60+new Date().getMinutes();
      var br=canPick?((document.getElementById('tmBranch')||{}).value||''):'';
      var items=[];
      ALLT.filter(function(t){
        /* Only genuinely open, genuinely overdue work belongs on the monitor. Anything the owner has
           already closed (any spelling of "done") drops off by itself on the next refresh. */
        if(['done','completed','cancelled','canceled','deleted'].indexOf(String(t.status||'').toLowerCase())>=0) return false;
        if(!t.dueDate || t.dueDate>=tdy) return false;
        if(t.assigneeActive===false) return false;          // staff marked Inactive are never chased
        if(t.pcHidden) return false;                        // e.g. rejected daily cash — branch ↔ Accounts, not PC
        return true;
      }).forEach(function(t){
        if(br && String(t.branchId)!==String(br)) return;
        items.push({kind:'task', id:t.taskId, title:t.title, name:t.assigneeName, phone:t.assigneePhone, branchId:t.branchId,
          empId:t.assignedToEmpId,
          when:(t.dueDate||'')+' '+(t.dueTime||''), sortKey:(t.dueDate||'')+(t.dueTime||'00:00'), dueDate:t.dueDate, dueTime:t.dueTime});
      });
      ALLC.forEach(function(c){
        if(['done','completed','cancelled','canceled','deleted'].indexOf(String(c.status||'').toLowerCase())>=0) return;   // v225: a schedule item the owner already closed must never linger on the monitor (covers stale cache / status variants)
        var endMin=c.endTime?toMinTM(c.endTime):(c.startTime?toMinTM(c.startTime)+30:0);
        var missed=(c.date<tdy) || (c.date===tdy && endMin && endMin<nowMin);
        if(!missed) return;
        if(br && String(c.branchId)!==String(br)) return;
        items.push({kind:'sch', id:c.entryId, title:c.title, name:c.assigneeName, phone:c.assigneePhone, branchId:c.branchId, owner:c.ownerEmpId,
          when:(c.date||'')+' '+(c.startTime||'')+(c.endTime?'–'+c.endTime:''), sortKey:(c.date||'')+(c.startTime||'00:00'), date:c.date, startTime:c.startTime, endTime:c.endTime});
      });
      // Auto follow-ups (daily cash report + attendance) — pinned on top; PC can complete them with a note
      FUP.forEach(function(f){
        if(br && String(f.branchId)!==String(br)) return;
        if(f.kind==='dailycash' && String(tbn(f.branchId)||'').toUpperCase().indexOf('DIGITAL')>=0) return;   // DIGITAL has no daily cash business
        /* v272: leave + training joined daily cash and attendance as auto follow-ups. The kind map
           replaces the old two-way ternary so adding a sixth kind is one line, not another nested ?:. */
        var KMAP={dailycash:'dc', attendance:'att', leave:'lv', training:'tr'};
        items.push({kind:(KMAP[f.kind]||'att'), fu:f, id:f.fuKey, title:f.title, name:f.name, phone:f.phone, branchId:f.branchId,
          when:f.detail||'', sortKey:'0000'+(f.date||''), date:f.date, state:f.state});
      });
      /* v246: a late punch-in is merged into the row of anyone who ALSO has overdue work, so the PC sees
         one line per person instead of two. A late punch with nothing else outstanding keeps its own row.
         Every row here is derived live from current status, so the moment the person completes their task
         the row disappears on the next refresh - the PC does not have to tick it. */
      var lateOf={};
      items.forEach(function(i){ if(i.kind==='att' && i.state==='late' && i.fu && i.fu.empId) lateOf[String(i.fu.empId)]=i.fu; });
      var mergedIds={};
      items.forEach(function(i){ if(i.kind==='att') return; var k=String(i.empId||i.owner||'');
        if(k && lateOf[k]){ i.late=lateOf[k]; mergedIds[k]=1; } });
      /* v254: a late punch-in on its own is NOT chased. Once someone has punched, the arrival is
         recorded, the half-day rule has already applied and their approver has the task — there is
         nothing left for the PC to chase. Late only earns a place here as a badge on someone who
         ALSO has outstanding work, which is what the monitor is for. */
      items=items.filter(function(i){ return !(i.kind==='att' && i.state==='late'); });
      items.sort(function(a,b){ return a.sortKey<b.sortKey?-1:1; });
      return items;
    }
    /* Completed (with a notes popup) works on EVERY monitor row:
       task → marks the task done (note saved as completion note)
       sch  → closes the calendar item
       dc/att follow-ups → stored in PC_Followups as before */
    function openCompleteItem(i){
      if(!i) return;
      var hint = i.kind==='lv' ? 'The decision itself still happens in Leave → Approvals (or by opening the approval task). A request left pending for 24 hours comes back here automatically.'
        : i.kind==='tr' ? 'The lesson still has to be watched and the quiz passed by '+(i.name||'the employee')+' in Training. The row clears itself the moment they pass.'
        : i.kind==='dc' ? 'The entry itself is still verified by Accounts in Accounts → Daily Entry. If an uploaded report stays unverified for 4 hours, or a rejected one is not corrected within 24 hours, it comes back here automatically.'
        : i.kind==='att' ? 'Attendance approval still happens on the Attendance → Approve screen. If a punch stays unapproved for 24 hours it comes back here automatically.'
        : i.kind==='task' ? 'This records that you have informed '+(i.name||'the owner')+' and removes the row from this monitor. The task stays open in their My Tasks until they actually complete it.'
        : 'This records that you chased '+(i.name||'the owner')+' and removes the row from this monitor. The item stays on their calendar until they close it.';
      var body='<div style="font-size:13px;color:#666;margin-bottom:8px"><b>'+esc(i.title)+'</b>'+(i.name?(' · '+esc(i.name)):'')+'</div>'+
        '<div class="field full"><label>Notes (what was done)</label><textarea id="fuNote" class="in" rows="3" placeholder="e.g. Spoke to them — done now"></textarea></div>'+
        '<div style="font-size:11.5px;color:#999;margin-top:6px">'+hint+'</div><div id="fuMsg"></div>';
      openModal('Complete', body, '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="fuDone">✓ Completed</button>');
      document.getElementById('fuDone').onclick=function(){
        var btn=this; btn.disabled=true; btn.innerHTML='<span class="loader"></span>';
        var note=(document.getElementById('fuNote')||{}).value||'';
        function fail(r){ btn.disabled=false; btn.textContent='✓ Completed'; var m=document.getElementById('fuMsg'); if(m) m.innerHTML='<div class="msg error">'+esc((r&&r.error)||'Could not save — check internet.')+'</div>'; }
        function done(){ closeModal(); toast(i.kind==='task'?'Owner informed — removed from monitor':'Marked completed'); paint(); }
        if(i.kind==='task'){
          /* The PC chases people; they do not close other people's work. Marking it here logs the chase
             in PC_Followups under TASK|<taskId> so the row leaves this monitor for good, while the task
             itself stays open with its owner. (Previously this called setTaskStatus, which the server
             rejected with "Not your task" — the PC is neither the assignee nor the creator.) */
          API.completeFollowup({fuKey:'TASK|'+i.id, kind:'task', title:i.title, branchId:i.branchId, empId:i.empId||'', note:note}).then(function(r){
            if(r&&r.ok){ ALLT=ALLT.filter(function(t){ return String(t.taskId)!==String(i.id); }); done(); } else fail(r);
          });
        } else if(i.kind==='sch'){
          /* v246: this used to call updateCalEntry, which the server rejects with "Not authorised for
             this calendar." — calCanManage_ allows only the calendar's owner, an EA acting for a Director,
             or SUPER, and a Process Coordinator is none of those. Same fix the task branch above already
             got: log the chase under SCH|<entryId> so the row leaves the monitor, while the item stays on
             the owner's calendar until the owner closes it themselves. */
          API.completeFollowup({fuKey:'SCH|'+i.id, kind:'sch', title:i.title, branchId:i.branchId, empId:i.owner||'', note:note}).then(function(r){
            if(r&&r.ok){ ALLC=ALLC.filter(function(c){ return String(c.entryId)!==String(i.id); }); done(); } else fail(r);
          });
        } else {
          var f=i.fu||{};
          API.completeFollowup({fuKey:f.fuKey,kind:f.kind,title:f.title,branchId:f.branchId,empId:f.empId,note:note}).then(function(r){
            if(r&&r.ok){ FUP=FUP.filter(function(x){ return String(x.fuKey)!==String(f.fuKey); }); done(); } else fail(r);
          });
        }
      };
    }
    function paint(){
      var base=collect();
      // employee dropdown reflects whoever currently has overdue/missed items (within the chosen branch)
      var esel=document.getElementById('tmEmp');
      if(esel){ var names=[]; base.forEach(function(i){ if(i.name && names.indexOf(i.name)<0) names.push(i.name); }); names.sort();
        if(EMP && names.indexOf(EMP)<0) EMP='';
        esel.innerHTML='<option value="">All people ('+names.length+')</option>'+names.map(function(n){ return '<option value="'+esc(n)+'"'+(n===EMP?' selected':'')+'>'+esc(n)+'</option>'; }).join('');
        esel.value=EMP; }
      var all = EMP ? base.filter(function(i){ return i.name===EMP; }) : base;
      var tasks=all.filter(function(i){return i.kind==='task';}), sch=all.filter(function(i){return i.kind==='sch';});
      var dc=all.filter(function(i){return i.kind==='dc';}), att=all.filter(function(i){return i.kind==='att';});
      var lv=all.filter(function(i){return i.kind==='lv';}), tr=all.filter(function(i){return i.kind==='tr';});
      var staff={}; all.forEach(function(i){ staff[i.name]=1; });
      var lateN=all.filter(function(i){ return i.late || (i.kind==='att' && i.state==='late'); }).length;
      var _k=document.getElementById('tmKpis'); if(!_k) return;   /* v312: navigated away mid-load */
      _k.innerHTML=
        '<div class="kpi" style="background:#fdecec"><div class="n" style="color:#C0392B">'+tasks.length+'</div><div class="l">Overdue tasks</div></div>'+
        '<div class="kpi" style="background:#f1effc"><div class="n" style="color:#6f63d6">'+sch.length+'</div><div class="l">Missed schedule</div></div>'+
        '<div class="kpi" style="background:#fdf0e9"><div class="n" style="color:#993C1D">'+lateN+'</div><div class="l">Late in</div></div>'+
        '<div class="kpi" style="background:#fff7e6"><div class="n" style="color:#b08900">'+Object.keys(staff).length+'</div><div class="l">People to chase</div></div>';
      var fdef=[['all','All ('+all.length+')'],['task','Tasks ('+tasks.length+')'],['sch','Schedule ('+sch.length+')'],['dc','Daily cash ('+dc.length+')'],['att','Attendance ('+att.length+')'],['lv','Leave ('+lv.length+')'],['tr','Training ('+tr.length+')']];
      var _f=document.getElementById('tmFilt'); if(_f) _f.innerHTML=fdef.map(function(f){ return '<button data-f="'+f[0]+'" class="'+(FILT===f[0]?'on':'')+'">'+f[1]+'</button>'; }).join('');
      document.querySelectorAll('#tmFilt button').forEach(function(b){ b.onclick=function(){ FILT=b.getAttribute('data-f'); paint(); }; });
      var BUCK={task:tasks, sch:sch, dc:dc, att:att, lv:lv, tr:tr};
      var list = BUCK[FILT] || all;
      var box=document.getElementById('tmList');
      if(!list.length){ box.innerHTML='<div class="empty">Nothing overdue right now. 🎉</div>'; return; }
      box.innerHTML=list.map(function(i,idx){
        var ph=String(i.phone||'').replace(/\D/g,'');
        var isFu=(i.kind==='dc'||i.kind==='att'||i.kind==='lv'||i.kind==='tr');   // v272: leave + training are follow-ups too
        var msg=encodeURIComponent('Reminder from Nakoda: '+(i.kind==='task'?'please complete your task “'+i.title+'” — it is overdue.'
          :i.kind==='sch'?'please attend/close your scheduled item “'+i.title+'” — it is overdue.'
          :i.kind==='dc'?(i.state==='verify'?'the daily cash report is waiting for verification ('+i.title+').'
            :i.state==='reject'?'the daily cash report was rejected and is still not corrected ('+i.title+'). Please re-upload it.'
            :'please enter the daily cash report — '+i.title+'.')
          :i.kind==='lv'?(i.state==='unmarked'?'an approved leave is not showing on attendance ('+i.title+'). Please correct it.'
            :'a leave request is still waiting for your decision ('+i.title+'). Please approve or reject it.')
          :i.kind==='tr'?('your training “'+String(i.title||'').replace(/^Training overdue — /,'')+'” is overdue. Please finish the video and quiz.')
          :i.state==='late'?('you punched in late today ('+String(i.title||'').replace(/^Punched in late - /,'')+'). Please be on time.')
          :'please punch in your attendance — it is past your shift start.'));
        var chip=i.kind==='task'?'<span class="tm-chip task">TASK</span>'
                :i.kind==='sch'?'<span class="tm-chip sch">SCHEDULE</span>'
                :i.kind==='dc'?'<span class="tm-chip dc">DAILY CASH</span>'
                :i.kind==='lv'?'<span class="tm-chip lvc">LEAVE</span>'
                :i.kind==='tr'?'<span class="tm-chip trc">TRAINING</span>':'<span class="tm-chip attc">ATTENDANCE</span>';
        if(isFu && i.state==='verify') chip+=' <span class="tm-chip ver">VERIFY OVERDUE</span>';
        if(i.kind==='dc' && i.state==='reject') chip+=' <span class="tm-chip ver">NOT RE-UPLOADED</span>';
        if(i.kind==='lv' && i.state==='unmarked') chip+=' <span class="tm-chip ver">NOT ON ATTENDANCE</span>';
        if(i.kind==='tr' && i.state==='escalated') chip+=' <span class="tm-chip ver">ESCALATED</span>';
        if(isFu && i.state==='late') chip+=' <span class="tm-chip late">LATE IN</span>';
        if(i.late) chip+=' <span class="tm-chip late">LATE IN '+esc(i.late.lateAt||'')+' · '+esc(String(i.late.lateMin||''))+'m</span>';
        return '<div class="tm-row">'+
          '<div class="tm-av">'+esc(initials(i.name))+'</div>'+
          '<div class="tm-mid"><div class="tm-nm"><b>'+esc(i.name)+'</b><span class="tm-brn">'+esc(tbn(i.branchId))+'</span>'+chip+(ph?'<span class="tm-ph">📞 '+esc(i.phone)+'</span>':'')+'</div>'+
          '<div class="tm-it">'+esc(i.title)+' · '+esc(String(i.when||'').trim())+(isFu?'':' · <span class="tm-late">'+esc(lateLabel(i))+'</span>')+'</div></div>'+
          '<div class="tm-acts">'+
            (ph?('<a href="tel:'+ph+'" class="tm-call">📞 <span>Call</span></a><a href="https://wa.me/91'+ph+'?text='+msg+'" target="_blank" class="tm-wa">💬 <span>WhatsApp</span></a>'):'<span style="font-size:10px;color:#aaa">No phone</span>')+
            '<button class="tm-donebtn" data-di="'+idx+'">✓ <span>Completed</span></button>'+
          '</div></div>';
      }).join('');
      box.querySelectorAll('[data-di]').forEach(function(b){ b.onclick=function(){ openCompleteItem(list[parseInt(b.getAttribute('data-di'),10)]); }; });
    }
    /* v307: renderScorecard removed — the Activity scorecard counted calls and meetings logged
       across CRM pipelines, and those pipelines no longer exist. */
    /* Cache-first paint, then refresh from the server — unchanged from v306. */
    Promise.all([API.cachedAllTasks(),API.cachedAllCalendar(),API.cachedFollowups()]).then(function(a){ if(a[0]) ALLT=a[0]; if(a[1]) ALLC=a[1]; if(a[2]) FUP=a[2]; if((a[0]&&a[0].length)||(a[1]&&a[1].length)||(a[2]&&a[2].length)) paint(); else { var _l=document.getElementById('tmList'); if(_l) _l.innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>'; } });
    API.listAllTasks().then(function(r){ if(r.ok){ ALLT=r.tasks||[]; paint(); } });
    API.listAllCalendar().then(function(r){ if(r.ok){ ALLC=r.entries||[]; paint(); } });
    API.pcFollowups().then(function(r){ if(r.ok){ FUP=r.items||[]; paint(); } });
  }

  /* ============================================================================================
     v311 — RESTORING THE EXPORTS v307 DELETED.

     THE BUG. v306 ended this file with three exports. v307 removed them and nothing put them back:

         window.renderMyTasks = renderMyTasks;
         window.openTaskDetail = openTaskDetail;
         window.taskShared = { ... };

     The functions themselves were never deleted — only the lines that published them. And because
     every caller in app.js guards with `if(window.taskShared)` / `if(window.renderMyTasks)`, nothing
     ever threw. It failed silently, which is why it survived four releases:

       * app.js `go('tasks')` reads `if(page==='tasks' && window.renderMyTasks) window.renderMyTasks();`
         — undefined, so opening My Tasks un-hid an EMPTY div. The page has been blank since v307.
       * The dashboard task click reads `if(window.taskShared) taskShared.open(...) else go('tasks')`
         — so tapping ANY task (leave, approval, daily collection, anything) fell through to the blank
         page. "I click the task and it shows blank", for every task type.
       * `dtItems()` reads `if(!S) return tasks;` and `renderDashTasks` falls back to
         `String(t.status)==='done'?'done':'today'` — so the dashboard tiles put EVERY open task in
         Today and showed Overdue 0, while the KPI strip underneath, which counts independently, said
         "My overdue 12". Those two numbers disagreeing on the same screen was the visible symptom.

     Restored verbatim from v306. Every symbol they reference still exists in this file untouched.
     ============================================================================================ */
  window.renderMyTasks=renderMyTasks;
  window.openTaskDetail=openTaskDetail;
  /* v262: the dashboard "My tasks" block reuses THIS file's logic rather than reimplementing it, so
     the two can never disagree about what is overdue. */
  window.taskShared={
    calToItem:calToItem,      // calendar entry -> task-shaped item
    dedup:dedupTasks,         // same de-duplication
    bucket:bucket,            // today | overdue | upcoming | done | nr
    dueLabel:dueLabel,        // "Today 09:52" / "28 Jul"
    pri:PRI,                  // priority dot colours
    /* Open the same popup from the dashboard. TASKS/CALITEMS are empty until this page has been
       visited, so byId() would find nothing — seed them from the dashboard's own copy first.
       Harmless to overwrite: renderMyTasks() re-fetches whenever the page is opened. */
    open:function(taskId, tasks, calEntries){
      TASKS=(tasks||[]).slice();
      CALITEMS=(calEntries||[]).filter(function(x){ return String(x.status)!=='deleted'; }).map(calToItem);
      if(String(taskId).indexOf('CAL::')===0){
        var it=byId(taskId);
        if(it && window.openCalendarEntryById){ window.openCalendarEntryById(it.calId, function(){ if(window.renderDashTasks) window.renderDashTasks(); }); return; }
      }
      openTaskDetail(taskId);
    }
  };
  window.renderTaskMonitor=function(){ renderTaskMonitor(); try{ if(window.renderSAOverdue) window.renderSAOverdue(document.getElementById('saOverdue')); }catch(e){}
    try{ if(window.renderPUOverdue) window.renderPUOverdue(document.getElementById('puOverdue')); }catch(e){} };
})();
