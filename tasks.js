/* Nakoda MIS — My Tasks (self source for now). Loads after app.js; reuses globals. */
(function(){
  var TASKS=[], CALITEMS=[], FILTER='today';
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
    var tdy=todayStr(), ds=dd10(t);
    if(ds && ds<tdy) return 'overdue';
    if(ds && ds>tdy) return 'upcoming';
    return 'today';
  }

  function renderMyTasks(){
    var v=document.getElementById('page-tasks');
    v.innerHTML='<div class="page-head"><h1>My Tasks</h1><div class="spacer"></div><button class="btn" id="addTaskBtn">+ Add task</button></div>'+
      '<div id="taskChips" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px"></div>'+
      '<div id="taskList"></div>';
    document.getElementById('addTaskBtn').onclick=function(){ openTaskForm(null); };
    paintChips();
    API.cachedTasks().then(function(t){ if(t&&t.length){ TASKS=t; paintList(); } else { document.getElementById('taskList').innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>'; } });
    API.listMyTasks().then(function(r){ if(r.ok){ TASKS=r.tasks||[]; paintList(); } });
    var mid=meId();
    API.cachedCalendar(mid).then(function(e){ if(e){ CALITEMS=e.filter(function(x){return String(x.status)!=='deleted';}).map(calToItem); paintList(); } });
    API.listCalendar(mid).then(function(r){ if(r&&r.ok){ CALITEMS=(r.entries||[]).map(calToItem); paintList(); } });
  }
  function paintChips(){
    var ALL=combined();
    var defs=[['today','Today'],['upcoming','Upcoming'],['overdue','Overdue'],['done','Done'],['all','All']];
    document.getElementById('taskChips').innerHTML=defs.map(function(d){
      var on=FILTER===d[0];
      var n=d[0]==='all'?ALL.filter(function(t){return t.status!=='deleted';}).length:ALL.filter(function(t){return bucket(t)===d[0];}).length;
      return '<button class="tchip'+(on?' on':'')+'" data-f="'+d[0]+'">'+d[1]+' <span style="opacity:.7">'+n+'</span></button>';
    }).join('');
    document.querySelectorAll('#taskChips .tchip').forEach(function(b){ b.onclick=function(){ FILTER=b.getAttribute('data-f'); paintChips(); paintList(); }; });
  }
  function paintList(){
    paintChips();
    var box=document.getElementById('taskList');
    var list=combined().filter(function(t){ if(t.status==='deleted') return false; return FILTER==='all'?true:bucket(t)===FILTER; });
    list.sort(function(a,b){ return (a.dueDate||'9999')+(a.dueTime||'')>(b.dueDate||'9999')+(b.dueTime||'')?1:-1; });
    if(!list.length){ box.innerHTML='<div class="empty">No tasks here. Tap “+ Add task”.</div>'; return; }
    box.innerHTML=list.map(function(t){
      var done=t.status==='done', cl=pc(t), cldone=cl.filter(function(x){return x.done;}).length;
      var over=bucket(t)==='overdue';
      var tag=t.isCal?'<span style="background:#ECEAFB;color:#5046b8;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">📅 Meeting / Calendar</span>'
              :(t.source==='recurring'?'<span style="background:#ECEAFB;color:#5046b8;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">🔁 Recurring</span>'
              :(t.source==='process'?'<span style="background:#eafaf3;color:#1aa37a;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">📁 CRM stage</span>'
              :(t.source==='assigned'?'<span style="background:#eef2ff;color:#4253c5;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">Assigned by '+esc(t.assignedByName||'manager')+'</span>':'')));
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
      if(tk && tk.source==='process' && tk.instanceId && window.openProcessInstance){ window.openProcessInstance(tk.instanceId, function(){ if(window.renderMyTasks) window.renderMyTasks(); }); return; }
      openTaskDetail(id); }; });
    box.querySelectorAll('[data-tog]').forEach(function(b){ b.onclick=function(ev){ ev.stopPropagation(); toggleDone(b.getAttribute('data-tog')); }; });
  }
  function pend(t){ return t._pending?' <span class="badge pending">syncing</span>':''; }
  function byId(id){ return combined().filter(function(t){return String(t.taskId)===String(id);})[0]; }

  function toggleDone(id){ var t=byId(id); if(!t) return;
    if(t.isCal){ var nc=t.status==='done'?'pending':'done'; t.status=(nc==='done'?'done':'open'); t._pending=true; paintList();
      API.updateCalEntry(t.calId,{status:nc},meId()).then(function(){ API.cachedCalendar(meId()).then(function(e){ if(e){ CALITEMS=e.filter(function(x){return String(x.status)!=='deleted';}).map(calToItem); paintList(); } }); }); return; }
    var ns=t.status==='done'?'open':'done'; t.status=ns; t._pending=true; paintList(); API.setTaskStatus(id,ns).then(function(){ API.cachedTasks().then(function(c){ if(c){TASKS=c; paintList();} }); }); }

  function openTaskDetail(id){
    var t=byId(id); if(!t) return; var cl=pc(t);
    var clHtml=cl.length?('<div style="background:#f6f7f9;border-radius:8px;padding:10px;margin-top:10px">'+cl.map(function(it,i){
      return '<label style="display:flex;align-items:flex-start;gap:9px;padding:4px 0;font-size:13px;cursor:pointer"><input type="checkbox" data-ci="'+i+'"'+(it.done?' checked':'')+' style="transform:scale(1.2);margin-top:2px"><span'+(it.done?' style="text-decoration:line-through;color:#999"':'')+'>'+esc(it.text)+'</span></label>';
    }).join('')+'</div>'):'';
    var body='<div style="font-size:13px;color:#8a8f98;margin-bottom:8px"><span class="pdot" style="background:'+(PRI[t.priority]||'#999')+'"></span> Due '+esc(dueLabel(t))+' · '+esc(t.priority||'Normal')+' · <b style="color:'+(t.status==='done'?'#1a7f37':'#DA1017')+'">'+(t.status==='done'?'Done':'Open')+'</b></div>'+
      (t.description?'<div style="font-size:13px;background:#f6f7f9;border-radius:8px;padding:10px;white-space:pre-line">'+esc(t.description)+'</div>':'')+
      clHtml+
      '<div style="font-size:11px;color:#aaa;margin-top:10px">'+(t.source==='assigned'?('Assigned by '+esc(t.assignedByName||'manager')):'Created by you · self task')+'</div>';
    var foot='<button class="btn ghost" onclick="closeModal()">Close</button><button class="btn ghost" id="tdEdit">Edit</button><button class="btn" id="tdComplete">'+(t.status==='done'?'Reopen':'✓ Complete')+'</button>';
    openModal(t.title, body, foot);
    document.querySelectorAll('#modalRoot [data-ci]').forEach(function(cb){ cb.onchange=function(){ cl[parseInt(cb.getAttribute('data-ci'),10)].done=cb.checked; var sp=cb.parentNode.querySelector('span'); if(sp) sp.style.cssText=cb.checked?'text-decoration:line-through;color:#999':''; t.checklist=cl; t._pending=true; API.updateTask(t.taskId,{checklist:cl}); }; });
    document.getElementById('tdEdit').onclick=function(){ closeModal(); openTaskForm(t); };
    document.getElementById('tdComplete').onclick=function(){ var ns=t.status==='done'?'open':'done'; t.status=ns; t._pending=true; API.setTaskStatus(t.taskId,ns).then(function(){ API.cachedTasks().then(function(c){ if(c)TASKS=c; }); }); closeModal(); paintList(); toast(ns==='done'?'Task completed':'Task reopened'); };
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
    var v=document.getElementById('page-taskmon'), ALLT=[], ALLC=[], FILT='all', EMP='';
    var canPick=S.perms&&S.perms.canViewAll, branches=(S.meta&&S.meta.branches)||[];
    var brOpts='<option value="">All branches</option>'+branches.map(function(b){return '<option value="'+esc(b.BranchID)+'">'+esc(b.BranchName)+'</option>';}).join('');
    v.innerHTML='<div class="page-head"><h1>Process Flow Monitor</h1></div>'+
      '<div class="seg tm-seg" id="tmSeg"><div data-v="tasks" class="on">Tasks &amp; Schedule</div><div data-v="proc">Processes (stage by stage)</div></div>'+
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
      '<div id="tmProc" class="hidden"></div>';
    var procLoaded=false;
    document.querySelectorAll('#tmSeg div').forEach(function(d){ d.onclick=function(){ document.querySelectorAll('#tmSeg div').forEach(function(z){z.classList.remove('on');}); d.classList.add('on'); var pv=d.getAttribute('data-v')==='proc';
      document.getElementById('tmMain').classList.toggle('hidden',pv); document.getElementById('tmProc').classList.toggle('hidden',!pv);
      if(pv && !procLoaded && window.renderProcessGridInto){ procLoaded=true; window.renderProcessGridInto(document.getElementById('tmProc')); } }; });
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
        items.push({kind:'sch', id:c.entryId, title:c.title, name:c.assigneeName, phone:c.assigneePhone, branchId:c.branchId,
          when:(c.date||'')+' '+(c.startTime||'')+(c.endTime?'–'+c.endTime:''), sortKey:(c.date||'')+(c.startTime||'00:00'), date:c.date, startTime:c.startTime, endTime:c.endTime});
      });
      items.sort(function(a,b){ return a.sortKey<b.sortKey?-1:1; });
      return items;
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
      var staff={}; all.forEach(function(i){ staff[i.name]=1; });
      document.getElementById('tmKpis').innerHTML=
        '<div class="kpi" style="background:#fdecec"><div class="n" style="color:#C0392B">'+tasks.length+'</div><div class="l">Overdue tasks</div></div>'+
        '<div class="kpi" style="background:#f1effc"><div class="n" style="color:#6f63d6">'+sch.length+'</div><div class="l">Missed schedule</div></div>'+
        '<div class="kpi" style="background:#fff7e6"><div class="n" style="color:#b08900">'+Object.keys(staff).length+'</div><div class="l">People to chase</div></div>';
      var fdef=[['all','All ('+all.length+')'],['task','Tasks ('+tasks.length+')'],['sch','Schedule ('+sch.length+')']];
      document.getElementById('tmFilt').innerHTML=fdef.map(function(f){ return '<button data-f="'+f[0]+'" class="'+(FILT===f[0]?'on':'')+'">'+f[1]+'</button>'; }).join('');
      document.querySelectorAll('#tmFilt button').forEach(function(b){ b.onclick=function(){ FILT=b.getAttribute('data-f'); paint(); }; });
      var list = FILT==='task'?tasks : FILT==='sch'?sch : all;
      var box=document.getElementById('tmList');
      if(!list.length){ box.innerHTML='<div class="empty">Nothing overdue right now. 🎉</div>'; return; }
      box.innerHTML=list.map(function(i){
        var ph=String(i.phone||'').replace(/\D/g,'');
        var msg=encodeURIComponent('Reminder from Nakoda: please '+(i.kind==='task'?'complete your task':'attend/close your scheduled item')+' “'+i.title+'” — it is overdue.');
        var chip=i.kind==='task'?'<span class="tm-chip task">TASK</span>':'<span class="tm-chip sch">SCHEDULE</span>';
        return '<div class="tm-row">'+
          '<div class="tm-av">'+esc(initials(i.name))+'</div>'+
          '<div class="tm-mid"><div class="tm-nm"><b>'+esc(i.name)+'</b><span class="tm-brn">'+esc(tbn(i.branchId))+'</span>'+chip+'</div>'+
          '<div class="tm-it">'+esc(i.title)+' · '+esc(i.when.trim())+' · <span class="tm-late">'+esc(lateLabel(i))+'</span></div></div>'+
          '<div class="tm-acts">'+
            (ph?('<a href="tel:'+ph+'" class="tm-call">📞 <span>Call</span></a><a href="https://wa.me/91'+ph+'?text='+msg+'" target="_blank" class="tm-wa">💬 <span>WhatsApp</span></a>'):'<span style="font-size:10px;color:#aaa">No phone</span>')+
          '</div></div>';
      }).join('');
    }
    Promise.all([API.cachedAllTasks(),API.cachedAllCalendar()]).then(function(a){ if(a[0]) ALLT=a[0]; if(a[1]) ALLC=a[1]; if((a[0]&&a[0].length)||(a[1]&&a[1].length)) paint(); else document.getElementById('tmList').innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>'; });
    API.listAllTasks().then(function(r){ if(r.ok){ ALLT=r.tasks||[]; paint(); } });
    API.listAllCalendar().then(function(r){ if(r.ok){ ALLC=r.entries||[]; paint(); } });
  }

  window.renderMyTasks=renderMyTasks;
  window.openTaskDetail=openTaskDetail;
  window.renderTaskMonitor=renderTaskMonitor;
})();
