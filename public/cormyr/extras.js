(function(){let admin=false;
  const data=window.CORMYR_DATA||{};const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const KIND_LABELS={reino:'Tema do reino',regiao:'Músicas de região',casa:'Músicas de casa',cancioneiro:'Cancioneiro',playlist:'Novidades da playlist'};
  const KIND_ORDER=['reino','regiao','casa','cancioneiro','playlist'];
  const kindLabel=k=>KIND_LABELS[k]||(k?k.charAt(0).toUpperCase()+k.slice(1):'Outras');
  const groups=[];const seen=new Set();
  const hasVideo=s=>Boolean(window.CORMYR_YOUTUBE?.parse(s?.url));
  const add=(kind,label,songs)=>{const list=(songs||[]).filter(s=>s&&(s.linkStatus==='youtube-pending'||s.lyrics||hasVideo(s))&&!seen.has((s.videoId||s.url||s.title)+'|'+kind+'|'+label));list.forEach(s=>seen.add((s.videoId||s.url||s.title)+'|'+kind+'|'+label));if(list.length)groups.push({kind:kind||'outra',label,songs:list});};
  add('reino','Tema do reino',data.kingdomMusic);
  (function walk(o,parent){if(!o||typeof o!=='object')return;if(Array.isArray(o)){o.forEach(x=>walk(x,parent));return;}if(o!==data&&Array.isArray(o.music))add(o.musicKind||(o.houses?'regiao':'casa'),(o.name||''),o.music);for(const k in o)if(k!=='music'&&k!=='kingdomMusic')walk(o[k],o);})(data);
  // Keep the Cancioneiro in its own section, including songs with only lyrics.
  // A missing URL does not prove the song has not been published on YouTube.
  const extraGroups=new Map();
  for(const song of data.soundtrack||[]){
    const kind=song.category||'playlist';
    const label=kind==='cancioneiro'?'Cancioneiro':(song.region||song.house||(kind==='playlist'?'Playlist do YouTube':'Outras'));
    const key=kind+'|'+label;
    if(!extraGroups.has(key))extraGroups.set(key,{kind,label,songs:[]});
    extraGroups.get(key).songs.push(song);
  }
  for(const group of extraGroups.values())add(group.kind,group.label,group.songs);
  const noThemeRegions=(data.regions||[]).filter(r=>!(r.music||[]).some(hasVideo)).map(r=>r.name);
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
    const songMarkup=s=>s.lyrics&&!hasVideo(s)
      ?`<details class="music-lyrics-entry"><summary>${esc(s.title)} · Letra${s.region?' · '+esc(s.region):''}</summary><pre>${esc(s.lyrics)}</pre></details>`
      :s.linkStatus==='youtube-pending'
      ?`<div class="music-unavailable" role="note"><strong>${esc(s.title)}</strong><small>${s.region?esc(s.region)+' · ':''}Vídeo ainda não identificado no catálogo. Consulte a playlist oficial.</small></div>`
      :`<a class="music-button" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">▶</span><span>${esc(s.title)}<small>Ouvir no YouTube</small></span></a><button type="button" class="quiet bard-preview-button" data-bard-title="${esc(s.title)}" data-bard-preview="${esc(s.url)}">▶ Ouvir aqui</button>`;
    if(chips)chips.innerHTML=[['todas','Todas as músicas']].concat(kinds.map(k=>[k,kindLabel(k)])).map(([k,l])=>`<button type="button" class="region-view-button${k==='todas'?' active':''}" data-music-kind="${esc(k)}" aria-pressed="${k==='todas'}"><span>${esc(l)}</span><b>${countOf(k)}</b></button>`).join('');
    const fillSelect=()=>{if(!select)return;const list=groups.filter(g=>kind==='todas'||g.kind===kind);select.innerHTML='<option value="">Todas as músicas</option>'+list.map(g=>`<option value="${groups.indexOf(g)}">${esc(g.label)} · ${esc(kindLabel(g.kind))}</option>`).join('');select.value=item;};
    const render=()=>{
      const list=groups.filter(g=>(kind==='todas'||g.kind===kind)&&(item===''||String(groups.indexOf(g))===item));
      const songs=list.reduce((a,g)=>a+g.songs.length,0);
      box.innerHTML=list.length?list.map(g=>`<section class="music-links panel"><div><p class="eyebrow">${esc(kindLabel(g.kind))}</p><h4>${esc(g.label)}</h4></div><div class="music-actions">${g.songs.map(songMarkup).join('')}</div></section>`).join(''):'<p class="empty">Nenhuma música encontrada. Limpe os filtros para ver todas.</p>';
      if((kind==='todas'||kind==='regiao')&&item===''&&noThemeRegions.length){
        const notice=document.createElement('p');notice.className='music-coverage-note small';
        notice.textContent='Regiões sem vídeo temático vinculado no catálogo: '+noThemeRegions.join(', ')+'. A ausência de vínculo não comprova que a música não esteja na playlist.';
        box.prepend(notice);
      }
      if(status){
        const linked=list.reduce((a,g)=>a+g.songs.filter(hasVideo).length,0);
        const pending=list.reduce((a,g)=>a+g.songs.filter(s=>s.linkStatus==='youtube-pending').length,0);
        const lyrics=list.reduce((a,g)=>a+g.songs.filter(s=>s.lyrics&&!hasVideo(s)).length,0);
        status.textContent=`${linked} ${linked===1?'vídeo vinculado':'vídeos vinculados'} em ${list.length} ${list.length===1?'grupo':'grupos'}${pending?' · '+pending+' títulos sem vídeo vinculado':''}${lyrics?' · '+lyrics+' letras sem vídeo':''}.`;
      }
    };
    const setKind=k=>{kind=k;item='';if(chips)chips.querySelectorAll('[data-music-kind]').forEach(b=>{const on=b.dataset.musicKind===k;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});fillSelect();render();};
    if(chips)chips.addEventListener('click',e=>{const b=e.target.closest('[data-music-kind]');if(b)setKind(b.dataset.musicKind);});
    if(select)select.addEventListener('change',()=>{item=select.value;render();});
    if(reset)reset.addEventListener('click',()=>setKind('todas'));
    fillSelect();render();
  }
  // The complete official playlist is available in-page even when the static catalogue
  // has not yet been reconciled. The iframe is created only on explicit user action.
  const playlistButton=document.getElementById('music-playlist-preview');
  const playlistHost=document.getElementById('music-playlist-embed');
  if(playlistButton?.addEventListener&&playlistHost?.replaceChildren){
    const playlistId=(()=>{try{
      const value=new URL(data.musicPlaylist).searchParams.get('list');
      return /^[A-Za-z0-9_-]{10,}$/.test(value||'')?value:null;
    }catch{return null;}})();
    const closePlaylist=()=>{
      playlistHost.replaceChildren();
      playlistHost.hidden=true;
      playlistButton.setAttribute('aria-expanded','false');
      playlistButton.textContent='Ouvir a playlist aqui';
    };
    window.CORMYR_CLOSE_PLAYLIST=closePlaylist;
    if(!playlistId)playlistButton.disabled=true;
    playlistButton.addEventListener('click',()=>{
      if(!playlistHost.hidden){closePlaylist();return;}
      document.getElementById('bard-close')?.click();
      const frame=document.createElement('iframe');
      frame.src='https://www.youtube-nocookie.com/embed/videoseries?list='+encodeURIComponent(playlistId);
      frame.title='Playlist oficial de músicas de Cormyr';
      frame.referrerPolicy='strict-origin-when-cross-origin';
      frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen=true;
      playlistHost.replaceChildren(frame);
      playlistHost.hidden=false;
      playlistButton.setAttribute('aria-expanded','true');
      playlistButton.textContent='Fechar playlist';
    });
  }
  const hideGm=()=>{if(admin)return;if(!document.getElementById('view-eventos').hidden||!document.getElementById('view-aventura').hidden||['eventos','aventura'].includes((typeof state!=='undefined'&&state.view))||/^#(eventos|aventura|evento-)/.test(location.hash))document.querySelector('[data-view=reino]')?.click();};
  
  try{const raw=localStorage.getItem('sb-qkdznngbkwodsbpkpoax-auth-token');const tok=raw&&JSON.parse(raw).access_token;
    if(tok){const btn=document.getElementById('login-button');if(btn){btn.textContent='Área dos jogadores';btn.href='/jogadores';}
      fetch('https://qkdznngbkwodsbpkpoax.supabase.co/rest/v1/rpc/is_campaign_admin',{method:'POST',headers:{apikey:'sb_publishable_jToB9fTbM4C9-cDEhZN8TQ_q3wq4XUm',Authorization:'Bearer '+tok,'Content-Type':'application/json'},body:'{}'}).then(r=>r.ok?r.json():false).then(ok=>{admin=ok===true;if(admin)document.querySelectorAll('[data-narrator]').forEach(b=>b.hidden=false);else hideGm();});
    }else setTimeout(hideGm,300);
  }catch(e){setTimeout(hideGm,300);}
  window.addEventListener('hashchange',()=>{if(!admin)setTimeout(hideGm,0);});
})();
