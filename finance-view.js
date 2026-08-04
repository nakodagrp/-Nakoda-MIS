/* =====================================================================================
   NAKODA MIS — finance-view.js   (v275)
   =====================================================================================
   The finance-by-branch screen, driven entirely by apiFinanceDashboard. Renders the layout
   from the approved mockup: reconcile strip, bank credits split, the by-branch table with
   every category column, and the transfers panel.

   Nothing here invents a number. Every figure is a field returned by the server, so before
   any statement is imported the whole screen reads zero — as it should.

   WHAT THIS FIXES ON THE CURRENT SCREEN
   The Diff chip compared "expected to bank" against bankActual, which sums EVERY bank credit
   including card/gateway settlements. Card money never passes through the branch's cash box,
   so it does not belong in a cash reconcile, and mixing it in made the chip permanently red
   (the ₹-56,918 · check you were seeing). This view uses bankDiff, which the server computes
   as (collCash − cashExp) − bankCash.

   COLUMN SOURCES — deliberately shown to the user, because "why is Salary zero" is the first
   question this screen provokes:
     Revenue / B2C / patients / tests   Acc_Daily (daily business entry)
     B2D / B2B                          Acc_Daily + Acc_Invoices
     Salary                             Payslips (earned + fieldPay), ledger only as fallback
     Petrol                             approved Field_Claims, ledger only as fallback
     every other category               Acc_Ledger — which is what the bank import fills
     Bank actual / cash / card          Acc_Ledger rows with source 'bank'

   WIRING — one script tag, same as bank-import.js:
       <script src="finance-view.js"></script>
   It renders into <div id="finance-view-host"></div> if that exists, otherwise it adds a
   "Finance" button bottom-left that opens it in a panel. To wire it explicitly instead:
       FinanceView.init({ call: api });  FinanceView.mount(el);
   Run FinanceView.diagnose() in the console if it does not connect.
   ===================================================================================== */

var FinanceView = (function () {
  'use strict';

  var API = null, TOAST = null, booted = false;

  /* Column order for the table. `key` is read from row.cat[...] unless `top` is set, in which
     case it is a top-level field on the row. Keep in step with the CATS array in Code.gs. */
  var COLS = [
    { label: 'P / L',             top: 'net',      strong: true, signed: true },
    { label: 'Revenue',          top: 'revenue' },
    { label: 'B2C',              top: 'b2c' },
    { label: 'B2D',              top: 'b2d' },
    { label: 'B2B',              top: 'b2b' },
    { label: 'Gross',            top: 'gross' },
    { label: 'Material',         key: 'Material',          cost: true },
    { label: 'Outsourced',       key: 'Outsourced',        cost: true },
    { label: 'Prof. fees',       key: 'Professional fees', cost: true },
    { label: 'Salary',           key: 'Salary',            cost: true, src: 'payslips' },
    { label: 'Rent',             key: 'Rent',              cost: true },
    { label: 'Light bill',       key: 'Light bill',        cost: true },
    { label: 'Petrol',           key: 'Petrol',            cost: true, src: 'claims' },
    { label: 'Misc',             key: 'Miscellaneous',     cost: true },
    { label: 'Management',       key: 'Management cost',   cost: true },
    { label: 'Software',         key: 'Software cost',     cost: true },
    { label: 'Sales',            key: 'Sales',             cost: true },
    { label: 'Marketing',        key: 'Marketing',         cost: true },
    { label: 'Bank actual',      top: 'bankActual' }
  ];

  var state = { host: null, month: '', rows: [], branch: '', loading: false, error: '' };

  /* ---------------------------------------------------------------- formatting */

  function fmtInr(n) {
    n = Number(n) || 0;
    var neg = n < 0;
    var s = Math.round(Math.abs(n)).toString();
    var last3 = s.slice(-3), rest = s.slice(0, -3);
    if (rest) last3 = ',' + last3;
    return (neg ? '-₹' : '₹') + rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + last3;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function thisMonth() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }
  function monthLabel(ym) {
    var M = ['January', 'February', 'March', 'April', 'May', 'June',
             'July', 'August', 'September', 'October', 'November', 'December'];
    var p = String(ym).split('-');
    return (M[(+p[1] || 1) - 1] || '') + ' ' + (p[0] || '');
  }
  function monthOptions(sel) {
    var out = [], d = new Date();
    for (var i = 0; i < 18; i++) {
      var ym = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
      out.push('<option value="' + ym + '"' + (ym === sel ? ' selected' : '') + '>' + monthLabel(ym) + '</option>');
      d.setMonth(d.getMonth() - 1);
    }
    return out.join('');
  }

  /* Org-wide totals. Summed from the same rows the table shows, so the header can never
     disagree with the body. */
  function totals(rows) {
    var t = { net: 0, revenue: 0, collCash: 0, cashExp: 0, expectedBank: 0, bankCash: 0,
              bankCard: 0, bankActual: 0, cash: 0, card: 0, debit: 0, xfer: 0,
              cashRows: 0, cardRows: 0, debitRows: 0, xferRows: 0, cat: {} };
    rows.forEach(function (r) {
      t.net += num(r.net); t.revenue += num(r.revenue);
      t.collCash += num(r.collCash); t.cashExp += num(r.cashExp);
      t.expectedBank += num(r.expectedBank);
      t.bankCash += num(r.bankCash); t.bankCard += num(r.bankCard); t.bankActual += num(r.bankActual);
      var b = r.bank || {};
      t.cash += num(b.cashAmt); t.cashRows += num(b.cashRows);
      t.card += num(b.cardAmt); t.cardRows += num(b.cardRows);
      t.debit += num(b.debitAmt); t.debitRows += num(b.debitRows);
      t.xfer += num(b.xferAmt); t.xferRows += num(b.xferRows);
      Object.keys(r.cat || {}).forEach(function (k) { t.cat[k] = (t.cat[k] || 0) + num(r.cat[k]); });
    });
    t.diff = t.expectedBank - t.bankCash;
    return t;
  }
  function num(v) { return Number(v) || 0; }

  /* ---------------------------------------------------------------- render */

  function render() {
    var host = state.host;
    if (!host) return;
    host.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'fv';
    host.appendChild(wrap);

    if (state.loading) { wrap.innerHTML = '<div class="fv-msg">Loading…</div>'; return; }
    if (state.error) {
      wrap.innerHTML = '<div class="fv-msg fv-warn">' + esc(state.error) + '</div>' +
        '<button type="button" class="fv-btn" id="fv-retry">Try again</button>';
      wrap.querySelector('#fv-retry').addEventListener('click', load);
      return;
    }

    var rows = state.branch ? state.rows.filter(function (r) { return String(r.branch) === state.branch; }) : state.rows;
    var t = totals(rows);
    var html = '';

    html += '<div class="fv-top">' +
      '<span class="fv-title">Finance · ' + esc(monthLabel(state.month)) + ' · by branch</span>' +
      '<select id="fv-month" class="fv-sel">' + monthOptions(state.month) + '</select>' +
      '<select id="fv-branch" class="fv-sel"><option value="">All branches</option>' +
      state.rows.map(function (r) {
        return '<option value="' + esc(r.branch) + '"' + (String(r.branch) === state.branch ? ' selected' : '') +
               '>' + esc(r.branchName || r.branch) + '</option>';
      }).join('') + '</select>' +
      '<span class="fv-sp"></span>' +
      '<button type="button" class="fv-btn" id="fv-reload">Reload</button>' +
      '</div>';

    /* Reconcile strip — the thing that was permanently red. */
    var diffCls = Math.abs(t.diff) < 1 ? 'ok' : (t.bankCash === 0 ? 'idle' : 'warn');
    var diffTxt = Math.abs(t.diff) < 1 ? 'Diff ₹0 · matched'
                : (t.bankCash === 0 ? 'No statement imported for ' + monthLabel(state.month)
                                    : 'Diff ' + fmtInr(t.diff) + ' · check');
    html += '<div class="fv-card fv-recon">' +
      cell('Collection (cash)', fmtInr(t.collCash), 'from daily entry') +
      '<span class="fv-op">−</span>' +
      cell('Cash expenses', fmtInr(t.cashExp), 'ledger, mode cash') +
      '<span class="fv-op">=</span>' +
      cell('Expected to bank', fmtInr(t.expectedBank), '') +
      '<span class="fv-op">vs</span>' +
      cell('Banked in cash', fmtInr(t.bankCash), t.cashRows + ' deposit' + (t.cashRows === 1 ? '' : 's')) +
      '<span class="fv-sp"></span>' +
      '<span class="fv-diff ' + diffCls + '">' + esc(diffTxt) + '</span>' +
      '</div>';

    /* Bank credits split. */
    html += '<div class="fv-card fv-recon">' +
      cell('Cash deposits', fmtInr(t.cash), t.cashRows + ' rows · reconciles') +
      '<span class="fv-op">+</span>' +
      cell('Card settlements', fmtInr(t.card), t.cardRows + ' rows · not in the reconcile') +
      '<span class="fv-op">=</span>' +
      cell('Total credits', fmtInr(t.bankActual), '') +
      '<span class="fv-sp"></span>' +
      cell('Debits', fmtInr(t.debit), t.debitRows + ' rows') +
      '</div>';

    /* The table. */
    html += '<div class="fv-tw"><table class="fv-t"><thead><tr><th class="fv-b">Branch</th>';
    COLS.forEach(function (c) { html += '<th class="r">' + esc(c.label) + '</th>'; });
    html += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr><td class="fv-b">' + esc(r.branchName || r.branch) + '</td>';
      COLS.forEach(function (c) { html += td(r, c); });
      html += '</tr>';
    });
    if (rows.length > 1) {
      html += '<tr class="fv-tot"><td class="fv-b">Total</td>';
      COLS.forEach(function (c) {
        var v = c.top ? t[c.top] : (t.cat[c.key] || 0);
        html += '<td class="r' + (c.strong ? ' fv-s' : '') + '">' + val(v, c) + '</td>';
      });
      html += '</tr>';
    }
    html += '</tbody></table></div>';

    /* Transfers — money that moved but is not a cost. */
    html += '<div class="fv-card fv-x"><div class="fv-x-l">Excluded from P and L</div>' +
      '<div class="fv-x-r"><span class="fv-x-n">' + fmtInr(t.xfer) + '</span>' +
      '<span class="fv-x-s">' + t.xferRows + ' row' + (t.xferRows === 1 ? '' : 's') +
      ' · transfers between your own accounts</span></div></div>';

    html += '<div class="fv-note">Salary comes from payslips and petrol from approved field claims, ' +
      'so a bank statement never fills those two columns. Every other cost column is filled from the ledger.</div>';

    wrap.innerHTML = html;
    wrap.querySelector('#fv-month').addEventListener('change', function (e) { state.month = e.target.value; load(); });
    wrap.querySelector('#fv-branch').addEventListener('change', function (e) { state.branch = e.target.value; render(); });
    wrap.querySelector('#fv-reload').addEventListener('click', load);
  }

  function cell(label, value, sub) {
    return '<div class="fv-c"><div class="fv-c-l">' + esc(label) + '</div>' +
           '<div class="fv-c-n">' + esc(value) + '</div>' +
           (sub ? '<div class="fv-c-s">' + esc(sub) + '</div>' : '') + '</div>';
  }
  function val(v, c) {
    v = num(v);
    if (c.signed) return '<span class="' + (v < 0 ? 'fv-neg' : (v > 0 ? 'fv-pos' : '')) + '">' + fmtInr(v) + '</span>';
    /* A zero cost column is worth flagging: it usually means nothing has been imported for
       that month yet, which is the single most common confusion on this screen. */
    if (c.cost && v === 0) return '<span class="fv-zero">' + fmtInr(0) + '</span>';
    return fmtInr(v);
  }
  function td(r, c) {
    var v = c.top ? r[c.top] : ((r.cat || {})[c.key] || 0);
    return '<td class="r' + (c.strong ? ' fv-s' : '') + '">' + val(v, c) + '</td>';
  }

  /* ---------------------------------------------------------------- data */

  function load() {
    if (!API) { state.error = 'Not connected. Run FinanceView.diagnose() in the console.'; render(); return; }
    state.loading = true; state.error = ''; render();
    API({ action: 'financeDashboard', ym: state.month })
      .then(function (res) {
        state.loading = false;
        if (!res || !res.ok) { state.error = (res && res.error) || 'Could not load finance figures.'; render(); return; }
        state.rows = res.rows || [];
        if (state.branch && !state.rows.some(function (r) { return String(r.branch) === state.branch; })) state.branch = '';
        render();
      })
      .catch(function () {
        state.loading = false;
        state.error = 'No connection — these figures come from the server and are not cached offline.';
        render();
      });
  }

  /* ---------------------------------------------------------------- wiring */

  function wrapMaybePromise(fn) {
    return function (payload) {
      var out;
      try { out = fn(payload); } catch (e) { return Promise.reject(e); }
      if (out && typeof out.then === 'function') return out;
      return new Promise(function (resolve, reject) {
        try { fn(payload, resolve, reject); } catch (e2) { reject(e2); }
      });
    };
  }
  function autoDetectApi() {
    var names = ['api', 'callApi', 'apiCall', 'call', 'request', 'post', 'send', 'rpc', 'server'], i;
    for (i = 0; i < names.length; i++) if (typeof window[names[i]] === 'function') return wrapMaybePromise(window[names[i]]);
    var objs = ['API', 'Api', 'App', 'app', 'NAKODA', 'Nakoda'];
    for (i = 0; i < objs.length; i++) {
      var o = window[objs[i]];
      if (o && typeof o === 'object') {
        var keys = ['call', 'api', 'post', 'request', 'send'];
        for (var k = 0; k < keys.length; k++) if (typeof o[keys[k]] === 'function') return wrapMaybePromise(o[keys[k]].bind(o));
      }
    }
    return null;
  }
  function directApi() {
    var url = '', cands = ['EXEC_URL', 'API_URL', 'SCRIPT_URL', 'WEBAPP_URL', 'BASE_URL', 'ENDPOINT'];
    var holders = [window, window.CONFIG || {}, window.config || {}, window.Config || {}, window.APP_CONFIG || {}];
    for (var h = 0; h < holders.length && !url; h++)
      for (var c = 0; c < cands.length && !url; c++) {
        var v = holders[h] && holders[h][cands[c]];
        if (typeof v === 'string' && v.indexOf('/exec') > 0) url = v;
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
  function findToken() {
    var keys = ['token', 'authToken', 'sessionToken', 'nakoda.token', 'nakodaToken', 'mis.token'], i;
    for (i = 0; i < keys.length; i++) {
      try { var v = localStorage.getItem(keys[i]); if (v && v.length > 6) return v.replace(/^"|"$/g, ''); } catch (e) {}
    }
    for (var k = 0; k < localStorage.length; k++) {
      try {
        var n = localStorage.key(k);
        if (/token/i.test(n)) { var val2 = localStorage.getItem(n); if (val2 && val2.length > 6) return val2.replace(/^"|"$/g, ''); }
      } catch (e) {}
    }
    return '';
  }
  function withToken(fn) {
    return function (p) { if (!p.token) { var t = findToken(); if (t) p.token = t; } return fn(p); };
  }

  var CSS = [
    '.fv{font-size:13px}',
    '.fv-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}',
    '.fv-title{font-size:13px;color:#6b6a64;letter-spacing:.04em}',
    '.fv-sel{font-size:12px;padding:4px 8px;border:1px solid #cfcdc5;border-radius:6px;background:#fff}',
    '.fv-sp{flex:1}',
    '.fv-btn{font-size:12px;padding:6px 12px;border:1px solid #cfcdc5;border-radius:7px;background:#fff;cursor:pointer}',
    '.fv-card{background:#fff;border:1px solid #e6e4de;border-radius:12px;padding:12px 16px;margin-bottom:12px}',
    '.fv-recon{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap}',
    '.fv-c-l{font-size:12px;color:#6b6a64}',
    '.fv-c-n{font-size:19px;font-weight:500}',
    '.fv-c-s{font-size:11px;color:#918f88}',
    '.fv-op{font-size:14px;color:#918f88;padding-bottom:6px}',
    '.fv-diff{font-size:13px;padding:6px 12px;border-radius:8px;background:#f1efe8;color:#444441;white-space:nowrap}',
    '.fv-diff.ok{background:#eaf3de;color:#3b6d11}',
    '.fv-diff.warn{background:#faeeda;color:#854f0b}',
    '.fv-diff.idle{background:#f1efe8;color:#6b6a64}',
    '.fv-tw{overflow-x:auto;border:1px solid #e6e4de;border-radius:12px;background:#fff;margin-bottom:12px}',
    '.fv-t{border-collapse:collapse;white-space:nowrap;min-width:100%;font-size:12.5px}',
    '.fv-t th{background:#f7f6f2;padding:9px 12px;font-weight:500;color:#6b6a64;text-align:right;position:sticky;top:0}',
    '.fv-t th.fv-b,.fv-t td.fv-b{text-align:left;position:sticky;left:0;background:#fff;font-weight:500}',
    '.fv-t th.fv-b{background:#f7f6f2}',
    '.fv-t td{padding:10px 12px;border-top:1px solid #f0eee8;text-align:right}',
    '.fv-t td.r,.fv-t th.r{text-align:right}',
    '.fv-t tr.fv-tot td{border-top:1.5px solid #cfcdc5;font-weight:500;background:#faf9f6}',
    '.fv-t tr.fv-tot td.fv-b{background:#faf9f6}',
    '.fv-s{font-weight:500}',
    '.fv-pos{color:#3b6d11}.fv-neg{color:#a32d2d}.fv-zero{color:#c9b8b8}',
    '.fv-x{display:flex;align-items:center;gap:14px;flex-wrap:wrap}',
    '.fv-x-l{font-size:12px;color:#6b6a64}',
    '.fv-x-n{font-size:18px;font-weight:500;margin-right:8px}',
    '.fv-x-s{font-size:12px;color:#6b6a64}',
    '.fv-note{font-size:11.5px;color:#918f88;line-height:1.6}',
    '.fv-msg{font-size:13px;color:#6b6a64;padding:16px}',
    '.fv-msg.fv-warn{color:#854f0b;background:#faeeda;border-radius:8px;margin-bottom:10px}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('fv-css')) return;
    var st = document.createElement('style');
    st.id = 'fv-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  function standalone() {
    injectCss();
    if (document.getElementById('fv-standalone')) return;
    var st = document.createElement('style');
    st.textContent =
      '#fv-launch{position:fixed;left:16px;bottom:16px;z-index:9998;background:#1f1f1d;color:#fff;' +
      'border:none;border-radius:24px;padding:11px 18px;font-size:13px;cursor:pointer}' +
      '#fv-standalone{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.4);display:none;' +
      'align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px}' +
      '#fv-standalone.on{display:flex}' +
      '#fv-panel{width:100%;max-width:1100px;background:#f7f6f2;border-radius:14px;padding:14px}' +
      '#fv-close{float:right;background:none;border:none;font-size:20px;cursor:pointer;line-height:1;color:#6b6a64}';
    document.head.appendChild(st);

    var btn = document.createElement('button');
    btn.id = 'fv-launch'; btn.type = 'button'; btn.textContent = 'Finance';
    document.body.appendChild(btn);

    var ov = document.createElement('div');
    ov.id = 'fv-standalone';
    ov.innerHTML = '<div id="fv-panel"><button id="fv-close" type="button" aria-label="Close">&times;</button>' +
                   '<div id="fv-host"></div></div>';
    document.body.appendChild(ov);

    btn.addEventListener('click', function () { ov.classList.add('on'); if (!state.rows.length) load(); });
    ov.querySelector('#fv-close').addEventListener('click', function () { ov.classList.remove('on'); });
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.classList.remove('on'); });
    state.host = ov.querySelector('#fv-host');
  }

  function boot() {
    if (booted) return;
    booted = true;
    if (!API) { var f = autoDetectApi() || directApi(); if (f) API = withToken(f); }
    if (!state.month) state.month = thisMonth();
    var host = document.getElementById('finance-view-host');
    if (host) { injectCss(); state.host = host; load(); }
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
      booted = true;
      if (!state.month) state.month = thisMonth();
    },
    mount: function (host) { injectCss(); booted = true; state.host = host || state.host; load(); },
    show: function (ym) { if (ym) state.month = ym; load(); },
    diagnose: function () {
      var d = { apiConnected: !!API, tokenFound: !!findToken(),
        hostElement: !!document.getElementById('finance-view-host'),
        month: state.month, rowsLoaded: state.rows.length,
        detected: autoDetectApi() ? 'a global api function'
                : (directApi() ? 'the /exec URL from config' : 'NOTHING — call FinanceView.init({call: yourApiFn})') };
      if (window.console) console.table ? console.table(d) : console.log(d);
      return d;
    },
    _internal: { totals: totals, fmtInr: fmtInr, COLS: COLS }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FinanceView;
