/* Nakoda MIS — Inventory: stock, items, vendors, consumption register, indents (5-stage), physical check. */
(function(){
  function $id(i){ return document.getElementById(i); }
  function lvl(){ return (S.perms&&S.perms.level)||''; }
  function canMgr(){ return lvl()==='SUPER'||lvl()==='HR_ADMIN'||['MIS','Logistics','Admin','Operations Manager','Director'].indexOf(S.user&&S.user.Role)>=0; }
  function canUser(){ return canMgr()||lvl()==='BRANCH_MGR'||['Lab Technician','Pathologist','CRM'].indexOf(S.user&&S.user.Role)>=0; }
  function money(n){ return Math.round(Number(n)||0).toLocaleString('en-IN'); }
  function today(){ return new Date().toISOString().slice(0,10); }
  var INV={branch:'',tab:'stock',items:[],vendors:[],cnMode:'auto'};
  var STAGES=[['raised','Raised'],['given','Given'],['received','Received'],['billed','Bill'],['paid','Pay']];

  function renderInventory(){
    var v=$id('page-inventory'), brs=(S.meta&&S.meta.branches)||[];
    if(!INV.branch && !(S.perms&&S.perms.canViewAll||canMgr())) INV.branch=(S.user&&S.user.Branch)||'';
    var tabs=[['stock','Stock'],['consume','Consumption'],['indents','Indents'],['audit','Physical Check']]; if(canMgr()) tabs.push(['items','Items'],['vendors','Vendors']);
    v.innerHTML='<div class="page-head"><h1>Inventory</h1></div>'+
      '<div class="acc-top">'+((S.perms&&S.perms.canViewAll||canMgr())?'<select class="in" id="invBranch" style="max-width:170px"><option value="">Pick branch</option>'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'"'+(b.BranchID===INV.branch?' selected':'')+'>'+esc(b.BranchName)+'</option>';}).join('')+'</select>':'<span class="acc-br">'+esc(branchName(INV.branch))+'</span>')+'</div>'+
      '<div class="pm2-tabs" id="invTabs">'+tabs.map(function(t){return '<span data-t="'+t[0]+'"'+(t[0]===INV.tab?' class="on"':'')+'>'+t[1]+'</span>';}).join('')+'</div>'+
      '<div id="invBody"></div>';
    var bs=$id('invBranch'); if(bs) bs.onchange=function(){ INV.branch=bs.value; paint(); };
    v.querySelectorAll('#invTabs span').forEach(function(s){ s.onclick=function(){ INV.tab=s.getAttribute('data-t'); v.querySelectorAll('#invTabs span').forEach(function(z){z.classList.remove('on');}); s.classList.add('on'); paint(); }; });
    // preload items/vendors for forms
    API.invItems().then(function(r){ if(r&&r.ok) INV.items=r.items; }); API.invVendors().then(function(r){ if(r&&r.ok) INV.vendors=r.vendors; });
    paint();
  }
  function paint(){ var b=$id('invBody'); if(!b) return; b.innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>';
    ({stock:loadStock,consume:loadConsume,indents:loadIndents,audit:loadAudit,items:loadItems,vendors:loadVendors}[INV.tab]||loadStock)(); }

  /* ---- Stock (month grid, colour-coded MIN/MAX) ---- */
  function gColor(v,min,max){ if(max>0 && v>max) return 'g-above'; if(v<min) return 'g-below'; if(v<=min*1.2) return 'g-near'; return 'g-ok'; }
  function loadStock(){ var ym=(INV.stockYm||new Date().toISOString().slice(0,7));
    API.invStockGrid(INV.branch,ym).then(function(r){ var box=$id('invBody'); if(!box) return; if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
    var rows=r.rows||[], days=r.daysInMonth||30;
    var head='<tr><th class="g-item">Item</th><th>Season</th><th>MIN</th><th>MAX</th>'; for(var d=1;d<=days;d++) head+='<th>'+d+'</th>'; head+='</tr>';
    var body=rows.length?rows.map(function(it){ return '<tr><td class="g-item"><b>'+esc(it.name)+'</b> <span style="font-size:9px;color:#aaa">'+esc(it.unit||'')+'</span></td><td style="text-align:center;color:#aaa">'+esc(it.season||'—')+'</td><td class="g-min">'+it.min+'</td><td class="g-max">'+it.max+'</td>'+
      it.days.map(function(v){ return '<td class="'+gColor(v,it.min,it.max)+'">'+v+'</td>'; }).join('')+'</tr>'; }).join(''):'<tr><td class="empty" colspan="'+(days+4)+'">No stock movements this month.</td></tr>';
    box.innerHTML='<div class="acc-top"><input class="in" id="gYm" type="month" value="'+ym+'" style="max-width:160px">'+
      '<span class="leg"><i class="g-above"></i>Above MAX <i class="g-ok"></i>OK <i class="g-near"></i>Near MIN <i class="g-below"></i>Below MIN</span></div>'+
      '<div class="g-wrap"><table class="g-stock">'+head+body+'</table></div>'+
      '<div class="legend">MAX = par level (set on item) · MIN = reorder point. Below MIN = red, Near MIN = yellow, Above MAX = blue. Daily on-hand reflects receipts &minus; consumption (tests/patients per item mapping). Zero-stock items hidden.</div>';
    $id('gYm').onchange=function(){ INV.stockYm=this.value; loadStock(); };
  }); }

  /* ---- Consumption register (Auto from tests  +  Manual ERP-style) ---- */
  function loadConsume(){ var box=$id('invBody'); if(!box) return;
    box.innerHTML='<div class="pm2-tabs sub" id="cnModeTabs" style="margin-bottom:10px">'+
        '<span data-m="auto"'+(INV.cnMode==='auto'?' class="on"':'')+'>Auto (from tests)</span>'+
        '<span data-m="manual"'+(INV.cnMode==='manual'?' class="on"':'')+'>Manual entry</span></div>'+
      '<div id="cnModeBody"><div class="center-load"><span class="loader dark"></span> Loading…</div></div>';
    box.querySelectorAll('#cnModeTabs span').forEach(function(s){ s.onclick=function(){ INV.cnMode=s.getAttribute('data-m'); box.querySelectorAll('#cnModeTabs span').forEach(function(z){z.classList.remove('on');}); s.classList.add('on'); (INV.cnMode==='manual'?loadConsumeManual:loadConsumeAuto)(); }; });
    (INV.cnMode==='manual'?loadConsumeManual:loadConsumeAuto)();
  }
  function loadConsumeAuto(){ API.invConsumption(INV.branch,today()).then(function(r){ var box=$id('cnModeBody'); if(!box) return; if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
    var rows=r.rows||[];
    box.innerHTML='<div class="acc-top"><input class="in" id="cnDate" type="date" value="'+r.date+'" style="max-width:160px"><span style="align-self:center;font-size:12px;color:#888">Tests '+r.tests+' · Patients '+r.patients+'</span></div>'+
      '<div class="table-wrap"><table><thead><tr><th>Item</th><th>Map</th><th>Billed</th><th>QC</th><th>Repeat</th><th>Per use</th><th>Consumed</th><th>%QC</th><th>%Waste</th></tr></thead><tbody id="cnBody">'+
      (rows.length?rows.map(function(x,i){ return cnRow(x,i); }).join(''):'<tr><td class="empty" colspan="9">No mapped items. Create items mapped per test/patient.</td></tr>')+'</tbody></table></div>'+
      (rows.length&&r.canEnter?'<div class="fin-actions" style="margin-top:10px"><button class="btn" id="cnSave">Save → deduct stock</button></div>':'');
    INV._cn=rows;
    $id('cnDate').onchange=function(){ loadConsumeDate(this.value); };
    bindCn();
    var sv=$id('cnSave'); if(sv) sv.onclick=saveCn;
  }); }
  function loadConsumeDate(d){ API.invConsumption(INV.branch,d).then(function(r){ if(r&&r.ok){ INV._cn=r.rows||[]; var tb=$id('cnBody'); if(tb) tb.innerHTML=(r.rows||[]).map(function(x,i){return cnRow(x,i);}).join(''); bindCn(); } }); }
  function cnRow(x,i){ var total=(Number(x.billed)||0)+(Number(x.qc)||0)+(Number(x.repeat)||0), consumed=total*(Number(x.perUse)||0); var qcp=total?Math.round((x.qc||0)/total*100):0, wp=total?Math.round((x.repeat||0)/total*100):0;
    return '<tr data-i="'+i+'"><td><b>'+esc(x.name)+'</b></td><td>'+esc(x.mapBasis)+'</td><td>'+x.billed+'</td><td><input class="cn-i" data-f="qc" value="'+(x.qc||0)+'" style="width:50px"></td><td><input class="cn-i" data-f="repeat" value="'+(x.repeat||0)+'" style="width:50px"></td><td>'+x.perUse+'</td><td class="cn-cons">'+consumed+' '+esc(x.unit||'')+'</td><td class="qc">'+qcp+'%</td><td class="waste" style="color:#DA1017;font-weight:700">'+wp+'%</td></tr>'; }
  function bindCn(){ $id('cnBody')&&$id('cnBody').querySelectorAll('.cn-i').forEach(function(inp){ inp.oninput=function(){ var tr=inp.closest('tr'), i=tr.getAttribute('data-i'); INV._cn[i][inp.getAttribute('data-f')]=Number(inp.value)||0; tr.outerHTML=cnRow(INV._cn[i],i); bindCn(); }; }); }
  function saveCn(){ var d=$id('cnDate').value; this.disabled=true; this.textContent='Saving…';
    API.saveConsumption(INV.branch,d,INV._cn.map(function(x){return {itemId:x.itemId,billed:x.billed,qc:x.qc,repeat:x.repeat,perUse:x.perUse};})).then(function(r){ if(r&&r.ok){ toast('Consumption saved · stock deducted'); } else toast((r&&r.error)||'Failed',true); var s=$id('cnSave'); if(s){s.disabled=false;s.textContent='Save → deduct stock';} }); }

  /* ---- Manual consumption (ERP-style: pick any item + type qty consumed) ---- */
  var MCON=[];
  function loadConsumeManual(){ if(!INV.branch){ var b0=$id('cnModeBody'); if(b0) b0.innerHTML='<div class="empty">Pick a branch first.</div>'; return; }
    API.listManualConsumption(INV.branch,today()).then(function(r){ var box=$id('cnModeBody'); if(!box) return; if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
      INV.mItems=r.items||[]; MCON=(r.rows&&r.rows.length)?r.rows.map(function(x){return {itemId:x.itemId,qty:x.qty};}):[{itemId:'',qty:''}];
      box.innerHTML='<div class="acc-top"><input class="in" id="mcDate" type="date" value="'+r.date+'" style="max-width:160px">'+
          '<span style="align-self:center;font-size:12px;color:#888">Enter the actual quantity used today, item by item.</span></div>'+
        '<div class="table-wrap"><table><thead><tr><th style="min-width:180px">Item</th><th style="width:120px">Qty consumed</th><th style="width:40px"></th></tr></thead><tbody id="mcBody"></tbody></table></div>'+
        '<button type="button" class="btn ghost sm" id="mcAdd" style="margin-top:8px">+ Add item</button>'+
        (r.canEnter?'<div class="fin-actions" style="margin-top:10px"><button class="btn" id="mcSave">Save → deduct stock</button></div>':'')+'<div id="mcMsg"></div>';
      $id('mcDate').onchange=function(){ loadConsumeManualDate(this.value); };
      $id('mcAdd').onclick=function(){ readMc(); MCON.push({itemId:'',qty:''}); paintMc(); };
      var sv=$id('mcSave'); if(sv) sv.onclick=saveMc;
      paintMc();
    }); }
  function loadConsumeManualDate(d){ API.listManualConsumption(INV.branch,d).then(function(r){ if(r&&r.ok){ MCON=(r.rows&&r.rows.length)?r.rows.map(function(x){return {itemId:x.itemId,qty:x.qty};}):[{itemId:'',qty:''}]; paintMc(); } }); }
  function mcOpts(sel){ return '<option value="">— item —</option>'+(INV.mItems||[]).map(function(x){ var u=x.unit?(' ('+x.unit+')'):''; return '<option value="'+esc(x.itemId)+'"'+(x.itemId===sel?' selected':'')+'>'+esc(x.name)+esc(u)+'</option>'; }).join(''); }
  function paintMc(){ var tb=$id('mcBody'); if(!tb) return;
    tb.innerHTML=MCON.map(function(m,i){ return '<tr data-i="'+i+'"><td><select class="in mc-id" data-i="'+i+'">'+mcOpts(m.itemId)+'</select></td>'+
      '<td><input class="in mc-q" data-i="'+i+'" type="number" min="0" value="'+(m.qty!==''&&m.qty!=null?m.qty:'')+'" style="max-width:100px"></td>'+
      '<td><button type="button" class="bmini" data-rm="'+i+'">✕</button></td></tr>'; }).join('');
    tb.querySelectorAll('.mc-id').forEach(function(s){ s.onchange=function(){ MCON[+s.getAttribute('data-i')].itemId=s.value; }; });
    tb.querySelectorAll('.mc-q').forEach(function(q){ q.oninput=function(){ MCON[+q.getAttribute('data-i')].qty=q.value; }; });
    tb.querySelectorAll('[data-rm]').forEach(function(b){ b.onclick=function(){ readMc(); MCON.splice(+b.getAttribute('data-rm'),1); if(!MCON.length) MCON=[{itemId:'',qty:''}]; paintMc(); }; });
  }
  function readMc(){ var tb=$id('mcBody'); if(!tb) return; tb.querySelectorAll('tr').forEach(function(row){ var i=+row.getAttribute('data-i'); MCON[i]={itemId:row.querySelector('.mc-id').value,qty:row.querySelector('.mc-q').value}; }); }
  function saveMc(){ readMc(); var d=$id('mcDate').value;
    var seen={}, dup=false; var lines=MCON.filter(function(m){return m.itemId;}).map(function(m){ if(seen[m.itemId]) dup=true; seen[m.itemId]=1; return {itemId:m.itemId,qty:Number(m.qty)||0}; });
    if(dup){ $id('mcMsg').innerHTML='<div class="msg error">Same item listed twice — merge them into one row.</div>'; return; }
    if(!lines.length){ $id('mcMsg').innerHTML='<div class="msg error">Add at least one item.</div>'; return; }
    this.disabled=true; this.textContent='Saving…'; var self=this;
    API.saveManualConsumption(INV.branch,d,lines).then(function(r){ if(r&&r.ok){ toast('Manual consumption saved · stock deducted'); $id('mcMsg').innerHTML=''; loadConsumeManualDate(d); } else { $id('mcMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; } if(self){ self.disabled=false; self.textContent='Save → deduct stock'; } }); }

  /* ---- Indents ---- */
  function loadIndents(){ API.listIndents(INV.branch).then(function(r){ var box=$id('invBody'); if(!box) return; if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
    var rows=r.indents||[];
    box.innerHTML=(canUser()?'<div class="fin-actions"><button class="btn" id="indAdd">+ Raise indent</button></div>':'')+
      (rows.length?rows.map(function(ind){ return indCard(ind,r.canManage); }).join(''):'<div class="empty">No indents.</div>');
    var a=$id('indAdd'); if(a) a.onclick=openIndentForm;
    rows.forEach(function(ind){ var el=$id('act_'+ind.indentId); if(el) el.onclick=function(){ indentAction(ind); }; });
  }); }
  function indCard(ind,canManage){
    var items=(function(){try{return JSON.parse(ind.itemsJson||'[]');}catch(e){return [];}})();
    var steps=STAGES.map(function(s){ var done=STAGES.findIndex(function(x){return x[0]===ind.stage;})>=STAGES.findIndex(function(x){return x[0]===s[0];}); return '<span class="ind-step'+(done?' on':'')+'">'+s[1]+'</span>'; }).join('<span class="ind-arr">›</span>');
    var btn=indBtn(ind,canManage);
    return '<div class="ind-card"><div class="ind-h"><b>'+esc(ind.indentId)+'</b> · '+esc(ind.branchName||'')+' · '+esc(ind.source)+(ind.total?(' · ₹'+money(ind.total)):'')+(btn?'<span style="margin-left:auto">'+btn+'</span>':'')+'</div>'+
      '<div class="ind-items">'+items.map(function(it){return esc(it.name)+' ×'+(it.qty||0);}).join(' · ')+'</div>'+
      '<div class="ind-flow">'+steps+'</div></div>';
  }
  function indBtn(ind,canManage){
    if(ind.stage==='raised') return canManage?'<button class="btn sm" id="act_'+ind.indentId+'">Give order</button>':'';
    if(ind.stage==='given') return '<button class="btn sm" id="act_'+ind.indentId+'">Receive</button>';
    if(ind.stage==='received') return (ind.source==='vendor')?'<button class="btn sm" id="act_'+ind.indentId+'">Submit bill</button>':'';
    if(ind.stage==='billed') return canManage?'<button class="btn sm" id="act_'+ind.indentId+'">Payment done</button>':'';
    return '';
  }
  function indentAction(ind){
    if(ind.stage==='raised') return openGive(ind);
    if(ind.stage==='given') return openReceive(ind);
    if(ind.stage==='received') return API.advanceIndent(ind.indentId,'bill',{}).then(function(r){ if(r&&r.ok){ toast('Bill posted to Accounts'); loadIndents(); } else toast((r&&r.error)||'',true); });
    if(ind.stage==='billed') return API.advanceIndent(ind.indentId,'pay',{}).then(function(r){ if(r&&r.ok){ toast('Marked paid'); loadIndents(); } });
  }
  var INDIT=[];
  function openIndentForm(){ INDIT=[{itemId:'',qty:1}];
    var body='<div class="grid2"><div class="field full"><label>Source</label><div class="seg" id="inSrc"><div data-s="vendor" class="on">From Vendor</div><div data-s="warehouse">Corporate Warehouse</div></div></div>'+
      '<div class="field full"><label>Items</label><div id="inItems"></div><button type="button" class="btn ghost sm" id="inAdd">+ Add item</button></div></div><div id="inMsg"></div>';
    openModal('Raise indent', body, '<button class="btn" id="inSave">Submit for approval</button>');
    document.querySelectorAll('#inSrc div').forEach(function(d){ d.onclick=function(){ document.querySelectorAll('#inSrc div').forEach(function(z){z.classList.remove('on');}); d.classList.add('on'); }; });
    function paintIt(){ $id('inItems').innerHTML=INDIT.map(function(it,i){ return '<div class="irow"><select class="in it-id" data-i="'+i+'"><option value="">Item…</option>'+INV.items.map(function(x){return '<option value="'+esc(x.itemId)+'"'+(x.itemId===it.itemId?' selected':'')+'>'+esc(x.name)+'</option>';}).join('')+'</select><input class="in it-q" data-i="'+i+'" value="'+it.qty+'" style="max-width:70px"><button type="button" class="bmini" data-rm="'+i+'">✕</button></div>'; }).join(''); bindIt(); }
    function readIt(){ $id('inItems').querySelectorAll('.irow').forEach(function(row){ var i=row.querySelector('.it-id').getAttribute('data-i'); INDIT[i]={itemId:row.querySelector('.it-id').value,name:(row.querySelector('.it-id').selectedOptions[0]||{}).text||'',qty:Number(row.querySelector('.it-q').value)||0}; }); }
    function bindIt(){ $id('inItems').querySelectorAll('[data-rm]').forEach(function(b){ b.onclick=function(){ readIt(); INDIT.splice(+b.getAttribute('data-rm'),1); if(!INDIT.length)INDIT=[{itemId:'',qty:1}]; paintIt(); }; }); }
    $id('inAdd').onclick=function(){ readIt(); INDIT.push({itemId:'',qty:1}); paintIt(); }; paintIt();
    $id('inSave').onclick=function(){ readIt(); var its=INDIT.filter(function(x){return x.itemId&&x.qty;}); if(!its.length){ $id('inMsg').innerHTML='<div class="msg error">Add items.</div>'; return; }
      var src=document.querySelector('#inSrc .on').getAttribute('data-s'); this.disabled=true;
      API.raiseIndent({branchId:INV.branch,source:src,items:its}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Indent raised'); loadIndents(); } else $id('inMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }
  function openGive(ind){ var items=(function(){try{return JSON.parse(ind.itemsJson||'[]');}catch(e){return [];}})();
    var body='<div class="grid2"><div class="field full"><label>Fulfil from</label><div class="seg" id="gvSrc"><div data-s="vendor"'+(ind.source==='vendor'?' class="on"':'')+'>Vendor</div><div data-s="warehouse"'+(ind.source==='warehouse'?' class="on"':'')+'>Warehouse</div></div></div>'+
      '<div class="field full" id="gvVenWrap"><label>Vendor</label><select id="gvVen" class="in">'+INV.vendors.map(function(v){return '<option value="'+esc(v.vendorId)+'">'+esc(v.name)+'</option>';}).join('')+'</select></div>'+
      '<div class="field full"><label>Items &amp; rates</label><table class="tbl"><tr><th>Item</th><th>Qty</th><th>Rate</th></tr>'+items.map(function(it,i){return '<tr><td>'+esc(it.name)+'</td><td>'+it.qty+'</td><td><input class="in gv-r" data-i="'+i+'" value="'+(it.rate||0)+'" style="max-width:80px"></td></tr>';}).join('')+'</table></div></div><div id="gvMsg"></div>';
    openModal('Give order — '+ind.indentId, body, '<button class="btn" id="gvSave">Give order</button>');
    document.querySelectorAll('#gvSrc div').forEach(function(d){ d.onclick=function(){ document.querySelectorAll('#gvSrc div').forEach(function(z){z.classList.remove('on');}); d.classList.add('on'); $id('gvVenWrap').style.display=d.getAttribute('data-s')==='vendor'?'':'none'; }; });
    $id('gvSave').onclick=function(){ var src=document.querySelector('#gvSrc .on').getAttribute('data-s'); document.querySelectorAll('.gv-r').forEach(function(inp){ items[inp.getAttribute('data-i')].rate=Number(inp.value)||0; }); this.disabled=true;
      API.advanceIndent(ind.indentId,'give',{source:src,vendorId:(src==='vendor'?$id('gvVen').value:''),items:items}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Order given'); loadIndents(); } else $id('gvMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }
  function openReceive(ind){ var items=(function(){try{return JSON.parse(ind.itemsJson||'[]');}catch(e){return [];}})();
    var body='<table class="tbl"><tr><th>Item</th><th>Ordered</th><th>Received</th></tr>'+items.map(function(it,i){return '<tr><td>'+esc(it.name)+'</td><td>'+it.qty+'</td><td><input class="in rc-q" data-i="'+i+'" value="'+it.qty+'" style="max-width:70px"></td></tr>';}).join('')+'</table><div id="rcMsg"></div>';
    openModal('Receive — '+ind.indentId, body, '<button class="btn" id="rcSave">Confirm receipt → stock in</button>');
    $id('rcSave').onclick=function(){ document.querySelectorAll('.rc-q').forEach(function(inp){ items[inp.getAttribute('data-i')].recvQty=Number(inp.value)||0; }); this.disabled=true;
      API.advanceIndent(ind.indentId,'receive',{items:items}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Received · stock updated'); loadIndents(); } else $id('rcMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }

  /* ---- Physical check ---- */
  function loadAudit(){
    Promise.all([API.invStock(INV.branch),API.listAudits(INV.branch)]).then(function(a){ var box=$id('invBody'); if(!box) return;
      var stock=(a[0]&&a[0].ok)?a[0].stock:[], audits=(a[1]&&a[1].ok)?a[1].audits:[], canApp=(a[1]&&a[1].ok)?a[1].canApprove:false;
      INV._stock=stock;
      box.innerHTML=(canUser()?'<div class="fin-actions"><button class="btn" id="adNew">+ New count</button></div>':'')+
        '<div class="sec-h">Recent audits</div>'+(audits.length?audits.map(function(au){ return '<div class="hx-row"><div class="hx-mid"><b>'+esc(au.date)+'</b><div class="hx-m">'+(JSON.parse(au.linesJson||'[]').length)+' items</div></div>'+(String(au.status)==='approved'?'<span class="chip paid">approved</span>':(canApp?'<button class="btn sm" data-ap="'+esc(au.auditId)+'">Approve &amp; adjust</button>':'<span class="chip partial">pending</span>'))+'</div>'; }).join(''):'<div class="empty">No audits yet.</div>');
      var n=$id('adNew'); if(n) n.onclick=openAudit;
      box.querySelectorAll('[data-ap]').forEach(function(b){ b.onclick=function(){ API.approveAudit(b.getAttribute('data-ap')).then(function(r){ if(r&&r.ok){ toast('Approved · stock adjusted'); loadAudit(); } else toast((r&&r.error)||'',true); }); }; });
    });
  }
  function openAudit(){ var stock=INV._stock||[];
    var body='<div style="font-size:12px;color:#888;margin-bottom:8px">Enter physical count; variance auto-calculates.</div><table class="tbl"><tr><th>Item</th><th>System</th><th>Counted</th></tr>'+
      stock.map(function(s,i){return '<tr><td>'+esc(s.name)+'</td><td>'+s.onHand+'</td><td><input class="in ad-c" data-i="'+i+'" value="'+s.onHand+'" style="max-width:60px"></td></tr>';}).join('')+'</table><div id="adMsg"></div>';
    openModal('Physical count — '+branchName(INV.branch), body, '<button class="btn" id="adSave">Submit for approval</button>');
    $id('adSave').onclick=function(){ var lines=stock.map(function(s,i){ var c=Number(document.querySelector('.ad-c[data-i="'+i+'"]').value)||0; return {itemId:s.itemId,name:s.name,system:s.onHand,counted:c}; });
      this.disabled=true; API.saveAudit(INV.branch,today(),lines).then(function(r){ if(r&&r.ok){ closeModal(); toast('Submitted for approval'); loadAudit(); } else $id('adMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }

  /* ---- Items & Vendors (manage) ---- */
  function loadItems(){ API.invItems().then(function(r){ var box=$id('invBody'); if(!box) return; var rows=(r&&r.ok)?r.items:[]; INV.items=rows;
    var cats=[]; rows.forEach(function(i){ if(i.category && cats.indexOf(i.category)<0) cats.push(i.category); }); cats.sort();
    box.innerHTML='<div class="fin-actions" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn" id="itAdd">+ Item</button>'+
      '<input class="in" id="itSearch" placeholder="Search code or name…" style="max-width:220px">'+
      '<select class="in" id="itCatF" data-nocombo style="max-width:180px"><option value="">All categories</option>'+cats.map(function(c){return '<option>'+esc(c)+'</option>';}).join('')+'</select>'+
      '<span id="itCount" style="font-size:12px;color:#888;margin-left:auto"></span></div><div id="itList"></div>';
    function itRow(i){ return '<div class="hx-row"><div class="hx-mid"><b>'+(i.itemCode?('<span style="color:#999;font-weight:600">'+esc(i.itemCode)+'</span> '):'')+esc(i.name)+'</b><div class="hx-m">'+esc(i.category)+' · '+esc(i.unit||'')+' · '+(i.mapBasis!=='none'?('per '+i.mapBasis+' ×'+i.perUse):'manual')+' · reorder '+i.reorderLevel+'</div></div><a href="javascript:void(0)" data-e="'+esc(i.itemId)+'">✎</a> <a href="javascript:void(0)" data-d="'+esc(i.itemId)+'" style="color:var(--red)">🗑</a></div>'; }
    function paintList(){ var q=($id('itSearch').value||'').trim().toLowerCase(), cf=$id('itCatF').value;
      var list=rows.filter(function(i){ if(cf && String(i.category)!==cf) return false; if(q){ var hay=((i.itemCode||'')+' '+(i.name||'')).toLowerCase(); if(hay.indexOf(q)<0) return false; } return true; });
      $id('itList').innerHTML=list.length?list.map(itRow).join(''):'<div class="empty">No matching items.</div>';
      $id('itCount').textContent=list.length+' of '+rows.length;
      $id('itList').querySelectorAll('[data-e]').forEach(function(b){ b.onclick=function(){ openItemForm(rows.filter(function(x){return x.itemId===b.getAttribute('data-e');})[0]); }; });
      $id('itList').querySelectorAll('[data-d]').forEach(function(b){ b.onclick=function(){ if(confirm('Delete item?')) API.deleteItem(b.getAttribute('data-d')).then(function(){toast('Deleted');loadItems();}); }; });
    }
    $id('itAdd').onclick=function(){ openItemForm(null); };
    $id('itSearch').oninput=paintList; $id('itCatF').onchange=paintList;
    paintList();
  }); }
  function openItemForm(it){ it=it||{};
    var body='<div class="grid2"><div class="field"><label>Item code</label><input id="itCode" class="in" value="'+esc(it.itemCode||'')+'" placeholder="e.g. REA-001"></div>'+
      '<div class="field"><label>Item name</label><input id="itName" class="in" value="'+esc(it.name||'')+'"></div>'+
      '<div class="field"><label>Category</label><input id="itCat" class="in" list="itCatList" value="'+esc(it.category||'')+'" placeholder="Type or pick"><datalist id="itCatList">'+['Reagent','Consumables','Kit','Accessories','Instrument','Stationery','Computer Accessory','Other'].map(function(c){return '<option value="'+c+'"></option>';}).join('')+'</datalist></div>'+
      '<div class="field"><label>Unit</label><input id="itUnit" class="in" value="'+esc(it.unit||'')+'"></div>'+
      '<div class="field full"><label>Auto-deduct per</label><div class="seg" id="itBasis"><div data-b="test"'+(it.mapBasis==='test'?' class="on"':'')+'>Per test</div><div data-b="patient"'+(it.mapBasis==='patient'?' class="on"':'')+'>Per patient</div><div data-b="none"'+((!it.mapBasis||it.mapBasis==='none')?' class="on"':'')+'>None</div></div></div>'+
      '<div class="field"><label>Qty per use</label><input id="itPer" class="in" type="number" value="'+(it.perUse||0)+'"></div>'+
      '<div class="field"><label>MIN (reorder level)</label><input id="itRe" class="in" type="number" value="'+(it.reorderLevel||0)+'"></div>'+
      '<div class="field"><label>MAX (par level)</label><input id="itMax" class="in" type="number" value="'+(it.maxLevel||0)+'"></div>'+
      '<div class="field"><label>Season (optional)</label><input id="itSeason" class="in" value="'+esc(it.season||'')+'"></div>'+
      '<div class="field"><label>Default vendor</label><input id="itVen" class="in" list="itVenList" value="'+esc((function(){var v=INV.vendors.filter(function(x){return String(x.vendorId)===String(it.vendorId);})[0];return v?v.name:'';})())+'" placeholder="Type to search"><datalist id="itVenList">'+INV.vendors.map(function(v){return '<option value="'+esc(v.name)+'"></option>';}).join('')+'</datalist></div>'+
      '<div class="field"><label>Default price ₹</label><input id="itPrice" class="in" type="number" value="'+(it.price||0)+'"></div></div><div id="itMsg"></div>';
    openModal(it.itemId?'Edit item':'New item', body, '<button class="btn" id="itSave">Save</button>');
    document.querySelectorAll('#itBasis div').forEach(function(d){ d.onclick=function(){ document.querySelectorAll('#itBasis div').forEach(function(z){z.classList.remove('on');}); d.classList.add('on'); }; });
    $id('itSave').onclick=function(){ var n=$id('itName').value.trim(); if(!n){ $id('itMsg').innerHTML='<div class="msg error">Name required.</div>'; return; }
      API.saveItem({itemId:it.itemId,itemCode:$id('itCode').value.trim(),name:n,category:$id('itCat').value,unit:$id('itUnit').value,mapBasis:document.querySelector('#itBasis .on').getAttribute('data-b'),perUse:$id('itPer').value,reorderLevel:$id('itRe').value,maxLevel:$id('itMax').value,season:$id('itSeason').value,vendorId:(function(){var nm=($id('itVen').value||'').trim().toLowerCase();var m=INV.vendors.filter(function(v){return String(v.name).toLowerCase()===nm;})[0];return m?m.vendorId:'';})(),price:$id('itPrice').value}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Saved'); loadItems(); } else $id('itMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }
  function loadVendors(){ API.invVendors().then(function(r){ var box=$id('invBody'); if(!box) return; var rows=(r&&r.ok)?r.vendors:[]; INV.vendors=rows;
    box.innerHTML='<div class="fin-actions"><button class="btn" id="veAdd">+ Vendor</button></div>'+(rows.length?rows.map(function(v){ return '<div class="hx-row"><div class="hx-mid"><b>'+esc(v.name)+'</b><div class="hx-m">'+esc(v.contact||'')+' · '+esc(v.ifsc||'')+' '+esc(v.acct||'')+'</div></div><a href="javascript:void(0)" data-e="'+esc(v.vendorId)+'">✎</a> <a href="javascript:void(0)" data-d="'+esc(v.vendorId)+'" style="color:var(--red)">🗑</a></div>'; }).join(''):'<div class="empty">No vendors.</div>');
    $id('veAdd').onclick=function(){ openVendorForm(null); };
    box.querySelectorAll('[data-e]').forEach(function(b){ b.onclick=function(){ openVendorForm(rows.filter(function(x){return x.vendorId===b.getAttribute('data-e');})[0]); }; });
    box.querySelectorAll('[data-d]').forEach(function(b){ b.onclick=function(){ if(confirm('Delete vendor?')) API.deleteVendor(b.getAttribute('data-d')).then(function(){toast('Deleted');loadVendors();}); }; });
  }); }
  function openVendorForm(v){ v=v||{};
    var body='<div class="grid2"><div class="field full"><label>Vendor name</label><input id="veName" class="in" value="'+esc(v.name||'')+'"></div>'+
      '<div class="field"><label>Contact</label><input id="veContact" class="in" value="'+esc(v.contact||'')+'"></div><div class="field"><label>GSTIN</label><input id="veGst" class="in" value="'+esc(v.gstin||'')+'"></div>'+
      '<div class="field"><label>Bank IFSC</label><input id="veIfsc" class="in" value="'+esc(v.ifsc||'')+'"></div><div class="field"><label>Account no.</label><input id="veAcct" class="in" value="'+esc(v.acct||'')+'"></div></div><div id="veMsg"></div>';
    openModal(v.vendorId?'Edit vendor':'New vendor', body, '<button class="btn" id="veSave">Save</button>');
    $id('veSave').onclick=function(){ var n=$id('veName').value.trim(); if(!n){ $id('veMsg').innerHTML='<div class="msg error">Name required.</div>'; return; }
      API.saveVendor({vendorId:v.vendorId,name:n,contact:$id('veContact').value,gstin:$id('veGst').value,ifsc:$id('veIfsc').value,acct:$id('veAcct').value}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Saved'); loadVendors(); } else $id('veMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }

  window.renderInventory=renderInventory;
})();
