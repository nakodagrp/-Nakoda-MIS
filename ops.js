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
    var btn=canCollect()?'<button class="btn" id="opsNew">+ Collect sample</button>':'';
    return '<div class="page-head"><h1>Sample collection</h1>'+
      '<div class="ops-sub">Operations · process 1 of 5</div><div class="spacer"></div>'+
      picker+'<input id="opsYm" type="month" class="in" style="max-width:150px" value="'+esc(OPS.ym)+'">'+
      '<button class="btn ghost sm" id="opsRefresh">&#8635;</button>'+btn+'</div>'+
      '<div id="opsBody">'+inner+'</div>';
  }
  function bodyHtml(){
    var c=OPS.counts||{};
    var chips='<div class="ops-chips">'+
      chip('all','All',c.all)+chip('collected','Collected',c.collected)+chip('sent','Sent',c.sent)+
      (c.overdue?'<span class="ops-chip late" style="margin-left:2px">'+c.overdue+' over 24 h</span>':'')+'</div>';
    if(!OPS.samples.length)
      return chips+'<div class="card"><div class="empty" style="padding:26px">No samples for this month yet.'+
        (canCollect()?' Tap <b>+ Collect sample</b> to record one.':'')+'</div></div>';
    var sel=selected();
    return chips+'<div class="ops-split">'+
      '<div class="ops-list">'+OPS.samples.map(rowHtml).join('')+'</div>'+
      '<div class="ops-detail" id="opsDetail">'+(sel?detailHtml(sel):'<div class="empty" style="padding:26px">Pick a sample from the list.</div>')+'</div>'+
    '</div>';
  }
  var FILTER='all';
  function chip(k,label,n){
    return '<button class="ops-fchip'+(FILTER===k?' on':'')+'" data-f="'+k+'">'+esc(label)+' '+(n||0)+'</button>';
  }
  function visible(){
    return OPS.samples.filter(function(s){ return FILTER==='all'||s.status===FILTER; });
  }
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
      ? ('Sent · '+esc(s.sentVia||'')+(s.sentAt?(' · '+esc(s.sentAt.slice(5,10))):''))
      : ('Collected · &#8377;'+money(s.amount)+(s.pendingHours>=24?(' · waiting '+waitLabel(s.pendingHours)):''));
    var cls='ops-row'+(on?' on':'')+(s.status!=='sent'&&s.pendingHours>=24?' late':'');
    return '<div class="'+cls+'" data-sid="'+esc(s.sampleId)+'">'+
      '<div class="ops-row-n">'+esc(s.patientName)+'</div>'+
      '<div class="ops-row-s'+(s.status==='sent'?' done':(s.pendingHours>=24?' late':''))+'">'+sub+'</div></div>';
  }
  function detailHtml(s){
    var stage='<div class="ops-stage">'+
      '<span class="ops-st done">&#10003; Collected</span><span class="ops-st-line"></span>'+
      (s.status==='sent'?'<span class="ops-st done">&#10003; Sent</span>':'<span class="ops-st todo">Sent</span>')+
    '</div>';
    var who=[s.age,s.sex].filter(Boolean).join(' ');
    var meta=[who,s.mobile,s.address].filter(Boolean).join(' · ');
    var rows=[
      ['Tests', esc(s.tests)],
      ['Amount', '&#8377;'+money(s.amount)],
      ['Branch', esc(s.branchName||s.branchId)],
      ['Collected by', esc(s.collectedByName||'—')],
      ['Collected at', esc(s.collectedAt||'—')],
      (s.status==='sent'
        ? ['Sent', esc(s.sentVia||'')+(s.sentAt?(' · '+esc(s.sentAt)):'')+(s.sentByName?(' · '+esc(s.sentByName)):'')]
        : ['Pending for', '<span class="'+(s.pendingHours>=24?'ops-late-txt':'')+'">'+esc(waitLabel(s.pendingHours)||'just now')+'</span>']),
      ['Prescription', fileLink(s.rxUrl,'prescription')],
      ['Sample photo', fileLink(s.photoUrl,'photo')],
      ['Report', fileLink(s.reportUrl,'report')]
    ];
    if(s.remarks) rows.push(['Remarks', esc(s.remarks)]);
    var act=(s.status==='sent')
      ? '<button class="btn ghost" id="opsReopenNote" disabled>Report sent</button>'
      : '<button class="btn" id="opsSend">Send report</button>';
    return '<div class="ops-dh"><b>'+esc(s.patientName)+'</b> <span class="ops-sid">'+esc(s.sampleId)+'</span></div>'+
      '<div class="ops-dm">'+esc(meta||'—')+'</div>'+stage+
      '<table class="ops-kv">'+rows.map(function(r){ return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>'; }).join('')+'</table>'+
      '<div class="ops-acts">'+act+'</div>';
  }
  function wirePage(){
    var b=$id('opsNew'); if(b) b.onclick=function(){ window.openCollectSample(function(){ load(true); }); };
    var r=$id('opsRefresh'); if(r) r.onclick=function(){ load(true); };
    var bp=$id('opsBranch'); if(bp) bp.onchange=function(){ OPS.branch=this.value; OPS.sel=''; load(true); };
    var ym=$id('opsYm'); if(ym) ym.onchange=function(){ OPS.ym=this.value||thisMonth(); load(true); };
    wireBody();
  }
  function wireBody(){
    document.querySelectorAll('#opsBody .ops-fchip').forEach(function(c){
      c.onclick=function(){ FILTER=c.getAttribute('data-f'); OPS.sel=''; paint(); };
    });
    document.querySelectorAll('#opsBody .ops-row').forEach(function(row){
      row.onclick=function(){ OPS.sel=row.getAttribute('data-sid'); paint(); };
    });
    var sb=$id('opsSend');
    if(sb) sb.onclick=function(){ var s=selected(); if(s) window.openSendReport(s.sampleId,'',function(){ load(true); }); };
  }
  function paint(){
    var host=$id('opsBody'); if(!host) return;
    host.innerHTML=bodyHtml().replace(/^<div class="ops-chips">/,'<div class="ops-chips">');
    wireBody();
  }
  function load(force){
    if(OPS.loading && !force) return;
    OPS.loading=true;
    API.listSamples(OPS.branch, OPS.ym).then(function(r){
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

    /* Who collected it. Branch staff who can physically take a sample, from the chosen branch.
       Defaults to the signed-in person when they are one of them, which is the ordinary case. */
    function fillWho(){
      var sel=$id('scWho'); if(!sel) return;
      var bid=($id('scBranch')?$id('scBranch').value:'')||String(u().Branch||'');
      var dir=(window.S&&S.employees&&S.employees.length?S.employees:null)
            || (window.DASH&&DASH.emps&&DASH.emps.length?DASH.emps:null) || [];
      var emps=dir.filter(function(e){
        return String(e.Status)==='Active' && (!bid||String(e.Branch)===String(bid))
          && COLLECT_ROLES.indexOf(String(e.Role||'').trim())>=0;
      });
      var me=String(u().EmpID||''), meIn=emps.some(function(e){ return String(e.EmpID)===me; });
      if(!meIn && me) emps.unshift({EmpID:me, FullName:(u().FullName||'Me')+' (me)', Role:u().Role});
      sel.innerHTML=emps.length
        ? emps.map(function(e){ return '<option value="'+esc(e.EmpID)+'"'+(String(e.EmpID)===me?' selected':'')+'>'+esc(e.FullName)+'</option>'; }).join('')
        : '<option value="'+esc(me)+'">'+esc(u().FullName||'Me')+'</option>';
    }
    fillWho();
    var bsel=$id('scBranch'); if(bsel) bsel.onchange=fillWho;

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
                          : 'Sample '+(r.sampleId||'')+' saved. "Send report" is now in My Tasks.');
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
      ['Branch', esc(s.branchName||s.branchId)],
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
    body+='<div class="field" style="margin-top:12px"><label>Attach report</label>'+
        '<label class="dl-file"><span id="srUpSt">&#128206; Attach report (PDF)</span><input id="srUp" type="file" accept="application/pdf,image/*" hidden></label></div>'+
      '<div class="field"><label>Send via</label>'+
        '<div class="ops-via">'+
          '<button type="button" class="ops-tag on" data-v="WhatsApp">WhatsApp</button>'+
          '<button type="button" class="ops-tag" data-v="Email">Email</button>'+
          '<button type="button" class="ops-tag" data-v="Hand delivery">Hand delivery</button>'+
        '</div></div>'+
      '<div id="srMsg"></div>';

    var box=$id('srBox'); box.outerHTML='<div id="srWrap">'+body+'</div>';
    var foot=document.querySelector('#modalRoot .modal-foot');
    if(foot) foot.innerHTML='<button class="btn ghost" onclick="closeModal()">Close</button><button class="btn" id="srSend">Send and complete</button>';

    var state={ via:'WhatsApp', reportUrl:s.reportUrl||'' };
    document.querySelectorAll('#srWrap .ops-via .ops-tag').forEach(function(b){
      b.onclick=function(){
        state.via=b.getAttribute('data-v');
        document.querySelectorAll('#srWrap .ops-via .ops-tag').forEach(function(x){ x.classList.toggle('on',x===b); });
      };
    });
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
      if(!state.reportUrl && !/hand/i.test(state.via)) return bad('Attach the report first, or choose Hand delivery.');
      btn.disabled=true; $id('srMsg').innerHTML='';
      API.sendSampleReport(s.sampleId,{via:state.via, reportUrl:state.reportUrl}).then(function(r){
        if(!(r&&r.ok)) return bad((r&&r.error)||'Could not send.');
        closeModal();
        /* WhatsApp opens with the message and the report link already written, so the technician's
           last act is one tap in WhatsApp. No API key, no template approval, works today. */
        if(/whats/i.test(state.via) && s.waNumber){
          var msg='Dear '+(s.patientName||'')+', your Nakoda Diagnostics report'+(s.tests?(' ('+s.tests+')'):'')+' is ready.'+
                  (state.reportUrl?('\n\n'+state.reportUrl):'')+'\n\nThank you.';
          try{ window.open('https://wa.me/'+s.waNumber+'?text='+encodeURIComponent(msg),'_blank','noopener'); }catch(e){}
        }
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
          'Sample collection'+
          '<span style="font-size:11px;color:#888;font-weight:400">collected &#8594; sent</span>'+
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
