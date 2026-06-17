/* Nakoda MIS — Staff Training (role-tagged YouTube lessons + quiz, 7-day deadline, PC monitor). */
(function(){
  function $id(i){ return document.getElementById(i); }
  function ytId(u){ var m=String(u||'').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m?m[1]:''; }
  function lvl(){ return (S.perms&&S.perms.level)||''; }
  function canManage(){ return lvl()==='SUPER'||lvl()==='HR_ADMIN'||['HR','MIS','Executive Assistant','Content Creator','Director'].indexOf(S.user&&S.user.Role)>=0; }
  function canMonitor(){ return lvl()==='SUPER'||['Process Coordinator','Operations Manager'].indexOf(S.user&&S.user.Role)>=0; }

  function renderTraining(){
    var v=$id('page-training');
    var tabs=[['my','My Training']]; if(canManage()) tabs.push(['manage','Manage']); if(canManage()||canMonitor()) tabs.push(['monitor','Monitor']);
    v.innerHTML='<div class="page-head"><h1>Staff Training</h1></div>'+
      (tabs.length>1?'<div class="pm2-tabs" id="trTabs">'+tabs.map(function(t,i){return '<span data-t="'+t[0]+'"'+(i===0?' class="on"':'')+'>'+t[1]+'</span>';}).join('')+'</div>':'')+
      '<div id="trBody"></div>';
    v.querySelectorAll('#trTabs span').forEach(function(s){ s.onclick=function(){ v.querySelectorAll('#trTabs span').forEach(function(z){z.classList.remove('on');}); s.classList.add('on'); route(s.getAttribute('data-t')); }; });
    route('my');
  }
  function route(t){ var b=$id('trBody'); b.innerHTML='<div class="center-load"><span class="loader dark"></span> Loading…</div>'; if(t==='manage') loadManage(); else if(t==='monitor') loadMonitor(); else loadMy(); }

  /* ---- My Training ---- */
  function loadMy(){
    API.cachedMyTraining().then(function(r){ if(r) paintMy(r); });
    API.myTraining().then(function(r){ if(r&&r.ok) paintMy(r); });
  }
  function paintMy(r){
    var box=$id('trBody'); if(!box) return; var secs=r.sections||[], vids=r.videos||[];
    if(!vids.length){ box.innerHTML='<div class="empty">No training assigned to your role yet.</div>'; return; }
    var bySec={}; vids.forEach(function(v){ (bySec[v.sectionId]=bySec[v.sectionId]||[]).push(v); });
    var pend=vids.filter(function(v){return v.status!=='passed';}).length;
    var html='<div style="font-size:13px;color:#888;margin-bottom:10px">'+pend+' pending · '+(vids.length-pend)+' passed</div>';
    var order=secs.concat([{sectionId:'',name:'Other'}]);
    order.forEach(function(s){ var list=bySec[s.sectionId]; if(!list||!list.length) return;
      html+='<div class="sec-h">'+esc(s.name)+'</div>'+list.map(function(v){
        var st=v.status==='passed'?'<span class="tv-st passed">✓ Passed '+(v.score?v.score+'%':'')+'</span>':(v.overdue?'<span class="tv-st over">Overdue</span>':'<span class="tv-st due">Due '+esc(v.due)+'</span>');
        return '<div class="tv-card" data-vid="'+esc(v.videoId)+'"><div class="tv-thumb">▶</div><div class="tv-m"><b>'+esc(v.title)+'</b><div class="tv-d">'+(v.status==='passed'?'completed':'watch + pass quiz ('+v.passMark+'%)')+'</div></div>'+st+'</div>';
      }).join('');
    });
    box.innerHTML=html;
    box.querySelectorAll('.tv-card').forEach(function(el){ el.onclick=function(){ openVideo(el.getAttribute('data-vid')); }; });
  }
  function openVideo(videoId){
    API.getVideoQuiz(videoId).then(function(r){ if(!r||!r.ok){ toast((r&&r.error)||'Could not open',true); return; }
      var id=ytId(r.youtubeUrl);
      var body='<div class="tv-embed">'+(id?'<iframe width="100%" height="100%" src="https://www.youtube.com/embed/'+id+'" frameborder="0" allowfullscreen></iframe>':'<a href="'+esc(r.youtubeUrl)+'" target="_blank">Open video</a>')+'</div>'+
        '<div class="tv-quiz">'+(r.questions||[]).map(function(q,qi){ return '<div class="tv-q"><b>Q'+(qi+1)+'. '+esc(q.q)+'</b>'+(q.options||[]).map(function(o,oi){ return '<label class="tv-opt"><input type="radio" name="q'+qi+'" value="'+oi+'"> '+esc(o)+'</label>'; }).join('')+'</div>'; }).join('')+
        '<div style="font-size:11px;color:#888">Pass mark '+r.passMark+'% · you can retry.</div><div id="tvMsg"></div></div>';
      openModal(r.title, body, '<button class="btn" id="tvSubmit">Submit answers</button>');
      $id('tvSubmit').onclick=function(){ var ans=(r.questions||[]).map(function(q,qi){ var sel=document.querySelector('input[name="q'+qi+'"]:checked'); return sel?Number(sel.value):-1; });
        if(ans.indexOf(-1)>=0){ $id('tvMsg').innerHTML='<div class="msg error">Answer all questions.</div>'; return; }
        this.disabled=true; API.submitQuiz(videoId,ans).then(function(x){ if(x&&x.ok){ if(x.passed){ closeModal(); toast('Passed '+x.score+'% 🎉'); loadMy(); } else { $id('tvMsg').innerHTML='<div class="msg error">Scored '+x.score+'% — need '+x.passMark+'%. Watch again & retry.</div>'; $id('tvSubmit').disabled=false; } } else { $id('tvMsg').innerHTML='<div class="msg error">'+esc((x&&x.error)||'Failed')+'</div>'; $id('tvSubmit').disabled=false; } }); };
    });
  }

  /* ---- Manage ---- */
  function loadManage(){
    Promise.all([API.trainSections(),API.listVideosManage()]).then(function(a){ var box=$id('trBody'); if(!box) return;
      var secs=(a[0]&&a[0].ok)?a[0].sections:[], vids=(a[1]&&a[1].ok)?a[1].videos:[];
      box.innerHTML='<div class="fin-actions"><button class="btn" id="mSec">+ Section</button> <button class="btn" id="mVid">+ Video</button></div>'+
        '<div class="sec-h">Sections</div>'+(secs.length?secs.map(function(s){return '<div class="hx-row"><div class="hx-mid"><b>'+esc(s.name)+'</b></div><a href="javascript:void(0)" data-es="'+esc(s.sectionId)+'">✎</a> <a href="javascript:void(0)" data-ds="'+esc(s.sectionId)+'" style="color:var(--red)">🗑</a></div>';}).join(''):'<div class="empty">No sections.</div>')+
        '<div class="sec-h">Videos</div>'+(vids.length?vids.map(function(v){return '<div class="hx-row"><div class="tv-thumb">▶</div><div class="hx-mid"><b>'+esc(v.title)+'</b> <span style="font-size:10px;color:#aaa">v'+v.version+'</span><div class="hx-m">'+esc(v.roles||'')+' · '+(v.questions?v.questions.length:0)+' Q · pass '+v.passMark+'%</div></div><a href="javascript:void(0)" data-ev="'+esc(v.videoId)+'">✎</a> <a href="javascript:void(0)" data-dv="'+esc(v.videoId)+'" style="color:var(--red)">🗑</a></div>';}).join(''):'<div class="empty">No videos yet.</div>');
      $id('mSec').onclick=function(){ openSectionForm(null); };
      $id('mVid').onclick=function(){ openVideoForm(null,secs); };
      box.querySelectorAll('[data-es]').forEach(function(b){ b.onclick=function(){ openSectionForm(secs.filter(function(x){return x.sectionId===b.getAttribute('data-es');})[0]); }; });
      box.querySelectorAll('[data-ds]').forEach(function(b){ b.onclick=function(){ if(confirm('Delete section?')) API.deleteSection(b.getAttribute('data-ds')).then(function(){toast('Deleted');loadManage();}); }; });
      box.querySelectorAll('[data-ev]').forEach(function(b){ b.onclick=function(){ openVideoForm(vids.filter(function(x){return x.videoId===b.getAttribute('data-ev');})[0],secs); }; });
      box.querySelectorAll('[data-dv]').forEach(function(b){ b.onclick=function(){ if(confirm('Delete video?')) API.deleteVideo(b.getAttribute('data-dv')).then(function(){toast('Deleted');loadManage();}); }; });
    });
  }
  function openSectionForm(s){ s=s||{};
    openModal(s.sectionId?'Edit section':'New section','<div class="field full"><label>Section name</label><input id="scName" class="in" value="'+esc(s.name||'')+'"></div><div id="scMsg"></div>','<button class="btn" id="scSave">Save</button>');
    $id('scSave').onclick=function(){ var n=$id('scName').value.trim(); if(!n){ $id('scMsg').innerHTML='<div class="msg error">Name required.</div>'; return; } API.saveSection({sectionId:s.sectionId,name:n}).then(function(r){ if(r&&r.ok){ closeModal(); loadManage(); } }); };
  }
  var VQ=[];
  function openVideoForm(v,secs){ v=v||{}; VQ=(v.questions&&v.questions.length)?v.questions.map(function(q){return {q:q.q,options:(q.options||['','','','']).slice(),answer:Number(q.answer)||0};}):[];
    var roles=(S.meta&&S.meta.roles)||[]; var vr=String(v.roles||'').split(',').map(function(x){return x.trim();});
    var body='<div class="grid2"><div class="field full"><label>Title</label><input id="vTitle" class="in" value="'+esc(v.title||'')+'"></div>'+
      '<div class="field"><label>Section</label><select id="vSec" class="in">'+secs.map(function(s){return '<option value="'+esc(s.sectionId)+'"'+(s.sectionId===v.sectionId?' selected':'')+'>'+esc(s.name)+'</option>';}).join('')+'</select></div>'+
      '<div class="field"><label>Pass mark %</label><input id="vPass" class="in" type="number" value="'+(v.passMark||70)+'"></div>'+
      '<div class="field full"><label>YouTube unlisted link</label><input id="vUrl" class="in" value="'+esc(v.youtubeUrl||'')+'"></div>'+
      '<div class="field full"><label>Visible to roles</label><div class="rolechips" id="vRoles">'+roles.map(function(r){var n=r.Role||r;return '<span class="rc'+(vr.indexOf(n)>=0?' on':'')+'" data-r="'+esc(n)+'">'+esc(n)+'</span>';}).join('')+'</div></div>'+
      '<div class="field full"><label>Quiz questions</label><div id="vQs"></div><button type="button" class="btn ghost sm" id="vAddQ">+ Add question</button></div></div><div id="vMsg"></div>';
    openModal(v.videoId?'Edit video':'New video', body, '<button class="btn" id="vSave">'+(v.videoId?'Save (new version)':'Publish')+'</button>');
    document.querySelectorAll('#vRoles .rc').forEach(function(c){ c.onclick=function(){ c.classList.toggle('on'); }; });
    function paintQ(){ $id('vQs').innerHTML=VQ.map(function(q,i){ return '<div class="vq" data-i="'+i+'"><input class="in vq-q" placeholder="Question" value="'+esc(q.q)+'">'+q.options.map(function(o,oi){ return '<label class="vq-opt"><input type="radio" name="ans'+i+'" '+(q.answer===oi?'checked':'')+' data-a="'+oi+'"><input class="in vq-o" data-o="'+oi+'" placeholder="Option '+(oi+1)+'" value="'+esc(o)+'"></label>'; }).join('')+'<button type="button" class="bmini" data-rmq="'+i+'">✕ question</button></div>'; }).join(''); bindQ(); }
    function readQ(){ $id('vQs').querySelectorAll('.vq').forEach(function(row){ var i=row.getAttribute('data-i'); var opts=[].slice.call(row.querySelectorAll('.vq-o')).map(function(o){return o.value;}); var ans=row.querySelector('input[type=radio]:checked'); VQ[i]={q:row.querySelector('.vq-q').value,options:opts,answer:ans?Number(ans.getAttribute('data-a')):0}; }); }
    function bindQ(){ $id('vQs').querySelectorAll('[data-rmq]').forEach(function(b){ b.onclick=function(){ readQ(); VQ.splice(+b.getAttribute('data-rmq'),1); paintQ(); }; }); }
    $id('vAddQ').onclick=function(){ readQ(); VQ.push({q:'',options:['','','',''],answer:0}); paintQ(); }; paintQ();
    $id('vSave').onclick=function(){ readQ(); var title=$id('vTitle').value.trim(),url=$id('vUrl').value.trim(); if(!title||!url){ $id('vMsg').innerHTML='<div class="msg error">Title & link required.</div>'; return; }
      var rolesSel=[].slice.call(document.querySelectorAll('#vRoles .rc.on')).map(function(c){return c.getAttribute('data-r');});
      this.disabled=true; API.saveVideo({videoId:v.videoId,title:title,youtubeUrl:url,sectionId:$id('vSec').value,passMark:$id('vPass').value,roles:rolesSel,questions:VQ.filter(function(q){return q.q;})}).then(function(r){ if(r&&r.ok){ closeModal(); toast('Video published'); loadManage(); } else $id('vMsg').innerHTML='<div class="msg error">'+esc((r&&r.error)||'Failed')+'</div>'; }); };
  }

  /* ---- Monitor ---- */
  function loadMonitor(){
    API.trainingMonitor().then(function(r){ var box=$id('trBody'); if(!box) return; if(!r||!r.ok){ box.innerHTML='<div class="empty">'+esc((r&&r.error)||'')+'</div>'; return; }
      var rows=r.rows||[]; if(!rows.length){ box.innerHTML='<div class="empty">Everyone is up to date. 🎉</div>'; return; }
      box.innerHTML=rows.map(function(t){ var ph=String(t.phone||'').replace(/\D/g,''); return '<div class="hx-row"><div class="av">'+esc(initials(t.empName))+'</div><div class="hx-mid"><b>'+esc(t.empName)+'</b> <span style="font-size:10px;color:#aaa">'+esc(t.role)+'</span><div class="hx-m">'+esc(t.videoTitle)+' · '+(t.overdue?'<span style="color:var(--red);font-weight:700">overdue (due '+esc(t.due)+')</span>':'due '+esc(t.due))+'</div></div>'+(ph?'<a class="att-ok" href="tel:'+ph+'">📞</a>':'')+'</div>'; }).join('');
    });
  }

  window.renderTraining=renderTraining;
})();
