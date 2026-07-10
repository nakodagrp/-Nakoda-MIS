/* Nakoda MIS — SALES CRM (new module, separate from Doctor CRM).
   Sales exec captures a Camp / Doctor / Company lead, qualifies it, hands it on,
   and closes Won/Lose in 3 steps. Anurag Shukla (Ops) monitors + can chat/resend.
   MIS & Director can edit the checklist. Loads after app.js; reuses globals. */
(function(){
  var FLAGS={ canSeeAll:false, canEditChecklist:false, isOps:false, me:null };
  var LEADS=[], COUNTS=null, EMPS=[];
  var LEADTYPES=['Hot','Dead','Progressive','New','Followup'];
  var CHECKLISTS={
    camp:['Camp company','Camp pamphlet','Visiting card','Package'],
    company:['Camp company','Camp pamphlet','Visiting card','Package'],
    doctor:['Prescription','Rate list','Explain everything','Verified main person']
  };
  var TYPE_META={
    camp:{label:'Camp', ic:'⛺', bg:'#FAEEDA', bd:'#BA7517', fg:'#854F0B'},
    doctor:{label:'Doctor', ic:'🩺', bg:'#E1F5EE', bd:'#0F6E56', fg:'#0F6E56'},
    company:{label:'Company', ic:'🏢', bg:'#E6F1FB', bd:'#185FA5', fg:'#0C447C'}
  };
  var LTCOLOR={Hot:'#A32D2D',Dead:'#2C2C2A',Progressive:'#3B6D11',New:'#0C447C',Followup:'#854F0B'};

  function meId(){ return S.user&&S.user.EmpID; }
  function fmtWhen(v){ if(!v) return ''; var d=new Date(v); if(isNaN(d)) return String(v).slice(0,16).replace('T',' '); return d.toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }
  function ensureEmps(){ if(EMPS.length) return Promise.resolve(EMPS); return API.salesPeople().then(function(r){ if(r&&(r.ok||r.offline)){ EMPS=(r.employees||[]); } return EMPS; }).catch(function(){ return EMPS; }); }
  function empOptions(sel){ return '<option value="">— choose —</option>'+EMPS.map(function(e){ return '<option value="'+esc(e.EmpID)+'"'+(String(e.EmpID)===String(sel)?' selected':'')+'>'+esc(e.FullName)+' ('+esc(e.Role||'')+(e.Branch&&e.Branch!=='HQ'?' · '+esc(e.Branch):'')+')</option>'; }).join(''); }
  function parseCl(l){ try{ return JSON.parse(l.checklistJson||'{}')||{}; }catch(e){ return {}; } }

  /* ---------------- module page ---------------- */
  function renderSalesCRM(){
    var v=document.getElementById('page-salescrm');
    v.innerHTML='<div class="page-head"><h1>Sales CRM</h1><div class="spacer"></div><button class="btn" id="scNewBtn">+ New lead</button></div>'+
      '<div style="color:#888;font-size:13px;margin:-4px 0 12px">Capture a Camp, Doctor or Company lead. Qualify it, hand it on, close it Won or Lose. Anurag Shukla (Ops) monitors every lead.</div>'+
      '<div id="scTypeCards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px"></div>'+
      '<div class="section-label" id="scListLabel">Recent leads</div>'+
      '<div id="scList"><div class="center-load"><span class="loader dark"></span> Loading…</div></div>';
    document.getElementById('scNewBtn').onclick=function(){ openTypePicker(); };
    ensureEmps();
    loadAndPaint();
  }
  function loadAndPaint(){
    API.salesListLeads().then(function(r){
      if(!r){ return; }
      if(r.ok||r.offline){
        LEADS=r.leads||[]; COUNTS=r.counts||null;
        if(r.ok){ FLAGS.canSeeAll=!!r.canSeeAll; FLAGS.canEditChecklist=!!r.canEditChecklist; FLAGS.isOps=!!r.isOps; FLAGS.me=r.me; }
        paint();
      } else {
        document.getElementById('scList').innerHTML='<div class="msg error">'+esc(r.error||'Could not load leads.')+'</div>';
      }
    });
  }
  function paintTypeCards(){
    var box=document.getElementById('scTypeCards'); if(!box) return;
    box.innerHTML=['camp','doctor','company'].map(function(t){
      var m=TYPE_META[t], c=(COUNTS&&COUNTS[t])||{open:0,today:0,overdue:0};
      return '<div class="card" data-t="'+t+'" style="cursor:pointer;padding:12px;display:flex;gap:10px;align-items:center">'+
        '<div style="width:46px;height:46px;border-radius:50%;background:'+m.bg+';border:2px solid '+m.bd+';display:flex;align-items:center;justify-content:center;font-size:22px">'+m.ic+'</div>'+
        '<div><div style="font-weight:700;color:'+m.fg+'">'+m.label+'</div>'+
        '<div style="font-size:12px;color:#888">Open '+c.open+' · Today '+c.today+' · <span style="color:#C0392B">Overdue '+c.overdue+'</span></div></div></div>';
    }).join('');
    box.querySelectorAll('[data-t]').forEach(function(el){ el.onclick=function(){ openStep1(el.getAttribute('data-t')); }; });
  }
  function paint(){
    paintTypeCards();
    document.getElementById('scListLabel').textContent=FLAGS.canSeeAll?'All leads (monitor)':'My leads';
    var box=document.getElementById('scList');
    if(!LEADS.length){ box.innerHTML='<div class="empty">No leads yet. Tap “+ New lead”.</div>'; return; }
    box.innerHTML=LEADS.map(function(l){
      var m=TYPE_META[l.ltype]||{label:l.ltype,ic:'📁',fg:'#444'};
      var st=String(l.status);
      var badge = st==='won'?'<span style="background:#EAF3DE;color:#3B6D11;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">🏆 Won</span>'
        : st==='lost'?'<span style="background:#FCEBEB;color:#A32D2D;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">Lost</span>'
        : st==='dead'?'<span style="background:#2C2C2A;color:#fff;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">Dead</span>'
        : '<span style="background:#E6F1FB;color:#0C447C;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">Step '+esc(l.step)+' · open</span>';
      var lt=l.leadType?('<span style="background:'+(LTCOLOR[l.leadType]||'#888')+'20;color:'+(LTCOLOR[l.leadType]||'#555')+';border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">'+esc(l.leadType)+'</span>'):'';
      return '<div class="tcard" data-id="'+esc(l.leadId)+'" style="cursor:pointer">'+
        '<span style="font-size:20px;margin-right:4px">'+m.ic+'</span>'+
        '<div class="tbody"><div class="ttitle">'+esc(l.leadName)+'</div>'+
        '<div style="margin-top:3px;display:flex;gap:5px;flex-wrap:wrap">'+badge+lt+
          (l.reportOm==='yes'?'<span style="background:#E6F1FB;color:#185FA5;border-radius:12px;font-size:10px;padding:1px 8px;font-weight:600">💬 Ops</span>':'')+'</div>'+
        '<div class="tmeta" style="margin-top:3px">'+esc(m.label)+(l.assignedToName?(' · '+esc(l.assignedToName)):'')+(l.number?(' · '+esc(l.number)):'')+'</div>'+
        '</div></div>';
    }).join('');
    box.querySelectorAll('.tcard').forEach(function(el){ el.onclick=function(){ openSalesLead(el.getAttribute('data-id')); }; });
  }

  /* ---------------- entry popup: 3 circles ---------------- */
  function openTypePicker(){
    var body='<div style="display:flex;justify-content:space-around;gap:10px;padding:14px 4px">'+
      ['camp','doctor','company'].map(function(t){ var m=TYPE_META[t];
        return '<div data-t="'+t+'" style="text-align:center;cursor:pointer">'+
          '<div style="width:74px;height:74px;border-radius:50%;background:'+m.bg+';border:2px solid '+m.bd+';display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto">'+m.ic+'</div>'+
          '<div style="margin-top:8px;font-weight:700;color:'+m.fg+'">'+m.label+'</div></div>';
      }).join('')+'</div>';
    openModal('New lead — choose type', body, '<button class="btn ghost" onclick="closeModal()">Cancel</button>');
    document.querySelectorAll('#modalRoot [data-t]').forEach(function(el){ el.onclick=function(){ openStep1(el.getAttribute('data-t')); }; });
  }

  /* ---------------- Step 1 form ---------------- */
  function openStep1(ltype){
    var m=TYPE_META[ltype]||TYPE_META.camp, items=CHECKLISTS[ltype]||CHECKLISTS.camp;
    ensureEmps().then(function(){
      var clHtml=items.map(function(lbl){ return '<label><input type="checkbox" data-cl="'+esc(lbl)+'"><span>'+esc(lbl)+'</span></label>'; }).join('');
      var ltSeg=LEADTYPES.map(function(p){ return '<div class="pseg" data-lt="'+p+'" style="cursor:pointer;padding:5px 12px;border:1px solid #ddd;border-radius:16px;font-size:12px">'+p+'</div>'; }).join('');
      var body='<div class="grid2">'+
        '<div class="field full"><label>Lead name *</label><input id="sc_name"></div>'+
        '<div class="field"><label>Number</label><input id="sc_num"></div>'+
        '<div class="field"><label>Follow-up date &amp; time</label><input id="sc_fu" type="datetime-local"></div>'+
        '<div class="field full"><label>Notes</label><textarea id="sc_notes" rows="2"></textarea></div>'+
        '<div class="field full"><label>Checklist</label><div class="proc-ck" style="background:#f6f7f9;border-radius:8px;padding:8px 10px">'+clHtml+'</div></div>'+
        '<div class="field full"><label>Lead type</label><div id="sc_ltwrap" style="display:flex;gap:6px;flex-wrap:wrap">'+ltSeg+'</div><input type="hidden" id="sc_lt" value="New"></div>'+
        '<div id="sc_flow">'+
          '<div class="field"><label>Report to Ops Manager?</label><select id="sc_rep"><option value="no">No</option><option value="yes">Yes</option></select></div>'+
          '<div class="field"><label>Assign to</label><select id="sc_assign">'+empOptions(meId())+'</select></div>'+
        '</div>'+
      '</div>'+
      '<div id="sc_deadmsg" class="hidden" style="background:#fdeaea;color:#A32D2D;border-radius:8px;padding:8px 10px;font-size:12px;margin-top:6px">Marked <b>Dead</b> — the lead will be closed here. Follow-up, assign and later steps are skipped.</div>';
      openModal(m.label+' lead — Step 1', body,
        '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="sc_save">Save &amp; assign</button>');
      // lead-type segmented picker
      document.querySelectorAll('#sc_ltwrap .pseg').forEach(function(s){ s.onclick=function(){
        document.querySelectorAll('#sc_ltwrap .pseg').forEach(function(x){ x.style.background=''; x.style.color=''; x.style.borderColor='#ddd'; });
        var p=s.getAttribute('data-lt'); s.style.background=(LTCOLOR[p]||'#333'); s.style.color='#fff'; s.style.borderColor=(LTCOLOR[p]||'#333');
        document.getElementById('sc_lt').value=p;
        var dead=(p==='Dead'); document.getElementById('sc_flow').classList.toggle('hidden',dead); document.getElementById('sc_deadmsg').classList.toggle('hidden',!dead);
      }; });
      document.getElementById('sc_save').onclick=function(){
        var name=(document.getElementById('sc_name').value||'').trim();
        if(!name){ toast('Lead name is required.',true); return; }
        var checklist={}; document.querySelectorAll('#modalRoot [data-cl]').forEach(function(cb){ checklist[cb.getAttribute('data-cl')]=cb.checked; });
        var lt=document.getElementById('sc_lt').value, dead=(lt==='Dead');
        var data={ ltype:ltype, leadName:name, number:document.getElementById('sc_num').value||'',
          notes:document.getElementById('sc_notes').value||'', checklist:checklist, leadType:lt,
          followupAt:dead?'':(document.getElementById('sc_fu').value||''),
          reportOm:dead?false:(document.getElementById('sc_rep').value==='yes'),
          assignedToEmpId:dead?'':(document.getElementById('sc_assign').value||'') };
        var btn=document.getElementById('sc_save'); btn.disabled=true; btn.innerHTML='<span class="loader"></span>';
        API.salesCreateLead(data).then(function(r){
          if(r&&(r.ok||r.offline)){ closeModal(); toast(r.offline?'Saved on device — will sync':(r.dead?'Lead marked dead':'Lead created & assigned')); loadAndPaint(); }
          else { toast((r&&r.error)||'Could not save',true); btn.disabled=false; btn.textContent='Save & assign'; }
        });
      };
    });
  }

  /* ---------------- lead detail + steps + chat ---------------- */
  function openSalesLead(leadId, cb){
    API.salesGetLead(leadId).then(function(r){
      if(!(r&&r.ok)){ toast((r&&r.error)||'Could not open lead',true); return; }
      ensureEmps().then(function(){ renderLeadModal(r, cb); });
    });
  }
  function renderLeadModal(r, cb){
    var l=r.lead, chat=r.chat||[], me=r.me, isOps=!!r.isOps, canEditCl=!!r.canEditChecklist;
    var m=TYPE_META[l.ltype]||{label:l.ltype,ic:'📁'};
    var cl=parseCl(l), items=CHECKLISTS[l.ltype]||Object.keys(cl);
    var closed=(['won','lost','dead'].indexOf(String(l.status))>=0);

    var clHtml=items.map(function(lbl){ var on=!!cl[lbl];
      return '<label><input type="checkbox" data-cl="'+esc(lbl)+'"'+(on?' checked':'')+(canEditCl?'':' disabled')+'><span'+(on?' style="color:#1a7f37"':'')+'>'+esc(lbl)+'</span></label>';
    }).join('');

    var head='<div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">'+
        '<span style="font-size:24px">'+m.ic+'</span>'+
        '<div><div style="font-weight:700">'+esc(l.leadName)+'</div>'+
        '<div style="font-size:12px;color:#888">'+esc(m.label)+(l.number?(' · '+esc(l.number)):'')+' · Step '+esc(l.step)+' · '+esc(l.status)+'</div></div></div>';
    var meta='<div style="font-size:12px;color:#666">'+
        (l.leadType?('Lead type: <b style="color:'+(LTCOLOR[l.leadType]||'#333')+'">'+esc(l.leadType)+'</b> · '):'')+
        'Assigned: '+esc(l.assignedToName||'—')+' · By: '+esc(l.createdByName||'')+'</div>'+
        (l.notes?('<div style="font-size:13px;background:#f6f7f9;border-radius:8px;padding:8px 10px;margin-top:6px;white-space:pre-line">'+esc(l.notes)+'</div>'):'');
    var clBlock='<div style="margin-top:10px"><div style="font-size:11px;color:#888;margin-bottom:2px">Checklist'+(canEditCl?' <span style="color:#185FA5">(editable — MIS/Director)</span>':'')+'</div>'+
        '<div class="proc-ck" style="background:#f6f7f9;border-radius:8px;padding:8px 10px">'+clHtml+'</div>'+
        (canEditCl?'<button class="btn ghost sm" id="sc_clsave" style="margin-top:6px">Save checklist</button>':'')+'</div>';

    // action area by step / role
    var action='';
    if(closed){
      action='<div style="margin-top:12px;background:'+(l.status==='won'?'#EAF3DE':(l.status==='lost'?'#FCEBEB':'#efefef'))+';border-radius:8px;padding:10px;font-size:13px;font-weight:600">This lead is '+esc(l.status).toUpperCase()+'.</div>';
    } else if(String(l.step)==='2'){
      action='<div style="margin-top:12px;border-top:1px solid #eee;padding-top:10px"><div style="font-weight:600;font-size:13px;margin-bottom:6px">Step 2 · work the lead</div>'+
        '<div class="grid2">'+
        '<div class="field"><label>Lead type</label><select id="sc2_lt">'+LEADTYPES.map(function(p){return '<option'+(p===l.leadType?' selected':'')+'>'+p+'</option>';}).join('')+'</select></div>'+
        '<div class="field"><label>Report to Ops?</label><select id="sc2_rep"><option value="no"'+(l.reportOm!=='yes'?' selected':'')+'>No</option><option value="yes"'+(l.reportOm==='yes'?' selected':'')+'>Yes</option></select></div>'+
        '<div class="field full"><label>Notes</label><textarea id="sc2_notes" rows="2"></textarea></div>'+
        '<div class="field full"><label>Assign to (next)</label><select id="sc2_assign">'+empOptions(l.assignedToEmpId)+'</select></div>'+
        '</div><div style="text-align:right;margin-top:6px"><button class="btn" id="sc2_submit">Submit</button></div></div>';
    } else if(String(l.step)==='3'){
      action='<div style="margin-top:12px;border-top:1px solid #eee;padding-top:10px"><div style="font-weight:600;font-size:13px;margin-bottom:6px">Step 3 · close the lead</div>'+
        '<div class="field full"><label>Notes</label><textarea id="sc3_notes" rows="2"></textarea></div>'+
        '<div style="display:flex;gap:8px;margin-top:6px"><button class="btn" id="sc3_won" style="background:#1a7f37">🏆 Won</button><button class="btn ghost" id="sc3_lose" style="color:#A32D2D;border-color:#e3b1b1">Lose</button></div></div>';
    }

    // chat (available when Report to Ops = Yes)
    var chatBlock='';
    if(l.reportOm==='yes' || chat.length || isOps){
      var bubbles=chat.length?chat.map(function(c){ var mine=String(c.fromEmpId)===String(me);
        return '<div style="align-self:'+(mine?'flex-end':'flex-start')+';max-width:82%">'+
          '<div style="background:'+(mine?'#E6F1FB':'#fff')+';border:'+(mine?'none':'0.5px solid #e5e5e5')+';border-radius:12px;padding:7px 10px;font-size:13px'+(c.kind==='resend'?';border-left:3px solid #C0392B':'')+'">'+
          (c.kind==='resend'?'<span style="color:#C0392B;font-weight:600">↩ Returned: </span>':'')+esc(c.message)+'</div>'+
          '<div style="font-size:10px;color:#999;margin-top:2px;text-align:'+(mine?'right':'left')+'">'+esc(c.fromName||'')+' · '+esc(fmtWhen(c.createdAt))+(c.edited==='yes'?' · <span style="color:#185FA5">edited</span>':'')+
            (mine||isOps?(' · <span data-edit="'+esc(c.chatId)+'" data-msg="'+esc(c.message)+'" style="color:#185FA5;cursor:pointer">edit</span>'):'')+'</div></div>';
      }).join(''):'<div style="color:#999;font-size:12px;text-align:center;padding:6px">No messages yet.</div>';
      chatBlock='<div style="margin-top:12px;border-top:1px solid #eee;padding-top:10px">'+
        '<div style="font-weight:600;font-size:13px;margin-bottom:6px">💬 Chat with Ops (Anurag Shukla)</div>'+
        '<div id="sc_chat" style="display:flex;flex-direction:column;gap:8px;max-height:220px;overflow:auto;background:#fafafa;border-radius:8px;padding:8px">'+bubbles+'</div>'+
        '<div style="display:flex;gap:6px;margin-top:8px"><input id="sc_msg" placeholder="Type a message…" style="flex:1;border:1px solid #ddd;border-radius:20px;padding:8px 12px;font-size:13px"><button class="btn sm" id="sc_send">Send</button></div>'+
        (isOps?'<button class="btn ghost sm" id="sc_resend" style="margin-top:6px;color:#C0392B;border-color:#e3b1b1">↩ Resend to sales</button>':'')+'</div>';
    }

    openModal('Sales lead', head+meta+clBlock+action+chatBlock, '<button class="btn ghost" onclick="closeModal()">Close</button>');
    var reload=function(){ loadAndPaint(); openSalesLead(l.leadId, cb); };

    // checklist save (MIS/Director)
    var clSave=document.getElementById('sc_clsave');
    if(clSave) clSave.onclick=function(){ var out={}; document.querySelectorAll('#modalRoot [data-cl]').forEach(function(cb){ out[cb.getAttribute('data-cl')]=cb.checked; });
      clSave.disabled=true; API.salesEditChecklist(l.leadId,out).then(function(x){ if(x&&(x.ok||x.offline)){ toast('Checklist saved'); } else { toast((x&&x.error)||'Could not save',true); clSave.disabled=false; } }); };

    // step 2 submit
    var s2=document.getElementById('sc2_submit');
    if(s2) s2.onclick=function(){ var data={ leadType:document.getElementById('sc2_lt').value, notes:document.getElementById('sc2_notes').value||'',
        reportOm:document.getElementById('sc2_rep').value==='yes', assignedToEmpId:document.getElementById('sc2_assign').value||'' };
      s2.disabled=true; s2.innerHTML='<span class="loader"></span>';
      API.salesAdvance(l.leadId,data).then(function(x){ if(x&&(x.ok||x.offline)){ closeModal(); toast(x.offline?'Saved — will sync':(x.dead?'Lead marked dead':'Moved to step 3')); loadAndPaint(); if(cb)cb(); } else { toast((x&&x.error)||'Could not submit',true); s2.disabled=false; s2.textContent='Submit'; } }); };

    // step 3 close
    function doClose(res){ var data={ result:res, notes:(document.getElementById('sc3_notes')||{}).value||'' };
      API.salesClose(l.leadId,data).then(function(x){ if(x&&(x.ok||x.offline)){ closeModal(); toast(res==='won'?'Closed — Won 🏆':'Closed — Lost'); loadAndPaint(); if(cb)cb(); } else { toast((x&&x.error)||'Could not close',true); } }); }
    var w=document.getElementById('sc3_won'); if(w) w.onclick=function(){ doClose('won'); };
    var ls=document.getElementById('sc3_lose'); if(ls) ls.onclick=function(){ doClose('lost'); };

    // chat send
    var send=document.getElementById('sc_send');
    if(send) send.onclick=function(){ var inp=document.getElementById('sc_msg'), msg=(inp.value||'').trim(); if(!msg) return;
      inp.value=''; API.salesChatSend(l.leadId,msg,'note').then(function(x){ if(x&&(x.ok||x.offline)){ reload(); } else { toast((x&&x.error)||'Could not send',true); } }); };
    // chat edit
    document.querySelectorAll('#modalRoot [data-edit]').forEach(function(e){ e.onclick=function(){
      var id=e.getAttribute('data-edit'), cur=e.getAttribute('data-msg');
      var nv=window.prompt('Edit message', cur); if(nv==null) return; nv=String(nv).trim(); if(!nv) return;
      API.salesChatEdit(id,nv).then(function(x){ if(x&&(x.ok||x.offline)){ reload(); } else { toast((x&&x.error)||'Could not edit',true); } });
    }; });
    // ops resend
    var rs=document.getElementById('sc_resend');
    if(rs) rs.onclick=function(){ var inp=document.getElementById('sc_msg'), msg=(inp.value||'').trim();
      API.salesResend(l.leadId, msg||'Returned — please revise and resend.').then(function(x){ if(x&&(x.ok||x.offline)){ if(inp) inp.value=''; toast('Sent back to sales'); reload(); } else { toast((x&&x.error)||'Could not resend',true); } }); };
  }

  window.renderSalesCRM=renderSalesCRM;
  window.openSalesLead=openSalesLead;
})();
