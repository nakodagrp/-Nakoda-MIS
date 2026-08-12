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
  function obPut(item){ return tx('outbox','readwrite').then(function(s){ return new Promise(function(res){ var r=s.put(item); r.onsuccess=function(){res(r.result);}; r.onerror=function(){res();}; }); }); }

  /* ---------- token ---------- */
  function getToken(){ try{ return localStorage.getItem('nk_tok')||''; }catch(e){ return ''; } }
  function setToken(t){ try{ t?localStorage.setItem('nk_tok',t):localStorage.removeItem('nk_tok'); }catch(e){} }

  /* ---------- network ---------- */
  function apiUrl(){ return (window.NAKODA_CONFIG&&window.NAKODA_CONFIG.API_URL)||''; }
  function configured(){ var u=apiUrl(); return u && u.indexOf('PASTE_YOUR')<0; }
  function NET(action, payload, timeoutMs){
    var body=JSON.stringify(Object.assign({action:action}, payload||{}));
    var ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
    var to=ctrl?setTimeout(function(){ try{ctrl.abort();}catch(e){} }, timeoutMs||60000):null;   // never hang forever
    return fetch(apiUrl(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:body,redirect:'follow',signal:ctrl?ctrl.signal:undefined})
      .then(function(r){ return r.json(); })
      .then(function(j){ if(to) clearTimeout(to); return j; }, function(e){ if(to) clearTimeout(to); throw e; });
  }
  /* Every action that CHANGES data (used to tell reads from writes). */
  var WRITES={createEmployee:1,updateEmployee:1,setStatus:1,resetPassword:1,changePassword:1,createBranch:1,updateBranch:1,
    upsertCardType:1,issueCard:1,renewCard:1,cancelCard:1,setCardPrice:1,markCardSent:1,markCardActivated:1,
    createTask:1,updateTask:1,setTaskStatus:1,deleteTask:1,createCalEntry:1,updateCalEntry:1,saveRecurring:1,setRecurringActive:1,
    checkIn:1,checkOut:1,setAttendance:1,applyLeave:1,setLeave:1,cancelLeave:1,saveHoliday:1,savePolicy:1,ackPolicy:1,submitClaim:1,setClaim:1,runPayroll:1,approvePayroll:1,confirmAbsent:1,
    saveDaily:1,verifyDaily:1,rejectDaily:1,addLedger:1,setLedger:1,saveInvoice:1,recordPayment:1,saveBankRows:1,saveBankRule:1,
    saveDeposit:1,verifyDeposit:1,rejectDeposit:1,
    saveItem:1,deleteItem:1,saveVendor:1,deleteVendor:1,saveConsumption:1,saveManualConsumption:1,raiseIndent:1,advanceIndent:1,saveAudit:1,approveAudit:1,
    createPayRequest:1,setPayRequest:1,
    saveSection:1,deleteSection:1,saveVideo:1,deleteVideo:1,submitQuiz:1,saveAsset:1,deleteAsset:1,
    login:1,validate:1,logout:1,uploadFile:1,importOldCards:1,attachSelfie:1,waTest:1,waSendCard:1,saveWaTemplate:1,waTestTemplate:1,
    submitSuggestion:1,replySuggestion:1,saveFixedAsset:1,deleteFixedAsset:1,completeFollowup:1};
  /* Writes that already do their own optimistic queueing inside the method (don't double-queue here). */
  var SELF_QUEUE={createEmployee:1,updateEmployee:1,setStatus:1,issueCard:1,renewCard:1,cancelCard:1,markCardSent:1,markCardActivated:1,
    createTask:1,updateTask:1,setTaskStatus:1,deleteTask:1,createCalEntry:1,updateCalEntry:1,attachSelfie:1};
  /* Writes that MUST stay online (auth, server-computed, exact-time, bulk). */
  var NOQUEUE={login:1,validate:1,logout:1,changePassword:1,resetPassword:1,checkIn:1,checkOut:1,runPayroll:1,approvePayroll:1,confirmAbsent:1,uploadFile:1,importOldCards:1,submitQuiz:1,waTest:1,waSendCard:1,saveWaTemplate:1,waTestTemplate:1};
  /* ---------------- ATTACHMENTS ----------------------------------------------------
     A phone photo of a report is 4-8 MB. Sent as base64 it grows by a third, so ~10 MB was
     going up a branch connection against a hard 60-second abort — the request was killed
     before it finished and every failure printed the same fixed line, with r.error thrown
     away, so there was nothing to act on.
     Images are now resized on the device first (6 MB -> roughly 300 KB), uploads alone get a
     longer ceiling, a network blip retries once, and the real reason is surfaced. */
  var UPLOAD_MAX_PX = 1600, UPLOAD_QUALITY = 0.82, UPLOAD_PDF_MAX = 8*1024*1024, UPLOAD_TIMEOUT = 180000;
  function fsize(b){ return b<1048576 ? (Math.round(b/1024)+' KB') : ((b/1048576).toFixed(1)+' MB'); }
  /* Resolves to null when there is nothing worth doing — a PDF, a small photo, or any failure.
     Never rejects: if compression cannot run we simply send the original. */
  function shrinkImage(file){
    return new Promise(function(resolve){
      if(!file || !/^image\//i.test(file.type||'')) return resolve(null);
      if(typeof document==='undefined' || !document.createElement) return resolve(null);
      var url, img=new Image();
      try{ url=URL.createObjectURL(file); }catch(e){ return resolve(null); }
      img.onload=function(){
        try{
          var w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
          if(!w||!h){ URL.revokeObjectURL(url); return resolve(null); }
          var scale=Math.min(1, UPLOAD_MAX_PX/Math.max(w,h));
          if(scale>=1 && file.size<600*1024){ URL.revokeObjectURL(url); return resolve(null); }   // already small
          var cw=Math.max(1,Math.round(w*scale)), ch=Math.max(1,Math.round(h*scale));
          var c=document.createElement('canvas'); c.width=cw; c.height=ch;
          var x=c.getContext('2d');
          x.fillStyle='#fff'; x.fillRect(0,0,cw,ch);       // flatten transparency, JPEG has none
          x.drawImage(img,0,0,cw,ch);
          c.toBlob(function(b){
            URL.revokeObjectURL(url);
            if(!b || b.size>=file.size) return resolve(null);   // never send something bigger
            resolve({blob:b, name:String(file.name||'photo').replace(/\.[^.]+$/,'')+'.jpg', type:'image/jpeg', was:file.size});
          },'image/jpeg',UPLOAD_QUALITY);
        }catch(e){ try{URL.revokeObjectURL(url);}catch(_){ } resolve(null); }
      };
      img.onerror=function(){ try{URL.revokeObjectURL(url);}catch(_){ } resolve(null); };
      img.src=url;
    });
  }
  function readB64(blob){
    return new Promise(function(res,rej){
      var fr=new FileReader();
      fr.onload=function(){ var d=String(fr.result||''), i=d.indexOf(',');
        if(i<0) return rej(new Error('Could not read that file.'));
        res(d.slice(i+1)); };
      fr.onerror=function(){ rej(new Error('Could not read that file.')); };
      try{ fr.readAsDataURL(blob); }catch(e){ rej(new Error('Could not read that file.')); }
    });
  }
  function uploadSmart(file, subPath, onStatus){
    onStatus = onStatus || function(){};
    if(!file) return Promise.reject(new Error('No file selected.'));
    if(typeof navigator!=='undefined' && navigator.onLine===false)
      return Promise.reject(new Error('You are offline — reconnect to attach this file.'));
    onStatus('Preparing…');
    return shrinkImage(file).then(function(small){
      var blob = small ? small.blob : file;
      var name = small ? small.name : (file.name||'file');
      var type = small ? small.type : (file.type||'application/octet-stream');
      if(!small && blob.size > UPLOAD_PDF_MAX)
        throw new Error('That file is '+fsize(blob.size)+'. Documents need to be under 8 MB.');
      onStatus(small ? ('Shrunk '+fsize(small.was)+' → '+fsize(blob.size)+', uploading…')
                     : ('Uploading '+fsize(blob.size)+'…'));
      return readB64(blob).then(function(b64){
        function attempt(left){
          return call('uploadFile',{token:getToken(),base64:b64,fileName:name,mimeType:type,subPath:subPath||''}, UPLOAD_TIMEOUT)
            .then(function(r){
              if(r && r.ok) return r;
              throw new Error((r && r.error) || 'The server rejected the upload.');   // a real answer — do not retry
            }, function(){
              if(left>0){ onStatus('Connection dropped — retrying…'); return attempt(left-1); }
              throw new Error((typeof navigator!=='undefined' && navigator.onLine===false)
                ? 'You are offline — reconnect to attach this file.'
                : 'Upload timed out. The connection is too slow right now — try again.');
            });
        }
        return attempt(1);
      });
    });
  }

  /* ============================================================ v284 — CACHE WAS SHARED BETWEEN USERS
     THE BUG, seen directly in a screenshot: Hethvee Tandel's attendance card was showing Anurag Shukla's
     record — his check-in, his check-out, his whole month strip.

     Cause: rk() deliberately strips the token before building the cache key, so every cached read landed
     under a key like  rc:myAttendance:{"ym":"2026-08"}  with nothing in it identifying WHOSE data it was.
     One shared key per device. And clearLocal() (logout) cleared eight named keys but never touched the
     rc: read cache or 'myatt' — so whoever logged in next was served the previous person's data until the
     network answered, and on a weak connection (where the fetch throws and we fall back to cache) they
     kept being served it.

     That is a privacy leak, and it is also why the Approve list showed a punch-out as missing that had
     actually been recorded — the list was a saved copy from another session, not live data.

     Fix: every cached read is namespaced to the signed-in employee, and switching user wipes the store. */
  function curUid(){ try{ return localStorage.getItem('nk_uid')||'anon'; }catch(e){ return 'anon'; } }
  function setUid(id){ try{ id?localStorage.setItem('nk_uid',String(id)):localStorage.removeItem('nk_uid'); }catch(e){} }
  /* Wipe every cached read. Called when the signed-in person changes, so one user's data can never be
     shown to another — belt as well as braces, since the keys are namespaced too. */
  function wipeCache(){
    return tx('kv','readwrite').then(function(s){ return new Promise(function(res){ var r=s.clear(); r.onsuccess=function(){res();}; r.onerror=function(){res();}; }); }).catch(function(){});
  }
  /* Call on every successful login/validate. If the person changed, clear first. */
  function adoptUser(u){
    var id=String((u&&(u.EmpID||u.empId))||'');
    if(!id) return Promise.resolve();
    if(curUid()===id) return Promise.resolve();
    var had=curUid();
    setUid(id);
    return (had && had!=='anon') ? wipeCache() : Promise.resolve();
  }
  function rk(action,payload){ var p=Object.assign({},payload||{}); delete p.token; return 'rc:'+curUid()+':'+action+':'+JSON.stringify(p); }
  function noTok(payload){ var p=Object.assign({},payload||{}); delete p.token; return p; }
  function enqueue(action,payload){ return obAdd({action:action,payload:noTok(payload),ts:Date.now()}).then(function(){ emit(); return {ok:true,offline:true}; }); }
  function readGet(action,payload){ return kvGet(rk(action,payload)).then(function(c){ if(c){ try{c=JSON.parse(JSON.stringify(c));}catch(e){} c.offline=true; return c; } return {ok:false,offline:true,error:'Not available offline yet — open this once while online.'}; }); }
  function call(action, payload, timeoutMs){
    var isWrite=WRITES[action], queueable=isWrite && !SELF_QUEUE[action] && !NOQUEUE[action];
    if(!isWrite){                                   /* READ: cache-first fallback, instant when offline */
      if(!navigator.onLine) return readGet(action,payload);
      return NET(action,payload,timeoutMs).then(function(r){ if(r&&r.ok){ kvSet(rk(action,payload),r); } return r; }).catch(function(){ return readGet(action,payload); });
    }
    if(queueable && !navigator.onLine) return enqueue(action,payload);     /* WRITE offline: save instantly to outbox */
    if(queueable) return NET(action,payload,timeoutMs).catch(function(){ return enqueue(action,payload); });
    return NET(action,payload,timeoutMs);            /* self-queued (method handles) or online-only */
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

    /* ---- Suggestion / Complaint to MD ---- */
    submitSuggestion:function(data){ return call('submitSuggestion',{token:getToken(),data:data}); },
    mySuggestions:function(){ return call('mySuggestions',{token:getToken()}); },
    suggestionInbox:function(){ return call('suggestionInbox',{token:getToken()}); },
    replySuggestion:function(sugId,reply){ return call('replySuggestion',{token:getToken(),sugId:sugId,reply:reply}); },

    /* ---- Fixed Asset Management ---- */
    fixedAssets:function(branch){ return call('fixedAssets',{token:getToken(),branch:branch||''}); },
    saveFixedAsset:function(data){ return call('saveFixedAsset',{token:getToken(),data:data}); },
    deleteFixedAsset:function(assetId){ return call('deleteFixedAsset',{token:getToken(),assetId:assetId}); },

    /* v295: login had NO explicit timeout, so it inherited NET's 60-second default — and bindAuth
       retries it three times. Worst case was 60 + 1.5 + 60 + 3 + 60 = about THREE MINUTES of
       "Signing in…" before the user was told anything at all. The retries themselves are correct and
       stay (Apps Script drops requests past 30 simultaneous, which is exactly the morning rush), but
       each attempt now gives up after 25s so all three finish inside ~55s instead of ~180s. */
    login:function(loginId,password,timeoutMs){
      return call('login',{loginId:loginId,password:password}, timeoutMs||25000).then(function(r){
        /* v187: server now sends metadata with the login reply — cache it so the app can enter instantly */
        /* v284: adopt the user FIRST. If a different person was signed in on this device, that wipes the
           cached reads before anything of theirs can be painted under the new login. */
        if(r.ok){
          setToken(r.token);
          return adoptUser(r.me||r.user).then(function(){
            if(r.perms){ kvSet('meta',{roles:r.roles||[],branches:r.branches||[]}); kvSet('me',r.me||r.user); kvSet('perms',r.perms); }
            return r;
          });
        }
        return r;
      });
    },
    validate:function(){
      var t=getToken(); if(!t) return Promise.resolve({ok:false,error:'No session'});
      return call('validate',{token:t}).then(function(r){
        if(r&&r.ok&&r.user) return adoptUser(r.user).then(function(){ return r; });   // v284: catches a token that belongs to someone else
        return r;
      });
    },
    /* v187: fire-and-forget ping that wakes the Apps Script container while the user is still
       typing their password — first real call (login) then lands on a warm server. */
    warm:function(){ try{ return call('validate',{token:''}).catch(function(){}); }catch(e){ return Promise.resolve(); } },
    logout:function(){ var t=getToken(); setToken(''); return call('logout',{token:t}).catch(function(){return {ok:true};}); },
    changePassword:function(oldPw,newPw){
      if(!navigator.onLine) return Promise.resolve({ok:false,error:'Changing password needs an internet connection.'});
      return call('changePassword',{token:getToken(),oldPw:oldPw,newPw:newPw});
    },

    getMetadata:function(){
      var t=getToken();
      return call('metadata',{token:t}).then(function(r){
        /* v296: the login path (above) already writes these with ||[] fallbacks; this one did not.
           A metadata reply that omitted branches therefore stored {branches:undefined} in IndexedDB,
           and app.js populateSelectors() then threw on .map() on EVERY subsequent boot — which killed
           applyPerms() and go('dashboard') and left the dashboard permanently blank. Same guards here.
           Also: don't overwrite a good cached user with an empty one. */
        if(r.ok){
          kvSet('meta',{roles:r.roles||[],branches:r.branches||[]});
          if(r.me) kvSet('me',r.me);
          if(r.perms) kvSet('perms',r.perms);
        }
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
    saveSchedFooter:function(text){ return call('saveSchedFooter',{token:getToken(),text:text}); },

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
    uploadFile:function(args){ return call('uploadFile',Object.assign({token:getToken()},args||{}), UPLOAD_TIMEOUT); },
    /* Preferred entry point for every attachment in the app — see uploadSmart below. */
    upload:function(file, subPath, onStatus){ return uploadSmart(file, subPath, onStatus); },
    createBranch:function(data){ return call('createBranch',{token:getToken(),data:data}); },
    updateBranch:function(id,data){ return call('updateBranch',{token:getToken(),branchId:id,data:data}); },
    waTest:function(branchId,phone,keyOverride){
      if(!navigator.onLine) return Promise.resolve({ok:false,error:'Testing the WhatsApp API needs an internet connection.'});
      return call('waTest',{token:getToken(),branchId:branchId,phone:phone,keyOverride:keyOverride||''});
    },
    waSendCard:function(cardNumber,imageBase64,phone){
      if(!navigator.onLine) return Promise.resolve({ok:false,error:'Sending via the WhatsApp API needs an internet connection.'});
      return call('waSendCard',{token:getToken(),cardNumber:cardNumber,imageBase64:imageBase64,phone:phone||''}).then(function(r){ if(r.ok) API.refreshCards(); return r; });
    },
    listWaTemplates:function(){ return call('listWaTemplates',{token:getToken()}); },
    saveWaTemplate:function(data){
      if(!navigator.onLine) return Promise.resolve({ok:false,error:'Saving templates needs an internet connection.'});
      return call('saveWaTemplate',{token:getToken(),data:data});
    },
    waTestTemplate:function(branchId,tplId,phone,params,mediaUrl){
      if(!navigator.onLine) return Promise.resolve({ok:false,error:'Testing templates needs an internet connection.'});
      return call('waTestTemplate',{token:getToken(),branchId:branchId,tplId:tplId,phone:phone,params:params||[],mediaUrl:mediaUrl||''});
    },

    listCardTypes:function(){ return call('listCardTypes',{token:getToken()}).then(function(r){ if(r.ok) kvSet('cardtypes',r.types); return r; }).catch(function(){ return kvGet('cardtypes').then(function(t){ return {ok:true,types:t||[]}; }); }); },
    upsertCardType:function(data){ return call('upsertCardType',{token:getToken(),data:data}); },
    listCards:function(filter){ filter=filter||{}; var full=!filter.search&&!filter.status&&!filter.branchId&&!filter.typeId; return call('listCards',{token:getToken(),filter:filter}).then(function(r){ if(r.ok&&full) kvSet('cards',r.cards); return r; }).catch(function(){ return kvGet('cards').then(function(c){ return {ok:true,cards:c||[],perms:{},offline:true}; }); }); },
    getCard:function(n){ return call('getCard',{token:getToken(),cardNumber:n}); },
    issueCard:function(data){ if(navigator.onLine) return call('issueCard',{token:getToken(),data:data}).then(function(r){ if(r.ok) API.refreshCards(); return r; }).catch(function(){ return queueIssue(data); }); return queueIssue(data); },
    renewCard:function(n,img){ var f=function(){ return queueCardOp('renewCard',{cardNumber:n,imageDataUri:img||''},function(){ return patchCard(n,{status:'renewed',_pending:true}); }); }; if(navigator.onLine) return call('renewCard',{token:getToken(),cardNumber:n,imageDataUri:img||''}).then(function(r){ if(r.ok) API.refreshCards(); return r; }).catch(f); return f(); },
    cancelCard:function(n,reason){ var f=function(){ return queueCardOp('cancelCard',{cardNumber:n,reason:reason||''},function(){ return patchCard(n,{status:'cancelled',_pending:true}); }); }; if(navigator.onLine) return call('cancelCard',{token:getToken(),cardNumber:n,reason:reason||''}).then(function(r){ if(r.ok) API.refreshCards(); return r; }).catch(f); return f(); },
    cardSummary:function(){ return call('cardSummary',{token:getToken()}).catch(function(){ return {ok:false}; }); },
    cachedEmployees:function(){ return kvGet('employees'); },
    cachedCards:function(){ return kvGet('cards'); },
    cachedPrices:function(){ return kvGet('cardprices'); },
    cachedCardTypes:function(){ return kvGet('cardtypes'); },
    listCardPrices:function(){ return call('listCardPrices',{token:getToken()}).then(function(r){ if(r.ok) kvSet('cardprices',r.prices); return r; }).catch(function(){ return kvGet('cardprices').then(function(p){ return {ok:true,prices:p||[],canSet:false}; }); }); },
    setCardPrice:function(typeId,branchId,price){ return call('setCardPrice',{token:getToken(),typeId:typeId,branchId:branchId,price:price}); },
    markCardSent:function(n){ var now=new Date().toISOString(); var f=function(){ return queueCardOp('markCardSent',{cardNumber:n},function(){ return patchCard(n,{sentAt:now,_pending:true}); }); }; if(navigator.onLine) return call('markCardSent',{token:getToken(),cardNumber:n}).then(function(r){ if(r.ok) API.refreshCards(); return r; }).catch(f); return f(); },
    markCardActivated:function(n){ var now=new Date().toISOString(); var f=function(){ return queueCardOp('markCardActivated',{cardNumber:n},function(){ return patchCard(n,{activatedAt:now,sentAt:now,_pending:true}); }); }; if(navigator.onLine) return call('markCardActivated',{token:getToken(),cardNumber:n}).then(function(r){ if(r.ok) API.refreshCards(); return r; }).catch(f); return f(); },
    cardStatusSummary:function(branchId){ return call('cardStatusSummary',{token:getToken(),branchId:branchId||''}); },

    cachedTasks:function(){ return kvGet('tasks'); },
    listMyTasks:function(){ return call('listMyTasks',{token:getToken()}).then(function(r){ if(r.ok) kvSet('tasks',r.tasks); return r; }).catch(function(){ return kvGet('tasks').then(function(t){ return {ok:true,tasks:t||[],offline:true}; }); }); },
    listAssignedByMe:function(){ return call('listAssignedByMe',{token:getToken()}).then(function(r){ if(r.ok) kvSet('tasks_deleg',r.tasks); return r; }).catch(function(){ return kvGet('tasks_deleg').then(function(t){ return {ok:true,tasks:t||[],offline:true}; }); }); },
    refreshTasks:function(){ return API.listMyTasks().catch(function(){}); },
    createTask:function(data){ var id='TSK-'+uuid(); var assigning=!!(data&&data.assignedToEmpId); var d=Object.assign({source:assigning?'assigned':'self'},data,{taskId:id}); var f=function(){ return queueTask('createTask',{data:d}, assigning?null:function(){ return addTaskCache(Object.assign({},d,{status:'open',_pending:true})); }).then(function(r){ r.taskId=id; return r; }); }; if(navigator.onLine) return call('createTask',{token:getToken(),data:d}).then(function(r){ if(r.ok){ API.refreshTasks(); } return r; }).catch(f); return f(); },
    cachedAssignable:function(){ return kvGet('assignable'); },
    assignableEmployees:function(){ return call('assignableEmployees',{token:getToken()}).then(function(r){ if(r.ok) kvSet('assignable',{employees:r.employees,canAssign:r.canAssign}); return r; }).catch(function(){ return kvGet('assignable').then(function(a){ return {ok:true,employees:(a&&a.employees)||[],canAssign:!!(a&&a.canAssign),offline:true}; }); }); },
    updateTask:function(taskId,data){ var f=function(){ return queueTask('updateTask',{taskId:taskId,data:data},function(){ return patchTask(taskId,data); }); }; if(navigator.onLine) return call('updateTask',{token:getToken(),taskId:taskId,data:data}).then(function(r){ if(r.ok) API.refreshTasks(); return r; }).catch(f); return f(); },
    setTaskStatus:function(taskId,status,note){ return API.updateTask(taskId,{status:status,completionNote:note||''}); },
    deleteTask:function(taskId){ return API.updateTask(taskId,{status:'deleted'}); },
    cachedFollowups:function(){ return kvGet('pcfu'); },
    pcFollowups:function(){ return call('pcFollowups',{token:getToken()}).then(function(r){ if(r.ok) kvSet('pcfu',r.items); return r; }).catch(function(){ return kvGet('pcfu').then(function(i){ return {ok:true,items:i||[],offline:true}; }); }); },
    completeFollowup:function(data){ return call('completeFollowup',{token:getToken(),data:data}); },
    cachedAllTasks:function(){ return kvGet('alltasks'); },
    listAllTasks:function(filter){ return call('listAllTasks',{token:getToken(),filter:filter||{}}).then(function(r){ if(r.ok) kvSet('alltasks',r.tasks); return r; }).catch(function(){ return kvGet('alltasks').then(function(t){ return {ok:true,tasks:t||[],offline:true}; }); }); },
    calendarTargets:function(){ return call('calendarTargets',{token:getToken()}).then(function(r){ if(r.ok) kvSet('caltargets',r.targets); return r; }).catch(function(){ return kvGet('caltargets').then(function(t){ return {ok:true,targets:t||[]}; }); }); },
    cachedCalendar:function(owner){ return kvGet('cal_'+owner); },
    listCalendar:function(owner){ owner=owner||''; return call('listCalendar',{token:getToken(),ownerEmpId:owner}).then(function(r){ if(r.ok) kvSet('cal_'+(r.owner||owner),r.entries); return r; }).catch(function(){ return kvGet('cal_'+owner).then(function(e){ return {ok:true,entries:e||[],owner:owner,canManage:true,offline:true}; }); }); },
    refreshCal:function(owner){ return API.listCalendar(owner).catch(function(){}); },
    createCalEntry:function(data){ var id='CAL-'+uuid(); var d=Object.assign({status:'pending'},data,{entryId:id}); var owner=d.ownerEmpId||''; var f=function(){ return queueCal('createCalEntry',{data:d},function(){ return addCalCache(owner,Object.assign({},d,{_pending:true})); }).then(function(r){ r.entryId=id; return r; }); }; if(navigator.onLine) return call('createCalEntry',{token:getToken(),data:d}).then(function(r){ if(r.ok) API.refreshCal(owner); return r; }).catch(f); return f(); },
    updateCalEntry:function(entryId,data,owner){ var f=function(){ return queueCal('updateCalEntry',{entryId:entryId,data:data},function(){ return patchCal(owner,entryId,data); }); }; if(navigator.onLine) return call('updateCalEntry',{token:getToken(),entryId:entryId,data:data}).then(function(r){ if(r.ok) API.refreshCal(owner); return r; }).catch(f); return f(); },
    /* v189: ONE round-trip for everything the dashboard needs. Feeds the same caches the individual
       list* calls use, so every other page's instant cache-first paint benefits too. */
    dashboard:function(){
      return call('dashboard',{token:getToken()}).then(function(r){
        if(r&&r.ok){
          if(r.employees) kvSet('employees',r.employees);
          if(r.perms) kvSet('perms',r.perms);
          if(r.cards) kvSet('cards',r.cards);
          if(r.prices) kvSet('cardprices',r.prices);
          if(r.tasks) kvSet('tasks',r.tasks);
          if(r.entries) kvSet('cal_'+(r.owner||''),r.entries);
        }
        return r;
      });
    },
    /* v307: the process-engine surface (getProcess / listInstances / getInstance / startInstance /
       advanceStage / processMonitor / saveProcess / activityScorecard and their caches) was removed with
       the CRM, Process Builder and Process Flow Monitor pages. staffPerformance stays — the profile page
       still reads it for the personal KPI box, which is not the deleted Staff Performance report. */
    staffPerformance:function(from,to,branch){ var k='staffperf_'+(from||'')+'_'+(to||'')+'_'+(branch||''); return call('staffPerformance',{token:getToken(),fromDate:from||'',toDate:to||'',branch:branch||''}).then(function(r){ if(r&&r.ok) kvSet(k,r.rows); return r; }).catch(function(){ return kvGet(k).then(function(v){ return v?{ok:true,rows:v,offline:true}:{ok:false,offline:true}; }); }); },
    savePhoto:function(dataUri){ return call('savePhoto',{token:getToken(),dataUri:dataUri}); },
    saveQcMaterial:function(d){ return call('saveQcMaterial',{token:getToken(),data:d}); },
    listQcMaterials:function(){ return call('listQcMaterials',{token:getToken()}); },
    saveQcRun:function(d){ return call('saveQcRun',{token:getToken(),data:d}); },
    listQcRuns:function(f){ return call('listQcRuns',{token:getToken(),filter:f||{}}); },
    verifyQcRun:function(id,action,note){ return call('verifyQcRun',{token:getToken(),runId:id,action:action,note:note||''}); },
    qcInvItems:function(){ return call('qcInvItems',{token:getToken()}); },
    logRepeat:function(d){ return call('logRepeat',{token:getToken(),data:d}); },
    financeDashboard:function(ym,branch){ return call('financeDashboard',{token:getToken(),ym:ym||'',branch:branch||''}); },
    quickLog:function(d){ return call('quickLog',{token:getToken(),data:d}); },
    getKpiConfig:function(){ return call('getKpiConfig',{token:getToken()}); },
    saveKpiTarget:function(d){ return call('saveKpiTarget',{token:getToken(),data:d}); },
    saveWeights:function(d){ return call('saveWeights',{token:getToken(),data:d}); },
    /* v307: saveStage / deleteStage / reorderStages / saveField / deleteField / reorderFields /
       saveStageEdges removed — they only ever served the Process Builder. */
    capitalLedger:function(b){ return call('capitalLedger',{token:getToken(),branch:b||''}); },   /* v276 */
    /* v295: a punch now carries its OWN deadline instead of inheriting NET's 60-second default.
       Sixty seconds was chosen for bulk uploads, not for a person standing at a door holding a phone.
       With one automatic retry it meant a staff member could wait THREE MINUTES watching a screen that
       said nothing before the app finally admitted the punch hadn't gone. attendance.js now stages the
       punch locally first and passes a short deadline here, so a slow server costs seconds, not minutes,
       and the punch is already saved either way. */
    checkIn:function(d,timeoutMs){ return call('checkIn',{token:getToken(),data:d}, timeoutMs||30000); },
    checkOut:function(d,timeoutMs){ return call('checkOut',{token:getToken(),data:d}, timeoutMs||30000); },
    // Uploads the selfie after check-in/out already succeeded, so the punch itself doesn't wait on
    // Drive. Queued to IndexedDB first (durable) before attempting the live call — see queueSelfie —
    // so the photo survives even if the app is backgrounded/closed right after check-in, and retries
    // automatically once back online either way.
    attachSelfie:function(d){ return queueSelfie(d.attId,d.kind,d.base64); },
    /* v284: 'myatt' was a single global key — the direct cause of one employee's attendance card being
       painted with another employee's punches. Namespaced per user, like every other cached read. */
    cachedAttendance:function(){ return kvGet('myatt:'+curUid()); },
    /* v295: this is the call fired straight after a punch, and it is guaranteed to be the SLOWEST one
       the server ever answers — the punch has just invalidated this employee's month cache, so it must
       re-read the Attendance sheet from scratch. At the old 60s default the attendance screen could sit
       there for a full minute before falling back to the copy already in IndexedDB. 20s, then fall back. */
    myAttendance:function(ym,timeoutMs){ return call('myAttendance',{token:getToken(),ym:ym}, timeoutMs||20000).then(function(r){ if(r.ok) kvSet('myatt:'+curUid(),r); return r; }).catch(function(){ return kvGet('myatt:'+curUid()).then(function(x){ return x||{ok:true,records:[],offline:true}; }); }); },
    listAttendance:function(branch,date,dateTo){ return call('listAttendance',{token:getToken(),branch:branch,date:date,dateTo:dateTo||''}); },
    staffMonthAttendance:function(empId,ym){ return call('staffMonthAttendance',{token:getToken(),empId:empId,ym:ym}); },
    monthlyAttendance:function(branch,ym){ return call('monthlyAttendance',{token:getToken(),branch:branch,ym:ym}); },
    setAttendance:function(attId,d){ return call('setAttendance',{token:getToken(),attId:attId,data:d}); },
    applyLeave:function(d){ return call('applyLeave',{token:getToken(),data:d}); },
    cachedMyLeaves:function(){ return kvGet('myleaves'); },
    myLeaves:function(){ return call('myLeaves',{token:getToken()}).then(function(r){ if(r.ok) kvSet('myleaves',r); return r; }).catch(function(){ return kvGet('myleaves').then(function(x){ return x||{ok:true,leaves:[],balance:{},offline:true}; }); }); },
    leaveApprovals:function(){ return call('leaveApprovals',{token:getToken()}); },
    setLeave:function(id,a,reason){ return call('setLeave',{token:getToken(),leaveId:id,action:a,reason:reason||'',note:reason||''}); },
    cancelLeave:function(id){ return call('cancelLeave',{token:getToken(),leaveId:id}); },
    allLeaves:function(filter){ var k='allleaves_'+(JSON.stringify(filter||{})); return call('allLeaves',{token:getToken(),filter:filter||{}}).then(function(r){ if(r&&r.ok) kvSet(k,r); return r; }).catch(function(){ return kvGet(k).then(function(x){ return x||{ok:true,leaves:[],offline:true}; }); }); },
    leaveReport:function(ym,branch){ return call('leaveReport',{token:getToken(),ym:ym||'',branch:branch||''}); },
    listHolidays:function(year){ var k='holidays_'+(year||new Date().getFullYear()); return call('listHolidays',{token:getToken(),year:year||new Date().getFullYear()}).then(function(r){ if(r&&r.ok) kvSet(k,r); return r; }).catch(function(){ return kvGet(k).then(function(x){ return x||{ok:true,holidays:[],canManage:false,offline:true}; }); }); },
    saveHoliday:function(d){ return call('saveHoliday',{token:getToken(),data:d}); },
    cachedPolicies:function(){ return kvGet('policies'); },
    listPolicies:function(){ return call('listPolicies',{token:getToken()}).then(function(r){ if(r.ok) kvSet('policies',r); return r; }).catch(function(){ return kvGet('policies').then(function(x){ return x||{ok:true,policies:[],offline:true}; }); }); },
    savePolicy:function(d){ return call('savePolicy',{token:getToken(),data:d}); },
    ackPolicy:function(id){ return call('ackPolicy',{token:getToken(),policyId:id}); },
    policyAcks:function(id){ return call('policyAcks',{token:getToken(),policyId:id}); },
    submitClaim:function(d){ return call('submitClaim',{token:getToken(),data:d}); },
    myClaims:function(ym){ return call('myClaims',{token:getToken(),ym:ym}); },
    claimApprovals:function(){ return call('claimApprovals',{token:getToken()}); },
    setClaim:function(id,a){ return call('setClaim',{token:getToken(),claimId:id,action:a}); },
    runPayroll:function(m,b,adjustments){ return call('runPayroll',{token:getToken(),month:m,branch:b,adjustments:adjustments||{}}); },
    approvePayroll:function(m,b,mode){ return call('approvePayroll',{token:getToken(),month:m,branch:b,mode:mode||'lock'}); },
    listBlankDays:function(m,b){ return call('listBlankDays',{token:getToken(),month:m,branch:b}); },
    monthAttendance:function(m,e){ return call('monthAttendance',{token:getToken(),month:m,empId:e}); },
    confirmAbsent:function(rows){ return call('confirmAbsent',{token:getToken(),rows:rows||[]}); },
    listPayslips:function(m,b){ return call('listPayslips',{token:getToken(),month:m,branch:b}); },
    myPayslip:function(m){ return call('myPayslip',{token:getToken(),month:m}); },
    myPayHistory:function(n){ return call('myPayHistory',{token:getToken(),months:n||6}); },
    saveDaily:function(d){ return call('saveDaily',{token:getToken(),data:d}); },
    listDaily:function(b,ym){ return call('listDaily',{token:getToken(),branch:b,ym:ym}); },
    getDaily:function(id){ return call('getDaily',{token:getToken(),dayId:id}); },
    pendingDaily:function(){ return call('pendingDaily',{token:getToken()}); },
    getAttendance:function(attId){ return call('getAttendance',{token:getToken(),attId:attId}); },
    getTaskDetail:function(taskId){ return call('getTaskDetail',{token:getToken(),taskId:taskId}); },
    verifyDaily:function(id){ return call('verifyDaily',{token:getToken(),dayId:id}); },
    rejectDaily:function(id,reason){ return call('rejectDaily',{token:getToken(),dayId:id,reason:reason||''}); },
    saveDeposit:function(d){ return call('saveDeposit',{token:getToken(),data:d}); },
    listDeposits:function(b,ym){ return call('listDeposits',{token:getToken(),branch:b,ym:ym}); },
    verifyDeposit:function(id){ return call('verifyDeposit',{token:getToken(),ledId:id}); },
    rejectDeposit:function(id,reason){ return call('rejectDeposit',{token:getToken(),ledId:id,reason:reason}); },
    addLedger:function(d){ return call('addLedger',{token:getToken(),data:d}); },
    listLedger:function(b,ym,op){ return call('listLedger',{token:getToken(),branch:b,ym:ym,onlyPending:op}); },
    setLedger:function(id,a){ return call('setLedger',{token:getToken(),ledId:id,act:a}); },
    saveInvoice:function(d){ return call('saveInvoice',{token:getToken(),data:d}); },
    listInvoices:function(b,s){ return call('listInvoices',{token:getToken(),branch:b,status:s}); },
    recordPayment:function(id,a){ return call('recordPayment',{token:getToken(),invId:id,amount:a}); },
    financeSheet:function(b,ym){ return call('financeSheet',{token:getToken(),branch:b,ym:ym}).then(function(r){ if(r.ok) kvSet('fin_'+(b||'')+'_'+(ym||''),r); return r; }).catch(function(){ return kvGet('fin_'+(b||'')+'_'+(ym||'')).then(function(x){ return x||{ok:false,offline:true}; }); }); },
    /* v287 — THE IMPORT COULD NEVER HAVE WORKED.
       apiSaveBankRows(token, rows, meta) resolves the branch from meta.accountNo (matched against
       Branches.AccountNumber) or meta.branchId, and refuses the import outright if it gets neither:
           if(!branchId) return err_('Could not work out which branch this statement belongs to.');
       This function sent {token, rows} and nothing else, so meta was always undefined and every single
       import attempt failed on that line. That is why no statement has ever made it into the MIS. */
    saveBankRows:function(rows, meta){ return call('saveBankRows',{token:getToken(),rows:rows,meta:meta||{}}); },
    /* v287: the auto-categorisation rules existed on the server from v274 and nothing ever asked for
       them, so every row arrived at the import screen with no category at all. */
    bankRules:function(){ return call('bankRules',{token:getToken()}); },
    /* v290: saves a typed category as a learned rule, so the same payee categorises itself next month. */
    saveBankRule:function(data){ return call('saveBankRule',{token:getToken(),data:data}); },
    bankResolveAccount:function(accountNo){ return call('bankResolveAccount',{token:getToken(),accountNo:accountNo}); },
    bankImports:function(branch){ return call('bankImports',{token:getToken(),branch:branch||''}); },
    reconcile:function(b,d){ return call('reconcile',{token:getToken(),branch:b,date:d}); },
    payoutList:function(b,m,k){ return call('payoutList',{token:getToken(),branch:b,month:m,kind:k}); },
    trainSections:function(){ return call('trainSections',{token:getToken()}); },
    saveSection:function(d){ return call('saveSection',{token:getToken(),data:d}); },
    deleteSection:function(id){ return call('deleteSection',{token:getToken(),sectionId:id}); },
    saveVideo:function(d){ return call('saveVideo',{token:getToken(),data:d}); },
    deleteVideo:function(id){ return call('deleteVideo',{token:getToken(),videoId:id}); },
    listVideosManage:function(){ return call('listVideosManage',{token:getToken()}); },
    cachedMyTraining:function(){ return kvGet('mytrain'); },
    myTraining:function(){ return call('myTraining',{token:getToken()}).then(function(r){ if(r.ok) kvSet('mytrain',r); return r; }).catch(function(){ return kvGet('mytrain').then(function(x){ return x||{ok:true,sections:[],videos:[],offline:true}; }); }); },
    getVideoQuiz:function(id){ return call('getVideoQuiz',{token:getToken(),videoId:id}); },
    submitQuiz:function(id,a){ return call('submitQuiz',{token:getToken(),videoId:id,answers:a}); },
    trainingStats:function(){ return call('trainingStats',{token:getToken()}); },
    trainingMonitor:function(){ return call('trainingMonitor',{token:getToken()}); },
    cachedAssets:function(){ return kvGet('assets_lib'); },
    listAssets:function(){ return call('listAssets',{token:getToken()}).then(function(r){ if(r.ok) kvSet('assets_lib',r); return r; }).catch(function(){ return kvGet('assets_lib').then(function(x){ return x||{ok:true,assets:[],offline:true}; }); }); },
    listAssetsManage:function(){ return call('listAssetsManage',{token:getToken()}); },
    saveAsset:function(d){ return call('saveAsset',{token:getToken(),data:d}); },
    deleteAsset:function(id){ return call('deleteAsset',{token:getToken(),assetId:id}); },
    invItems:function(){ return call('invItems',{token:getToken()}); },
    saveItem:function(d){ return call('saveItem',{token:getToken(),data:d}); },
    deleteItem:function(id){ return call('deleteItem',{token:getToken(),itemId:id}); },
    invVendors:function(){ return call('invVendors',{token:getToken()}); },
    saveVendor:function(d){ return call('saveVendor',{token:getToken(),data:d}); },
    deleteVendor:function(id){ return call('deleteVendor',{token:getToken(),vendorId:id}); },
    cachedInvStock:function(b){ return kvGet('invstock_'+(b||'')); },
    invStock:function(b){ return call('invStock',{token:getToken(),branch:b}).then(function(r){ if(r.ok) kvSet('invstock_'+(b||''),r); return r; }).catch(function(){ return kvGet('invstock_'+(b||'')).then(function(x){ return x||{ok:true,stock:[],offline:true}; }); }); },
    invStockGrid:function(b,ym){ return call('invStockGrid',{token:getToken(),branch:b,ym:ym}).then(function(r){ if(r.ok) kvSet('invgrid_'+(b||'')+'_'+(ym||''),r); return r; }).catch(function(){ return kvGet('invgrid_'+(b||'')+'_'+(ym||'')).then(function(x){ return x||{ok:true,rows:[],daysInMonth:30,offline:true}; }); }); },
    invConsumption:function(b,d){ return call('invConsumption',{token:getToken(),branch:b,date:d}); },
    saveConsumption:function(b,d,lines){ return call('saveConsumption',{token:getToken(),branch:b,date:d,lines:lines}); },
    listManualConsumption:function(b,d){ return call('listManualConsumption',{token:getToken(),branch:b,date:d}); },
    saveManualConsumption:function(b,d,lines){ return call('saveManualConsumption',{token:getToken(),branch:b,date:d,lines:lines}); },
    listPayRequests:function(b,s){ return call('listPayRequests',{token:getToken(),branch:b,status:s}); },
    createPayRequest:function(data){ return call('createPayRequest',{token:getToken(),data:data}); },
    /* FIX: the payload key was also called `action`, so Object.assign in NET() overwrote the
       route name and the server saw 'approve' / 'paid' as the action. Sent as payAction now. */
    setPayRequest:function(reqId,action,data){ return call('setPayRequest',{token:getToken(),reqId:reqId,payAction:action,data:data}); },
    raiseIndent:function(d){ return call('raiseIndent',{token:getToken(),data:d}); },
    listIndents:function(b){ return call('listIndents',{token:getToken(),branch:b}); },
    advanceIndent:function(id,a,d){ return call('advanceIndent',{token:getToken(),indentId:id,action:a,data:d}); },
    saveAudit:function(b,d,lines){ return call('saveAudit',{token:getToken(),branch:b,date:d,lines:lines}); },
    listAudits:function(b){ return call('listAudits',{token:getToken(),branch:b}); },
    approveAudit:function(id){ return call('approveAudit',{token:getToken(),auditId:id}); },
    cachedRecurring:function(){ return kvGet('recurring'); },
    listRecurring:function(){ return call('listRecurring',{token:getToken()}).then(function(r){ if(r.ok) kvSet('recurring',r.recurring); return r; }).catch(function(){ return kvGet('recurring').then(function(x){ return {ok:true,recurring:x||[],offline:true}; }); }); },
    saveRecurring:function(data){ return call('saveRecurring',{token:getToken(),data:data}).then(function(r){ if(r.ok) API.listRecurring(); return r; }); },
    setRecurringActive:function(recurId,active){ return call('setRecurringActive',{token:getToken(),recurId:recurId,active:active}).then(function(r){ if(r.ok) API.listRecurring(); return r; }); },
    cachedAllCalendar:function(){ return kvGet('allcal'); },
    listAllCalendar:function(){ return call('listAllCalendar',{token:getToken()}).then(function(r){ if(r.ok) kvSet('allcal',r.entries); return r; }).catch(function(){ return kvGet('allcal').then(function(e){ return {ok:true,entries:e||[],offline:true}; }); }); },
    cachedTasksFor:function(owner){ return kvGet('tasksfor_'+owner); },
    listTasksFor:function(owner){ return call('listTasksFor',{token:getToken(),ownerEmpId:owner}).then(function(r){ if(r.ok) kvSet('tasksfor_'+owner,r.tasks); return r; }).catch(function(){ return kvGet('tasksfor_'+owner).then(function(t){ return {ok:true,tasks:t||[],offline:true}; }); }); },
    branchAssignees:function(branchId,includeRole,allBranches){ var k='brassign_'+(allBranches?'all':(branchId||'me'))+(includeRole?('_'+includeRole):''); return call('branchAssignees',{token:getToken(),branchId:branchId||'',includeRole:includeRole||'',allBranches:allBranches?1:''}).then(function(r){ if(r&&r.ok) kvSet(k,r.employees); return r; }).catch(function(){ return kvGet(k).then(function(v){ return {ok:true,employees:v||[],offline:true}; }); }); },

    /* v307: the notification endpoints (nfList / nfCount / nfMarkRead / nfMarkAllRead /
       nfRegisterPush / nfUnregisterPush / nfPushConfig) were removed with the bell and push. */

    /* fire-and-forget cache refresh */
    refreshEmployees:function(){ return API.listEmployees().catch(function(){}); },
    refreshCards:function(){ return API.listCards({}).catch(function(){}); },

    syncOutbox:syncOutbox,
    pending:function(){ return obAll().then(function(i){return i.length;}); },
    /* v284: this used to clear eight named keys and leave the whole rc: read cache and 'myatt' behind,
       so the next person to sign in on this device was shown the previous person's data. Clearing the
       store outright is the only version of this that cannot rot as new cached reads get added later. */
    clearLocal:function(){ setToken(''); setUid(''); return wipeCache(); }
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
  /* Selfie upload: write-behind, not write-through. This fires right after check-in, right when the
     user is most likely to background or close the app ("Checked in ✓" -> phone goes in a pocket).
     A live-attempt-then-catch-enqueue approach loses the photo silently if the JS context is suspended
     or killed before the fetch settles — nothing ever runs the .catch. Queuing to IndexedDB FIRST makes
     the photo durable no matter what happens to the tab next; the immediate live attempt below is purely
     an optimization for a fast result when the app stays open, and deletes the queued copy once the
     server confirms it. If that never gets to run, syncOutbox()'s online/focus/30s triggers pick it up
     on the next app open regardless. */
  function queueSelfie(attId,kind,base64){
    var payload={attId:attId,kind:kind,base64:base64};
    return obAdd({action:'attachSelfie',payload:payload,ts:Date.now()}).then(function(id){
      emit();
      if(!navigator.onLine) return {ok:true,offline:true};
      return NET('attachSelfie',Object.assign({token:getToken()},payload)).then(function(r){
        if(r && r.ok) return obDel(id).then(function(){ return r; });
        return r;   // left queued — syncOutbox will retry it (capped there)
      }).catch(function(){ return {ok:true,offline:true}; });   // left queued — network blip
    });
  }

  /* ---------- card writes offline ---------- */
  function cardsCache(){ return kvGet('cards').then(function(c){ return c||[]; }); }
  function patchCard(n,patch){ return cardsCache().then(function(list){ for(var i=0;i<list.length;i++){ if(String(list[i].cardNumber)===String(n)) Object.assign(list[i],patch); } return kvSet('cards',list); }); }
  function queueCardOp(action,payload,optimistic){ return obAdd({action:action,payload:payload,ts:Date.now()}).then(function(){ return optimistic?optimistic():null; }).then(function(){ emit(); return {ok:true,offline:true}; }); }
  function tasksCache(){ return kvGet('tasks').then(function(t){ return t||[]; }); }
  function addTaskCache(task){ return tasksCache().then(function(l){ l.unshift(task); return kvSet('tasks',l); }); }
  function patchTask(id,patch){ return tasksCache().then(function(l){ for(var i=0;i<l.length;i++){ if(String(l[i].taskId)===String(id)) Object.assign(l[i],patch,{_pending:true}); } return kvSet('tasks',l); }); }
  function queueTask(action,payload,optimistic){ return obAdd({action:action,payload:payload,ts:Date.now()}).then(function(){ return optimistic?optimistic():null; }).then(function(){ emit(); return {ok:true,offline:true}; }); }
  function calCache(owner){ return kvGet('cal_'+owner).then(function(c){ return c||[]; }); }
  function addCalCache(owner,entry){ return calCache(owner).then(function(l){ l.push(entry); return kvSet('cal_'+owner,l); }); }
  function patchCal(owner,id,patch){ return calCache(owner).then(function(l){ for(var i=0;i<l.length;i++){ if(String(l[i].entryId)===String(id)) Object.assign(l[i],patch,{_pending:true}); } return kvSet('cal_'+owner,l); }); }
  function queueCal(action,payload,optimistic){ return obAdd({action:action,payload:payload,ts:Date.now()}).then(function(){ return optimistic?optimistic():null; }).then(function(){ emit(); return {ok:true,offline:true}; }); }
  function queueGeneric(action,payload){ return obAdd({action:action,payload:payload,ts:Date.now()}).then(function(){ emit(); return {ok:true,offline:true}; }); }
  function queueIssue(data){
    var tempNo='PENDING-'+uuid();
    return kvGet('cardtypes').then(function(types){
      var t=((types||[]).filter(function(x){return x.typeId===data.typeId;})[0])||null;
      var months=t?(Number(t.validityMonths)||12):12, exp=new Date(); exp.setMonth(exp.getMonth()+months);
      var card={cardNumber:tempNo,branchId:data.branchId,typeId:data.typeId,holderName:data.holderName,mobile:data.mobile,
        referByName:data.referByName||'',issuedDate:new Date().toISOString(),expiryDate:exp.toISOString(),status:'active',
        amount:Number(data.amount)||0,sentAt:'',activatedAt:'',_pending:true};
      return cardsCache().then(function(list){ list.unshift(card); return kvSet('cards',list); }).then(function(){
        return obAdd({action:'issueCard',payload:{data:data},ts:Date.now()}).then(function(){ emit(); return {ok:true,offline:true,card:card,type:t,branchName:data.branchId}; });
      });
    });
  }

  var _syncing=false;
  function syncOutbox(){
    if(_syncing || !navigator.onLine || !configured()) return Promise.resolve();
    _syncing=true; emit();
    var token=getToken();
    return obAll().then(function(items){
      items.sort(function(a,b){return a.id-b.id;});
      function next(i){
        if(i>=items.length) return Promise.resolve();
        var it=items[i], payload;
        if(it.payload){ payload=Object.assign({}, it.payload); }
        else { payload={}; if(it.action==='createEmployee') payload.data=it.data; if(it.action==='updateEmployee'){ payload.empId=it.empId; payload.data=it.data; } if(it.action==='setStatus'){ payload.empId=it.empId; payload.status=it.status; } }
        payload.token=token;
        return NET(it.action,payload).then(function(r){
          // attachSelfie: a logical failure (e.g. Drive briefly rejecting the upload) should keep
          // retrying instead of vanishing — bump an attempt counter and leave it queued until it
          // succeeds or hits the retry cap, rather than deleting it after one failed retry.
          if(it.action==='attachSelfie' && r && r.ok===false){
            var tries=(it.tries||0)+1;
            if(tries<8) return obPut(Object.assign({},it,{tries:tries})).then(function(){ return next(i+1); });
          }
          // remove on success OR on a logical (non-network) rejection so the queue never jams
          return obDel(it.id).then(function(){ return next(i+1); });
        }).catch(function(){
          // network error — stop; will retry next time
          return Promise.reject('network');
        });
      }
      return next(0);
    }).then(function(){ _syncing=false; emit(); API.refreshCards(); API.refreshTasks(); return API.refreshEmployees(); })
      .catch(function(){ _syncing=false; emit(); });
  }

  /* auto-sync triggers */
  window.addEventListener('online', function(){ emit(); syncOutbox(); });
  window.addEventListener('offline', emit);
  window.addEventListener('focus', function(){ if(navigator.onLine) syncOutbox(); });
  setInterval(function(){ if(navigator.onLine) syncOutbox(); }, 30000);

  window.API=API;
})();
