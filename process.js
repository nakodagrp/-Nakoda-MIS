/* Nakoda MIS — Process Engine (CRM). Pipelines run on Processes/Stages/Edges/Instances/Steps. */
(function(){
  function optList(opts){ return String(opts||'').split(',').filter(Boolean).map(function(o){ return '<option>'+esc(o.trim())+'</option>'; }).join(''); }
  function empOpts(emps,sel){ return (emps||[]).filter(function(e){ return String(e.Status)==='Active'; }).map(function(e){ return '<option value="'+esc(e.EmpID)+'"'+(String(e.EmpID)===String(sel||'')?' selected':'')+'>'+esc(e.FullName)+' ('+esc(e.Role)+')</option>'; }).join(''); }
  function inputFor(f,pfx){ var id=pfx+f.fieldId;
    if(f.fieldType==='dropdown') return '<select id="'+id+'" class="in"><option value=""></option>'+optList(f.options)+'</select>';
    if(f.fieldType==='number') return '<input id="'+id+'" class="in" type="number">';
    if(f.fieldType==='date') return '<input id="'+id+'" class="in" type="date">';
    if(f.fieldType==='checklist') return '<div id="'+id+'" class="proc-ck">'+String(f.options||'').split(',').filter(Boolean).map(function(o){ return '<label><input type="checkbox" value="'+esc(o.trim())+'"> '+esc(o.trim())+'</label>'; }).join('')+'</div>';
    return '<input id="'+id+'" class="in">';
  }
  function fieldsHtml(fields,pfx){ return (fields||[]).map(function(f){ return '<div class="field full"><label>'+esc(f.label)+(f.required?' *':'')+'</label>'+inputFor(f,pfx)+'</div>'; }).join(''); }
  function collectFields(fields,pfx){ var o={}; (fields||[]).forEach(function(f){ var el=document.getElementById(pfx+f.fieldId); if(!el) return; if(f.fieldType==='checklist'){ o[f.label]=[].slice.call(el.querySelectorAll('input:checked')).map(function(c){return c.value;}); } else { o[f.label]=el.value; } }); return o; }

  /* ---------- CRM home ---------- */
  function renderCRM(){
    var v=document.getElementById('page-crm');
    v.innerHTML='<div class="page-head"><h1>CRM</h1></div>'+
      '<div style="color:#888;font-size:13px;margin-bottom:12px">Every relationship is a process. Tap a pipeline to work it. The PC monitors every stage.</div>'+
      '<div id="crmList"></div>';
    API.listEmployees();
    API.cachedProcesses().then(function(p){ if(p&&p.length) paintProcs(p); else document.getElementById('crmList').innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>'; });
    API.listProcesses().then(function(r){ if(r.ok) paintProcs(r.processes); else document.getElementById('crmList').innerHTML='<div class="empty">'+esc(r.error||'')+'</div>'; });
  }
  function paintProcs(list){
    var box=document.getElementById('crmList'); if(!box) return;
    if(!list.length){ box.innerHTML='<div class="empty">No pipelines available.</div>'; return; }
    box.innerHTML=list.map(function(p){ return '<div class="crm-tile" data-pid="'+esc(p.processId)+'"><div class="crm-ic">📁</div>'+
      '<div class="crm-mid"><b>'+esc(p.name)+'</b><div class="crm-sub">Owner: '+esc(p.ownerRole)+'</div>'+
      '<div class="crm-kpi">Open <b>'+p.open+'</b> · Due today <b>'+p.dueToday+'</b> · Overdue <b style="color:#DA1017">'+p.overdue+'</b></div></div>'+
      '<span class="crm-go">›</span></div>'; }).join('');
    box.querySelectorAll('.crm-tile').forEach(function(el){ el.onclick=function(){ openPipeline(el.getAttribute('data-pid')); }; });
  }

  /* ---------- pipeline board ---------- */
  function openPipeline(pid){
    var v=document.getElementById('page-crm'); var DEF=null;
    v.innerHTML='<div class="page-head"><button class="btn ghost sm" id="crmBack">‹ CRM</button> <h1 style="font-size:18px;margin:0 0 0 8px" id="crmTtl">Pipeline</h1><div class="spacer"></div>'+
      '<button class="btn ghost sm" id="crmMon">📋 Monitor</button> <button class="btn" id="crmAdd" style="display:none">+ Add</button></div>'+
      '<div id="crmBoard"></div>';
    document.getElementById('crmBack').onclick=renderCRM;
    document.getElementById('crmMon').onclick=function(){ openMonitor(pid); };
    document.getElementById('crmAdd').onclick=function(){ if(DEF) openStartForm(pid,DEF,load); };
    function paintBoard(r){
      var stages=(r.stages||[]).filter(function(s){ return s.nodeType!=='start'; });
      var byStage={}; (r.instances||[]).forEach(function(i){ (byStage[i.currentStageId]=byStage[i.currentStageId]||[]).push(i); });
      document.getElementById('crmBoard').innerHTML='<div class="crm-cols">'+stages.map(function(s){
        var leads=byStage[s.stageId]||[];
        return '<div class="crm-col"><h4>'+esc(s.name)+' <i>'+leads.length+'</i></h4>'+
          leads.map(function(i){ return '<div class="crm-lead'+(i.late?' late':(i.dueToday?' due':''))+'" data-iid="'+esc(i.instanceId)+'"><b>'+esc(i.leadName)+'</b><div class="cl-m">'+esc(i.assigneeName||'')+(i.dueDate?(' · '+(i.late?'overdue':i.dueDate)):'')+'</div></div>'; }).join('')+
          '</div>';
      }).join('')+'</div>';
      document.querySelectorAll('.crm-lead').forEach(function(el){ el.onclick=function(){ openInstance(el.getAttribute('data-iid'), load); }; });
    }
    function load(){
      API.cachedInstances(pid).then(function(a){ if(a) paintBoard(a); });
      API.getProcess(pid).then(function(d){ if(d&&d.ok){ DEF=d; document.getElementById('crmTtl').textContent=d.process.name; document.getElementById('crmAdd').style.display=d.canStart?'':'none'; } });
      API.listInstances(pid).then(function(r){ if(r&&r.ok) paintBoard(r); });
    }
    load();
  }

  /* ---------- start a lead ---------- */
  function openStartForm(pid,DEF,after){
    var start=(DEF.stages||[]).filter(function(s){return s.nodeType==='start';})[0]||DEF.stages[0];
    API.cachedEmployees().then(function(emps){ emps=emps||[];
      var brs=(S.meta&&S.meta.branches)||[];
      var body='<div class="grid2">'+
        '<div class="field"><label>Name *</label><input id="psName" class="in" placeholder="e.g. Dr. Shah"></div>'+
        '<div class="field"><label>Mobile</label><input id="psMobile" class="in"></div>'+
        '<div class="field"><label>Serving branch</label><select id="psBranch" class="in">'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'"'+(String(b.BranchID)===String(S.user&&S.user.Branch)?' selected':'')+'>'+esc(b.BranchName)+'</option>';}).join('')+'</select></div>'+
        '<div class="field"><label>Assign first task to</label><select id="psAssignee" class="in">'+empOpts(emps,S.user&&S.user.EmpID)+'</select></div>'+
        fieldsHtml(start.fields,'ps_')+
        '<div class="field"><label>First task date</label><input id="psDate" class="in" type="date"></div>'+
        '</div><div id="psMsg"></div>';
      openModal('Add to '+DEF.process.name, body, '<button class="btn" id="psSave">Save & start</button>');
      document.getElementById('psSave').onclick=function(){
        var name=document.getElementById('psName').value.trim(); if(!name){ document.getElementById('psMsg').innerHTML='<div class="msg error">Name is required.</div>'; return; }
        var data={ leadName:name, leadMobile:document.getElementById('psMobile').value.trim(), branchId:document.getElementById('psBranch').value,
          assigneeEmpId:document.getElementById('psAssignee').value, dataJson:collectFields(start.fields,'ps_'), nextDate:document.getElementById('psDate').value };
        this.disabled=true; this.textContent='Saving…';
        API.startInstance(pid,data).then(function(r){ if(r&&(r.ok||r.offline)){ closeModal(); toast(r.offline?'Saved offline — will sync':'Added to pipeline'); if(after) after(); } else { document.getElementById('psMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; } });
      };
    });
  }

  /* ---------- work / advance a lead ---------- */
  function openInstance(iid, after){
    API.cachedInstance(iid).then(function(cached){
      var shown=false;
      if(cached && cached.ok){ renderInstance(cached, iid, after); shown=true; }
      else openModal('Lead','<div class="center-load"><span class="loader dark"></span> Loading…</div>','');
      API.getInstance(iid).then(function(r){ if(r&&r.ok){ if(!shown) renderInstance(r, iid, after); } else if(!shown){ closeModal(); toast((r&&r.error)||'Could not open',true); } });
    });
  }
  function actsFor(st, steps){
    var advN=(steps||[]).filter(function(s){ return s.activityType && s.activityType!=='Created'; }).length;
    var base = advN===0 ? ['New call','New meeting'] : ['Recurring call','Recurring meeting','Follow-up call','Follow-up visit'];
    var extras = String(st.activityOptions||'').split(',').filter(Boolean).filter(function(a){ return !/call|meeting|visit/i.test(a); });
    return base.concat(extras);
  }
  function renderInstance(r, iid, after){
    API.cachedEmployees().then(function(emps){ emps=emps||[];
      var st=r.stage||{}, acts=actsFor(st, r.steps);
      var moveOpts=(r.edges||[]).map(function(e){ return '<option value="'+esc(e.toStageId)+'">→ '+esc(e.toName)+(e.label?(' ('+esc(e.label)+')'):'')+'</option>'; }).join('');
      moveOpts+='<option value="STAY">Stay — '+esc(st.name||'')+' (revisit)</option>';
      if(st.allowClose){ moveOpts+='<option value="CLOSE_WON">✓ Close — Won</option><option value="CLOSE_LOST">✕ Close — Lost</option>'; }
      var mouBtn=(String(r.instance.processId)==='P_DOCTOR')?'<button class="btn ghost sm" id="avMou" style="margin-bottom:8px">⤓ Download MOU</button>':'';
      var body='<div style="font-size:12.5px;color:#666;margin-bottom:8px"><b>'+esc(r.instance.leadName)+'</b>'+(r.instance.leadMobile?(' · '+esc(r.instance.leadMobile)):'')+' · stage: '+esc(st.name||'')+'</div>'+mouBtn+
        '<div class="grid2">'+
        '<div class="field full"><label>Activity</label><select id="avAct" class="in">'+acts.map(function(a){return '<option>'+esc(a)+'</option>';}).join('')+'</select></div>'+
        fieldsHtml(r.fields,'av_')+
        '<div class="field full"><label>Move to *</label><select id="avMove" class="in">'+moveOpts+'</select></div>'+
        '<div class="field" id="avAssWrap"><label>Assign next to</label><select id="avAssignee" class="in">'+empOpts(emps,r.instance.assigneeEmpId)+'</select></div>'+
        '<div class="field" id="avDateWrap"><label>Next date</label><input id="avDate" class="in" type="date"></div>'+
        '<div class="field full" id="avCloseWrap" style="display:none"><label>Close reason</label><input id="avReason" class="in"></div>'+
        '</div>'+timelineHtml(r.steps)+'<div id="avMsg"></div>';
      openModal(st.name||'Work lead', body, '<button class="btn" id="avSave">Submit & advance</button>');
      function onMove(){ var v=document.getElementById('avMove').value, close=(v==='CLOSE_WON'||v==='CLOSE_LOST');
        document.getElementById('avCloseWrap').style.display=close?'':'none';
        document.getElementById('avAssWrap').style.display=close?'none':'';
        document.getElementById('avDateWrap').style.display=close?'none':''; }
      document.getElementById('avMove').onchange=onMove; onMove();
      var mb=document.getElementById('avMou'); if(mb) mb.onclick=function(){ buildMou(r); };
      document.getElementById('avSave').onclick=function(){
        var data={ activityType:(document.getElementById('avAct')||{}).value||'', formData:collectFields(r.fields,'av_'),
          nextStageId:document.getElementById('avMove').value, nextAssigneeEmpId:(document.getElementById('avAssignee')||{}).value||'',
          nextDate:(document.getElementById('avDate')||{}).value||'', closeReason:(document.getElementById('avReason')||{}).value||'' };
        this.disabled=true; this.textContent='Saving…';
        API.advanceStage(iid,data).then(function(res){ if(res&&(res.ok||res.offline)){ closeModal(); toast(res.offline?'Saved offline — will sync':'Updated'); if(after) after(); } else { document.getElementById('avMsg').innerHTML='<div class="msg error">'+esc((res&&res.error)||'Failed')+'</div>'; } });
      };
    });
  }
  function timelineHtml(steps){ if(!steps||!steps.length) return ''; return '<div class="proc-tl"><div class="tl-h">History</div>'+steps.slice().reverse().map(function(s){ return '<div class="tl-i"><b>'+esc(s.stageName)+'</b>'+(s.activityType?(' · '+esc(s.activityType)):'')+'<span>'+esc(String(s.actualAt||s.createdAt||'').slice(0,10))+' · '+esc(s.byName||'')+'</span></div>'; }).join('')+'</div>'; }

  /* ---------- PC monitor grid ---------- */
  function openMonitor(pid){
    openModal('Process Flow Monitor','<div id="pmBody"><div class="center-load"><span class="loader dark"></span> Loading…</div></div>','');
    API.processMonitor(pid).then(function(r){ var box=document.getElementById('pmBody'); if(!box) return;
      if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'Could not load')+'</div>'; return; }
      var stages=r.stages||[], rows=r.rows||[];
      if(!rows.length){ box.innerHTML='<div class="pm-banner">Owner: '+esc(r.ownerRole)+' — '+esc(r.processName)+'</div><div class="empty">No live leads.</div>'; return; }
      var head='<tr><th class="pm-lead">Lead</th>'+stages.map(function(s){return '<th colspan="2" class="pm-grp">'+esc(s.name)+'</th>';}).join('')+'</tr>'+
        '<tr><th class="pm-lead"></th>'+stages.map(function(){return '<th>Plan</th><th>Actual</th>';}).join('')+'</tr>';
      var body=rows.map(function(row){
        var late=row.cells.some(function(c){return c.state==='late';});
        return '<tr'+(late?' class="pm-late"':'')+'><td class="pm-lead">'+esc(row.leadName)+'<div class="pm-as">'+esc(row.assigneeName||'')+'</div></td>'+
          row.cells.map(function(c){ var a = c.state==='done'?('<span class="ok">✓ '+esc(c.actual||'')+'</span>') : c.state==='late'?'<span class="red">late</span>' : c.state==='due'?'<span class="amber">due</span>' : (c.state==='pending'?'<span style="color:#bbb">…</span>':'—');
            return '<td>'+esc(c.planned||'')+'</td><td>'+a+'</td>'; }).join('')+'</tr>';
      }).join('');
      box.innerHTML='<div class="pm-banner">Owner: '+esc(r.ownerRole)+' — '+esc(r.processName)+'</div><div class="pm-wrap"><table class="pm-grid">'+head+body+'</table></div>';
    });
  }

  /* ---------- Doctor MOU (A4 PNG) ---------- */
  function stepVal_(steps,label){ for(var i=(steps||[]).length-1;i>=0;i--){ try{ var fd=JSON.parse(steps[i].formDataJson||'{}'); if(fd[label]) return fd[label]; }catch(e){} } return ''; }
  function wrap_(x,text,maxW){ var words=String(text||'').split(' '),lines=[],line=''; words.forEach(function(w){ var t=line?line+' '+w:w; if(x.measureText(t).width>maxW && line){ lines.push(line); line=w; } else line=t; }); if(line) lines.push(line); return lines; }
  function branchName_(id){ var b=((S.meta&&S.meta.branches)||[]).filter(function(x){return String(x.BranchID)===String(id);})[0]; return b?b.BranchName:String(id||''); }
  function buildMou(r){
    API.getProcess(r.instance.processId).then(function(d){ var proc=(d&&d.ok)?d.process:{};
      var logo=new Image(); logo.onload=function(){ draw(logo,proc); }; logo.onerror=function(){ draw(null,proc); }; logo.src='icons/login-logo.png';
    });
    function draw(logo,proc){
      var inst=r.instance, dj={}; try{ dj=JSON.parse(inst.dataJson||'{}'); }catch(e){}
      var today=new Date(), ds=today.getDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][today.getMonth()]+' '+today.getFullYear();
      var map={ doctor_name:inst.leadName, specialty:dj['Specialty']||'', clinic:dj['Clinic / Hospital']||'', area:dj['Area / Locality']||'',
        mobile:inst.leadMobile||'', referral_code:stepVal_(r.steps,'Referral code')||'—', terms:stepVal_(r.steps,'Commission / terms')||'As mutually agreed.', branch:branchName_(inst.branchId), date:ds };
      function fill(t){ return String(t||'').replace(/\{\{(\w+)\}\}/g,function(_,k){ return map[k]!=null?map[k]:''; }); }
      var defBody='This Memorandum of Understanding is between Nakoda Diagnostics And Research Center and Dr. {{doctor_name}} ({{specialty}}, {{clinic}}, {{area}}), referral code {{referral_code}}.\n\nCommercial terms: {{terms}}\n\n1. The Doctor may refer patients to the Center for diagnostic services.\n2. The Center shall provide timely, quality reports and home collection where applicable.\n3. Referral benefits are settled monthly against valid records.\n4. Both parties shall maintain patient confidentiality per applicable law.\n5. No arrangement shall compromise clinical judgement or patient interest.\n6. Either party may terminate with 30 days written notice.';
      var title=(proc&&proc.docTitle)||'MEMORANDUM OF UNDERSTANDING';
      var body=fill((proc&&proc.docBody)||defBody);
      var letterhead=String(proc&&proc.docLetterhead)==='yes';
      var W=1240,H=1754,M=70; var c=document.createElement('canvas'); c.width=W; c.height=H; var x=c.getContext('2d');
      x.fillStyle='#fff'; x.fillRect(0,0,W,H);
      var topY;
      if(letterhead){ topY=250; x.fillStyle='#bbb'; x.font='italic 13px Arial'; x.textAlign='center'; x.fillText('(printed on your branch letterhead)', W/2, 130); x.textAlign='left'; }
      else { x.fillStyle='#DA1017'; x.fillRect(0,0,W,10);
        if(logo){ var lh=70, lw=Math.min(360, logo.width*(lh/logo.height)); x.drawImage(logo,M,40,lw,lh); } else { x.fillStyle='#DA1017'; x.font='bold 32px Arial'; x.fillText('NAKODA',M,86); }
        x.textAlign='right'; x.fillStyle='#888'; x.font='13px Arial'; x.fillText('Date: '+ds, W-M, 60); x.textAlign='left'; topY=150; }
      x.fillStyle='#1f1f1f'; x.font='bold 28px Arial'; x.textAlign='center'; x.fillText(title, W/2, topY); x.textAlign='left';
      x.strokeStyle='#e2e5ea'; x.beginPath(); x.moveTo(M,topY+20); x.lineTo(W-M,topY+20); x.stroke();
      var y=topY+58; x.font='15px Arial'; x.fillStyle='#222';
      body.split('\n').forEach(function(para){ if(!para.trim()){ y+=14; return; } wrap_(x,para,W-2*M).forEach(function(l){ x.fillText(l,M,y); y+=25; }); y+=6; });
      y=Math.max(y+30,H-170); x.strokeStyle='#bbb'; x.beginPath(); x.moveTo(M,y); x.lineTo(M+340,y); x.moveTo(W-M-340,y); x.lineTo(W-M,y); x.stroke();
      x.fillStyle='#333'; x.font='14px Arial'; x.fillText('For Nakoda Diagnostics And Research Center', M, y+26); x.fillText('Dr. '+inst.leadName+' (Doctor)', W-M-340, y+26);
      x.fillStyle='#888'; x.font='italic 14px Arial'; x.textAlign='center'; x.fillText('Computer-generated draft — sign physically to execute.', W/2, H-40); x.textAlign='left';
      c.toBlob(function(b){ var u=URL.createObjectURL(b); var a=document.createElement('a'); a.href=u; a.download='MOU-'+String(inst.leadName).replace(/\s+/g,'_')+'.png'; a.click(); setTimeout(function(){URL.revokeObjectURL(u);},2000); toast('MOU saved'); });
    }
  }

  /* ---------- full Process Monitor (PC stage grid) ---------- */
  var PM={ pid:null, procs:[], data:null, filter:{status:'running',delayedOnly:false} };
  function renderProcessGridInto(box){
    box.innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>';
    API.listProcesses().then(function(r){ PM.procs=(r&&r.ok)?r.processes:[]; if(!PM.pid && PM.procs.length) PM.pid=PM.procs[0].processId; shell(box); loadGrid(box); });
  }
  function shell(box){
    var brs=(S.meta&&S.meta.branches)||[];
    box.innerHTML=
      '<div class="pm2-bar"><button class="btn ghost sm" id="pmXls">⤓ Export Excel</button> <button class="btn ghost sm" id="pmRef">↻ Refresh</button></div>'+
      '<div class="pm2-tabs">'+PM.procs.map(function(p){ return '<span data-pid="'+esc(p.processId)+'"'+(p.processId===PM.pid?' class="on"':'')+'>'+esc(p.name)+'</span>'; }).join('')+'</div>'+
      '<div class="pm2-filt">'+
        '<div><label>Branch</label><select class="in" id="pmBranch"><option value="">All branches</option>'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'">'+esc(b.BranchName)+'</option>';}).join('')+'</select></div>'+
        '<div><label>From</label><input class="in" id="pmFrom" type="date"></div>'+
        '<div><label>To</label><input class="in" id="pmTo" type="date"></div>'+
        '<div><label>Status</label><select class="in" id="pmStatus"><option value="running">In progress</option><option value="completed">Completed</option><option value="all">All</option></select></div>'+
      '</div>'+
      '<label class="pm2-del"><input type="checkbox" id="pmDelayed"> Show only delayed</label>'+
      '<div id="pmKpis" class="pm2-kpis"></div>'+
      '<div id="pmGrid"></div>';
    box.querySelectorAll('.pm2-tabs span').forEach(function(s){ s.onclick=function(){ PM.pid=s.getAttribute('data-pid'); shell(box); loadGrid(box); }; });
    function fchg(){ PM.filter={ branch:document.getElementById('pmBranch').value, from:document.getElementById('pmFrom').value, to:document.getElementById('pmTo').value, status:document.getElementById('pmStatus').value, delayedOnly:document.getElementById('pmDelayed').checked }; loadGrid(box); }
    ['pmBranch','pmFrom','pmTo','pmStatus','pmDelayed'].forEach(function(id){ var el=document.getElementById(id); if(el) el.onchange=fchg; });
    document.getElementById('pmRef').onclick=function(){ loadGrid(box); };
    document.getElementById('pmXls').onclick=exportXls;
  }
  function loadGrid(box){
    var grid=document.getElementById('pmGrid'); if(grid) grid.innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>';
    API.processMonitor(PM.pid, PM.filter).then(function(r){ if(!r||!r.ok){ if(grid) grid.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; } PM.data=r; paintKpis(); paintGrid(); });
  }
  function paintKpis(){
    var r=PM.data, k=document.getElementById('pmKpis'); if(!k) return; var kp=r.kpis||{};
    var html='<div class="pm2k t"><div class="l">Total flows</div><div class="n">'+(kp.total||0)+'</div></div>'+
      '<div class="pm2k p"><div class="l">In progress</div><div class="n">'+(kp.inProgress||0)+'</div></div>'+
      '<div class="pm2k c"><div class="l">Completed</div><div class="n">'+(kp.completed||0)+'</div></div>'+
      '<div class="pm2k d"><div class="l">Delayed</div><div class="n">'+(kp.delayed||0)+'</div></div>';
    (r.stages||[]).forEach(function(s){ html+='<div class="pm2k"><div class="l">At '+esc(s.name)+'</div><div class="n">'+((kp.atStage&&kp.atStage[s.stageId])||0)+'</div></div>'; });
    k.innerHTML=html;
  }
  function paintGrid(){
    var r=PM.data, g=document.getElementById('pmGrid'); if(!g) return;
    if(!(r.rows||[]).length){ g.innerHTML='<div class="empty">No flows for these filters.</div>'; return; }
    var head='<tr><th class="lead">Lead</th>'+(r.stages||[]).map(function(s,i){return '<th class="grp'+(i%2?' alt':'')+'" colspan="3">'+esc(s.name)+'</th>';}).join('')+'</tr>'+
      '<tr><th class="lead"></th>'+(r.stages||[]).map(function(){return '<th class="sub">Owner</th><th class="sub">Plan</th><th class="sub">Actual</th>';}).join('')+'</tr>';
    var body=(r.rows||[]).map(function(row){
      return '<tr'+(row.late?' class="late"':'')+' data-iid="'+esc(row.instanceId)+'"><td class="lead">'+esc(row.leadName)+(row.late?' <span class="warn">⚠</span>':'')+'</td>'+
        row.cells.map(function(c){ var a=c.state==='done'?('<span class="ok">✓ '+esc(c.actual||'')+'</span>'):c.state==='late'?'<span class="red">late</span>':c.state==='due'?'<span class="amber">due</span>':(c.state==='pending'?'<span style="color:#bbb">…</span>':'—');
          return '<td>'+esc(c.owner||'')+'</td><td>'+esc(c.planned||'')+'</td><td>'+a+'</td>'; }).join('')+'</tr>';
    }).join('');
    g.innerHTML='<div class="pm2-banner">Owner: '+esc(r.ownerRole||'')+' — '+esc(r.processName||'')+'</div><div class="pm2-wrap"><table class="pm2-grid">'+head+body+'</table></div>';
    g.querySelectorAll('tr[data-iid]').forEach(function(tr){ tr.onclick=function(){ openInstance(tr.getAttribute('data-iid'), function(){ loadGrid(document.getElementById('pmGrid').parentNode); }); }; });
  }
  function exportXls(){
    var r=PM.data; if(!r) return;
    var h1='<tr><th>Lead</th>'+(r.stages||[]).map(function(s){return '<th colspan="3">'+s.name+'</th>';}).join('')+'</tr>';
    var h2='<tr><th></th>'+(r.stages||[]).map(function(){return '<th>Owner</th><th>Plan</th><th>Actual</th>';}).join('')+'</tr>';
    var rows=(r.rows||[]).map(function(row){ return '<tr><td>'+esc(row.leadName)+'</td>'+row.cells.map(function(c){ var a=c.state==='done'?('Done '+(c.actual||'')):c.state==='late'?'LATE':c.state==='due'?'Due':(c.state==='pending'?'Pending':''); return '<td>'+esc(c.owner||'')+'</td><td>'+esc(c.planned||'')+'</td><td>'+esc(a)+'</td>'; }).join('')+'</tr>'; }).join('');
    var html='<table border="1">'+h1+h2+rows+'</table>';
    var blob=new Blob(['﻿<html><head><meta charset="utf-8"></head><body>'+html+'</body></html>'],{type:'application/vnd.ms-excel'});
    var u=URL.createObjectURL(blob),a=document.createElement('a'); a.href=u; a.download=(r.processName||'process')+'-monitor.xls'; a.click(); setTimeout(function(){URL.revokeObjectURL(u);},2000); toast('Excel exported');
  }

  window.renderCRM=renderCRM;
  window.openProcessInstance=openInstance;
  window.renderProcessGridInto=renderProcessGridInto;
})();
