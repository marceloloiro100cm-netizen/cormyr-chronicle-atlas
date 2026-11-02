import {describe,it,expect} from 'vitest';
import {dateKey} from '@/lib/calendar/harptos';
import {fromHarptosOrdinal,getHarptosOrdinal} from '@/lib/calendar/temporal-engine';
import {emptySpyRouteRegistry,upsertSpyLocation,upsertSpyTravelEdge} from '@/lib/espionage/routes';
import {planSpyItinerary,getTravelTransitionsUntilPublishedDate,replanSpyItinerary} from '@/lib/espionage/travel';
const ids=Array.from({length:12},(_,i)=>{const h=(i+1).toString(16);return h.repeat(8)+'-'+h.repeat(4)+'-4'+h.repeat(3)+'-8'+h.repeat(3)+'-'+h.repeat(12);});
const gm={isNarrator:true as const,actorId:'gm',justification:'Trajeto aprovado no mapa da campanha'};
const location=(i:number)=>({id:ids[i]!,kind:'region' as const,refId:'r'+i,name:'R'+i,regionId:'r'+i,visibility:'public' as const,approved:true,version:1,source:'Mapa do Narrador'});
function registry(){
 let g=emptySpyRouteRegistry();
 for(let i=0;i<3;i++)g=upsertSpyLocation(g,location(i),gm,g.version);
 for(const [i,a,b,days] of ([[3,0,1,1],[4,1,2,2],[5,2,0,1]] as const)){
  g=upsertSpyTravelEdge(g,{id:ids[i]!,fromLocationId:ids[a]!,toLocationId:ids[b]!,baseDays:days,mode:'horse',
   bidirectional:false,blocked:false,approved:true,version:1,source:'Mapa do Narrador',
   approvedByNarratorId:'gm',approvalReason:'Duração aprovada pelo Narrador'},gm,g.version);
 }
 return g;
}
describe('Espionagem · Lote 4 calendário',()=>{
 it('conta Midsummer e Shieldmeet ao atravessar 1524, não dias gregorianos',()=>{
  const g=registry();
  const p=planSpyItinerary(g,{operationId:ids[6]!,waypoints:[ids[0]!,ids[1]!,ids[2]!],allowedModes:['horse'],
   officialDateKey:'1524-07-30',calendarVersion:9,segmentIds:[ids[7]!,ids[8]!]});
  expect(p.status).toBe('planned');
  if(p.status!=='planned')return;
  expect(p.segments.map(s=>s.arrivalDateKey)).toEqual(['1524-F-midsummer','1524-08-01']);
  expect(p.totalDays).toBe(3);
  expect(getTravelTransitionsUntilPublishedDate(p.segments,'1524-F-shieldmeet',10)).toHaveLength(1);
  expect(getTravelTransitionsUntilPublishedDate(p.segments,'1524-08-01',11)).toHaveLength(2);
 });
 it('simula volta e mantém segmentos anteriores em replanejamento',()=>{
  const g=registry();
  const args={operationId:ids[6]!,waypoints:[ids[0]!,ids[1]!,ids[2]!,ids[0]!],allowedModes:['horse' as const],
   officialDateKey:'1522-12-30',calendarVersion:1,segmentIds:[ids[7]!,ids[8]!,ids[9]!]};
  const p=planSpyItinerary(g,args);
  expect(p.status).toBe('planned');
  if(p.status!=='planned')return;
  expect(p.totalDays).toBe(4);
  expect(p.segments[0]?.arrivalDateKey).toBe('1523-01-01');
  const plan=replanSpyItinerary(g,p.segments,{...args,segmentIds:[ids[9]!,ids[10]!,ids[11]!],officialDateKey:'1523-01-01'});
  expect(plan.previousSegments).toEqual(p.segments);
  expect(plan.requiresTransactionalCancellation).toBe(true);
  expect(dateKey(fromHarptosOrdinal(getHarptosOrdinal('1524-F-shieldmeet')))).toBe('1524-F-shieldmeet');
 });
 it('trecho não cadastrado impede previsão inteira',()=>{
  const p=planSpyItinerary(registry(),{operationId:ids[6]!,waypoints:[ids[1]!,ids[0]!],allowedModes:['ship'],
   officialDateKey:'1522-01-01',calendarVersion:1,segmentIds:[]});
  expect(p.status).toBe('route_not_registered');
 });
});