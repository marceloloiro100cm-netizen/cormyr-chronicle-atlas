/** Lote 3: grafo puro; persistência e autorização pelo servidor somente no Lote 10. */
import {spyLocationSchema,spyTravelEdgeSchema,SPY_TRAVEL_MODES,type SpyLocation,type SpyTravelEdge} from './contracts';
export type SpyTravelMode=(typeof SPY_TRAVEL_MODES)[number];
export type SpyRouteRegistry={locations:SpyLocation[];edges:SpyTravelEdge[];version:number};
export type SpyRouteLeg={edgeId:string;edgeVersion:number;fromLocationId:string;toLocationId:string;mode:SpyTravelMode;days:number};
export type SpyRouteResult=
 |{status:'ok';legs:SpyRouteLeg[];totalDays:number;registryVersion:number}
 |{status:'route_not_registered';legs:[];totalDays:null;registryVersion:number};
export type NarratorRouteEdit={isNarrator:true;actorId:string;justification:string};
export const emptySpyRouteRegistry=():SpyRouteRegistry=>({locations:[],edges:[],version:1});
function requireNarrator(actor:NarratorRouteEdit){
 if(actor.isNarrator!==true||!actor.actorId?.trim()||(actor.justification?.trim().length??0)<10)
  throw new Error('Alteração de rotas requer Narrador e justificativa registrada.');
}
/** API futura NUNCA deve aceitar `isNarrator` como prova de permissão do cliente. */
export function upsertSpyLocation(registry:SpyRouteRegistry,value:SpyLocation,actor:NarratorRouteEdit,expectedVersion:number):SpyRouteRegistry{
 requireNarrator(actor);
 if(expectedVersion!==registry.version)throw new Error('Versão de geografia desatualizada.');
 const v=spyLocationSchema.parse(value);
 const previous=registry.locations.find(l=>l.id===v.id);
 if(previous&&v.version!==previous.version+1)throw new Error('Versão de localidade inválida.');
 if(!previous&&v.version!==1)throw new Error('Nova localidade deve iniciar em v1.');
 if(v.approved&&v.kind==='unknown')throw new Error('Local desconhecido não pode ser aprovado.');
 return {...registry,version:registry.version+1,locations:[...registry.locations.filter(l=>l.id!==v.id),v]};
}
export function upsertSpyTravelEdge(registry:SpyRouteRegistry,value:SpyTravelEdge,actor:NarratorRouteEdit,expectedVersion:number):SpyRouteRegistry{
 requireNarrator(actor);
 if(expectedVersion!==registry.version)throw new Error('Versão de geografia desatualizada.');
 const v=spyTravelEdgeSchema.parse(value);
 const from=registry.locations.find(l=>l.id===v.fromLocationId),to=registry.locations.find(l=>l.id===v.toLocationId);
 if(!from||!to)throw new Error('Trecho exige dois locais cadastrados.');
 if(v.approved&&(!from.approved||!to.approved))throw new Error('Trecho exige locais aprovados.');
 const previous=registry.edges.find(e=>e.id===v.id);
 if(previous&&v.version!==previous.version+1)throw new Error('Versão de trecho inválida.');
 if(!previous&&v.version!==1)throw new Error('Novo trecho deve iniciar em v1.');
 return {...registry,version:registry.version+1,edges:[...registry.edges.filter(e=>e.id!==v.id),v]};
}
export function findSpyRoute(registry:SpyRouteRegistry,startId:string,endId:string,allowedModes:readonly SpyTravelMode[]):SpyRouteResult{
 const missing:SpyRouteResult={status:'route_not_registered',legs:[],totalDays:null,registryVersion:registry.version};
 if(!allowedModes.length)return missing;
 const approved=new Set(registry.locations.filter(l=>l.approved).map(l=>l.id));
 if(!approved.has(startId)||!approved.has(endId))return missing;
 if(startId===endId)return {status:'ok',legs:[],totalDays:0,registryVersion:registry.version};
 const links=new Map<string,{to:string;edge:SpyTravelEdge}[]>();
 for(const edge of registry.edges){
  if(!edge.approved||edge.blocked||!allowedModes.includes(edge.mode)||!approved.has(edge.fromLocationId)||!approved.has(edge.toLocationId))continue;
  const push=(from:string,to:string)=>links.set(from,[...(links.get(from)??[]),{to,edge}]);
  push(edge.fromLocationId,edge.toLocationId);
  if(edge.bidirectional)push(edge.toLocationId,edge.fromLocationId);
 }
 const distance=new Map<string,number>([[startId,0]]);
 const previous=new Map<string,{from:string;edge:SpyTravelEdge}>();
 const visited=new Set<string>();
 while(true){
  let current:string|undefined,best=Infinity;
  for(const [id,cost] of distance)if(!visited.has(id)&&(cost<best||(cost===best&&id<(current??'~')))){current=id;best=cost;}
  if(!current||!Number.isFinite(best))break;
  if(current===endId)break;
  visited.add(current);
  for(const item of links.get(current)??[]){
   const cost=best+item.edge.baseDays;
   if(cost<(distance.get(item.to)??Infinity)){
    distance.set(item.to,cost);previous.set(item.to,{from:current,edge:item.edge});
   }
  }
 }
 if(!distance.has(endId))return missing;
 const legs:SpyRouteLeg[]=[];
 for(let cursor=endId;cursor!==startId;){
  const step=previous.get(cursor);
  if(!step)return missing;
  legs.unshift({edgeId:step.edge.id,edgeVersion:step.edge.version,fromLocationId:step.from,toLocationId:cursor,mode:step.edge.mode,days:step.edge.baseDays});
  cursor=step.from;
 }
 return {status:'ok',legs,totalDays:distance.get(endId)!,registryVersion:registry.version};
}
export function visibleSpyLocations(registry:SpyRouteRegistry):SpyLocation[]{
 return registry.locations.filter(l=>l.approved&&l.visibility==='public');
}
