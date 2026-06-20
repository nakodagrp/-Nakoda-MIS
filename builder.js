/* Nakoda MIS — Process Builder (Director/MIS/EA). Edit pipelines, stages, fields, checklists, MOU — no rebuild. */
(function(){
  var TYPES=['text','number','date','dropdown','checklist','file'];
  function $id(i){ return document.getElementById(i); }
  function reloadEditor(pid){ openProcEditor(pid); }

  function renderBuilder(){
    var v=$id('page-builder');
    v.innerHTML='<div class="page-head"><h1>Process Builder</h1><div class="spacer"></div><button class="btn" id="bNew">+ New process</button></div>'+
      '<div style="color:#888;font-size:13px;margin-bottom:12px">Edit any pipeline’s stages, checklists, forms and documents. Changes go live on save — no rebuild.</div>'+
      '<div id="bList"></div>';
    $id('bNew').onclick=newProcess;
    API.cachedProcesses().then(function(p){ if(p&&p.length) paint(p); else $id('bList').innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>'; });
    API.listProcesses().then(function(r){ if(r.ok) paint(r.processes); });
  }
  function paint(list){
    var box=$id('bList'); if(!box) return;
    if(!list.length){ box.innerHTML='<div class="empty">No processes. Tap “+ New process”.</div>'; return; }
    box.innerHTML=list.map(function(p){ return '<div class="crm-tile" data-pid="'+esc(p.processId)+'"><div class="crm-ic">🛠</div><div class="crm-mid"><b>'+esc(p.name)+'</b><div class="crm-sub">Owner: '+esc(p.ownerRole||'—')+'</div></div><span class="crm-go">✎</span></div>'; }).join('');
    box.querySelectorAll('.crm-tile').forEach(function(el){ el.onclick=function(){ openProcEditor(el.getAttribute('data-pid')); }; });
  }
  function newProcess(){
    var body='<div class="grid2"><div class="field full"><label>Process name *</label><input id="npName" class="in" placeholder="e.g. Complaint Handling"></div>'+
      '<div class="field full"><label>Owner role</label><input id="npOwner" class="in" placeholder="e.g. Branch Manager"></div>'+
      '<div class="field full"><label>First stage name</label><input id="npFirst" class="in" value="New"></div></div><div id="npMsg"></div>';
    openModal('New process', body, '<button class="btn" id="npSave">Create</button>');
    $id('npSave').onclick=function(){ var n=$id('npName').value.trim(); if(!n){ $id('npMsg').innerHTML='<div class="msg error">Name required.</div>'; return; }
      this.disabled=true; API.saveProcess({name:n, ownerRole:$id('npOwner').value.trim(), startRoles:'Director,Executive Assistant,Operations Manager', viewRoles:'Director,Executive Assistant,Operations Manager,Process Coordinator', firstStage:$id('npFirst').value.trim()||'New'}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Process created'); openProcEditor(r.processId); } else $id('npMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }

  /* ---------- process editor ---------- */
  function openProcEditor(pid){
    var v=$id('page-builder');
    v.innerHTML='<div class="page-head"><button class="btn ghost sm" id="bBack">‹ Builder</button> <h1 style="font-size:18px;margin:0 0 0 8px" id="bTtl">Process</h1><div class="spacer"></div><button class="btn ghost sm" id="bSettings">⚙ Settings</button> <button class="btn ghost sm" id="bDoc">📄 MOU</button></div><div id="bStages"></div>';
    $id('bBack').onclick=renderBuilder;
    API.getProcess(pid).then(function(d){ if(!d||!d.ok){ $id('bStages').innerHTML='<div class="empty">'+esc((d&&d.error)||'Could not load')+'</div>'; return; }
      $id('bTtl').textContent=d.process.name;
      $id('bSettings').onclick=function(){ openSettings(d.process); };
      $id('bDoc').onclick=function(){ openDocEd(d.process); };
      var stages=d.stages||[];
      $id('bStages').innerHTML=stages.map(function(s,i){
        var ck=(s.fields||[]).filter(function(f){return f.fieldType==='checklist';}), fl=(s.fields||[]).filter(function(f){return f.fieldType!=='checklist';});
        var ckItems=ck.length?String(ck[0].options||'').split(',').filter(Boolean):[];
        return '<div class="stg"><div class="top">'+
          '<span class="num">'+(i+1)+'</span><span class="nm">'+esc(s.name)+'</span>'+
          '<span class="tat">'+(Number(s.tatDays)||0)+'d</span>'+
          '<button class="bmini" data-up="'+esc(s.stageId)+'"'+(i===0?' disabled':'')+'>▲</button>'+
          '<button class="bmini" data-down="'+esc(s.stageId)+'"'+(i===stages.length-1?' disabled':'')+'>▼</button>'+
          '<button class="bmini" data-edit="'+esc(s.stageId)+'">✎</button>'+
          '<button class="bmini" data-del="'+esc(s.stageId)+'">🗑</button></div>'+
          '<div class="det">'+(ckItems.length?('Checklist: '+ckItems.map(function(c){return '<span class="pill ck">'+esc(c)+'</span>';}).join('')):'')+
          (fl.length?('<div style="margin-top:4px">Fields: '+fl.map(function(f){return '<span class="pill">'+esc(f.label)+'</span>';}).join('')+'</div>'):'')+'</div></div>';
      }).join('')+'<div class="addstg" id="bAddStage">+ Add stage</div>';
      var orderIds=stages.map(function(s){return s.stageId;});
      $id('bAddStage').onclick=function(){ openStageEd(pid,null,d); };
      v.querySelectorAll('[data-edit]').forEach(function(b){ b.onclick=function(){ var s=stages.filter(function(x){return x.stageId===b.getAttribute('data-edit');})[0]; openStageEd(pid,s,d); }; });
      v.querySelectorAll('[data-del]').forEach(function(b){ b.onclick=function(){ if(stages.length<=1){ toast('Keep at least one stage',true); return; } if(!confirm('Delete this stage?')) return; API.deleteStage(b.getAttribute('data-del')).then(function(){ toast('Deleted'); reloadEditor(pid); }); }; });
      function move(id,dir){ var i=orderIds.indexOf(id), j=i+dir; if(i<0||j<0||j>=orderIds.length) return; var t=orderIds[i]; orderIds[i]=orderIds[j]; orderIds[j]=t; API.reorderStages(pid,orderIds).then(function(){ reloadEditor(pid); }); }
      v.querySelectorAll('[data-up]').forEach(function(b){ b.onclick=function(){ move(b.getAttribute('data-up'),-1); }; });
      v.querySelectorAll('[data-down]').forEach(function(b){ b.onclick=function(){ move(b.getAttribute('data-down'),1); }; });
    });
  }

  function openSettings(p){
    /* split a comma-separated roster into a clean array */
    function selOf(csv){ return String(csv||'').split(',').map(function(x){return x.trim();}).filter(Boolean); }
    /* master role list from metadata, unioned with any roles already saved on this process
       (so nothing is silently dropped if a custom role isn't in the master list) */
    var base=((S.meta&&S.meta.roles)||[]).map(function(r){ return r.Role||r; });
    var saved=selOf(p.startRoles).concat(selOf(p.viewRoles)); if(p.ownerRole) saved.push(p.ownerRole);
    var roles=base.slice();
    saved.forEach(function(n){ if(roles.indexOf(n)<0) roles.push(n); });
    /* render a tap-to-select chip checklist, pre-ticking the saved roles */
    function chips(id,csv){ var on=selOf(csv); return '<div class="rolechips" id="'+id+'">'+roles.map(function(n){ return '<span class="rc'+(on.indexOf(n)>=0?' on':'')+'" data-r="'+esc(n)+'">'+esc(n)+'</span>'; }).join('')+'</div>'; }
    var ownerOpts=roles.map(function(n){ return '<option'+(n===p.ownerRole?' selected':'')+'>'+esc(n)+'</option>'; }).join('');
    var body='<div class="grid2"><div class="field full"><label>Process name</label><input id="seName" class="in" value="'+esc(p.name)+'"></div>'+
      '<div class="field full"><label>Owner role (shown on monitor)</label><select id="seOwner" class="in">'+ownerOpts+'</select></div>'+
      '<div class="field full"><label>Who can start &amp; edit leads <span class="muted">(tap to select)</span></label>'+chips('seStart',p.startRoles)+'</div>'+
      '<div class="field full"><label>Who can view <span class="muted">(tap to select)</span></label>'+chips('seView',p.viewRoles)+'</div></div><div id="seMsg"></div>';
    openModal('Process settings', body, '<button class="btn" id="seSave">Save</button>');
    document.querySelectorAll('#seStart .rc, #seView .rc').forEach(function(c){ c.onclick=function(){ c.classList.toggle('on'); }; });
    function collect(id){ return [].slice.call(document.querySelectorAll('#'+id+' .rc.on')).map(function(c){ return c.getAttribute('data-r'); }).join(','); }
    $id('seSave').onclick=function(){ this.disabled=true; API.saveProcess({processId:p.processId,name:$id('seName').value.trim(),ownerRole:$id('seOwner').value,startRoles:collect('seStart'),viewRoles:collect('seView')}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Saved'); openProcEditor(p.processId); } else $id('seMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }

  /* ---------- reusable chip "checklist" picker (tap to toggle, + add your own) ---------- */
  function pickHtml(id, opts, current){
    var cur=(current||[]).slice(), all=(opts||[]).slice();
    cur.forEach(function(v){ if(all.indexOf(v)<0) all.push(v); });
    var chips=all.map(function(v){ return '<span class="rc'+(cur.indexOf(v)>=0?' on':'')+'" data-v="'+esc(v)+'">'+esc(v)+'</span>'; }).join('');
    return '<div class="rolechips" id="'+id+'">'+chips+'</div>'+
      '<div style="display:flex;gap:6px;margin-top:7px">'+
      '<input class="in" id="'+id+'_new" placeholder="Add your own…" style="max-width:240px">'+
      '<button class="btn ghost sm" id="'+id+'_add" type="button">+ Add</button></div>';
  }
  function wirePick(id){
    function bind(c){ c.onclick=function(){ c.classList.toggle('on'); }; }
    document.querySelectorAll('#'+id+' .rc').forEach(bind);
    var addb=$id(id+'_add'), inp=$id(id+'_new');
    function add(){ var v=(inp.value||'').trim(); if(!v) return;
      var ex=[].slice.call(document.querySelectorAll('#'+id+' .rc')).filter(function(c){ return c.getAttribute('data-v').toLowerCase()===v.toLowerCase(); })[0];
      if(ex){ ex.classList.add('on'); } else { var sp=document.createElement('span'); sp.className='rc on'; sp.setAttribute('data-v',v); sp.textContent=v; bind(sp); $id(id).appendChild(sp); }
      inp.value=''; inp.focus();
    }
    if(addb) addb.onclick=add;
    if(inp) inp.onkeydown=function(e){ if(e.key==='Enter'){ e.preventDefault(); add(); } };
  }
  function pickVal(id){ return [].slice.call(document.querySelectorAll('#'+id+' .rc.on')).map(function(c){ return c.getAttribute('data-v'); }); }

  /* ---------- stage editor ---------- */
  function openStageEd(pid, s, def){
    s=s||{}; var fields=(s.fields||[]);
    var ckField=fields.filter(function(f){return f.fieldType==='checklist';})[0];
    var ckItems=ckField?String(ckField.options||'').split(',').filter(Boolean):[];
    var otherFields=fields.filter(function(f){return f.fieldType!=='checklist';});
    var actSel=String(s.activityOptions||'').split(',').map(function(x){return x.trim();}).filter(Boolean);
    var ACT_SUGGEST=['WhatsApp','Email','Walk-in','SMS','Reminder'], CK_SUGGEST=[];
    var body='<div class="grid2">'+
      '<div class="field"><label>Stage name *</label><input id="stName" class="in" value="'+esc(s.name||'')+'"></div>'+
      '<div class="field"><label>Timer (TAT days)</label><input id="stTat" class="in" type="number" value="'+(Number(s.tatDays)||0)+'"></div>'+
      '<div class="field full"><label>Extra activity options <span class="muted">(tap to select; New/Follow-up call &amp; meeting are automatic)</span></label>'+pickHtml('stActs',ACT_SUGGEST,actSel)+'</div>'+
      '<div class="field"><label class="tg"><input type="checkbox" id="stClose" class="ce-cl-box"'+(s.allowClose?' checked':'')+'> Allow close here</label></div>'+
      '<div class="field"><label class="tg"><input type="checkbox" id="stRecur" class="ce-cl-box"'+(s.recurring?' checked':'')+'> Recurring stage</label></div>'+
      '<div class="field full"><label>Checklist items <span class="muted">(tap to select or add your own)</span></label>'+pickHtml('stCk',CK_SUGGEST,ckItems)+'</div>'+
      '</div>'+
      (s.stageId?('<label class="fl2">Form fields</label><div id="stFields">'+fieldsList(otherFields)+'</div><button class="btn ghost sm" id="stAddF">+ Add field</button>'):'<div class="note" style="background:#f1effc;border-radius:9px;padding:9px;font-size:11.5px;color:#5046b8">Save the stage first, then add custom form fields.</div>')+
      '<div id="stMsg"></div>';
    openModal(s.stageId?'Edit stage':'Add stage', body, '<button class="btn" id="stSave">Save stage</button>');
    wirePick('stActs'); wirePick('stCk');
    if(s.stageId){
      var binF=function(){ document.querySelectorAll('#stFields [data-fe]').forEach(function(b){ b.onclick=function(){ var f=otherFields.filter(function(x){return x.fieldId===b.getAttribute('data-fe');})[0]; openFieldEd(s.stageId,f,pid); }; });
        document.querySelectorAll('#stFields [data-fd]').forEach(function(b){ b.onclick=function(){ if(!confirm('Delete field?')) return; API.deleteField(b.getAttribute('data-fd')).then(function(){ toast('Deleted'); openProcEditor(pid); closeModal(); }); }; }); };
      binF();
      $id('stAddF').onclick=function(){ openFieldEd(s.stageId,null,pid); };
    }
    $id('stSave').onclick=function(){ var n=$id('stName').value.trim(); if(!n){ $id('stMsg').innerHTML='<div class="msg error">Name required.</div>'; return; }
      this.disabled=true;
      API.saveStage({stageId:s.stageId,processId:pid,name:n,tatDays:Number($id('stTat').value)||0,activityOptions:pickVal('stActs').join(','),allowClose:$id('stClose').checked,recurring:$id('stRecur').checked}).then(function(r){
        if(!r||!r.ok){ $id('stMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; return; }
        var sid=r.stageId; var items=pickVal('stCk').join(',');
        var saveCk = (ckField || items) ? API.saveField({fieldId:(ckField?ckField.fieldId:null),stageId:sid,label:(ckField?ckField.label:'Checklist'),fieldType:'checklist',options:items}) : Promise.resolve();
        Promise.resolve(saveCk).then(function(){ closeModal(); toast('Stage saved'); openProcEditor(pid); });
      });
    };
  }
  function fieldsList(fields){ if(!fields.length) return '<div class="muted" style="font-size:12px;margin-bottom:6px">No custom fields yet.</div>';
    return fields.map(function(f){ return '<div class="frow"><span class="t">'+esc(f.label)+(f.required?' *':'')+'</span><span class="ty">'+esc(f.fieldType)+'</span><button class="bmini" data-fe="'+esc(f.fieldId)+'">✎</button><button class="bmini" data-fd="'+esc(f.fieldId)+'">🗑</button></div>'; }).join('');
  }
  function openFieldEd(stageId, f, pid){
    f=f||{};
    var body='<div class="grid2">'+
      '<div class="field full"><label>Field label *</label><input id="fdLabel" class="in" value="'+esc(f.label||'')+'"></div>'+
      '<div class="field"><label>Type</label><select id="fdType" class="in">'+TYPES.map(function(t){return '<option'+(f.fieldType===t?' selected':'')+'>'+t+'</option>';}).join('')+'</select></div>'+
      '<div class="field"><label class="tg"><input type="checkbox" id="fdReq" class="ce-cl-box"'+(f.required?' checked':'')+'> Required</label></div>'+
      '<div class="field full" id="fdOptWrap"><label>Options / items (comma-separated)</label><input id="fdOpts" class="in" value="'+esc(f.options||'')+'"></div>'+
      '</div><div id="fdMsg"></div>';
    openModal(f.fieldId?'Edit field':'Add field', body, '<button class="btn" id="fdSave">Save field</button>');
    function tog(){ var t=$id('fdType').value; $id('fdOptWrap').style.display=(t==='dropdown'||t==='checklist')?'':'none'; }
    $id('fdType').onchange=tog; tog();
    $id('fdSave').onclick=function(){ var l=$id('fdLabel').value.trim(); if(!l){ $id('fdMsg').innerHTML='<div class="msg error">Label required.</div>'; return; }
      this.disabled=true; API.saveField({fieldId:f.fieldId,stageId:stageId,label:l,fieldType:$id('fdType').value,required:$id('fdReq').checked,options:$id('fdOpts').value.trim()}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Field saved'); openProcEditor(pid); } else $id('fdMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }

  /* ---------- document / MOU template ---------- */
  function openDocEd(p){
    var def='This Memorandum of Understanding is between Nakoda Diagnostics And Research Center and Dr. {{doctor_name}} ({{specialty}}, {{clinic}}, {{area}}), referral code {{referral_code}}.\n\nCommercial terms: {{terms}}\n\n1. The Doctor may refer patients to the Center for diagnostic services.\n2. The Center shall provide timely, quality reports and home collection where applicable.\n3. Referral benefits are settled monthly against valid records.\n4. Both parties shall maintain patient confidentiality per applicable law.\n5. No arrangement shall compromise clinical judgement or patient interest.\n6. Either party may terminate with 30 days written notice.';
    var body='<div class="grid2">'+
      '<div class="field full"><label class="tg"><input type="checkbox" id="dcLh" class="ce-cl-box"'+(String(p.docLetterhead)==='yes'?' checked':'')+'> Print on branch letterhead</label></div>'+
      '<div class="field full"><label>Document title</label><input id="dcTitle" class="in" value="'+esc(p.docTitle||'MEMORANDUM OF UNDERSTANDING')+'"></div>'+
      '<div class="field full"><label>Body &amp; clauses — use tags: {{doctor_name}} {{specialty}} {{clinic}} {{area}} {{mobile}} {{referral_code}} {{terms}} {{branch}} {{date}}</label><textarea id="dcBody" class="in" rows="12">'+esc(p.docBody||def)+'</textarea></div>'+
      '</div><div id="dcMsg"></div>';
    openModal('Document template (MOU)', body, '<button class="btn" id="dcSave">Save template</button>');
    $id('dcSave').onclick=function(){ this.disabled=true; API.saveProcess({processId:p.processId,name:p.name,ownerRole:p.ownerRole,startRoles:p.startRoles,viewRoles:p.viewRoles,docTitle:$id('dcTitle').value,docBody:$id('dcBody').value,docLetterhead:$id('dcLh').checked}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Template saved'); } else $id('dcMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }

  window.renderBuilder=renderBuilder;
})();
