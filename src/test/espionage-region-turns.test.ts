import {describe,it,expect} from 'vitest';
import {REGIONS,regionBonus} from '@/lib/house/regions';
import {allSpyRegionalBaselines} from '@/lib/espionage/public-strategy';
import {planSpyRegionalMission,type SpyRegionalAgent,type SpyRegionalConnection} from '@/lib/espionage/region-turns';

const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const agent:SpyRegionalAgent={id:ids[0]!,codename:'Batedor Evenhand',status:'available',currentRegion:'helmlands'};
const land=(id:string,a:string,b:string,bidirectional=true):SpyRegionalConnection=>({
 id,fromRegion:a,toRegion:b,passage:'land_neighbor',bidirectional,version:1});
const sea=(id:string,a:string,b:string):SpyRegionalConnection=>({
 id,fromRegion:a,toRegion:b,passage:'sea_passage',bidirectional:true,version:1});
const links=[
 land(ids[1]!,'helmlands','shieldmark'),
 land(ids[2]!,'shieldmark','horselands'),
 sea(ids[3]!,'helmlands','horselands'),
];
const query=(changes:Partial<Parameters<typeof planSpyRegionalMission>[0]>={})=>planSpyRegionalMission({
 agent,destinationRegion:'horselands',links,seaAllowed:false,...changes});
describe('Espionagem · rodadas de deslocamento da posição atual do agente',()=>{
 it('deriva as 11 dificuldades basais do bônus de Lei regional canônico, sem inventar chance',()=>{
  const values=allSpyRegionalBaselines();
  expect(values).toHaveLength(Object.keys(REGIONS).length);
  for(const value of values)expect(value.basalDifficulty).toBe(regionBonus(value.regionId).law);
  expect(values.find(x=>x.regionId==='crownlands')?.basalDifficulty).toBe(20);
  expect(values.find(x=>x.regionId==='dragoncoast')?.basalDifficulty).toBe(0);
 });
 it('na própria região não há deslocamento, mas a missão leva 1 rodada',()=>{
  const r=query({destinationRegion:'helmlands',links:[]});
  expect(r.status).toBe('ready');
  if(r.status==='ready')expect([r.travelRounds,r.missionRounds,r.totalRounds]).toEqual([0,1,1]);
 });
 it('região vizinha leva 1 rodada de viagem e 1 de investigação',()=>{
  const r=query({destinationRegion:'shieldmark'});
  expect(r.status).toBe('ready');
  if(r.status==='ready')expect([r.travelRounds,r.missionRounds,r.totalRounds]).toEqual([1,1,2]);
 });
 it('duas travessias regionais terrestres custam duas rodadas de viagem',()=>{
  const r=query();
  expect(r.status).toBe('ready');
  if(r.status==='ready'){expect([r.travelRounds,r.totalRounds]).toEqual([2,3]);expect(r.legs).toHaveLength(2);}
 });
 it('passagem marítima homologada pode encurtar regiões não vizinhas a 1 rodada',()=>{
  const r=query({seaAllowed:true,includeReturn:true});
  expect(r.status).toBe('ready');
  if(r.status==='ready'){
   expect([r.travelRounds,r.missionRounds,r.totalRounds,r.returnRounds,r.totalWithReturnRounds]).toEqual([1,1,2,1,3]);
   expect(r.legs[0]?.passage).toBe('sea_passage');
  }
 });
 it('o agente inicia no local atual, nunca na sede da Casa ou origem antiga',()=>{
  const moved={...agent,currentRegion:'shieldmark'};
  const r=query({agent:moved});
  expect(r.status).toBe('ready');
  if(r.status==='ready'){expect(r.startRegion).toBe('shieldmark');expect(r.travelRounds).toBe(1);}
 });
 it('agente em trânsito não recebe ETA falso a partir da última localização confirmada',()=>{
  const r=query({agent:{...agent,status:'traveling'}});
  expect(r.status).toBe('agent_in_transit');expect(r.totalRounds).toBeNull();
 });
 it('sem vizinhança aprovada o prazo continua não homologado',()=>{
  const r=query({links:[]});
  expect(r.status).toBe('route_not_approved');expect(r.totalRounds).toBeNull();
 });
 it('obedece ao sentido único e não permite mar sem escolha explícita',()=>{
  const wrong=land(ids[1]!,'shieldmark','helmlands',false);
  expect(query({destinationRegion:'shieldmark',links:[wrong]}).status).toBe('route_not_approved');
  expect(query({links:[sea(ids[3]!,'helmlands','horselands')],seaAllowed:false}).status).toBe('route_not_approved');
 });
 it('a volta é calculada à parte; se não existe, não estima retorno',()=>{
  const oneWay=land(ids[1]!,'helmlands','shieldmark',false);
  const r=query({destinationRegion:'shieldmark',links:[oneWay],includeReturn:true});
  expect(r.status).toBe('ready');
  if(r.status==='ready')expect([r.returnRounds,r.totalWithReturnRounds]).toEqual([null,null]);
 });
 it('agente capturado ou não localizado não pode ser agendado',()=>{
  expect(query({agent:{...agent,status:'captured'}}).status).toBe('agent_unavailable');
  expect(query({agent:{...agent,currentRegion:null}}).status).toBe('unknown_agent_location');
 });
});
