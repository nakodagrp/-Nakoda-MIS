/* Nakoda MIS — Asset Library (PDFs/images tagged Branch+Role via checklist dropdowns). */
(function(){
  function $id(i){ return document.getElementById(i); }
  function lvl(){ return (S.perms&&S.perms.level)||''; }
  function canManage(){ return lvl()==='SUPER'||lvl()==='HR_ADMIN'||['HR','MIS','Director','Executive Assistant','Operations Manager'].indexOf(S.user&&S.user.Role)>=0; }
  function ico(t){ return t==='pdf'?'<div class="ic pdf">PDF</div>':(t==='image'?'<div class="ic img">IMG</div>':'<div class="ic file">FILE</div>'); }
  function tagTxt(csv){ return (!csv||csv==='ALL')?'All':String(csv).split(',').join(', '); }

  function renderAssets(){
    var v=$id('page-assets');
    v.innerHTML='<div class="page-head"><h1>Assets</h1></div>'+
      (canManage()?'<div class="pm2-tabs" id="asTabs"><span data-t="lib" class="on">Library</span><span data-t="manage">Manage</span></div>':'')+
      '<div id="asBody"></div>';
    v.querySelectorAll('#asTabs span').forEach(function(s){ s.onclick=function(){ v.querySelectorAll('#asTabs span').forEach(function(z){z.classList.remove('on');}); s.classList.add('on'); s.getAttribute('data-t')==='manage'?loadManage():loadLib(); }; });
    loadLib();
  }

  function loadLib(){
    API.cachedAssets().then(function(r){ if(r) paintLib(r); });
    API.listAssets().then(function(r){ if(r&&r.ok) paintLib(r); });
  }
  function paintLib(r){
    var box=$id('asBody'); if(!box) return; var rows=r.assets||[];
    if(!rows.length){ box.innerHTML='<div class="empty">No assets shared with you yet.</div>'; return; }
    var byCat={}; rows.forEach(function(a){ (byCat[a.category]=byCat[a.category]||[]).push(a); });
    box.innerHTML=Object.keys(byCat).map(function(cat){ return '<div class="sec-h">'+esc(cat)+'</div>'+byCat[cat].map(function(a){
      return '<a class="ac" href="'+esc(a.fileUrl)+'" target="_blank">'+ico(a.fileType)+'<div class="m"><b>'+esc(a.title)+'</b><div class="d">'+esc(a.fileType||'file')+'</div></div><span class="o">Open ↗</span></a>';
    }).join(''); }).join('');
  }

  function loadManage(){
    API.listAssetsManage().then(function(r){ var box=$id('asBody'); if(!box) return; if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
      var rows=r.assets||[];
      box.innerHTML='<div class="fin-actions"><button class="btn" id="asAdd">+ Upload asset</button></div>'+
        (rows.length?rows.map(function(a){ return '<div class="ac" data-id="'+esc(a.assetId)+'">'+ico(a.fileType)+'<div class="m"><b>'+esc(a.title)+'</b><div class="d">'+esc(a.category||'')+' · Branch: '+esc(tagTxt(a.branches))+' · Role: '+esc(tagTxt(a.roles))+'</div></div><a href="javascript:void(0)" data-ed="'+esc(a.assetId)+'">✎</a> <a href="javascript:void(0)" data-dl="'+esc(a.assetId)+'" style="color:var(--red)">🗑</a></div>'; }).join(''):'<div class="empty">No assets yet.</div>');
      $id('asAdd').onclick=function(){ openAssetForm(null); };
      box.querySelectorAll('[data-ed]').forEach(function(b){ b.onclick=function(){ openAssetForm(rows.filter(function(x){return x.assetId===b.getAttribute('data-ed');})[0]); }; });
      box.querySelectorAll('[data-dl]').forEach(function(b){ b.onclick=function(){ if(confirm('Delete asset?')) API.deleteAsset(b.getAttribute('data-dl')).then(function(){ toast('Deleted'); loadManage(); }); }; });
    });
  }

  /* multi-select checklist dropdown */
  function msd(id,label,opts,selCsv){
    var sel=(!selCsv||selCsv==='ALL')?['__ALL']:String(selCsv).split(',').map(function(x){return x.trim();});
    var html='<div class="msd" id="'+id+'"><div class="msd-field" data-f="'+id+'"><span class="msd-sum">'+msdSum(sel,opts)+'</span><span class="ar">▾</span></div>'+
      '<div class="msd-panel">'+
      '<label class="msd-opt all"><input type="checkbox" data-all value="__ALL"'+(sel.indexOf('__ALL')>=0?' checked':'')+'> '+label+'</label>'+
      opts.map(function(o){ return '<label class="msd-opt"><input type="checkbox" value="'+esc(o.v)+'"'+(sel.indexOf(o.v)>=0?' checked':'')+'> '+esc(o.t)+'</label>'; }).join('')+
      '</div></div>';
    return html;
  }
  function msdSum(sel,opts){ if(sel.indexOf('__ALL')>=0) return 'All'; if(!sel.length) return 'None'; if(sel.length<=2) return sel.map(function(v){var o=opts.filter(function(x){return x.v===v;})[0];return o?o.t:v;}).join(', '); return sel.length+' selected'; }
  function wireMsd(id,opts){
    var root=$id(id); if(!root) return;
    var field=root.querySelector('.msd-field'), panel=root.querySelector('.msd-panel'), allBx=root.querySelector('[data-all]');
    field.onclick=function(e){ e.stopPropagation(); panel.classList.toggle('open'); };
    panel.addEventListener('click',function(e){ e.stopPropagation(); });
    function others(){ return [].slice.call(root.querySelectorAll('.msd-opt:not(.all) input')); }
    allBx.onchange=function(){ if(allBx.checked) others().forEach(function(c){c.checked=false;}); refresh(); };
    others().forEach(function(c){ c.onchange=function(){ if(c.checked) allBx.checked=false; if(!others().some(function(x){return x.checked;})) allBx.checked=true; refresh(); }; });
    function refresh(){ root.querySelector('.msd-sum').textContent=msdSum(msdVal(id),opts); }
  }
  function msdVal(id){ var root=$id(id); if(!root) return ['__ALL']; if(root.querySelector('[data-all]').checked) return ['__ALL']; var v=[].slice.call(root.querySelectorAll('.msd-opt:not(.all) input:checked')).map(function(c){return c.value;}); return v.length?v:['__ALL']; }

  function openAssetForm(a){ a=a||{};
    var brs=((S.meta&&S.meta.branches)||[]).map(function(b){return {v:b.BranchID,t:b.BranchName};});
    var roles=((S.meta&&S.meta.roles)||[]).map(function(r){return {v:r.Role||r,t:r.Role||r};});
    var st={file:''};
    var body='<div class="field full"><label>Title</label><input id="asTitle" class="in" value="'+esc(a.title||'')+'"></div>'+
      '<div class="field full"><label>Category</label><input id="asCat" class="in" value="'+esc(a.category||'')+'" placeholder="e.g. Price lists, Brochures, Packages" list="asCatList"><datalist id="asCatList"><option>Price lists</option><option>Brochures</option><option>Packages</option><option>Reports</option><option>Other</option></datalist></div>'+
      '<div class="field full"><label>File (PDF / image)'+(a.assetId?' — leave blank to keep current':'')+'</label><input type="file" id="asFile" accept="application/pdf,image/*"><div id="asFileSt" class="upst" style="font-size:11px;color:#888">'+(a.fileUrl?'<a href="'+esc(a.fileUrl)+'" target="_blank">current file</a>':'')+'</div></div>'+
      '<div class="field full"><label>Branches</label>'+msd('asBranches','All branches',brs,a.branches)+'</div>'+
      '<div class="field full"><label>Roles</label>'+msd('asRoles','All roles',roles,a.roles)+'</div>'+
      '<div id="asMsg"></div>';
    openModal(a.assetId?'Edit asset':'Upload asset', body, '<button class="btn" id="asSave">'+(a.assetId?'Save':'Upload')+'</button>');
    wireMsd('asBranches',brs); wireMsd('asRoles',roles);
    $id('asFile').onchange=function(){ var f=this.files[0]; if(!f) return; if(f.size>8*1024*1024){ toast('File too large (max 8MB)',true); this.value=''; return; } var s2=$id('asFileSt'); s2.textContent='Reading…'; var fr=new FileReader(); fr.onload=function(){ var s=fr.result,i=s.indexOf(','); st.file=s.slice(i+1); st.fileMime=f.type; st.fileName=f.name; s2.innerHTML='Attached ✓ '+esc(f.name); }; fr.readAsDataURL(f); };
    $id('asSave').onclick=function(){ var t=$id('asTitle').value.trim(); if(!t){ $id('asMsg').innerHTML='<div class="msg error">Title required.</div>'; return; }
      this.disabled=true; this.textContent='Saving…';
      API.saveAsset({assetId:a.assetId,title:t,category:$id('asCat').value.trim()||'Other',branches:msdVal('asBranches'),roles:msdVal('asRoles'),file:st.file,fileMime:st.fileMime,fileName:st.fileName}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Saved'); loadManage(); } else $id('asMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }).catch(function(){ $id('asMsg').innerHTML='<div class="msg error">Uploading needs internet.</div>'; }); };
  }
  document.addEventListener('click',function(){ document.querySelectorAll('.msd-panel.open').forEach(function(p){p.classList.remove('open');}); });

  window.renderAssets=renderAssets;
})();
