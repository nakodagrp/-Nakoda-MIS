/* ============================================================================
 *  Nakoda MIS — Purchase (front end)
 *    Replaces the Indents view with a richer one:
 *      · filter chips, including "My requests" for branch staff
 *      · Give order popup   — vendor, rates, expected date, PO, message, reject
 *      · Receive popup      — lot, expiry, short delivery, delivery note
 *      · Submit bill popup  — goes to Payment Requests, not straight to accounts
 *
 *  Self-contained: does not modify api.js, app.js or inventory.js internals.
 *  inventory.js calls window.renderPUIndents if this file is present and falls
 *  back to its own original view if it is not.
 * ==========================================================================*/
(function(){
  function $id(i){ return document.getElementById(i); }
  function n(v){ return Number(v) || 0; }
  function money(v){ return Math.round(n(v)).toLocaleString('en-IN'); }
  function today(){ return new Date().toISOString().slice(0,10); }

  var PU = { branch:'', filter:'all', list:[], items:[], vendors:[], canManage:false, canUse:false, canBill:false, me:'' };

  var STAGES = [['raised','Raised'],['given','Given'],['received','Received'],['billed','Bill'],['paid','Pay']];

  function call(action, payload){
    if(!navigator.onLine) return Promise.resolve({ok:false, error:'You are offline. Purchase actions need a connection.'});
    var url = (window.NAKODA_CONFIG && window.NAKODA_CONFIG.API_URL) || '';
    var body = JSON.stringify(Object.assign({action:action, token:(window.API && API.getToken && API.getToken()) || ''}, payload||{}));
    return fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:body,redirect:'follow'})
      .then(function(r){ return r.json(); })
      .catch(function(){ return {ok:false, error:'Could not reach the server.'}; });
  }

  function upload(file, sub){
    return new Promise(function(res){
      if(file.size > 8*1024*1024){ toast('File too large (max 8MB)', true); return res(''); }
      var fr = new FileReader();
      fr.onload = function(){
        var d = fr.result, i = d.indexOf(',');
        API.uploadFile({base64:d.slice(i+1), fileName:file.name, mimeType:file.type, subPath:sub||'Purchase'})
          .then(function(r){ res(r && r.ok ? r.url : ''); }, function(){ res(''); });
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------------------------------------------------------------- list */

  window.renderPUIndents = function(box, branch){
    if(!box) return;
    PU.branch = branch || '';
    box.innerHTML = '<div class="center-load"><span class="loader dark"></span> Loading…</div>';
    Promise.all([call('puMeta',{}), call('puList',{branch:PU.branch})]).then(function(r){
      var m = r[0], l = r[1];
      if(!l || !l.ok){ box.innerHTML = '<div class="empty">' + esc((l && l.error) || 'Could not load.') + '</div>'; return; }
      if(m && m.ok){ PU.items = m.items||[]; PU.vendors = m.vendors||[]; }
      PU.list = l.indents||[]; PU.canManage = !!l.canManage; PU.canUse = !!l.canUse; PU.canBill = !!l.canBill; PU.me = l.me||'';
      paint(box);
    });
  };

  function reload(box){ window.renderPUIndents(box, PU.branch); }

  function match(ind){
    if(PU.filter === 'mine')  return String(ind.raisedBy) === String(PU.me);
    if(PU.filter === 'todo')  return actionFor(ind).show;
    if(PU.filter === 'stuck') return !!ind.stuck;
    if(PU.filter === 'open')  return ['raised','given','received','billed'].indexOf(ind.stage) >= 0;
    return true;
  }

  function paint(box){
    var rows = PU.list.filter(match);
    var counts = {
      all:PU.list.length,
      open:PU.list.filter(function(x){ return ['raised','given','received','billed'].indexOf(x.stage) >= 0; }).length,
      todo:PU.list.filter(function(x){ return actionFor(x).show; }).length,
      mine:PU.list.filter(function(x){ return String(x.raisedBy) === String(PU.me); }).length,
      stuck:PU.list.filter(function(x){ return !!x.stuck; }).length
    };
    var chips = [['todo','Waiting on me'],['open','In progress'],['mine','My requests'],['stuck','Taking too long'],['all','All']];

    box.innerHTML =
      (PU.canUse ? '<div class="fin-actions"><button class="btn" id="puAdd">+ Raise request</button></div>' : '') +
      '<div class="pm2-tabs sub" id="puChips" style="margin-bottom:10px">' +
        chips.map(function(c){
          return '<span data-f="' + c[0] + '"' + (PU.filter === c[0] ? ' class="on"' : '') + '>' +
                 c[1] + ' (' + (counts[c[0]]||0) + ')</span>';
        }).join('') +
      '</div>' +
      (rows.length ? rows.map(card).join('') : '<div class="empty">Nothing here.</div>');

    var a = $id('puAdd'); if(a) a.onclick = function(){ openRaise(box); };
    box.querySelectorAll('#puChips span').forEach(function(s){
      s.onclick = function(){ PU.filter = s.getAttribute('data-f'); paint(box); };
    });
    rows.forEach(function(ind){
      var b1 = $id('pu_act_' + ind.indentId);
      if(b1) b1.onclick = function(){ doAction(ind, box); };
      var b2 = $id('pu_rej_' + ind.indentId);
      if(b2) b2.onclick = function(){ openReject(ind, box); };
    });
  }

  /* which button this row shows, and to whom */
  function actionFor(ind){
    if(ind.stage === 'raised')   return {show:PU.canManage, label:'Give order'};
    if(ind.stage === 'given')    return {show:PU.canUse,    label:'Receive'};
    if(ind.stage === 'received') return {show:PU.canBill && ind.source === 'vendor', label:'Submit bill'};
    if(ind.stage === 'billed')   return {show:false,        label:''};
    return {show:false, label:''};
  }

  function card(ind){
    var act = actionFor(ind);
    var rejected = ind.stage === 'rejected';
    var steps = rejected
      ? '<span class="ind-step" style="color:#c62828;border-color:#c62828">Rejected</span>'
      : STAGES.map(function(s){
          var here = STAGES.findIndex(function(x){ return x[0] === ind.stage; });
          var mine = STAGES.findIndex(function(x){ return x[0] === s[0]; });
          return '<span class="ind-step' + (here >= mine ? ' on' : '') + '">' + s[1] + '</span>';
        }).join('<span class="ind-arr">›</span>');

    var extra = [];
    if(ind.vendorName)  extra.push(esc(ind.vendorName));
    if(ind.expectedDate) extra.push('expected ' + esc(ind.expectedDate));
    if(ind.poNo)        extra.push('PO ' + esc(ind.poNo));
    if(ind.bill)        extra.push('bill ' + esc(ind.bill.billNo) + ' ₹' + money(ind.bill.amount));
    if(ind.payNumber)   extra.push(esc(ind.payNumber));

    var warn = '';
    if(rejected) warn = '<div class="msg error" style="margin:6px 0">Turned down' +
        (ind.rejectedByName ? ' by ' + esc(ind.rejectedByName) : '') +
        (ind.rejectReason ? ' — "' + esc(ind.rejectReason) + '"' : '') + '</div>';
    else if(ind.stuck) warn = '<div class="msg" style="margin:6px 0;border-color:#c47f00;color:#8a5a00">Waiting ' +
        ind.daysAtStage + ' days at this stage</div>';
    else if(ind.msgToBranch && ind.stage === 'given')
      warn = '<div class="msg" style="margin:6px 0">Note from Logistics: "' + esc(ind.msgToBranch) + '"</div>';
    else if(ind.payStatus){
      var PS = {
        pending  : ['#c47f00', 'Bill sent — waiting for Accounts to approve'],
        approved : ['#c47f00', 'Approved by Accounts — payment not made yet'],
        paid     : ['#2e7d32', 'Paid'],
        rejected : ['#c62828', 'Accounts rejected this bill'],
        cancelled: ['#c62828', 'Payment request cancelled']
      }[ind.payStatus];
      if(PS) warn = '<div class="msg" style="margin:6px 0;border-color:' + PS[0] + ';color:' + PS[0] + '">' +
                    PS[1] + ' · open Payment Requests</div>';
    }

    var partial = ind.items.filter(function(i){ return i.received > 0 && i.received < i.qty; }).length;

    var buttons = '';
    if(act.show) buttons += '<button class="btn sm" id="pu_act_' + ind.indentId + '">' + act.label + '</button>';
    if(ind.stage === 'raised' && PU.canManage)
      buttons = '<button class="btn ghost sm" id="pu_rej_' + ind.indentId + '">Reject</button> ' + buttons;

    return '<div class="ind-card">' +
      '<div class="ind-h"><b>' + esc(ind.indentId) + '</b> · ' + esc(ind.branchName) + ' · ' + esc(ind.source) +
        (ind.total ? ' · ₹' + money(ind.total) : '') +
        (buttons ? '<span style="margin-left:auto">' + buttons + '</span>' : '') + '</div>' +
      '<div class="ind-items">' + ind.items.map(function(it){
          return esc(it.name) + ' ×' + it.qty + (it.received ? ' <span style="color:#2e7d32">(got ' + it.received + ')</span>' : '');
        }).join(' · ') + '</div>' +
      (extra.length ? '<div class="ind-items" style="color:#888">' + extra.join(' · ') + '</div>' : '') +
      (partial ? '<div class="ind-items" style="color:#c47f00">' + partial + ' item(s) part-delivered — balance still on order</div>' : '') +
      warn +
      '<div class="ind-flow">' + steps + '</div>' +
      '<div class="ind-items" style="color:#aaa;font-size:11px">raised by ' + esc(ind.raisedByName || '—') +
        (ind.notes ? ' · "' + esc(ind.notes) + '"' : '') + '</div>' +
      '</div>';
  }

  function doAction(ind, box){
    if(ind.stage === 'raised')   return openGive(ind, box);
    if(ind.stage === 'given')    return openReceive(ind, box);
    if(ind.stage === 'received') return openBill(ind, box);
  }

  /* --------------------------------------------------------------- raise */

  function openRaise(box){
    var lines = [{itemId:'', qty:1}];
    var opts = PU.items.map(function(i){ return '<option value="' + esc(i.itemId) + '">' + esc(i.name) + (i.unit ? ' (' + esc(i.unit) + ')' : '') + '</option>'; }).join('');

    openModal('Raise request',
      '<div class="field"><label>Get it from</label><div class="seg" id="puSrc">' +
        '<div data-s="vendor" class="on">Vendor</div><div data-s="warehouse">Corporate warehouse</div></div></div>' +
      '<div class="field"><label>Items</label><div id="puLines"></div>' +
        '<select class="in" id="puPick"><option value="">+ add an item…</option>' + opts + '</select></div>' +
      '<div class="field"><button type="button" class="btn ghost sm" id="puLow">Add everything that is running low</button></div>' +
      '<div class="field"><label>Note (optional)</label><input class="in" id="puNote" placeholder="e.g. need before Monday"></div>' +
      '<div id="puMsg"></div>',
      '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="puSend">Send request</button>');

    function draw(){
      $id('puLines').innerHTML = lines.filter(function(l){ return l.itemId; }).length || lines.length > 1
        ? lines.map(function(l,i){
            var it = PU.items.filter(function(x){ return x.itemId === l.itemId; })[0];
            if(!l.itemId) return '';
            return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">' +
              '<span style="flex:1">' + esc(it ? it.name : l.itemId) + '</span>' +
              '<input class="in" data-q="' + i + '" type="number" min="0" step="any" value="' + l.qty + '" style="max-width:90px">' +
              '<span style="width:44px;color:#888;font-size:12px">' + esc(it ? (it.unit||'') : '') + '</span>' +
              '<button class="iconbtn" data-rm="' + i + '">&times;</button></div>';
          }).join('')
        : '<div style="color:#888;font-size:12px;margin-bottom:6px">No items yet.</div>';
      $id('puLines').querySelectorAll('[data-q]').forEach(function(el){
        el.onchange = function(){ lines[+el.getAttribute('data-q')].qty = n(this.value); };
      });
      $id('puLines').querySelectorAll('[data-rm]').forEach(function(el){
        el.onclick = function(){ lines.splice(+el.getAttribute('data-rm'),1); if(!lines.length) lines=[{itemId:'',qty:1}]; draw(); };
      });
    }
    draw();

    $id('puPick').onchange = function(){
      if(!this.value) return;
      if(!lines.filter(function(l){ return l.itemId === this.value; }, this).length) lines.push({itemId:this.value, qty:1});
      this.value = ''; draw();
    };
    $id('puLow').onclick = function(){
      var b = this; b.disabled = true; b.textContent = 'Checking…';
      call('puLowStock',{branch:PU.branch}).then(function(r){
        b.disabled = false; b.textContent = 'Add everything that is running low';
        if(!r || !r.ok) return toast((r && r.error) || 'Failed', true);
        if(!(r.rows||[]).length) return toast('Nothing is below its reorder level');
        r.rows.forEach(function(x){
          var ex = lines.filter(function(l){ return l.itemId === x.itemId; })[0];
          if(ex) ex.qty = x.suggest; else lines.push({itemId:x.itemId, qty:x.suggest});
        });
        draw(); toast(r.rows.length + ' item(s) added');
      });
    };
    document.querySelectorAll('#puSrc div').forEach(function(d){
      d.onclick = function(){ document.querySelectorAll('#puSrc div').forEach(function(z){ z.classList.remove('on'); }); d.classList.add('on'); };
    });

    $id('puSend').onclick = function(){
      var items = lines.filter(function(l){ return l.itemId && l.qty > 0; }).map(function(l){
        var it = PU.items.filter(function(x){ return x.itemId === l.itemId; })[0];
        return {itemId:l.itemId, name:it ? it.name : '', qty:l.qty};
      });
      if(!items.length){ $id('puMsg').innerHTML = '<div class="msg error">Add at least one item.</div>'; return; }
      this.disabled = true;
      call('puRaise',{data:{branchId:PU.branch, source:document.querySelector('#puSrc .on').getAttribute('data-s'),
                           items:items, notes:$id('puNote').value}}).then(function(r){
        if(!r || !r.ok){ $id('puSend').disabled = false; $id('puMsg').innerHTML = '<div class="msg error">' + esc((r && r.error) || 'Failed') + '</div>'; return; }
        closeModal(); toast('Sent to Logistics'); reload(box);
      });
    };
  }

  /* ---------------------------------------------------------------- give */

  function openGive(ind, box){
    var items = ind.items.map(function(i){ return {itemId:i.itemId, name:i.name, qty:i.qty, rate:i.rate}; });
    var vopts = PU.vendors.map(function(v){ return '<option value="' + esc(v.vendorId) + '">' + esc(v.name) + '</option>'; }).join('');

    openModal('Give order — ' + ind.indentId,
      '<div style="font-size:12px;color:#888;margin-bottom:10px">Raised by ' + esc(ind.raisedByName||'—') +
        (ind.notes ? ' · "' + esc(ind.notes) + '"' : '') + '</div>' +
      '<div class="field"><label>Fulfil from</label><div class="seg" id="gvSrc2">' +
        '<div data-s="vendor"' + (ind.source !== 'warehouse' ? ' class="on"' : '') + '>Vendor</div>' +
        '<div data-s="warehouse"' + (ind.source === 'warehouse' ? ' class="on"' : '') + '>Warehouse</div></div></div>' +
      '<div class="field" id="gvVenWrap2"><label>Vendor</label><select class="in" id="gvVen2">' + vopts + '</select></div>' +
      '<div class="grid2">' +
        '<div class="field"><label>Expected delivery</label><input class="in" id="gvExp" type="date"></div>' +
        '<div class="field"><label>PO / order no.</label><input class="in" id="gvPo" placeholder="optional"></div>' +
      '</div>' +
      '<div class="field"><label>Items &amp; rates</label><div id="gvLines"></div>' +
        '<div style="text-align:right;font-weight:700;margin-top:6px" id="gvTot">Order value ₹0</div></div>' +
      '<div class="field"><label>Message to the branch</label><input class="in" id="gvMsg2" placeholder="e.g. arriving Friday"></div>' +
      '<div id="gvErr"></div>',
      '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="gvGo">Give order</button>');

    function drawLines(){
      $id('gvLines').innerHTML = items.map(function(it,i){
        return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">' +
          '<span style="flex:1">' + esc(it.name) + '</span>' +
          '<span style="width:60px;color:#888;font-size:12px">×' + it.qty + '</span>' +
          '<input class="in" data-r="' + i + '" type="number" min="0" step="any" value="' + it.rate + '" style="max-width:100px" placeholder="rate">' +
          '<span style="width:80px;text-align:right" data-t="' + i + '">₹' + money(it.qty * it.rate) + '</span></div>';
      }).join('');
      $id('gvLines').querySelectorAll('[data-r]').forEach(function(el){
        el.oninput = function(){
          var i = +el.getAttribute('data-r');
          items[i].rate = n(this.value);
          $id('gvLines').querySelector('[data-t="' + i + '"]').textContent = '₹' + money(items[i].qty * items[i].rate);
          total();
        };
      });
      total();
    }
    function total(){
      var t = items.reduce(function(s,i){ return s + i.qty * i.rate; }, 0);
      $id('gvTot').textContent = 'Order value ₹' + money(t);
    }
    drawLines();

    document.querySelectorAll('#gvSrc2 div').forEach(function(d){
      d.onclick = function(){
        document.querySelectorAll('#gvSrc2 div').forEach(function(z){ z.classList.remove('on'); });
        d.classList.add('on');
        $id('gvVenWrap2').style.display = d.getAttribute('data-s') === 'vendor' ? '' : 'none';
      };
    });

    $id('gvGo').onclick = function(){
      var src = document.querySelector('#gvSrc2 .on').getAttribute('data-s');
      var vsel = $id('gvVen2');
      if(src === 'vendor' && !vsel.value){ $id('gvErr').innerHTML = '<div class="msg error">Pick a vendor.</div>'; return; }
      this.disabled = true;
      call('puGive',{indentId:ind.indentId, data:{
        source:src, vendorId:(src === 'vendor' ? vsel.value : ''),
        vendorName:(src === 'vendor' ? (vsel.options[vsel.selectedIndex]||{}).text : ''),
        items:items, expectedDate:$id('gvExp').value, poNo:$id('gvPo').value, msgToBranch:$id('gvMsg2').value
      }}).then(function(r){
        if(!r || !r.ok){ $id('gvGo').disabled = false; $id('gvErr').innerHTML = '<div class="msg error">' + esc((r && r.error) || 'Failed') + '</div>'; return; }
        closeModal(); toast('Order given — branch told'); reload(box);
      });
    };
  }

  /* -------------------------------------------------------------- reject */

  function openReject(ind, box){
    openModal('Reject request — ' + ind.indentId,
      '<div class="field"><label>Why? The branch will see this.</label>' +
        '<input class="in" id="rjWhy" placeholder="e.g. warehouse has 40 boxes — use those first"></div><div id="rjErr"></div>',
      '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="rjGo">Reject request</button>');
    $id('rjGo').onclick = function(){
      var why = $id('rjWhy').value.trim();
      if(!why){ $id('rjErr').innerHTML = '<div class="msg error">Please give a reason.</div>'; return; }
      this.disabled = true;
      call('puReject',{indentId:ind.indentId, reason:why}).then(function(r){
        if(!r || !r.ok){ $id('rjGo').disabled = false; $id('rjErr').innerHTML = '<div class="msg error">' + esc((r && r.error) || 'Failed') + '</div>'; return; }
        closeModal(); toast('Rejected — branch told why'); reload(box);
      });
    };
  }

  /* ------------------------------------------------------------- receive */

  function openReceive(ind, box){
    var lines = ind.items.map(function(i){
      return {itemId:i.itemId, name:i.name, ordered:i.qty, already:i.received,
              qty:Math.max(0, i.qty - i.received), lot:'', expiry:''};
    });
    var challan = '';

    openModal('Receive — ' + ind.indentId,
      '<div style="font-size:12px;color:#888;margin-bottom:10px">' + esc(ind.vendorName || ind.source) +
        (ind.expectedDate ? ' · expected ' + esc(ind.expectedDate) : '') + '</div>' +
      '<div id="rcLines"></div>' +
      '<div class="field"><label><input type="checkbox" id="rcShort" checked> If less arrived, keep the balance on order</label></div>' +
      '<div class="field"><label>Delivery note / challan photo</label>' +
        '<input type="file" id="rcFile" accept="image/*,application/pdf"><div id="rcFileSt" style="font-size:12px;color:#888"></div></div>' +
      '<div id="rcErr"></div>',
      '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="rcGo">Confirm receipt → stock in</button>');

    function draw(){
      $id('rcLines').innerHTML = lines.map(function(l,i){
        return '<div style="border:1px solid #e3e3e3;border-radius:8px;padding:8px;margin-bottom:8px">' +
          '<div style="display:flex;gap:8px;align-items:center">' +
            '<span style="flex:1"><b>' + esc(l.name) + '</b>' +
            '<span style="color:#888;font-size:12px"> ordered ' + l.ordered + (l.already ? ' · already got ' + l.already : '') + '</span></span>' +
            '<input class="in" data-q="' + i + '" type="number" min="0" step="any" value="' + l.qty + '" style="max-width:90px">' +
          '</div>' +
          '<div style="display:flex;gap:8px;margin-top:6px">' +
            '<input class="in" data-lot="' + i + '" placeholder="Lot no. (optional)" value="' + esc(l.lot) + '" style="flex:1">' +
            '<input class="in" data-exp="' + i + '" type="date" value="' + esc(l.expiry) + '" style="flex:1" title="Expiry date">' +
          '</div></div>';
      }).join('');
      $id('rcLines').querySelectorAll('[data-q]').forEach(function(el){ el.onchange = function(){ lines[+el.getAttribute('data-q')].qty = n(this.value); }; });
      $id('rcLines').querySelectorAll('[data-lot]').forEach(function(el){ el.oninput = function(){ lines[+el.getAttribute('data-lot')].lot = this.value; }; });
      $id('rcLines').querySelectorAll('[data-exp]').forEach(function(el){ el.onchange = function(){ lines[+el.getAttribute('data-exp')].expiry = this.value; }; });
    }
    draw();

    $id('rcFile').onchange = function(){
      var f = this.files[0]; if(!f) return;
      $id('rcFileSt').textContent = 'Uploading…';
      upload(f, 'Purchase/' + ind.indentId).then(function(u){
        challan = u;
        $id('rcFileSt').textContent = u ? '✓ ' + f.name : 'Upload failed — tap to retry';
      });
    };

    $id('rcGo').onclick = function(){
      var send = lines.filter(function(l){ return l.qty > 0; });
      if(!send.length){ $id('rcErr').innerHTML = '<div class="msg error">Enter at least one quantity.</div>'; return; }
      this.disabled = true;
      call('puReceive',{indentId:ind.indentId, data:{
        lines:send.map(function(l){ return {itemId:l.itemId, name:l.name, qty:l.qty, lot:l.lot, expiry:l.expiry}; }),
        keepShort:$id('rcShort').checked, challanUrl:challan
      }}).then(function(r){
        if(!r || !r.ok){ $id('rcGo').disabled = false; $id('rcErr').innerHTML = '<div class="msg error">' + esc((r && r.error) || 'Failed') + '</div>'; return; }
        closeModal();
        toast(r.complete ? 'Received · stock updated' : 'Part received · balance still on order');
        reload(box);
      });
    };
  }

  /* ---------------------------------------------------------------- bill */

  function openBill(ind, box){
    var file = '';
    openModal('Submit bill — ' + ind.indentId,
      '<div style="font-size:12px;color:#888;margin-bottom:10px">' + esc(ind.vendorName || 'Vendor') +
        ' · order value ₹' + money(ind.total) + '</div>' +
      '<div class="grid2">' +
        '<div class="field"><label>Bill no.</label><input class="in" id="blNo"></div>' +
        '<div class="field"><label>Bill date</label><input class="in" id="blDate" type="date" value="' + today() + '"></div>' +
        '<div class="field"><label>Bill amount</label><input class="in" id="blAmt" type="number" min="0" step="any" value="' + n(ind.total) + '"></div>' +
        '<div class="field"><label>Of which GST</label><input class="in" id="blGst" type="number" min="0" step="any" value="0"></div>' +
        '<div class="field"><label>Pay by</label><input class="in" id="blDue" type="date"></div>' +
      '</div>' +
      '<div id="blDiff"></div>' +
      '<div class="field"><label>Bill photo / PDF</label>' +
        '<input type="file" id="blFile" accept="image/*,application/pdf"><div id="blFileSt" style="font-size:12px;color:#888"></div></div>' +
      '<div class="legend">This creates a Payment Request. The money only reaches accounts once it is approved there.</div>' +
      '<div id="blErr"></div>',
      '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="blGo">Send for approval</button>');

    function diff(){
      var a = n($id('blAmt').value), o = n(ind.total), d = a - o;
      $id('blDiff').innerHTML = (o > 0 && Math.abs(d) > 0.5)
        ? '<div class="msg" style="border-color:#c47f00;color:#8a5a00">Bill is ₹' + money(Math.abs(d)) +
          (d > 0 ? ' MORE' : ' less') + ' than the agreed order of ₹' + money(o) + ' — check before sending.</div>'
        : '';
    }
    $id('blAmt').oninput = diff;

    $id('blFile').onchange = function(){
      var f = this.files[0]; if(!f) return;
      $id('blFileSt').textContent = 'Uploading…';
      upload(f, 'Purchase/' + ind.indentId).then(function(u){
        file = u;
        $id('blFileSt').textContent = u ? '✓ ' + f.name : 'Upload failed — tap to retry';
      });
    };

    $id('blGo').onclick = function(){
      var no = $id('blNo').value.trim(), amt = n($id('blAmt').value);
      if(!no){ $id('blErr').innerHTML = '<div class="msg error">Enter the bill number.</div>'; return; }
      if(amt <= 0){ $id('blErr').innerHTML = '<div class="msg error">Enter the bill amount.</div>'; return; }
      this.disabled = true;
      call('puBill',{indentId:ind.indentId, data:{
        billNo:no, billDate:$id('blDate').value, dueDate:$id('blDue').value,
        amount:amt, gst:n($id('blGst').value), fileUrl:file
      }}).then(function(r){
        if(!r || !r.ok){ $id('blGo').disabled = false; $id('blErr').innerHTML = '<div class="msg error">' + esc((r && r.error) || 'Failed') + '</div>'; return; }
        closeModal(); toast('Sent to Payment Requests — ' + (r.number || '')); reload(box);
      });
    };
  }

  /* ------------------------------------------- Process Flow Monitor panel */

  window.renderPUOverdue = function(box){
    if(!box) return;
    call('puOverdue',{}).then(function(r){
      if(!r || !r.ok || !(r.overdue||[]).length){ box.innerHTML = ''; return; }
      box.innerHTML =
        '<div class="section-label">Purchase requests stuck</div>' +
        '<div class="card"><div class="table-wrap"><table><thead><tr>' +
        '<th>Indent</th><th>Branch</th><th>Stuck at</th><th>Waiting</th><th>With</th>' +
        '</tr></thead><tbody>' +
        r.overdue.map(function(o){
          return '<tr><td>' + esc(o.indentId) + '</td><td><b>' + esc(o.branchName) + '</b></td>' +
            '<td>' + esc(o.stage) + '</td>' +
            '<td style="color:#c62828;font-weight:700">' + o.days + ' days <span style="color:#aaa;font-weight:400">(target ' + o.target + ')</span></td>' +
            '<td>' + esc(o.withWho) + '</td></tr>';
        }).join('') +
        '</tbody></table></div></div>';
    });
  };
})();
