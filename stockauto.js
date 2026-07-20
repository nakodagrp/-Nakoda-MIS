/* ============================================================================
 *  Nakoda MIS — StockAuto (front end)
 *    · Recipes    — which items each test consumes  (MIS / Logistics / Admin)
 *    · Approvals  — Logistics approves the daily deduction before stock moves
 *    · Overdue    — panel for the Process Flow Monitor
 *
 *  This file is self-contained. It does not modify api.js, app.js or any
 *  existing module — it talks to the backend through its own small caller so
 *  nothing in the shared data layer changes.
 *
 *  These screens are deliberately ONLINE-ONLY. Approving a stock movement
 *  from a stale offline copy could double-deduct, so we ask the user to go
 *  online instead of queueing it.
 * ==========================================================================*/
(function(){
  function $id(i){ return document.getElementById(i); }
  function role(){ return (S.user && S.user.Role) || ''; }
  function canEdit(){ return ['MIS','Logistics','Admin'].indexOf(role()) >= 0; }
  function canView(){ return canEdit() || role() === 'Director'; }
  function num(n){ return Math.round((Number(n)||0) * 1000) / 1000; }

  var SA = { tests:[], recipes:[], packages:[], aliases:[], items:[], canEdit:false, loaded:false };

  /* ---------- own network caller (no changes to api.js) ---------- */
  function saCall(action, payload){
    if(!navigator.onLine) return Promise.resolve({ok:false, offline:true, error:'You are offline. Stock approvals need a connection.'});
    var url = (window.NAKODA_CONFIG && window.NAKODA_CONFIG.API_URL) || '';
    var body = JSON.stringify(Object.assign({action:action, token:(window.API && API.getToken && API.getToken()) || ''}, payload||{}));
    return fetch(url, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:body, redirect:'follow'})
      .then(function(r){ return r.json(); })
      .catch(function(){ return {ok:false, error:'Could not reach the server. Please try again.'}; });
  }

  function loading(box){ if(box) box.innerHTML = '<div class="center-load"><span class="loader dark"></span> Loading…</div>'; }
  function oops(box, r){ if(box) box.innerHTML = '<div class="empty">' + esc((r && r.error) || 'Something went wrong.') + '</div>'; }

  function meta(force){
    if(SA.loaded && !force) return Promise.resolve({ok:true});
    return saCall('saMeta', {}).then(function(r){
      if(r && r.ok){
        SA.tests = r.tests||[]; SA.recipes = r.recipes||[]; SA.packages = r.packages||[];
        SA.aliases = r.aliases||[]; SA.items = r.items||[]; SA.canEdit = !!r.canEdit; SA.loaded = true;
      }
      return r;
    });
  }

  function testById(id){ for(var i=0;i<SA.tests.length;i++){ if(String(SA.tests[i].testId)===String(id)) return SA.tests[i]; } return null; }
  function itemById(id){ for(var i=0;i<SA.items.length;i++){ if(String(SA.items[i].itemId)===String(id)) return SA.items[i]; } return null; }
  function recipeOf(id){ return SA.recipes.filter(function(r){ return String(r.testId)===String(id); }); }
  function childrenOf(id){ return SA.packages.filter(function(p){ return String(p.pkgTestId)===String(id); }); }
  function aliasesOf(id){ return SA.aliases.filter(function(a){ return String(a.testId)===String(id); }); }


  /* ========================================================================
   *  RECIPES
   * ======================================================================*/

  window.renderSARecipes = function(box){
    if(!box) return;
    if(!canView()){ box.innerHTML = '<div class="empty">Recipes are visible to MIS, Logistics, Admin and the Director only.</div>'; return; }
    loading(box);
    meta(true).then(function(r){
      if(!r || !r.ok) return oops(box, r);
      paintRecipes(box);
    });
  };

  function paintRecipes(box){
    var q = (SA._q||'').toLowerCase();
    var list = SA.tests.filter(function(t){ return !q || String(t.name).toLowerCase().indexOf(q) >= 0; })
                       .sort(function(a,b){ return String(a.name) < String(b.name) ? -1 : 1; });

    var noRecipe = SA.tests.filter(function(t){
      return String(t.isPackage)!=='yes' && recipeOf(t.testId).length === 0;
    }).length;

    box.innerHTML =
      '<div class="acc-top">' +
        '<input class="in search" id="saQ" placeholder="Search test…" value="' + esc(SA._q||'') + '" style="max-width:260px">' +
        (SA.canEdit ? '<button class="btn" id="saAddTest">+ Add test</button>' : '') +
        '<span style="align-self:center;font-size:12px;color:#888">' + SA.tests.length + ' tests · ' +
          (noRecipe ? noRecipe + ' still need a recipe' : 'all have recipes') + '</span>' +
      '</div>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>Test</th><th>Consumes</th><th>Also known as</th><th></th>' +
      '</tr></thead><tbody>' +
      (list.length ? list.map(rowFor).join('') :
        '<tr><td class="empty" colspan="4">No tests yet. Add your most common tests first.</td></tr>') +
      '</tbody></table></div>' +
      '<div class="legend">A test with no recipe is skipped during the daily deduction and reported to Logistics, ' +
      'so nothing is ever deducted by guesswork.</div>';

    var qi = $id('saQ');
    if(qi) qi.oninput = function(){ SA._q = this.value; paintRecipes(box); var f=$id('saQ'); if(f){ f.focus(); f.setSelectionRange(f.value.length,f.value.length); } };
    var ab = $id('saAddTest');
    if(ab) ab.onclick = function(){ editTest(null, box); };
    box.querySelectorAll('[data-edit]').forEach(function(n){
      n.onclick = function(){ editTest(n.getAttribute('data-edit'), box); };
    });
  }

  function rowFor(t){
    var isPkg = String(t.isPackage) === 'yes';
    var consumes;
    if(isPkg){
      var kids = childrenOf(t.testId).length;
      consumes = '<span class="pill">PACKAGE</span> ' + (kids ? kids + ' tests inside' : '<span style="color:#c62828">no tests listed yet</span>');
    } else {
      var lines = recipeOf(t.testId);
      consumes = lines.length
        ? lines.map(function(l){ var it = itemById(l.itemId); return esc(it ? it.name : l.itemId) + ' ' + num(l.qty) + ' ' + esc(it ? (it.unit||'') : ''); }).join(' · ')
        : '<span style="color:#c62828">not set yet</span>';
    }
    var al = aliasesOf(t.testId).map(function(a){ return esc(a.alias); }).join(', ');
    return '<tr><td><b>' + esc(t.name) + '</b></td><td>' + consumes + '</td>' +
           '<td style="color:#888;font-size:12px">' + (al || '—') + '</td>' +
           '<td>' + (SA.canEdit ? '<button class="btn ghost sm" data-edit="' + esc(t.testId) + '">Edit</button>' : '') + '</td></tr>';
  }

  function editTest(testId, box){
    var t = testId ? testById(testId) : null;
    var isPkg = t ? String(t.isPackage) === 'yes' : false;

    var itemOpts = SA.items.map(function(i){ return '<option value="' + esc(i.itemId) + '">' + esc(i.name) + (i.unit ? ' (' + esc(i.unit) + ')' : '') + '</option>'; }).join('');
    var testOpts = SA.tests.filter(function(x){ return !t || String(x.testId) !== String(t.testId); })
                           .sort(function(a,b){ return String(a.name) < String(b.name) ? -1 : 1; })
                           .map(function(x){ return '<option value="' + esc(x.testId) + '">' + esc(x.name) + '</option>'; }).join('');

    var body =
      '<div class="field"><label>Test name (exactly as your lab software prints it)</label>' +
        '<input class="in" id="saName" value="' + esc(t ? t.name : '') + '" placeholder="e.g. CREATININE"></div>' +
      '<div class="field"><label><input type="checkbox" id="saIsPkg"' + (isPkg ? ' checked' : '') + '> This is a package / profile (contains other tests)</label></div>' +
      '<div id="saPkgWrap" class="' + (isPkg ? '' : 'hidden') + '">' +
        '<div class="field"><label>Tests inside this package</label><div id="saKids"></div>' +
        '<select class="in" id="saKidPick"><option value="">+ add a test…</option>' + testOpts + '</select></div>' +
      '</div>' +
      '<div id="saRcpWrap" class="' + (isPkg ? 'hidden' : '') + '">' +
        '<div class="field"><label>Items consumed by ONE test</label><div id="saLines"></div>' +
        '<select class="in" id="saItemPick"><option value="">+ add an item…</option>' + itemOpts + '</select></div>' +
      '</div>' +
      '<div class="field"><label>Other spellings that mean the same test</label><div id="saAls"></div>' +
        '<input class="in" id="saAlNew" placeholder="e.g. COMPLETE BLOOD COUNTS  — press Enter"></div>' +
      '<div id="saMsg"></div>';

    openModal(t ? 'Edit — ' + t.name : 'Add test',
      body,
      (t ? '<button class="btn ghost" id="saDel">Delete</button>' : '') +
      '<button class="btn ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="btn" id="saSave">Save</button>');

    var lines = t ? recipeOf(t.testId).map(function(l){ return {itemId:String(l.itemId), qty:Number(l.qty)||0}; }) : [];
    var kids  = t ? childrenOf(t.testId).map(function(p){ return String(p.childTestId); }) : [];
    var als   = t ? aliasesOf(t.testId).map(function(a){ return {aliasId:a.aliasId, alias:a.alias}; }) : [];

    function drawLines(){
      $id('saLines').innerHTML = lines.length ? lines.map(function(l, i){
        var it = itemById(l.itemId);
        return '<div class="row-line" style="display:flex;gap:8px;align-items:center;margin-bottom:6px">' +
          '<span style="flex:1">' + esc(it ? it.name : l.itemId) + '</span>' +
          '<input class="in" data-q="' + i + '" type="number" step="0.001" min="0" value="' + l.qty + '" style="max-width:100px">' +
          '<span style="width:44px;color:#888;font-size:12px">' + esc(it ? (it.unit||'') : '') + '</span>' +
          '<button class="iconbtn" data-rm="' + i + '">&times;</button></div>';
      }).join('') : '<div style="color:#888;font-size:12px;margin-bottom:6px">Nothing yet — add the items this test uses.</div>';
      $id('saLines').querySelectorAll('[data-q]').forEach(function(n){
        n.onchange = function(){ lines[+n.getAttribute('data-q')].qty = Number(this.value) || 0; };
      });
      $id('saLines').querySelectorAll('[data-rm]').forEach(function(n){
        n.onclick = function(){ lines.splice(+n.getAttribute('data-rm'), 1); drawLines(); };
      });
    }
    function drawKids(){
      $id('saKids').innerHTML = kids.length ? kids.map(function(k, i){
        var x = testById(k);
        return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">' +
          '<span style="flex:1">' + esc(x ? x.name : k) + '</span>' +
          '<button class="iconbtn" data-km="' + i + '">&times;</button></div>';
      }).join('') : '<div style="color:#888;font-size:12px;margin-bottom:6px">No tests listed. A package with nothing inside deducts nothing.</div>';
      $id('saKids').querySelectorAll('[data-km]').forEach(function(n){
        n.onclick = function(){ kids.splice(+n.getAttribute('data-km'), 1); drawKids(); };
      });
    }
    function drawAls(){
      $id('saAls').innerHTML = als.map(function(a, i){
        return '<span class="pill" style="margin:0 4px 4px 0;display:inline-block">' + esc(a.alias) +
               ' <b data-am="' + i + '" style="cursor:pointer">&times;</b></span>';
      }).join('');
      $id('saAls').querySelectorAll('[data-am]').forEach(function(n){
        n.onclick = function(){ als.splice(+n.getAttribute('data-am'), 1); drawAls(); };
      });
    }
    drawLines(); drawKids(); drawAls();

    $id('saIsPkg').onchange = function(){
      $id('saPkgWrap').classList.toggle('hidden', !this.checked);
      $id('saRcpWrap').classList.toggle('hidden', this.checked);
    };
    $id('saItemPick').onchange = function(){
      if(!this.value) return;
      if(!lines.filter(function(l){ return l.itemId === this.value; }, this).length) lines.push({itemId:this.value, qty:1});
      this.value = ''; drawLines();
    };
    $id('saKidPick').onchange = function(){
      if(!this.value) return;
      if(kids.indexOf(this.value) < 0) kids.push(this.value);
      this.value = ''; drawKids();
    };
    $id('saAlNew').onkeydown = function(ev){
      if(ev.key !== 'Enter') return;
      ev.preventDefault();
      var v = this.value.trim();
      if(v){ als.push({aliasId:'', alias:v}); this.value = ''; drawAls(); }
    };

    if($id('saDel')) $id('saDel').onclick = function(){
      if(!confirm('Remove this test? Past stock movements are not affected.')) return;
      saCall('saDeleteTest', {testId:t.testId}).then(function(r){
        if(!r || !r.ok) return toast((r && r.error) || 'Failed', true);
        closeModal(); toast('Removed'); window.renderSARecipes(box);
      });
    };

    $id('saSave').onclick = function(){
      var name = $id('saName').value.trim();
      if(!name){ $id('saMsg').innerHTML = '<div class="msg error">Please enter the test name.</div>'; return; }
      var pkg = $id('saIsPkg').checked;
      this.disabled = true;
      var self = this;

      saCall('saSaveTest', {data:{testId:(t ? t.testId : ''), name:name, isPackage:pkg}}).then(function(r){
        if(!r || !r.ok){ self.disabled = false; $id('saMsg').innerHTML = '<div class="msg error">' + esc((r && r.error) || 'Failed') + '</div>'; return; }
        var id = r.testId;
        var jobs = [];
        if(pkg) jobs.push(saCall('saSavePackage', {testId:id, childTestIds:kids}));
        else    jobs.push(saCall('saSaveRecipe',  {testId:id, lines:lines}));
        als.forEach(function(a){ jobs.push(saCall('saSaveAlias', {alias:a.alias, testId:id})); });
        var gone = (t ? aliasesOf(t.testId) : []).filter(function(old){
          return !als.filter(function(a){ return String(a.aliasId) === String(old.aliasId); }).length;
        });
        gone.forEach(function(o){ jobs.push(saCall('saDeleteAlias', {aliasId:o.aliasId})); });

        Promise.all(jobs).then(function(){
          closeModal(); toast('Saved'); window.renderSARecipes(box);
        });
      });
    };
  }


  /* ========================================================================
   *  APPROVALS QUEUE
   * ======================================================================*/

  window.renderSAApprovals = function(box, branch){
    if(!box) return;
    if(!canView()){ box.innerHTML = '<div class="empty">Stock approvals are handled by Logistics, MIS and Admin.</div>'; return; }
    loading(box);
    saCall('saQueue', {branch:branch||''}).then(function(r){
      if(!r || !r.ok) return oops(box, r);
      paintQueue(box, r, branch);
    });
  };

  function flagChip(f){
    var col = (f.type === 'info') ? '#888' : '#c62828';
    return '<span class="pill" style="border-color:' + col + ';color:' + col + '">' + esc(f.msg) + '</span>';
  }

  function paintQueue(box, r, branch){
    var q = r.queue || [];
    var clean = q.filter(function(b){ return b.status === 'ready' && !hardFlags(b).length; });

    box.innerHTML =
      '<div class="acc-top"><span style="align-self:center;font-size:12px;color:#888">' +
        q.length + ' waiting · ' + clean.length + ' with nothing unusual</span>' +
        (r.canApprove && clean.length ? '<button class="btn" id="saBulk">Approve the ' + clean.length + ' clean one(s)</button>' : '') +
      '</div>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th></th><th>Branch</th><th>Date</th><th>Items</th><th>Status</th><th></th>' +
      '</tr></thead><tbody>' +
      (q.length ? q.map(queueRow).join('') :
        '<tr><td class="empty" colspan="6">Nothing waiting. Deductions appear here once the accountant has verified that day\'s collection.</td></tr>') +
      '</tbody></table></div>' +
      '<div class="legend">Rows with a warning cannot be approved in bulk — open them and check first. ' +
      'Anything left more than 24 hours appears in the Process Flow Monitor.</div>';

    box.querySelectorAll('[data-open]').forEach(function(n){
      n.onclick = function(){ openBatch(n.getAttribute('data-open'), box, branch); };
    });
    var bb = $id('saBulk');
    if(bb) bb.onclick = function(){
      if(!confirm('Approve ' + clean.length + ' deduction(s)? Stock will be reduced.')) return;
      bb.disabled = true;
      saCall('saApprove', {batchIds:clean.map(function(b){ return b.batchId; })}).then(function(x){
        if(!x || !x.ok){ bb.disabled = false; return toast((x && x.error) || 'Failed', true); }
        toast('Approved — ' + x.moves + ' stock rows written');
        window.renderSAApprovals(box, branch);
      });
    };
  }

  /* flags that must stop a bulk approval (info notes do not) */
  function hardFlags(b){ return (b.flags||[]).filter(function(f){ return f.type !== 'info'; }); }

  function queueRow(b){
    var hard = hardFlags(b);
    var status = (b.status === 'error')
      ? '<span class="pill" style="border-color:#c62828;color:#c62828">Could not read file</span>'
      : (hard.length ? hard.map(flagChip).join(' ') : '<span style="color:#888">Normal</span>');
    return '<tr>' +
      '<td>' + (b.status === 'ready' && !hard.length ? '<span style="color:#2e7d32">&#10003;</span>' : '') + '</td>' +
      '<td><b>' + esc(b.branchName) + '</b></td>' +
      '<td>' + esc(b.date || '') + '</td>' +
      '<td>' + (b.status === 'error' ? '—' : b.itemCount + ' items') + '</td>' +
      '<td>' + status + (b.hoursWaiting >= 24 ? ' <span class="pill" style="border-color:#c47f00;color:#c47f00">' + b.hoursWaiting + 'h waiting</span>' : '') + '</td>' +
      '<td><button class="btn ghost sm" data-open="' + esc(b.batchId) + '">Open</button></td></tr>';
  }

  function openBatch(batchId, box, branch){
    saCall('saBatch', {batchId:batchId}).then(function(r){
      if(!r || !r.ok) return toast((r && r.error) || 'Failed', true);
      var b = r.batch;

      if(b.status === 'error'){
        openModal('Could not read the file — ' + b.branchName,
          '<div class="msg error">' + esc(b.error) + '</div>' +
          '<div class="legend">Check that the Tests Excel was attached to the daily entry, and that it is the patient test report ' +
          '(the one with RegNo, Entry Date and Test Name columns). Re-attach it and the system will try again automatically.</div>',
          '<button class="btn ghost" onclick="closeModal()">Close</button>');
        return;
      }

      var rows = (b.items||[]).map(function(ln){
        var low = ln.after < 0;
        return '<tr><td>' + esc(ln.name) + '</td>' +
          '<td style="text-align:right">' + num(ln.qty) + ' ' + esc(ln.unit||'') + '</td>' +
          '<td style="text-align:right;color:#888">' + num(ln.onHand) + '</td>' +
          '<td style="text-align:right' + (low ? ';color:#c62828;font-weight:700' : '') + '">' + num(ln.after) + '</td></tr>';
      }).join('');

      var flags = (b.flags||[]).map(function(f){
        return '<div class="msg ' + (f.type === 'info' ? '' : 'error') + '" style="margin-bottom:6px"><b>' + esc(f.msg) + '</b>' +
          ((f.detail && f.detail.length) ? '<br><span style="font-size:12px">' + f.detail.map(esc).join(' · ') + '</span>' : '') + '</div>';
      }).join('');

      openModal('Stock deduction — ' + b.branchName + ', ' + (b.dates||[]).join(' & '),
        '<div style="font-size:12px;color:#888;margin-bottom:10px">' +
          b.regCount + ' registrations · ' + b.testCount + ' tests · read from ' + esc(b.fileName || 'the attached file') + '</div>' +
        flags +
        '<div class="table-wrap"><table><thead><tr><th>Item</th><th style="text-align:right">Deduct</th>' +
        '<th style="text-align:right">Now</th><th style="text-align:right">After</th></tr></thead><tbody>' +
        (rows || '<tr><td class="empty" colspan="4">Nothing to deduct — no recognised test had a recipe.</td></tr>') +
        '</tbody></table></div>',
        (b.canApprove ? '<button class="btn ghost" id="saRj">Reject</button>' : '') +
        '<button class="btn ghost" onclick="closeModal()">Close</button>' +
        (b.canApprove && (b.items||[]).length ? '<button class="btn" id="saAp">Approve deduction</button>' : ''));

      if($id('saAp')) $id('saAp').onclick = function(){
        this.disabled = true;
        saCall('saApprove', {batchIds:[b.batchId]}).then(function(x){
          if(!x || !x.ok) return toast((x && x.error) || 'Failed', true);
          closeModal(); toast('Stock updated'); window.renderSAApprovals(box, branch);
        });
      };
      if($id('saRj')) $id('saRj').onclick = function(){
        var why = prompt('Why are you rejecting this? (optional)') || '';
        saCall('saReject', {batchId:b.batchId, reason:why}).then(function(x){
          if(!x || !x.ok) return toast((x && x.error) || 'Failed', true);
          closeModal(); toast('Rejected'); window.renderSAApprovals(box, branch);
        });
      };
    });
  }


  /* ========================================================================
   *  OVERDUE PANEL  — called by the Process Flow Monitor page
   * ======================================================================*/

  window.renderSAOverdue = function(box){
    if(!box) return;
    saCall('saOverdue', {}).then(function(r){
      if(!r || !r.ok || !(r.overdue||[]).length){ box.innerHTML = ''; return; }
      box.innerHTML =
        '<div class="section-label">Stock approvals overdue</div>' +
        '<div class="card"><div class="table-wrap"><table><thead><tr>' +
        '<th>Branch</th><th>Date</th><th>Waiting</th><th>With</th></tr></thead><tbody>' +
        r.overdue.map(function(o){
          return '<tr><td><b>' + esc(o.branchName) + '</b></td><td>' + esc(o.date) + '</td>' +
            '<td style="color:#c62828;font-weight:700">' + o.hours + ' hours</td>' +
            '<td>' + esc(o.withName) + (o.status === 'error' ? ' <span class="pill" style="border-color:#c62828;color:#c62828">file error</span>' : '') + '</td></tr>';
        }).join('') +
        '</tbody></table></div></div>';
    });
  };
})();
