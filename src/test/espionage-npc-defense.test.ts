import {describe,it,expect} from 'vitest';
import {newHouseState,type Holding} from '@/lib/house/types';
import {REGIONS,regionBonus} from '@/lib/house/regions';
import {spyRegionalBaseline} from '@/lib/espionage/public-strategy';
import {resolveSpyHouseDefense,UNFICHED_NOBLE_HOUSE_LAW_BONUS} from '@/lib/espionage/spy-house-target-defense';

function withSheet(region='dragoncoast',phase:'draft'|'review'|'active'='active'){
 const s=newHouseState('test-house',region);s.method='import';s.phase=phase;
 s.base.law=30;s.domains=[{id:'d1',name:'Capital',terrain:'plain',features:[],notes:''}];
 return s;
}
function holding(id:string,domainId='d1',parentId?:string):Holding{
 return {id:'hold-'+id,itemId:id,name:id,domainId,
 costs:[],effects:[],source:'catalog',ruleVersion:'test',status:'active',
 ...(parentId?{parentId}:{})};
}
describe('Balanceamento de Casas NPC sem ficha',()=>{
 it('usa exatamente Lei regional +10 para todas as onze regiões',()=>{
  expect(UNFICHED_NOBLE_HOUSE_LAW_BONUS).toBe(10);
  for(const region of Object.keys(REGIONS)){
   const result=resolveSpyHouseDefense({kind:'without_sheet',region});
   const law=regionBonus(region).law;
   expect(result.law).toBe(law+10);
   expect(result.difficulty).toBe(law+10);
   expect(result.constructionBonus).toBe(0);
   expect(result.source).toBe('regional_npc_fallback');
   expect(spyRegionalBaseline(region)?.basalDifficulty).toBe(law);
  }
 });
 it('Dragon Coast/Stonelands 10, Horselands 15, Crownlands 30',()=>{
  for(const [region,expected] of [
   ['dragoncoast',10],['stonelands',10],['horselands',15],
   ['veilstone',15],['crownlands',30],['elfhold',25],
  ] as const){
   expect(resolveSpyHouseDefense({kind:'without_sheet',region}).difficulty).toBe(expected);
  }
 });
 it('não concede os dez pontos a Casa com ficha, mesmo ainda em rascunho',()=>{
  for(const phase of ['draft','review','active'] as const){
   const state=withSheet('dragoncoast',phase);state.base.law=2;
   const result=resolveSpyHouseDefense({kind:'with_sheet',region:'dragoncoast',state});
   expect(result.source).toBe('own_house_sheet');
   expect(result.law).toBe(2);
   expect(result.difficulty).toBe(2);
   expect(result.regionalLaw).toBeNull();
  }
 });
 it('Casa com ficha em outra região não recebe +10 nem o bônus de Lei da região',()=>{
  const state=withSheet('crownlands');state.base.law=40;
  const result=resolveSpyHouseDefense({kind:'with_sheet',state,region:'crownlands'});
  expect(result.difficulty).toBe(40);
  expect(result.baseDifficulty).toBe(40);
  expect(result.regionalLaw).toBeNull();
 });
 it('proteções específicas entram apenas no domínio da Casa com ficha',()=>{
  const state=withSheet();
  const base=holding('pros-dog-kennels');
  state.holdings=[base,holding('pros-dog-kennels--guard-dogs','d1',base.id)];
  const local=resolveSpyHouseDefense({kind:'with_sheet',state,region:'dragoncoast',domainId:'d1'});
  const house=resolveSpyHouseDefense({kind:'with_sheet',state,region:'dragoncoast'});
  expect(local.difficulty).toBe(33);expect(local.constructionBonus).toBe(3);
  expect(house.difficulty).toBe(30);expect(house.constructionBonus).toBe(0);
 });
 it('nunca substitui ficha não carregada por NPC ou região desconhecida por zero',()=>{
  expect(()=>resolveSpyHouseDefense({kind:'with_sheet',region:'crownlands',state:null as never})).toThrow();
  expect(()=>resolveSpyHouseDefense({kind:'without_sheet',region:'regiao-inexistente'})).toThrow();
  expect(()=>resolveSpyHouseDefense({kind:'with_sheet',region:'dragoncoast',state:withSheet(),domainId:'inventado'})).toThrow();
 });
});
