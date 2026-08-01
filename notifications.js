/* ============================================================
 *  Nakoda MIS — Notifications bell  (v274)
 *
 *  Two layers, deliberately independent:
 *    1. The BELL. Always works — every browser, every device, offline (the list
 *       is cached by api.js like any other read). This is the feature.
 *    2. WEB PUSH. A progressive enhancement on top. If the browser can't do it,
 *       or Firebase isn't configured, or the user says no, layer 1 is unaffected.
 *
 *  iOS note: Safari exposes PushManager ONLY to a PWA installed to the Home
 *  Screen (16.4+). In a plain Safari tab the enable button is hidden on purpose
 *  rather than shown and then failing.
 * ============================================================ */
(function(){
  /* cfg is tri-state on purpose: undefined = never asked, 'loading' = in flight,
     object = server answered, null = server could not be reached. */
  var NF = { items:[], unread:0, open:false, timer:null, seen:{}, booted:false, cfg:undefined };
  var POLL_MS = 45000;

  /* ---------- markup ---------- */
  function mount(){
    if(document.getElementById('nfBell')) return true;
    var bar = document.querySelector('#view-app .topbar');
    var anchor = bar && bar.querySelector('.userchip');
    if(!bar || !anchor) return false;
    var wrap = document.createElement('div');
    wrap.className = 'nf-wrap';
    wrap.innerHTML =
      '<button class="nf-bell" id="nfBell" title="Notifications" aria-label="Notifications">' +
        '<span class="nf-ic">&#128276;</span>' +
        '<span class="nf-badge hidden" id="nfBadge">0</span>' +
      '</button>' +
      '<div class="nf-panel hidden" id="nfPanel">' +
        '<div class="nf-head">' +
          '<b>Notifications</b>' +
          '<button class="nf-allread" id="nfAllRead">Mark all read</button>' +
        '</div>' +
        '<div class="nf-push hidden" id="nfPushRow">' +
          '<span>Get alerts when the app is closed</span>' +
          '<button class="btn sm" id="nfPushBtn">Turn on</button>' +
        '</div>' +
        '<div class="nf-list" id="nfList"><div class="nf-empty">Loading…</div></div>' +
      '</div>';
    bar.insertBefore(wrap, anchor);

    document.getElementById('nfBell').onclick = function(e){ e.stopPropagation(); toggle(); };
    document.getElementById('nfAllRead').onclick = function(e){ e.stopPropagation(); markAll(); };
    document.getElementById('nfPushBtn').onclick = function(e){ e.stopPropagation(); enablePush(); };
    document.addEventListener('click', function(e){
      var p = document.getElementById('nfPanel');
      if(NF.open && p && !p.contains(e.target)) close();
    });
    return true;
  }

  function toggle(){ NF.open ? close() : open(); }
  function open(){
    NF.open = true;
    document.getElementById('nfPanel').classList.remove('hidden');
    refresh(true);
    maybeOfferPush();
  }
  function close(){
    NF.open = false;
    var p = document.getElementById('nfPanel');
    if(p) p.classList.add('hidden');
  }

  /* ---------- rendering ---------- */
  var ICON = { assigned:'&#128203;', approval:'&#9989;', due:'&#9200;', overdue:'&#128293;', completed:'&#127881;' };

  function ago(iso){
    var t = new Date(iso).getTime();
    if(!t) return '';
    var s = Math.max(0, Math.round((Date.now()-t)/1000));
    if(s < 60) return 'just now';
    var m = Math.round(s/60);   if(m < 60) return m + 'm ago';
    var h = Math.round(m/60);   if(h < 24) return h + 'h ago';
    var d = Math.round(h/24);   if(d < 7)  return d + 'd ago';
    return new Date(iso).toLocaleDateString();
  }

  function paint(){
    var badge = document.getElementById('nfBadge');
    if(badge){
      badge.textContent = NF.unread > 99 ? '99+' : String(NF.unread);
      badge.classList.toggle('hidden', NF.unread === 0);
    }
    var list = document.getElementById('nfList');
    if(!list) return;
    if(!NF.items.length){
      list.innerHTML = '<div class="nf-empty">Nothing yet. You\'re all caught up.</div>';
      return;
    }
    list.innerHTML = NF.items.map(function(n){
      return '<div class="nf-item' + (n.read ? '' : ' unread') + (n.priority==='High' ? ' hi' : '') + '" data-id="' + esc(n.notifId) + '" data-url="' + esc(n.url||'#tasks') + '">' +
               '<div class="nf-i">' + (ICON[n.kind] || '&#128276;') + '</div>' +
               '<div class="nf-t"><b>' + esc(n.title) + '</b><span>' + esc(n.body) + '</span>' +
                 '<i>' + esc(ago(n.createdAt)) + '</i></div>' +
             '</div>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('.nf-item'), function(el){
      el.onclick = function(){
        var id = el.getAttribute('data-id'), url = el.getAttribute('data-url') || '#tasks';
        markRead([id]);
        close();
        var page = url.replace(/^#/, '') || 'tasks';
        if(typeof go === 'function') go(page);
      };
    });
  }

  /* ---------- data ---------- */
  function refresh(force){
    if(!window.API || !API.nfList) return Promise.resolve();
    return API.nfList(50).then(function(r){
      if(!r || !r.ok) return;
      var prevSeen = NF.booted;
      var fresh = [];
      (r.notifications||[]).forEach(function(n){
        if(prevSeen && !NF.seen[n.notifId] && !n.read) fresh.push(n);
        NF.seen[n.notifId] = 1;
      });
      NF.items = r.notifications || [];
      NF.unread = r.unread || 0;
      NF.booted = true;
      paint();
      /* Toast + OS banner for anything that arrived while the app was open — this is what
         makes it feel live rather than something you have to go and look for. */
      if(fresh.length) announce(fresh);
    }).catch(function(){});
  }

  function announce(fresh){
    var n = fresh[0];
    if(typeof toast === 'function')
      toast(fresh.length > 1 ? (fresh.length + ' new notifications') : (n.title + ' — ' + n.body));
    if(typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden){
      fresh.slice(0,3).forEach(function(x){
        try{ new Notification(x.title, { body:x.body, icon:'icons/icon-192.png', tag:x.notifId }); }catch(e){}
      });
    }
  }

  function markRead(ids){
    ids = (ids||[]).filter(function(id){
      for(var i=0;i<NF.items.length;i++) if(NF.items[i].notifId===id) return !NF.items[i].read;
      return false;
    });
    if(!ids.length) return;
    NF.items.forEach(function(n){ if(ids.indexOf(n.notifId)>=0) n.read = true; });
    NF.unread = Math.max(0, NF.unread - ids.length);
    paint();
    API.nfMarkRead(ids).catch(function(){});
  }

  function markAll(){
    if(!NF.unread) return;
    NF.items.forEach(function(n){ n.read = true; });
    NF.unread = 0;
    paint();
    API.nfMarkAllRead().catch(function(){});
  }

  /* ---------- polling ---------- */
  function tick(){
    if(document.hidden || !navigator.onLine) return;
    if(!document.getElementById('nfBell')) return;
    refresh();
  }
  function startPolling(){
    if(NF.timer) return;
    NF.timer = setInterval(tick, POLL_MS);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) tick(); });
    window.addEventListener('online', tick);
  }

  /* ---------- web push (progressive enhancement) ---------- */
  function pushSupported(){
    return ('serviceWorker' in navigator) && ('PushManager' in window) && (typeof Notification !== 'undefined');
  }
  function maybeOfferPush(){
    var row = document.getElementById('nfPushRow');
    if(!row) return;
    if(!pushSupported() || Notification.permission === 'granted' || Notification.permission === 'denied'){
      row.classList.add('hidden'); return;
    }
    /* Only offer once we know the server can actually send. Asking for permission we
       cannot act on is the fastest way to get permanently blocked by the browser. */
    if(NF.cfg === undefined){
      NF.cfg = 'loading';
      row.classList.add('hidden');
      API.nfPushConfig().then(function(r){
        NF.cfg = (r && r.ok) ? r : null;
        var el = document.getElementById('nfPushRow');
        if(el && NF.open) el.classList.toggle('hidden', !(NF.cfg && NF.cfg.configured));
      }).catch(function(){ NF.cfg = null; });
      return;
    }
    if(!NF.cfg || NF.cfg === 'loading'){ row.classList.add('hidden'); return; }
    row.classList.toggle('hidden', !NF.cfg.configured);
  }

  function loadScript(src){
    return new Promise(function(res, rej){
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function(){ rej(new Error('Could not load '+src)); };
      document.head.appendChild(s);
    });
  }

  function enablePush(){
    var btn = document.getElementById('nfPushBtn');
    if(btn){ btn.disabled = true; btn.textContent = 'Enabling…'; }
    var fail = function(msg){
      if(typeof toast === 'function') toast(msg, true);
      if(btn){ btn.disabled = false; btn.textContent = 'Turn on'; }
    };
    if(!pushSupported()) return fail('This browser cannot show alerts when the app is closed.');

    Notification.requestPermission().then(function(perm){
      if(perm !== 'granted'){
        if(btn) btn.parentNode.classList.add('hidden');
        return fail('Alerts stayed off. You can turn them on in browser settings later.');
      }
      return API.nfPushConfig().then(function(cfg){
        if(!cfg || !cfg.ok || !cfg.configured) throw new Error('Push is not set up on the server yet.');
        NF.cfg = cfg;
        return loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
          .then(function(){ return loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'); })
          .then(function(){
            if(!firebase.apps.length){
              firebase.initializeApp({ apiKey:cfg.apiKey, projectId:cfg.projectId,
                                       messagingSenderId:cfg.senderId, appId:cfg.appId });
            }
            return navigator.serviceWorker.ready;
          })
          .then(function(reg){
            /* Reuse the app's existing service worker instead of adding firebase-messaging-sw.js —
               sw.js already handles the push event itself, so a second worker would be dead weight. */
            return firebase.messaging().getToken({ vapidKey:cfg.vapidKey, serviceWorkerRegistration:reg });
          })
          .then(function(tok){
            if(!tok) throw new Error('The browser did not return a push token.');
            var plat = /android/i.test(navigator.userAgent) ? 'android'
                     : /iphone|ipad/i.test(navigator.userAgent) ? 'ios' : 'desktop';
            return API.nfRegisterPush(tok, plat, navigator.userAgent);
          })
          .then(function(r){
            if(!r || !r.ok) throw new Error((r && r.error) || 'Could not save the subscription.');
            if(typeof toast === 'function') toast('Alerts are on for this device');
            var row = document.getElementById('nfPushRow');
            if(row) row.classList.add('hidden');
          });
      });
    }).catch(function(e){ fail(e.message || 'Could not turn on alerts.'); });
  }

  /* ---------- service worker messages (tapping an OS notification) ---------- */
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message', function(e){
      var d = e.data || {};
      if(d.type === 'NOTIFICATION_CLICK'){
        var page = String(d.url || '#tasks').replace(/^#/, '') || 'tasks';
        if(typeof go === 'function') go(page);
        refresh(true);
      }
    });
  }

  /* ---------- boot ----------
     The topbar only exists once the user is inside the app, and enterAppInstant()
     can fire before or after this file loads. Poll briefly for the anchor rather
     than patching app.js's boot sequence. */
  function boot(){
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if(mount()){
        clearInterval(iv);
        refresh(true);
        startPolling();
      } else if(tries > 120){ clearInterval(iv); }   // ~60s, then give up quietly
    }, 500);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.NFRefresh = function(){ return refresh(true); };   // callable after task actions
})();
