/* Nakoda MIS — makes every <select> in the app typeable/searchable.
   Keeps the native <select> as the source of truth (so existing code that reads
   .value / binds onchange keeps working); a visible text input mirrors it.
   Free lists (option value === its label, e.g. Category) allow brand-new typed
   values. ID-based pickers (value differs from label, e.g. vendor/branch/employee)
   are type-to-search: you filter fast but must land on a real option.
   Opt a single select out with  data-nocombo. */
(function(){
  var seq=0;
  function selText(sel){ var o=sel.options[sel.selectedIndex]; return o?String(o.textContent).trim():''; }
  function isFree(sel){
    if(!sel.options.length) return false;
    return Array.prototype.every.call(sel.options,function(o){ return o.value==='' || o.value===o.textContent || o.value===String(o.textContent).trim(); });
  }
  function enhance(sel){
    if(!sel || sel.dataset.combo==='1' || sel.multiple || sel.hasAttribute('data-nocombo')) return;
    sel.dataset.combo='1';
    var id='cbl'+(++seq);
    var inp=document.createElement('input');
    inp.type='text'; inp.autocomplete='off'; inp.className='in combo-input'; inp.setAttribute('list',id);
    if(sel.getAttribute('style')) inp.setAttribute('style', sel.getAttribute('style'));   // carry width etc.
    var dl=document.createElement('datalist'); dl.id=id;
    function fill(){ dl.innerHTML=''; Array.prototype.forEach.call(sel.options,function(o){ var t=String(o.textContent).trim(); if(!t) return; var d=document.createElement('option'); d.value=t; dl.appendChild(d); }); }
    fill();
    inp.value=selText(sel);
    sel.style.display='none';
    sel.parentNode.insertBefore(inp, sel);
    sel.parentNode.insertBefore(dl, sel);
    var free=isFree(sel);
    function sync(){
      var v=String(inp.value||'').trim(), m=null;
      for(var i=0;i<sel.options.length;i++){ if(String(sel.options[i].textContent).trim().toLowerCase()===v.toLowerCase()){ m=sel.options[i]; break; } }
      if(m){ sel.value=m.value; inp.value=String(m.textContent).trim(); }
      else if(free && v){ var o=document.createElement('option'); o.value=v; o.textContent=v; sel.appendChild(o); sel.value=v; fill(); }
      else { inp.value=selText(sel); return; }   // reference picker + no match → revert to a valid choice
      sel.dispatchEvent(new Event('change',{bubbles:true}));
    }
    inp.addEventListener('change', sync);
    inp.addEventListener('blur', sync);
    // if other code changes the select value programmatically & dispatches change, mirror it back
    sel.addEventListener('change', function(){ if(document.activeElement!==inp) inp.value=selText(sel); });
  }
  function scan(node){
    if(!node) return;
    if(node.tagName==='SELECT'){ try{ enhance(node); }catch(e){} return; }
    if(node.querySelectorAll){ node.querySelectorAll('select').forEach(function(s){ try{ enhance(s); }catch(e){} }); }
  }
  function start(){
    scan(document.body);
    try{
      var mo=new MutationObserver(function(muts){ for(var i=0;i<muts.length;i++){ var a=muts[i].addedNodes; for(var j=0;j<a.length;j++){ if(a[j].nodeType===1) scan(a[j]); } } });
      mo.observe(document.body,{childList:true,subtree:true});
    }catch(e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.enhanceCombos=function(){ scan(document.body); };
})();
