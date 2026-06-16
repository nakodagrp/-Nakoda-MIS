/* ============================================================
 *  Nakoda MIS — offline data layer
 *  - Talks to the Apps Script JSON API when online
 *  - Caches reads in IndexedDB so screens open instantly / offline
 *  - Queues writes in an "outbox" and syncs them when back online
 * ============================================================ */
(function(){
  var DB_NAME='nakoda_mis', DB_VER=1, _db=null;
  var listeners=[];

  /* ---------- IndexedDB ---------- */
  function openDB(){
    if(_db) return Promise.resolve(_db);
    return new Promise(function(res,rej){
      var r=indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded=function(){
        var db=r.result;
        if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if(!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox',{keyPath:'id',autoIncrement:true});
      };
      r.onsuccess=function(){ _db=r.result; res(_db); };
      r.onerror=function(){ rej(r.error); };
    });
  }
  function tx(store,mode){ return openDB().then(function(db){ return db.transaction(store,mode).objectStore(store); }); }
  function kvGet(k){ return tx('kv','readonly').then(function(s){ return new Promise(function(res){ var r=s.get(k); r.onsuccess=function(){res(r.result);}; r.onerror=function(){res(undefined);}; }); }); }
  function kvSet(k,v){ return tx('kv','readwrite').then(function(s){ return new Promise(function(res){ var r=s.put(v,k); r.onsuccess=function(){res();}; r.onerror=function(){res();}; }); }); }
  function obAdd(item){ return tx('outbox','readwrite').then(function(s){ return new Promise(function(res){ var r=s.add(item); r.onsuccess=function(){res(r.result);}; r.onerror=function(){res();}; }); }); }
  function obAll(){ return tx('outbox','readonly').then(function(s){ return new Promise(function(res){ var r=s.getAll(); r.onsuccess=function(){res(r.result||[]);}; r.onerror=function(){res([]);}; }); }); }
  function obDel(id){ return tx('outbox','readwrite').then(function(s){ return new Promise(function(res){ var r=s.delete(id); r.onsuccess=function(){res();}; r.onerror=function(){res();}; }); }); }

  /* ---------- token ---------- */
  function getToken(){ try{ return localStorage.getItem('nk_tok')||''; }catch(e){ return ''; } }
  function setToken(t){ try{ t?localStorage.setItem('nk_tok',t):localStorage.removeItem('nk_tok'); }catch(e){} }

  /* ---------- network ---------- */
  function apiUrl(){ return (window.NAKODA_CONFIG&&window.NAKODA_CONFIG.API_URL)||''; }
  function configured(){ var u=apiUrl(); return u && u.indexOf('PASTE_YOUR')<0; }
  function call(action, payload){
    var body=JSON.stringify(Object.assign({action:action}, payload||{}));
    return fetch(apiUrl(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:body,redirect:'follow'})
      .then(function(r){ return r.json(); });
  }

  /* ---------- status broadcasting ---------- */
  function emit(){
    obAll().then(function(items){
      var st={ online:navigator.onLine, configured:configured(), pending:items.length, syncing:_syncing };
      listeners.forEach(function(cb){ try{cb(st);}catch(e){} });
    });
  }
  function onStatus(cb){ listeners.push(cb); emit(); }

  /* ---------- helpers ---------- */
  function uuid(){ return 'xxxxxxxx'.replace(/x/g,function(){return (Math.random()*16|0).toString(16);}); }
  function randomPw(){ var c='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789',s=''; for(var i=0;i<8;i++) s+=c.charAt(Math.floor(Math.random()*c.length)); return s; }
  function suggestLoginId(name){ var b=String(name||'').toLowerCase().replace(/[^a-z]/g,'').slice(0,8)||'staff'; return b+(Math.floor(Math.random()*900)+100); }

  /* ---------- cached reads ---------- */
  function cachedEmployees(){ return kvGet('employees').then(function(v){ return v||[]; }); }
  function cachedMeta(){ return kvGet('meta'); }
  function cachedUser(){ return kvGet('me'); }

  /* merge outbox optimistic changes into a list */
  function applyOutbox(list){
    list=(list||[]).slice();
    return obAll().then(function(items){
      items.forEach(function(it){
        if(it.action==='createEmployee'){
          list.push(Object.assign({EmpID:it.tempId, LoginID:it.data.LoginID, FullName:it.data.FullName, Role:it.data.Role,
            OfficeType:it.officeType, Branch:it.data.Branch||'HQ', Phone:it.data.Phone||'', Status:'Active', _pending:true}, {}));
        } else if(it.action==='updateEmployee'){
          for(var i=0;i<list.length;i++){ if(String(list[i].EmpID)===String(it.empId)){ Object.assign(list[i], it.data); list[i]._pending=true; } }
        } else if(it.action==='setStatus'){
          for(var j=0;j<list.length;j++){ if(String(list[j].EmpID)===String(it.empId)){ list[j].Status=it.status; list[j]._pending=true; } }
        }
      });
      return list;
    });
  }

  /* ---------- public API ---------- */
  var API={
    onStatus:onStatus, getToken:getToken, configured:configured,

    login:function(loginId,password){
      return call('login',{loginId:loginId,password:password}).then(function(r){
        if(r.ok){ setToken(r.token); }
        return r;
      });
    },
    validate:function(){
      var t=getToken(); if(!t) return Promise.resolve({ok:false,error:'No session'});
      return call('validate',{token:t});
    },
    logout:function(){ var t=getToken(); setToken(''); return call('logout',{token:t}).catch(function(){return {ok:true};}); },
    changePassword:function(oldPw,newPw){
      if(!navigator.onLine) return Promise.resolve({ok:false,error:'Changing password needs an internet connection.'});
      return call('changePassword',{token:getToken(),oldPw:oldPw,newPw:newPw});
    },

    getMetadata:function(){
      var t=getToken();
      return call('metadata',{token:t}).then(function(r){
        if(r.ok){ kvSet('meta',{roles:r.roles,branches:r.branches}); kvSet('me',r.me); kvSet('perms',r.perms); }
        return r;
      }).catch(function(){
        return Promise.all([cachedMeta(),cachedUser(),kvGet('perms')]).then(function(a){
          if(a[0]) return {ok:true, roles:a[0].roles, branches:a[0].branches, me:a[1], perms:a[2], offline:true};
          return {ok:false, error:'Offline and no saved data yet.'};
        });
      });
    },

    /* always fetches the full scoped list; filtering happens in the UI */
    listEmployees:function(){
      var t=getToken();
      return call('listEmployees',{token:t,filter:{}}).then(function(r){
        if(r.ok){ kvSet('employees',r.employees); kvSet('perms',r.perms); return applyOutbox(r.employees).then(function(list){ return {ok:true, employees:list, perms:r.perms}; }); }
        return r;
      }).catch(function(){
        return Promise.all([cachedEmployees(),kvGet('perms')]).then(function(a){
          return applyOutbox(a[0]).then(function(list){ return {ok:true, employees:list, perms:a[1], offline:true}; });
        });
      });
    },

    getEmployee:function(empId){
      var t=getToken();
      return call('getEmployee',{token:t,empId:empId}).catch(function(){
        return cachedEmployees().then(function(list){
          var e=list.filter(function(x){return String(x.EmpID)===String(empId);})[0];
          return e?{ok:true,employee:e,canEdit:false,offline:true}:{ok:false,error:'Not available offline.'};
        });
      });
    },

    createEmployee:function(data){
      var t=getToken(); var tempPw=randomPw();
      if(navigator.onLine){
        return call('createEmployee',{token:t,data:Object.assign({},data,{TempPassword:tempPw})})
          .then(function(r){ if(r.ok){ API.refreshEmployees(); } return r; })
          .catch(function(){ return queueCreate(data,tempPw); });
      }
      return queueCreate(data,tempPw);
    },

    updateEmployee:function(empId,data){
      var t=getToken();
      if(navigator.onLine){
        return call('updateEmployee',{token:t,empId:empId,data:data})
          .then(function(r){ if(r.ok){ API.refreshEmployees(); } return r; })
          .catch(function(){ return queueUpdate(empId,data); });
      }
      return queueUpdate(empId,data);
    },

    setStatus:function(empId,status){
      var t=getToken();
      if(navigator.onLine){
        return call('setStatus',{token:t,empId:empId,status:status})
          .then(function(r){ if(r.ok){ API.refreshEmployees(); } return r; })
          .catch(function(){ return queueStatus(empId,status); });
      }
      return queueStatus(empId,status);
    },

    resetPassword:function(empId){
      if(!navigator.onLine) return Promise.resolve({ok:false,error:'Resetting a password needs an internet connection.'});
      return call('resetPassword',{token:getToken(),empId:empId});
    },

    listBranchesFull:function(){ return call('listBranches',{token:getToken()}); },
    createBranch:function(data){ return call('createBranch',{token:getToken(),data:data}); },
    updateBranch:function(id,data){ return call('updateBranch',{token:getToken(),branchId:id,data:data}); },

    /* fire-and-forget cache refresh */
    refreshEmployees:function(){ return API.listEmployees().catch(function(){}); },

    syncOutbox:syncOutbox,
    pending:function(){ return obAll().then(function(i){return i.length;}); },
    clearLocal:function(){ setToken(''); return Promise.all([kvSet('employees',null),kvSet('meta',null),kvSet('me',null),kvSet('perms',null)]); }
  };

  function queueCreate(data,tempPw){
    var loginId=data.LoginID||suggestLoginId(data.FullName);
    var officeType=null;
    return cachedMeta().then(function(meta){
      if(meta){ var rr=(meta.roles||[]).filter(function(x){return x.Role===data.Role;})[0]; if(rr) officeType=rr.OfficeType; }
      var d=Object.assign({},data,{LoginID:loginId,TempPassword:tempPw});
      return obAdd({action:'createEmployee',data:d,officeType:officeType,tempId:'PENDING-'+uuid(),ts:Date.now()}).then(function(){
        emit(); return {ok:true, loginId:loginId, tempPassword:tempPw, offline:true};
      });
    });
  }
  function queueUpdate(empId,data){ return obAdd({action:'updateEmployee',empId:empId,data:data,ts:Date.now()}).then(function(){ emit(); return {ok:true,offline:true}; }); }
  function queueStatus(empId,status){ return obAdd({action:'setStatus',empId:empId,status:status,ts:Date.now()}).then(function(){ emit(); return {ok:true,offline:true}; }); }

  var _syncing=false;
  function syncOutbox(){
    if(_syncing || !navigator.onLine || !configured()) return Promise.resolve();
    _syncing=true; emit();
    var token=getToken();
    return obAll().then(function(items){
      items.sort(function(a,b){return a.id-b.id;});
      function next(i){
        if(i>=items.length) return Promise.resolve();
        var it=items[i], payload={token:token};
        if(it.action==='createEmployee') payload.data=it.data;
        if(it.action==='updateEmployee'){ payload.empId=it.empId; payload.data=it.data; }
        if(it.action==='setStatus'){ payload.empId=it.empId; payload.status=it.status; }
        return call(it.action,payload).then(function(r){
          // remove on success OR on a logical (non-network) rejection so the queue never jams
          return obDel(it.id).then(function(){ return next(i+1); });
        }).catch(function(){
          // network error — stop; will retry next time
          return Promise.reject('network');
        });
      }
      return next(0);
    }).then(function(){ _syncing=false; emit(); return API.refreshEmployees(); })
      .catch(function(){ _syncing=false; emit(); });
  }

  /* auto-sync triggers */
  window.addEventListener('online', function(){ emit(); syncOutbox(); });
  window.addEventListener('offline', emit);
  window.addEventListener('focus', function(){ if(navigator.onLine) syncOutbox(); });
  setInterval(function(){ if(navigator.onLine) syncOutbox(); }, 30000);

  window.API=API;
})();
