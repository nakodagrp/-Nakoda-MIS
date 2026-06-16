/* Nakoda MIS — Card pricing + Card Status (loads after membership.js; reuses globals) */
(function(){
  /* ── Branch-wise pricing (Director / Operations Manager only) ──────────── */
  function openPricingModal(){
    Promise.all([API.listCardTypes(), API.listCardPrices()]).then(function(a){
      var types=(a[0].types||[]).filter(function(t){return String(t.status)!=='deleted';});
      var prices=a[1].prices||[], canSet=!!a[1].canSet;
      var branches=((S.meta&&S.meta.branches)||[]);
      var pmap={}; prices.forEach(function(p){ pmap[p.typeId+'|'+p.branchId]=p.price; });
      var head='<tr><th>Card type</th>'+branches.map(function(b){ return '<th>'+esc(b.BranchName)+'</th>'; }).join('')+'</tr>';
      var body=types.map(function(t){
        return '<tr><td><b>'+esc(t.name)+'</b></td>'+branches.map(function(b){
          var key=t.typeId+'|'+b.BranchID, v=pmap[key]!=null?pmap[key]:'';
          return '<td>'+(canSet
            ? '<input data-type="'+esc(t.typeId)+'" data-branch="'+esc(b.BranchID)+'" value="'+esc(v)+'" inputmode="numeric" style="width:78px;border:1px solid #e3e5ea;border-radius:7px;padding:6px">'
            : '<span>'+(v!==''?('₹'+esc(v)):'—')+'</span>')+'</td>';
        }).join('')+'</tr>';
      }).join('');
      var note=canSet?'<div style="font-size:12px;color:#888;margin-bottom:8px">Enter the price for each card type per branch, then Save.</div>'
                     :'<div style="font-size:12px;color:#b08900;margin-bottom:8px">View only — pricing can be set by the Director or Operations Manager.</div>';
      var content=note+'<div class="table-wrap"><table style="font-size:13px"><thead>'+head+'</thead><tbody>'+(body||'<tr><td class="empty">Add card types first.</td></tr>')+'</tbody></table></div>';
      openModal('Branch-wise Card Pricing', content,
        '<button class="btn ghost" onclick="closeModal()">Close</button>'+(canSet?'<button class="btn" id="pr_save">Save prices</button>':''));
      var sv=document.getElementById('pr_save');
      if(sv) sv.onclick=function(){
        var inputs=Array.prototype.slice.call(document.querySelectorAll('#modalRoot input[data-type]'));
        sv.disabled=true; sv.innerHTML='<span class="loader"></span> Saving…';
        var changed=inputs.filter(function(i){ return i.value!==''; });
        (function next(i){
          if(i>=changed.length){ closeModal(); toast('Prices saved'); return; }
          var el=changed[i];
          API.setCardPrice(el.getAttribute('data-type'), el.getAttribute('data-branch'), Number(el.value)||0)
            .then(function(){ next(i+1); }).catch(function(){ next(i+1); });
        })(0);
      };
    });
  }

  /* ── Card Status worklist (issued -> sent -> activated -> expired) ─────── */
  function renderCardStatus(){
    var v=document.getElementById('page-cardstatus');
    var branches=((S.meta&&S.meta.branches)||[]);
    var brOpts='<option value="">All branches</option>'+branches.map(function(b){ return '<option value="'+esc(b.BranchID)+'">'+esc(b.BranchName)+'</option>'; }).join('');
    v.innerHTML='<div class="page-head"><h1>Card Status</h1></div>'+
      '<div class="sub" style="color:#888;font-size:13px;margin-bottom:12px">Cards flow: <b>issued → sent → activated</b>. Mark a card "sent" when you share it, and "activated" once the patient confirms.</div>'+
      '<div style="margin-bottom:14px"><select id="cs_branch" class="greet-select">'+brOpts+'</select></div>'+
      '<div id="cs_counts" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px"></div>'+
      '<div id="cs_lists"></div>';
    document.getElementById('cs_branch').addEventListener('change',load);
    load();
    function load(){
      var b=document.getElementById('cs_branch').value;
      document.getElementById('cs_counts').innerHTML='<span class="loader dark"></span>';
      API.cardStatusSummary(b).then(function(r){
        if(!r.ok){ document.getElementById('cs_counts').innerHTML='<div class="empty">'+esc(r.error)+'</div>'; return; }
        var pill=function(n,label,color){ return '<div style="background:'+color+'14;border:1px solid '+color+'44;border-radius:10px;padding:10px 14px"><div style="font-size:22px;font-weight:800;color:'+color+'">'+n+'</div><div style="font-size:11.5px;color:#666">'+label+'</div></div>'; };
        document.getElementById('cs_counts').innerHTML=
          pill(r.issuedNotSent.length,'issued, not sent','#b08900')+
          pill(r.sentNotActivated.length,'sent, not activated','#185fa5')+
          pill(r.activated.length,'activated','#1a7f37')+
          pill(r.expired.length,'expired','#C0392B');
        document.getElementById('cs_lists').innerHTML=
          section('Issued — not sent yet', r.issuedNotSent, 'sent')+
          section('Sent — not activated yet', r.sentNotActivated, 'activated')+
          section('Activated', r.activated, '')+
          section('Expired', r.expired, '');
        wire();
      });
    }
    function section(title,list,action){
      if(!list.length) return '';
      return '<div class="section-label">'+esc(title)+' ('+list.length+')</div><div class="card" style="margin-bottom:16px"><div class="table-wrap"><table><tbody>'+
        list.map(function(c){
          var act=action==='sent'?'<button class="btn ghost sm" data-mark="sent" data-cn="'+esc(c.cardNumber)+'">Mark sent</button>'
                 :action==='activated'?'<button class="btn ghost sm" data-mark="activated" data-cn="'+esc(c.cardNumber)+'">Mark activated</button>':'';
          return '<tr><td><b>'+esc(c.holderName)+'</b><br><small style="color:#888">'+esc(c.cardNumber)+' · '+esc(c.mobile)+'</small></td>'+
            '<td>'+esc(c.typeId)+'</td>'+
            '<td><div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn ghost sm" data-open="'+esc(c.cardNumber)+'">View</button>'+act+'</div></td></tr>';
        }).join('')+'</tbody></table></div></div>';
    }
    function wire(){
      document.querySelectorAll('#cs_lists [data-open]').forEach(function(b){ b.onclick=function(){ window.openCardDetail(b.getAttribute('data-open')); }; });
      document.querySelectorAll('#cs_lists [data-mark]').forEach(function(b){ b.onclick=function(){
        var cn=b.getAttribute('data-cn'), mk=b.getAttribute('data-mark');
        var p=mk==='sent'?API.markCardSent(cn):API.markCardActivated(cn);
        b.disabled=true; p.then(function(r){ if(r.ok){ toast('Marked '+mk); load(); } else { toast(r.error,true); b.disabled=false; } }).catch(function(){ toast('Needs internet.',true); b.disabled=false; }); }; });
    }
  }

  window.openPricingModal=openPricingModal;
  window.renderCardStatus=renderCardStatus;
})();
