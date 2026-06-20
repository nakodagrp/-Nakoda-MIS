/* ============================================================
 *  Quality Control — materials (mean/SD), bulk entry (Westgard),
 *  QC-Manager verification, Levey-Jennings chart.  window.renderQc()
 * ============================================================ */
(function(){
  function $id(i){ return document.getElementById(i); }
  function todayD(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function monthFrom(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01'; }
  var TAB='entry', MATS=[];
  function loadMats(cb){ API.listQcMaterials().then(function(r){ MATS=(r&&r.ok)?(r.rows||[]):[]; if(cb)cb(); }).catch(function(){ MATS=[]; if(cb)cb(); }); }

  window.renderQc=function(){
    var v=$id('page-qc'); if(!v) return;
    v.innerHTML='<div class="page-head"><h1>Quality control</h1></div>'+
      '<div class="seg" id="qcSeg" style="margin-bottom:14px;">'+
        '<div data-v="entry" class="'+(TAB==='entry'?'on':'')+'">Entry</div>'+
        '<div data-v="verify" class="'+(TAB==='verify'?'on':'')+'">Verify</div>'+
        '<div data-v="lj" class="'+(TAB==='lj'?'on':'')+'">LJ chart</div>'+
        '<div data-v="materials" class="'+(TAB==='materials'?'on':'')+'">Materials</div>'+
      '</div><div id="qcBody"></div>';
    v.querySelectorAll('#qcSeg div').forEach(function(d){ d.onclick=function(){ v.querySelectorAll('#qcSeg div').forEach(function(z){z.classList.remove('on');}); d.classList.add('on'); TAB=d.getAttribute('data-v'); paint(); }; });
    loadMats(paint);
  };
  function paint(){ var b=$id('qcBody'); if(!b) return; if(TAB==='entry') entry(b); else if(TAB==='verify') verify(b); else if(TAB==='lj') lj(b); else materials(b); }

  /* ---------- Materials ---------- */
  function materials(b){
    var listHtml=MATS.length?MATS.map(function(m){ return '<div style="border-top:1px solid var(--line);padding:7px 0;font-size:12.5px;"><b>'+esc(m.name)+'</b> · Lot '+esc(m.lot)+' · '+esc(m.level)+' <span class="muted">('+m.analytes.length+' analytes)</span></div>'; }).join(''):'<div class="empty">No materials yet.</div>';
    b.innerHTML='<div class="card" style="margin-bottom:14px;"><div class="section-label" style="margin-top:0">Add QC material / lot</div><div class="grid2">'+
        '<div class="field"><label>Material</label><input id="qmName" class="in"></div>'+
        '<div class="field"><label>Lot no.</label><input id="qmLot" class="in"></div>'+
        '<div class="field"><label>Level</label><select id="qmLevel" class="in"><option>L1</option><option>L2</option><option>L3</option></select></div>'+
        '<div class="field"><label>Expiry</label><input id="qmExp" class="in" type="date"></div>'+
      '</div><div style="margin-top:8px"><div style="display:grid;grid-template-columns:1fr 70px 80px 80px 30px;gap:6px;font-size:10.5px;color:var(--muted);"><div>Analyte</div><div>Unit</div><div style="text-align:center">Mean</div><div style="text-align:center">SD</div><div></div></div><div id="qmAn"></div>'+
      '<button class="btn ghost sm" id="qmAdd" style="margin-top:8px">+ Add analyte</button>'+
      '<div style="margin-top:12px"><div class="muted" style="font-size:11px;margin-bottom:4px">Consumables used per accepted run (deducts stock)</div><div id="qmCons"></div>'+
        '<div style="display:flex;gap:6px;margin-top:6px"><select id="qmItem" class="in" style="max-width:200px"><option>Loading…</option></select><input id="qmQty" class="in" type="number" value="1" style="max-width:80px"><button class="btn ghost sm" id="qmAddItem">+ Add</button></div></div>'+
      '<div style="margin-top:12px"><button class="btn" id="qmSave">Save lot</button></div><div id="qmMsg"></div></div></div>'+
      '<div class="card"><div class="section-label" style="margin-top:0">Materials</div>'+listHtml+'</div>';
    var AN=[['Glucose','mg/dL',100,3],['Cholesterol','mg/dL',200,6]];
    function drawAn(){ $id('qmAn').innerHTML=AN.map(function(a,i){ return '<div style="display:grid;grid-template-columns:1fr 70px 80px 80px 30px;gap:6px;align-items:center;padding:3px 0;">'+
        '<input value="'+esc(a[0])+'" class="in" style="height:30px" data-an="'+i+'-0">'+
        '<input value="'+esc(a[1])+'" class="in" style="height:30px" data-an="'+i+'-1">'+
        '<input type="number" value="'+a[2]+'" class="in" style="height:30px;text-align:center" data-an="'+i+'-2">'+
        '<input type="number" value="'+a[3]+'" class="in" style="height:30px;text-align:center" data-an="'+i+'-3">'+
        '<button class="btn ghost sm qmDel" data-i="'+i+'" style="height:30px;width:30px;padding:0">🗑</button></div>'; }).join('');
      $id('qmAn').querySelectorAll('.qmDel').forEach(function(x){ x.onclick=function(){ AN.splice(+x.getAttribute('data-i'),1); drawAn(); }; }); }
    drawAn();
    $id('qmAdd').onclick=function(){ AN.push(['','',0,0]); drawAn(); };
    var CONS=[], ITEMS=[];
    function drawCons(){ $id('qmCons').innerHTML=CONS.length?CONS.map(function(c,i){ var it=ITEMS.filter(function(x){return x.itemId===c.itemId;})[0]; return '<span style="display:inline-flex;align-items:center;gap:5px;background:#f1f1f1;border-radius:14px;padding:3px 10px;margin:3px 4px 0 0;font-size:11.5px;">'+esc(it?it.name:c.itemId)+' ×'+c.qty+' <span class="qmDelC" data-i="'+i+'" style="cursor:pointer;color:#A32D2D">✕</span></span>'; }).join(''):'<span class="muted" style="font-size:11px">None</span>';
      $id('qmCons').querySelectorAll('.qmDelC').forEach(function(x){ x.onclick=function(){ CONS.splice(+x.getAttribute('data-i'),1); drawCons(); }; }); }
    drawCons();
    API.qcInvItems().then(function(r){ ITEMS=(r&&r.ok)?(r.rows||[]):[]; var sel=$id('qmItem'); if(sel) sel.innerHTML=ITEMS.length?ITEMS.map(function(it){return '<option value="'+esc(it.itemId)+'">'+esc(it.name)+(it.unit?(' ('+esc(it.unit)+')'):'')+'</option>';}).join(''):'<option value="">No items</option>'; });
    $id('qmAddItem').onclick=function(){ var iid=$id('qmItem').value, q=+$id('qmQty').value||1; if(!iid) return; CONS.push({itemId:iid,qty:q}); drawCons(); };
    $id('qmSave').onclick=function(){
      var an=AN.map(function(a,i){ function g(j){ var el=$id('qmAn').querySelector('[data-an="'+i+'-'+j+'"]'); return el?el.value:''; } return {analyte:g(0),unit:g(1),mean:+g(2)||0,sd:+g(3)||0}; }).filter(function(a){ return a.analyte; });
      var bt=this; bt.disabled=true;
      API.saveQcMaterial({name:$id('qmName').value,lot:$id('qmLot').value,level:$id('qmLevel').value,expiry:$id('qmExp').value,analytes:an,items:CONS}).then(function(r){ bt.disabled=false;
        if(r&&r.ok){ toast('Lot saved'); loadMats(function(){ materials($id('qcBody')); }); } else $id('qmMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }

  /* ---------- Bulk entry ---------- */
  function entry(b){
    if(!MATS.length){ b.innerHTML='<div class="empty">Add a QC material first (Materials tab).</div>'; return; }
    var matOpts=MATS.map(function(m){ return '<option value="'+esc(m.materialId)+'">'+esc(m.name)+' · '+esc(m.lot)+' · '+esc(m.level)+'</option>'; }).join('');
    b.innerHTML='<div class="card"><div class="grid2">'+
        '<div class="field"><label>Material / lot</label><select id="qeMat" class="in">'+matOpts+'</select></div>'+
        '<div class="field"><label>Analyzer</label><input id="qeAnz" class="in" value="Analyzer A"></div>'+
      '</div><div id="qeGrid" style="margin-top:8px"></div>'+
      '<button class="btn" id="qeSave" style="margin-top:10px">Submit for verification</button><div id="qeMsg"></div></div>';
    function curMat(){ return MATS.filter(function(x){return x.materialId===$id('qeMat').value;})[0]; }
    function grid(){ var m=curMat(); if(!m) return;
      $id('qeGrid').innerHTML='<div style="display:grid;grid-template-columns:1fr 100px 80px 56px 1fr;gap:8px;font-size:10.5px;color:var(--muted);padding-bottom:4px;"><div>Analyte</div><div style="text-align:center">Target</div><div style="text-align:center">Result</div><div style="text-align:center">z</div><div>Status</div></div>'+
        m.analytes.map(function(a,i){ return '<div style="display:grid;grid-template-columns:1fr 100px 80px 56px 1fr;gap:8px;align-items:center;padding:5px 0;border-top:1px solid var(--line);font-size:12px;" data-row="'+i+'">'+
          '<div>'+esc(a.analyte)+' <span class="muted" style="font-size:10px">'+esc(a.unit)+'</span></div>'+
          '<div style="text-align:center;color:var(--muted)">'+a.mean+' ± '+a.sd+'</div>'+
          '<input type="number" class="in qeR" data-i="'+i+'" style="height:28px;text-align:center">'+
          '<div class="qeZ" style="text-align:center;color:var(--muted)">–</div><div class="qeS"></div></div>'; }).join('');
      $id('qeGrid').querySelectorAll('.qeR').forEach(function(inp){ inp.addEventListener('input',function(){ ev(m); }); }); }
    function ev(m){ m.analytes.forEach(function(a,i){ var row=$id('qeGrid').querySelector('[data-row="'+i+'"]'); if(!row) return; var val=parseFloat(row.querySelector('.qeR').value);
      var z=(!isNaN(val)&&a.sd)?((val-a.mean)/a.sd):null, az=z===null?0:Math.abs(z);
      row.querySelector('.qeZ').textContent=z===null?'–':((z>0?'+':'')+z.toFixed(1));
      var st,col,bg; if(z===null){st='';} else if(az>=3){st='Reject 1-3s';col='#A32D2D';bg='#FCEBEB';} else if(az>=2){st='Warn 1-2s';col='#854F0B';bg='#FAEEDA';} else {st='In control';col='#0F6E56';bg='#E1F5EE';}
      row.querySelector('.qeS').innerHTML=st?'<span style="font-size:10px;background:'+bg+';color:'+col+';border-radius:10px;padding:2px 8px;">'+st+'</span>':''; }); }
    $id('qeMat').addEventListener('change',grid); grid();
    $id('qeSave').onclick=function(){ var m=curMat(); if(!m) return; var results=[], flags=[];
      m.analytes.forEach(function(a,i){ var row=$id('qeGrid').querySelector('[data-row="'+i+'"]'); var val=parseFloat(row.querySelector('.qeR').value); if(isNaN(val)) return;
        var z=a.sd?((val-a.mean)/a.sd):0, az=Math.abs(z), status=az>=3?'reject':(az>=2?'warn':'in'); if(status!=='in') flags.push(a.analyte+' '+(az>=3?'1-3s':'1-2s'));
        results.push({analyte:a.analyte,unit:a.unit,mean:a.mean,sd:a.sd,value:val,z:Math.round(z*100)/100,status:status}); });
      if(!results.length){ $id('qeMsg').innerHTML='<div class="msg error">Enter at least one result.</div>'; return; }
      var bt=this; bt.disabled=true;
      API.saveQcRun({materialId:m.materialId,level:m.level,analyzer:$id('qeAnz').value,results:results,flags:flags.join(', ')}).then(function(r){ bt.disabled=false;
        if(r&&r.ok){ toast('Submitted for verification'); grid(); } else $id('qeMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }

  /* ---------- Verify ---------- */
  function verify(b){
    b.innerHTML='<div id="qvList"><div class="center-load"><span class="loader dark"></span> Loading…</div></div>';
    API.listQcRuns({status:'pending'}).then(function(r){ var box=$id('qvList'); if(!box) return;
      if(!r||!r.ok){ box.innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; return; }
      var rows=r.rows||[]; if(!rows.length){ box.innerHTML='<div class="empty">Nothing pending verification.</div>'; return; }
      box.innerHTML=rows.map(function(x){ var mat=MATS.filter(function(m){return m.materialId===x.materialId;})[0];
        var res=(x.results||[]).map(function(rr){ var col=rr.status==='reject'?'#A32D2D':(rr.status==='warn'?'#854F0B':'#0F6E56'); return '<span style="font-size:10.5px;color:'+col+';margin-right:8px;white-space:nowrap;">'+esc(rr.analyte)+' '+rr.value+' ('+(rr.z>0?'+':'')+rr.z+')</span>'; }).join('');
        return '<div class="card" style="margin-bottom:10px;"><div style="font-size:12.5px;font-weight:600;">'+(mat?esc(mat.name):esc(x.materialId))+' · '+esc(x.level)+' · '+esc(x.analyzer)+'</div>'+
          '<div class="muted" style="font-size:10.5px;margin-bottom:6px;">'+esc(x.date)+' '+esc(x.time)+' · '+esc(x.by)+(x.flags?(' · <span style="color:#854F0B">'+esc(x.flags)+'</span>'):'')+'</div>'+
          '<div style="margin-bottom:8px;">'+res+'</div>'+
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><button class="btn ghost sm qvOk" data-id="'+esc(x.runId)+'" style="border-color:#1D7E47;color:#1D7E47">✓ Accept</button>'+
          '<button class="btn ghost sm qvNo" data-id="'+esc(x.runId)+'" style="border-color:#A32D2D;color:#A32D2D">✕ Reject</button>'+
          '<input class="in qvNote" data-id="'+esc(x.runId)+'" placeholder="Corrective action (if reject)" style="flex:1;min-width:150px;height:30px"></div></div>'; }).join('');
      function act(id,action){ var el=box.querySelector('.qvNote[data-id="'+id+'"]'); var note=el?el.value:''; API.verifyQcRun(id,action,note).then(function(rr){ if(rr&&rr.ok){ toast(action==='reject'?'Rejected':'Accepted'); verify(b); } else toast((rr&&rr.error)||'Failed',true); }); }
      box.querySelectorAll('.qvOk').forEach(function(x){ x.onclick=function(){ act(x.getAttribute('data-id'),'accept'); }; });
      box.querySelectorAll('.qvNo').forEach(function(x){ x.onclick=function(){ act(x.getAttribute('data-id'),'reject'); }; });
    });
  }

  /* ---------- Levey-Jennings ---------- */
  function lj(b){
    if(!MATS.length){ b.innerHTML='<div class="empty">Add a QC material first.</div>'; return; }
    var matOpts=MATS.map(function(m){ return '<option value="'+esc(m.materialId)+'">'+esc(m.name)+' · '+esc(m.lot)+'</option>'; }).join('');
    b.innerHTML='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center;"><select id="ljMat" class="in" style="max-width:200px">'+matOpts+'</select><select id="ljAn" class="in" style="max-width:160px"></select></div><div id="ljChart"></div>';
    function fillAn(){ var m=MATS.filter(function(x){return x.materialId===$id('ljMat').value;})[0]; $id('ljAn').innerHTML=(m?m.analytes:[]).map(function(a){return '<option>'+esc(a.analyte)+'</option>';}).join(''); }
    function draw(){ var m=MATS.filter(function(x){return x.materialId===$id('ljMat').value;})[0]; if(!m) return; var an=$id('ljAn').value; var meta=m.analytes.filter(function(a){return a.analyte===an;})[0]; if(!meta) return;
      $id('ljChart').innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>';
      API.listQcRuns({materialId:m.materialId,from:monthFrom()}).then(function(r){ var rows=(r&&r.ok)?(r.rows||[]):[]; var vals=[];
        rows.sort(function(a,bb){return (a.date+a.time)<(bb.date+bb.time)?-1:1;}).forEach(function(run){ (run.results||[]).forEach(function(rr){ if(rr.analyte===an && rr.value!=null) vals.push(rr.value); }); });
        $id('ljChart').innerHTML=ljSvg(meta.mean,meta.sd,vals,an,meta.unit); }); }
    $id('ljMat').addEventListener('change',function(){ fillAn(); draw(); });
    $id('ljAn').addEventListener('change',draw);
    fillAn(); draw();
  }
  function ljSvg(mean,sd,vals,name,unit){
    if(!vals.length) return '<div class="empty">No QC runs yet for '+esc(name)+'.</div>';
    var W=660,H=240,L=54,R=614,T=16,B=200,lo=mean-4*sd,hi=mean+4*sd;
    function y(v){ return (T+(hi-v)/((hi-lo)||1)*(B-T)).toFixed(1); }
    function x(i){ return (L+(vals.length>1?i*((R-L)/(vals.length-1)):0)).toFixed(1); }
    var s='';
    [[3,'#E24B4A'],[2,'#BA7517'],[1,'#888780'],[0,'#5F5E5A'],[-1,'#888780'],[-2,'#BA7517'],[-3,'#E24B4A']].forEach(function(l){ var v=mean+l[0]*sd,yy=y(v);
      s+='<line x1="'+L+'" x2="'+R+'" y1="'+yy+'" y2="'+yy+'" stroke="'+l[1]+'" stroke-width="'+(l[0]===0?1.3:1)+'" '+(l[0]===0?'':'stroke-dasharray="4 4"')+' opacity="'+(l[0]===0?0.9:0.6)+'"/>';
      s+='<text x="'+(R+4)+'" y="'+(+yy+3)+'" font-size="9" fill="'+l[1]+'">'+(l[0]>0?'+':'')+(l[0]||'M')+(l[0]?'SD':'')+'</text>'; });
    if(vals.length>1){ var poly=vals.map(function(v,i){return x(i)+','+y(v);}).join(' '); s+='<polyline points="'+poly+'" fill="none" stroke="#888" stroke-width="1.2" opacity="0.7"/>'; }
    vals.forEach(function(v,i){ var az=Math.abs((v-mean)/(sd||1)),col=az>=2?'#E24B4A':(az>=1?'#BA7517':'#1D9E75'); s+='<circle cx="'+x(i)+'" cy="'+y(v)+'" r="3.4" fill="'+col+'"/>'; });
    return '<div class="card" style="padding:6px"><div style="font-size:12px;font-weight:600;margin:4px 6px;">Levey-Jennings · '+esc(name)+' <span class="muted">(mean '+mean+', SD '+sd+' '+esc(unit)+')</span></div><svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto">'+s+'</svg></div>';
  }
})();
