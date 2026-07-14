/* Nakoda MIS — Payment Requests (ERP-style vendor bill / voucher).
   Raise a payment request → Accounts/Director approve → posts a payable into the Expenses ledger → mark paid. */
(function(){
  function $id(i){ return document.getElementById(i); }
  function lvl(){ return (S.perms&&S.perms.level)||''; }
  function money(n){ return '₹'+Math.round(Number(n)||0).toLocaleString('en-IN'); }
  function today(){ return new Date().toISOString().slice(0,10); }
  var PR={branch:'',status:'all',requests:[],vendors:[],categories:[],canApprove:false,canManage:false};
  var PRFILES=[], PRQR=null;
  var STATUSES=[['all','All'],['pending','Pending'],['approved','Approved'],['paid','Paid'],['rejected','Rejected'],['cancelled','Cancelled']];

  function chip(st){
    var map={pending:['#854F0B','#FAEEDA'],approved:['#185FA5','#E4EEF8'],paid:['#1a7f37','#e7f6ec'],rejected:['#DA1017','#FBE3E4'],cancelled:['#777','#eee']};
    var c=map[st]||map.cancelled;
    return '<span style="background:'+c[1]+';color:'+c[0]+';border-radius:8px;padding:3px 9px;font-size:11px;font-weight:700;text-transform:uppercase">'+esc(st)+'</span>';
  }

  window.renderPayReq=function(){
    var v=$id('page-payreq'); if(!v) return;
    var brs=(S.meta&&S.meta.branches)||[];
    // estimate manager/approver rights client-side so the branch picker shows on first paint
    // (server is authoritative; load() refreshes these from the response)
    PR.canManage=!!(S.perms&&(S.perms.canViewAll||S.perms.level==='SUPER'||S.perms.canManageAll||(S.user&&['Accounts','Director','Operations Manager'].indexOf(S.user.Role)>=0)));
    PR.canApprove=!!(S.perms&&(S.perms.level==='SUPER'||S.perms.canManageAll||(S.user&&['Accounts','Director','Operations Manager'].indexOf(S.user.Role)>=0)));
    if(!PR.branch && !PR.canManage) PR.branch=(S.user&&S.user.Branch)||'';
    v.innerHTML='<div class="page-head"><h1>Payment Requests</h1></div>'+
      '<div class="acc-top">'+
        (PR.canManage?'<select class="in" id="prBranch" style="max-width:180px"><option value="">All branches</option>'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'"'+(b.BranchID===PR.branch?' selected':'')+'>'+esc(b.BranchName)+'</option>';}).join('')+'</select>':'<span class="acc-br">'+esc(branchName(PR.branch))+'</span>')+
        '<button class="btn" id="prNew" style="margin-left:auto">+ New request</button></div>'+
      '<div class="pm2-tabs sub" id="prTabs" style="margin:10px 0">'+STATUSES.map(function(s){return '<span data-s="'+s[0]+'"'+(s[0]===PR.status?' class="on"':'')+'>'+s[1]+'</span>';}).join('')+'</div>'+
      '<div id="prBody"></div>';
    var bs=$id('prBranch'); if(bs) bs.onchange=function(){ PR.branch=bs.value; load(); };
    v.querySelectorAll('#prTabs span').forEach(function(s){ s.onclick=function(){ PR.status=s.getAttribute('data-s'); v.querySelectorAll('#prTabs span').forEach(function(z){z.classList.remove('on');}); s.classList.add('on'); load(); }; });
    $id('prNew').onclick=openForm;
    load();
  };

  function load(){ var b=$id('prBody'); if(!b) return; b.innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>';
    API.listPayRequests(PR.branch,PR.status).then(function(r){ var box=$id('prBody'); if(!box) return; if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'Failed to load')+'</div>'; return; }
      PR.requests=r.requests||[]; PR.vendors=r.vendors||[]; PR.categories=r.categories||[]; PR.canApprove=!!r.canApprove; PR.canManage=!!r.canManage;
      // keep the "+ New request" branch picker enabled even before first paint
      var pn=$id('prNew'); if(pn) pn.onclick=openForm;
      if(!PR.requests.length){ box.innerHTML='<div class="empty">No payment requests'+(PR.status!=='all'?(' ('+PR.status+')'):'')+'.</div>'; return; }
      box.innerHTML=PR.requests.map(reqCard).join('');
      PR.requests.forEach(function(rq){
        var open=$id('pr_open_'+rq.reqId); if(open) open.onclick=function(){ openDetail(rq); };
      });
    }); }

  function reqCard(rq){
    var who=rq.billType==='voucher'?(rq.payeeName||'—'):(rq.vendorName||rq.payeeName||'—');
    var typeLbl=rq.billType==='voucher'?'Voucher':'Vendor bill';
    var due=rq.dueDate?(' · due '+dateNiceP(rq.dueDate)):'';
    var pr=(rq.priority&&rq.priority!=='Normal')?(' · <b style="color:#DA1017">'+esc(rq.priority)+'</b>'):'';
    return '<div class="hx-row" id="pr_open_'+esc(rq.reqId)+'" style="cursor:pointer">'+
      '<div class="hx-mid"><b>'+esc(rq.number||'')+'</b> <span style="font-size:11px;color:#999">'+esc(typeLbl)+'</span>'+
        '<div class="hx-m">'+esc(who)+' · '+esc(rq.category||'')+due+pr+' · '+esc(rq.branchName||'')+'</div>'+
        '<div class="hx-m" style="color:#aaa">'+esc(rq.description||'')+'</div></div>'+
      '<div style="text-align:right"><div style="font-weight:700">'+(Number(rq.amount)>0?money(rq.amount):'<span style="color:#bbb;font-weight:400">—</span>')+'</div>'+chip(rq.status)+'</div></div>';
  }
  function dateNiceP(v){ var s=String(v||'').slice(0,10); var p=s.split('-'); return p.length===3?(p[2]+'-'+p[1]+'-'+p[0]):s; }

  /* ---- New request form ---- */
  function openForm(){ PRFILES=[]; PRQR=null;
    var brs=(S.meta&&S.meta.branches)||[];
    var cats=PR.categories.length?PR.categories:['Rent','Utilities','Travel','Miscellaneous'];
    var body=''+
      (PR.canManage?'<div class="field full"><label>Branch</label><select id="prfBranch" class="in">'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'"'+(b.BranchID===(PR.branch||(S.user&&S.user.Branch))?' selected':'')+'>'+esc(b.BranchName)+'</option>';}).join('')+'</select></div>':'')+
      '<div class="field full"><label>Bill type *</label><div class="pr-types" id="prfType">'+
        '<div class="pr-type on" data-t="vendor"><b>Vendor bill</b><span>Pick vendor + enter bill #</span></div>'+
        '<div class="pr-type" data-t="voucher"><b>Voucher (non-bill)</b><span>Auto voucher # · utility, travel, etc.</span></div></div></div>'+
      /* vendor-only */
      '<div id="prfVendorBox">'+
        '<div class="field full"><label>Party / vendor name *</label><input id="prfParty" class="in" placeholder="e.g. Reliance Energy, ABC Traders"></div>'+
        '<div class="field full"><label>Bill number *</label><input id="prfBillNo" class="in" placeholder="e.g. INV-2026-0421"></div></div>'+
      /* voucher-only */
      '<div id="prfPayeeBox" style="display:none"><div class="field full"><label>Payee name *</label><input id="prfPayee" class="in" placeholder="e.g. Reliance Energy, Hotel Royal"></div></div>'+
      '<div class="field full"><label>Category</label><select id="prfCat" class="in">'+cats.map(function(c){return '<option>'+esc(c)+'</option>';}).join('')+'</select></div>'+
      '<div class="field full"><label>Details / description *</label><textarea id="prfDesc" class="in" rows="2" placeholder="What is this for? (e.g. April electricity bill, hotel booking for sample pickup)"></textarea></div>'+
      '<div class="grid2"><div class="field"><label>Amount (₹) <span id="prfAmtReq" style="color:#999">(if known)</span></label><input id="prfAmt" class="in" type="number" min="0"></div>'+
        '<div class="field" id="prfDueBox" style="display:none"><label>Due date *</label><input id="prfDue" class="in" type="date"></div></div>'+
      '<div class="field full" id="prfPrioBox" style="display:none"><label>Priority</label><select id="prfPrio" class="in"><option>Normal</option><option>Urgent</option><option>Low</option></select></div>'+
      '<div class="field full"><label>Notes (optional)</label><textarea id="prfNotes" class="in" rows="2"></textarea></div>'+
      '<div class="field full"><label>Attachments (photos / PDFs / bills — up to 5, max 8 MB each)</label>'+
        '<input id="prfFiles" type="file" class="in" multiple accept="image/*,.pdf,.xlsx,.xls"><div id="prfFileList" style="font-size:12px;margin-top:6px"></div></div>'+
      '<div class="field full"><label>Payment QR code (optional — single image)</label>'+
        '<input id="prfQr" type="file" class="in" accept="image/*"><div id="prfQrList" style="font-size:12px;margin-top:6px"></div></div>'+
      '<div id="prfMsg"></div>';
    openModal('New payment request', body, '<button class="btn" id="prfSave">Submit request</button>');
    // bill-type toggle
    document.querySelectorAll('#prfType .pr-type').forEach(function(d){ d.onclick=function(){ document.querySelectorAll('#prfType .pr-type').forEach(function(z){z.classList.remove('on');}); d.classList.add('on'); setType(d.getAttribute('data-t')); }; });
    setType('vendor');
    $id('prfFiles').onchange=onPickFiles;
    $id('prfQr').onchange=onPickQr;
    $id('prfSave').onclick=submitForm;
  }
  function setType(t){
    var voucher=(t==='voucher');
    $id('prfVendorBox').style.display=voucher?'none':'';
    $id('prfPayeeBox').style.display=voucher?'':'none';
    $id('prfDueBox').style.display=voucher?'':'none';
    $id('prfPrioBox').style.display=voucher?'':'none';
    $id('prfAmtReq').textContent=voucher?'*':'(if known)';
    PR._type=t;
  }
  function onPickFiles(){
    var files=Array.prototype.slice.call(this.files||[]); this.value='';
    files.forEach(function(f){
      if(PRFILES.length>=5){ toast('Max 5 files',true); return; }
      if(f.size>8*1024*1024){ toast('"'+f.name+'" is over 8 MB',true); return; }
      var item={name:f.name,url:'',status:'uploading'}; PRFILES.push(item); paintFiles();
      var fr=new FileReader();
      fr.onload=function(){ var s=fr.result,i=s.indexOf(',');
        API.uploadFile({base64:s.slice(i+1),fileName:f.name,mimeType:f.type,subPath:'PayRequests/'+today()}).then(function(r){
          if(r&&r.ok){ item.url=r.url; item.status='done'; } else { item.status='error'; }
          paintFiles();
        },function(){ item.status='error'; paintFiles(); });
      };
      fr.readAsDataURL(f);
    });
  }
  function paintFiles(){ var el=$id('prfFileList'); if(!el) return;
    el.innerHTML=PRFILES.map(function(f,i){ var tag=f.status==='uploading'?' <span style="color:#888">uploading…</span>':(f.status==='error'?' <span style="color:#DA1017">failed</span>':' ✓'); return '<div>'+esc(f.name)+tag+' <a href="javascript:void(0)" data-rm="'+i+'" style="color:#DA1017">remove</a></div>'; }).join('');
    el.querySelectorAll('[data-rm]').forEach(function(a){ a.onclick=function(){ PRFILES.splice(+a.getAttribute('data-rm'),1); paintFiles(); }; });
  }
  function onPickQr(){ var f=this.files&&this.files[0]; this.value=''; if(!f) return;
    if(f.size>8*1024*1024){ toast('QR image is over 8 MB',true); return; }
    PRQR={name:f.name,url:'',status:'uploading'}; paintQr();
    var fr=new FileReader();
    fr.onload=function(){ var s=fr.result,i=s.indexOf(',');
      API.uploadFile({base64:s.slice(i+1),fileName:f.name,mimeType:f.type,subPath:'PayRequests/'+today()}).then(function(r){
        if(r&&r.ok){ PRQR.url=r.url; PRQR.status='done'; } else { PRQR.status='error'; } paintQr();
      },function(){ PRQR.status='error'; paintQr(); }); };
    fr.readAsDataURL(f);
  }
  function paintQr(){ var el=$id('prfQrList'); if(!el) return; if(!PRQR){ el.innerHTML=''; return; }
    var tag=PRQR.status==='uploading'?' <span style="color:#888">uploading…</span>':(PRQR.status==='error'?' <span style="color:#DA1017">failed</span>':' ✓');
    el.innerHTML='<div>'+esc(PRQR.name)+tag+' <a href="javascript:void(0)" id="prfQrRm" style="color:#DA1017">remove</a></div>';
    var rm=$id('prfQrRm'); if(rm) rm.onclick=function(){ PRQR=null; paintQr(); };
  }
  function submitForm(){
    var t=PR._type||'vendor';
    if(PRFILES.some(function(f){return f.status==='uploading';})){ $id('prfMsg').innerHTML='<div class="msg error">Wait for attachments to finish uploading.</div>'; return; }
    if(PRQR&&PRQR.status==='uploading'){ $id('prfMsg').innerHTML='<div class="msg error">Wait for the QR image to finish uploading.</div>'; return; }
    var party=(t==='vendor'?$id('prfParty').value.trim():$id('prfPayee').value.trim());
    var data={ billType:t,
      branchId:($id('prfBranch')?$id('prfBranch').value:(PR.branch||(S.user&&S.user.Branch)||'')),
      billNo:(t==='vendor'?$id('prfBillNo').value.trim():''),
      payeeName:party,
      category:$id('prfCat').value, description:$id('prfDesc').value.trim(),
      amount:Number($id('prfAmt').value)||0,
      dueDate:(t==='voucher'?$id('prfDue').value:''),
      priority:(t==='voucher'?$id('prfPrio').value:'Normal'),
      notes:$id('prfNotes').value.trim(),
      files:PRFILES.filter(function(f){return f.url;}).map(function(f){return {name:f.name,url:f.url};}),
      qrUrl:(PRQR&&PRQR.url)||'' };
    // client-side checks mirror the server
    if(t==='vendor' && !party){ return msg('Enter the party / vendor name.'); }
    if(t==='vendor' && !data.billNo){ return msg('Enter the bill number.'); }
    if(t==='voucher' && !party){ return msg('Enter the payee name.'); }
    if(!data.description){ return msg('Add a description.'); }
    if(t==='voucher' && data.amount<=0){ return msg('Enter the amount.'); }
    var btn=$id('prfSave'); btn.disabled=true; btn.textContent='Submitting…';
    API.createPayRequest(data).then(function(r){ if(r&&r.ok){ closeModal(); toast('Request '+(r.number||'')+' submitted'); load(); } else { msg((r&&r.error)||'Failed'); btn.disabled=false; btn.textContent='Submit request'; } });
    function msg(m){ $id('prfMsg').innerHTML='<div class="msg error">'+esc(m)+'</div>'; }
  }

  /* ---- Detail / approval ---- */
  function openDetail(rq){
    var files=(rq.files||[]);
    var rows=[
      ['Number',rq.number],['Type',rq.billType==='voucher'?'Voucher (non-bill)':'Vendor bill'],
      [rq.billType==='voucher'?'Payee':'Vendor',rq.billType==='voucher'?rq.payeeName:(rq.vendorName||rq.payeeName)],
      ['Bill / Voucher #',rq.billNo||'—'],['Category',rq.category],['Branch',rq.branchName],
      ['Amount',Number(rq.amount)>0?money(rq.amount):'— (set on approval)'],
      ['Due date',rq.dueDate?dateNiceP(rq.dueDate):'—'],['Priority',rq.priority||'Normal'],
      ['Raised by',rq.raisedByName||''],['Status',rq.status]
    ];
    var body='<div class="pr-detail">'+rows.map(function(kv){ return '<div class="pr-kv"><span>'+esc(kv[0])+'</span><b>'+esc(String(kv[1]==null?'':kv[1]))+'</b></div>'; }).join('')+'</div>'+
      (rq.description?'<div class="field full"><label>Details</label><div>'+esc(rq.description)+'</div></div>':'')+
      (rq.notes?'<div class="field full"><label>Notes</label><div style="color:#666">'+esc(rq.notes)+'</div></div>':'')+
      (files.length?'<div class="field full"><label>Attachments</label>'+files.map(function(f){return '<div><a href="'+esc(f.url)+'" target="_blank" rel="noopener">'+esc(f.name||'file')+'</a></div>';}).join('')+'</div>':'<div style="font-size:12px;color:#aaa">No attachments.</div>')+
      (rq.qrUrl?'<div class="field full"><label>Payment QR</label><a href="'+esc(rq.qrUrl)+'" target="_blank" rel="noopener">View QR code</a></div>':'')+
      '<div id="prdMsg"></div>';
    var foot='';
    if(rq.status==='pending'){
      if(PR.canApprove){
        foot='<input id="prdAmt" class="in" type="number" placeholder="Amount ₹" value="'+(Number(rq.amount)>0?rq.amount:'')+'" style="max-width:130px;margin-right:auto">'+
          '<button class="btn ghost" id="prdReject">Reject</button><button class="btn" id="prdApprove">Approve &amp; post to Accounts</button>';
      } else if(String(rq.raisedBy)===String(S.user&&S.user.EmpID)){
        foot='<button class="btn ghost" id="prdCancel">Cancel request</button>';
      }
    } else if(rq.status==='approved' && PR.canApprove){
      foot='<button class="btn" id="prdPaid">Mark paid</button>';
    }
    openModal(rq.number||'Payment request', body, foot);
    var ap=$id('prdApprove'); if(ap) ap.onclick=function(){ doAction(rq,'approve',{amount:Number(($id('prdAmt')||{}).value)||0}); };
    var rj=$id('prdReject'); if(rj) rj.onclick=function(){ var n=prompt('Reason for rejection (optional):')||''; doAction(rq,'reject',{note:n}); };
    var cx=$id('prdCancel'); if(cx) cx.onclick=function(){ if(confirm('Cancel this request?')) doAction(rq,'cancel',{}); };
    var pd=$id('prdPaid'); if(pd) pd.onclick=function(){ doAction(rq,'paid',{}); };
  }
  function doAction(rq,action,data){
    if(action==='approve' && (!data.amount||data.amount<=0) && Number(rq.amount)<=0){ $id('prdMsg').innerHTML='<div class="msg error">Enter the amount before approving.</div>'; return; }
    API.setPayRequest(rq.reqId,action,data).then(function(r){ if(r&&r.ok){ closeModal(); toast(action==='approve'?'Approved · posted to Accounts':(action==='reject'?'Rejected':(action==='paid'?'Marked paid':'Cancelled'))); load(); } else { var m=$id('prdMsg'); if(m) m.innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; } });
  }
})();
