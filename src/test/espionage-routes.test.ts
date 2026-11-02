import {describe,it,expect} from 'vitest';
import {emptySpyRouteRegistry,findSpyRoute,upsertSpyLocation,upsertSpyTravelEdge,visibleSpyLocations} from '@/lib/espionage/routes';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666'];
const gm={isNarrator:true as const,actorId:'gm',justification:'Validado no mapa regional da campanha'};
const location=(id:string,name:string,visibility:'public'|'narrator'='public')=>({id,kind:'region' as const,refId:name,name,regionId:name,visibility,approved:true,version:1,source:'Fonte regional conferida'});
const edge=(id:string,a:string,b:string,days:number,bidirectional=true)=>({id,fromLocationId:a,toLocationId:b,mode:'horse' as const,baseDays:days,bidirectional,blocked:false,approved:true,version:1,source:'Rota verificada pelo Narrador',approvedByNarratorId:'gm',approvalReason:'Aresta homologada com duração confirmada'});
describe('Espionagem · Lote 3 rotas',()=>{
 it('bloqueia trecho inexistente e escrita sem permissão narratorial',()=>{
  let g=emptySpyRouteRegistry();
  expect(findSpyRoute(g,ids[0]!,ids[1]!,['horse']).status).toBe('route_not_registered');
  expect(()=>upsertSpyLocation(g,location(ids[0]!,'A'),{...gm,isNarrator:false} as never,g.version)).toThrow();
  g=upsertSpyLocation(g,location(ids[0]!,'A'),gm,g.version);
  expect(()=>upsertSpyLocation(g,location(ids[1]!,'B'),gm,1)).toThrow('desatualizada');
 });
 it('encontra menor percurso aprovado, respeita direção, bloqueio e sigilo',()=>{
  let g=emptySpyRouteRegistry();
  for(const [i,name] of ['A','B','C'].entries())g=upsertSpyLocation(g,location(ids[i]!,name,i===2?'narrator':'public'),gm,g.version);
  g=upsertSpyTravelEdge(g,edge(ids[3]!,ids[0]!,ids[1]!,6),gm,g.version);
  g=upsertSpyTravelEdge(g,edge(ids[4]!,ids[1]!,ids[2]!,4,false),gm,g.version);
  g=upsertSpyTravelEdge(g,edge(ids[5]!,ids[0]!,ids[2]!,20),gm,g.version);
  const route=findSpyRoute(g,ids[0]!,ids[2]!,['horse']);
  expect(route.status).toBe('ok');
  if(route.status==='ok'){expect(route.totalDays).toBe(10);expect(route.legs).toHaveLength(2);}
  expect(findSpyRoute(g,ids[2]!,ids[1]!,['horse']).status).toBe('ok'); // outro caminho via A
  expect(findSpyRoute(g,ids[0]!,ids[2]!,['ship']).status).toBe('route_not_registered');
  expect(visibleSpyLocations(g)).toHaveLength(2);
  expect(g.edges).toHaveLength(3);
 });
});