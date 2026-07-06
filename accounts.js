/* Nakoda MIS — Accounts: Finance Sheet (P&L), Daily Entry, Invoices/Receivables, Expenses. */
(function(){
  var EXP_CATS=['Material Purchased','Outsourced Services','Professional fees','Rent','Light bill','Petrol','Mahavir Express Services','Miscellaneous','Management cost','Software cost','Sales','Marketing','Other'];
  var INC_CATS=['B2Camp','Other income'];
  var ACC={branch:'',ym:ymNowA(),tab:'finance',dailyPage:0};
  function $id(i){ return document.getElementById(i); }
  function ymNowA(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  function money(n){ return Math.round(Number(n)||0).toLocaleString('en-IN'); }
  function lvl(){ return (S.perms&&S.perms.level)||''; }
  function isInvestor(){ return lvl()==='BRANCH_VIEW'; }
  function canEnter(){ return lvl()==='SUPER'||lvl()==='HR_ADMIN'||lvl()==='BRANCH_MGR'||lvl()==='MANAGER'||['CRM','Accounts','Operations Manager','Process Coordinator'].indexOf(S.user&&S.user.Role)>=0; }
  function canVerify(){ return lvl()==='SUPER'||lvl()==='HR_ADMIN'||(S.user&&(S.user.Role==='Accounts'||S.user.Role==='Process Coordinator')); }
  function canViewAll(){ return S.perms&&S.perms.canViewAll; }

  function renderAccounts(){
    var v=$id('page-accounts'), brs=(S.meta&&S.meta.branches)||[];
    if(!ACC.branch && !canViewAll()) ACC.branch=(S.user&&S.user.Branch)||'';
    var tabs=isInvestor()?[['finance','Finance Sheet']]:[['finance','Finance Sheet'],['daily','Daily Entry'],['invoices','Invoices'],['expenses','Expenses'],['bank','Bank &amp; Reconcile'],['payout','Payout file']];
    v.innerHTML='<div class="page-head"><h1>Accounts</h1></div>'+
      '<div class="acc-top">'+
        (canViewAll()?'<select class="in" id="accBranch" style="max-width:170px"><option value="">All branches</option>'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'"'+(b.BranchID===ACC.branch?' selected':'')+'>'+esc(b.BranchName)+'</option>';}).join('')+'</select>':'<span class="acc-br">'+esc(branchName(ACC.branch))+'</span>')+
        '<input class="in" id="accYm" type="month" value="'+ACC.ym+'" style="max-width:160px">'+
      '</div>'+
      '<div class="pm2-tabs" id="accTabs">'+tabs.map(function(t){return '<span data-t="'+t[0]+'"'+(t[0]===ACC.tab?' class="on"':'')+'>'+t[1]+'</span>';}).join('')+'</div>'+
      '<div id="accBody"></div>';
    var bsel=$id('accBranch'); if(bsel) bsel.onchange=function(){ ACC.branch=bsel.value; ACC.dailyPage=0; paintTab(); };
    $id('accYm').onchange=function(){ ACC.ym=$id('accYm').value; ACC.dailyPage=0; paintTab(); };
    v.querySelectorAll('#accTabs span').forEach(function(s){ s.onclick=function(){ ACC.tab=s.getAttribute('data-t'); v.querySelectorAll('#accTabs span').forEach(function(z){z.classList.remove('on');}); s.classList.add('on'); paintTab(); }; });
    if(isInvestor()) ACC.tab='finance';
    paintTab();
  }
  function paintTab(){ var b=$id('accBody'); if(!b) return; b.innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>';
    if(ACC.tab==='finance') loadFinance(); else if(ACC.tab==='daily') loadDaily(); else if(ACC.tab==='invoices') loadInvoices(); else if(ACC.tab==='bank') loadBank(); else if(ACC.tab==='payout') loadPayout(); else loadExpenses(); }

  /* ---- Finance Sheet ---- */
  function loadFinance(){ API.financeSheet(ACC.branch, ACC.ym).then(function(r){ var box=$id('accBody'); if(!box) return; if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'No data')+'</div>'; return; } box.innerHTML=finHtml(r); $id('finPdf').onclick=function(){ finPdf(r); }; }); }
  function row(l,v,cls){ return '<tr class="'+(cls||'')+'"><td>'+l+'</td><td class="amt">'+(v===''?'':'₹'+money(v))+'</td></tr>'; }
  function finHtml(r){
    var rev=r.revenue||{}, fx=r.fixed||{};
    var fixedRows=Object.keys(fx).map(function(k){ return row(esc(k),fx[k],'exp'); }).join('');
    return '<div class="fin-actions"><button class="b" id="finPdf">⤓ PDF for investor</button></div>'+
      '<div class="fin-card"><div class="fin-h">'+esc(r.branchName||'All')+' · '+esc(r.month)+'</div>'+
      '<table class="pl">'+
      '<tr class="sec"><td>Revenue</td><td class="amt"></td></tr>'+
      row('<b>Total Revenue</b>',rev.total,'tot')+
      row('B2C',rev.b2c,'sub')+ row('B2D',rev.b2d,'sub')+ row('B2B',rev.b2b,'sub')+ row('B2Camp',rev.b2camp,'sub')+
      '<tr class="sub"><td>No. of Patients / Tests</td><td class="amt">'+(rev.patients||0)+' / '+(rev.tests||0)+'</td></tr>'+
      row('Outsourced Services',r.outsourced,'exp')+
      row('<b>Net Revenue</b>',r.netRev,'tot')+
      row('Material Purchased',r.material,'exp')+
      row('<b>Gross Profit</b>',r.gross,'gp')+
      '<tr class="sec"><td>Fixed costs</td><td class="amt"></td></tr>'+ fixedRows+
      row('<b>Total Fixed Cost</b>',r.totalFixed,'tot')+
      row('<b>Net Profit</b>',r.net,'np')+
      '</table></div>';
  }
  function finPdf(r){ var logo=new Image(); logo.onload=function(){d(logo);}; logo.onerror=function(){d(null);}; logo.src='icons/login-logo.png';
    function d(logo){ var W=1000,M=60,rev=r.revenue||{},fx=r.fixed||{}; var lines=[['Total Revenue',rev.total,'t'],['  B2C',rev.b2c],['  B2D',rev.b2d],['  B2B',rev.b2b],['  B2Camp',rev.b2camp],['Outsourced Services',r.outsourced,'e'],['Net Revenue',r.netRev,'t'],['Material Purchased',r.material,'e'],['Gross Profit',r.gross,'g']];
      Object.keys(fx).forEach(function(k){ lines.push(['  '+k,fx[k],'e']); }); lines.push(['Total Fixed Cost',r.totalFixed,'t']); lines.push(['Net Profit',r.net,'n']);
      var H=200+lines.length*30+60, c=document.createElement('canvas'); c.width=W;c.height=H; var x=c.getContext('2d');
      x.fillStyle='#fff';x.fillRect(0,0,W,H);x.fillStyle='#DA1017';x.fillRect(0,0,W,8);
      if(logo){var lh=54,lw=Math.min(280,logo.width*(lh/logo.height));x.drawImage(logo,M,26,lw,lh);} else {x.fillStyle='#DA1017';x.font='bold 26px Arial';x.fillText('NAKODA',M,60);}
      x.fillStyle='#1f1f1f';x.font='bold 22px Arial';x.textAlign='right';x.fillText('FINANCE SHEET',W-M,44);x.fillStyle='#888';x.font='13px Arial';x.fillText((r.branchName||'')+' · '+r.month,W-M,66);x.textAlign='left';
      var y=130; lines.forEach(function(l){ var t=l[2]; x.fillStyle=t==='t'||t==='g'||t==='n'?'#111':(t==='e'?'#b23':'#444'); x.font=(t?'bold ':'')+'15px Arial';
        if(t==='g'){x.fillStyle='#fff7ec';x.fillRect(M,y-18,W-2*M,26);x.fillStyle='#8a5a00';} if(t==='n'){x.fillStyle='#eafaf3';x.fillRect(M,y-18,W-2*M,28);x.fillStyle='#1a7f37';x.font='bold 17px Arial';}
        x.fillText(l[0],M+6,y); x.textAlign='right'; x.fillText('₹'+money(l[1]),W-M-6,y); x.textAlign='left'; y+=30; });
      x.fillStyle='#999';x.font='italic 12px Arial';x.textAlign='center';x.fillText('Nakoda Diagnostics And Research Center',W/2,H-22);x.textAlign='left';
      c.toBlob(function(bb){var u=URL.createObjectURL(bb),a=document.createElement('a');a.href=u;a.download='FinanceSheet-'+(r.branchName||'')+'-'+r.month+'.png';a.click();setTimeout(function(){URL.revokeObjectURL(u);},2000);toast('Finance sheet saved');});
    }
  }

  /* ---- Daily Entry ---- */
  function docLinks(d){
    var a=[];
    var b2cAmt=(Number(d.b2cCash)||0)+(Number(d.b2cBank)||0);
    var b2dAmt=(Number(d.b2dCash)||0)+(Number(d.b2dBank)||0);
    var otherAmt=Number(d.other)||0;
    if(d.b2cDocUrl) a.push('<a href="'+esc(d.b2cDocUrl)+'" target="_blank" rel="noopener">B2C</a>');
    else if(b2cAmt>0) a.push('<span style="color:#9aa0a6">B2C</span>');
    if(d.b2dDocUrl) a.push('<a href="'+esc(d.b2dDocUrl)+'" target="_blank" rel="noopener">B2D</a>');
    else if(b2dAmt>0) a.push('<span style="color:#9aa0a6">B2D</span>');
    if(d.otherDocUrl) a.push('<a href="'+esc(d.otherDocUrl)+'" target="_blank" rel="noopener">Others</a>');
    else if(otherAmt>0) a.push('<span style="color:#9aa0a6">Others</span>');
    if(d.testXlUrl) a.push('<a href="'+esc(d.testXlUrl)+'" target="_blank" rel="noopener">Tests</a>');
    return a.length?a.join(' · '):'—';
  }
  function loadDaily(){ API.listDaily(ACC.branch,ACC.ym).then(function(r){ var box=$id('accBody'); if(!box) return; if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
    var all=(r.daily||[]).slice().sort(function(a,b){return a.date<b.date?1:-1;});
    var PAGE=15, total=all.length, pages=Math.max(1,Math.ceil(total/PAGE));
    if(ACC.dailyPage>=pages) ACC.dailyPage=pages-1; if(ACC.dailyPage<0) ACC.dailyPage=0;
    var start=ACC.dailyPage*PAGE, rows=all.slice(start,start+PAGE);
    var actions=canEnter()?'<div class="fin-actions"><button class="btn" id="dlyAdd">+ Daily entry</button><button class="btn ghost" id="dlyDep">🏦 Bank deposit</button></div>':'';
    box.innerHTML=actions+
      '<div class="table-wrap"><table><thead><tr><th>Branch</th><th>Date</th><th>B2C cash</th><th>B2C bank</th><th>Other</th><th>Patients</th><th>Tests</th><th>Collection</th><th>Docs</th><th>Status</th><th>Reject</th></tr></thead><tbody>'+
      (rows.length?rows.map(function(d){ var coll=(Number(d.cashIn)||0)+(Number(d.bankIn)||0)+(Number(d.other)||0); var stt=String(d.status);
        var statusCell = stt==='verified' ? '<span class="chip paid">✓ verified</span>'
          : stt==='rejected' ? '<span class="chip" style="background:#fdecec;color:#b23b3b">✗ rejected</span>'
          : (r.canVerify ? '<button class="btn ghost sm" data-vf="'+esc(d.dayId)+'">Verify</button>' : '<span class="chip partial">pending</span>');
        var rejectCell = (stt!=='verified' && stt!=='rejected' && r.canVerify) ? '<button class="btn ghost sm" data-rj="'+esc(d.dayId)+'" style="color:#b23b3b">Reject</button>' : '';
        return '<tr><td>'+esc(branchName(d.branchId))+'</td><td>'+esc(d.date)+'</td><td>₹'+money(d.b2cCash)+'</td><td>₹'+money(d.b2cBank)+'</td><td>₹'+money(d.other)+'</td><td>'+(d.patients||0)+'</td><td>'+(d.tests||0)+'</td><td>₹'+money(coll)+'</td><td>'+docLinks(d)+'</td><td>'+statusCell+'</td><td>'+rejectCell+'</td></tr>'; }).join(''):'<tr><td class="empty" colspan="11">No entries this month.</td></tr>')+'</tbody></table></div>'+
      (total>PAGE?'<div class="acc-pager">'+(ACC.dailyPage>0?'<button class="btn ghost sm" id="dlyPrev">‹ Prev</button>':'<span></span>')+'<span>'+(start+1)+'–'+Math.min(start+PAGE,total)+' of '+total+'</span>'+(ACC.dailyPage<pages-1?'<button class="btn ghost sm" id="dlyNext">Next ›</button>':'<span></span>')+'</div>':'');
    var a=$id('dlyAdd'); if(a) a.onclick=openDailyForm;
    var dp=$id('dlyDep'); if(dp) dp.onclick=openDepositForm;
    var pv=$id('dlyPrev'); if(pv) pv.onclick=function(){ ACC.dailyPage--; loadDaily(); };
    var nx=$id('dlyNext'); if(nx) nx.onclick=function(){ ACC.dailyPage++; loadDaily(); };
    box.querySelectorAll('[data-vf]').forEach(function(b){ b.onclick=function(){ API.verifyDaily(b.getAttribute('data-vf')).then(function(x){ if(x&&x.ok){ toast('Verified'); loadDaily(); } }); }; });
    box.querySelectorAll('[data-rj]').forEach(function(b){ b.onclick=function(){ var reason=prompt('Reason for rejecting this entry? (optional)'); if(reason===null) return; API.rejectDaily(b.getAttribute('data-rj'),reason).then(function(x){ if(x&&x.ok){ toast('Entry rejected'); loadDaily(); } else toast((x&&x.error)||'Failed',true); }); }; });
  }); }
  function openDepositForm(){
    var brs=(S.meta&&S.meta.branches)||[];
    var brField=canViewAll()?'<div class="field full"><label>Branch *</label><select id="dpBranch" class="in"><option value="">Select branch</option>'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'"'+(b.BranchID===ACC.branch?' selected':'')+'>'+esc(b.BranchName)+'</option>';}).join('')+'</select></div>':'';
    var body='<div class="grid2">'+brField+
      '<div class="field"><label>Date</label><input id="dpDate" class="in" type="date" value="'+(new Date().toISOString().slice(0,10))+'"></div>'+
      '<div class="field"><label>Amount deposited to bank (₹)</label><input id="dpAmt" class="in" type="number" inputmode="numeric"></div>'+
      '<div class="field full"><label>Note (slip no. / bank)</label><input id="dpNote" class="in" type="text"></div></div>'+
      '<div style="font-size:12px;color:#1a7f37;background:#eafaf3;border-radius:8px;padding:8px 10px;margin-top:6px">Recorded as a cash → bank transfer. Total business is unchanged.</div><div id="dpMsg"></div>';
    openModal('Bank deposit', body, '<button class="btn" id="dpSave">Save deposit</button>');
    $id('dpSave').onclick=function(){ var bsel=$id('dpBranch'); var bid=bsel?bsel.value:ACC.branch; if(bsel&&!bid){ $id('dpMsg').innerHTML='<div class="msg error">Please select a branch.</div>'; return; } var amt=Number($id('dpAmt').value)||0; if(amt<=0){ $id('dpMsg').innerHTML='<div class="msg error">Enter an amount.</div>'; return; } this.disabled=true; API.saveDeposit({branchId:bid,date:$id('dpDate').value,amount:amt,notes:$id('dpNote').value}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Deposit recorded'); } else { $id('dpMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; var b=$id('dpSave'); if(b) b.disabled=false; } }); };
  }
  function openDailyForm(){
    var brs=(S.meta&&S.meta.branches)||[];
    /* Multi-branch users (head office) pick which branch this entry belongs to; single-branch users
       (branch manager / branch accounts) are fixed to their own branch by the backend. */
    var brField=canViewAll()
      ? '<div class="field full"><label>Branch *</label><select id="dlBranch" class="in"><option value="">Select branch</option>'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'"'+(b.BranchID===ACC.branch?' selected':'')+'>'+esc(b.BranchName)+'</option>';}).join('')+'</select></div>'
      : '';
    function incBlock(t,lbl,extra){ return '<div class="dl-blk"><div class="dl-blk-h">'+lbl+'</div><div class="row2">'+
        '<div class="field"><label>Cash (₹)</label><input id="dl'+t+'Cash" class="in dl-amt" type="number" inputmode="numeric"></div>'+
        '<div class="field"><label>Bank / UPI (₹)</label><input id="dl'+t+'Bank" class="in dl-amt" type="number" inputmode="numeric"></div></div>'+
        (extra||'')+
        '<label class="dl-file"><span id="dl'+t+'DocSt">📎 Attach '+t.toUpperCase()+' document (PDF)</span><input id="dl'+t+'Doc" type="file" accept="application/pdf,image/*" hidden></label></div>'; }
    var body='<div class="grid2">'+brField+
      '<div class="field"><label>Date</label><input id="dlDate" class="in" type="date" value="'+(new Date().toISOString().slice(0,10))+'"></div>'+
      '<div class="field"><label>Patients served</label><input id="dlPat" class="in" type="number" inputmode="numeric"></div></div>'+
      incBlock('B2c','B2C income (walk-in / patient)','')+
      '<div class="dl-blk"><div class="dl-blk-h">Other income (B2B — credit, billed monthly)</div>'+
        '<div class="field"><label>Amount (₹)</label><input id="dlOther" class="in dl-amt" type="number" inputmode="numeric"></div>'+
        '<div style="font-size:11px;color:#888;margin-top:4px">At month-end this is replaced by your B2B invoice total.</div>'+
        '<label class="dl-file"><span id="dlOtherDocSt">📎 Attach Other document (PDF)</span><input id="dlOtherDoc" type="file" accept="application/pdf,image/*" hidden></label></div>'+
      '<div class="dl-total"><span>Total business (Cash + Bank + Other)</span><b id="dlTotal">₹0</b></div>'+
      '<div class="grid2"><div class="field"><label>Tests done (count)</label><input id="dlTests" class="in" type="number" inputmode="numeric"></div>'+
      '<div class="field"><label>Tests Excel (.xlsx)</label><label class="dl-file"><span id="dlXlSt">📎 Attach Excel</span><input id="dlXl" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label></div></div>'+
      '<div id="dlMsg"></div>';
    openModal('Daily business entry', body, '<button class="btn" id="dlSave">Submit to Accountant</button>');

    var st={b2cDocUrl:'',b2dDocUrl:'',otherDocUrl:'',testXlUrl:''};
    function recalc(){ var t=0; ['dlB2cCash','dlB2cBank','dlOther'].forEach(function(id){ t+=Number(($id(id)||{}).value)||0; }); $id('dlTotal').textContent='₹'+money(t); }
    ['dlB2cCash','dlB2cBank','dlOther'].forEach(function(id){ var el=$id(id); if(el) el.addEventListener('input',recalc); });
    function bindUpload(inputId,stEl,stKey,label){ var inp=$id(inputId); if(!inp) return; inp.onchange=function(){ var f=this.files[0]; if(!f) return; if(f.size>8*1024*1024){ toast('File too large (max 8MB)',true); this.value=''; return; }
      var s=$id(stEl); s.textContent='Uploading…'; var fr=new FileReader();
      fr.onload=function(){ var d=fr.result,i=d.indexOf(',');
        API.uploadFile({base64:d.slice(i+1),fileName:f.name,mimeType:f.type,subPath:'DailyBusiness/'+(($id('dlDate')||{}).value||'')}).then(function(r){ if(r&&r.ok){ st[stKey]=r.url; s.innerHTML='✓ '+esc(f.name)+' — tap to replace'; } else { s.textContent='Upload failed — tap to retry'; } }, function(){ s.textContent='Upload failed — tap to retry'; }); };
      fr.readAsDataURL(f); }; }
    bindUpload('dlB2cDoc','dlB2cDocSt','b2cDocUrl');
    bindUpload('dlOtherDoc','dlOtherDocSt','otherDocUrl');
    bindUpload('dlXl','dlXlSt','testXlUrl');

    $id('dlSave').onclick=function(){
      var bsel=$id('dlBranch'); var bid=bsel?bsel.value:ACC.branch;
      if(bsel && !bid){ $id('dlMsg').innerHTML='<div class="msg error">Please select a branch.</div>'; return; }
      this.disabled=true;
      API.saveDaily({branchId:bid,date:$id('dlDate').value,patients:$id('dlPat').value,tests:$id('dlTests').value,
        b2cCash:$id('dlB2cCash').value,b2cBank:$id('dlB2cBank').value,b2dCash:0,b2dBank:0,other:$id('dlOther').value,expense:($id('dlExpense')||{}).value,
        b2cDocUrl:st.b2cDocUrl,b2dDocUrl:st.b2dDocUrl,otherDocUrl:st.otherDocUrl,testXlUrl:st.testXlUrl}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Saved'); loadDaily(); } else { $id('dlMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; var b=$id('dlSave'); if(b) b.disabled=false; } });
    };
  }

  /* ---- Invoices ---- */
  function loadInvoices(){ API.listInvoices(ACC.branch,'').then(function(r){ var box=$id('accBody'); if(!box) return; if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
    var rows=(r.invoices||[]).slice().sort(function(a,b){return a.date<b.date?1:-1;});
    box.innerHTML=(canEnter()?'<div class="fin-actions"><button class="btn" id="invAdd">+ New invoice</button></div>':'')+
      '<div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Party</th><th>Type</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>'+
      (rows.length?rows.map(function(i){ var st=String(i.status); var chip=st==='paid'?'paid':st==='partial'?'partial':'unpaid'; return '<tr><td><b>'+esc(i.invId)+'</b><div style="font-size:10px;color:#999">'+esc(i.date)+'</div></td><td>'+esc(i.party)+'</td><td>'+esc(i.partyType)+'</td><td>₹'+money(i.total)+'</td><td><span class="chip '+chip+'">'+st+(st==='partial'?(' ₹'+money(i.paid)):'')+'</span></td><td><button class="btn ghost sm" data-pdf="'+esc(i.invId)+'">PDF</button>'+(st!=='paid'&&canEnter()?' <button class="btn ghost sm" data-pay="'+esc(i.invId)+'">Pay</button>':'')+'</td></tr>'; }).join(''):'<tr><td class="empty" colspan="6">No invoices.</td></tr>')+'</tbody></table></div>';
    var a=$id('invAdd'); if(a) a.onclick=openInvoiceForm;
    box.querySelectorAll('[data-pdf]').forEach(function(b){ b.onclick=function(){ var i=rows.filter(function(x){return x.invId===b.getAttribute('data-pdf');})[0]; invoicePdf(i); }; });
    box.querySelectorAll('[data-pay]').forEach(function(b){ b.onclick=function(){ var i=rows.filter(function(x){return x.invId===b.getAttribute('data-pay');})[0]; var amt=prompt('Payment received for '+i.invId+' (balance ₹'+money(i.total-(i.paid||0))+'):'); if(amt) API.recordPayment(i.invId,amt).then(function(x){ if(x&&x.ok){ toast('Payment recorded'); loadInvoices(); } }); }; });
  }); }
  var INVIT=[];
  function openInvoiceForm(){ INVIT=[{desc:'',qty:1,rate:0}];
    var body='<div class="grid2"><div class="field"><label>Party type</label><select id="ivType" class="in"><option>B2B</option><option>B2D</option><option>B2Camp</option><option>B2C</option></select></div>'+
      '<div class="field"><label>Party name</label><input id="ivParty" class="in"></div>'+
      '<div class="field"><label>GSTIN (optional)</label><input id="ivGstin" class="in"></div><div class="field"><label>GST %</label><input id="ivGst" class="in" type="number" value="0"></div>'+
      '<div class="field"><label>Date</label><input id="ivDate" class="in" type="date" value="'+(new Date().toISOString().slice(0,10))+'"></div><div class="field"><label>Due date</label><input id="ivDue" class="in" type="date"></div>'+
      '<div class="field full"><label>Items</label><div id="ivItems"></div><button type="button" class="btn ghost sm" id="ivAddIt">+ Add item</button></div></div>'+
      '<div class="tot" id="ivTot"></div><div id="ivMsg"></div>';
    openModal('New invoice', body, '<button class="btn" id="ivSave">Generate invoice</button>');
    function paintIt(){ $id('ivItems').innerHTML=INVIT.map(function(it,i){ return '<div class="iv-row"><input class="in iv-d" data-i="'+i+'" placeholder="Description" value="'+esc(it.desc)+'"><input class="in iv-q" type="number" data-i="'+i+'" value="'+it.qty+'" title="Qty"><input class="in iv-r" type="number" data-i="'+i+'" value="'+it.rate+'" title="Rate"><button type="button" class="bmini" data-rm="'+i+'">✕</button></div>'; }).join(''); bindIt(); calc(); }
    function readIt(){ $id('ivItems').querySelectorAll('.iv-row').forEach(function(row){ var i=row.querySelector('.iv-d').getAttribute('data-i'); INVIT[i]={desc:row.querySelector('.iv-d').value,qty:Number(row.querySelector('.iv-q').value)||0,rate:Number(row.querySelector('.iv-r').value)||0}; }); }
    function calc(){ readIt(); var sub=INVIT.reduce(function(s,it){return s+it.qty*it.rate;},0),g=Math.round(sub*(Number($id('ivGst').value)||0)/100); $id('ivTot').innerHTML='<span>Subtotal ₹'+money(sub)+' + GST ₹'+money(g)+'</span><span>Total ₹'+money(sub+g)+'</span>'; }
    function bindIt(){ $id('ivItems').querySelectorAll('input').forEach(function(inp){ inp.oninput=calc; }); $id('ivItems').querySelectorAll('[data-rm]').forEach(function(b){ b.onclick=function(){ readIt(); INVIT.splice(+b.getAttribute('data-rm'),1); if(!INVIT.length)INVIT=[{desc:'',qty:1,rate:0}]; paintIt(); }; }); }
    $id('ivAddIt').onclick=function(){ readIt(); INVIT.push({desc:'',qty:1,rate:0}); paintIt(); };
    $id('ivGst').oninput=calc; paintIt();
    $id('ivSave').onclick=function(){ readIt(); var party=$id('ivParty').value.trim(); if(!party){ $id('ivMsg').innerHTML='<div class="msg error">Party required.</div>'; return; } this.disabled=true;
      API.saveInvoice({branchId:ACC.branch,partyType:$id('ivType').value,party:party,gstin:$id('ivGstin').value,gstPct:$id('ivGst').value,date:$id('ivDate').value,dueDate:$id('ivDue').value,items:INVIT.filter(function(x){return x.desc;})}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Invoice '+r.invId+' created'); loadInvoices(); } else $id('ivMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }
  /* Amount in words (Indian system) — e.g. 12000 -> "Indian Rupee Twelve Thousand Only" */
  function inWords(n){
    n=Math.round(Number(n)||0); if(!n) return 'Indian Rupee Zero Only';
    var a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    var b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    function two(x){ return x<20?a[x]:(b[Math.floor(x/10)]+(x%10?' '+a[x%10]:'')); }
    function three(x){ return (x>99?a[Math.floor(x/100)]+' Hundred'+(x%100?' ':''):'')+(x%100?two(x%100):''); }
    var out='', cr=Math.floor(n/10000000), lk=Math.floor(n/100000)%100, th=Math.floor(n/1000)%100, re=n%1000;
    if(cr) out+=three(cr)+' Crore ';
    if(lk) out+=two(lk)+' Lakh ';
    if(th) out+=two(th)+' Thousand ';
    if(re) out+=three(re);
    return 'Indian Rupee '+out.replace(/\s+/g,' ').trim()+' Only';
  }
  function fmtDMY(ds){ var p=String(ds||'').slice(0,10).split('-'); return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):String(ds||''); }
  /* Invoice download — matches the Tirupati Lab reference layout: meta block top-right, dark item
     table (# / Description / Qty / Rate / Amount), Sub Total / Total / Balance Due, amount in
     words, "Thanks for your business." */
  function invoicePdf(inv){
    var items=[]; try{items=JSON.parse(inv.itemsJson||'[]');}catch(e){}
    var W=1240,H=1754,M=90, c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');
    x.fillStyle='#fff';x.fillRect(0,0,W,H);
    // meta block, top-right
    var due=inv.dueDate?fmtDMY(inv.dueDate):fmtDMY(inv.date);
    x.font='15px Arial'; x.textAlign='right';
    var metaY=150, rows=[['Invoice Date :',fmtDMY(inv.date)],['Terms :','Due on Receipt'],['Due Date :',due]];
    rows.forEach(function(r){ x.fillStyle='#555'; x.fillText(r[0], W-M-170, metaY); x.fillStyle='#1f1f1f'; x.fillText(r[1], W-M, metaY); metaY+=30; });
    x.textAlign='left';
    // party name, left — level with the bottom of the meta block
    x.fillStyle='#1f1f1f'; x.font='bold 17px Arial'; x.fillText(String(inv.party||'').toUpperCase(), M, 226);
    if(inv.gstin){ x.font='13px Arial'; x.fillStyle='#777'; x.fillText('GSTIN: '+inv.gstin, M, 248); }
    // item table
    var y=290, rowH=64;
    x.fillStyle='#3d3d3d'; x.fillRect(M,y,W-2*M,40);
    x.fillStyle='#fff'; x.font='bold 14px Arial';
    x.fillText('#',M+16,y+26); x.fillText('Description',M+60,y+26);
    x.textAlign='right'; x.fillText('Qty',W-M-330,y+26); x.fillText('Rate',W-M-170,y+26); x.fillText('Amount',W-M-16,y+26); x.textAlign='left';
    y+=40;
    items.forEach(function(it,i){
      x.fillStyle='#1f1f1f'; x.font='15px Arial';
      x.fillText(String(i+1), M+16, y+28);
      x.fillText(String(it.desc||''), M+60, y+28);
      if(it.note){ x.font='12px Arial'; x.fillStyle='#777'; x.fillText(String(it.note), M+60, y+48); }
      x.fillStyle='#1f1f1f'; x.font='15px Arial'; x.textAlign='right';
      x.fillText(Number(it.qty).toFixed(2), W-M-330, y+28);
      x.fillText(money(it.rate)+'.00', W-M-170, y+28);
      x.fillText(money(it.qty*it.rate)+'.00', W-M-16, y+28);
      x.textAlign='left';
      y+=rowH; x.strokeStyle='#333'; x.beginPath(); x.moveTo(M,y); x.lineTo(W-M,y); x.stroke();
    });
    // totals block, right-aligned
    y+=36; var lx=W-M-360;
    x.font='15px Arial'; x.textAlign='right';
    x.fillStyle='#555'; x.fillText('Sub Total', W-M-170, y); x.fillStyle='#1f1f1f'; x.fillText(money(inv.subtotal)+'.00', W-M-16, y);
    if(Number(inv.gstAmt)>0){ y+=34; x.fillStyle='#555'; x.fillText('GST ('+inv.gstPct+'%)', W-M-170, y); x.fillStyle='#1f1f1f'; x.fillText(money(inv.gstAmt)+'.00', W-M-16, y); }
    y+=34; x.font='bold 16px Arial'; x.fillStyle='#1f1f1f'; x.fillText('Total', W-M-170, y); x.fillText('₹'+money(inv.total)+'.00', W-M-16, y);
    y+=18; x.fillStyle='#f5f5f5'; x.fillRect(lx, y, W-M-lx, 42);
    x.fillStyle='#1f1f1f'; x.font='bold 16px Arial'; x.fillText('Balance Due', W-M-170, y+28); x.fillText('₹'+money((Number(inv.total)||0)-(Number(inv.paid)||0))+'.00', W-M-16, y+28);
    // amount in words
    y+=84; x.font='13px Arial'; x.fillStyle='#555'; x.fillText('Total In Words:', W-M-330, y);
    x.font='bold italic 14px Arial'; x.fillStyle='#1f1f1f';
    var words=inWords(inv.total), wl=words.length>46?[words.slice(0,words.lastIndexOf(' ',46)),words.slice(words.lastIndexOf(' ',46)+1)]:[words];
    wl.forEach(function(l){ x.fillText(l, W-M, y); y+=22; });
    x.textAlign='left';
    // footer
    y=Math.max(y+80, H-320);
    x.font='14px Arial'; x.fillStyle='#333'; x.fillText('Thanks for your business.', M, y);
    x.font='italic 12px Arial'; x.fillStyle='#999'; x.textAlign='center'; x.fillText('Nakoda Diagnostics And Research Center', W/2, H-46); x.textAlign='left';
    c.toBlob(function(bb){var u=URL.createObjectURL(bb),a=document.createElement('a');a.href=u;a.download=inv.invId+'.png';a.click();setTimeout(function(){URL.revokeObjectURL(u);},2000);toast('Invoice saved');});
  }

  /* ---- Expenses / vendor bills ---- */
  function loadExpenses(){ API.listLedger(ACC.branch,ACC.ym,false).then(function(r){ var box=$id('accBody'); if(!box) return; if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
    function fmtLedDate(d){ var s=String(d||''); var m=s.match(/^(\d{4}-\d{2}-\d{2})/); return m?m[1]:s.slice(0,10); }
    var rows=(r.ledger||[]).slice().sort(function(a,b){return fmtLedDate(a.date)<fmtLedDate(b.date)?1:-1;});
    box.innerHTML=(canEnter()?'<div class="fin-actions"><button class="btn" id="exAdd">+ Expense / vendor bill</button></div>':'')+
      '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Party</th><th>Amount</th><th>Mode</th><th>Status</th><th>Reject</th></tr></thead><tbody>'+
      (rows.length?rows.map(function(l){ var isPending=String(l.status)!=='approved'&&String(l.status)!=='rejected'; var statusCell=String(l.status)==='approved'?'<span style="display:inline-flex;align-items:center;gap:5px;background:#eaf7ef;color:#1a8f4c;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px">✓ approved</span>':String(l.status)==='rejected'?'<span style="display:inline-flex;align-items:center;gap:5px;background:#fdecec;color:#b23b3b;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px">✗ rejected</span>':(r.canVerify?'<button class="btn ghost sm" data-ap="'+esc(l.ledId)+'" style="color:#1a8f4c;border-color:#1a8f4c;font-weight:500">Approve</button>':'<span class="chip partial">pending</span>'); var rejectCell=(isPending&&r.canVerify)?'<button class="btn ghost sm" data-rj="'+esc(l.ledId)+'" style="color:#b23b3b;border-color:#b23b3b">Reject</button>':''; return '<tr><td>'+esc(fmtLedDate(l.date))+'</td><td>'+esc(l.category)+(l.billUrl?' <a href="'+esc(l.billUrl)+'" target="_blank" title="Bill">📎</a>':'')+(l.qrUrl?' <a href="'+esc(l.qrUrl)+'" target="_blank" title="QR code">▦</a>':'')+'</td><td>'+esc(l.party||'')+'</td><td>₹'+money(l.amount)+'</td><td>'+esc(l.mode)+'</td><td>'+statusCell+'</td><td>'+rejectCell+'</td></tr>'; }).join(''):'<tr><td class="empty" colspan="7">No entries this month.</td></tr>')+'</tbody></table></div>';
    var a=$id('exAdd'); if(a) a.onclick=openExpenseForm;
    function ledgerAction(ledId,act){ var url=(window.NAKODA_CONFIG&&window.NAKODA_CONFIG.API_URL)||''; var tok=''; try{tok=localStorage.getItem('nk_tok')||'';}catch(e){} return fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'setLedger',token:tok,ledId:ledId,act:act}),redirect:'follow'}).then(function(r){return r.json();}); }
    box.querySelectorAll('[data-ap]').forEach(function(b){ b.onclick=function(){ b.textContent='Saving…'; b.disabled=true; ledgerAction(b.getAttribute('data-ap'),'approve').then(function(x){ if(x&&x.ok){ var td=b.parentNode; td.innerHTML='<span style="display:inline-flex;align-items:center;gap:5px;background:#eaf7ef;color:#1a8f4c;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px">✓ approved</span>'; var row=td.parentNode; var rjTd=row.cells[row.cells.length-1]; if(rjTd) rjTd.innerHTML=''; toast('Approved'); } else { b.textContent='Approve'; b.disabled=false; toast((x&&x.error)||'Failed',true); } }); }; });
    box.querySelectorAll('[data-rj]').forEach(function(b){ b.onclick=function(){ var reason=prompt('Reason for rejecting? (optional)'); if(reason===null) return; b.textContent='Saving…'; b.disabled=true; ledgerAction(b.getAttribute('data-rj'),'reject').then(function(x){ if(x&&x.ok){ var row=b.parentNode.parentNode; var stTd=row.cells[row.cells.length-2]; if(stTd) stTd.innerHTML='<span style="display:inline-flex;align-items:center;gap:5px;background:#fdecec;color:#b23b3b;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px">✗ rejected</span>'; b.parentNode.innerHTML=''; toast('Rejected'); } else { b.textContent='Reject'; b.disabled=false; toast((x&&x.error)||'Failed',true); } }); }; });
  }); }
  function openExpenseForm(){
    var st={bill:'',qr:''};
    var body='<div class="grid2"><div class="field"><label>Type</label><select id="exType" class="in"><option value="expense">Expense</option><option value="income">Income</option></select></div>'+
      '<div class="field"><label>Date</label><input id="exDate" class="in" type="date" value="'+(new Date().toISOString().slice(0,10))+'"></div>'+
      '<div class="field"><label>Category</label><select id="exCat" class="in">'+EXP_CATS.map(function(c){return '<option>'+c+'</option>';}).join('')+'</select></div>'+
      '<div class="field"><label>Amount (₹)</label><input id="exAmt" class="in" type="number"></div>'+
      '<div class="field"><label>Mode</label><select id="exMode" class="in"><option>Cash</option><option>Bank</option><option>UPI</option></select></div>'+
      '<div class="field"><label>Paid to / party</label><input id="exParty" class="in"></div>'+
      '<div class="field"><label>Bill date</label><input id="exBillDate" class="in" type="date"></div>'+
      '<div class="field"><label>Vendor IFSC (for payout)</label><input id="exIfsc" class="in"></div><div class="field"><label>Vendor A/C</label><input id="exAcct" class="in"></div>'+
      '<div class="field"><label>QR code (UPI)</label><input type="file" id="exQr" accept="image/*"><div id="exQrSt" class="upst" style="font-size:11px;color:#888"></div></div>'+
      '<div class="field full"><label>Attach bill (photo/PDF)</label><input type="file" id="exBill" accept="image/*,application/pdf"><div id="exBillSt" class="upst" style="font-size:11px;color:#888"></div></div>'+
      '<div class="field full"><label>Note</label><input id="exNote" class="in"></div></div><div id="exMsg"></div>';
    openModal('Expense / vendor bill', body, '<button class="btn" id="exSave">Save</button>');
    $id('exType').onchange=function(){ var inc=this.value==='income'; $id('exCat').innerHTML=(inc?INC_CATS:EXP_CATS).map(function(c){return '<option>'+c+'</option>';}).join(''); };
    $id('exBill').onchange=function(){ var f=this.files[0]; if(!f) return; var s2=$id('exBillSt'); s2.textContent='Reading…'; var fr=new FileReader(); fr.onload=function(){ var s=fr.result,i=s.indexOf(','); st.bill=s.slice(i+1); st.billMime=f.type; s2.innerHTML='Attached ✓'; }; fr.readAsDataURL(f); };
    $id('exQr').onchange=function(){ var f=this.files[0]; if(!f) return; var s2=$id('exQrSt'); s2.textContent='Reading…'; var fr=new FileReader(); fr.onload=function(){ var s=fr.result,i=s.indexOf(','); st.qr=s.slice(i+1); st.qrMime=f.type; s2.innerHTML='Attached ✓'; }; fr.readAsDataURL(f); };
    $id('exSave').onclick=function(){ var amt=$id('exAmt').value; if(!amt){ $id('exMsg').innerHTML='<div class="msg error">Amount required.</div>'; return; } this.disabled=true;
      API.addLedger({branchId:ACC.branch,type:$id('exType').value,category:$id('exCat').value,amount:amt,mode:$id('exMode').value,party:$id('exParty').value,date:$id('exDate').value,billDate:$id('exBillDate').value,ifsc:$id('exIfsc').value,acct:$id('exAcct').value,bill:st.bill,billMime:st.billMime,qr:st.qr,qrMime:st.qrMime,note:$id('exNote').value}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Saved'); loadExpenses(); } else $id('exMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }

  /* ---- Bank import + reconciliation ---- */
  var CLIENT_CODE='NA7776PAY';
  var BANK_CATS=['B2C income','Other income','Vendor payment','Salary','Material Purchased','Rent','Light bill','Petrol','Professional fees','Miscellaneous','Bank charge','Outsourced Services','Marketing','Other'];
  function parseCSV(text){ var lines=String(text).replace(/\r/g,'').split('\n'), out=[]; lines.forEach(function(ln){ if(ln==='') return; var row=[],cur='',q=false; for(var i=0;i<ln.length;i++){ var c=ln[i]; if(c==='"'){ if(q&&ln[i+1]==='"'){cur+='"';i++;} else q=!q; } else if(c===','&&!q){ row.push(cur);cur=''; } else cur+=c; } row.push(cur); out.push(row); }); return out; }
  function num(v){ return Number(String(v==null?'':v).replace(/[, ]/g,''))||0; }
  function normalizeBank(grid){
    var hi=-1,H=null; for(var i=0;i<grid.length;i++){ var low=grid[i].map(function(c){return String(c||'').toLowerCase();}); var s=low.join('|'); if(s.indexOf('date')>=0 && (s.indexOf('desc')>=0||s.indexOf('remark')>=0||s.indexOf('narration')>=0||s.indexOf('particular')>=0) && (s.indexOf('amount')>=0||s.indexOf('withdraw')>=0||s.indexOf('deposit')>=0||s.indexOf('debit')>=0||s.indexOf('credit')>=0)){ hi=i;H=low;break; } }
    if(hi<0) return [];
    function find(keys){ for(var j=0;j<H.length;j++){ for(var k=0;k<keys.length;k++) if(H[j].indexOf(keys[k])>=0) return j; } return -1; }
    var dateI=find(['transaction date','txn date','date']), descI=find(['remark','narration','description','particular']), refI=find(['chq','cheque','ref']);
    var wI=find(['withdraw','debit']), depI=find(['deposit','credit']), amtI=find(['amount']), drcrI=find(['dr / cr','dr/cr','type']);
    var rows=[]; for(var r=hi+1;r<grid.length;r++){ var g=grid[r]; if(!g||g.length<2) continue; var dt=String(g[dateI]||'').trim(); if(!dt||/total|closing|opening|statement/i.test(g.join(' '))) continue;
      var amount=0, drcr='DR';
      if(wI>=0||depI>=0){ var w=num(g[wI]), d=num(g[depI]); if(d>0){amount=d;drcr='CR';} else {amount=w;drcr='DR';} }
      else { amount=num(g[amtI]); var t=String(g[drcrI]||'').toUpperCase(); drcr=t.indexOf('CR')>=0?'CR':'DR'; }
      if(!amount) continue;
      rows.push({date:isoDate(dt), description:String(g[descI]||'').trim(), ref:refI>=0?String(g[refI]||''):'', amount:amount, drcr:drcr});
    }
    return rows;
  }
  function isoDate(s){ s=String(s).trim(); var m=s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/); if(m){ var y=m[3].length===2?('20'+m[3]):m[3]; return y+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[1]).slice(-2); } var d=new Date(s); return isNaN(d)?s.slice(0,10):d.toISOString().slice(0,10); }
  var BANKROWS=[];
  function loadBank(){
    var box=$id('accBody'), brs=(S.meta&&S.meta.branches)||[];
    box.innerHTML='<div class="fin-card" style="padding:14px;margin-bottom:14px"><div class="fin-h" style="margin:-14px -14px 12px">Reconcile — collection vs bank</div>'+
      '<div class="acc-top"><select class="in" id="rcBranch" style="max-width:160px">'+(canViewAll()?'<option value="">Pick branch</option>':'')+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'"'+(b.BranchID===ACC.branch?' selected':'')+'>'+esc(b.BranchName)+'</option>';}).join('')+'</select>'+
      '<input class="in" id="rcDate" type="date" style="max-width:160px" value="'+(new Date().toISOString().slice(0,10))+'"><button class="btn" id="rcGo">Check</button></div><div id="rcOut"></div></div>'+
      '<div class="fin-h" style="border-radius:8px">Import bank statement</div>'+
      '<div class="up" style="margin:12px 0" id="bkDrop">⬆ Choose statement (.csv / .xlsx)<input type="file" id="bkFile" accept=".csv,.xlsx,.xls" style="display:block;margin:8px auto 0"></div>'+
      '<div id="bkTableWrap"></div>';
    $id('rcGo').onclick=function(){ var b=$id('rcBranch').value, d=$id('rcDate').value; API.reconcile(b,d).then(function(r){ var o=$id('rcOut'); if(!r||!r.ok){ o.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
      var match=Math.abs(r.diff)<1; o.innerHTML='<div class="rec2"><div>Entered collection: <b>₹'+money(r.collection)+'</b></div><div>Bank received: <b>₹'+money(r.bankReceived)+'</b></div><div class="'+(match?'rec-ok':'rec-bad')+'">'+(match?'✓ Matched':('⚠ Difference ₹'+money(Math.abs(r.diff))))+'</div></div>'; }); };
    $id('bkFile').onchange=function(){ var f=this.files[0]; if(!f) return; var wrap=$id('bkTableWrap'); wrap.innerHTML='<div class="center-load"><span class="loader dark"></span> Parsing…</div>';
      var isCsv=/\.csv$/i.test(f.name); var fr=new FileReader();
      fr.onload=function(){ var grid;
        try{ if(isCsv){ grid=parseCSV(fr.result); } else { if(typeof XLSX==='undefined'){ wrap.innerHTML='<div class="empty">Excel parser needs internet (or upload CSV).</div>'; return; } var wb=XLSX.read(new Uint8Array(fr.result),{type:'array'}); grid=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1}); } }
        catch(e){ wrap.innerHTML='<div class="empty">Could not read file.</div>'; return; }
        BANKROWS=normalizeBank(grid);
        if(!BANKROWS.length){ wrap.innerHTML='<div class="empty">No transactions detected. Make sure it\'s the bank\'s statement export.</div>'; return; }
        paintBankTable(brs);
      };
      if(isCsv) fr.readAsText(f); else fr.readAsArrayBuffer(f);
    };
  }
  function paintBankTable(brs){
    var wrap=$id('bkTableWrap');
    wrap.innerHTML='<div style="font-size:12px;color:#666;margin:8px 0">'+BANKROWS.length+' transactions — tag Branch &amp; Category, then save.</div>'+
      '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Branch</th><th>Category</th></tr></thead><tbody>'+
      BANKROWS.map(function(r,i){ return '<tr><td>'+esc(r.date)+'</td><td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.description)+'</td><td class="'+(r.drcr==='CR'?'cr':'dr')+'">'+(r.drcr==='CR'?'+':'-')+'₹'+money(r.amount)+'</td>'+
        '<td><select class="mini2" data-br="'+i+'">'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'"'+(b.BranchID===ACC.branch?' selected':'')+'>'+esc(b.BranchName)+'</option>';}).join('')+'</select></td>'+
        '<td><select class="mini2" data-cat="'+i+'">'+BANK_CATS.map(function(c){return '<option>'+c+'</option>';}).join('')+'</select></td></tr>'; }).join('')+'</tbody></table></div>'+
      '<div class="fin-actions" style="margin-top:10px"><button class="btn" id="bkSave">Save '+BANKROWS.length+' to ledger</button></div>';
    $id('bkSave').onclick=function(){ var t=document.querySelector('#bkTableWrap'); t.querySelectorAll('[data-br]').forEach(function(s){ BANKROWS[s.getAttribute('data-br')].branch=s.value; }); t.querySelectorAll('[data-cat]').forEach(function(s){ BANKROWS[s.getAttribute('data-cat')].category=s.value; });
      this.disabled=true; this.textContent='Saving…'; API.saveBankRows(BANKROWS).then(function(r){ if(r&&r.ok){ toast(r.saved+' entries saved to ledger'); BANKROWS=[]; $id('bkTableWrap').innerHTML='<div class="empty">Saved ✓</div>'; } else toast((r&&r.error)||'Failed',true); }); };
  }

  /* ---- Payout file (salary + vendor) ---- */
  function loadPayout(){
    var box=$id('accBody'), brs=(S.meta&&S.meta.branches)||[];
    box.innerHTML='<div class="acc-top"><select class="in" id="poKind" style="max-width:150px"><option value="all">Salary + Vendor</option><option value="salary">Salary only</option><option value="vendor">Vendor only</option></select>'+
      '<select class="in" id="poBranch" style="max-width:170px"><option value="">Pick branch</option>'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'"'+(b.BranchID===ACC.branch?' selected':'')+'>'+esc(b.BranchName)+'</option>';}).join('')+'</select>'+
      '<input class="in" id="poMonth" type="month" value="'+ACC.ym+'" style="max-width:150px"><button class="btn" id="poGo">Generate</button></div>'+
      '<div id="poOut"></div>';
    $id('poGo').onclick=function(){ var b=$id('poBranch').value, m=$id('poMonth').value, k=$id('poKind').value; if(!b){ toast('Pick a branch (the debit account).',true); return; }
      API.payoutList(b,m,k).then(function(r){ var o=$id('poOut'); if(!r||!r.ok){ o.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
        var rows=r.rows||[], total=rows.reduce(function(s,x){return s+(Number(x.amount)||0);},0);
        if(!rows.length){ o.innerHTML='<div class="empty">No payouts. Run payroll / approve vendor bills first.</div>'; return; }
        o.innerHTML='<div style="font-size:12px;color:#666;margin:10px 0">Debit A/C '+esc(r.drAcct||'—')+' · '+rows.length+' rows · ₹'+money(total)+'</div>'+
          '<div class="table-wrap"><table><thead><tr><th>Beneficiary</th><th>IFSC</th><th>Account</th><th>Amount</th><th>Narration</th></tr></thead><tbody>'+
          rows.map(function(x){return '<tr><td>'+esc(x.beneficiary)+'</td><td>'+esc(x.ifsc)+'</td><td>'+esc(x.acct)+'</td><td>₹'+money(x.amount)+'</td><td>'+esc(x.narration)+'</td></tr>';}).join('')+'</tbody></table></div>'+
          '<div class="fin-actions" style="margin-top:10px"><button class="btn" id="poXls">⤓ Download bank file (.xls)</button></div>';
        $id('poXls').onclick=function(){ payoutXls(rows, r.drAcct, m); };
      }); };
  }
  function payoutXls(rows, drAcct, month){
    var cols=['Client_Code','Product_Code','Payment_Type','Payment_Ref_No.','Payment_Date','Instrument Date','Dr_Ac_No','Amount','Bank_Code_Indicator','Beneficiary_Code','Beneficiary_Name','Beneficiary_Bank','IFSC Code','Beneficiary_Acc_No','Location','Print_Location','Instrument_Number','Ben_Add1','Ben_Add2','Ben_Add3','Ben_Add4','Beneficiary_Email','Beneficiary_Mobile','Debit_Narration','Credit_Narration'];
    var today=new Date(),dt=('0'+today.getDate()).slice(-2)+'/'+('0'+(today.getMonth()+1)).slice(-2)+'/'+today.getFullYear();
    var head='<tr>'+cols.map(function(c){return '<th>'+c+'</th>';}).join('')+'</tr>';
    var body=rows.filter(function(r){return Number(r.amount)>0;}).map(function(r){ var v=['NA7776PAY','VPAY','NEFT','','"'+dt+'"','','="'+(drAcct||'')+'"',r.amount,'M','',r.beneficiary,'',r.ifsc||'',('="'+(r.acct||'')+'"'),'','','','','','','','','',r.narration,r.narration]; return '<tr>'+v.map(function(c){return '<td>'+String(c)+'</td>';}).join('')+'</tr>'; }).join('');
    var blob=new Blob(['﻿<html><head><meta charset="utf-8"></head><body><table border="1">'+head+body+'</table></body></html>'],{type:'application/vnd.ms-excel'});
    var u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='Bank-Payout-'+month+'.xls';a.click();setTimeout(function(){URL.revokeObjectURL(u);},2000);toast('Bank file ready');
  }

  window.renderAccounts=renderAccounts;
})();
