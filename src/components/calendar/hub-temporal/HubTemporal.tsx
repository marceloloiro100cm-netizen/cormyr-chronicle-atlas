import {useCallback,useEffect,useMemo,useState,type ReactNode} from 'react';
import {workspaceRequest} from '@/lib/firebase-workspace/client';
import {useUrlParam,useUrlSearch,urlLinkProps,hrefWithParams,setUrlParams} from '@/lib/navigation/url-state';
import {absoluteDay,fromAbsoluteDay,nextTendayStart,weekPeriod,parseDateKey,dateKeyOf,
  festivalsInRange,fixedFestivalEntries,FIXED_FESTIVALS,HUB_REGIONS,dayOfYear,
  WAUKEEN_FESTIVALS,TYR_OBSERVANCES,SEASON_MARKERS,fixedFestivalDescription,
  canonicalObservanceEntries,loadAnnualChronicles,
  fmtDate,fmtShort,fmtRange,desdia,plural,listPt,regionLabel,houseLabel,keyAbs,monthSlots,
  viewOf,newKey,HUB_ERRORS,monthName,
  type HarptosDate,type HubFestival,type FestivalOccurrence,type OfficialDate,type HubData,
  type HubEvent,type HubLetter,type HistoryItem,type HubRequest,type AnnualChronicle} from './hub-model';
import './hub-temporal.css';

/* ---------- Ícones ---------- */
const PATHS:Record<string,string>={
 mesa:'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
 agenda:'M3 5h18v16H3zM16 3v4M8 3v4M3 10h18',
 star:'M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z',
 flag:'M4 22V4s1-1 4-1 5 2 8 2 4-1 4-1v11s-1 1-4 1-5-2-8-2-4 1-4 1',
 history:'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2',
 sliders:'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
 lock:'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
 send:'M22 2 11 13M22 2l-7 20-4-9-9-4z',
 alert:'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
 check:'M20 6 9 17l-5-5',undo:'M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8',
 arrow:'M5 12h14M12 5l7 7-7 7',plus:'M12 5v14M5 12h14',x:'M18 6 6 18M6 6l12 12',
 left:'m15 18-6-6 6-6',right:'m9 18 6-6-6-6',pen:'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
 trash:'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',play:'M7 4l13 8-13 8z',mail:'M2 4h20v16H2zM22 7l-10 6L2 7',
 ext:'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
 news:'M4 4h13v16H6a2 2 0 0 1-2-2zM17 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h5',
};
function Ic({n}:{n:string}){
 return <svg className="ht-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[n]??''}/></svg>;
}

type Tab='mesa'|'agenda'|'festivais'|'temporadas'|'historico'|'ajustes';
const TABS:readonly (readonly [Tab,string,string])[]=[['mesa','Mesa','mesa'],['agenda','Agenda','agenda'],
 ['festivais','Festivais','star'],['temporadas','Temporadas','flag'],['historico','Histórico','history'],['ajustes','Ajustes','sliders']];
type Layer='oficial'|'regional'|'festival'|'missiva'|'rascunho';
type Form=Record<string,string>;
type Modal={t:'confirm'}|{t:'date'}|{t:'undo'}|{t:'letter';letter:HubLetter}|
 {t:'event';form:Form}|{t:'festival';form:Form}|{t:'season';form:Form};
type AdvanceResult={openRound:number;publishedEvents?:number;calendar?:HarptosDate;
 houses?:{results?:{status:string;completedProjects?:number}[];error?:string}|null};

export type HubTemporalProps={
 calendar:OfficialDate;openRound:number;pendingHouseEffectMonths:number;
 request:HubRequest;advance:(fields:Record<string,unknown>)=>Promise<AdvanceResult>;
 onChanged:()=>void;tools?:ReactNode;
};
const errorText=(e:unknown)=>{
 const code=e&&typeof e==='object'&&'code' in e?String((e as {code:unknown}).code):'';
 return HUB_ERRORS[code]??(e instanceof Error?e.message:'Operação indisponível neste momento.');
};
const sameDay=(a:HarptosDate,b:HarptosDate)=>absoluteDay(a)===absoluteDay(b);
const mdOf=(d:HarptosDate)=>d.festival?'f:'+d.festival:'m:'+d.month;
function dateFromForm(form:Form):HarptosDate|string{
 const year=Number.parseInt(form['year']??'',10);
 if(!Number.isInteger(year)||year<1||year>9999)return 'Informe o ano (entre 1 e 9999 CV).';
 const [kind,value]=(form['md']??'m:0').split(':');
 const date:HarptosDate=kind==='f'
  ?{year,month:FIXED_FESTIVALS.find(f=>f.id===value)?.month??0,day:30,festival:value??null}
  :{year,month:Number(value),day:Number.parseInt(form['day']??'1',10)||1,festival:null};
 if(!dayOfYear(date))return 'O Encontro dos Escudos só existe em anos bissextos (divisíveis por 4).';
 return date;
}

/**
 * Hub Temporal V2.1 (Mesa de Comando): abre a semana, gerencia eventos,
 * festivais, temporadas e o histórico. Todas as regras ficam no servidor;
 * esta tela só mostra o efeito antes e pede uma confirmação.
 */
export function HubTemporal({calendar,openRound,pendingHouseEffectMonths,request,advance,onChanged,tools}:HubTemporalProps){
 useUrlSearch();
 const [tabParam]=useUrlParam('hub','mesa');
 const tab:Tab=TABS.some(t=>t[0]===tabParam)?tabParam as Tab:'mesa';
 const goTab=(t:Tab)=>{setMessage('');setUrlParams({hub:t==='mesa'?null:t});};
 const [hub,setHub]=useState<HubData|null>(null);
 const [history,setHistory]=useState<HistoryItem[]>([]);
 const [events,setEvents]=useState<HubEvent[]>([]);
 const [loadError,setLoadError]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [modal,setModal]=useState<Modal|null>(null);
 const [err,setErr]=useState('');
 const [target,setTarget]=useState<HarptosDate>(()=>nextTendayStart(calendar));
 const [picker,setPicker]=useState(false);
 const [pv,setPv]=useState(()=>viewOf(nextTendayStart(calendar)));
 const [excl,setExcl]=useState<string[]>([]);
 const [nota,setNota]=useState('');
 const [notaOpen,setNotaOpen]=useState(false);
 const [cv,setCv]=useState(()=>viewOf(calendar));
 const [sel,setSel]=useState<number|null>(null);
 const [foco,setFoco]=useState<'trav'|'entr'|null>(null);
 const [filt,setFilt]=useState<Record<Layer,boolean>>({oficial:true,regional:true,festival:true,missiva:true,rascunho:true});
 const [reg,setReg]=useState('');
 const [hl,setHl]=useState<string|null>(null);
 const [chronicles,setChronicles]=useState<AnnualChronicle[]>([]);
 useEffect(()=>{let on=true;void loadAnnualChronicles().then(items=>{if(on)setChronicles(items);});return()=>{on=false;};},[]);

 const load=useCallback(async()=>{
  setLoadError('');
  try{
   const [h,hist,ev]=await Promise.all([request<HubData>('hubData'),request<HistoryItem[]>('history'),
    workspaceRequest({kind:'rpc',name:'get_campaign_schedule_drafts',args:{}})]);
   setHub(h);setHistory(Array.isArray(hist)?hist:[]);
   setEvents(Array.isArray(ev)?(ev as HubEvent[]).map(e=>({...e,scope:e.scope==='region'?'region':'kingdom',region:e.region??null})):[]);
  }catch(e){setLoadError(errorText(e));}
 },[request]);
 useEffect(()=>{void load();},[load]);
 // Nova data oficial (abertura, desfazer ou correção): volta à sugestão automática.
 useEffect(()=>{
  const next=nextTendayStart(calendar);
  setTarget(next);setPv(viewOf(next));setExcl([]);setPicker(false);
 },[calendar.version,openRound]);// eslint-disable-line react-hooks/exhaustive-deps

 const cur=absoluteDay(calendar);
 const sug=nextTendayStart(calendar);
 const tAbs=absoluteDay(target);
 const period=weekPeriod(target);
 const curPeriod=weekPeriod(calendar);
 const flashback=tAbs<cur;
 const monthsForward=Math.max(0,(target.year-calendar.year)*12+(target.month-calendar.month));
 const tooFar=!flashback&&monthsForward>3;
 const tooFarBack=flashback&&calendar.year-target.year>50;
 const salto=tAbs-absoluteDay(sug);
 const canonicalObservances=useMemo(()=>canonicalObservanceEntries(),[]);
 const allFestivals=useMemo(()=>[...fixedFestivalEntries(hub?.fixedFestivalNotify??{}),...(hub?.festivals??[])],[hub]);
 const agendaFestivals=useMemo(()=>[...allFestivals,...canonicalObservances],[allFestivals,canonicalObservances]);
 const newFest=festivalsInRange(allFestivals,period.start,period.end);
 const letters=hub?.letters??[];
 const trav=letters.filter(l=>l.creationRound===openRound&&l.state!=='draft');
 const entr=letters.filter(l=>l.state==='scheduled'&&l.deliveryRound===openRound+1);
 const rascunhos=letters.filter(l=>l.state==='draft'&&l.creationRound===openRound);
 const inPeriod=(e:HubEvent,s:number,en:number)=>{const n=keyAbs(e.date);return n!==null&&n>=s&&n<en;};
 const cand=events.filter(e=>e.pending&&!e.deleted&&inPeriod(e,period.start,period.end))
  .sort((a,b)=>(keyAbs(a.date)??0)-(keyAbs(b.date)??0));
 const pub=cand.filter(e=>!excl.includes(e.id));
 const late=events.filter(e=>e.pending&&!e.deleted&&inPeriod(e,curPeriod.start-120,period.start)&&!inPeriod(e,period.start,period.end));
 const season=hub?.seasons.find(s=>s.status==='active')??null;

 async function run(task:()=>Promise<string>){
  if(busy)return;
  setBusy(true);setErr('');
  try{const text=await task();setModal(null);setMessage(text);await load();}
  catch(e){setErr(errorText(e));}
  finally{setBusy(false);}
 }
 const reason=(fallback:string)=>{
  const t=nota.trim().slice(0,280);
  return t.length>=12?t:t?`${fallback}: ${t}`.slice(0,300):fallback;
 };
 const doAdvance=()=>run(async()=>{
  const r=await advance({expectedCalendarVersion:calendar.version,expectedOpenRound:openRound,
   proposedDate:target,reason:reason(`Abertura da Semana ${openRound+1} pelo Hub Temporal`),requestKey:newKey(),
   ...(monthsForward>0?{acknowledgeHouseEffectsPending:true}:{}),
   ...(flashback?{allowBackdate:true,acknowledgeIrreversibleEffects:true}:{}),
   ...(excl.length?{excludeEventIds:excl.filter(id=>cand.some(e=>e.id===id))}:{})});
  setNota('');setNotaOpen(false);onChanged();
  const processed=r.houses?.results?.filter(x=>x.status==='processed').length??0;
  return `Semana ${r.openRound} aberta em ${fmtDate(target)}.`+
   (r.publishedEvents?` ${r.publishedEvents} ${plural(r.publishedEvents,'evento publicado','eventos publicados')}.`:'')+
   (r.houses?.error?' Os efeitos mensais das Casas ficaram pendentes: use "Processar efeitos mensais" em Pendências.':
    r.houses?` ${processed} ${plural(processed,'Casa processada','Casas processadas')} para o novo mês.`:'');
 });
 const doChangeDate=()=>run(async()=>{
  await request('changeDate',{expectedCalendarVersion:calendar.version,expectedOpenRound:openRound,
   proposedDate:target,reason:reason('Correção da data oficial pelo Hub Temporal'),requestKey:newKey(),
   allowBackdate:flashback,acknowledgeIrreversibleEffects:flashback,acknowledgeHouseEffectsPending:monthsForward>0});
  setNota('');onChanged();
  return `Data oficial corrigida para ${fmtDate(target)}. A Semana ${openRound} continua aberta.`;
 });
 const doUndo=()=>run(async()=>{
  const r=await request<{openRound:number;calendar:HarptosDate}>('undo',{expectedCalendarVersion:calendar.version,
   expectedOpenRound:openRound,requestKey:newKey()});
  onChanged();
  return `Abertura desfeita. A Semana ${r.openRound} voltou a ficar aberta em ${fmtDate(r.calendar)}.`;
 });
 const processHouses=()=>run(async()=>{
  const r=await request<{results:{status:string}[]}>('processHouseMonths');
  onChanged();
  return `Processamento mensal: ${r.results.filter(x=>x.status==='processed').length} Casa(s) atualizada(s).`;
 });

 /* ---------- Formulários ---------- */
 const openEvent=(ev?:HubEvent,base?:HarptosDate)=>{
  const d=ev?parseDateKey(ev.date)??target:base??target;
  setErr('');
  setModal({t:'event',form:{id:ev?.id??'',version:ev?String(ev.version):'',title:ev?.title??'',
   description:ev?.description??'',scope:ev?.scope??'kingdom',region:ev?.region??HUB_REGIONS[0]?.id??'1',
   year:String(d.year),md:mdOf(d),day:String(d.festival?1:d.day),publish:ev&&!ev.pending?'1':'0',
   public:ev?.public?'1':'0'}});
 };
 const saveEvent=(form:Form,remove=false)=>run(async()=>{
  const date=dateFromForm(form);
  if(typeof date==='string')throw Error(date);
  const title=(form['title']??'').trim();
  if(!remove&&!title)throw Error('Dê um título ao evento.');
  const id=form['id']||null;
  const saved=await workspaceRequest({kind:'rpc',name:'save_campaign_schedule_event',args:{p_payload:{
   id,version:id?Number(form['version']):null,date:dateKeyOf(date),title:title||'Evento removido',
   description:form['description']??'',deleted:remove,public:form['public']==='1',
   scope:form['scope']==='region'?'region':'kingdom',region:form['scope']==='region'?form['region']??null:null}}}) as {id?:string};
  if((remove||form['publish']==='1')&&typeof saved?.id==='string')
   await request('publishEvents',{ids:[saved.id]});
  setCv(viewOf(date));
  return remove?'Evento removido.':form['publish']==='1'?`Evento publicado em ${fmtDate(date)}.`
   :`Evento salvo como rascunho em ${fmtDate(date)}.`;
 });
 const openFestival=(f?:HubFestival)=>{
  const d=f?.date??calendar;
  setErr('');
  setModal({t:'festival',form:{id:f?.id??'',version:f?.version!==undefined?String(f.version):'',name:f?.name??'',
   scope:f?.scope??'kingdom',region:f?.region??HUB_REGIONS[0]?.id??'1',repeat:f?.repeat??'once',
   year:String(d.year),md:mdOf(d),day:String(d.festival?1:d.day),duration:String(f?.durationDays??1),
   notify:f?.notify===false?'0':'1',public:(f as (HubFestival&{public?:boolean})|undefined)?.public===true?'1':'0',
   description:f?.description??''}});
 };
 const festivalPayload=(form:Form,date:HarptosDate)=>({...(form['id']?{id:form['id'],version:Number(form['version'])}:{}),
  name:(form['name']??'').trim(),scope:form['scope']==='region'?'region':'kingdom',
  region:form['scope']==='region'?form['region']??null:null,date,repeat:form['repeat']==='yearly'?'yearly':'once',
  durationDays:Math.min(30,Math.max(1,Number.parseInt(form['duration']??'1',10)||1)),
  notify:form['notify']!=='0',public:form['public']==='1',description:(form['description']??'').trim()});
 const saveFestival=(form:Form)=>run(async()=>{
  const date=dateFromForm(form);
  if(typeof date==='string')throw Error(date);
  if(!(form['name']??'').trim())throw Error('Dê um nome ao festival.');
  await request('saveFestival',{festival:festivalPayload(form,date)});
  return 'Festival salvo.';
 });
 const toggleFestival=(f:HubFestival)=>run(async()=>{
  if(f.fixed){
   const id=f.date.festival??'';
   await request('saveSettings',{settings:{fixedFestivalNotify:{[id]:!f.notify}}});
  }else{
   await request('saveFestival',{festival:{id:f.id,version:f.version,name:f.name,scope:f.scope,region:f.region,
    date:f.date,repeat:f.repeat,durationDays:f.durationDays,notify:!f.notify,
    public:(f as HubFestival&{public?:boolean}).public===true,description:f.description}});
  }
  return f.notify?`Aviso desligado: ${f.name}.`:`Aviso ligado: ${f.name}.`;
 });
 const openSeason=()=>{setErr('');setModal({t:'season',form:{name:'',year:'',md:'m:0',day:'1'}});};
 const saveSeason=(form:Form)=>run(async()=>{
  const date=dateFromForm(form);
  if(typeof date==='string')throw Error(date);
  const number=Math.max(2,...(hub?.seasons??[]).map(s=>s.number))+1;
  const r=await request<{openRound:number;calendar:HarptosDate}>('startSeason',{expectedCalendarVersion:calendar.version,
   expectedOpenRound:openRound,proposedDate:date,name:(form['name']??'').trim().slice(0,80),
   reason:`Início da Temporada ${number} pelo Hub Temporal`,requestKey:newKey()});
  onChanged();
  return `Temporada ${number} iniciada: Semana ${r.openRound} aberta em ${fmtDate(r.calendar)}.`;
 });
 const saveJournal=(on:boolean)=>run(async()=>{
  await request('saveSettings',{settings:{newspaperOneEditionPerWeek:on}});
  return on?'Jornal limitado a uma edição por semana.':'Jornal sem limite semanal.';
 });

 /* ---------- Calendário ---------- */
 type Marks={nodes:ReactNode[];aria:string};
 const dayContent=(n:number,ctx:'pick'|'ag')=>{
  const f=ctx==='pick'?{oficial:true,regional:true,festival:true,missiva:false,rascunho:true}:filt;
  const r=ctx==='ag'?reg:'';
  const evs=events.filter(e=>keyAbs(e.date)===n&&(e.scope==='region'?f.regional:f.oficial)&&
   (!e.pending||e.published||f.rascunho)&&(!r||e.scope!=='region'||e.region===r)&&!(e.deleted&&!e.published));
  const fes=f.festival?festivalsInRange(ctx==='ag'?agendaFestivals:allFestivals,n,n+1).filter(o=>!r||o.festival.scope!=='region'||o.festival.region===r):[];
  const ms=f.missiva?letters.filter(l=>l.state!=='draft'&&keyAbs(l.date)===n):[];
  return {evs,fes,ms};
 };
 const marks=(n:number,ctx:'pick'|'ag'):Marks=>{
  const {evs,fes,ms}=dayContent(n,ctx);
  const nodes:ReactNode[]=[];
  if(fes.length)nodes.push(<i key="f" className="ht-sw ht-sw--fe"/>);
  evs.slice(0,2).forEach(e=>nodes.push(<i key={e.id} className={'ht-sw '+(e.scope==='region'?'ht-sw--rg':'ht-sw--of')+(e.pending&&!e.published?' ht-sw--dr':'')}/>));
  if(ms.length)nodes.push(<i key="m" className="ht-sw ht-sw--ms"/>);
  const parts=[fes.length?'festival':'',evs.length?`${evs.length} ${plural(evs.length,'evento','eventos')}`:'',
   ms.length?`${ms.length} ${plural(ms.length,'missiva','missivas')}`:''].filter(Boolean);
  return {nodes,aria:parts.length?', '+parts.join(', '):''};
 };
 function renderCalendar(ctx:'pick'|'ag'){
  const v=ctx==='pick'?pv:cv,setV=ctx==='pick'?setPv:setCv;
  const slots=monthSlots(v.year,v.month);
  const selected=ctx==='pick'?tAbs:sel;
  const span=ctx==='pick'?period:{start:0,end:0};
  const move=(delta:number)=>{const n=v.year*12+v.month+delta;if(n<12||n>9999*12+11)return;setV({year:Math.floor(n/12),month:n%12});};
  const cell=(s:{date:HarptosDate;n:number})=>{
   const m=marks(s.n,ctx);
   const cls='ht-cd'+(s.n===cur?' ht-cd--cur':'')+(s.n===selected?' ht-cd--sel':'')+
    (s.n>=span.start&&s.n<span.end?' ht-cd--span':'')+(s.date.festival?' ht-cd--fest':'');
   return <button type="button" key={s.n} className={cls} aria-pressed={s.n===selected}
    aria-label={fmtDate(s.date)+(s.n===cur?', data oficial':'')+m.aria}
    onClick={()=>{if(ctx==='pick'){setTarget(s.date);setExcl([]);}else{setSel(sel===s.n?null:s.n);setFoco(null);}}}>
    <span>{s.date.festival?<><Ic n="star"/> {fmtDate(s.date,false)}</>:s.date.day}</span>
    <span className="ht-mk">{m.nodes}</span></button>;
  };
  const fest=slots.slice(30);
  return <div>
   <div className="ht-calh"><h2>{monthName(v.month)} <span className="ht-hint">{v.year} CV</span></h2>
    <div className="ht-nav">
     <button type="button" className="ht-icon-btn" aria-label="Mês anterior" onClick={()=>move(-1)}><Ic n="left"/></button>
     <select aria-label="Mês" value={v.month} onChange={e=>setV({...v,month:Number(e.target.value)})}>
      {Array.from({length:12},(_,i)=><option key={i} value={i}>{monthName(i)}</option>)}</select>
     <input type="number" min={1} max={9999} aria-label="Ano em CV" value={v.year}
      onChange={e=>{const y=Number.parseInt(e.target.value,10);if(y>=1&&y<=9999)setV({...v,year:y});}}/>
     <button type="button" className="ht-icon-btn" aria-label="Próximo mês" onClick={()=>move(1)}><Ic n="right"/></button>
     <button type="button" className="ht-btn ht-btn--ghost ht-btn--sm" onClick={()=>setV(viewOf(calendar))}>Data oficial</button>
    </div></div>
   {[0,1,2].map(k=><div key={k}><p className="ht-dsl">{k+1}ª désdia</p>
    <div className="ht-cg">{slots.slice(k*10,k*10+10).map(cell)}</div></div>)}
   {fest.length>0&&<><p className="ht-dsl">Dias festivos</p><div className="ht-cg">{fest.map(cell)}</div></>}
   <div className="ht-legend">
    <span><i className="ht-lg-cur"/>Data oficial</span>
    {ctx==='pick'&&<><span><i className="ht-lg-sel"/>Nova abertura</span><span><i className="ht-lg-span"/>Período da nova semana</span></>}
    <span><i className="ht-sw ht-sw--fe"/>Festival</span><span><i className="ht-sw ht-sw--of"/>Oficial</span>
    <span><i className="ht-sw ht-sw--rg"/>Regional</span>{ctx==='ag'&&<span><i className="ht-sw ht-sw--ms"/>Missiva</span>}
    <span><i className="ht-sw ht-sw--of ht-sw--dr"/>Rascunho</span>
   </div>
  </div>;
 }
 const layerChip=(e:HubEvent)=><span className={'ht-lc '+(e.scope==='region'?'ht-lc--rg':'ht-lc--of')}>
  {e.scope==='region'?regionLabel(e.region):'Oficial'}</span>;
 const itEvent=(e:HubEvent)=><li key={'e'+e.id} className="ht-it">
  <i className={'ht-sw '+(e.scope==='region'?'ht-sw--rg':'ht-sw--of')+(e.pending&&!e.published?' ht-sw--dr':'')}/>
  <div className="ht-itb"><b>{e.title}</b><span>{e.scope==='region'?'Regional · '+regionLabel(e.region):'Oficial do Reino'} · {e.pending?(e.published?'publicado, com alteração em rascunho':'rascunho'):'publicado'}</span></div>
  <button type="button" className="ht-icon-btn" aria-label={'Editar '+e.title} onClick={()=>openEvent(e)}><Ic n="pen"/></button></li>;
 const itFest=(o:FestivalOccurrence)=><li key={'f'+o.festival.id+o.start} className="ht-it"><i className="ht-sw ht-sw--fe"/>
  <div className="ht-itb"><b>{o.festival.name}</b><span>Festival · {fmtRange(o.start,o.end)} · {regionLabel(o.festival.scope==='region'?o.festival.region:null)}{o.festival.description?' · '+o.festival.description:''}</span></div></li>;
 const itLetter=(l:HubLetter)=><li key={'m'+l.id}><button type="button" className="ht-it" onClick={()=>setModal({t:'letter',letter:l})}>
  <i className="ht-sw ht-sw--ms"/><div className="ht-itb"><b>{houseLabel(l.from)} → {houseLabel(l.to)}</b>
  <span>{l.subject||'Sem assunto'} · Semana {l.creationRound??'?'} · {l.state==='scheduled'?`agendada para a Semana ${l.deliveryRound}`:l.creationRound===openRound?'enviada, ainda editável':'entregue'}</span></div><Ic n="right"/></button></li>;

 /* ---------- Telas ---------- */
 function renderMesa(){
  const rounds=new Map<number,{date:HarptosDate;flash:boolean}>();
  for(const h of [...history].reverse())if(h.to&&h.toRound!==null&&!h.undone&&
   ['advance_week','launch_firebase_campaign','start_season','undo_advance'].includes(h.action))
   rounds.set(h.toRound,{date:h.to,flash:h.flashback===true});
  rounds.set(openRound,{date:calendar,flash:rounds.get(openRound)?.flash??false});
  const first=season?.startRound??null;
  const strip=[...rounds.entries()].filter(([r])=>r<=openRound&&(first===null||r>=first)).sort((a,b)=>a[0]-b[0]).slice(-6);
  const avisos:{k:'ht-w'|'ht-f'|'ht-e';i:string;t:string}[]=[];
  if(tooFarBack)avisos.push({k:'ht-e',i:'alert',t:HUB_ERRORS['flashback_too_far']??''});
  else if(flashback)avisos.push({k:'ht-w',i:'undo',t:`Volta no tempo: a data oficial recua de ${fmtDate(calendar)} para ${fmtDate(target)}. Nada é apagado; missivas e eventos continuam presos às suas semanas.`});
  else if(sameDay(target,calendar))avisos.push({k:'ht-w',i:'alert',t:'A nova semana começa na mesma data da semana atual.'});
  else if(tooFar)avisos.push({k:'ht-e',i:'alert',t:HUB_ERRORS['advance_too_far']??''});
  else if(salto>0)avisos.push({k:'ht-w',i:'alert',t:`Salto de ${salto} ${plural(salto,'dia','dias')} além da próxima désdia (${fmtDate(sug,sug.year!==calendar.year)}).`});
  if(!flashback&&monthsForward>0&&!tooFar)avisos.push({k:'ht-w',i:'alert',t:`Esta abertura vira ${plural(monthsForward,'o mês','os meses')}: obras e posses das Casas ativadas são processadas pelo motor de regras.`});
  newFest.forEach(o=>avisos.push({k:'ht-f',i:'star',t:`${o.festival.name} · ${fmtRange(o.start,o.end)}${o.festival.scope==='region'?' · '+regionLabel(o.festival.region):''} · ${o.festival.notify?'os jogadores recebem a bolinha em Calendário':'sem aviso aos jogadores'}`}));
  const pend:{t:string;action?:ReactNode}[]=[];
  if(rascunhos.length)pend.push({t:`${rascunhos.length} ${plural(rascunhos.length,'missiva em rascunho','missivas em rascunho')} na Semana ${openRound}; ${plural(rascunhos.length,'continua','continuam')} como rascunho.`});
  if(pendingHouseEffectMonths>0)pend.push({t:`Efeitos mensais das Casas pendentes: ${pendingHouseEffectMonths} ${plural(pendingHouseEffectMonths,'mês','meses')}.`,
   action:<button type="button" className="ht-btn ht-btn--sm" disabled={busy} onClick={()=>void processHouses()}>Processar</button>});
  if(hub?.settings.newspaperOneEditionPerWeek&&!hub.newspaper.thisWeek.length)pend.push({t:'A edição desta semana da Folha Sem Selo ainda não saiu.'});
  late.forEach(e=>pend.push({t:`Evento em rascunho com data já passada: ${e.title} (${fmtShort(parseDateKey(e.date)??calendar,calendar.year)}).`,
   action:<button type="button" className="ht-btn ht-btn--ghost ht-btn--sm" onClick={()=>openEvent(e)}>Resolver</button>}));
  const kpi=(icon:string,tone:string,n:number,one:string,many:string,sub:string,onClick:()=>void)=>
   <button type="button" className={'ht-kpi ht-kpi--'+tone} onClick={onClick}><span className="ht-ki"><Ic n={icon}/></span>
    <span><b className="ht-kn">{n}</b><span className="ht-kl">{plural(n,one,many)}</span><span className="ht-ks">{sub}</span></span>
    <span className="ht-kgo"><Ic n="right"/></span></button>;
  const go=(f:'trav'|'entr')=>{setFoco(f);setSel(null);goTab('agenda');};
  const blocked=tooFar||tooFarBack;
  return <>
   <div className="ht-weeks" aria-label="Semanas da temporada">
    {strip.map(([r,x])=><button type="button" key={r} className={'ht-wk'+(r===openRound?' ht-wk--on':'')}
     onClick={()=>{setHl(String(r));goTab('historico');}}>
     <b>Semana {r}</b><span>{fmtShort(x.date,calendar.year)}</span><em>{r===openRound?'aberta agora':x.flash?'encerrada · volta no tempo':'encerrada'}</em></button>)}
    <div className="ht-wk ht-wk--next"><b>Semana {openRound+1}</b><span>{fmtShort(target,calendar.year)}</span><em>próxima</em></div>
   </div>
   <section className="ht-trans" aria-label="Transição de semana">
    <div><span className="ht-lab">Agora</span><div className="ht-tw">Semana {openRound}</div>
     <div className="ht-td">{fmtDate(calendar)}</div><div className="ht-tr">{desdia(calendar)} · cobre {fmtRange(curPeriod.start,curPeriod.end)}</div></div>
    <div className="ht-arrow"><Ic n="arrow"/></div>
    <div className="ht-next"><span className="ht-lab">Próxima</span><div className="ht-tw">Semana {openRound+1}</div>
     <div className="ht-td ht-td--big">{fmtDate(target)}</div><div className="ht-tr">{desdia(target)} · cobre {fmtRange(period.start,period.end)}</div>
     <div className="ht-tact">
      <button type="button" className="ht-btn ht-btn--sm" aria-expanded={picker} onClick={()=>{setPicker(!picker);setPv(viewOf(target));}}>
       <Ic n="agenda"/>{picker?'Fechar calendário':'Alterar data'}</button>
      {!sameDay(target,sug)?<button type="button" className="ht-btn ht-btn--ghost ht-btn--sm" onClick={()=>{setTarget(sug);setExcl([]);}}>
       <Ic n="undo"/>Usar a próxima désdia: {fmtDate(sug,sug.year!==calendar.year)}</button>
       :<span className="ht-tag"><Ic n="check"/>Sugestão automática: início da {desdia(sug)}</span>}
     </div></div>
    {avisos.length>0&&<ul className="ht-avisos">{avisos.map((a,i)=><li key={i} className={a.k}><Ic n={a.i}/><span>{a.t}</span></li>)}</ul>}
    {picker&&<div className="ht-picker">{renderCalendar('pick')}
     {!sameDay(target,calendar)&&!blocked&&monthsForward<=3&&(target.year*12+target.month)>=(calendar.year*12+calendar.month)&&
      <p className="ht-hint" style={{marginTop:10}}>Só quer corrigir o dia, sem abrir semana?{' '}
       <button type="button" className="ht-btn ht-btn--ghost ht-btn--sm" onClick={()=>{setErr('');setModal({t:'date'});}}>Corrigir a data oficial</button></p>}
    </div>}
   </section>
   <div className="ht-kpis">
    {kpi('lock','lock',trav.length,'missiva será travada','missivas serão travadas',`enviadas na Semana ${openRound}`,()=>go('trav'))}
    {kpi('send','ok',entr.length,'missiva será entregue','missivas serão entregues',`agendadas para a Semana ${openRound+1}`,()=>go('entr'))}
    {kpi('agenda','gold',pub.length,'evento será publicado','eventos serão publicados',`de ${cand.length} em rascunho no período`,
     ()=>document.getElementById('ht-pub')?.scrollIntoView({behavior:'smooth',block:'start'}))}
   </div>
   <div className="ht-g2">
    <section className="ht-card" id="ht-pub"><div className="ht-head"><h2>Eventos da Semana {openRound+1}</h2>
     <button type="button" className="ht-btn ht-btn--sm" onClick={()=>openEvent()}><Ic n="plus"/>Novo evento</button></div>
     {cand.length?<><ul className="ht-list">{cand.map(e=>{const on=!excl.includes(e.id);const d=parseDateKey(e.date);return <li key={e.id} className="ht-row">
      <button type="button" role="checkbox" aria-checked={on} className="ht-chk"
       onClick={()=>setExcl(on?[...excl,e.id]:excl.filter(x=>x!==e.id))}>
       <span className="ht-box">{on&&<Ic n="check"/>}</span><span className="ht-et">{e.title}</span></button>
      {layerChip(e)}<span className="ht-dt">{d?fmtShort(d,target.year):''}</span>
      <button type="button" className="ht-icon-btn" aria-label={'Editar '+e.title} onClick={()=>openEvent(e)}><Ic n="pen"/></button></li>;})}</ul>
      <p className="ht-hint" style={{marginTop:8}}>Os marcados vão para o calendário oficial e o Jornal. Desmarque o que deve continuar em rascunho.</p></>
      :<p className="ht-empty">Nenhum evento em rascunho entre {fmtRange(period.start,period.end)}.</p>}
    </section>
    <div className="ht-stack">
     <section className="ht-card"><div className="ht-head"><h2>Pendências</h2><span className="ht-hint">não impedem a abertura</span></div>
      {pend.length?<ul className="ht-list ht-pend">{pend.map((p,i)=><li key={i}><Ic n="alert"/><span>{p.t}</span>{p.action}</li>)}</ul>
       :<p className="ht-empty ht-empty--ok"><Ic n="check"/>Nada pendente.</p>}
     </section>
     <section className="ht-card"><div className="ht-head"><h2>A Folha Sem Selo</h2>
      <a className="ht-btn ht-btn--ghost ht-btn--sm" {...urlLinkProps({hub:'ajustes'})}>Ajustes</a></div>
      <p>{hub?.newspaper.thisWeek.length?`${hub.newspaper.thisWeek.length} ${plural(hub.newspaper.thisWeek.length,'edição','edições')} nesta semana (Nº ${listPt(hub.newspaper.thisWeek.map(String))})`:'Nenhuma edição nesta semana'}</p>
      <p className="ht-hint">{hub?.settings.newspaperOneEditionPerWeek?'Limite ativo: uma edição por semana.':'Sem limite semanal; o Atlas só registra a numeração.'} Total: {hub?.newspaper.total??0} {plural(hub?.newspaper.total??0,'edição','edições')}.</p>
     </section>
    </div>
   </div>
   <section>{notaOpen?<div className="ht-fg"><label htmlFor="ht-nota">Nota para o histórico (opcional)</label>
    <input id="ht-nota" value={nota} maxLength={280} autoComplete="off" onChange={e=>setNota(e.target.value)}
     placeholder="Ex.: Início da 3ª désdia, após a sessão de sábado"/></div>
    :<button type="button" className="ht-btn ht-btn--ghost" onClick={()=>setNotaOpen(true)}><Ic n="plus"/>Adicionar nota ao histórico</button>}</section>
   <div className="ht-actionbar"><div className="ht-ab"><b>Semana {openRound} → Semana {openRound+1}</b><span>{fmtDate(target)} · {desdia(target)}</span></div>
    <button type="button" className="ht-gold" disabled={busy||blocked||!hub} onClick={()=>{setErr('');setModal({t:'confirm'});}}>
     <Ic n="play"/>Abrir Semana {openRound+1}</button></div>
  </>;
 }
 function renderAgenda(){
  const chips:readonly (readonly [Layer,string,string])[]=[['oficial','Oficiais','ht-sw--of'],['regional','Regionais','ht-sw--rg'],
   ['festival','Festivais','ht-sw--fe'],['missiva','Missivas','ht-sw--ms'],['rascunho','Rascunhos','ht-sw--of ht-sw--dr']];
  let list:ReactNode;
  if(foco){
   const items=foco==='trav'?trav:entr;
   list=<><div className="ht-focus"><Ic n="mail"/><span>{foco==='trav'?`Serão travadas: enviadas na Semana ${openRound}`:`Serão entregues na abertura da Semana ${openRound+1}`}</span>
    <button type="button" className="ht-btn ht-btn--ghost ht-btn--sm" onClick={()=>setFoco(null)}><Ic n="x"/>Limpar</button></div>
    {items.length?<ul className="ht-list">{items.map(itLetter)}</ul>:<p className="ht-empty">Nenhuma missiva.</p>}</>;
  }else{
   const ns=sel!==null?[sel]:monthSlots(cv.year,cv.month).map(s=>s.n);
   const firstN=ns[0]??0;
   const groups=ns.map(n=>{const {evs,fes,ms}=dayContent(n,'ag');
    const fs=sel!==null?fes:fes.filter(o=>o.start===n||n===firstN);
    return {n,items:[...fs.map(itFest),...evs.map(itEvent),...ms.map(itLetter)]};}).filter(g=>g.items.length);
   list=<><div className="ht-head"><h2>{sel!==null?fmtDate(fromAbsoluteDay(sel)):`${monthName(cv.month)} de ${cv.year} CV`}</h2>
    {sel!==null&&<button type="button" className="ht-btn ht-btn--ghost ht-btn--sm" onClick={()=>setSel(null)}>Ver o mês inteiro</button>}</div>
    {groups.length?groups.map(g=><div key={g.n}>{sel===null&&<p className="ht-gd">{fmtDate(fromAbsoluteDay(g.n),false)}</p>}
     <ul className="ht-list">{g.items}</ul></div>)
     :<p className="ht-empty">Nada neste período com as camadas escolhidas.</p>}</>;
  }
  const yearChronicles=chronicles.filter(c=>c.year<=cv.year&&(c.yearEnd??c.year)>=cv.year);
  return <>
   <div className="ht-filters"><div className="ht-filters" role="group" aria-label="Camadas visíveis">
    {chips.map(([k,l,c])=><button type="button" key={k} className="ht-fchip" aria-pressed={filt[k]}
     onClick={()=>setFilt({...filt,[k]:!filt[k]})}><i className={'ht-sw '+c}/>{l}</button>)}</div>
    <select aria-label="Região" value={reg} onChange={e=>setReg(e.target.value)}>
     <option value="">Todas as regiões</option>{HUB_REGIONS.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select>
    <button type="button" className="ht-gold ht-btn--sm" onClick={()=>openEvent(undefined,sel!==null?fromAbsoluteDay(sel):{year:cv.year,month:cv.month,day:1,festival:null})}>
     <Ic n="plus"/>Novo evento</button></div>
   <div className="ht-g2"><section className="ht-card">{renderCalendar('ag')}</section><section className="ht-card">{list}</section></div>
   {yearChronicles.length>0&&<section className="ht-card" aria-label={`Crônicas históricas de ${cv.year} CV`}>
    <div className="ht-head"><h2>Crônicas históricas de {cv.year} CV</h2><span className="ht-hint">{yearChronicles.length} {plural(yearChronicles.length,'registro','registros')}</span></div>
    <ul className="ht-list">{yearChronicles.map(c=><li key={c.id} className="ht-li"><div className="ht-li-b">
     <b>{c.yearEnd?`${c.year}–${c.yearEnd} CV · `:''}{c.title}</b>
     <span>{c.description}</span></div></li>)}</ul></section>}
  </>;
 }
 function renderFestivais(){
  const today=cur;
  const next=(f:HubFestival)=>{
   for(let y=calendar.year-1;y<=calendar.year+8;y++){const o=festivalsInRange([f],absoluteDay({year:y,month:0,day:1,festival:null}),absoluteDay({year:y+1,month:0,day:1,festival:null}))[0];
    if(o&&o.end>today)return 'Próxima: '+fmtRange(o.start,o.end);}
   if(f.repeat==='once'){const o=festivalsInRange([f],absoluteDay({year:f.date.year,month:0,day:1,festival:null}),absoluteDay({year:f.date.year+1,month:0,day:1,festival:null}))[0];
    if(o)return (o.end<=today?'Já aconteceu: ':'Próxima: ')+fmtRange(o.start,o.end);}
   return f.repeat==='yearly'&&f.date.year>calendar.year?`Começa em ${f.date.year} CV`:'Sem ocorrência próxima';
  };
  const card=(f:HubFestival)=>{
   const desc=f.fixed&&f.date.festival?fixedFestivalDescription(f.date.festival,f.description):f.description;
   return <li key={f.id} className="ht-li"><div className="ht-li-b"><b><Ic n="star"/>{f.name}</b>
    <span>{regionLabel(f.scope==='region'?f.region:null)} · {fmtDate(f.date,false)}{f.durationDays>1?` · ${f.durationDays} dias`:''} · {f.fixed?'todo ano':f.repeat==='yearly'?`todo ano desde ${f.date.year} CV`:`só em ${f.date.year} CV`}</span>
    <span className="ht-hint">{next(f)}{desc?' · '+desc:''}</span></div>
    <button type="button" className="ht-tg" role="switch" aria-checked={f.notify} disabled={busy} onClick={()=>void toggleFestival(f)}><i/>Avisar jogadores</button>
    {!f.fixed&&<button type="button" className="ht-icon-btn" aria-label={'Editar '+f.name} onClick={()=>openFestival(f)}><Ic n="pen"/></button>}</li>;
  };
  const fixedEntries=fixedFestivalEntries(hub?.fixedFestivalNotify??{});
  const waukeenEntries=canonicalObservances.filter(x=>x.id.startsWith('canon-waukeen-'));
  const seasonEntries=canonicalObservances.filter(x=>x.id.startsWith('canon-season-'));
  return <div className="ht-stack">
   <section className="ht-card"><div className="ht-head"><h2>Festivais cadastrados</h2>
    <button type="button" className="ht-gold ht-btn--sm" onClick={()=>openFestival()}><Ic n="plus"/>Cadastrar festival</button></div>
    {hub?.festivals.length?<ul className="ht-list">{hub.festivals.map(card)}</ul>:<p className="ht-empty">Nenhum festival cadastrado ainda.</p>}
    <p className="ht-hint" style={{marginTop:10}}>Quando a semana aberta inclui um festival com aviso ligado, as Casas do Reino (ou da região) veem uma bolinha em Calendário até abrirem a tela.</p></section>
   <section className="ht-card"><div className="ht-head"><h2>Dias festivos de Harptos</h2><span className="ht-hint">{fixedEntries.length} datas intercalares</span></div>
    <ul className="ht-list">{fixedEntries.map(card)}</ul></section>
   <details className="ht-card ht-details"><summary><h2>Festivais de Waukeen em Cormyr</h2><span className="ht-hint">{WAUKEEN_FESTIVALS.length} datas anuais · abrir</span></summary>
    <ul className="ht-list">{waukeenEntries.map(f=><li key={f.id} className="ht-li"><div className="ht-li-b">
     <b><Ic n="star"/>{f.name}</b>
     <span>Todo o Reino · {fmtDate(f.date,false)}{f.durationDays>1?` · ${f.durationDays} dias`:''} · todo ano</span>
     <span className="ht-hint">{next(f)}{f.description?' · '+f.description:''}</span></div></li>)}</ul></details>
   <details className="ht-card ht-details"><summary><h2>Ritos mensais de Tyr e estações</h2><span className="ht-hint">{TYR_OBSERVANCES.length} ritos mensais · {SEASON_MARKERS.length} estações · abrir</span></summary>
    <div className="ht-stack">
     <ul className="ht-list">{TYR_OBSERVANCES.map(t=><li key={t.day} className="ht-li"><div className="ht-li-b">
      <b><Ic n="star"/>{t.name}</b>
      <span>Todo o Reino · dia {t.day} de cada mês</span>
      {t.description&&<span className="ht-hint">{t.description}</span>}</div></li>)}</ul>
     <ul className="ht-list">{seasonEntries.map(s=><li key={s.id} className="ht-li"><div className="ht-li-b">
      <b><Ic n="star"/>{s.name}</b>
      <span>Todo o Reino · {fmtDate(s.date,false)} · todo ano</span>
      <span className="ht-hint">{next(s)}</span></div></li>)}</ul>
    </div></details></div>;
 }
 function renderTemporadas(){
  const seasons=[...(hub?.seasons??[])].sort((a,b)=>b.number-a.number);
  const nextNumber=Math.max(2,...seasons.map(s=>s.number))+1;
  return <div className="ht-g2">
   <section className="ht-card"><div className="ht-head"><h2>Temporadas</h2>
    <button type="button" className="ht-gold ht-btn--sm" onClick={openSeason}><Ic n="plus"/>Iniciar Temporada {nextNumber}</button></div>
    <ul className="ht-list">{seasons.map(s=><li key={s.number} className="ht-li"><div className="ht-li-b">
     <b><Ic n="flag"/>Temporada {s.number}{s.name?' · '+s.name:''}</b>
     <span>{s.startRound!==null?`Desde a Semana ${s.startRound}`:'Semanas anteriores ao Hub V2.1'}{s.endRound!==undefined?` até a Semana ${s.endRound}`:''}{s.startDate?` · começou em ${fmtDate(s.startDate)}`:''}</span></div>
     <span className={'ht-pill'+(s.status==='active'?' ht-pill--ok':'')}>{s.status==='active'?'ativa':'encerrada'}</span>
     {s.startDate&&<button type="button" className="ht-btn ht-btn--ghost ht-btn--sm" onClick={()=>{const d=s.startDate;if(d){setCv(viewOf(d));setSel(null);setFoco(null);}
      goTab('agenda');}}>Ver no calendário</button>}</li>)}</ul></section>
   <section className="ht-card"><div className="ht-head"><h2>Como o Hub guarda o tempo</h2></div><ul className="ht-explain">
    <li>A ordem das semanas nunca volta: a Semana {openRound} sempre vem depois da anterior, mesmo que a data no jogo recue.</li>
    <li>A data do jogo é livre: o Narrador pode voltar no tempo ou começar uma temporada em outra era (por exemplo, 1300 CV).</li>
    <li>Toda data é salva com ano, mês e dia (ou dia festivo). Um evento de 21 de Marpenoth de 1522 nunca aparece em 21 de Marpenoth de 1300.</li>
    <li>Missivas, eventos e edições ficam presos à semana em que aconteceram; mudar a data não apaga nada.</li>
    <li>Ao iniciar uma temporada, não há efeitos mensais das Casas nem viradas de idade dos personagens.</li></ul></section></div>;
 }
 function renderHistorico(){
  const label=(h:HistoryItem)=>h.action==='launch_firebase_campaign'?'Lançamento da campanha':h.action==='set_calendar_date'?'Correção da data':
   h.action==='undo_advance'?'Abertura desfeita':h.action==='start_season'?`Início da Temporada ${h.season?.number??''}`:`Abertura da Semana ${h.toRound??''}`;
  return <section className="ht-card"><div className="ht-head"><h2>Histórico de semanas</h2>
   <button type="button" className="ht-btn" disabled={busy||!hub?.undo.available} onClick={()=>{setErr('');setModal({t:'undo'});}}>
    <Ic n="undo"/>Desfazer a abertura da Semana {openRound}</button></div>
   <p className="ht-hint" style={{marginBottom:12}}>{hub?.undo.available?`Desfazer reabre a Semana ${openRound-1} e reverte exatamente o que a abertura fez. Sem prazo: vale enquanto for a última abertura.`
    :HUB_ERRORS[hub?.undo.reason??'']??'Nada para desfazer agora.'}</p>
   <ul className="ht-list">{history.map(h=><li key={h.id} className={'ht-li'+(hl!==null&&String(h.toRound)===hl?' ht-li--hl':'')}><div className="ht-li-b ht-hist">
    <b>{label(h)}{h.undone&&<span className="ht-pill">desfeita</span>}{h.flashback&&<span className="ht-pill ht-pill--warn">volta no tempo</span>}</b>
    <span>{h.to?fmtDate(h.to):''}{h.from&&h.to&&!sameDay(h.from,h.to)?` · antes: ${fmtDate(h.from)}`:''}{h.monthsCrossed?` · ${h.monthsCrossed} ${plural(h.monthsCrossed,'mês','meses')} das Casas`:''}</span>
    {h.reason&&<span className="ht-hint">“{h.reason}”</span>}
    <span className="ht-hint">{new Date(h.at).toLocaleString('pt-BR')}</span></div></li>)}</ul></section>;
 }
 function renderAjustes(){
  return <div className={tools?'ht-g2':'ht-stack'}><div className="ht-stack">
   <section className="ht-card"><div className="ht-head"><h2>Jornal · A Folha Sem Selo</h2></div>
    <label className="ht-check"><input type="checkbox" checked={hub?.settings.newspaperOneEditionPerWeek===true} disabled={busy||!hub}
     onChange={e=>void saveJournal(e.target.checked)}/>
     <span><b>Limitar a uma edição por semana</b><span>Marcado: o Editor-Chefe publica uma edição por semana. Desmarcado: publica quantas quiser, e o Atlas só registra a numeração.</span></span></label>
    <p className="ht-hint" style={{marginTop:8}}>Esta semana: {hub?.newspaper.thisWeek.length??0} {plural(hub?.newspaper.thisWeek.length??0,'edição','edições')}.</p></section>
   <section className="ht-card"><div className="ht-head"><h2>Eventos</h2></div>
    <button type="button" className="ht-btn" disabled={busy} onClick={()=>void run(async()=>{
     const r=await request<{published:number}>('publishEvents');
     return r.published?`${r.published} ${plural(r.published,'evento publicado','eventos publicados')} sem abrir semana.`:'Nenhum evento pendente de publicação.';})}>
     <Ic n="send"/>Publicar todos os rascunhos agora, sem abrir semana</button></section></div>
   {tools&&<section className="ht-card"><div className="ht-head"><h2>Ferramentas do Narrador</h2></div>{tools}</section>}</div>;
 }

 /* ---------- Modais ---------- */
 const set=(form:Form,k:string,v:string)=>setModal(m=>m&&'form' in m?{...m,form:{...form,[k]:v}}:m);
 const seg=(form:Form,k:string,opts:readonly (readonly [string,string])[])=><div className="ht-seg" role="radiogroup">
  {opts.map(([v,l])=><button type="button" key={v} role="radio" aria-checked={form[k]===v} onClick={()=>set(form,k,v)}>{l}</button>)}</div>;
 const dateFields=(form:Form,label:string)=>{
  const isF=(form['md']??'').startsWith('f:');
  const years=[...new Set([calendar.year,target.year,cv.year])];
  return <><div className="ht-fg"><label htmlFor="ht-f-year">{label} *</label><div className="ht-rowf">
   <input id="ht-f-year" type="number" inputMode="numeric" min={1} max={9999} value={form['year']??''} placeholder="ex.: 1522"
    onChange={e=>set(form,'year',e.target.value)}/><span className="ht-hint">CV</span>
   {years.map(y=><button type="button" key={y} className="ht-ychip" onClick={()=>set(form,'year',String(y))}>{y}{y===calendar.year?' (atual)':''}</button>)}</div></div>
  <div className="ht-fg2"><div className="ht-fg"><label htmlFor="ht-f-md">Mês ou dia festivo *</label>
   <select id="ht-f-md" value={form['md']??'m:0'} onChange={e=>set(form,'md',e.target.value)}>
    {Array.from({length:12},(_,i)=><optgroup key={i} label={monthName(i)}><option value={'m:'+i}>{monthName(i)}</option>
     {FIXED_FESTIVALS.filter(f=>f.month===i).map(f=><option key={f.id} value={'f:'+f.id}>✦ {f.name}{f.leapOnly?' (só bissexto)':''}</option>)}</optgroup>)}
   </select></div>
   <div className="ht-fg"><label htmlFor="ht-f-day">Dia</label><select id="ht-f-day" disabled={isF} value={form['day']??'1'} onChange={e=>set(form,'day',e.target.value)}>
    {Array.from({length:30},(_,i)=><option key={i} value={String(i+1)}>{i+1}</option>)}</select></div></div></>;
 };
 const regionField=(form:Form)=>form['scope']==='region'&&<div className="ht-fg"><label htmlFor="ht-f-reg">Região *</label>
  <select id="ht-f-reg" value={form['region']??'1'} onChange={e=>set(form,'region',e.target.value)}>
   {HUB_REGIONS.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></div>;
 const actions=(primary:ReactNode,extra?:ReactNode)=><div className="ht-dact">{extra}<span className="ht-sp"/>
  <button type="button" className="ht-btn" onClick={()=>setModal(null)}>Cancelar</button>{primary}</div>;
 function renderModal(m:Modal){
  if(m.t==='confirm'){
   const notify=newFest.filter(o=>o.festival.notify);
   return <><h2 id="ht-dlg-t">Abrir a Semana {openRound+1}?</h2><p className="ht-sub">{fmtDate(target)} · {desdia(target)}</p>
    <ul className="ht-imp">
     <li className="ht-l"><Ic n="lock"/><span><b>{trav.length}</b> {plural(trav.length,'missiva enviada','missivas enviadas')} na Semana {openRound} {plural(trav.length,'fica travada','ficam travadas')}</span></li>
     <li className="ht-o"><Ic n="send"/><span><b>{entr.length}</b> {plural(entr.length,'missiva é entregue','missivas são entregues')} às Casas</span></li>
     <li className="ht-g"><Ic n="agenda"/><span><b>{pub.length}</b> {plural(pub.length,'evento é publicado','eventos são publicados')} no calendário e no Jornal</span></li>
     {notify.length>0&&<li className="ht-g"><Ic n="star"/><span>Festival na semana: {listPt(notify.map(o=>o.festival.name))}. Os jogadores serão avisados.</span></li>}
     {monthsForward>0&&!flashback&&<li className="ht-w"><Ic n="alert"/><span>Vira {plural(monthsForward,'o mês','os meses')}: obras e posses das Casas ativadas serão processadas pelo motor de regras.</span></li>}
     {flashback&&<li className="ht-w"><Ic n="undo"/><span>Volta no tempo para {fmtDate(target)}. Efeitos já realizados não são desfeitos.</span></li>}
    </ul>{nota.trim()&&<p className="ht-hint">Nota: “{nota.trim()}”</p>}
    {actions(<button type="button" className="ht-gold" disabled={busy} onClick={()=>void doAdvance()}><Ic n="check"/>{busy?'Abrindo…':'Abrir e publicar'}</button>)}</>;
  }
  if(m.t==='date')return <><h2 id="ht-dlg-t">Corrigir a data oficial?</h2>
   <p className="ht-sub">De {fmtDate(calendar)} para {fmtDate(target)}, sem abrir semana: a Semana {openRound} continua aberta e nenhuma missiva é entregue.</p>
   {flashback&&<ul className="ht-imp"><li className="ht-w"><Ic n="undo"/><span>Correção para um dia anterior do mesmo mês. Efeitos já realizados não são desfeitos.</span></li></ul>}
   {monthsForward>0&&<ul className="ht-imp"><li className="ht-w"><Ic n="alert"/><span>Vira o mês: os efeitos mensais das Casas serão processados.</span></li></ul>}
   {actions(<button type="button" className="ht-gold" disabled={busy} onClick={()=>void doChangeDate()}><Ic n="check"/>Corrigir data</button>)}</>;
  if(m.t==='undo')return <><h2 id="ht-dlg-t">Desfazer a abertura da Semana {openRound}?</h2>
   <p className="ht-sub">A Semana {openRound-1} volta a ficar aberta, na data anterior.</p>
   <ul className="ht-imp"><li className="ht-o"><Ic n="lock"/><span>As missivas da Semana {openRound-1} voltam a ser editáveis.</span></li>
    <li className="ht-w"><Ic n="send"/><span>As missivas entregues nesta abertura voltam para agendadas; quem já leu deixa de ver até a nova abertura.</span></li>
    <li className="ht-g"><Ic n="agenda"/><span>Os eventos publicados nesta abertura voltam para rascunho.</span></li></ul>
   {actions(<button type="button" className="ht-gold" disabled={busy} onClick={()=>void doUndo()}><Ic n="undo"/>Desfazer</button>)}</>;
  if(m.t==='letter'){const l=m.letter;
   return <><h2 id="ht-dlg-t">{l.subject||'Missiva'}</h2><dl className="ht-dl">
    <dt>De</dt><dd>{houseLabel(l.from)}</dd><dt>Para</dt><dd>{houseLabel(l.to)}</dd>
    <dt>Data no jogo</dt><dd>{(()=>{const d=parseDateKey(l.date);return d?fmtDate(d):l.date;})()}</dd>
    <dt>Semana</dt><dd>{l.creationRound??'?'}{l.state==='scheduled'?` (entrega na Semana ${l.deliveryRound})`:''}</dd></dl>
    <div className="ht-dact"><span className="ht-hint">Abre a Chancelaria nesta missiva, em nova aba.</span><span className="ht-sp"/>
     <button type="button" className="ht-btn" onClick={()=>setModal(null)}>Fechar</button>
     <a className="ht-gold" target="_blank" rel="noopener" href={hrefWithParams({secao:'missivas',pasta:'all',carta:l.id},['hub','aba','casa'])}><Ic n="ext"/>Abrir na Chancelaria</a></div></>;}
  if(m.t==='event'){const f=m.form;
   return <><h2 id="ht-dlg-t">{f['id']?'Editar evento':'Novo evento'}</h2>
    <div className="ht-fg"><label htmlFor="ht-f-title">Título *</label><input id="ht-f-title" maxLength={200} autoComplete="off"
     value={f['title']??''} onChange={e=>set(f,'title',e.target.value)}/></div>
    <div className="ht-fg"><span className="ht-lab">Camada *</span>{seg(f,'scope',[['kingdom','Oficial do Reino'],['region','Regional']])}</div>
    {regionField(f)}
    {dateFields(f,'Em que ano o evento acontece?')}
    <p className="ht-hint">O evento só aparece no ano informado; a mesma data em outro ano continua vazia.</p>
    <div className="ht-fg"><label htmlFor="ht-f-desc">Descrição</label><textarea id="ht-f-desc" maxLength={5000}
     value={f['description']??''} onChange={e=>set(f,'description',e.target.value)}/></div>
    <div className="ht-fg"><label className="ht-check"><input type="checkbox"
     checked={f['public']==='1'} onChange={e=>set(f,'public',e.target.checked?'1':'0')}/>
     <span><b>Exibir no calendário público do Reino</b><span>Permite que visitantes, jogadores, Editor-Chefe e Narrador leiam este evento após sua publicação. Desmarcado: permanece apenas nos calendários autenticados autorizados.</span></span></label></div>
    <div className="ht-fg"><span className="ht-lab">Situação</span>{seg(f,'publish',[['0','Rascunho'],['1','Publicar agora']])}</div>
    {actions(<button type="button" className="ht-gold" disabled={busy} onClick={()=>void saveEvent(f)}>Salvar evento</button>,
     f['id']?<button type="button" className="ht-btn ht-btn--danger" disabled={busy} onClick={()=>void saveEvent(f,true)}><Ic n="trash"/>Excluir</button>:null)}</>;}
  if(m.t==='festival'){const f=m.form;
   return <><h2 id="ht-dlg-t">{f['id']?'Editar festival':'Cadastrar festival'}</h2>
    <div className="ht-fg"><label htmlFor="ht-f-name">Nome *</label><input id="ht-f-name" maxLength={120} autoComplete="off"
     value={f['name']??''} onChange={e=>set(f,'name',e.target.value)}/></div>
    <div className="ht-fg"><span className="ht-lab">Alcance *</span>{seg(f,'scope',[['kingdom','Todo o Reino'],['region','Regional']])}</div>
    {regionField(f)}
    <div className="ht-fg"><span className="ht-lab">Repetição *</span>{seg(f,'repeat',[['once','Só neste ano'],['yearly','Todo ano']])}</div>
    {dateFields(f,f['repeat']==='yearly'?'A partir de que ano?':'Em que ano?')}
    <div className="ht-fg2"><div className="ht-fg"><label htmlFor="ht-f-dur">Duração (dias)</label><input id="ht-f-dur" type="number" min={1} max={30}
     value={f['duration']??'1'} onChange={e=>set(f,'duration',e.target.value)}/></div>
     <div className="ht-fg"><span className="ht-lab">Aviso</span><button type="button" className="ht-tg" role="switch" aria-checked={f['notify']!=='0'}
      onClick={()=>set(f,'notify',f['notify']==='0'?'1':'0')}><i/>Avisar jogadores</button></div></div>
    <div className="ht-fg"><label className="ht-check"><input type="checkbox"
     checked={f['public']==='1'} onChange={e=>set(f,'public',e.target.checked?'1':'0')}/>
     <span><b>Exibir festival no calendário público</b><span>Requer autorização explícita; desmarcado permanece somente nas visões autenticadas autorizadas.</span></span></label></div>
    <div className="ht-fg"><label htmlFor="ht-f-fdesc">Descrição</label><textarea id="ht-f-fdesc" maxLength={600}
     value={f['description']??''} onChange={e=>set(f,'description',e.target.value)}/></div>
    {actions(<button type="button" className="ht-gold" disabled={busy} onClick={()=>void saveFestival(f)}>Salvar festival</button>,
     f['id']?<button type="button" className="ht-btn ht-btn--danger" disabled={busy} onClick={()=>void run(async()=>{
      await request('deleteFestival',{id:f['id'],version:Number(f['version'])});return 'Festival excluído.';})}><Ic n="trash"/>Excluir</button>:null)}</>;}
  const f=m.form;const number=Math.max(2,...(hub?.seasons??[]).map(s=>s.number))+1;
  return <><h2 id="ht-dlg-t">Iniciar Temporada {number}</h2>
   <div className="ht-fg"><label htmlFor="ht-f-sname">Nome (opcional)</label><input id="ht-f-sname" maxLength={80} autoComplete="off"
    value={f['name']??''} onChange={e=>set(f,'name',e.target.value)} placeholder="Ex.: A Era dos Reis Antigos"/></div>
   {dateFields(f,'Em que ano a temporada começa?')}
   <ul className="ht-imp"><li className="ht-w"><Ic n="flag"/><span>A Semana {openRound} fecha como numa virada normal: {trav.length} travadas e {entr.length} entregues; a Semana {openRound+1} abre na nova data.</span></li>
    <li className="ht-g"><Ic n="history"/><span>A Temporada {number-1} fica encerrada e consultável; nada é apagado. Sem efeitos mensais das Casas.</span></li></ul>
   {actions(<button type="button" className="ht-gold" disabled={busy} onClick={()=>void saveSeason(f)}><Ic n="flag"/>Iniciar temporada</button>)}</>;
 }
 useEffect(()=>{
  if(!modal)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setModal(null);};
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
 },[modal]);

 const body=tab==='agenda'?renderAgenda():tab==='festivais'?renderFestivais():tab==='temporadas'?renderTemporadas():
  tab==='historico'?renderHistorico():tab==='ajustes'?renderAjustes():renderMesa();
 return <div className="ht">
  <header><h1>Hub Temporal</h1><p className="ht-sub">Temporada {season?.number??2}{season?.name?': '+season.name:''} · Semana {openRound} aberta · {fmtDate(calendar)}</p></header>
  <nav className="ht-tabs" role="tablist" aria-label="Seções do Hub">
   {TABS.map(([id,l,i])=><a key={id} role="tab" className="ht-tab" aria-selected={tab===id}
    {...urlLinkProps({hub:id==='mesa'?null:id},{onNavigate:()=>setMessage('')})}><Ic n={i}/>{l}</a>)}</nav>
  {message&&<p role="status" className="ht-status">{message}</p>}
  {loadError&&<p role="alert" className="ht-err">{loadError} <button type="button" className="ht-btn ht-btn--sm" onClick={()=>void load()}>Tentar de novo</button></p>}
  {!hub&&!loadError?<p role="status" className="ht-hint">Carregando o Hub…</p>:body}
  {modal&&<div className="ht-ov" onClick={e=>{if(e.target===e.currentTarget)setModal(null);}}>
   <div className="ht-dlg" role="dialog" aria-modal="true" aria-labelledby="ht-dlg-t">{renderModal(modal)}
    {err&&<p role="alert" className="ht-err">{err}</p>}</div></div>}
 </div>;
}
