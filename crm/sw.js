/* Nakoda CRM service worker — scope /crm/ only (the MIS keeps its own worker at the site root).
   Network first, so a new upload is picked up on the next open; the cached copy is used only
   when there is no network. API calls (script.google.com) are never cached. */
var CACHE = 'nakoda-crm-v1.0';
var SHELL = ['./', './index.html', './crm.css', './crm.js', './config.js', './manifest.webmanifest', './icons/crm-192.png', './icons/crm-512.png'];
self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return Promise.all(SHELL.map(function(u){ return c.add(u).catch(function(){}); })); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k.indexOf('nakoda-crm-') === 0 && k !== CACHE; }).map(function(k){ return caches.delete(k); })); }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function(res){
    if(res && res.status === 200){ var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(req, copy); }); }
    return res;
  }).catch(function(){
    return caches.match(req).then(function(hit){ return hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined); });
  }));
});
