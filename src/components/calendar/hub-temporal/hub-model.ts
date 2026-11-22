/**
 * Modelo de tela do Hub Temporal V2.1: tipos das respostas do servidor e
 * formatação em português. As regras de data vêm do núcleo compartilhado
 * com o servidor (scripts/firebase/hub-temporal-core.mjs).
 */
import {MONTHS} from '@/lib/calendar/harptos';
import {absoluteDay,fromAbsoluteDay,nextTendayStart,weekPeriod,parseDateKey,dateKeyOf,
  festivalsInRange,fixedFestivalEntries,FIXED_FESTIVALS,HUB_REGIONS,dayOfYear,
  type HarptosDate,type HubFestival,type FestivalOccurrence} from '../../../../scripts/firebase/hub-temporal-core.mjs';

export {absoluteDay,fromAbsoluteDay,nextTendayStart,weekPeriod,parseDateKey,dateKeyOf,
  festivalsInRange,fixedFestivalEntries,FIXED_FESTIVALS,HUB_REGIONS,dayOfYear};
export type {HarptosDate,HubFestival,FestivalOccurrence};

export type OfficialDate=HarptosDate&{version:number};
export type HubSeason={number:number;name:string;startRound:number|null;
  startDate:HarptosDate|null;status:'active'|'closed';endRound?:number};
export type HubLetter={id:string;from:string|null;to:string|null;subject:string;date:string;
  creationRound:number|null;deliveryRound:number|null;state:'draft'|'scheduled'|'delivered'};
export type HubData={openRound:number;seasons:HubSeason[];
  settings:{newspaperOneEditionPerWeek:boolean};fixedFestivalNotify:Record<string,boolean>;
  festivals:HubFestival[];letters:HubLetter[];newspaper:{total:number;thisWeek:number[]};
  undo:{available:boolean;reason?:string}};
export type HubEvent={id:string;version:number;date:string;title:string;description:string;
  deleted:boolean;published:boolean;pending:boolean;public?:boolean;scope:'kingdom'|'region';region:string|null};
export type HistoryItem={id:string;action:string;at:string;from:HarptosDate|null;to:HarptosDate|null;
  fromRound:number|null;toRound:number|null;monthsCrossed:number;reason:string|null;
  flashback?:boolean;undone?:boolean;season?:{number:number;name:string}|null};
/** Chamada autenticada ao endpoint do Hub (definida em FirebaseNarratorWeekDraft). */
export type HubRequest=<T>(action:string,fields?:Record<string,unknown>)=>Promise<T>;

export const monthName=(m:number)=>MONTHS[m]??'';
export const festivalName=(id:string|null)=>FIXED_FESTIVALS.find(f=>f.id===id)?.name??'Dia festivo';
export const plural=(n:number,one:string,many:string)=>n===1?one:many;
export const listPt=(items:string[])=>items.length<2?items.join(''):
  items.slice(0,-1).join(', ')+' e '+items[items.length-1];

export function fmtDate(d:HarptosDate,withYear=true):string{
  if(d.festival)return withYear?`${festivalName(d.festival)}, ${d.year} CV`:festivalName(d.festival);
  return withYear?`${d.day} de ${monthName(d.month)} de ${d.year} CV`:`${d.day} de ${monthName(d.month)}`;
}
export function fmtShort(d:HarptosDate,refYear?:number):string{
  const base=d.festival?festivalName(d.festival):`${d.day} ${monthName(d.month).slice(0,3)}`;
  return refYear!==undefined&&refYear!==d.year?`${base} ${d.year}`:base;
}
export function desdia(d:HarptosDate):string{
  if(d.festival)return 'dia festivo';
  return d.day<=10?'1ª désdia':d.day<=20?'2ª désdia':'3ª désdia';
}
/** Período [start,end) em texto, sem repetir mês e ano quando iguais. */
export function fmtRange(start:number,end:number):string{
  const a=fromAbsoluteDay(start),b=fromAbsoluteDay(end-1);
  if(end-start<=1)return fmtDate(a);
  if(a.year===b.year){
    if(!a.festival&&!b.festival&&a.month===b.month)
      return `${a.day} a ${b.day} de ${monthName(a.month)} de ${a.year} CV`;
    return `${fmtDate(a,false)} a ${fmtDate(b,false)} de ${a.year} CV`;
  }
  return `${fmtDate(a)} a ${fmtDate(b)}`;
}
export const regionLabel=(id:string|null)=>HUB_REGIONS.find(r=>r.id===id)?.label??'Todo o Reino';
export const houseLabel=(id:string|null)=>!id?'?':id==='narrador'?'Narrador':
  id.split(/[-_]/).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
export const keyAbs=(key:string)=>{const d=parseDateKey(key);return d?absoluteDay(d):null;};
/** Dias do mês (1..30) e dias festivos que vêm depois dele, com o número absoluto. */
export function monthSlots(year:number,month:number):{date:HarptosDate;n:number}[]{
  const out:{date:HarptosDate;n:number}[]=[];
  for(let day=1;day<=30;day++){const date={year,month,day,festival:null};out.push({date,n:absoluteDay(date)});}
  for(const f of FIXED_FESTIVALS){
    if(f.month!==month)continue;
    const date={year,month,day:30,festival:f.id};
    if(dayOfYear(date))out.push({date,n:absoluteDay(date)});
  }
  return out;
}
export const viewOf=(d:HarptosDate)=>({year:d.year,month:d.month});
export function newKey():string{
  return typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'
    ?crypto.randomUUID().replace(/-/g,''):'k'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
}
/** Mensagens das recusas do servidor, em português. */
export const HUB_ERRORS:Record<string,string>={
  undo_new_week_has_mail:'Não dá para desfazer: já há missivas enviadas na nova semana.',
  undo_house_effects_applied:'Não dá para desfazer: esta abertura virou o mês ou o ano e já processou a economia das Casas.',
  undo_calendar_changed:'Não dá para desfazer: a data oficial mudou depois desta abertura.',
  undo_events_changed:'Não dá para desfazer: um evento publicado nesta abertura foi editado depois.',
  no_hub_opening:'Não há abertura feita pelo Hub para desfazer.',
  advance_backdate_forbidden:'Confirme a volta no tempo para abrir a semana numa data anterior.',
  flashback_too_far:'A volta no tempo passa de 50 anos. Para mudar de era, inicie uma nova temporada.',
  advance_too_far:'O salto passa de 3 meses. Abra a semana em etapas ou inicie uma nova temporada.',
  house_effects_acknowledgement_required:'Esta abertura vira o mês: confirme o processamento das Casas.',
  festival_version_conflict:'O festival mudou em outra aba. Atualize antes de salvar.',
  festival_not_found:'O festival não existe mais.',
  invalid_festival:'Revise nome, região, data e duração do festival.',
  invalid_settings:'Ajuste inválido.',
  campaign_not_launched:'A campanha ainda não foi publicada no Firebase.',
  calendar_version_conflict:'O calendário mudou em outra aba. Atualize o Hub.',
  draft_date_invalid:'Data inválida no calendário de Harptos.',
  draft_reason_invalid:'A nota precisa ter entre 12 e 300 caracteres.',
  date_backdate_acknowledgement_required:'Confirme a correção para um dia anterior.',
  historical_month_reversal_forbidden:'A correção de data não volta a um mês anterior. Use a abertura com volta no tempo.',
  date_unchanged:'A data escolhida já é a data oficial.',
};
