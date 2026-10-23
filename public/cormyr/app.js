'use strict';
(() => {
 const data=window.CORMYR_DATA;
 const $=id=>document.getElementById(id);
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const state={view:'reino',region:'Horselands',regionView:'houses',hierarchyEra:'post',kind:'mundanos',query:'',theme:'',eventPage:1,houseQuery:'',adventure:'pacto-varzea',noble:{region:'',name:'',leader:'',castle:'',city:'',page:1,house:''}};
 const regionSelect=$('region-select');
 $('kingdom-music').innerHTML=musicLinks(data.kingdomMusic,'Música do reino');
 regionSelect.innerHTML=data.regions.map(r=>`<option value="${esc(r.name)}">${esc(r.name)}</option>`).join('');
 regionSelect.value=state.region;
 function routeHash(){
  if(state.view==='reino'){const params=new URLSearchParams();if(state.regionView==='hierarchy')params.set('visao','hierarquia');if(state.regionView==='hierarchy'&&['Elfhold','Helmlands'].includes(state.region))params.set('epoca',state.hierarchyEra==='before'?'antes-1522':'pos-1522');return '#regiao-'+normalize(state.region).replace(/\s+/g,'-')+(params.size?'?'+params:'');}
  if(state.view==='aventura')return '#aventura-'+state.adventure;
  if(state.view==='eventos'){const params=new URLSearchParams({tipo:state.kind});if(state.query)params.set('busca',state.query);if(state.theme)params.set('tema',state.theme);if(state.eventPage>1)params.set('pagina',String(state.eventPage));return '#eventos?'+params;}
  if(state.view==='nobreza'){const params=new URLSearchParams();for(const [key,value] of Object.entries(state.noble))if(value&&!(key==='page'&&value===1))params.set(key,String(value));return '#nobreza'+(params.size?'?'+params:'');}
  if(state.view==='constituicao')return '#constituicao';
  if(state.view==='musicas')return '#musicas';
  return '#notebook-lm';
 }
 function writeRoute(push=false){const next=routeHash();if(location.hash!==next)history[push?'pushState':'replaceState'](null,'',next);}
 function readHash(){const [h,query='']=location.hash.slice(1).split('?');const params=new URLSearchParams(query);state.deepEvent=null;
  if(!h){state.view='reino';state.regionView='houses';}
  else if(h==='nobreza'){state.view='nobreza';state.noble={region:params.get('region')||'',name:params.get('name')||'',leader:params.get('leader')||'',castle:params.get('castle')||'',city:params.get('city')||'',page:Math.max(1,parseInt(params.get('page'),10)||1),house:params.get('house')||''};}
  else if(h==='eventos'){state.view='eventos';state.kind=params.get('tipo')==='misticos'?'misticos':'mundanos';state.query=params.get('busca')||'';state.theme=params.get('tema')||'';state.eventPage=Math.max(1,parseInt(params.get('pagina'),10)||1);}
  else if(h==='aventura'||h==='notebook-lm'||h==='constituicao'||h==='musicas')state.view=h;
  else if(h==='pacto'){state.view='aventura';state.adventure='pacto-varzea';}
  else if(h.startsWith('aventura-')){const a=data.adventures.find(x=>x.id===h.slice(9));if(a)state.adventure=a.id;state.view='aventura';}
  else if(h.startsWith('regiao-')){const r=data.regions.find(x=>normalize(x.name).replace(/\s+/g,'-')===h.slice(7));if(r)state.region=r.name;state.regionView=params.get('visao')==='hierarquia'?'hierarchy':'houses';state.hierarchyEra=params.get('epoca')==='antes-1522'?'before':'post';state.view='reino';}
  else if(/^evento-(mundanos|misticos)-\d+$/.test(h)){const [,kind,id]=h.match(/^evento-(mundanos|misticos)-(\d+)$/);state.view='eventos';state.kind=kind;state.query='';state.theme='';state.deepEvent=+id;}
 }
 readHash();regionSelect.value=state.region;
 function showView(view,updateHash=true){state.view=view;document.querySelectorAll('.view').forEach(x=>x.hidden=x.id!==`view-${view}`);document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});document.title=({reino:'Reino e regiões',eventos:'Eventos',aventura:'Aventuras','notebook-lm':'Notebook LM',constituicao:'Constituição de Cormyr',nobreza:'Nobreza',musicas:'Músicas'}[view]||'Cormyr')+' · Cormyr Web';if(updateHash)writeRoute(true);}
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{showView(b.dataset.view);const h=document.querySelector('#view-'+state.view+' h1');h?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}));
 function regionAtEra(region,era='post'){
  if(!['Elfhold','Helmlands'].includes(region.name))return region;
  const oldMajor=region.name==='Elfhold'?'Drauthglas':'Marliir';
  const houses=region.houses.map(h=>({...h,hierarchy:{...h.hierarchy}}));
  if(era==='before'){
   for(const h of houses){const q=h.hierarchy;
    if(q.parent===oldMajor)q.kind='documented';
    if(h.name===region.major){q.parent=oldMajor;q.kind='documented';q.note='Vassalagem anterior à mudança regional de 1522.';q.source=h.sources.find(x=>x.label==='Documento da casa')?.url||q.source;}
    if(h.name===oldMajor){q.parent=null;q.kind='regional';q.note='Autoridade regional anterior a 1522.';}
    if(h.name===oldMajor||h.name===region.major){delete h.status;delete h.note;}
   }
  }else{
   for(const h of houses){const q=h.hierarchy;if(q.kind==='historical'&&q.parent===oldMajor){q.parent=null;q.kind='unknown';q.note='Após a mudança de 1522, o suserano direto desta casa ainda precisa de confirmação. Consulte a visão anterior para o vínculo histórico.';}}
  }
  return {...region,major:era==='before'?oldMajor:region.major,houses,era};
 }
 function hierarchyMap(region,era='post'){
  const temporal=['Elfhold','Helmlands'].includes(region.name);region=regionAtEra(region,era);const before=temporal&&era==='before';
  const houses=region.houses,byName=new Map(houses.map(h=>[h.name,h]));
  const linked=h=>['documented','regional'].includes(h.hierarchy?.kind);
  const children=name=>houses.filter(h=>h.name!==region.major&&linked(h)&&h.hierarchy.parent===name);
  const labels={unknown:'Suserano a definir',historical:'Vínculo anterior',review:'Vínculo a conferir',documented:'Vínculo documentado',regional:before?'Casa principal · Antes de 1522':'Casa principal · Pós-1522',crown:'Coroa de Cormyr'};
  function card(h){const q=h.hierarchy||{kind:'unknown'};return `<button type="button" class="hierarchy-house ${q.kind==='regional'||q.kind==='crown'?'hierarchy-major':''} ${q.kind==='historical'?'hierarchy-historical':''}" data-hierarchy-house="${esc(h.name)}" aria-label="Abrir ficha da Casa ${esc(h.name)}. ${esc(labels[q.kind])}"><img src="${esc(h.crest)}" alt="" width="46" height="64" loading="lazy"><span><strong>${esc(h.name)}</strong><small>${esc(h.clanRank?`Clã ${h.clanRank} · ${h.clanBranch}`:labels[q.kind])}</small>${q.kind==='historical'&&q.parent?`<small>Registro anterior: ${esc(q.parent)}</small>`:''}</span></button>`;}
  function branch(h){const kids=children(h.name);return `<li>${card(h)}${kids.length?`<ul class="hierarchy-children">${kids.map(branch).join('')}</ul>`:''}</li>`;}
  const major=byName.get(region.major),crown=data.regions.flatMap(r=>r.houses).find(h=>h.name==='Phelles');
  const royal=houses.filter(h=>h.name!==region.major&&linked(h)&&h.hierarchy.parent==='Phelles'&&!byName.has('Phelles'));
  const roots=houses.filter(h=>h.name!==region.major&&!royal.includes(h)&&(!linked(h)||!byName.has(h.hierarchy.parent)));
  const main=children(region.major);
  const grouped=region.hierarchyGroups?`<p class="clan-explanation">${esc(region.hierarchyNote)}</p><div class="clan-branches">${region.hierarchyGroups.map(g=>`<section class="clan-branch"><h4>Ramo ${esc(g.name)}</h4><p class="small">Vassalos diretos de ${esc(region.major)}</p><ul class="hierarchy-forest clan-list">${g.houses.map(n=>branch(byName.get(n))).join('')}</ul></section>`).join('')}</div>`:'';
  const documented=houses.filter(h=>h.hierarchy?.kind==='documented').length;
  return `<section class="hierarchy-section" aria-labelledby="hierarchy-title"><div class="hierarchy-heading"><div><p class="eyebrow">LAÇOS ENTRE AS CASAS</p><h3 id="hierarchy-title">Hierarquia e vassalagem</h3></div><span class="hierarchy-count">${houses.length} casas · ${documented} vínculos documentados</span></div>${temporal?`<div class="hierarchy-era" role="group" aria-label="Época da hierarquia"><button type="button" data-hierarchy-era="before" aria-pressed="${before}" class="region-view-button ${before?'active':''}">Antes de 1522</button><button type="button" data-hierarchy-era="post" aria-pressed="${!before}" class="region-view-button ${!before?'active':''}">Pós-1522</button></div><p class="era-context">${before?(region.name==='Elfhold'?'Elfhold sob a Coroa de Aelar Drauthglas, antes da reintegração ao reino.':'Helmlands sob a Casa Marliir, antes de sua destituição.'):(region.name==='Elfhold'?'Após a renúncia régia de Aelar, Vaylan assume como Major House de Elfhold.':'Após a destituição de Marliir, Evenhand assume as Helmlands, com sede em Arabel.')} ${!before?'Os vínculos diretos antigos não são transferidos automaticamente à nova casa principal.':'Recorte anterior à transição de 1522; não reúne todas as mudanças ao longo da primeira temporada.'}</p>`:''}<p class="hierarchy-help">${before?'A autoridade regional e os vínculos seguem os registros anteriores à transição.':'A Coroa e a casa principal seguem o quadro de 1522.'} As linhas entre casas representam relações explícitas do acervo; selecione um brasão para consultar a ficha e a fonte.</p><div class="hierarchy-scroll" tabindex="0" role="region" aria-label="Mapa de hierarquia de ${esc(region.name)}"><div class="hierarchy-crown">${!before&&region.major!=='Phelles'?card(crown)+`<div class="hierarchy-trunk"><span>Autoridade regional em 1522</span></div>`:''}${card(major)}</div>${grouped|| (main.length?`<ul class="hierarchy-forest hierarchy-main">${main.map(branch).join('')}</ul>`:'<p class="hierarchy-empty">Os vínculos diretos desta casa com as demais ainda não estão identificados no acervo consultado.</p>')}${royal.length?`<div class="hierarchy-royal"><h4>Vassalagem direta à Coroa</h4><p>Estas casas respondem diretamente à Casa Phelles.</p><ul class="hierarchy-forest">${royal.map(branch).join('')}</ul></div>`:''}${roots.length?`<div class="hierarchy-unplaced"><h4>Ramos com ligação superior a confirmar</h4><p>Estar nesta região não comprova vassalagem direta à casa principal. Os ramos abaixo preservam os vínculos internos documentados; registros anteriores e casas sem suserano definido ficam sinalizados.</p><ul class="hierarchy-forest">${roots.map(branch).join('')}</ul></div>`:''}</div><p class="hierarchy-legend"><span class="legend-line"></span> Vassalagem documentada <span class="legend-history">Registro anterior</span> Vínculo afetado por mudança política ou condição histórica.</p></section>`;
 }
 function musicLinks(songs,label){if(!songs?.length)return '';return `<section class="music-links" aria-label="${esc(label)}"><div><p class="eyebrow">TRILHA DE CORMYR</p><h4>${esc(label)}</h4></div><div class="music-actions">${songs.map(song=>`<a class="music-button" href="${esc(song.url)}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">▶</span><span>${esc(song.title)}<small>Ouvir no YouTube ↗</small></span></a>`).join('')}<a class="music-playlist" href="${esc(data.musicPlaylist)}" target="_blank" rel="noopener noreferrer">Ver playlist completa ↗</a></div></section>`;}
 function regionMap(region){
  const map=region.map;
  return `<section class="region-map panel" aria-labelledby="region-map-title"><div class="region-map-heading"><h3 id="region-map-title">Mapa</h3>${map?`<a class="quiet map-download" href="${esc(map.src)}" download="${esc(map.filename)}" aria-label="Baixar mapa de ${esc(region.name)}">Baixar Mapa</a>`:''}</div>${map?`<figure class="region-map-figure"><a href="${esc(map.src)}" target="_blank" rel="noopener" aria-label="Ampliar mapa de ${esc(region.name)} em nova aba"><img src="${esc(map.src)}" alt="${esc(map.alt)}" width="${map.width}" height="${map.height}" loading="lazy" decoding="async"></a><figcaption>Mapa de ${esc(region.name)} · Selecione a imagem para ampliar.${map.note?`<br>${esc(map.note)}`:''}</figcaption></figure>`:'<p class="region-map-empty">Mapa ainda não disponível.</p>'}</section>`;
 }
 function renderRegion(){const region=data.regions.find(x=>x.name===state.region);const overview=state.regionView==='hierarchy'?regionAtEra(region,state.hierarchyEra):region;const major=overview.houses.find(h=>normalize(h.name)===normalize(overview.major));const past=overview.era==='before';
 $('region-content').innerHTML=`<div class="region-overview">${major.crest?`<img class="region-banner" src="${esc(major.crest)}" alt="Brasão da Casa ${esc(overview.major)}" width="134" height="190">`:`<div class="crest-missing">${esc(overview.major)}<small>Brasão não localizado</small></div>`}<div><div class="region-title"><h3>${esc(region.name)}</h3></div><p class="region-meta">${esc(region.subtitle)} · Casa principal: <strong>${esc(overview.major)}</strong></p><p class="region-description">${esc(region.description)}</p><p class="politics"><strong>${past?'Antes de 1522.':'Quadro de 1522.'}</strong> ${past?esc(region.name==='Elfhold'?'Elfhold sob a autoridade régia de Aelar Drauthglas, antes da reintegração ao reino.':'Helmlands sob a Casa Marliir, antes de sua destituição.'):esc(region.politics)}</p>${musicLinks(region.music,'Música da região')}${region.fullText?`<div id="region-full-text" class="region-full-text" hidden><p class="small">Texto integral do acervo regional. Os registros históricos podem descrever períodos anteriores ao quadro de 1522.</p>${region.fullText.split(/\r?\n/).filter(t=>t.trim()).map(t=>t.length<110&&t===t.toUpperCase()&&/[A-ZÀ-Ý]/.test(t)?`<h4>${esc(t)}</h4>`:`<p>${esc(t)}</p>`).join('')}</div><div class="region-read-actions"><button type="button" id="region-read-more" class="quiet" aria-expanded="false" aria-controls="region-full-text">Ler mais</button></div>`:''}</div></div>${regionMap(region)}<div id="region-hierarchy-view"${state.regionView==='hierarchy'?'':' hidden'}>${hierarchyMap(region,state.hierarchyEra)}</div><div id="region-houses-view"${state.regionView==='houses'?'':' hidden'}><div class="house-heading"><h3>Casas de ${esc(region.name)}</h3><p>${region.houses.length} casas no acervo</p></div><div class="house-search"><label for="house-search">Buscar casa nesta região<input id="house-search" type="search" placeholder="Nome, cidade ou castelo…" value="${esc(state.houseQuery)}"></label><button type="button" id="house-search-clear" class="quiet">Limpar filtros</button></div><p id="house-search-result" class="small" role="status" aria-live="polite"></p><div class="houses-grid">${region.houses.map((h,index)=>`<button type="button" class="house-card" data-house="${index}" aria-label="Abrir ficha da Casa ${esc(h.name)}"><div class="crest-frame">${h.crest?`<img src="${esc(h.crest)}" alt="Brasão da Casa ${esc(h.name)}" loading="lazy" decoding="async" width="160" height="232">`:`<div class="crest-missing">${esc(h.name)}<small>Brasão não localizado no acervo</small></div>`}</div><div class="house-caption"><strong>${esc(h.name)}</strong><span class="${h.name===region.major?'major':''}">${h.name===region.major?'CASA PRINCIPAL':esc(h.status||h.sourceKind||'Casa nobre')}</span></div></button>`).join('')}</div><p class="archive-note">Selecione um brasão para consultar a ficha e suas fontes. As casas históricas também estão listadas; a presença no acervo não confirma a manutenção de títulos em 1522.</p></div>`;
 const readMore=document.getElementById('region-read-more');if(readMore)readMore.addEventListener('click',()=>{const expanded=readMore.getAttribute('aria-expanded')==='true';document.getElementById('region-full-text').hidden=expanded;readMore.setAttribute('aria-expanded',String(!expanded));readMore.textContent=expanded?'Ler mais':'Ler menos';if(expanded){readMore.scrollIntoView({block:'nearest',behavior:'instant'});readMore.focus({preventScroll:true});}});
 $('region-content').querySelectorAll('[data-hierarchy-house]').forEach(b=>b.addEventListener('click',()=>{const h=regionAtEra(region,state.hierarchyEra).houses.find(h=>h.name===b.dataset.hierarchyHouse)||data.regions.flatMap(r=>r.houses).find(h=>h.name===b.dataset.hierarchyHouse);if(h)openHouse(h);}));
 $('region-content').querySelectorAll('[data-hierarchy-era]').forEach(b=>b.addEventListener('click',()=>{state.hierarchyEra=b.dataset.hierarchyEra;renderRegion();writeRoute();document.querySelector(`[data-hierarchy-era="${state.hierarchyEra}"]`).focus({preventScroll:true});}));
 $('region-content').querySelectorAll('[data-house]').forEach(b=>b.addEventListener('click',()=>openHouse(region.houses[+b.dataset.house])));
 const houseSearch=document.getElementById('house-search');
 function filterHouses(){const q=normalize(state.houseQuery.trim());let count=0;document.querySelectorAll('[data-house]').forEach(b=>{const h=region.houses[+b.dataset.house];const match=!q||normalize([h.name,h.city,h.castle,...(h.aliases||[])].join(' ')).includes(q);b.hidden=!match;if(match)count++;});const result=document.getElementById('house-search-result');result.textContent=q?(count?`${count} de ${region.houses.length} casas encontradas.`:'Nenhuma casa encontrada. Tente outro termo.') :'';}
 houseSearch.addEventListener('input',()=>{state.houseQuery=houseSearch.value;filterHouses();});document.getElementById('house-search-clear').addEventListener('click',()=>{state.houseQuery='';houseSearch.value='';filterHouses();houseSearch.focus();});filterHouses();
 document.querySelectorAll('[data-region-view]').forEach(b=>{const active=b.dataset.regionView===state.regionView;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});

 }
 function openHouse(h){state.noble.house=h.nobleId;renderNobility();showView('nobreza');$('noble-detail').scrollIntoView({block:'start',behavior:'instant'});document.getElementById('house-title')?.focus({preventScroll:true});}
 function renderHouse(h){const q=h.hierarchy||{};const hierarchyLabel=q.kind==='historical'?'Suserano no registro anterior':'Suserano documentado';const fields=[['Região',h.region],[hierarchyLabel,q.parent|| (q.kind==='crown'?'Coroa reinante':'Não definido no acervo')],['Lorde / Lady',h.leader],['Ramo',h.clanBranch],['Precedência',h.clanRank?'Clã '+h.clanRank:null],['Regência',h.regent],['Idade',h.age],['Raça',h.race],['Títulos e epítetos',h.titles],['Fundação e investiduras',h.founding],['Condição',h.status],['Cores',h.colors],['Símbolo',h.symbol],['Lema',h.motto],['Cidade',h.city],['Castelo',h.castle]].filter(x=>x[1]);
 $('house-details').innerHTML=`<div class="house-detail-grid">${h.crest?`<img src="${esc(h.crest)}" alt="Brasão da Casa ${esc(h.name)}" width="230" height="350">`:'<div class="crest-missing" style="background:var(--purple)">Brasão não localizado no acervo</div>'}<div><p class="eyebrow">${esc(h.region)}</p><h2 id="house-title" tabindex="-1">Casa ${esc(h.name)}</h2>${h.description?`<p>${esc(h.description)}</p>`:''}<dl class="house-data">${fields.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${h.note?`<p class="small">${esc(h.note)}</p>`:''}${h.aliases?.length?`<p class="aliases"><strong>Variações nas fontes:</strong> ${h.aliases.map(esc).join('; ')}.</p>`:''}${q.note?`<p class="small hierarchy-note">${esc(q.note)}</p>`:''}</div></div>`;
 $('noble-media').innerHTML=`${musicLinks(h.music,'Música da casa')}<div class="noble-downloads"><a class="quiet" href="${esc(h.crest)}" download="Brasao-${esc(h.nobleId)}.webp">Baixar brasão</a>${h.portrait?`<a class="quiet" href="${esc(h.portrait)}" download="Retrato-${esc(h.nobleId)}.jpg">Baixar imagem do lorde / lady</a>`:''}</div>${h.portrait?`<figure class="noble-portrait"><img src="${esc(h.portrait)}" alt="Imagem de ${esc(h.leader||h.name)}" loading="lazy"><figcaption>${esc(h.leader)}</figcaption></figure>`:'<p class="small">Retrato do lorde ou lady ainda não localizado no acervo.</p>'}`;
 loadHouseHistory(h);
 }
 document.querySelectorAll('[data-region-view]').forEach(button=>button.addEventListener('click',()=>{state.regionView=button.dataset.regionView;renderRegion();writeRoute();}));
 regionSelect.addEventListener('change',()=>{state.region=regionSelect.value;state.houseQuery='';renderRegion();showView('reino');});
 function setThemes(){const themes=[...new Set(data.events.filter(e=>e.kind===state.kind).map(e=>e.theme))];$('theme').innerHTML='<option value="">Todos os temas</option>'+themes.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');if(!themes.includes(state.theme))state.theme='';$('theme').value=state.theme;}
 function filtered(){const q=normalize(state.query.trim());return data.events.filter(e=>e.kind===state.kind&&(!state.theme||e.theme===state.theme)&&(!q||normalize([e.id,e.title,e.hook,e.a,e.b,e.clue,e.theme,e.scale||''].join(' ')).includes(q)));}
 function renderEvents(){const list=filtered(),mystic=state.kind==='misticos';const pages=Math.max(1,Math.ceil(list.length/12));state.eventPage=Math.min(Math.max(1,state.eventPage),pages);const visible=list.slice((state.eventPage-1)*12,state.eventPage*12);$('event-list-title').textContent=mystic?'Eventos místicos':'Eventos mundanos';$('event-count').textContent=`${list.length} encontrados · ${visible.length} nesta página`;
 $('event-help').textContent=mystic?'Magia e mistérios de Faerûn. Adapte os efeitos e custos às regras da sua mesa.':'Petições e conflitos da vida cotidiana. Esta coleção também inclui dez eventos sobre magia no dia a dia.';
 $('event-list').innerHTML=visible.map(e=>`<article class="event-card ${mystic?'mystic':''}" id="evento-${e.kind}-${e.id}" tabindex="-1"><div class="event-meta"><span class="event-number">${mystic?'MÍSTICO':'MUNDANO'} ${String(e.id).padStart(3,'0')}</span><span>${esc(e.scale||e.theme)}</span></div><h3>${esc(e.title)}</h3><p class="hook">${esc(e.hook)}</p><details><summary>Decisões e consequências</summary><dl><dt>UMA DECISÃO</dt><dd>${esc(e.a)}</dd><dt>OUTRA DECISÃO</dt><dd>${esc(e.b)}</dd><dt>O QUE PODE MUDAR A CONVERSA</dt><dd>${esc(e.clue)}</dd></dl>${mystic?`<p class="small">${esc(e.theme)}</p>`:''}</details></article>`).join('');$('empty').hidden=list.length>0;$('random').disabled=!list.length;$('event-pagination').hidden=list.length<=12;$('events-prev').disabled=state.eventPage<=1;$('events-next').disabled=state.eventPage>=pages;$('events-page').textContent=`Página ${state.eventPage} de ${pages}`;
 }
 function chooseKind(kind){state.kind=kind;document.querySelectorAll('[name="kind"]').forEach(r=>r.checked=r.value===kind);setThemes();renderEvents();}
 document.querySelectorAll('[name="kind"]').forEach(r=>r.addEventListener('change',()=>{state.theme='';state.eventPage=1;chooseKind(r.value);writeRoute();}));
 $('search').addEventListener('input',()=>{state.query=$('search').value;state.eventPage=1;renderEvents();writeRoute();});
 $('theme').addEventListener('change',()=>{state.theme=$('theme').value;state.eventPage=1;renderEvents();writeRoute();});
 $('reset').addEventListener('click',()=>{state.query='';state.theme='';state.eventPage=1;$('search').value='';$('theme').value='';renderEvents();writeRoute();});
 function eventPage(delta){state.eventPage+=delta;renderEvents();writeRoute();$('event-list-title').scrollIntoView({block:'start',behavior:'instant'});$('event-list-title').focus({preventScroll:true});}
 $('events-prev').addEventListener('click',()=>eventPage(-1));$('events-next').addEventListener('click',()=>eventPage(1));
 function revealEvent(id,updateHash=true){const index=filtered().findIndex(e=>e.id===id);if(index<0)return;state.eventPage=Math.floor(index/12)+1;renderEvents();const el=$(`evento-${state.kind}-${id}`);if(!el)return;el.classList.add('selected');el.querySelector('details').open=true;el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});el.focus({preventScroll:true});if(updateHash)history.pushState(null,'',`#evento-${state.kind}-${id}`);}
 $('random').addEventListener('click',()=>{const pool=filtered();if(pool.length)revealEvent(pool[Math.floor(Math.random()*pool.length)].id);});
 async function downloadRegionPNG(){
  const button=$('download-region-png'),status=$('download-region-status');
  const original=data.regions.find(r=>r.name===state.region),mode=state.regionView,era=state.hierarchyEra;
  const region=mode==='hierarchy'?regionAtEra(original,era):original;
  const temporal=mode==='hierarchy'&&['Elfhold','Helmlands'].includes(region.name),before=temporal&&era==='before';
  button.disabled=true;button.textContent='Gerando imagem…';status.textContent='Preparando os brasões da região…';
  try{
   const crown=data.regions.flatMap(r=>r.houses).find(h=>h.name==='Phelles');
   const needed=[...region.houses,...(mode==='hierarchy'&&!before&&region.major!=='Phelles'?[crown]:[])];
   const images=new Map(await Promise.all(needed.map(h=>new Promise((resolve,reject)=>{const img=new Image();const timer=setTimeout(()=>reject(new Error('Não foi possível carregar o brasão de '+h.name+'.')),20000);img.onload=()=>{clearTimeout(timer);resolve([h.name,img]);};img.onerror=()=>{clearTimeout(timer);reject(new Error('Não foi possível carregar o brasão de '+h.name+'.'));};img.src=h.crest;}))));
   const width=1600,rows=[],links=[];let y=250,unplacedY=null;
   if(mode==='hierarchy'){
    const linked=h=>['documented','regional'].includes(h.hierarchy?.kind);
    const byName=new Map(region.houses.map(h=>[h.name,h]));
    function visit(h,depth,parent=null){const row={h,x:70+depth*130,y,w:Math.min(1000,width-140-depth*130),height:108};rows.push(row);if(parent)links.push({parent,row});y+=132;for(const child of region.houses.filter(c=>c.name!==region.major&&linked(c)&&c.hierarchy.parent===h.name))visit(child,depth+1,row);return row;}
    let parent=null,depth=0;
    if(!before&&region.major!=='Phelles'){parent={h:crown,x:70,y,w:1000,height:108};rows.push(parent);y+=132;depth=1;}
    visit(byName.get(region.major),depth,parent);
    const roots=region.houses.filter(h=>h.name!==region.major&&(!linked(h)||!byName.has(h.hierarchy.parent)));
    if(roots.length){unplacedY=y+20;y+=105;for(const h of roots)visit(h,0);}
   }
   const height=mode==='houses'?280+Math.ceil(region.houses.length/5)*385+90:y+95;
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Seu navegador não disponibilizou a exportação da imagem.');
   ctx.fillStyle='#f7f3eb';ctx.fillRect(0,0,width,height);ctx.fillStyle='#301641';ctx.fillRect(0,0,width,190);ctx.fillStyle='#dac28f';ctx.font='bold 20px sans-serif';ctx.fillText('CORMYR WEB · CRÔNICAS DO REINO',65,45);ctx.fillStyle='#ffffff';ctx.font='48px Georgia, serif';ctx.fillText(region.name,65,108);ctx.font='24px sans-serif';ctx.fillStyle='#e1d5e6';ctx.fillText((mode==='houses'?'Todas as casas':'Hierarquia e vassalagem')+' · '+(temporal?(before?'Antes de 1522':'Pós-1522'):'1522 CV'),65,150);ctx.fillStyle='#b58e4e';ctx.fillRect(0,190,width,5);
   function textFit(text,x,top,max,size=27,color='#301641'){ctx.fillStyle=color;do{ctx.font=size+'px Georgia, serif';if(ctx.measureText(text).width<=max)break;size--;}while(size>15);ctx.fillText(text,x,top);}
   function crest(h,x,top,w,hgt){const img=images.get(h.name),scale=Math.min(w/img.naturalWidth,hgt/img.naturalHeight);const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;ctx.drawImage(img,x+(w-iw)/2,top+(hgt-ih)/2,iw,ih);}
   function badge(h){const q=h.hierarchy||{};if(h.name===region.major)return 'Casa principal';if(h.clanRank)return 'Clã '+h.clanRank+' · '+h.clanBranch;return {crown:'Coroa de Cormyr',regional:'Casa principal',documented:'Vínculo documentado',historical:'Registro anterior',unknown:'Suserano a confirmar',review:'Vínculo a conferir'}[q.kind]||'Casa nobre';}
   if(mode==='houses'){
    region.houses.forEach((h,i)=>{const x=65+(i%5)*298,top=245+Math.floor(i/5)*385;ctx.fillStyle='#fffefa';ctx.fillRect(x,top,278,357);ctx.strokeStyle=h.name===region.major?'#b58e4e':'#d2c6d6';ctx.lineWidth=2;ctx.strokeRect(x,top,278,357);ctx.fillStyle='#271b2d';ctx.fillRect(x+1,top+1,276,265);crest(h,x+18,top+12,242,240);textFit(h.name,x+15,top+305,248,27);ctx.font='16px sans-serif';ctx.fillStyle='#786681';ctx.fillText(h.name===region.major?'CASA PRINCIPAL':h.status||'CASA NOBRE',x+15,top+337,248);});
   }else{
    ctx.strokeStyle='#9d829f';ctx.lineWidth=3;
    for(const {parent,row} of links){ctx.beginPath();ctx.moveTo(parent.x+28,parent.y+parent.height);ctx.lineTo(parent.x+28,row.y+54);ctx.lineTo(row.x,row.y+54);ctx.stroke();}
    if(unplacedY!==null){textFit('Ramos com ligação superior a confirmar',70,unplacedY,1460,28);ctx.font='18px sans-serif';ctx.fillStyle='#6d5f70';ctx.fillText('Vínculos internos preservados; a posição na região não comprova vassalagem direta à casa principal.',70,unplacedY+32);}
    for(const row of rows){const {h,x,y:top,w,height:rh}=row;ctx.fillStyle=h.name===region.major?'#f0e4cc':'#fffefa';ctx.fillRect(x,top,w,rh);ctx.strokeStyle='#c5b3cd';ctx.lineWidth=2;ctx.setLineDash(h.hierarchy?.kind==='historical'?[7,5]:[]);ctx.strokeRect(x,top,w,rh);ctx.setLineDash([]);crest(h,x+14,top+9,62,90);textFit(h.name,x+96,top+44,w-112,30);ctx.fillStyle='#75637b';ctx.font='18px sans-serif';ctx.fillText(badge(h),x+96,top+78,w-112);}
   }
   ctx.fillStyle='#75637b';ctx.font='18px sans-serif';ctx.fillText(region.houses.length+' casas · Acervo da campanha · '+(mode==='hierarchy'?'Linhas: vínculos documentados; registros pendentes sinalizados.':'Casas históricas podem constar no acervo.'),65,height-38,width-130);
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Não foi possível gerar o PNG.')),'image/png'));
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cormyr-'+normalize(region.name).replace(/\s+/g,'-')+'-'+(mode==='houses'?'casas':'hierarquia')+(temporal?'-'+(before?'antes-1522':'pos-1522'):'')+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='Imagem gerada. Download iniciado.';
  }catch(error){status.textContent=error.message||'Não foi possível gerar a imagem. Tente novamente.';}
  finally{button.disabled=false;button.textContent='Baixar casas da Região';}
 }
 $('download-region-png').addEventListener('click',downloadRegionPNG);
 const adventureSelect=$('adventure-select');
 adventureSelect.innerHTML=data.adventures.map(a=>`<option value="${esc(a.id)}">${esc(a.title)} — ${esc(a.status)}</option>`).join('');
 function renderAdventure(){
  const adventure=data.adventures.find(a=>a.id===state.adventure)||data.adventures[0];
  if(!adventure)return;
  state.adventure=adventure.id;adventureSelect.value=adventure.id;
  $('adventure-title').textContent=adventure.title;
  $('adventure-season').textContent=adventure.season;
  $('adventure-status').textContent=adventure.status;
  $('adventure-summary').textContent=adventure.summary;
  $('campaign-guide').innerHTML=adventure.content;$('campaign-guide').classList.toggle('no-index',!adventure.content.includes('<section'));
  const chapters=[...$('campaign-guide').querySelectorAll(':scope > section')];
  $('campaign-guide').classList.toggle('no-index',chapters.length<=3);
  if(chapters.length>3){const outline=document.createElement('details');outline.className='adventure-outline';outline.open=!matchMedia('(max-width:900px)').matches;const summary=document.createElement('summary');summary.textContent='Nesta aventura';outline.append(summary);const nav=document.createElement('nav');nav.className='adventure-index';nav.setAttribute('aria-label','Seções da aventura');
   const label=document.createElement('p');label.className='eyebrow';label.textContent='CONSULTA RÁPIDA';nav.append(label);
   for(const section of chapters){const heading=section.querySelector('h2');if(!heading)continue;const button=document.createElement('button');button.type='button';button.textContent=heading.textContent;heading.tabIndex=-1;button.addEventListener('click',()=>{heading.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});heading.focus({preventScroll:true});nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===button));});nav.append(button);}
   outline.append(nav);$('campaign-guide').prepend(outline);const body=document.createElement('div');body.className='adventure-body';chapters.forEach(section=>body.append(section));$('campaign-guide').append(body);
  }

  $('campaign-guide').querySelectorAll('a[href^="#evento-"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();state.query='';state.theme='';$('search').value='';state.eventPage=1;chooseKind('mundanos');showView('eventos',false);revealEvent(Number(a.getAttribute('href').split('-').pop()));}));
 }
 adventureSelect.addEventListener('change',()=>{state.adventure=adventureSelect.value;renderAdventure();showView('aventura');});
 const nobleHouses=data.regions.flatMap(r=>r.houses).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 $('noble-region').innerHTML='<option value="">Todas as regiões</option>'+data.regions.map(r=>`<option value="${esc(r.name)}">${esc(r.name)}</option>`).join('');
 const historyCache=new Map();let historyRequest=0;
 function nobleMatches(h){const n=state.noble;return (!n.region||h.region===n.region)&&['name','leader','castle','city'].every(key=>{const value=normalize(n[key].trim());return !value||normalize([h[key],...(h[key+'Aliases']||[]),...(key==='name'?h.aliases||[]:[])].join(' ')).includes(value);});}
 function renderNobility(){
  const n=state.noble;for(const key of ['region','name','leader','castle','city'])document.getElementById('noble-'+key).value=n[key];
  const selected=nobleHouses.find(h=>h.nobleId===n.house);$('noble-detail').hidden=!selected;$('noble-catalog').hidden=!!selected;
  if(selected){renderHouse(selected);return;}historyRequest++;
  const found=nobleHouses.filter(nobleMatches),pages=Math.max(1,Math.ceil(found.length/24));n.page=Math.min(n.page,pages);const visible=found.slice((n.page-1)*24,n.page*24);
  $('noble-count').textContent=`${found.length} de ${nobleHouses.length} casas · ${visible.length} nesta página`;
  $('noble-list').innerHTML=visible.map(h=>`<button class="noble-card" type="button" data-noble="${esc(h.nobleId)}"><img src="${esc(h.crest)}" alt="" width="70" height="100" loading="lazy"><span><small>${esc(h.region)}</small><strong>Casa ${esc(h.name)}</strong><span>${esc(h.leader||'Lorde / Lady a confirmar')}</span><span class="small">${esc([h.city,h.castle].filter(Boolean).join(' · '))}</span></span></button>`).join('');
  $('noble-list').querySelectorAll('[data-noble]').forEach(b=>b.addEventListener('click',()=>openHouse(nobleHouses.find(h=>h.nobleId===b.dataset.noble))));
  $('noble-empty').hidden=found.length>0;$('noble-pagination').hidden=found.length<=24;$('noble-prev').disabled=n.page<=1;$('noble-next').disabled=n.page>=pages;$('noble-page').textContent=`Página ${n.page} de ${pages}`;
 }
 async function loadHouseHistory(h){
  const request=++historyRequest,target=$('noble-history');target.innerHTML='<p role="status">Carregando história…</p>';
  if(!h.historyPath){target.innerHTML='<p>A história desta casa ainda não está disponível nos documentos consultados. Os dados conhecidos estão na ficha acima.</p>';return;}
  try{let doc=historyCache.get(h.historyPath);if(!doc){const response=await fetch(h.historyPath);if(!response.ok)throw new Error('HTTP '+response.status);doc=await response.json();historyCache.set(h.historyPath,doc);}if(request!==historyRequest)return;
   const paragraphs=doc.text.split(/\r?\n/).filter(t=>t.trim());target.innerHTML=(h.historyBrief?'<p class="small">O documento disponível contém apenas um registro breve; sua transcrição está abaixo.</p>':'')+paragraphs.map(t=>/^[_━─]{4,}$/.test(t.trim())?'<hr>':t.trim().length<100&&!/[.!?;:]$/.test(t.trim())&&!t.includes(':')?`<h4>${esc(t)}</h4>`:`<p>${esc(t)}</p>`).join('');
  }catch(error){if(request!==historyRequest)return;target.innerHTML='<p>Não foi possível carregar a história. Tente novamente.</p><button type="button" class="quiet" data-retry-history>Tentar novamente</button>';target.querySelector('[data-retry-history]').addEventListener('click',()=>loadHouseHistory(h));}
 }
 for(const key of ['region','name','leader','castle','city'])document.getElementById('noble-'+key).addEventListener(key==='region'?'change':'input',e=>{state.noble[key]=e.target.value;state.noble.page=1;renderNobility();writeRoute();});
 $('noble-reset').addEventListener('click',()=>{Object.assign(state.noble,{region:'',name:'',leader:'',castle:'',city:'',page:1,house:''});renderNobility();writeRoute();$('noble-name').focus();});
 $('noble-back').addEventListener('click',()=>{state.noble.house='';renderNobility();writeRoute(true);$('nobility-title').focus();});
 function noblePage(delta){state.noble.page+=delta;renderNobility();writeRoute();$('noble-count').scrollIntoView({block:'start',behavior:'instant'});}
 $('noble-prev').addEventListener('click',()=>noblePage(-1));$('noble-next').addEventListener('click',()=>noblePage(1));
 const lawState={query:'',topic:'',page:1};
 const law=data.constitution;
 $('law-topic').innerHTML='<option value="">Todos os temas</option>'+[...new Set(law.entries.map(e=>e.topic))].map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
 $('law-intro').textContent=law.intro;
 $('law-numbering').textContent=law.numberingNote;
 function lawMatches(){
  const q=normalize(lawState.query.trim()),number=q.match(/^(?:(?:artigo|art\.?)\s*)?(\d+)$/);
  const words=q.split(/\s+/).filter(Boolean);
  return law.entries.filter(e=>(!lawState.topic||e.topic===lawState.topic)&&(number?e.number===Number(number[1]):words.every(w=>normalize([e.title,e.topic,...e.paragraphs].join(' ')).includes(w))));
 }
 function lawHighlight(text){
  const words=normalize(lawState.query.trim()).split(/\s+/).filter(Boolean),normal=normalize(text),ranges=[];
  for(const word of words){let from=0,index;while((index=normal.indexOf(word,from))!==-1){ranges.push([index,index+word.length]);from=index+word.length;}}
  ranges.sort((a,b)=>a[0]-b[0]);const merged=[];for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range]);}
  let html='',position=0;for(const [start,end] of merged){html+=esc(text.slice(position,start))+'<mark>'+esc(text.slice(start,end))+'</mark>';position=end;}return html+esc(text.slice(position));
 }
 function lawExcerpt(entry){
  const words=normalize(lawState.query.trim()).split(/\s+/).filter(Boolean),text=entry.paragraphs.join(' '),normal=normalize(text);
  const matches=words.map(w=>normal.indexOf(w)).filter(n=>n>=0);const start=matches.length?Math.max(0,Math.min(...matches)-75):0;
  return (start?'…':'')+text.slice(start,start+270)+(start+270<text.length?'…':'');
 }
 function renderLaws(){
  const found=lawMatches(),pages=Math.max(1,Math.ceil(found.length/12));lawState.page=Math.min(lawState.page,pages);const visible=found.slice((lawState.page-1)*12,lawState.page*12);
  $('law-count').textContent=`${found.length} disposições encontradas · ${visible.length} nesta página`;
  $('law-results').innerHTML=visible.map(e=>`<article class="law-card panel"><p class="eyebrow">${esc(e.topic)}</p><h3>${lawHighlight(e.title)}</h3><p class="law-excerpt">${lawHighlight(lawExcerpt(e))}</p><details><summary>Ler texto integral</summary><div class="law-full">${e.paragraphs.map(t=>/^(?:[IVX]+\. )?Inciso \d+/.test(t)?`<h4>${lawHighlight(t)}</h4>`:`<p>${lawHighlight(t)}</p>`).join('')}</div></details></article>`).join('');
  $('law-empty').hidden=found.length>0;$('law-pagination').hidden=found.length<=12;$('law-prev').disabled=lawState.page<=1;$('law-next').disabled=lawState.page>=pages;$('law-page').textContent=`Página ${lawState.page} de ${pages}`;
 }
 $('law-search').addEventListener('input',()=>{lawState.query=$('law-search').value;lawState.page=1;renderLaws();});
 $('law-topic').addEventListener('change',()=>{lawState.topic=$('law-topic').value;lawState.page=1;renderLaws();});
 $('law-reset').addEventListener('click',()=>{Object.assign(lawState,{query:'',topic:'',page:1});$('law-search').value='';$('law-topic').value='';renderLaws();$('law-search').focus();});
 function moveLawPage(delta){lawState.page+=delta;renderLaws();$('law-results-title').scrollIntoView({block:'start',behavior:'instant'});$('law-results-title').focus({preventScroll:true});}
 $('law-prev').addEventListener('click',()=>moveLawPage(-1));$('law-next').addEventListener('click',()=>moveLawPage(1));renderLaws();
 function restoreRoute(){state.houseQuery='';readHash();renderNobility();regionSelect.value=state.region;$('search').value=state.query;renderAdventure();renderRegion();chooseKind(state.kind);showView(state.view,false);if(state.deepEvent)revealEvent(state.deepEvent,false);}
 restoreRoute();
 window.addEventListener('hashchange',restoreRoute);
})();
