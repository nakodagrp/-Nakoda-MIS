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
  /* General Accounts write gate — invoices, expenses, bank deposits. CRM keeps all of these. */
  function canEnter(){ return lvl()==='SUPER'||lvl()==='HR_ADMIN'||lvl()==='BRANCH_MGR'||lvl()==='MANAGER'||['CRM','Accounts','Operations Manager','Process Coordinator','Senior Technician'].indexOf(S.user&&S.user.Role)>=0; }
  /* v275: the daily cash report is now filed CENTRALLY by the accountant (Mayuri) for every branch,
     with Director/Admin as a fallback. Mirrors isDailyFiler_/accDaily_ in Code.gs — the server is the
     real check, this only decides whether the "+ Daily entry" button is drawn. */
  function canDaily(){ return lvl()==='SUPER'||/mayuri/i.test((S.user&&S.user.FullName)||''); }   /* v276: SUPER = Director, Admin, MIS. HR dropped. */
  /* v275: EXPENSES are unchanged and stay with the branch. This used to reuse canDaily(); it is now its
     own function so tightening the daily cash report does not also hide the expense button from every
     branch. Mirrors accExpense_ in Code.gs. */
  function canExpense(){ return lvl()==='SUPER'||lvl()==='HR_ADMIN'||lvl()==='BRANCH_MGR'||lvl()==='MANAGER'||['Accounts','Operations Manager','Process Coordinator','Senior Technician'].indexOf(S.user&&S.user.Role)>=0; }
  function canVerify(){ return lvl()==='SUPER'||lvl()==='HR_ADMIN'||(S.user&&(S.user.Role==='Accounts'||S.user.Role==='Process Coordinator')); }
  function canViewAll(){ return S.perms&&S.perms.canViewAll; }

  function renderAccounts(){
    var v=$id('page-accounts'), brs=(S.meta&&S.meta.branches)||[];
    if(!ACC.branch && !canViewAll()) ACC.branch=(S.user&&S.user.Branch)||'';
    var tabs=isInvestor()?[['finance','Finance Sheet']]:[['finance','Finance Sheet'],['daily','Daily Entry'],['invoices','Invoices'],['expenses','Expenses'],['deposit','Bank Deposit'],['bank','Bank &amp; Reconcile'],['capital','Capital'],['payout','Payout file']];
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
    if(ACC.tab==='finance') loadFinance(); else if(ACC.tab==='daily') loadDaily(); else if(ACC.tab==='invoices') loadInvoices(); else if(ACC.tab==='deposit') loadDeposits(); else if(ACC.tab==='bank') loadBank(); else if(ACC.tab==='capital') loadCapital(); else if(ACC.tab==='payout') loadPayout(); else loadExpenses(); }

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
    /* v262: the two buttons are gated separately now — CRM lost + Daily entry but kept Bank deposit. */
    var dlyBtn=canDaily()?'<button class="btn" id="dlyAdd">+ Daily entry</button>':'';
    var depBtn=canEnter()?'<button class="btn ghost" id="dlyDep">🏦 Bank deposit</button>':'';
    var actions=(dlyBtn||depBtn)?('<div class="fin-actions">'+dlyBtn+depBtn+'</div>'):'';
    box.innerHTML=actions+
      '<div class="table-wrap"><table><thead><tr><th>Branch</th><th>Date</th><th>B2C cash</th><th>B2C bank</th><th>Other</th><th>Patients</th><th>Tests</th><th>Collection</th><th>Docs</th><th>Status</th></tr></thead><tbody>'+
      (rows.length?rows.map(function(d){ var coll=(Number(d.cashIn)||0)+(Number(d.bankIn)||0)+(Number(d.other)||0); var stt=String(d.status);
        /* v275: verification is retired — the accountant files the report herself, so there is nobody
           left to check it. New entries save as 'verified'. The three legacy states are still RENDERED
           (rows filed before this update can be pending or rejected) but no Verify/Reject buttons are
           offered any more; re-saving that day's entry replaces the row and clears the old state. */
        var statusCell = stt==='rejected' ? '<span class="chip" style="background:#fdecec;color:#b23b3b">✗ rejected (old)</span>'
          : stt==='pending' ? '<span class="chip partial">pending (old)</span>'
          : '<span class="chip paid">✓ filed</span>';
        return '<tr><td>'+esc(branchName(d.branchId))+'</td><td>'+esc(d.date)+'</td><td>₹'+money(d.b2cCash)+'</td><td>₹'+money(d.b2cBank)+'</td><td>₹'+money(d.other)+'</td><td>'+(d.patients||0)+'</td><td>'+(d.tests||0)+'</td><td>₹'+money(coll)+'</td><td>'+docLinks(d)+'</td><td>'+statusCell+'</td></tr>'; }).join(''):'<tr><td class="empty" colspan="10">No entries this month.</td></tr>')+'</tbody></table></div>'+
      (total>PAGE?'<div class="acc-pager">'+(ACC.dailyPage>0?'<button class="btn ghost sm" id="dlyPrev">‹ Prev</button>':'<span></span>')+'<span>'+(start+1)+'–'+Math.min(start+PAGE,total)+' of '+total+'</span>'+(ACC.dailyPage<pages-1?'<button class="btn ghost sm" id="dlyNext">Next ›</button>':'<span></span>')+'</div>':'');
    var a=$id('dlyAdd'); if(a) a.onclick=openDailyForm;
    var dp=$id('dlyDep'); if(dp) dp.onclick=function(){ var t=document.querySelector('#accTabs span[data-t="deposit"]'); if(t){ t.click(); } else { ACC.tab='deposit'; paintTab(); } };   // open the Bank Deposit tab (table), not the form directly
    var pv=$id('dlyPrev'); if(pv) pv.onclick=function(){ ACC.dailyPage--; loadDaily(); };
    var nx=$id('dlyNext'); if(nx) nx.onclick=function(){ ACC.dailyPage++; loadDaily(); };
    /* v275: the Verify / Reject handlers that lived here are gone with the workflow. */
  }); }
  function openDepositForm(){
    var brs=(S.meta&&S.meta.branches)||[];
    var brField=canViewAll()?'<div class="field full"><label>Branch *</label><select id="dpBranch" class="in"><option value="">Select branch</option>'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'"'+(b.BranchID===ACC.branch?' selected':'')+'>'+esc(b.BranchName)+'</option>';}).join('')+'</select></div>':'';
    var body='<div class="grid2">'+brField+
      '<div class="field"><label>Date</label><input id="dpDate" class="in" type="date" value="'+todayLocal()+'"></div>'+
      '<div class="field"><label>Amount deposited to bank (₹)</label><input id="dpAmt" class="in" type="number" inputmode="numeric"></div>'+
      '<div class="field"><label>Slip no. / bank</label><input id="dpSlip" class="in" type="text" placeholder="e.g. slip-8821 · HDFC"></div>'+
      '<div class="field full"><label>Note (optional)</label><input id="dpNote" class="in" type="text"></div></div>'+
      '<div style="font-size:12px;color:#185fa5;background:#e6f1fb;border-radius:8px;padding:8px 10px;margin-top:6px">Sent to the accountants to verify. Once verified it becomes a cash → bank transfer (total business unchanged).</div><div id="dpMsg"></div>';
    openModal('Bank deposit', body, '<button class="btn" id="dpSave">Save &amp; send</button>');
    $id('dpSave').onclick=function(){ var bsel=$id('dpBranch'); var bid=bsel?bsel.value:ACC.branch; if(bsel&&!bid){ $id('dpMsg').innerHTML='<div class="msg error">Please select a branch.</div>'; return; } var amt=Number($id('dpAmt').value)||0; if(amt<=0){ $id('dpMsg').innerHTML='<div class="msg error">Enter an amount.</div>'; return; } this.disabled=true; API.saveDeposit({branchId:bid,date:$id('dpDate').value,amount:amt,slipNo:$id('dpSlip').value,notes:$id('dpNote').value}).then(function(r){ if(r&&(r.ok||r.offline)){ closeModal(); toast(r.offline?'Saved offline — will sync':'Deposit sent for verification'); if(ACC.tab==='deposit') loadDeposits(); } else { $id('dpMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; var b=$id('dpSave'); if(b) b.disabled=false; } }); };
  }
  /* ---- Bank Deposit (record → verify) ---- */
  function loadDeposits(){
    var actions=canEnter()?'<div class="fin-actions"><button class="btn" id="depAdd">🏦 + Bank deposit</button></div>':'';
    API.listDeposits(ACC.branch,ACC.ym).then(function(r){ var box=$id('accBody'); if(!box) return;
      if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
      var list=r.deposits||[], canV=!!r.canVerify;
      var pend=list.filter(function(d){return d.status==='pending';}).length;
      var verified=list.filter(function(d){return d.status==='approved';});
      var totV=verified.reduce(function(a,d){return a+(d.amount||0);},0);
      var pills='<div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 14px">'+
        '<div style="background:#faf4e2;border-radius:10px;padding:8px 13px"><b style="color:#854f0b">'+pend+'</b> <span style="font-size:11px;color:#7a5b00">pending</span></div>'+
        '<div style="background:#eafaf3;border-radius:10px;padding:8px 13px"><b style="color:#1a7f37">'+verified.length+'</b> <span style="font-size:11px;color:#1a7f37">verified</span></div>'+
        '<div style="background:#f4f6f8;border-radius:10px;padding:8px 13px"><b>₹'+money(totV)+'</b> <span style="font-size:11px;color:#888">verified MTD</span></div></div>';
      function chip(s){ return s==='approved'?'<span style="background:#eaf7ef;color:#1a8f4c;font-size:12px;font-weight:600;padding:3px 11px;border-radius:20px">✓ verified</span>':s==='rejected'?'<span style="background:#fdecec;color:#b23b3b;font-size:12px;font-weight:600;padding:3px 11px;border-radius:20px">✗ rejected</span>':'<span style="background:#faf4e2;color:#854f0b;font-size:12px;font-weight:600;padding:3px 11px;border-radius:20px">pending</span>'; }
      var body=list.map(function(d){
        var act=(canV&&d.status==='pending')
          ? '<button class="btn ghost sm" data-vf="'+esc(d.ledId)+'" style="color:#1a8f4c;border-color:#1a8f4c">Verify</button> <button class="btn ghost sm" data-rj="'+esc(d.ledId)+'" style="color:#b23b3b;border-color:#b23b3b">Reject</button>'
          : (d.verifiedBy?('<span style="font-size:12px;color:#888">by '+esc(d.verifiedBy)+'</span>'):'');
        return '<tr><td>'+esc(d.date)+'</td><td>'+esc(branchName(d.branchId))+'</td><td>₹'+money(d.amount)+'</td><td>'+(d.slipUrl?'<a href="'+esc(d.slipUrl)+'" target="_blank">📎 slip</a> ':'')+esc(d.notes||'')+'</td><td>'+esc(d.recordedBy||'')+'</td><td>'+chip(d.status)+'</td><td style="text-align:right">'+act+'</td></tr>';
      }).join('');
      box.innerHTML=actions+pills+'<div class="card"><div class="table-wrap swipe"><table><thead><tr><th>Date</th><th>Branch</th><th>Amount</th><th>Slip / note</th><th>Recorded by</th><th>Status</th><th></th></tr></thead><tbody>'+(body||'<tr><td class="empty" colspan="7">No deposits this month.</td></tr>')+'</tbody></table></div></div>';
      var add=$id('depAdd'); if(add) add.onclick=openDepositForm;
      box.querySelectorAll('[data-vf]').forEach(function(b){ b.onclick=function(){ b.disabled=true; API.verifyDeposit(b.getAttribute('data-vf')).then(function(x){ if(x&&x.ok){ toast('Verified'); loadDeposits(); } else { toast((x&&x.error)||'Failed',true); b.disabled=false; } }); }; });
      box.querySelectorAll('[data-rj]').forEach(function(b){ b.onclick=function(){ var why=prompt('Reject reason (optional):'); if(why===null) return; b.disabled=true; API.rejectDeposit(b.getAttribute('data-rj'),why||'').then(function(x){ if(x&&x.ok){ toast('Rejected'); loadDeposits(); } else { toast((x&&x.error)||'Failed',true); b.disabled=false; } }); }; });
    });
  }
  function openDailyForm(){
    var brs=(S.meta&&S.meta.branches)||[];
    /* v275: the accountant files this for EVERY branch, so she always gets the picker even though her
       access level is not canViewAll — accDailyBranch_ on the server honours whatever she chooses.
       Head-office/Director keep it via canViewAll(); anyone else is pinned to their own branch. */
    var brField=(canViewAll()||canDaily())
      ? '<div class="field full"><label>Branch *</label><select id="dlBranch" class="in"><option value="">Select branch</option>'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'"'+(b.BranchID===ACC.branch?' selected':'')+'>'+esc(b.BranchName)+'</option>';}).join('')+'</select></div>'
      : '';
    function incBlock(t,lbl,extra){ return '<div class="dl-blk"><div class="dl-blk-h">'+lbl+'</div><div class="row2">'+
        '<div class="field"><label>Cash (₹)</label><input id="dl'+t+'Cash" class="in dl-amt" type="number" inputmode="numeric"></div>'+
        '<div class="field"><label>Bank / UPI (₹)</label><input id="dl'+t+'Bank" class="in dl-amt" type="number" inputmode="numeric"></div></div>'+
        (extra||'')+
        '<label class="dl-file"><span id="dl'+t+'DocSt">📎 Attach '+t.toUpperCase()+' document (PDF)</span><input id="dl'+t+'Doc" type="file" accept="application/pdf,image/*" hidden></label></div>'; }
    var body='<div class="grid2">'+brField+
      '<div class="field"><label>Date</label><input id="dlDate" class="in" type="date" value="'+todayLocal()+'"></div>'+
      '<div class="field"><label>Patients served</label><input id="dlPat" class="in" type="number" inputmode="numeric"></div></div>'+
      incBlock('B2c','B2C income (walk-in / patient)','')+
      /* v276 (task 3): the B2B block — amount + its PDF attach — is removed. B2B is credit business
         billed monthly and is already captured by the B2B invoices, so entering it here duplicated it.
         Historic entries keep whatever `other` they were saved with; only new entries drop it, so no
         past month's figures move. */
      '<div class="dl-total"><span>Total business (cash + bank)</span><b id="dlTotal">₹0</b></div>'+
      '<div class="grid2"><div class="field"><label>Tests done (count)</label><input id="dlTests" class="in" type="number" inputmode="numeric"></div>'+
      '<div class="field"><label>Tests Excel (.xlsx)</label><label class="dl-file"><span id="dlXlSt">📎 Attach Excel</span><input id="dlXl" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label></div></div>'+
      '<div id="dlMsg"></div>';
    openModal('Daily business entry', body, '<button class="btn" id="dlSave">Submit</button>');   /* v276: there is no accountant to submit TO any more — she files it herself and it saves verified */

    var st={b2cDocUrl:'',b2dDocUrl:'',otherDocUrl:'',testXlUrl:''};
    function recalc(){ var t=0; ['dlB2cCash','dlB2cBank'].forEach(function(id){ t+=Number(($id(id)||{}).value)||0; }); $id('dlTotal').textContent='₹'+money(t); }
    ['dlB2cCash','dlB2cBank'].forEach(function(id){ var el=$id(id); if(el) el.addEventListener('input',recalc); });
    /* API.upload resizes photos on the device, retries a dropped connection once and reports the
       real reason if it still fails — the old code sent the full-size photo and printed a fixed line. */
    function bindUpload(inputId,stEl,stKey,label){ var inp=$id(inputId); if(!inp) return; inp.onchange=function(){
      var f=this.files[0], input=this; if(!f) return;
      var s=$id(stEl);
      API.upload(f,'DailyBusiness/'+(($id('dlDate')||{}).value||''),function(m){ s.textContent=m; })
        .then(function(r){ st[stKey]=r.url; s.innerHTML='✓ '+esc(f.name)+' — tap to replace'; },
              function(e){ s.innerHTML='<span style="color:#A32D2D">'+esc(e&&e.message?e.message:'Upload failed')+'</span> — tap to retry'; input.value=''; });
    }; }
    bindUpload('dlB2cDoc','dlB2cDocSt','b2cDocUrl');
    bindUpload('dlXl','dlXlSt','testXlUrl');

    $id('dlSave').onclick=function(){
      var bsel=$id('dlBranch'); var bid=bsel?bsel.value:ACC.branch;
      if(bsel && !bid){ $id('dlMsg').innerHTML='<div class="msg error">Please select a branch.</div>'; return; }
      this.disabled=true;
      API.saveDaily({branchId:bid,date:$id('dlDate').value,patients:$id('dlPat').value,tests:$id('dlTests').value,
        b2cCash:$id('dlB2cCash').value,b2cBank:$id('dlB2cBank').value,b2dCash:0,b2dBank:0,other:0,expense:($id('dlExpense')||{}).value,
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
      '<div class="field"><label>Date</label><input id="ivDate" class="in" type="date" value="'+todayLocal()+'"></div><div class="field"><label>Due date</label><input id="ivDue" class="in" type="date"></div>'+
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
    /* v272: filing an expense follows the daily cash report off CRM and onto Senior Technician, so
       this button is gated by canExpense() — the same test the server applies in accExpense_.
       v275: was canDaily(); split apart when the daily cash report narrowed to the accountant.
       CRM keeps the rest of this screen: they can still open it and read the expense list. */
    box.innerHTML=(canExpense()?'<div class="fin-actions"><button class="btn" id="exAdd">+ Expense / vendor bill</button></div>':'')+
      '<div class="table-wrap"><table><thead><tr><th>Branch</th><th>Date</th><th>Category</th><th>Party</th><th>Amount</th><th>Mode</th><th>Status</th><th>Reject</th></tr></thead><tbody>'+
      (rows.length?rows.map(function(l){ var isPending=String(l.status)!=='approved'&&String(l.status)!=='rejected'; var statusCell=String(l.status)==='approved'?'<span style="display:inline-flex;align-items:center;gap:5px;background:#eaf7ef;color:#1a8f4c;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px">✓ approved</span>':String(l.status)==='rejected'?'<span style="display:inline-flex;align-items:center;gap:5px;background:#fdecec;color:#b23b3b;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px">✗ rejected</span>':(r.canVerify?'<button class="btn ghost sm" data-ap="'+esc(l.ledId)+'" style="color:#1a8f4c;border-color:#1a8f4c;font-weight:500">Approve</button>':'<span class="chip partial">pending</span>'); var rejectCell=(isPending&&r.canVerify)?'<button class="btn ghost sm" data-rj="'+esc(l.ledId)+'" style="color:#b23b3b;border-color:#b23b3b">Reject</button>':''; return '<tr><td>'+esc(branchName(l.branchId))+'</td><td>'+esc(fmtLedDate(l.date))+'</td><td>'+esc(l.category)+(l.billUrl?' <a href="'+esc(l.billUrl)+'" target="_blank" title="Bill">📎</a>':'')+(l.qrUrl?' <a href="'+esc(l.qrUrl)+'" target="_blank" title="QR code">▦</a>':'')+'</td><td>'+esc(l.party||'')+'</td><td>₹'+money(l.amount)+'</td><td>'+esc(l.mode)+'</td><td>'+statusCell+'</td><td>'+rejectCell+'</td></tr>'; }).join(''):'<tr><td class="empty" colspan="8">No entries this month.</td></tr>')+'</tbody></table></div>';
    var a=$id('exAdd'); if(a) a.onclick=openExpenseForm;
    function ledgerAction(ledId,act){ var url=(window.NAKODA_CONFIG&&window.NAKODA_CONFIG.API_URL)||''; var tok=''; try{tok=localStorage.getItem('nk_tok')||'';}catch(e){} return fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'setLedger',token:tok,ledId:ledId,act:act}),redirect:'follow'}).then(function(r){return r.json();}); }
    box.querySelectorAll('[data-ap]').forEach(function(b){ b.onclick=function(){ b.textContent='Saving…'; b.disabled=true; ledgerAction(b.getAttribute('data-ap'),'approve').then(function(x){ if(x&&x.ok){ var td=b.parentNode; td.innerHTML='<span style="display:inline-flex;align-items:center;gap:5px;background:#eaf7ef;color:#1a8f4c;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px">✓ approved</span>'; var row=td.parentNode; var rjTd=row.cells[row.cells.length-1]; if(rjTd) rjTd.innerHTML=''; toast('Approved'); } else { b.textContent='Approve'; b.disabled=false; toast((x&&x.error)||'Failed',true); } }); }; });
    box.querySelectorAll('[data-rj]').forEach(function(b){ b.onclick=function(){ var reason=prompt('Reason for rejecting? (optional)'); if(reason===null) return; b.textContent='Saving…'; b.disabled=true; ledgerAction(b.getAttribute('data-rj'),'reject').then(function(x){ if(x&&x.ok){ var row=b.parentNode.parentNode; var stTd=row.cells[row.cells.length-2]; if(stTd) stTd.innerHTML='<span style="display:inline-flex;align-items:center;gap:5px;background:#fdecec;color:#b23b3b;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px">✗ rejected</span>'; b.parentNode.innerHTML=''; toast('Rejected'); } else { b.textContent='Reject'; b.disabled=false; toast((x&&x.error)||'Failed',true); } }); }; });
  }); }
  function openExpenseForm(){
    var st={bill:'',qr:''};
    var body='<div class="grid2"><div class="field"><label>Type</label><select id="exType" class="in"><option value="expense">Expense</option><option value="income">Income</option></select></div>'+
      '<div class="field"><label>Date</label><input id="exDate" class="in" type="date" value="'+todayLocal()+'"></div>'+
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
  /* v276 (task 6) — three new options at the top of the list, where they are easy to reach.
     CAPITAL: money the company or a partner puts in when a branch is short of cash, transferred back
     once it is profitable. It is a loan, not turnover, so the server writes it with type 'capital' and
     it never touches the P&L, the reconcile or the payout file. Direction comes from the statement's
     own sign — a credit is money in, a debit is the transfer back — so there is one option each rather
     than four, and nothing to mis-tag.
     PRIOR-MONTH INCOME: received now, earned earlier. The row keeps its true bank date and carries a
     separate posting month, so June billing that lands on 28 July is counted in June. */
  var CAPITAL_CATS=['Company capital','Partner capital'];
  var PRIOR_CAT='Income of previous month';
  /* v287 — 'Uncategorised' FIRST, AND IT IS THE DEFAULT.
     rowHtml falls back to BANK_CATS[0] whenever a row has no category, and nothing was categorising
     rows at all — so every one of a 69-row statement arrived pre-set to 'B2C income'. One click of
     Save and the whole month of DEBITS would have imported as revenue. The safe default is the one
     that says "we do not know yet"; the server holds those as pending and counts them nowhere.
     Cash deposit / Card settlement / Inter-branch transfer are the categories the server's own rules
     emit — they have to be selectable here or a corrected row could not be saved back. */
  /* v290: OPD cash (income), plus TDS / Mobile bill / Monthly software expense (costs).
     NEW_CAT is the sentinel that opens the "type your own" box — see rowHtml/bindBank. */
  var NEW_CAT='＋ New category…';
  var BANK_CATS=['Uncategorised','B2C income','OPD cash','Other income'].concat(CAPITAL_CATS,[PRIOR_CAT],
    ['Cash deposit','Card settlement','Inter-branch transfer',
     'Vendor payment','Salary','Material Purchased','Rent','Light bill','Petrol','Professional fees',
     'TDS','Mobile bill','Monthly software expense',
     'Miscellaneous','Bank charge','Outsourced Services','Marketing','Other']);
  /* Categories somebody typed in earlier. Pulled from the server on load so every user sees the same
     list — otherwise two people invent "Mobile Bill" and "mobile bills" and the finance table grows two
     columns for one thing. */
  var CUSTOM_CATS=[];
  function allCats(){ return BANK_CATS.concat(CUSTOM_CATS.filter(function(c){ return BANK_CATS.indexOf(c)<0; })).concat([NEW_CAT]); }
  function addCustomCat(c){
    c=String(c||'').trim(); if(!c) return '';
    var exists=allCats().filter(function(x){ return x.toLowerCase()===c.toLowerCase(); })[0];
    if(exists && exists!==NEW_CAT) return exists;                 // reuse the existing spelling, never duplicate it
    if(CUSTOM_CATS.indexOf(c)<0) CUSTOM_CATS.push(c);
    return c;
  }
  /* Filled from the server on first import (apiBankRules): the built-in narration rules plus anything
     learned. Applied client-side so the operator SEES the categories before saving, not after. */
  var BANK_RULES=null, BANK_SKIP=['Salary','Petrol'];
  function applyBankRules(rows){
    if(!BANK_RULES) return rows;
    rows.forEach(function(r){
      if(String(r.category||'').trim() && r.category!=='Uncategorised') return;   // a human already decided
      var d=String(r.description||'');
      for(var i=0;i<BANK_RULES.length;i++){
        var R=BANK_RULES[i], hit=false;
        try{ hit = R.matchType==='regex' ? new RegExp(R.pattern,'i').test(d)
                                         : d.toLowerCase().indexOf(String(R.pattern).toLowerCase())>=0; }
        catch(e){ hit=false; }
        if(hit){ r.category=R.cat; r.autoCat=true; return; }
      }
      r.category='Uncategorised';
    });
    return rows;
  }
  function loadBankRules(){
    if(BANK_RULES || !window.API || !API.bankRules) return Promise.resolve();
    return API.bankRules().then(function(r){
      if(!r||!r.ok) return;
      BANK_RULES=(r.learned||[]).concat(r.builtin||[]);   // a learned rule always beats a built-in one
      if(r.skipCats) BANK_SKIP=r.skipCats;
      (r.customCats||[]).forEach(addCustomCat);          // v290: categories other people have already created
    }).catch(function(){});
  }
  /* The statement header carries the account number; the server matches it to a branch so nobody has
     to pick one by hand (and cannot pick the wrong one). */
  function accountNoFrom(grid){
    for(var i=0;i<grid.length && i<40;i++){
      var row=grid[i]||[];
      for(var j=0;j<row.length;j++){
        if(/account\s*(no|number)/i.test(String(row[j]||''))){
          for(var k=j+1;k<row.length;k++){
            var v=String(row[k]||'').replace(/[^0-9]/g,'');
            if(v.length>=6) return v;
          }
        }
      }
    }
    return '';
  }
  function isCapCat(c){ return CAPITAL_CATS.indexOf(String(c))>=0; }
  function prevMonthOf(d){ var m=String(d||'').slice(0,7); if(!/^\d{4}-\d{2}$/.test(m)) return '';
    var y=Number(m.slice(0,4)), mm=Number(m.slice(5,7))-1; if(mm<1){ mm=12; y--; }
    return y+'-'+('0'+mm).slice(-2); }
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
  /* v261: new Date().toISOString() reports UTC, so between midnight and 05:30 India time it
     returns YESTERDAY and every date box opened with the wrong day already filled in. */
  function todayLocal(){ var d=new Date();
    return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function isoDate(s){ s=String(s).trim(); var m=s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/); if(m){ var y=m[3].length===2?('20'+m[3]):m[3]; return y+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[1]).slice(-2); } var d=new Date(s); if(isNaN(d)) return s.slice(0,10);
    return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  var BANKROWS=[], BANKACCT='';
  function loadBank(){
    var box=$id('accBody'), brs=(S.meta&&S.meta.branches)||[];
    box.innerHTML='<div class="fin-card" style="padding:14px;margin-bottom:14px"><div class="fin-h" style="margin:-14px -14px 12px">Reconcile — collection vs bank</div>'+
      '<div class="acc-top"><select class="in" id="rcBranch" style="max-width:160px">'+(canViewAll()?'<option value="">Pick branch</option>':'')+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'"'+(b.BranchID===ACC.branch?' selected':'')+'>'+esc(b.BranchName)+'</option>';}).join('')+'</select>'+
      '<input class="in" id="rcDate" type="date" style="max-width:160px" value="'+todayLocal()+'"><button class="btn" id="rcGo">Check</button></div><div id="rcOut"></div></div>'+
      '<div class="fin-h" style="border-radius:8px">Import bank statement</div>'+
      '<div class="up" style="margin:12px 0" id="bkDrop">⬆ Choose statement (.csv / .xlsx)<input type="file" id="bkFile" accept=".csv,.xlsx,.xls" style="display:block;margin:8px auto 0"></div>'+
      '<div id="bkTableWrap"></div>';
    $id('rcGo').onclick=function(){ var b=$id('rcBranch').value, d=$id('rcDate').value; API.reconcile(b,d).then(function(r){ var o=$id('rcOut'); if(!r||!r.ok){ o.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
      var match=Math.abs(r.diff)<1; o.innerHTML='<div class="rec2"><div>Entered collection: <b>₹'+money(r.collection)+'</b></div><div>Bank received: <b>₹'+money(r.bankReceived)+'</b></div><div class="'+(match?'rec-ok':'rec-bad')+'">'+(match?'✓ Matched':('⚠ Difference ₹'+money(Math.abs(r.diff))))+'</div></div>'; }); };
    $id('bkFile').onchange=function(){ var f=this.files[0]; if(!f) return; var wrap=$id('bkTableWrap'); wrap.innerHTML='<div class="center-load"><span class="loader dark"></span> Parsing…</div>';
      var isCsv=/\.csv$/i.test(f.name); var fr=new FileReader();
      fr.onload=function(){ var grid;
        function parseGrid(){
          try{ if(isCsv){ grid=parseCSV(fr.result); } else { var wb=XLSX.read(new Uint8Array(fr.result),{type:'array'}); grid=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1}); } }
          catch(e){ wrap.innerHTML='<div class="empty">Could not read file.</div>'; return; }
          BANKROWS=normalizeBank(grid);
          if(!BANKROWS.length){ wrap.innerHTML='<div class="empty">No transactions detected. Make sure it\'s the bank\'s statement export.</div>'; return; }
          BANKACCT=accountNoFrom(grid);   /* v287: resolves the branch server-side — see saveBankRows meta */
          loadBankRules().then(function(){ applyBankRules(BANKROWS); paintBankTable(brs); });
        }
        /* v188: the 900KB Excel library is no longer loaded at app startup — fetch it here, only
           when someone actually imports an .xlsx (same on-demand pattern as the attendance PDF). */
        if(!isCsv && typeof XLSX==='undefined'){
          var s=document.createElement('script');
          s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          s.onload=parseGrid;
          s.onerror=function(){ wrap.innerHTML='<div class="empty">Excel parser needs internet (or upload CSV).</div>'; };
          document.head.appendChild(s);
          return;
        }
        parseGrid();
      };
      if(isCsv) fr.readAsText(f); else fr.readAsArrayBuffer(f);
    };
  }
  function paintBankTable(brs){
    var wrap=$id('bkTableWrap');
    /* v276: bulk tagging. A statement is 69 rows that are almost always the same branch, and setting
       each one by hand was the slowest part of the month. Leaving a dropdown on "— leave as is —"
       v277: BRANCH ONLY. The category half was removed — a statement is nearly always one branch but
       a mix of categories, so setting every row to one category was work to undo rather than work
       saved, and it silently overwrote rows already tagged. Individual rows stay editable. */
    var bulk='<div class="bk-bulk" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#e6f1fb;border-radius:8px;padding:10px 12px;margin:8px 0">'+
      '<span style="font-size:12px;color:#185fa5;font-weight:600">Set all '+BANKROWS.length+' rows</span>'+
      '<select class="mini2" id="bkAllBr" style="min-width:140px"><option value="">— branch —</option>'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'">'+esc(b.BranchName)+'</option>';}).join('')+'</select>'+
      '<button class="btn sm" id="bkApplyAll">Apply to all</button>'+
      '<span style="font-size:11px;color:#5b7fa5">Categories stay as they are</span></div>';

    wrap.innerHTML='<div style="font-size:12px;color:#666;margin:8px 0">'+BANKROWS.length+' transactions — tag Branch &amp; Category, then save.</div>'+bulk+
      '<div class="table-wrap"><table><thead><tr><th style="min-width:92px">Date</th><th style="min-width:200px">Description</th><th>Amount</th><th style="min-width:120px">Branch</th><th style="min-width:150px">Category</th><th style="min-width:150px">Details</th></tr></thead><tbody>'+
      BANKROWS.map(function(r,i){ return rowHtml(r,i,brs); }).join('')+'</tbody></table></div>'+
      '<div id="bkPreview"></div>'+
      '<div class="fin-actions" style="margin-top:10px"><button class="btn" id="bkSave">Save '+BANKROWS.length+' to ledger</button></div>';
    /* v287: show what this import would DO before it is committed. Importing a statement moves the
       P&L; doing it blind is how a month gets quietly wrong. */
    if(window.renderBankPreview){
      var _pb=BANKROWS[0]&&BANKROWS[0].branch||ACC.branch||'';
      var _pn=(brs.filter(function(b){return String(b.BranchID)===String(_pb);})[0]||{}).BranchName||'';
      try{ window.renderBankPreview(document.getElementById('bkPreview'), BANKROWS, _pb, _pn); }catch(_){}
    }
    bindBank(brs);
  }
  /* v276: description no longer truncates — the bank narration is the only way to tell two rows apart
     ("NEFT-NAKDOA DIAGNOSTICS P-CMS20…" was cut exactly where it stopped being useful), so it wraps. */
  function rowHtml(r,i,brs){
    var cat=r.category||BANK_CATS[0];
    return '<tr data-row="'+i+'"><td>'+esc(r.date)+'</td>'+
      '<td style="white-space:normal;word-break:break-word;line-height:1.35;font-size:12px">'+esc(r.description)+'</td>'+
      '<td class="'+(r.drcr==='CR'?'cr':'dr')+'" style="white-space:nowrap">'+(r.drcr==='CR'?'+':'-')+'₹'+money(r.amount)+'</td>'+
      '<td><select class="mini2" data-br="'+i+'">'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'"'+((r.branch||ACC.branch)===b.BranchID?' selected':'')+'>'+esc(b.BranchName)+'</option>';}).join('')+'</select></td>'+
      '<td><select class="mini2" data-cat="'+i+'">'+allCats().map(function(c){return '<option'+(c===cat?' selected':'')+(c===NEW_CAT?' style="color:#DA1017;font-weight:600"':'')+'>'+esc(c)+'</option>';}).join('')+'</select>'+extraHtml(r,i)+'</td>'+
      '<td><input class="mini2" data-det="'+i+'" value="'+esc(r.details||'')+'" placeholder="'+(cat==='Partner capital'?'partner name':'optional')+'" style="width:100%"></td></tr>';
  }
  /* The one extra field a capital or prior-month row needs, shown only when that category is chosen.
     v277: the separate "partner name" box is gone. It sat directly beside Details asking for the same
     kind of text, which read as two boxes for one answer. The partner's name now comes from Details —
     see readRow — and the Details placeholder changes to say so when Partner capital is picked. */
  function extraHtml(r,i){
    var c=String(r.category||BANK_CATS[0]);
    /* v290: picking "New category…" opens this inline. Kept in the row rather than a popup so the
       narration and the amount stay on screen while you decide what the payment actually was. */
    if(c===NEW_CAT) return '<div style="margin-top:6px;border:1px solid #DA1017;border-radius:8px;padding:8px;background:#fff">'+
      '<input class="mini2" data-newcat="'+i+'" placeholder="Type the category name" style="width:100%;margin-bottom:6px" autofocus>'+
      '<label style="display:flex;gap:6px;align-items:flex-start;font-size:11px;color:#666;margin-bottom:7px;cursor:pointer">'+
        '<input type="checkbox" data-newrule="'+i+'" checked style="margin-top:2px">'+
        '<span>Remember it — put payments like this here automatically next time</span></label>'+
      '<div style="display:flex;gap:6px">'+
        '<button class="btn sm" data-newok="'+i+'">Use it</button>'+
        '<button class="btn sm ghost" data-newno="'+i+'">Cancel</button></div></div>';
    if(c==='Company capital') return '<div style="font-size:11px;color:#888;margin-top:4px">Party: Company</div>';
    if(c===PRIOR_CAT) return '<input class="mini2" type="month" data-pm="'+i+'" value="'+esc(r.postMonth||prevMonthOf(r.date))+'" style="width:100%;margin-top:4px" title="Which month this income belongs to">';
    return '';
  }
  function readRow(t,i){
    var g=function(a){ return t.querySelector('['+a+'="'+i+'"]'); };
    var br=g('data-br'), ct=g('data-cat'), dt=g('data-det'), pm=g('data-pm');
    var r=BANKROWS[i];
    if(br) r.branch=br.value;
    if(ct && ct.value!==NEW_CAT) r.category=ct.value;   // v290: the sentinel is a prompt, never a real category
    if(dt) r.details=dt.value;
    /* v277: Partner capital takes its party from Details, so the ledger still gets a name to group the
       running balance by without a second box asking for it. Company capital is always 'Company'. */
    r.party   = r.category==='Company capital' ? 'Company'
              : r.category==='Partner capital' ? String(r.details||'').trim()
              : '';
    r.postMonth = (r.category===PRIOR_CAT) ? (pm?pm.value:prevMonthOf(r.date)) : '';
  }
  function bindBank(brs){
    var t=$id('bkTableWrap');
    /* Re-render just the one row when its category changes, so the partner / month field appears
       without losing what has been typed into any other row. */
    t.querySelectorAll('[data-cat]').forEach(function(sel){ sel.onchange=function(){
      var i=Number(sel.getAttribute('data-cat'));
      if(sel.value===NEW_CAT){ BANKROWS[i].category=NEW_CAT; }   /* v290: open the type-your-own panel */
      else readRow(t,i);
      var tr=t.querySelector('tr[data-row="'+i+'"]'); if(!tr) return;
      tr.outerHTML=rowHtml(BANKROWS[i],i,brs); bindBank(brs);
      var nb=t.querySelector('[data-newcat="'+i+'"]'); if(nb) nb.focus();
    }; });
    /* v290 — the type-your-own category. */
    t.querySelectorAll('[data-newok]').forEach(function(btn){ btn.onclick=function(){
      var i=Number(btn.getAttribute('data-newok'));
      var box=t.querySelector('[data-newcat="'+i+'"]');
      var name=String((box&&box.value)||'').trim();
      if(!name){ toast('Type a category name first.',true); if(box) box.focus(); return; }
      var cat=addCustomCat(name);
      BANKROWS[i].category=cat;
      /* Save it as a rule so the next statement categorises this payee on its own. Anchored to the
         stable part of the narration: bank references change every transaction, the payee name does not. */
      var remember=t.querySelector('[data-newrule="'+i+'"]');
      if(remember && remember.checked && window.API && API.saveBankRule){
        var stem=String(BANKROWS[i].description||'')
          .replace(/[-–]?\s*(CMS|FCM|FOS|BRB)[0-9A-Za-z\-]*/g,' ')
          .replace(/^\s*(NEFT|IFT|UPI|RTGS)\s*[-:]?\s*/i,'')
          .replace(/\s{2,}/g,' ').trim().slice(0,40);
        if(stem){
          API.saveBankRule({pattern:stem, matchType:'contains', category:cat})
            .then(function(rr){ if(rr&&rr.ok) toast('Saved — "'+stem+'" will go to '+cat+' next time'); });
          BANK_RULES=[{pattern:stem,matchType:'contains',cat:cat}].concat(BANK_RULES||[]);
        }
      }
      /* Apply it to every other row that matches the same payee and is still uncategorised. */
      var alsoN=0;
      BANKROWS.forEach(function(rr,j){
        if(j===i) return;
        var c=String(rr.category||'');
        if(c && c!=='Uncategorised') return;
        if(String(rr.description||'').toUpperCase().indexOf(name.toUpperCase())>=0){ rr.category=cat; alsoN++; }
      });
      paintBankTable(brs);
      toast('Category "'+cat+'" added'+(alsoN?(' · applied to '+alsoN+' more row'+(alsoN===1?'':'s')):''));
    }; });
    t.querySelectorAll('[data-newno]').forEach(function(btn){ btn.onclick=function(){
      var i=Number(btn.getAttribute('data-newno'));
      BANKROWS[i].category='Uncategorised';
      paintBankTable(brs);
    }; });
    t.querySelectorAll('[data-newcat]').forEach(function(el){ el.onkeydown=function(ev){
      if(ev.key==='Enter'){ ev.preventDefault(); var b=t.querySelector('[data-newok="'+el.getAttribute('data-newcat')+'"]'); if(b) b.click(); }
    }; });

    t.querySelectorAll('[data-br]').forEach(function(sel){ sel.onchange=function(){ readRow(t,Number(sel.getAttribute('data-br'))); }; });
    t.querySelectorAll('[data-det]').forEach(function(el){ el.onchange=function(){ readRow(t,Number(el.getAttribute('data-det'))); }; });
    t.querySelectorAll('[data-pm]').forEach(function(el){ el.onchange=function(){ readRow(t,Number(el.getAttribute('data-pm'))); }; });

    var ap=$id('bkApplyAll');
    if(ap) ap.onclick=function(){
      var b=$id('bkAllBr').value;
      if(!b){ toast('Pick a branch first.',true); return; }
      BANKROWS.forEach(function(r){ r.branch=b; });
      paintBankTable(brs);
      toast('All '+BANKROWS.length+' rows set to this branch');
    };

    var sv=$id('bkSave');
    if(sv) sv.onclick=function(){
      for(var i=0;i<BANKROWS.length;i++) readRow(t,i);
      var unnamed=BANKROWS.filter(function(x){ return String(x.category||'')===NEW_CAT; });
      if(unnamed.length){ toast(unnamed.length+' row(s) are waiting for a category name — type it and press Use it.',true); return; }
      var bad=BANKROWS.filter(function(r){ return r.category==='Partner capital' && !String(r.party||'').trim(); });
      if(bad.length){ toast(bad.length+' partner capital row(s) need a partner name.',true); return; }
      this.disabled=true; this.textContent='Saving…';
      /* v287: meta is REQUIRED. Without it apiSaveBankRows cannot resolve the branch and returns
         'Could not work out which branch this statement belongs to.' — which is what every import
         attempt has been doing. */
      API.saveBankRows(BANKROWS, {accountNo:BANKACCT, branchId:(BANKROWS[0]&&BANKROWS[0].branch)||ACC.branch||''}).then(function(r){
        if(r&&r.ok){
          var held=Number(r.skipped)||0, dup=Number(r.duplicates)||0;
          toast(r.saved+' entries saved'+(held?(' · '+held+' held for review'):'')+(dup?(' · '+dup+' duplicates skipped'):''));
          BANKROWS=[];
          $id('bkTableWrap').innerHTML='<div class="empty" style="text-align:left;padding:14px">Saved ✓ '+r.saved+' rows written'+
            (held?('<br><span style="color:#854F0B">'+held+' row(s) had no rule and are held as Uncategorised — open <b>Partner review</b> on the dashboard to assign them.</span>'):'')+
            (dup?('<br><span style="color:#888">'+dup+' row(s) were already imported and were skipped.</span>'):'')+'</div>';
        }
        else { toast((r&&r.error)||'Failed',true); var b2=$id('bkSave'); if(b2){ b2.disabled=false; b2.textContent='Save to ledger'; } }
      });
    };
  }

  /* ---- Capital ledger (v276, task 6) ----
     Company / partner money put in to cover a branch shortfall, and the transfers back out once it is
     profitable. Deliberately its own screen and NOT part of the P&L: capital in is money owed back, so
     showing it as income would make a loss-making month read as profit. */
  function loadCapital(){
    API.capitalLedger(ACC.branch).then(function(r){
      var box=$id('accBody'); if(!box) return;
      if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
      var rows=r.rows||[], tot=r.totals||[];
      var cards=tot.length
        ? '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'+tot.map(function(t){
            return '<div style="background:#f4f6f8;border-radius:10px;padding:9px 14px">'+
              '<div style="font-size:11px;color:#888">'+esc(t.party)+' · '+esc(branchName(t.branchId))+'</div>'+
              '<b style="font-size:15px">₹'+money(t.outstanding)+'</b> <span style="font-size:11px;color:#888">outstanding</span></div>';
          }).join('')+'</div>'
        : '';
      box.innerHTML=cards+
        '<div style="font-size:12px;color:#666;margin-bottom:8px">Tag a bank row as <b>Company capital</b> or <b>Partner capital</b> on the Bank &amp; Reconcile tab and it appears here. Credits add to what is owed; debits are the transfer back.</div>'+
        '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Party</th><th>Branch</th><th>In / out</th><th>Outstanding</th><th>Details</th></tr></thead><tbody>'+
        (rows.length?rows.map(function(x){
          var neg=Number(x.amount)<0;
          return '<tr><td>'+esc(x.date)+'</td><td>'+esc(x.party)+'</td><td>'+esc(branchName(x.branchId))+'</td>'+
            '<td class="'+(neg?'dr':'cr')+'">'+(neg?'−':'+')+'₹'+money(Math.abs(x.amount))+'</td>'+
            '<td>₹'+money(x.outstanding)+'</td><td style="white-space:normal;font-size:12px">'+esc(x.details||x.notes||'')+'</td></tr>';
        }).join(''):'<tr><td class="empty" colspan="6">No capital movements yet.</td></tr>')+'</tbody></table></div>';
    });
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
