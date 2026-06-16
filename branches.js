/* Nakoda MIS — Branches management (loads after app.js; reuses its globals) */
(function(){
  var EMPS=[];
  function loadEmps(){ return API.listEmployees().then(function(r){ if(r.ok) EMPS=(r.employees||[]).filter(function(e){return e.Status==='Active';}); return EMPS; }).catch(function(){ return EMPS; }); }

  function paint(list){
    window._branches=list||[];
    var tb=document.getElementById('branchTable').querySelector('tbody'), html='';
    list.forEach(function(b){
      html+='<tr>'+
        '<td><b>'+esc(b.BranchID)+'</b></td>'+
        '<td>'+esc(b.BranchName)+'</td>'+
        '<td>'+esc(b.City||'—')+'</td>'+
        '<td>'+esc(b.Mobile||b.Phone||'—')+'</td>'+
        '<td>'+esc(b.AccountNumber||'—')+'</td>'+
        '<td>'+esc(b.IFSC||'—')+'</td>'+
        '<td>'+statusBadge(b.Status)+'</td>'+
        '<td><button class="btn ghost sm" onclick="openBranchModal(\''+esc(b.BranchID)+'\')">Edit</button></td></tr>';
    });
    tb.innerHTML=html;
    document.getElementById('branchEmpty').classList.toggle('hidden', list.length>0);
  }

  function renderBranches(){
    var add=document.getElementById('addBranchBtn');
    if(add) add.onclick=function(){ openBranchModal(null); };
    loadEmps();
    paint((S.meta&&S.meta.branches)||[]);
    API.listBranchesFull().then(function(r){ if(r.ok) paint(r.branches); }).catch(function(){});
  }

  function openBranchModal(id){
    var editing=!!id;
    var b=editing?((window._branches||[]).filter(function(x){return String(x.BranchID)===String(id);})[0]||{}):{Type:'Branch'};
    var lhUrl=b.LetterheadUrl||'', lhFileId=b.LetterheadFileId||'';
    var empOpts='<option value="">— none —</option>'+EMPS.map(function(e){ return '<option value="'+esc(e.EmpID)+'"'+(e.EmpID===b.PartnerEmpID?' selected':'')+'>'+esc(e.FullName)+' ('+esc(e.Role)+')</option>'; }).join('');
    var lhLine=lhUrl?('Uploaded ✓ <a href="'+esc(lhUrl)+'" target="_blank">view</a>'):'No letterhead yet';
    var body='<div class="grid2">'+
      '<div class="field"><label>Branch Code *</label><input id="b_code" value="'+esc(b.BranchID||'')+'"'+(editing?' disabled':'')+' placeholder="e.g. BR_CORP"></div>'+
      '<div class="field"><label>Branch Name *</label><input id="b_name" value="'+esc(b.BranchName||'')+'"></div>'+
      '<div class="field"><label>City</label><input id="b_city" value="'+esc(b.City||'')+'"></div>'+
      '<div class="field"><label>Landline / Phone</label><input id="b_phone" value="'+esc(b.Phone||'')+'"></div>'+
      '<div class="field"><label>Mobile number</label><input id="b_mobile" inputmode="numeric" value="'+esc(b.Mobile||'')+'"></div>'+
      '<div class="field"><label>Partner (from staff)</label><select id="b_partner">'+empOpts+'</select></div>'+
      '<div class="field full"><label>Address</label><textarea id="b_address" rows="2">'+esc(b.Address||'')+'</textarea></div>'+
      '<div class="section-title full">Letterhead (used for invoices &amp; documents)</div>'+
      '<div class="field full"><input type="file" id="b_lhFile" accept="image/*,application/pdf"><div id="b_lhStatus" style="font-size:12px;color:#666;margin-top:5px">'+lhLine+'</div></div>'+
      '<div class="section-title full">Location (for attendance geo-fencing)</div>'+
      '<div class="field"><label>Latitude</label><input id="b_lat" value="'+esc(b.Latitude||'')+'" placeholder="e.g. 21.1702"></div>'+
      '<div class="field"><label>Longitude</label><input id="b_lng" value="'+esc(b.Longitude||'')+'" placeholder="e.g. 72.8311"></div>'+
      '<div class="field"><label>Allowed radius (metres)</label><input id="b_radius" type="number" value="'+esc(b.GeoRadius||'100')+'"></div>'+
      '<div class="field"><label>&nbsp;</label><button type="button" class="btn ghost" id="b_useLoc">📍 Use my current location</button></div>'+
      '<div class="section-title full">Banking (used later for payroll / payouts)</div>'+
      '<div class="field"><label>Bank name</label><input id="b_bank" value="'+esc(b.BankName||'')+'"></div>'+
      '<div class="field"><label>IFSC</label><input id="b_ifsc" value="'+esc(b.IFSC||'')+'"></div>'+
      '<div class="field full"><label>Account number</label><input id="b_acct" value="'+esc(b.AccountNumber||'')+'"></div>'+
      (editing?'<div class="field full"><label>Status</label><select id="b_status"><option'+(b.Status==='Active'?' selected':'')+'>Active</option><option'+(b.Status==='Inactive'?' selected':'')+'>Inactive</option></select></div>':'')+
    '</div>';
    openModal(editing?('Edit · '+b.BranchName):'Add Branch', body,
      '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="saveBranchBtn">'+(editing?'Save':'Create')+'</button>');

    var inp=document.getElementById('b_lhFile');
    inp.onchange=function(){
      var f=inp.files[0]; if(!f) return;
      if(f.size>4*1024*1024){ toast('File too large (max 4MB).',true); inp.value=''; return; }
      var st=document.getElementById('b_lhStatus'); st.textContent='Uploading…';
      var fr=new FileReader();
      fr.onload=function(){ var s=fr.result, i=s.indexOf(',');
        API.uploadFile({base64:s.slice(i+1), mimeType:f.type, fileName:f.name, subPath:'Letterheads'}).then(function(r){
          if(r.ok){ lhUrl=r.url; lhFileId=r.fileId; st.innerHTML='Uploaded ✓ <a href="'+esc(r.url)+'" target="_blank">view</a>'; }
          else { st.textContent=r.error||'Upload failed'; }
        }).catch(function(){ st.textContent='Uploading a letterhead needs an internet connection.'; });
      };
      fr.readAsDataURL(f);
    };

    var ul=document.getElementById('b_useLoc');
    if(ul) ul.onclick=function(){ if(!navigator.geolocation){ toast('Location not supported on this device.',true); return; } ul.textContent='Locating…';
      navigator.geolocation.getCurrentPosition(function(pos){ document.getElementById('b_lat').value=pos.coords.latitude.toFixed(6); document.getElementById('b_lng').value=pos.coords.longitude.toFixed(6); ul.textContent='📍 Captured ✓'; },
        function(){ ul.textContent='📍 Use my current location'; toast('Could not get location — allow location access.',true); }, {enableHighAccuracy:true,timeout:10000}); };

    document.getElementById('saveBranchBtn').addEventListener('click', function(){
      var partnerSel=document.getElementById('b_partner');
      var data={ BranchName:val('b_name'), City:val('b_city'), Phone:val('b_phone'), Mobile:val('b_mobile'),
        Address:val('b_address'), PartnerEmpID:partnerSel.value, PartnerName:partnerSel.value?(partnerSel.options[partnerSel.selectedIndex].text.replace(/\s*\(.*\)$/,'')):'',
        BankName:val('b_bank'), IFSC:val('b_ifsc'), AccountNumber:val('b_acct'), LetterheadUrl:lhUrl, LetterheadFileId:lhFileId,
        Latitude:val('b_lat'), Longitude:val('b_lng'), GeoRadius:val('b_radius') };
      if(editing) data.Status=val('b_status');
      if(!data.BranchName){ toast('Branch name is required.',true); return; }
      if(!editing){ data.BranchID=val('b_code'); if(!data.BranchID){ toast('Branch code is required.',true); return; } }
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
