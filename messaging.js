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
  var TPLS=[], TPLMAP={}, TPL_ERR='';
  var CARDTYPES=[], CARDTYPEMAP={};   /* 19 Sep — card types (Membership Cards ▸ Card Types), fetched
    once so paintExtraFields() can auto-fill a template's own "Card Type" box instead of making you
    type it — see autofillKnownValue_ below. */
  var CAMPS=[];
  var F={ branchId:'', tplId:'', tag:'', tab:'all', lastCampaignId:'', lastKey:'', fixedParams:[], fpAuto:[], headerMediaUrl:'' };   /* current Campaign Setup (lastCampaignId/lastKey back the in-box "+ Add Leads" button below; fixedParams/headerMediaUrl back the "needs a bit more" box — see paintExtraFields. fpAuto[i] tracks whether fixedParams[i] was filled in BY the page (true — keeps following Branch/Template) or typed by hand (false — never touched again by autofill) */

  /* ============================================================ TIMELY MESSAGE (18 Sep)
     Second tab, same Campaign Setup + Add Leads pattern as Bulk Message Send above, minus a
     Campaign History table (removed at your request) and plus a "Send in (days)" box in place of
     the Daily Limit tile, which doesn't mean much for a one-off/small-list send. Backed by the
     same Msg_Campaigns/Msg_Recipients sheets, kept apart from Bulk Message Send campaigns purely
     by kind:'timely' (see apiMsgSaveCampaign/apiMsgListCampaigns in 27_Messaging.gs) so nothing
     about Bulk Message Send's own history or scheduling changes. Because there's no history table
     here to pick "which campaign?" from, "+ Add Leads" always targets the campaign you just
     saved/started in this browser tab (FT.lastCampaignId) — reload the page and save/start again
     if you want to add more leads to an older Timely message later. */
  var CAMPS_T=[];
  var FT={ branchId:'', tplId:'', tag:'', lastCampaignId:'' };
  function findCamp_(campaignId){
    return (CAMPS.filter(function(x){ return x.campaignId===campaignId; })[0]) ||
           (CAMPS_T.filter(function(x){ return x.campaignId===campaignId; })[0]);
  }
  function tmTargetDate_(days){
    var d=new Date(); d.setDate(d.getDate()+(Number(days)||0)); return d;
  }

  /* MIS, Operations Manager or Director/Admin can manage; everyone who can see this page (nav
     visibility is gated the same way in app.js) can view. Mirrors msgCanManage_ in 27_Messaging.gs
     — the server enforces this independently, this only decides which buttons are drawn (see the
     HANDOVER.txt note: "a hidden button is not a control"). */
  function canManage(){ return !!(S.perms && (S.perms.canManageAll || (S.user && S.user.Role==='Operations Manager'))); }

  function money0(n){ return Math.round(Number(n)||0).toLocaleString('en-IN'); }
  function digits(v){ return String(v==null?'':v).replace(/\D/g,''); }
  function mobile10(v){
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
  function tplOpts(cur){
    if(!TPLS.length) return '<option value="">'+esc(TPL_ERR ? ('Error: '+TPL_ERR) : 'No active templates — add one on WhatsApp Templates')+'</option>';
    return TPLS.map(function(t){
      var flag=tplNeedsMoreThanBasics_(t)?' — needs a bit more (see below)':'';
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
      (canManage()?
      '<div style="background:#fff8e6;border:1px solid #e8cf7a;border-radius:10px;padding:10px 14px;font-size:12.5px;color:#6b5410;margin-bottom:18px;font-weight:600">'+
        '+ NEW — templates needing more than branch/lead name (like your Gold / Platinum / Diamond card variants, each with their own benefits text and card image) are no longer blocked. Fill their extra values once per campaign right here.'+
      '</div>' : '')+
      '<div class="page-head"><h1>Bulk Message Send</h1>'+
        '<div style="flex:1;font-size:12.5px;color:var(--grey)">Send one approved WhatsApp template to a list of leads, for one branch and tag, on a daily schedule.</div>'+
        '<button class="btn ghost" id="bm_export">Export History</button>'+
        (canManage()?'<button class="btn" id="bm_addLeads">+ Add Leads</button>':'')+
      '</div>'+
      '<div class="kpis" id="bm_kpis"></div>'+
      (canManage()?
      '<div class="card" style="padding:20px 22px;margin-bottom:22px">'+
        '<h3 style="margin:0 0 3px">Campaign Setup</h3>'+
        '<div style="font-size:12px;color:var(--muted);margin-bottom:16px">Choose who gets the message, which template, and when it should go out.</div>'+
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
      (canManage()?
      '<div style="background:#e6f4ea;border:1px solid #b9dfc3;border-radius:10px;padding:12px 16px;font-size:12.5px;color:#1a7f37;font-weight:600;margin-bottom:22px">'+
        '✓ "Start Campaign" now works for membership_card / any Gold, Platinum, Diamond variant — no more "needs more than Bulk Message Send can fill in" error, as long as the image and the values above are filled in.'+
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

  function ensureTemplates(){
    return API.msgListTemplates().then(function(r){
      if(r.ok){ TPLS=r.templates||[]; TPLMAP={}; TPLS.forEach(function(t){ TPLMAP[t.tplId]=t; }); TPL_ERR=''; if(!TPLS.length) TPL_ERR='No templates are saved as Active on the WhatsApp Templates page yet.'; }
      else { TPL_ERR = r.error || 'Request failed.'; }
      return TPLS;
    }).catch(function(e){ TPL_ERR = 'Could not reach the server (' + (e && e.message ? e.message : 'network error') + ').'; return TPLS; });
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
    var n=Math.max(0,Number(t.paramCount)||0), extraCount=Math.max(0,n-2);
    var ht=String(t.headerType||'none'), needsMedia=['image','document','video'].indexOf(ht)>=0;
    if(!extraCount && !needsMedia){ box.innerHTML=''; return; }
    var hints=String(t.paramHints||'').split('\n');
    function hintFor(i){ var h=String(hints[i]||'').replace(/^\s*\d+\s*[=:-]\s*/,'').trim(); return h||('Value for {{'+(i+1)+'}}'); }
    var branchId = F.branchId || ($('bm_branch')?$('bm_branch').value:'');
    var mediaHtml = needsMedia ?
      '<div class="field full" style="margin-bottom:12px"><label>'+headerLabelMsg_(ht)+' for this campaign *</label>'+
        '<div style="display:flex;gap:10px;align-items:center">'+
          '<input type="file" id="bm_hdrFile" accept="'+(ht==='image'?'image/*':(ht==='video'?'video/*':'*/*'))+'" style="flex:1;border:1px solid var(--line);border-radius:9px;padding:8px 10px;font-size:12.5px">'+
          '<span id="bm_hdrStatus" style="font-size:11.5px;color:'+(F.headerMediaUrl?'#1a7f37':'var(--muted)')+';font-weight:'+(F.headerMediaUrl?'700':'400')+';white-space:nowrap">'+(F.headerMediaUrl?'Uploaded ✓':'One file, used for every message — see the note below')+'</span>'+
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
    var extraCount=Math.max(0,(Number(t.paramCount)||0)-2);
    var needsMedia=['image','document','video'].indexOf(String(t.headerType))>=0;
    return !!(extraCount || needsMedia);
  }
  /* Checks the CURRENT Campaign Setup box's extra fields are actually filled in for template t —
     returns an error string, or '' when everything needed is present. */
  function extraFieldsMissing_(t){
    if(!t) return '';
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

  function paintStats(){
    var box=$('bm_kpis'); if(!box) return;
    if(!F.tplId){ box.innerHTML=''; return; }
    box.innerHTML='<div class="kpi"><div class="n">…</div><div class="l">Loading</div></div>';
    API.msgCampaignStats(F.branchId, F.tplId).then(function(r){
      if(!r.ok){ box.innerHTML=''; return; }
      var pct=r.capTotal?Math.min(100,Math.round(r.capUsed/r.capTotal*100)):0;
      var deg=Math.round(pct*3.6);
      box.innerHTML=
        '<div class="kpi"><div class="l">LEADS IN QUEUE</div><div class="n">'+money0(r.leadsInQueue)+'</div><div style="font-size:11.5px;color:var(--grey);margin-top:4px">For <b>'+esc(r.templateName||'')+'</b> template</div></div>'+
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
        '<td>'+statusPill(c.status)+'</td>'+
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
  }
  function actionButtons(c){
    var s=String(c.status);
    var html=' <button class="btn ghost sm" data-addleads="'+esc(c.campaignId)+'">+ Leads</button>';
    if(s==='scheduled'||s==='in_progress') html+=' <button class="btn ghost sm" data-setstatus="'+esc(c.campaignId)+'" data-tostatus="paused">Pause</button>';
    if(s==='paused'||s==='draft') html+=' <button class="btn ghost sm" data-setstatus="'+esc(c.campaignId)+'" data-tostatus="scheduled">'+(s==='draft'?'Start':'Resume')+'</button>';
    if(['scheduled','in_progress','paused','draft'].indexOf(s)>=0) html+=' <button class="btn ghost sm danger" data-setstatus="'+esc(c.campaignId)+'" data-tostatus="cancelled">Cancel</button>';
    return html;
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
  function openAddLeadsModal(campaignId, doneCb){
    var c=findCamp_(campaignId);
    if(!c){ toast('Campaign not found — reload the page.',true); return; }
    var body=
      '<p style="font-size:12px;color:var(--muted);margin:0 0 14px">Adding to <b>'+esc(c.templateName)+'</b> · '+esc(c.branchName)+' · '+esc(c.tag||'All Tags')+' tag</p>'+
      '<label style="display:block;border:2px dashed var(--line);border-radius:12px;padding:24px 16px;text-align:center;background:#fafaf9;color:var(--grey);font-size:12.5px;cursor:pointer">'+
        '<div style="font-size:26px;margin-bottom:6px">⬆</div><div id="al_fname"><b>Drag &amp; drop Excel / CSV, or click to browse</b></div>'+
        '<div style="font-size:11px;margin-top:4px">Columns: name, mobile, tag (optional) — no size limit, a list of 20,000+ contacts is fine. Uploads in the background in small batches with automatic retry, so keep this tab open; a big file can take several minutes.</div>'+
        '<input type="file" id="al_file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label>'+
      '<div id="al_map"></div><div id="al_msg"></div>'+
      '<div style="display:flex;align-items:center;gap:10px;margin:14px 0;color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase">'+
        '<div style="flex:1;height:1px;background:var(--line)"></div>or add manually<div style="flex:1;height:1px;background:var(--line)"></div></div>'+
      '<div style="display:flex;gap:10px"><input id="al_manual" placeholder="Enter phone number" style="flex:1;padding:11px;border:1px solid var(--line);border-radius:9px">'+
        '<button class="btn ghost" id="al_manualAdd">+ Add</button></div>'+
      '<div id="al_prog" style="margin-top:12px"></div>';
    openModal('Add Leads', body, '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="al_go" disabled>Add Leads</button>');

    var parsed=null, manualRows=[];

    $('al_manualAdd').onclick=function(){
      var ph=mobile10($('al_manual').value);
      if(ph.length!==10){ toast('Enter a valid 10-digit mobile number.',true); return; }
      manualRows.push({name:'',mobile:ph,tag:c.tag||''});
      $('al_manual').value='';
      toast(manualRows.length+' manual number'+(manualRows.length===1?'':'s')+' queued — click "Add Leads" to save.');
      updateGoLabel();
    };
    function updateGoLabel(){
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
      var guess={ name:guessCol(headers,['patientname','name','fullname']), mobile:guessCol(headers,['mobile','phone','contact','number','cell']), tag:guessCol(headers,['tag']) };
      function sel(id,cur){ return '<select id="'+id+'">'+'<option value="-1">— not in this file —</option>'+headers.map(function(h,i){ return '<option value="'+i+'"'+(i===cur?' selected':'')+'>'+esc(h||('Column '+(i+1)))+'</option>'; }).join('')+'</select>'; }
      $('al_map').innerHTML='<div class="section-label" style="margin-top:14px">Match your columns</div>'+
        '<div class="card" style="padding:12px 14px"><div style="display:grid;grid-template-columns:100px 1fr;gap:9px 12px;align-items:center;font-size:12.5px">'+
        '<b>Name</b>'+sel('al_c_name',guess.name)+'<b>Mobile *</b>'+sel('al_c_mob',guess.mobile)+'<b>Tag</b>'+sel('al_c_tag',guess.tag)+
        '</div></div><div id="al_prev" style="margin-top:10px"></div>';
      ['al_c_name','al_c_mob','al_c_tag'].forEach(function(id){ $(id).onchange=preview; });
      function build(){
        var ci={name:parseInt($('al_c_name').value,10), mob:parseInt($('al_c_mob').value,10), tag:parseInt($('al_c_tag').value,10)};
        var out=[], bad=0;
        bodyRows.forEach(function(r){
          var mob=ci.mob>=0?mobile10(r[ci.mob]):'';
          if(mob.length!==10){ bad++; return; }
          out.push({name: ci.name>=0?String(r[ci.name]||'').trim():'', mobile:mob, tag: ci.tag>=0?String(r[ci.tag]||'').trim():''});
        });
        return {rows:out, bad:bad};
      }
      function preview(){
        var b=build(); parsed={rows:b.rows, fileName:fileName};
        $('al_prev').innerHTML='<div class="msg '+(b.rows.length?'ok':'error')+'" style="font-size:12.5px"><b>'+b.rows.length+'</b> lead'+(b.rows.length===1?'':'s')+' ready to add'+(b.bad?(' · <b>'+b.bad+'</b> skipped (missing/invalid mobile)'):'')+'</div>';
        updateGoLabel();
      }
      preview();
    }

    $('al_go').onclick=function(){
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
  function openPatientDelivery(campaignId){
    PD.campaignId=campaignId; PD.q=''; PD.status='all';
    openModal('Patient Delivery', '<div id="pd_body">'+loaderHtml()+'</div>', '<span id="pd_count" style="font-size:11.5px;color:var(--muted);flex:1"></span><button class="btn ghost" id="pd_export">Export List</button>');
    var m=document.querySelector('#modalRoot .modal'); if(m) m.style.maxWidth='920px';
    var mf=document.querySelector('#modalRoot .modal-foot'); if(mf) mf.style.display='flex', mf.style.justifyContent='space-between', mf.style.alignItems='center';
    $('pd_export').onclick=exportRecipients;
    loadDelivery();
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
            '<td><span class="badge" style="background:'+badge[1]+';color:'+badge[2]+'" title="'+esc(p.error||'')+'">'+esc(badge[0])+'</span></td>'+
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

  /* ============================================================ TIMELY MESSAGE PAGE */
  function renderTimelyMsg(){
    var v=$('page-timelymsg'); if(!v) return;
    v.innerHTML=
      '<div class="page-head"><h1>Timely Message</h1>'+
        '<div style="flex:1;font-size:12.5px;color:var(--grey)">Send one approved WhatsApp template to one or a few leads, on a day and time you pick.</div>'+
      '</div>'+
      (canManage()?
      '<div class="card" style="padding:20px 22px">'+
        '<h3 style="margin:0 0 3px">Campaign Setup</h3>'+
        '<div style="font-size:12px;color:var(--muted);margin-bottom:16px">Choose the template and branch, when it should go out, then add who gets it.</div>'+
        '<div class="grid2" style="grid-template-columns:repeat(5,1fr);gap:14px">'+
          '<div class="field"><label>Branch</label><select id="tm_branch">'+branchOptsPick('')+'</select></div>'+
          '<div class="field"><label>Template</label><select id="tm_tpl">'+tplOpts('')+'</select></div>'+
          '<div class="field"><label>Tag</label><select id="tm_tag">'+tagOpts('',true)+'</select></div>'+
          '<div class="field"><label>Send in (days)</label><input id="tm_days" type="number" min="0" step="1" value="0"></div>'+
          '<div class="field"><label>Send Time</label><input id="tm_time" type="time" value="02:00"></div>'+
        '</div>'+
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:18px;padding-top:16px;border-top:1px solid var(--line);flex-wrap:wrap;gap:12px">'+
          '<div style="font-size:12.5px;color:var(--grey)" id="tm_autoNote">—</div>'+
          '<div style="display:flex;gap:10px">'+
            '<button class="btn ghost" id="tm_saveDraft">Save as Draft</button>'+
            '<button class="btn" id="tm_start">Start</button>'+
            '<button class="btn ghost" id="tm_addLeads" disabled title="Save or start above first">+ Add Leads</button>'+
          '</div>'+
        '</div>'+
      '</div>' : '<div class="card" style="padding:20px 22px">You do not have access to send messages.</div>');

    if(!canManage()) return;

    $('tm_branch').onchange=function(){ FT.branchId=this.value; };
    $('tm_tpl').onchange=function(){ FT.tplId=this.value; };
    $('tm_tag').onchange=function(){ FT.tag=this.value; };
    $('tm_days').oninput=paintTimelyNote;
    $('tm_time').onchange=paintTimelyNote;
    $('tm_saveDraft').onclick=function(){ saveTimelyCampaign('draft'); };
    $('tm_start').onclick=function(){ saveTimelyCampaign('scheduled'); };
    $('tm_addLeads').onclick=function(){ if(FT.lastCampaignId) openAddLeadsModal(FT.lastCampaignId, function(){}); };

    ensureTemplates().then(function(){
      $('tm_tpl').innerHTML=tplOpts('');
      if(TPLS.length){ FT.tplId=TPLS[0].tplId; $('tm_tpl').value=FT.tplId; }
      paintTimelyNote();
    });
  }

  function paintTimelyNote(){
    var note=$('tm_autoNote'); if(!note) return;
    var days=Math.max(0, Math.round(Number($('tm_days') && $('tm_days').value)||0));
    var time=($('tm_time')&&$('tm_time').value)||'02:00';
    var dt=tmTargetDate_(days);
    note.innerHTML='Will send on <b>'+esc(fmtDateShort(dt))+'</b> at <b>'+esc(fmtTime12(time))+'</b>'+(days===0?' — i.e. today, as soon as you add leads.':'.');
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
    var days=Math.max(0, Math.round(Number($('tm_days').value)||0));
    var tag=$('tm_tag').value||'';
    var data={ branchId:branchId, tplId:FT.tplId, tag:tag, sendTime:$('tm_time').value||'02:00',
               kind:'timely', days:days, status:status };
    var btn=status==='scheduled'?$('tm_start'):$('tm_saveDraft'); btn.disabled=true;
    API.msgSaveCampaign(data).then(function(r){
      btn.disabled=false;
      if(!r.ok){ toast(r.error,true); return; }
      FT.lastCampaignId=r.campaignId;
      var br=((S.meta&&S.meta.branches)||[]).filter(function(b){ return String(b.BranchID)===String(branchId); })[0];
      CAMPS_T=CAMPS_T.filter(function(x){ return x.campaignId!==r.campaignId; });
      CAMPS_T.push({campaignId:r.campaignId, templateName:t.name, branchName:br?br.BranchName:branchId, tag:tag});
      var ab=$('tm_addLeads'); if(ab){ ab.disabled=false; ab.title=''; }
      toast((status==='scheduled'?'Scheduled — ':'Saved as draft — ')+'now click "+ Add Leads" to say who gets it.');
    }).catch(function(){ btn.disabled=false; toast('Saving needs an internet connection.',true); });
  }

  window.renderBulkMsg=renderBulkMsg;
  window.renderTimelyMsg=renderTimelyMsg;
  /* exposed so app.js's Messaging nav-visibility block can reuse the same manage-permission rule
     without duplicating it — now covers both Messaging tabs */
  window.msgCanManageClient=canManage;
})();
