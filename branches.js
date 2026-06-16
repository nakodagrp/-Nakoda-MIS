/* Nakoda MIS — Branches management (loads after app.js; reuses its globals) */
(function(){
  function paint(list){
    window._branches=list||[];
    var tb=document.getElementById('branchTable').querySelector('tbody'), html='';
    list.forEach(function(b){
      html+='<tr>'+
        '<td>'+esc(b.BranchID)+'</td>'+
        '<td><b>'+esc(b.BranchName)+'</b></td>'+
        '<td>'+esc(b.Type)+'</td>'+
        '<td>'+esc(b.City||'—')+'</td>'+
        '<td>'+esc(b.Phone||'—')+'</td>'+
        '<td>'+statusBadge(b.Status)+'</td>'+
        '<td><button class="btn ghost sm" onclick="openBranchModal(\''+b.BranchID+'\')">Edit</button></td></tr>';
    });
    tb.innerHTML=html;
    document.getElementById('branchEmpty').classList.toggle('hidden', list.length>0);
  }

  function renderBranches(){
    var add=document.getElementById('addBranchBtn');
    if(add) add.onclick=function(){ openBranchModal(null); };
    paint((S.meta&&S.meta.branches)||[]);                 // instant from cache
    API.listBranchesFull().then(function(r){ if(r.ok) paint(r.branches); }).catch(function(){});
  }

  function openBranchModal(id){
    var editing=!!id;
    var b=editing?((window._branches||[]).filter(function(x){return String(x.BranchID)===String(id);})[0]||{}):{Type:'Branch'};
    var body='<div class="grid2">'+
      '<div class="field"><label>Branch name *</label><input id="b_Name" value="'+esc(b.BranchName||'')+'"></div>'+
      '<div class="field"><label>Type</label><select id="b_Type"><option'+(b.Type==='Branch'?' selected':'')+'>Branch</option><option'+(b.Type==='Corporate'?' selected':'')+'>Corporate</option></select></div>'+
      '<div class="field"><label>City</label><input id="b_City" value="'+esc(b.City||'')+'"></div>'+
      '<div class="field"><label>Phone</label><input id="b_Phone" value="'+esc(b.Phone||'')+'"></div>'+
      '<div class="field full"><label>Address</label><textarea id="b_Address" rows="2">'+esc(b.Address||'')+'</textarea></div>'+
      (editing?'<div class="field"><label>Status</label><select id="b_Status"><option'+(b.Status==='Active'?' selected':'')+'>Active</option><option'+(b.Status==='Inactive'?' selected':'')+'>Inactive</option></select></div>':'')+
    '</div>';
    openModal(editing?('Edit · '+b.BranchName):'Add Branch', body,
      '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="saveBranchBtn">'+(editing?'Save':'Create')+'</button>');
    document.getElementById('saveBranchBtn').addEventListener('click', function(){
      var data={BranchName:val('b_Name'),Type:val('b_Type'),City:val('b_City'),Phone:val('b_Phone'),Address:val('b_Address')};
      if(editing) data.Status=val('b_Status');
      if(!data.BranchName){ toast('Branch name is required.',true); return; }
      var btn=document.getElementById('saveBranchBtn'); btn.disabled=true; btn.innerHTML='<span class="loader"></span>';
      var p=editing?API.updateBranch(id,data):API.createBranch(data);
      p.then(function(r){
        if(!r.ok){ toast(r.error,true); btn.disabled=false; btn.textContent=editing?'Save':'Create'; return; }
        closeModal(); toast('Saved'); renderBranches();
        API.getMetadata().then(function(m){ if(m.ok){ S.meta={roles:m.roles,branches:m.branches}; if(typeof populateSelectors==='function') populateSelectors(); } });
      }).catch(function(){ toast('Adding branches needs an internet connection.',true); btn.disabled=false; btn.textContent=editing?'Save':'Create'; });
    });
  }

  window.renderBranches=renderBranches;
  window.openBranchModal=openBranchModal;
})();
