import {describe,it,expect} from 'vitest';
import {newHouseState,type Holding} from '@/lib/house/types';
import {emptySpyAssetRegistry,reconcileNetworkCells,validateSpyAssignment} from '@/lib/espionage/assets';
import {emptySpyRouteRegistry,upsertSpyLocation,upsertSpyTravelEdge} from '@/lib/espionage/routes';
import {planSpyItinerary} from '@/lib/espionage/travel';
const id=(n:number)=>{const c=n.toString(16);return c.repeat(8)+'-'+c.repeat(4)+'-4'+c.repeat(3)+'-8'+c.repeat(3)+'-'+c.repeat(12);};
const gm={isNarrator:true as const,actorId:'gm',justification:'Trechos homologados na campanha',reason:'Células confirmadas pelo Narrador'};
describe('Marco A · aceite funcional sem banco ou segredos',()=>{
 it('dois agentes vão a destinos distintos, com datas precisas de Harptos',()=>{
  const s=newHouseState('house-a','helmlands');
  s.domains=[{id:id(1),name:'Sede A',terrain:'plains',features:[],notes:''}];
  const h=(key:number,itemId:string,parentId?:string):Holding=>({id:id(key),itemId,name:itemId,domainId:id(1),parentId,
   costs:[],effects:[],source:'Prosperidade',ruleVersion:'1',status:'active'});
  s.holdings=[h(2,'pros-spy-network'),h(3,'pros-spy-network--expanded-network',id(2))];
  const places=[
   {id:id(4),kind:'domain' as const,refId:id(1),name:'Sede A',regionId:'helmlands',visibility:'narrator' as const,approved:true,version:1,source:'Mapa do Narrador'},
   {id:id(5),kind:'region' as const,refId:'horselands',name:'Horselands',regionId:'horselands',visibility:'public' as const,approved:true,version:1,source:'Mapa do Narrador'},
   {id:id(6),kind:'region' as const,refId:'dragoncoast',name:'Dragon Coast',regionId:'dragoncoast',visibility:'public' as const,approved:true,version:1,source:'Mapa do Narrador'}
  ];
  const proposedIds={['expanded:'+id(3)+':0']:id(7),['expanded:'+id(3)+':1']:id(8)};
  const result=reconcileNetworkCells({state:s,registry:emptySpyAssetRegistry(s.houseId),locations:places,proposedIds,
   review:gm,expectedVersion:1});
  expect(result.created).toHaveLength(2);
  let graph=emptySpyRouteRegistry();
  for(const loc of places)graph=upsertSpyLocation(graph,loc,gm,graph.version);
  for(const [edgeId,to,days] of [[9,5,3],[10,6,5]] as const){
   graph=upsertSpyTravelEdge(graph,{id:id(edgeId),fromLocationId:id(4),toLocationId:id(to),mode:'horse',
    baseDays:days,bidirectional:false,blocked:false,approved:true,version:1,
    source:'Mapa auditado',approvedByNarratorId:'gm',approvalReason:'Rota e duração validadas'},gm,graph.version);
  }
  const plan1=planSpyItinerary(graph,{operationId:id(11),waypoints:[id(4),id(5)],allowedModes:['horse'],
   officialDateKey:'1524-07-30',calendarVersion:14,segmentIds:[id(12)]});
  const plan2=planSpyItinerary(graph,{operationId:id(13),waypoints:[id(4),id(6)],allowedModes:['horse'],
   officialDateKey:'1524-07-30',calendarVersion:14,segmentIds:[id(14)]});
  expect(plan1.status).toBe('planned');expect(plan2.status).toBe('planned');
  if(plan1.status==='planned'&&plan2.status==='planned'){
   expect(plan1.arrivalDateKey).toBe('1524-08-01');
   expect(plan2.arrivalDateKey).toBe('1524-08-03');
   expect(plan1.segments[0]?.toLocationId).not.toBe(plan2.segments[0]?.toLocationId);
  }
  expect(result.next.assets.every(a=>validateSpyAssignment(a,[],s.houseId).allowed)).toBe(true);
  expect(findHiddenTargetData(result)).toBe(false);
 });
});
function findHiddenTargetData(value:unknown):boolean{
 return JSON.stringify(value).includes('noble_house_sheets');
}
