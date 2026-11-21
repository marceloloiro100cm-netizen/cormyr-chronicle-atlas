import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {workspaceRequest} from '@/lib/firebase-workspace/client';
import {parseDateKey,fmtDate,listPt,regionLabel} from './hub-model';

export type WeekFestival={id:string;name:string;start:string;end:string;scope:string;region:string|null};
type WeekFestivals={round:number|null;festivals:WeekFestival[]};

const seenKey=(userId:string,round:number)=>`atlas.hub.festival-seen:${userId}:${round}`;
const readSeen=(key:string)=>{try{return typeof window!=='undefined'&&window.localStorage.getItem(key)==='1';}catch{return false;}};

/**
 * Festivais com aviso ligado na semana aberta (Hub Temporal V2.1), para a
 * bolinha dos jogadores. A bolinha some quando o jogador abre o Calendário e
 * volta na semana seguinte se houver outro festival. A lista vem filtrada
 * pelo servidor (Reino ou a região da Casa).
 */
export function useWeekFestivals(enabled:boolean,userId:string){
 const query=useQuery({queryKey:['hub-week-festivals',userId],enabled,staleTime:60_000,refetchInterval:120_000,retry:1,
  queryFn:async():Promise<WeekFestivals>=>{
   const r=await workspaceRequest({kind:'rpc',name:'get_campaign_week_festivals',args:{}}) as unknown;
   if(!r||typeof r!=='object'||!Array.isArray((r as WeekFestivals).festivals))return {round:null,festivals:[]};
   return r as WeekFestivals;
  }});
 const round=query.data?.round??null;
 const festivals=query.data?.festivals??[];
 const key=round===null?'':seenKey(userId,round);
 const [seen,setSeen]=useState(false);
 useEffect(()=>{setSeen(key?readSeen(key):false);},[key]);
 const markSeen=()=>{
  if(!key||seen)return;
  try{window.localStorage.setItem(key,'1');}catch{/* navegação privada: a bolinha volta depois */}
  setSeen(true);
 };
 return {festivals,unseen:festivals.length>0&&!seen,markSeen};
}

export function WeekFestivalBanner({festivals}:{festivals:WeekFestival[]}){
 if(!festivals.length)return null;
 const when=(f:WeekFestival)=>{
  const a=parseDateKey(f.start),b=parseDateKey(f.end);
  if(!a)return '';
  return b&&f.end!==f.start?`${fmtDate(a,false)} a ${fmtDate(b)}`:fmtDate(a);
 };
 return <aside role="status" style={{display:'flex',gap:12,alignItems:'center',padding:'12px 16px',margin:'0 0 18px',
  borderRadius:10,border:'1px solid var(--campaign-gold)',background:'var(--campaign-light)'}}>
  <span aria-hidden="true" style={{fontSize:20,color:'var(--campaign-gold)'}}>✦</span>
  <span><b style={{fontFamily:'Georgia,serif',color:'var(--campaign-purple)'}}>Festival nesta semana</b><br/>
   {listPt(festivals.map(f=>`${f.name} (${when(f)}${f.scope==='region'?' · '+regionLabel(f.region):''})`))}</span>
 </aside>;
}
