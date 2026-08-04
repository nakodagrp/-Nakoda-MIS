/* =====================================================================================
   NAKODA MIS — bank-import.js   (v274)
   =====================================================================================
   Upload a bank statement CSV, review what it found, import it into Acc_Ledger.

   Nothing is written until the user presses Import. Before any import exists every
   figure on the finance table stays 0 — this module never fabricates a number.

   PARSER NOTES — written against the real file (Kotak, 9408894464_statement.csv):
   • Header block is key/value pairs in trailing columns, not fixed rows. Scanned by
     label ("Account No.", "Period", "IFSC"), never by row index.
   • The entity line carries the branch as a suffix: "NAKODA … LIMITED - PAL". Used only
     as a HINT shown to the user. The branch is decided by Account No. server-side,
     because the statement's own "Branch" field is the BANK's branch (it says Navsari on
     the PAL account, and Navsari is also one of our branches).
   • The data header row is found by looking for the row starting with "Sl. No." — the
     rows above it vary in count between banks and between months.
   • "Dr / Cr" is IGNORED. On this statement it reads CR on all 69 rows including the 36
     that carry a Debit amount, because it describes the running balance, not the
     transaction. Direction comes from which of Debit / Credit is populated.
   • Amounts use Indian grouping and are sometimes quoted: "1,09,073.11" and 411.82 both
     appear. All commas stripped before Number().
   • Dates are DD-MM-YYYY. Value Date is used (the accounting date), not Transaction Date.
   • Rows are newest-first and end at a "Closing balance" line followed by contact-detail
     footer lines, all of which must be ignored.

   WIRING (3 steps)
   ----------------
   1. Add to index.html, after api.js:
          <script src="bank-import.js"></script>
   2. Give it your API caller once, on boot (it expects a function that takes an action
      object and resolves to the parsed JSON reply — i.e. whatever api.js already uses):
          BankImport.init({ call: api, toast: showToast, branchOf: function(){ return CURRENT_BRANCH; } });
   3. Render it into your Accounts screen wherever you want the tab:
          BankImport.mount(document.getElementById('bank-import-host'));

   OFFLINE: parsing, categorisation and review are entirely local, so a statement can be
   prepared with no connection. Only the final Import needs the network; if it fails the
   reviewed batch is kept in localStorage under BANK_DRAFT_KEY and offered again on reload.
   ===================================================================================== */

var BankImport = (function () {
  'use strict';

  var API = null, TOAST = null, BRANCH_OF = null;
  var DRAFT_KEY = 'nakoda.bankimport.draft.v1';

  var CAT_CASH = 'Cash deposit';
  var CAT_CARD = 'Card settlement';
  var CAT_XFER = 'Inter-branch transfer';

  /* Must stay in step with SKIP_CATS_ in BANK_IMPORT_v274.gs. These come from payroll and
     field claims, so importing them from the bank would double-count. */
  var SKIP_CATS = ['Salary', 'Petrol'];

  var CATEGORIES = [
    CAT_CASH, CAT_CARD, CAT_XFER,
    'Material Purchased', 'Outsourced Services', 'Professional fees', 'Rent',
    'Light bill', 'Miscellaneous', 'Management cost', 'Software cost', 'Sales',
    'Marketing', 'Salary', 'Petrol',
    'Company capital', 'Partner capital', 'Income of previous month'
  ];

  /* Order matters — first match wins. Mirrors BANK_RULES_BUILTIN_ on the server. */
  var RULES = [
    { re: /^KOTAKPAYOUT/i,                                  cat: CAT_CARD },
    { re: /CASH\s+DEPOSIT/i,                                cat: CAT_CASH },
    { re: /NAK[DO]{2}A|DIAGN[OS]{2}[ST]IC[S]?\s+P(VT|R|$)/i, cat: CAT_XFER },
    { re: /SALARY/i,                                        cat: 'Salary' },
    { re: /PETROL/i,                                        cat: 'Petrol' },
    { re: /UNIPATH/i,                                       cat: 'Outsourced Services' },
    { re: /DIAGNOSTIC\s+SERVICE/i,                          cat: 'Outsourced Services' },
    { re: /TANISH/i,                                        cat: 'Material Purchased' },
    { re: /RAJHANS\s+RESIDENCY/i,                           cat: 'Rent' },
    { re: /TORRENT\s+POWER|ELECTRIC/i,                      cat: 'Light bill' },
    { re: /\bTEA\b|\bSNACK/i,                               cat: 'Miscellaneous' }
  ];
  var LEARNED = [];

  /* ---------------------------------------------------------------- CSV primitives */

  /* RFC4180-ish splitter: handles quoted fields containing commas ("1,09,073.11") and
     escaped double quotes. Returns an array of cells for one physical line. */
  function splitCsvLine(line) {
    var out = [], cur = '', q = false, i, c;
    for (i = 0; i < line.length; i++) {
      c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  /* Strips Indian grouping ("1,09,073.11"), currency marks, whitespace, and any stray
     quote characters. splitCsvLine already unwraps properly-quoted fields, but some banks
     emit a quoted number inside an otherwise unquoted field, so the guard stays. */
  function toNumber(s) {
    s = String(s == null ? '' : s).replace(/[",]/g, '').replace(/[₹\s]/g, '').trim();
    if (!s) return 0;
    var n = Number(s);
    return isFinite(n) ? n : 0;
  }

  /* DD-MM-YYYY or DD/MM/YYYY, with or without a trailing time, to yyyy-MM-dd. */
  function toIsoDate(s) {
    var m = String(s || '').trim().match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
    if (!m) return '';
    var d = m[1], mo = m[2], y = m[3];
    if (y.length === 2) y = '20' + y;
    return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
  }

  function fmtInr(n) {
    var neg = n < 0;
    var s = Math.round(Math.abs(Number(n) || 0)).toString();
    var last3 = s.slice(-3), rest = s.slice(0, -3);
    if (rest) last3 = ',' + last3;
    var grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + last3;
    return (neg ? '-₹' : '₹') + grouped;
  }

  /* ---------------------------------------------------------------- the parser */

  /* Returns { meta, rows, warnings } or throws with a message worth showing a user. */
  function parseStatement(text, fileName) {
    var lines = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    var headerIdx = -1, i;
    for (i = 0; i < lines.length; i++) {
      if (/^\s*"?Sl\.?\s*No\.?"?\s*,/i.test(lines[i])) { headerIdx = i; break; }
    }
    if (headerIdx < 0) {
      for (i = 0; i < lines.length && headerIdx < 0; i++) {
        var probe = splitCsvLine(lines[i]).map(function (c) { return c.trim().toLowerCase(); });
        var hasDate = probe.some(function (c) { return /date/.test(c); });
        var hasAmt = probe.some(function (c) { return /debit|withdraw/.test(c); }) &&
                     probe.some(function (c) { return /credit|deposit/.test(c); });
        if (hasDate && hasAmt) headerIdx = i;
      }
    }
    if (headerIdx < 0) throw new Error('Could not find the transaction header row. Is this a bank statement CSV?');

    var head = splitCsvLine(lines[headerIdx]).map(function (c) { return c.trim(); });
    var lower = head.map(function (c) { return c.toLowerCase(); });
    function col() {
      for (var a = 0; a < arguments.length; a++) {
        var pat = arguments[a];
        for (var c = 0; c < lower.length; c++) if (pat.test(lower[c])) return c;
      }
      return -1;
    }
    var iValue = col(/^value\s*date/, /^date$/, /transaction\s*date/);
    var iTxn   = col(/transaction\s*date/, /^date$/);
    var iDesc  = col(/description/, /narration/, /particular/, /remark/);
    var iRef   = col(/ref/, /chq/, /cheque/, /utr/);
    var iDeb   = col(/debit/, /withdraw/);
    var iCre   = col(/credit/, /deposit/);
    var iBal   = col(/balance/);
    if (iDesc < 0) throw new Error('No description/narration column found.');
    if (iDeb < 0 || iCre < 0) throw new Error('This file does not have separate Debit and Credit columns. Send it over and I will add support for its layout.');
    if (iValue < 0) throw new Error('No date column found.');

    /* Header block: key/value pairs anywhere above the table. */
    var meta = { accountNo: '', period: '', ifsc: '', bankBranch: '', entity: '', branchHint: '', fileName: fileName || '' };
    for (i = 0; i < headerIdx; i++) {
      var cells = splitCsvLine(lines[i]).map(function (c) { return c.trim(); });
      for (var c2 = 0; c2 < cells.length; c2++) {
        var key = cells[c2].toLowerCase().replace(/[.:]/g, '').trim();
        var val = (cells[c2 + 1] || '').trim();
        if (!val) continue;
        if (key === 'account no' || key === 'account number') meta.accountNo = val.replace(/\D/g, '');
        else if (key === 'period') meta.period = val;
        else if (key === 'ifsc') meta.ifsc = val;
        else if (key === 'branch') meta.bankBranch = val;
      }
      if (!meta.entity && cells[0] && /LIMITED|PVT|PRIVATE|LLP/i.test(cells[0])) {
        meta.entity = cells[0];
        var dash = cells[0].split(/\s+-\s+/);
        if (dash.length > 1) meta.branchHint = dash[dash.length - 1].trim();
      }
    }
    if (!meta.accountNo) {
      var fromName = String(fileName || '').match(/(\d{8,})/);
      if (fromName) meta.accountNo = fromName[1];
    }
    var per = String(meta.period).match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}).*?(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
    meta.from = per ? toIsoDate(per[1]) : '';
    meta.to   = per ? toIsoDate(per[2]) : '';
    meta.month = meta.from ? meta.from.slice(0, 7) : '';

    var rows = [], warnings = [];
    for (i = headerIdx + 1; i < lines.length; i++) {
      var raw = lines[i];
      if (!raw || !raw.trim()) continue;
      if (/^"?closing\s+balance/i.test(raw)) break;
      var p = splitCsvLine(raw);
      var desc = (p[iDesc] || '').replace(/\s+/g, ' ').trim();
      var deb = toNumber(p[iDeb]), cre = toNumber(p[iCre]);
      var date = toIsoDate(p[iValue]) || toIsoDate(p[iTxn]);
      if (!date && !deb && !cre) continue;
      if (!desc && !deb && !cre) continue;
      if (deb && cre) { warnings.push('Row ' + (i + 1) + ' has both a debit and a credit — skipped.'); continue; }
      if (!deb && !cre) { warnings.push('Row ' + (i + 1) + ' ("' + desc.slice(0, 30) + '") has no amount — skipped.'); continue; }
      if (!date) { warnings.push('Row ' + (i + 1) + ' has an unreadable date — skipped.'); continue; }

      rows.push({
        date: date,
        txnDate: toIsoDate(p[iTxn]) || date,
        description: desc,
        ref: (iRef >= 0 ? String(p[iRef] || '').trim() : ''),
        dir: cre > 0 ? 'in' : 'out',
        amount: cre > 0 ? cre : deb,
        balance: iBal >= 0 ? toNumber(p[iBal]) : null,
        category: '',
        skip: false,
        auto: false,
        postMonth: ''
      });
    }
    if (!rows.length) throw new Error('Found the header but no usable transaction rows.');

    /* Balance-chain check. Rows are newest-first, so walk them oldest-first and confirm
       balance[n] = balance[n-1] + credit - debit. This is what proves direction was taken
       from the right place — if a bank ever flips its column order this fails loudly
       instead of importing every debit as income. */
    var chain = { checked: 0, ok: 0 };
    if (rows.length > 1 && rows[0].balance !== null) {
      var asc = rows.slice().reverse();
      for (i = 1; i < asc.length; i++) {
        var prev = asc[i - 1], cur = asc[i];
        if (prev.balance === null || cur.balance === null) continue;
        var expect = prev.balance + (cur.dir === 'in' ? cur.amount : -cur.amount);
        chain.checked++;
        if (Math.abs(expect - cur.balance) < 0.02) chain.ok++;
      }
      if (chain.checked && chain.ok / chain.checked < 0.9) {
        warnings.push('Balance check failed on ' + (chain.checked - chain.ok) + ' of ' + chain.checked +
          ' rows. The debit/credit columns may be reversed — review carefully before importing.');
      }
    }
    meta.chain = chain;

    categorise(rows);
    return { meta: meta, rows: rows, warnings: warnings };
  }

  function categorise(rows) {
    rows.forEach(function (r) {
      var hit = null, k;
      for (k = 0; k < LEARNED.length; k++) {
        var L = LEARNED[k];
        var ok = L.matchType === 'regex'
          ? new RegExp(L.pattern, 'i').test(r.description)
          : r.description.toUpperCase().indexOf(String(L.pattern).toUpperCase()) >= 0;
        if (ok) { hit = { cat: L.cat, skip: L.skip }; break; }
      }
      if (!hit) {
        for (k = 0; k < RULES.length; k++) {
          if (RULES[k].re.test(r.description)) { hit = { cat: RULES[k].cat }; break; }
        }
      }
      if (hit) {
        r.category = hit.cat;
        r.auto = true;
        r.skip = hit.skip || SKIP_CATS.indexOf(hit.cat) >= 0;
      } else {
        r.category = '';
        r.auto = false;
        r.skip = false;
      }
      /* A credit must never be categorised as an expense head, and vice versa. Guards
         against a learned rule being taught on the wrong direction. */
      if (r.dir === 'in' && r.category && [CAT_CASH, CAT_CARD, 'Company capital', 'Partner capital', 'Income of previous month'].indexOf(r.category) < 0 && r.category !== CAT_XFER) {
        r.category = ''; r.auto = false;
      }
    });
  }

  /* ---------------------------------------------------------------- state + render */

  var state = { meta: null, rows: [], warnings: [], branchId: '', branchName: '', busy: false, host: null, result: null };

  function summarise() {
    var s = { rows: state.rows.length, write: 0, skip: 0, need: 0, cash: 0, card: 0, out: 0, xfer: 0, byCat: {} };
    state.rows.forEach(function (r) {
      if (!r.category) { s.need++; return; }
      if (r.skip) { s.skip++; return; }
      s.write++;
      s.byCat[r.category] = (s.byCat[r.category] || 0) + r.amount;
      if (r.category === CAT_CASH) s.cash += r.amount;
      else if (r.category === CAT_CARD) s.card += r.amount;
      else if (r.category === CAT_XFER) s.xfer += r.amount;
      else if (r.dir === 'out') s.out += r.amount;
    });
    return s;
  }

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render() {
    var host = state.host;
    if (!host) return;
    host.innerHTML = '';

    var card = el('div', { class: 'bi-card' });
    host.appendChild(card);

    if (!state.rows.length) {
      card.appendChild(el('div', { class: 'bi-drop', id: 'bi-drop' },
        '<div class="bi-drop-t">Drop a bank statement CSV here</div>' +
        '<div class="bi-drop-s">or <button type="button" class="bi-link" id="bi-pick">choose a file</button></div>' +
        '<div class="bi-drop-h">One account per file. The branch is matched on the account number.</div>'));
      var fi = el('input', { type: 'file', accept: '.csv,text/csv', id: 'bi-file', style: 'display:none' });
      card.appendChild(fi);

      var hist = el('div', { class: 'bi-empty' },
        '<div class="bi-empty-n">No statement imported yet</div>' +
        '<div class="bi-empty-s">Every finance column reads ' + fmtInr(0) + ' until a statement is imported.</div>');
      card.appendChild(hist);

      var pick = function () { fi.click(); };
      card.querySelector('#bi-pick').addEventListener('click', pick);
      card.querySelector('#bi-drop').addEventListener('click', pick);
      fi.addEventListener('change', function () { if (fi.files && fi.files[0]) readFile(fi.files[0]); });
      var dz = card.querySelector('#bi-drop');
      ['dragover', 'dragenter'].forEach(function (e) {
        dz.addEventListener(e, function (ev) { ev.preventDefault(); dz.classList.add('bi-over'); });
      });
      ['dragleave', 'drop'].forEach(function (e) {
        dz.addEventListener(e, function (ev) { ev.preventDefault(); dz.classList.remove('bi-over'); });
      });
      dz.addEventListener('drop', function (ev) {
        var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
        if (f) readFile(f);
      });
      return;
    }

    var s = summarise(), m = state.meta;

    var top = el('div', { class: 'bi-head' },
      '<div class="bi-file"><span class="bi-fn">' + esc(m.fileName || 'statement.csv') + '</span>' +
      '<span class="bi-sub">' + s.rows + ' transactions' + (m.from ? ' · ' + esc(m.from) + ' to ' + esc(m.to) : '') + '</span></div>' +
      '<button type="button" class="bi-btn" id="bi-reset">Start over</button>');
    card.appendChild(top);

    var chips = el('div', { class: 'bi-chips' });
    chips.innerHTML =
      '<span class="bi-chip ' + (state.branchId ? 'ok' : 'warn') + '">A/c ••' + esc(String(m.accountNo).slice(-4)) + ' → ' +
        esc(state.branchName || 'not matched') + '</span>' +
      (m.month ? '<span class="bi-chip">Posts to ' + esc(m.month) + '</span>' : '') +
      (m.branchHint ? '<span class="bi-chip muted">File says "' + esc(m.branchHint) + '"</span>' : '') +
      (m.bankBranch ? '<span class="bi-chip muted">Bank branch: ' + esc(m.bankBranch) + ' (ignored)</span>' : '') +
      (m.chain && m.chain.checked ? '<span class="bi-chip ' + (m.chain.ok === m.chain.checked ? 'ok' : 'warn') + '">Balance check ' + m.chain.ok + '/' + m.chain.checked + '</span>' : '');
    card.appendChild(chips);

    var stats = el('div', { class: 'bi-stats' });
    stats.innerHTML =
      statBox('Will import', s.write) + statBox('Skipped', s.skip) +
      statBox('Need a category', s.need, s.need ? 'warn' : '');
    card.appendChild(stats);

    if (s.need) {
      card.appendChild(el('div', { class: 'bi-note warn' },
        s.need + ' row' + (s.need === 1 ? '' : 's') + ' still need a category. Nothing is written until you press Import.'));
    }
    state.warnings.forEach(function (w) { card.appendChild(el('div', { class: 'bi-note warn' }, esc(w))); });
    if (s.skip) {
      card.appendChild(el('div', { class: 'bi-note' },
        s.skip + ' row' + (s.skip === 1 ? '' : 's') + ' marked skip — salary comes from payslips and petrol from approved field claims, so importing them here would count them twice.'));
    }

    var wrap = el('div', { class: 'bi-tablewrap' });
    var t = el('table', { class: 'bi-table' });
    t.innerHTML = '<thead><tr>' +
      '<th>Date</th><th>Narration</th><th class="r">Amount</th><th>Category</th><th class="c">Skip</th>' +
      '</tr></thead>';
    var tb = el('tbody');
    state.rows.forEach(function (r, i) {
      var tr = el('tr', { class: (!r.category ? 'bi-need' : (r.skip ? 'bi-skip' : '')) });
      var opts = ['<option value="">Pick a category</option>'].concat(CATEGORIES.filter(function (c) {
        if (r.dir === 'in') return [CAT_CASH, CAT_CARD, CAT_XFER, 'Company capital', 'Partner capital', 'Income of previous month'].indexOf(c) >= 0;
        return [CAT_CASH, CAT_CARD].indexOf(c) < 0;
      }).map(function (c) {
        return '<option value="' + esc(c) + '"' + (c === r.category ? ' selected' : '') + '>' + esc(c) + '</option>';
      })).join('');
      tr.innerHTML =
        '<td class="bi-d">' + esc(r.date.slice(8) + '/' + r.date.slice(5, 7)) + '</td>' +
        '<td class="bi-n" title="' + esc(r.description) + '">' + esc(r.description) +
          (r.auto ? '' : ' <span class="bi-flag">new</span>') + '</td>' +
        '<td class="r ' + (r.dir === 'in' ? 'bi-in' : '') + '">' + (r.dir === 'in' ? '+' : '−') + fmtInr(r.amount).replace('₹', '') + '</td>' +
        '<td><select class="bi-cat" data-i="' + i + '">' + opts + '</select></td>' +
        '<td class="c"><input type="checkbox" class="bi-skipbox" data-i="' + i + '"' + (r.skip ? ' checked' : '') + '></td>';
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    card.appendChild(wrap);

    var recon = el('div', { class: 'bi-recon' });
    recon.innerHTML =
      '<div class="bi-recon-t">What this import adds</div>' +
      '<div class="bi-recon-g">' +
      reconBox('Cash deposits', s.cash, 'reconciles against expected to bank') +
      reconBox('Card settlements', s.card, 'kept out of the cash reconcile') +
      reconBox('Expenses', s.out, 'fills the category columns') +
      reconBox('Transfers', s.xfer, 'excluded from P and L') +
      '</div>';
    card.appendChild(recon);

    var foot = el('div', { class: 'bi-foot' });
    foot.innerHTML =
      '<button type="button" class="bi-btn primary" id="bi-go"' + (state.busy || !state.branchId ? ' disabled' : '') + '>' +
        (state.busy ? 'Importing…' : 'Import ' + s.write + ' row' + (s.write === 1 ? '' : 's')) + '</button>' +
      '<button type="button" class="bi-btn" id="bi-cancel">Cancel</button>' +
      '<span class="bi-hint">Writes to Acc_Ledger · one undoable batch</span>';
    card.appendChild(foot);

    card.querySelector('#bi-reset').addEventListener('click', reset);
    card.querySelector('#bi-cancel').addEventListener('click', reset);
    card.querySelector('#bi-go').addEventListener('click', doImport);
    Array.prototype.forEach.call(card.querySelectorAll('.bi-cat'), function (sel) {
      sel.addEventListener('change', function () {
        var r = state.rows[+sel.getAttribute('data-i')];
        r.category = sel.value;
        r.skip = SKIP_CATS.indexOf(r.category) >= 0;
        if (r.category) rememberRule(r);
        render();
      });
    });
    Array.prototype.forEach.call(card.querySelectorAll('.bi-skipbox'), function (cb) {
      cb.addEventListener('change', function () {
        state.rows[+cb.getAttribute('data-i')].skip = cb.checked;
        render();
      });
    });
  }

  function statBox(label, n, cls) {
    return '<div class="bi-stat ' + (cls || '') + '"><div class="bi-stat-l">' + label + '</div><div class="bi-stat-n">' + n + '</div></div>';
  }
  function reconBox(label, amt, sub) {
    return '<div class="bi-rb"><div class="bi-rb-l">' + label + '</div><div class="bi-rb-n">' + fmtInr(amt) + '</div><div class="bi-rb-s">' + sub + '</div></div>';
  }

  /* Teach the server the stable part of a narration so the next statement matches it.
     Strips trailing reference/date noise: "KOTAKPAYOUT-0790872A0287964-310726" and
     "NEFT-UNIPATH SPECIALTY LA-CMS1942616983895" both reduce to a reusable stem. */
  function rememberRule(r) {
    var stem = String(r.description)
      .replace(/-[A-Z]{2,4}\d[\w]*$/i, '')
      .replace(/[-–]\s*\d[\d\/\-]*$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (stem.length < 4) return;
    LEARNED.unshift({ pattern: stem, matchType: 'contains', cat: r.category, skip: r.skip });
    if (!API) return;
    API({ action: 'saveBankRule', data: { pattern: stem, matchType: 'contains', category: r.category, skip: r.skip } })
      .catch(function () { /* offline: the local rule still applies to this session */ });
  }

  /* ---------------------------------------------------------------- actions */

  function readFile(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var parsed = parseStatement(String(fr.result), file.name);
        state.meta = parsed.meta;
        state.rows = parsed.rows;
        state.warnings = parsed.warnings;
        state.branchId = '';
        state.branchName = '';
        render();
        resolveBranch();
      } catch (e) {
        say(e.message || 'Could not read that file.');
      }
    };
    fr.onerror = function () { say('Could not read that file.'); };
    fr.readAsText(file);
  }

  function resolveBranch() {
    if (!API || !state.meta || !state.meta.accountNo) return;
    API({ action: 'bankResolveAccount', accountNo: state.meta.accountNo })
      .then(function (res) {
        if (res && res.ok) { state.branchId = res.branchId; state.branchName = res.branchName; }
        else say((res && res.error) || 'Could not match that account to a branch.');
        render();
      })
      .catch(function () { say('Offline — connect once to match the account to a branch.'); });
  }

  function doImport() {
    if (!API || state.busy) return;
    var payload = state.rows.filter(function (r) { return r.category && !r.skip; }).map(function (r) {
      return { date: r.date, dir: r.dir, amount: r.amount, category: r.category, ref: r.ref,
               description: r.description, details: r.txnDate, postMonth: r.postMonth || '' };
    });
    if (!payload.length) { say('Nothing to import — every row is skipped or uncategorised.'); return; }
    state.busy = true; render();
    var meta = { accountNo: state.meta.accountNo, period: state.meta.month,
                 fileName: state.meta.fileName, branchId: state.branchId };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ rows: payload, meta: meta })); } catch (e) {}
    API({ action: 'saveBankRows', rows: payload, meta: meta })
      .then(function (res) {
        state.busy = false;
        if (!res || !res.ok) { say((res && res.error) || 'Import failed.'); render(); return; }
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
        say('Imported ' + res.saved + ' rows' +
            (res.duplicates ? ' · ' + res.duplicates + ' already present' : '') +
            (res.skipped ? ' · ' + res.skipped + ' skipped' : ''));
        reset();
      })
      .catch(function () {
        state.busy = false;
        say('No connection. Your reviewed batch is saved and will be offered again when you reopen this screen.');
        render();
      });
  }

  function reset() {
    state.meta = null; state.rows = []; state.warnings = []; state.branchId = '';
    state.branchName = ''; state.busy = false;
    render();
  }

  function say(msg) { if (TOAST) TOAST(msg); else if (window.console) console.log('[bank-import] ' + msg); }

  /* ---------------------------------------------------------------- styles */

  var CSS = [
    '.bi-card{background:#fff;border:1px solid #e6e4de;border-radius:12px;padding:16px 18px}',
    '.bi-drop{border:1.5px dashed #cfcdc5;border-radius:10px;padding:28px 16px;text-align:center;cursor:pointer}',
    '.bi-drop.bi-over{border-color:#639922;background:#f6fbef}',
    '.bi-drop-t{font-size:15px;font-weight:500}',
    '.bi-drop-s{font-size:13px;color:#6b6a64;margin-top:4px}',
    '.bi-drop-h{font-size:12px;color:#918f88;margin-top:10px}',
    '.bi-link{background:none;border:none;color:#185fa5;cursor:pointer;font-size:13px;padding:0;text-decoration:underline}',
    '.bi-empty{margin-top:14px;padding:14px;background:#f7f6f2;border-radius:10px;text-align:center}',
    '.bi-empty-n{font-size:14px;font-weight:500}',
    '.bi-empty-s{font-size:12px;color:#6b6a64;margin-top:3px}',
    '.bi-head{display:flex;align-items:center;gap:12px;margin-bottom:10px}',
    '.bi-file{flex:1;min-width:0}',
    '.bi-fn{font-size:15px;font-weight:500;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.bi-sub{font-size:12px;color:#6b6a64}',
    '.bi-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}',
    '.bi-chip{font-size:12px;padding:3px 9px;border-radius:6px;background:#f1efe8;color:#444441}',
    '.bi-chip.ok{background:#eaf3de;color:#3b6d11}',
    '.bi-chip.warn{background:#faeeda;color:#854f0b}',
    '.bi-chip.muted{background:transparent;color:#918f88}',
    '.bi-stats{display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap}',
    '.bi-stat{flex:1;min-width:96px;background:#f7f6f2;border-radius:8px;padding:10px 12px}',
    '.bi-stat.warn{background:#faeeda}',
    '.bi-stat-l{font-size:12px;color:#6b6a64}',
    '.bi-stat-n{font-size:20px;font-weight:500}',
    '.bi-note{font-size:12px;padding:8px 11px;border-radius:8px;background:#f1efe8;color:#444441;margin-bottom:8px}',
    '.bi-note.warn{background:#faeeda;color:#854f0b}',
    '.bi-tablewrap{border:1px solid #e6e4de;border-radius:10px;overflow:auto;max-height:420px;margin:10px 0}',
    '.bi-table{width:100%;border-collapse:collapse;font-size:12.5px}',
    '.bi-table th{position:sticky;top:0;background:#f7f6f2;text-align:left;padding:8px 10px;font-weight:500;color:#6b6a64;white-space:nowrap}',
    '.bi-table td{padding:7px 10px;border-top:1px solid #f0eee8;vertical-align:middle}',
    '.bi-table .r{text-align:right}.bi-table .c{text-align:center}',
    '.bi-d{color:#6b6a64;white-space:nowrap}',
    '.bi-n{max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.bi-in{color:#3b6d11}',
    '.bi-need{background:#fdf7ec}.bi-skip{opacity:.55}',
    '.bi-flag{font-size:10px;background:#e6f1fb;color:#185fa5;padding:1px 5px;border-radius:4px}',
    '.bi-cat{font-size:12px;padding:3px 6px;max-width:170px}',
    '.bi-recon{background:#f7f6f2;border-radius:10px;padding:12px 14px;margin-bottom:12px}',
    '.bi-recon-t{font-size:12px;color:#6b6a64;margin-bottom:8px}',
    '.bi-recon-g{display:flex;gap:14px;flex-wrap:wrap}',
    '.bi-rb{flex:1;min-width:120px}',
    '.bi-rb-l{font-size:12px;color:#6b6a64}',
    '.bi-rb-n{font-size:17px;font-weight:500}',
    '.bi-rb-s{font-size:11px;color:#918f88}',
    '.bi-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '.bi-btn{font-size:13px;padding:7px 14px;border-radius:8px;border:1px solid #cfcdc5;background:#fff;cursor:pointer}',
    '.bi-btn.primary{background:#1f1f1d;color:#fff;border-color:#1f1f1d}',
    '.bi-btn[disabled]{opacity:.5;cursor:default}',
    '.bi-hint{font-size:11px;color:#918f88}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('bi-css')) return;
    var st = document.createElement('style');
    st.id = 'bi-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------------------------------------------------------------- public */

  /* ---------------------------------------------------------------- self-wiring
     So this file works with ONE script tag and no edits to app.js / api.js / accounts.js.
     If you would rather wire it explicitly, call BankImport.init({call: yourApiFn}) and
     BankImport.mount(el) yourself — an explicit init always wins over auto-detection. */

  /* Your app already has some function that posts {action:...} to the /exec URL. Rather than
     guess its name wrongly and fail silently, try each known shape and verify it actually
     answers before adopting it. */
  function autoDetectApi() {
    var names = ['api', 'callApi', 'apiCall', 'call', 'request', 'post', 'send', 'rpc', 'server'];
    var i, fn;
    for (i = 0; i < names.length; i++) {
      fn = window[names[i]];
      if (typeof fn === 'function') return wrapMaybePromise(fn);
    }
    var objs = ['API', 'Api', 'App', 'app', 'NAKODA', 'Nakoda'];
    for (i = 0; i < objs.length; i++) {
      var o = window[objs[i]];
      if (o && typeof o === 'object') {
        var keys = ['call', 'api', 'post', 'request', 'send'];
        for (var k = 0; k < keys.length; k++) {
          if (typeof o[keys[k]] === 'function') return wrapMaybePromise(o[keys[k]].bind(o));
        }
      }
    }
    return null;
  }

  /* Accepts a callback-style OR promise-style caller and always returns a promise. */
  function wrapMaybePromise(fn) {
    return function (payload) {
      var out;
      try { out = fn(payload); } catch (e) { return Promise.reject(e); }
      if (out && typeof out.then === 'function') return out;
      return new Promise(function (resolve, reject) {
        try { fn(payload, function (res) { resolve(res); }, function (e) { reject(e); }); }
        catch (e2) { reject(e2); }
      });
    };
  }

  /* Last resort: post directly to the /exec URL. Looks for it wherever config.js may have
     parked it. config.js is never overwritten, so this reads it rather than hardcoding. */
  function directApi() {
    var url = '';
    var cands = ['EXEC_URL', 'API_URL', 'SCRIPT_URL', 'WEBAPP_URL', 'BASE_URL', 'ENDPOINT'];
    var holders = [window, window.CONFIG || {}, window.config || {}, window.Config || {}, window.APP_CONFIG || {}];
    for (var h = 0; h < holders.length && !url; h++) {
      for (var c = 0; c < cands.length && !url; c++) {
        var v = holders[h] && holders[h][cands[c]];
        if (typeof v === 'string' && v.indexOf('/exec') > 0) url = v;
      }
    }
    if (!url) return null;
    /* doPost does JSON.parse(e.postData.contents), so the body MUST be JSON - a form-encoded
       body parses to {} and comes back "Bad request." Content-Type has to be text/plain:
       application/json triggers a CORS preflight, which Apps Script web apps do not answer. */
    return function (payload) {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json(); });
    };
  }

  /* Token: whatever key the app already stores its session under. */
  function findToken() {
    var keys = ['token', 'authToken', 'sessionToken', 'nakoda.token', 'nakodaToken', 'mis.token'];
    for (var i = 0; i < keys.length; i++) {
      try { var v = localStorage.getItem(keys[i]); if (v && v.length > 6) return v.replace(/^"|"$/g, ''); } catch (e) {}
    }
    for (var k = 0; k < localStorage.length; k++) {
      try {
        var name = localStorage.key(k);
        if (/token/i.test(name)) { var val = localStorage.getItem(name); if (val && val.length > 6) return val.replace(/^"|"$/g, ''); }
      } catch (e) {}
    }
    return '';
  }

  /* Wrap whichever caller we found so every request carries the session token, in case the
     app's own helper adds it and ours does not. */
  function withToken(fn) {
    return function (payload) {
      if (!payload.token) { var t = findToken(); if (t) payload.token = t; }
      return fn(payload);
    };
  }

  /* Build a screen with no help from the host app: a launcher button, and a panel it opens.
     Used only when no host element is supplied. */
  function standalone() {
    injectCss();
    if (document.getElementById('bi-standalone')) return;
    var st = document.createElement('style');
    st.textContent =
      '#bi-launch{position:fixed;right:16px;bottom:16px;z-index:9998;background:#1f1f1d;color:#fff;' +
      'border:none;border-radius:24px;padding:11px 18px;font-size:13px;cursor:pointer}' +
      '#bi-standalone{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.4);display:none;' +
      'align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px}' +
      '#bi-standalone.on{display:flex}' +
      '#bi-panel{width:100%;max-width:820px;background:#f7f6f2;border-radius:14px;padding:14px}' +
      '#bi-close{float:right;background:none;border:none;font-size:20px;cursor:pointer;line-height:1;color:#6b6a64}';
    document.head.appendChild(st);

    var btn = document.createElement('button');
    btn.id = 'bi-launch'; btn.type = 'button'; btn.textContent = 'Bank import';
    document.body.appendChild(btn);

    var ov = document.createElement('div');
    ov.id = 'bi-standalone';
    ov.innerHTML = '<div id="bi-panel"><button id="bi-close" type="button" aria-label="Close">&times;</button>' +
                   '<div id="bi-host"></div></div>';
    document.body.appendChild(ov);

    btn.addEventListener('click', function () { ov.classList.add('on'); });
    ov.querySelector('#bi-close').addEventListener('click', function () { ov.classList.remove('on'); });
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.classList.remove('on'); });

    state.host = ov.querySelector('#bi-host');
    render();
  }

  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    if (!API) {
      var found = autoDetectApi() || directApi();
      if (found) API = withToken(found);
    }
    if (!TOAST) {
      TOAST = function (m) {
        var t = ['showToast', 'toast', 'notify', 'flash', 'msg'];
        for (var i = 0; i < t.length; i++) if (typeof window[t[i]] === 'function') return window[t[i]](m);
        alert(m);
      };
    }
    if (API) {
      API({ action: 'bankRules' }).then(function (res) {
        if (res && res.ok && res.learned) LEARNED = res.learned;
      }).catch(function () {});
    }
    var host = document.getElementById('bank-import-host') || document.getElementById('bi-host');
    if (host) { injectCss(); state.host = host; render(); }
    else standalone();
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else setTimeout(boot, 0);
  }

  return {
    init: function (opts) {
      opts = opts || {};
      if (opts.call) API = wrapMaybePromise(opts.call);
      TOAST = opts.toast || TOAST;
      BRANCH_OF = opts.branchOf || null;
      booted = true;
      if (API) {
        API({ action: 'bankRules' }).then(function (res) {
          if (res && res.ok && res.learned) LEARNED = res.learned;
        }).catch(function () {});
      }
    },
    mount: function (host) {
      injectCss();
      booted = true;
      state.host = host || state.host;
      render();
    },
    /* Diagnostic — run BankImport.diagnose() in the browser console if the button does
       nothing. Tells you exactly which piece did not connect. */
    diagnose: function () {
      var d = {
        apiConnected: !!API,
        tokenFound: !!findToken(),
        hostElement: !!(document.getElementById('bank-import-host') || document.getElementById('bi-host')),
        detected: autoDetectApi() ? 'a global api function' : (directApi() ? 'the /exec URL from config' : 'NOTHING — call BankImport.init({call: yourApiFn})')
      };
      if (window.console) console.table ? console.table(d) : console.log(d);
      return d;
    },
    /* Exposed for tests and for reuse by any other importer. */
    parseStatement: parseStatement,
    _internal: { splitCsvLine: splitCsvLine, toNumber: toNumber, toIsoDate: toIsoDate, fmtInr: fmtInr, categorise: categorise }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = BankImport;
