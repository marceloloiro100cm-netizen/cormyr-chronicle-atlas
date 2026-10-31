'use strict';
/** Accessible, private-content-aware search of the public Cormyr archive. */
(function () {
 const data=window.CORMYR_DATA||{};
 const dialog=document.getElementById('global-search-modal');
 const input=document.getElementById('global-search-input');
 const results=document.getElementById('global-search-results');
 const open=document.getElementById('global-search-open');
 const close=document.getElementById('global-search-close');
 if(!dialog||!input||!results||!open||!close)return;
 const strip=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const slug=s=>strip(s).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 const matches=(entry,q)=>strip(entry.search).includes(q);
 let entries=[];
 function build(){
  const out=[];
  for(const r of data.regions||[]){
   out.push({type:'Região',name:r.name,subtitle:r.subtitle||'',search:[r.name,r.subtitle,r.description].join(' '),hash:'#regiao-'+slug(r.name)});
   for(const h of r.houses||[])out.push({type:'Casa',name:h.name,subtitle:[r.name,h.city,h.castle].filter(Boolean).join(' · '),
    search:[h.name,r.name,h.city,h.castle,h.leader,h.motto,h.symbol,...(h.aliases||[])].join(' '),
    hash:'#nobreza?house='+encodeURIComponent(h.nobleId||'')});
  }
  for(const l of data.constitution?.entries||[])out.push({
   type:'Lei',name:l.title,subtitle:'Artigo '+l.number+' · '+l.topic,
   search:[l.number,'Artigo '+l.number,'Lei '+l.number,l.title,l.topic,...l.paragraphs].join(' '),
   hash:'#constituicao?busca='+encodeURIComponent(String(l.number))
  });
  // Events and adventures are injected exclusively by the authenticated narrator API.
  // Never request restricted data from the public search.
  for(const e of data.events||[])out.push({type:'Evento',name:e.title,subtitle:e.kind+' '+e.id,
   search:[e.title,e.id,e.kind,e.hook,e.theme].join(' '),hash:'#evento-'+e.kind+'-'+e.id});
  for(const g of [{name:'Reino',music:data.kingdomMusic},...(data.regions||[]).flatMap(r=>[{name:r.name,music:r.music},...(r.houses||[]).map(h=>({name:h.name,music:h.music}))])])
   for(const song of g.music||[])out.push({type:'Música',name:song.title,subtitle:g.name,search:[song.title,g.name].join(' '),hash:'#musicas'});
  for(const song of data.soundtrack||[])out.push({type:'Música',name:song.title,subtitle:song.region||song.house||'Cancioneiro',
   search:[song.title,song.region,song.house,song.lyrics].join(' '),hash:'#musicas'});
  entries=out;
 }
 function render(){
  build();const q=strip(input.value.trim());
  results.replaceChildren();
  if(q.length<2){const p=document.createElement('p');p.textContent='Digite ao menos duas letras para buscar casas, regiões, artigos e músicas.';results.append(p);return;}
  const found=entries.filter(e=>matches(e,q)).slice(0,40);
  const status=document.createElement('p');status.className='global-search-status';status.textContent=found.length===40?'Exibindo os 40 primeiros resultados. Refine a busca.':found.length+' resultados.';results.append(status);
  if(!found.length)return;
  for(const entry of found){
   const b=document.createElement('button');b.type='button';b.className='global-search-result';
   const kind=document.createElement('span');kind.className='global-search-kind';kind.textContent=entry.type;
   const title=document.createElement('strong');title.textContent=entry.name;
   const subtitle=document.createElement('small');subtitle.textContent=entry.subtitle;
   b.append(kind,title,subtitle);
   b.addEventListener('click',()=>{dialog.close();location.hash=entry.hash;});
   results.append(b);
  }
 }
 function show(){if(!dialog.open)dialog.showModal();input.value='';render();input.focus();}
 open.addEventListener('click',show);
 close.addEventListener('click',()=>dialog.close());
 input.addEventListener('input',render);
 input.addEventListener('keydown',e=>{if(e.key==='Enter'){const b=results.querySelector('button');if(b){e.preventDefault();b.click();}}});
 document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();show();}
  else if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!dialog.open){
   const a=document.activeElement,tag=a?.tagName;
   if(!['INPUT','TEXTAREA','SELECT'].includes(tag)&&!a?.isContentEditable){e.preventDefault();show();}
  }
 });
})();
