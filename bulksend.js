/* ============================================================================
 *  Nakoda MIS — BULK WHATSAPP CARD SEND (client)            bulksend.js  v316
 * ----------------------------------------------------------------------------
 *  Loads after membership.js and reuses its globals ($, esc, toast, openModal,
 *  closeModal, API) plus window.__nakodaCard = {drawCard, newCardCanvas}.
 *
 *  SPEED, in three moves:
 *   1. PREVIEW is a single tiny request with no images. It tells you instantly
 *      which cards will go, which will be skipped and why, and — importantly —
 *      which ones still need their picture uploaded.
 *   2. UPLOADS RUN SIDE BY SIDE. Only cards whose image is not already cached
 *      on the server are rendered and uploaded, UP_POOL at a time. Ten fresh
 *      cards take about four seconds instead of forty; a second batch of the
 *      same cards takes zero, because the server remembers the image URL.
 *   3. THE SEND IS ONE REQUEST. The server fires all the WhatsApp calls in
 *      parallel (UrlFetchApp.fetchAll) and returns one result per card.
 * ========================================================================= */
(function(){
  var UP_POOL = 4;               /* parallel image uploads — 4 is kind to a 4G branch line */
  var SEL = {};                  /* cardNumber -> true, survives repaints of the list      */
  var MODE = false;              /* select mode on/off                                     */
  var LAST = [];                 /* the list currently painted, for "select all"           */

  function esc2(s){ return (window.esc ? esc(s) : String(s == null ? '' : s)); }
  function say(msg, bad){ if(window.toast) toast(msg, !!bad); }

  /* ── selection mode ─────────────────────────────────────────────────────── */
  function count(){ return Object.keys(SEL).length; }
  function clear(){ SEL = {}; }

  /* Called by membership.js after every repaint of the card table. */
  function attach(box, list, typemap, canIssue){
    LAST = list || [];
    if(!canIssue) return;
    var table = box.querySelector('table'); if(!table) return;

    /* header cell */
    var htr = table.querySelector('thead tr');
    if(htr && !htr.querySelector('.wabH')){
      var th = document.createElement('th');
      th.className = 'wabH'; th.style.width = '34px';
      th.innerHTML = '<input type="checkbox" id="wabAll" title="Select all shown" style="width:16px;height:16px">';
      htr.insertBefore(th, htr.firstChild);
    }
    /* a checkbox on every row */
    var rows = table.querySelectorAll('tbody tr.crow');
    for(var i = 0; i < rows.length; i++){
      var tr = rows[i], cn = tr.getAttribute('data-cn');
      if(tr.querySelector('.wabC')) continue;
      var td = document.createElement('td');
      td.className = 'wabC';
      td.innerHTML = '<input type="checkbox" class="wabBox" data-cn="' + esc2(cn) + '"' + (SEL[cn] ? ' checked' : '') + ' style="width:16px;height:16px">';
      /* stop the row's own click handler from opening the card */
      td.onclick = function(e){ e.stopPropagation(); };
      tr.insertBefore(td, tr.firstChild);
    }
    if(!MODE) showCols(box, false);

    box.querySelectorAll('.wabBox').forEach(function(cb){
      cb.onchange = function(){
        var cn = cb.getAttribute('data-cn');
        if(cb.checked) SEL[cn] = true; else delete SEL[cn];
        bar();
      };
    });
    var all = box.querySelector('#wabAll');
    if(all) all.onchange = function(){
      LAST.forEach(function(c){ if(all.checked) SEL[String(c.cardNumber)] = true; else delete SEL[String(c.cardNumber)]; });
      box.querySelectorAll('.wabBox').forEach(function(cb){ cb.checked = all.checked; });
      bar();
    };
    bar();
  }

  function showCols(box, on){
    box.querySelectorAll('.wabC,.wabH').forEach(function(el){ el.style.display = on ? '' : 'none'; });
  }

  function toggleMode(){
    MODE = !MODE;
    var box = document.getElementById('cardList'); if(box) showCols(box, MODE);
    if(!MODE) clear();
    var btn = document.getElementById('wabModeBtn');
    if(btn) btn.textContent = MODE ? '✕ Cancel select' : '☑ Select cards';
    bar();
  }

  /* sticky action bar */
  function bar(){
    var el = document.getElementById('wabBar');
    var n = count();
    if(!MODE || !n){ if(el) el.remove(); return; }
    if(!el){
      el = document.createElement('div');
      el.id = 'wabBar';
      el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:60;background:#DA1017;color:#fff;' +
        'padding:11px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 -3px 14px rgba(0,0,0,.18)';
      document.body.appendChild(el);
    }
    el.innerHTML =
      '<span style="font-weight:600;font-size:14px" id="wabN">' + n + ' selected</span>' +
      '<span style="flex:1"></span>' +
      '<button class="btn ghost" id="wabClr" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5);padding:7px 11px">Clear</button>' +
      '<button class="btn" id="wabGo" style="background:#fff;color:#DA1017;font-weight:700;padding:7px 14px">🚀 Send ' + n + ' on WhatsApp</button>';
    document.getElementById('wabClr').onclick = function(){
      clear();
      document.querySelectorAll('.wabBox').forEach(function(cb){ cb.checked = false; });
      var a = document.getElementById('wabAll'); if(a) a.checked = false;
      bar();
    };
    document.getElementById('wabGo').onclick = function(){ openPreview(Object.keys(SEL)); };
  }

  /* ── "send all unsent" — one tap, no ticking ───────────────────────────── */
  function sendAllUnsent(){
    var nums = (LAST || []).filter(function(c){
      return String(c.status || 'active') === 'active' && !c.sentAt && String(c.mobile || '').replace(/\D/g, '').length >= 10;
    }).map(function(c){ return String(c.cardNumber); });
    if(!nums.length){ say('Nothing to send — every card in this list has already gone out.', true); return; }
    openPreview(nums);
  }

  /* ── step 1 · preview ───────────────────────────────────────────────────── */
  function openPreview(nums, allowResend){
    if(!nums || !nums.length){ say('Select at least one card.', true); return; }
    openModal('Checking ' + nums.length + ' cards…',
      '<div class="center-load" style="padding:26px"><span class="loader dark"></span> Reading branches, templates and numbers…</div>',
      '<button class="btn ghost" onclick="closeModal()">Cancel</button>');

    API.waBulkPreview(nums, !!allowResend).then(function(r){
      if(!r.ok){ closeModal(); say(r.error, true); return; }
      var ok = r.items.filter(function(i){ return i.ok; });
      var no = r.items.filter(function(i){ return !i.ok; });
      var capWarn = (r.caps || []).filter(function(c){ return c.over; });
      var fresh = ok.filter(function(i){ return i.needsUpload; }).length;

      var rowHtml = function(i, good){
        return '<div style="display:flex;gap:8px;align-items:flex-start;padding:7px 9px;border:1px solid #e3e5ea;border-radius:8px;margin-bottom:5px;background:#fff">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:12.5px;font-weight:600">' + esc2(i.cardNumber) + ' · ' + esc2(i.holderName || '—') + '</div>' +
            '<div style="font-size:11px;color:#8a8f97">' + esc2(i.branchName) + (i.phone ? (' · +' + esc2(i.phone)) : '') +
              (good && i.template ? (' · template ' + esc2(i.template)) : '') + '</div>' +
            (i.warn ? '<div style="font-size:10.5px;color:#b7791f;margin-top:2px">⚠ ' + esc2(i.warn) + '</div>' : '') +
            (!good ? '<div style="font-size:11px;color:#C0392B;margin-top:2px">' + esc2(i.reason) + '</div>' : '') +
          '</div>' +
          '<span class="badge" style="background:' + (good ? '#e6f4ea;color:#1a7f37' : '#fdeaea;color:#C0392B') + ';font-size:10.5px;white-space:nowrap">' +
            (good ? (i.hasMedia ? 'Ready ⚡' : 'Ready') : 'Skip') + '</span>' +
        '</div>';
      };

      var body =
        '<div style="background:' + (ok.length ? '#e6f4ea' : '#fdeaea') + ';border-radius:10px;padding:11px 13px;margin-bottom:12px">' +
          '<div style="font-weight:700;font-size:14px;color:' + (ok.length ? '#1a7f37' : '#C0392B') + '">' +
            ok.length + ' card' + (ok.length === 1 ? '' : 's') + ' will be sent' + (no.length ? (' · ' + no.length + ' skipped') : '') + '</div>' +
          '<div style="font-size:11.5px;color:#4a4f57;margin-top:3px">' +
            (fresh ? ('Preparing ' + fresh + ' card image' + (fresh === 1 ? '' : 's') + ' first, then all sends go out together — about ' + Math.max(4, Math.round(fresh * 0.6) + 3) + ' seconds.')
                   : 'All images are already prepared — this will take about 3 seconds.') +
          '</div>' +
        '</div>' +
        (capWarn.length ? '<div style="background:#fff7e6;border:1px solid #f3d98a;border-radius:9px;padding:9px 11px;font-size:12px;color:#7a5b00;margin-bottom:10px">⚠ Daily limit: ' +
            capWarn.map(function(c){ return esc2(c.branchName) + ' has ' + c.left + ' send(s) left today (you selected ' + c.want + ')'; }).join('; ') + '. The extra ones will be refused — send them tomorrow.</div>' : '') +
        '<label style="display:flex;gap:7px;align-items:center;font-size:12px;color:#5a5f67;margin-bottom:10px">' +
          '<input type="checkbox" id="wabResend"' + (allowResend ? ' checked' : '') + ' style="width:15px;height:15px"> Send again even if the card already went out recently</label>' +
        '<div style="max-height:44vh;overflow:auto;background:#f6f7f9;border-radius:10px;padding:8px">' +
          (ok.length ? ok.map(function(i){ return rowHtml(i, true); }).join('') : '') +
          (no.length ? ('<div style="font-size:11px;color:#8a8f97;margin:8px 0 5px;font-weight:600">SKIPPED</div>' + no.map(function(i){ return rowHtml(i, false); }).join('')) : '') +
        '</div>';

      openModal('Send ' + ok.length + ' membership cards', body,
        '<button class="btn ghost" onclick="closeModal()">Cancel</button>' +
        (ok.length ? '<button class="btn" id="wabSend" style="background:#1a7f37">🚀 Send ' + ok.length + ' now</button>' : ''));

      var rs = document.getElementById('wabResend');
      if(rs) rs.onchange = function(){ openPreview(nums, rs.checked); };
      var go = document.getElementById('wabSend');
      if(go) go.onclick = function(){ runBatch(ok, !!(rs && rs.checked)); };
    }).catch(function(){ closeModal(); say('Could not reach the server — bulk send needs internet.', true); });
  }

  /* ── step 2 · prepare images in parallel, then send in one shot ─────────── */
  function runBatch(items, allowResend){
    var need = items.filter(function(i){ return i.needsUpload; });
    var total = need.length;
    var doneUp = 0, media = {}, failed = {};

    openModal('Sending ' + items.length + ' cards',
      '<div id="wabProg" style="padding:6px 2px">' +
        '<div style="font-size:13px;font-weight:600;margin-bottom:8px" id="wabStage">' +
          (total ? ('Preparing card images… 0 of ' + total) : 'Sending to WhatsApp…') + '</div>' +
        '<div style="background:#eef0f3;border-radius:20px;height:9px;overflow:hidden"><i id="wabFill" style="display:block;height:100%;background:#1a7f37;width:' + (total ? 2 : 55) + '%;transition:width .25s"></i></div>' +
        '<div style="font-size:11.5px;color:#8a8f97;margin-top:7px" id="wabHint">Keep this open for a few seconds — after this it is out of your hands and on WhatsApp.</div>' +
      '</div>', '');

    var setProg = function(pct, stage){
      var f = document.getElementById('wabFill'); if(f) f.style.width = Math.max(2, Math.min(100, pct)) + '%';
      var s = document.getElementById('wabStage'); if(s && stage) s.textContent = stage;
    };

    /* render one card offscreen and push it up */
    var upload = function(it){
      return new Promise(function(resolve){
        var draw = window.__nakodaCard;
        if(!draw){ failed[it.cardNumber] = 'Card renderer not loaded.'; return resolve(); }
        var full = (LAST || []).filter(function(c){ return String(c.cardNumber) === String(it.cardNumber); })[0];
        if(!full){ failed[it.cardNumber] = 'Card row not in the current list.'; return resolve(); }
        /* v332: the bulk picture is the same one the card popup and the QR page produce — card
           front, benefits, card number and lab number — so a bulk send and a single send can
           never put two different images in front of two members. */
        var cv;
        try{
          cv = draw.buildCardImage
             ? draw.buildCardImage(full, draw.typeFor(full.typeId),
                 { benefits: draw.benefitsFor(full.typeId), labPhone: draw.labPhoneFor(full.branchId) })
             : (function(){ var c = draw.newCardCanvas(); draw.drawCard(c, full, draw.typeFor(full.typeId)); return c; })();
        }
        catch(e){ failed[it.cardNumber] = 'Could not draw the card image.'; return resolve(); }
        /* JPEG. A bulk run uploads one picture per card and the picture is now ~2.3x taller;
           as PNG that is about 1.6 MB each, and base64 adds a third on top. v332's waCardMedia
           reads the mime off the bytes, so this is ~200 KB instead. */
        var b64;
        try{ b64 = cv.toDataURL('image/jpeg', 0.9).split(',')[1]; }
        catch(e){ failed[it.cardNumber] = 'Could not read the card image.'; return resolve(); }
        API.waCardMedia(it.cardNumber, b64).then(function(r){
          if(r && r.ok) media[it.cardNumber] = r.url; else failed[it.cardNumber] = (r && r.error) || 'Image upload failed.';
          doneUp++;
          setProg(6 + (doneUp / Math.max(1, total)) * 54, 'Preparing card images… ' + doneUp + ' of ' + total);
          resolve();
        }).catch(function(){
          failed[it.cardNumber] = 'Image upload failed (network).';
          doneUp++; setProg(6 + (doneUp / Math.max(1, total)) * 54); resolve();
        });
      });
    };

    /* a small pool: UP_POOL uploads in flight at any moment */
    var pool = function(list){
      var q = list.slice();
      var worker = function(){
        if(!q.length) return Promise.resolve();
        return upload(q.shift()).then(worker);
      };
      var lanes = [];
      for(var i = 0; i < Math.min(UP_POOL, list.length); i++) lanes.push(worker());
      return Promise.all(lanes);
    };

    pool(need).then(function(){
      setProg(64, 'Sending ' + items.length + ' messages to WhatsApp…');
      var jobs = items.filter(function(i){ return !failed[i.cardNumber]; }).map(function(i){
        return { cardNumber: i.cardNumber, phone: i.phone, mediaUrl: media[i.cardNumber] || '' };
      });
      if(!jobs.length){ showResults([], failed, items); return; }
      return API.waBulkSend(jobs, allowResend).then(function(r){
        setProg(100, 'Done');
        if(!r.ok){ closeModal(); say(r.error, true); return; }
        showResults(r.results || [], failed, items);
        if(API.refreshCards) API.refreshCards();
      });
    }).catch(function(){
      closeModal(); say('Network problem during the batch — check the Cards list before re-sending.', true);
    });
  }

  /* ── step 3 · result, with a retry for just the failures ────────────────── */
  function showResults(results, preFailed, items){
    var byNum = {};
    results.forEach(function(r){ byNum[r.cardNumber] = r; });
    var good = [], bad = [];
    items.forEach(function(i){
      var r = byNum[i.cardNumber];
      if(preFailed[i.cardNumber]) bad.push({ cardNumber: i.cardNumber, holderName: i.holderName, error: preFailed[i.cardNumber] });
      else if(r && r.ok) good.push(r);
      else bad.push({ cardNumber: i.cardNumber, holderName: i.holderName, error: (r && r.error) || 'No result returned.' });
    });

    var line = function(x, ok){
      return '<div style="padding:7px 9px;border:1px solid #e3e5ea;border-radius:8px;margin-bottom:5px;background:#fff">' +
        '<div style="font-size:12.5px;font-weight:600">' + (ok ? '✓ ' : '✗ ') + esc2(x.cardNumber) + ' · ' + esc2(x.holderName || '') + '</div>' +
        (ok ? '' : '<div style="font-size:11px;color:#C0392B;margin-top:2px">' + esc2(x.error) + '</div>') + '</div>';
    };

    var body =
      '<div style="background:' + (good.length ? '#e6f4ea' : '#fdeaea') + ';border-radius:10px;padding:12px 13px;margin-bottom:12px">' +
        '<div style="font-weight:700;font-size:16px;color:' + (good.length ? '#1a7f37' : '#C0392B') + '">' +
          good.length + ' sent' + (bad.length ? (' · ' + bad.length + ' failed') : ' ✓') + '</div>' +
        '<div style="font-size:11.5px;color:#4a4f57;margin-top:3px">Every attempt is recorded in the WA_Log sheet with the exact request that went out.</div>' +
      '</div>' +
      '<div style="max-height:44vh;overflow:auto;background:#f6f7f9;border-radius:10px;padding:8px">' +
        (bad.length ? ('<div style="font-size:11px;color:#8a8f97;margin:0 0 5px;font-weight:600">NOT SENT</div>' + bad.map(function(x){ return line(x, false); }).join('')) : '') +
        (good.length ? ('<div style="font-size:11px;color:#8a8f97;margin:8px 0 5px;font-weight:600">SENT</div>' + good.map(function(x){ return line(x, true); }).join('')) : '') +
      '</div>';

    openModal('WhatsApp batch finished', body,
      (bad.length ? '<button class="btn ghost" id="wabRetry">↻ Retry the ' + bad.length + ' failed</button>' : '') +
      '<button class="btn" onclick="closeModal()">Done</button>');

    var rt = document.getElementById('wabRetry');
    if(rt) rt.onclick = function(){ openPreview(bad.map(function(x){ return x.cardNumber; }), true); };

    good.forEach(function(g){ delete SEL[g.cardNumber]; });
    bar();
    if(window.renderMembershipCards && !bad.length) setTimeout(function(){ /* list refreshes on next paint */ }, 0);
  }

  /* ── branch health check (Director) ─────────────────────────────────────── */
  function branchCheck(){
    openModal('Checking branches…', '<div class="center-load" style="padding:26px"><span class="loader dark"></span> Reading keys and templates…</div>', '');
    API.waBranchCheck().then(function(r){
      if(!r.ok){ closeModal(); say(r.error, true); return; }
      var body = (r.branches || []).map(function(b){
        return '<div style="padding:9px 11px;border:1px solid #e3e5ea;border-radius:9px;margin-bottom:6px;background:#fff">' +
          '<div style="font-size:13px;font-weight:600">' + (b.ok ? '✓ ' : '⚠ ') + esc2(b.branchName) + '</div>' +
          '<div style="font-size:11.5px;color:#8a8f97;margin-top:2px">template ' + esc2(b.template) + ' · ' + esc2(b.lang) +
            ' · ' + b.nParams + ' variables · header ' + esc2(b.headerType) + '</div>' +
          (b.problems || []).map(function(p){ return '<div style="font-size:11.5px;color:#C0392B;margin-top:3px">• ' + esc2(p) + '</div>'; }).join('') +
        '</div>';
      }).join('') || '<div class="empty">No active branches.</div>';
      openModal('WhatsApp readiness by branch',
        '<div style="font-size:12px;color:#8a8f97;margin-bottom:10px">No messages were sent. A branch with a warning will fail on bulk AND on single sends.</div>' + body,
        '<button class="btn" onclick="closeModal()">Close</button>');
    }).catch(function(){ closeModal(); say('Could not reach the server.', true); });
  }

  window.WABulk = { attach: attach, toggleMode: toggleMode, sendAllUnsent: sendAllUnsent,
                    branchCheck: branchCheck, isMode: function(){ return MODE; } };
})();
