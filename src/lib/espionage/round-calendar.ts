/** CCA-ESP-MVP-001 · Regra confirmada pelo Narrador:
 * UMA rodada de espionagem = UMA désdia = DEZ dias ordinários de Harptos.
 *
 * Festivais (incluindo Shieldmeet) são intercalares e não consomem esses dias.
 * A fonte do marco inicial é sempre o Hub Temporal publicado, nunca Date,
 * o relógio do dispositivo ou a rodada de missivas (published_week).
 *
 * Projeções são SOMENTE LEITURA. Nenhuma missão é iniciada e nenhum avanço
 * do calendário é publicado aqui. A execução usa o consumidor durável.
 */
import {dateKey,type CampaignDate} from '@/lib/calendar/harptos';
import {advanceHarptosDesdia,listCrossedHarptosPeriods} from '@/lib/calendar/temporal-engine';
import type {SpyRegionalPlan} from './region-turns';

export const SPY_DAYS_PER_ROUND=10 as const;
type ReadyPlan=Extract<SpyRegionalPlan,{status:'ready'}>;
export type SpyHarptosLeg={
 fromRegion:string;toRegion:string;passage:'land_neighbor'|'sea_passage';
 edgeId:string;edgeVersion:number;rounds:1;ordinaryDays:10;
 departureDateKey:string;arrivalDateKey:string;
};
export type SpyHarptosSchedule={
 source:'published_campaign_calendar';calendarVersion:number;
 officialDateKey:string;startRegion:string;destinationRegion:string;
 travelRounds:number;missionRounds:1;totalRounds:number;
 ordinaryDaysToConclusion:number;
 travelLegs:SpyHarptosLeg[];
 arrivesAtTargetDateKey:string;
 investigationStartsDateKey:string;
 investigationEndsDateKey:string;
 returnLegs:SpyHarptosLeg[]|null;
 returnRounds:number|null;totalWithReturnRounds:number|null;
 returnArrivalDateKey:string|null;
 ordinaryDaysWithReturn:number|null;
 crossedFestivalsUntilConclusion:{date:string;festivalId:string;name:string}[];
};

export function projectSpyHarptosSchedule(
 input:{plan:ReadyPlan;officialDate:CampaignDate|string;calendarVersion:number},
):SpyHarptosSchedule{
 const {plan,officialDate,calendarVersion}=input;
 if(!Number.isSafeInteger(calendarVersion)||calendarVersion<0)
  throw new Error('Versão oficial do calendário de Harptos inválida.');
 // Validates festival/year/month/day through the shared calendar engine.
 const officialDateKey=typeof officialDate==='string'
  ?dateKey(advanceHarptosDesdia(officialDate,0))
  :dateKey(advanceHarptosDesdia(officialDate,0));
 let cursor=officialDateKey;
 const travelLegs:SpyHarptosLeg[]=plan.legs.map(leg=>{
  const departureDateKey=cursor;
  cursor=dateKey(advanceHarptosDesdia(cursor,leg.rounds));
  return {fromRegion:leg.fromRegion,toRegion:leg.toRegion,
   passage:leg.passage,edgeId:leg.connectionId,edgeVersion:leg.version,
   rounds:1 as const,ordinaryDays:SPY_DAYS_PER_ROUND,
   departureDateKey,arrivalDateKey:cursor};
 });
 if(travelLegs.length!==plan.travelRounds||plan.totalRounds!==plan.travelRounds+1)
  throw new Error('O plano contém quantidades de rodadas inconsistentes.');
 const arrivesAtTargetDateKey=cursor;
 const investigationStartsDateKey=cursor;
 cursor=dateKey(advanceHarptosDesdia(cursor,1));
 const investigationEndsDateKey=cursor;
 const returnLegs=plan.returnLegs?.map(leg=>{
  const departureDateKey=cursor;
  cursor=dateKey(advanceHarptosDesdia(cursor,leg.rounds));
  return {fromRegion:leg.fromRegion,toRegion:leg.toRegion,
   passage:leg.passage,edgeId:leg.connectionId,edgeVersion:leg.version,
   rounds:1 as const,ordinaryDays:SPY_DAYS_PER_ROUND,
   departureDateKey,arrivalDateKey:cursor};
 })??null;
 if((returnLegs?.length??null)!==plan.returnRounds||
   (plan.returnRounds!==null&&plan.totalWithReturnRounds!==plan.totalRounds+plan.returnRounds))
  throw new Error('Retorno regional com duração não homologada ou inconsistente.');
 return {
  source:'published_campaign_calendar',calendarVersion,officialDateKey,
  startRegion:plan.startRegion,destinationRegion:plan.destinationRegion,
  travelRounds:plan.travelRounds,missionRounds:1,totalRounds:plan.totalRounds,
  ordinaryDaysToConclusion:plan.totalRounds*SPY_DAYS_PER_ROUND,
  travelLegs,arrivesAtTargetDateKey,
  investigationStartsDateKey,investigationEndsDateKey,
  returnLegs,returnRounds:plan.returnRounds,
  totalWithReturnRounds:plan.totalWithReturnRounds,
  returnArrivalDateKey:returnLegs?cursor:null,
  ordinaryDaysWithReturn:plan.totalWithReturnRounds===null?null:
   plan.totalWithReturnRounds*SPY_DAYS_PER_ROUND,
  crossedFestivalsUntilConclusion:listCrossedHarptosPeriods(
   officialDateKey,investigationEndsDateKey).crossedFestivals,
 };
}
