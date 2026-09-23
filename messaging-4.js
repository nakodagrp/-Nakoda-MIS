/* Nakoda MIS — Messaging · Bulk Message Send (loads after app.js; reuses its globals: $, esc,
 * val, toast, openModal, closeModal, rowAccent, rowInitials, S, API)
 *
 * Scope: Bulk Message Send only — Timely Message is a second phase (see the handoff spec).
 * Built from the approved images (Messaging-Feature-Handoff/images/) and the clickable mockup,
 * using the MIS's own styles.css classes (.kpis/.kpi, .card, .badge, .table-wrap, .modal*,
 * .grid2/.field, .pill) instead of the mockup's own bespoke CSS, per 01_FEATURE_SPEC.md's own
 * instruction not to copy the mockup CSS directly. The Campaign History rows reuse the exact
 * same technique as the Branches page (rowAccent/rowInitials from app.js) — that IS the "row
 * style copied from the Branches page" the spec asks for, not a new component.
 */
(function(){
  var TPLS=[], TPLMAP={}, TPL_ERR='', TPL_LOADED=false;
  var CARDTYPES=[], CARDTYPEMAP={};   /* 19 Sep — card types (Membership Cards ▸ Card Types), fetched
    once so paintExtraFields() can auto-fill a template's own "Card Type" box instead of making you
    type it — see autofillKnownValue_ below. */
  var CAMPS=[];
  var F={ branchId:'', tplId:'', tag:'', tab:'all', lastCampaignId:'', lastKey:'', fixedParams:[], fpAuto:[], headerMediaUrl:'' };   /* current Campaign Setup (lastCampaignId/lastKey back the in-box "+ Add Leads" button below; fixedParams/headerMediaUrl back the "needs a bit more" box — see paintExtraFields. fpAuto[i] tracks whether fixedParams[i] was filled in BY the page (true — keeps following Branch/Template) or typed by hand (false — never touched again by autofill) */

  /* ============================================================ TIMELY MESSAGE (18 Sep, rebuilt
     19 Sep per the approved mockup — Messaging-Feature-Handoff, "BUILD IT"). Now a full second
     tab matching Bulk Message Send: its own KPI tiles, its own Campaign History table (kind:
     'timely', same Msg_Campaigns/Msg_Recipients sheets as Bulk, kept apart purely by that kind
     flag — see apiMsgSaveCampaign/apiMsgListCampaigns/apiMsgCampaignStats in 27_Messaging.gs).
     The one real difference from Bulk Message Send: instead of a "Send Time" that drips 250/day
     starting immediately, you pick a "Send After" delay — 1 Day/1 Week/2 Weeks/1 Month/3 Months/
     6 Months/1 Year, or a custom calendar date — and the message only starts going out on that
     exact date (msgSchedulerTick_'s existing scheduledDate gate in 27_Messaging.gs, unchanged).
     The month/year presets use JS Date.setMonth(), which is calendar-exact (18 Sep + 3 months =
     18 Dec, not "90 days later") and correctly lands on the real last day of a short month
     instead of overflowing into the next one. View / + Leads / Cancel on the history table below
     reuse the exact same openPatientDelivery/openAddLeadsModal/deleteCampaign_/actionButtons
     functions Bulk Message Send already uses — those are campaignId-scoped, not kind-scoped, so
     nothing there needed to change. */
  var CAMPS_T=[];
  var FT={ branchId:'', tplId:'', tag:'', tab:'all', preset:'1d', customDate:'', lastCampaignId:'', lastKey:'' };
  var TM_PRESETS=[
    {key:'1d', label:'1 Day', unit:'day', n:1},
    {key:'1w', label:'1 Week', unit:'day', n:7},
    {key:'2w', label:'2 Weeks', unit:'day', n:14},
    {key:'1m', label:'1 Month', unit:'month', n:1},
    {key:'3m', label:'3 Months', unit:'month', n:3},
    {key:'6m', label:'6 Months', unit:'month', n:6},
    {key:'1y', label:'1 Year', unit:'month', n:12},
    {key:'custom', label:'📅 Custom date', unit:'custom'}
  ];
  var TM_PRESET_MAP={}; TM_PRESETS.forEach(function(p){ TM_PRESET_MAP[p.key]=p; });
  function findCamp_(campaignId){
    return (CAMPS.filter(function(x){ return x.campaignId===campaignId; })[0]) ||
           (CAMPS_T.filter(function(x){ return x.campaignId===campaignId; })[0]);
  }
  /* Calendar-EXACT add — deliberately Date.setMonth(), not "+ n*30 days": setMonth() already
     handles month-length/overflow correctly on its own (e.g. 31 Jan + 1 month lands on 28/29 Feb,
     not 3 Mar), which is exactly the guarantee the mockup's footnote promised. */
  function tmAddExact_(unit, n){
    var d=new Date();
    if(unit==='day') d.setDate(d.getDate()+(Number(n)||0));
    else if(unit==='month') d.setMonth(d.getMonth()+(Number(n)||0));
    return d;
  }
  function tmDateStr_(d){
    var y=d.getFullYear(), m=String(d.getMonth()+1), day=String(d.getDate());
    if(m.length<2) m='0'+m; if(day.length<2) day='0'+day;
    return y+'-'+m+'-'+day;
  }
  /* The date the current Campaign Setup box (chip picked, or the custom date field) is set to —
     used both for the live autonote and for what actually gets saved. */
  function tmCurrentTargetDate_(){
    var p=TM_PRESET_MAP[FT.preset]||TM_PRESET_MAP['1d'];
    if(p.unit==='custom'){
      var v=($('tm_customDate')&&$('tm_customDate').value)||FT.customDate||'';
      if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v+'T00:00:00');
      return new Date();
    }
    return tmAddExact_(p.unit, p.n);
  }

  /* MIS, Operations Manager or Director/Admin can manage; everyone who can see this page (nav
     visibility is gated the same way in app.js) can view. Mirrors msgCanManage_ in 27_Messaging.gs
     — the server enforces this independently, this only decides which buttons are drawn (see the
     HANDOVER.txt note: "a hidden button is not a control"). */
  function canManage(){ return !!(S.perms && (S.perms.canManageAll || (S.user && S.user.Role==='Operations Manager'))); }

  function money0(n){ return Math.round(Number(n)||0).toLocaleString('en-IN'); }
  function digits(v){ return String(v==null?'':v).replace(/\D/g,''); }
  function mobile10(v){
    /* Excel/CSV quirks: 9825109378.0 (number stored as decimal) and 9.825109378E+9 (scientific) — both used to
       come out as the wrong digits and the whole row was skipped as "invalid mobile". */
    if(typeof v==='number' && isFinite(v)) v=String(Math.round(v));
    else if(/^\s*\d+(\.\d+)?e\+?\d+\s*$/i.test(String(v==null?'':v))) v=String(Math.round(Number(v)));
    else v=String(v==null?'':v).replace(/^\s*(\d+)\.0+\s*$/,'$1');
    var d=digits(v);
    if(d.length===12 && d.slice(0,2)==='91') d=d.slice(2);
    else if(d.length===11 && d.charAt(0)==='0') d=d.slice(1);
    else if(d.length===13 && d.slice(0,3)==='091') d=d.slice(3);
    return d;
  }
  function fmtTime12(hm){
    var p=String(hm||'').split(':'); if(p.length<2) return String(hm||'');
    var h=Number(p[0]||0), ap=h>=12?'PM':'AM', hh=h%12; if(hh===0) hh=12;
    return hh+':'+p[1]+' '+ap;
  }
  function fmtDateShort(d){
    if(!d) return '—';
    var dt=(d instanceof Date)?d:new Date(d); if(isNaN(dt.getTime())) return String(d).slice(0,10);
    return dt.getDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()]+' '+dt.getFullYear();
  }
  function branchOptsAll(cur){
    var brs=(S.meta&&S.meta.branches)||[];
    var html='<option value=""'+(!cur?' selected':'')+'>All Branches</option>';
    brs.forEach(function(b){
      var disabled=!b.WaTokenSet;
      html+='<option value="'+esc(b.BranchID)+'"'+(String(b.BranchID)===String(cur)?' selected':'')+(disabled?' disabled':'')+'>'+esc(b.BranchName)+(disabled?' (no WhatsApp key)':'')+'</option>';
    });
    return html;
  }
  function branchOptsPick(cur){
    var brs=(S.meta&&S.meta.branches)||[];
    var html='';
    brs.forEach(function(b){
      var disabled=!b.WaTokenSet;
      html+='<option value="'+esc(b.BranchID)+'"'+(String(b.BranchID)===String(cur)?' selected':'')+(disabled?' disabled':'')+'>'+esc(b.BranchName)+(disabled?' — no WhatsApp key':'')+'</option>';
    });
    return html;
  }
  /* 19 Sep, round 3 — templates that belong to a MEMBERSHIP CARD (every Gold / Platinum / Platinum+ /
     Diamond variant, the generic membership_card, and the Benefits template) are NEVER filled with one
     shared value or one shared picture. The server (27_Messaging.gs ▸ msgPickCard_/msgBuildPerPatient_)
     looks up each lead's OWN card by phone number and fills {{n}} and the header picture from it. */
  var PERPATIENT_PURPOSES={membership_card:1, membership_benefits:1};
  function isPerPatientTpl_(t){ return !!(t && PERPATIENT_PURPOSES[String(t.purpose||'')]); }
  function tplOpts(cur){
    if(!TPLS.length && !TPL_LOADED) return '<option value="">Loading templates…</option>';
    if(!TPLS.length) return '<option value="">'+esc(TPL_ERR ? ('Error: '+TPL_ERR) : 'No active templates found — open WhatsApp Templates, check they are "active", then reload this page')+'</option>';
    return TPLS.map(function(t){
      /* plain template names only — the box under the dropdown says what each one needs. A long
         suffix here just got the real template name cut off in the closed dropdown. */
      var flag='';
      return '<option value="'+esc(t.tplId)+'"'+(String(t.tplId)===String(cur)?' selected':'')+'>'+esc(t.name)+esc(flag)+'</option>';
    }).join('');
  }
  function tagOpts(cur, withAll){
    var tags=['Healthy','Chronic','New'];
    var html=withAll?('<option value=""'+(!cur?' selected':'')+'>All Tags</option>'):'';
    html+=tags.map(function(t){ return '<option value="'+t+'"'+(t===cur?' selected':'')+'>'+t+'</option>'; }).join('');
    return html;
  }
  function statusPill(s){
    var map={scheduled:['Scheduled','scheduled'],in_progress:['In Progress','pending'],completed:['Completed','active'],
             failed:['Failed','failed'],paused:['Paused','inactive'],draft:['Draft','inactive'],cancelled:['Cancelled','inactive']};
    var m=map[String(s)]||[String(s),'inactive'];
    return '<span class="badge '+m[1]+'">'+esc(m[0])+'</span>';
  }
  function downloadCsv(filename, rows){
    var csv=rows.map(function(r){ return r.map(function(c){ var v=String(c==null?'':c); return /[",\n]/.test(v)?('"'+v.replace(/"/g,'""')+'"'):v; }).join(','); }).join('\r\n');
    var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    var u=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=u; a.download=filename; a.click();
    setTimeout(function(){ URL.revokeObjectURL(u); },2000);
  }

  /* ============================================================ PAGE */
  function renderBulkMsg(){
    var v=$('page-bulkmsg'); if(!v) return;
    v.innerHTML=
      '<div class="page-head"><h1>Bulk Message Send</h1>'+
        '<div style="flex:1;font-size:12.5px;color:var(--grey)">Send one approved WhatsApp template to a list of leads, for one branch and tag, on a daily schedule.</div>'+
        '<button class="btn ghost" id="bm_export">Export History</button>'+
        (canManage()?'<button class="btn" id="bm_addLeads">+ Add Leads</button>':'')+
      '</div>'+
      '<div class="kpis" id="bm_kpis"></div>'+
      (canManage()?
      '<div class="card" style="padding:20px 22px;margin-bottom:22px">'+
        '<h3 style="margin:0 0 3px">Campaign Setup</h3>'+
        '<div style="font-size:12px;color:var(--muted);margin-bottom:16px">Choose who gets the message, which template, and when it should go out. Every active template is listed. Membership-card templates (Gold / Platinum / Platinum+ / Diamond and Benefits) fill themselves in for each lead from that lead\'s OWN membership card — their name, card type, card number, validity and their own card picture — looked up by phone number.</div>'+
        '<div class="grid2" id="bm_fields" style="grid-template-columns:repeat(5,1fr);gap:14px">'+
          '<div class="field"><label>Branch</label><select id="bm_branch">'+branchOptsPick('')+'</select></div>'+
          '<div class="field"><label>Template</label><select id="bm_tpl">'+tplOpts('')+'</select></div>'+
          '<div class="field"><label>Tag</label><select id="bm_tag">'+tagOpts('',true)+'</select></div>'+
          '<div class="field"><label>Send Time</label><input id="bm_time" type="time" value="02:00"></div>'+
          '<div class="field"><label>Daily Limit</label><div class="limit-badge"><span class="lb-dot"></span><span id="bm_capLabel">250 / day (WhatsBizApp cap)</span></div></div>'+
        '</div>'+
        '<div id="bm_extra"></div>'+
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:18px;padding-top:16px;border-top:1px solid var(--line);flex-wrap:wrap;gap:12px">'+
          '<div style="font-size:12.5px;color:var(--grey)" id="bm_autoNote">Scheduled for <b>02:00 AM</b> — auto-sends the next <b>250</b> leads daily until the queue is cleared.</div>'+
          '<div style="display:flex;gap:10px">'+
            '<button class="btn ghost" id="bm_saveDraft">Save as Draft</button>'+
            '<button class="btn ghost" id="bm_addLeadsBox">+ Add Leads</button>'+
            '<button class="btn" id="bm_start">Start Campaign</button>'+
          '</div>'+
        '</div>'+
      '</div>' : '')+
      '<div class="card">'+
        '<div class="toolbar" style="justify-content:space-between">'+
          '<h3 style="margin:0">Campaign History</h3>'+
          '<div class="tabs-mini" id="bm_tabs">'+
            ['all','pending','sent','scheduled'].map(function(t){ return '<div class="tab-mini'+(t==='all'?' on':'')+'" data-tab="'+t+'">'+(t==='all'?'All':t.charAt(0).toUpperCase()+t.slice(1))+'</div>'; }).join('')+
          '</div>'+
        '</div>'+
        '<div class="table-wrap"><table><thead><tr><th>Code</th><th>Template</th><th>Branch</th><th>Tag</th><th>Time</th><th>Leads</th><th>Status</th><th>Date</th><th></th></tr></thead>'+
        '<tbody id="bm_histBody"></tbody></table></div>'+
        '<div id="bm_histEmpty" class="empty hidden">No campaigns yet.</div>'+
      '</div>';

    $('bm_export').onclick=exportHistory;
    var al=$('bm_addLeads'); if(al) al.onclick=function(){ openAddLeadsPicker(); };
    var alb=$('bm_addLeadsBox'); if(alb) alb.onclick=function(){ openAddLeadsForSetup(); };
    v.querySelectorAll('#bm_tabs .tab-mini').forEach(function(t){
      t.onclick=function(){ F.tab=t.getAttribute('data-tab'); v.querySelectorAll('#bm_tabs .tab-mini').forEach(function(x){x.classList.toggle('on',x===t);}); loadHistory(); };
    });

    if(canManage()){
      /* Branch change also re-runs paintExtraFields() (19 Sep) — not just stats/note — so a box
         auto-filled from the branch's own record (e.g. "branch phone") tracks whichever branch is
         currently picked, the same way {{1}} branch name already does automatically. Anything you
         typed by hand is left alone either way — see fpAuto in autofillKnownValue_/paintExtraFields. */
      $('bm_branch').onchange=function(){ F.branchId=this.value; paintStats(); paintAutoNote(); paintExtraFields(); };
      $('bm_tpl').onchange=function(){ F.tplId=this.value; F.fixedParams=[]; F.fpAuto=[]; F.headerMediaUrl=''; paintStats(); paintExtraFields(); };
      $('bm_tag').onchange=function(){ F.tag=this.value; };
      $('bm_time').onchange=paintAutoNote;
      $('bm_saveDraft').onclick=function(){ saveCampaign('draft'); };
      $('bm_start').onclick=function(){ saveCampaign('scheduled'); };
    }

    Promise.all([ensureTemplates(), ensureCardTypes()]).then(function(){
      if(canManage()){ $('bm_tpl').innerHTML=tplOpts(''); if(TPLS.length){ F.tplId=TPLS[0].tplId; $('bm_tpl').value=F.tplId; } paintExtraFields(); }
      paintStats();
    });
    loadHistory();
  }

  function loadTemplatesOnce_(){
    return API.msgListTemplates().then(function(r){
      TPL_LOADED=true;
      if(r && r.ok){ TPLS=r.templates||[]; TPLMAP={}; TPLS.forEach(function(t){ TPLMAP[t.tplId]=t; }); TPL_ERR=''; }
      else { TPLS=[]; TPLMAP={}; TPL_ERR = (r && r.error) || 'Request failed.'; }
      return r;
    }).catch(function(e){ TPL_LOADED=true; TPLS=[]; TPLMAP={}; TPL_ERR = 'Could not reach the server (' + (e && e.message ? e.message : 'network error') + ').'; });
  }
  /* 19 Sep, round 3 — an EMPTY or failed answer is tried once more before the dropdown gives up.
     api.js serves plain reads cache-first and falls back to whatever it last saved when the network
     call is slow (Apps Script cold start), so one slow first call could leave the dropdown reading
     "Error: No templates are…" even though the WhatsApp Templates page lists a dozen active ones. */
  function ensureTemplates(){
    return loadTemplatesOnce_().then(function(){
      if(TPLS.length) return TPLS;
      return new Promise(function(res){ setTimeout(res,1500); }).then(loadTemplatesOnce_).then(function(){ return TPLS; });
    });
  }
  /* Same list Membership Cards' "Card Types" screen and WhatsApp Templates' "Card type" dropdown
     already use (API.listCardTypes) — reused here purely to turn a template's own cardTypeId into
     a readable name (Gold/Platinum/Diamond…) for autofillKnownValue_ below. Never blocks the page:
     a failure just means Card Type won't self-fill, same as before this change. */
  function ensureCardTypes(){
    return API.listCardTypes().then(function(r){
      if(r&&r.ok){ CARDTYPES=r.types||[]; CARDTYPEMAP={}; CARDTYPES.forEach(function(t){ CARDTYPEMAP[t.typeId]=t; }); }
      return CARDTYPES;
    }).catch(function(){ return CARDTYPES; });
  }

  /* 18 Sep correction — brought back per your request: your Gold/Platinum/Diamond card
     templates (and others like them) need more than {{1}} branch name / {{2}} lead name, so
     this box collects exactly what's missing, filled in ONCE per campaign (same value/image for
     every lead) rather than blocking Start Campaign outright. Reuses the same headerType/
     paramCount/paramHints fields WhatsApp Templates already stores, and the same API.upload()
     file uploader Branches/Employee Docs already use. */
  function headerLabelMsg_(ht){ var m={image:'🖼 Image',document:'📄 Document',video:'🎬 Video'}; return m[ht]||'Media'; }
  /* 19 Sep — self-fill whatever this box CAN safely know already, instead of asking you to retype
     it every campaign:
       • "…card type…" in the hint  → the name of the card type this template is registered to on
         WhatsApp Templates ▸ Edit template (tpl.cardTypeId, e.g. a "nakoda_platinum_card" template
         set to card type Platinum autofills "Platinum" the moment you pick that template — no
         separate "click Platinum" control needed, the template itself IS the card-type choice).
       • "…branch phone/contact/mobile…" in the hint → the selected Branch's own Mobile/Phone from
         the Branches page, and it re-syncs whenever you change Branch above.
     Deliberately NOT autofilled: a card NUMBER, or a card's own VALID TILL date — those are unique
     to one patient's one card, and this box holds ONE value sent to every lead in the whole
     campaign, so a real per-card number/date can only ever be right for one recipient. If a
     template needs those to be correct per person, this page is the wrong tool for it — use
     Membership Cards ▸ open the card ▸ "🚀 Send via Official API" (or the bulk Send Cards button),
     which already reads each patient's own card record automatically. Returns '' when nothing
     applies, in which case the box is left exactly as blank/typed as before. */
  function autofillKnownValue_(hint, tpl, branchId){
    var h=String(hint||'').toLowerCase();
    if(/card\s*type/.test(h)){
      var ct = tpl && tpl.cardTypeId ? CARDTYPEMAP[tpl.cardTypeId] : null;
      return ct ? String(ct.name||'') : '';
    }
    if(/(branch)?\s*(phone|contact|mobile)/.test(h)){
      var br = branchId ? ((S.meta&&S.meta.branches)||[]).filter(function(b){ return String(b.BranchID)===String(branchId); })[0] : null;
      return br ? String(br.Mobile||br.Phone||'') : '';
    }
    return '';
  }
  function paintExtraFields(){
    var box=$('bm_extra'); if(!box) return;
    var t=TPLMAP[F.tplId];
    if(!t){ box.innerHTML=''; return; }
    /* 19 Sep, round 3 — membership-card templates (every Gold/Platinum/Platinum+/Diamond variant, the
       generic membership_card, and Benefits) need NOTHING filled in here: every {{n}} AND the header
       picture are resolved per recipient, from THEIR OWN membership card, at send time
       (msgPickCard_/msgBuildPerPatient_ in 27_Messaging.gs). Showing the usual "one file for everyone" /
       "same value for every lead" boxes for one of these would be actively wrong — that is exactly
       what once sent TANDEL HETHVEE a message reading "Namaste SOUTHBOPAL / your TANDEL HETHVEE card"
       with SHIVENDRA CHAUDHARI's picture. So this box just shows what goes where, and stops there. */
    if(isPerPatientTpl_(t)){
      var isBen=String(t.purpose||'')==='membership_benefits';
      var ct=t.cardTypeId?(CARDTYPEMAP[t.cardTypeId]?CARDTYPEMAP[t.cardTypeId].name:t.cardTypeId):'';
      var n0=Math.max(0,Number(t.paramCount)||0);
      var map=isBen?['member name','card type','branch phone']:['branch name','member name','card number','card type','valid till','branch contact'];
      if(isBen && n0>=4) map=['member name','card type','card type','branch phone'];
      var mapTxt=map.slice(0,n0||map.length).map(function(m,i){ return '{{'+(i+1)+'}} '+m; }).join(' · ');
      box.innerHTML='<div style="border-top:1px solid var(--line);margin-top:16px;padding-top:14px">'+
        '<div style="background:#eaf6ec;border:1px solid #b7e0bd;border-radius:9px;padding:10px 13px;font-size:11.5px;color:#1a7f37;font-weight:600;line-height:1.55">'+
          '✓ Membership card template — nothing to fill in here. Each lead gets THEIR OWN values and THEIR OWN card picture, looked up from their membership card by phone number:<br>'+
          '<span style="font-weight:700">'+esc(mapTxt)+(t.headerType&&t.headerType!=='none'?' · header: their own card picture':'')+'</span><br>'+
          (ct&&!isBen?'This template is for <b>'+esc(ct)+'</b> cards only — a lead holding a different card type is skipped and shown as failed (with the reason), so nobody gets the wrong card design. ':'')+
          'A lead with no live card on file, or whose card picture has not been generated yet (send it once from Membership Cards ▸ Send Cards), is skipped and reported as failed in Patient Delivery — never sent a wrong or blank card.'+
        '</div>'+
      '</div>';
      return;
    }
    var n=Math.max(0,Number(t.paramCount)||0), extraCount=Math.max(0,n-2);
    var ht=String(t.headerType||'none'), needsMedia=['image','document','video'].indexOf(ht)>=0;
    if(!extraCount && !needsMedia){ box.innerHTML=''; return; }
    var hints=String(t.paramHints||'').split('\n');
    function hintFor(i){ var h=String(hints[i]||'').replace(/^\s*\d+\s*[=:-]\s*/,'').trim(); return h||('Value for {{'+(i+1)+'}}'); }
    var branchId = F.branchId || ($('bm_branch')?$('bm_branch').value:'');
    /* 19 Sep — this used to be a small 10.5px footer line at the bottom of the whole box (easy to
       miss), which is exactly how one patient's own card picture ended up uploaded here and sent
       to a whole list of OTHER patients instead — see MSG_EXCLUDED_TPL_PURPOSES_ in
       27_Messaging.gs for the fix that keeps genuine card templates out of this page entirely.
       This banner is the remaining safety net for any OTHER template that still carries an image/
       document/video header (e.g. a generic promotional flyer) — now impossible to miss right
       above the upload box itself, not buried in a caption underneath it. */
    var mediaWarn = needsMedia ?
      '<div style="background:#fff3d6;border:1px solid #e8c667;border-radius:9px;padding:9px 12px;font-size:11.5px;color:#7a5b00;font-weight:600;margin-bottom:10px">'+
        '⚠ This file sends to EVERY lead in this campaign — the exact same one, for everyone. It is NOT looked up per patient. If you need each patient to receive their OWN picture (a membership card, for example), this is the wrong page — use Membership Cards ▸ Send Cards / Benefits instead.'+
      '</div>' : '';
    var mediaHtml = needsMedia ?
      mediaWarn+
      '<div class="field full" style="margin-bottom:12px"><label>'+headerLabelMsg_(ht)+' for this campaign *</label>'+
        '<div style="display:flex;gap:10px;align-items:center">'+
          '<input type="file" id="bm_hdrFile" accept="'+(ht==='image'?'image/*':(ht==='video'?'video/*':'*/*'))+'" style="flex:1;border:1px solid var(--line);border-radius:9px;padding:8px 10px;font-size:12.5px">'+
          '<span id="bm_hdrStatus" style="font-size:11.5px;color:'+(F.headerMediaUrl?'#1a7f37':'var(--muted)')+';font-weight:'+(F.headerMediaUrl?'700':'400')+';white-space:nowrap">'+(F.headerMediaUrl?'Uploaded ✓':'One file, used for every message — see the warning above')+'</span>'+
        '</div></div>' : '';
    var paramsHtml='', anyAuto=false;
    for(var i=2;i<n;i++){
      var idx=i-2, hint=hintFor(i);
      /* Keep following Branch/Template as long as you haven't typed into this box yourself
         (fpAuto[idx]!==false) — see the fpAuto comment on F above. */
      if(F.fpAuto[idx]!==false){
        var auto=autofillKnownValue_(hint, t, branchId);
        if(auto){ F.fixedParams[idx]=auto; F.fpAuto[idx]=true; }
      }
      var isAuto = F.fpAuto[idx]===true && F.fixedParams[idx]; if(isAuto) anyAuto=true;
      paramsHtml+='<div class="field"><label>{{'+(i+1)+'}} '+esc(hint)+' *'+(isAuto?' <span style="color:#1a7f37;font-weight:700;font-size:10px;text-transform:none">— auto-filled ✓</span>':'')+'</label>'+
        '<input class="bm_fp" data-i="'+idx+'" value="'+esc(F.fixedParams[idx]||'')+'" placeholder="Same for every lead in this campaign"></div>';
    }
    box.innerHTML='<div style="border-top:1px solid var(--line);margin-top:16px;padding-top:14px">'+
      '<div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px">This template needs a bit more — filled in once, used for every lead in this campaign</div>'+
      mediaHtml+
      (paramsHtml?('<div class="grid2" style="grid-template-columns:repeat(3,1fr);gap:12px">'+paramsHtml+'</div>'):'')+
      '<div style="font-size:10.5px;color:#9aa0a6;margin-top:8px">Labels come from the "Variable hints" set for this template on WhatsApp Templates. Pick a different template and these boxes change to match.'+
      (anyAuto?' Boxes marked <b style="color:#1a7f37">auto-filled</b> came from this template\'s Card Type (WhatsApp Templates) or the selected Branch\'s phone — edit them if this campaign needs something different, and your edit sticks.':'')+
      (needsMedia?' The image/document/video above is the ONE file sent to every lead — for a genuinely per-patient card image, use Membership Cards ▸ Send via Official API instead.':'')+
      '</div>'+
    '</div>';
    if(needsMedia){
      $('bm_hdrFile').onchange=function(){
        var f=this.files&&this.files[0]; if(!f) return;
        var st=$('bm_hdrStatus'); st.style.color='var(--muted)'; st.style.fontWeight='400'; st.textContent='Uploading…';
        API.upload(f,'MsgCampaigns',function(m){ st.textContent=m; }).then(function(r){
          F.headerMediaUrl=r.url; st.style.color='#1a7f37'; st.style.fontWeight='700'; st.innerHTML='Uploaded ✓ <a href="'+esc(r.url)+'" target="_blank">view</a>';
        }, function(e){ F.headerMediaUrl=''; st.textContent=(e&&e.message)||'Upload failed — try again.'; });
      };
    }
    box.querySelectorAll('.bm_fp').forEach(function(inp){
      /* Once you type here yourself, this box stops following Branch/Template changes — your
         value wins from now on for the rest of this campaign setup (see fpAuto on F above). */
      inp.oninput=function(){ var idx=Number(this.getAttribute('data-i')); F.fixedParams[idx]=this.value; F.fpAuto[idx]=false; };
    });
  }
  /* True when this template needs anything beyond {{1}} branch name / {{2}} lead name — decides
     whether paintExtraFields() shows its box, and whether saveCampaign()/openAddLeadsForSetup()
     need to validate those extra values before allowing Save/Start/Add Leads. */
  function tplNeedsMoreThanBasics_(t){
    if(!t) return false;
    /* membership_card / membership_benefits: every value AND the header image come from the
       recipient's own card at send time — nothing for a human to fill in once for the whole campaign,
       so these are "basic enough" for both Bulk Message Send and Timely Message despite having an
       image header and >2 params. See paintExtraFields() above and msgBuildPerPatient_ in 27_Messaging.gs. */
    if(isPerPatientTpl_(t)) return false;
    var extraCount=Math.max(0,(Number(t.paramCount)||0)-2);
    var needsMedia=['image','document','video'].indexOf(String(t.headerType))>=0;
    return !!(extraCount || needsMedia);
  }
  /* Checks the CURRENT Campaign Setup box's extra fields are actually filled in for template t —
     returns an error string, or '' when everything needed is present. */
  function extraFieldsMissing_(t){
    if(!t) return '';
    if(isPerPatientTpl_(t)) return '';   /* nothing to validate here — resolved per recipient server-side */
    var ht=String(t.headerType||'none');
    if(['image','document','video'].indexOf(ht)>=0 && !F.headerMediaUrl) return 'Upload the '+headerLabelMsg_(ht).replace(/^[^ ]+ /,'')+' for this campaign first.';
    var n=Math.max(0,Number(t.paramCount)||0);
    for(var i=2;i<n;i++){ if(!String(F.fixedParams[i-2]||'').trim()) return 'Fill in all the template\'s variables before continuing.'; }
    return '';
  }

  function paintAutoNote(){
    var t=$('bm_time'); var note=$('bm_autoNote'); if(!t||!note) return;
    note.innerHTML='Scheduled for <b>'+esc(fmtTime12(t.value||'02:00'))+'</b> — auto-sends the next <b>250</b> leads daily until the queue is cleared.';
  }

  /* 18 Sep — used to bail out to an empty box (box.innerHTML='') whenever no template was chosen
     yet in Campaign Setup, which meant a brand-new page load — or a branch with "No active
     templates" to even pick from — showed NOTHING here, not even the real leads already sitting
     in the queue from campaigns you'd started earlier. Now this always calls the stats endpoint;
     with no template picked it comes back with everything rolled up (see apiMsgCampaignStats in
     27_Messaging.gs), so the tiles show your real totals from the moment the page opens, and
     narrow down to just one template the moment you pick one in the form below. */
  function paintStats(){
    var box=$('bm_kpis'); if(!box) return;
    box.innerHTML='<div class="kpi"><div class="n">…</div><div class="l">Loading</div></div>';
    API.msgCampaignStats(F.branchId, F.tplId).then(function(r){
      if(!r.ok){ box.innerHTML=''; return; }
      var pct=r.capTotal?Math.min(100,Math.round(r.capUsed/r.capTotal*100)):0;
      var deg=Math.round(pct*3.6);
      var tplCaption = F.tplId ? ('For <b>'+esc(r.templateName||'')+'</b> template') : (r.templateName ? ('For <b>'+esc(r.templateName)+'</b> template') : 'Across all templates');
      box.innerHTML=
        '<div class="kpi"><div class="l">LEADS IN QUEUE</div><div class="n">'+money0(r.leadsInQueue)+'</div><div style="font-size:11.5px;color:var(--grey);margin-top:4px">'+tplCaption+'</div></div>'+
        '<div class="kpi"><div class="l">SENT TODAY</div><div class="n" style="color:var(--ok)">'+money0(r.sentToday)+'</div><div style="font-size:11.5px;color:var(--grey);margin-top:4px">'+(r.lastBatchAt?('batch closed '+esc(r.lastBatchAt)):'no batch yet today')+'</div></div>'+
        '<div class="kpi"><div class="l">PENDING IN QUEUE</div><div class="n" style="color:#c98500">'+money0(r.pending)+'</div><div style="font-size:11.5px;color:var(--grey);margin-top:4px">'+(r.daysToClear?('~'+r.daysToClear+' day'+(r.daysToClear===1?'':'s')+' to clear at 250/day'):'queue clear')+'</div></div>'+
        '<div class="kpi"><div class="l">TODAY\'S DAILY LIMIT</div>'+
          '<div class="meter-wrap" style="margin-top:6px"><div class="meter-ring" style="background:conic-gradient(var(--red) 0deg '+deg+'deg, var(--line) '+deg+'deg 360deg)"><div class="hole">'+money0(r.capUsed)+'/'+money0(r.capTotal)+'</div></div>'+
          '<div class="meter-note"><b>'+pct+'% used</b><br>cap resets 12:00 AM</div></div></div>';
      $('bm_capLabel') && ($('bm_capLabel').textContent=(r.capTotal||250)+' / day (WhatsBizApp cap)');
    });
  }

  function saveCampaign(status){
    var t=TPLMAP[F.tplId];
    if(!t){ toast('Pick a template first.',true); return; }
    var branchId=$('bm_branch').value;
    if(!branchId){ toast('Pick a branch — "All Branches" is for browsing history, not for starting a campaign.',true); return; }
    /* Templates needing more than {{1}} branch name / {{2}} lead name (an image header, extra
       {{3}}..{{n}} values — e.g. a Gold/Platinum/Diamond card variant) are supported via the
       "needs a bit more" box painted by paintExtraFields(); just make sure it's actually filled
       in before sending, instead of silently sending a broken message. */
    var missing=extraFieldsMissing_(t);
    if(missing){ toast(missing,true); return; }
    var extraCount=Math.max(0,(Number(t.paramCount)||0)-2);
    var fixedParams=F.fixedParams.slice(0,extraCount);
    var headerMediaUrl=F.headerMediaUrl||'';

    var tag=$('bm_tag').value||'', sendTime=$('bm_time').value||'02:00';
    var data={ branchId:branchId, tplId:F.tplId, tag:tag, sendTime:sendTime,
               fixedParams:fixedParams, headerMediaUrl:headerMediaUrl, status:status };
    var btn=status==='scheduled'?$('bm_start'):$('bm_saveDraft'); btn.disabled=true;
    API.msgSaveCampaign(data).then(function(r){
      btn.disabled=false;
      if(!r.ok){ toast(r.error,true); return; }
      toast(status==='scheduled'?'Campaign started.':'Saved as draft.');
      rememberSetupCampaign_(r.campaignId, branchId, t, tag);
      loadHistory();
    }).catch(function(){ btn.disabled=false; toast('Saving a campaign needs an internet connection.',true); });
  }

  /* Keeps the "+ Add Leads" button in the Campaign Setup box (and Save as Draft / Start Campaign
     above it) pointed at the SAME campaign for as long as Branch/Template/Tag/Send Time in the
     box haven't changed — so tapping any of the three more than once never creates a second,
     duplicate campaign for one setup. Mirrors CAMPS_T.push in saveTimelyCampaign below, which
     solves the exact same "just-created, not yet back from loadHistory()" problem. */
  function rememberSetupCampaign_(campaignId, branchId, tpl, tag){
    var br=((S.meta&&S.meta.branches)||[]).filter(function(b){ return String(b.BranchID)===String(branchId); })[0];
    CAMPS = CAMPS.filter(function(x){ return x.campaignId!==campaignId; });
    CAMPS.push({campaignId:campaignId, templateName:tpl.name, branchName:br?br.BranchName:branchId, tag:tag});
    F.lastCampaignId = campaignId;
    F.lastKey = branchId+'|'+tpl.tplId+'|'+tag+'|'+$('bm_time').value;
  }

  /* ============================================================ ADD LEADS — from the Campaign
     Setup box itself. One tap: no "which campaign?" picker, no need to Save/Start first. It
     silently saves (or reuses) a draft campaign for exactly what's configured above — Branch,
     Template, Tag, Send Time — then opens the same upload pop-up openAddLeadsModal already uses
     from Campaign History's own "+ Leads" button. The campaign stays a draft (so nothing sends
     yet) unless "Start Campaign" is pressed — same rule as adding leads to any draft today.
     The upload pop-up itself already chunks and retries (see openAddLeadsModal/parseCsv below),
     so a file of 20,000+ contacts is not a special case here — it is just a bigger version of the
     same upload every campaign already accepts. */
  function openAddLeadsForSetup(){
    var t=TPLMAP[F.tplId];
    if(!t){ toast('Pick a template first.',true); return; }
    var branchId=$('bm_branch').value;
    if(!branchId){ toast('Pick a branch first.',true); return; }
    var missing=extraFieldsMissing_(t);
    if(missing){ toast(missing,true); return; }
    var extraCount=Math.max(0,(Number(t.paramCount)||0)-2);
    var fixedParams=F.fixedParams.slice(0,extraCount);
    var headerMediaUrl=F.headerMediaUrl||'';
    var tag=$('bm_tag').value||'', sendTime=$('bm_time').value||'02:00';
    var key=branchId+'|'+F.tplId+'|'+tag+'|'+sendTime;
    if(F.lastCampaignId && F.lastKey===key){
      openAddLeadsModal(F.lastCampaignId, loadHistory);
      return;
    }
    var btn=$('bm_addLeadsBox'); var was=btn.textContent; btn.disabled=true; btn.innerHTML='<span class="loader"></span> Preparing…';
    var data={ branchId:branchId, tplId:F.tplId, tag:tag, sendTime:sendTime, fixedParams:fixedParams, headerMediaUrl:headerMediaUrl, status:'draft' };
    API.msgSaveCampaign(data).then(function(r){
      btn.disabled=false; btn.textContent=was;
      if(!r.ok){ toast(r.error,true); return; }
      rememberSetupCampaign_(r.campaignId, branchId, t, tag);
      loadHistory();
      openAddLeadsModal(r.campaignId, loadHistory);
    }).catch(function(){ btn.disabled=false; btn.textContent=was; toast('Needs an internet connection.',true); });
  }

  /* ============================================================ HISTORY
     Campaign History table is back (18 Sep correction — only the 5 seeded sample rows were meant
     to go, not the table itself). loadHistory() keeps CAMPS populated for the table, Export
     History, the "+ Add Leads" header button's campaign picker, the "+ Add Leads" box button
     above, and the admin "Delete sample data" button (maybeShowDeleteSample). */
  function loadHistory(){
    var body=$('bm_histBody'); if(!body) return;
    API.msgListCampaigns({branchId:'', tplId:'', status:F.tab}).then(function(r){
      if(!r.ok){ toast(r.error||'Could not load campaign history.',true); return; }
      CAMPS=r.campaigns||[];
      paintHistory();
      maybeShowDeleteSample();
    }).catch(function(){ toast('Campaign history needs an internet connection.',true); });
  }
  function paintHistory(){
    var body=$('bm_histBody'); if(!body) return;
    $('bm_histEmpty').classList.toggle('hidden', CAMPS.length>0);
    body.innerHTML=CAMPS.map(function(c){
      var ac=rowAccent(c.campaignId);
      var total=Number(c.total)||0, sent=Number(c.sent)||0, failed=Number(c.failed)||0;
      var pct=total?Math.round((sent+failed)/total*100):0;
      var leadsLine = failed && !sent ? (failed+' failed') : (money0(sent)+' / '+money0(total));
      return '<tr style="--row-accent:'+ac.col+';background:linear-gradient(115deg,'+ac.bg+' 0%,#ffffff 62%)">'+
        '<td><b>'+esc(c.code)+'</b></td>'+
        '<td><span class="rowavatar" style="background:'+ac.bg+';color:'+ac.col+'">'+esc(rowInitials(c.templateName))+'</span>'+esc(c.templateName)+'</td>'+
        '<td>'+esc(c.branchName||'—')+'</td>'+
        '<td>'+(c.tag?'<span class="pill">'+esc(c.tag)+'</span>':'<span class="pill">All Tags</span>')+'</td>'+
        '<td>'+esc(fmtTime12(c.sendTime))+'</td>'+
        '<td>'+esc(leadsLine)+'<br><div class="progress-mini"><div style="width:'+pct+'%;'+(failed&&!sent?'background:#d03b3b':'')+'"></div></div></td>'+
        '<td>'+statusPill(c.status)+nextBatchNote_(c)+'</td>'+
        '<td>'+esc(fmtDateShort(c.createdAt))+'</td>'+
        '<td style="white-space:nowrap">'+
          '<button class="btn ghost sm" data-view="'+esc(c.campaignId)+'">View</button>'+
          (canManage()?actionButtons(c):'')+
        '</td></tr>';
    }).join('');
    body.querySelectorAll('[data-view]').forEach(function(b){ b.onclick=function(){ openPatientDelivery(b.getAttribute('data-view')); }; });
    body.querySelectorAll('[data-addleads]').forEach(function(b){ b.onclick=function(){ openAddLeadsModal(b.getAttribute('data-addleads')); }; });
    body.querySelectorAll('[data-setstatus]').forEach(function(b){
      b.onclick=function(){
        var id=b.getAttribute('data-setstatus'), st=b.getAttribute('data-tostatus');
        API.msgSetCampaignStatus(id, st).then(function(r){ if(!r.ok){ toast(r.error,true); return; } toast('Updated.'); loadHistory(); });
      };
    });
    /* 19 Sep — "Cancel" hard-deletes now (see deleteCampaign_ below), not a status change, so it
       gets its own attribute/handler instead of joining the data-setstatus wiring above. */
    body.querySelectorAll('[data-delete]').forEach(function(b){
      b.onclick=function(){ deleteCampaign_(b.getAttribute('data-delete'), b.getAttribute('data-code')); };
    });
    wireTimeButtons_(body, loadHistory);
  }
  function actionButtons(c){
    var s=String(c.status);
    var html=' <button class="btn ghost sm" data-addleads="'+esc(c.campaignId)+'">+ Leads</button>';
    /* 21 Sep, round 5 — move the daily send time (see openTimeModal_). Only while there is still something
       to send: a completed / cancelled campaign has no next batch, and the server refuses it anyway. */
    if(['scheduled','in_progress','paused','draft'].indexOf(s)>=0) html+=' <button class="btn ghost sm" data-settime="'+esc(c.campaignId)+'" data-code="'+esc(c.code)+'" data-time="'+esc(toHM_(c.sendTime))+'">&#9200; Change time</button>';
    if(s==='scheduled'||s==='in_progress') html+=' <button class="btn ghost sm" data-setstatus="'+esc(c.campaignId)+'" data-tostatus="paused">Pause</button>';
    if(s==='paused'||s==='draft') html+=' <button class="btn ghost sm" data-setstatus="'+esc(c.campaignId)+'" data-tostatus="scheduled">'+(s==='draft'?'Start':'Resume')+'</button>';
    if(['scheduled','in_progress','paused','draft'].indexOf(s)>=0) html+=' <button class="btn ghost sm danger" data-delete="'+esc(c.campaignId)+'" data-code="'+esc(c.code)+'">Cancel</button>';
    /* 18 Sep — rows that were cancelled by the OLD status-only flow (before the hard-delete backend
       went live) are stuck showing "Cancelled" forever with no way to clear them, since only the
       statuses above got a delete button. Give already-cancelled rows their own "Delete" button so
       that leftover/legacy Cancelled entries can be wiped too — same handler, same confirm, same
       hard delete. Once the new backend is live, a fresh Cancel click removes the row immediately,
       so this branch only matters for cleaning up rows created before that point. */
    /* 19 Sep, round 4 — a 'completed' (or 'failed') row had NO button at all, so a campaign that
       showed "Completed" while thousands of leads were still pending (see apiMsgAddRecipients in
       27_Messaging.gs) could not be removed. It gets the same Delete button now. */
    else if(s==='cancelled'||s==='completed'||s==='failed') html+=' <button class="btn ghost sm danger" data-delete="'+esc(c.campaignId)+'" data-code="'+esc(c.code)+'">Delete</button>';
    return html;
  }
  /* 19 Sep — Cancel now means what it says nowhere near loosely: it hard-deletes the campaign row
     AND every one of its recipient rows server-side (apiMsgDeleteCampaign in 27_Messaging.gs) —
     permanently, not a soft "cancelled" status you could Resume from any more. One confirm() before
     it fires, same as Delete on WhatsApp Templates. After a successful delete: drop it from CAMPS
     so the table updates immediately without waiting on a reload, and re-run paintStats() — Leads
     in Queue / Sent Today / Pending in Queue / Today's Daily Limit are all computed fresh from the
     server on every paintStats() call, so this is all it takes for them to stop counting the
     deleted campaign's leads. */
  function deleteCampaign_(campaignId, code){
    /* 19 Sep, round 4 — say what is about to be lost. Sent / not-yet-sent come from the row already
       on screen (CAMPS = Bulk Message Send, CAMPS_T = Timely Message). */
    var row=null; (CAMPS||[]).concat(CAMPS_T||[]).some(function(x){ if(x.campaignId===campaignId){ row=x; return true; } return false; });
    var counts='';
    if(row){
      var rs=Number(row.sent)||0, rf=Number(row.failed)||0, rt=Number(row.total)||0, left=Math.max(0, rt-rs-rf);
      counts='Already sent: '+rs+(rf?('   ·   Failed: '+rf):'')+'\nNot sent yet: '+left+(left?'  (these will NEVER be sent)':'')+'\n\n';
    }
    if(!confirm('Delete campaign '+(code||'')+' for good?\n\n'+counts+'This removes it AND every lead on it from the database. It cannot be undone.')) return;
    API.msgDeleteCampaign(campaignId).then(function(r){
      if(!r.ok){ toast(r.error,true); return; }
      toast('Campaign deleted'+(r.removedRecipients?(' — '+r.removedRecipients+' lead'+(r.removedRecipients===1?'':'s')+' removed with it'):'')+'.');
      /* campaignId-scoped, not kind-scoped — a campaign only ever lives in one of CAMPS/CAMPS_T,
         so it's safe (and simplest) to just filter both and refresh both tabs' tables/tiles;
         each paint/stats call below already no-ops if its own tab isn't the one on screen. */
      CAMPS = CAMPS.filter(function(x){ return x.campaignId!==campaignId; });
      CAMPS_T = CAMPS_T.filter(function(x){ return x.campaignId!==campaignId; });
      if(F.lastCampaignId===campaignId){ F.lastCampaignId=''; F.lastKey=''; }
      if(FT.lastCampaignId===campaignId){ FT.lastCampaignId=''; FT.lastKey=''; }
      paintHistory();
      paintStats();
      maybeShowDeleteSample();
      paintHistoryT();
      paintStatsT();
    }).catch(function(){ toast('Deleting needs an internet connection.',true); });
  }

  /* ------------------------------------------------------------------------------------------
     21 Sep, round 5 — "why is it still Pending?" answered on the page.
     Bulk Message Send is a DAILY DRIP: it sends only after the campaign's send time each day and
     never more than the branch's daily limit (250), shared with membership-card sends. A 999-lead
     campaign set for 6 PM therefore goes out over ~4 evenings and looks stuck in between. It is not
     stuck and it has nothing to do with anyone's laptop — the sending runs on Google's servers every
     15 minutes. The server works out what happens next (msgNextBatch_ in 27_Messaging.gs); these
     two helpers just say it in words. "Change time" moves the daily send time.
     ------------------------------------------------------------------------------------------ */
  function nextWhenText_(c){
    var t=fmtTime12(toHM_(c.sendTime));
    return c.nextWhen==='today' ? 'today '+t
         : c.nextWhen==='soon' ? 'within 15 minutes'
         : c.nextWhen==='tomorrow' ? 'tomorrow '+t
         : c.nextWhen==='date' ? fmtDateShort(c.nextDate)+' '+t : '';
  }
  function daysText_(c){
    var d=Number(c.daysLeft)||0;
    return d>=2 ? 'about '+d+' more days' : (d===1 ? 'finishes in this batch' : '');
  }
  function nextBatchNote_(c){
    var left=Number(c.pendingLeft)||0; if(!left||!c.nextWhen) return '';
    var dt=daysText_(c);
    return '<div class="bm_next" style="font-size:11px;color:#1c3f77;line-height:1.4;margin-top:5px"><b>Next batch: '+esc(nextWhenText_(c))+'</b><br>'+
      money0(left)+' waiting'+(dt?' · '+esc(dt):'')+'<br>('+money0(c.capPerDay||250)+' per day limit)</div>';
  }
  /* c.sendTime is normally "HH:MM"; if a spreadsheet ever handed back a full date-time, keep just the clock part */
  function toHM_(v){
    var m=/(\d{1,2}):(\d{2})/.exec(String(v||'')); if(!m) return '02:00';
    return ('0'+m[1]).slice(-2)+':'+m[2];
  }
  function wireTimeButtons_(body, reload){
    body.querySelectorAll('[data-settime]').forEach(function(b){
      b.onclick=function(){ openTimeModal_(b.getAttribute('data-settime'), b.getAttribute('data-code'), b.getAttribute('data-time'), reload); };
    });
  }
  function openTimeModal_(campaignId, code, cur, reload){
    openModal('Change send time — '+(code||''),
      '<div class="field"><label>Send time (every day)</label><input type="time" id="ct_time" value="'+esc(cur||'02:00')+'" style="max-width:200px"></div>'+
      '<div style="font-size:12px;color:var(--muted);line-height:1.5;margin-top:8px">Waiting leads go out from this time each day — on the next 15-minute check after it — up to the branch\'s daily limit. Leads already sent are not affected.</div>',
      '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="ct_go">Save</button>');
    $('ct_go').onclick=function(){
      var v=($('ct_time')&&$('ct_time').value)||''; if(!/^\d{2}:\d{2}$/.test(v)){ toast('Pick a time first.',true); return; }
      var b=$('ct_go'); b.disabled=true;
      API.msgSaveCampaign({campaignId:campaignId, sendTimeOnly:true, sendTime:v}).then(function(r){
        if(!r.ok){ toast(r.error||'Could not change the time.',true); b.disabled=false; return; }
        closeModal(); toast('Send time changed to '+fmtTime12(v)+'.'); reload();
      }).catch(function(){ toast('Changing the time needs an internet connection.',true); b.disabled=false; });
    };
  }

  function exportHistory(){
    if(!CAMPS.length){ toast('Nothing to export yet.',true); return; }
    var rows=[['Code','Template','Branch','Tag','Send Time','Sent','Total','Status','Date']];
    CAMPS.forEach(function(c){ rows.push([c.code,c.templateName,c.branchName,c.tag||'All Tags',c.sendTime,c.sent,c.total,c.status,fmtDateShort(c.createdAt)]); });
    downloadCsv('bulk-message-history.csv', rows);
  }

  /* Admin-only, and only shown once — reachable right next to "Campaign History" (not tucked in
     the page header any more) whenever any of the 5 seeded demo rows (TMP_GOLD/TMP_HLTH/TMP_SLVR/
     TMP_DIWALI/TMP_FREE) are still present, so they're easy to find and wipe in one click. Kept
     out of the main button row so it can't be tapped by accident once real leads have gone in. */
  function maybeShowDeleteSample(){
    if(!(S.perms&&S.perms.canManageAll)) return;
    if(!CAMPS.some(function(c){ return c.isSample; })) return;
    var bar=document.querySelector('#page-bulkmsg .toolbar'); if(!bar || $('bm_delSample')) return;
    var b=document.createElement('button'); b.className='btn ghost sm'; b.id='bm_delSample'; b.textContent='Delete sample data';
    b.style.borderColor='#a12525'; b.style.color='#a12525'; b.style.marginLeft='10px';
    b.onclick=function(){
      b.disabled=true; b.innerHTML='<span class="loader"></span>';
      API.msgDeleteSampleData().then(function(r){
        if(!r.ok){ toast(r.error,true); b.disabled=false; b.textContent='Delete sample data'; return; }
        toast('Removed '+r.removedCampaigns+' sample campaign'+(r.removedCampaigns===1?'':'s')+'.');
        b.remove(); loadHistory();
      });
    };
    var h3=bar.querySelector('h3'); if(h3 && h3.nextSibling) bar.insertBefore(b, h3.nextSibling); else bar.insertBefore(b, bar.firstChild.nextSibling);
  }

  /* ============================================================ ADD LEADS */
  function openAddLeadsPicker(){
    if(!CAMPS.length){ toast('Start (or save a draft of) a campaign first, then add leads to it.',true); return; }
    var opts=CAMPS.map(function(c){ return '<option value="'+esc(c.campaignId)+'">'+esc(c.code)+' — '+esc(c.templateName)+' · '+esc(c.branchName)+'</option>'; }).join('');
    openModal('Add Leads', '<div class="field"><label>Which campaign?</label><select id="alp_camp">'+opts+'</select></div>',
      '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="alp_go">Next</button>');
    $('alp_go').onclick=function(){ var id=$('alp_camp').value; closeModal(); openAddLeadsModal(id); };
  }
  /* ---- 21 Sep — Gold / Platinum 7 card templates ONLY (server: 28_CardImport.gs) ----
     These two templates are sent from each person's OWN membership card, so a person in the Excel
     with no card used to fail with "No membership card found". For these two the pop-up now makes
     the missing cards first (they appear on the Membership Cards page like any other card), draws
     and uploads each card picture, and only THEN adds the people to the campaign — so the 15-minute
     scheduler can never reach a lead whose picture is not ready. Every other template is untouched. */
  var CARD_TPLS_={'nakoda_gold_card':1,'nakoda_platinum_card_7':1};
  function isCardTplCamp_(c){ return !!(c && CARD_TPLS_[String(c.templateName||'').trim().toLowerCase()]); }
  function chunk_(arr,n){ var out=[]; for(var i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n)); return out; }

  function openAddLeadsModal(campaignId, doneCb){
    var c=findCamp_(campaignId);
    if(!c){ toast('Campaign not found — reload the page.',true); return; }
    var cardMode=isCardTplCamp_(c);
    var cardKind=/gold/i.test(c.templateName)?'Gold':'Platinum';
    var body=
      '<p style="font-size:12px;color:var(--muted);margin:0 0 14px">Adding to <b>'+esc(c.templateName)+'</b> · '+esc(c.branchName)+' · '+esc(c.tag||'All Tags')+' tag</p>'+
      (cardMode?'<div id="al_cardnote" style="background:#eefaf1;border:1px solid #cfe3d6;color:#1a5c2e;border-radius:10px;padding:10px 12px;font-size:12.5px;line-height:1.55;margin:0 0 14px">🎫 <b>Membership card template.</b> Everyone in your file who has no active '+cardKind+' card gets a <b>new card made automatically</b> — it will show on the Membership Cards page. People who already hold this card keep it. Both <b>name</b> and <b>mobile</b> are needed.</div>':'')+
      '<label style="display:block;border:2px dashed var(--line);border-radius:12px;padding:24px 16px;text-align:center;background:#fafaf9;color:var(--grey);font-size:12.5px;cursor:pointer">'+
        '<div style="font-size:26px;margin-bottom:6px">⬆</div><div id="al_fname"><b>Drag &amp; drop Excel / CSV, or click to browse</b></div>'+
        '<div style="font-size:11px;margin-top:4px">'+(cardMode?'Columns: name, mobile, tag (optional). Card pictures are drawn on this device, so keep this window open until it says finished.':'Columns: name, mobile, tag (optional) — no size limit, a list of 20,000+ contacts is fine. Uploads in the background in small batches with automatic retry, so keep this tab open; a big file can take several minutes.')+'</div>'+
        '<input type="file" id="al_file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label>'+
      '<div id="al_map"></div><div id="al_msg"></div>'+
      (cardMode?'':
      '<div style="display:flex;align-items:center;gap:10px;margin:14px 0;color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase">'+
        '<div style="flex:1;height:1px;background:var(--line)"></div>or add manually<div style="flex:1;height:1px;background:var(--line)"></div></div>'+
      '<div style="display:flex;gap:10px"><input id="al_manual" placeholder="Enter phone number" style="flex:1;padding:11px;border:1px solid var(--line);border-radius:9px">'+
        '<button class="btn ghost" id="al_manualAdd">+ Add</button></div>')+
      '<div id="al_prog" style="margin-top:12px"></div>';
    openModal('Add Leads', body, '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="al_go" disabled>Add Leads</button>');

    var parsed=null, manualRows=[], plan=null, planTok=0;

    if($('al_manualAdd')) $('al_manualAdd').onclick=function(){
      var ph=mobile10($('al_manual').value);
      if(ph.length!==10){ toast('Enter a valid 10-digit mobile number.',true); return; }
      manualRows.push({name:'',mobile:ph,tag:c.tag||''});
      $('al_manual').value='';
      toast(manualRows.length+' manual number'+(manualRows.length===1?'':'s')+' queued — click "Add Leads" to save.');
      updateGoLabel();
    };
    function updateGoLabel(){
      if(cardMode){
        var nn=plan?(plan.counts['new']+(plan.counts.replace||0)):0, hh=plan?plan.counts.have:0, mm=nn+hh, gb=$('al_go');
        gb.disabled=!plan||!mm;
        gb.textContent=!plan?'Add Leads':(nn?('Create '+nn+' card'+(nn===1?'':'s')+' & add '+mm+' lead'+(mm===1?'':'s')):(mm?('Add '+mm+' lead'+(mm===1?'':'s')):'Nothing to add'));
        return;
      }
      var n=(parsed?parsed.rows.length:0)+manualRows.length;
      $('al_go').disabled=!n; $('al_go').textContent=n?('Add '+n+' Lead'+(n===1?'':'s')):'Add Leads';
    }

    $('al_file').onchange=function(){
      var f=this.files&&this.files[0]; if(!f) return;
      $('al_fname').innerHTML='<b>'+esc(f.name)+'</b>';
      var isCsv=/\.csv$/i.test(f.name), fr=new FileReader();
      function fromGrid(rows){
        rows=(rows||[]).filter(function(r){ return r.some(function(x){ return String(x==null?'':x).trim()!==''; }); })
                        .map(function(r){ return r.map(function(x){ return x==null?'':String(x); }); });
        if(rows.length<2){ $('al_msg').innerHTML='<div class="msg error">That file has no data rows.</div>'; return; }
        paintMap(rows[0], rows.slice(1), f.name);
      }
      fr.onload=function(){
        if(isCsv){ fromGrid(parseCsv(fr.result)); return; }
        function parseXl(){
          try{ var wb=XLSX.read(new Uint8Array(fr.result),{type:'array'}); var rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''}); $('al_msg').innerHTML=''; fromGrid(rows); }
          catch(e){ $('al_msg').innerHTML='<div class="msg error">Could not read that Excel file.</div>'; }
        }
        if(typeof XLSX==='undefined'){
          $('al_msg').innerHTML='<div class="msg">Loading Excel support…</div>';
          var s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          s.onload=parseXl; s.onerror=function(){ $('al_msg').innerHTML='<div class="msg error">Excel parser needs internet — save the file as CSV instead.</div>'; };
          document.head.appendChild(s);
        } else parseXl();
      };
      if(isCsv) fr.readAsText(f); else fr.readAsArrayBuffer(f);
    };

    function guessCol(headers, wants){
      for(var w=0;w<wants.length;w++) for(var h=0;h<headers.length;h++) if(String(headers[h]).toLowerCase().replace(/[^a-z]/g,'').indexOf(wants[w])>=0) return h;
      return -1;
    }
    function paintMap(headers, bodyRows, fileName){
      /* Which column holds the mobile numbers? Headers vary a lot ("Mobile", "Mo.No", "Mob No", "Contact",
         "WhatsApp"…), and a serial "No." column must never be mistaken for it — so a header guess is only
         trusted when most of that column really looks like 10-digit numbers; otherwise the column whose values
         DO look like mobile numbers wins. (A file headed "No. | Name | Mo.No | Card" used to map Mobile to
         "— not in this file —" and skip every row.) */
      function mobShare(ci){ var n=0, ok=0; for(var i=0;i<bodyRows.length && n<80;i++){ var v=bodyRows[i][ci]; if(String(v==null?'':v).trim()==='') continue; n++; if(mobile10(v).length===10) ok++; } return n?ok/n:0; }
      function guessMobile(){
        var wants=['mobile','mobno','mono','mob','phone','contact','whatsapp','cell','number'];
        for(var w=0;w<wants.length;w++) for(var h=0;h<headers.length;h++)
          if(String(headers[h]).toLowerCase().replace(/[^a-z]/g,'').indexOf(wants[w])>=0 && mobShare(h)>=0.5) return h;
        var best=-1, bestS=0;
        for(var c2=0;c2<headers.length;c2++){ var sh=mobShare(c2); if(sh>bestS){ bestS=sh; best=c2; } }
        return bestS>=0.6 ? best : guessCol(headers,['mobile','mobno','mono','phone','contact','cell']);
      }
      var guess={ name:guessCol(headers,['patientname','fullname','name','patient','customer','member','holder']), mobile:guessMobile(), tag:guessCol(headers,['tag']) };
      function sel(id,cur){ return '<select id="'+id+'">'+'<option value="-1">— not in this file —</option>'+headers.map(function(h,i){ return '<option value="'+i+'"'+(i===cur?' selected':'')+'>'+esc(h||('Column '+(i+1)))+'</option>'; }).join('')+'</select>'; }
      $('al_map').innerHTML='<div class="section-label" style="margin-top:14px">Match your columns</div>'+
        '<div class="card" style="padding:12px 14px"><div style="display:grid;grid-template-columns:100px 1fr;gap:9px 12px;align-items:center;font-size:12.5px">'+
        '<b>Name</b>'+sel('al_c_name',guess.name)+'<b>Mobile *</b>'+sel('al_c_mob',guess.mobile)+'<b>Tag <span style="font-weight:400;color:var(--muted);font-size:10.5px">(optional)</span></b>'+sel('al_c_tag',guess.tag)+
        '</div></div><div id="al_prev" style="margin-top:10px"></div>';
      ['al_c_name','al_c_mob','al_c_tag'].forEach(function(id){ $(id).onchange=preview; });
      function build(){
        var ci={name:parseInt($('al_c_name').value,10), mob:parseInt($('al_c_mob').value,10), tag:parseInt($('al_c_tag').value,10)};
        var out=[], bad=0, dup=0, seen={};
        bodyRows.forEach(function(r){
          var mob=ci.mob>=0?mobile10(r[ci.mob]):'';
          if(mob.length!==10){ bad++; return; }
          if(cardMode){ if(seen[mob]){ dup++; return; } seen[mob]=1; }   /* one card per mobile — the first row wins */
          out.push({name: ci.name>=0?String(r[ci.name]||'').trim():'', mobile:mob, tag: ci.tag>=0?String(r[ci.tag]||'').trim():''});
        });
        return {rows:out, bad:bad, dup:dup, hasName:ci.name>=0};
      }
      function preview(){
        var b=build(); parsed={rows:b.rows, fileName:fileName};
        if(parseInt($('al_c_mob').value,10)<0){
          planTok++; plan=null;
          $('al_prev').innerHTML='<div class="msg error" style="font-size:12.5px">Pick the column that holds the <b>mobile numbers</b> in the <b>Mobile</b> box above.</div>';
          parsed={rows:[],fileName:fileName}; updateGoLabel(); return;
        }
        if(cardMode){
          if(!b.hasName){ planTok++; plan=null; $('al_prev').innerHTML='<div class="msg error" style="font-size:12.5px">This template needs a <b>Name</b> column — pick it above.</div>'; updateGoLabel(); return; }
          cardPlan_(b.rows, b.bad, b.dup); return;
        }
        $('al_prev').innerHTML='<div class="msg '+(b.rows.length?'ok':'error')+'" style="font-size:12.5px"><b>'+b.rows.length+'</b> lead'+(b.rows.length===1?'':'s')+' ready to add'+(b.bad?(' · <b>'+b.bad+'</b> skipped (missing/invalid mobile)'):'')+'</div>';
        updateGoLabel();
      }
      preview();
    }

    $('al_go').onclick=function(){
      if(cardMode){ goCards_(); return; }
      var rows=(parsed?parsed.rows.slice():[]).concat(manualRows);
      if(!rows.length) return;
      /* CHUNK stays comfortably under the server's MSG_REC_MAX_BATCH (200 rows/call, 27_Messaging.gs)
         — 190 cuts the number of round trips for a very large file (20,000+ contacts is ~106 calls
         instead of ~134 at the old 150) while leaving headroom. Sequential, not parallel, on
         purpose: Apps Script writes to the same Msg_Recipients sheet from one call at a time, and
         each failed chunk already retries on its own (see run()/btn.onclick below) without losing
         the chunks that already succeeded. */
      var CHUNK=190, chunks=[]; for(var i=0;i<rows.length;i+=CHUNK) chunks.push(rows.slice(i,i+CHUNK));
      var btn=$('al_go'), prog=$('al_prog'), file=$('al_file'); btn.disabled=true; file.disabled=true;
      var totals={added:0,duplicate:0,invalid:0}, sent=0;
      function paint(label){
        var pct=Math.round(sent/rows.length*100);
        prog.innerHTML='<div style="background:var(--line);border-radius:6px;height:8px;overflow:hidden"><div style="width:'+pct+'%;height:100%;background:var(--ok);transition:width .3s"></div></div>'+
          '<div style="font-size:11px;color:var(--grey);margin-top:5px">'+esc(label)+'</div>';
      }
      function run(idx){
        btn.innerHTML='<span class="loader"></span> Adding…';
        paint('Sending batch '+(idx+1)+' of '+chunks.length+' — '+sent+' of '+rows.length+' sent so far');
        API.msgAddRecipients({campaignId:c.campaignId, rows:chunks[idx], fileName:(parsed&&parsed.fileName)||'manual'}).then(function(r){
          if(!(r&&r.ok)){
            btn.disabled=false; file.disabled=false;
            var left=rows.length-sent; btn.textContent='Retry remaining '+left;
            btn.onclick=function(){ btn.disabled=true; file.disabled=true; run(idx); };
            toast((r&&r.error)||'Adding leads failed — '+sent+' of '+rows.length+' already saved.',true);
            return;
          }
          totals.added+=r.added||0; totals.duplicate+=r.duplicate||0; totals.invalid+=r.invalid||0;
          sent+=chunks[idx].length;
          if(idx+1<chunks.length){ paint(sent+' of '+rows.length+' sent — '+totals.added+' added so far'); run(idx+1); }
          else {
            closeModal();
            toast(totals.added+' lead'+(totals.added===1?'':'s')+' added'+(totals.duplicate?(' · '+totals.duplicate+' already on this campaign'):'')+(totals.invalid?(' · '+totals.invalid+' invalid'):''));
            (doneCb||loadHistory)();
          }
        }, function(){ btn.disabled=false; file.disabled=false; toast('Connection dropped — '+sent+' of '+rows.length+' saved so far.',true); });
      }
      run(0);
    };

    /* ============ card templates (Gold / Platinum 7): plan → create cards → pictures → leads ============ */
    /* 1 · dry run. Nothing is written; the server (28_CardImport.gs) says what WOULD happen to each row. */
    function cardPlan_(rows, bad, dup){
      var tok=++planTok; plan=null; updateGoLabel();
      var prev=$('al_prev');
      if(!rows.length){ prev.innerHTML='<div class="msg error" style="font-size:12.5px">No usable rows — every row is missing a valid 10-digit mobile.</div>'; return; }
      var chunks=chunk_(rows,190), agg={'new':0,have:0,replace:0,invalid:0}, skipped=[], replaced=[], typeName='', i=0;
      function fail(m){
        if(tok!==planTok || !$('al_prev')) return;
        prev.innerHTML='<div class="msg error" style="font-size:12.5px">'+esc(m)+' <a href="#" id="al_replan" style="font-weight:700">Try again</a></div>';
        $('al_replan').onclick=function(e){ e.preventDefault(); cardPlan_(rows,bad,dup); };
      }
      function next(){
        prev.innerHTML='<div class="msg" style="font-size:12.5px"><span class="loader dark"></span> Checking '+rows.length+' people against the Membership Cards list…'+(chunks.length>1?(' ('+(i+1)+' of '+chunks.length+')'):'')+'</div>';
        API.msgCardsPlan({campaignId:c.campaignId, rows:chunks[i]}).then(function(r){
          if(tok!==planTok || !$('al_prev')) return;
          if(!(r&&r.ok)){ fail((r&&r.error)||'Could not check the list.'); return; }
          ['new','have','replace','invalid'].forEach(function(k){ agg[k]+=(r.counts&&r.counts[k])||0; });
          (r.skipped||[]).forEach(function(x){ if(skipped.length<40) skipped.push(x); });
          (r.replaced||[]).forEach(function(x){ if(replaced.length<40) replaced.push(x); });
          typeName=r.typeName||typeName;
          i++;
          if(i<chunks.length) next();
          else { plan={counts:agg, skipped:skipped, replaced:replaced, typeName:typeName, rows:rows, bad:bad, dup:dup}; paintPlan_(); updateGoLabel(); }
        }, function(){ fail('Checking needs an internet connection.'); });
      }
      next();
    }
    function paintPlan_(){
      var p=plan, cn=p.counts, skip=cn.invalid+p.bad, repl=cn.replace||0;
      var notes=[];
      if(cn['new']) notes.push('New cards are <b>'+esc(p.typeName)+'</b> cards, valid from today, numbered on from this branch\'s last card. No payment is recorded.');
      if(cn.have) notes.push('<b>'+cn.have+'</b> already '+(cn.have===1?'holds':'hold')+' an active '+esc(p.typeName)+' card — the message goes with '+(cn.have===1?'their':'their')+' existing card.');
      if(repl) notes.push('<b>'+repl+'</b> '+(repl===1?'holds':'hold')+' an active card of a DIFFERENT type — '+(repl===1?'it':'they')+'\'ll be closed and a fresh <b>'+esc(p.typeName)+'</b> card issued in its place.');
      if(p.dup) notes.push(p.dup+' repeated mobile number'+(p.dup===1?'':'s')+' in the file ignored (one card per mobile).');
      var det='', det2='';
      if(skip){
        det='<details style="margin-top:8px;font-size:12px"><summary style="cursor:pointer;font-weight:700;color:#8a6d00">Why '+skip+' '+(skip===1?'is':'are')+' skipped</summary><div style="margin-top:6px;line-height:1.6;color:var(--grey)">'+
          (p.bad?('<div>'+p.bad+' row'+(p.bad===1?'':'s')+' with a missing / invalid mobile</div>'):'')+
          p.skipped.map(function(x){ return '<div>'+esc(x.name||'(no name)')+' · '+esc(x.mobile)+' — '+esc(x.reason||'')+'</div>'; }).join('')+
          (cn.invalid>p.skipped.length?('<div>…and '+(cn.invalid-p.skipped.length)+' more</div>'):'')+'</div></details>';
      }
      if(repl){
        det2='<details style="margin-top:8px;font-size:12px"><summary style="cursor:pointer;font-weight:700;color:#a15c00">Who\'s being replaced</summary><div style="margin-top:6px;line-height:1.6;color:var(--grey)">'+
          (p.replaced||[]).map(function(x){ return '<div>'+esc(x.name||'(no name)')+' · '+esc(x.mobile)+' — '+esc(x.reason||'')+'</div>'; }).join('')+
          (repl>(p.replaced||[]).length?('<div>…and '+(repl-(p.replaced||[]).length)+' more</div>'):'')+'</div></details>';
      }
      $('al_prev').innerHTML=
        '<div style="display:flex;gap:10px;flex-wrap:wrap">'+pstat(cn['new'],'New cards to create','#0a7d0a')+pstat(cn.have,'Already have this card','#185fa5')+pstat(repl,'Replacing older card','#a15c00')+pstat(skip,'Skipped','#8a6d00')+'</div>'+
        '<div style="font-size:12px;color:var(--grey);line-height:1.6;margin-top:10px">'+notes.map(function(n){ return '<div>'+n+'</div>'; }).join('')+'</div>'+det2+det;
    }

    /* 2 · the real thing. create cards → draw + upload every picture → add the leads (only those whose
       picture is ready). Any step that fails shows a Retry that carries on from the same spot. */
    function goCards_(){
      if(!plan || !cardMode) return;
      var rows=plan.rows, btn=$('al_go'), file=$('al_file'), prog=$('al_prog');
      var out=[], failedPic={}, made=0, kept=0, replacedCount=0, totals={added:0,duplicate:0,invalid:0};
      btn.disabled=true; file.disabled=true;
      ['al_c_name','al_c_mob','al_c_tag'].forEach(function(id){ if($(id)) $(id).disabled=true; });
      /* tuck the setup away so the progress bar is what you see, not something below the fold */
      if($('al_map')) $('al_map').style.display='none';
      var dts=document.querySelectorAll('#al_prev details'); for(var di=0;di<dts.length;di++) dts[di].open=false;
      function gone(){ return !$('al_prog'); }          /* the window was closed — stop quietly; running the same file again finishes the job */
      function paint(pct,stage){
        if(gone()) return;
        prog.innerHTML='<div style="background:var(--line);border-radius:6px;height:8px;overflow:hidden"><div id="al_fill" style="width:'+Math.max(2,Math.min(100,pct))+'%;height:100%;background:var(--ok);transition:width .3s"></div></div>'+
          '<div style="font-size:12px;color:var(--ink);margin-top:6px;font-weight:600">'+esc(stage)+'</div>'+
          '<div style="font-size:11px;color:var(--grey);margin-top:3px">Keep this window open until it says finished.</div>';
        try{ prog.scrollIntoView({block:'nearest'}); }catch(e){}
      }
      function stop(retryFn, msg){
        if(gone()) return;
        btn.disabled=false; btn.textContent='Retry'; btn.onclick=function(){ btn.disabled=true; retryFn(); };
        toast(msg,true);
      }
      function busy(){ btn.disabled=true; btn.innerHTML='<span class="loader"></span> Working…'; }

      /* step 1 · cards */
      var cch=chunk_(rows,190), ci=0;
      function create(){
        if(gone()) return; busy();
        paint(Math.round(ci/cch.length*10),'Step 1 of 3 — creating membership cards'+(cch.length>1?(' ('+(ci+1)+' of '+cch.length+')'):'')+'…');
        API.msgCardsCreate({campaignId:c.campaignId, rows:cch[ci]}).then(function(r){
          if(gone()) return;
          if(!(r&&r.ok)){ stop(create,(r&&r.error)||'Could not create the cards.'); return; }
          (r.rows||[]).forEach(function(x){ out.push(x); });
          made+=(r.counts&&r.counts['new'])||0; kept+=(r.counts&&r.counts.have)||0; replacedCount+=(r.counts&&r.counts.replace)||0;
          ci++; if(ci<cch.length) create(); else pics();
        }, function(){ stop(create,'Connection dropped — press Retry (cards already made are kept).'); });
      }

      /* step 2 · pictures (drawn here, uploaded the same way Send Cards does).
         23 Sep — this used to call API.listCards({}) here to look up the ~handful of cards it needed,
         which re-downloads the WHOLE company's card list (every branch, every card) just to find the
         ones create() already told us about a moment ago. On a branch with a lot of cards that fetch
         alone could stall this step at "0 of N" for a long time. msgcCardsPlan/Create now hand back
         the few fields the drawing needs (see msgcCardLite_ in 28_CardImport.gs) directly on each row,
         so no second whole-company fetch is needed at all. */
      function pics(){
        if(gone()) return; busy();
        var need={}, by={};
        out.forEach(function(x){
          if(x.status==='new'||x.status==='have'||x.status==='replace') (x.needPic||[]).forEach(function(n){ need[n]=1; });
          (x.cards||[]).forEach(function(cd){ by[String(cd.cardNumber)]=cd; });
        });
        var list=Object.keys(need);
        if(!list.length){ leads(); return; }
        var draw=window.__nakodaCard;
        if(!draw){ stop(pics,'The card drawing tool is not loaded — open the Membership Cards page once, then press Retry.'); return; }
        paint(10,'Step 2 of 3 — preparing card pictures… 0 of '+list.length);
        Promise.resolve(draw.ensureTypes?draw.ensureTypes():null).then(function(){
          var done=0, q=list.slice();
          function one(n){
            return new Promise(function(res){
              function fin(){ done++; paint(10+done/list.length*65,'Step 2 of 3 — preparing card pictures… '+done+' of '+list.length); res(); }
              var full=by[n]; if(!full){ failedPic[n]='card not found'; return fin(); }
              var cv, b64;
              try{
                cv=draw.buildCardImage
                  ? draw.buildCardImage(full, draw.typeFor(full.typeId), { benefits:draw.benefitsFor(full.typeId), labPhone:draw.labPhoneFor(full.branchId) })
                  : (function(){ var k=draw.newCardCanvas(); draw.drawCard(k, full, draw.typeFor(full.typeId)); return k; })();
                b64=(draw.sendJpeg?draw.sendJpeg(cv):cv.toDataURL('image/jpeg',0.82)).split(',')[1];
              }catch(e){ failedPic[n]='could not draw the picture'; return fin(); }
              API.waCardMedia(n,b64).then(function(u){ if(!(u&&u.ok)) failedPic[n]=(u&&u.error)||'picture upload failed'; fin(); },
                                          function(){ failedPic[n]='picture upload failed (network)'; fin(); });
            });
          }
          function worker(){ if(!q.length||gone()) return Promise.resolve(); return one(q.shift()).then(worker); }
          var lanes=[]; for(var k=0;k<Math.min(4,list.length);k++) lanes.push(worker());
          return Promise.all(lanes).then(function(){ if(!gone()) leads(); });
        }).catch(function(){ stop(pics,'Something went wrong preparing the pictures — press Retry.'); });
      }

      /* step 3 · leads — only people whose card picture is ready */
      function hasPicFail(x){ return (x.needPic||[]).some(function(n){ return failedPic[n]; }); }
      function leads(){
        if(gone()) return; busy();
        var okRows=out.filter(function(x){ return (x.status==='new'||x.status==='have'||x.status==='replace') && !hasPicFail(x); })
                      .map(function(x){ return {name:x.name, mobile:x.mobile, tag:x.tag}; });
        if(!okRows.length){ finish(); return; }
        var lch=chunk_(okRows,190), li=0;
        function add(){
          if(gone()) return; busy();
          paint(78+li/lch.length*22,'Step 3 of 3 — adding leads to the campaign'+(lch.length>1?(' ('+(li+1)+' of '+lch.length+')'):'')+'…');
          API.msgAddRecipients({campaignId:c.campaignId, rows:lch[li], fileName:(parsed&&parsed.fileName)||'cards'}).then(function(r){
            if(gone()) return;
            if(!(r&&r.ok)){ stop(add,(r&&r.error)||'Adding leads failed — press Retry.'); return; }
            totals.added+=r.added||0; totals.duplicate+=r.duplicate||0; totals.invalid+=r.invalid||0;
            li++; if(li<lch.length) add(); else finish();
          }, function(){ stop(add,'Connection dropped — press Retry (leads already added are kept).'); });
        }
        add();
      }

      function finish(){
        if(gone()) return;
        var skipped=out.filter(function(x){ return x.status==='invalid'; });
        var picFails=out.filter(function(x){ return (x.status==='new'||x.status==='have'||x.status==='replace') && hasPicFail(x); });
        var totalCreated=made+replacedCount;
        closeModal();
        if(API.refreshCards) API.refreshCards();
        (doneCb||loadHistory)();
        toast(totalCreated+' card'+(totalCreated===1?'':'s')+' created · '+totals.added+' lead'+(totals.added===1?'':'s')+' added');
        var skipCount=skipped.length+plan.bad;
        var html=
          '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'+pstat(totalCreated,'New cards created','#0a7d0a')+pstat(totals.added,'Leads added','#185fa5')+pstat(skipCount+picFails.length,'Not added','#8a6d00')+'</div>'+
          '<div style="font-size:12.5px;line-height:1.65;color:var(--grey)">'+
            (totalCreated?'<div>🎫 The new cards are on the <b>Membership Cards</b> page now.</div>':'')+
            (replacedCount?'<div>'+replacedCount+' older card'+(replacedCount===1?' was':'s were')+' closed and replaced with a new '+esc(plan.typeName)+' card — the old card stays on file, marked cancelled.</div>':'')+
            (kept?'<div>'+kept+' already had a '+esc(plan.typeName)+' card — their message goes with that card.</div>':'')+
            (totals.duplicate?'<div>'+totals.duplicate+' were already on this campaign.</div>':'')+
            '<div>The template goes out from <b>'+esc(fmtTime12(c.sendTime))+'</b>, up to the branch\'s daily limit — watch it under <b>View</b> (Patient Delivery).</div>'+
          '</div>'+
          (picFails.length?'<div class="msg error" style="font-size:12.5px;margin-top:12px"><b>'+picFails.length+' card picture'+(picFails.length===1?'':'s')+' could not be prepared</b> — those people were NOT added, so nothing goes out wrong. Run the <b>same file again</b> to retry just them.'+
            '<div style="margin-top:6px;font-size:12px">'+picFails.slice(0,15).map(function(x){ return esc(x.name)+' · '+esc(x.mobile); }).join('<br>')+(picFails.length>15?'<br>…and '+(picFails.length-15)+' more':'')+'</div></div>':'')+
          (skipCount?'<details style="margin-top:12px;font-size:12px"><summary style="cursor:pointer;font-weight:700;color:#8a6d00">'+skipCount+' skipped — see who</summary><div style="margin-top:6px;line-height:1.6;color:var(--grey)">'+
            (plan.bad?('<div>'+plan.bad+' row'+(plan.bad===1?'':'s')+' with a missing / invalid mobile</div>'):'')+
            skipped.slice(0,40).map(function(x){ return '<div>'+esc(x.name||'(no name)')+' · '+esc(x.mobile)+' — '+esc(x.reason||'')+'</div>'; }).join('')+
            (skipped.length>40?'<div>…and '+(skipped.length-40)+' more</div>':'')+'</div></details>':'');
        openModal('Cards & leads ready', html, '<button class="btn" onclick="closeModal()">Done</button>');
      }

      create();
    }
  }
  function parseCsv(text){
    var rows=[], row=[], cur='', q=false;
    text=String(text||'').replace(/^﻿/,'').replace(/\r\n?/g,'\n');
    for(var i=0;i<text.length;i++){
      var ch=text[i];
      if(q){ if(ch==='"'){ if(text[i+1]==='"'){ cur+='"'; i++; } else q=false; } else cur+=ch; }
      else { if(ch==='"') q=true; else if(ch===','){ row.push(cur); cur=''; } else if(ch==='\n'){ row.push(cur); rows.push(row); row=[]; cur=''; } else cur+=ch; }
    }
    if(cur!=='' || row.length){ row.push(cur); rows.push(row); }
    return rows.filter(function(r){ return r.some(function(x){ return String(x).trim()!==''; }); });
  }

  /* ============================================================ PATIENT DELIVERY POP-UP */
  var PD={ campaignId:'', q:'', status:'all' };
  /* 18 Sep — "View" opened Patient Delivery showing the real, live counts (it always asks the
     server fresh — loadDelivery() below), while the row you clicked it FROM, sitting in Campaign
     History underneath, kept showing whatever it looked like at the last loadHistory() — e.g.
     "0 / 4" and "Scheduled" on a campaign that a background send (msgSchedulerTick_'s 15-minute
     trigger) had already finished sending and marked "completed" on the server. Nothing was
     wrong with the data — Campaign History just never knew to ask again, since a scheduled send
     happens in the background with nobody clicking anything. Refreshing the history list here,
     the moment you check on a campaign, means the row underneath is caught up by the time you
     close this modal — reported as "sends work but the list and Scheduled tag never update". */
  function openPatientDelivery(campaignId){
    PD.campaignId=campaignId; PD.q=''; PD.status='all';
    openModal('Patient Delivery', '<div id="pd_body">'+loaderHtml()+'</div>',
      '<span id="pd_count" style="font-size:11.5px;color:var(--muted);flex:1"></span>'+
      '<button class="btn ghost hidden" id="pd_retry" style="color:#a12525;border-color:#f0c9c9">&#8635; Retry failed</button>'+
      '<button class="btn ghost" id="pd_export">Export List</button>');
    var m=document.querySelector('#modalRoot .modal'); if(m) m.style.maxWidth='920px';
    var mf=document.querySelector('#modalRoot .modal-foot'); if(mf) mf.style.display='flex', mf.style.justifyContent='space-between', mf.style.alignItems='center';
    $('pd_export').onclick=exportRecipients;
    $('pd_retry').onclick=retryFailed_;
    loadDelivery();
    /* Refresh whichever Campaign History table(s)/KPI tiles are actually on the page right now —
       Bulk Message Send's and Timely Message's alike. Each of these four already bails out
       immediately if its own DOM (bm_histBody / tm_histBody / bm_kpis / tm_kpis) isn't present,
       so calling all four here is harmless on whichever tab you actually opened "View" from. */
    loadHistory();
    paintStats();
    loadHistoryT();
    paintStatsT();
  }
  function loaderHtml(){ return '<div class="center-load"><span class="loader dark"></span> Loading…</div>'; }
  function loadDelivery(){
    API.msgListRecipients(PD.campaignId, {q:PD.q, status:PD.status}).then(function(r){
      if(!r.ok){ $('pd_body').innerHTML='<div class="empty">'+esc(r.error||'Could not load.')+'</div>'; return; }
      paintDelivery(r);
    }).catch(function(){ $('pd_body').innerHTML='<div class="empty">Needs an internet connection.</div>'; });
  }
  function paintDelivery(r){
    var camp=r.campaign||{};
    document.querySelector('#modalRoot .modal-head h3').textContent='Patient Delivery — '+(camp.templateName||'');
    var counts=r.counts||{sent:0,pending:0,failed:0,total:0};
    var html=
      '<p style="font-size:12px;color:var(--muted);margin:0 0 14px">'+esc(camp.branchName||'')+' · '+esc(camp.tag||'All Tags')+' tag · scheduled '+esc(fmtTime12(camp.sendTime))+' · '+esc(fmtDateShort(camp.createdAt))+'</p>'+
      pdNextBox_(camp)+
      '<div style="display:flex;gap:10px;margin-bottom:16px">'+
        pstat(counts.sent,'Sent','#0a7d0a')+pstat(counts.pending,'Pending','#8a6d00')+pstat(counts.failed,'Failed','#a12525')+pstat(counts.total,'Total Leads','var(--ink)')+
      '</div>'+
      '<div style="display:flex;gap:10px;margin-bottom:12px">'+
        '<input id="pd_q" placeholder="Search patient name or phone number" value="'+esc(PD.q)+'" style="flex:1;padding:10px 12px;border:1px solid var(--line);border-radius:9px">'+
        '<select id="pd_status" style="padding:10px 12px;border:1px solid var(--line);border-radius:9px">'+
          ['all','sent','pending','failed'].map(function(s){ return '<option value="'+s+'"'+(s===PD.status?' selected':'')+'>'+(s==='all'?'All Status':s.charAt(0).toUpperCase()+s.slice(1))+'</option>'; }).join('')+
        '</select></div>'+
      '<div class="table-wrap" style="max-height:44vh;overflow:auto;border:1px solid var(--line);border-radius:10px">'+
        '<table><thead><tr><th>Patient</th><th>Phone Number</th><th>Tag</th><th>Status</th><th>Sent At</th></tr></thead><tbody>'+
        (r.recipients||[]).map(function(p){
          var ac=rowAccent(p.recipientId);
          var badge={sent:['sent','#e7f6ec','#0a7d0a'],pending:['pending','#fff3d6','#8a6d00'],failed:['failed','#fceaea','#a12525']}[String(p.status)]||['—','#f1f2f4','#686868'];
          return '<tr><td><span class="rowavatar" style="background:'+ac.bg+';color:'+ac.col+'">'+esc(rowInitials(p.name))+'</span>'+esc(p.name||'—')+'</td>'+
            '<td>+91 '+esc(p.phone)+'</td><td><span class="pill">'+esc(p.tag||'—')+'</span></td>'+
            '<td><span class="badge" style="background:'+badge[1]+';color:'+badge[2]+'" title="'+esc(p.error||'')+'">'+esc(badge[0])+'</span>'+
              (String(p.status)==='failed'&&p.error?'<div style="font-size:10.5px;color:#a12525;margin-top:4px;max-width:360px;line-height:1.35">'+esc(p.error)+'</div>':'')+'</td>'+
            '<td>'+(p.sentAt?esc(new Date(p.sentAt).toLocaleTimeString('en-IN')):'—')+'</td></tr>';
        }).join('')+
        '</tbody></table></div>';
    if(canManage() && counts.pending>0){
      html += '<div style="margin-top:10px;font-size:11px;color:var(--muted)">Pending leads can be removed from a campaign that hasn\'t reached them yet.</div>';
    }
    $('pd_body').innerHTML=html;
    $('pd_count').textContent='Showing '+r.showing+' of '+r.total+' patients';
    $('pd_q').oninput=debounce(function(){ PD.q=$('pd_q').value; loadDelivery(); },350);
    $('pd_status').onchange=function(){ PD.status=$('pd_status').value; loadDelivery(); };
    /* 22 Sep — "Retry failed" only makes sense when there's something to retry, and only for
       someone who can actually manage campaigns. Text carries the live count so it's obvious what
       pressing it will do (e.g. a missing membership card that's since been created — see
       apiMsgRetryFailed in 27_Messaging.gs for why a re-upload of the same Excel alone won't fix
       these rows on its own). */
    var rb=$('pd_retry');
    if(rb){
      var showRetry = canManage() && counts.failed>0;
      rb.classList.toggle('hidden', !showRetry);
      if(showRetry) rb.textContent='↻ Retry failed ('+counts.failed+')';
    }
  }
  function retryFailed_(){
    var rb=$('pd_retry'); if(!rb || rb.disabled) return;
    if(!confirm('Retry every failed lead on this campaign?\n\nThey\'ll be set back to Pending and picked up by the next automatic send — no need to delete or re-upload them.')) return;
    rb.disabled=true; var was=rb.textContent; rb.textContent='Retrying…';
    API.msgRetryFailed(PD.campaignId).then(function(r){
      rb.disabled=false;
      if(!r.ok){ rb.textContent=was; toast(r.error,true); return; }
      toast(r.retried+' lead'+(r.retried===1?'':'s')+' reset to Pending — they\'ll go out on the next send.');
      loadDelivery();
      loadHistory(); paintStats(); loadHistoryT(); paintStatsT();
    }).catch(function(){ rb.disabled=false; rb.textContent=was; toast('Needs an internet connection.',true); });
  }
  function pdNextBox_(camp){
    var left=Number(camp.pendingLeft)||0; if(!left||!camp.nextWhen) return '';
    var dt=daysText_(camp);
    return '<div style="background:#eef5ff;border:1px solid #c9dcf7;border-radius:10px;padding:11px 14px;font-size:12.5px;color:#1c3f77;line-height:1.5;margin:0 0 14px">'+
      '&#128339; <b>Next batch: '+esc(nextWhenText_(camp))+'.</b> Messages go out automatically from the server — your laptop and this app can be switched off. '+
      'Limit: <b>'+money0(camp.capPerDay||250)+' per branch per day</b> (shared with membership-card sends). '+
      '<b>'+money0(left)+' still waiting'+(dt?' → '+esc(dt):'')+'.</b></div>';
  }
  function pstat(n,label,color){ return '<div style="flex:1;border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:#fafaf9"><div style="font-size:19px;font-weight:800;color:'+color+'">'+money0(n)+'</div><div style="font-size:10.5px;color:var(--muted);font-weight:700;text-transform:uppercase;margin-top:3px">'+label+'</div></div>'; }
  function debounce(fn,ms){ var t; return function(){ clearTimeout(t); var a=arguments; t=setTimeout(function(){ fn.apply(null,a); },ms); }; }
  function exportRecipients(){
    API.msgListRecipients(PD.campaignId, {q:'', status:'all'}).then(function(r){
      if(!r.ok){ toast(r.error,true); return; }
      var rows=[['Patient','Phone','Tag','Status','Sent At','Error']];
      (r.recipients||[]).forEach(function(p){ rows.push([p.name,'91'+p.phone,p.tag,p.status,p.sentAt?new Date(p.sentAt).toLocaleString('en-IN'):'',p.error||'']); });
      downloadCsv('patient-delivery-'+PD.campaignId+'.csv', rows);
    });
  }

  /* ============================================================ TIMELY MESSAGE PAGE (rebuilt
     19 Sep from the approved mockup — same Campaign Setup / KPI / Campaign History shape as
     Bulk Message Send, "Send After" chips in place of Bulk's daily-drip Send Time-only setup). */
  function renderTimelyMsg(){
    var v=$('page-timelymsg'); if(!v) return;
    v.innerHTML=
      '<div class="page-head"><h1>Timely Message</h1>'+
        '<div style="flex:1;font-size:12.5px;color:var(--grey)">Send one approved WhatsApp template to a list of leads, automatically, after a delay you set — exact to the day, no matter how far out.</div>'+
        '<button class="btn ghost" id="tm_export">Export History</button>'+
        (canManage()?'<button class="btn" id="tm_addLeads">+ Add Leads</button>':'')+
      '</div>'+
      '<div class="kpis" id="tm_kpis"></div>'+
      (canManage()?
      '<div class="card" style="padding:20px 22px;margin-bottom:22px">'+
        '<h3 style="margin:0 0 3px">Campaign Setup</h3>'+
        '<div style="font-size:12px;color:var(--muted);margin-bottom:16px">Choose who gets it and which template — the only difference from Bulk Message Send is WHEN it goes out. Every active template is listed. Membership-card templates (Gold / Platinum / Platinum+ / Diamond and Benefits) fill themselves in for each lead from that lead\'s OWN membership card — their name, card type, card number, validity and their own card picture — looked up by phone number.</div>'+
        '<div class="grid2" id="tm_fields" style="grid-template-columns:repeat(4,1fr);gap:14px">'+
          '<div class="field"><label>Branch</label><select id="tm_branch">'+branchOptsPick('')+'</select></div>'+
          '<div class="field"><label>Template</label><select id="tm_tpl">'+tplOpts('')+'</select></div>'+
          '<div class="field"><label>Tag</label><select id="tm_tag">'+tagOpts('',true)+'</select></div>'+
          '<div class="field"><label>Daily Limit</label><div class="limit-badge"><span class="lb-dot"></span><span id="tm_capLabel">250 / day (WhatsBizApp cap)</span></div></div>'+
        '</div>'+
        '<div style="margin-top:18px">'+
          '<label style="display:block;font-size:12.5px;font-weight:600;color:var(--grey);margin-bottom:2px">Send After</label>'+
          '<div class="chiprow" id="tm_chips">'+
            TM_PRESETS.map(function(p){
              return p.key==='custom' ?
                ('<div class="dchip custom" data-preset="custom" id="tm_chip_custom" style="display:flex;align-items:center;gap:6px">📅 Custom date '+
                 '<input type="date" id="tm_customDate" style="border:0;background:transparent;font-family:inherit;font-size:inherit;font-weight:inherit;color:inherit;width:118px"></div>') :
                ('<div class="dchip'+(p.key==='1d'?' on':'')+'" data-preset="'+p.key+'">'+esc(p.label)+'</div>');
            }).join('')+
          '</div>'+
        '</div>'+
        '<div class="grid2" style="grid-template-columns:220px 1fr;gap:14px;margin-top:14px">'+
          '<div class="field"><label>Send Time</label><input id="tm_time" type="time" value="02:00"></div>'+
          '<div></div>'+
        '</div>'+
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:18px;padding-top:16px;border-top:1px solid var(--line);flex-wrap:wrap;gap:12px">'+
          '<div style="font-size:12.5px;color:var(--grey)" id="tm_autoNote">—</div>'+
          '<div style="display:flex;gap:10px">'+
            '<button class="btn ghost" id="tm_saveDraft">Save as Draft</button>'+
            '<button class="btn ghost" id="tm_addLeadsBox">+ Add Leads</button>'+
            '<button class="btn" id="tm_start">Start Campaign</button>'+
          '</div>'+
        '</div>'+
      '</div>' : '<div class="card" style="padding:20px 22px">You do not have access to send messages.</div>')+
      '<div class="card">'+
        '<div class="toolbar" style="justify-content:space-between">'+
          '<h3 style="margin:0">Campaign History</h3>'+
          '<div class="tabs-mini" id="tm_tabs">'+
            ['all','pending','sent','scheduled'].map(function(t){ return '<div class="tab-mini'+(t==='all'?' on':'')+'" data-tab="'+t+'">'+(t==='all'?'All':t.charAt(0).toUpperCase()+t.slice(1))+'</div>'; }).join('')+
          '</div>'+
        '</div>'+
        '<div class="table-wrap"><table><thead><tr><th>Code</th><th>Template</th><th>Branch</th><th>Tag</th><th>Will Send On</th><th>Leads</th><th>Status</th><th>Added On</th><th></th></tr></thead>'+
        '<tbody id="tm_histBody"></tbody></table></div>'+
        '<div id="tm_histEmpty" class="empty hidden">No campaigns yet.</div>'+
      '</div>';

    $('tm_export').onclick=exportHistoryT;
    var al=$('tm_addLeads'); if(al) al.onclick=function(){ openAddLeadsPickerT(); };
    v.querySelectorAll('#tm_tabs .tab-mini').forEach(function(t){
      t.onclick=function(){ FT.tab=t.getAttribute('data-tab'); v.querySelectorAll('#tm_tabs .tab-mini').forEach(function(x){x.classList.toggle('on',x===t);}); loadHistoryT(); };
    });

    if(!canManage()){ loadHistoryT(); paintStatsT(); return; }

    var alb=$('tm_addLeadsBox'); if(alb) alb.onclick=function(){ openAddLeadsForSetupT(); };
    $('tm_branch').onchange=function(){ FT.branchId=this.value; paintStatsT(); };
    $('tm_tpl').onchange=function(){ FT.tplId=this.value; paintStatsT(); };
    $('tm_tag').onchange=function(){ FT.tag=this.value; };
    $('tm_time').onchange=paintTimelyNote;
    $('tm_saveDraft').onclick=function(){ saveTimelyCampaign('draft'); };
    $('tm_start').onclick=function(){ saveTimelyCampaign('scheduled'); };

    /* Send After chips — click any preset chip to select it (mutually exclusive, same on/off
       pattern as .dchip everywhere else in the app); the Custom date chip selects itself the
       moment you actually pick a date in it, without needing a separate click on the chip body. */
    v.querySelectorAll('#tm_chips .dchip[data-preset]').forEach(function(chip){
      chip.onclick=function(e){
        var key=chip.getAttribute('data-preset');
        if(key==='custom' && e.target && e.target.id==='tm_customDate') return; /* let the date input handle its own click */
        FT.preset=key;
        v.querySelectorAll('#tm_chips .dchip').forEach(function(c){ c.classList.toggle('on', c===chip); });
        paintTimelyNote();
      };
    });
    var cd=$('tm_customDate');
    if(cd){
      cd.onclick=function(e){ e.stopPropagation(); };
      cd.onchange=function(){
        FT.customDate=this.value; FT.preset='custom';
        v.querySelectorAll('#tm_chips .dchip').forEach(function(c){ c.classList.toggle('on', c===$('tm_chip_custom')); });
        paintTimelyNote();
      };
    }

    Promise.all([ensureTemplates(), ensureCardTypes()]).then(function(){
      $('tm_tpl').innerHTML=tplOpts('');
      if(TPLS.length){ FT.tplId=TPLS[0].tplId; $('tm_tpl').value=FT.tplId; }
      paintStatsT();
      paintTimelyNote();
    });
    loadHistoryT();
  }

  function paintTimelyNote(){
    var note=$('tm_autoNote'); if(!note) return;
    var time=($('tm_time')&&$('tm_time').value)||'02:00';
    var dt=tmCurrentTargetDate_();
    var p=TM_PRESET_MAP[FT.preset]||TM_PRESET_MAP['1d'];
    var today=new Date();
    var howFar = p.unit==='custom' ? '' : (' — exactly '+p.label.toLowerCase()+' from today ('+fmtDateShort(today)+'), to the day.');
    note.innerHTML='Will send on <b>'+esc(fmtDateShort(dt))+'</b> at <b>'+esc(fmtTime12(time))+'</b>'+esc(howFar||'.');
  }

  /* ============================================================ TIMELY HISTORY / STATS
     Mirrors loadHistory()/paintHistory()/paintStats() above almost exactly — the only real
     differences: kind:'timely' on every server call, CAMPS_T instead of CAMPS, tm_* element ids,
     and a "Will Send On" column (c.scheduledDate) in place of Bulk's plain Send Time column. */
  function loadHistoryT(){
    var body=$('tm_histBody'); if(!body) return;
    API.msgListCampaigns({branchId:'', tplId:'', status:FT.tab, kind:'timely'}).then(function(r){
      if(!r.ok){ toast(r.error||'Could not load campaign history.',true); return; }
      CAMPS_T=r.campaigns||[];
      paintHistoryT();
    }).catch(function(){ toast('Campaign history needs an internet connection.',true); });
  }
  function paintHistoryT(){
    var body=$('tm_histBody'); if(!body) return;
    $('tm_histEmpty').classList.toggle('hidden', CAMPS_T.length>0);
    body.innerHTML=CAMPS_T.map(function(c){
      var ac=rowAccent(c.campaignId);
      var total=Number(c.total)||0, sent=Number(c.sent)||0, failed=Number(c.failed)||0;
      var pct=total?Math.round((sent+failed)/total*100):0;
      var leadsLine = failed && !sent ? (failed+' failed') : (money0(sent)+' / '+money0(total));
      var willSend = c.scheduledDate ? ('<b>'+esc(fmtDateShort(c.scheduledDate))+'</b><br><span style="font-size:11px;color:var(--muted)">'+esc(fmtTime12(c.sendTime))+'</span>') : '—';
      return '<tr style="--row-accent:'+ac.col+';background:linear-gradient(115deg,'+ac.bg+' 0%,#ffffff 62%)">'+
        '<td><b>'+esc(c.code)+'</b></td>'+
        '<td><span class="rowavatar" style="background:'+ac.bg+';color:'+ac.col+'">'+esc(rowInitials(c.templateName))+'</span>'+esc(c.templateName)+'</td>'+
        '<td>'+esc(c.branchName||'—')+'</td>'+
        '<td>'+(c.tag?'<span class="pill">'+esc(c.tag)+'</span>':'<span class="pill">All Tags</span>')+'</td>'+
        '<td>'+willSend+'</td>'+
        '<td>'+esc(leadsLine)+'<br><div class="progress-mini"><div style="width:'+pct+'%;'+(failed&&!sent?'background:#d03b3b':'')+'"></div></div></td>'+
        '<td>'+statusPill(c.status)+nextBatchNote_(c)+'</td>'+
        '<td>'+esc(fmtDateShort(c.createdAt))+'</td>'+
        '<td style="white-space:nowrap">'+
          '<button class="btn ghost sm" data-view="'+esc(c.campaignId)+'">View</button>'+
          (canManage()?actionButtons(c):'')+
        '</td></tr>';
    }).join('');
    body.querySelectorAll('[data-view]').forEach(function(b){ b.onclick=function(){ openPatientDelivery(b.getAttribute('data-view')); }; });
    body.querySelectorAll('[data-addleads]').forEach(function(b){ b.onclick=function(){ openAddLeadsModal(b.getAttribute('data-addleads'), loadHistoryT); }; });
    body.querySelectorAll('[data-setstatus]').forEach(function(b){
      b.onclick=function(){
        var id=b.getAttribute('data-setstatus'), st=b.getAttribute('data-tostatus');
        API.msgSetCampaignStatus(id, st).then(function(r){ if(!r.ok){ toast(r.error,true); return; } toast('Updated.'); loadHistoryT(); });
      };
    });
    body.querySelectorAll('[data-delete]').forEach(function(b){
      b.onclick=function(){ deleteCampaign_(b.getAttribute('data-delete'), b.getAttribute('data-code')); };
    });
    wireTimeButtons_(body, loadHistoryT);
  }
  function paintStatsT(){
    var box=$('tm_kpis'); if(!box) return;
    box.innerHTML='<div class="kpi"><div class="n">…</div><div class="l">Loading</div></div>';
    API.msgCampaignStats(FT.branchId, FT.tplId, 'timely').then(function(r){
      if(!r.ok){ box.innerHTML=''; return; }
      var pct=r.capTotal?Math.min(100,Math.round(r.capUsed/r.capTotal*100)):0;
      var deg=Math.round(pct*3.6);
      var tplCaption = FT.tplId ? ('For <b>'+esc(r.templateName||'')+'</b> template') : (r.templateName ? ('For <b>'+esc(r.templateName)+'</b> template') : 'Across all templates');
      box.innerHTML=
        '<div class="kpi"><div class="l">LEADS IN QUEUE</div><div class="n">'+money0(r.leadsInQueue)+'</div><div style="font-size:11.5px;color:var(--grey);margin-top:4px">'+tplCaption+'</div></div>'+
        '<div class="kpi"><div class="l">SENT TODAY</div><div class="n" style="color:var(--ok)">'+money0(r.sentToday)+'</div><div style="font-size:11.5px;color:var(--grey);margin-top:4px">'+(r.lastBatchAt?('batch closed '+esc(r.lastBatchAt)):'no batch yet today')+'</div></div>'+
        '<div class="kpi"><div class="l">PENDING IN QUEUE</div><div class="n" style="color:#c98500">'+money0(r.pending)+'</div><div style="font-size:11.5px;color:var(--grey);margin-top:4px">waiting on their own send date</div></div>'+
        '<div class="kpi"><div class="l">TODAY\'S DAILY LIMIT</div>'+
          '<div class="meter-wrap" style="margin-top:6px"><div class="meter-ring" style="background:conic-gradient(var(--red) 0deg '+deg+'deg, var(--line) '+deg+'deg 360deg)"><div class="hole">'+money0(r.capUsed)+'/'+money0(r.capTotal)+'</div></div>'+
          '<div class="meter-note"><b>'+pct+'% used</b><br>shared with Bulk Message Send</div></div></div>';
      $('tm_capLabel') && ($('tm_capLabel').textContent=(r.capTotal||250)+' / day (WhatsBizApp cap)');
    });
  }
  function exportHistoryT(){
    if(!CAMPS_T.length){ toast('Nothing to export yet.',true); return; }
    var rows=[['Code','Template','Branch','Tag','Will Send On','Send Time','Sent','Total','Status','Added On']];
    CAMPS_T.forEach(function(c){ rows.push([c.code,c.templateName,c.branchName,c.tag||'All Tags',c.scheduledDate?fmtDateShort(c.scheduledDate):'',c.sendTime,c.sent,c.total,c.status,fmtDateShort(c.createdAt)]); });
    downloadCsv('timely-message-history.csv', rows);
  }
  function openAddLeadsPickerT(){
    if(!CAMPS_T.length){ toast('Start (or save a draft of) a campaign first, then add leads to it.',true); return; }
    var opts=CAMPS_T.map(function(c){ return '<option value="'+esc(c.campaignId)+'">'+esc(c.code)+' — '+esc(c.templateName)+' · '+esc(c.branchName)+'</option>'; }).join('');
    openModal('Add Leads', '<div class="field"><label>Which campaign?</label><select id="alp_camp">'+opts+'</select></div>',
      '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="alp_go">Next</button>');
    $('alp_go').onclick=function(){ var id=$('alp_camp').value; closeModal(); openAddLeadsModal(id, loadHistoryT); };
  }

  /* Same "one tap, no Save/Start first" shortcut as Bulk Message Send's openAddLeadsForSetup —
     silently saves (or reuses) a draft campaign for exactly what's configured above (Branch,
     Template, Tag, Send Time, AND the currently-picked Send After date), then opens the same
     upload pop-up. Re-uses the existing draft instead of creating a duplicate as long as nothing
     in the setup box (including the Send After date) has changed since the last save. */
  function rememberSetupCampaignT_(campaignId, branchId, tpl, tag){
    var br=((S.meta&&S.meta.branches)||[]).filter(function(b){ return String(b.BranchID)===String(branchId); })[0];
    CAMPS_T = CAMPS_T.filter(function(x){ return x.campaignId!==campaignId; });
    CAMPS_T.push({campaignId:campaignId, templateName:tpl.name, branchName:br?br.BranchName:branchId, tag:tag});
    FT.lastCampaignId = campaignId;
    FT.lastKey = branchId+'|'+tpl.tplId+'|'+tag+'|'+$('tm_time').value+'|'+tmDateStr_(tmCurrentTargetDate_());
  }
  function openAddLeadsForSetupT(){
    var t=TPLMAP[FT.tplId];
    if(!t){ toast('Pick a template first.',true); return; }
    var branchId=$('tm_branch').value;
    if(!branchId){ toast('Pick a branch first.',true); return; }
    if(tplNeedsMoreThanBasics_(t)){
      toast('"'+t.name+'" needs more than Timely Message can fill in (a '+(t.headerType&&t.headerType!=='none'?t.headerType+' header and/or ':'')+'extra template values). Pick a template that only uses {{1}} branch name and {{2}} lead name.', true);
      return;
    }
    var tag=$('tm_tag').value||'', sendTime=$('tm_time').value||'02:00';
    var scheduledDate=tmDateStr_(tmCurrentTargetDate_());
    var key=branchId+'|'+FT.tplId+'|'+tag+'|'+sendTime+'|'+scheduledDate;
    if(FT.lastCampaignId && FT.lastKey===key){
      openAddLeadsModal(FT.lastCampaignId, loadHistoryT);
      return;
    }
    var btn=$('tm_addLeadsBox'); var was=btn.textContent; btn.disabled=true; btn.innerHTML='<span class="loader"></span> Preparing…';
    var data={ branchId:branchId, tplId:FT.tplId, tag:tag, sendTime:sendTime, kind:'timely', scheduledDate:scheduledDate, status:'draft' };
    API.msgSaveCampaign(data).then(function(r){
      btn.disabled=false; btn.textContent=was;
      if(!r.ok){ toast(r.error,true); return; }
      rememberSetupCampaignT_(r.campaignId, branchId, t, tag);
      loadHistoryT();
      openAddLeadsModal(r.campaignId, loadHistoryT);
    }).catch(function(){ btn.disabled=false; btn.textContent=was; toast('Needs an internet connection.',true); });
  }

  function saveTimelyCampaign(status){
    var t=TPLMAP[FT.tplId];
    if(!t){ toast('Pick a template first.',true); return; }
    var branchId=$('tm_branch').value;
    if(!branchId){ toast('Pick a branch.',true); return; }
    /* Same restriction as Bulk Message Send above (see tplNeedsMoreThanBasics_) — Timely Message
       can only fill {{1}} branch name and {{2}} lead name too, same reason: no media-header
       upload or {{3}}..{{n}} fields exist on this page. */
    if(tplNeedsMoreThanBasics_(t)){
      toast('"'+t.name+'" needs more than Timely Message can fill in (a '+(t.headerType&&t.headerType!=='none'?t.headerType+' header and/or ':'')+'extra template values). Pick a template that only uses {{1}} branch name and {{2}} lead name.', true);
      return;
    }
    var tag=$('tm_tag').value||'';
    var scheduledDate=tmDateStr_(tmCurrentTargetDate_());
    var data={ branchId:branchId, tplId:FT.tplId, tag:tag, sendTime:$('tm_time').value||'02:00',
               kind:'timely', scheduledDate:scheduledDate, status:status };
    var btn=status==='scheduled'?$('tm_start'):$('tm_saveDraft'); btn.disabled=true;
    API.msgSaveCampaign(data).then(function(r){
      btn.disabled=false;
      if(!r.ok){ toast(r.error,true); return; }
      rememberSetupCampaignT_(r.campaignId, branchId, t, tag);
      loadHistoryT();
      paintStatsT();
      toast((status==='scheduled'?'Scheduled — ':'Saved as draft — ')+'now add leads to say who gets it.');
    }).catch(function(){ btn.disabled=false; toast('Saving needs an internet connection.',true); });
  }

  window.renderBulkMsg=renderBulkMsg;
  window.renderTimelyMsg=renderTimelyMsg;
  /* exposed so app.js's Messaging nav-visibility block can reuse the same manage-permission rule
     without duplicating it — now covers both Messaging tabs */
  window.msgCanManageClient=canManage;
})();
