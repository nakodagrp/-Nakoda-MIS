/* ============================================================================================
 *  Nakoda MIS — OPEN CRM button                                         crmlink.js   v437
 * --------------------------------------------------------------------------------------------
 *  The Nakoda CRM is a separate app that lives in the /crm/ folder of the same GitHub site.
 *  Same website = same browser storage, so the MIS login token (localStorage 'nk_tok') is
 *  already there when the CRM opens: nobody signs in twice.
 *
 *  This module only ADDS things; it changes no existing behaviour:
 *    - "Nakoda CRM ↗" in the sidebar (Patients group) and in the phone bottom bar
 *    - an "Open CRM" card at the top of the Dashboard
 *  Optional switches in config.js (add the line if you want it):
 *    CRM_URL: "./crm/"        where the CRM is (default ./crm/)
 *    HIDE_OLD_CRM: true       hide the old built-in Patient CRM + CRM Performance menu items
 *  Loads LAST in the bundle (after app.js), so window.go and NAVDEF already exist.
 * ============================================================================================ */
(function(){
  var CFG = window.NAKODA_CONFIG || {};
  var CRM_URL = CFG.CRM_URL || './crm/';
  var HIDE_OLD = CFG.HIDE_OLD_CRM === true;

  /* v437 — only MIS, Director, Operations Manager (all branches) and CRM staff (every branch) see the CRM.
     The CRM server refuses everyone else too (CRM 02_Auth.gs crmLevel_); this only hides the buttons. */
  var CRM_ROLES = /(^|[^a-z])(mis|director|operations?\s*manager|crm)([^a-z]|$)/i;
  function crmAllowed(){
    var u = window.S && S.user; if(!u) return null;
    return (S.perms && S.perms.level === 'SUPER') || CRM_ROLES.test(String(u.Role || ''));
  }
  function openCrm(){ if(crmAllowed() === false) return; location.href = CRM_URL; }
  window.openNakodaCrm = openCrm;

  /* route 'nakodacrm' through the MIS's own go() so every existing click path works */
  if(typeof window.go === 'function' && !window.go.__crm){
    var orig = window.go;
    window.go = function(page){ if(page === 'nakodacrm'){ openCrm(); return; } return orig.apply(this, arguments); };
    window.go.__crm = true;
  }

  /* phone bottom bar: CRM gets the 3rd slot (where Patients used to be) */
  try{
    if(window.NAVDEF && !NAVDEF.some(function(d){ return d[0] === 'nakodacrm'; })){
      var at = 2; NAVDEF.splice(at, 0, ['nakodacrm', '☎', 'CRM']);
      if(HIDE_OLD){ for(var i = NAVDEF.length - 1; i >= 0; i--) if(NAVDEF[i][0] === 'patients' || NAVDEF[i][0] === 'crmperf') NAVDEF.splice(i, 1); }
    }
  }catch(e){}

  function addStyles(){
    if(document.getElementById('crmlinkCss')) return;
    var s = document.createElement('style'); s.id = 'crmlinkCss';
    s.textContent =
      '.nav-item.crm-link{border:1.5px solid var(--red);background:linear-gradient(135deg,#fff,#fdeeee);margin:2px 0 6px}' +
      '.nav-item.crm-link .ic{background:var(--red)!important;color:#fff!important}' +
      '.nav-item.crm-link .go{margin-left:auto;color:var(--red);font-weight:700}' +
      '.crm-dash{display:flex;align-items:center;gap:18px;background:#fff;border:1px solid #f4c9c9;border-radius:16px;box-shadow:var(--shadow);padding:16px 20px;margin:0 0 16px}' +
      '.crm-dash .bx{width:52px;height:52px;border-radius:14px;background:var(--red);color:#fff;font-size:24px;display:flex;align-items:center;justify-content:center;flex:none}' +
      '.crm-dash b{font-size:17px}.crm-dash .s{color:var(--grey);font-size:13.5px;margin-top:2px}.crm-dash .sp{flex:1}' +
      '@media(max-width:640px){.crm-dash{flex-wrap:wrap}.crm-dash .btn{width:100%;justify-content:center}}' +
      (HIDE_OLD ? '.nav-item[data-page="patients"],.nav-item[data-page="crmperf"]{display:none!important}' : '');
    document.head.appendChild(s);
  }
  function addNav(){
    if(document.getElementById('navNakodaCrm')) return;
    var ref = document.querySelector('.nav-item[data-page="patients"]');
    if(!ref) return;
    var n = document.createElement('div');
    n.className = 'nav-item crm-link'; n.id = 'navNakodaCrm'; n.setAttribute('data-page', 'nakodacrm');
    n.innerHTML = '<span class="ic">&#9742;</span> Nakoda CRM <span class="go">&#8599;</span>';
    n.addEventListener('click', openCrm);
    ref.parentNode.insertBefore(n, ref);
  }
  function addDashCard(){
    if(document.getElementById('crmDashCard')) return;
    var ref = document.getElementById('dashTasks');
    if(!ref) return;
    var c = document.createElement('div');
    c.className = 'crm-dash'; c.id = 'crmDashCard';
    c.innerHTML = '<div class="bx">&#9742;</div><div><b>Nakoda CRM</b><div class="s">Follow-ups · Cold data · Membership cards · Bulk WhatsApp · Reports</div></div>' +
                  '<span class="sp"></span><button class="btn" type="button">Open CRM &#8599;</button>';
    c.querySelector('button').addEventListener('click', openCrm);
    ref.parentNode.insertBefore(c, ref);
  }

  /* v436 — "Send card (WhatsApp API)" from the CRM opens the MIS at  #crmcard=NAK-...
     Once the MIS has signed in and loaded its branches, this opens that card's normal popup
     (openCardDetail, membership.js) — the same card picture and the same "Send via Official API"
     button the Membership Cards screen uses — and points at that button. Nothing is sent without
     that click + the MIS's own confirm. */
  function crmCardFromHash(){
    var m = String(location.hash || '').match(/crmcard=([^&]+)/i); if(!m) return;
    var num = decodeURIComponent(m[1]).trim().toUpperCase(), tries = 0;
    try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){}
    (function wait(){
      var ready = window.S && S.user && S.meta && S.meta.branches && S.meta.branches.length &&
                  typeof window.openCardDetail === 'function' && window.API && API.getCard;
      if(!ready){ if(++tries < 360) setTimeout(wait, 500); return; }
      setTimeout(function(){
        try{ if(window.__nakodaCard && __nakodaCard.ensureTypes) __nakodaCard.ensureTypes(); }catch(e){}
        window.openCardDetail(num);
        var n = 0;
        (function point(){
          var b = document.getElementById('cdApiSend');
          if(!b){ if(++n < 60) setTimeout(point, 250); return; }
          b.scrollIntoView({block:'center', behavior:'smooth'});
          b.style.boxShadow = '0 0 0 5px #a8e6bd'; b.style.fontSize = '15px';
          var tip = document.createElement('div');
          tip.style.cssText = 'background:#e6f4ea;color:#1a7f37;border-radius:8px;padding:8px 10px;font-size:12.5px;font-weight:600;margin:0 0 8px';
          tip.textContent = 'From Nakoda CRM: press the green button to send card ' + num + ' with its picture. Then close this tab.';
          b.parentNode.insertBefore(tip, b);
        })();
      }, 1500);
    })();
  }
  crmCardFromHash();
  window.addEventListener('hashchange', crmCardFromHash);
  var lastAllowed = null;
  function applyRole(){
    var a = crmAllowed(); if(a === null) a = false;          /* not signed in yet: hidden */
    ['navNakodaCrm', 'crmDashCard'].forEach(function(id){ var el = document.getElementById(id); if(el) el.style.display = a ? '' : 'none'; });
    if(a === lastAllowed) return;
    lastAllowed = a;
    try{
      if(window.NAVDEF){
        var has = NAVDEF.some(function(d){ return d[0] === 'nakodacrm'; });
        if(a && !has) NAVDEF.splice(2, 0, ['nakodacrm', '☎', 'CRM']);
        if(!a && has) for(var i = NAVDEF.length - 1; i >= 0; i--) if(NAVDEF[i][0] === 'nakodacrm') NAVDEF.splice(i, 1);
        if(typeof buildMobileBottomNav === 'function') buildMobileBottomNav();
      }
    }catch(e){}
  }
  function init(){ addStyles(); addNav(); addDashCard(); applyRole(); setInterval(function(){ addNav(); addDashCard(); applyRole(); }, 1500); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
