(function(){let admin=false;
  const data=window.CORMYR_DATA||{};const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const KIND_LABELS={reino:'Tema do reino',regiao:'Músicas de região',casa:'Músicas de casa'};
  const KIND_ORDER=['reino','regiao','casa'];
  const kindLabel=k=>KIND_LABELS[k]||(k?k.charAt(0).toUpperCase()+k.slice(1):'Outras');
  const groups=[];const seen=new Set();
  const add=(kind,label,songs)=>{const list=(songs||[]).filter(s=>s&&s.url&&!seen.has(s.url+label));list.forEach(s=>seen.add(s.url+label));if(list.length)groups.push({kind:kind||'outra',label,songs:list});};
  add('reino','Tema do reino',data.kingdomMusic);
  (function walk(o,parent){if(!o||typeof o!=='object')return;if(Array.isArray(o)){o.forEach(x=>walk(x,parent));return;}if(o!==data&&Array.isArray(o.music))add(o.musicKind||(o.houses?'regiao':'casa'),(o.name||''),o.music);for(const k in o)if(k!=='music'&&k!=='kingdomMusic')walk(o[k],o);})(data);
  const box=document.getElementById('music-all');
  if(box){
    const chips=document.getElementById('music-kinds');
    const select=document.getElementById('music-item');
    const status=document.getElementById('music-count');
    const reset=document.getElementById('music-reset');
    let kind='todas',item='';
    const extraKinds=Array.from(new Set(groups.map(g=>g.kind))).filter(k=>!KIND_ORDER.includes(k));
    const kinds=KIND_ORDER.filter(k=>groups.some(g=>g.kind===k)).concat(extraKinds);
    const countOf=k=>groups.filter(g=>k==='todas'||g.kind===k).reduce((a,g)=>a+g.songs.length,0);
    if(chips)chips.innerHTML=[['todas','Todas as músicas']].concat(kinds.map(k=>[k,kindLabel(k)])).map(([k,l])=>`<button type="button" class="region-view-button${k==='todas'?' active':''}" data-music-kind="${esc(k)}" aria-pressed="${k==='todas'}"><span>${esc(l)}</span><b>${countOf(k)}</b></button>`).join('');
    const fillSelect=()=>{if(!select)return;const list=groups.filter(g=>kind==='todas'||g.kind===kind);select.innerHTML='<option value="">Todas as músicas</option>'+list.map(g=>`<option value="${groups.indexOf(g)}">${esc(g.label)} · ${esc(kindLabel(g.kind))}</option>`).join('');select.value=item;};
    const render=()=>{
      const list=groups.filter(g=>(kind==='todas'||g.kind===kind)&&(item===''||String(groups.indexOf(g))===item));
      const songs=list.reduce((a,g)=>a+g.songs.length,0);
      box.innerHTML=list.length?list.map(g=>`<section class="music-links panel"><div><p class="eyebrow">${esc(kindLabel(g.kind))}</p><h4>${esc(g.label)}</h4></div><div class="music-actions">${g.songs.map(s=>`<a class="music-button" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">▶</span><span>${esc(s.title)}<small>Ouvir no YouTube ↗</small></span></a>`).join('')}</div></section>`).join(''):'<p class="empty">Nenhuma música encontrada. Limpe os filtros para ver todas.</p>';
      if(status)status.textContent=`${songs} ${songs===1?'música':'músicas'} em ${list.length} ${list.length===1?'grupo':'grupos'}.`;
    };
    const setKind=k=>{kind=k;item='';if(chips)chips.querySelectorAll('[data-music-kind]').forEach(b=>{const on=b.dataset.musicKind===k;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});fillSelect();render();};
    if(chips)chips.addEventListener('click',e=>{const b=e.target.closest('[data-music-kind]');if(b)setKind(b.dataset.musicKind);});
    if(select)select.addEventListener('change',()=>{item=select.value;render();});
    if(reset)reset.addEventListener('click',()=>setKind('todas'));
    fillSelect();render();
  }
  const hideGm=()=>{if(admin)return;if(!document.getElementById('view-eventos').hidden||!document.getElementById('view-aventura').hidden||['eventos','aventura'].includes((typeof state!=='undefined'&&state.view))||/^#(eventos|aventura|evento-)/.test(location.hash))document.querySelector('[data-view=reino]')?.click();};
  
  try{const raw=localStorage.getItem('sb-qkdznngbkwodsbpkpoax-auth-token');const tok=raw&&JSON.parse(raw).access_token;
    if(tok){const btn=document.getElementById('login-button');if(btn){btn.textContent='Área dos jogadores';btn.href='/jogadores';}
      fetch('https://qkdznngbkwodsbpkpoax.supabase.co/rest/v1/rpc/is_campaign_admin',{method:'POST',headers:{apikey:'sb_publishable_jToB9fTbM4C9-cDEhZN8TQ_q3wq4XUm',Authorization:'Bearer '+tok,'Content-Type':'application/json'},body:'{}'}).then(r=>r.ok?r.json():false).then(ok=>{admin=ok===true;if(admin)document.querySelectorAll('[data-narrator]').forEach(b=>b.hidden=false);else hideGm();});
    }else setTimeout(hideGm,300);
  }catch(e){setTimeout(hideGm,300);}
  window.addEventListener('hashchange',()=>{if(!admin)setTimeout(hideGm,0);});
})();
