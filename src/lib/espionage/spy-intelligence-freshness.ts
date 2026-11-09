import {parseDate} from '@/lib/calendar/harptos';
import {listCrossedHarptosPeriods} from '@/lib/calendar/temporal-engine';
import type {SpyDossier} from './spy-dossier.functions';

export type SpyFreshness='recent'|'review'|'old'|'future'|'unknown';
/** Indicador informativo. Não representa confirmação do estado ATUAL da Casa. */
export function spyIntelligenceFreshness(verifiedDate:string,officialDate:string|null):{
 tier:SpyFreshness;days:number|null;label:string;
}{
 if(!officialDate||!parseDate(verifiedDate)||!parseDate(officialDate))
  return {tier:'unknown',days:null,label:'Data de verificação indisponível'};
 const days=listCrossedHarptosPeriods(verifiedDate,officialDate).ordinaryDaysElapsed;
 if(days<0)return {tier:'future',days,label:'Verificação posterior ao HUB atual'};
 if(days<=30)return {tier:'recent',days,
  label:days===0?'Confirmado na data atual do HUB':'Confirmado há '+days+' dias de campanha'};
 if(days<=90)return {tier:'review',days,
  label:'Verificação antiga: '+days+' dias de campanha'};
 return {tier:'old',days,
  label:'Histórico: '+days+' dias de campanha sem revalidação'};
}
export function spyDossierLastVerified(dossier:SpyDossier):string|null{
 const dates=dossier.findings.map(f=>f.verifiedDate)
  .filter(x=>Boolean(parseDate(x)));
 if(!dates.length)return null;
 // Harptos ISO-like date keys precisam de ordem cronológica real.
 return dates.reduce((latest,date)=>
  listCrossedHarptosPeriods(latest,date).direction==='forward'?date:latest);
}
