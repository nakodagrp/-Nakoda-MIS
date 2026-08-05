/* ============================================================
 *  BANK STATEMENT TABLE  (v294)
 *  window.renderStatementTable(host, branch)
 *
 *  WHAT THIS IS. Only money that moved through the bank. No revenue, no gross, no P/L, nothing from
 *  daily entry. Every figure on it comes from one place — the imported statement — so it cannot be
 *  wrong the way the P/L table can. The P/L table mixes a FULL month of bank costs with daily entry
 *  filed only up to today; this one has nothing to mix.
 *
 *  It also makes the thing that actually matters visible: of everything that left the account, how
 *  little is a real cost. On the July PAL statement only ₹97,206 of ₹3,06,843 belongs in a P&L. The
 *  rest is salary and petrol that payroll already counts, transfers between your own accounts, and
 *  rows nobody has categorised. Counting any of it twice is how a branch looks like it is losing money.
 *
 *  Reads the ledger through the existing listLedger endpoint. No new API, no server change.
 * ============================================================ */
(function(){
  var CASHDEP='Cash deposit', CARD='Card settlement', TRANSFER='Inter-branch transfer', UNCAT='Uncategorised';

  function ym(){
    if(window.dashYm) return window.dashYm();
    var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function ymText(s){
    var M=['January','February','March','April','May','June','July','August','September','October','November','December'];
    var m=Number(String(s).slice(5,7)); return (M[m-1]||String(s))+' '+String(s).slice(0,4);
  }
  function r(n){ return '₹'+Math.round(Math.abs(n||0)).toLocaleString('en-IN'); }
  function n_(v){ return Number(v)||0; }
  function rows_(n){ return n+' row'+(n===1?'':'s'); }
  var SHORT={'Material Purchased':'Material','Outsourced Services':'Outsourced','Professional fees':'Prof. fees',
             'Miscellaneous':'Misc','Light bill':'Light','Management cost':'Mgmt','Software cost':'Software',
             'Monthly software expense':'Software exp'};
  function short(c){ return SHORT[c]||c; }

  function branchName(id){
    try{
      var b=((window.S&&S.meta&&S.meta.branches)||[]).filter(function(x){ return String(x.BranchID)===String(id); })[0];
      return (b&&b.BranchName)||String(id);
    }catch(e){ return String(id); }
  }

  /* A row is HELD when the statement recorded it but no total should count it:
       · (bank-paid)  -> payroll or field claims already own that money
       · Uncategorised -> nobody has said what it was
       · pending       -> waiting on a decision
     Held money is real and it left the account. It just must not reach a P&L twice. */
  function heldKind(x){
    var c=String(x.category||'');
    if(/\(bank-paid\)$/.test(c)) return /petrol/i.test(c) ? 'petrol' : 'payroll';
    if(c===UNCAT || !c) return 'norule';
    if(String(x.status)!=='approved') return 'norule';
    return '';
  }

  window.renderStatementTable=function(host, branch){
    if(!host) return;
    var perm=window.S&&S.perms, role=(window.S&&S.user&&S.user.Role)||'';
    var ok=perm&&(perm.canViewAll||perm.level==='BRANCH_MGR'||['Accounts','Operations Manager','Director'].indexOf(role)>=0);
    if(!ok){ host.innerHTML=''; return; }
    var selYm=ym();

    API.listLedger(branch||'', selYm).then(function(res){
      if(!res||!res.ok){ host.innerHTML=''; return; }
      var led=(res.ledger||[]).filter(function(x){ return String(x.source)==='bank'; });
      if(!led.length){ host.innerHTML=''; return; }   // no statement for this month — say nothing at all

      var B={}, costCats={};
      led.forEach(function(x){
        var id=String(x.branchId||''), a=Math.abs(n_(x.amount)), t=String(x.type||''), c=String(x.category||'');
        var b=B[id]||(B[id]={cash:0,cashN:0,card:0,cardN:0,credits:0,creditsN:0,debits:0,debitsN:0,
                             cost:{}, counted:0, payroll:0, petrol:0, norule:0, xfer:0, xferN:0});
        if(t==='income'){
          b.credits+=a; b.creditsN++;
          if(c===CASHDEP){ b.cash+=a; b.cashN++; }
          else if(c===CARD){ b.card+=a; b.cardN++; }
          return;
        }
        b.debits+=a; b.debitsN++;                       // matches the server: expenses AND transfers are debits
        if(t==='transfer' || c===TRANSFER){ b.xfer+=a; b.xferN++; return; }
        var hk=heldKind(x);
        if(hk){ b[hk]+=a; return; }
        b.cost[c]=(b.cost[c]||0)+a; b.counted+=a; costCats[c]=1;
      });

      var ids=Object.keys(B).sort(function(a,b){ return B[b].debits-B[a].debits; });
      var cats=Object.keys(costCats).sort();

      /* Company totals, and the check that matters: counted + held must equal debits, to the rupee. */
      var T={cash:0,card:0,credits:0,debits:0,counted:0,payroll:0,petrol:0,norule:0,xfer:0};
      ids.forEach(function(id){ var b=B[id];
        T.cash+=b.cash; T.card+=b.card; T.credits+=b.credits; T.debits+=b.debits;
        T.counted+=b.counted; T.payroll+=b.payroll; T.petrol+=b.petrol; T.norule+=b.norule; T.xfer+=b.xfer; });
      var held=T.payroll+T.petrol+T.norule+T.xfer;
      var gap=T.debits-T.counted-held;
      var creditGap=T.credits-T.cash-T.card;

      var TH='text-align:right;padding:9px 10px;font-weight:600;color:#888;font-size:10px;letter-spacing:.04em;text-transform:uppercase;';
      var TD='padding:11px 10px;text-align:right;';
      var IN='background:#e7f6ec;color:#1a7f37;font-weight:600;';
      var COST='background:#fdecec;color:#b23b3b;font-weight:600;';
      var HELD='background:#FAEEDA;color:#854F0B;';

      var head='<tr><th style="text-align:left;padding:9px 13px;font-weight:600;color:#888;font-size:10px;text-transform:uppercase">Branch</th>'+
        ['Cash deposits','Card settlements','Total credits','Debits'].map(function(h){ return '<th style="'+TH+'">'+h+'</th>'; }).join('')+
        cats.map(function(c){ return '<th style="'+TH+'">'+esc(short(c))+'</th>'; }).join('')+
        ['Held · payroll','Held · petrol','Held · no rule','Own transfers'].map(function(h){ return '<th style="'+TH+'">'+h+'</th>'; }).join('')+
        '</tr>';

      function cell(v,style,sub){
        if(!v) return '<td style="'+TD+'color:#ccc">—</td>';
        return '<td style="'+TD+style+'">'+r(v)+(sub?'<div style="font-size:9px;font-weight:400;opacity:.75">'+sub+'</div>':'')+'</td>';
      }
      var body=ids.map(function(id){
        var b=B[id];
        return '<tr><td style="padding:11px 13px;font-weight:700">'+esc(branchName(id))+'</td>'+
          cell(b.cash,IN,rows_(b.cashN))+cell(b.card,IN,rows_(b.cardN))+
          cell(b.credits,IN,rows_(b.creditsN))+cell(b.debits,'font-weight:600;',rows_(b.debitsN))+
          cats.map(function(c){ return cell(b.cost[c],COST,''); }).join('')+
          cell(b.payroll,HELD,'payroll owns it')+cell(b.petrol,HELD,'claims own it')+
          cell(b.norule,HELD,'needs a decision')+cell(b.xfer,HELD,rows_(b.xferN))+
        '</tr>';
      }).join('');

      var pct=T.debits?Math.round(T.counted*100/T.debits):0;
      var check='<div style="border-radius:9px;padding:10px 13px;margin-top:10px;font-size:12px;line-height:1.6;'+
        (Math.abs(gap)<1?'background:#e7f6ec;color:#12692c':'background:#fdecec;color:#8f2d2d')+'">'+
        '<b>'+(Math.abs(gap)<1?'Every rupee accounted for.':'⚠ '+r(gap)+' unaccounted for.')+'</b> '+
        'counted '+r(T.counted)+' + held '+r(held)+' = '+r(T.counted+held)+' vs debits '+r(T.debits)+'.<br>'+
        'Only '+r(T.counted)+' ('+pct+'%) of what left the account is a cost the P&amp;L should carry.'+
        (Math.abs(creditGap)>=1
          ? '<br><b>⚠ '+r(creditGap)+' of credit is in neither Cash deposit nor Card settlement</b> — the cash reconcile cannot work until those rows are recategorised.'
          : '')+
        '</div>';

      host.innerHTML='<div class="section-label">Bank statement · '+esc(ymText(selYm))+' · what actually moved</div>'+
        '<div class="card"><div style="font-size:11.5px;color:#888;padding:2px 3px 9px">Only money through the bank — no revenue, no gross, no P/L, nothing from daily entry.</div>'+
        '<div class="table-wrap swipe"><table>'+
          '<thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>'+check+
        '<div style="display:flex;flex-wrap:wrap;gap:13px;font-size:11px;color:#777;padding:9px 3px 0">'+
          '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#e7f6ec;border:1px solid #cfe8d8;vertical-align:-1px"></span> money in</span>'+
          '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#fdecec;border:1px solid #f0cfcf;vertical-align:-1px"></span> counted as a cost</span>'+
          '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#FAEEDA;border:1px solid #eddcb8;vertical-align:-1px"></span> held — counted nowhere</span>'+
          '<span><span style="color:#ccc">—</span> nothing</span>'+
        '</div></div>';
    }).catch(function(){ host.innerHTML=''; });
  };
})();
