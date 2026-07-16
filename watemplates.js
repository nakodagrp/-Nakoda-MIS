/* Nakoda MIS — WhatsApp Templates registry (loads after app.js; reuses its globals: $, esc, val, toast, openModal, closeModal, S, API)
 * Manage every approved WhatsApp template in one menu. Reminder shown in the UI:
 * a template must ALSO be created + approved on each branch's number in whatsbizapi.com. */
(function(){
  var TPLS=[], TPLMAP={};

  var HEADER_TYPES=[['none','No header'],['text','Text header'],['image','Image header'],['document','Document (PDF) header'],['video','Video header']];
  var PURPOSES=[['general','General / promotional'],['membership_card','Membership card (used by Cards ▸ Send via Official API)']];

  function headerLabel(h){ var m={none:'None',text:'Text',image:'🖼 Image',document:'📄 Document',video:'🎬 Video'}; return m[h]||h||'—'; }
  function purposeBadge(p,cardTypeId){
    if(p==='membership_card') return '<span class="badge" style="background:#185fa522;color:#185fa5">Membership card'+(cardTypeId?(' · '+esc(cardTypeId)):' · all types')+'</span>';
    return '<span style="color:#888">General</span>';
  }
  function statusBadgeT(s){ var on=s!=='inactive'; return '<span class="badge" style="background:'+(on?'#1a7f37':'#9aa0a6')+'22;color:'+(on?'#1a7f37':'#9aa0a6')+'">'+(on?'active':'inactive')+'</span>'; }

  function renderWaTemplates(){
    var v=document.getElementById('page-watemplates');
    v.innerHTML=
      '<div class="page-head"><h1>WhatsApp Templates</h1><div class="spacer"></div>'+
        '<button class="btn" id="wtAddBtn">+ Add template</button></div>'+
      '<div style="background:#fff7e6;border:1px solid #f3d98a;border-radius:10px;padding:9px 12px;font-size:12.5px;color:#7a5b00;margin-bottom:12px">'+
        'ℹ Templates listed here are the MIS registry. Each template must ALSO be created and <b>approved</b> on every branch\'s WhatsApp number in whatsbizapi.com — same name and language everywhere.</div>'+
      '<div class="card"><div id="wtList" class="center-load"><span class="loader dark"></span> Loading…</div></div>';
    document.getElementById('wtAddBtn').onclick=function(){ openTplEditor(null); };
    load();
  }
  function load(){
    var box=document.getElementById('wtList');
    API.listWaTemplates().then(function(r){
      if(!r.ok){ box.className=''; box.innerHTML='<div class="empty">'+esc(r.error||'Could not load templates.')+'</div>'; return; }
      TPLS=r.templates||[]; TPLMAP={}; TPLS.forEach(function(t){ TPLMAP[t.tplId]=t; });
      paint();
    }).catch(function(){ box.className=''; box.innerHTML='<div class="empty">Templates need an internet connection.</div>'; });
  }
  function paint(){
    var box=document.getElementById('wtList'); if(!box) return; box.className='';
    if(!TPLS.length){ box.innerHTML='<div class="empty">No templates yet. Tap “+ Add template” to register your first one (e.g. membership_card).</div>'; return; }
    box.innerHTML='<div class="table-wrap"><table><thead><tr><th>Template</th><th>Lang</th><th>Header</th><th>Params</th><th>Use for</th><th>Status</th><th></th><th></th></tr></thead><tbody>'+
      TPLS.map(function(t){
        return '<tr>'+
          '<td><b>'+esc(t.name)+'</b>'+(t.notes?('<br><small style="color:#888">'+esc(String(t.notes).slice(0,60))+'</small>'):'')+'</td>'+
          '<td>'+esc(t.language||'en')+'</td>'+
          '<td>'+headerLabel(String(t.headerType||'none'))+'</td>'+
          '<td>'+esc(t.paramCount||0)+'</td>'+
          '<td>'+purposeBadge(String(t.purpose||'general'),String(t.cardTypeId||''))+'</td>'+
          '<td>'+statusBadgeT(String(t.status))+'</td>'+
          '<td><button class="btn ghost sm" data-test="'+esc(t.tplId)+'">📶 Test</button></td>'+
          '<td><button class="btn ghost sm" data-edit="'+esc(t.tplId)+'">Edit</button></td></tr>';
      }).join('')+'</tbody></table></div>';
    box.querySelectorAll('[data-edit]').forEach(function(b){ b.onclick=function(){ openTplEditor(b.getAttribute('data-edit')); }; });
    box.querySelectorAll('[data-test]').forEach(function(b){ b.onclick=function(){ openTplTest(b.getAttribute('data-test')); }; });
  }

  /* ── add / edit ─────────────────────────────────────────────── */
  function openTplEditor(tplId){
    API.listCardTypes().then(function(r){ openTplEditor2(tplId,(r&&r.ok)?(r.types||[]):[]); })
      .catch(function(){ openTplEditor2(tplId,[]); });
  }
  function openTplEditor2(tplId,cardTypes){
    var t=tplId?(TPLMAP[tplId]||{}):{language:'en',headerType:'image',paramCount:0,purpose:'general',status:'active'};
    var htOpts=HEADER_TYPES.map(function(h){ return '<option value="'+h[0]+'"'+(h[0]===String(t.headerType)?' selected':'')+'>'+h[1]+'</option>'; }).join('');
    var puOpts=PURPOSES.map(function(p){ return '<option value="'+p[0]+'"'+(p[0]===String(t.purpose)?' selected':'')+'>'+p[1]+'</option>'; }).join('');
    var ctOpts='<option value="">All card types (generic)</option>'+cardTypes.map(function(ct){ return '<option value="'+esc(ct.typeId)+'"'+(String(ct.typeId)===String(t.cardTypeId||'')?' selected':'')+'>'+esc(ct.name)+' ('+esc(ct.typeId)+')</option>'; }).join('');
    var body='<div class="grid2">'+
      '<div class="field"><label>Template name * (exactly as in Meta)</label><input id="wt_name" value="'+esc(t.name||'')+'" placeholder="membership_card" style="text-transform:lowercase"></div>'+
      '<div class="field"><label>Language code</label><input id="wt_lang" value="'+esc(t.language||'en')+'" placeholder="en"></div>'+
      '<div class="field"><label>Header type</label><select id="wt_header">'+htOpts+'</select></div>'+
      '<div class="field"><label>Body variables ({{1}}, {{2}}…)</label><input id="wt_params" type="number" min="0" max="20" value="'+esc(t.paramCount||0)+'"></div>'+
      '<div class="field"><label>Use for</label><select id="wt_purpose">'+puOpts+'</select></div>'+
      '<div class="field"><label>Card type (Membership card only)</label><select id="wt_cardtype">'+ctOpts+'</select></div>'+
      '<div class="field full" style="margin-top:-6px"><div style="font-size:11px;color:#999">For "Membership card": pick a card type to use this template only for that type (e.g. one per type with its own benefits in the body). "All card types" is the fallback when a type has no template of its own.</div></div>'+
      '<div class="field full"><label>Variable hints (one per line, e.g. "1 = customer name") — for your team\'s reference</label><textarea id="wt_hints" rows="4">'+esc(t.paramHints||'')+'</textarea></div>'+
      '<div class="field full"><label>Notes (what is this template for?)</label><textarea id="wt_notes" rows="2">'+esc(t.notes||'')+'</textarea></div>'+
      '<div class="field full"><label>Status</label><select id="wt_status"><option value="active"'+(t.status!=='inactive'?' selected':'')+'>active</option><option value="inactive"'+(t.status==='inactive'?' selected':'')+'>inactive</option></select></div>'+
    '</div>';
    openModal(tplId?('Edit template · '+t.name):'Add WhatsApp template', body,
      '<button class="btn ghost" onclick="closeModal()">Cancel</button>'+
      (tplId?'<button class="btn ghost" id="wt_del" style="color:#C0392B">Delete</button>':'')+
      '<button class="btn" id="wt_save">'+(tplId?'Save':'Create')+'</button>');
    document.getElementById('wt_save').onclick=function(){
      var data={ tplId:tplId||'', name:val('wt_name').toLowerCase().trim(), language:val('wt_lang'),
        headerType:document.getElementById('wt_header').value, paramCount:val('wt_params'),
        purpose:document.getElementById('wt_purpose').value, cardTypeId:document.getElementById('wt_cardtype').value,
        paramHints:document.getElementById('wt_hints').value,
        notes:document.getElementById('wt_notes').value, status:document.getElementById('wt_status').value };
      if(!data.name){ toast('Template name is required.',true); return; }
      if(!/^[a-z0-9_]+$/.test(data.name)){ toast('Name: lowercase letters, numbers and _ only (must match Meta exactly).',true); return; }
      var btn=document.getElementById('wt_save'); btn.disabled=true; btn.innerHTML='<span class="loader"></span>';
      API.saveWaTemplate(data).then(function(r){
        if(r.ok){ closeModal(); toast('Template saved'); load(); }
        else { toast(r.error,true); btn.disabled=false; btn.textContent=tplId?'Save':'Create'; }
      }).catch(function(){ toast('Saving needs an internet connection.',true); btn.disabled=false; btn.textContent=tplId?'Save':'Create'; });
    };
    var del=document.getElementById('wt_del');
    if(del) del.onclick=function(){
      if(!confirm('Delete template "'+t.name+'" from the registry? (It stays in whatsbizapi.com/Meta — this only removes it from the MIS.)')) return;
      API.saveWaTemplate({tplId:tplId,_delete:true}).then(function(r){ if(r.ok){ closeModal(); toast('Deleted'); load(); } else toast(r.error,true); });
    };
  }

  /* ── test send ──────────────────────────────────────────────── */
  function openTplTest(tplId){
    var t=TPLMAP[tplId]; if(!t) return;
    var branches=((S.meta&&S.meta.branches)||[]);
    var withKey=branches.filter(function(b){ return b.WaTokenSet; });
    var brOpts=(withKey.length?withKey:branches).map(function(b){ return '<option value="'+esc(b.BranchID)+'">'+esc(b.BranchName)+(b.WaTokenSet?'':' (no key!)')+'</option>'; }).join('');
    var n=Math.max(0,Number(t.paramCount)||0), ht=String(t.headerType||'none');
    var hints=String(t.paramHints||'').split('\n');
    var paramInputs='';
    for(var i=0;i<n;i++){
      paramInputs+='<div class="field"><label>{{'+(i+1)+'}} '+esc((hints[i]||'').replace(/^\s*\d+\s*[=:-]\s*/,''))+'</label><input class="wtt_p" placeholder="Sample '+(i+1)+'"></div>';
    }
    var mediaField=(ht==='image'||ht==='document'||ht==='video')?
      '<div class="field full"><label>'+headerLabel(ht)+' URL * (public link WhatsApp can download)</label><input id="wtt_media" placeholder="https://…"></div>':'';
    var body='<div style="font-size:12.5px;color:#666;margin-bottom:10px">Sends a real message of <b>'+esc(t.name)+'</b> ('+esc(t.language||'en')+') using the selected branch\'s API key.</div>'+
      '<div class="grid2">'+
      '<div class="field"><label>Send from branch</label><select id="wtt_branch">'+brOpts+'</select></div>'+
      '<div class="field"><label>Send to (your mobile)</label><input id="wtt_phone" inputmode="numeric" placeholder="10-digit mobile"></div>'+
      mediaField+paramInputs+
      '</div><div id="wtt_status" style="font-size:12px;color:#666;margin-top:8px"></div>';
    openModal('Test · '+t.name, body,
      '<button class="btn ghost" onclick="closeModal()">Close</button><button class="btn" id="wtt_send">📶 Send test</button>');
    document.getElementById('wtt_send').onclick=function(){
      var ph=(val('wtt_phone')||'').replace(/\D/g,'');
      if(ph.length<10){ toast('Enter the mobile that should receive the test.',true); return; }
      var media=document.getElementById('wtt_media'); media=media?media.value.trim():'';
      if((ht==='image'||ht==='document'||ht==='video') && !media){ toast('Paste a public '+ht+' URL for the header.',true); return; }
      var params=[].map.call(document.querySelectorAll('.wtt_p'),function(x){ return x.value; });
      var btn=document.getElementById('wtt_send'), st=document.getElementById('wtt_status');
      btn.disabled=true; btn.innerHTML='<span class="loader"></span>'; st.textContent='Contacting whatsbizapi.com…';
      API.waTestTemplate(document.getElementById('wtt_branch').value, tplId, ph, params, media).then(function(r){
        btn.disabled=false; btn.textContent='📶 Send test';
        if(r.ok){ st.innerHTML='<span style="color:#1a7f37">✓ '+esc(r.message||'Sent.')+'</span>'; toast('Test sent — check WhatsApp.'); }
        else { st.innerHTML='<span style="color:#C0392B">✗ '+esc(r.error||'Failed')+'</span>'; toast(r.error||'Test failed',true); }
      }).catch(function(){ btn.disabled=false; btn.textContent='📶 Send test'; st.textContent='Network error — try again.'; });
    };
  }

  window.renderWaTemplates=renderWaTemplates;
})();
