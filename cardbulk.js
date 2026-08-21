/* ============================================================================================
 *  Nakoda MIS — ISSUE MEMBERSHIP CARDS IN BULK  (v334)
 *
 *  window.openCardBulk()   — the screen, drawn into #page-cards
 *
 *  WHY THIS EXISTS.
 *  Issuing ten cards meant opening the single-card popup ten times. Each one was a separate
 *  request that took a company-wide lock and, inside it, read the whole Membership_Cards sheet
 *  twice over — once for the duplicate-mobile check and once to work out the next card number.
 *  So ten cards was ten locks and ten full-sheet reads, one after another, and anybody else who
 *  pressed the button in the meantime got "Another card is being issued right now. Try again in
 *  a few seconds."
 *
 *  The server side of that is fixed in Code.gs v334: card numbers now come from a counter rather
 *  than a scan, so the lock is held for milliseconds, and apiIssueCards writes a whole batch in
 *  ONE request — one counter bump, one narrow read, one write for the rows, one for the audit
 *  trail. This file is the screen that uses it: ten cards in about four seconds, one tap.
 *
 *  DELIBERATE CHOICES.
 *   · Nothing is validated against the server before you press Issue. A pre-check would be one
 *     more round trip for information the save itself returns anyway, and it would be stale by
 *     the time you acted on it. Rows are checked for shape here; the server is the authority on
 *     duplicates and answers per row.
 *   · A duplicate mobile is REPORTED, never silently resolved. You choose Skip or Replace for the
 *     batch, because "replace" cancels somebody's existing card and that is not a decision code
 *     should make on its own.
 *   · One bad row never stops the batch. The good rows are issued and the bad ones come back with
 *     their line number and the reason.
 * ============================================================================================ */
(function(){
  var MAX_ROWS = 25;          /* matches the server's own limit in apiIssueCards */
  var B = { rows: [], branch: '', dup: 'skip', busy: false, result: null, t0: 0 };

  function $(id){ return document.getElementById(id); }
  function branches(){ return (window.S && S.meta && S.meta.branches) || []; }
  function blank(){ return { name:'', mobile:'', typeId:'', amount:'', refer:'' }; }

  /* ---------------------------------------------------------------- validation (shape only) */
  function checkRow(r, i, all){
    if(!r.name && !r.mobile && !r.typeId) return { state:'empty' };
    if(!String(r.name).trim())            return { state:'bad', msg:'Name is required' };
    var m = String(r.mobile).replace(/\D/g,'');
    if(!/^\d{10}$/.test(m))               return { state:'bad', msg:'Mobile must be 10 digits' };
    if(!String(r.typeId).trim())          return { state:'bad', msg:'Pick a card type' };
    for(var j=0;j<i;j++){
      if(String(all[j].mobile).replace(/\D/g,'') === m && all[j].name)
        return { state:'bad', msg:'Same mobile as line ' + (j+1) };
    }
    return { state:'ok' };
  }
  function tally(){
    var t = { total:0, ok:0, bad:0 };
    B.rows.forEach(function(r,i){
      var c = checkRow(r, i, B.rows);
      if(c.state === 'empty') return;
      t.total++; if(c.state === 'ok') t.ok++; else t.bad++;
    });
    return t;
  }

  /* ---------------------------------------------------------------- the screen */
  window.openCardBulk = function(){
    var host = $('page-cards'); if(!host) return;
    if(!B.rows.length){ for(var i=0;i<10;i++) B.rows.push(blank()); }
    if(!B.branch) B.branch = (window.S && S.user && S.user.Branch) || '';
    B.result = null;
    paint();
  };

  function paint(){
    var host = $('page-cards'); if(!host) return;
    host.innerHTML = B.result ? doneHtml() : formHtml();
    B.result ? wireDone() : wireForm();
  }

  function typeOptions(sel){
    var list = (window.CARD_TYPES_CACHE || []);
    var opts = '<option value="">—</option>';
    list.forEach(function(t){
      opts += '<option value="' + esc(t.typeId) + '"' + (String(sel) === String(t.typeId) ? ' selected' : '') + '>' + esc(t.name || t.typeId) + '</option>';
    });
    return opts;
  }

  function tallyHtml(t){
    return '<b style="color:#1b1b1d">' + t.total + ' row' + (t.total===1?'':'s') + '</b>' +
      ' &middot; ' + t.ok + ' ready' +
      (t.bad ? ' &middot; <b style="color:#b23b3b">' + t.bad + ' need' + (t.bad===1?'s':'') + ' attention</b>' : '');
  }
  function formHtml(){
    var t = tally();
    var brOpts = branches().map(function(b){
      return '<option value="' + esc(b.BranchID) + '"' + (String(b.BranchID) === String(B.branch) ? ' selected' : '') + '>' + esc(b.BranchName) + '</option>';
    }).join('');

    var body = B.rows.map(function(r, i){
      var c = checkRow(r, i, B.rows);
      var st = c.state === 'ok'   ? '<span class="pill ok">&#10003; ready</span>'
             : c.state === 'bad'  ? '<span class="pill bad">' + esc(c.msg) + '</span>'
             : '<span class="muted" style="font-size:11px">—</span>';
      return '<tr' + (c.state === 'bad' ? ' style="background:#fdf6f6"' : '') + '>' +
        '<td style="color:#9aa0a6;font-weight:700">' + (i+1) + '</td>' +
        '<td><input class="cb-in" data-f="name"   data-i="' + i + '" value="' + esc(r.name) + '" placeholder="Full name"></td>' +
        '<td><input class="cb-in" data-f="mobile" data-i="' + i + '" value="' + esc(r.mobile) + '" inputmode="numeric" maxlength="10" placeholder="10 digits"></td>' +
        '<td><select class="cb-in" data-f="typeId" data-i="' + i + '">' + typeOptions(r.typeId) + '</select></td>' +
        '<td><input class="cb-in" data-f="amount" data-i="' + i + '" value="' + esc(r.amount) + '" inputmode="numeric" placeholder="0"></td>' +
        '<td><input class="cb-in" data-f="refer"  data-i="' + i + '" value="' + esc(r.refer) + '" placeholder="optional"></td>' +
        '<td>' + st + '</td>' +
        '<td><span class="cb-del" data-i="' + i + '" title="Remove this row" style="cursor:pointer;color:#b9bec6">&#10005;</span></td>' +
        '</tr>';
    }).join('');

    return '<div class="page-head"><h1>Membership Cards</h1>' +
        '<div style="font-size:11.5px;color:#9aa0a6;font-weight:600">Bulk &middot; up to ' + MAX_ROWS + ' at a time</div>' +
        '<div class="spacer"></div>' +
        '<select id="cbBranch" class="greet-select" style="max-width:180px">' + brOpts + '</select>' +
        '<select id="cbDefType" class="greet-select" style="max-width:160px">' + typeOptions('') + '</select>' +
        '<button class="btn ghost" id="cbAdd">+ Add row</button>' +
        '<button class="btn ghost" id="cbBack">Back to list</button></div>' +

      '<div class="card" style="padding:0">' +
        '<div class="toolbar" style="border-bottom:1px solid var(--line)">' +
          '<div style="display:flex;align-items:center;gap:10px;font-size:13.5px;color:#5f6672">' +
            '<span style="font-size:16px">&#128203;</span>' +
            '<span>Paste from Excel &mdash; copy <b>Name &middot; Mobile &middot; Type &middot; Amount &middot; Referred by</b> and press Ctrl+V anywhere on this table.</span>' +
          '</div></div>' +
        '<div class="table-wrap"><table id="cbTable">' +
          '<thead><tr><th style="width:40px">#</th><th>Holder name *</th><th style="width:150px">Mobile *</th>' +
          '<th style="width:150px">Card type *</th><th style="width:110px">Amount (&#8377;)</th>' +
          '<th style="width:170px">Referred by</th><th style="width:200px">Status</th><th style="width:40px"></th></tr></thead>' +
          '<tbody>' + body + '</tbody></table></div>' +
        '<div class="toolbar" style="border-top:1px solid var(--line);justify-content:space-between;flex-wrap:wrap;gap:10px">' +
          '<div id="cbTally" style="font-size:14px;color:#5f6672">' + tallyHtml(t) + '</div>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
            '<span style="font-size:12.5px;color:#8a8f97">If a mobile already has a card:</span>' +
            '<button class="btn ' + (B.dup==='skip'?'':'ghost') + '" id="cbSkip">Skip it</button>' +
            '<button class="btn ' + (B.dup==='replace'?'':'ghost') + '" id="cbRepl">Replace the old one</button>' +
            '<button class="btn" id="cbGo"' + (t.ok && !B.busy ? '' : ' disabled style="opacity:.5"') + '>' +
              (B.busy ? 'Issuing…' : ('Issue ' + t.ok + ' card' + (t.ok===1?'':'s'))) + '</button>' +
          '</div></div>' +
      '</div>' +
      '<div id="cbMsg" style="margin-top:12px"></div>';
  }

  function wireForm(){
    var host = $('page-cards');

    /* A <select> fires `input` in modern browsers, but `change` is the event that is guaranteed
       everywhere and the one older WebViews send. Both listeners therefore run the SAME commit —
       an earlier version wired `change` to refresh the tally WITHOUT writing the chosen value,
       so on any browser that sent only `change` the card type silently never took. */
    function commit(el){
      var i = +el.getAttribute('data-i'), f = el.getAttribute('data-f');
      if(!B.rows[i]) return;
      B.rows[i][f] = (f === 'mobile') ? el.value.replace(/\D/g,'').slice(0,10) : el.value;
      if(f === 'mobile' && el.value !== B.rows[i][f]) el.value = B.rows[i][f];
      refreshTallyOnly();
    }
    host.querySelectorAll('.cb-in').forEach(function(el){
      el.addEventListener('input',  function(){ commit(el); });
      el.addEventListener('change', function(){ commit(el); });
    });

    host.querySelectorAll('.cb-del').forEach(function(el){
      el.onclick = function(){ B.rows.splice(+el.getAttribute('data-i'), 1); if(!B.rows.length) B.rows.push(blank()); paint(); };
    });

    $('cbAdd').onclick  = function(){ if(B.rows.length >= MAX_ROWS){ toast('Up to ' + MAX_ROWS + ' rows at a time.', true); return; } B.rows.push(blank()); paint(); };
    $('cbBack').onclick = function(){ B.result = null; if(window.renderMembershipCards) window.renderMembershipCards(); };
    $('cbSkip').onclick = function(){ B.dup = 'skip';    paint(); };
    $('cbRepl').onclick = function(){ B.dup = 'replace'; paint(); };
    $('cbBranch').onchange = function(){ B.branch = this.value; };
    $('cbDefType').onchange = function(){
      var v = this.value; if(!v) return;
      B.rows.forEach(function(r){ if(!r.typeId) r.typeId = v; });   /* fill the blanks, never overwrite a choice */
      paint();
    };
    $('cbGo').onclick = submit;

    /* ---- paste a block straight out of Excel ----
       Excel puts a tab between columns and a newline between rows, which is all we need. Pasting
       starts at the row you are focused on, so you can top up an existing list as well as fill a
       fresh one. */
    var tbl = $('cbTable');
    tbl.addEventListener('paste', function(e){
      var txt = (e.clipboardData || window.clipboardData).getData('text') || '';
      if(txt.indexOf('\t') < 0 && txt.indexOf('\n') < 0) return;    /* a single cell — let it paste normally */
      e.preventDefault();
      var start = 0, act = document.activeElement;
      if(act && act.getAttribute && act.getAttribute('data-i') !== null) start = +act.getAttribute('data-i');
      var lines = txt.replace(/\r/g,'').split('\n').filter(function(l){ return l.trim(); });
      var added = 0;
      lines.forEach(function(line, k){
        var idx = start + k;
        if(idx >= MAX_ROWS) return;
        var c = line.split('\t');
        while(B.rows.length <= idx) B.rows.push(blank());
        B.rows[idx] = {
          name:   (c[0] || '').trim(),
          mobile: (c[1] || '').replace(/\D/g,'').slice(0,10),
          typeId: (c[2] || '').trim().toUpperCase(),
          amount: (c[3] || '').replace(/[^\d.]/g,''),
          refer:  (c[4] || '').trim()
        };
        added++;
      });
      paint();
      toast(added + ' row' + (added===1?'':'s') + ' pasted' + (lines.length > added ? (' · ' + (lines.length-added) + ' skipped, the limit is ' + MAX_ROWS) : ''));
    });
  }

  /* Re-render only the counters and the button, so typing never loses focus or the caret. */
  function refreshTallyOnly(){
    var t = tally(), go = $('cbGo');
    if(go){
      go.textContent = B.busy ? 'Issuing…' : ('Issue ' + t.ok + ' card' + (t.ok===1?'':'s'));
      go.disabled = !(t.ok && !B.busy);
      go.style.opacity = go.disabled ? '.5' : '';
    }
    var tl = $('cbTally'); if(tl) tl.innerHTML = tallyHtml(t);
    clearTimeout(refreshTallyOnly._t);
    refreshTallyOnly._t = setTimeout(function(){ if(!B.busy && !B.result) repaintStatusCells(); }, 350);
  }
  function repaintStatusCells(){
    var rowsEl = document.querySelectorAll('#cbTable tbody tr');
    for(var i=0;i<rowsEl.length;i++){
      var c = checkRow(B.rows[i] || blank(), i, B.rows);
      var cell = rowsEl[i].children[6]; if(!cell) continue;
      cell.innerHTML = c.state === 'ok'  ? '<span class="pill ok">&#10003; ready</span>'
                     : c.state === 'bad' ? '<span class="pill bad">' + esc(c.msg) + '</span>'
                     : '<span class="muted" style="font-size:11px">—</span>';
      rowsEl[i].style.background = (c.state === 'bad') ? '#fdf6f6' : '';
    }
  }

  /* ---------------------------------------------------------------- send */
  function submit(){
    if(B.busy) return;
    var send = [];
    B.rows.forEach(function(r, i){
      if(checkRow(r, i, B.rows).state !== 'ok') return;
      send.push({ holderName:String(r.name).trim(), mobile:String(r.mobile).replace(/\D/g,''),
                  typeId:String(r.typeId).toUpperCase(), amount:Number(r.amount) || 0,
                  referByName:String(r.refer||'').trim() });
    });
    if(!send.length){ toast('Nothing ready to issue yet.', true); return; }
    if(typeof navigator !== 'undefined' && navigator.onLine === false){
      toast('Issuing cards needs a connection — a card number has to come from the server.', true); return;
    }
    B.busy = true; B.t0 = Date.now(); paint();
    $('cbMsg').innerHTML = '<div class="center-load"><span class="loader dark"></span> Issuing ' + send.length + ' card' + (send.length===1?'':'s') + '…</div>';

    API.issueCards({ branchId:B.branch, rows:send, onDuplicate:B.dup }).then(function(r){
      B.busy = false;
      if(!r || !r.ok){ $('cbMsg').innerHTML = '<div class="msg error">' + esc((r && r.error) || 'Could not reach the server.') + '</div>'; paint(); return; }
      B.result = { r:r, secs:((Date.now() - B.t0) / 1000).toFixed(1) };
      /* Drop the rows that succeeded; leave the problem rows on screen so they can be fixed. */
      var badLines = {}; (r.problems || []).forEach(function(p){ badLines[p.line] = p; });
      var kept = [], n = 0;
      B.rows.forEach(function(row, i){
        if(checkRow(row, i, B.rows).state !== 'ok'){ kept.push(row); return; }
        n++; if(badLines[n]) kept.push(row);
      });
      B.rows = kept.length ? kept : [];
      paint();
      if(window.API && API.refreshCards) API.refreshCards();
    }, function(){
      B.busy = false;
      $('cbMsg').innerHTML = '<div class="msg error">Could not reach the server. Nothing was issued — try again.</div>';
      paint();
    });
  }

  /* ---------------------------------------------------------------- result */
  function doneHtml(){
    var r = B.result.r, made = r.issued || [], probs = r.problems || [];
    var rows = made.map(function(c){
      return '<tr><td><b>' + esc(c.cardNumber) + '</b></td><td>' + esc(c.holderName) + '</td>' +
        '<td>' + esc(c.mobile) + '</td><td>' + esc(c.typeId) + '</td>' +
        '<td>' + (Number(c.amount) || 0).toLocaleString('en-IN') + '</td>' +
        '<td><span class="pill ok">&#10003; ready to send</span></td></tr>';
    }).join('');

    var probHtml = '';
    if(probs.length){
      probHtml = '<div class="card" style="margin-top:14px;border-color:#f3d0d0">' +
        '<div style="padding:12px 16px;font-size:14px;font-weight:800;color:#b23b3b;border-bottom:1px solid var(--line)">' +
          probs.length + ' row' + (probs.length===1?'':'s') + ' not issued</div>' +
        '<div class="table-wrap"><table><thead><tr><th style="width:60px">Line</th><th>Name</th><th style="width:150px">Mobile</th><th>Reason</th></tr></thead><tbody>' +
        probs.map(function(p){
          return '<tr><td>' + p.line + '</td><td>' + esc(p.name || '—') + '</td><td>' + esc(p.mobile || '—') + '</td>' +
                 '<td style="color:#b23b3b">' + esc(p.reason) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div style="padding:11px 16px;font-size:12.5px;color:#8a8f97">These rows are still on the bulk screen &mdash; tap <b>Issue more</b> to fix and re-send them.</div></div>';
    }

    var cancelled = (r.cancelled || []).length
      ? ' &middot; ' + r.cancelled.length + ' old card' + (r.cancelled.length===1?'':'s') + ' cancelled and replaced'
      : '';

    return '<div class="page-head"><h1>Membership Cards</h1><div class="spacer"></div>' +
        '<button class="btn ghost" id="cbMore">Issue more</button>' +
        '<button class="btn" id="cbList">Open the card list</button></div>' +
      '<div class="card" style="padding:0">' +
        '<div class="toolbar" style="border-bottom:1px solid var(--line);gap:14px;align-items:center;flex-wrap:wrap">' +
          '<div style="font-size:17px;font-weight:800;color:#1a8f4c">&#10003; ' + made.length + ' card' + (made.length===1?'':'s') + ' issued</div>' +
          '<div style="background:#1a8f4c;color:#fff;font-size:14px;font-weight:800;padding:5px 14px;border-radius:8px">' + esc(B.result.secs) + ' s</div>' +
          '<div style="font-size:13.5px;color:#5f6672">' + esc(r.branchName || '') + cancelled + '</div>' +
        '</div>' +
        (made.length ? ('<div class="table-wrap"><table><thead><tr><th style="width:180px">Card number</th><th>Holder name</th>' +
          '<th style="width:150px">Mobile</th><th style="width:110px">Type</th><th style="width:110px">Amount (&#8377;)</th>' +
          '<th style="width:180px">WhatsApp</th></tr></thead><tbody>' + rows + '</tbody></table></div>')
          : '<div class="empty" style="padding:22px">No cards were issued.</div>') +
        (made.length ? '<div style="padding:12px 16px;font-size:12.5px;color:#8a8f97;border-top:1px solid var(--line)">' +
          'To send these on WhatsApp, open the card list and use <b>&#128228; Send unsent</b> &mdash; these cards are in that set.</div>' : '') +
      '</div>' + probHtml;
  }

  function wireDone(){
    $('cbMore').onclick = function(){ B.result = null; if(!B.rows.length){ for(var i=0;i<10;i++) B.rows.push(blank()); } paint(); };
    $('cbList').onclick = function(){ B.result = null; B.rows = []; if(window.renderMembershipCards) window.renderMembershipCards(); };
  }
})();
