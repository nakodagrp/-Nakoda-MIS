/**
 * ============================================================================================
 * NAKODA MIS  ·  Messaging  ·  Bulk Message Send
 * ============================================================================================
 * NEW FILE. Paste this in as its own file in the Apps Script editor:
 *   Files ▸ + ▸ Script, name it "27_Messaging", paste this whole file, Save.
 * Apps Script gives every .gs file in a project ONE shared global scope, so this file sees
 * everything the rest of the project already declares (HEADERS, SHEETS, getSS_, readSheet_,
 * appendObj_, updateCells_, permsFor_, userFromToken_, waPhone_, waPost_, waBranchRow_,
 * wabParse_, wabCapUsed_, wabCapAdd_, WAB_CHUNK, WAB_CHUNK_PAUSE_MS, ok_, err_, audit_, fmtDate_…)
 * and adds nothing that could collide — every name here is prefixed msg/MSG.
 *
 * SCOPE OF THIS FILE: Bulk Message Send only (build order agreed 17 Sep 2026 — Timely Message
 * is a second phase, not built here; see 01_FEATURE_SPEC.md §3 for what it will need).
 *
 * WHAT'S HERE
 *   1. Sheets + headers        Msg_Campaigns, Msg_Recipients (append-only columns, same
 *                              discipline as every other sheet in this project — see pcInit_
 *                              in Code_PatientCRM.gs for the pattern this copies).
 *   2. Permissions             msgCanManage_ / msgCanView_ — see the note above msgCanManage_
 *                              for exactly who that is and why.
 *   3. Campaign CRUD           apiMsgListCampaigns, apiMsgSaveCampaign, apiMsgSetCampaignStatus,
 *                              apiMsgCampaignStats (the 4 stat tiles).
 *   4. Leads                   apiMsgAddRecipients (Add Leads pop-up, chunked from the browser —
 *                              same 150-row-chunk-with-retry shape as the Patient CRM's bulk
 *                              upload in patients.js), apiMsgListRecipients (Patient Delivery
 *                              pop-up), apiMsgDeleteRecipient.
 *   5. Sample data             msgSeedSampleData() / apiMsgDeleteSampleData — every seeded row
 *                              carries isSample=true and the scheduler below refuses to ever
 *                              send to one.
 *   6. The scheduler           msgSetupScheduler() / msgStopScheduler() (editor-run, once) and
 *                              msgSchedulerTick_() (installed as a time trigger, runs itself
 *                              every 15 minutes forever after that). This is what sends leads
 *                              automatically with nobody logged in.
 *
 * DECISIONS MADE WHILE BUILDING THIS (flagged back to you in the handoff reply — check them):
 *   - Daily limit: UNIFIED to 250/day, shared with the existing membership-card bulk send.
 *     This means WAB_DAILY_CAP in 07_WhatsApp.gs changes from 300 to 250 (see the patch note
 *     for that file). Card sends, Bulk Message Send campaigns, and (later) Timely Message
 *     triggers all draw on the exact same per-branch-per-day counter (wabCapUsed_/wabCapAdd_),
 *     so whichever sends first that day uses up the shared 250.
 *   - Who can manage campaigns: MIS, Operations Manager and Director/Admin (msgCanManage_
 *     below). Anyone else who can see the Messaging pages gets read-only history.
 *   - Template variables: {{1}} = branch name, {{2}} = lead's name, {{3}}… = fixed values typed
 *     in once when the campaign is created (Msg_Campaigns.fixedParams, JSON array of strings).
 *     An image/document/video header template stores one media URL per campaign
 *     (Msg_Campaigns.headerMediaUrl), uploaded once via the existing API.upload() file uploader.
 * ============================================================================================ */

/* ============================================================ CONFIG */
var MSG_SHEETS = { CAMP: 'Msg_Campaigns', REC: 'Msg_Recipients' };
var MSG_H = {
  /* kind/scheduledDate added 18 Sep for Timely Message (2nd tab): kind is 'bulk' (default — blank
     reads as 'bulk' too, so every existing/sample row keeps working with no backfill needed) or
     'timely'. scheduledDate is set only for kind:'timely' — msgSchedulerTick_ won't consider that
     campaign due until this date, whereas a blank scheduledDate (every 'bulk' campaign) behaves
     exactly as before, drip-sending daily from the moment it's started. Columns can only be
     appended, never inserted, hence going on the end rather than next to sendTime/tag. */
  Msg_Campaigns: ['campaignId','code','name','branchId','tplId','templateName','tag','sendTime',
                  'dailyCap','headerMediaUrl','fixedParams','status','total','sent','failed',
                  'lastRunDate','createdBy','createdAt','updatedAt','isSample','kind','scheduledDate'],
  /* sourceType is always 'campaign' here — the same column names let a future Timely Message
     trigger run ('trigger') share this one sheet instead of needing a second, per the data
     model sketch in 01_FEATURE_SPEC.md §5. Not used yet; reserved on purpose. */
  Msg_Recipients: ['recipientId','sourceType','sourceId','name','phone','tag','patientId','status',
                   'messageId','error','sentAt','attempts','createdAt','isSample']
};
/* Single source of truth: WAB_DAILY_CAP lives in 07_WhatsApp.gs (this patch changes it from 300
   to 250 there — see the deploy notes). Read through a FUNCTION, not a top-level var, on purpose:
   this file's own header explains why nothing here can safely run at load time (file load order
   across an Apps Script project is not guaranteed), so this file never has to know whether
   07_WhatsApp.gs's `var WAB_DAILY_CAP` has executed yet — by the time any function below actually
   runs, every file's top-level vars already have. */
function msgDailyCap_(){ return (typeof WAB_DAILY_CAP !== 'undefined') ? WAB_DAILY_CAP : 250; }
var MSG_TAGS = ['Healthy','Chronic','New'];
var MSG_STATUSES = ['draft','scheduled','in_progress','paused','completed','failed','cancelled'];
var MSG_REC_MAX_BATCH = 200;      /* one apiMsgAddRecipients call at a time (matches the 150-row
                                      chunks messaging.js sends from the Add Leads pop-up, with
                                      headroom) */
var MSG_LIST_PAGE = 500;          /* patient-delivery pop-up: rows returned before the browser
                                      has to page (its own search/filter narrows first) */

/* ============================================================ BOOT
   Same pattern as pcInit_ in Code_PatientCRM.gs, for the same reason: Apps Script does not
   guarantee which file's top-level code runs first, so HEADERS is extended from inside a
   function called at the top of every entry point here, instead of as a top-level statement
   that might run before 01_Config.gs's `var HEADERS = {...}` has executed. */
function msgInit_(){
  if(typeof HEADERS === 'undefined') return;
  if(!HEADERS.Msg_Campaigns){
    HEADERS.Msg_Campaigns  = MSG_H.Msg_Campaigns;
    HEADERS.Msg_Recipients = MSG_H.Msg_Recipients;
  }
  if(typeof SHEETS !== 'undefined' && !SHEETS.MSGCAMP){
    SHEETS.MSGCAMP = MSG_SHEETS.CAMP;
    SHEETS.MSGREC  = MSG_SHEETS.REC;
  }
}
/* Get-or-create a Messaging sheet with the right header row — never clears existing data
   (unlike nkSheet_ in 13_OpsSamples-1.gs, which is a rebuild-from-scratch diagnostics helper;
   these two sheets hold real, growing campaign data so a header check must be non-destructive,
   same spirit as pcSetup in Code_PatientCRM.gs). */
function msgSheet_(name){
  msgInit_();
  var ss = getSS_(), sh = ss.getSheetByName(name), need = HEADERS[name];
  if(!sh){
    sh = ss.insertSheet(name);
    sh.getRange(1,1,1,need.length).setValues([need]);
    sh.getRange(1,1,1,need.length).setFontWeight('bold').setBackground('#DA1017').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    return sh;
  }
  if(sh.getMaxColumns() < need.length) sh.insertColumnsAfter(sh.getMaxColumns(), need.length - sh.getMaxColumns());
  var have = sh.getRange(1,1,1,need.length).getValues()[0];
  var match = true;
  for(var c=0;c<need.length;c++){ if(String(have[c]||'')!==need[c]){ match=false; break; } }
  if(!match){
    sh.getRange(1,1,1,need.length).setValues([need]);
    sh.getRange(1,1,1,need.length).setFontWeight('bold').setBackground('#DA1017').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  /* Belt-and-suspenders for the sendTime "NaN:38 AM" bug fixed 17 Sep: the apostrophe-prefix
     trick in apiMsgSaveCampaign/msgSeedSampleData already stops Sheets from reinterpreting the
     "HH:MM" string as a time-of-day, but forcing the column itself to Plain Text format means
     even a value pasted or edited by hand straight into the sheet can't silently corrupt again —
     and it's harmless to re-apply every time this sheet is opened. */
  if(name === MSG_SHEETS.CAMP){
    var stCol = need.indexOf('sendTime') + 1;
    if(stCol > 0) sh.getRange(2, stCol, Math.max(sh.getMaxRows()-1,1), 1).setNumberFormat('@');
    /* scheduledDate (Timely Message) is exactly as date-shaped as sendTime is time-shaped — same
       Sheets auto-convert risk, same fix. */
    var sdCol = need.indexOf('scheduledDate') + 1;
    if(sdCol > 0) sh.getRange(2, sdCol, Math.max(sh.getMaxRows()-1,1), 1).setNumberFormat('@');
  }
  return sh;
}
function msgCampSheet_(){ return msgSheet_(MSG_SHEETS.CAMP); }
function msgRecSheet_(){ return msgSheet_(MSG_SHEETS.REC); }

/* ============================================================ PERMISSIONS
   Decision from the handoff chat (17 Sep 2026): MIS, Operations Manager and Director/Admin can
   create/start/pause/delete campaigns. Everybody else who can reach the Messaging pages gets
   read-only history. permsFor_(u).canManageAll is SUPER or HR_ADMIN (see permsFor_ in
   05_Employees.gs) — Director, Admin and MIS are all seeded as SUPER (see ROLE_SEED in
   01_Config.gs), so they are already covered; Operations Manager is AccessLevel MANAGER, which
   canManageAll does NOT include, so it is added explicitly here by role name — exactly the same
   shape as the existing `canMon` / `canCrmPerf` checks in app.js (search
   "Operations Manager" there). This is its own function rather than reusing canManageAll
   directly so that adding another role later (or removing Operations Manager) is a one-line
   change in this file alone — it does not touch WhatsApp Templates' or Branches' permissions. */
function msgCanManage_(u){
  var p = permsFor_(u);
  return !!(p.canManageAll || String(u.Role) === 'Operations Manager');
}
/* View access: management tier, plus a branch-scoped role sees only its own branch (enforced in
   apiMsgListCampaigns/apiMsgListRecipients below, not just in the UI — see the HANDOVER.txt
   note "a hidden button is not a control"). */
function msgCanView_(u){
  var p = permsFor_(u);
  return !!(msgCanManage_(u) || p.canViewAll || p.level === 'BRANCH_MGR' || p.level === 'BRANCH_VIEW');
}
function msgBranchScope_(u){
  var p = permsFor_(u);
  if(p.canManageAll || p.canViewAll) return null;               /* null = no restriction */
  if(p.level === 'BRANCH_MGR' || p.level === 'BRANCH_VIEW') return String(p.branch || u.Branch || '');
  return String(p.branch || u.Branch || '__none__');             /* shouldn't reach here — msgCanView_ already refused */
}

/* ============================================================ SMALL HELPERS */
function msgId_(prefix){ return prefix + Utilities.getUuid().replace(/-/g,'').slice(0,10).toUpperCase(); }
function msgDay_(){ return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function msgNowHM_(){ return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm'); }
/* Timely Message's "Send in ___ days" box, turned into an absolute yyyy-MM-dd. 0 = today. */
function msgAddDays_(days){
  var d = new Date();
  d.setDate(d.getDate() + (Number(days)||0));
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
function msgMobile_(v){
  var d = String(v==null?'':v).replace(/\D/g,'');
  if(d.length===12 && d.slice(0,2)==='91') d=d.slice(2);
  else if(d.length===11 && d.charAt(0)==='0') d=d.slice(1);
  else if(d.length===13 && d.slice(0,3)==='091') d=d.slice(3);
  return d;
}
/* TMP_GOLD, TMP_HLTH, TRG_BDAY1… style codes (see images/reference in the handoff). Takes the
   first letters of up to two significant words, falls back to a counter suffix on collision. */
function msgCodeFromName_(name, existingCodes){
  var words = String(name||'').toUpperCase().replace(/[^A-Z0-9 ]/g,'').split(/\s+/).filter(Boolean);
  var base = (words[0]||'CAMP').slice(0,4);
  if(words[1]) base = (words[0].slice(0,1)+words[1]).slice(0,4);
  var code = 'TMP_'+base, n=1;
  while(existingCodes[code]){ n++; code = 'TMP_'+base+n; }
  return code;
}
function msgBranchName_(branchId){ var b = waBranchRow_(branchId); return b ? String(b.BranchName||branchId) : String(branchId||'All Branches'); }

/* Read-only template list for the Campaign Setup dropdown. Deliberately NOT the same endpoint as
   apiListWaTemplates (07_WhatsApp.gs), which is gated to canManageAll (Director/Admin/MIS) because
   it also lets you CREATE and EDIT templates. msgCanManage_ additionally includes Operations
   Manager, who should be able to PICK a template for a campaign without gaining access to the
   template registry's edit screen — so this is its own, narrower, read-only action. */
function apiMsgListTemplates(token){
  try{
    var u = userFromToken_(token); if(!u) return err_('Session expired.');
    if(!msgCanManage_(u)) return err_('Not authorised.');
    var rows = readSheet_(getSS_().getSheetByName(SHEETS.WATPL),'WA_Templates')
      .filter(function(t){ return String(t.status)==='active'; })
      .map(function(t){ return {tplId:t.tplId, name:t.name, language:t.language, headerType:t.headerType, paramCount:t.paramCount, paramHints:t.paramHints}; });
    return ok_({templates:rows});
  }catch(e){ return err_(e.message); }
}

/* ============================================================ CAMPAIGNS */
function apiMsgListCampaigns(token, filter){
  try{
    var u = userFromToken_(token); if(!u) return err_('Session expired.');
    if(!msgCanView_(u)) return err_('Not authorised to view Messaging.');
    filter = filter || {};
    /* Bulk Message Send and Timely Message share this one sheet (see MSG_H.Msg_Campaigns' comment
       on 'kind'), so every caller is scoped to one or the other — a blank/missing kind (every
       campaign saved before 18 Sep, sample data included) reads as 'bulk', which is also what a
       caller gets by just not passing filter.kind at all, so the existing Bulk Message Send page
       needed no change here. */
    var wantKind = filter.kind==='timely' ? 'timely' : 'bulk';
    var scope = msgBranchScope_(u);
    var rows = readSheet_(msgCampSheet_(), 'Msg_Campaigns');
    rows = rows.filter(function(c){
      if(String(c.kind||'bulk')!==wantKind) return false;
      if(scope && String(c.branchId)!==scope && String(c.branchId)!=='') return false;
      if(filter.branchId && String(c.branchId)!==String(filter.branchId)) return false;
      if(filter.tplId && String(c.tplId)!==String(filter.tplId)) return false;
      if(filter.status && filter.status!=='all'){
        if(filter.status==='pending' && ['scheduled','in_progress','paused'].indexOf(String(c.status))<0) return false;
        if(filter.status==='sent' && String(c.status)!=='completed') return false;
        if(filter.status==='scheduled' && String(c.status)!=='scheduled') return false;
      }
      return true;
    });
    rows.sort(function(a,b){ return (b.createdAt?new Date(b.createdAt).getTime():0) - (a.createdAt?new Date(a.createdAt).getTime():0); });
    rows.forEach(function(c){ c.branchName = msgBranchName_(c.branchId); });
    return ok_({campaigns: rows});
  }catch(e){ return err_(e.message); }
}

/* data: {campaignId(optional=update), branchId, tplId, tag, sendTime, fixedParams:[...],
          headerMediaUrl, status:'draft'|'scheduled', kind:'bulk'|'timely'(default 'bulk'),
          days(Timely Message only — "send in ___ days", 0 = today)}
   "Save as Draft" sends status:'draft', "Start Campaign" sends status:'scheduled'. */
function apiMsgSaveCampaign(token, data){
  try{
    var u = userFromToken_(token); if(!u) return err_('Session expired.');
    if(!msgCanManage_(u)) return err_('Only MIS, Operations Manager or Director/Admin can manage campaigns.');
    data = data || {};
    var sh = msgCampSheet_(), rows = readSheet_(sh,'Msg_Campaigns'), now = new Date();

    if(!data.branchId) return err_('Pick a branch.');
    var branch = waBranchRow_(data.branchId);
    if(!branch) return err_('Branch not found.');
    if(!String(branch.WaApiToken||'').trim()) return err_((branch.BranchName||data.branchId)+' has no WhatsApp API key saved yet — add it on the Branches page first.');

    if(!data.tplId) return err_('Pick a template.');
    var tplRows = readSheet_(getSS_().getSheetByName(SHEETS.WATPL), 'WA_Templates');
    var tix = indexByField_(tplRows, 'tplId', data.tplId);
    if(tix<0) return err_('Template not found.');
    var tpl = tplRows[tix];
    if(String(tpl.status)==='inactive') return err_('That template is inactive — activate it on the WhatsApp Templates page first.');

    var tag = MSG_TAGS.indexOf(String(data.tag))>=0 ? String(data.tag) : '';   /* '' = All Tags */
    /* BUG FOUND 17 Sep, while chasing "NaN:38 AM" in Campaign History's Time column: a bare
       "02:00" string written to a Sheets cell gets auto-detected as a time-of-day and silently
       converted to a TIME-formatted serial value. Read back, that comes out as a Date object (or,
       through this project's date-normalising response layer, a full ISO datetime) instead of the
       literal string — which is exactly what broke fmtTime12() on the frontend AND, far more
       seriously, the scheduler's own gate at msgSchedulerTick_'s `c.sendTime <= nowHM` (a
       corrupted value compares nothing like an HH:MM string, so a real campaign's send time could
       silently never be considered "due"). The leading apostrophe is the standard Apps Script way
       to force a cell to stay plain text — Sheets strips it back off on read, so every reader
       downstream (the scheduler included) sees a clean "HH:MM" string again. */
    var sendTimeRaw = /^\d{2}:\d{2}$/.test(String(data.sendTime||'')) ? String(data.sendTime) : '02:00';
    var sendTime = "'" + sendTimeRaw;
    /* Timely Message (2nd tab, added 18 Sep): kind:'timely' plus a "send in ___ days" box, turned
       here into an absolute scheduledDate that msgSchedulerTick_ won't fire before — see that
       function and MSG_H.Msg_Campaigns' comment on 'kind'. Bulk Message Send never sends kind, so
       it stays 'bulk' with a blank scheduledDate, exactly its existing daily-drip behaviour. Same
       Sheets auto-convert risk as sendTime, same apostrophe fix. */
    var kind = String(data.kind)==='timely' ? 'timely' : 'bulk';
    var scheduledDate = kind==='timely' ? ("'" + msgAddDays_(data.days)) : '';
    var fixedParams = Array.isArray(data.fixedParams) ? data.fixedParams.map(String) : [];
    var headerNeeded = ['image','document','video'].indexOf(String(tpl.headerType||'none'))>=0;
    var headerMediaUrl = String(data.headerMediaUrl||'').trim();
    if(headerNeeded && !headerMediaUrl && !data.campaignId) return err_('This template has a '+tpl.headerType+' header — upload the media it should send first.');

    var status = String(data.status)==='scheduled' ? 'scheduled' : 'draft';

    if(data.campaignId){
      var ix = indexByField_(rows,'campaignId',data.campaignId); if(ix<0) return err_('Campaign not found.');
      updateCells_(sh,'Msg_Campaigns',ix,{
        branchId:data.branchId, tplId:data.tplId, templateName:String(tpl.name), tag:tag,
        sendTime:sendTime, fixedParams:JSON.stringify(fixedParams),
        headerMediaUrl:headerMediaUrl || rows[ix].headerMediaUrl || '',
        status: status==='scheduled' ? (['completed','cancelled'].indexOf(String(rows[ix].status))>=0 ? 'scheduled' : (String(rows[ix].status)==='draft'?'scheduled':rows[ix].status)) : status,
        /* kind never changes on an edit — always keep the row's original kind rather than trusting
           this call's kind, which just reflects which tab the Save button was clicked from. */
        scheduledDate: (String(rows[ix].kind||'bulk')==='timely') ? ("'" + msgAddDays_(data.days)) : (rows[ix].scheduledDate||''),
        updatedAt: now
      });
      audit_(u.EmpID,u.LoginID,'MSG_CAMPAIGN_SAVE',data.campaignId,status);
      return ok_({campaignId:data.campaignId});
    }

    var existingCodes = {}; rows.forEach(function(r){ existingCodes[r.code]=1; });
    var id = msgId_('CAMP');
    var rec = {
      campaignId:id, code: msgCodeFromName_(tpl.name, existingCodes), name:String(tpl.name),
      branchId:data.branchId, tplId:data.tplId, templateName:String(tpl.name), tag:tag,
      sendTime:sendTime, dailyCap:msgDailyCap_(), headerMediaUrl:headerMediaUrl,
      fixedParams:JSON.stringify(fixedParams), status:status, total:0, sent:0, failed:0,
      lastRunDate:'', createdBy:u.EmpID, createdAt:now, updatedAt:now, isSample:false,
      kind:kind, scheduledDate:scheduledDate
    };
    appendObj_(sh,'Msg_Campaigns',rec);
    audit_(u.EmpID,u.LoginID,'MSG_CAMPAIGN_CREATE',id,tpl.name+' / '+status);
    return ok_({campaignId:id});
  }catch(e){ return err_(e.message); }
}

/* status: 'scheduled' (start/resume) | 'paused' | 'cancelled' | 'draft' */
function apiMsgSetCampaignStatus(token, campaignId, status){
  try{
    var u = userFromToken_(token); if(!u) return err_('Session expired.');
    if(!msgCanManage_(u)) return err_('Only MIS, Operations Manager or Director/Admin can manage campaigns.');
    if(MSG_STATUSES.indexOf(String(status))<0) return err_('Unknown status.');
    var sh = msgCampSheet_(), rows = readSheet_(sh,'Msg_Campaigns');
    var ix = indexByField_(rows,'campaignId',campaignId); if(ix<0) return err_('Campaign not found.');
    updateCells_(sh,'Msg_Campaigns',ix,{status:String(status), updatedAt:new Date()});
    audit_(u.EmpID,u.LoginID,'MSG_CAMPAIGN_STATUS',campaignId,String(status));
    return ok_({});
  }catch(e){ return err_(e.message); }
}

/* The 4 stat tiles. Recalculated whenever Template (or Branch) changes on the page — see
   2.2 in 01_FEATURE_SPEC.md. tplId is required (tiles always follow a selected template);
   branchId '' means "All Branches". */
function apiMsgCampaignStats(token, branchId, tplId){
  try{
    var u = userFromToken_(token); if(!u) return err_('Session expired.');
    if(!msgCanView_(u)) return err_('Not authorised.');
    if(!tplId) return ok_({leadsInQueue:0, sentToday:0, pending:0, capUsed:0, capTotal:msgDailyCap_(), lastBatchAt:'', templateName:''});
    var scope = msgBranchScope_(u);
    var camps = readSheet_(msgCampSheet_(),'Msg_Campaigns').filter(function(c){
      if(String(c.tplId)!==String(tplId)) return false;
      if(branchId && String(c.branchId)!==String(branchId)) return false;
      if(scope && String(c.branchId)!==scope) return false;
      return true;
    });
    var leadsInQueue=0, sent=0, failed=0, templateName=camps.length?camps[0].templateName:'';
    var campIds={}; camps.forEach(function(c){ leadsInQueue+=Number(c.total)||0; sent+=Number(c.sent)||0; failed+=Number(c.failed)||0; campIds[c.campaignId]=1; });
    var pending = Math.max(0, leadsInQueue - sent - failed);

    var today = msgDay_();
    var recs = readSheet_(msgRecSheet_(),'Msg_Recipients').filter(function(r){ return campIds[r.sourceId] && !truthy_(r.isSample); });
    var sentToday=0, lastAt=null;
    recs.forEach(function(r){
      if(String(r.status)==='sent' && r.sentAt){
        var d = (r.sentAt instanceof Date) ? r.sentAt : new Date(r.sentAt);
        if(!isNaN(d.getTime()) && Utilities.formatDate(d,Session.getScriptTimeZone(),'yyyy-MM-dd')===today){
          sentToday++;
          if(!lastAt || d.getTime()>lastAt.getTime()) lastAt=d;
        }
      }
    });

    var branchIds = branchId ? [String(branchId)] : (function(){
      var seen={}; camps.forEach(function(c){ seen[String(c.branchId)]=1; }); return Object.keys(seen);
    })();
    var capUsed=0, capTotal=0;
    if(branchId){ capUsed = wabCapUsed_(branchId); capTotal = msgDailyCap_(); }
    else { branchIds.forEach(function(bid){ capUsed+=wabCapUsed_(bid); capTotal+=msgDailyCap_(); }); if(!capTotal) capTotal=msgDailyCap_(); }

    return ok_({
      leadsInQueue:leadsInQueue, sentToday:sentToday, pending:pending,
      capUsed:capUsed, capTotal:capTotal,
      lastBatchAt: lastAt ? Utilities.formatDate(lastAt,Session.getScriptTimeZone(),'hh:mm a') : '',
      daysToClear: pending>0 ? Math.ceil(pending/msgDailyCap_()) : 0,
      templateName: templateName
    });
  }catch(e){ return err_(e.message); }
}

/* ============================================================ LEADS (Add Leads pop-up)
   data: {campaignId, rows:[{name,mobile,tag}], fileName}
   Called once per ~150-row chunk from messaging.js (mirrors the Patient CRM's bulk-upload
   shape in patients.js — see openBulkUpload there). Dedupes against every phone already on
   THIS campaign (existing rows, not just this batch), and never overwrites — same rule as
   pcImport: "Numbers already on file are counted, never overwritten". */

/* 19 Sep — PERFORMANCE: Msg_Recipients is not in CACHED_SHEETS_ (22_Helpers.gs) because, like
   Attendance and Acc_Daily before it, it only ever grows — so every single apiMsgAddRecipients
   call was doing a full, uncached read of the WHOLE sheet (every campaign's every recipient, not
   just this one) purely to dedupe phones for ONE campaign. That cost is paid again on EVERY
   chunk of a big upload (a 20,000-contact file is ~106 calls — see CHUNK in messaging.js), and
   grows with every campaign anyone has ever run, which is exactly why "Add Leads" gets slower
   over time even for a handful of leads. Same fix shape as attendanceRowsSince_ / the accdaily
   cache in 22_Helpers.gs: cache just the (small) set of phones already on THIS one campaign,
   using the same cacheGetRows_/cacheSetRows_ helpers (they already chunk a value over ~90KB
   automatically, so this is safe even for a campaign with tens of thousands of leads). Kept warm
   ACROSS a whole upload (updated after every successful write, not dropped) so a big file's many
   chunk calls do ONE full-sheet read total instead of one per chunk; a genuinely stale/missing
   cache (nothing cached yet, or the 5-minute TTL lapsed) just rebuilds itself from a live read,
   same as before this change — nothing here can go stale past that TTL, and a deleted recipient
   drops the cache for its campaign (see apiMsgDeleteRecipient) so a re-add is never blocked by a
   phone that no longer exists on the campaign. */
function msgSeenCacheKey_(campaignId){ return 'msgseen_'+campaignId; }
function msgSeenPhones_(campaignId){
  var hit = cacheGetRows_(msgSeenCacheKey_(campaignId));
  if(hit) return hit;
  var recs = readSheet_(msgRecSheet_(),'Msg_Recipients');
  var seen = {};
  recs.forEach(function(r){ if(String(r.sourceId)===String(campaignId) && String(r.status)!=='deleted') seen[r.phone]=1; });
  var arr = Object.keys(seen);
  cacheSetRows_(msgSeenCacheKey_(campaignId), arr);
  return arr;
}
function apiMsgAddRecipients(token, data){
  try{
    var u = userFromToken_(token); if(!u) return err_('Session expired.');
    if(!msgCanManage_(u)) return err_('Only MIS, Operations Manager or Director/Admin can add leads.');
    data = data || {};
    var campSh = msgCampSheet_(), camps = readSheet_(campSh,'Msg_Campaigns');
    var cix = indexByField_(camps,'campaignId',data.campaignId); if(cix<0) return err_('Campaign not found.');
    var camp = camps[cix];

    var incoming = Array.isArray(data.rows) ? data.rows : [];
    if(!incoming.length) return err_('Nothing to add.');
    if(incoming.length > MSG_REC_MAX_BATCH) return err_('Too many at once — send at most '+MSG_REC_MAX_BATCH+' per batch.');

    var recSh = msgRecSheet_();
    var seenArr = msgSeenPhones_(camp.campaignId);
    var seen = {}; seenArr.forEach(function(p){ seen[p]=1; });

    var added=0, duplicate=0, invalid=0, now=new Date();
    var toWrite = [];
    incoming.forEach(function(row){
      var name = String(row.name||'').trim();
      var phone = msgMobile_(row.mobile||row.phone);
      if(phone.length!==10){ invalid++; return; }
      if(seen[phone]){ duplicate++; return; }
      seen[phone]=1;
      toWrite.push({
        recipientId: msgId_('REC'), sourceType:'campaign', sourceId:camp.campaignId,
        name:name || '—', phone:phone, tag: String(row.tag||camp.tag||''), patientId:'',
        status:'pending', messageId:'', error:'', sentAt:'', attempts:0, createdAt:now, isSample:false
      });
      added++;
    });

    if(toWrite.length){
      var head = HEADERS.Msg_Recipients;
      var values = toWrite.map(function(o){ return head.map(function(h){ return o[h]!==undefined?o[h]:''; }); });
      recSh.getRange(recSh.getLastRow()+1,1,values.length,head.length).setValues(values);
      invalidateSheetCache_('Msg_Recipients');
      /* Keep the per-campaign seen-set warm for the rest of THIS upload — see the perf note above
         apiMsgAddRecipients. Only the phones actually written (not duplicates/invalid) are new. */
      cacheSetRows_(msgSeenCacheKey_(camp.campaignId), seenArr.concat(toWrite.map(function(o){ return o.phone; })));
      updateCells_(campSh,'Msg_Campaigns',cix,{total:(Number(camp.total)||0)+added, updatedAt:now});
    }
    audit_(u.EmpID,u.LoginID,'MSG_LEADS_ADD',camp.campaignId,'added='+added+' dup='+duplicate+' bad='+invalid+' file='+(data.fileName||''));
    return ok_({added:added, duplicate:duplicate, invalid:invalid});
  }catch(e){ return err_(e.message); }
}

/* Patient Delivery pop-up. filter: {q, status:'all'|'sent'|'pending'|'failed'} */
function apiMsgListRecipients(token, campaignId, filter){
  try{
    var u = userFromToken_(token); if(!u) return err_('Session expired.');
    if(!msgCanView_(u)) return err_('Not authorised.');
    filter = filter || {};
    var camps = readSheet_(msgCampSheet_(),'Msg_Campaigns');
    var cix = indexByField_(camps,'campaignId',campaignId); if(cix<0) return err_('Campaign not found.');
    var camp = camps[cix];
    var scope = msgBranchScope_(u);
    if(scope && String(camp.branchId)!==scope) return err_('Not authorised for this branch.');

    var rows = readSheet_(msgRecSheet_(),'Msg_Recipients').filter(function(r){ return String(r.sourceId)===String(campaignId) && String(r.status)!=='deleted'; });
    var q = String(filter.q||'').trim().toLowerCase();
    if(q) rows = rows.filter(function(r){ return String(r.name||'').toLowerCase().indexOf(q)>=0 || String(r.phone||'').indexOf(q)>=0; });
    if(filter.status && filter.status!=='all') rows = rows.filter(function(r){ return String(r.status)===String(filter.status); });
    rows.sort(function(a,b){ return (a.createdAt?new Date(a.createdAt).getTime():0) - (b.createdAt?new Date(b.createdAt).getTime():0); });

    var total = rows.length;
    var counts = {sent:0,pending:0,failed:0};
    readSheet_(msgRecSheet_(),'Msg_Recipients').filter(function(r){ return String(r.sourceId)===String(campaignId) && String(r.status)!=='deleted'; })
      .forEach(function(r){ if(counts[r.status]!==undefined) counts[r.status]++; });

    return ok_({
      campaign: {campaignId:camp.campaignId, templateName:camp.templateName, branchName:msgBranchName_(camp.branchId), tag:camp.tag, sendTime:camp.sendTime, createdAt:camp.createdAt},
      recipients: rows.slice(0, MSG_LIST_PAGE),
      total: total, showing: Math.min(total, MSG_LIST_PAGE),
      counts: {sent:counts.sent, pending:counts.pending, failed:counts.failed, total:total}
    });
  }catch(e){ return err_(e.message); }
}

/* Pending leads only — matches the spec ("delete a lead — pending leads only"). */
function apiMsgDeleteRecipient(token, recipientId){
  try{
    var u = userFromToken_(token); if(!u) return err_('Session expired.');
    if(!msgCanManage_(u)) return err_('Not authorised.');
    var sh = msgRecSheet_(), rows = readSheet_(sh,'Msg_Recipients');
    var ix = indexByField_(rows,'recipientId',recipientId); if(ix<0) return err_('Lead not found.');
    if(String(rows[ix].status)!=='pending') return err_('Only a pending lead can be deleted.');
    updateCells_(sh,'Msg_Recipients',ix,{status:'deleted'});
    cacheDrop_(msgSeenCacheKey_(rows[ix].sourceId));   /* so this phone can be re-added without a false "duplicate" — see the perf note above apiMsgAddRecipients */
    var camps = readSheet_(msgCampSheet_(),'Msg_Campaigns'), cix = indexByField_(camps,'campaignId',rows[ix].sourceId);
    if(cix>=0) updateCells_(msgCampSheet_(),'Msg_Campaigns',cix,{total:Math.max(0,(Number(camps[cix].total)||0)-1), updatedAt:new Date()});
    audit_(u.EmpID,u.LoginID,'MSG_LEAD_DELETE',recipientId,'');
    return ok_({});
  }catch(e){ return err_(e.message); }
}

/* Admin-only one-click wipe of every isSample campaign + recipient. */
function apiMsgDeleteSampleData(token){
  try{
    var u = userFromToken_(token); if(!u) return err_('Session expired.');
    if(!permsFor_(u).canManageAll) return err_('Only Director/Admin can delete sample data.');
    var campSh = msgCampSheet_(), recSh = msgRecSheet_();
    var camps = readSheet_(campSh,'Msg_Campaigns'), recs = readSheet_(recSh,'Msg_Recipients');
    var keepCamps = [], removedCamps=0;
    camps.forEach(function(c){ if(truthy_(c.isSample)) removedCamps++; else keepCamps.push(HEADERS.Msg_Campaigns.map(function(h){ return c[h]!==undefined?c[h]:''; })); });
    var keepRecs = [], removedRecs=0;
    recs.forEach(function(r){ if(truthy_(r.isSample)) removedRecs++; else keepRecs.push(HEADERS.Msg_Recipients.map(function(h){ return r[h]!==undefined?r[h]:''; })); });

    campSh.getRange(2,1,Math.max(campSh.getLastRow()-1,1),HEADERS.Msg_Campaigns.length).clearContent();
    if(keepCamps.length) campSh.getRange(2,1,keepCamps.length,HEADERS.Msg_Campaigns.length).setValues(keepCamps);
    recSh.getRange(2,1,Math.max(recSh.getLastRow()-1,1),HEADERS.Msg_Recipients.length).clearContent();
    if(keepRecs.length) recSh.getRange(2,1,keepRecs.length,HEADERS.Msg_Recipients.length).setValues(keepRecs);
    invalidateSheetCache_('Msg_Campaigns'); invalidateSheetCache_('Msg_Recipients');

    audit_(u.EmpID,u.LoginID,'MSG_SAMPLE_DELETE','','campaigns='+removedCamps+' recipients='+removedRecs);
    return ok_({removedCampaigns:removedCamps, removedRecipients:removedRecs});
  }catch(e){ return err_(e.message); }
}

/* ============================================================ SEND — shared by the scheduler
   Builds the WhatsApp components array exactly the way apiWaTestTemplate / wabResolve_ already
   do elsewhere in this project (see 07_WhatsApp.gs): header component only for image/document/
   video headers, body component with exactly paramCount values, {{1}}=branch, {{2}}=lead name,
   the rest from the campaign's fixedParams. Returns null (skip silently) if the template can no
   longer be resolved — the tick logs that instead of crashing the whole run. */
function msgBuildPayload_(camp, tpl, branch, leadName){
  var key = String(branch.WaApiToken||'').trim();
  if(!key) return null;
  var fixed = []; try{ fixed = JSON.parse(camp.fixedParams||'[]'); }catch(e){}
  var vals = [String(branch.BranchName||''), String(leadName||'')].concat(fixed.map(String));
  var nParams = Math.max(0, Number(tpl.paramCount)||0);
  var headerType = String(tpl.headerType||'none');
  var comps = [];
  if(['image','document','video'].indexOf(headerType)>=0){
    var link = String(camp.headerMediaUrl||'').trim();
    if(!link) return null;
    var m = {type:headerType}; m[headerType] = (headerType==='document') ? {link:link, filename:'attachment.pdf'} : {link:link};
    comps.push({type:'header', parameters:[m]});
  }
  if(nParams>0) comps.push({type:'body', parameters: vals.slice(0,nParams).map(function(v){ return {type:'text', text:String(v).replace(/[\n\r\t]+/g,' ').trim()||'-'}; })});
  var payload = {token:key, phone:'', template_name:String(tpl.name), template_language:String(tpl.language||'en'), language:String(tpl.language||'en')};
  if(comps.length) payload.components = comps;
  return payload;
}

/* ============================================================ SCHEDULER
   Install once from the editor (Run ▸ msgSetupScheduler). After that it needs nobody logged in —
   msgSchedulerTick_ fires every 15 minutes forever, exactly like nkSetupKeepWarm in
   26_KeepWarm.gs, and is safe to run again (checks for an existing trigger first). */
function msgSetupScheduler(){
  var found=false;
  ScriptApp.getProjectTriggers().forEach(function(t){ if(t.getHandlerFunction()==='msgSchedulerTick_') found=true; });
  if(!found) ScriptApp.newTrigger('msgSchedulerTick_').timeBased().everyMinutes(15).create();
  return found ? 'Already scheduled — nothing to do.' : 'Bulk Message Send scheduler installed — runs every 15 minutes.';
}
function msgStopScheduler(){
  var killed=0;
  ScriptApp.getProjectTriggers().forEach(function(t){ if(t.getHandlerFunction()==='msgSchedulerTick_'){ ScriptApp.deleteTrigger(t); killed++; } });
  return killed+' scheduler trigger(s) removed.';
}

var MSG_TICK_BUDGET_MS = 5*60*1000;   /* stop cleanly before Apps Script's 6-minute execution limit */

/* Runs unattended, every 15 minutes, all day. For every campaign whose sendTime has passed
   today and that still has pending (non-sample) leads, sends up to whatever is left of that
   branch's shared 250/day cap — the SAME counter the membership-card bulk send uses
   (wabCapUsed_/wabCapAdd_), so the two features can never together exceed 250/branch/day.
   Chunks of 10 in parallel with a pause between chunks (WAB_CHUNK/WAB_CHUNK_PAUSE_MS — the same
   anti-burst settings already tuned for the card bulk send), writes every status in one batch
   (never one row at a time — see the "Large writes fail" landmine in HANDOVER.txt), and picks
   up again next tick if it runs out of time or cap before the campaign's queue is empty. */
function msgSchedulerTick_(){
  var lock = LockService.getScriptLock();
  if(!lock.tryLock(5000)) return;   /* another tick (or a manual run) is already in progress */
  try{
    msgInit_();
    var start = Date.now();
    var today = msgDay_(), nowHM = msgNowHM_();
    var campSh = msgCampSheet_(), recSh = msgRecSheet_();
    var camps = readSheet_(campSh,'Msg_Campaigns');
    var tplRows = readSheet_(getSS_().getSheetByName(SHEETS.WATPL), 'WA_Templates');

    var active = camps.filter(function(c){
      /* scheduledDate (Timely Message only — blank on every Bulk Message Send campaign, so this
         is a no-op for those, exactly today's behaviour) holds the whole campaign back until that
         date arrives, regardless of sendTime. */
      if(c.scheduledDate && String(c.scheduledDate) > today) return false;
      return ['scheduled','in_progress'].indexOf(String(c.status))>=0 && !truthy_(c.isSample) && String(c.sendTime||'02:00') <= nowHM;
    });
    if(!active.length) return;

    var allRecs = readSheet_(recSh,'Msg_Recipients');
    var logRows = [];

    for(var ci=0; ci<active.length; ci++){
      if(Date.now()-start > MSG_TICK_BUDGET_MS) break;   /* leave the rest for the next tick */
      var camp = active[ci];
      var cix = indexByField_(camps,'campaignId',camp.campaignId); if(cix<0) continue;

      var budget = msgDailyCap_() - wabCapUsed_(camp.branchId);
      if(budget<=0) continue;   /* this branch's shared daily cap is already spent — try again tomorrow */

      var pending = allRecs.filter(function(r){ return String(r.sourceId)===String(camp.campaignId) && String(r.status)==='pending' && !truthy_(r.isSample); });
      if(!pending.length){
        if((Number(camp.total)||0)>0) updateCells_(campSh,'Msg_Campaigns',cix,{status:'completed', updatedAt:new Date()});
        continue;
      }

      var branch = waBranchRow_(camp.branchId);
      if(!branch || !String(branch.WaApiToken||'').trim()) continue;   /* logged via WA_Log below only on attempt, nothing to attempt here */
      var tix = indexByField_(tplRows,'tplId',camp.tplId);
      if(tix<0) continue;
      var tpl = tplRows[tix];

      var batch = pending.slice(0, Math.min(budget, msgDailyCap_()));
      var prepared = [];
      batch.forEach(function(rec){
        var payload = msgBuildPayload_(camp, tpl, branch, rec.name);
        if(!payload) return;
        payload.phone = waPhone_(rec.phone);
        if(payload.phone.length<11) return;
        prepared.push({rec:rec, payload:payload});
      });
      if(!prepared.length) continue;

      var sentThisCampaign=0, failedThisCampaign=0, now=new Date();
      var recUpdates = {};   /* recipientId -> patch */

      for(var start2=0; start2<prepared.length; start2+=WAB_CHUNK){
        if(Date.now()-start > MSG_TICK_BUDGET_MS) break;
        var chunk = prepared.slice(start2, start2+WAB_CHUNK);
        if(start2>0) Utilities.sleep(WAB_CHUNK_PAUSE_MS);
        var requests = chunk.map(function(p){ return {url:WA_BASE+'sendtemplatemessage', method:'post', contentType:'application/json', payload:JSON.stringify(p.payload), muteHttpExceptions:true}; });
        var responses;
        try{ responses = UrlFetchApp.fetchAll(requests); }
        catch(e){ responses = requests.map(function(rq){ try{ return UrlFetchApp.fetch(rq.url,rq); }catch(e2){ return null; } }); }

        for(var k=0;k<chunk.length;k++){
          var pr=chunk[k], rp=responses[k];
          var r = rp ? wabParse_(rp) : {success:false,code:0,messageId:'',message:'no response',raw:''};
          if(r.success){
            recUpdates[pr.rec.recipientId] = {status:'sent', messageId:r.messageId, sentAt:now, attempts:(Number(pr.rec.attempts)||0)+1};
            sentThisCampaign++;
          } else {
            recUpdates[pr.rec.recipientId] = {status:'failed', error:String(r.message||r.raw||'send failed').slice(0,300), attempts:(Number(pr.rec.attempts)||0)+1};
            failedThisCampaign++;
          }
          logRows.push([now, String(branch.BranchName||camp.branchId||''), 'campaign', pr.payload.phone, String(tpl.name), String(tpl.language||'en'),
            r.code||'', r.messageId||'', r.success?'yes':'no', JSON.stringify(Object.assign({},pr.payload,{token:'***'})).slice(0,900),
            String('campaign='+camp.code+' | '+(r.raw||'')).slice(0,900)]);
        }
      }

      /* one batched write for every recipient touched this tick — never one row at a time */
      Object.keys(recUpdates).forEach(function(rid){
        var rix = indexByField_(allRecs,'recipientId',rid);
        if(rix>=0) updateCells_(recSh,'Msg_Recipients',rix,recUpdates[rid],allRecs);
      });
      if(sentThisCampaign) wabCapAdd_(camp.branchId, sentThisCampaign);

      var newSent = (Number(camp.sent)||0)+sentThisCampaign, newFailed=(Number(camp.failed)||0)+failedThisCampaign;
      var stillPending = pending.length - sentThisCampaign - failedThisCampaign;
      updateCells_(campSh,'Msg_Campaigns',cix,{
        sent:newSent, failed:newFailed, lastRunDate:today,
        status: stillPending<=0 ? 'completed' : 'in_progress',
        updatedAt: now
      });
    }
    if(logRows.length) wabLogRows_(logRows);
  }catch(e){
    try{ Logger.log('msgSchedulerTick_ error: '+e.message); }catch(e2){}
  }finally{
    lock.releaseLock();
  }
}

/* ============================================================ SAMPLE DATA
   Editor-run once (Run ▸ msgSeedSampleData). Matches the 5 rows in the approved mockup/images
   so the page can be seen working before any real leads go in. Every row carries isSample=true;
   msgSchedulerTick_ already filters those out on both the campaign (!truthy_(c.isSample)) and
   recipient (!truthy_(r.isSample)) side, so seeded "sent" rows are never re-sent and seeded
   "pending" rows are never picked up — they are fixtures, not queued work. */
function msgSeedSampleData(){
  msgInit_();
  var campSh = msgCampSheet_(), recSh = msgRecSheet_();
  var branches = readSheet_(getSS_().getSheetByName(SHEETS.BRANCH),'Branches').filter(function(b){ return String(b.Status)!=='Deleted'; });
  var tpls = readSheet_(getSS_().getSheetByName(SHEETS.WATPL),'WA_Templates').filter(function(t){ return String(t.status)!=='deleted'; });
  if(!branches.length) return 'No branches found — add a branch first.';
  var branchId = branches[0].BranchID;
  var tplName = tpls.length ? String(tpls[0].name) : 'sample_template';
  var tplId = tpls.length ? tpls[0].tplId : '';

  var now = new Date(), today = msgDay_();
  var defs = [
    {code:'TMP_GOLD', name:'Gold Card Renewal', tag:'Chronic', sendTime:'02:00', total:1842, sent:250, failed:0, status:'in_progress'},
    {code:'TMP_HLTH', name:'Health Checkup Reminder', tag:'New', sendTime:'02:00', total:640, sent:640, failed:0, status:'completed'},
    {code:'TMP_SLVR', name:'Silver Card Renewal', tag:'Healthy', sendTime:'02:00', total:1120, sent:1120, failed:0, status:'completed'},
    {code:'TMP_DIWALI', name:'Diwali Offer 2026', tag:'', sendTime:'02:00', total:3050, sent:0, failed:0, status:'scheduled'},
    {code:'TMP_FREE', name:'Free Consultation Camp', tag:'New', sendTime:'02:00', total:12, sent:0, failed:12, status:'failed'}
  ];
  var campRows=[], recRows=[];
  defs.forEach(function(d,i){
    var campaignId = msgId_('CAMP');
    /* Same Sheets auto-convert issue as apiMsgSaveCampaign above — force sendTime to stay plain text. */
    /* kind/scheduledDate (18 Sep): sample rows are all Bulk Message Send examples, so kind:'bulk'
       and scheduledDate blank — matches the header's own append-only order (must stay a full
       22-value row now that Msg_Campaigns has 22 columns, or setValues() below throws). */
    campRows.push([campaignId, d.code, d.name, branchId, tplId, tplName, d.tag, "'"+d.sendTime, msgDailyCap_(), '', '[]',
      d.status, d.total, d.sent, d.failed, d.status==='completed'||d.status==='in_progress'?today:'', 'SAMPLE', now, now, true, 'bulk', '']);
    var names=['Rajesh Joshi','Priya Patel','Kiran Shah','Meera Desai','Ashok Tandel','Varsha Gohel','Dilip Prajapati','Sunita Nair','Hitesh Mehta','Nisha Rana'];
    var n = Math.min(10, d.total||10);
    for(var r=0;r<n;r++){
      var st = r < Math.min(d.sent,n) ? 'sent' : (r < Math.min(d.sent+d.failed,n) ? 'failed' : 'pending');
      recRows.push([msgId_('REC'),'campaign',campaignId, names[r%names.length], String(9000000000+Math.floor(Math.random()*99999999)).slice(0,10),
        d.tag, '', st, st==='sent'?('wamid.SAMPLE'+i+r):'', st==='failed'?'Sample failure reason':'', st==='sent'?now:'', st==='pending'?0:1, now, true]);
    }
  });
  if(campRows.length) campSh.getRange(campSh.getLastRow()+1,1,campRows.length,HEADERS.Msg_Campaigns.length).setValues(campRows);
  if(recRows.length) recSh.getRange(recSh.getLastRow()+1,1,recRows.length,HEADERS.Msg_Recipients.length).setValues(recRows);
  invalidateSheetCache_('Msg_Campaigns'); invalidateSheetCache_('Msg_Recipients');
  return 'Seeded '+defs.length+' sample campaigns with sample leads. Use "Delete sample data" on the page (or apiMsgDeleteSampleData) to remove them later.';
}

/* Editor-run health check — Run ▸ msgVerify, then View ▸ Execution log. Changes nothing. */
function msgVerify(){
  var L=[];
  try{
    msgInit_();
    var campSh=getSS_().getSheetByName(MSG_SHEETS.CAMP), recSh=getSS_().getSheetByName(MSG_SHEETS.REC);
    L.push('Msg_Campaigns sheet: '+(campSh?'OK':'MISSING — run msgSeedSampleData() or save a campaign once to create it'));
    L.push('Msg_Recipients sheet: '+(recSh?'OK':'MISSING'));
    L.push('WAB_DAILY_CAP (shared with card bulk send): '+WAB_DAILY_CAP+(WAB_DAILY_CAP===250?' — OK':' — expected 250, check 07_WhatsApp.gs'));
    var tpls = readSheet_(getSS_().getSheetByName(SHEETS.WATPL),'WA_Templates').filter(function(t){return String(t.status)!=='deleted';});
    L.push('Active WhatsApp templates available: '+tpls.length);
    var found=false;
    ScriptApp.getProjectTriggers().forEach(function(t){ if(t.getHandlerFunction()==='msgSchedulerTick_') found=true; });
    L.push('Scheduler installed: '+(found?'YES — running every 15 minutes':'NO — run msgSetupScheduler() once'));
    var branchesNoKey = readSheet_(getSS_().getSheetByName(SHEETS.BRANCH),'Branches').filter(function(b){ return String(b.Status)!=='Deleted' && !String(b.WaApiToken||'').trim(); });
    L.push('Branches with no WhatsApp key yet: '+branchesNoKey.length+(branchesNoKey.length?(' ('+branchesNoKey.map(function(b){return b.BranchName;}).join(', ')+')'):''));
  }catch(e){ L.push('Error: '+e.message); }
  var t=L.join('\n'); Logger.log(t); return t;
}
