/* Nakoda MIS — Membership Cards (loads after app.js; reuses its globals: $, esc, val, toast, openModal, closeModal, statusBadge, S, API) */
(function(){
  /* ── 15 premium themes (exact from ERP) ───────────────────────────────── */
  var CARD_THEMES = {
    HUNTER_GREEN:     { name:'Hunter Green',        bg:['#0A2E20','#14442F','#06231A'], foil:['#B58C2F','#ECC857','#8C6B1F'], labelMuted:'rgba(220,210,170,0.65)', valueColor:'#FAF5E6', guilloche:'rgba(236,200,87,0.06)' },
    MIDNIGHT_SAPPHIRE:{ name:'Midnight Sapphire',   bg:['#0E1B3D','#1F3066','#091226'], foil:['#A0AEC9','#EAEDF4','#8A95AC'], labelMuted:'rgba(195,210,240,0.65)', valueColor:'#FFFFFF', guilloche:'rgba(255,255,255,0.045)' },
    OXBLOOD:          { name:'Oxblood Burgundy',    bg:['#2A0810','#4F1620','#1F0410'], foil:['#C2A35E','#EBD08A','#9C7E3E'], labelMuted:'rgba(240,210,180,0.60)', valueColor:'#FAF0E6', guilloche:'rgba(235,208,138,0.05)' },
    AUBERGINE:        { name:'Imperial Aubergine',  bg:['#1A0628','#330F4F','#0F031C'], foil:['#B58C2F','#ECC857','#8C6B1F'], labelMuted:'rgba(220,195,240,0.60)', valueColor:'#F5ECF8', guilloche:'rgba(236,200,87,0.05)' },
    ANTHRACITE:       { name:'Anthracite Charcoal', bg:['#1A1D26','#2C3140','#0E1018'], foil:['#A0AEC9','#EAEDF4','#8A95AC'], labelMuted:'rgba(200,210,225,0.55)', valueColor:'#F5F7FA', guilloche:'rgba(255,255,255,0.04)' },
    EMERALD_ROSE:     { name:'Emerald & Rose Gold', bg:['#08322A','#10544A','#062821'], foil:['#B57778','#E8B8B0','#9C5E5E'], labelMuted:'rgba(232,184,176,0.60)', valueColor:'#FBEFEA', guilloche:'rgba(232,184,176,0.06)' },
    CHAMPAGNE_GOLD:   { name:'Champagne Gold',      bg:['#FFFBEC','#FBEFC3','#E8CB85'], foil:['#9A6B17','#E6BE3F','#7D5410'], labelMuted:'rgba(110,75,20,0.60)',   valueColor:'#3D2400', guilloche:'rgba(100,70,10,0.05)', light:true },
    ONYX:             { name:'Onyx Black',          bg:['#0A0A0E','#1A1A20','#000000'], foil:['#A0AEC9','#EAEDF4','#8A95AC'], labelMuted:'rgba(200,210,225,0.45)', valueColor:'#FFFFFF', guilloche:'rgba(255,255,255,0.035)' },
    MAROON_CHAMPAGNE: { name:'Maroon Champagne',    bg:['#3A0A10','#5F1820','#26050A'], foil:['#C2A35E','#EBD08A','#9C7E3E'], labelMuted:'rgba(232,210,160,0.60)', valueColor:'#FAF1E6', guilloche:'rgba(235,208,138,0.05)' },
    SLATE_TEAL:       { name:'Slate Teal',          bg:['#0A2530','#143842','#061923'], foil:['#A0AEC9','#EAEDF4','#8A95AC'], labelMuted:'rgba(190,215,225,0.60)', valueColor:'#EDF6F8', guilloche:'rgba(255,255,255,0.04)' },
    COPPER_BRONZE:    { name:'Copper Bronze',       bg:['#5C2E0E','#8B4513','#3E1D08'], foil:['#C2A35E','#EBD08A','#9C7E3E'], labelMuted:'rgba(240,215,175,0.62)', valueColor:'#FDF3E7', guilloche:'rgba(235,208,138,0.055)' },
    SLATE_INDIGO:     { name:'Slate Indigo',        bg:['#1A1F6E','#2E3599','#0F1248'], foil:['#A0AEC9','#EAEDF4','#8A95AC'], labelMuted:'rgba(195,200,245,0.62)', valueColor:'#EEF0FF', guilloche:'rgba(255,255,255,0.042)' },
    FOREST_SAGE:      { name:'Forest Sage',         bg:['#1E3D0A','#355C12','#12270A'], foil:['#B58C2F','#ECC857','#8C6B1F'], labelMuted:'rgba(210,230,185,0.62)', valueColor:'#F2FAE8', guilloche:'rgba(236,200,87,0.055)' },
    DUSTY_ROSE:       { name:'Dusty Rose',          bg:['#5C2D38','#8C4A58','#3D1A23'], foil:['#C2A35E','#EBD08A','#9C7E3E'], labelMuted:'rgba(240,205,215,0.60)', valueColor:'#FDF0F3', guilloche:'rgba(235,208,138,0.05)' },
    GRAPHITE_STEEL:   { name:'Graphite Steel',      bg:['#1C2530','#2E3D4F','#101820'], foil:['#A0AEC9','#EAEDF4','#8A95AC'], labelMuted:'rgba(195,210,228,0.58)', valueColor:'#EDF2F7', guilloche:'rgba(255,255,255,0.038)' }
  };
  function resolveTheme(type){
    var id=(type&&type.themeId)?String(type.themeId).toUpperCase():null;
    if(id&&CARD_THEMES[id]) return CARD_THEMES[id];
    var n=(type&&type.name?type.name:'').toUpperCase();
    if(n.indexOf('PLATINUM')>=0) return CARD_THEMES.HUNTER_GREEN;
    if(n.indexOf('GOLD')>=0) return CARD_THEMES.CHAMPAGNE_GOLD;
    return CARD_THEMES.HUNTER_GREEN;
  }
  function fmtExpiry(d){ if(!d) return ''; var x=new Date(d); if(isNaN(x)) return ''; return String(x.getMonth()+1).padStart(2,'0')+'/'+x.getFullYear(); }
  function fmtDate(d){ if(!d) return ''; var x=new Date(d); if(isNaN(x)) return String(d); return String(x.getDate()).padStart(2,'0')+'/'+String(x.getMonth()+1).padStart(2,'0')+'/'+x.getFullYear(); }

  function roundRect(c,x,y,w,h,r){ c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath(); }

  /* ── exact card renderer ──────────────────────────────────────────────── */
  function drawCard(canvas, card, type){
    var ctx=canvas.getContext('2d'), W=canvas.width, H=canvas.height;
    var typeUpper=(type&&type.name?type.name:'').toUpperCase();
    var theme=resolveTheme(type), isLight=!!theme.light, isDark=!isLight;
    var bg=ctx.createLinearGradient(0,0,W,H); bg.addColorStop(0,theme.bg[0]); bg.addColorStop(0.55,theme.bg[1]); bg.addColorStop(1,theme.bg[2]);
    var labelMuted=theme.labelMuted, valueColor=theme.valueColor, foil=theme.foil;
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
    ctx.save(); ctx.strokeStyle=theme.guilloche; ctx.lineWidth=1;
    var cx=W*1.05, cy=H*0.45; for(var r=60;r<W*1.2;r+=16){ ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI*0.55,Math.PI*1.45); ctx.stroke(); } ctx.restore();
    var logoX=W*0.06, logoY=H*0.08, wordSize=Math.round(H*0.14);
    ctx.font='700 '+wordSize+'px Georgia, "Times New Roman", serif'; ctx.textAlign='left'; ctx.textBaseline='top';
    var wWidth=ctx.measureText('NAKODA').width;
    var wf=ctx.createLinearGradient(logoX,logoY,logoX+wWidth,logoY+wordSize); wf.addColorStop(0,foil[0]); wf.addColorStop(0.5,foil[1]); wf.addColorStop(1,foil[2]);
    ctx.fillStyle=wf; ctx.fillText('NAKODA',logoX,logoY);
    var subSize=Math.round(H*0.038); ctx.font='500 italic '+subSize+'px Georgia, serif'; ctx.fillStyle=wf;
    ctx.fillText('Diagnostics & Research Center',logoX,logoY+wordSize+8);
    if(typeUpper){
      var tf=Math.round(H*0.052); ctx.font='500 '+tf+'px Georgia, serif'; ctx.textAlign='right'; ctx.textBaseline='top';
      var tX=W-W*0.06, tY=H*0.10, letters=typeUpper.split(''), sp=Math.round(tf*0.30), tw=0;
      letters.forEach(function(L){ tw+=ctx.measureText(L).width+sp; }); tw-=sp;
      var fg=ctx.createLinearGradient(tX-tw,tY,tX,tY+tf); fg.addColorStop(0,foil[0]); fg.addColorStop(0.5,foil[1]); fg.addColorStop(1,foil[2]);
      ctx.fillStyle=fg; var cur=tX;
      for(var i=letters.length-1;i>=0;i--){ var lw=ctx.measureText(letters[i]).width; ctx.textAlign='left'; ctx.fillText(letters[i],cur-lw,tY); cur-=(lw+sp); }
      ctx.fillStyle=fg; ctx.fillRect(tX-tw,tY+tf+6,tw,1);
    }
    var chipW=W*0.10, chipH=chipW*0.78, chipX=W*0.06, chipY=H*0.38;
    var cm=ctx.createLinearGradient(chipX,chipY,chipX+chipW,chipY+chipH); cm.addColorStop(0,foil[0]); cm.addColorStop(0.5,foil[1]); cm.addColorStop(1,foil[2]);
    ctx.fillStyle=cm; roundRect(ctx,chipX,chipY,chipW,chipH,8); ctx.fill();
    var pad=5, ig=ctx.createLinearGradient(chipX,chipY,chipX+chipW,chipY+chipH); ig.addColorStop(0,foil[0]); ig.addColorStop(1,foil[2]);
    ctx.fillStyle=ig; roundRect(ctx,chipX+pad,chipY+pad,chipW-pad*2,chipH-pad*2,5); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.30)'; ctx.lineWidth=1.2;
    for(var ri=1;ri<4;ri++){ var yy=chipY+pad+((chipH-pad*2)*ri/4); ctx.beginPath(); ctx.moveTo(chipX+pad,yy); ctx.lineTo(chipX+chipW-pad,yy); ctx.stroke(); }
    for(var ci=1;ci<3;ci++){ var xx=chipX+pad+((chipW-pad*2)*ci/3); ctx.beginPath(); ctx.moveTo(xx,chipY+pad); ctx.lineTo(xx,chipY+chipH-pad); ctx.stroke(); }
    var num=Math.round(H*0.085); ctx.font='600 '+num+'px "SF Mono","Consolas","Courier New",monospace'; ctx.textAlign='left'; ctx.textBaseline='top'; ctx.fillStyle=valueColor;
    ctx.fillText(String(card.cardNumber||''),W*0.06,H*0.59);
    ctx.fillStyle=labelMuted; ctx.font='600 '+Math.round(H*0.030)+'px Georgia, serif'; ctx.textAlign='left';
    ctx.fillText('MEMBER NAME',W*0.06,H*0.77);
    ctx.fillStyle=valueColor; ctx.font='700 '+Math.round(H*0.062)+'px Georgia, serif';
    ctx.fillText(String(card.holderName||'').toUpperCase(),W*0.06,H*0.82);
    ctx.fillStyle=labelMuted; ctx.font='600 '+Math.round(H*0.030)+'px Georgia, serif'; ctx.textAlign='right';
    ctx.fillText('VALID THRU',W*0.94,H*0.77);
    ctx.fillStyle=valueColor; ctx.font='700 '+Math.round(H*0.062)+'px Georgia, serif';
    ctx.fillText(fmtExpiry(card.expiryDate),W*0.94,H*0.82);
    ctx.strokeStyle=isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)'; ctx.lineWidth=1.5; roundRect(ctx,8,8,W-16,H-16,18); ctx.stroke();
  }
  function newCardCanvas(){ var c=document.createElement('canvas'); c.width=1012; c.height=638; c.style.width='100%'; c.style.borderRadius='12px'; c.style.display='block'; return c; }

  /* ── state ────────────────────────────────────────────────────────────── */
  var TYPES=[], TYPEMAP={};
  function loadTypes(){ return API.listCardTypes().then(function(r){ if(r.ok){ TYPES=r.types||[]; TYPEMAP={}; TYPES.forEach(function(t){ TYPEMAP[t.typeId]=t; }); } return TYPES; }).catch(function(){ return TYPES; }); }

  /* ── list page ────────────────────────────────────────────────────────── */
  var _canIssue=false;
  function renderMembershipCards(){
    var v=document.getElementById('page-cards');
    v.innerHTML=
      '<div class="page-head"><h1>Membership Cards</h1><div class="spacer"></div>'+
        '<button class="btn ghost" id="cardTypesBtn">Card types</button>'+
        '<button class="btn" id="issueCardBtn">+ Issue card</button></div>'+
      '<div id="cardExpBanner"></div>'+
      '<div class="card"><div class="toolbar">'+
        '<input class="search" id="cardSearch" placeholder="Search name, number, mobile…">'+
        '<select id="cardStatus"><option value="">All status</option><option value="active">Active</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option><option value="renewed">Renewed</option></select>'+
      '</div><div id="cardList" class="center-load"><span class="loader dark"></span> Loading…</div></div>';
    document.getElementById('issueCardBtn').onclick=function(){ openIssueCardModal(); };
    document.getElementById('cardTypesBtn').onclick=function(){ openCardTypes(); };
    var deb; document.getElementById('cardSearch').addEventListener('input',function(){ clearTimeout(deb); deb=setTimeout(load,250); });
    document.getElementById('cardStatus').addEventListener('change',load);
    loadTypes().then(load);
    API.cardSummary().then(function(r){ if(r.ok){ var b=document.getElementById('cardExpBanner'); if(r.expiringSoon>0) b.innerHTML='<div style="background:#fff7e6;border:1px solid #f3d98a;border-radius:10px;padding:9px 12px;font-size:13px;color:#7a5b00;margin-bottom:12px">⏳ '+r.expiringSoon+' card(s) expiring within 7 days</div>'; } });

    function load(){
      var filter={ search:document.getElementById('cardSearch').value.trim(), status:document.getElementById('cardStatus').value };
      var box=document.getElementById('cardList'); box.className='center-load'; box.innerHTML='<span class="loader dark"></span> Loading…';
      API.listCards(filter).then(function(r){
        if(!r.ok){ box.className=''; box.innerHTML='<div class="empty">'+esc(r.error)+'</div>'; return; }
        _canIssue=r.perms&&r.perms.canIssue;
        document.getElementById('issueCardBtn').style.display=_canIssue?'':'none';
        document.getElementById('cardTypesBtn').style.display=(r.perms&&r.perms.canManageTypes)?'':'none';
        var list=r.cards||[]; box.className='';
        if(!list.length){ box.innerHTML='<div class="empty">No cards yet. Tap “+ Issue card”. <br><small>(If you migrated old cards, make sure the Membership_Cards sheet is copied in.)</small></div>'; return; }
        box.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;padding:14px">'+
          list.map(function(c,i){ return '<div data-cn="'+esc(c.cardNumber)+'" class="mcardwrap" style="cursor:pointer"><div id="lc'+i+'"></div>'+
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:12.5px"><span style="color:#888">'+esc(c.holderName)+' · '+esc(c.mobile)+'</span>'+cstatus(c.status)+'</div></div>'; }).join('')+'</div>';
        list.forEach(function(c,i){ var cv=newCardCanvas(); document.getElementById('lc'+i).appendChild(cv); drawCard(cv,c,TYPEMAP[c.typeId]); });
        box.querySelectorAll('.mcardwrap').forEach(function(el){ el.onclick=function(){ openCardDetail(el.getAttribute('data-cn')); }; });
      });
    }
  }
  function cstatus(s){ var m={active:'#1a7f37',expired:'#9aa0a6',cancelled:'#C0392B',renewed:'#185fa5'}; return '<span class="badge" style="background:'+(m[s]||'#999')+'22;color:'+(m[s]||'#999')+'">'+esc(s||'active')+'</span>'; }

  /* ── card detail ──────────────────────────────────────────────────────── */
  function openCardDetail(cardNumber){
    API.getCard(cardNumber).then(function(r){
      if(!r.ok){ toast(r.error,true); return; }
      var c=r.card, t=r.type;
      var body='<div id="cardCanvasBox"></div>'+
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">'+
          '<button class="btn" id="dlPng" style="flex:1;min-width:120px"><i></i>⬇ Download</button>'+
          '<button class="btn" id="shWa" style="flex:1;min-width:120px;background:#1ba94c">⤴ WhatsApp</button>'+
        '</div>'+
        (r.canIssue?'<div style="display:flex;gap:8px;margin-top:8px"><button class="btn ghost" id="renewC" style="flex:1">↻ Renew</button>'+(c.status==='active'?'<button class="btn ghost" id="cancelC" style="flex:1;color:#C0392B">Cancel</button>':'')+'</div>':'')+
        '<div style="margin-top:12px;font-size:13px;color:#555;line-height:1.7">'+
          '<b>'+esc(t?t.name:c.typeId)+'</b> · '+esc(r.branchName)+'<br>'+
          'Status: '+esc(c.status)+' · Issued '+fmtDate(c.issuedDate)+' · Valid thru '+fmtExpiry(c.expiryDate)+
          (t&&t.benefitsText?'<div style="margin-top:8px;white-space:pre-line;background:#f6f7f9;border-radius:8px;padding:10px;font-size:12.5px">'+esc(t.benefitsText)+'</div>':'')+
        '</div>';
      openModal('Card · '+c.cardNumber, body, '<button class="btn ghost" onclick="closeModal()">Close</button>');
      var cv=newCardCanvas(); document.getElementById('cardCanvasBox').appendChild(cv); drawCard(cv,c,t);
      document.getElementById('dlPng').onclick=function(){ var a=document.createElement('a'); a.download='Nakoda-Card-'+c.cardNumber+'.png'; a.href=cv.toDataURL('image/png'); a.click(); };
      document.getElementById('shWa').onclick=function(){ shareCard(cv,c,t,r.branchName); };
      var rn=document.getElementById('renewC'); if(rn) rn.onclick=function(){ if(!confirm('Renew this card? A new card with a fresh '+(t?t.validityMonths:12)+'-month validity will be issued.')) return; API.renewCard(c.cardNumber).then(function(rr){ if(rr.ok){ closeModal(); toast('Card renewed: '+rr.card.cardNumber); renderMembershipCards(); } else toast(rr.error,true); }); };
      var cn=document.getElementById('cancelC'); if(cn) cn.onclick=function(){ var why=prompt('Reason for cancelling?',''); if(why===null) return; API.cancelCard(c.cardNumber,why).then(function(rr){ if(rr.ok){ closeModal(); toast('Card cancelled'); renderMembershipCards(); } else toast(rr.error,true); }); };
    });
  }
  function waMessage(c,t,branchName){
    return 'Dear '+(c.holderName||'Member')+',\n\nWelcome to Nakoda Diagnostics! Your '+(t?t.name:'')+' membership card is active.\n'+
      'Card No: '+c.cardNumber+'\nValid till: '+fmtExpiry(c.expiryDate)+'\nBranch: '+branchName+'\n'+
      (t&&t.benefitsText?('\nYour benefits:\n'+t.benefitsText+'\n'):'')+
      '\nFor You, At Your Doorstep.';
  }
  function shareCard(cv,c,t,branchName){
    var msg=waMessage(c,t,branchName);
    if(cv.toBlob && navigator.canShare){
      cv.toBlob(function(blob){
        var file=new File([blob],'Nakoda-Card-'+c.cardNumber+'.png',{type:'image/png'});
        if(navigator.canShare({files:[file]})){ navigator.share({files:[file],text:msg,title:'Nakoda Membership Card'}).catch(function(){}); }
        else { window.open('https://wa.me/'+(c.mobile?('91'+c.mobile):'')+'?text='+encodeURIComponent(msg),'_blank'); }
      },'image/png');
    } else { window.open('https://wa.me/'+(c.mobile?('91'+c.mobile):'')+'?text='+encodeURIComponent(msg),'_blank'); }
  }

  /* ── issue modal ──────────────────────────────────────────────────────── */
  function openIssueCardModal(){
    if(!TYPES.length){ toast('No card types yet. Add one in “Card types”, or migrate them in.',true); }
    var branches=(S.meta&&S.meta.branches)||[];
    var brOpts=branches.map(function(b){ return '<option value="'+esc(b.BranchID)+'"'+(b.BranchID===(S.user&&S.user.Branch)?' selected':'')+'>'+esc(b.BranchName)+'</option>'; }).join('');
    var typeOpts=TYPES.map(function(t){ return '<option value="'+esc(t.typeId)+'">'+esc(t.name)+'</option>'; }).join('');
    var body='<div class="grid2">'+
      '<div class="field"><label>Member name *</label><input id="ic_name"></div>'+
      '<div class="field"><label>Mobile (10 digits) *</label><input id="ic_mobile" inputmode="numeric" maxlength="10"></div>'+
      '<div class="field"><label>Branch</label><select id="ic_branch">'+brOpts+'</select></div>'+
      '<div class="field"><label>Card type *</label><select id="ic_type">'+typeOpts+'</select></div>'+
      '<div class="field full"><label>Referred by (optional)</label><input id="ic_refer"></div>'+
      '<div class="field full"><label>Preview</label><div id="ic_preview"></div></div>'+
    '</div>';
    openModal('Issue Membership Card', body, '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="ic_save">Create card</button>');
    var pv=document.getElementById('ic_preview'), cv=newCardCanvas(); pv.appendChild(cv);
    function redraw(){ var t=TYPEMAP[document.getElementById('ic_type').value]; drawCard(cv,{cardNumber:'NAK-XXXX-00000',holderName:val('ic_name')||'MEMBER NAME',expiryDate:addMonths(t?t.validityMonths:12)},t); }
    document.getElementById('ic_type').addEventListener('change',redraw);
    document.getElementById('ic_name').addEventListener('input',redraw);
    redraw();
    document.getElementById('ic_save').onclick=function(){
      var data={ holderName:val('ic_name'), mobile:val('ic_mobile'), branchId:document.getElementById('ic_branch').value, typeId:document.getElementById('ic_type').value, referByName:val('ic_refer') };
      if(!data.holderName){ toast('Member name is required.',true); return; }
      if(!/^\d{10}$/.test(String(data.mobile||'').replace(/\D/g,''))){ toast('Enter a valid 10-digit mobile.',true); return; }
      if(!data.typeId){ toast('Select a card type.',true); return; }
      var btn=document.getElementById('ic_save'); btn.disabled=true; btn.innerHTML='<span class="loader"></span> Creating…';
      API.issueCard(data).then(function(r){
        if(r.ok){ closeModal(); toast('Card issued: '+r.card.cardNumber); openCardDetail(r.card.cardNumber); renderMembershipCards(); return; }
        if(String(r.error).indexOf('DUPLICATE')===0){
          if(confirm(r.error.replace('DUPLICATE: ','')+'\n\nReplace the old card and issue this new one?')){ data.replaceExisting=true; return API.issueCard(data).then(function(r2){ if(r2.ok){ closeModal(); toast('Card issued: '+r2.card.cardNumber); openCardDetail(r2.card.cardNumber); renderMembershipCards(); } else toast(r2.error,true); }); }
        } else { toast(r.error,true); }
        btn.disabled=false; btn.textContent='Create card';
      }).catch(function(){ toast('Issuing a card needs an internet connection.',true); btn.disabled=false; btn.textContent='Create card'; });
    };
  }
  function addMonths(m){ var d=new Date(); d.setMonth(d.getMonth()+(Number(m)||12)); return d; }

  /* ── card types management ────────────────────────────────────────────── */
  function openCardTypes(){
    loadTypes().then(function(){
      var rows=TYPES.map(function(t){ return '<tr><td><b>'+esc(t.name)+'</b><br><small style="color:#888">'+esc(t.typeId)+'</small></td><td>'+esc(t.validityMonths)+'m</td><td>'+esc(themeName(t.themeId))+'</td><td><button class="btn ghost sm" onclick="window._editCardType(\''+esc(t.typeId)+'\')">Edit</button></td></tr>'; }).join('');
      var body='<div class="table-wrap"><table><thead><tr><th>Type</th><th>Validity</th><th>Design</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="4" class="empty">No types — migrate them or add one.</td></tr>')+'</tbody></table></div>';
      openModal('Card Types', body, '<button class="btn ghost" onclick="closeModal()">Close</button><button class="btn" onclick="window._editCardType()">+ Add type</button>');
    });
  }
  function themeName(id){ var t=CARD_THEMES[String(id||'').toUpperCase()]; return t?t.name:(id||'Hunter Green'); }
  window._editCardType=function(typeId){
    var t=typeId?(TYPEMAP[typeId]||{}):{validityMonths:12,themeId:'HUNTER_GREEN'};
    var themeOpts=Object.keys(CARD_THEMES).map(function(k){ return '<option value="'+k+'"'+(k===String(t.themeId||'').toUpperCase()?' selected':'')+'>'+CARD_THEMES[k].name+'</option>'; }).join('');
    var body='<div class="grid2">'+
      '<div class="field"><label>Type ID</label><input id="ct_id" value="'+esc(t.typeId||'')+'"'+(typeId?' disabled':'')+' placeholder="e.g. GOLD"></div>'+
      '<div class="field"><label>Name *</label><input id="ct_name" value="'+esc(t.name||'')+'"></div>'+
      '<div class="field"><label>Validity (months)</label><input id="ct_val" type="number" value="'+esc(t.validityMonths||12)+'"></div>'+
      '<div class="field"><label>Design (theme)</label><select id="ct_theme">'+themeOpts+'</select></div>'+
      '<div class="field full"><label>Benefits (one per line)</label><textarea id="ct_ben" rows="5">'+esc(t.benefitsText||'')+'</textarea></div>'+
    '</div>';
    openModal(typeId?('Edit type · '+t.name):'Add card type', body, '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="ct_save">Save</button>');
    document.getElementById('ct_save').onclick=function(){
      var data={ typeId:val('ct_id'), name:val('ct_name'), validityMonths:val('ct_val'), themeId:document.getElementById('ct_theme').value, benefitsText:document.getElementById('ct_ben').value };
      if(!data.name){ toast('Name is required.',true); return; }
      API.upsertCardType(data).then(function(r){ if(r.ok){ closeModal(); toast('Saved'); loadTypes(); } else toast(r.error,true); });
    };
  };

  window.renderMembershipCards=renderMembershipCards;
  window.openCardDetail=openCardDetail;
  window.openIssueCardModal=openIssueCardModal;
})();
