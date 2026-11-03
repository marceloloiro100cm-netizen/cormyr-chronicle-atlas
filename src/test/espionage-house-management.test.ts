import {describe,it,expect} from 'vitest';
import {newHouseState,type Holding} from '@/lib/house/types';
import {calculateSpyDefense,spyDiscoveryBaseDifficulty,SPY_HOLDING_ID_SET} from '@/lib/espionage/spy-defense';
import {spyMissionProgress} from '@/components/house/espionage/spy-house-management';
import {spyHouseTargetStage} from '@/lib/espionage/spy-target-stages';
import {spyRegionalBaseline} from '@/lib/espionage/public-strategy';
function holding(itemId:string,domainId='d1',status:'active'|'building'|'destroyed'='active',parentId?:string):Holding{
 return {id:'id-'+itemId+'-'+domainId,itemId,domainId,
  name:itemId,source:'Guerra dos Tronos RPG',status,
  costs:[],effects:[],ruleVersion:'test',...(parentId?{parentId}:{})};
}
function house(){
 const state=newHouseState('sample','dragoncoast',5);
 state.phase='active';state.method='import';state.base.law=35;
 state.domains=[
  {id:'d1',name:'Capital',terrain:'plains',features:[],notes:''},
  {id:'d2',name:'Fronteira',terrain:'plains',features:[],notes:''},
 ];
 return state;
}
describe('Defesa de Espionagem · Lei e construções reais',()=>{
 it('Lei 30 = 6, 34 ainda 6; 35 = 9 e 40 = 12',()=>{
  for(const [law,expected] of [[0,6],[30,6],[34,6],[35,9],[39,9],[40,12],[45,15]] as const)
   expect(spyDiscoveryBaseDifficulty(law)).toBe(expected);
 });
 it('usa Lei efetiva da ficha importada, sem somar Lei regional duas vezes',()=>{
  const s=house();const d=calculateSpyDefense(s);
  expect(d.law).toBe(35);expect(d.baseDifficulty).toBe(35);
  expect(d.spyCellDiscoveryDifficulty).toBe(9);
  expect(d.domains.map(row=>row.difficulty)).toEqual([35,35]);
 });
 it('bônus locais de cães e oficiais investigativos somam apenas no domínio designado',()=>{
  const s=house();
  const kennels=holding('pros-dog-kennels','d1');
  const dogs=holding('pros-dog-kennels--guard-dogs','d1','active',kennels.id);
  const officers=holding('pros-bailiffs','d1');
  const training=holding('pros-bailiffs--investigative-training','d1','active',officers.id);
  s.holdings=[kennels,dogs,officers,training];
  const d=calculateSpyDefense(s);
  expect(d.domains.map(v=>v.difficulty)).toEqual([41,35]);
  expect(d.domains[0]?.localBonuses).toBe(6);
  expect(d.globalBonuses).toBe(0);
 });
 it('Ouvido no Submundo aplica bônus +3 contra agentes subversivos à Casa',()=>{
  const s=house();const base=holding('pros-black-market','d1');
  s.holdings=[base,holding('pros-black-market--ear-in-the-underworld','d1','active',base.id)];
  const d=calculateSpyDefense(s);
  expect(d.globalBonuses).toBe(3);
  expect(d.domains.map(v=>v.difficulty)).toEqual([38,38]);
 });
 it('destruir o pai, construir uma melhoria ou repeti-la não cria defesa falsa',()=>{
  const s=house();const base=holding('pros-bailiffs','d1','destroyed');
  s.holdings=[
   base,holding('pros-bailiffs--investigative-training','d1','active',base.id),
   holding('pros-dog-kennels--guard-dogs','d2','building'),
  ];
  expect(calculateSpyDefense(s).domains.map(v=>v.difficulty)).toEqual([35,35]);
 });
 it('bônus de Defesa de Intriga e proteção da própria rede não viram +3 de contraespionagem',()=>{
  const s=house();s.holdings=[holding('pros-rich'),holding('pros-spy-network--expert-spies')];
  const d=calculateSpyDefense(s);
  expect(d.globalBonuses).toBe(0);
  expect(d.domains.every(x=>x.localBonuses===0)).toBe(true);
  expect(d.otherEffects.some(e=>e.description.includes('-1D'))).toBe(true);
 });
 it('possui conjuntos de posses principais, especializadas e de defesa',()=>{
  expect(SPY_HOLDING_ID_SET.has('pros-spy-network')).toBe(true);
  expect(SPY_HOLDING_ID_SET.has('pros-spy-network--expanded-network')).toBe(true);
  expect(SPY_HOLDING_ID_SET.has('pros-bailiffs--investigative-training')).toBe(true);
  expect(SPY_HOLDING_ID_SET.has('pros-dog-kennels--guard-dogs')).toBe(true);
 });
});
type Operation=Parameters<typeof spyMissionProgress>[0];
describe('Duas etapas de espionagem: região primeiro, Casa depois',()=>{
 const agent={id:'11111111-1111-4111-8111-111111111111',
  codename:'Agente da Rede',status:'available' as const,currentRegion:'dragoncoast'};
 const houses=[
  {id:'ashkar',name:'Ashkar',regionId:'dragoncoast'},
  {id:'erdenor',name:'Erdenor',regionId:'horselands'},
 ];
 const choice=(agentOverride=agent,region='dragoncoast',target='ashkar',simulation=false)=>
  spyHouseTargetStage({agent:agentOverride,selectedRegion:region,targetHouseId:target,
   houseTargets:houses,simulation});
 it('Casa na mesma região pode ser investigada quando agente está disponível',()=>{
  expect(choice()).toBe('ready_for_house_planning');
 });
 it('exige uma viagem real antes de poder selecionar Casa em outra região',()=>{
  expect(choice(agent,'horselands','erdenor')).toBe('requires_region_arrival');
 });
 it('origem simulada não autoriza atingir Casas fora da região real',()=>{
  expect(choice(agent,'horselands','erdenor',true)).toBe('select_agent');
 });
 it('uma Casa de outra região não pode ser escolhida, nem por seleção manipulada',()=>{
  expect(choice(agent,'dragoncoast','erdenor')).toBe('house_not_in_region');
 });
 it('um espião em operação não recebe uma nova missão contra Casa',()=>{
  expect(choice({...agent,status:'operating'})).toBe('agent_unavailable');
 });
 it('base pública regional não se soma à Lei própria da Casa',()=>{
  const s=house();const d=calculateSpyDefense(s);
  expect(d.baseDifficulty).toBe(35);
  expect(spyRegionalBaseline('dragoncoast')?.basalDifficulty).toBe(0);
  expect(spyRegionalBaseline('crownlands')?.basalDifficulty).toBe(20);
  expect(d.baseDifficulty).not.toBe(spyRegionalBaseline('crownlands')?.basalDifficulty);
 });
});

describe('Tabela de gerenciamento · missão e prazos',()=>{
 const operation:NonNullable<Operation>={
  id:'11111111-1111-4111-8111-111111111111',
  assetId:'22222222-2222-4222-8222-222222222222',
  targetType:'region',targetId:'crownlands',
  missionKind:'regional_recon',status:'traveling',
  travelDays:10,arrivalKey:'1524-08-10',createdAt:'2026-11-03T00:00:00+00:00',
 };
 it('sem missão não inventa destino nem prazo',()=>{
  const p=spyMissionProgress(null,'1524-07-30');
  expect(p.mission).toContain('Sem missão');expect(p.remaining).toBe('—');
 });
 it('previsão usa 1 désdia adicional depois da viagem e não conta festivais como dias ordinários',()=>{
  const p=spyMissionProgress(operation,'1524-07-30');
  expect(p.travel).toContain('10 dias');
  expect(p.travel).toContain('faltam 10 dias ordinários');
  expect(p.remaining).toContain('20 dias ordinários');
  expect(p.end).toBe('1524-08-20');
 });
 it('prazo atingido não conclui missão sem resolução do Narrador',()=>{
  const p=spyMissionProgress(operation,'1524-08-21');
  expect(p.remaining).toContain('aguarda Narrador');
 });
 it('sem chegada registrada, não inventa término',()=>{
  expect(spyMissionProgress({...operation,arrivalKey:null},'1524-08-20')
   .remaining).toBe('Sem término homologado');
 });
 it('missão cancelada ou encerrada tem estado explícito',()=>{
  expect(spyMissionProgress({...operation,status:'cancelled'},'1524-08-20').remaining).toBe('Cancelada');
  expect(spyMissionProgress({...operation,status:'completed'},'1524-08-20').remaining).toContain('Concluída');
 });
});
