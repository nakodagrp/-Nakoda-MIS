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
    cachedInstances:function(pid){ return kvGet('inst_'+pid); },
    listInstances:function(pid){ return call('listInstances',{token:getToken(),processId:pid}).then(function(r){ if(r.ok) kvSet('inst_'+pid,r); return r; }).catch(function(){ return kvGet('inst_'+pid).then(function(x){ return x||{ok:true,instances:[],stages:[],offline:true}; }); }); },
    cachedInstance:function(iid){ return kvGet('inst1_'+iid); },
    getInstance:function(iid){ return call('getInstance',{token:getToken(),instanceId:iid}).then(function(r){ if(r&&r.ok) kvSet('inst1_'+iid,r); return r; }).catch(function(){ return kvGet('inst1_'+iid).then(function(x){ return x||{ok:false,offline:true}; }); }); },
    startInstance:function(pid,data){ var f=function(){ return queueGeneric('startInstance',{processId:pid,data:data}); }; if(navigator.onLine) return call('startInstance',{token:getToken(),processId:pid,data:data}).catch(f); return f(); },
    advanceStage:function(iid,data){ var f=function(){ return queueGeneric('advanceStage',{instanceId:iid,data:data}); }; if(navigator.onLine) return call('advanceStage',{token:getToken(),instanceId:iid,data:data}).catch(f); return f(); },
    processMonitor:function(pid,filter){ return call('processMonitor',{token:getToken(),processId:pid,filter:filter||{}}).then(function(r){ if(r.ok) kvSet('procmon_'+pid,r); return r; }).catch(function(){ return kvGet('procmon_'+pid).then(function(x){ return x||{ok:true,rows:[],stages:[],offline:true}; }); }); },
    saveProcess:function(d){ return call('saveProcess',{token:getToken(),data:d}).then(function(r){ if(r.ok) API.listProcesses(); return r; }); },
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
    cachedRecurring:function(){ return kvGet('recurring'); },
    listRecurring:function(){ return call('listRecurring',{token:getToken()}).then(function(r){ if(r.ok) kvSet('recurring',r.recurring); return r; }).catch(function(){ return kvGet('recurring').then(function(x){ return {ok:true,recurring:x||[],offline:true}; }); }); },
    saveRecurring:function(data){ return call('saveRecurring',{token:getToken(),data:data}).then(function(r){ if(r.ok) API.listRecurring(); return r; }); },
    setRecurringActive:function(recurId,active){ return call('setRecurringActive',{token:getToken(),recurId:recurId,active:active}).then(function(r){ if(r.ok) API.listRecurring(); return r; }); },
    cachedAllCalendar:function(){ return kvGet('allcal'); },
    listAllCalendar:function(){ return call('listAllCalendar',{token:getToken()}).then(function(r){ if(r.ok) kvSet('allcal',r.entries); return r; }).catch(function(){ return kvGet('allcal').then(function(e){ return {ok:true,entries:e||[],offline:true}; }); }); },
    cachedTasksFor:function(owner){ return kvGet('tasksfor_'+owner); },
    listTasksFor:function(owner){ return call('listTasksFor',{token:getToken(),ownerEmpId:owner}).then(function(r){ if(r.ok) kvSet('tasksfor_'+owner,r.tasks); return r; }).catch(function(){ return kvGet('tasksfor_'+owner).then(function(t){ return {ok:true,tasks:t||[],offline:true}; }); }); },

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
        return call(it.action,payload).then(function(r){
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
