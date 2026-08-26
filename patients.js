/* ============================================================================================
 *  Nakoda MIS — PATIENT CRM  ·  frontend  ·  build pc1
 *
 *  Replaces the Sales CRM. One module, seven screens:
 *    window.renderPatientCRM()          the four lists (Cold / Mine / Follow-ups / Pending card)
 *    window.openPatient(patientId)      the patient file — append-only history
 *    window.openPatientCall(patientId)  call, then log it (+ the two hand-offs)
 *    window.renderCrmPerf()             management dashboard, per person, hour-wise
 *
 *  Loads after app.js and reuses its globals: $, esc, toast, openModal, closeModal, val, S, API.
 *  Hands off to two modules that already exist rather than rebuilding them:
 *    ops.js         window.openCollectSample(after, prefill)
 *    membership.js  window.openIssueCardModal(prefill, after)
 *  Both were given an optional second/first argument; called with no arguments they behave
 *  exactly as before, so every existing call site is untouched.
 * ============================================================================================ */
(function(){

  /* ---------------- module state ---------------- */
  var PC = {
    tab:'cold', branch:'', q:'', tag:'', page:0,
    rows:[], counts:{cold:0,mine:0,followups:0,card:0}, kpi:{}, total:0, pageSize:200, today:''
  };
  var META = null;            /* tags, people, branches, permissions — fetched once */
  var PERF = { branch:'', ym:'' };

  var TAGMETA = {
    'New':      { bg:'#E6F1FB', fg:'#0C447C', pill:'#185FA5' },
    'Chronic':  { bg:'#FCEBEB', fg:'#A32D2D', pill:'#A32D2D' },
    'Healthy':  { bg:'#EAF3DE', fg:'#3B6D11', pill:'#1a7f37' },
    'Old data': { bg:'#EFF1F3', fg:'#5C646E', pill:'#686868' }
  };
  var OUTLABEL = { answered:'Answered', no_answer:'No answer', busy:'Busy', wrong_number:'Wrong number' };
  /* v358: Follow-ups tab restored on request — the calling workflow itself stays removed
     (no Call button, no Talk-time popup), this just brings the count/tab back for visibility. */
  var TABS = [['cold','Cold leads'],['mine','My leads'],['followups','Follow-ups'],['card','Pending card']];

  /* ---------------- small helpers ---------------- */
  function $id(i){ return document.getElementById(i); }
  function me(){ return (window.S && S.user && S.user.EmpID) || ''; }
  function money(n){ return '₹' + Math.round(Number(n)||0).toLocaleString('en-IN'); }
  function digits(v){ return String(v==null?'':v).replace(/\D/g,''); }
  /* Same normalising the server does — see pcMobile_ in Code_PatientCRM.gs. Old exports carry
     +91 / leading-0 forms of the same number, and rejecting them loses thousands of import rows. */
  function mobile(v){
    var d=digits(v);
    if(d.length===12 && d.slice(0,2)==='91') d=d.slice(2);
    else if(d.length===11 && d.charAt(0)==='0') d=d.slice(1);
    else if(d.length===13 && d.slice(0,3)==='091') d=d.slice(3);
    return d;
  }
  function todayStr(){
    var d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function ymNow(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  function d10(v){
    if(v==null||v==='') return '';
    if(v instanceof Date) return v.toISOString().slice(0,10);
    return String(v).slice(0,10);
  }
  function niceDate(v){
    var s=d10(v); if(!s) return '';
    var d=new Date(s+'T00:00:00'); if(isNaN(d)) return s;
    return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  }
  function niceWhen(v){
    if(!v) return '';
    var d=new Date(v); if(isNaN(d)) return String(v).slice(0,16).replace('T',' ');
    return d.toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  }
  function initials(n){
    var p=String(n||'?').trim().split(/\s+/);
    return ((p[0]||'')[0]||'?').toUpperCase() + (p.length>1 ? (p[p.length-1][0]||'').toUpperCase() : '');
  }
  function hue(s){
    var h=0, t=String(s||'');
    for(var i=0;i<t.length;i++) h=(h*31+t.charCodeAt(i))>>>0;
    var pal=[['#E6F1FB','#0C447C'],['#EAF3DE','#3B6D11'],['#FAEEDA','#854F0B'],['#FCEBEB','#A32D2D'],['#EFEAFB','#4B3A9E']];
    return pal[h%pal.length];
  }
  function mmss(sec){
    sec=Math.max(0,Math.round(Number(sec)||0));
    var m=Math.floor(sec/60), s=sec%60;
    return m ? (m+'m '+s+'s') : (s+'s');
  }
  function secFromText(t){
    t=String(t||'').trim();
    if(!t) return 0;
    var m=t.match(/^(\d+)\s*m\s*(\d+)?\s*s?$/i);
    if(m) return (+m[1])*60 + (+(m[2]||0));
    if(/^\d+:\d{1,2}$/.test(t)){ var p=t.split(':'); return (+p[0])*60 + (+p[1]); }
    var n=parseInt(t,10);
    return isNaN(n) ? 0 : n;   /* bare number = seconds */
  }
  /* v360: chips got a small colour dot + pill radius (100px) instead of a flat rounded box —
     purely cosmetic, same background/text colours as before, just easier to scan at a glance. */
  function tagChip(tag){
    var m=TAGMETA[tag]||TAGMETA['Old data'];
    return '<span style="display:inline-flex;align-items:center;gap:4px;background:'+m.bg+';color:'+m.fg+';border-radius:100px;font-size:9px;padding:2.5px 8px 2.5px 7px;font-weight:700;letter-spacing:.03em;white-space:nowrap">'+
      '<span style="width:5px;height:5px;border-radius:50%;background:'+m.pill+';flex:none"></span>'+esc(String(tag||'').toUpperCase())+'</span>';
  }
  function dueChip(p){
    if(!p.nextCallAt) return '';
    if(p.overdueDays>0)
      return '<span style="background:#FCEBEB;color:#C0392B;border-radius:11px;font-size:9.5px;padding:2px 8px;font-weight:700">OVERDUE '+p.overdueDays+'d</span>';
    if(p.nextCallAt===PC.today)
      return '<span style="background:#FAEEDA;color:#854F0B;border-radius:11px;font-size:9.5px;padding:2px 8px;font-weight:700">DUE TODAY</span>';
    return '<span style="font-size:10.5px;color:#9aa0a6">due '+esc(niceDate(p.nextCallAt))+'</span>';
  }
  function cardChip(p){
    /* v349: the server now settles the card question by looking the patient's MOBILE NUMBER up in
       the card sheet, not by trusting a column on the patient row — so a card issued at the counter
       or carried by a relative on the same family number counts. cardVia says which it was, and the
       chip says so out loud: telling a caller "this is his wife's card" is the difference between a
       useful call and an embarrassing one. */
    if(p.cardStatus==='issued' && p.cardVia==='family')
      return '<span style="display:inline-flex;align-items:center;gap:4px;background:#E6F0E5;color:#2F6B33;border-radius:100px;font-size:9px;padding:2.5px 8px 2.5px 7px;font-weight:700" '+
             'title="'+esc(p.cardHolderName||'')+' holds this card on the same mobile number">'+
             '<span style="width:5px;height:5px;border-radius:50%;background:#2F6B33;flex:none"></span>FAMILY CARD'+
             (p.cardNumber?(' · '+esc(p.cardNumber)):'')+'</span>';
    if(p.cardStatus==='issued')
      return '<span style="display:inline-flex;align-items:center;gap:4px;background:#F7EFD8;color:#8C6B1F;border-radius:100px;font-size:9px;padding:2.5px 8px 2.5px 7px;font-weight:700">'+
             '<span style="width:5px;height:5px;border-radius:50%;background:#8C6B1F;flex:none"></span>CARD'+(p.cardNumber?(' · '+esc(p.cardNumber)):'')+'</span>';
    if(p.cardStatus==='pending')
      return '<span style="display:inline-flex;align-items:center;gap:4px;background:#FAEEDA;color:#854F0B;border-radius:100px;font-size:9px;padding:2.5px 8px 2.5px 7px;font-weight:700">'+
             '<span style="width:5px;height:5px;border-radius:50%;background:#854F0B;flex:none"></span>CARD PENDING</span>';
    return '<span style="display:inline-flex;align-items:center;gap:4px;background:#EFF1F3;color:#5C646E;border-radius:100px;font-size:9px;padding:2.5px 8px 2.5px 7px;font-weight:700">'+
           '<span style="width:5px;height:5px;border-radius:50%;background:#5C646E;flex:none"></span>NO CARD</span>';
  }
  function loader(txt){ return '<div class="center-load"><span class="loader dark"></span> '+esc(txt||'Loading…')+'</div>'; }

  function ensureMeta(){
    if(META) return Promise.resolve(META);
    return API.pcMeta().then(function(r){
      META = (r && r.ok) ? r : { tags:['Old data','New','Chronic','Healthy'], people:[], branches:[],
                                 intervals:{New:3,Chronic:3,Healthy:6,'Old data':0}, canViewAll:false };
      return META;
    }).catch(function(){
      META = { tags:['Old data','New','Chronic','Healthy'], people:[], branches:[],
               intervals:{New:3,Chronic:3,Healthy:6,'Old data':0}, canViewAll:false };
      return META;
    });
  }
  /* Names here are long ("JITENDRAKUMAR K MEHTA"), so the role goes after a middot rather than in
     brackets, and the whole field is full width — a half-width select clipped the name. */
  function peopleOptions(sel){
    var list=(META&&META.people)||[];
    return '<option value="">— nobody —</option>'+list.map(function(e){
      var nm=String(e.FullName||'');
      var label = nm + (e.Role?(' · '+e.Role):'');
      return '<option value="'+esc(e.EmpID)+'"'+(String(e.EmpID)===String(sel||'')?' selected':'')+'>'+esc(label)+'</option>';
    }).join('');
  }
  function branchOptions(sel, allLabel){
    var list=(META&&META.branches)||((window.S&&S.meta&&S.meta.branches)||[]);
    var head = allLabel ? '<option value="">'+esc(allLabel)+'</option>' : '';
    return head + list.map(function(b){
      return '<option value="'+esc(b.BranchID)+'"'+(String(b.BranchID)===String(sel||'')?' selected':'')+'>'+esc(b.BranchName)+'</option>';
    }).join('');
  }
  /* What date the tag implies, shown live so the caller sees the rule before saving. */
  function nextFromTag(tag, from){
    var months=((META&&META.intervals)||{})[tag]||0;
    if(!months) return '';
    var base=from?new Date(from+'T00:00:00'):new Date();
    if(isNaN(base)) base=new Date();
    var y=base.getFullYear(), m=base.getMonth(), d=base.getDate();
    var t=new Date(y, m+months, 1);
    var last=new Date(t.getFullYear(), t.getMonth()+1, 0).getDate();
    t.setDate(Math.min(d,last));
    return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
  }

  /* ============================================================================================
     v349 — TYPE THE GAP. SETTING A CALL-BACK DATE WITHOUT OPENING A CALENDAR.

     WHAT WAS SLOW, AND IT WAS NOT THE CALENDAR BEING MISSING. The field was a bare
     <input type="date">. Clicking it opens a date picker, and to reach "three months from now"
     somebody navigates to the right month, finds the day, clicks it. Every single call. And the
     year is exactly where a follow-up quietly gets booked into the wrong one.

     Nobody on a call thinks in dates anyway. They think "call her in three months". So this asks
     that question instead: a small box you type the GAP into. Two keystrokes — 3m — and the real
     date appears underneath in words, spelled out, with the weekday. Wrong years become obvious
     instead of invisible, because you are reading "Wed, 25 November 2026" rather than 25-11-2026.

     It fills itself in from the tag when the popup opens, so the ordinary call needs no typing
     at all.

     THE INPUT ITSELF DOES NOT MOVE. The original <input type="date"> is still here with the same
     id — just hidden behind "pick exact date" for the patient who says "the 14th, I'm travelling
     till then". Everything that reads val('pc_next') or writes $id('pc_next').value keeps working
     untouched; it only has to call dpSync afterwards to repaint.
     ============================================================================================ */
  var DP_CAP  = 40;    /* calls per day past which a day is "full" — matches PC_SPREAD_PER_DAY_ on the server */
  var DP_WARM = 24;    /* ...and past which it is "getting full" */
  var DP_LOAD = null;  /* { 'yyyy-mm-dd': count } once fetched; shared by every box this session */

  function dpAdd(from, n, unit){
    var base = from ? new Date(from+'T00:00:00') : new Date();
    if(isNaN(base)) base = new Date();
    n = parseInt(n,10) || 0;
    if(unit === 'd'){ base.setDate(base.getDate()+n); }
    else if(unit === 'w'){ base.setDate(base.getDate()+n*7); }
    else {
      /* month arithmetic the way a person means it: the 31st plus one month is the 28th of
         February, not the 3rd of March. Years are just twelve months. */
      if(unit === 'y') n = n*12;
      var d = base.getDate();
      var t = new Date(base.getFullYear(), base.getMonth()+n, 1);
      var last = new Date(t.getFullYear(), t.getMonth()+1, 0).getDate();
      t.setDate(Math.min(d,last));
      base = t;
    }
    return base.getFullYear()+'-'+String(base.getMonth()+1).padStart(2,'0')+'-'+String(base.getDate()).padStart(2,'0');
  }
  function dpNextDay(d){ var x=new Date(d+'T00:00:00'); x.setDate(x.getDate()+1);
    return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); }
  function dpIsSunday(d){ var x=new Date(d+'T00:00:00'); return !isNaN(x) && x.getDay()===0; }
  function dpNice(d){
    var x=new Date(d+'T00:00:00'); if(isNaN(x)) return '';
    var D=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
        M=['January','February','March','April','May','June','July','August','September','October','November','December'];
    return D[x.getDay()]+', '+x.getDate()+' '+M[x.getMonth()]+' '+x.getFullYear();
  }
  function dpShort(d){
    var x=new Date(d+'T00:00:00'); if(isNaN(x)) return '';
    var M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var s=x.getDate()+' '+M[x.getMonth()];
    if(x.getFullYear()!==new Date().getFullYear()) s+=' '+String(x.getFullYear()).slice(2);
    return s;
  }

  /* ------------------------------------------------------------------ what the box understands
     Returns { date:'yyyy-mm-dd', said:'3 months' } or null. Deliberately forgiving — "3 m",
     "3months", "3M" and "3" all mean something sensible, because a caller is typing this with a
     patient on the line and should never be corrected by a form. */
  function dpParse(txt){
    var s = String(txt||'').trim().toLowerCase().replace(/\s+/g,'');
    if(!s) return null;
    var today = todayStr();

    if(s==='today')                     return { date: today, said:'today' };
    if(s==='tom'||s==='tmr'||s==='tomorrow') return { date: dpAdd(today,1,'d'), said:'tomorrow' };

    /* a bare number is days — "7" is the commonest thing anyone types */
    var m = s.match(/^(\d{1,4})$/);
    if(m) return { date: dpAdd(today, m[1], 'd'), said: m[1]+' day'+(m[1]==='1'?'':'s') };

    /* number + unit: 7d  2w  3m  1y  (the unit may be spelled out) */
    m = s.match(/^(\d{1,4})(d|w|m|y|day|days|week|weeks|month|months|year|years)$/);
    if(m){
      var u = m[2].charAt(0), n = m[1];
      var word = {d:'day', w:'week', m:'month', y:'year'}[u];
      return { date: dpAdd(today, n, u), said: n+' '+word+(n==='1'?'':'s') };
    }

    /* an actual day: 25/11 or 25-11 — the next time that date comes round.
       25/11/26 and 25/11/2026 are taken literally. */
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
    if(m){
      var dd=parseInt(m[1],10), mm=parseInt(m[2],10), yy=m[3]?parseInt(m[3],10):null;
      if(dd>=1 && dd<=31 && mm>=1 && mm<=12){
        if(yy!==null){ if(yy<100) yy += 2000; }
        else {
          yy = new Date().getFullYear();
          var tryIt = yy+'-'+String(mm).padStart(2,'0')+'-'+String(dd).padStart(2,'0');
          if(tryIt <= today) yy++;                    /* already gone this year -> next year */
        }
        var out = yy+'-'+String(mm).padStart(2,'0')+'-'+String(dd).padStart(2,'0');
        var chk = new Date(out+'T00:00:00');
        if(isNaN(chk) || chk.getDate()!==dd) return null;   /* 31 Feb and friends */
        return { date: out, said:'that date' };
      }
    }
    return null;
  }

  /* The first working day after `d` that is not already full for this caller. */
  function dpLighter(d){
    var n=d, guard=0;
    while(guard++ < 400){
      n = dpNextDay(n);
      if(dpIsSunday(n)) continue;
      if(((DP_LOAD||{})[n]||0) < DP_WARM) return n;
    }
    return '';
  }
  /* What someone would have typed to land on this date — so the box shows "3m" and not a date. */
  function dpGuess(v){
    if(!v) return '';
    var today=todayStr();
    /* Ordered by how a person would SAY it, not by size — 2w beats 14d, 1m beats 30d — so the box
       shows the phrase somebody would have typed rather than an arithmetically equal one. */
    var units=[['d',1],['d',2],['d',3],['d',4],['d',5],['d',6],['w',1],['d',10],['w',2],['d',15],
               ['w',3],['m',1],['d',45],['m',2],['m',3],['m',4],['m',5],['m',6],['m',9],['y',1],['y',2]];
    for(var i=0;i<units.length;i++){
      if(dpAdd(today, units[i][1], units[i][0])===v) return String(units[i][1])+units[i][0];
    }
    var x=new Date(v+'T00:00:00');
    if(isNaN(x)) return '';
    return x.getDate()+'/'+(x.getMonth()+1);
  }
  /* 3031 is a number you have to count the digits of. 3,031 is one you read. */
  function dpThou(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* The markup. `id` is the id the ORIGINAL date input had, so nothing that reads it moves. */
  function datePad(id, value, tag){
    var v = d10(value)||'';
    return '<div class="dp" id="'+id+'_pad" data-tag="'+esc(tag||'')+'">'+
      '<div style="display:flex;gap:8px;align-items:stretch">'+
        '<input id="'+id+'_txt" class="dp-txt" autocomplete="off" spellcheck="false" placeholder="3m" '+
          'value="'+esc(dpGuess(v))+'" '+
          'style="flex:none;width:104px;text-align:center;font-size:17px;font-weight:800;'+
          'border:1.5px solid #0A2E20;border-radius:9px;padding:9px 6px;background:#fff">'+
        '<div id="'+id+'_res" style="flex:1;min-width:0;background:#EAF6EE;border:1px solid #c9e3cf;border-radius:9px;'+
          'padding:7px 11px;display:flex;align-items:center;justify-content:space-between;gap:9px">'+
          '<div style="min-width:0">'+
            '<div id="'+id+'_big" style="font-size:14.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>'+
            '<div id="'+id+'_why" style="font-size:11px;color:#4E7A57;font-weight:700;margin-top:1px"></div>'+
          '</div>'+
          '<span class="dp-exact" style="flex:none;cursor:pointer;color:#686868;text-decoration:underline;font-size:11px;white-space:nowrap">exact date</span>'+
        '</div>'+
      '</div>'+
      '<div id="'+id+'_help" style="margin-top:6px;font-size:10.5px;color:#9aa0a6;line-height:1.6">'+
        'Type a gap: <b>7</b> = 7 days &middot; <b>2w</b> = 2 weeks &middot; <b>3m</b> = 3 months &middot; '+
        '<b>1y</b> = 1 year &middot; <b>25/11</b> = that day &middot; <b>tom</b> = tomorrow'+
      '</div>'+
      '<input id="'+id+'" type="date" value="'+esc(v)+'" style="display:none;margin-top:8px;width:100%">'+
      '<div id="'+id+'_busy" style="margin-top:8px"></div>'+
    '</div>';
  }

  /* Repaint from whatever the hidden input currently holds. Safe to call at any time, and safe to
     call for an id that has no pad. */
  function dpSync(id, keepTyping){
    var pad=$id(id+'_pad'), inp=$id(id); if(!pad||!inp) return;
    var v=d10(inp.value)||'';
    var txt=$id(id+'_txt');
    if(txt && !keepTyping) txt.value = dpGuess(v);

    var big=$id(id+'_big'), why=$id(id+'_why'), res=$id(id+'_res');
    var tag=pad.getAttribute('data-tag')||'';
    var parsed = txt ? dpParse(txt.value) : null;

    if(big) big.textContent = v ? dpNice(v) : 'No date set';
    if(why){
      if(!v) why.textContent = 'A next call date is required.';
      else if(parsed && parsed.date===v) why.textContent = '↻ '+parsed.said+
              (nextFromTag(tag,todayStr())===v ? (' — the default for '+tag) : '');
      else why.textContent = '↻ chosen date';
    }
    if(res){
      var bad=!v;
      res.style.background  = bad ? '#fdf2f2' : '#EAF6EE';
      res.style.borderColor = bad ? '#e0a1a1' : '#c9e3cf';
      if(why) why.style.color = bad ? '#a3271f' : '#4E7A57';
    }
    if(txt){
      var unread = !!(txt.value && !parsed);
      txt.style.borderColor = unread ? '#DA1017' : '#0A2E20';
      if(unread && why){ why.textContent = 'Not understood — try 7, 2w, 3m, 1y or 25/11'; why.style.color='#a3271f'; }
    }

    /* how loaded is that day already */
    var busy=$id(id+'_busy'); if(!busy) return;
    if(!v || !DP_LOAD){ busy.innerHTML=''; return; }
    var n=DP_LOAD[v]||0;
    if(n < DP_WARM){ busy.innerHTML=''; return; }
    var lighter=dpLighter(v);
    busy.innerHTML=
      '<div style="background:#FDF6E7;border:1px solid #f0d9a8;border-radius:9px;padding:8px 10px;font-size:11.5px;color:#8A5A0B;line-height:1.45">'+
        '⚠ <b>'+esc(dpShort(v))+' already has '+dpThou(n)+' call'+(n===1?'':'s')+' booked.</b>'+
        (n>=DP_CAP?' That is more than one person can make in a day — they will roll over as overdue.':'')+
      '</div>'+
      (lighter
        ? '<div class="dp-move" data-d="'+lighter+'" style="cursor:pointer;margin-top:6px;border:1px solid #1a7f37;color:#1a7f37;'+
          'background:#F5FBF6;border-radius:8px;padding:7px 10px;font-size:11.5px;font-weight:800;text-align:center">'+
          '→ Use '+esc(dpShort(lighter))+' instead · '+dpThou(DP_LOAD[lighter]||0)+' call'+((DP_LOAD[lighter]||0)===1?'':'s')+'</div>'
        : '');
    var mv=busy.querySelector('.dp-move');
    if(mv) mv.onclick=function(){
      inp.value=mv.getAttribute('data-d'); dpSync(id);
      if(typeof window.__dpAfter==='function') window.__dpAfter(id);
    };
  }

  /* Wire one box. `after` runs whenever the date changes, so the screen around it can repaint. */
  function wireDatePad(id, after){
    var pad=$id(id+'_pad'), inp=$id(id); if(!pad||!inp) return;
    window.__dpAfter=after||null;
    function changed(keepTyping){ dpSync(id, keepTyping); if(after) after(id); }

    var txt=$id(id+'_txt');
    if(txt){
      txt.oninput=function(){
        var r=dpParse(txt.value);
        /* an unreadable half-typed entry must not wipe a good date — only a parse sets it */
        if(r) inp.value=r.date;
        else if(!txt.value) inp.value='';
        changed(true);
      };
      /* Enter is how a fast typist finishes a field; make it settle rather than submit. */
      txt.onkeydown=function(e){ if(e && e.key==='Enter'){ e.preventDefault(); txt.blur(); } };
      txt.onblur=function(){ dpSync(id); };
    }
    var ex=pad.querySelector('.dp-exact');
    if(ex) ex.onclick=function(){
      inp.style.display='block';
      try{ inp.focus(); if(inp.showPicker) inp.showPicker(); }catch(e){}
    };
    inp.onchange=function(){ changed(false); };

    dpSync(id);
    /* Fetch the day loads once, then repaint. Deliberately fire-and-forget: if it fails or the
       device is offline the box works exactly as before, just without the busy warning. */
    if(DP_LOAD===null && typeof API!=='undefined' && typeof API.pcDayLoad==='function'){
      DP_LOAD={};
      API.pcDayLoad(PC.branch||'', !META.canViewAll).then(function(r){
        if(r&&r.ok&&r.days){ DP_LOAD=r.days; dpSync(id); }
      }, function(){});
    }
  }



  /* ============================================================ SCREEN 1 — the four lists */
  function renderPatientCRM(){
    var v=$id('page-patients'); if(!v) return;
    v.innerHTML=loader('Loading Patient CRM…');
    ensureMeta().then(function(){
      if(!PC.branch && META && !META.canViewAll) PC.branch = META.myBranch || '';
      v.innerHTML =
        '<div class="page-head"><h1>Patient CRM</h1><div class="spacer"></div>'+
          (META && META.canViewAll ? '<select id="pcBranch" class="greet-select">'+branchOptions(PC.branch,'All branches')+'</select> ' : '')+
          '<button class="btn ghost" id="pcUpload">⬆ Bulk upload</button> '+
          '<button class="btn" id="pcAdd">+ Add patient</button></div>'+
        '<div style="color:#888;font-size:13px;margin:-4px 0 12px">Call patients back for their check-ups, book the sample, and issue the membership card.</div>'+
        '<div class="kpis" id="pcKpis"></div>'+
        '<div class="seg" id="pcTabs" style="margin-bottom:13px"></div>'+
        '<div class="card" style="margin-bottom:12px"><div class="toolbar">'+
          '<input class="search" id="pcQ" placeholder="Search name or number…" value="'+esc(PC.q)+'">'+
          '<select id="pcTag"><option value="">All tags</option>'+
            (META.tags||[]).map(function(t){ return '<option'+(t===PC.tag?' selected':'')+'>'+esc(t)+'</option>'; }).join('')+
          '</select>'+
        '</div></div>'+
        '<div id="pcList">'+loader()+'</div>'+
        '<div id="pcMore" style="text-align:center;margin-top:12px"></div>';

      var b=$id('pcBranch');
      if(b) b.onchange=function(){ PC.branch=b.value; PC.page=0; load(); };
      $id('pcAdd').onclick=function(){ openPatientForm(null); };
      $id('pcUpload').onclick=openBulkUpload;

      var qEl=$id('pcQ'), t=null;
      qEl.oninput=function(){ clearTimeout(t); t=setTimeout(function(){ PC.q=qEl.value; PC.page=0; load(); }, 350); };
      $id('pcTag').onchange=function(){ PC.tag=$id('pcTag').value; PC.page=0; load(); };

      paintTabs();
      load();
    });
  }

  function paintTabs(){
    var box=$id('pcTabs'); if(!box) return;
    box.innerHTML=TABS.map(function(t){
      var n=PC.counts[t[0]]||0;
      return '<div data-t="'+t[0]+'"'+(PC.tab===t[0]?' class="on"':'')+'>'+
             '<b style="display:block;font-size:15px;font-weight:700">'+n+'</b>'+esc(t[1])+'</div>';
    }).join('');
    box.querySelectorAll('[data-t]').forEach(function(d){
      d.onclick=function(){ PC.tab=d.getAttribute('data-t'); PC.page=0; paintTabs(); load(); };
    });
  }

  function paintKpis(){
    var box=$id('pcKpis'); if(!box) return;
    var k=PC.kpi||{};
    function tile(n,l,color){
      return '<div class="kpi"><div class="n"'+(color?(' style="color:'+color+'"'):'')+'>'+n+'</div><div class="l">'+esc(l)+'</div></div>';
    }
    box.innerHTML =
      tile(k.dueToday||0,'Due today','#BA7517')+
      tile(k.overdue||0,'Overdue','#C0392B')+
      tile(k.calledToday||0,'Called today','#185FA5')+
      tile(k.pendingCard||0,'Without a card','#8C6B1F');
  }

  function load(){
    var box=$id('pcList'); if(!box) return;
    box.innerHTML=loader();
    API.pcList(PC.tab, PC.branch, PC.q, PC.tag, PC.page).then(function(r){
      if(!r){ box.innerHTML='<div class="empty">No response.</div>'; return; }
      if(!(r.ok||r.offline)){ box.innerHTML='<div class="msg error">'+esc(r.error||'Could not load patients.')+'</div>'; return; }
      PC.rows   = r.patients||[];
      PC.counts = r.counts||PC.counts;
      PC.kpi    = r.kpi||{};
      PC.total  = r.total||0;
      PC.pageSize = r.pageSize||200;
      PC.today  = r.today||todayStr();
      paintKpis(); paintTabs(); paintList();
    });
  }

  function paintList(){
    var box=$id('pcList'); if(!box) return;
    if(!PC.rows.length){
      var msg = PC.tab==='cold'      ? 'No cold leads. Use Bulk upload to bring in old patient data.'
              : PC.tab==='mine'      ? 'No patients are assigned to you yet.'
              : PC.tab==='card'      ? 'Every patient here already has a membership card.'
              :                        'Nothing due. Well done — the list is clear.';
      box.innerHTML='<div class="empty">'+esc(msg)+'</div>';
      $id('pcMore').innerHTML=''; return;
    }
    box.innerHTML=PC.rows.map(function(p){
      var c=hue(p.name), noCard=(p.cardStatus!=='issued');
      /* v360: "more attractive" pass — a thin colored stripe on the row's left edge shows card
         status at a glance (gold=no card, teal=has card); the avatar gets a subtle ring so it
         doesn't blend into the white row; card status moved up next to the name as a chip instead
         of sitting in the contact line; a phone glyph leads the contact line. All still just this
         one row's own inline styles — .tcard/.tbody/.ttitle/.tmeta stay untouched for tasks.js/app.js. */
      return '<div class="tcard" data-id="'+esc(p.patientId)+'" style="align-items:center;border-left:4px solid '+(noCard?'#c9962c':'#0e6f5c')+'">'+
        '<div style="width:40px;height:40px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;background:'+c[0]+';color:'+c[1]+';box-shadow:0 0 0 3px #fff,0 0 0 4px #ecedf0">'+esc(initials(p.name))+'</div>'+
        '<div class="tbody">'+
          '<div class="ttitle" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><b style="color:#000;font-weight:700">'+esc(p.name)+'</b> '+tagChip(p.tag)+' '+cardChip(p)+' '+dueChip(p)+'</div>'+
          '<div class="tmeta" style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:11px">'+
            '\u{1F4DE} '+(p.number?esc(p.number):'<i style="color:#c0392b">no number</i>')+
            (p.address?(' · '+esc(p.address)):'')+
            (p.assignedToName?(' · <span style="color:#9aa0a6">'+esc(p.assignedToName)+'</span>'):'')+
          '</div>'+
        '</div>'+
        /* v355: Call replaced with Book sample / Edit / Notes — same three actions the Patient
           file popup already offered, now one tap away instead of two. Icon-only so four actions
           still fit on one line on a phone.
           v357: each icon gets its own colored square (gold/teal/blue/purple) instead of a flat
           white outline, so the row is scannable by color instead of by reading the tiny glyph.
           v360: added justify-content:center — the buttons only had align-items:center (from the
           shared .btn class), which centers vertically but left the glyph hugging the left edge
           of the box instead of sitting dead-centre; also bumped 34px→36px and the radius slightly. */
        '<div style="display:flex;gap:6px;flex:none" data-stop="1">'+
          (noCard?'<button class="btn sm" data-card="'+esc(p.patientId)+'" title="Issue card" style="width:36px;height:36px;padding:0;border:0;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#e8c568,#c9962c);color:#4a3200;box-shadow:0 2px 5px -2px rgba(0,0,0,.25)">◆</button>':'')+
          '<button class="btn sm" data-samp="'+esc(p.patientId)+'" title="Book sample" style="width:36px;height:36px;padding:0;border:0;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#3fcfae,#0e6f5c);color:#fff;box-shadow:0 2px 5px -2px rgba(0,0,0,.25)">\u{1F9EA}</button>'+
          '<button class="btn sm" data-edit="'+esc(p.patientId)+'" title="Edit" style="width:36px;height:36px;padding:0;border:0;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#6d93ef,#3a5a9b);color:#fff;box-shadow:0 2px 5px -2px rgba(0,0,0,.25)">✎</button>'+
          '<button class="btn sm" data-notes="'+esc(p.patientId)+'" title="Notes" style="width:36px;height:36px;padding:0;border:0;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#c98ee6,#8e44ad);color:#fff;box-shadow:0 2px 5px -2px rgba(0,0,0,.25)">\u{1F4DD}</button>'+
        '</div>'+
      '</div>';
    }).join('');

    box.querySelectorAll('.tcard').forEach(function(el){
      el.onclick=function(ev){
        if(ev.target.closest('[data-stop]')) return;
        openPatient(el.getAttribute('data-id'));
      };
    });
    box.querySelectorAll('[data-card]').forEach(function(b){
      b.onclick=function(ev){ ev.stopPropagation(); handOffCard(b.getAttribute('data-card'), null); };
    });
    box.querySelectorAll('[data-samp]').forEach(function(b){
      b.onclick=function(ev){ ev.stopPropagation();
        var id=b.getAttribute('data-samp'), p=null;
        for(var i=0;i<PC.rows.length;i++){ if(PC.rows[i].patientId===id){ p=PC.rows[i]; break; } }
        if(p) handOffSample(p, null, function(){ load(); });
      };
    });
    box.querySelectorAll('[data-edit]').forEach(function(b){
      b.onclick=function(ev){ ev.stopPropagation();
        var id=b.getAttribute('data-edit');
        API.pcGet(id).then(function(r){ if(r&&r.ok) openPatientForm(r.patient); else toast((r&&r.error)||'Could not open this patient',true); });
      };
    });
    box.querySelectorAll('[data-notes]').forEach(function(b){
      b.onclick=function(ev){ ev.stopPropagation(); openPatient(b.getAttribute('data-notes')); };
    });

    /* Real pages, not an infinite “show more” — load() replaces the list rather than appending,
       so calling it “show more” would be a lie about what the button does. */
    var more=$id('pcMore'), size=PC.pageSize||200;
    var first=PC.page*size+1, last=PC.page*size+PC.rows.length, pages=Math.ceil(PC.total/size);
    if(PC.total<=size){
      more.innerHTML='<div style="font-size:11.5px;color:#9aa0a6">'+PC.total+' patient'+(PC.total===1?'':'s')+'</div>';
      return;
    }
    more.innerHTML=
      '<div style="display:flex;gap:8px;align-items:center;justify-content:center">'+
        '<button class="btn ghost sm" id="pcPrev"'+(PC.page<=0?' disabled':'')+'>← Previous</button>'+
        '<span style="font-size:11.5px;color:#9aa0a6">'+first+'–'+last+' of '+PC.total+' · page '+(PC.page+1)+' of '+pages+'</span>'+
        '<button class="btn ghost sm" id="pcNext"'+(PC.page+1>=pages?' disabled':'')+'>Next →</button>'+
      '</div>';
    var pv=$id('pcPrev'), nx=$id('pcNext');
    if(pv && PC.page>0)        pv.onclick=function(){ PC.page--; load(); window.scrollTo(0,0); };
    if(nx && PC.page+1<pages)  nx.onclick=function(){ PC.page++; load(); window.scrollTo(0,0); };
  }

  /* ============================================================ SCREEN 2 — add / edit patient */
  function openPatientForm(existing){
    ensureMeta().then(function(){
      var p=existing||{};
      var isNew=!p.patientId;
      var tags=(META.tags||['Old data','New','Chronic','Healthy']);
      var curTag=p.tag||'New';

      var body='<div class="grid2">'+
        '<div class="field full"><label>Name *</label><input id="pf_name" value="'+esc(p.name||'')+'" placeholder="Kiritbhai Desai"></div>'+
        '<div class="field"><label>Mobile number '+(isNew?'*':'')+'</label><input id="pf_num" inputmode="numeric" maxlength="10" value="'+esc(p.number||'')+'" placeholder="9879533021"></div>'+
        (META.canViewAll
          ? '<div class="field"><label>Branch</label><select id="pf_branch">'+branchOptions(p.branchId||PC.branch||META.myBranch,'')+'</select></div>'
          : '<div class="field"><label>Branch</label><input value="'+esc(p.branchId||META.myBranch||'')+'" disabled></div>')+
        '<div class="field full"><label>Address</label><input id="pf_addr" value="'+esc(p.address||'')+'" placeholder="Adajan, Surat"></div>'+
        '<div class="field full"><label>Tag</label><div id="pf_tags" style="display:flex;gap:6px;flex-wrap:wrap">'+
          tags.map(function(t){
            var on=(t===curTag), m=TAGMETA[t]||TAGMETA['Old data'];
            return '<div class="pf-tag" data-t="'+esc(t)+'" style="cursor:pointer;padding:5px 12px;border-radius:16px;font-size:12px;border:1px solid '+(on?m.pill:'#ecedf0')+';background:'+(on?m.pill:'#fff')+';color:'+(on?'#fff':'#666')+';font-weight:'+(on?'600':'400')+'">'+esc(t)+'</div>';
          }).join('')+
        '</div><div id="pf_auto" class="msg ok" style="margin-top:8px;font-size:12px"></div></div>'+
        /* v349: the bare date input became the typing box — see datePad above. The original
           <input id="pf_next"> still lives inside it, so saveThen's val('pf_next') is untouched. */
        '<div class="field full"><label>Next call date</label>'+datePad('pf_next', p.nextCallAt, curTag)+'</div>'+
        (isNew?'<div class="field full"><label>First note</label><textarea id="pf_note" rows="2" placeholder="Thyroid profile done 12 Aug. Call back after Diwali."></textarea></div>':'')+
        '<div class="field full"><label>Membership card</label><div id="pf_cardwrap"></div></div>'+
        /* full width: a name like JITENDRAKUMAR K MEHTA (Director) does not fit in half a row */
        '<div class="field full"><label>Assign to</label><select id="pf_assign">'+peopleOptions(p.assignedToEmpId||me())+'</select></div>'+
      '</div>';

      openModal(isNew?'Add patient':'Edit patient', body,
        '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="pf_save">'+(isNew?'Save patient':'Save changes')+'</button>');

      wireDatePad('pf_next');   /* v349 */

      var chosen=curTag;

      /* ---- the membership-card field ----
         Someone who already holds a live card does not need a status dropdown or an Issue button:
         they need to see WHICH card they hold. So this field has two faces. With a card, it shows
         the card — type, number, validity — and nothing to press. Without one, it shows the three
         statuses and the Issue button.

         CARD holds what will actually be saved, so the form does not have to read a <select> that
         may not be on screen. */
      var CARD = { status:(p.cardStatus||'none'), number:(p.cardNumber||''),
                   typeName:(p.cardTypeName||''), expiry:(p.cardExpiry||'') };

      function paintCardField(){
        var w=$id('pf_cardwrap'); if(!w) return;

        if(CARD.status==='issued' && (CARD.number || CARD.typeName)){
          var bits=[];
          if(CARD.typeName) bits.push('<b style="text-transform:uppercase;letter-spacing:.04em">'+esc(CARD.typeName)+'</b>');
          if(CARD.number)   bits.push(esc(CARD.number));
          if(CARD.expiry)   bits.push('valid to '+esc(niceDate(CARD.expiry)));
          w.innerHTML='<div style="display:flex;gap:9px;align-items:center;background:#F7EFD8;border:1px solid #DFC98D;border-radius:10px;padding:10px 12px">'+
            '<span style="font-size:17px;color:#8C6B1F">◆</span>'+
            '<div style="flex:1;min-width:0;font-size:13px;color:#6E5416;line-height:1.45">'+bits.join(' · ')+'</div>'+
            '<span style="font-size:9.5px;font-weight:700;letter-spacing:.05em;color:#3B6D11;background:#EAF3DE;border-radius:11px;padding:2px 8px;white-space:nowrap">HAS A CARD</span>'+
          '</div>';
          return;
        }

        /* Marked issued but with no card number to show — an old row, or a card that was cancelled.
           Fall back to the dropdown rather than displaying an empty gold box, and treat it as
           "wants a card", which is the truth. */
        if(CARD.status==='issued') CARD.status='pending';

        w.innerHTML='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
          '<select id="pf_card" style="flex:1;min-width:170px">'+
            ['none','pending'].map(function(s){
              var lbl={none:'No card',pending:'Interested — wants a card'}[s];
              return '<option value="'+s+'"'+(CARD.status===s?' selected':'')+'>'+lbl+'</option>';
            }).join('')+
          '</select>'+
          '<button type="button" class="btn ghost sm" id="pf_issue" style="color:#8C6B1F;border-color:#DFC98D;white-space:nowrap">◆ Issue card now</button>'+
        '</div>';

        var sel=$id('pf_card');
        if(sel) sel.onchange=function(){ CARD.status=sel.value; };
        var ib=$id('pf_issue');
        if(ib) ib.onclick=function(){ saveThen(function(pid){ handOffCard(pid, null, function(){ load(); }); }); };
      }

      function paintAuto(){
        var box=$id('pf_auto'); if(!box) return;
        var n=nextFromTag(chosen, todayStr());
        if(!n){ box.style.display='none'; return; }
        box.style.display='block';
        var months=((META.intervals||{})[chosen])||0;
        box.innerHTML='↻ Next call date will be set to <b>'+esc(niceDate(n))+'</b> — '+months+' months, the default for '+esc(chosen)+'.';
        var nx=$id('pf_next');
        if(nx && (isNew || !nx.value)) nx.value=n;
        /* v349: the tag drives what the box calls "the default", and the box has to repaint when
           the tag changes underneath it. */
        var pd=$id('pf_next_pad'); if(pd) pd.setAttribute('data-tag', chosen);
        dpSync('pf_next');
      }
      document.querySelectorAll('#pf_tags .pf-tag').forEach(function(el){
        el.onclick=function(){
          chosen=el.getAttribute('data-t');
          document.querySelectorAll('#pf_tags .pf-tag').forEach(function(x){
            var t=x.getAttribute('data-t'), on=(t===chosen), m=TAGMETA[t]||TAGMETA['Old data'];
            x.style.borderColor=on?m.pill:'#ecedf0';
            x.style.background=on?m.pill:'#fff';
            x.style.color=on?'#fff':'#666';
            x.style.fontWeight=on?'600':'400';
          });
          paintAuto();
        };
      });
      paintAuto();
      paintCardField();

      /* ---- look the number up in what the business already knows ----
         Cards and past samples are keyed by mobile, so typing ten digits should fill in the name
         and address rather than making somebody retype them, and should say plainly whether this
         person already holds a card. */
      var lookupBox=document.createElement('div');
      lookupBox.id='pf_look';
      lookupBox.style.cssText='margin-top:2px';
      var numEl=$id('pf_num');
      if(numEl && numEl.parentNode && numEl.parentNode.parentNode){
        var host=document.querySelector('#modalRoot .grid2');
        if(host){ var slot=document.createElement('div'); slot.className='field full'; slot.appendChild(lookupBox); host.appendChild(slot); }
      }
      var lastLooked='';
      function runLookup(){
        var n=mobile(val('pf_num'));
        if(n.length!==10 || n===lastLooked) return;
        lastLooked=n;
        lookupBox.innerHTML='<div style="font-size:12px;color:#9aa0a6">Checking your records…</div>';
        API.pcLookup(n).then(function(r){
          if(!(r&&r.ok&&r.found)){ lookupBox.innerHTML=''; return; }
          /* fill anything the caller has not typed */
          var nameEl=$id('pf_name'), addrEl=$id('pf_addr');
          if(nameEl && !nameEl.value && r.name) nameEl.value=r.name;
          if(addrEl && !addrEl.value && r.address) addrEl.value=r.address;

          var bits=[];
          if(r.patient){
            bits.push('<div style="font-weight:600;color:#A32D2D">Already on your calling list as '+esc(r.patient.name)+'.</div>'+
              '<button type="button" class="btn ghost sm" id="pf_open" style="margin-top:6px">Open that patient instead</button>');
          }
          /* A live card takes over the Membership card field above — the card itself, no dropdown
             and no Issue button. Showing it twice would just be noise, so it is not repeated here. */
          if(r.activeCard){
            var c=r.activeCard;
            CARD.status='issued'; CARD.number=c.cardNumber||'';
            CARD.typeName=c.typeName||''; CARD.expiry=c.expiryDate||'';
            paintCardField();
          } else if(r.expiredCard){
            var ec=r.expiredCard;
            bits.push('<div style="margin-top:'+(bits.length?'8px':'0')+';font-size:12.5px;color:#A32D2D">'+
              'Had a '+esc(ec.typeName||'card')+(ec.expiryDate?(' that expired '+esc(niceDate(ec.expiryDate))):'')+
              ' — due a renewal.</div>');
          }
          if(r.visits){
            bits.push('<div style="margin-top:8px;font-size:12.5px">'+
              '<b>'+r.visits+'</b> past visit'+(r.visits===1?'':'s')+
              (r.lastVisit?(' · last on '+esc(niceDate(r.lastVisit))):'')+
              (r.totalBusiness?(' · <b style="color:#3B6D11">'+esc(money(r.totalBusiness))+'</b> billed'):'')+'</div>');
            var recent=(r.samples||[]).slice(0,3).map(function(s){
              return '<div style="font-size:11.5px;color:#686868">'+esc(niceDate(s.collectedAt))+' — '+esc(s.tests||'')+(s.amount?(' · '+esc(money(s.amount))):'')+'</div>';
            }).join('');
            if(recent) bits.push('<div style="margin-top:5px">'+recent+'</div>');
          }
          if(!bits.length){ lookupBox.innerHTML=''; return; }
          lookupBox.innerHTML='<div style="background:#EAF3FB;border:1px solid #BCD9F5;border-radius:9px;padding:10px 12px">'+
            '<div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#0C447C;font-weight:700;margin-bottom:6px">Found in your records</div>'+
            bits.join('')+'</div>';
          var ob=$id('pf_open');
          if(ob) ob.onclick=function(){ closeModal(); openPatient(r.patient.patientId); };
        }).catch(function(){ lookupBox.innerHTML=''; });
      }
      if(numEl){
        var lt=null;
        numEl.addEventListener('input',function(){ clearTimeout(lt); lt=setTimeout(runLookup,400); });
        numEl.addEventListener('blur',runLookup);
        if(mobile(numEl.value).length===10) runLookup();
      }

      /* ---- issue a card straight from this form ----
         A card needs a saved patient to attach to, so this saves first and then opens the card
         screen — the caller does not have to save, find the patient again and start over. */
      var issueBtn=$id('pf_issue');
      if(issueBtn) issueBtn.onclick=function(){ saveThen(function(pid){ handOffCard(pid, null, function(){ load(); }); }); };

      function saveThen(after){
        var name=(val('pf_name')||'').trim();
        if(!name){ toast('Patient name is required.',true); return; }
        var num=mobile(val('pf_num'));
        if(isNew && !num){ toast('Mobile number is required.',true); return; }
        if(num && num.length!==10){ toast('Enter a valid 10-digit mobile number.',true); return; }
        var data={ patientId:p.patientId||'', name:name, number:num,
          address:(val('pf_addr')||'').trim(), tag:chosen,
          nextCallAt:val('pf_next')||'', cardStatus:CARD.status, cardNumber:CARD.number,
          assignedToEmpId:$id('pf_assign').value||'' };
        var brSel=$id('pf_branch'); if(brSel) data.branchId=brSel.value;
        var noteEl=$id('pf_note'); if(noteEl) data.note=(noteEl.value||'').trim();
        API.pcSave(data).then(function(r){
          if(r&&(r.ok||r.offline)){ closeModal(); load(); if(after) after(r.patientId||p.patientId); }
          else toast((r&&r.error)||'Could not save',true);
        });
      }

      $id('pf_save').onclick=function(){
        var name=(val('pf_name')||'').trim();
        if(!name){ toast('Patient name is required.',true); return; }
        var num=mobile(val('pf_num'));
        if(isNew && !num){ toast('Mobile number is required — it is how a patient is identified.',true); return; }
        if(num && num.length!==10){ toast('Enter a valid 10-digit mobile number.',true); return; }

        var data={
          patientId:p.patientId||'', name:name, number:num,
          address:(val('pf_addr')||'').trim(), tag:chosen,
          nextCallAt:val('pf_next')||'', cardStatus:CARD.status, cardNumber:CARD.number,
          assignedToEmpId:$id('pf_assign').value||''
        };
        var brSel=$id('pf_branch'); if(brSel) data.branchId=brSel.value;
        var noteEl=$id('pf_note'); if(noteEl) data.note=(noteEl.value||'').trim();

        var btn=$id('pf_save'); btn.disabled=true; btn.innerHTML='<span class="loader"></span>';
        API.pcSave(data).then(function(r){
          if(r&&(r.ok||r.offline)){
            closeModal();
            if(r.duplicate) toast(r.message||'That number is already on file.');
            else toast(r.offline?'Saved on device — will sync':(isNew?'Patient added':'Saved'));
            load();
          } else {
            toast((r&&r.error)||'Could not save',true);
            btn.disabled=false; btn.textContent=isNew?'Save patient':'Save changes';
          }
        });
      };
    });
  }

  /* ============================================================ SCREEN 3 — the patient file */
  function openPatient(patientId, after){
    API.pcGet(patientId).then(function(r){
      if(!(r&&r.ok)){ toast((r&&r.error)||'Could not open this patient',true); return; }
      ensureMeta().then(function(){ paintPatient(r, after); });
    });
  }

  function paintPatient(r, after){
    var p=r.patient, names=r.names||{}, c=hue(p.name);
    var noCard=(p.cardStatus!=='issued');
    var overdue = p.nextCallAt && p.nextCallAt < (PC.today||todayStr());

    /* one timeline out of three sources, newest first */
    var events=[];
    (r.calls||[]).forEach(function(x){
      events.push({ at:x.startedAt, kind:'call', by:x.empId,
        title:'Call — '+(OUTLABEL[x.outcome]||x.outcome)+(x.seconds?(' · '+mmss(x.seconds)):'')+
              (x.nextCallAt?(' · next '+niceDate(x.nextCallAt)):''),
        body:x.note||'' });
    });
    (r.samples||[]).forEach(function(x){
      events.push({ at:x.collectedAt, kind:'sample', by:x.collectedByEmpId,
        title:'Sample collected'+(x.tests?(' · '+x.tests):'')+' · <b style="color:#3B6D11">'+money(x.amount)+'</b>',
        body:'' });
    });
    (r.notes||[]).forEach(function(x){
      if(x.kind==='call') return;                       /* already shown on the call itself */
      var t={ note:'Note', tag:'Tag changed', assign:'Reassigned',
              card:'Membership card', sample:'Sample' }[x.kind] || 'Note';
      events.push({ at:x.createdAt, kind:(x.kind==='card'?'card':'note'), by:x.empId, title:t, body:x.message||'' });
    });
    events.sort(function(a,b){ return new Date(b.at||0) - new Date(a.at||0); });

    var dot={ call:'#1a7f37', sample:'#BA7517', card:'#C9A227', note:'#185FA5' };

    var head='<div style="display:flex;gap:11px;align-items:center">'+
        '<div style="width:42px;height:42px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;background:'+c[0]+';color:'+c[1]+'">'+esc(initials(p.name))+'</div>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-weight:700;font-size:16px">'+esc(p.name)+'</div>'+
          '<div style="font-size:12px;color:#686868;margin-top:2px">'+esc(p.number||'no number')+
            (p.address?(' · '+esc(p.address)):'')+' · '+esc(p.branchId||'')+'</div>'+
        '</div></div>'+
      '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">'+
        tagChip(p.tag)+cardChip(p)+
        (p.assignedToName?'<span style="background:#EFF1F3;color:#5C646E;border-radius:11px;font-size:9.5px;padding:2px 8px;font-weight:700">CRM · '+esc(p.assignedToName.toUpperCase())+'</span>':'')+
        (r.business?'<span style="background:#EAF3DE;color:#3B6D11;border-radius:11px;font-size:9.5px;padding:2px 8px;font-weight:700">'+esc(money(r.business))+' BROUGHT IN</span>':'')+
      '</div>';

    var banner = overdue
      ? '<div class="msg error" style="margin-top:12px">⚠ Follow-up was due '+esc(niceDate(p.nextCallAt))+'</div>'
      : (p.nextCallAt ? '<div class="msg ok" style="margin-top:12px">Next call '+esc(niceDate(p.nextCallAt))+'</div>' : '');

    var actions='<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:12px">'+
      (noCard?'<button class="btn ghost" id="pd_card" style="color:#8C6B1F;border-color:#DFC98D">◆ Issue card</button>':'')+
      (r.canCollect?'<button class="btn ghost" id="pd_samp">\u{1F9EA} Book sample</button>':'')+
      '<button class="btn ghost" id="pd_edit">✎ Edit</button>'+
    '</div>';

    var timeline = events.length
      ? '<div style="border-left:2px solid #ecedf0;margin-left:6px;padding-left:15px;display:flex;flex-direction:column;gap:13px">'+
          events.map(function(e){
            return '<div style="position:relative">'+
              '<span style="position:absolute;left:-21px;top:5px;width:9px;height:9px;border-radius:50%;background:#fff;border:2px solid '+(dot[e.kind]||'#185FA5')+'"></span>'+
              '<div style="font-size:10.5px;color:#9aa0a6;letter-spacing:.02em">'+esc(niceWhen(e.at))+
                (e.by?(' · '+esc((names[e.by]||e.by).toUpperCase())):'')+'</div>'+
              '<div style="font-size:12.5px;margin-top:1px">'+e.title+'</div>'+
              (e.body?'<div style="font-size:12px;color:#4d4d4d;background:#f6f7f9;border-radius:8px;padding:7px 9px;margin-top:5px;white-space:pre-line">'+esc(e.body)+'</div>':'')+
            '</div>';
          }).join('')+
        '</div>'
      : '<div class="empty">Nothing recorded yet.</div>';

    var addNote='<div style="display:flex;gap:6px;margin-top:12px">'+
      '<input id="pd_note" placeholder="Add a note…" style="flex:1;border:1px solid #ecedf0;border-radius:20px;padding:8px 12px;font-size:13px">'+
      '<button class="btn sm" id="pd_noteAdd">Add</button></div>';

    openModal('Patient file',
      head+banner+actions+
      '<div class="section-label" style="margin-top:16px">History — '+events.length+' entr'+(events.length===1?'y':'ies')+'</div>'+
      timeline+addNote,
      '<button class="btn ghost" onclick="closeModal()">Close</button>');

    function reopen(){ load(); openPatient(p.patientId, after); }

    var b;
    if((b=$id('pd_card'))) b.onclick=function(){ handOffCard(p.patientId, null, reopen); };
    if((b=$id('pd_samp'))) b.onclick=function(){ handOffSample(p, null, reopen); };
    if((b=$id('pd_edit'))) b.onclick=function(){ closeModal(); openPatientForm(p); };

    $id('pd_noteAdd').onclick=function(){
      var inp=$id('pd_note'), msg=(inp.value||'').trim();
      if(!msg) return;
      inp.value='';
      API.pcAddNote(p.patientId, msg).then(function(x){
        if(x&&(x.ok||x.offline)) reopen(); else toast((x&&x.error)||'Could not add the note',true);
      });
    };
  }

  /* ============================================================ SCREEN 4 — call, then log it */
  function openPatientCall(patientId){
    API.pcGet(patientId).then(function(r){
      if(!(r&&r.ok)){ toast((r&&r.error)||'Could not open this patient',true); return; }
      ensureMeta().then(function(){ paintCall(r); });
    });
  }

  function paintCall(r){
    var p=r.patient;
    var noCard=(p.cardStatus!=='issued');
    var chosen='answered';
    /* device-side id, so a reply lost on a bad connection cannot log the same call twice */
    var callId='PC-'+me()+'-'+Date.now();

    var body=
      '<div class="card" style="padding:18px;text-align:center;margin-bottom:15px">'+
        '<div style="font-size:23px;font-weight:700;letter-spacing:.02em">'+esc(p.number||'—')+'</div>'+
        '<div style="font-size:12.5px;color:#686868;margin-top:2px">'+esc(p.name)+' · '+esc(p.tag||'')+'</div>'+
        (p.number
          ? '<a href="tel:'+esc(digits(p.number))+'" id="pc_dial" style="display:inline-flex;align-items:center;gap:8px;background:#1a7f37;color:#fff;border-radius:26px;padding:12px 30px;font-size:14px;font-weight:700;margin-top:14px;text-decoration:none">☎ Call now</a>'
          : '<div class="msg error" style="margin-top:12px">No number on file.</div>')+
        '<div style="font-size:10.5px;color:#9aa0a6;margin-top:9px">Opens your phone dialer. Come back here to log it.</div>'+
      '</div>'+
      '<div class="field"><label>How did it go?</label>'+
        '<div id="pc_out" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">'+
          Object.keys(OUTLABEL).map(function(k){
            var on=(k===chosen);
            return '<div class="pc-oc" data-o="'+k+'" style="cursor:pointer;border:1px solid '+(on?'#1a7f37':'#ecedf0')+';background:'+(on?'#EAF6EE':'#fff')+';color:'+(on?'#3B6D11':'#5a5a5a')+';font-weight:'+(on?'700':'400')+';border-radius:9px;padding:8px 4px;text-align:center;font-size:11px">'+esc(OUTLABEL[k])+'</div>';
          }).join('')+
        '</div></div>'+
      /* v349: full width and on its own row — the typing box carries a spelled-out date and a
         busy-day warning beside it, which do not fit in half a row on a phone. */
      '<div class="field full" style="margin-top:9px"><label>Next call date</label>'+
        datePad('pc_next', nextFromTag(p.tag, todayStr()), p.tag)+'</div>'+
      '<div class="msg ok" id="pc_auto" style="font-size:12px"></div>'+
      '<div class="field full" style="margin-top:11px"><label>Notes</label><textarea id="pc_note" rows="2" placeholder="Booked full body check-up for 2 Sept."></textarea></div>'+
      '<div class="field full"><label>Did the call produce anything?</label>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
          (r.canCollect
            ? '<div id="pc_samp" style="cursor:pointer;border:1px solid #ecedf0;border-radius:10px;padding:11px 12px;background:#fff;display:flex;gap:9px;align-items:center">'+
              '<span style="width:28px;height:28px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;font-size:14px;background:#FAEEDA">\u{1F9EA}</span>'+
              '<span><b style="display:block;font-size:12.5px">Book a home visit</b><small style="color:#686868;font-size:10.5px">Opens the phlebotomist&rsquo;s diary</small></span></div>'
            : '')+
          (noCard
            ? '<div id="pc_card" style="cursor:pointer;border:1px solid #DFC98D;border-radius:10px;padding:11px 12px;background:#FFFDF7;display:flex;gap:9px;align-items:center">'+
              '<span style="width:28px;height:28px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;font-size:14px;background:#F7EFD8">◆</span>'+
              '<span><b style="display:block;font-size:12.5px">Issue membership card</b><small style="color:#686868;font-size:10.5px">No card yet</small></span></div>'
            : '<div style="border:1px solid #ecedf0;border-radius:10px;padding:11px 12px;background:#f6f7f9;display:flex;gap:9px;align-items:center">'+
              '<span style="width:28px;height:28px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;font-size:14px;background:#F7EFD8">◆</span>'+
              '<span><b style="display:block;font-size:12.5px">Card already issued</b><small style="color:#686868;font-size:10.5px">'+esc(p.cardNumber||'')+'</small></span></div>')+
        '</div>'+
        '<div id="pc_done" style="margin-top:8px"></div>'+
      '</div>';

    openModal('Call · '+esc(p.name), body,
      '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="pc_save">Save &amp; next patient</button>');

    wireDatePad('pc_next');   /* v349 */

    var linked={ sampleId:'', cardNumber:'', cardStatus:'' };

    function paintAuto(){
      var box=$id('pc_auto');
      if(chosen!=='answered'){
        box.className='msg'; box.style.background='#EFF1F3'; box.style.color='#5C646E';
        box.innerHTML='Could not speak to them — the follow-up date is left as it was.';
        return;
      }
      box.className='msg ok';
      box.style.background=''; box.style.color='';
      var months=((META.intervals||{})[p.tag])||0;
      box.innerHTML='↻ Filled from the <b>'+esc(p.tag||'')+'</b> tag — '+months+' months. Change it if the patient asked for a different time.';
    }
    paintAuto();

    document.querySelectorAll('#pc_out .pc-oc').forEach(function(el){
      el.onclick=function(){
        chosen=el.getAttribute('data-o');
        document.querySelectorAll('#pc_out .pc-oc').forEach(function(x){
          var on=(x.getAttribute('data-o')===chosen);
          x.style.borderColor=on?'#1a7f37':'#ecedf0';
          x.style.background=on?'#EAF6EE':'#fff';
          x.style.color=on?'#3B6D11':'#5a5a5a';
          x.style.fontWeight=on?'700':'400';
        });
        var nx=$id('pc_next');
        if(chosen!=='answered') nx.value=d10(p.nextCallAt)||'';
        else nx.value=nextFromTag(p.tag, todayStr());
        dpSync('pc_next');   /* v349: the outcome moved the date — the box has to say so */
        paintAuto();
      };
    });

    function markDone(txt){
      var d=$id('pc_done');
      if(d) d.innerHTML='<div class="msg ok" style="font-size:12px">✓ '+esc(txt)+'</div>';
    }

    var el;
    if((el=$id('pc_samp'))) el.onclick=function(){
      handOffSample(p, callId, function(res){
        if(res&&res.sampleId){ linked.sampleId=res.sampleId; markDone('Sample booked'+(res.amount?(' · '+money(res.amount)):'')); }
      });
    };
    if((el=$id('pc_card'))) el.onclick=function(){
      handOffCard(p.patientId, callId, function(res){
        if(res&&res.cardNumber){
          linked.cardNumber=res.cardNumber; linked.cardStatus='issued';
          markDone('Card issued · '+res.cardNumber);
        }
      });
    };

    $id('pc_save').onclick=function(){
      /* v349: the server has refused a call without a next date since v346, but a caller with a
         patient still on the line should be told here, in the box, not after a round trip. */
      if(chosen!=='lost' && !val('pc_next')){
        toast('Set the next call date first — type 3m, 2w or 7 in the box.',true);
        dpSync('pc_next');
        var t=$id('pc_next_txt'); if(t) try{ t.focus(); }catch(e){}
        return;
      }
      var btn=$id('pc_save'); btn.disabled=true; btn.innerHTML='<span class="loader"></span>';
      API.pcLogCall({
        callId:callId, patientId:p.patientId, outcome:chosen,
        nextCallAt:val('pc_next')||'',
        note:(($id('pc_note')||{}).value||'').trim(),
        sampleId:linked.sampleId, cardNumber:linked.cardNumber,
        cardStatus:linked.cardStatus
      }).then(function(x){
        if(x&&(x.ok||x.offline)){
          closeModal();
          toast(x.offline?'Saved on device — will sync':'Call logged');
          load();
          nextInQueue(p.patientId);
        } else {
          toast((x&&x.error)||'Could not save the call',true);
          btn.disabled=false; btn.textContent='Save & next patient';
        }
      });
    };
  }

  /* After logging, jump straight to the next person in the working list — a calling session
     should not send you back to a list and make you find your place again. */
  function nextInQueue(justDone){
    if(PC.tab!=='followups' && PC.tab!=='mine') return;
    var i=-1;
    for(var k=0;k<PC.rows.length;k++){ if(PC.rows[k].patientId===justDone){ i=k; break; } }
    var nxt=PC.rows[i+1];
    if(i>=0 && nxt && nxt.number) setTimeout(function(){ openPatientCall(nxt.patientId); }, 350);
  }

  /* ============================================================ SCREEN 5 — the two hand-offs */

  /* Opens the EXISTING Collect-sample modal from ops.js, pre-filled and locked on identity. */
  /* ============================================================================================
     v349 — FROM A CALL YOU BOOK A VISIT. YOU DO NOT LOG A SAMPLE.

     WHAT WAS WRONG. This opened openCollectSample — the "blood is already drawn, record it" form.
     It demands tests, an amount, a prescription and a photo BEFORE it will save, because that is
     what recording a completed collection needs. On a phone call none of those exist: nobody has
     been to the patient's house yet. So the caller was being asked to invent four things, while
     the popup the dashboard opens for the same job — pick a phlebotomist, pick a day and a time —
     was sitting right there unused.

     WHAT IT DOES NOW. It opens openBookCollection, byte for byte the popup the dashboard's own
     "Sample collection" button opens, with the patient's name, mobile, address and branch already
     filled in. Name and mobile are locked so the person on the call cannot be typed over. The
     booked visit links back to this call exactly as the old one did — apiSaveOrder returns the same
     sampleId, so pcLinkSample never knew the difference.

     AMOUNT. The booking form makes it compulsory, which is right on the dashboard and wrong on a
     call — the price follows the prescription, and the prescription is at the door. From the CRM it
     may be left blank and the phlebotomist fills it in when he gets there. Dashboard bookings are
     untouched. See amountOptional in ops.js.
     ============================================================================================ */
  function handOffSample(p, callId, after){
    var book = window.openBookCollection;
    if(typeof book !== 'function'){
      /* An older bundle without the booking popup — fall back to the collect form rather than
         leaving the caller with a dead button. */
      if(typeof window.openCollectSample === 'function') book = null;
      else { toast('The Sample Collection module is not loaded.',true); return; }
    }
    var prefill = {
      name:p.name, mobile:digits(p.number), address:p.address||'',
      branchId:p.branchId||'', lock:true, amountOptional:true,
      fromLabel:'FROM CRM · '+String(p.name||'').toUpperCase()
    };
    function linkIt(saved){
      var sid=(saved&&(saved.sampleId||saved.id))||'';
      if(!sid){ if(after) after(null); return; }
      API.pcLinkSample(p.patientId, sid, callId||'').then(function(r){
        if(r&&r.ok){ toast('Visit booked for '+p.name); if(after) after(r); }
        else { toast((r&&r.error)||'Visit booked, but could not link it to the patient',true); if(after) after(null); }
      });
    }
    if(book) book(linkIt, prefill);
    else window.openCollectSample(linkIt, prefill);
  }

  /* Opens the EXISTING Issue-card modal from membership.js, pre-filled. */
  function handOffCard(patientId, callId, after){
    if(typeof window.openIssueCardModal !== 'function'){
      toast('The Membership Cards module is not loaded.',true); return;
    }
    var known=null;
    for(var i=0;i<PC.rows.length;i++){ if(PC.rows[i].patientId===patientId){ known=PC.rows[i]; break; } }

    function go(p){
      window.openIssueCardModal({
        holderName:p.name, mobile:digits(p.number), branchId:p.branchId||'',
        referByName:((window.S&&S.user&&S.user.FullName)||'')+' (CRM)',
        lock:true, fromLabel:'FROM CRM · '+String(p.name||'').toUpperCase()
      }, function(saved){
        var cn=(saved&&(saved.cardNumber||saved.card))||'';
        if(!cn){ if(after) after(null); return; }
        API.pcLinkCard(patientId, cn, callId||'').then(function(r){
          if(r&&r.ok){ toast('Card '+cn+' saved to '+p.name); load(); if(after) after(r); }
          else { toast((r&&r.error)||'Card issued, but could not link it to the patient',true); if(after) after(null); }
        });
      });
    }

    if(known) go(known);
    else API.pcGet(patientId).then(function(r){ if(r&&r.ok) go(r.patient); else toast('Could not open this patient',true); });
  }

  /* ============================================================ SCREEN 6 — bulk upload */
  /* A CSV parser that survives quoted fields containing commas and newlines — old lab exports
     are full of "Adajan, Surat". A naive split(',') silently shifts every later column. */
  function parseCSV(text){
    var rows=[], row=[], cur='', q=false;
    text=String(text||'').replace(/^﻿/,'').replace(/\r\n?/g,'\n');
    for(var i=0;i<text.length;i++){
      var ch=text[i];
      if(q){
        if(ch==='"'){ if(text[i+1]==='"'){ cur+='"'; i++; } else q=false; }
        else cur+=ch;
      } else {
        if(ch==='"') q=true;
        else if(ch===','){ row.push(cur); cur=''; }
        else if(ch==='\n'){ row.push(cur); rows.push(row); row=[]; cur=''; }
        else cur+=ch;
      }
    }
    if(cur!=='' || row.length){ row.push(cur); rows.push(row); }
    return rows.filter(function(r){ return r.some(function(c){ return String(c).trim()!==''; }); });
  }

  function guessColumn(headers, wants){
    for(var w=0;w<wants.length;w++){
      for(var h=0;h<headers.length;h++){
        if(String(headers[h]).toLowerCase().replace(/[^a-z]/g,'').indexOf(wants[w])>=0) return h;
      }
    }
    return -1;
  }

  function openBulkUpload(){
    ensureMeta().then(function(){
      var body='<div class="grid2">'+
        '<div class="field"><label>Upload into branch</label><select id="bu_branch">'+
          branchOptions(PC.branch||META.myBranch,'')+'</select></div>'+
        '<div class="field"><label>Tag all as</label><select id="bu_tag">'+
          (META.tags||[]).map(function(t){ return '<option'+(t==='Old data'?' selected':'')+'>'+esc(t)+'</option>'; }).join('')+
        '</select></div>'+
        '<div class="field full"><label>Assign all to (optional)</label><select id="bu_assign">'+peopleOptions('')+'</select></div>'+
      '</div>'+
      '<label style="display:block;border:2px dashed #CFD5DD;border-radius:12px;padding:24px 16px;text-align:center;background:#fff;color:#686868;font-size:12.5px;cursor:pointer;margin-top:4px">'+
        '<div style="font-size:26px;margin-bottom:6px">⬆</div>'+
        '<div id="bu_fname"><b>Choose a CSV file</b></div>'+
        '<div style="font-size:11px;margin-top:4px">Export your old patient list as CSV and drop it here</div>'+
        '<input type="file" id="bu_file" accept=".csv,text/csv" hidden></label>'+
      '<div id="bu_map"></div><div id="bu_msg"></div>';

      openModal('Bulk upload patients', body,
        '<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="bu_go" disabled>Import</button>');

      var parsed=null;

      $id('bu_file').onchange=function(){
        var f=this.files && this.files[0];
        if(!f) return;
        $id('bu_fname').innerHTML='<b>'+esc(f.name)+'</b>';
        var fr=new FileReader();
        fr.onload=function(){
          var rows=parseCSV(fr.result);
          if(rows.length<2){ $id('bu_msg').innerHTML='<div class="msg error">That file has no data rows.</div>'; return; }
          parsed={ headers:rows[0], body:rows.slice(1), fileName:f.name };
          paintMap();
        };
        fr.readAsText(f);
      };

      function paintMap(){
        var h=parsed.headers;
        var guess={
          name:    guessColumn(h,['patientname','name','fullname']),
          number:  guessColumn(h,['mobile','phone','contact','number','cell']),
          address: guessColumn(h,['address','city','area','location']),
          note:    guessColumn(h,['note','remark','test','comment','lasttest'])
        };
        function sel(id, cur){
          return '<select id="'+id+'" style="border:1px solid #ecedf0;border-radius:8px;padding:6px 9px;font-size:12px">'+
            '<option value="-1">— not in this file —</option>'+
            h.map(function(c,i){ return '<option value="'+i+'"'+(i===cur?' selected':'')+'>'+esc(c||('Column '+(i+1)))+'</option>'; }).join('')+
          '</select>';
        }
        $id('bu_map').innerHTML=
          '<div class="section-label" style="margin-top:14px">Match your columns</div>'+
          '<div class="card" style="padding:12px 14px">'+
            '<div style="display:grid;grid-template-columns:120px 1fr;gap:9px 12px;align-items:center;font-size:12.5px">'+
              '<b>Name *</b>'+sel('bu_c_name',guess.name)+
              '<b>Number *</b>'+sel('bu_c_num',guess.number)+
              '<b>Address</b>'+sel('bu_c_addr',guess.address)+
              '<b>First note</b>'+sel('bu_c_note',guess.note)+
            '</div>'+
          '</div>'+
          '<div id="bu_prev" style="margin-top:10px"></div>';

        ['bu_c_name','bu_c_num','bu_c_addr','bu_c_note'].forEach(function(id){
          var e=$id(id); if(e) e.onchange=preview;
        });
        preview();
      }

      function build(){
        var ci={
          name:  parseInt($id('bu_c_name').value,10),
          num:   parseInt($id('bu_c_num').value,10),
          addr:  parseInt($id('bu_c_addr').value,10),
          note:  parseInt($id('bu_c_note').value,10)
        };
        var out=[], bad=0, seen={};
        parsed.body.forEach(function(r){
          var name = ci.name>=0 ? String(r[ci.name]||'').trim() : '';
          var num  = ci.num>=0  ? mobile(r[ci.num]) : '';
          if(!name && !num){ bad++; return; }
          if(num && num.length!==10){ bad++; return; }
          if(num && seen[num]){ bad++; return; }
          if(num) seen[num]=1;
          out.push({
            name:name, number:num,
            address: ci.addr>=0 ? String(r[ci.addr]||'').trim() : '',
            note:    ci.note>=0 ? String(r[ci.note]||'').trim() : ''
          });
        });
        return { rows:out, bad:bad };
      }

      function preview(){
        var b=build();
        var box=$id('bu_prev');
        box.innerHTML='<div class="msg '+(b.rows.length?'ok':'error')+'" style="font-size:12.5px">'+
          '<b>'+b.rows.length+'</b> patient'+(b.rows.length===1?'':'s')+' ready to import'+
          (b.bad?(' · <b>'+b.bad+'</b> skipped (no name/number, bad mobile, or duplicated inside the file)'):'')+
          '<div style="font-size:11px;margin-top:4px;opacity:.85">Numbers already on file are counted, never overwritten — an old export cannot wipe a live note.</div>'+
        '</div>';
        $id('bu_go').disabled = !b.rows.length;
        $id('bu_go').textContent = b.rows.length ? ('Import '+b.rows.length+' patients') : 'Import';
      }

      $id('bu_go').onclick=function(){
        if(!parsed) return;
        var b=build();
        if(!b.rows.length) return;
        if(b.rows.length>3000){
          toast('That is '+b.rows.length+' rows. Split the file — 3,000 at a time is the safe limit.',true);
          return;
        }
        var btn=$id('bu_go'); btn.disabled=true; btn.innerHTML='<span class="loader"></span> Importing…';
        API.pcImport({
          branchId:$id('bu_branch').value, tag:$id('bu_tag').value,
          assignedToEmpId:$id('bu_assign').value||'',
          fileName:parsed.fileName, rows:b.rows
        }).then(function(r){
          if(r&&r.ok){
            closeModal();
            toast(r.added+' added · '+r.existing+' already on file');
            PC.tab='cold'; PC.page=0; paintTabs(); load();
          } else {
            toast((r&&r.error)||'Import failed',true);
            btn.disabled=false; btn.textContent='Import '+b.rows.length+' patients';
          }
        });
      };
    });
  }

  /* ============================================================ SCREEN 7 — management dashboard */
  function renderCrmPerf(){
    var v=$id('page-crmperf'); if(!v) return;
    v.innerHTML=loader('Loading performance…');
    ensureMeta().then(function(){
      if(!PERF.ym) PERF.ym=ymNow();
      if(!PERF.branch && META && !META.canViewAll) PERF.branch=META.myBranch||'';
      v.innerHTML=
        '<div class="page-head"><h1>CRM performance</h1><div class="spacer"></div>'+
          (META.canViewAll?'<select id="cpBranch" class="greet-select">'+branchOptions(PERF.branch,'All branches')+'</select> ':'')+
          '<input id="cpYm" type="month" class="greet-select" value="'+esc(PERF.ym)+'" style="min-width:150px"></div>'+
        '<div class="kpis" id="cpKpis"></div>'+
        '<div class="section-label">By person — anyone who logged a call</div>'+
        '<div id="cpTable">'+loader()+'</div>'+
        '<div class="section-label" style="margin-top:18px">Calls by hour</div>'+
        '<div id="cpHours"></div>';
      var b=$id('cpBranch');
      if(b) b.onchange=function(){ PERF.branch=b.value; loadPerf(); };
      $id('cpYm').onchange=function(){ PERF.ym=$id('cpYm').value; loadPerf(); };
      loadPerf();
    });
  }

  function loadPerf(){
    API.pcDash(PERF.branch, PERF.ym).then(function(r){
      var box=$id('cpTable'); if(!box) return;
      if(!(r&&r.ok)){ box.innerHTML='<div class="msg error">'+esc((r&&r.error)||'Could not load performance.')+'</div>'; return; }
      var t=r.totals||{};
      $id('cpKpis').innerHTML=
        '<div class="kpi"><div class="n" style="color:#185FA5">'+(t.calls||0)+'</div><div class="l">Calls this month</div></div>'+
        '<div class="kpi"><div class="n" style="color:#1a7f37">'+(t.samples||0)+'</div><div class="l">Samples collected</div></div>'+
        '<div class="kpi"><div class="n" style="color:#8C6B1F">'+(t.cards||0)+'</div><div class="l">Cards distributed</div></div>'+
        '<div class="kpi"><div class="n">'+esc(money(t.business||0))+'</div><div class="l">Business generated</div></div>';

      var people=r.people||[];
      if(!people.length){ box.innerHTML='<div class="empty">Nobody logged a call this month.</div>'; }
      else {
        box.innerHTML='<div class="card"><div class="table-wrap"><table>'+
          '<thead><tr><th>Person</th><th>Role</th><th style="text-align:right">Calls</th>'+
          '<th style="text-align:right">Answered</th><th style="text-align:right">Talk time</th>'+
          '<th style="text-align:right">Samples</th><th style="text-align:right">Cards</th>'+
          '<th style="text-align:right">Business</th><th style="text-align:right">Overdue</th></tr></thead><tbody>'+
          people.map(function(p){
            var c=hue(p.name);
            var od = p.overdue>10 ? '#C0392B' : (p.overdue>0 ? '#BA7517' : '#1a7f37');
            return '<tr>'+
              '<td><span style="display:inline-flex;align-items:center;gap:8px">'+
                '<span style="width:24px;height:24px;border-radius:50%;font-size:9.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;background:'+c[0]+';color:'+c[1]+'">'+esc(initials(p.name))+'</span>'+
                esc(p.name)+'</span></td>'+
              '<td style="color:#686868">'+esc(p.role||'')+(p.branch?(' · '+esc(p.branch)):'')+'</td>'+
              '<td style="text-align:right">'+p.calls+'</td>'+
              '<td style="text-align:right">'+p.answered+'</td>'+
              '<td style="text-align:right">'+esc(mmss(p.seconds))+'</td>'+
              '<td style="text-align:right">'+p.samples+'</td>'+
              '<td style="text-align:right">'+p.cards+'</td>'+
              '<td style="text-align:right;font-weight:600">'+esc(money(p.business))+'</td>'+
              '<td style="text-align:right;color:'+od+';font-weight:600">'+p.overdue+'</td>'+
            '</tr>';
          }).join('')+
        '</tbody></table></div>'+
        '<div style="padding:9px 14px;font-size:11px;color:#9aa0a6;border-top:1px solid #ecedf0">'+
          'Business = the '+esc(r.amountField==='receivedAmount'?'amount actually collected':'billed amount')+
          ' on samples booked from a call, or given within '+(r.walkinDays||30)+' days of one.'+
        '</div></div>';
      }
      loadHours();
    });
  }

  function loadHours(){
    API.pcHours(PERF.branch, todayStr()).then(function(r){
      var box=$id('cpHours'); if(!box) return;
      if(!(r&&r.ok)){ box.innerHTML=''; return; }
      var all=r.hours||[];
      /* Show the working day only — a 24-bar chart of mostly zeros hides the shape. */
      var from=7, to=21, hrs=all.slice(from,to+1);
      var max=Math.max.apply(null,hrs.concat([1]));
      var total=all.reduce(function(a,b){ return a+b; },0);
      if(!total){ box.innerHTML='<div class="empty">No calls logged today yet.</div>'; return; }
      var peak=hrs.indexOf(max)+from;

      box.innerHTML='<div class="card" style="padding:15px 16px 10px">'+
        '<div style="font-size:12.5px;font-weight:600">'+total+' call'+(total===1?'':'s')+' today</div>'+
        '<div style="font-size:11px;color:#686868;margin-bottom:14px">Busiest at '+peak+':00.</div>'+
        '<div style="display:grid;grid-template-columns:repeat('+hrs.length+',1fr);gap:2px;align-items:end;height:104px;border-bottom:1px solid #ecedf0">'+
          hrs.map(function(n,i){
            var h=Math.max(2,Math.round((n/max)*96));
            var isPeak=(n===max&&n>0);
            return '<div title="'+(i+from)+':00 — '+n+' calls" style="position:relative;background:#185FA5;border-radius:4px 4px 0 0;height:'+h+'%;opacity:'+(n?1:.18)+'">'+
              (isPeak?'<span style="position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:700;color:#0C447C">'+n+'</span>':'')+
            '</div>';
          }).join('')+
        '</div>'+
        '<div style="display:grid;grid-template-columns:repeat('+hrs.length+',1fr);gap:2px;margin-top:5px">'+
          hrs.map(function(n,i){ return '<span style="font-size:9px;color:#9aa0a6;text-align:center">'+(i+from)+'</span>'; }).join('')+
        '</div></div>';
    });
  }


  /* ============================================================ DASHBOARD BAR
     The front screen is where people actually land, so the two things that make money live here:
     the calling queue, and issuing a card. The number box is a dialer shortcut — type a mobile,
     press Enter, and you are on the call screen for that patient without opening any page. */
  function renderPatientBar(host){
    if(!host) return;
    var box=document.getElementById('pcDashBar');
    if(!box){
      box=document.createElement('div');
      box.id='pcDashBar';
      box.style.cssText='margin-bottom:14px';
      host.parentNode.insertBefore(box, host);
    }
    /* v355: the quick-dial lookup and "Call list" shortcut both existed only to jump into calling,
       which is gone from the CRM now — Issue card and Add patient are what's left worth a shortcut. */
    box.innerHTML='<div class="card" style="padding:13px 14px">'+
      '<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">'+
        '<button class="btn sm ghost" id="pcBarCard" style="color:#8C6B1F;border-color:#DFC98D">◆ Issue card</button>'+
        '<button class="btn sm ghost" id="pcBarAdd">+ Add patient</button>'+
      '</div>'+
    '</div>';

    document.getElementById('pcBarAdd').onclick=function(){ ensureMeta().then(function(){ openPatientForm(null); }); };
    document.getElementById('pcBarCard').onclick=function(){
      if(typeof window.openIssueCardModal!=='function'){ toast('Membership Cards is not loaded.',true); return; }
      window.openIssueCardModal();     /* no pre-fill — the ordinary card screen */
    };
  }

  /* ---------------- exports ---------------- */
  window.renderPatientCRM = renderPatientCRM;
  window.renderPatientBar = renderPatientBar;
  window.renderCrmPerf    = renderCrmPerf;
  window.openPatient      = openPatient;
  window.openPatientCall  = openPatientCall;

})();
