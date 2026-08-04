/* ============================================================
 *  BANK IMPORT — BEFORE / AFTER PREVIEW  (v287)
 *  window.renderBankPreview(host, rows, branchId, branchName)
 *
 *  Shows the branch's finance row as it stands today against what this statement would make it,
 *  BEFORE anything is written. Importing a bank statement is the single most consequential thing
 *  anyone does in this system — it moves the P&L — and until now it happened blind.
 *
 *  Every row is placed in one of four states, and the colour says which:
 *    ok    written and counted        -> a real cost column moves
 *    dec   no rule matched            -> held as Uncategorised/pending, counted nowhere
 *    dbl   salary / petrol            -> already in payroll or claims, held so it cannot double-count
 *    xfer  our own accounts           -> not a cost at all, excluded from P&L
 *
 *  The classification here mirrors apiSaveBankRows exactly. If the two ever disagree, the preview
 *  is lying, so the buckets are derived from the same category strings the server uses.
 * ============================================================ */
(function(){
  var SKIP=['Salary','Petrol'];
  var TRANSFER='Inter-branch transfer', CASHDEP='Cash deposit', CARD='Card settlement';
  var UNCAT='Uncategorised';

  /* Cost categories the finance table actually has a column for, in display order.
     Keys are the server's category names; values are the short heading. */
  var COLS=[
    ['Material Purchased','Material'],['Outsourced Services','Outsourced'],
    ['Professional fees','Prof. fees'],['Salary','Salary'],['Rent','Rent'],
    ['Petrol','Petrol'],['Miscellaneous','Misc'],['Marketing','Marketing']
  ];

  function r(n){ return '₹'+Math.round(Math.abs(n||0)).toLocaleString('en-IN'); }
  function n_(v){ return Number(v)||0; }

  function stateOf(cat){
    var c=String(cat||'').trim();
    if(!c || c===UNCAT) return 'dec';
    if(c===TRANSFER) return 'xfer';
    if(SKIP.indexOf(c)>=0) return 'dbl';
    return 'ok';
  }

  window.renderBankPreview=function(host, rows, branchId, branchName){
    if(!host) return;
    rows=rows||[];
    if(!rows.length){ host.innerHTML=''; return; }

    /* Month comes from the statement itself, not from today — a July statement imported in August
       must preview against July. */
    var months={}; rows.forEach(function(x){ var m=String(x.date||'').slice(0,7); if(/^\d{4}-\d{2}$/.test(m)) months[m]=(months[m]||0)+1; });
    var ym=Object.keys(months).sort(function(a,b){ return months[b]-months[a]; })[0]||'';
    var nowYm=(function(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); })();

    /* ---- what this statement would do ---- */
    var add={}, credits={cash:0,cashN:0,card:0,cardN:0,inAmt:0}, debits=0;
    var held={dec:0,decN:0,dbl:0,dblN:0,xfer:0,xferN:0}, written=0;
    rows.forEach(function(x){
      var amt=Math.abs(n_(x.amount)), cat=String(x.category||'').trim(), inbound=(String(x.drcr).toUpperCase()==='CR');
      if(inbound){
        credits.inAmt+=amt;
        if(cat===CASHDEP){ credits.cash+=amt; credits.cashN++; }
        else if(cat===CARD){ credits.card+=amt; credits.cardN++; }
        return;
      }
      debits+=amt;
      var st=stateOf(cat);
      if(st==='ok'){ add[cat]=(add[cat]||0)+amt; written+=amt; }
      else if(st==='dec'){ held.dec+=amt; held.decN++; }
      else if(st==='dbl'){ held.dbl+=amt; held.dblN++; }
      else { held.xfer+=amt; held.xferN++; }
    });

    var warn = (ym && ym!==nowYm)
      ? '<span style="background:#FAEEDA;color:#854F0B;font-size:11.5px;padding:3px 9px;border-radius:8px">statement is '+esc(ym)+', dashboard is showing '+esc(nowYm)+'</span>' : '';

    function paint(before){
      var b=before||{cat:{},revenue:0,gross:0,net:0,bankActual:0};
      var head='<tr><th>Branch</th><th>P / L</th><th>Revenue</th><th>Gross</th>'+
        COLS.map(function(c){ return '<th>'+esc(c[1])+'</th>'; }).join('')+'<th>Bank actual</th></tr>';

      var beforeRow='<tr><td style="color:#999">'+esc(branchName||branchId||'This branch')+' <span style="font-size:11px">before</span></td>'+
        '<td style="color:#999">'+r(b.net)+'</td><td style="color:#999">'+r(b.revenue)+'</td><td style="color:#999">'+r(b.gross)+'</td>'+
        COLS.map(function(c){ return '<td style="color:#999">'+r(n_(b.cat&&b.cat[c[0]]))+'</td>'; }).join('')+
        '<td style="color:#999">'+r(b.bankActual)+'</td></tr>';

      var TONE={ok:'background:#e7f6ec;color:#1a7f37',dec:'background:#FAEEDA;color:#854F0B',dbl:'background:#fdecec;color:#b23b3b'};
      var afterRow='<tr style="border-top:2px solid #ddd"><td><b>'+esc(branchName||branchId||'This branch')+'</b> <span style="font-size:11px;color:#1a7f37">after import</span></td>'+
        '<td style="color:#999;font-size:11.5px">'+(n_(b.revenue)?r(n_(b.revenue)-written):'needs revenue')+'</td>'+
        '<td style="color:#999;font-size:11.5px">'+(n_(b.revenue)?r(b.revenue):'daily entry')+'</td>'+
        '<td style="color:#999;font-size:11.5px">'+(n_(b.revenue)?r(b.gross):'daily entry')+'</td>'+
        COLS.map(function(c){
          var key=c[0], now=n_(b.cat&&b.cat[key]), plus=n_(add[key]);
          if(SKIP.indexOf(key)>=0){
            /* Salary / Petrol appear on the statement but the dashboard takes them from payroll and
               approved claims. Show the statement figure so it can be checked, in red so nobody
               mistakes it for something the import will add. */
            var seen=0; rows.forEach(function(x){ if(String(x.category)===key && String(x.drcr).toUpperCase()!=='CR') seen+=Math.abs(n_(x.amount)); });
            if(seen) return '<td style="'+TONE.dbl+'">'+r(seen)+'<div style="font-size:9px">held · payroll wins</div></td>';
          }
          if(!plus) return '<td style="color:#ccc">'+(now?r(now):'—')+'</td>';
          return '<td style="'+TONE.ok+'">'+r(now+plus)+(now?'<div style="font-size:9px">+'+r(plus)+'</div>':'')+'</td>';
        }).join('')+
        '<td style="'+TONE.ok+'">'+r(n_(b.bankActual)+credits.inAmt)+'</td></tr>';

      host.innerHTML=
        '<div class="fin-card" style="padding:14px;margin:14px 0">'+
          '<div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:11px">'+
            '<b style="font-size:13px">What this import will do</b>'+
            '<span style="background:#e9f1fb;color:#185FA5;font-size:11.5px;padding:3px 9px;border-radius:8px">'+rows.length+' rows &middot; '+esc(ym||'—')+'</span>'+warn+
          '</div>'+
          '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">'+
            '<div><div style="font-size:11px;color:#888">Cash deposits</div><div style="font-size:18px;font-weight:600;color:#1a7f37">'+r(credits.cash)+'</div><div style="font-size:10px;color:#aaa">'+credits.cashN+' rows</div></div>'+
            '<span style="color:#bbb;padding-bottom:14px">+</span>'+
            '<div><div style="font-size:11px;color:#888">Card settlements</div><div style="font-size:18px;font-weight:600">'+r(credits.card)+'</div><div style="font-size:10px;color:#aaa">'+credits.cardN+' rows</div></div>'+
            '<span style="color:#bbb;padding-bottom:14px">=</span>'+
            '<div><div style="font-size:11px;color:#888">Total credits</div><div style="font-size:18px;font-weight:600">'+r(credits.inAmt)+'</div></div>'+
            '<div style="flex:1"></div>'+
            '<div><div style="font-size:11px;color:#888">Debits</div><div style="font-size:18px;font-weight:600">'+r(debits)+'</div></div>'+
          '</div>'+
          '<div class="table-wrap swipe"><table style="font-size:12.5px"><thead>'+head+'</thead><tbody>'+beforeRow+afterRow+'</tbody></table></div>'+
          '<div style="display:flex;flex-wrap:wrap;gap:13px;font-size:11.5px;margin-top:10px">'+
            '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#e7f6ec;border:1px solid #cfe8d8;vertical-align:-1px"></span> written and counted &mdash; '+r(written)+'</span>'+
            '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#FAEEDA;border:1px solid #eddcb8;vertical-align:-1px"></span> no rule, held for a decision &mdash; '+r(held.dec)+' ('+held.decN+' rows)</span>'+
            '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#fdecec;border:1px solid #f0cfcf;vertical-align:-1px"></span> would double-count, held &mdash; '+r(held.dbl)+' ('+held.dblN+' rows)</span>'+
            (held.xfer?'<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#e9f1fb;border:1px solid #cfe0f2;vertical-align:-1px"></span> own accounts, excluded from P&amp;L &mdash; '+r(held.xfer)+' ('+held.xferN+' rows)</span>':'')+
          '</div>'+
          (held.dec?'<div style="font-size:11.5px;color:#b23b3b;margin-top:9px">'+r(held.dec)+' across '+held.decN+' row'+(held.decN===1?'':'s')+' matches no rule. It will import as <b>Uncategorised</b> and pending &mdash; visible in Partner review, counted in no total &mdash; until somebody says what it was.</div>':'')+
        '</div>';
    }

    paint(null);   // draw immediately from the file; fill the "before" figures when the server answers
    if(branchId && ym && window.API && API.financeDashboard){
      API.financeDashboard(ym, branchId).then(function(res){
        if(!res||!res.ok) return;
        var row=(res.rows||[]).filter(function(x){ return String(x.branch)===String(branchId); })[0];
        if(row) paint(row);
      }).catch(function(){});
    }
  };
})();
