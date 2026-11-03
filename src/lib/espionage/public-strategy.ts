/** Regional reconnaissance uses a public Law value converted to actual DC.
 * House-targeted espionage always uses the House's OWN effective Law instead.
 */
import {z} from 'zod';
import {REGIONS,regionBonus,regionId} from '@/lib/house/regions';
import {spyLawDifficulty} from './spy-law-difficulty';

export function spyRegionalBaseline(region:string){
 const id=regionId(region);
 if(!id)return null;
 const regionalLaw=regionBonus(id).law;
 return {regionId:id,regionName:REGIONS[id]!.name,
  regionalLaw,basalDifficulty:spyLawDifficulty(regionalLaw),
  source:'regional_law_bonus' as const};
}
export function allSpyRegionalBaselines(){
 return Object.keys(REGIONS).map(id=>spyRegionalBaseline(id)!).sort(
  (a,b)=>b.basalDifficulty-a.basalDifficulty||a.regionName.localeCompare(b.regionName));
}
export const publicSpyGraphSchema=z.object({
 locations:z.array(z.object({
  id:z.string().uuid(),kind:z.enum(['region','house_seat','domain','settlement','waypoint']),
  refId:z.string().min(1),name:z.string().min(1),
 }).strict()).max(3000),
 edges:z.array(z.object({
  id:z.string().uuid(),fromLocationId:z.string().uuid(),toLocationId:z.string().uuid(),
  mode:z.enum(['foot','horse','caravan','ship']),baseDays:z.number().int().min(1).max(3650),
  bidirectional:z.boolean(),version:z.number().int().min(1),
 }).strict()).max(10000),
}).strict();
export type PublicSpyGraph=z.infer<typeof publicSpyGraphSchema>;
export type PublicSpyMode=PublicSpyGraph['edges'][number]['mode'];
export type PublicSpyRoute=
 |{status:'ok';totalDays:number;legs:{edgeId:string;from:string;to:string;days:number;mode:PublicSpyMode;edgeVersion:number}[]}
 |{status:'route_not_registered';totalDays:null;legs:[];missingLeg:{from:string;to:string}};
/** Shortest approved path by days. All edges come from an RLS-filtered public registry;
 * no route/days are invented and a blocked or hidden edge cannot be discovered.
 */
export function findPublicSpyRoute(graph:PublicSpyGraph,fromRef:string,toRef:string,modes:readonly PublicSpyMode[]):PublicSpyRoute{
 const missing={status:'route_not_registered' as const,totalDays:null,legs:[] as [],missingLeg:{from:fromRef,to:toRef}};
 const approved=publicSpyGraphSchema.parse(graph);
 const ids=new Map(approved.locations.map(loc=>[loc.refId,loc.id]));
 const from=ids.get(fromRef),to=ids.get(toRef);
 if(!from||!to||modes.length===0)return missing;
 if(from===to)return {status:'ok',totalDays:0,legs:[]};
 const publicIds=new Set(ids.values());
 const adj=new Map<string,{to:string;edge:PublicSpyGraph['edges'][number]}[]>();
 for(const edge of approved.edges){
  if(!modes.includes(edge.mode)||!publicIds.has(edge.fromLocationId)||!publicIds.has(edge.toLocationId))continue;
  const add=(x:string,y:string)=>adj.set(x,[...(adj.get(x)??[]),{to:y,edge}]);
  add(edge.fromLocationId,edge.toLocationId);
  if(edge.bidirectional)add(edge.toLocationId,edge.fromLocationId);
 }
 const distance=new Map<string,number>([[from,0]]),previous=new Map<string,{from:string;edge:PublicSpyGraph['edges'][number]}>(),visited=new Set<string>();
 while(true){
  let here:string|undefined,best=Infinity;
  for(const [id,cost] of distance)if(!visited.has(id)&&(cost<best||(cost===best&&id<(here??'~')))){here=id;best=cost;}
  if(!here||here===to||!Number.isFinite(best))break;
  visited.add(here);
  for(const step of adj.get(here)??[]){
   const cost=best+step.edge.baseDays;
   if(cost<(distance.get(step.to)??Infinity)){
    distance.set(step.to,cost);previous.set(step.to,{from:here,edge:step.edge});
   }
  }
 }
 if(!distance.has(to))return missing;
 const legs:Extract<PublicSpyRoute,{status:'ok'}>['legs']=[];
 for(let at=to;at!==from;){
  const v=previous.get(at);if(!v)return missing;
  legs.unshift({edgeId:v.edge.id,edgeVersion:v.edge.version,from:v.from,to:at,
   days:v.edge.baseDays,mode:v.edge.mode});at=v.from;
 }
 return {status:'ok',totalDays:distance.get(to)!,legs};
}
export function planPublicSpyWaypoints(graph:PublicSpyGraph,waypoints:readonly string[],modes:readonly PublicSpyMode[]){
 if(waypoints.length<2||waypoints.length>30)throw new Error('Informe entre 2 e 30 paradas.');
 let totalDays=0;const legs:Extract<PublicSpyRoute,{status:'ok'}>['legs']=[];
 for(let i=1;i<waypoints.length;i++){
  const route=findPublicSpyRoute(graph,waypoints[i-1]!,waypoints[i]!,modes);
  if(route.status!=='ok')return route;
  totalDays+=route.totalDays;legs.push(...route.legs);
 }
 return {status:'ok' as const,totalDays,legs};
}
