/* Public, read-only Harptos explorer. Never reads authenticated House data. */
(function () {
  'use strict';
  const root=document.getElementById('chronicle-calendar');
  if (!root) return;
  const byId=(id)=>document.getElementById(id);
  const months=['Hammer','Alturiak','Ches','Tarsakh','Mirtul','Kythorn','Flamerule','Eleasis','Eleint','Marpenoth','Uktar','Nightal'];
  const fixed=[
    {id:'midwinter',month:0,name:'Meio do Inverno'},
    {id:'greengrass',month:3,name:'Relva Verde'},
    {id:'midsummer',month:6,name:'Meio do Verão'},
    {id:'shieldmeet',month:6,name:'Encontro dos Escudos',leapOnly:true},
    {id:'highharvestide',month:8,name:'Grande Colheita'},
    {id:'feast-moon',month:10,name:'Festa da Lua'}
  ];
  const waukeen=[[15,'Conforto da Contagem Fria'],[20,'Grande Tecelagem'],[30,'Moeda Alta'],
    [10,'Esferas'],[12,'Sammardach'],[21,'Brightbuckle'],[3,'Sornyn'],
    [17,'Huldark'],[7,'Spryndalstar'],[1,'Marthoon'],
    [10,'Tehennteahan · Noite de Martelos e Pregos'],[25,'Orbar']];
  const seasons=[[2,19,'Equinócio da primavera'],[5,20,'Solstício de verão'],
    [8,21,'Equinócio do outono'],[11,20,'Solstício de inverno']];
  const state={year:1522,month:9,day:21,mode:'year',region:'all',search:'',
    official:null,timeline:[],published:[],error:'',loading:true};
  const controls={year:byId('chronicle-year'),month:byId('chronicle-month'),
    tenday:byId('chronicle-tenday'),day:byId('chronicle-day'),mode:byId('chronicle-mode'),
    region:byId('chronicle-region'),search:byId('chronicle-search')};
  months.forEach((m,i)=>{const o=new Option(m,String(i));controls.month.add(o);});
  for(let i=1;i<=30;i++)controls.day.add(new Option(String(i),String(i)));
  const normalize=(value)=>String(value||'').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const yearValue=(v)=>Number.isSafeInteger(v)&&v>=1&&v<=9999;
  const pad=(n)=>String(n).padStart(2,'0');
  const iso=(year,month,day)=>String(year).padStart(4,'0')+'-'+pad(month+1)+'-'+pad(day);
  const row=(title,description,meta,type)=>{
    const article=document.createElement('article');article.className='chronicle-card';
    article.dataset.type=type;
    const metadata=document.createElement('div');metadata.className='chronicle-meta';metadata.textContent=meta;article.append(metadata);
    const head=document.createElement('h3');head.textContent=title;article.append(head);
    if(description){
      const details=document.createElement('details');
      const summary=document.createElement('summary');summary.textContent='Ler o acontecimento completo';
      const p=document.createElement('p');p.textContent=description;
      details.append(summary,p);article.append(details);
    }
    return article;
  };
  const empty=(message)=>{const p=document.createElement('p');p.className='chronicle-empty';p.textContent=message;return p;};
  const getAnnual=(year)=>state.timeline.filter(x=>x.year<=year&&(x.yearEnd||x.year)>=year);
  function knownObservances(year){
    const result=[];
    const add=(month,day,title,id,festival)=>result.push({id,year,month,day,festival:festival||null,
      date:festival?String(year).padStart(4,'0')+'-F-'+festival:iso(year,month,day),
      title,scope:'kingdom',region:null,type:'observance'});
    fixed.forEach(f=>{if(!f.leapOnly||year%4===0)add(f.month,31,f.name,f.id,f.id);});
    for(let m=0;m<12;m++){
      [[1,'Ver a Justiça'],[13,'Mutilamento'],[22,'O Vínculo']].forEach(([d,n])=>
        add(m,d,'Tyr · '+n,'tyr-'+m+'-'+d));
      // Sornyn in Flamerule lasts three days (3–5), per the canonical calendar.
      for(let day=waukeen[m][0];day<=(m===6?5:waukeen[m][0]);day++)
        add(m,day,'Waukeen · '+waukeen[m][1],'waukeen-'+m+'-'+day);
    }
    seasons.forEach(([m,d,n])=>add(m,d,n,'season-'+m));
    return result;
  }
  function parsePublished(event,year){
    if(!event||typeof event.title!=='string'||typeof event.date!=='string'||event.title.length>200)return null;
    const m=/^(\d{4})-(?:(\d{2})-(\d{2})|F-([a-z-]+))$/.exec(event.date);
    if(!m||Number(m[1])!==year)return null;
    let month=Number(m[2])-1,day=Number(m[3]),festival=null;
    if(m[4]){const f=fixed.find(x=>x.id===m[4]);if(!f||f.leapOnly&&year%4!==0)return null;
      month=f.month;day=31;festival=f.id;
    } else if(month<0||month>11||day<1||day>30)return null;
    if(event.scope!=='kingdom'&&event.scope!=='region')return null;
    if(event.scope==='region'&&!['1','2'].includes(event.region))return null;
    return {id:String(event.id||event.date),year,month,day,festival,date:event.date,title:event.title,
      description:typeof event.description==='string'?event.description:'',scope:event.scope,
      region:event.scope==='region'?event.region:null,type:'published'};
  }
  const regionLabel=(x)=>x.scope==='kingdom'?'Reino inteiro':x.region==='1'?'Costa do Dragão · Grupo 1':'Horselands · Grupo 2';
  const searchable=(x)=>normalize([x.title,x.description,x.year,x.yearEnd||'',x.region,regionLabel(x)].join(' '));
  const regionMatches=(x)=>state.region==='all'||x.scope==='kingdom'||x.region===state.region;
  function dateMatches(x){
    if(state.mode==='year')return true;
    if(x.month!==state.month)return false;
    if(state.mode==='month')return true;
    if(state.mode==='tenday')return x.day===31?Math.ceil(state.day/10)===3:Math.ceil(x.day/10)===Math.ceil(state.day/10);
    return !x.festival&&x.day===state.day;
  }
  function sync(){
    controls.year.value=String(state.year);controls.month.value=String(state.month);
    controls.tenday.value=String(Math.ceil(state.day/10));controls.day.value=String(state.day);
    controls.mode.value=state.mode;controls.region.value=state.region;controls.search.value=state.search;
    const hasMonth=state.mode!=='year',hasTenday=state.mode==='tenday'||state.mode==='day';
    for(const [control,enabled] of [[controls.month,hasMonth],[controls.tenday,hasTenday],
      [controls.day,state.mode==='day']]){control.disabled=!enabled;control.parentElement.dataset.off=String(!enabled);}
    byId('chronicle-prev-year').disabled=state.year===1;
    byId('chronicle-next-year').disabled=state.year===9999;
    byId('chronicle-previous').disabled=state.year===1&&
      (state.mode==='year'||state.month===0&&(state.mode==='month'||state.day===1));
    byId('chronicle-next').disabled=state.year===9999&&
      (state.mode==='year'||state.month===11&&(state.mode==='month'||state.day===30));
    const period=state.mode==='year'?'Ano '+state.year:
      (state.mode==='month'?months[state.month]+' · '+state.year:
      state.mode==='tenday'?Math.ceil(state.day/10)+'ª désdia · '+months[state.month]+' · '+state.year:
      state.day+' de '+months[state.month]+' · '+state.year);
    byId('chronicle-period').textContent=period;
    if(state.official){
      byId('chronicle-official').textContent='Data oficial: '+state.official.day+' de '+
        months[state.official.month]+' de '+state.official.year+' CV';
    }else{
      byId('chronicle-official').textContent='Data oficial não confirmada nesta consulta.';
    }
  }
  function display(){
    sync();
    const query=normalize(state.search.trim());
    const yearly=getAnnual(state.year)
      .filter(x=>regionMatches(x)&&(!query||searchable(x).includes(query)));
    const yBox=byId('chronicle-year-events');yBox.replaceChildren();
    byId('chronicle-year-heading').textContent='Crônicas de '+state.year+' CV';
    byId('chronicle-year-count').textContent=yearly.length+' acontecimento(s)';
    if(state.loading){yBox.append(empty('Carregando os acontecimentos anuais…'));}
    else if(!yearly.length){yBox.append(empty('Nenhuma crônica anual registrada para este ano e filtro.'));}
    else yearly.forEach(x=>yBox.append(row(x.title,x.description,
      (x.yearEnd?x.year+'–'+x.yearEnd:x.year)+' CV · Acontecimento do ano · '+regionLabel(x),'annual')));
    const known=knownObservances(state.year);
    const seen=new Set(known.map(x=>x.date+'|'+normalize(x.title)));
    const cloud=state.published.map(x=>parsePublished(x,state.year)).filter(Boolean)
      .filter(x=>{const k=x.date+'|'+normalize(x.title);if(seen.has(k))return false;seen.add(k);return true;});
    const dated=[...known,...cloud].filter(x=>dateMatches(x)&&regionMatches(x)&&
      (!query||searchable(x).includes(query))).sort((a,b)=>a.month-b.month||a.day-b.day||a.title.localeCompare(b.title,'pt-BR'));
    const dBox=byId('chronicle-dated-events');dBox.replaceChildren();
    byId('chronicle-dated-count').textContent=dated.length+' evento(s)';
    if(!dated.length)dBox.append(empty('Nenhuma data pública encontrada para a seleção.'));
    else dated.forEach(x=>dBox.append(row(x.title,x.description||'',
      (x.festival?'Festival intercalar após '+months[x.month]+' · ':x.day+' de '+months[x.month]+' · ')+
      state.year+' CV · '+regionLabel(x),'dated')));
    byId('chronicle-cloud-note').textContent=state.error||
      'Somente festas públicas e acontecimentos explicitamente publicados para o Reino entram nesta consulta; missivas e registros privados permanecem excluídos.';
  }
  function changeYear(y){if(!yearValue(y))return;state.year=y;state.published=[];state.error='';display();void loadPublished(y);}
  function move(delta){
    if(state.mode==='year'){changeYear(state.year+delta);return;}
    if(state.mode==='month'){let n=state.year*12+state.month+delta;if(n<12||n>9999*12+11)return;
      state.month=(n%12);changeYear(Math.floor(n/12));return;}
    const step=state.mode==='tenday'?10:1;
    let day=state.day+delta*step,month=state.month,year=state.year;
    while(day<1){month--;if(month<0){month=11;year--;}day+=30;}
    while(day>30){day-=30;month++;if(month>11){month=0;year++;}}
    if(!yearValue(year))return;
    state.day=day;state.month=month;changeYear(year);
  }
  let loadIndex=0;
  async function loadPublished(year){
    const index=++loadIndex;
    try{
      const res=await fetch('/api/public/calendar-events?year='+year,{credentials:'omit',cache:'no-store'});
      if(!res.ok)throw new Error('Os eventos públicos adicionais do Hub estão temporariamente indisponíveis.');
      const json=await res.json();
      if(!json||!Array.isArray(json.events))throw new Error('A projeção dos eventos públicos está inválida.');
      if(index!==loadIndex||year!==state.year)return;
      state.published=json.events;state.error='';display();
    }catch(e){if(index!==loadIndex||year!==state.year)return;state.published=[];
      state.error='Eventos adicionais do Hub não disponíveis nesta consulta. As crônicas anuais e as festas históricas continuam visíveis.';display();}
  }
  controls.year.addEventListener('change',()=>changeYear(Number(controls.year.value)));
  controls.month.addEventListener('change',()=>{state.month=Number(controls.month.value);display();});
  controls.tenday.addEventListener('change',()=>{state.day=(Number(controls.tenday.value)-1)*10+1;display();});
  controls.day.addEventListener('change',()=>{state.day=Number(controls.day.value);display();});
  controls.mode.addEventListener('change',()=>{state.mode=controls.mode.value;display();});
  controls.region.addEventListener('change',()=>{state.region=controls.region.value;display();});
  controls.search.addEventListener('input',()=>{state.search=controls.search.value;display();});
  byId('chronicle-prev-year').addEventListener('click',()=>changeYear(state.year-1));
  byId('chronicle-next-year').addEventListener('click',()=>changeYear(state.year+1));
  byId('chronicle-previous').addEventListener('click',()=>move(-1));
  byId('chronicle-next').addEventListener('click',()=>move(1));
  byId('chronicle-current').addEventListener('click',()=>{if(!state.official)return;
    state.year=state.official.year;state.month=state.official.month;
    state.day=state.official.day;changeYear(state.year);
  });
  async function initialise(){
    display();
    await Promise.allSettled([
      fetch('/cormyr/chronicle-timeline.json',{credentials:'omit'}).then(r=>{
        if(!r.ok)throw Error('timeline unavailable');return r.json();}).then(data=>{
        if(!data||!Array.isArray(data.events))throw Error('timeline invalid');
        state.timeline=data.events.filter(e=>yearValue(e.year)&&yearValue(e.yearEnd||e.year)&&
          (e.yearEnd===undefined||e.yearEnd>=e.year)).filter(e=>
          e.scope==='kingdom'&&typeof e.title==='string'&&typeof e.description==='string');
      }).catch(()=>{state.error='Não foi possível carregar as crônicas anuais. Tente atualizar a página.';}),
      fetch('/api/public/time',{credentials:'omit',cache:'no-store'}).then(r=>{
        if(!r.ok)throw Error('clock unavailable');return r.json();}).then(clock=>{
        if(yearValue(clock.year)&&Number.isInteger(clock.month)&&clock.month>=0&&clock.month<12&&
          Number.isInteger(clock.day)&&clock.day>=1&&clock.day<=30){
          state.official={year:clock.year,month:clock.month,day:clock.day};
          state.year=clock.year;state.month=clock.month;state.day=clock.day;
        }
      }).catch(()=>{}),
    ]);
    state.loading=false;display();void loadPublished(state.year);
  }
  void initialise();
})();
