/****************************************************************************
 * NAKODA MIS — PAYROLL v2 (frontend)
 * Upload to repo root and load AFTER your existing payroll script:
 *   <script src="payroll-v2.js"></script>
 *
 * Renders the expanded employee payroll card.
 *   - Non-PF staff: Basic / HRA / "gross pay — no deductions" not rendered,
 *     PF + ESIC deduction rows not rendered. Values still come down from the
 *     server in line._hidden, so the PDF and salary register are unaffected.
 *   - Default additions : Incentive, Bonus, Travel/arrears, Petrol cost, MIS expenses
 *   - Default deductions: PF*, ESIC*, Professional tax, Lab test charges,
 *                         Advance lab oblic loan          (* PF staff only)
 *   - "+ Add other addition" and "+ Add other deduction" both add unlimited rows.
 *   - Per-day rate is displayed, never computed here. The server owns the maths.
 ****************************************************************************/

(function (w) {
  'use strict';

  /* ---- 1. ADAPTER — change these two lines to match your api.js -------- */
  var apiCall = function (endpoint, params) {
    if (w.api && typeof w.api.call === 'function') return w.api.call(endpoint, params);
    if (typeof w.api === 'function') return w.api(endpoint, params);
    throw new Error('payroll-v2: wire apiCall() to your api.js');
  };
  var DEBOUNCE_MS = 600;

  /* ---- 2. helpers ------------------------------------------------------ */
  var money = function (n) {
    n = Math.round(Number(n) || 0);
    return '₹' + n.toLocaleString('en-IN');
  };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var el = function (html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild;
  };

  /* ---- 3. styles (self-contained, no dependency on styles.css) --------- */
  var CSS = [
    '.payv2{padding:4px 0 14px}',
    '.payv2-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}',
    '.payv2-h{font-size:12px;letter-spacing:.04em;margin:0 0 10px}',
    '.payv2-h.add{color:#1d7a4d}.payv2-h.ded{color:#c0392b}',
    '.payv2-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}',
    '.payv2-row label{font-size:14px;flex:1;min-width:0}',
    '.payv2-row input.amt{width:96px;text-align:right;padding:8px 10px;border:1px solid #d9d9d9;border-radius:8px;font-size:14px;background:#fff}',
    '.payv2-row input.lbl{flex:1;min-width:0;padding:8px 10px;border:1px solid #d9d9d9;border-radius:8px;font-size:14px;background:#fff}',
    '.payv2-row input:focus{outline:none;border-color:#999}',
    '.payv2-fixed{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px}',
    '.payv2-fixed .sub{font-size:12px;color:#888;margin-top:2px}',
    '.payv2-neg{color:#c0392b;white-space:nowrap;font-size:14px}',
    '.payv2-btn{width:100%;padding:10px;border:1px dashed #cfcfcf;border-radius:8px;background:#fafafa;font-size:13px;cursor:pointer;color:#444}',
    '.payv2-btn:hover{background:#f2f2f2}',
    '.payv2-tot{display:flex;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid #eee;font-size:14px;font-weight:500}',
    '.payv2-note{background:#f7f7f5;border-radius:8px;padding:10px 12px;margin-top:12px;font-size:12px;color:#777}',
    '.payv2-rate{margin-top:14px;padding-top:12px;border-top:1px solid #eee;font-size:12px;color:#777}',
    '.payv2-del{border:none;background:none;cursor:pointer;color:#c0392b;font-size:16px;line-height:1;padding:0 4px}'
  ].join('');

  function injectCss() {
    if (document.getElementById('payv2-css')) return;
    var s = document.createElement('style');
    s.id = 'payv2-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---- 4. row builders ------------------------------------------------- */

  function inputRow(key, label, value, side) {
    return '<div class="payv2-row" data-key="' + esc(key) + '" data-side="' + side + '">' +
             '<label>' + esc(label) + '</label>' +
             '<input class="amt" type="number" inputmode="numeric" step="1" value="' +
                (Number(value) || 0) + '">' +
           '</div>';
  }

  function extraRow(label, amount, side) {
    var ph = side === 'ded' ? 'Other deduction (advance / loan)' : 'Other addition';
    return '<div class="payv2-row payv2-extra" data-side="' + side + '">' +
             '<input class="lbl" type="text" placeholder="' + ph + '" value="' + esc(label || '') + '">' +
             '<input class="amt" type="number" inputmode="numeric" step="1" value="' + (Number(amount) || 0) + '">' +
             '<button class="payv2-del" type="button" aria-label="Remove row">&times;</button>' +
           '</div>';
  }

  /* ---- 5. main render -------------------------------------------------- */

  /**
   * @param {Object} line   one object from apiPayrollMonth().lines
   * @param {Object} cfg    the config block from the same response
   * @returns {HTMLElement}
   */
  function renderCard(line, cfg) {
    injectCss();

    var pf = !!line.pfApplicable;
    var hidden = (line.view && line.view.hiddenRows) || [];
    var isHidden = function (k) { return hidden.indexOf(k) !== -1; };

    /* ---------- earnings column ---------- */
    var earn = '<p class="payv2-h add">EARNINGS (+)</p>';

    // Basic / HRA / gross note render ONLY for PF-covered staff.
    if (pf && line.view.showBasicHra) {
      earn += '<div class="payv2-fixed"><div>Basic</div><div>' + money(line.basic) + '</div></div>' +
              '<div class="payv2-fixed"><div>HRA</div><div>' + money(line.hra) + '</div></div>';
    }
    if (pf && line.view.showGrossNote) {
      earn += '<p style="color:#b8860b;font-size:14px;margin:0 0 12px">Gross pay — no deductions</p>';
    }

    (cfg.additions || []).forEach(function (r) {
      earn += inputRow(r.key, r.label, line.additions[r.key], 'add');
    });

    earn += '<div class="payv2-extras" data-side="add">';
    (line.extraAdditions || []).forEach(function (x) {
      earn += extraRow(x.label, x.amount, 'add');
    });
    earn += '</div>';
    earn += '<button class="payv2-btn" type="button" data-add-row="add">+ Add other addition</button>';
    earn += '<div class="payv2-tot"><span>Total additions</span>' +
            '<span class="payv2-total-add" style="color:#1d7a4d">' + money(line.totalAdditions) + '</span></div>';

    /* ---------- deductions column ---------- */
    var ded = '<p class="payv2-h ded">DEDUCTIONS (−)</p>';

    ded += '<div class="payv2-fixed"><div>' +
             'Absent / half-day (LOP ' + line.lopDays + 'd)' +
             '<div class="sub">' + money(line.perDayRate).replace('₹', '₹') +
             '/day × ' + line.lopDays + '</div>' +
           '</div><div class="payv2-neg">−' + money(line.lopDeduction) + '</div></div>';

    (cfg.deductions || []).forEach(function (r) {
      if (r.pfOnly && !pf) return;      // PF + ESIC vanish for non-PF staff
      if (isHidden(r.key)) return;
      ded += inputRow(r.key, r.label, line.deductions[r.key], 'ded');
    });

    ded += '<div class="payv2-extras" data-side="ded">';
    (line.extraDeductions || []).forEach(function (x) {
      ded += extraRow(x.label, x.amount, 'ded');
    });
    ded += '</div>';
    ded += '<button class="payv2-btn" type="button" data-add-row="ded">+ Add other deduction</button>';
    ded += '<div class="payv2-tot"><span>Total deductions</span>' +
           '<span class="payv2-total-ded" style="color:#c0392b">−' + money(line.totalDeductions) + '</span></div>';

    if (!pf && line.view.hiddenNote) {
      ded += '<div class="payv2-note">' + esc(line.view.hiddenNote) + '</div>';
    }

    var rateNote = pf
      ? 'Per-day = monthly ÷ ' + line.daysInMonth + ' calendar days'
      : 'Per-day = monthly × 12 ÷ 365 (non-PF staff) — applied to LOP only';

    var node = el(
      '<div class="payv2" data-emp="' + esc(line.empCode) + '" data-month="' + esc(line.month) + '">' +
        '<div class="payv2-grid">' +
          '<div class="payv2-col-add">' + earn + '</div>' +
          '<div class="payv2-col-ded">' + ded + '</div>' +
        '</div>' +
        '<div class="payv2-rate">' + esc(rateNote) +
          ' · ' + money(line.perDayRate) + '/day · net ' +
          '<b class="payv2-net">' + money(line.netPay) + '</b></div>' +
      '</div>'
    );

    wire(node, line, cfg);
    return node;
  }

  /* ---- 6. behaviour ---------------------------------------------------- */

  function wire(root, line, cfg) {
    var timer = null;

    root.addEventListener('click', function (e) {
      var addBtn = e.target.closest('[data-add-row]');
      if (addBtn) {
        var side = addBtn.getAttribute('data-add-row');
        var box  = root.querySelector('.payv2-extras[data-side="' + side + '"]');
        box.appendChild(el(extraRow('', 0, side)));
        box.lastElementChild.querySelector('.lbl').focus();
        return;
      }
      var del = e.target.closest('.payv2-del');
      if (del) { del.closest('.payv2-extra').remove(); schedule(); }
    });

    root.addEventListener('input', schedule);

    function schedule() {
      clearTimeout(timer);
      recalcLocal();
      timer = setTimeout(save, DEBOUNCE_MS);
    }

    /** Optimistic local total so the UI feels instant. Server still rules. */
    function recalcLocal() {
      var p = collect();
      var add = 0, ded = Number(line.lopDeduction) || 0;

      (cfg.additions || []).forEach(function (r) { add += Number(p['add_' + r.key]) || 0; });
      (cfg.deductions || []).forEach(function (r) { ded += Number(p['ded_' + r.key]) || 0; });

      JSON.parse(p.extraAdditions).forEach(function (x) { add += Number(x.amount) || 0; });
      JSON.parse(p.extraDeductions).forEach(function (x) { ded += Number(x.amount) || 0; });

      var net = (Number(line.monthlySalary) || 0) + add - ded;
      root.querySelector('.payv2-total-add').textContent = money(add);
      root.querySelector('.payv2-total-ded').textContent = '−' + money(ded);
      root.querySelector('.payv2-net').textContent = money(net);
    }

    function collect() {
      var p = {
        empCode: line.empCode,
        month  : line.month,
        clientMutationId: line.empCode + '|' + line.month + '|' + Date.now()
      };
      root.querySelectorAll('.payv2-row[data-key]').forEach(function (r) {
        p[r.getAttribute('data-side') + '_' + r.getAttribute('data-key')] =
          Number(r.querySelector('.amt').value) || 0;
      });
      ['add', 'ded'].forEach(function (side) {
        var list = [];
        root.querySelectorAll('.payv2-extras[data-side="' + side + '"] .payv2-extra')
            .forEach(function (r) {
              var lbl = r.querySelector('.lbl').value.trim();
              var amt = Number(r.querySelector('.amt').value) || 0;
              if (lbl) list.push({ label: lbl, amount: amt });
            });
        p[side === 'add' ? 'extraAdditions' : 'extraDeductions'] = JSON.stringify(list);
      });
      return p;
    }

    function save() {
      var payload = collect();
      Promise.resolve(apiCall('savePayLine', payload))
        .then(function (res) {
          var fresh = (res && res.data) ? res.data : res;
          if (!fresh || fresh.netPay == null) return;
          line = fresh;
          root.querySelector('.payv2-total-add').textContent = money(fresh.totalAdditions);
          root.querySelector('.payv2-total-ded').textContent = '−' + money(fresh.totalDeductions);
          root.querySelector('.payv2-net').textContent = money(fresh.netPay);
        })
        .catch(function (err) {
          // Offline: your existing queue retries. clientMutationId makes it safe.
          if (w.queueMutation) w.queueMutation('savePayLine', payload);
          else console.warn('payroll-v2 save failed', err);
        });
    }
  }

  /* ---- 7. month loader ------------------------------------------------- */

  function loadMonth(container, month, branch) {
    return Promise.resolve(apiCall('payrollMonth', { month: month, branch: branch }))
      .then(function (res) {
        var d = (res && res.data) ? res.data : res;
        container.innerHTML = '';
        d.lines.forEach(function (line) {
          container.appendChild(renderCard(line, d.config));
        });
        return d;
      });
  }

  w.PayrollV2 = { renderCard: renderCard, loadMonth: loadMonth, money: money };

})(window);
