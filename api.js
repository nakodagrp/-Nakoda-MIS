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
  function NET(action, payload){
    var body=JSON.stringify(Object.assign({action:action}, payload||{}));
    var ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
    var to=ctrl?setTimeout(function(){ try{ctrl.abort();}catch(e){} }, 60000):null;   // never hang forever
    return fetch(apiUrl(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:body,redirect:'follow',signal:ctrl?ctrl.signal:undefined})
      .then(function(r){ return r.json(); })
      .then(function(j){ if(to) clearTimeout(to); return j; }, function(e){ if(to) clearTimeout(to); throw e; });
  }
  /* Every action that CHANGES data (used to tell reads from writes). */
  var WRITES={createEmployee:1,updateEmployee:1,setStatus:1,resetPassword:1,changePassword:1,createBranch:1,updateBranch:1,
    upsertCardType:1,issueCard:1,renewCard:1,cancelCard:1,setCardPrice:1,markCardSent:1,markCardActivated:1,
    createTask:1,updateTask:1,setTaskStatus:1,deleteTask:1,createCalEntry:1,updateCalEntry:1,saveRecurring:1,setRecurringActive:1,
    startInstance:1,advanceStage:1,saveProcess:1,saveStage:1,deleteStage:1,reorderStages:1,saveField:1,deleteField:1,
    checkIn:1,checkOut:1,setAttendance:1,applyLeave:1,setLeave:1,savePolicy:1,ackPolicy:1,submitClaim:1,setClaim:1,runPayroll:1,
    saveDaily:1,verifyDaily:1,addLedger:1,setLedger:1,saveInvoice:1,recordPayment:1,saveBankRows:1,
    saveItem:1,deleteItem:1,saveVendor:1,deleteVendor:1,saveConsumption:1,raiseIndent:1,advanceIndent:1,saveAudit:1,approveAudit:1,
    saveSection:1,deleteSection:1,saveVideo:1,deleteVideo:1,submitQuiz:1,saveAsset:1,deleteAsset:1,
    login:1,validate:1,logout:1,uploadFile:1,importOldCards:1,
    submitSuggestion:1,replySuggestion:1,saveFixedAsset:1,deleteFixedAsset:1};
  /* Writes that already do their own optimistic queueing inside the method (don't double-queue here). */
  var SELF_QUEUE={createEmployee:1,updateEmployee:1,setStatus:1,issueCard:1,renewCard:1,cancelCard:1,markCardSent:1,markCardActivated:1,
    createTask:1,updateTask:1,setTaskStatus:1,deleteTask:1,createCalEntry:1,updateCalEntry:1,startInstance:1,advanceStage:1};
  /* Writes that MUST stay online (auth, server-computed, exact-time, bulk). */
  var NOQUEUE={login:1,validate:1,logout:1,changePassword:1,resetPassword:1,checkIn:1,checkOut:1,runPayroll:1,uploadFile:1,importOldCards:1,submitQuiz:1};
  function rk(action,payload){ var p=Object.assign({},payload||{}); delete p.token; return 'rc:'+action+':'+JSON.stringify(p); }
  function noTok(payload){ var p=Object.assign({},payload||{}); delete p.token; return p; }
  function enqueue(action,payload){ return obAdd({action:action,payload:noTok(payload),ts:Date.now()}).then(function(){ emit(); return {ok:true,offline:true}; }); }
  function readGet(action,payload){ return kvGet(rk(action,payload)).then(function(c){ if(c){ try{c=JSON.parse(JSON.stringify(c));}catch(e){} c.offline=true; return c; } return {ok:false,offline:true,error:'Not available offline yet — open this once while online.'}; }); }
  function call(action, payload){
    var isWrite=WRITES[action], queueable=isWrite && !SELF_QUEUE[action] && !NOQUEUE[action];
    if(!isWrite){                                   /* READ: cache-first fallback, instant when offline */
      if(!navigator.onLine) return readGet(action,payload);
      return NET(action,payload).then(function(r){ if(r&&r.ok){ kvSet(rk(action,payload),r); } return r; }).catch(function(){ return readGet(action,payload); });
    }
    if(queueable && !navigator.onLine) return enqueue(action,payload);     /* WRITE offline: save instantly to outbox */
    if(queueable) return NET(action,payload).catch(function(){ return enqueue(action,payload); });
    return NET(action,payload);                      /* self-queued (method handles) or online-only */
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
    uploadFile:function(args){ return call('uploadFile',Object.assign({token:getToken()},args||{})); },
    createBranch:function(data){ return call('createBranch',{token:getToken(),data:data}); },
    updateBranch:function(id,data){ return call('updateBranch',{token:getToken(),branchId:id,data:data}); },

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
    cachedAllTasks:function(){ return kvGet('alltasks'); },
    listAllTasks:function(filter){ return call('listAllTasks',{token:getToken(),filter:filter||{}}).then(function(r){ if(r.ok) kvSet('alltasks',r.tasks); return r; }).catch(function(){ return kvGet('alltasks').then(function(t){ return {ok:true,tasks:t||[],offline:true}; }); }); },
    calendarTargets:function(){ return call('calendarTargets',{token:getToken()}).then(function(r){ if(r.ok) kvSet('caltargets',r.targets); return r; }).catch(function(){ return kvGet('caltargets').then(function(t){ return {ok:true,targets:t||[]}; }); }); },
    cachedCalendar:function(owner){ return kvGet('cal_'+owner); },
    listCalendar:function(owner){ owner=owner||''; return call('listCalendar',{token:getToken(),ownerEmpId:owner}).then(function(r){ if(r.ok) kvSet('cal_'+(r.owner||owner),r.entries); return r; }).catch(function(){ return kvGet('cal_'+owner).then(function(e){ return {ok:true,entries:e||[],owner:owner,canManage:true,offline:true}; }); }); },
    refreshCal:function(owner){ return API.listCalendar(owner).catch(function(){}); },
    createCalEntry:function(data){ var id='CAL-'+uuid(); var d=Object.assign({status:'pending'},data,{entryId:id}); var owner=d.ownerEmpId||''; var f=function(){ return queueCal('createCalEntry',{data:d},function(){ return addCalCache(owner,Object.assign({},d,{_pending:true})); }).then(function(r){ r.entryId=id; return r; }); }; if(navigator.onLine) return call('createCalEntry',{token:getToken(),data:d}).then(function(r){ if(r.ok) API.refreshCal(owner); return r; }).catch(f); return f(); },
    updateCalEntry:function(entryId,data,owner){ var f=function(){ return queueCal('updateCalEntry',{entryId:entryId,data:data},function(){ return patchCal(owner,entryId,data); }); }; if(navigator.onLine) return call('updateCalEntry',{token:getToken(),entryId:entryId,data:data}).then(function(r){ if(r.ok) API.refreshCal(owner); return r; }).catch(f); return f(); },
    cachedProcesses:function(){ return kvGet('processes'); },
    listProcesses:function(){ return call('listProcesses',{token:getToken()}).then(function(r){ if(r.ok) kvSet('processes',r.processes); return r; }).catch(function(){ return kvGet('processes').then(function(x){ return {ok:true,processes:x||[],offline:true}; }); }); },
    getProcess:function(pid){ return call('getProcess',{token:getToken(),processId:pid}).then(function(r){ if(r.ok) kvSet('procdef_'+pid,r); return r; }).catch(function(){ return kvGet('procdef_'+pid).then(function(x){ return x||{ok:false,offline:true}; }); }); },
    cachedInstances:function(pid,status){ return kvGet('inst_'+pid+'_'+(status||'running')); },
    listInstances:function(pid,status){ var sf=status||'running', k='inst_'+pid+'_'+sf; return call('listInstances',{token:getToken(),processId:pid,status:sf}).then(function(r){ if(r.ok) kvSet(k,r); return r; }).catch(function(){ return kvGet(k).then(function(x){ return x||{ok:true,instances:[],stages:[],offline:true}; }); }); },
    cachedInstance:function(iid){ return kvGet('inst1_'+iid); },
    getInstance:function(iid){ return call('getInstance',{token:getToken(),instanceId:iid}).then(function(r){ if(r&&r.ok) kvSet('inst1_'+iid,r); return r; }).catch(function(){ return kvGet('inst1_'+iid).then(function(x){ return x||{ok:false,offline:true}; }); }); },
    startInstance:function(pid,data){ var f=function(){ return queueGeneric('startInstance',{processId:pid,data:data}); }; if(navigator.onLine) return call('startInstance',{token:getToken(),processId:pid,data:data}).catch(f); return f(); },
    advanceStage:function(iid,data){ var f=function(){ return queueGeneric('advanceStage',{instanceId:iid,data:data}); }; if(navigator.onLine) return call('advanceStage',{token:getToken(),instanceId:iid,data:data}).catch(f); return f(); },
    cachedProcessMonitor:function(pid){ return kvGet('procmon_'+pid); },
    processMonitor:function(pid,filter){ return call('processMonitor',{token:getToken(),processId:pid,filter:filter||{}}).then(function(r){ if(r.ok) kvSet('procmon_'+pid,r); return r; }).catch(function(){ return kvGet('procmon_'+pid).then(function(x){ return x||{ok:true,rows:[],stages:[],offline:true}; }); }); },
    saveProcess:function(d){ return call('saveProcess',{token:getToken(),data:d}).then(function(r){ if(r.ok) API.listProcesses(); return r; }); },
    activityScorecard:function(from,to){ return call('activityScorecard',{token:getToken(),fromDate:from||'',toDate:to||''}); },
    staffPerformance:function(from,to,branch){ var k='staffperf_'+(from||'')+'_'+(to||'')+'_'+(branch||''); return call('staffPerformance',{token:getToken(),fromDate:from||'',toDate:to||'',branch:branch||''}).then(function(r){ if(r&&r.ok) kvSet(k,r.rows); return r; }).catch(function(){ return kvGet(k).then(function(v){ return v?{ok:true,rows:v,offline:true}:{ok:false,offline:true}; }); }); },
    savePhoto:function(dataUri){ return call('savePhoto',{token:getToken(),dataUri:dataUri}); },
    saveCampaign:function(d){ return call('saveCampaign',{token:getToken(),data:d}); },
    listCampaigns:function(from,to,branch){ return call('listCampaigns',{token:getToken(),fromDate:from||'',toDate:to||'',branch:branch||''}); },
    startNurture:function(d){ return call('startNurture',{token:getToken(),data:d}); },
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
    saveStage:function(d){ return call('saveStage',{token:getToken(),data:d}); },
    deleteStage:function(id){ return call('deleteStage',{token:getToken(),stageId:id}); },
    reorderStages:function(pid,order){ return call('reorderStages',{token:getToken(),processId:pid,order:order}); },
    saveField:function(d){ return call('saveField',{token:getToken(),data:d}); },
    deleteField:function(id){ return call('deleteField',{token:getToken(),fieldId:id}); },
    checkIn:function(d){ return call('checkIn',{token:getToken(),data:d}); },
    checkOut:function(d){ return call('checkOut',{token:getToken(),data:d}); },
    cachedAttendance:function(){ return kvGet('myatt'); },
    myAttendance:function(ym){ return call('myAttendance',{token:getToken(),ym:ym}).then(function(r){ if(r.ok) kvSet('myatt',r); return r; }).catch(function(){ return kvGet('myatt').then(function(x){ return x||{ok:true,records:[],offline:true}; }); }); },
    listAttendance:function(branch,date){ return call('listAttendance',{token:getToken(),branch:branch,date:date}); },
    setAttendance:function(attId,d){ return call('setAttendance',{token:getToken(),attId:attId,data:d}); },
    applyLeave:function(d){ return call('applyLeave',{token:getToken(),data:d}); },
    cachedMyLeaves:function(){ return kvGet('myleaves'); },
    myLeaves:function(){ return call('myLeaves',{token:getToken()}).then(function(r){ if(r.ok) kvSet('myleaves',r); return r; }).catch(function(){ return kvGet('myleaves').then(function(x){ return x||{ok:true,leaves:[],balance:{},offline:true}; }); }); },
    leaveApprovals:function(){ return call('leaveApprovals',{token:getToken()}); },
    setLeave:function(id,a){ return call('setLeave',{token:getToken(),leaveId:id,action:a}); },
    cachedPolicies:function(){ return kvGet('policies'); },
    listPolicies:function(){ return call('listPolicies',{token:getToken()}).then(function(r){ if(r.ok) kvSet('policies',r); return r; }).catch(function(){ return kvGet('policies').then(function(x){ return x||{ok:true,policies:[],offline:true}; }); }); },
    savePolicy:function(d){ return call('savePolicy',{token:getToken(),data:d}); },
    ackPolicy:function(id){ return call('ackPolicy',{token:getToken(),policyId:id}); },
    policyAcks:function(id){ return call('policyAcks',{token:getToken(),policyId:id}); },
    submitClaim:function(d){ return call('submitClaim',{token:getToken(),data:d}); },
    myClaims:function(ym){ return call('myClaims',{token:getToken(),ym:ym}); },
    claimApprovals:function(){ return call('claimApprovals',{token:getToken()}); },
    setClaim:function(id,a){ return call('setClaim',{token:getToken(),claimId:id,action:a}); },
    runPayroll:function(m,b){ return call('runPayroll',{token:getToken(),month:m,branch:b}); },
    listPayslips:function(m,b){ return call('listPayslips',{token:getToken(),month:m,branch:b}); },
    myPayslip:function(m){ return call('myPayslip',{token:getToken(),month:m}); },
    saveDaily:function(d){ return call('saveDaily',{token:getToken(),data:d}); },
    listDaily:function(b,ym){ return call('listDaily',{token:getToken(),branch:b,ym:ym}); },
    getDaily:function(id){ return call('getDaily',{token:getToken(),dayId:id}); },
    verifyDaily:function(id){ return call('verifyDaily',{token:getToken(),dayId:id}); },
    saveDeposit:function(d){ return call('saveDeposit',{token:getToken(),data:d}); },
    listDeposits:function(b,ym){ return call('listDeposits',{token:getToken(),branch:b,ym:ym}); },
    addLedger:function(d){ return call('addLedger',{token:getToken(),data:d}); },
    listLedger:function(b,ym,op){ return call('listLedger',{token:getToken(),branch:b,ym:ym,onlyPending:op}); },
    setLedger:function(id,a){ return call('setLedger',{token:getToken(),ledId:id,action:a}); },
    saveInvoice:function(d){ return call('saveInvoice',{token:getToken(),data:d}); },
    listInvoices:function(b,s){ return call('listInvoices',{token:getToken(),branch:b,status:s}); },
    recordPayment:function(id,a){ return call('recordPayment',{token:getToken(),invId:id,amount:a}); },
    financeSheet:function(b,ym){ return call('financeSheet',{token:getToken(),branch:b,ym:ym}).then(function(r){ if(r.ok) kvSet('fin_'+(b||'')+'_'+(ym||''),r); return r; }).catch(function(){ return kvGet('fin_'+(b||'')+'_'+(ym||'')).then(function(x){ return x||{ok:false,offline:true}; }); }); },
    saveBankRows:function(rows){ return call('saveBankRows',{token:getToken(),rows:rows}); },
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
    branchAssignees:function(branchId,includeRole){ var k='brassign_'+(branchId||'me')+(includeRole?('_'+includeRole):''); return call('branchAssignees',{token:getToken(),branchId:branchId||'',includeRole:includeRole||''}).then(function(r){ if(r&&r.ok) kvSet(k,r.employees); return r; }).catch(function(){ return kvGet(k).then(function(v){ return {ok:true,employees:v||[],offline:true}; }); }); },

    /* fire-and-forget cache refresh */
    refreshEmployees:function(){ return API.listEmployees().catch(function(){}); },
    refreshCards:function(){ return API.listCards({}).catch(function(){}); },

    syncOutbox:syncOutbox,
    pending:function(){ return obAll().then(function(i){return i.length;}); },
    clearLocal:function(){ setToken(''); return Promise.all([kvSet('employees',null),kvSet('meta',null),kvSet('me',null),kvSet('perms',null),kvSet('tasks',null),kvSet('cards',null),kvSet('cardtypes',null),kvSet('cardprices',null)]); }
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
