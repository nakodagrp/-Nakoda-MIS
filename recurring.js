/* Nakoda MIS — Recurring Tasks (Director / EA). Templates that auto-spawn into My Tasks. */
(function(){
  var RECS=[], EMPS=[];
  var DOWS=[['1','Mon'],['2','Tue'],['3','Wed'],['4','Thu'],['5','Fri'],['6','Sat'],['0','Sun']];
  var MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function roles(){ var s={}; EMPS.forEach(function(e){ if(e.Role && String(e.Status)==='Active') s[e.Role]=1; }); return Object.keys(s).sort(); }
  function freqText(r){
    if(r.freq==='daily') return 'Every day';
    if(r.freq==='weekly'){ var ds=String(r.weekdays||'').split(',').filter(Boolean).map(function(d){ var x=DOWS.filter(function(z){return z[0]===d;})[0]; return x?x[1]:d; }); return 'Every '+(ds.join(', ')||'week'); }
    if(r.freq==='monthly') return (String(r.monthDay)==='last'?'Last day':ord(r.monthDay))+' of every month';
    if(r.freq==='yearly') return ord(r.monthDay)+' '+(MONTHS[(+r.yearMonth)-1]||'')+' every year';
    return r.freq;
  }
  function ord(n){ n=+n; var s=['th','st','nd','rd'], v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }
  function targetText(r){ return r.targetType==='person' ? ((r.empName||r.empId)+' — '+r.role) : ('All '+r.role+'s'); }
  function clCount(r){ try{ var a=JSON.parse(r.checklist||'[]'); return a.length; }catch(e){ return 0; } }

  function renderRecurring(){
    var v=document.getElementById('page-recurring');
    v.innerHTML='<div class="page-head"><h1>Recurring Tasks</h1><div class="spacer"></div><button class="btn" id="recAdd">+ New recurring</button></div>'+
      '<div style="color:#888;font-size:13px;margin-bottom:12px">Set once — the system drops it into the right person’s My Tasks each time it’s due. New staff in a role are included automatically. The PC monitors them.</div>'+
      '<div id="recList"></div>';
    document.getElementById('recAdd').onclick=function(){ openRecurForm(null); };
    API.cachedEmployees().then(function(e){ if(e) EMPS=e; });
    API.listEmployees().then(function(r){ if(r.ok) EMPS=r.employees||EMPS; });
    API.cachedRecurring().then(function(x){ if(x&&x.length){ RECS=x; paint(); } else document.getElementById('recList').innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>'; });
    API.listRecurring().then(function(r){ if(r.ok){ RECS=r.recurring||[]; paint(); } else document.getElementById('recList').innerHTML='<div class="empty">'+esc(r.error||'Could not load')+'</div>'; });
  }
  function paint(){
    var box=document.getElementById('recList'); if(!box) return;
    if(!RECS.length){ box.innerHTML='<div class="empty">No recurring tasks yet. Tap “+ New recurring”.</div>'; return; }
    box.innerHTML=RECS.map(function(r){
      var on=String(r.active)==='yes', cl=clCount(r);
      return '<div class="rec-row" data-id="'+esc(r.recurId)+'">'+
        '<div class="rec-ic">🔁</div>'+
        '<div class="rec-mid"><div class="rec-t">'+esc(r.title)+
          ' <span class="rec-tag '+(r.targetType==='person'?'person':'role')+'">'+(r.targetType==='person'?'SPECIFIC PERSON':'WHOLE ROLE')+'</span></div>'+
          '<div class="rec-m">'+esc(targetText(r))+' · '+esc(freqText(r))+(r.dueTime?(' · '+esc(r.dueTime)):'')+(cl?(' · ☑ '+cl):'')+'</div></div>'+
        '<span class="rec-sw'+(on?'':' off')+'" data-tog="'+esc(r.recurId)+'"></span></div>';
    }).join('');
    box.querySelectorAll('.rec-row').forEach(function(el){ el.onclick=function(ev){ if(ev.target.getAttribute('data-tog')) return; var r=byId(el.getAttribute('data-id')); if(r) openRecurForm(r); }; });
    box.querySelectorAll('[data-tog]').forEach(function(b){ b.onclick=function(ev){ ev.stopPropagation(); var r=byId(b.getAttribute('data-tog')); var na=String(r.active)==='yes'?'no':'yes'; r.active=na; paint(); API.setRecurringActive(r.recurId,na); }; });
  }
  function byId(id){ return RECS.filter(function(r){return String(r.recurId)===String(id);})[0]; }

  /* ---------- form ---------- */
  var rcl=[];
  function clRows(){ return rcl.length?rcl.map(function(it,i){ return '<div class="ce-cl-row" data-cr="'+i+'"><input type="checkbox" data-cd="'+i+'"'+(it.done?' checked':'')+' style="visibility:hidden"><input class="ce-cl-text in" data-ct="'+i+'" value="'+esc(it.text||'')+'" placeholder="Sub-step"><button type="button" class="ce-cl-rm" data-rm="'+i+'">✕</button></div>'; }).join(''):'<div class="muted" style="font-size:12px">No sub-steps.</div>'; }
  function syncCl(){ var b=document.getElementById('rcClist'); if(!b) return; rcl=[].slice.call(b.querySelectorAll('.ce-cl-row')).map(function(row){ return {text:((row.querySelector('.ce-cl-text')||{}).value||'').trim(),done:false}; }); }
  function reCl(){ var b=document.getElementById('rcClist'); if(b){ b.innerHTML=clRows(); wireCl(); } }
  function wireCl(){ var b=document.getElementById('rcClist'); if(!b) return; b.querySelectorAll('[data-rm]').forEach(function(x){ x.onclick=function(){ syncCl(); rcl.splice(+x.getAttribute('data-rm'),1); reCl(); }; }); }

  function openRecurForm(r){
    var ed=!!r; r=r||{};
    rcl=(function(){ try{ var a=JSON.parse(r.checklist||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; } })();
    var tt=r.targetType||'role', fq=r.freq||'daily';
    var roleOpts=roles().map(function(x){ return '<option'+(x===r.role?' selected':'')+'>'+esc(x)+'</option>'; }).join('');
    var monthDayOpts=function(sel){ var o='<option value="last"'+(String(sel)==='last'?' selected':'')+'>Last day</option>'; for(var i=1;i<=31;i++) o+='<option value="'+i+'"'+(String(sel)===String(i)?' selected':'')+'>'+ord(i)+'</option>'; return o; };
    var monthOpts=MONTHS.map(function(m,i){ return '<option value="'+(i+1)+'"'+((+r.yearMonth)===(i+1)?' selected':'')+'>'+m+'</option>'; }).join('');
    var wk=String(r.weekdays||'').split(',');
    var body=
      '<div class="grid2">'+
        '<div class="field full"><label>Title *</label><input id="rcTitle" class="in" value="'+esc(r.title||'')+'" placeholder="e.g. File TDS return"></div>'+
        '<div class="field full"><label>Assign to</label><div class="seg rseg" id="rcTarget"><div data-t="role"'+(tt==='role'?' class="on"':'')+'>Whole role (all holders)</div><div data-t="person"'+(tt==='person'?' class="on"':'')+'>A specific person</div></div></div>'+
        '<div class="field"><label>Role</label><select id="rcRole" class="in">'+roleOpts+'</select></div>'+
        '<div class="field" id="rcPersonWrap"><label>Person</label><select id="rcPerson" class="in"></select></div>'+
        '<div class="field full"><label>Repeats</label><div class="seg rseg" id="rcFreq">'+
          ['daily','weekly','monthly','yearly'].map(function(f){ return '<div data-f="'+f+'"'+(fq===f?' class="on"':'')+'>'+f.charAt(0).toUpperCase()+f.slice(1)+'</div>'; }).join('')+'</div></div>'+
        '<div class="field full" id="rcWeekWrap"><label>On these days</label><div class="chiprow" id="rcWeek">'+DOWS.map(function(d){ return '<span class="dchip'+(wk.indexOf(d[0])>=0?' on':'')+'" data-d="'+d[0]+'">'+d[1]+'</span>'; }).join('')+'</div></div>'+
        '<div class="field" id="rcMonthWrap"><label>Day of month</label><select id="rcMonthDay" class="in">'+monthDayOpts(r.monthDay||'1')+'</select></div>'+
        '<div class="field" id="rcYearMonthWrap"><label>Month</label><select id="rcYearMonth" class="in">'+monthOpts+'</select></div>'+
        '<div class="field"><label>Time</label><input id="rcTime" class="in" type="time" value="'+esc(r.dueTime||'09:00')+'"></div>'+
        '<div class="field"><label>Priority</label><select id="rcPriority" class="in">'+['High','Normal','Low'].map(function(p){ return '<option'+((r.priority||'Normal')===p?' selected':'')+'>'+p+'</option>'; }).join('')+'</select></div>'+
        '<div class="field full"><label>Checklist (sub-steps)</label><div id="rcClist">'+clRows()+'</div><button type="button" class="btn ghost sm" id="rcAddCl" style="margin-top:6px">+ Add sub-step</button></div>'+
      '</div>'+
      '<div class="hint" style="background:#f1effc;border-radius:9px;padding:9px 11px;font-size:11.5px;color:#5046b8">🔁 Whole role = every current holder, plus any new staff added to that role later. PC sees overdue ones in Process Flow Monitor.</div>'+
      '<div id="rcMsg"></div>';
    var foot=(ed?'<button class="btn ghost sm" id="rcDel" style="color:var(--red)">Delete</button>':'')+'<button class="btn" id="rcSave">'+(ed?'Save':'Create')+'</button>';
    openModal(ed?'Edit recurring task':'New recurring task', body, foot);

    function fillPersons(){ var role=document.getElementById('rcRole').value; var sel=document.getElementById('rcPerson'); var list=EMPS.filter(function(e){ return String(e.Role)===String(role) && String(e.Status)==='Active'; }); sel.innerHTML=list.map(function(e){ return '<option value="'+esc(e.EmpID)+'"'+(String(e.EmpID)===String(r.empId)?' selected':'')+'>'+esc(e.FullName)+'</option>'; }).join('')||'<option value="">(no one in this role)</option>'; }
    function vis(){
      var tt2=document.querySelector('#rcTarget .on').getAttribute('data-t');
      var fq2=document.querySelector('#rcFreq .on').getAttribute('data-f');
      document.getElementById('rcPersonWrap').style.display=tt2==='person'?'':'none';
      document.getElementById('rcWeekWrap').style.display=fq2==='weekly'?'':'none';
      document.getElementById('rcMonthWrap').style.display=(fq2==='monthly'||fq2==='yearly')?'':'none';
      document.getElementById('rcYearMonthWrap').style.display=fq2==='yearly'?'':'none';
    }
    fillPersons(); vis(); wireCl();
    document.getElementById('rcRole').onchange=fillPersons;
    document.getElementById('rcAddCl').onclick=function(){ syncCl(); rcl.push({text:''}); reCl(); };
    document.querySelectorAll('#rcTarget div').forEach(function(d){ d.onclick=function(){ document.querySelectorAll('#rcTarget div').forEach(function(z){z.classList.remove('on');}); d.classList.add('on'); vis(); }; });
    document.querySelectorAll('#rcFreq div').forEach(function(d){ d.onclick=function(){ document.querySelectorAll('#rcFreq div').forEach(function(z){z.classList.remove('on');}); d.classList.add('on'); vis(); }; });
    document.querySelectorAll('#rcWeek .dchip').forEach(function(c){ c.onclick=function(){ c.classList.toggle('on'); }; });
    document.getElementById('rcSave').onclick=function(){
      var title=document.getElementById('rcTitle').value.trim(); if(!title){ msg('Title is required.'); return; }
      var tt2=document.querySelector('#rcTarget .on').getAttribute('data-t');
      var fq2=document.querySelector('#rcFreq .on').getAttribute('data-f');
      if(fq2==='weekly' && !document.querySelectorAll('#rcWeek .dchip.on').length){ msg('Pick at least one weekday.'); return; }
      syncCl();
      var data={ recurId:r.recurId, title:title, description:'', priority:document.getElementById('rcPriority').value,
        dueTime:document.getElementById('rcTime').value, targetType:tt2, role:document.getElementById('rcRole').value,
        empId:tt2==='person'?document.getElementById('rcPerson').value:'', freq:fq2,
        weekdays:[].slice.call(document.querySelectorAll('#rcWeek .dchip.on')).map(function(c){return c.getAttribute('data-d');}).join(','),
        monthDay:document.getElementById('rcMonthDay').value, yearMonth:document.getElementById('rcYearMonth').value,
        checklist:JSON.stringify(rcl.filter(function(x){return x.text;})), active:(r.active===undefined?true:String(r.active)==='yes') };
      this.disabled=true; this.textContent='Saving…';
      API.saveRecurring(data).then(function(res){ if(res&&res.ok){ closeModal(); toast('Recurring task saved'); renderRecurring(); } else { msg((res&&res.error)||'Failed'); } });
    };
    if(ed){ document.getElementById('rcDel').onclick=function(){ if(!confirm('Delete this recurring task? Existing tasks already created stay.')) return; API.setRecurringActive(r.recurId,'deleted').then(function(){ closeModal(); toast('Deleted'); renderRecurring(); }); }; }
    function msg(m){ document.getElementById('rcMsg').innerHTML='<div class="msg error">'+esc(m)+'</div>'; }
  }

  window.renderRecurring=renderRecurring;
})();
