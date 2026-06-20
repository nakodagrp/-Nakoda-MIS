/* ============================================================
 *  KPI & Scoring admin — role targets + score weights.
 *  Editable by Director / HR / Operations Manager.  window.renderKpiAdmin()
 * ============================================================ */
(function(){
  function $id(i){ return document.getElementById(i); }
  var TAB='targets', CFG=null;
  window.renderKpiAdmin=function(){
    var v=$id('page-kpiadmin'); if(!v) return;
    v.innerHTML='<div class="page-head"><h1>KPI &amp; scoring</h1></div>'+
      '<div class="seg" id="kaSeg" style="margin-bottom:14px;"><div data-v="targets" class="'+(TAB==='targets'?'on':'')+'">Role targets</div><div data-v="weights" class="'+(TAB==='weights'?'on':'')+'">Score weights</div></div>'+
      '<div id="kaBody"><div class="center-load"><span class="loader dark"></span> Loading…</div></div>';
    v.querySelectorAll('#kaSeg div').forEach(function(d){ d.onclick=function(){ v.querySelectorAll('#kaSeg div').forEach(function(z){z.classList.remove('on');}); d.classList.add('on'); TAB=d.getAttribute('data-v'); paint(); }; });
    API.getKpiConfig().then(function(r){ CFG=(r&&r.ok)?r:null; paint(); });
  };
  function paint(){ var b=$id('kaBody'); if(!b) return; if(!CFG){ b.innerHTML='<div class="msg error">Not authorised, or failed to load.</div>'; return; } if(TAB==='weights') weights(b); else targets(b); }

  function targets(b){
    var roles=CFG.roles||{};
    b.innerHTML='<div class="card"><div class="muted" style="font-size:12px;margin-bottom:8px">Output = how many per month; Outcome = conversions / cards target. Targets auto-scale to the date range on the leaderboard.</div>'+
      '<div class="table-wrap swipe"><table><thead><tr><th>Role</th><th>Output target</th><th>Outcome target</th><th></th></tr></thead><tbody id="kaRows"></tbody></table></div></div>';
    $id('kaRows').innerHTML=Object.keys(roles).sort().map(function(rl){ var d=roles[rl];
      return '<tr><td><b>'+esc(rl)+'</b></td>'+
        '<td><input type="number" class="in kaO" value="'+d.out+'" style="max-width:90px;height:30px"></td>'+
        '<td><input type="number" class="in kaC" value="'+d.outcome+'" style="max-width:90px;height:30px"></td>'+
        '<td><button class="btn ghost sm kaSave" data-r="'+esc(rl)+'">Save</button></td></tr>'; }).join('');
    $id('kaRows').querySelectorAll('.kaSave').forEach(function(btn){ btn.onclick=function(){
      var tr=btn.closest('tr'), rl=btn.getAttribute('data-r');
      var o=tr.querySelector('.kaO').value, c=tr.querySelector('.kaC').value; btn.disabled=true;
      API.saveKpiTarget({scope:'role',key:rl,outTarget:+o||0,outcomeTarget:+c||0}).then(function(r){ btn.disabled=false; toast(r&&r.ok?'Saved':((r&&r.error)||'Failed'),!(r&&r.ok)); }); }; });
  }

  function weights(b){
    var w=CFG.weights||{};
    function row(k,label){ return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0"><label style="width:170px;font-size:13px">'+label+'</label><input type="number" class="in kw" data-k="'+k+'" value="'+(w[k]||0)+'" style="max-width:90px;height:32px"></div>'; }
    b.innerHTML='<div class="card"><div class="section-label" style="margin-top:0">Dedication weights</div>'+
      row('dAtt','Attendance')+row('dTask','Task completion')+row('dPunc','Punctuality / on-time')+row('dAct','Activity volume')+
      '<div class="section-label">Performance weights</div>'+row('pOut','Output vs target')+row('pQual','Quality / on-time')+row('pOutcome','Outcomes / conversion')+
      '<button class="btn" id="kwSave" style="margin-top:12px">Save weights</button>'+
      '<div class="muted" style="font-size:11px;margin-top:6px">Each score is a weighted average — weights need not sum to 100.</div></div>';
    $id('kwSave').onclick=function(){ var obj={}; $id('kaBody').querySelectorAll('.kw').forEach(function(i){ obj[i.getAttribute('data-k')]=+i.value||0; });
      var bt=this; bt.disabled=true; API.saveWeights(obj).then(function(r){ bt.disabled=false; toast(r&&r.ok?'Weights saved':((r&&r.error)||'Failed'),!(r&&r.ok)); }); };
  }
})();
