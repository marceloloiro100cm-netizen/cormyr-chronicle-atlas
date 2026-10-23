(function(){let admin=false;
  const data=window.CORMYR_DATA||{};const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const groups=[];const seen=new Set();
  const add=(label,songs)=>{const list=(songs||[]).filter(s=>s&&s.url&&!seen.has(s.url+label));list.forEach(s=>seen.add(s.url+label));if(list.length)groups.push({label,songs:list});};
  add('Tema do reino',data.kingdomMusic);
  (function walk(o,parent){if(!o||typeof o!=='object')return;if(Array.isArray(o)){o.forEach(x=>walk(x,parent));return;}if(o!==data&&Array.isArray(o.music))add((o.houses?'Região · ':'Casa · ')+(o.name||''),o.music);for(const k in o)if(k!=='music'&&k!=='kingdomMusic')walk(o[k],o);})(data);
  const box=document.getElementById('music-all');
  if(box)box.innerHTML=groups.map(g=>`<section class="music-links panel"><div><p class="eyebrow">TRILHA DE CORMYR</p><h4>${esc(g.label)}</h4></div><div class="music-actions">${g.songs.map(s=>`<a class="music-button" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">▶</span><span>${esc(s.title)}<small>Ouvir no YouTube ↗</small></span></a>`).join('')}</div></section>`).join('');
  const hideGm=()=>{if(admin)return;if(!document.getElementById('view-eventos').hidden||!document.getElementById('view-aventura').hidden||['eventos','aventura'].includes((typeof state!=='undefined'&&state.view))||/^#(eventos|aventura|evento-)/.test(location.hash))try{showView('reino');}catch(e){}};
  
  try{const raw=localStorage.getItem('sb-qkdznngbkwodsbpkpoax-auth-token');const tok=raw&&JSON.parse(raw).access_token;
    if(tok){const btn=document.getElementById('login-button');if(btn){btn.textContent='Área dos jogadores';btn.href='/jogadores';}
      fetch('https://qkdznngbkwodsbpkpoax.supabase.co/rest/v1/rpc/is_campaign_admin',{method:'POST',headers:{apikey:'sb_publishable_jToB9fTbM4C9-cDEhZN8TQ_q3wq4XUm',Authorization:'Bearer '+tok,'Content-Type':'application/json'},body:'{}'}).then(r=>r.ok?r.json():false).then(ok=>{admin=ok===true;if(admin)document.querySelectorAll('[data-narrator]').forEach(b=>b.hidden=false);else hideGm();});
    }else setTimeout(hideGm,300);
  }catch(e){setTimeout(hideGm,300);}
  window.addEventListener('hashchange',()=>{if(!admin)setTimeout(hideGm,0);});
})();
