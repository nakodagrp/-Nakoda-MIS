/* v458 — Nakoda MIS moved to Apps Script. This service worker REMOVES the old offline copy on every phone/computer
   (deletes all caches, unregisters itself) and reloads the page, which then forwards to the new MIS link. */
var CACHE_VERSION = 'nakoda-mis-v458-moved';
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){ return Promise.all(keys.map(function(k){ return caches.delete(k); })); })
      .then(function(){ return self.registration.unregister(); })
      .then(function(){ return self.clients.matchAll({type:'window'}); })
      .then(function(list){ list.forEach(function(c){ try{ c.navigate(c.url); }catch(x){} }); })
  );
});
self.addEventListener('fetch', function(e){ /* no cache any more — everything straight from the network */ });
