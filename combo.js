/* Nakoda MIS — turns every <select> into a typeable combo box that still looks
   and behaves like a dropdown: shows the selected value + chevron, click opens a
   styled option list, type to filter. The native <select> stays as the source of
   truth (existing code reading .value / binding onchange keeps working); a visible
   input mirrors it. Free lists (option value === label, e.g. Category) allow typing
   a brand-new value; ID-based pickers are type-to-search (must land on a real option).
   Opt a single select out with  data-nocombo. */
(function(){
  var seq=0, closeOpen=null;
  function escH(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  var css=''+
    '.cmb-wrap{position:relative;display:block}'+
    '.cmb-input{width:100%;padding-right:26px}'+
    '.cmb-cv{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:#9a9a9a;font-size:12px}'+
    '.cmb-menu{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:70;background:#fff;border:1px solid var(--line,#e3e3e3);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.14);max-height:240px;overflow:auto}'+
    '.cmb-opt{padding:9px 12px;font-size:14px;cursor:pointer;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
    '.cmb-opt.hi{background:var(--red-soft,#fbeceA)}'+
    '.cmb-opt.sel{color:var(--red,#DA1017);font-weight:600}'+
    '.cmb-opt.dim{color:#aaa;cursor:default}'+
    '.cmb-new{color:#555;border-top:1px solid #eee}';
  function injectCss(){ if(document.getElementById('cmb-css')) return; var st=document.createElement('style'); st.id='cmb-css'; st.textContent=css; (document.head||document.documentElement).appendChild(st); }

  function isFree(sel){
    if(!sel.options.length) return false;
    return Array.prototype.every.call(sel.options,function(o){ return o.value==='' || o.value===o.textContent || o.value===String(o.textContent).trim(); });
  }
  function opts(sel){ return Array.prototype.map.call(sel.options,function(o){ return {v:o.value,t:String(o.textContent).trim()}; }).filter(function(o){ return o.t!==''; }); }
  function curText(sel){ var o=sel.options[sel.selectedIndex]; return o?String(o.textContent).trim():''; }

  function enhance(sel){
    if(!sel || sel.dataset.combo==='1' || sel.multiple || sel.hasAttribute('data-nocombo')) return;
    sel.dataset.combo='1';
    var wrap=document.createElement('span'); wrap.className='cmb-wrap';
    var inp=document.createElement('input'); inp.type='text'; inp.autocomplete='off'; inp.setAttribute('role','combobox'); inp.className='in cmb-input';
    if(sel.getAttribute('style')) inp.setAttribute('style', sel.getAttribute('style'));
    var cv=document.createElement('i'); cv.className='cmb-cv'; cv.textContent='▾';
    var menu=document.createElement('div'); menu.className='cmb-menu'; menu.style.display='none';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(inp); wrap.appendChild(cv); wrap.appendChild(menu); wrap.appendChild(sel);
    sel.style.display='none';
    var free=isFree(sel), hi=-1, view=[];
    inp.value=curText(sel);

    function build(filter){
      var f=String(filter||'').toLowerCase(), all=opts(sel);
      view=all.filter(function(o){ return o.t.toLowerCase().indexOf(f)>=0; });
      var cur=curText(sel);
      var html=view.map(function(o,i){ var c='cmb-opt'+(o.t===cur?' sel':'')+(i===hi?' hi':''); return '<div class="'+c+'" data-i="'+i+'">'+escH(o.t)+'</div>'; }).join('');
      if(free && filter && !all.some(function(o){ return o.t.toLowerCase()===f; })) html+='<div class="cmb-opt cmb-new" data-new="1">+ Add "'+escH(filter)+'"</div>';
      if(!html) html='<div class="cmb-opt dim">No matches</div>';
      menu.innerHTML=html;
      menu.querySelectorAll('[data-i]').forEach(function(el){ el.addEventListener('mousedown',function(e){ e.preventDefault(); pick(view[+el.getAttribute('data-i')]); }); });
      var nw=menu.querySelector('[data-new]'); if(nw) nw.addEventListener('mousedown',function(e){ e.preventDefault(); addNew(String(inp.value).trim()); });
    }
    function open(){ if(closeOpen && closeOpen!==close) closeOpen(); closeOpen=close; hi=-1; build(''); menu.style.display=''; }
    function close(){ menu.style.display='none'; if(closeOpen===close) closeOpen=null; }
    function commitFromSel(){ inp.value=curText(sel); }
    function pick(o){ if(!o) return; sel.value=o.v; inp.value=o.t; close(); sel.dispatchEvent(new Event('change',{bubbles:true})); }
    function addNew(v){ if(!v) return; var op=document.createElement('option'); op.value=v; op.textContent=v; sel.appendChild(op); sel.value=v; inp.value=v; close(); sel.dispatchEvent(new Event('change',{bubbles:true})); }
    function commit(){
      if(menu.style.display==='none') return;
      var v=String(inp.value).trim(), all=opts(sel);
      var m=all.filter(function(o){ return o.t.toLowerCase()===v.toLowerCase(); })[0];
      if(m) pick(m); else if(free && v) addNew(v); else { commitFromSel(); close(); }
    }

    inp.addEventListener('focus', open);
    inp.addEventListener('click', function(){ if(menu.style.display==='none') open(); });
    inp.addEventListener('input', function(){ hi=-1; if(menu.style.display==='none') menu.style.display=''; build(inp.value); });
    inp.addEventListener('keydown', function(e){
      if(e.key==='ArrowDown'){ e.preventDefault(); if(menu.style.display==='none') open(); hi=Math.min(hi+1, view.length-1); build(inp.value); }
      else if(e.key==='ArrowUp'){ e.preventDefault(); hi=Math.max(hi-1, 0); build(inp.value); }
      else if(e.key==='Enter'){ if(menu.style.display!=='none'){ e.preventDefault(); if(hi>=0 && view[hi]) pick(view[hi]); else commit(); } }
      else if(e.key==='Escape'){ commitFromSel(); close(); }
    });
    inp.addEventListener('blur', function(){ setTimeout(commit, 120); });
    // mirror programmatic value changes made by other code
    sel.addEventListener('change', function(){ if(document.activeElement!==inp) inp.value=curText(sel); });
  }

  function scan(node){
    if(!node) return;
    if(node.tagName==='SELECT'){ try{ enhance(node); }catch(e){} return; }
    if(node.querySelectorAll){ node.querySelectorAll('select').forEach(function(s){ try{ enhance(s); }catch(e){} }); }
  }
  function start(){
    injectCss(); scan(document.body);
    try{
      var mo=new MutationObserver(function(muts){ for(var i=0;i<muts.length;i++){ var a=muts[i].addedNodes; for(var j=0;j<a.length;j++){ if(a[j].nodeType===1) scan(a[j]); } } });
      mo.observe(document.body,{childList:true,subtree:true});
    }catch(e){}
    document.addEventListener('mousedown', function(e){ if(closeOpen && !(e.target.closest && e.target.closest('.cmb-wrap'))) closeOpen(); });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.enhanceCombos=function(){ injectCss(); scan(document.body); };
})();
