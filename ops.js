/* ============================================================
 *  Nakoda MIS — Operations, process 1: sample collection
 *
 *  TWO STAGES ONLY:  collected  ->  sent
 *
 *  Layout C: a list of samples on the left, the selected one in a detail panel on the right.
 *  Two popups: "Collect sample" (the technician, at the patient) and "Send report" (the same
 *  technician later, from the task in My Tasks).
 *
 *  Public entry points:
 *    window.renderOps()                        -> the Operations ▸ Sample collection page
 *    window.openCollectSample(afterSaveFn)     -> popup 1, from anywhere (quick log tile, page)
 *    window.openSendReport(sampleId, taskId)   -> popup 2, from a task or the detail panel
 *    window.opsDashCard(hostEl, branchId)      -> the two-stage dashboard card
 *    window.opsCanCollect()                    -> whether this user may record a collection
 * ============================================================ */
(function(){
  function $id(i){ return document.getElementById(i); }
  function money(n){ return (Number(n)||0).toLocaleString('en-IN'); }
  function u(){ return (window.S&&S.user)||{}; }
  function perms(){ return (window.S&&S.perms)||{}; }
  function canViewAll(){ var p=perms(); return !!(p.canViewAll||p.level==='SUPER'); }

  /* Kept in step with OPS_COLLECT_ROLES_ in Code.gs. If either list changes, change both — the
     server is the one that decides, this only governs whether the button is offered. */
  var COLLECT_ROLES=['Lab Technician','Senior Technician','X-ray Technician','Phlebotomist',
                     'Round Person','CRM','Branch Manager','Operations Manager'];
  function canCollect(){
    if(perms().level==='SUPER') return true;                 /* Director, Admin, MIS */
    return COLLECT_ROLES.indexOf(String(u().Role||'').trim())>=0;
  }
  window.opsCanCollect=canCollect;

  var OPS={ samples:[], counts:{}, sel:'', branch:'', ym:'', loading:false, canPickBranch:false };

  function thisMonth(){ var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2); }
  /* A number the device owns, so a replayed offline save is recognised by the server as the same
     write rather than a second sample. */
  function clientId(){
    var r=''; for(var i=0;i<16;i++) r+=(Math.random()*16|0).toString(16);
    return 'SCC'+Date.now().toString(36)+r;
  }
  function statusChip(s,hours){
    if(s==='sent') return '<span class="ops-chip sent">Sent</span>';
    var cls=(hours>=24)?'ops-chip late':'ops-chip open';
    return '<span class="'+cls+'">Collected</span>';
  }
  function waitLabel(h){
    if(!h) return '';
    if(h<1) return 'just now';
    if(h<24) return h+' h';
    var d=Math.floor(h/24); return d+(d===1?' day':' days');
  }
  function fileLink(url,label){
    if(!url) return '<span class="muted">not attached</span>';
    return '<a href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(label)+'</a>';
  }

  /* ============================================================ the page (layout C) */
  window.renderOps=function(){
    var host=$id('page-ops'); if(!host) return;
    if(!OPS.ym) OPS.ym=thisMonth();
    if(!OPS.samples.length && !OPS.loading) host.innerHTML=shell('<div class="center-load"><span class="loader dark"></span> Loading…</div>');
    else host.innerHTML=shell(bodyHtml());
    wirePage();
    load();
  };
  function shell(inner){
    var brs=((window.S&&S.meta&&S.meta.branches)||[]);
    var picker=canViewAll()
      ? '<select id="opsBranch" class="in" style="max-width:190px"><option value="">All branches</option>'+
        brs.map(function(b){ return '<option value="'+esc(b.BranchID)+'"'+(String(b.BranchID)===OPS.branch?' selected':'')+'>'+esc(b.BranchName)+'</option>'; }).join('')+'</select>'
      : '';
    var btn=(canCollect()?'<button class="btn ghost" id="opsNew">+ Collect sample</button>':'')+
            ((window.opsCanOrder&&window.opsCanOrder())?'<button class="btn" id="opsNewOrder">+ New order</button>':'');
    return '<div class="page-head"><h1>Sample collection</h1>'+
      '<div class="ops-sub">Operations · process 1 of 5</div><div class="spacer"></div>'+
      picker+'<input id="opsYm" type="month" class="in" style="max-width:150px" value="'+esc(OPS.ym)+'">'+
      '<button class="btn ghost sm" id="opsRefresh">&#8635;</button>'+btn+'</div>'+
      '<div id="opsBody">'+inner+'</div>';
  }
  function bodyHtml(){
    var c=OPS.counts||{};
    /* v314: five stages, plus a walk-in / home-visit filter. The counts come from the server so
       this and the dashboard card can never disagree. */
    var chips='<div class="ops-chips">'+
      chip('all','All',c.all)+chip('ordered','Ordered',c.ordered)+chip('collected','Collected',c.collected)+
      chip('result','Result',c.result)+chip('verified','Verified',c.verified)+chip('sent','Sent',c.sent)+
      (c.overdue?'<span class="ops-chip late" style="margin-left:2px">'+c.overdue+' over 24 h</span>':'')+
      (c.pendingCash?'<span class="ops-chip late">&#8377;'+money(c.pendingCash)+' uncollected</span>':'')+
      '</div>'+
      '<div class="ops-chips" style="margin-top:-4px">'+
        tchip('','Both')+tchip('walkin','Walk-in')+tchip('homevisit','Home visit')+'</div>';
    if(!OPS.samples.length)
      return chips+'<div class="card"><div class="empty" style="padding:26px">No samples for this month yet.'+
        (canCollect()?' Tap <b>+ Collect sample</b> to record one.':'')+'</div></div>';
    var sel=selected();
    return chips+'<div class="ops-split">'+
      '<div class="ops-list">'+OPS.samples.map(rowHtml).join('')+'</div>'+
      '<div class="ops-detail" id="opsDetail">'+(sel?detailHtml(sel):'<div class="empty" style="padding:26px">Pick a sample from the list.</div>')+'</div>'+
    '</div>';
  }
  var FILTER='all', KIND='';
  function chip(k,label,n){
    return '<button class="ops-fchip'+(FILTER===k?' on':'')+'" data-f="'+k+'">'+esc(label)+' '+(n||0)+'</button>';
  }
  function tchip(k,label){
    return '<button class="ops-fchip sm'+(KIND===k?' on':'')+'" data-k="'+k+'">'+esc(label)+'</button>';
  }
  function visible(){
    return OPS.samples.filter(function(s){ return FILTER==='all'||s.status===FILTER; });
  }
  var STAGE_LABEL={ordered:'Ordered',collected:'Collected',result:'Result',verified:'Verified',sent:'Sent'};
  function selected(){
    var list=visible(); if(!list.length) return null;
    var hit=list.filter(function(s){ return s.sampleId===OPS.sel; })[0];
    if(!hit){ hit=list[0]; OPS.sel=hit.sampleId; }
    return hit;
  }
  function rowHtml(s){
    if(FILTER!=='all' && s.status!==FILTER) return '';
    var on=(s.sampleId===OPS.sel);
    var sub=(s.status==='sent')
      ? ('Sent'+(s.sentAt?(' · '+esc(s.sentAt.slice(5,10))):''))
      : ((STAGE_LABEL[s.status]||s.status)+' · &#8377;'+money(s.amount)+
         (s.pendingAmount?(' · &#8377;'+money(s.pendingAmount)+' due'):'')+
         (s.pendingHours>=24?(' · waiting '+waitLabel(s.pendingHours)):''));
    var cls='ops-row'+(on?' on':'')+(s.status!=='sent'&&s.pendingHours>=24?' late':'');
    var badge=(String(s.type||'walkin')==='homevisit')?'<i class="ti-home" title="Home visit">&#127968;</i> ':'';
    return '<div class="'+cls+'" data-sid="'+esc(s.sampleId)+'">'+
      '<div class="ops-row-n">'+badge+esc(s.patientName)+'</div>'+
      '<div class="ops-row-s'+(s.status==='sent'?' done':(s.pendingHours>=24?' late':''))+'">'+sub+'</div></div>';
  }
  function detailHtml(s){
    var stage=window.opsStageStrip?window.opsStageStrip(s):'';
    var who=[s.age,s.sex].filter(Boolean).join(' ');
    var meta=[who,s.mobile,s.address].filter(Boolean).join(' · ');
    var isHome=(String(s.type||'walkin')==='homevisit');
    var rows=[
      ['Type', isHome?'Home visit':'Walk-in'],
      ['Tests', esc(s.tests)],
      ['Amount', '&#8377;'+money(s.amount)],
      /* v310: the Branch row is gone from both panels. One desk sends every branch's reports, so
         the line was the same on every row and told the person reading it nothing. */
      ['Collected by', esc(s.collectedByName||'—')],
      ['Collected at', esc(s.collectedAt||'—')],
      (s.status==='sent'
        ? ['Sent', esc(s.sentVia||'')+(s.sentAt?(' · '+esc(s.sentAt)):'')+(s.sentByName?(' · '+esc(s.sentByName)):'')]
        : ['Pending for', '<span class="'+(s.pendingHours>=24?'ops-late-txt':'')+'">'+esc(waitLabel(s.pendingHours)||'just now')+'</span>']),
      ['Prescription', fileLink(s.rxUrl,'prescription')],
      ['Sample photo', fileLink(s.photoUrl,'photo')],
      ['Result', fileLink(s.resultUrl,'result')],
      ['Report', fileLink(s.reportUrl,'report')]
    ];
    if(isHome){
      rows.splice(2,0,
        ['Phlebotomist', esc(s.assignedToName||'—')],
        ['Appointment', esc(s.appointmentAt||'—')],
        ['Handed over', esc(s.assignedAt||'—')],
        ['Reached', s.reachedAt?(esc(s.reachedAt)+(s.lateMin!==''?(' · '+(window.opsLateLabel?window.opsLateLabel(s.lateMin):'')):'')):'<span class="muted">not yet</span>']);
    }
    if(s.pendingAmount) rows.push(['Payment','&#8377;'+money(s.receivedAmount||0)+' of &#8377;'+money(s.amount)+' · <span class="ops-late-txt">&#8377;'+money(s.pendingAmount)+' due</span>']);
    if(s.resultAt)   rows.push(['Result submitted', esc(s.resultAt)+(s.resultByName?(' · '+esc(s.resultByName)):'')]);
    if(s.verifiedAt) rows.push(['Verified', esc(s.verifiedAt)+(s.verifiedByName?(' · '+esc(s.verifiedByName)):'')]);
    if(s.labRemark)  rows.push(['Lab remark', esc(s.labRemark)]);
    if(s.remarks) rows.push(['Remarks', esc(s.remarks)]);
    /* Whatever the record needs next — the same popup the owner gets from their task list, so a
       manager can push a stuck record along without hunting for whose queue it is in. */
    var NEXT={ordered:['opsGoVisit','Open visit'],collected:['opsGoResult','Submit result'],
              result:['opsGoVerify','Verify report'],verified:['opsSend','Send report']};
    var n=NEXT[s.status];
    var act=(s.status==='sent')
      ? '<button class="btn ghost" disabled>Report sent</button>'
      : (n?('<button class="btn" id="'+n[0]+'">'+n[1]+'</button>'):'');
    return '<div class="ops-dh"><b>'+esc(s.patientName)+'</b> <span class="ops-sid">'+esc(s.sampleId)+'</span></div>'+
      '<div class="ops-dm">'+esc(meta||'—')+'</div>'+stage+
      '<table class="ops-kv">'+rows.map(function(r){ return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>'; }).join('')+'</table>'+
      '<div class="ops-acts">'+act+'</div>';
  }
  function wirePage(){
    var b=$id('opsNew'); if(b) b.onclick=function(){ window.openCollectSample(function(){ load(true); }); };
    var bo=$id('opsNewOrder'); if(bo) bo.onclick=function(){ window.openNewOrder(function(){ load(true); }); };
    var r=$id('opsRefresh'); if(r) r.onclick=function(){ load(true); };
    var bp=$id('opsBranch'); if(bp) bp.onchange=function(){ OPS.branch=this.value; OPS.sel=''; load(true); };
    var ym=$id('opsYm'); if(ym) ym.onchange=function(){ OPS.ym=this.value||thisMonth(); load(true); };
    wireBody();
  }
  function wireBody(){
    document.querySelectorAll('#opsBody .ops-fchip[data-f]').forEach(function(c){
      c.onclick=function(){ FILTER=c.getAttribute('data-f'); OPS.sel=''; paint(); };
    });
    document.querySelectorAll('#opsBody .ops-fchip[data-k]').forEach(function(c){
      c.onclick=function(){ KIND=c.getAttribute('data-k'); OPS.sel=''; load(true); };
    });
    document.querySelectorAll('#opsBody .ops-row').forEach(function(row){
      row.onclick=function(){ OPS.sel=row.getAttribute('data-sid'); paint(); };
    });
    function go(id,fn){ var b=$id(id); if(b) b.onclick=function(){ var s=selected(); if(s) fn(s.sampleId,function(){ load(true); }); }; }
    go('opsSend',   function(id,cb){ window.openSendReport(id,'',cb); });
    go('opsGoVisit',  window.openHomeVisit);
    go('opsGoResult', window.openSubmitResult);
    go('opsGoVerify', window.openVerifyReport);
  }
  function paint(){
    var host=$id('opsBody'); if(!host) return;
    host.innerHTML=bodyHtml().replace(/^<div class="ops-chips">/,'<div class="ops-chips">');
    wireBody();
  }
  function load(force){
    if(OPS.loading && !force) return;
    OPS.loading=true;
    API.listSamples(OPS.branch, OPS.ym, '', KIND).then(function(r){
      OPS.loading=false;
      if(r&&r.ok){ OPS.samples=r.samples||[]; OPS.counts=r.counts||{}; OPS.canPickBranch=!!r.canPickBranch; paint(); }
      else { var h=$id('opsBody'); if(h) h.innerHTML='<div class="card"><div class="empty" style="padding:24px">'+esc((r&&r.error)||'Could not load samples.')+'</div></div>'; }
    }, function(){ OPS.loading=false; });
  }

  /* ============================================================ popup 1 — collect sample
     Five required fields (patient, mobile, tests, amount, collected by) plus the prescription.
     Age/sex, address, remarks and the sample photo are optional.
     Offline: the row saves to the outbox immediately; attachments need a connection, so the file
     rows say so rather than failing silently, and the prescription stops being mandatory. */
  window.openCollectSample=function(after){
    if(!canCollect()){ toast('Your role cannot record a sample collection.',true); return; }
    var offline=(navigator.onLine===false);
    var brs=((window.S&&S.meta&&S.meta.branches)||[]);
    var brField=canViewAll()
      ? '<div class="field"><label>Branch *</label><select id="scBranch" class="in">'+
        brs.map(function(b){ return '<option value="'+esc(b.BranchID)+'"'+(String(b.BranchID)===String(OPS.branch||u().Branch)?' selected':'')+'>'+esc(b.BranchName)+'</option>'; }).join('')+'</select></div>'
      : '';
    var body='<div class="grid2">'+
      '<div class="field"><label>Patient name *</label><input id="scName" class="in" autocomplete="off" placeholder="Divya Patel"></div>'+
      '<div class="field"><label>Mobile *</label><input id="scMob" class="in" type="tel" inputmode="numeric" maxlength="10" placeholder="9825011223"></div>'+
      '<div class="field full"><label>Tests * <span class="muted">comma separated</span></label>'+
        '<input id="scTests" class="in" placeholder="CBC, TSH"><div class="ops-tsug" id="scSug"></div></div>'+
      '<div class="field"><label>Amount (&#8377;) *</label><input id="scAmt" class="in" type="number" inputmode="numeric" placeholder="850"></div>'+
      brField+
      '<div class="field"><label>Collected by *</label><select id="scWho" class="in"><option value="">Loading…</option></select></div>'+
      '<div class="field"><label>Age / sex <span class="muted">optional</span></label>'+
        '<div class="row2"><input id="scAge" class="in" type="number" inputmode="numeric" placeholder="32">'+
        '<select id="scSex" class="in"><option value="">—</option><option>Female</option><option>Male</option><option>Other</option></select></div></div>'+
      '<div class="field full"><label>Address <span class="muted">optional</span></label><input id="scAddr" class="in" placeholder="Adajan, Surat"></div>'+
      '<div class="field full"><label>Remarks <span class="muted">optional</span></label><input id="scRem" class="in" placeholder="Fasting sample, 2 vials"></div>'+
      '<div class="field"><label>Prescription '+(offline?'<span class="muted">needs a connection</span>':'*')+'</label>'+
        '<label class="dl-file"><span id="scRxSt">&#128206; Attach prescription</span><input id="scRx" type="file" accept="application/pdf,image/*" hidden'+(offline?' disabled':'')+'></label></div>'+
      '<div class="field"><label>Sample photo <span class="muted">optional</span></label>'+
        '<label class="dl-file"><span id="scPhSt">&#128247; Attach photo</span><input id="scPh" type="file" accept="image/*" hidden'+(offline?' disabled':'')+'></label></div>'+
    '</div>'+
    '<div class="ops-offnote">'+(offline
        ? '&#9888; You are offline. The sample saves on this device and syncs automatically — attachments can be added once you reconnect.'
        : '&#9729; Saves offline too: if the connection drops mid-save it is queued and synced automatically.')+'</div>'+
    '<div id="scMsg"></div>';

    openModal('Collect sample', body, '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="scSave">Save sample</button>');

    var st={rxUrl:'',photoUrl:''};

    /* v310 — WHY THIS LIST WAS NEARLY EMPTY, AND WHY IT IS NOW FETCHED.
       It used to filter the employee directory the client already had in memory, down to the branch
       picked above. Two things broke it: a technician is not allowed to list employees at all, so
       that directory is usually empty or partial; and scoping to the picked branch meant choosing
       Corporate Office showed only head-office staff. The result was a dropdown with two names in it.
       The server now answers the question directly — every collector-role member of the Udhna and
       Corporate Office branches, grouped by branch, independent of the branch picked. */
    function fillWho(){
      var sel=$id('scWho'); if(!sel) return;
      var me=String(u().EmpID||'');
      sel.innerHTML='<option value="'+esc(me)+'">'+esc(u().FullName||'Me')+' (me)</option>';
      API.opsCollectors().then(function(r){
        var s2=$id('scWho'); if(!s2) return;
        if(!(r&&r.ok&&r.collectors&&r.collectors.length)) return;   /* keep the "me" fallback */
        var groups=[], byBr={};
        r.collectors.forEach(function(c){
          if(!byBr[c.branchId]){ byBr[c.branchId]={name:c.branchName,list:[]}; groups.push(c.branchId); }
          byBr[c.branchId].list.push(c);
        });
        s2.innerHTML=groups.map(function(bid){
          var g=byBr[bid];
          return '<optgroup label="'+esc(g.name)+'">'+g.list.map(function(c){
            return '<option value="'+esc(c.empId)+'"'+(c.empId===me?' selected':'')+'>'+
              esc(c.name)+(c.role?(' \u00b7 '+esc(c.role)):'')+'</option>';
          }).join('')+'</optgroup>';
        }).join('');
        /* combo.js mirrors every <select> into a visible input; refresh that mirror or it keeps
           showing the single placeholder name this list has just replaced. */
        try{
          var wrap=s2.closest&&s2.closest('.cmb-wrap'), mir=wrap&&wrap.querySelector('.cmb-input');
          if(mir){ var o=s2.options[s2.selectedIndex]; mir.value=o?o.textContent:''; }
        }catch(e){}
      });
    }
    fillWho();

    /* Test shortcuts — tapping one appends it, so the common panels are two taps not typing. */
    var COMMON=['CBC','TSH','LFT','KFT','Lipid profile','HbA1c','Urine routine','Vitamin D','Thyroid profile'];
    var sug=$id('scSug');
    if(sug){
      sug.innerHTML=COMMON.map(function(t){ return '<button type="button" class="ops-tag" data-t="'+esc(t)+'">'+esc(t)+'</button>'; }).join('');
      sug.querySelectorAll('.ops-tag').forEach(function(b){ b.onclick=function(){
        var i=$id('scTests'), have=i.value.split(',').map(function(x){return x.trim().toLowerCase();}).filter(Boolean);
        var t=b.getAttribute('data-t');
        if(have.indexOf(t.toLowerCase())>=0) return;
        i.value=have.length?(i.value.replace(/,\s*$/,'')+', '+t):t;
      }; });
    }

    function bindUpload(inputId,stId,key,label){
      var inp=$id(inputId); if(!inp) return;
      inp.onchange=function(){
        var f=this.files[0], input=this; if(!f) return;
        var s=$id(stId);
        API.upload(f,'SampleCollection/'+(new Date()).toISOString().slice(0,10),function(m){ s.textContent=m; })
          .then(function(r){ st[key]=r.url; s.innerHTML='&#10003; '+esc(f.name)+' — tap to replace'; },
                function(e){ s.innerHTML='<span style="color:#A32D2D">'+esc((e&&e.message)||'Upload failed')+'</span> — tap to retry'; input.value=''; });
      };
    }
    bindUpload('scRx','scRxSt','rxUrl');
    bindUpload('scPh','scPhSt','photoUrl');

    $id('scSave').onclick=function(){
      var btn=this;
      function bad(m){ $id('scMsg').innerHTML='<div class="msg error">'+esc(m)+'</div>'; }
      var name=($id('scName').value||'').trim();
      var mob=($id('scMob').value||'').replace(/[^0-9]/g,'');
      var tests=($id('scTests').value||'').trim();
      var amt=$id('scAmt').value;
      if(!name) return bad('Enter the patient name.');
      if(mob.length!==10) return bad('Enter a 10-digit mobile number.');
      if(!tests) return bad('Add at least one test.');
      if(amt===''||isNaN(Number(amt))) return bad('Enter the amount.');
      /* Required when there is a connection to upload it with; skipped when offline, because the
         alternative is a technician standing in a stairwell unable to record the sample at all. */
      if(!st.rxUrl && navigator.onLine!==false) return bad('Attach the prescription.');
      $id('scMsg').innerHTML='';
      btn.disabled=true;
      API.saveSample({
        clientId:clientId(),
        branchId:($id('scBranch')?$id('scBranch').value:'')||String(u().Branch||''),
        patientName:name, mobile:mob, tests:tests, amount:Number(amt),
        collectedByEmpId:($id('scWho')||{}).value||'',
        age:($id('scAge').value||'').trim(), sex:($id('scSex').value||''),
        address:($id('scAddr').value||'').trim(), remarks:($id('scRem').value||'').trim(),
        rxUrl:st.rxUrl, photoUrl:st.photoUrl
      }).then(function(r){
        if(r&&r.ok){
          closeModal();
          toast(r.offline ? 'Saved on this device — it will sync automatically.'
                          : 'Sample '+(r.sampleId||'')+' saved. The front desk has been given the report task.');
          /* the send task now exists server-side — pull it so it shows in My Tasks without a reload */
          if(API.refreshTasks) try{ API.refreshTasks(); }catch(e){}
          if(typeof after==='function') after(r);
        } else { btn.disabled=false; bad((r&&r.error)||'Could not save.'); }
      }, function(e){ btn.disabled=false; bad((e&&e.message)||'Could not save.'); });
    };
    setTimeout(function(){ var n=$id('scName'); if(n) n.focus(); },60);
  };

  /* ============================================================ popup 2 — send report
     Opened from the task in My Tasks, or from the detail panel. Everything needed is already on
     screen: the patient's number, the prescription, and the report once attached. */
  window.openSendReport=function(sampleId, taskId, after){
    openModal('Send report to patient','<div id="srBox" class="center-load"><span class="loader dark"></span> Loading…</div>','<button class="btn ghost" onclick="closeModal()">Close</button>');
    API.getSample(sampleId).then(function(r){
      if(!(r&&r.ok&&r.sample)){ var b=$id('srBox'); if(b) b.innerHTML='<div class="msg error">'+esc((r&&r.error)||'Could not load the sample.')+'</div>'; return; }
      paintSend(r.sample, !!r.canSend, taskId, after);
    });
  };
  function paintSend(s, canSend, taskId, after){
    var sent=(s.status==='sent');
    var kv=[
      ['Tests', esc(s.tests)],
      ['Collected', esc(s.collectedAt||'')+(s.collectedByName?(' · '+esc(s.collectedByName)):'')],
      ['Amount', '&#8377;'+money(s.amount)],
      ['Prescription', fileLink(s.rxUrl,'prescription')],
      ['Report', '<span id="srRep">'+(s.reportUrl?fileLink(s.reportUrl,'report'):'<span class="muted">not attached</span>')+'</span>']
    ];
    if(!sent && s.pendingHours) kv.push(['Waiting', '<span class="'+(s.pendingHours>=24?'ops-late-txt':'')+'">'+esc(waitLabel(s.pendingHours))+'</span>']);
    if(sent) kv.push(['Sent', esc(s.sentVia||'')+(s.sentAt?(' · '+esc(s.sentAt)):'')+(s.sentByName?(' · '+esc(s.sentByName)):'')]);

    var body='<div class="ops-pcard"><b>'+esc(s.patientName)+'</b> <span class="ops-sid">'+esc(s.sampleId)+'</span>'+
      '<div class="ops-dm">'+esc([[s.age,s.sex].filter(Boolean).join(' '), s.mobile, s.address].filter(Boolean).join(' · ')||'—')+'</div></div>'+
      '<table class="ops-kv">'+kv.map(function(x){ return '<tr><td>'+x[0]+'</td><td>'+x[1]+'</td></tr>'; }).join('')+'</table>';

    if(sent){
      body+='<div class="ops-offnote">&#10003; This report has already been sent. Nothing further to do.</div>';
      $id('srBox').outerHTML='<div>'+body+'</div>';
      return;
    }
    if(!canSend){
      body+='<div class="ops-offnote">Only the collector, their branch manager or head office can send this report.</div>';
      $id('srBox').outerHTML='<div>'+body+'</div>';
      return;
    }
    /* v313: the "Send via" chips are gone and the report is optional, both at your request. The one
       thing that went with them is the WhatsApp hand-off — there is no longer a mode to key it on, so
       "Send and complete" now records the send rather than opening WhatsApp with the message written. */
    body+='<div class="field" style="margin-top:12px"><label>Attach report <span class="muted">optional</span></label>'+
        '<label class="dl-file"><span id="srUpSt">&#128206; Attach report (PDF)</span><input id="srUp" type="file" accept="application/pdf,image/*" hidden></label></div>'+
      '<div id="srMsg"></div>';

    var box=$id('srBox'); box.outerHTML='<div id="srWrap">'+body+'</div>';
    var foot=document.querySelector('#modalRoot .modal-foot');
    if(foot) foot.innerHTML='<button class="btn ghost" onclick="closeModal()">Close</button><button class="btn" id="srSend">Send and complete</button>';

    var state={ via:'', reportUrl:s.reportUrl||'' };
    var up=$id('srUp');
    if(up) up.onchange=function(){
      var f=this.files[0], input=this; if(!f) return; var st=$id('srUpSt');
      API.upload(f,'SampleReports/'+String(s.sampleId||''),function(m){ st.textContent=m; })
        .then(function(r){ state.reportUrl=r.url; st.innerHTML='&#10003; '+esc(f.name)+' — tap to replace';
                           var rp=$id('srRep'); if(rp) rp.innerHTML=fileLink(r.url,'report'); },
              function(e){ st.innerHTML='<span style="color:#A32D2D">'+esc((e&&e.message)||'Upload failed')+'</span> — tap to retry'; input.value=''; });
    };

    $id('srSend').onclick=function(){
      var btn=this;
      function bad(m){ $id('srMsg').innerHTML='<div class="msg error">'+esc(m)+'</div>'; btn.disabled=false; }
      btn.disabled=true; $id('srMsg').innerHTML='';
      API.sendSampleReport(s.sampleId,{via:state.via, reportUrl:state.reportUrl}).then(function(r){
        if(!(r&&r.ok)) return bad((r&&r.error)||'Could not send.');
        closeModal();
        toast('Report sent — the task is closed.');
        if(window.renderMyTasks) try{ window.renderMyTasks(); }catch(e){}
        if(typeof after==='function') after(r);
        if(String(window.currentPage||'')==='ops') load(true);
      }, function(e){ bad((e&&e.message)||'Could not send.'); });
    };
  }

  /* ============================================================ dashboard card
     Two stages, the average collection-to-send time, and the one number that matters most: how long
     the oldest unsent report has been waiting. */
  /* Who the sample-collection board is FOR. Collectors, plus the people who only watch it. Kept in
     one place because app.js gates the menu entry on it and the dashboard card gates itself on it —
     two copies of this rule would drift, and the drift shows up as a card of zeros on the dashboard
     of someone who has never touched a sample. */
  window.opsCanSee=function(){
    var p=perms();
    return !!(p.level==='SUPER'||p.canViewAll||p.level==='BRANCH_MGR'||p.level==='BRANCH_VIEW'||canCollect());
  };

  window.opsDashCard=function(host, branch){
    if(!host) return;
    /* Return BEFORE the request, not after it. Every dashboard repaint would otherwise put a call on
       the wire for a House Help who cannot see the module at all. */
    if(!window.opsCanSee()){ host.innerHTML=''; return; }
    API.opsSummary(branch||'').then(function(r){
      if(!(r&&r.ok)){ host.innerHTML=''; return; }
      var late=(r.overdue>0);
      host.innerHTML='<div class="section-label" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'+
          'Samples and reports'+
          '<span style="font-size:11px;color:#888;font-weight:400">collected &#8594; result &#8594; verified &#8594; sent</span>'+
          '<span class="spacer" style="flex:1"></span>'+
          '<button class="btn ghost sm" id="opsGo">Open module &#8599;</button></div>'+
        '<div class="card ops-dash">'+
          '<div class="ops-dash-row">'+
            '<div class="ops-dash-t collected"><div class="n">'+(r.pending||0)+'</div><div class="l">Collected · report pending</div></div>'+
            '<div class="ops-dash-arrow">&#8594;</div>'+
            '<div class="ops-dash-t sent"><div class="n">'+(r.sentToday||0)+'</div><div class="l">Sent today</div></div>'+
          '</div>'+
          '<div class="ops-dash-foot">'+
            '<span>Collection to send <b>'+(r.avgHours||0)+' h</b> avg · same day <b>'+(r.sameDayPct||0)+'%</b></span>'+
            (late?'<span class="ops-late-txt">&#9888; '+r.overdue+' waiting over 24 h'+(r.worstPendingHours?(' · oldest '+waitLabel(r.worstPendingHours)):'')+'</span>':'<span class="muted">nothing overdue</span>')+
          '</div>'+
        '</div>';
      var g=$id('opsGo'); if(g) g.onclick=function(){ if(window.go) window.go('ops'); };
    }, function(){ host.innerHTML=''; });
  };
})();

/* ============================================================================================
 *  v314 — THE FIVE-STAGE PIPELINE, CLIENT SIDE
 *
 *    ordered -> collected -> result -> verified -> sent
 *
 *  Two doors in: "Collect sample" (walk-in, already built) and "Order to delivery" (home visit).
 *  After that both records are identical and move through the same three popups.
 *
 *  Everything from `visit` onwards arrives as a task — nobody goes looking for work.
 * ============================================================================================ */
(function(){
  function $id(i){ return document.getElementById(i); }
  function money(n){ return (Number(n)||0).toLocaleString('en-IN'); }
  function u(){ return (window.S&&S.user)||{}; }
  function perms(){ return (window.S&&S.perms)||{}; }

  var ORDER_ROLES=['CRM','Branch Manager','Operations Manager'];
  window.opsCanOrder=function(){
    if(perms().level==='SUPER') return true;
    return ORDER_ROLES.indexOf(String(u().Role||'').trim())>=0;
  };

  function cid(){ var r=''; for(var i=0;i<16;i++) r+=(Math.random()*16|0).toString(16); return 'ORD'+Date.now().toString(36)+r; }
  function nowHHMM(){ var d=new Date(); return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); }
  function fileLink(url,label){
    if(!url) return '<span class="muted">not attached</span>';
    return '<a href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(label)+'</a>';
  }
  function stageStrip(s){
    var STAGES=[['ordered','Ordered'],['collected','Collected'],['result','Result'],['verified','Verified'],['sent','Sent']];
    var at=Number(s.stageIdx||0), isWalk=(String(s.type||'walkin')==='walkin');
    return '<div class="ops-stage2">'+STAGES.map(function(x,i){
      if(i===0 && isWalk) return '';                       /* a walk-in never had an order */
      var cls=(i<at)?'done':(i===at?'now':'todo');
      return '<span class="ops-st2 '+cls+'">'+(i<at?'&#10003; ':'')+esc(x[1])+'</span>';
    }).join('<i class="ops-st2-sep"></i>')+'</div>';
  }
  function lateLabel(m){
    if(m==='' || m===null || m===undefined) return '';
    m=Number(m);
    if(m<=0) return '<span style="color:var(--ok)">on time</span>';
    return '<span class="ops-late-txt">'+(m>=60?(Math.floor(m/60)+' h '+(m%60)+' m'):(m+' min'))+' late</span>';
  }
  /* Every stage popup is the same shape: load the record, draw it, act on it. */
  function openStage(sampleId, title, build){
    openModal(title,'<div id="osBox" class="center-load"><span class="loader dark"></span> Loading…</div>',
      '<button class="btn ghost" onclick="closeModal()">Close</button>');
    API.getSample(sampleId).then(function(r){
      var box=$id('osBox'); if(!box) return;
      if(!(r&&r.ok&&r.sample)){ box.innerHTML='<div class="msg error">'+esc((r&&r.error)||'Could not load it.')+'</div>'; return; }
      build(r.sample, r);
    });
  }
  function setFoot(html){ var f=document.querySelector('#modalRoot .modal-foot'); if(f) f.innerHTML=html; }
  function patientCard(s){
    var who=[s.age,s.sex].filter(Boolean).join(' ');
    return '<div class="ops-pcard"><b>'+esc(s.patientName)+'</b> <span class="ops-sid">'+esc(s.sampleId)+'</span>'+
      '<div class="ops-dm">'+esc([who,s.mobile].filter(Boolean).join(' · ')||'—')+'</div>'+
      (s.address?'<div class="ops-dm" style="margin-top:3px"><a href="https://maps.google.com/?q='+encodeURIComponent(s.address)+'" target="_blank" rel="noopener">'+esc(s.address)+'</a></div>':'')+
      (s.remarks?'<div class="ops-dm" style="margin-top:3px">'+esc(s.remarks)+'</div>':'')+'</div>';
  }
  function kv(rows){
    return '<table class="ops-kv">'+rows.filter(Boolean).map(function(r){
      return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>'; }).join('')+'</table>';
  }
  function upload(inputId,stId,sub,onDone){
    var inp=$id(inputId); if(!inp) return;
    inp.onchange=function(){
      var f=this.files[0], input=this; if(!f) return; var st=$id(stId);
      API.upload(f,sub,function(m){ st.textContent=m; }).then(function(r){
        st.innerHTML='&#10003; '+esc(f.name)+' — tap to replace'; onDone(r.url);
      },function(e){
        st.innerHTML='<span style="color:#A32D2D">'+esc((e&&e.message)||'Upload failed')+'</span> — tap to retry'; input.value='';
      });
    };
  }

  /* ------------------------------------------------------------------ B · new order */
  window.openNewOrder=function(after){
    if(!window.opsCanOrder()){ toast('Your role cannot take a home-visit order.',true); return; }
    var brs=((window.S&&S.meta&&S.meta.branches)||[]);
    var canPick=!!(perms().canViewAll||perms().level==='SUPER');
    var body='<div class="grid2">'+
      '<div class="field"><label>Patient name *</label><input id="odName" class="in" placeholder="Divya Patel"></div>'+
      '<div class="field"><label>Mobile *</label><input id="odMob" class="in" type="tel" inputmode="numeric" maxlength="10" placeholder="9825011223"></div>'+
      '<div class="field full"><label>Tests *</label><input id="odTests" class="in" placeholder="CBC, LFT"><div class="ops-tsug" id="odSug"></div></div>'+
      '<div class="field"><label>Amount (&#8377;) *</label><input id="odAmt" class="in" type="number" inputmode="numeric" placeholder="850"></div>'+
      '<div class="field"><label>Appointment time *</label><input id="odWhen" class="in" type="time"></div>'+
      '<div class="field full"><label>Address *</label><input id="odAddr" class="in" placeholder="204 Sun Residency, Adajan, Surat"></div>'+
      (canPick?'<div class="field"><label>Branch</label><select id="odBranch" class="in">'+brs.map(function(b){ return '<option value="'+esc(b.BranchID)+'"'+(String(b.BranchID)===String(u().Branch)?' selected':'')+'>'+esc(b.BranchName)+'</option>'; }).join('')+'</select></div>':'')+
      '<div class="field"><label>Phlebotomist *</label><select id="odWho" class="in"><option>Loading…</option></select></div>'+
      '<div class="field"><label>Handed over at</label><div class="ops-stamp-ro" id="odNow">'+nowHHMM()+' · stamped automatically</div></div>'+
      '<div class="field"><label>Age / sex <span class="muted">optional</span></label><div class="row2"><input id="odAge" class="in" type="number" placeholder="32"><select id="odSex" class="in"><option value="">—</option><option>Female</option><option>Male</option><option>Other</option></select></div></div>'+
      '<div class="field full"><label>Notes <span class="muted">optional</span></label><input id="odNote" class="in" placeholder="Call before arriving"></div>'+
    '</div><div class="ops-offnote">The clock starts at <b>handed over</b>. Everything measured about this visit counts from that stamp, which is why it is not typed.</div><div id="odMsg"></div>';
    openModal('New order', body, '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="odSave">Save order</button>');

    var COMMON=['CBC','TSH','LFT','KFT','Lipid profile','HbA1c','Urine routine','Vitamin D'];
    var sug=$id('odSug');
    if(sug){ sug.innerHTML=COMMON.map(function(t){ return '<button type="button" class="ops-tag" data-t="'+esc(t)+'">'+esc(t)+'</button>'; }).join('');
      sug.querySelectorAll('.ops-tag').forEach(function(b){ b.onclick=function(){
        var i=$id('odTests'), have=i.value.split(',').map(function(x){return x.trim().toLowerCase();}).filter(Boolean), t=b.getAttribute('data-t');
        if(have.indexOf(t.toLowerCase())>=0) return;
        i.value=have.length?(i.value.replace(/,\s*$/,'')+', '+t):t; }; }); }

    function loadPeople(){
      var sel=$id('odWho'); if(!sel) return;
      API.opsPeople(($id('odBranch')||{}).value||'').then(function(r){
        var s2=$id('odWho'); if(!s2) return;
        var list=(r&&r.ok&&r.phlebotomists)||[];
        s2.innerHTML=list.length
          ? list.map(function(e){ return '<option value="'+esc(e.empId)+'">'+esc(e.name)+' · '+(e.today?(e.today+' today'):'free')+'</option>'; }).join('')
          : '<option value="">No phlebotomist available</option>';
        try{ var w=s2.closest&&s2.closest('.cmb-wrap'), m=w&&w.querySelector('.cmb-input');
          if(m){ var o=s2.options[s2.selectedIndex]; m.value=o?o.textContent:''; } }catch(e){}
      });
    }
    loadPeople();
    var bs=$id('odBranch'); if(bs) bs.onchange=loadPeople;

    $id('odSave').onclick=function(){
      var btn=this;
      function bad(m){ $id('odMsg').innerHTML='<div class="msg error">'+esc(m)+'</div>'; btn.disabled=false; }
      var name=($id('odName').value||'').trim(), mob=($id('odMob').value||'').replace(/[^0-9]/g,'');
      var tests=($id('odTests').value||'').trim(), amt=$id('odAmt').value;
      var when=($id('odWhen').value||'').trim(), addr=($id('odAddr').value||'').trim();
      if(!name) return bad('Enter the patient name.');
      if(mob.length!==10) return bad('Enter a 10-digit mobile number.');
      if(!tests) return bad('Add at least one test.');
      if(amt===''||isNaN(Number(amt))) return bad('Enter the amount.');
      if(!when) return bad('Enter the appointment time you promised the patient.');
      if(!addr) return bad('Enter the address — somebody has to find this patient.');
      var who=($id('odWho')||{}).value||'';
      if(!who) return bad('No phlebotomist available to assign this to.');
      btn.disabled=true; $id('odMsg').innerHTML='';
      API.saveOrder({ clientId:cid(), branchId:($id('odBranch')||{}).value||'', patientName:name, mobile:mob,
        tests:tests, amount:Number(amt), appointmentAt:when, address:addr, assignedToEmpId:who,
        age:($id('odAge').value||'').trim(), sex:($id('odSex').value||''), remarks:($id('odNote').value||'').trim()
      }).then(function(r){
        if(r&&r.ok){ closeModal();
          toast(r.offline?'Saved on this device — it will sync automatically.':'Order '+(r.sampleId||'')+' saved. The phlebotomist has been given the visit.');
          if(API.refreshTasks) try{ API.refreshTasks(); }catch(e){}
          if(typeof after==='function') after(r);
        } else { bad((r&&r.error)||'Could not save.'); }
      },function(e){ bad((e&&e.message)||'Could not save.'); });
    };
    setTimeout(function(){ var n=$id('odName'); if(n) n.focus(); },60);
  };

  /* ------------------------------------------------------------------ C · the visit */
  window.openHomeVisit=function(sampleId, after){
    openStage(sampleId,'Home visit', function(s){
      var reached={t:s.reachedAt?String(s.reachedAt).slice(11,16):'' , doc:s.visitDocUrl||''};
      var html=patientCard(s)+
        kv([['Tests',esc(s.tests)],['Appointment',esc(s.appointmentAt||'—')],['Given to you',esc(s.assignedAt||'—')]])+
        '<div class="fld-lab">Reached the patient</div>'+
        '<div class="ops-stamp" id="hvStamp">'+
          (reached.t?('<div class="t">'+esc(reached.t)+'</div><div class="s">tap to re-stamp</div>')
                    :('<div class="t">--:--</div><div class="s">tap when you arrive</div>'))+'</div>'+
        '<div class="fld-lab">Payment</div>'+
        '<div class="ops-pay">'+
          '<div class="c"><div class="l">Total</div><div class="v">&#8377;'+money(s.amount)+'</div></div>'+
          '<div class="c on"><div class="l">Received</div><input id="hvRec" class="in" type="number" inputmode="numeric" value="'+(s.receivedAmount===''?'':esc(s.receivedAmount))+'" placeholder="0"></div>'+
          '<div class="c due"><div class="l">Pending</div><div class="v" id="hvDue">&#8377;'+money(s.amount)+'</div></div>'+
        '</div><div class="ops-hint">You type only what you took. Pending works itself out.</div>'+
        '<div class="fld-lab">Attach document <span class="muted">optional</span></div>'+
        '<label class="dl-file"><span id="hvDocSt">'+(reached.doc?'&#10003; attached — tap to replace':'&#128206; Prescription, receipt or photo')+'</span><input id="hvDoc" type="file" accept="image/*,application/pdf" hidden></label>'+
        '<div class="fld-lab">Remarks <span class="muted">optional</span></div><input id="hvRem" class="in" value="'+esc(s.remarks||'')+'">'+
        stageStrip(s)+'<div id="hvMsg"></div>';
      $id('osBox').outerHTML='<div id="hvWrap">'+html+'</div>';
      setFoot('<button class="btn ghost" onclick="closeModal()">Close</button><button class="btn" id="hvDone">Complete visit</button>');

      function recalc(){
        var got=Number(($id('hvRec')||{}).value)||0;
        var due=Math.max(0,(Number(s.amount)||0)-got);
        $id('hvDue').innerHTML='&#8377;'+money(due);
      }
      $id('hvRec').addEventListener('input',recalc); recalc();
      $id('hvStamp').onclick=function(){
        reached.t=nowHHMM();
        this.innerHTML='<div class="t">'+esc(reached.t)+'</div><div class="s">tap to re-stamp</div>';
        this.classList.add('on');
      };
      upload('hvDoc','hvDocSt','HomeVisit/'+String(s.sampleId||''),function(url){ reached.doc=url; });

      $id('hvDone').onclick=function(){
        var btn=this;
        function bad(m){ $id('hvMsg').innerHTML='<div class="msg error">'+esc(m)+'</div>'; btn.disabled=false; }
        if(!reached.t) return bad('Stamp the time you reached the patient first.');
        var got=Number(($id('hvRec')||{}).value)||0;
        if(got>(Number(s.amount)||0)) return bad('Received cannot be more than the total.');
        btn.disabled=true; $id('hvMsg').innerHTML='';
        API.completeVisit(s.sampleId,{ reachedAt:reached.t, receivedAmount:got,
          visitDocUrl:reached.doc, remarks:($id('hvRem').value||'').trim() }).then(function(r){
          if(!(r&&r.ok)) return bad((r&&r.error)||'Could not save.');
          closeModal(); toast('Visit completed — the lab has been given the sample.');
          if(window.renderMyTasks) try{ window.renderMyTasks(); }catch(e){}
          if(typeof after==='function') after(r);
        },function(e){ bad((e&&e.message)||'Could not save.'); });
      };
    });
  };

  /* ------------------------------------------------------------------ D · the result */
  window.openSubmitResult=function(sampleId, after){
    openStage(sampleId,'Submit result', function(s){
      var st={url:s.resultUrl||''};
      var html=patientCard(s)+
        kv([['Tests',esc(s.tests)],
            ['Collected by',esc(s.collectedByName||'—')+(s.collectedAt?(' · '+esc(s.collectedAt)):'')],
            [s.pendingHours?'Waiting':'', s.pendingHours?('<span class="'+(s.pendingHours>=24?'ops-late-txt':'')+'">'+esc(waitLabel(s.pendingHours))+'</span>'):''],
            ['Prescription',fileLink(s.rxUrl,'prescription')],
            s.verifyNote?['Sent back','<span class="ops-late-txt">'+esc(s.verifyNote)+'</span>']:null])+
        '<div class="fld-lab">Result file *</div>'+
        '<label class="dl-file"><span id="srsSt">'+(st.url?'&#10003; attached — tap to replace':'&#128228; Attach result (PDF)')+'</span><input id="srsUp" type="file" accept="application/pdf,image/*" hidden></label>'+
        '<div class="fld-lab">Remarks for the verifier <span class="muted">optional</span></div>'+
        '<input id="srsRem" class="in" value="'+esc(s.labRemark||'')+'" placeholder="Anything they should know">'+
        stageStrip(s)+'<div id="srsMsg"></div>';
      $id('osBox').outerHTML='<div id="srsWrap">'+html+'</div>';
      setFoot('<button class="btn ghost" onclick="closeModal()">Close</button><button class="btn" id="srsGo">Submit for verification</button>');
      upload('srsUp','srsSt','Results/'+String(s.sampleId||''),function(url){ st.url=url; });
      $id('srsGo').onclick=function(){
        var btn=this;
        function bad(m){ $id('srsMsg').innerHTML='<div class="msg error">'+esc(m)+'</div>'; btn.disabled=false; }
        if(!st.url) return bad('Attach the result first.');
        btn.disabled=true; $id('srsMsg').innerHTML='';
        API.submitResult(s.sampleId,{resultUrl:st.url, labRemark:($id('srsRem').value||'').trim()}).then(function(r){
          if(!(r&&r.ok)) return bad((r&&r.error)||'Could not submit.');
          closeModal(); toast('Result submitted — it has gone for verification.');
          if(window.renderMyTasks) try{ window.renderMyTasks(); }catch(e){}
          if(typeof after==='function') after(r);
        },function(e){ bad((e&&e.message)||'Could not submit.'); });
      };
    });
  };

  /* ------------------------------------------------------------------ E · verify, or send it back */
  window.openVerifyReport=function(sampleId, after){
    openStage(sampleId,'Verify report', function(s){
      var html=patientCard(s)+
        kv([['Tests',esc(s.tests)],
            ['Collected',esc(s.collectedAt||'—')+(s.collectedByName?(' · '+esc(s.collectedByName)):'')],
            ['Result submitted',esc(s.resultAt||'—')+(s.resultByName?(' · '+esc(s.resultByName)):'')],
            ['Result file',fileLink(s.resultUrl,'result')],
            ['Prescription',fileLink(s.rxUrl,'prescription')]])+
        (s.labRemark?'<div class="ops-remark"><b>Lab remark</b> · '+esc(s.labRemark)+'</div>':'')+
        '<div class="fld-lab">Note <span class="muted">required if you send it back</span></div>'+
        '<input id="vrNote" class="in" placeholder="What is wrong with it">'+
        '<div class="ops-hint">This is a completeness check, not a medical sign-off.</div>'+
        stageStrip(s)+'<div id="vrMsg"></div>';
      $id('osBox').outerHTML='<div id="vrWrap">'+html+'</div>';
      setFoot('<button class="btn ghost" onclick="closeModal()">Close</button>'+
        '<button class="btn ghost" id="vrBack" style="color:#A32D2D;border-color:#e3b1b1">Send back to lab</button>'+
        '<button class="btn" id="vrOk">Verify</button>');
      function bad(m,btn){ $id('vrMsg').innerHTML='<div class="msg error">'+esc(m)+'</div>'; if(btn) btn.disabled=false; }
      $id('vrBack').onclick=function(){
        var btn=this, note=($id('vrNote').value||'').trim();
        if(!note) return bad('Write what is wrong with it before sending it back.');
        btn.disabled=true;
        API.verifyReport(s.sampleId,{sendBack:true, note:note}).then(function(r){
          if(!(r&&r.ok)) return bad((r&&r.error)||'Could not send it back.',btn);
          closeModal(); toast('Sent back to the lab with your note.');
          if(window.renderMyTasks) try{ window.renderMyTasks(); }catch(e){}
          if(typeof after==='function') after(r);
        },function(e){ bad((e&&e.message)||'Failed.',btn); });
      };
      $id('vrOk').onclick=function(){
        var btn=this; btn.disabled=true; $id('vrMsg').innerHTML='';
        API.verifyReport(s.sampleId,{note:($id('vrNote').value||'').trim()}).then(function(r){
          if(!(r&&r.ok)) return bad((r&&r.error)||'Could not verify.',btn);
          closeModal(); toast('Verified — the report desk can send it.');
          if(window.renderMyTasks) try{ window.renderMyTasks(); }catch(e){}
          if(typeof after==='function') after(r);
        },function(e){ bad((e&&e.message)||'Failed.',btn); });
      };
    });
  };

  function waitLabel(h){
    if(!h) return '';
    if(h<1) return 'just now';
    if(h<24) return h+' h';
    var d=Math.floor(h/24); return d+(d===1?' day':' days');
  }
  window.opsStageStrip=stageStrip;
  window.opsLateLabel=lateLabel;
})();
