/** CCA-ESP-MVP-001 — Lote 4: projeções puras baseadas SOMENTE no calendário publicado. */
import {dateKey} from '../calendar/harptos';
import {getHarptosOrdinal,fromHarptosOrdinal} from '../calendar/temporal-engine';
import {spyTravelSegmentSchema,type SpyTravelSegment,type SpyTravelEdge} from './contracts';
import {findSpyRoute,type SpyRouteRegistry,type SpyTravelMode} from './routes';
import {spyIdSchema} from './contracts';

export type SpyItineraryRequest={
 operationId:string;waypoints:string[];allowedModes:SpyTravelMode[];
 officialDateKey:string;calendarVersion:number;segmentIds:string[];
};
export type SpyItineraryResult=
 |{status:'planned';segments:SpyTravelSegment[];totalDays:number;arrivalDateKey:string;calendarVersion:number;routeRegistryVersion:number}
 |{status:'route_not_registered';segments:[];totalDays:null;missingLeg:{from:string;to:string};calendarVersion:number};
export function planSpyItinerary(registry:SpyRouteRegistry,request:SpyItineraryRequest):SpyItineraryResult{
 spyIdSchema.parse(request.operationId);
 if(!Number.isSafeInteger(request.calendarVersion)||request.calendarVersion<1)throw new Error('Versão do calendário oficial inválida.');
 if(request.waypoints.length<2||request.waypoints.length>30)throw new Error('É preciso informar origem e destino (até 30 paradas).');
 if(!request.allowedModes.length)throw new Error('Informe pelo menos um modal aprovado.');
 let ordinal=getHarptosOrdinal(request.officialDateKey);
 const legs:ReturnType<typeof findSpyRoute> extends infer T ? T[] :never=[];
 for(let i=1;i<request.waypoints.length;i++){
  const from=request.waypoints[i-1]!,to=request.waypoints[i]!;
  const route=findSpyRoute(registry,from,to,request.allowedModes);
  if(route.status==='route_not_registered')return {status:'route_not_registered',segments:[],totalDays:null,missingLeg:{from,to},calendarVersion:request.calendarVersion};
  legs.push(route);
 }
 const flattened=legs.flatMap(x=>x.status==='ok'?x.legs:[]);
 if(flattened.length!==request.segmentIds.length||new Set(request.segmentIds).size!==request.segmentIds.length)
  throw new Error('Cada trecho físico exige um identificador único e imutável.');
 for(const id of request.segmentIds)spyIdSchema.parse(id);
 const segments:SpyTravelSegment[]=flattened.map((leg,i)=>{
  const departureDateKey=dateKey(fromHarptosOrdinal(ordinal));
  ordinal+=leg.days;
  return spyTravelSegmentSchema.parse({
   id:request.segmentIds[i],operationId:request.operationId,ordinal:i,
   edgeId:leg.edgeId,fromLocationId:leg.fromLocationId,toLocationId:leg.toLocationId,
   departureDateKey,arrivalDateKey:dateKey(fromHarptosOrdinal(ordinal)),
   durationDays:leg.days,edgeVersion:leg.edgeVersion,status:'planned',
  });
 });
 return {status:'planned',segments,totalDays:flattened.reduce((n,l)=>n+l.days,0),
  arrivalDateKey:dateKey(fromHarptosOrdinal(ordinal)),calendarVersion:request.calendarVersion,
  routeRegistryVersion:registry.version};
}
/** Retrocessos e saltos NÃO mutam segmentos. Somente o consumidor durável pode concluir. */
export function getTravelTransitionsUntilPublishedDate(segments:readonly SpyTravelSegment[],
 publishedDateKey:string,calendarVersion:number){
 const published=getHarptosOrdinal(publishedDateKey);
 if(!Number.isInteger(calendarVersion)||calendarVersion<1)throw new Error('Versão do calendário inválida.');
 return segments.filter(s=>['traveling','planned'].includes(s.status)&&getHarptosOrdinal(s.arrivalDateKey)<=published)
  .sort((a,b)=>getHarptosOrdinal(a.arrivalDateKey)-getHarptosOrdinal(b.arrivalDateKey)||a.ordinal-b.ordinal)
  .map(s=>({segmentId:s.id,operationId:s.operationId,
   transition:'arrived' as const,calendarVersion,
   dueDateKey:s.arrivalDateKey,
   idempotencyKey:'spy-movements:'+calendarVersion+':'+s.id+':arrived'}));
}
/** Registra a intenção de refazer apenas o trecho futuro; o histórico antigo permanece intacto. */
export function replanSpyItinerary(registry:SpyRouteRegistry,previous:readonly SpyTravelSegment[],
 request:SpyItineraryRequest){
 const planned=planSpyItinerary(registry,request);
 return {previousSegments:previous.map(s=>({...s})),replanned:planned,
  requiresTransactionalCancellation:true as const};
}
