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

  /* Used only when a card type has no benefitsText of its own. */
  var DEFAULT_BENEFITS = [
    'Get up to 50% discount on all in-house tests',
    'Get up to 20% discount on all outsourced tests',
    'Discount available on bills above \u20B9300',
    'Reports on priority',
    'Dedicated CRM officer',
    'Valid for all family members',
    '20% less on full body check-up packages'
  ];

  /* ══════════════════════════════════════════════════════════════════════════
     v332 · THE PICTURE THAT GOES OUT IS THE CARD **AND** ITS BENEFITS
     ─────────────────────────────────────────────────────────────────────────
     Every send path used to draw the 1012×638 card front and stop there, so the
     member received a card and no idea what it was worth — the benefits only
     existed as text further down the message, where nobody reads them, and not
     at all in the image they save to their gallery.

     buildCardImage() returns one taller canvas: the same front card on top
     (drawn by the very same drawCard(), so the card can never drift between
     screen, download and WhatsApp), the benefit list under it, and a footer
     carrying the card number and the lab's number.

     The height is measured rather than fixed. Four benefits give a shorter
     picture than nine, and a benefit too long for the width wraps onto a second
     line instead of running off the edge.
     ══════════════════════════════════════════════════════════════════════════ */
  var CIMG = {
    W:1080,      /* card front is 1012 wide, so PAD*2 + 1012 = 1080 exactly */
    PAD:34,      /* outer margin */
    GAP:26,      /* card ↔ benefits panel */
    PX:36,       /* padding inside the benefits panel */
    TICK:44,     /* column reserved for the gold tick */
    TITLE:29, SUB:18, BEN:25, LINE:34, ROWPAD:15, FOOT:19
  };

  /* Word-wrap against the real measured width of the real font. */
  function cimgWrap_(ctx, text, maxW){
    var words = String(text||'').split(/\s+/), lines = [], cur = '';
    for(var i=0;i<words.length;i++){
      var t = cur ? (cur + ' ' + words[i]) : words[i];
      if(cur && ctx.measureText(t).width > maxW){ lines.push(cur); cur = words[i]; }
      else cur = t;
    }
    if(cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  /* Letter-spaced, centred — canvas has no letter-spacing, so it is drawn a
     letter at a time, the same way drawCard() sets the card type. */
  function cimgSpaced_(ctx, text, cx, y, sp){
    var letters = String(text||'').split(''), tw = 0, i;
    for(i=0;i<letters.length;i++) tw += ctx.measureText(letters[i]).width + sp;
    tw -= sp;
    var x = cx - tw/2;
    for(i=0;i<letters.length;i++){ ctx.fillText(letters[i], x, y); x += ctx.measureText(letters[i]).width + sp; }
    return tw;
  }

  /* The list the customer sees, from Membership_Card_Types ▸ benefitsText.
     Strips a leading bullet or "1)" numbering but NOT a leading digit — otherwise
     "20% less on packages" loses its 20 — and drops a "Benefits:" heading line. */
  function cardBenefitLines(type, fallback){
    var t = (type && type.benefitsText) ? String(type.benefitsText) : '';
    var arr = t.split(/\r?\n/)
      .map(function(x){ return x.replace(/^\s*(?:[-•*✓✔]+|\d{1,2}\s*[.)])\s*/,'').trim(); })
      .filter(function(x){ return x.length > 1; })
      .filter(function(x){ return !/^(card\s+)?benefits?\s*[:\-–]?$/i.test(x); });
    return arr.length ? arr : (fallback || []);
  }

  /* card  — the Membership_Cards row
     type  — the Membership_Card_Types row (name, themeId, benefitsText)
     opts  — { benefits:[…] override, labPhone:'9512714001', labelText:'…' }
     returns a ready canvas. */
  function buildCardImage(card, type, opts){
    opts = opts || {};
    var W = CIMG.W, PAD = CIMG.PAD;
    var CARDW = W - PAD*2, CARDH = Math.round(CARDW * 638 / 1012);
    var theme = resolveTheme(type), foil = theme.foil;
    var typeName = String((type && type.name) || 'Membership').toUpperCase();
    var bens = (opts.benefits && opts.benefits.length) ? opts.benefits : cardBenefitLines(type, []);
    var textMaxW = CARDW - CIMG.PX*2 - CIMG.TICK;

    /* ── measure first: a throwaway context, same fonts, to get the height ── */
    var m = document.createElement('canvas').getContext('2d');
    m.font = '400 ' + CIMG.BEN + 'px -apple-system,"Segoe UI",Roboto,Arial,sans-serif';
    var rows = bens.map(function(b){ return cimgWrap_(m, b, textMaxW); });
    var rowsH = rows.reduce(function(s, ls){ return s + CIMG.ROWPAD*2 + ls.length*CIMG.LINE; }, 0);

    var panelH = 32                      /* top padding            */
               + CIMG.TITLE + 12         /* "PLATINUM BENEFITS"    */
               + CIMG.SUB   + 24         /* Nakoda Diagnostics …   */
               + rowsH                   /* the ticked lines       */
               + 18 + 1 + 20             /* rule above the footer  */
               + CIMG.FOOT + 28;         /* footer + bottom pad    */
    if(!bens.length) panelH = 32 + CIMG.TITLE + 12 + CIMG.SUB + 24 + 18 + 1 + 20 + CIMG.FOOT + 28;

    var H = PAD + CARDH + CIMG.GAP + panelH + PAD;

    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');

    /* ── background ───────────────────────────────────────────────────────── */
    var bg = ctx.createLinearGradient(0, 0, W*0.35, H);
    bg.addColorStop(0, '#0A2419'); bg.addColorStop(0.45, '#061912'); bg.addColorStop(1, '#02100B');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.strokeStyle = 'rgba(236,200,87,0.16)'; ctx.lineWidth = 2;
    roundRect(ctx, 7, 7, W-14, H-14, 30); ctx.stroke();
    ctx.restore();

    /* ── the card itself, from the one renderer ───────────────────────────── */
    var off = document.createElement('canvas'); off.width = 1012; off.height = 638;
    drawCard(off, card, type);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#000'; roundRect(ctx, PAD, PAD, CARDW, CARDH, 26); ctx.fill();
    ctx.restore();
    ctx.save(); roundRect(ctx, PAD, PAD, CARDW, CARDH, 26); ctx.clip();
    ctx.drawImage(off, PAD, PAD, CARDW, CARDH); ctx.restore();
    ctx.save(); roundRect(ctx, PAD, PAD, CARDW, CARDH, 26);
    ctx.strokeStyle = 'rgba(236,200,87,0.30)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();

    /* ── benefits panel ───────────────────────────────────────────────────── */
    var py = PAD + CARDH + CIMG.GAP;
    var pg = ctx.createLinearGradient(PAD, py, PAD + CARDW, py + panelH);
    pg.addColorStop(0, '#0C3325'); pg.addColorStop(0.55, '#08241B'); pg.addColorStop(1, '#051A13');
    ctx.save();
    ctx.fillStyle = pg; roundRect(ctx, PAD, py, CARDW, panelH, 26); ctx.fill();
    ctx.strokeStyle = 'rgba(236,200,87,0.26)'; ctx.lineWidth = 2;
    roundRect(ctx, PAD, py, CARDW, panelH, 26); ctx.stroke();
    ctx.restore();

    var cx = PAD + CARDW/2;
    var y  = py + 32;

    /* title */
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '800 ' + CIMG.TITLE + 'px -apple-system,"Segoe UI",Roboto,Arial,sans-serif';
    var tg = ctx.createLinearGradient(PAD, y, PAD + CARDW, y + CIMG.TITLE);
    tg.addColorStop(0, foil[0]); tg.addColorStop(0.5, foil[1]); tg.addColorStop(1, foil[2]);
    ctx.fillStyle = tg;
    cimgSpaced_(ctx, typeName + ' BENEFITS', cx, y, Math.round(CIMG.TITLE*0.12));
    y += CIMG.TITLE + 12;

    /* sub-title */
    ctx.font = 'italic 400 ' + CIMG.SUB + 'px Georgia, "Times New Roman", serif';
    ctx.fillStyle = 'rgba(236,200,87,0.62)'; ctx.textAlign = 'center';
    ctx.fillText(String(opts.labelText || 'Nakoda Diagnostics & Research Center'), cx, y);
    y += CIMG.SUB + 24;

    /* the ticked lines */
    ctx.textAlign = 'left';
    for(var i=0;i<rows.length;i++){
      var lines = rows[i], rowH = CIMG.ROWPAD*2 + lines.length*CIMG.LINE;
      var tx = PAD + CIMG.PX, ty = y + CIMG.ROWPAD;

      /* gold tick */
      ctx.save();
      ctx.strokeStyle = foil[1]; ctx.lineWidth = 3.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(tx + 2,  ty + 15);
      ctx.lineTo(tx + 10, ty + 24);
      ctx.lineTo(tx + 25, ty + 5);
      ctx.stroke();
      ctx.restore();

      ctx.font = '400 ' + CIMG.BEN + 'px -apple-system,"Segoe UI",Roboto,Arial,sans-serif';
      ctx.fillStyle = '#EDE6D2';
      for(var l=0;l<lines.length;l++) ctx.fillText(lines[l], tx + CIMG.TICK, ty + 2 + l*CIMG.LINE);

      y += rowH;
      if(i < rows.length - 1){
        ctx.save();
        ctx.strokeStyle = 'rgba(236,200,87,0.15)'; ctx.lineWidth = 1;
        if(ctx.setLineDash) ctx.setLineDash([5, 6]);
        ctx.beginPath(); ctx.moveTo(PAD + CIMG.PX, y + 0.5); ctx.lineTo(PAD + CARDW - CIMG.PX, y + 0.5); ctx.stroke();
        ctx.restore();
      }
    }

    /* ── footer: card number left, lab number right ───────────────────────── */
    y += 18;
    ctx.save();
    ctx.strokeStyle = 'rgba(236,200,87,0.20)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD + CIMG.PX, y + 0.5); ctx.lineTo(PAD + CARDW - CIMG.PX, y + 0.5); ctx.stroke();
    ctx.restore();
    y += 20;

    var lab = String(opts.labPhone || '').replace(/\D/g, '');
    ctx.textBaseline = 'top';
    ctx.font = '400 ' + CIMG.FOOT + 'px -apple-system,"Segoe UI",Roboto,Arial,sans-serif';
    ctx.fillStyle = 'rgba(220,210,170,0.60)'; ctx.textAlign = 'left';
    var lbl = 'Card no. ';
    ctx.fillText(lbl, PAD + CIMG.PX, y);
    var lblW = ctx.measureText(lbl).width;
    ctx.font = '700 ' + CIMG.FOOT + 'px -apple-system,"Segoe UI",Roboto,Arial,sans-serif';
    ctx.fillStyle = '#EDE6D2';
    ctx.fillText(String(card.cardNumber || ''), PAD + CIMG.PX + lblW, y);
    if(lab){
      ctx.textAlign = 'right';
      ctx.font = '400 ' + CIMG.FOOT + 'px -apple-system,"Segoe UI",Roboto,Arial,sans-serif';
      ctx.fillStyle = 'rgba(220,210,170,0.60)';
      var rt = 'Nakoda Lab ';
      var rw = ctx.measureText(rt).width;
      ctx.font = '700 ' + CIMG.FOOT + 'px -apple-system,"Segoe UI",Roboto,Arial,sans-serif';
      ctx.fillStyle = '#EDE6D2';
      ctx.fillText(lab, PAD + CARDW - CIMG.PX, y);
      var numW = ctx.measureText(lab).width;
      ctx.font = '400 ' + CIMG.FOOT + 'px -apple-system,"Segoe UI",Roboto,Arial,sans-serif';
      ctx.fillStyle = 'rgba(220,210,170,0.60)';
      ctx.textAlign = 'left';
      ctx.fillText(rt, PAD + CARDW - CIMG.PX - numW - rw, y);
    }

    return cv;
  }


  /* v332b — WHAT ACTUALLY GOES OVER THE WIRE.
     The tall picture at 1080 wide / q0.90 is ~200 KB; the old front-only card was ~97 KB, and every
     send carries it twice — phone to Apps Script as base64 (which adds a third), then Apps Script to
     whatsbizapi. Downscaling to 864 and easing the quality to 0.82 puts it back to ~96 KB with no
     visible loss on a phone: the benefit text is still crisp, WhatsApp shows it at ~400 px anyway,
     and tap-to-zoom is 864 wide rather than 1080. The saved PNG stays full size. */
  var CIMG_SEND_W = 864, CIMG_SEND_Q = 0.82;
  function cardSendJpeg(canvas){
    var w = Math.min(CIMG_SEND_W, canvas.width);
    if(w === canvas.width) return canvas.toDataURL('image/jpeg', CIMG_SEND_Q);
    var c = document.createElement('canvas');
    c.width = w; c.height = Math.round(canvas.height * w / canvas.width);
    var x = c.getContext('2d');
    if(x.imageSmoothingEnabled !== undefined){ x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; }
    x.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', CIMG_SEND_Q);
  }

  /* ── state ────────────────────────────────────────────────────────────── */
  var TYPES=[], TYPEMAP={}, PRICEMAP={};
  function setTypes(arr){ TYPES=arr||[]; TYPEMAP={}; TYPES.forEach(function(t){ TYPEMAP[t.typeId]=t; }); }
  function loadTypes(){
    return API.cachedCardTypes().then(function(c){ if(c&&c.length) setTypes(c);
      return API.listCardTypes().then(function(r){ if(r.ok) setTypes(r.types); return TYPES; }).catch(function(){ return TYPES; });
    });
  }

  /* ── list page ────────────────────────────────────────────────────────── */
  var _canIssue=false;
  function renderMembershipCards(){
    var v=document.getElementById('page-cards');
    v.innerHTML=
      '<div class="page-head"><h1>Membership Cards</h1><div class="spacer"></div>'+
        '<button class="btn ghost" id="wabModeBtn">☑ Select cards</button>'+
        '<button class="btn ghost" id="wabUnsentBtn">📤 Send unsent</button>'+
        '<button class="btn ghost" id="cardPriceBtn">Pricing</button>'+
        '<button class="btn ghost" id="cardTypesBtn">Card types</button>'+
        '<button class="btn" id="issueCardBtn">+ Issue card</button></div>'+
      '<div id="cardExpBanner"></div>'+
      '<div class="card"><div class="toolbar">'+
        '<input class="search" id="cardSearch" placeholder="Search name, number, mobile…">'+
        '<select id="cardStatus"><option value="">All status</option><option value="active">Active</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option><option value="renewed">Renewed</option></select>'+
      '</div><div id="cardList" class="center-load"><span class="loader dark"></span> Loading…</div></div>';
    document.getElementById('issueCardBtn').onclick=function(){ openIssueCardModal(); };
    /* v316: bulk WhatsApp send — all the logic lives in bulksend.js */
    document.getElementById('wabModeBtn').onclick=function(){ if(window.WABulk) WABulk.toggleMode(); };
    document.getElementById('wabUnsentBtn').onclick=function(){ if(window.WABulk) WABulk.sendAllUnsent(); };
    document.getElementById('cardTypesBtn').onclick=function(){ openCardTypes(); };
    document.getElementById('cardPriceBtn').onclick=function(){ if(window.openPricingModal) window.openPricingModal(); };
    API.listCardPrices().then(function(r){ if(r.ok){ PRICEMAP={}; (r.prices||[]).forEach(function(p){ PRICEMAP[p.typeId+'|'+p.branchId]=p.price; }); } });
    var ALLCARDS=[];
    var deb; document.getElementById('cardSearch').addEventListener('input',function(){ clearTimeout(deb); deb=setTimeout(paint,120); });
    document.getElementById('cardStatus').addEventListener('change',paint);
    loadTypes().then(load);
    API.cardSummary().then(function(r){ if(r.ok){ var b=document.getElementById('cardExpBanner'); if(r.expiringSoon>0) b.innerHTML='<div style="background:#fff7e6;border:1px solid #f3d98a;border-radius:10px;padding:9px 12px;font-size:13px;color:#7a5b00;margin-bottom:12px">⏳ '+r.expiringSoon+' card(s) expiring within 7 days</div>'; } });

    function load(){
      var box=document.getElementById('cardList');
      API.cachedCards().then(function(c){ if(c&&c.length){ ALLCARDS=c; paint(); } else { box.className='center-load'; box.innerHTML='<span class="loader dark"></span> Loading…'; } });
      API.listCards({}).then(function(r){
        if(r.ok){ _canIssue=r.perms&&r.perms.canIssue;
          document.getElementById('issueCardBtn').style.display=_canIssue?'':'none';
          document.getElementById('wabModeBtn').style.display=_canIssue?'':'none';
          document.getElementById('wabUnsentBtn').style.display=_canIssue?'':'none';
          document.getElementById('cardTypesBtn').style.display=(r.perms&&r.perms.canManageTypes)?'':'none';
          document.getElementById('cardPriceBtn').style.display='';
          ALLCARDS=r.cards||[]; paint();
        } else if(!ALLCARDS.length){ box.className=''; box.innerHTML='<div class="empty">'+esc(r.error)+'</div>'; }
      });
    }
    function paint(){
      var box=document.getElementById('cardList'); box.className='';
      var q=document.getElementById('cardSearch').value.trim().toLowerCase(), st=document.getElementById('cardStatus').value;
      var list=ALLCARDS.filter(function(c){
        if(st && String(c.status)!==st) return false;
        if(q && (String(c.cardNumber)+' '+(c.holderName||'')+' '+(c.mobile||'')).toLowerCase().indexOf(q)<0) return false;
        return true;
      });
      if(!list.length){ box.innerHTML='<div class="empty">No cards'+((q||st)?' match your filter.':' yet. Tap “+ Issue card”.')+'</div>'; return; }
      box.innerHTML='<div class="table-wrap"><table><thead><tr><th>Card No</th><th>Name</th><th>Mobile</th><th>Type</th><th>Branch</th><th>Valid thru</th><th>Status</th><th></th></tr></thead><tbody>'+
        list.map(function(c){ var t=TYPEMAP[c.typeId];
          return '<tr class="crow" data-cn="'+esc(c.cardNumber)+'" style="cursor:pointer">'+
            '<td><b>'+esc(c.cardNumber)+'</b></td><td>'+esc(c.holderName)+'</td><td>'+esc(c.mobile||'—')+'</td><td>'+esc(t?t.name:c.typeId)+'</td><td>'+esc(bName(c.branchId))+'</td><td>'+esc(fmtExpiry(c.expiryDate))+'</td><td>'+cstatus(c.status)+'</td><td><button class="btn ghost sm">View</button></td></tr>';
        }).join('')+'</tbody></table></div>';
      box.querySelectorAll('.crow').forEach(function(el){ el.onclick=function(){ openCardDetail(el.getAttribute('data-cn')); }; });
      if(window.WABulk) WABulk.attach(box, list, TYPEMAP, _canIssue);   /* v316 tick boxes */
    }
  }
  function cstatus(s){ var m={active:'#1a7f37',expired:'#9aa0a6',cancelled:'#C0392B',renewed:'#185fa5'}; return '<span class="badge" style="background:'+(m[s]||'#999')+'22;color:'+(m[s]||'#999')+'">'+esc(s||'active')+'</span>'; }
  function bName(id){ var b=((S.meta&&S.meta.branches)||[]).filter(function(x){return String(x.BranchID)===String(id);})[0]; return b?b.BranchName:(id||'—'); }

  /* ── card detail ──────────────────────────────────────────────────────── */
  function branchPhone(branchId){
    var b=((S.meta&&S.meta.branches)||[]).filter(function(x){return String(x.BranchID)===String(branchId);})[0];
    if(!b) return '';
    // Use Phone or Mobile from sheet if set
    var ph=String(b.Phone||b.Mobile||'').trim();
    if(ph) return ph;
    // Fallback: hardcoded by branch name
    var nm=String(b.BranchName||'').toUpperCase();
    if(nm.indexOf('ANGEL')>=0) return '6353990481';
    if(nm.indexOf('NAVSARI')>=0) return '9998144001';
    if(nm.indexOf('DIGITAL')>=0) return '9512754001';
    if(nm.indexOf('UDHANA')>=0||nm.indexOf('COOP')>=0||nm.indexOf('CO-OP')>=0||nm.indexOf('OPRATIVE')>=0) return '7405878379';
    /* v332 BUG FIX — order matters. "SOUTH BOPAL" contains the letters PAL, so the Pal test fired
       first and South Bopal was handed Pal's number (9408894464). Test the specific branch first,
       and match Pal only as a whole word. This only ever bites branches with no Phone in Branches. */
    if(nm.indexOf('SOUTH')>=0||nm.indexOf('BOPAL')>=0) return '9512714001';
    if(/\bPAL\b/.test(nm)) return '9408894464';
    return '';
  }
  function buildMessage(c,t,branchName,branchMobile){
    var bm=String(branchMobile||'').replace(/\s+/g,''); if(/^\d{10}$/.test(bm)) bm='+91 '+bm;
    var referByLine=c.referByName?('Refer by: *'+c.referByName+'*\n'):'';
    return 'Greeting from NAKODA DIAGNOSTICS AND RESEARCH CENTER - '+(branchName||'')+'\n\n'+
      'Membership Number: '+(c.cardNumber||'')+'\n'+
      'Name: '+String(c.holderName||'').toUpperCase()+'\n'+
      'Card Type: '+String(t&&t.name?t.name:'').toUpperCase()+'\n'+
      'Valid up to: '+fmtDate(c.expiryDate)+'\n'+
      referByLine+'\n'+
      (t&&t.benefitsText?t.benefitsText:'')+'\n\n'+
      'Please save '+(bm||'our number')+' as *Nakoda Lab* for any emergency.';
  }
  /* v308c SPEED. issueCard and renewCard already RETURN the finished card, its type and its branch
     name. This used to throw all three away and ask the server for them again, so creating a card cost
     a second full round trip before the picture appeared. Pass `pre` and it opens instantly; called
     with just a number (from the list) it still fetches, exactly as before. */
  function openCardDetail(cardNumber, pre){
    var got = pre ? Promise.resolve(pre) : API.getCard(cardNumber);
    got.then(function(r){
      if(!r.ok){ toast(r.error,true); return; }
      var c=r.card, t=r.type, msg=buildMessage(c,t,r.branchName,branchPhone(c.branchId));
      var info='<div class="grid2" style="font-size:13px;margin-top:12px">'+
        '<div><b>Holder:</b> '+esc(c.holderName)+'</div><div><b>Mobile:</b> '+esc(c.mobile)+'</div>'+
        '<div><b>Type:</b> '+esc(t?t.name:c.typeId)+'</div><div><b>Branch:</b> '+esc(r.branchName)+'</div>'+
        '<div><b>Issued:</b> '+fmtDate(c.issuedDate)+'</div><div><b>Valid till:</b> '+fmtDate(c.expiryDate)+'</div>'+
        '<div><b>Amount:</b> ₹'+esc(c.amount||0)+'</div><div><b>Status:</b> '+cstatus(c.status)+'</div></div>';
      var sendBlock=r.canIssue?(
        '<div style="font-size:12px;color:#888;margin:14px 0 4px">Message to send (you can edit before sending)</div>'+
        '<textarea id="cdMsg" rows="6" style="width:100%;font-size:12.5px;border:1px solid #e3e5ea;border-radius:8px;padding:8px">'+esc(msg)+'</textarea>'+
        '<div style="background:#f6f7f9;border-radius:10px;padding:12px;margin-top:10px">'+
          '<div style="font-weight:600;font-size:13px;margin-bottom:6px">Send to customer</div>'+
          '<div style="font-size:11.5px;color:#888;margin-bottom:4px">Option 1 · Auto-attach image + text (pick contact)</div>'+
          '<button class="btn" id="cdShare" style="width:100%">📤 Share Card via System (Auto-attach)</button>'+
          '<div style="font-size:11.5px;color:#888;margin:10px 0 4px">Option 2 · Direct chat with customer</div>'+
          '<div style="display:flex;gap:8px"><input id="cdNum" value="'+esc(c.mobile||'')+'" style="flex:1;border:1px solid #e3e5ea;border-radius:8px;padding:9px" inputmode="numeric"><button class="btn ghost" id="cdChat" style="white-space:nowrap">💬 Open Chat</button></div>'+
          '<div style="font-size:11px;color:#999;font-style:italic;margin-top:4px">Image goes into your clipboard — paste it inside WhatsApp.</div>'+
          '<div style="font-size:11.5px;color:#888;margin:10px 0 4px">Option 3 · Official WhatsApp API — sends card + message automatically from the branch\'s WhatsApp number</div>'+
          '<button class="btn" id="cdApiSend" style="width:100%;background:#1a7f37">🚀 Send via Official API</button>'+
          '<div id="cdApiStatus" style="font-size:11px;color:#999;font-style:italic;margin-top:4px">Uses this branch\'s approved template — the text box above does not apply to this option.</div>'+
        '</div>'):'';
      /* v332: the benefits are inside the picture now, so the grey text block under the modal was
         saying the same thing twice. Kept as a one-line reminder of where the wording is edited. */
      var benefits='<div style="font-size:11.5px;color:#999;margin-top:10px">Benefits shown on the card image come from <b>Card types \u25B8 '+esc(t?t.name:'')+'</b>.</div>';
      var actions='<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn ghost" id="cdDl" style="flex:1;min-width:110px">⬇ Download Image</button>'+
        (r.canIssue&&!c.activatedAt&&c.status==='active'?'<button class="btn ghost" id="cdActivate" style="flex:1;min-width:110px;color:#1a7f37">✓ Mark activated</button>':'')+
        (r.canIssue&&c.status==='active'?'<button class="btn ghost" id="cdCancel" style="flex:1;min-width:110px;color:#C0392B">Cancel Card</button>':'')+
        (r.canIssue?'<button class="btn ghost" id="cdRenew" style="flex:1;min-width:110px">↻ Renew</button>':'')+'</div>';
      openModal('Card · '+c.cardNumber, '<div id="cardCanvasBox"></div>'+info+sendBlock+benefits+actions, '<button class="btn ghost" onclick="closeModal()">Close</button>');
      /* v332. ONE canvas from here down. Everything below — the preview, Download, Share, Open Chat
         and the official API send — reads this same `cv`, so the staff member is looking at exactly
         what the customer receives: card front, benefit list, card number and lab number. */
      var cv=buildCardImage(c, t, { benefits:cardBenefitLines(t, DEFAULT_BENEFITS), labPhone:branchPhone(c.branchId) });
      cv.style.width='100%'; cv.style.borderRadius='12px'; cv.style.display='block';
      document.getElementById('cardCanvasBox').appendChild(cv);
      document.getElementById('cdDl').onclick=function(){ var a=document.createElement('a'); a.download='Nakoda-Card-'+c.cardNumber+'.png'; a.href=cv.toDataURL('image/png'); a.click(); };
      var markSent=function(){ if(r.canIssue) API.markCardSent(c.cardNumber).catch(function(){}); };
      var sh=document.getElementById('cdShare'); if(sh) sh.onclick=function(){ shareSystem(cv,c,(document.getElementById('cdMsg')||{}).value||msg); markSent(); };
      var ch=document.getElementById('cdChat'); if(ch) ch.onclick=function(){ openChatWA(cv,(document.getElementById('cdNum').value||'').replace(/\D/g,''),(document.getElementById('cdMsg')||{}).value||msg); markSent(); };
      var ap=document.getElementById('cdApiSend'); if(ap) ap.onclick=function(){
        var phone=(document.getElementById('cdNum').value||'').replace(/\D/g,'')||String(c.mobile||'');
        if(phone.replace(/\D/g,'').length<10){ toast('Enter the customer\'s mobile number first.',true); return; }
        if(!confirm('Send this membership card on WhatsApp to '+phone+' via the official API?')) return;
        var st=document.getElementById('cdApiStatus');
        ap.disabled=true; ap.innerHTML='<span class="loader"></span> Sending…'; st.textContent='Uploading card image & calling WhatsApp…';
        /* JPEG: the picture is now more than twice as tall, and waSendCardCore_ already derives the
           mime from the bytes (the /9j/ check), so this is smaller over a branch line for free. */
        var b64=cardSendJpeg(cv).split(',')[1];
        API.waSendCard(c.cardNumber, b64, phone).then(function(rr){
          ap.disabled=false; ap.textContent='🚀 Send via Official API';
          if(rr.ok){ st.innerHTML='<span style="color:#1a7f37">✓ '+esc(rr.message||'Sent!')+'</span>'; toast('Card sent on WhatsApp ✓'); }
          else { st.innerHTML='<span style="color:#C0392B">✗ '+esc(rr.error||'Failed')+'</span>'; toast(rr.error||'Send failed',true); }
        }).catch(function(){ ap.disabled=false; ap.textContent='🚀 Send via Official API'; st.textContent='Network error — try again.'; toast('Network error — sending via API needs internet.',true); });
      };
      var ac=document.getElementById('cdActivate'); if(ac) ac.onclick=function(){ API.markCardActivated(c.cardNumber).then(function(rr){ if(rr.ok){ closeModal(); toast('Marked activated'); renderMembershipCards(); } else toast(rr.error,true); }); };
      var rn=document.getElementById('cdRenew'); if(rn) rn.onclick=function(){ if(!confirm('Renew this card? A new card with a fresh '+(t?t.validityMonths:12)+'-month validity will be issued.')) return; API.renewCard(c.cardNumber).then(function(rr){ if(rr.ok){ closeModal(); toast('Renewed: '+rr.card.cardNumber); renderMembershipCards(); } else toast(rr.error,true); }); };   /* v308e: back to the v306 behaviour — renew repaints the list and does not open the new card */
      var cn=document.getElementById('cdCancel'); if(cn) cn.onclick=function(){ var why=prompt('Reason for cancelling?',''); if(why===null) return; API.cancelCard(c.cardNumber,why).then(function(rr){ if(rr.ok){ closeModal(); toast('Card cancelled'); renderMembershipCards(); } else toast(rr.error,true); }); };
    });
  }
  function shareSystem(cv,c,msg){
    if(cv.toBlob && navigator.canShare){ cv.toBlob(function(blob){ var file=new File([blob],'Nakoda-Card-'+c.cardNumber+'.png',{type:'image/png'}); if(navigator.canShare({files:[file]})){ navigator.share({files:[file],text:msg,title:'Nakoda Membership Card'}).catch(function(){}); } else { toast('Sharing not supported here — use Open Chat or Download.',true); } },'image/png'); }
    else { toast('Sharing not supported here — use Open Chat or Download.',true); }
  }
  function makeClipItem(blob){ var o={}; o[blob.type]=blob; return o; }
  function openChatWA(cv,mobile,msg){
    var go=function(){ window.open('https://wa.me/'+(mobile?('91'+mobile):'')+'?text='+encodeURIComponent(msg),'_blank'); };
    try{ if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(msg); }catch(e){}
    if(cv.toBlob && navigator.clipboard && window.ClipboardItem){
      cv.toBlob(function(blob){ try{ navigator.clipboard.write([new ClipboardItem(makeClipItem(blob))]).then(function(){ toast('Card image copied — paste it in WhatsApp'); }).catch(function(){}); }catch(e){} go(); },'image/png');
    } else { go(); }
  }

  /* ── issue modal ──────────────────────────────────────────────────────── */
  function openIssueCardModal(){
    var branches=(S.meta&&S.meta.branches)||[];
    var brOpts=branches.map(function(b){ return '<option value="'+esc(b.BranchID)+'"'+(b.BranchID===(S.user&&S.user.Branch)?' selected':'')+'>'+esc(b.BranchName)+'</option>'; }).join('');
    var typeOpts=TYPES.map(function(t){ return '<option value="'+esc(t.typeId)+'">'+esc(t.name)+'</option>'; }).join('');
    var body='<div class="grid2">'+
      '<div class="field"><label>Member name *</label><input id="ic_name"></div>'+
      '<div class="field"><label>Mobile (10 digits) *</label><input id="ic_mobile" inputmode="numeric" maxlength="10"></div>'+
      '<div class="field"><label>Branch</label><select id="ic_branch">'+brOpts+'</select></div>'+
      '<div class="field"><label>Card type *</label><select id="ic_type">'+typeOpts+'</select></div>'+
      '<div class="field"><label>Amount collected (₹)</label><input id="ic_amount" inputmode="numeric" placeholder="0"><div id="ic_sugg" style="font-size:11px;color:#888;margin-top:4px"></div></div>'+
      '<div class="field full"><label>Referred by (optional)</label><input id="ic_refer"></div>'+
      '<div class="field full"><label>Preview</label><div id="ic_preview"></div></div>'+
    '</div>';
    openModal('Issue Membership Card', body, '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="ic_save">Create card</button>');
    var pv=document.getElementById('ic_preview'), cv=newCardCanvas(); pv.appendChild(cv);
    var amtTouched=false;
    function redraw(){
      var t=TYPEMAP[document.getElementById('ic_type').value];
      drawCard(cv,{cardNumber:'NAK-XXXX-00000',holderName:val('ic_name')||'MEMBER NAME',expiryDate:addMonths(t?t.validityMonths:12)},t);
      var key=document.getElementById('ic_type').value+'|'+document.getElementById('ic_branch').value;
      var sug=PRICEMAP[key], sg=document.getElementById('ic_sugg');
      if(sug!=null){ sg.textContent='Suggested price: ₹'+sug+' (you can change)'; if(!amtTouched) document.getElementById('ic_amount').value=sug; }
      else { sg.textContent='Enter amount collected (leave 0 if free).'; }
    }
    document.getElementById('ic_type').addEventListener('change',redraw);
    document.getElementById('ic_branch').addEventListener('change',redraw);
    document.getElementById('ic_name').addEventListener('input',redraw);
    document.getElementById('ic_amount').addEventListener('input',function(){ amtTouched=true; });
    redraw();
    loadTypes().then(function(){ var sel=document.getElementById('ic_type'); if(sel && sel.options.length<TYPES.length){ sel.innerHTML=TYPES.map(function(t){ return '<option value="'+esc(t.typeId)+'">'+esc(t.name)+'</option>'; }).join(''); redraw(); } });
    document.getElementById('ic_save').onclick=function(){
      var data={ holderName:val('ic_name'), mobile:val('ic_mobile'), branchId:document.getElementById('ic_branch').value, typeId:document.getElementById('ic_type').value, referByName:val('ic_refer'), amount:(val('ic_amount')||'').replace(/[^\d.]/g,'')||0 };
      if(!data.holderName){ toast('Member name is required.',true); return; }
      if(!/^\d{10}$/.test(String(data.mobile||'').replace(/\D/g,''))){ toast('Enter a valid 10-digit mobile.',true); return; }
      if(!data.typeId){ toast('Select a card type.',true); return; }
      var btn=document.getElementById('ic_save'); btn.disabled=true; btn.innerHTML='<span class="loader"></span> Creating…';
      API.issueCard(data).then(function(r){
        /* v308e: renderMembershipCards() is back. I removed it in v308c thinking API.issueCard's
           refreshCards() covered it — it does not. refreshCards only refills the IndexedDB CACHE; it
           never repaints the table on screen. So the card was created correctly and was simply absent
           from the list until the page was reopened. The `r` second argument still saves the extra
           round trip for the detail panel, which was the part actually worth saving. */
        if(r.ok){ closeModal(); toast('Card issued: '+r.card.cardNumber); openCardDetail(r.card.cardNumber, r); renderMembershipCards(); return; }
        if(String(r.error).indexOf('DUPLICATE')===0){
          if(confirm(r.error.replace('DUPLICATE: ','')+'\n\nReplace the old card and issue this new one?')){ data.replaceExisting=true; return API.issueCard(data).then(function(r2){ if(r2.ok){ closeModal(); toast('Card issued: '+r2.card.cardNumber); openCardDetail(r2.card.cardNumber, r2); renderMembershipCards(); } else toast(r2.error,true); }); }
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
    var sel=String(t.themeId||'HUNTER_GREEN').toUpperCase();
    var grid=Object.keys(CARD_THEMES).map(function(k){ var th=CARD_THEMES[k];
      return '<div class="themetile'+(k===sel?' on':'')+'" data-theme="'+k+'" style="background:'+th.bg[1]+';color:'+th.foil[1]+(th.light?';border-color:#e3d9b0':'')+'">'+th.name+'</div>'; }).join('');
    var body='<div class="grid2">'+
      '<div class="field"><label>Type ID</label><input id="ct_id" value="'+esc(t.typeId||'')+'"'+(typeId?' disabled':'')+' placeholder="e.g. GOLD"></div>'+
      '<div class="field"><label>Display Name *</label><input id="ct_name" value="'+esc(t.name||'')+'"></div>'+
      '<div class="field full"><label>Validity (months)</label><input id="ct_val" type="number" value="'+esc(t.validityMonths||12)+'"></div>'+
      '<div class="field full"><label>Card Theme</label><div class="themegrid" id="ct_theme">'+grid+'</div><input type="hidden" id="ct_themeval" value="'+sel+'"></div>'+
      '<div class="field full"><label>Benefits (one per line, customer-facing)</label><textarea id="ct_ben" rows="5">'+esc(t.benefitsText||'')+'</textarea></div>'+
      '<div class="field full"><label>Status</label><select id="ct_status"><option value="active"'+(t.status!=='inactive'?' selected':'')+'>active</option><option value="inactive"'+(t.status==='inactive'?' selected':'')+'>inactive</option></select></div>'+
    '</div>';
    openModal(typeId?('Edit type · '+t.name):'Add card type', body, '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="ct_save">Save</button>');
    document.querySelectorAll('#ct_theme .themetile').forEach(function(tile){ tile.onclick=function(){ document.querySelectorAll('#ct_theme .themetile').forEach(function(x){x.classList.remove('on');}); tile.classList.add('on'); document.getElementById('ct_themeval').value=tile.getAttribute('data-theme'); }; });
    document.getElementById('ct_save').onclick=function(){
      var data={ typeId:val('ct_id'), name:val('ct_name'), validityMonths:val('ct_val'), themeId:document.getElementById('ct_themeval').value, benefitsText:document.getElementById('ct_ben').value, status:document.getElementById('ct_status').value };
      if(!data.name){ toast('Name is required.',true); return; }
      API.upsertCardType(data).then(function(r){ if(r.ok){ closeModal(); toast('Saved'); loadTypes(); } else toast(r.error,true); });
    };
  };

  /* v316: bulksend.js draws cards offscreen with THIS drawing code, so a bulk
     card image can never differ from the one shown in the card popup. */
  window.__nakodaCard={ drawCard:drawCard, newCardCanvas:newCardCanvas,
                        buildCardImage:buildCardImage, sendJpeg:cardSendJpeg,
                        benefitsFor:function(typeId){ return cardBenefitLines(TYPEMAP[typeId], DEFAULT_BENEFITS); },
                        labPhoneFor:function(branchId){ return branchPhone(branchId); },
                        typeFor:function(id){ return TYPEMAP[id]; } };
  window.renderMembershipCards=renderMembershipCards;
  window.openCardDetail=openCardDetail;
  window.openIssueCardModal=openIssueCardModal;
})();
