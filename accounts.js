/* Nakoda MIS — Accounts: Finance Sheet (P&L), Daily Entry, Invoices/Receivables, Expenses. */
(function(){
  var EXP_CATS=['Material Purchased','Outsourced Services','Professional fees','Rent','Light bill','Petrol','Miscellaneous','Management cost','Software cost','Sales','Marketing','Other'];
  var INC_CATS=['B2Camp','Other income'];
  var ACC={branch:'',ym:ymNowA(),tab:'finance',dailyPage:0};
  function $id(i){ return document.getElementById(i); }
  function ymNowA(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  function money(n){ return Math.round(Number(n)||0).toLocaleString('en-IN'); }
  function lvl(){ return (S.perms&&S.perms.level)||''; }
  function isInvestor(){ return lvl()==='BRANCH_VIEW'; }
  function canEnter(){ return lvl()==='SUPER'||lvl()==='BRANCH_MGR'||['CRM','Accounts'].indexOf(S.user&&S.user.Role)>=0; }
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
  function docLinks(d){ var a=[]; if(d.b2cDocUrl)a.push('<a href="'+esc(d.b2cDocUrl)+'" target="_blank" rel="noopener">B2C</a>'); if(d.b2dDocUrl)a.push('<a href="'+esc(d.b2dDocUrl)+'" target="_blank" rel="noopener">B2D</a>'); if(d.testXlUrl)a.push('<a href="'+esc(d.testXlUrl)+'" target="_blank" rel="noopener">Tests</a>'); return a.length?a.join(' · '):'—'; }
  function loadDaily(){ API.listDaily(ACC.branch,ACC.ym).then(function(r){ var box=$id('accBody'); if(!box) return; if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
    var all=(r.daily||[]).slice().sort(function(a,b){return a.date<b.date?1:-1;});
    var PAGE=15, total=all.length, pages=Math.max(1,Math.ceil(total/PAGE));
    if(ACC.dailyPage>=pages) ACC.dailyPage=pages-1; if(ACC.dailyPage<0) ACC.dailyPage=0;
    var start=ACC.dailyPage*PAGE, rows=all.slice(start,start+PAGE);
    var actions=canEnter()?'<div class="fin-actions"><button class="btn" id="dlyAdd">+ Daily entry</button><button class="btn ghost" id="dlyDep">🏦 Bank deposit</button></div>':'';
    box.innerHTML=actions+
      '<div class="table-wrap"><table><thead><tr><th>Branch</th><th>Date</th><th>B2C cash</th><th>B2C bank</th><th>Expense</th><th>Other</th><th>Patients</th><th>Tests</th><th>Collection</th><th>Docs</th><th>Status</th><th>Reject</th></tr></thead><tbody>'+
      (rows.length?rows.map(function(d){ var coll=(Number(d.cashIn)||0)+(Number(d.bankIn)||0)+(Number(d.other)||0); var stt=String(d.status);
        var statusCell = stt==='verified' ? '<span class="chip paid">✓ verified</span>'
          : stt==='rejected' ? '<span class="chip" style="background:#fdecec;color:#b23b3b">✗ rejected</span>'
          : (r.canVerify ? '<button class="btn ghost sm" data-vf="'+esc(d.dayId)+'">Verify</button>' : '<span class="chip partial">pending</span>');
        var rejectCell = (stt!=='verified' && stt!=='rejected' && r.canVerify) ? '<button class="btn ghost sm" data-rj="'+esc(d.dayId)+'" style="color:#b23b3b">Reject</button>' : '';
        return '<tr><td>'+esc(branchName(d.branchId))+'</td><td>'+esc(d.date)+'</td><td>₹'+money(d.b2cCash)+'</td><td>₹'+money(d.b2cBank)+'</td><td>₹'+money(d.expense)+'</td><td>₹'+money(d.other)+'</td><td>'+(d.patients||0)+'</td><td>'+(d.tests||0)+'</td><td>₹'+money(coll)+'</td><td>'+docLinks(d)+'</td><td>'+statusCell+'</td><td>'+rejectCell+'</td></tr>'; }).join(''):'<tr><td class="empty" colspan="12">No entries this month.</td></tr>')+'</tbody></table></div>'+
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
      incBlock('B2c','B2C income (walk-in / patient)','<div class="field"><label>Expense (₹)</label><input id="dlExpense" class="in" type="number" inputmode="numeric"></div>')+
      incBlock('B2d','B2D income (doctor / referral)','')+
      '<div class="dl-blk"><div class="dl-blk-h">Other income (B2B — credit, billed monthly)</div>'+
        '<div class="field"><label>Amount (₹)</label><input id="dlOther" class="in dl-amt" type="number" inputmode="numeric"></div>'+
        '<div style="font-size:11px;color:#888;margin-top:4px">At month-end this is replaced by your B2B invoice total.</div></div>'+
      '<div class="dl-total"><span>Total business (Cash + Bank + Other)</span><b id="dlTotal">₹0</b></div>'+
      '<div class="grid2"><div class="field"><label>Tests done (count)</label><input id="dlTests" class="in" type="number" inputmode="numeric"></div>'+
      '<div class="field"><label>Tests Excel (.xlsx)</label><label class="dl-file"><span id="dlXlSt">📎 Attach Excel</span><input id="dlXl" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label></div></div>'+
      '<div id="dlMsg"></div>';
    openModal('Daily business entry', body, '<button class="btn" id="dlSave">Submit to Accountant</button>');

    var st={b2cDocUrl:'',b2dDocUrl:'',testXlUrl:''};
    function recalc(){ var t=0; ['dlB2cCash','dlB2cBank','dlB2dCash','dlB2dBank','dlOther'].forEach(function(id){ t+=Number(($id(id)||{}).value)||0; }); $id('dlTotal').textContent='₹'+money(t); }
    ['dlB2cCash','dlB2cBank','dlB2dCash','dlB2dBank','dlOther'].forEach(function(id){ var el=$id(id); if(el) el.addEventListener('input',recalc); });
    function bindUpload(inputId,stEl,stKey,label){ var inp=$id(inputId); if(!inp) return; inp.onchange=function(){ var f=this.files[0]; if(!f) return; if(f.size>8*1024*1024){ toast('File too large (max 8MB)',true); this.value=''; return; }
      var s=$id(stEl); s.textContent='Uploading…'; var fr=new FileReader();
      fr.onload=function(){ var d=fr.result,i=d.indexOf(',');
        API.uploadFile({base64:d.slice(i+1),fileName:f.name,mimeType:f.type,subPath:'DailyBusiness/'+(($id('dlDate')||{}).value||'')}).then(function(r){ if(r&&r.ok){ st[stKey]=r.url; s.innerHTML='✓ '+esc(f.name)+' — tap to replace'; } else { s.textContent='Upload failed — tap to retry'; } }, function(){ s.textContent='Upload failed — tap to retry'; }); };
      fr.readAsDataURL(f); }; }
    bindUpload('dlB2cDoc','dlB2cDocSt','b2cDocUrl');
    bindUpload('dlB2dDoc','dlB2dDocSt','b2dDocUrl');
    bindUpload('dlXl','dlXlSt','testXlUrl');

    $id('dlSave').onclick=function(){
      var bsel=$id('dlBranch'); var bid=bsel?bsel.value:ACC.branch;
      if(bsel && !bid){ $id('dlMsg').innerHTML='<div class="msg error">Please select a branch.</div>'; return; }
      this.disabled=true;
      API.saveDaily({branchId:bid,date:$id('dlDate').value,patients:$id('dlPat').value,tests:$id('dlTests').value,
        b2cCash:$id('dlB2cCash').value,b2cBank:$id('dlB2cBank').value,b2dCash:$id('dlB2dCash').value,b2dBank:$id('dlB2dBank').value,other:$id('dlOther').value,expense:($id('dlExpense')||{}).value,
        b2cDocUrl:st.b2cDocUrl,b2dDocUrl:st.b2dDocUrl,testXlUrl:st.testXlUrl}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Saved'); loadDaily(); } else { $id('dlMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; var b=$id('dlSave'); if(b) b.disabled=false; } });
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
  function invoicePdf(inv){ var logo=new Image(); logo.onload=function(){d(logo);}; logo.onerror=function(){d(null);}; logo.src='icons/login-logo.png';
    function d(logo){ var items=[]; try{items=JSON.parse(inv.itemsJson||'[]');}catch(e){} var W=1000,M=55,H=360+items.length*30, c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');
      x.fillStyle='#fff';x.fillRect(0,0,W,H);x.fillStyle='#DA1017';x.fillRect(0,0,W,8);
      if(logo){var lh=56,lw=Math.min(280,logo.width*(lh/logo.height));x.drawImage(logo,M,26,lw,lh);} else {x.fillStyle='#DA1017';x.font='bold 26px Arial';x.fillText('NAKODA',M,60);}
      x.fillStyle='#1f1f1f';x.font='bold 24px Arial';x.textAlign='right';x.fillText('TAX INVOICE',W-M,44);x.fillStyle='#888';x.font='13px Arial';x.fillText(inv.invId+' · '+inv.date,W-M,66);x.textAlign='left';
      x.fillStyle='#444';x.font='15px Arial';x.fillText('Bill to: '+inv.party+(inv.gstin?(' · GSTIN '+inv.gstin):''),M,120);
      var y=160; x.fillStyle='#f3f4f7';x.fillRect(M,y-18,W-2*M,26);x.fillStyle='#555';x.font='bold 13px Arial';x.fillText('Item',M+8,y);x.fillText('Qty',W-360,y);x.fillText('Rate',W-260,y);x.textAlign='right';x.fillText('Amount',W-M-8,y);x.textAlign='left';y+=30;
      x.font='14px Arial';x.fillStyle='#222'; items.forEach(function(it){ x.fillText(String(it.desc||''),M+8,y); x.fillText(String(it.qty),W-360,y); x.fillText('₹'+money(it.rate),W-260,y); x.textAlign='right';x.fillText('₹'+money(it.qty*it.rate),W-M-8,y);x.textAlign='left'; y+=30; });
      y+=10; x.textAlign='right'; x.fillStyle='#555';x.fillText('Subtotal: ₹'+money(inv.subtotal),W-M-8,y);y+=26; x.fillText('GST ('+inv.gstPct+'%): ₹'+money(inv.gstAmt),W-M-8,y);y+=30;
      x.fillStyle='#1a7f37';x.font='bold 20px Arial';x.fillText('Total: ₹'+money(inv.total),W-M-8,y);x.textAlign='left';
      x.fillStyle='#999';x.font='italic 12px Arial';x.textAlign='center';x.fillText('Nakoda Diagnostics And Research Center',W/2,H-22);x.textAlign='left';
      c.toBlob(function(bb){var u=URL.createObjectURL(bb),a=document.createElement('a');a.href=u;a.download=inv.invId+'.png';a.click();setTimeout(function(){URL.revokeObjectURL(u);},2000);toast('Invoice saved');});
    }
  }

  /* ---- Expenses / vendor bills ---- */
  function loadExpenses(){ API.listLedger(ACC.branch,ACC.ym,false).then(function(r){ var box=$id('accBody'); if(!box) return; if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
    var rows=(r.ledger||[]).slice().sort(function(a,b){return a.date<b.date?1:-1;});
    box.innerHTML=(canEnter()?'<div class="fin-actions"><button class="btn" id="exAdd">+ Expense / vendor bill</button></div>':'')+
      '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Party</th><th>Amount</th><th>Mode</th><th>Status</th></tr></thead><tbody>'+
      (rows.length?rows.map(function(l){ return '<tr><td>'+esc(l.date)+'</td><td>'+esc(l.category)+(l.billUrl?' <a href="'+esc(l.billUrl)+'" target="_blank">📎</a>':'')+'</td><td>'+esc(l.party||'')+'</td><td>₹'+money(l.amount)+'</td><td>'+esc(l.mode)+'</td><td>'+(String(l.status)==='approved'?'<span class="chip paid">approved</span>':(r.canVerify?'<button class="btn ghost sm" data-ap="'+esc(l.ledId)+'">Approve</button>':'<span class="chip partial">pending</span>'))+'</td></tr>'; }).join(''):'<tr><td class="empty" colspan="6">No entries this month.</td></tr>')+'</tbody></table></div>';
    var a=$id('exAdd'); if(a) a.onclick=openExpenseForm;
    box.querySelectorAll('[data-ap]').forEach(function(b){ b.onclick=function(){ API.setLedger(b.getAttribute('data-ap'),'approve').then(function(x){ if(x&&x.ok){ toast('Approved'); loadExpenses(); } }); }; });
  }); }
  function openExpenseForm(){
    var st={bill:''};
    var body='<div class="grid2"><div class="field"><label>Type</label><select id="exType" class="in"><option value="expense">Expense</option><option value="income">Income</option></select></div>'+
      '<div class="field"><label>Category</label><select id="exCat" class="in">'+EXP_CATS.map(function(c){return '<option>'+c+'</option>';}).join('')+'</select></div>'+
      '<div class="field"><label>Amount (₹)</label><input id="exAmt" class="in" type="number"></div><div class="field"><label>Mode</label><select id="exMode" class="in"><option>Cash</option><option>Bank</option><option>UPI</option></select></div>'+
      '<div class="field"><label>Paid to / party</label><input id="exParty" class="in"></div><div class="field"><label>Date</label><input id="exDate" class="in" type="date" value="'+(new Date().toISOString().slice(0,10))+'"></div>'+
      '<div class="field"><label>Vendor IFSC (for payout)</label><input id="exIfsc" class="in"></div><div class="field"><label>Vendor A/C</label><input id="exAcct" class="in"></div>'+
      '<div class="field full"><label>Attach bill (photo/PDF)</label><input type="file" id="exBill" accept="image/*,application/pdf"><div id="exBillSt" class="upst" style="font-size:11px;color:#888"></div></div>'+
      '<div class="field full"><label>Note</label><input id="exNote" class="in"></div></div><div id="exMsg"></div>';
    openModal('Expense / vendor bill', body, '<button class="btn" id="exSave">Save</button>');
    $id('exType').onchange=function(){ var inc=this.value==='income'; $id('exCat').innerHTML=(inc?INC_CATS:EXP_CATS).map(function(c){return '<option>'+c+'</option>';}).join(''); };
    $id('exBill').onchange=function(){ var f=this.files[0]; if(!f) return; var s2=$id('exBillSt'); s2.textContent='Reading…'; var fr=new FileReader(); fr.onload=function(){ var s=fr.result,i=s.indexOf(','); st.bill=s.slice(i+1); st.billMime=f.type; s2.innerHTML='Attached ✓'; }; fr.readAsDataURL(f); };
    $id('exSave').onclick=function(){ var amt=$id('exAmt').value; if(!amt){ $id('exMsg').innerHTML='<div class="msg error">Amount required.</div>'; return; } this.disabled=true;
      API.addLedger({branchId:ACC.branch,type:$id('exType').value,category:$id('exCat').value,amount:amt,mode:$id('exMode').value,party:$id('exParty').value,date:$id('exDate').value,ifsc:$id('exIfsc').value,acct:$id('exAcct').value,bill:st.bill,billMime:st.billMime,note:$id('exNote').value}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Saved'); loadExpenses(); } else $id('exMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
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
