/* ============================================================
 *  Nakoda MIS — Extras
 *  1) Suggestion / Complaint to MD  (any staff)
 *  2) MD Inbox  (Director / EA reply on MD's behalf)
 *  3) Asset Management  (branch fixed-asset register + auto tasks)
 *  All offline-first: writes queue instantly, reads serve from cache.
 * ============================================================ */
(function(){
  function elPage(id){ return document.getElementById('page-'+id); }
  function load(html){ return '<div class="center-load"><span class="loader dark"></span> '+(html||'Loading…')+'</div>'; }
  function offBadge(r){ return (r&&r.offline)?'<span class="pill" style="background:#fff4e5;color:#9a6700">offline copy</span>':''; }
  function badge(status){
    var s=String(status||'').toLowerCase(), c='#eef',t='#445',lbl=status||'—';
    if(s==='open'){c='#fff4e5';t='#9a6700';lbl='Open';}
    else if(s==='replied'){c='#e6f4ea';t='#1a7f37';lbl='Replied';}
    else if(s==='due'){c='#fdecea';t='#c62828';lbl='Due';}
    else if(s==='ok'){c='#e6f4ea';t='#1a7f37';lbl='OK';}
    return '<span class="pill" style="background:'+c+';color:'+t+'">'+esc(lbl)+'</span>';
  }
  var CATS=['Furniture','Electronics','Instruments','Registration'];
  var TYPES=['Audit','Maintenance','Servicing','Re-issue'];
  var FREQS=['Monthly','Quarterly','Half-Yearly','Yearly'];
  var _emps=null;
  function emps(){ if(_emps) return Promise.resolve(_emps); return API.listEmployees().then(function(r){ _emps=(r&&r.ok&&r.employees)||[]; return _emps; }).catch(function(){ return []; }); }
  function brOpts(sel){ var bs=((S.meta&&S.meta.branches)||[]).filter(function(b){return b.Type==='Branch';}); return '<option value="">— Branch —</option>'+bs.map(function(b){return '<option value="'+esc(b.BranchID)+'"'+(String(b.BranchID)===String(sel)?' selected':'')+'>'+esc(b.BranchName)+'</option>';}).join(''); }
  function opt(arr,sel){ return arr.map(function(x){return '<option'+(String(x)===String(sel)?' selected':'')+'>'+esc(x)+'</option>';}).join(''); }

  /* ---------------- 1) Suggestion / Complaint ---------------- */
  window.renderSuggest=function(){
    var p=elPage('suggest');
    p.innerHTML=
      '<div class="page-head"><h1>Suggestion / Complaint to MD</h1></div>'+
      '<div class="card" style="padding:18px;max-width:640px">'+
        '<p style="color:#666;margin:0 0 12px">Your message goes straight to the Managing Director as a task with a 24-hour response time. You will see the reply here.</p>'+
        '<div class="field"><label>Type</label><select id="sgType"><option>Suggestion</option><option>Complaint</option></select></div>'+
        '<div class="field"><label>Subject</label><input id="sgSubject" placeholder="Short title"></div>'+
        '<div class="field"><label>Message</label><textarea id="sgMsg" rows="4" placeholder="Write your suggestion or complaint…"></textarea></div>'+
        '<button class="btn" id="sgSend">Send to MD</button>'+
      '</div>'+
      '<div class="section-label">My submissions</div>'+
      '<div id="sgList">'+load()+'</div>';
    document.getElementById('sgSend').onclick=function(){
      var msg=val('sgMsg'); if(!msg){ toast('Please write your message.',true); return; }
      var b=this; b.disabled=true;
      API.submitSuggestion({type:val('sgType'),subject:val('sgSubject')||'',message:msg}).then(function(r){
        b.disabled=false;
        if(r.ok){ toast(r.offline?'Saved offline — will send when online.':'Sent to MD.'); document.getElementById('sgMsg').value=''; document.getElementById('sgSubject').value=''; loadMine(); }
        else toast(r.error||'Could not send.',true);
      });
    };
    loadMine();
    function loadMine(){
      API.mySuggestions().then(function(r){
        var box=document.getElementById('sgList');
        var rows=(r&&r.suggestions)||[];
        if(!rows.length){ box.innerHTML='<div class="empty">No submissions yet.</div>'; return; }
        box.innerHTML=offBadge(r)+rows.map(function(s){
          return '<div class="card" style="padding:14px;margin-bottom:10px">'+
            '<div style="display:flex;gap:8px;align-items:center"><b>'+esc(s.type)+'</b> '+badge(s.status)+'<span style="color:#999;margin-left:auto;font-size:12px">'+esc(s.createdAt||'')+'</span></div>'+
            (s.subject?'<div style="font-weight:600;margin-top:4px">'+esc(s.subject)+'</div>':'')+
            '<div style="color:#555;margin-top:4px;white-space:pre-wrap">'+esc(s.message)+'</div>'+
            (s.reply?('<div style="margin-top:10px;padding:10px;background:#f3f8f4;border-left:3px solid #1a7f37;border-radius:6px"><div style="font-size:12px;color:#1a7f37;font-weight:600">Reply'+(s.repliedBy?(' · '+esc(s.repliedBy)):'')+'</div><div style="white-space:pre-wrap">'+esc(s.reply)+'</div></div>'):'<div style="margin-top:8px;font-size:12px;color:#999">Awaiting reply…</div>')+
          '</div>';
        }).join('');
      });
    }
  };

  /* ---------------- 2) MD Inbox ---------------- */
  window.renderMdInbox=function(){
    var p=elPage('mdinbox');
    p.innerHTML='<div class="page-head"><h1>MD Inbox</h1></div><div id="mdList">'+load()+'</div>';
    API.suggestionInbox().then(function(r){
      var box=document.getElementById('mdList');
      if(!r.ok){ box.innerHTML='<div class="empty">'+esc(r.error||'Unable to load.')+'</div>'; return; }
      var rows=r.suggestions||[];
      if(!rows.length){ box.innerHTML='<div class="empty">No messages.</div>'; return; }
      box.innerHTML=offBadge(r)+rows.map(function(s){
        return '<div class="card" style="padding:14px;margin-bottom:10px">'+
          '<div style="display:flex;gap:8px;align-items:center"><b>'+esc(s.type)+'</b> '+badge(s.status)+'<span style="margin-left:auto;color:#999;font-size:12px">from '+esc(s.fromName)+' · '+esc(s.createdAt||'')+'</span></div>'+
          (s.subject?'<div style="font-weight:600;margin-top:4px">'+esc(s.subject)+'</div>':'')+
          '<div style="color:#555;margin-top:4px;white-space:pre-wrap">'+esc(s.message)+'</div>'+
          (s.status==='replied'
            ? '<div style="margin-top:10px;padding:10px;background:#f3f8f4;border-left:3px solid #1a7f37;border-radius:6px"><div style="font-size:12px;color:#1a7f37;font-weight:600">Reply · '+esc(s.repliedBy||'')+'</div><div style="white-space:pre-wrap">'+esc(s.reply)+'</div></div>'
            : '<div style="margin-top:10px"><textarea id="rep_'+esc(s.sugId)+'" rows="2" placeholder="Type reply (sends back to the person)…"></textarea><button class="btn sm" onclick="window._mdReply(\''+esc(s.sugId)+'\')">Send reply</button></div>')+
        '</div>';
      }).join('');
    });
  };
  window._mdReply=function(sugId){
    var t=document.getElementById('rep_'+sugId); var txt=t?t.value.trim():'';
    if(!txt){ toast('Write a reply first.',true); return; }
    API.replySuggestion(sugId,txt).then(function(r){
      if(r.ok){ toast(r.offline?'Saved offline — will send when online.':'Reply sent.'); window.renderMdInbox(); }
      else toast(r.error||'Could not send.',true);
    });
  };

  /* ---------------- 3) Asset Management ---------------- */
  var _canManage=false;
  window.renderFixedAssets=function(){
    var p=elPage('fixedassets');
    p.innerHTML=
      '<div class="page-head"><h1>Asset Management</h1><div class="spacer"></div>'+
        '<select id="faBranch" class="greet-select" style="max-width:200px"><option value="">All branches</option></select> '+
        '<button class="btn hidden" id="faAdd">+ Add asset</button></div>'+
      '<p style="color:#666;margin:-6px 0 12px">Furniture, electronics, instruments & registrations per branch. When a periodic audit/maintenance/servicing/re-issue falls due, a 7-day task is auto-created for the responsible person and tracked by the Process Coordinator.</p>'+
      '<div id="faList">'+load()+'</div>';
    var bs=((S.meta&&S.meta.branches)||[]).filter(function(b){return b.Type==='Branch';});
    document.getElementById('faBranch').innerHTML='<option value="">All branches</option>'+bs.map(function(b){return '<option value="'+esc(b.BranchID)+'">'+esc(b.BranchName)+'</option>';}).join('');
    document.getElementById('faBranch').onchange=loadList;
    document.getElementById('faAdd').onclick=function(){ openAssetForm(null); };
    loadList();
    function loadList(){
      var br=document.getElementById('faBranch').value;
      API.fixedAssets(br).then(function(r){
        _canManage=!!(r&&r.canManage);
        document.getElementById('faAdd').classList.toggle('hidden',!_canManage);
        var box=document.getElementById('faList');
        if(!r.ok){ box.innerHTML='<div class="empty">'+esc(r.error||'Unable to load.')+'</div>'; return; }
        var rows=r.assets||[];
        if(!rows.length){ box.innerHTML='<div class="empty">No assets yet.</div>'; return; }
        var groups={}; rows.forEach(function(a){ (groups[a.category||'Other']=groups[a.category||'Other']||[]).push(a); });
        var html=offBadge(r);
        Object.keys(groups).forEach(function(cat){
          html+='<div class="section-label">'+esc(cat)+'</div><div class="card"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Serial</th><th>Branch</th><th>Responsible</th><th>Check</th><th>Frequency</th><th>Next due</th><th>Status</th>'+(_canManage?'<th></th>':'')+'</tr></thead><tbody>'+
            groups[cat].map(function(a){ return '<tr>'+
              '<td>'+esc(a.name)+'</td><td>'+esc(a.serial||'—')+'</td><td>'+esc(branchName(a.branchId))+'</td><td>'+esc(a.responsibleName||'—')+'</td>'+
              '<td>'+esc(a.taskType||'—')+'</td><td>'+esc(a.frequency||'—')+'</td><td>'+esc(a.nextDue||'—')+'</td><td>'+badge(a.status)+'</td>'+
              (_canManage?'<td><button class="btn ghost sm" onclick=\'window._faEdit("'+esc(a.assetId)+'")\'>Edit</button></td>':'')+
            '</tr>'; }).join('')+
          '</tbody></table></div></div>';
        });
        box.innerHTML=html;
        window._faRows=rows;
      });
    }
    window._faReload=loadList;
  };
  window._faEdit=function(id){ var a=(window._faRows||[]).filter(function(x){return String(x.assetId)===String(id);})[0]; openAssetForm(a||null); };

  function openAssetForm(a){
    a=a||{};
    emps().then(function(list){
      var empOpts='<option value="">— Person —</option>'+list.map(function(e){return '<option value="'+esc(e.EmpID)+'"'+(String(e.EmpID)===String(a.responsibleEmpId)?' selected':'')+'>'+esc(e.FullName)+' ('+esc(e.Role||'')+')</option>';}).join('');
      var body=
        '<div class="field"><label>Category</label><select id="faCat">'+opt(CATS,a.category)+'</select></div>'+
        '<div class="field"><label>Asset name</label><input id="faName" value="'+esc(a.name||'')+'" placeholder="e.g. Centrifuge / Reception desk"></div>'+
        '<div class="field"><label>Serial number</label><input id="faSerial" value="'+esc(a.serial||'')+'" placeholder="Unique serial / tag"></div>'+
        '<div class="field"><label>Branch</label><select id="faBr">'+brOpts(a.branchId)+'</select></div>'+
        '<div class="field"><label>Responsible person</label><select id="faResp">'+empOpts+'</select></div>'+
        '<div class="field"><label>Periodic check</label><select id="faType">'+opt(TYPES,a.taskType)+'</select></div>'+
        '<div class="field"><label>Frequency</label><select id="faFreq">'+opt(FREQS,a.frequency)+'</select></div>'+
        '<div class="field"><label>First / next due date</label><input id="faDue" type="date" value="'+esc(a.nextDue||'')+'"></div>'+
        '<div class="field"><label>Notes</label><input id="faNotes" value="'+esc(a.notes||'')+'"></div>';
      var foot='<button class="btn ghost" onclick="closeModal()">Cancel</button>'+
        (a.assetId?'<button class="btn ghost" style="color:#c62828" id="faDel">Delete</button>':'')+
        '<button class="btn" id="faSave">Save</button>';
      openModal(a.assetId?'Edit asset':'Add asset', body, foot);
      document.getElementById('faSave').onclick=function(){
        var name=val('faName'); if(!name){ toast('Asset name is required.',true); return; }
        var data={assetId:a.assetId||'',category:val('faCat'),name:name,serial:val('faSerial')||'',branchId:val('faBr')||'',
          responsibleEmpId:val('faResp')||'',taskType:val('faType'),frequency:val('faFreq'),nextDue:val('faDue')||'',notes:val('faNotes')||''};
        this.disabled=true;
        API.saveFixedAsset(data).then(function(r){
          if(r.ok){ toast(r.offline?'Saved offline — will sync.':'Saved.'); closeModal(); if(window._faReload) window._faReload(); }
          else toast(r.error||'Could not save.',true);
        });
      };
      if(a.assetId){ document.getElementById('faDel').onclick=function(){ if(!confirm('Remove this asset?')) return; API.deleteFixedAsset(a.assetId).then(function(r){ if(r.ok){ toast('Removed.'); closeModal(); if(window._faReload) window._faReload(); } else toast(r.error||'Failed',true); }); }; }
    });
  }
})();
