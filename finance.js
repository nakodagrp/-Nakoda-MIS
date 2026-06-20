/* ============================================================
 *  Finance section on the main dashboard — per-branch P/L,
 *  revenue split, gross, all finance-sheet categories + cash→bank reconciliation.
 *  window.renderFinDash(host, branch)
 * ============================================================ */
(function(){
  function ym(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  function r(n){ return '₹'+Math.round(n||0).toLocaleString('en-IN'); }
  window.renderFinDash=function(host,branch){
    if(!host) return;
    var perm=window.S&&S.perms, role=(window.S&&S.user&&S.user.Role)||'';
    var ok=perm&&(perm.canViewAll||perm.level==='BRANCH_MGR'||perm.level==='BRANCH_VIEW'||['Accounts','Operations Manager','Director'].indexOf(role)>=0);
    if(!ok){ host.innerHTML=''; return; }
    API.financeDashboard(ym(),branch||'').then(function(res){
      if(!res||!res.ok){ host.innerHTML=''; return; }
      var rows=res.rows||[], cats=res.categories||[];
      if(!rows.length){ host.innerHTML=''; return; }
      var Tcoll=0,Texp=0,Tbank=0; rows.forEach(function(x){ Tcoll+=x.collCash; Texp+=x.cashExp; Tbank+=x.bankActual; });
      var expected=Tcoll-Texp, diff=Tbank-expected, tied=Math.abs(diff)<1;
      var rec='<div class="card" style="margin-bottom:8px;padding:11px 14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px;">'+
        '<div><div style="font-size:10px;color:#888">Collection (cash)</div><div style="font-weight:600">'+r(Tcoll)+'</div></div><span style="color:#bbb">−</span>'+
        '<div><div style="font-size:10px;color:#888">Cash expenses</div><div style="font-weight:600">'+r(Texp)+'</div></div><span style="color:#bbb">=</span>'+
        '<div><div style="font-size:10px;color:#888">Expected to bank</div><div style="font-weight:600">'+r(expected)+'</div></div><span style="color:#bbb">vs</span>'+
        '<div><div style="font-size:10px;color:#888">Bank actual</div><div style="font-weight:600;color:#185FA5">'+r(Tbank)+'</div></div>'+
        '<div style="flex:1"></div><div style="background:'+(tied?'#e7f6ec':'#FAEEDA')+';color:'+(tied?'#1a7f37':'#854F0B')+';border-radius:8px;padding:5px 10px;font-weight:600">Diff '+(diff>=0?'+':'')+r(diff)+(tied?'':' · check')+'</div></div>';
      var head='<tr><th>Branch</th><th>P / L</th><th>Revenue</th><th>B2C</th><th>B2D</th><th>B2B</th><th>Gross</th>'+cats.map(function(c){return '<th>'+esc(c)+'</th>';}).join('')+'</tr>';
      var body=rows.map(function(x){ return '<tr><td><b>'+esc(x.branchName)+'</b></td>'+
        '<td style="font-weight:700;color:'+(x.net>=0?'#1a7f37':'#DA1017')+'">'+r(x.net)+'</td>'+
        '<td style="color:#1a7f37">'+r(x.revenue)+'</td><td>'+r(x.b2c)+'</td><td>'+r(x.b2d)+'</td><td>'+r(x.b2b)+'</td><td>'+r(x.gross)+'</td>'+
        cats.map(function(c){ return '<td style="color:#A32D2D">'+r((x.cat&&x.cat[c])||0)+'</td>'; }).join('')+'</tr>'; }).join('');
      host.innerHTML='<div class="section-label">Finance this month · by branch</div>'+rec+
        '<div class="card"><div class="table-wrap swipe"><table><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div></div>';
    }).catch(function(){ host.innerHTML=''; });
  };
})();
