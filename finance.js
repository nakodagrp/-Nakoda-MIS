/* ============================================================
 *  Finance section on the main dashboard — per-branch P/L,
 *  gross, all finance-sheet categories, bank actual + reconciliation.
 *  window.renderFinDash(host, branch)
 *
 *  v285 — REBUILT to the bank-statement layout.
 *    · company-wide credits strip: cash deposits + card settlements = total credits, and debits
 *    · columns: Branch · P/L · Revenue · Gross · <live cost categories> · Bank actual
 *    · B2C / B2D / B2B dropped (the split lives on the Accounts page; it was 3 mostly-empty
 *      columns here, pushing Bank actual off the right edge of every phone)
 *    · "Excluded from P & L" panel for own-group transfers
 *  Every figure below already came back from apiFinanceDashboard — no new endpoint, no server change.
 * ============================================================ */
(function(){
  /* v277: follow the dashboard month picker instead of hard-coding "now". */
  function ym(){
    if(window.dashYm) return window.dashYm();
    var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function ymText(s){
    var M=['January','February','March','April','May','June','July','August','September','October','November','December'];
    var m=Number(String(s).slice(5,7)); return (M[m-1]||String(s))+' '+String(s).slice(0,4);
  }
  /* ============================================================ v289 — ZERO UNTIL THE STATEMENT ARRIVES
     You asked for every figure in this table to read ₹0 while no bank statement has been imported.

     It is done, but deliberately CONDITIONAL rather than hard-coded, for one reason: revenue on this
     table does not come from the bank statement. It comes from Acc_Daily — the daily entry your
     accountant files every day — and Acc_Invoices. Printing ₹0 over a real ₹69,528 of collection is a
     false statement, and a permanent one would stay false forever.

     Tying it to the condition you actually described means it stops being wrong on its own: the moment
     a statement is imported for that month, real figures come back with no code change and nobody has
     to remember to undo anything. A banner under the table says the figures are suppressed, so nobody
     reads ₹0 as "we earned nothing".

     To switch this off permanently, set ZERO_UNTIL_STATEMENT to false. */
  var ZERO_UNTIL_STATEMENT = true;
  var _zeroMode = false;   // set per-render, once we know whether a statement exists for this month
  function r(n){ return '₹'+Math.round(_zeroMode?0:(n||0)).toLocaleString('en-IN'); }
  /* v279: a zero here almost never means "we spent nothing on rent this month" — it means nobody has
     filed the rent bill yet. Printing ₹0 asserts the first and hides the second. */
  var DASH='<span style="color:#ccc">—</span>';
  function rz(n){ if(_zeroMode) return '₹0'; n=Number(n)||0; return n?r(n):DASH; }
  function sumCat(x){ var t=0, c=x.cat||{}; for(var k in c){ if(Object.prototype.hasOwnProperty.call(c,k)) t+=Number(c[k])||0; } return t; }
  function n_(v){ return Number(v)||0; }

  /* The server's category names are long enough to wrap the header two lines deep on a phone.
     Shorten for display only — the keys themselves are untouched. */
  var SHORT={'Professional fees':'Prof. fees','Miscellaneous':'Misc','Light bill':'Light','Management cost':'Mgmt','Software cost':'Software'};
  function catLabel(c){ return SHORT[c]||c; }

  function fig(label, amount, sub, colour){
    return '<div><div style="font-size:11px;color:#888">'+label+'</div>'+
           '<div style="font-size:19px;font-weight:600;'+(colour?('color:'+colour):'')+'">'+amount+'</div>'+
           (sub?('<div style="font-size:10.5px;color:#aaa">'+sub+'</div>'):'')+'</div>';
  }
  function op(s){ return '<div style="font-size:15px;color:#bbb;padding-bottom:16px">'+s+'</div>'; }
  function rows_(n){ return n+' row'+(n===1?'':'s'); }

  window.renderFinDash=function(host,branch){
    if(!host) return;
    var perm=window.S&&S.perms, role=(window.S&&S.user&&S.user.Role)||'';
    var ok=perm&&(perm.canViewAll||perm.level==='BRANCH_MGR'||perm.level==='BRANCH_VIEW'||['Accounts','Operations Manager','Director'].indexOf(role)>=0);
    if(!ok){ host.innerHTML=''; return; }
    var selYm=ym();
    API.financeDashboard(selYm,branch||'').then(function(res){
      if(!res||!res.ok){ host.innerHTML=''; return; }
      var allRows=res.rows||[], cats=res.categories||[];
      if(!allRows.length){ host.innerHTML=''; return; }

      /* v279 — DROP WHAT IS EMPTY, KEEP WHAT IS REAL.
           1. a branch with no revenue AND no costs is not shown — it has not traded, it is not a zero
           2. a cost column empty for EVERY branch is not shown — nobody has filed that bill yet
           3. an empty cell inside a row that does have data shows an em dash, not ₹0
         Counts of what was hidden go under the table so nothing disappears silently. */
      var _anyBankPre=allRows.some(function(x){ var b=x.bank||{}; return n_(b.inAmt)!==0||n_(b.debitAmt)!==0; });
      var _zeroPre = ZERO_UNTIL_STATEMENT && !_anyBankPre;
      /* In zero mode nothing is hidden: every branch is listed, every column shown, all reading ₹0. */
      var rows=_zeroPre?allRows.slice():allRows.filter(function(x){ return n_(x.revenue)!==0 || sumCat(x)!==0 || n_(x.bankActual)!==0; });
      var hiddenNames=allRows.filter(function(x){ return rows.indexOf(x)<0; }).map(function(x){ return x.branchName; });
      if(!rows.length){
        host.innerHTML='<div class="section-label">Finance · '+esc(ymText(selYm))+' · by branch</div>'+
          '<div class="card"><div class="empty" style="padding:18px">Nothing filed for '+esc(ymText(selYm))+' yet.</div></div>';
        return;
      }
      /* v285b — EVERY COST COLUMN STAYS VISIBLE, EVEN WHEN NOTHING IS FILED.
         v279 hid a column that was empty for every branch. That kept the table tidy but it also hid the
         single most useful thing on the screen: which bills nobody has filed yet. A column you cannot see
         is not a column you chase.
         So all categories are always shown. What changes is how emptiness is written. NOT as ₹0 — a zero
         says "we spent nothing on rent this month", which is a different and usually false claim from
         "nobody has filed the rent bill yet", and a table of forty confident zeros buries the four
         figures that are real. Empty is an em dash, and a column that is empty for EVERY branch gets a
         greyed italic heading so the whole outstanding column is visible at a glance. */
      var unfiledCats=cats.filter(function(c){ return !rows.some(function(x){ return n_(x.cat&&x.cat[c])!==0; }); });
      function catUnfiled(c){ return unfiledCats.indexOf(c)>=0; }

      /* ---- company-wide bank totals (the strip across the top) ----------------------------------
         Summed across every branch in scope. Each of these already comes back per branch from
         apiFinanceDashboard as row.bank — amounts AND row counts — so the strip needs no new call. */
      var B={cash:0,cashRows:0,card:0,cardRows:0,credits:0,debits:0,xfer:0,xferRows:0};
      var Tcoll=0,Texp=0,TbankCash=0;
      rows.forEach(function(x){
        var b=x.bank||{};
        B.cash+=n_(b.cashAmt); B.cashRows+=n_(b.cashRows);
        B.card+=n_(b.cardAmt); B.cardRows+=n_(b.cardRows);
        B.credits+=n_(b.inAmt); B.debits+=n_(b.debitAmt);
        B.xfer+=n_(b.xferAmt); B.xferRows+=n_(b.xferRows);
        Tcoll+=n_(x.collCash); Texp+=n_(x.cashExp); TbankCash+=n_(x.bankCash);
      });
      var anyBank=(B.credits!==0||B.debits!==0);
      /* v289: no statement for this month -> every figure on this table reads ₹0 (see the note above r()). */
      _zeroMode = ZERO_UNTIL_STATEMENT && !anyBank;

      /* Cash reconcile: expected-to-bank vs cash ACTUALLY banked. Card money is deliberately excluded —
         it never passed through the branch's cash box (see the v275 note in apiFinanceDashboard). */
      var expected=Tcoll-Texp, diff=TbankCash-expected, tied=Math.abs(diff)<1;
      var chip = !anyBank
        ? '<div style="background:#f1efe8;color:#666;border-radius:8px;padding:5px 10px;font-size:12px">Bank statement not imported</div>'
        : (tied
            ? '<div style="background:#e7f6ec;color:#1a7f37;border-radius:8px;padding:5px 10px;font-weight:600;font-size:12px">Reconciled</div>'
            : '<div style="background:#FAEEDA;color:#854F0B;border-radius:8px;padding:5px 10px;font-weight:600;font-size:12px">Cash diff '+(diff>=0?'+':'')+r(diff)+' · check</div>');

      var strip = anyBank
        ? '<div class="card" style="margin-bottom:10px;padding:13px 16px">'+
            '<div style="display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap">'+
              fig('Cash deposits', r(B.cash), rows_(B.cashRows)+' · banked from the cash box', '#1a7f37')+
              op('+')+
              fig('Card settlements', r(B.card), rows_(B.cardRows)+' · gateway payouts','')+
              op('=')+
              fig('Total credits', r(B.credits),'','')+
              '<div style="flex:1"></div>'+
              fig('Debits', r(B.debits),'','')+
            '</div>'+
            '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:11px;padding-top:10px;border-top:1px solid #eee;font-size:11.5px;color:#777">'+
              '<span>Collection (cash) '+rz(Tcoll)+'</span><span style="color:#ccc">−</span>'+
              '<span>cash expenses '+rz(Texp)+'</span><span style="color:#ccc">=</span>'+
              '<span>expected to bank <b style="color:#444">'+rz(expected)+'</b></span><span style="color:#ccc">vs</span>'+
              '<span>cash actually banked <b style="color:#185FA5">'+rz(TbankCash)+'</b></span>'+
              '<div style="flex:1"></div>'+chip+
            '</div>'+
          '</div>'
        : '<div class="card" style="margin-bottom:10px;padding:11px 14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px">'+
            '<div><div style="font-size:10px;color:#888">Collection (cash)</div><div style="font-weight:600">'+rz(Tcoll)+'</div></div><span style="color:#bbb">−</span>'+
            '<div><div style="font-size:10px;color:#888">Cash expenses</div><div style="font-weight:600">'+rz(Texp)+'</div></div><span style="color:#bbb">=</span>'+
            '<div><div style="font-size:10px;color:#888">Expected to bank</div><div style="font-weight:600">'+rz(expected)+'</div></div>'+
            '<div style="flex:1"></div>'+chip+'</div>';

      /* ---- table ------------------------------------------------------------------------------- */
      var head='<tr><th>Branch</th><th>P / L</th><th>Revenue</th><th>Gross</th>'+
        cats.map(function(c){
          return catUnfiled(c)
            ? '<th style="color:#bbb;font-style:italic;font-weight:500" title="No bill filed for this category by any branch yet">'+esc(catLabel(c))+'</th>'
            : '<th>'+esc(catLabel(c))+'</th>';
        }).join('')+
        '<th>Bank actual</th></tr>';

      var mixed=0;
      var body=rows.map(function(x){
        var costs=sumCat(x), rev=n_(x.revenue), bank=x.bank||{};
        var imported=n_(bank.debitRows)>0;   // this branch has a bank statement loaded for the month

        /* P/L with no costs filed is just revenue wearing a green tick — every branch looks spectacular
           for the first week of a month, then collapses as the bills arrive. */
        var provisional=(!_zeroMode && rev!==0 && costs===0);
        /* The opposite trap, and the one the new layout creates: importing a statement drops a FULL
           month of costs next to revenue that has only been filed up to today. The P/L then reads as a
           catastrophic loss that is really just a timing mismatch. Show it, label it, never dress it up. */
        var lopsided=(!_zeroMode && imported && costs>0 && rev>0 && costs>rev*1.5);
        if(lopsided) mixed++;

        var pl;
        if(provisional)      pl='<td style="color:#999">'+r(x.net)+'<div style="font-size:9.5px;color:#bbb">no costs filed</div></td>';
        else if(lopsided)    pl='<td style="color:#854F0B;font-weight:600">'+r(x.net)+'<div style="font-size:9.5px;color:#a98b52">full-month costs vs part-month revenue</div></td>';
        else                 pl='<td style="font-weight:700;color:'+(x.net>=0?'#1a7f37':'#DA1017')+'">'+rz(x.net)+'</td>';

        return '<tr><td><b>'+esc(x.branchName)+'</b></td>'+pl+
          '<td style="color:#1a7f37">'+rz(x.revenue)+'</td>'+
          '<td>'+rz(x.gross)+'</td>'+
          cats.map(function(c){
            var v=n_(x.cat&&x.cat[c]);
            /* v289: must go through rz(), not DASH directly — in zero mode this cell has to read ₹0
               like every other one, or the table ends up half zeros and half em dashes. */
            if(!v) return '<td title="Not filed yet">'+rz(0)+'</td>';
            /* Green = this figure came from the imported statement rather than a typed-in bill. */
            return '<td style="color:'+(imported?'#1a7f37':'#A32D2D')+(imported?';background:#f2faf5':'')+'">'+r(v)+'</td>';
          }).join('')+
          '<td style="color:'+(n_(x.bankActual)?'#185FA5':'#ccc')+';font-weight:'+(n_(x.bankActual)?'600':'400')+'">'+rz(x.bankActual)+'</td>'+
        '</tr>';
      }).join('');

      /* ---- legend, transfers panel, notes -------------------------------------------------------- */
      /* v289: in zero mode there is nothing to explain — every cell is ₹0, so a legend describing
         em dashes and imported figures would only contradict what is on screen. The amber banner
         under the table carries the whole explanation instead. */
      var legend=_zeroMode ? '' :
        '<div style="display:flex;flex-wrap:wrap;gap:14px;font-size:11.5px;color:#777;padding:9px 3px 0">'+
          (anyBank?'<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#f2faf5;border:1px solid #cfe8d8;vertical-align:-1px"></span> from the imported statement</span>'+
                   '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#fff;border:1px solid #e6c9c9;vertical-align:-1px"></span> filed by hand</span>':'')+
          '<span><span style="color:#ccc">—</span> not filed yet (not the same as zero)</span>'+
          (unfiledCats.length?'<span><i style="color:#bbb">grey heading</i> = nothing filed by any branch</span>':'')+
        '</div>';

      var xfer = B.xfer
        ? '<div class="card" style="margin-top:10px;padding:13px 16px">'+
            '<div style="font-size:12px;color:#888;margin-bottom:7px">Excluded from P &amp; L</div>'+
            '<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">'+
              '<span style="font-size:17px;font-weight:600">'+r(B.xfer)+'</span>'+
              '<span style="font-size:12.5px;color:#888">'+rows_(B.xferRows)+' · transfers to your own group accounts</span>'+
            '</div>'+
            '<div style="font-size:11px;color:#aaa;margin-top:5px">Money moved between accounts you own is not income and not a cost, so it is kept out of every figure above.</div>'+
          '</div>'
        : '';

      var notes=[];
      /* v291 — SAY WHERE THE DATA ACTUALLY IS.
         The first version of this banner named the month with no statement and stopped there. Somebody
         imports a July statement, the dashboard is sitting on August, every figure reads ₹0, and the
         message technically explains it while answering the wrong question. A statement was imported —
         just not for the month being looked at. Now we name the months that DO have one, so the next
         step is obvious instead of looking like a failed import. */
      if(_zeroMode){
        notes.push('All figures shown as ₹0 — no bank statement has been imported for '+ymText(selYm)+'.');
        if(typeof API!=='undefined' && API.bankImports){
          API.bankImports('').then(function(bi){
            if(!bi||!bi.ok) return;
            var months={}; (bi.imports||[]).forEach(function(im){
              var p=String(im.period||''), m=(p.match(/(\d{4})-(\d{2})/)||[])[0];
              if(!m){ var d=(p.match(/(\d{2})\/(\d{2})\/(\d{4})/)||[]); if(d.length) m=d[3]+'-'+d[2]; }
              if(m && m!==selYm) months[m]=1;
            });
            var list=Object.keys(months).sort();
            if(!list.length) return;
            var el=document.getElementById('finZeroHint'); if(!el) return;
            el.innerHTML=' A statement <b>has</b> been imported for '+list.map(ymText).map(esc).join(', ')+
              ' — change the month at the top of the dashboard to see those figures.';
          }).catch(function(){});
        }
      }
      if(!_zeroMode && hiddenNames.length)   notes.push(hiddenNames.length+' branch'+(hiddenNames.length===1?'':'es')+' with nothing filed hidden ('+hiddenNames.join(', ')+')');
      /* Doubles as the chase-list: these are the bills nobody anywhere has filed for this month yet. */
      if(!_zeroMode && unfiledCats.length)   notes.push('still to be filed by everyone: '+unfiledCats.map(catLabel).join(', '));
      if(mixed)              notes.push(mixed+' branch'+(mixed===1?' has':'es have')+' a full month of imported costs against part-month revenue — that P/L is a timing mismatch, not a real loss');
      var note=notes.length
        ? (_zeroMode
            ? '<div style="font-size:11.5px;color:#854F0B;background:#FAEEDA;border-radius:8px;padding:8px 12px;margin-top:9px">'+esc(notes.join(' · '))+'<span id="finZeroHint"></span></div>'
            : '<div style="font-size:11px;color:#aaa;padding:7px 3px 0">'+esc(notes.join(' · '))+'</div>')
        : '';

      host.innerHTML='<div class="section-label">Finance · '+esc(ymText(selYm))+' · by branch</div>'+strip+
        '<div class="card"><div class="table-wrap swipe"><table><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>'+legend+note+'</div>'+xfer;
    }).catch(function(){ host.innerHTML=''; });
  };
})();
