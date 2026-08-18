/* ============================================================
 *  Quick log — role-aware one-tap activity tiles on the dashboard.
 *  Logs to Activity_Log, which feeds the Activity scorecard + scores.
 *  window.renderQuickLog(host)
 * ============================================================ */
(function(){
  function $id(i){ return document.getElementById(i); }
  var TILES={
    'Telecaller':[['call','Log call','📞'],['meeting','Log meeting','👥'],['lead','Add lead','➕'],['followup','Follow-up','🔁']],
    'CRM':[['call','Log call','📞'],['counsel','Counsel done','💬'],['appointment','Book appt','📅'],['card','Issue card','🏷']],
    'Sales Executive':[['visit','Log visit','🚗'],['meeting','Log meeting','👥'],['doctor','Add doctor','➕']],
    'Area Sales Manager':[['visit','Log visit','🚗'],['empanel','Empanel','🤝']],
    'Marketing Manager':[['lead','Add lead','➕'],['campaign','Campaign note','📣']],
    'Content Creator':[['reel','Log reel','🎬'],['post','Log post','🖼']],
    'Survey Person':[['survey','Camp survey','📋'],['lead','Add lead','➕']],
    'Franchisee Manager':[['lead','Franchise lead','➕'],['meeting','Log meeting','👥'],['visit','Site visit','🚗']],
    'Phlebotomist':[['sample','Sample collected','🩸'],['homevisit','Home visit','🏠']],
    'Round Person':[['pickup','Pickup done','📦'],['homevisit','Home visit','🏠']],
    'Lab Technician':[['processed','Sample processed','🧪'],['qc','QC done','✅']],
    'Pathologist':[['report','Report verified','📄'],['critical','Critical value','⚠']],
    'QC Manager':[['qccheck','QC check','✅']],
    'Branch Manager':[['dailyentry','Daily entry','📊'],['lead','Add lead','➕']],
    'Accounts':[['verify','Verify collection','📊'],['invoice','Create invoice','🧾']],
    'Logistics':[['order','Give order','🚚'],['grn','Receive (GRN)','📦']],
    'HR':[['onboard','Add employee','👤']],
    'Admin':[['assetcheck','Asset check','🛠']]
  };
  function tilesFor(role){ return TILES[role]||[['call','Log call','📞'],['meeting','Log meeting','👥'],['note','Log activity','📝']]; }
  window.renderQuickLog=function(host){
    if(!host) return; var role=(window.S&&S.user&&S.user.Role)||''; var t=tilesFor(role);
    /* v309: "Collect sample" is the first tile for anyone who can record a collection. It is NOT an
       activity-log tile — it opens the real collection form, so it is rendered separately and never
       reaches openLog(). Technicians live on the dashboard, which is why it sits here as well as in
       the sidebar. */
    /* v318: the Collect sample tile now opens the diary popup — choose the phlebotomist, see his
       month, click a free time. The old counter form is on the Sample collection page as "Walk-in". */
    var opsTile=(window.opsCanOrder && window.opsCanOrder() && window.openBookCollection)
      ? '<button class="btn ghost ql-tile ql-ops" id="qlCollect" style="flex:0 0 auto;display:flex;flex-direction:column;gap:4px;padding:11px 14px;height:auto;min-width:84px;align-items:center;"><span style="font-size:20px">\uD83E\uDDEA</span><span style="font-size:11px">Collect sample</span></button>'
      : '';
    /* v314: the home-visit door, beside the walk-in one. Same record, different entry. */
    /* v319: the Order to delivery tile opens the counter's 5-minute diary. */
    /* v321: a third operations tile — Outsource. */
    /* v322 — THE ID CLASH THAT ATE THE OUTCOME. This tile was id="qlOut", and so is the Outcome
       dropdown inside the quick-log popup below. Both live in the document at once — the tile on the
       dashboard, the popup appended after it — so getElementById('qlOut') found the BUTTON, read
       .value off it, got undefined, and every call a CRM logged saved with a blank outcome. Nothing
       looked wrong on screen, which is why it went unnoticed. Both are renamed to something that
       says what it is, so neither can be reached by accident again. */
    var outTile=(window.opsCanOrder && window.opsCanOrder() && window.openOutsource)
      ? '<button class="btn ghost ql-tile ql-ops" id="qlOutsourceTile" style="flex:0 0 auto;display:flex;flex-direction:column;gap:4px;padding:11px 14px;height:auto;min-width:84px;align-items:center;"><span style="font-size:20px">\uD83D\uDD2C</span><span style="font-size:11px">Outsource</span></button>'
      : '';
    var ordTile=(window.opsCanOrder && window.opsCanOrder() && window.openBookLabVisit)
      ? '<button class="btn ghost ql-tile ql-ops" id="qlOrder" style="flex:0 0 auto;display:flex;flex-direction:column;gap:4px;padding:11px 14px;height:auto;min-width:84px;align-items:center;"><span style="font-size:20px">\uD83C\uDFE0</span><span style="font-size:11px">Order to delivery</span></button>'
      : '';
    /* v323: Outsource sits immediately beside Collect sample. Those are the two a desk reaches for
       all day; Order to delivery is the occasional one and moves behind them. The strip scrolls
       horizontally on a phone, so the tile that is used most must not be the one that has to be
       scrolled to. Order matters here and nowhere else — nothing about the tiles themselves changed. */
    host.innerHTML='<div class="section-label">Quick log <span class="muted" style="font-weight:400;font-size:11px">· counts to your score</span></div>'+
      '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;-webkit-overflow-scrolling:touch;">'+opsTile+outTile+ordTile+
      t.map(function(x){ return '<button class="btn ghost ql-tile" data-t="'+esc(x[0])+'" data-l="'+esc(x[1])+'" style="flex:0 0 auto;display:flex;flex-direction:column;gap:4px;padding:11px 14px;height:auto;min-width:84px;align-items:center;"><span style="font-size:20px">'+x[2]+'</span><span style="font-size:11px">'+esc(x[1])+'</span></button>'; }).join('')+
      '</div>';
    host.querySelectorAll('.ql-tile[data-t]').forEach(function(b){ b.onclick=function(){ openLog(b.getAttribute('data-t'),b.getAttribute('data-l')); }; });
    var qc=document.getElementById('qlCollect');
    if(qc) qc.onclick=function(){ window.openBookCollection(function(){ if(window.renderDashboard) try{ window.renderDashboard(); }catch(e){} }); };
    var qo=document.getElementById('qlOrder');
    if(qo) qo.onclick=function(){ window.openBookLabVisit(function(){ if(window.renderDashboard) try{ window.renderDashboard(); }catch(e){} }); };
    var qu=document.getElementById('qlOutsourceTile');
    if(qu) qu.onclick=function(){ window.openOutsource(function(){ if(window.renderDashboard) try{ window.renderDashboard(); }catch(e){} }); };
  };
  function openLog(type,label){
    var isCM=/call|meeting|visit|followup/i.test(type);
    var body='<div class="grid2">'+
      '<div class="field full"><label>Lead / contact <span class="muted">(optional)</span></label><input id="qlEnt" class="in" placeholder="name or number"></div>'+
      (isCM?'<div class="field"><label>Outcome</label><select id="qlOutcome" class="in"><option value="">—</option><option>Connected</option><option>No answer</option><option>Follow-up set</option><option>Converted</option></select></div>':'')+
      '<div class="field"><label>Count</label><input id="qlCnt" class="in" type="number" value="1"></div>'+
      '<div class="field full"><label>Note</label><input id="qlNote" class="in"></div>'+
    '</div><div id="qlMsg"></div>';
    openModal(label, body, '<button class="btn" id="qlSave">Save</button>');
    $id('qlSave').onclick=function(){ var b=this; b.disabled=true;
      API.quickLog({type:type,entity:$id('qlEnt').value.trim(),outcome:($id('qlOutcome')?$id('qlOutcome').value:''),count:+$id('qlCnt').value||1,note:$id('qlNote').value.trim()}).then(function(r){
        if(r&&r.ok){ closeModal(); toast('Logged'); } else { b.disabled=false; $id('qlMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; } }); };
  }
})();
