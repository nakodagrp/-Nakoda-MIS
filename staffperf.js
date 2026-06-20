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
    var s=d[mode], me=(meId()&&meId()===d.emp);
    var av = d.photo ? '<img src="'+esc(d.photo)+'" style="width:100%;height:100%;object-fit:cover;" alt="">'
                     : '<span style="font-size:26px;font-weight:700;color:#fff;">'+esc(ini(d.name))+'</span>';
    return '<div style="flex:0 0 112px;border-radius:12px;overflow:hidden;border:'+(me?'2px solid #185FA5':'1px solid #e6e6e6')+';">'+
      '<div style="position:relative;height:84px;background:'+colorFor(d.name)+';display:flex;align-items:center;justify-content:center;">'+av+
        '<span style="position:absolute;top:5px;left:5px;background:rgba(0,0,0,.45);color:#fff;font-size:12px;font-weight:700;padding:1px 7px;border-radius:9px;">'+s+'</span>'+
        (me?'<span style="position:absolute;top:5px;right:5px;background:#fff;color:#185FA5;font-size:8px;font-weight:700;padding:1px 5px;border-radius:9px;">YOU</span>':'')+
      '</div>'+
      '<div style="padding:5px 7px;background:#fff;"><div style="font-size:11px;font-weight:600;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(d.name)+'</div><div style="font-size:9px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(d.role)+'</div></div>'+
    '</div>';
  }
  function paintStar(){
    var host=SB.host; if(!host) return;
    var list=SB.rows.filter(function(d){ return SB.scope==='all' || String(d.branch)===String(myBranch()); })
      .sort(function(a,b){ return b[SB.mode]-a[SB.mode]; }).slice(0,10);
    var toggles='<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 9px;">'+
      seg('scope',[['all','All'],['mine','My branch']],SB.scope)+
      seg('mode',[['dedication','Dedication'],['performance','Performance']],SB.mode)+'</div>';
    host.innerHTML='<div class="section-label">Star performers</div>'+toggles+
      '<div style="display:flex;gap:9px;overflow-x:auto;padding-bottom:8px;-webkit-overflow-scrolling:touch;">'+
      (list.length?list.map(function(d){return card(d,SB.mode);}).join(''):'<div class="muted" style="font-size:12px;">No scores yet this month.</div>')+'</div>';
    host.querySelectorAll('[data-seg]').forEach(function(b){ b.onclick=function(){
      var g=b.getAttribute('data-seg'), val=b.getAttribute('data-v');
      if(g==='scope') SB.scope=val; else SB.mode=val; paintStar();
    }; });
  }
  window.renderStarBlock=function(host){
    if(!host) return; SB.host=host;
    host.innerHTML='<div class="section-label">Star performers</div><div class="muted" style="font-size:12px;">Loading…</div>';
    API.staffPerformance(monthFrom(),todayD(),'').then(function(r){
      if(r&&r.ok){ SB.rows=r.rows||[]; paintStar(); } else host.innerHTML='';
    }).catch(function(){ host.innerHTML=''; });
  };

  /* ---------- full leaderboard page ---------- */
  function bar(s){ var c=tier(s); return '<div style="display:flex;align-items:center;gap:6px;"><div style="flex:1;height:7px;border-radius:4px;background:#eee;overflow:hidden;"><div style="width:'+s+'%;height:100%;background:'+c+';"></div></div><span style="font-weight:600;color:'+c+';min-width:26px;font-size:12px;">'+s+'</span></div>'; }
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
      '</div><div id="spBody"><div class="center-load"><span class="loader dark"></span> Loading…</div></div>';
    function load(){
      var f=$id('spFrom').value, t=$id('spTo').value, b=(canPick&&$id('spBr'))?$id('spBr').value:'';
      $id('spBody').innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>';
      API.staffPerformance(f,t,b).then(function(r){
        var box=$id('spBody'); if(!box) return;
        if(!r||!r.ok){ box.innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; return; }
        var rows=r.rows||[]; if(!rows.length){ box.innerHTML='<div class="empty">No data for this period.</div>'; return; }
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
