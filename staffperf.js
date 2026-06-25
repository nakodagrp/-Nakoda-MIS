/* ============================================================
 *  Staff Performance — two scores (Dedication + Performance)
 *  - window.renderStarBlock(host): the dashboard card strip
 *  - window.renderStaffPerf():     the full leaderboard page
 *  Reads API.staffPerformance(from,to,branch). All scoring is server-side.
 * ============================================================ */
(function(){
  function $id(i){ return document.getElementById(i); }
  function monthFrom(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01'; }
  function todayD(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function ini(n){ return String(n||'').replace(/^Dr\.?\s*/i,'').split(' ').slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase(); }
  function tier(s){ if(s>=85) return '#1D9E75'; if(s>=70) return '#BA7517'; return '#E24B4A'; }
  var palette=['#1D9E75','#534AB7','#D85A30','#185FA5','#993556','#854F0B','#0F6E56'];
  function colorFor(n){ var h=0,s=String(n||''); for(var i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return palette[h%palette.length]; }
  function meId(){ return (window.S&&S.user&&S.user.EmpID)||''; }
  function myBranch(){ return (window.S&&S.user&&S.user.Branch)||''; }

  /* ---------- dashboard star strip ---------- */
  var SB={rows:[],scope:'all',mode:'dedication',host:null};
  function seg(group,opts,active){
    return '<div style="display:inline-flex;gap:3px;background:#f1f1f1;border-radius:20px;padding:3px;">'+opts.map(function(o){
      var on=o[0]===active; return '<span data-seg="'+group+'" data-v="'+o[0]+'" style="cursor:pointer;font-size:11px;padding:4px 11px;border-radius:18px;'+(on?'background:#fff;color:#222;font-weight:600;':'color:#777;')+'">'+o[1]+'</span>';
    }).join('')+'</div>';
  }
  function card(d,mode){
    var s=d[mode], me=(meId()&&meId()===d.emp), bdr=(s>=70?'#1f9d57':'#e0a800');
    var av = d.photo ? '<img src="'+esc(d.photo)+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" alt="">'
                     : '<div style="position:absolute;inset:0;background:'+colorFor(d.name)+';display:flex;align-items:center;justify-content:center;"><span style="font-size:24px;font-weight:700;color:#fff;">'+esc(ini(d.name))+'</span></div>';
    return '<div style="flex:0 0 92px;position:relative;height:100px;border-radius:11px;overflow:hidden;border:2px solid '+bdr+';">'+av+
      '<span style="position:absolute;top:3px;left:6px;color:#DA1017;font-weight:700;font-size:13px;text-shadow:0 1px 2px rgba(255,255,255,.75);">'+s+'</span>'+
      (me?'<span style="position:absolute;top:3px;right:4px;background:#185FA5;color:#fff;font-size:8px;font-weight:700;padding:1px 5px;border-radius:8px;">YOU</span>':'')+
      '<div style="position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);padding:3px 6px;"><span style="display:block;color:#fff;font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(d.name)+'</span></div>'+
    '</div>';
  }
  function panel(inner){ return '<div style="border:1px solid #eee;border-radius:12px;background:#fff;padding:9px 11px;margin:2px 0 12px;">'+inner+'</div>'; }
  function paintStar(){
    var host=SB.host; if(!host) return;
    var full=SB.rows.filter(function(d){ return SB.scope==='all' || String(d.branch)===String(myBranch()); })
      .sort(function(a,b){ var d=b[SB.mode]-a[SB.mode]; return d!==0?d:((a.rkey||0)-(b.rkey||0)); });
    var top=full.slice(0,5), myIdx=-1;
    for(var i=0;i<full.length;i++){ if(full[i].emp===meId()){ myIdx=i; break; } }
    var head='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">'+
      '<span style="font-size:13px;font-weight:700;color:#222;">Star performers</span><div style="flex:1;"></div>'+
      seg('scope',[['all','All'],['mine','My branch']],SB.scope)+
      seg('mode',[['dedication','Dedication'],['performance','Performance']],SB.mode)+'</div>';
    var strip='<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;">'+
      (top.length?top.map(function(d){return card(d,SB.mode);}).join(''):'<div class="muted" style="font-size:12px;">No scores yet this month.</div>')+'</div>';
    var stand='';
    if(myIdx>=0){ var me=full[myIdx], sc=me[SB.mode];
      stand='<div style="margin-top:8px;display:flex;align-items:center;gap:8px;background:#f5f6fa;border-radius:9px;padding:6px 10px;">'+
        '<span style="font-size:11px;color:#666;">Where you stand</span>'+
        '<span style="font-size:13px;font-weight:700;color:#185FA5;">#'+(myIdx+1)+'</span>'+
        '<span style="font-size:11px;color:#999;">of '+full.length+'</span><div style="flex:1;"></div>'+
        '<span style="font-size:11px;color:#666;">'+(SB.mode==='dedication'?'Dedication':'Performance')+'</span>'+
        '<span style="font-size:14px;font-weight:700;color:'+(sc>=70?'#1f9d57':'#e0a800')+';">'+sc+'</span></div>';
    }
    host.innerHTML=panel(head+strip+stand);
    host.querySelectorAll('[data-seg]').forEach(function(b){ b.onclick=function(){
      var g=b.getAttribute('data-seg'), val=b.getAttribute('data-v');
      if(g==='scope') SB.scope=val; else SB.mode=val; paintStar();
    }; });
  }
  window.renderStarBlock=function(host){
    if(!host) return; SB.host=host;
    host.innerHTML=panel('<span style="font-size:13px;font-weight:700;color:#222;">Star performers</span> <span class="muted" style="font-size:11px;">Loading…</span>');
    API.staffPerformance(monthFrom(),todayD(),'').then(function(r){
      if(r&&r.ok){ SB.rows=r.rows||[]; paintStar(); } else host.innerHTML='';
    }).catch(function(){ host.innerHTML=''; });
  };

  /* ---------- full leaderboard page ---------- */
  function bar(s){ var c=tier(s); return '<div style="display:flex;align-items:center;gap:6px;"><div style="flex:1;height:7px;border-radius:4px;background:#eee;overflow:hidden;"><div style="width:'+s+'%;height:100%;background:'+c+';"></div></div><span style="font-weight:600;color:'+c+';min-width:26px;font-size:12px;">'+s+'</span></div>'; }

  /* ---------- Attendance register (per-staff whole month) ---------- */
  var SP={rows:[],brName:function(x){return x;}};
  var DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtDay(ds){ var p=String(ds).split('-'); if(p.length<3) return {d:ds,dow:''}; var dt=new Date(+p[0],+p[1]-1,+p[2]); return {d:(+p[2])+' '+(MON[+p[1]-1]||''), dow:DOW[dt.getDay()]||''}; }
  function hm2min(t){ var m=String(t||'').match(/^(\d{1,2}):(\d{2})/); return m?(+m[1])*60+(+m[2]):null; }
  function calcHours(ci,co){ var a=hm2min(ci), b=hm2min(co); if(a===null||b===null) return ''; var d=(b-a)/60; if(d<0) d=0; return d.toFixed(1); }
  function openAttReg(){
    var host=$id('spAttReg'); if(!host) return;
    var rows=(SP.rows||[]).slice().sort(function(a,b){ return String(a.name).localeCompare(String(b.name)); });
    var opts='<option value="">Select staff…</option>'+rows.map(function(d){ return '<option value="'+esc(d.emp)+'">'+esc(d.name)+'</option>'; }).join('');
    var ym=monthFrom().slice(0,7);
    host.innerHTML='<div class="card" style="padding:14px 16px;margin-bottom:14px;">'+
      '<div style="display:flex;align-items:center;margin-bottom:12px;"><span style="font-size:15px;font-weight:700;">🕒 Attendance register</span><div style="flex:1;"></div><span id="arClose" style="font-size:13px;color:#888;cursor:pointer;">✕ close</span></div>'+
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px;">'+
        '<div style="flex:1;min-width:180px;"><label style="font-size:12px;color:#666;display:block;margin-bottom:3px;">Staff member</label><select id="arEmp" class="in">'+opts+'</select></div>'+
        '<div style="min-width:140px;"><label style="font-size:12px;color:#666;display:block;margin-bottom:3px;">Branch</label><input id="arBr" class="in" value="" readonly style="background:#f5f6fa;"></div>'+
        '<div style="min-width:140px;"><label style="font-size:12px;color:#666;display:block;margin-bottom:3px;">Month</label><input id="arMonth" type="month" class="in" value="'+ym+'"></div>'+
      '</div><div id="arBody"><div class="empty">Select a staff member to see their month.</div></div>'+
    '</div>';
    $id('arClose').onclick=function(){ host.innerHTML=''; };
    function reload(){
      var emp=$id('arEmp').value, m=$id('arMonth').value||ym;
      var sel=(SP.rows||[]).filter(function(d){ return String(d.emp)===String(emp); })[0];
      $id('arBr').value = sel ? SP.brName(sel.branch) : '';
      if(!emp){ $id('arBody').innerHTML='<div class="empty">Select a staff member to see their month.</div>'; return; }
      $id('arBody').innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>';
      API.staffMonthAttendance(emp,m).then(function(r){
        var box=$id('arBody'); if(!box) return;
        if(!r||!r.ok){ box.innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; return; }
        if(r.branchName) $id('arBr').value=r.branchName;
        box.innerHTML=renderRegTable(r.records||[]);
      }).catch(function(){ var box=$id('arBody'); if(box) box.innerHTML='<div class="empty">Connect to load attendance.</div>'; });
    }
    $id('arEmp').onchange=reload; $id('arMonth').onchange=reload;
  }
  function renderRegTable(recs){
    if(!recs.length) return '<div class="empty">No attendance recorded this month.</div>';
    var present=0,half=0,leave=0;
    var body=recs.map(function(r){
      var st=String(r.status||''), fd=fmtDay(r.date), rowStyle='', tone='';
      if(st==='half'){ half++; rowStyle='background:#FAEEDA;'; tone='#633806'; }
      else if(st==='leave'||st==='absent'){ leave++; rowStyle='background:#F7C1C1;'; tone='#791F1F'; }
      else { present++; }
      var label = st==='half' ? 'Half day' : (st==='leave' ? ('Leave'+(r.notes?(' ('+esc(r.notes)+')'):'')) : (st==='absent' ? 'Absent' : (st?st.charAt(0).toUpperCase()+st.slice(1):'Present')));
      var cellC = tone?(' style="color:'+tone+';"'):'';
      var dash='<span style="color:#bbb;">—</span>';
      var hrs=calcHours(r.checkIn,r.checkOut);
      return '<tr style="'+rowStyle+'">'+
        '<td'+cellC+'>'+esc(fd.d)+'</td>'+
        '<td'+(tone?' style="color:'+tone+';"':' style="color:#999;"')+'>'+esc(fd.dow)+'</td>'+
        '<td'+cellC+'>'+(r.checkIn||dash)+'</td>'+
        '<td'+cellC+'>'+(r.checkOut||dash)+'</td>'+
        '<td'+cellC+'>'+(hrs||dash)+'</td>'+
        '<td'+(tone?' style="color:'+tone+';font-weight:600;"':'')+'>'+label+(String(r.late)==='yes'&&st!=='half'?' ⚠':'')+'</td>'+
      '</tr>';
    }).join('');
    var pill=function(bg,fg,txt){ return '<span style="font-size:11px;font-weight:600;padding:2px 9px;border-radius:20px;background:'+bg+';color:'+fg+';">'+txt+'</span>'; };
    var summary='<div style="display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap;">'+
      pill('#eef0f4','#555','Present '+present)+pill('#FAEEDA','#633806','Half '+half)+pill('#F7C1C1','#791F1F','Leave '+leave)+'</div>';
    return summary+'<div class="table-wrap"><table><thead><tr><th>Date</th><th>Day</th><th>Check in</th><th>Check out</th><th>Hours</th><th>Status</th></tr></thead><tbody>'+body+'</tbody></table></div>';
  }
  window.renderStaffPerf=function(){
    var v=$id('page-staffperf'); if(!v) return;
    var canPick=window.S&&S.perms&&S.perms.canViewAll;
    var brs=(window.S&&S.meta&&S.meta.branches)||[];
    function brName(id){ var b=brs.filter(function(x){return String(x.BranchID)===String(id);})[0]; return b?b.BranchName:(id||'—'); }
    var brOpts='<option value="">All branches</option>'+brs.map(function(b){return '<option value="'+esc(b.BranchID)+'">'+esc(b.BranchName)+'</option>';}).join('');
    v.innerHTML='<div class="page-head"><h1>Staff performance</h1></div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">'+
        '<input type="date" id="spFrom" class="in" style="max-width:150px" value="'+monthFrom()+'">'+
        '<input type="date" id="spTo" class="in" style="max-width:150px" value="'+todayD()+'">'+
        (canPick?'<select id="spBr" class="in" style="max-width:160px">'+brOpts+'</select>':'')+
        '<button class="btn ghost sm" id="spGo">Apply</button>'+
      '</div>'+
      '<div style="margin:0 0 12px;"><button class="btn sm" id="spAtt">🕒 Attendance</button></div>'+
      '<div id="spAttReg"></div>'+
      '<div id="spBody"><div class="center-load"><span class="loader dark"></span> Loading…</div></div>';
    SP.brName=brName;
    $id('spAtt').onclick=function(){ var box=$id('spAttReg'); if(box && box.innerHTML.trim()){ box.innerHTML=''; } else openAttReg(); };
    function load(){
      var f=$id('spFrom').value, t=$id('spTo').value, b=(canPick&&$id('spBr'))?$id('spBr').value:'';
      $id('spBody').innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>';
      API.staffPerformance(f,t,b).then(function(r){
        var box=$id('spBody'); if(!box) return;
        if(!r||!r.ok){ box.innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; return; }
        var rows=r.rows||[]; SP.rows=rows; if(!rows.length){ box.innerHTML='<div class="empty">No data for this period.</div>'; return; }
        box.innerHTML='<div class="card"><div class="table-wrap"><table><thead><tr><th>#</th><th>Person</th><th>Dedication</th><th>Performance</th><th>Att.</th><th>Tasks</th><th>Calls</th><th>Meet</th><th>Output</th><th>On-time</th></tr></thead><tbody>'+
          rows.map(function(d,i){ return '<tr><td>'+(i+1)+'</td><td><b>'+esc(d.name)+'</b><div style="font-size:11px;color:#999">'+esc(d.role)+' · '+esc(brName(d.branch))+'</div></td>'+
            '<td style="min-width:120px">'+bar(d.dedication)+'</td><td style="min-width:120px">'+bar(d.performance)+'</td>'+
            '<td>'+d.attPct+'%</td><td>'+d.tasksDone+'/'+d.tasksTotal+'</td><td>'+d.calls+'</td><td>'+d.meetings+'</td><td>'+d.output+'</td><td>'+d.onTimePct+'%</td></tr>'; }).join('')+
          '</tbody></table></div></div>';
      });
    }
    $id('spGo').onclick=load; load();
  };
})();
