/* ============================================================
 *  Marketing module — Campaign (spend + CPL/CAC dashboard) & Nurturing (cadence → tasks)
 *  window.renderMarketing()
 * ============================================================ */
(function(){
  function $id(i){ return document.getElementById(i); }
  function monthFrom(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01'; }
  function todayD(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function money(n){ return '₹'+(Math.round(n||0)).toLocaleString('en-IN'); }
  function branches(){ return (window.S&&S.meta&&S.meta.branches)||[]; }
  function canPick(){ return window.S&&S.perms&&S.perms.canViewAll; }
  var TAB='campaign';

  window.renderMarketing=function(){
    var v=$id('page-marketing'); if(!v) return;
    v.innerHTML='<div class="page-head"><h1>Marketing</h1></div>'+
      '<div class="seg" id="mkSeg" style="margin-bottom:14px;"><div data-v="campaign" class="'+(TAB==='campaign'?'on':'')+'">Campaign</div><div data-v="nurture" class="'+(TAB==='nurture'?'on':'')+'">Nurturing</div></div>'+
      '<div id="mkBody"></div>';
    v.querySelectorAll('#mkSeg div').forEach(function(d){ d.onclick=function(){ v.querySelectorAll('#mkSeg div').forEach(function(z){z.classList.remove('on');}); d.classList.add('on'); TAB=d.getAttribute('data-v'); paint(); }; });
    paint();
  };
  function paint(){ if(TAB==='nurture') nurture(); else campaign(); }

  /* ---------- Campaign ---------- */
  function campaign(){
    var brOpts=branches().map(function(b){return '<option value="'+esc(b.BranchID)+'">'+esc(b.BranchName)+'</option>';}).join('');
    var srcs=['Meta Ads','Google Ads','Reference','Camp','Walk-in','Other'];
    $id('mkBody').innerHTML=
      '<div class="card" style="margin-bottom:14px;"><div class="section-label" style="margin-top:0">Add campaign spend</div><div class="grid2">'+
        (canPick()?'<div class="field"><label>Branch</label><select id="cAmpBr" class="in">'+brOpts+'</select></div>':'')+
        '<div class="field"><label>Source</label><select id="cAmpSrc" class="in">'+srcs.map(function(s){return '<option>'+s+'</option>';}).join('')+'</select></div>'+
        '<div class="field"><label>Amount spent ₹</label><input id="cAmpAmt" class="in" type="number" value="0"></div>'+
        '<div class="field"><label>No. of leads</label><input id="cAmpLeads" class="in" type="number" value="0"></div>'+
        '<div class="field"><label>Leads → customers</label><input id="cAmpCust" class="in" type="number" value="0"></div>'+
        '<div class="field"><label>Notes</label><input id="cAmpNotes" class="in"></div>'+
      '</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center;">'+
        '<span class="muted" style="font-size:12px;">CPL <b id="cAmpCpl" style="color:#222">₹0</b></span>'+
        '<span class="muted" style="font-size:12px;">CAC <b id="cAmpCac" style="color:#222">₹0</b></span>'+
        '<span class="muted" style="font-size:12px;">Conv <b id="cAmpConv" style="color:#1a7f37">0%</b></span>'+
        '<div style="flex:1"></div><button class="btn" id="cAmpSave">Save campaign</button>'+
      '</div><div id="cAmpMsg"></div></div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">'+
        '<input type="date" id="mkFrom" class="in" style="max-width:150px" value="'+monthFrom()+'">'+
        '<input type="date" id="mkTo" class="in" style="max-width:150px" value="'+todayD()+'">'+
        '<div class="seg" id="mkView" style="margin:0"><div data-v="branch" class="on">By branch</div><div data-v="source">By source</div></div>'+
        '<button class="btn ghost sm" id="mkGo">Apply</button>'+
      '</div><div id="mkDash"></div>';
    function calc(){ var a=+$id('cAmpAmt').value||0,l=+$id('cAmpLeads').value||0,c=+$id('cAmpCust').value||0;
      $id('cAmpCpl').textContent=money(l?a/l:0); $id('cAmpCac').textContent=money(c?a/c:0); $id('cAmpConv').textContent=(l?Math.round(c/l*100):0)+'%'; }
    ['cAmpAmt','cAmpLeads','cAmpCust'].forEach(function(id){ $id(id).addEventListener('input',calc); }); calc();
    $id('cAmpSave').onclick=function(){ var b=this; b.disabled=true;
      API.saveCampaign({branchId:(canPick()&&$id('cAmpBr'))?$id('cAmpBr').value:'',source:$id('cAmpSrc').value,amount:+$id('cAmpAmt').value||0,leads:+$id('cAmpLeads').value||0,customers:+$id('cAmpCust').value||0,notes:$id('cAmpNotes').value,date:todayD()})
        .then(function(r){ b.disabled=false; if(r&&r.ok){ toast('Campaign saved'); $id('cAmpAmt').value=0;$id('cAmpLeads').value=0;$id('cAmpCust').value=0;$id('cAmpNotes').value='';calc(); loadDash(); } else $id('cAmpMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
    var VIEW='branch';
    $id('mkView').querySelectorAll('div').forEach(function(d){ d.onclick=function(){ $id('mkView').querySelectorAll('div').forEach(function(z){z.classList.remove('on');}); d.classList.add('on'); VIEW=d.getAttribute('data-v'); loadDash(); }; });
    $id('mkGo').onclick=loadDash;
    function loadDash(){
      $id('mkDash').innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>';
      API.listCampaigns($id('mkFrom').value,$id('mkTo').value).then(function(r){
        var box=$id('mkDash'); if(!box) return;
        if(!r||!r.ok){ box.innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; return; }
        var rows=r.rows||[]; if(!rows.length){ box.innerHTML='<div class="empty">No campaigns in this period.</div>'; return; }
        var key=VIEW==='branch'?'branchName':'source', agg={}, T={amt:0,ld:0,cu:0};
        rows.forEach(function(x){ var k=x[key]||'—'; var a=agg[k]||(agg[k]={k:k,amt:0,ld:0,cu:0}); a.amt+=x.amount;a.ld+=x.leads;a.cu+=x.customers; T.amt+=x.amount;T.ld+=x.leads;T.cu+=x.customers; });
        var list=Object.keys(agg).map(function(k){return agg[k];}).sort(function(a,b){return b.amt-a.amt;});
        box.innerHTML='<div class="kpis" style="margin-bottom:12px;">'+
            kc('Spend',money(T.amt),'#A32D2D')+kc('Leads',T.ld,'#222')+kc('Avg CPL',money(T.ld?T.amt/T.ld:0),'#222')+kc('Customers',T.cu,'#1a7f37')+kc('Avg CAC',money(T.cu?T.amt/T.cu:0),'#222')+'</div>'+
          '<div class="card"><div class="table-wrap swipe"><table><thead><tr><th>'+(VIEW==='branch'?'Branch':'Source')+'</th><th>Spend</th><th>Leads</th><th>CPL</th><th>Customers</th><th>CAC</th><th>Conv %</th></tr></thead><tbody>'+
          list.map(function(x){ return '<tr><td><b>'+esc(x.k)+'</b></td><td>'+money(x.amt)+'</td><td>'+x.ld+'</td><td>'+money(x.ld?x.amt/x.ld:0)+'</td><td>'+x.cu+'</td><td>'+money(x.cu?x.amt/x.cu:0)+'</td><td>'+(x.ld?Math.round(x.cu/x.ld*100):0)+'%</td></tr>'; }).join('')+
          '</tbody></table></div></div>';
      });
    }
    function kc(l,n,col){ return '<div class="kpi"><div class="n" style="color:'+col+'">'+n+'</div><div class="l">'+l+'</div></div>'; }
    loadDash();
  }

  /* ---------- Nurturing ---------- */
  var TRACKS={
    'Patient warm-up':[[0,'Call','intro + need'],[2,'WhatsApp','brochure + price'],[5,'Call','follow up'],[8,'Meeting','counsel / book'],[15,'WhatsApp','offer + reminder']],
    'B2D follow-up':[[0,'Call','intro'],[3,'Meeting','meet doctor'],[7,'WhatsApp','share rates'],[14,'Call','confirm tie-up']],
    'Franchise lead':[[0,'Call','qualify'],[2,'WhatsApp','send model'],[6,'Meeting','discussion'],[12,'Call','site visit plan']]
  };
  function nurture(){
    var opts=Object.keys(TRACKS).map(function(t){return '<option>'+t+'</option>';}).join('');
    $id('mkBody').innerHTML='<div class="card" style="margin-bottom:14px;"><div class="section-label" style="margin-top:0">Start nurturing</div><div class="grid2">'+
        '<div class="field"><label>Contact name</label><input id="nuName" class="in"></div>'+
        '<div class="field"><label>Phone</label><input id="nuPhone" class="in"></div>'+
        '<div class="field full"><label>Cadence</label><select id="nuTrack" class="in">'+opts+'</select></div>'+
      '</div><div id="nuSteps" style="margin:6px 0 10px"></div>'+
      '<button class="btn" id="nuStart">Start — create tasks</button><div id="nuMsg"></div></div>'+
      '<div class="muted" style="font-size:12px;">Each step becomes a dated task in your My Tasks; completing the call/WhatsApp/meeting closes it.</div>';
    function drawSteps(){ var t=TRACKS[$id('nuTrack').value]||[];
      $id('nuSteps').innerHTML=t.map(function(s){ return '<div style="display:flex;gap:8px;align-items:center;font-size:12px;color:#555;padding:3px 0;"><span style="background:#f1effc;color:#5046b8;border-radius:10px;padding:1px 8px;">Day '+s[0]+'</span><b>'+esc(s[1])+'</b> · '+esc(s[2])+'</div>'; }).join(''); }
    $id('nuTrack').addEventListener('change',drawSteps); drawSteps();
    $id('nuStart').onclick=function(){ var nm=$id('nuName').value.trim(); if(!nm){ $id('nuMsg').innerHTML='<div class="msg error">Contact name required.</div>'; return; }
      var t=TRACKS[$id('nuTrack').value]||[], steps=t.map(function(s){return {day:s[0],channel:s[1],action:s[2]};});
      var b=this; b.disabled=true;
      API.startNurture({contact:nm,phone:$id('nuPhone').value.trim(),steps:steps}).then(function(r){ b.disabled=false;
        if(r&&r.ok){ toast(r.tasks+' tasks created'); $id('nuName').value='';$id('nuPhone').value=''; } else $id('nuMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }
})();
