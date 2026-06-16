/* Nakoda MIS — My Tasks (self source for now). Loads after app.js; reuses globals. */
(function(){
  var TASKS=[], FILTER='today';
  var PRI={High:'#C0392B',Normal:'#1A8AC2',Low:'#9aa0a6'};

  function pc(t){ try{ return Array.isArray(t.checklist)?t.checklist:JSON.parse(t.checklist||'[]'); }catch(e){ return []; } }
  function todayStr(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function dueLabel(t){
    if(!t.dueDate) return t.dueTime?('Today '+t.dueTime):'No date';
    var d=new Date(t.dueDate+'T00:00'), tdy=todayStr();
    var nm=(t.dueDate===tdy)?'Today':(d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}));
    return nm+(t.dueTime?(' '+t.dueTime):'');
  }
  function bucket(t){
    if(String(t.status)==='done') return 'done';
    var tdy=todayStr();
    if(t.dueDate && t.dueDate<tdy) return 'overdue';
    if(t.dueDate && t.dueDate>tdy) return 'upcoming';
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
  }
  function paintChips(){
    var defs=[['today','Today'],['upcoming','Upcoming'],['overdue','Overdue'],['done','Done'],['all','All']];
    document.getElementById('taskChips').innerHTML=defs.map(function(d){
      var on=FILTER===d[0];
      var n=d[0]==='all'?TASKS.filter(function(t){return t.status!=='deleted';}).length:TASKS.filter(function(t){return bucket(t)===d[0];}).length;
      return '<button class="tchip'+(on?' on':'')+'" data-f="'+d[0]+'">'+d[1]+' <span style="opacity:.7">'+n+'</span></button>';
    }).join('');
    document.querySelectorAll('#taskChips .tchip').forEach(function(b){ b.onclick=function(){ FILTER=b.getAttribute('data-f'); paintChips(); paintList(); }; });
  }
  function paintList(){
    paintChips();
    var box=document.getElementById('taskList');
    var list=TASKS.filter(function(t){ if(t.status==='deleted') return false; return FILTER==='all'?true:bucket(t)===FILTER; });
    list.sort(function(a,b){ return (a.dueDate||'9999')+(a.dueTime||'')>(b.dueDate||'9999')+(b.dueTime||'')?1:-1; });
    if(!list.length){ box.innerHTML='<div class="empty">No tasks here. Tap “+ Add task”.</div>'; return; }
    box.innerHTML=list.map(function(t){
      var done=t.status==='done', cl=pc(t), cldone=cl.filter(function(x){return x.done;}).length;
      var over=bucket(t)==='overdue';
      return '<div class="tcard'+(done?' tdone':'')+'" data-id="'+esc(t.taskId)+'">'+
        '<span class="tbox'+(done?' on':'')+'" data-tog="'+esc(t.taskId)+'"></span>'+
        '<div class="tbody">'+
          '<div class="ttitle">'+esc(t.title)+pend(t)+'</div>'+
          '<div class="tmeta"><span class="pdot" style="background:'+(PRI[t.priority]||'#999')+'"></span>'+
            '<span'+(over?' style="color:#C0392B;font-weight:600"':'')+'>'+esc(dueLabel(t))+'</span> · '+esc(t.priority||'Normal')+
            (cl.length?(' · ☑ '+cldone+'/'+cl.length):'')+'</div>'+
        '</div></div>';
    }).join('');
    box.querySelectorAll('.tcard').forEach(function(el){ el.onclick=function(ev){ if(ev.target.getAttribute('data-tog')) return; openTaskDetail(el.getAttribute('data-id')); }; });
    box.querySelectorAll('[data-tog]').forEach(function(b){ b.onclick=function(ev){ ev.stopPropagation(); toggleDone(b.getAttribute('data-tog')); }; });
  }
  function pend(t){ return t._pending?' <span class="badge pending">syncing</span>':''; }
  function byId(id){ return TASKS.filter(function(t){return String(t.taskId)===String(id);})[0]; }

  function toggleDone(id){ var t=byId(id); if(!t) return; var ns=t.status==='done'?'open':'done'; t.status=ns; t._pending=true; paintList(); API.setTaskStatus(id,ns).then(function(){ API.cachedTasks().then(function(c){ if(c){TASKS=c; paintList();} }); }); }

  function openTaskDetail(id){
    var t=byId(id); if(!t) return; var cl=pc(t);
    var clHtml=cl.length?('<div style="background:#f6f7f9;border-radius:8px;padding:10px;margin-top:10px">'+cl.map(function(it,i){
      return '<label style="display:flex;align-items:flex-start;gap:9px;padding:4px 0;font-size:13px;cursor:pointer"><input type="checkbox" data-ci="'+i+'"'+(it.done?' checked':'')+' style="transform:scale(1.2);margin-top:2px"><span'+(it.done?' style="text-decoration:line-through;color:#999"':'')+'>'+esc(it.text)+'</span></label>';
    }).join('')+'</div>'):'';
    var body='<div style="font-size:13px;color:#8a8f98;margin-bottom:8px"><span class="pdot" style="background:'+(PRI[t.priority]||'#999')+'"></span> Due '+esc(dueLabel(t))+' · '+esc(t.priority||'Normal')+' · <b style="color:'+(t.status==='done'?'#1a7f37':'#DA1017')+'">'+(t.status==='done'?'Done':'Open')+'</b></div>'+
      (t.description?'<div style="font-size:13px;background:#f6f7f9;border-radius:8px;padding:10px;white-space:pre-line">'+esc(t.description)+'</div>':'')+
      clHtml+
      '<div style="font-size:11px;color:#aaa;margin-top:10px">Created by you · self task</div>';
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
    document.getElementById('tk_save').onclick=function(){
      syncClFromInputs(); var checklist=cl.filter(function(x){return (x.text||'').trim();});
      var data={ title:val('tk_title'), dueDate:val('tk_date'), dueTime:val('tk_time'), priority:document.getElementById('tk_priv').value, description:val('tk_notes'), checklist:checklist };
      if(!data.title){ toast('Title is required.',true); return; }
      var btn=document.getElementById('tk_save'); btn.disabled=true; btn.innerHTML='<span class="loader"></span>';
      var p=editing?API.updateTask(t.taskId,data):API.createTask(data);
      p.then(function(r){ if(!r.ok){ toast(r.error,true); btn.disabled=false; btn.textContent=editing?'Save':'Create task'; return; } closeModal(); toast(r.offline?'Saved on device — will sync':'Saved'); API.cachedTasks().then(function(c){ if(c){TASKS=c;} renderMyTasks(); }); });
    };
  }

  window.renderMyTasks=renderMyTasks;
  window.openTaskDetail=openTaskDetail;
})();
