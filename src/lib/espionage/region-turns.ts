/** Estratégia de espionagem por rodadas de campanha.
 * Regra aprovada pelo Narrador: 1 rodada = 1 désdia (10 dias ordinários).
 * A projeção de datas fica em round-calendar.ts e usa o Hub Temporal oficial.
 * Nenhum cálculo de prévia pode publicar ou avançar o calendário.
 * Regiões vizinhas homologadas: 1 rodada de deslocamento;
 * uma passagem marítima homologada entre regiões: 1 rodada, mesmo não contíguas.
 * Dentro da mesma região: 0 rodadas de deslocamento.
 * Investigação: 1 rodada adicional no destino.
 */
import {z} from 'zod';
import {regionId} from '@/lib/house/regions';
import {spyRegionalBaseline} from './public-strategy';

export const spyRegionalConnectionSchema=z.object({
 id:z.string().uuid(),
 fromRegion:z.string().min(1),
 toRegion:z.string().min(1),
 passage:z.enum(['land_neighbor','sea_passage']),
 bidirectional:z.boolean(),
 version:z.number().int().min(1),
}).strict().superRefine((link,ctx)=>{
 if(!regionId(link.fromRegion)||!regionId(link.toRegion)||
  regionId(link.fromRegion)===regionId(link.toRegion))
  ctx.addIssue({code:'custom',message:'A ligação deve unir duas regiões diferentes do catálogo.'});
});
export type SpyRegionalConnection=z.infer<typeof spyRegionalConnectionSchema>;
export const spyRegionalAgentSchema=z.object({
 id:z.string().uuid(),codename:z.string().min(1),
 status:z.enum(['available','assigned','traveling','operating','returning','missing',
  'captured','retired','lost','pending_review']),
 currentRegion:z.string().nullable(),
}).strict();
export type SpyRegionalAgent=z.infer<typeof spyRegionalAgentSchema>;
export const spyRegionalStrategySchema=z.object({
 houseId:z.string().min(1),
 agents:z.array(spyRegionalAgentSchema).max(2000),
 links:z.array(spyRegionalConnectionSchema).max(5000),
}).strict();
export type SpyRegionalStrategy=z.infer<typeof spyRegionalStrategySchema>;

type Leg={fromRegion:string;toRegion:string;passage:SpyRegionalConnection['passage'];rounds:1;connectionId:string;version:number};
export type SpyRegionalPlan=
 |{status:'ready';startRegion:string;destinationRegion:string;travelRounds:number;
   missionRounds:1;totalRounds:number;returnRounds:number|null;totalWithReturnRounds:number|null;
   basalDifficulty:number;regionName:string;legs:Leg[];returnLegs:Leg[]|null}
 |{status:'unknown_agent_location'|'agent_in_transit'|'agent_unavailable'|'route_not_approved'|'unknown_destination';travelRounds:null;missionRounds:1;totalRounds:null;
   returnRounds:null;totalWithReturnRounds:null;basalDifficulty:number|null;legs:[];returnLegs:null};

function shortest(links:readonly SpyRegionalConnection[],from:string,to:string,seaAllowed:boolean):Leg[]|null{
 if(from===to)return [];
 const adj=new Map<string,Leg[]>();
 for(const raw of links){
  const item=spyRegionalConnectionSchema.parse(raw);
  if(item.passage==='sea_passage'&&!seaAllowed)continue;
  const left=regionId(item.fromRegion),right=regionId(item.toRegion);
  const add=(a:string,c:string)=>adj.set(a,[...(adj.get(a)??[]),{
   fromRegion:a,toRegion:c,passage:item.passage,rounds:1 as const,connectionId:item.id,version:item.version}]);
  add(left,right);
  if(item.bidirectional)add(right,left);
 }
 const queue=[from],seen=new Set<string>([from]),parent=new Map<string,Leg>();
 for(let i=0;i<queue.length;i++){
  const current=queue[i]!;
  // Sea and land each cost one round. When sea is enabled and both directly
  // reach the same neighbour, prefer the maritime leg, so the map highlights
  // the approved Dragonmere passage. Disabling sea restores the land route.
  const edges=(adj.get(current)??[]).sort((a,b)=>
   a.toRegion.localeCompare(b.toRegion)||
   (a.passage===b.passage?0:a.passage==='sea_passage'?-1:1)||
   a.connectionId.localeCompare(b.connectionId));
  for(const leg of edges){
   if(seen.has(leg.toRegion))continue;
   seen.add(leg.toRegion);parent.set(leg.toRegion,leg);queue.push(leg.toRegion);
   if(leg.toRegion===to)break;
  }
  if(seen.has(to))break;
 }
 if(!seen.has(to))return null;
 const steps:Leg[]=[];
 for(let cursor=to;cursor!==from;){const edge=parent.get(cursor);if(!edge)return null;steps.unshift(edge);cursor=edge.fromRegion;}
 return steps;
}
/** The only starting position is the selected SPY's CURRENT stored region.
 * It never defaults to the House seat, the first domain or last mission origin.
 */
export function planSpyRegionalMission(
 input:{agent:SpyRegionalAgent;destinationRegion:string;links:readonly SpyRegionalConnection[];
  seaAllowed:boolean;includeReturn?:boolean},
):SpyRegionalPlan{
 const agent=spyRegionalAgentSchema.parse(input.agent);
 const destination=spyRegionalBaseline(input.destinationRegion);
 const fail=(status:Exclude<SpyRegionalPlan['status'],'ready'>):SpyRegionalPlan=>({
  status,travelRounds:null,missionRounds:1,totalRounds:null,returnRounds:null,
  totalWithReturnRounds:null,basalDifficulty:destination?.basalDifficulty??null,
  legs:[],returnLegs:null,
 });
 if(!destination)return fail('unknown_destination');
 if(agent.status==='traveling'||agent.status==='returning')return fail('agent_in_transit');
 if(agent.status!=='available')return fail('agent_unavailable');
 const start=regionId(agent.currentRegion??'');
 if(!start)return fail('unknown_agent_location');
 const legs=shortest(input.links,start,destination.regionId,input.seaAllowed);
 if(!legs)return fail('route_not_approved');
 const back=input.includeReturn?shortest(input.links,destination.regionId,start,input.seaAllowed):null;
 const travelRounds=legs.length;
 return {status:'ready',startRegion:start,destinationRegion:destination.regionId,
  travelRounds,missionRounds:1,totalRounds:travelRounds+1,
  returnRounds:back?.length??null,totalWithReturnRounds:back?travelRounds+1+back.length:null,
  basalDifficulty:destination.basalDifficulty,regionName:destination.regionName,
  legs,returnLegs:back};
}
