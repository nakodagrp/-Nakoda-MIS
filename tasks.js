/* Nakoda MIS — My Tasks. EA/admin can switch the 'Viewing' owner to see a Director's tasks. Loads after app.js; reuses globals. */
(function(){
  var TASKS=[], CALITEMS=[], DELEG=[], FILTER='today';
  var VIEW_OWNER=null, OWNER_NAME='', TARGETS=[];   // EA/admin can view another person's (e.g. Director's) tasks
  var PRI={High:'#C0392B',Normal:'#1A8AC2',Low:'#9aa0a6'};
  function meId(){ return S.user&&S.user.EmpID; }
  function calToItem(e){ return { taskId:'CAL::'+e.entryId, calId:e.entryId, isCal:true, source:'calendar', title:e.title, dueDate:e.date, dueTime:e.startTime, endTime:e.endTime, priority:'', status:(String(e.status)==='done'?'done':'open'), checklist:(e.checklist||'[]') }; }
  function combined(){ return TASKS.concat(CALITEMS); }

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
      API.cachedTasks().then(function(t){ if(t&&t.length){ TASKS=t; paintList(); } else { var b=document.getElementById('taskList'); if(b) b.innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>'; } });
      API.listMyTasks().then(function(r){ if(r.ok){ TASKS=r.tasks||[]; paintList(); } });
      API.cachedCalendar(owner).then(function(e){ if(e){ CALITEMS=e.filter(function(x){return String(x.status)!=='deleted';}).map(calToItem); paintList(); } });
      API.listCalendar(owner).then(function(r){ if(r&&r.ok){ CALITEMS=(r.entries||[]).map(calToItem); paintList(); } });
      API.listAssignedByMe().then(function(r){ if(r&&r.ok){ DELEG=(r.tasks||[]).map(function(t){ t.isDeleg=true; return t; }); paintList(); } });
    } else {
      TASKS=[]; CALITEMS=[]; var b=document.getElementById('taskList'); if(b) b.innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>';
      API.cachedTasksFor(owner).then(function(t){ if(t&&t.length){ TASKS=t; paintList(); } });
      API.listTasksFor(owner).then(function(r){ if(r&&r.ok){ TASKS=r.tasks||[]; paintList(); } });
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
      if(key==='process') return t.source==='process' && t.status!=='done';
      return false; }).length;
  }
  function paintChips(){
    var ALL=dedupTasks(combined());
    var defs=[['today','Today'],['upcoming','Upcoming'],['overdue','Overdue'],['done','Done'],['all','All'],
              ['me','Assigned to me'],['others','Assigned to others'],['recurring','Recurring'],['calendar','Calendar'],['process','Process']];
    document.getElementById('taskChips').innerHTML=defs.map(function(d){
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
    var src=(FILTER==='others')?DELEG:combined();
    var list=dedupTasks(src.filter(function(t){ if(t.status==='deleted') return false;
      switch(FILTER){
        case 'all': case 'others': return true;
        case 'today': case 'upcoming': case 'overdue': case 'done': return bucket(t)===FILTER;
        case 'me': return t.source==='assigned'||t.source==='training';
        case 'recurring': return t.source==='recurring' && t.status!=='done';
        case 'calendar': return t.isCal;
        case 'process': return t.source==='process' && t.status!=='done';
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
              :(t.source==='salescrm'?'<span style="background:#fff0f0;color:#C0392B;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">🎯 Sales CRM</span>'
              :(t.source==='process'?'<span style="background:#eafaf3;color:#1aa37a;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">📁 CRM stage</span>'
              :(t.source==='attendance'?'<span style="background:#fdeaea;color:#a3271f;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">🕒 Attendance</span>'
              :(t.source==='leave'?'<span style="background:#eef7ee;color:#1a7f37;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">🌴 Leave</span>'
              :(t.source==='nrlead'?'<span style="background:#fff4e8;color:#c47f00;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">↻ Not responding</span>'
              :(t.source==='assigned'?'<span style="background:#eef2ff;color:#4253c5;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">Assigned by '+esc(t.assignedByName||'manager')+'</span>':''))))))));
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
      if(tk && tk.source==='salescrm' && tk.instanceId && window.openSalesLead){ window.openSalesLead(tk.instanceId, function(){ if(window.renderMyTasks) window.renderMyTasks(); }); return; }
      if(tk && (tk.source==='process'||tk.source==='nrlead') && tk.instanceId && window.openProcessInstance){ window.openProcessInstance(tk.instanceId, function(){ if(window.renderMyTasks) window.renderMyTasks(); }); return; }
      openTaskDetail(id); }; });
    box.querySelectorAll('[data-tog]').forEach(function(b){ b.onclick=function(ev){ ev.stopPropagation(); toggleDone(b.getAttribute('data-tog')); }; });
  }
  function pend(t){ return t._pending?' <span class="badge pending">syncing</span>':''; }
  function byId(id){ return combined().concat(DELEG).filter(function(t){return String(t.taskId)===String(id);})[0]; }

  function toggleDone(id){ var t=byId(id); if(!t) return;
    if(t.isCal){ var nc=t.status==='done'?'pending':'done'; t.status=(nc==='done'?'done':'open'); t._pending=true; paintList();
      API.updateCalEntry(t.calId,{status:nc},curOwner()).then(function(){ API.cachedCalendar(curOwner()).then(function(e){ if(e){ CALITEMS=e.filter(function(x){return String(x.status)!=='deleted';}).map(calToItem); paintList(); } }); }); return; }
    var ns=t.status==='done'?'open':'done'; t.status=ns; t._pending=true; paintList(); API.setTaskStatus(id,ns).then(function(){ return API.listMyTasks(); }).then(function(r){ if(r&&r.ok) TASKS=r.tasks||[]; paintList(); }); }

  function dailyPanelHtml(e){
    function m(n){ return '₹'+Math.round(Number(n)||0).toLocaleString('en-IN'); }
    var b2cCash=Number(e.b2cCash)||0,b2cBank=Number(e.b2cBank)||0,b2dCash=Number(e.b2dCash)||0,b2dBank=Number(e.b2dBank)||0;
    var total=b2cCash+b2cBank+b2dCash+b2dBank;
    var docs=[];
    if(e.b2cDocUrl) docs.push('<a href="'+esc(e.b2cDocUrl)+'" target="_blank" rel="noopener" style="color:var(--red);font-weight:600">📎 B2C document ↗</a>');
    if(e.b2dDocUrl) docs.push('<a href="'+esc(e.b2dDocUrl)+'" target="_blank" rel="noopener" style="color:var(--red);font-weight:600">📎 B2D document ↗</a>');
    if(e.testXlUrl) docs.push('<a href="'+esc(e.testXlUrl)+'" target="_blank" rel="noopener" style="color:var(--red);font-weight:600">📎 Tests Excel ↗</a>');
    return '<div style="border:1px solid var(--line);border-radius:10px;padding:11px;margin-top:10px">'+
      '<div style="font-weight:700;font-size:12.5px;margin-bottom:8px">'+esc(e.branchName||e.branchId||'')+' · '+esc(e.date||'')+(String(e.status)==='verified'?' · <span style="color:#1a7f37">verified</span>':'')+'</div>'+
      '<table style="width:100%;font-size:13px;border-collapse:collapse">'+
      '<tr><td style="color:#888;padding:3px 0">B2C — Cash</td><td style="text-align:right">'+m(b2cCash)+'</td><td style="color:#888;text-align:right;padding-left:10px">Bank/UPI</td><td style="text-align:right">'+m(b2cBank)+'</td></tr>'+
      '<tr><td style="color:#888;padding:3px 0">B2D — Cash</td><td style="text-align:right">'+m(b2dCash)+'</td><td style="color:#888;text-align:right;padding-left:10px">Bank/UPI</td><td style="text-align:right">'+m(b2dBank)+'</td></tr>'+
      '<tr><td style="color:#888;padding:3px 0">Patients</td><td style="text-align:right">'+(Number(e.patients)||0)+'</td><td style="color:#888;text-align:right;padding-left:10px">Tests</td><td style="text-align:right">'+(Number(e.tests)||0)+'</td></tr>'+
      '</table>'+
      '<div style="display:flex;justify-content:space-between;border-top:1px solid var(--line);margin-top:7px;padding-top:7px;font-weight:700"><span>Total business</span><span style="color:#1a7f37">'+m(total)+'</span></div>'+
      '<div style="margin-top:10px;font-size:13px;display:flex;flex-direction:column;gap:6px">'+(docs.length?docs.join(''):'<span style="color:#999">No documents attached</span>')+'</div>'+
      '</div>';
  }
  function openTaskDetail(id){
    var t=byId(id); if(!t) return; var cl=pc(t);
    var isDaily=(t.source==='accounts' && t.instanceId);
    var clHtml=cl.length?('<div style="background:#f6f7f9;border-radius:8px;padding:10px;margin-top:10px">'+cl.map(function(it,i){
      return '<label style="display:flex;align-items:flex-start;gap:9px;padding:4px 0;font-size:13px;cursor:pointer"><input type="checkbox" data-ci="'+i+'"'+(it.done?' checked':'')+' style="transform:scale(1.2);margin-top:2px"><span'+(it.done?' style="text-decoration:line-through;color:#999"':'')+'>'+esc(it.text)+'</span></label>';
    }).join('')+'</div>'):'';
    var body='<div style="font-size:13px;color:#8a8f98;margin-bottom:8px"><span class="pdot" style="background:'+(PRI[t.priority]||'#999')+'"></span> Due '+esc(dueLabel(t))+' · '+esc(t.priority||'Normal')+' · <b style="color:'+(t.status==='done'?'#1a7f37':'#DA1017')+'">'+(t.status==='done'?'Done':'Open')+'</b></div>'+
      (t.description?'<div style="font-size:13px;background:#f6f7f9;border-radius:8px;padding:10px;white-space:pre-line">'+esc(t.description)+'</div>':'')+
      clHtml+
      (isDaily?'<div id="tdDaily" style="font-size:13px;color:#888;margin-top:10px">Loading entry…</div>'+
        '<div style="margin-top:10px"><label style="font-size:12px;color:#666;display:block;margin-bottom:3px">Notes</label>'+
        '<textarea id="tdNote" rows="2" placeholder="Optional note — required as the reason if you Reject" style="width:100%;border:1px solid #d9d9d9;border-radius:8px;padding:8px;font-size:13px"></textarea></div>':'')+
      '<div style="font-size:11px;color:#aaa;margin-top:10px">'+(t.source==='assigned'?('Assigned by '+esc(t.assignedByName||'manager')):'Created by you · self task')+'</div>';
    var completeLabel=isDaily?(t.status==='done'?'Reopen':'✓ Verify & complete'):(t.status==='done'?'Reopen':'✓ Complete');
    var rejectBtn=(isDaily&&t.status!=='done')?'<button class="btn ghost" id="tdReject" style="color:#A32D2D;border-color:#e3b1b1">✕ Reject</button>':'';
    var foot='<button class="btn ghost" onclick="closeModal()">Close</button><button class="btn ghost" id="tdEdit">Edit</button>'+rejectBtn+'<button class="btn" id="tdComplete">'+completeLabel+'</button>';
    openModal(t.title, body, foot);
    document.querySelectorAll('#modalRoot [data-ci]').forEach(function(cb){ cb.onchange=function(){ cl[parseInt(cb.getAttribute('data-ci'),10)].done=cb.checked; var sp=cb.parentNode.querySelector('span'); if(sp) sp.style.cssText=cb.checked?'text-decoration:line-through;color:#999':''; t.checklist=cl; t._pending=true; API.updateTask(t.taskId,{checklist:cl}); }; });
    document.getElementById('tdEdit').onclick=function(){ closeModal(); openTaskForm(t); };
    /* v194: reject a daily-collection entry with a reason — the sender gets a task in their My Tasks */
    var rj=document.getElementById('tdReject'); if(rj) rj.onclick=function(){
      var note=((document.getElementById('tdNote')||{}).value||'').trim();
      if(!note){ toast('Write the reason in the Notes box first, then tap Reject.',true); return; }
      rj.disabled=true;
      API.rejectDaily(t.instanceId,note).then(function(r){ if(r&&r.ok){ closeModal(); toast('Entry rejected — the sender has been notified'); if(window.renderMyTasks) window.renderMyTasks(); else paintList(); } else { toast((r&&r.error)||'Could not reject',true); rj.disabled=false; } });
    };
    if(isDaily){
      API.getDaily(t.instanceId).then(function(r){ var box=document.getElementById('tdDaily'); if(!box) return; if(r&&r.ok&&r.entry){ box.outerHTML=dailyPanelHtml(r.entry); } else { box.textContent=(r&&r.error)||'Could not load entry.'; } });
    }
    document.getElementById('tdComplete').onclick=function(){
      if(isDaily && t.status!=='done'){
        var btn=this; btn.disabled=true;
        API.verifyDaily(t.instanceId).then(function(r){ if(r&&r.ok){ closeModal(); toast('Verified & completed'); if(window.renderMyTasks) window.renderMyTasks(); else paintList(); } else { toast((r&&r.error)||'Could not verify',true); btn.disabled=false; } });
        return;
      }
      var ns=t.status==='done'?'open':'done'; t.status=ns; t._pending=true; closeModal(); paintList(); toast(ns==='done'?'Task completed':'Task reopened'); API.setTaskStatus(t.taskId,ns).then(function(){ return API.listMyTasks(); }).then(function(r){ if(r&&r.ok) TASKS=r.tasks||[]; paintList(); });
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
      p.then(function(r){ if(!r.ok){ toast(r.error,true); btn.disabled=false; btn.textContent=editing?'Save':'Create task'; return; } closeModal(); toast(r.offline?'Saved on device — will sync':'Saved'); API.cachedTasks().then(function(c){ if(c){TASKS=c;} renderMyTasks(); }); });
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
    v.innerHTML='<div class="page-head"><h1>Process Flow Monitor</h1></div>'+
      '<div class="seg tm-seg" id="tmSeg"><div data-v="tasks" class="on">Tasks &amp; Schedule</div><div data-v="proc">Processes (stage by stage)</div><div data-v="score">Activity scorecard</div></div>'+
      '<div id="tmMain">'+
        '<div style="color:#888;font-size:13px;margin:10px 0 12px">Everyone’s overdue tasks &amp; missed scheduled items — call or message the person.</div>'+
        '<div class="tm-filters" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">'+
          (canPick?'<select id="tmBranch" class="greet-select">'+brOpts+'</select>':'')+
          '<select id="tmEmp" class="greet-select"><option value="">All people</option></select>'+
        '</div>'+
        '<div id="tmKpis" class="kpis"></div>'+
        '<div id="tmFilt" class="tmfilt"></div>'+
        '<div class="section-label">Overdue — follow up</div><div id="tmList"></div>'+
      '</div>'+
      '<div id="tmProc" class="hidden"></div>'+
      '<div id="tmScore" class="hidden"></div>';
    var procLoaded=false, scoreLoaded=false;
    document.querySelectorAll('#tmSeg div').forEach(function(d){ d.onclick=function(){ document.querySelectorAll('#tmSeg div').forEach(function(z){z.classList.remove('on');}); d.classList.add('on'); var v=d.getAttribute('data-v');
      document.getElementById('tmMain').classList.toggle('hidden',v!=='tasks'); document.getElementById('tmProc').classList.toggle('hidden',v!=='proc'); document.getElementById('tmScore').classList.toggle('hidden',v!=='score');
      if(v==='proc' && !procLoaded && window.renderProcessGridInto){ procLoaded=true; window.renderProcessGridInto(document.getElementById('tmProc')); }
      if(v==='score' && !scoreLoaded){ scoreLoaded=true; renderScorecard(document.getElementById('tmScore')); } }; });
    if(canPick){ var sel=document.getElementById('tmBranch'); if(sel) sel.addEventListener('change',function(){ EMP=''; var e=document.getElementById('tmEmp'); if(e) e.value=''; paint(); }); }
    var esel=document.getElementById('tmEmp'); if(esel) esel.addEventListener('change',function(){ EMP=this.value; paint(); });

    function collect(){
      var tdy=todayStr(), nowMin=new Date().getHours()*60+new Date().getMinutes();
      var br=canPick?((document.getElementById('tmBranch')||{}).value||''):'';
      var items=[];
      ALLT.filter(function(t){return t.status!=='done' && t.dueDate && t.dueDate<tdy;}).forEach(function(t){
        if(br && String(t.branchId)!==String(br)) return;
        items.push({kind:'task', id:t.taskId, title:t.title, name:t.assigneeName, phone:t.assigneePhone, branchId:t.branchId,
          when:(t.dueDate||'')+' '+(t.dueTime||''), sortKey:(t.dueDate||'')+(t.dueTime||'00:00'), dueDate:t.dueDate, dueTime:t.dueTime});
      });
      ALLC.forEach(function(c){
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
        items.push({kind:(f.kind==='dailycash'?'dc':'att'), fu:f, id:f.fuKey, title:f.title, name:f.name, phone:f.phone, branchId:f.branchId,
          when:f.detail||'', sortKey:'0000'+(f.date||''), date:f.date, state:f.state});
      });
      items.sort(function(a,b){ return a.sortKey<b.sortKey?-1:1; });
      return items;
    }
    /* Completed (with a notes popup) works on EVERY monitor row:
       task → marks the task done (note saved as completion note)
       sch  → closes the calendar item
       dc/att follow-ups → stored in PC_Followups as before */
    function openCompleteItem(i){
      if(!i) return;
      var hint = i.kind==='dc' ? 'The entry itself is still verified by Accounts in Accounts → Daily Entry. If an uploaded report stays unverified for 3 hours it comes back here automatically.'
        : i.kind==='att' ? 'Attendance approval still happens on the Attendance → Approve screen. If a punch stays unapproved for 24 hours it comes back here automatically.'
        : i.kind==='task' ? 'This marks the task itself as done — it also disappears from the assignee’s My Tasks.'
        : 'This closes the scheduled item on the owner’s calendar.';
      var body='<div style="font-size:13px;color:#666;margin-bottom:8px"><b>'+esc(i.title)+'</b>'+(i.name?(' · '+esc(i.name)):'')+'</div>'+
        '<div class="field full"><label>Notes (what was done)</label><textarea id="fuNote" class="in" rows="3" placeholder="e.g. Spoke to them — done now"></textarea></div>'+
        '<div style="font-size:11.5px;color:#999;margin-top:6px">'+hint+'</div><div id="fuMsg"></div>';
      openModal('Complete', body, '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="fuDone">✓ Completed</button>');
      document.getElementById('fuDone').onclick=function(){
        var btn=this; btn.disabled=true; btn.innerHTML='<span class="loader"></span>';
        var note=(document.getElementById('fuNote')||{}).value||'';
        function fail(r){ btn.disabled=false; btn.textContent='✓ Completed'; var m=document.getElementById('fuMsg'); if(m) m.innerHTML='<div class="msg error">'+esc((r&&r.error)||'Could not save — check internet.')+'</div>'; }
        function done(){ closeModal(); toast('Marked completed'); paint(); }
        if(i.kind==='task'){
          API.setTaskStatus(i.id,'done',note).then(function(r){ if(r&&(r.ok||r.offline)){ ALLT=ALLT.filter(function(t){ return String(t.taskId)!==String(i.id); }); done(); } else fail(r); });
        } else if(i.kind==='sch'){
          API.updateCalEntry(i.id,{status:'done'},i.owner).then(function(r){ if(r&&(r.ok||r.offline)){ ALLC=ALLC.filter(function(c){ return String(c.entryId)!==String(i.id); }); done(); } else fail(r); });
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
      var staff={}; all.forEach(function(i){ staff[i.name]=1; });
      document.getElementById('tmKpis').innerHTML=
        '<div class="kpi" style="background:#fdecec"><div class="n" style="color:#C0392B">'+tasks.length+'</div><div class="l">Overdue tasks</div></div>'+
        '<div class="kpi" style="background:#f1effc"><div class="n" style="color:#6f63d6">'+sch.length+'</div><div class="l">Missed schedule</div></div>'+
        '<div class="kpi" style="background:#fff7e6"><div class="n" style="color:#b08900">'+Object.keys(staff).length+'</div><div class="l">People to chase</div></div>';
      var fdef=[['all','All ('+all.length+')'],['task','Tasks ('+tasks.length+')'],['sch','Schedule ('+sch.length+')'],['dc','Daily cash ('+dc.length+')'],['att','Attendance ('+att.length+')']];
      document.getElementById('tmFilt').innerHTML=fdef.map(function(f){ return '<button data-f="'+f[0]+'" class="'+(FILT===f[0]?'on':'')+'">'+f[1]+'</button>'; }).join('');
      document.querySelectorAll('#tmFilt button').forEach(function(b){ b.onclick=function(){ FILT=b.getAttribute('data-f'); paint(); }; });
      var list = FILT==='task'?tasks : FILT==='sch'?sch : FILT==='dc'?dc : FILT==='att'?att : all;
      var box=document.getElementById('tmList');
      if(!list.length){ box.innerHTML='<div class="empty">Nothing overdue right now. 🎉</div>'; return; }
      box.innerHTML=list.map(function(i,idx){
        var ph=String(i.phone||'').replace(/\D/g,'');
        var isFu=(i.kind==='dc'||i.kind==='att');
        var msg=encodeURIComponent('Reminder from Nakoda: '+(i.kind==='task'?'please complete your task “'+i.title+'” — it is overdue.'
          :i.kind==='sch'?'please attend/close your scheduled item “'+i.title+'” — it is overdue.'
          :i.kind==='dc'?(i.state==='verify'?'the daily cash report is waiting for verification ('+i.title+').':'please enter the daily cash report — '+i.title+'.')
          :'please punch in your attendance — it is past your shift start.'));
        var chip=i.kind==='task'?'<span class="tm-chip task">TASK</span>'
                :i.kind==='sch'?'<span class="tm-chip sch">SCHEDULE</span>'
                :i.kind==='dc'?'<span class="tm-chip dc">DAILY CASH</span>':'<span class="tm-chip attc">ATTENDANCE</span>';
        if(isFu && i.state==='verify') chip+=' <span class="tm-chip ver">VERIFY OVERDUE</span>';
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
    function renderScorecard(box){
      var d0=new Date(); d0.setDate(d0.getDate()-30);
      var from=d0.getFullYear()+'-'+String(d0.getMonth()+1).padStart(2,'0')+'-'+String(d0.getDate()).padStart(2,'0');
      box.innerHTML='<div style="color:#888;font-size:13px;margin:10px 0 12px">Calls &amp; meetings each person logged across all CRM pipelines, in the chosen period.</div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">'+
          '<label style="font-size:12px;color:#666">From <input type="date" id="scFrom" class="greet-select" value="'+from+'"></label>'+
          '<label style="font-size:12px;color:#666">To <input type="date" id="scTo" class="greet-select" value="'+todayStr()+'"></label>'+
          '<button class="btn ghost sm" id="scGo">Apply</button>'+
        '</div><div id="scBody"><div class="center-load"><span class="loader dark"></span> Loading…</div></div>';
      function load(){
        var f=(document.getElementById('scFrom')||{}).value||'', t=(document.getElementById('scTo')||{}).value||'';
        document.getElementById('scBody').innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>';
        API.activityScorecard(f,t).then(function(r){
          var b=document.getElementById('scBody'); if(!b) return;
          if(!r||!r.ok){ b.innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; return; }
          var rows=r.rows||[]; if(!rows.length){ b.innerHTML='<div class="empty">No activity logged in this period.</div>'; return; }
          var tc=0,tm=0,tt=0; rows.forEach(function(x){ tc+=x.calls; tm+=x.meetings; tt+=x.total; });
          b.innerHTML='<div class="kpis">'+
              '<div class="kpi" style="background:#fdecec"><div class="n" style="color:#C0392B">'+tc+'</div><div class="l">Calls</div></div>'+
              '<div class="kpi" style="background:#eef6ff"><div class="n" style="color:#2563c9">'+tm+'</div><div class="l">Meetings</div></div>'+
              '<div class="kpi" style="background:#f1effc"><div class="n" style="color:#6f63d6">'+tt+'</div><div class="l">Total touches</div></div></div>'+
            '<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:13px">'+
              '<thead><tr style="text-align:left;color:#888;border-bottom:1px solid #eee"><th style="padding:7px">Person</th><th>Branch</th><th style="text-align:center">Calls</th><th style="text-align:center">Meetings</th><th style="text-align:center">Other</th><th style="text-align:center">Total</th></tr></thead><tbody>'+
              rows.map(function(x){ return '<tr style="border-bottom:1px solid #f3f3f3"><td style="padding:7px"><b>'+esc(x.name)+'</b><div style="font-size:11px;color:#999">'+esc(x.role)+'</div></td><td>'+esc(tbn(x.branch))+'</td><td style="text-align:center">'+x.calls+'</td><td style="text-align:center">'+x.meetings+'</td><td style="text-align:center">'+x.other+'</td><td style="text-align:center"><b>'+x.total+'</b></td></tr>'; }).join('')+
              '</tbody></table>';
        });
      }
      var g=document.getElementById('scGo'); if(g) g.onclick=load; load();
    }
    Promise.all([API.cachedAllTasks(),API.cachedAllCalendar(),API.cachedFollowups()]).then(function(a){ if(a[0]) ALLT=a[0]; if(a[1]) ALLC=a[1]; if(a[2]) FUP=a[2]; if((a[0]&&a[0].length)||(a[1]&&a[1].length)||(a[2]&&a[2].length)) paint(); else document.getElementById('tmList').innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>'; });
    API.listAllTasks().then(function(r){ if(r.ok){ ALLT=r.tasks||[]; paint(); } });
    API.listAllCalendar().then(function(r){ if(r.ok){ ALLC=r.entries||[]; paint(); } });
    API.pcFollowups().then(function(r){ if(r.ok){ FUP=r.items||[]; paint(); } });
  }

  window.renderMyTasks=renderMyTasks;
  window.openTaskDetail=openTaskDetail;
  window.renderTaskMonitor=renderTaskMonitor;
})();
