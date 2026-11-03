import {describe,it,expect} from 'vitest';
import {newHouseState,type Holding} from '@/lib/house/types';
import {REGIONS,regionBonus} from '@/lib/house/regions';
import {spyRegionalBaseline} from '@/lib/espionage/public-strategy';
import {spyLawDifficulty,spyLawDifficultyTable} from '@/lib/espionage/spy-law-difficulty';
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
 it('estende a tabela de Lei acima de 59 sem teto de dificuldade',()=>{
  expect(spyLawDifficulty(30)).toBe(6);
  expect(spyLawDifficulty(34)).toBe(6);
  expect(spyLawDifficulty(35)).toBe(9);
  for(const [law,dc] of [[55,21],[59,21],[60,24],[64,24],
    [65,27],[70,30],[80,36],[90,42],[100,48],[104,48],
    [105,51],[110,54],[150,78],[500,288]] as const)
   expect(spyLawDifficulty(law)).toBe(dc);
  const table=spyLawDifficultyTable();
  expect(table[0]).toMatchObject({lawMin:0,lawMax:34,difficulty:6,source:'livro'});
  expect(table.at(-1)).toMatchObject({lawMin:100,lawMax:104,difficulty:48,source:'cormyr'});
  expect(table.find(v=>v.lawMin===60)).toMatchObject({difficulty:24,source:'cormyr'});
  expect(table.find(v=>v.lawMin===55)?.source).toBe('livro');
 });
 it('usa exatamente Lei regional +10 para todas as onze regiões',()=>{
  expect(UNFICHED_NOBLE_HOUSE_LAW_BONUS).toBe(10);
  for(const region of Object.keys(REGIONS)){
   const result=resolveSpyHouseDefense({kind:'without_sheet',region});
   const law=regionBonus(region).law;
   expect(result.law).toBe(law+10);
   expect(result.difficulty).toBe(spyLawDifficulty(law+10));
   expect(result.constructionBonus).toBe(0);
   expect(result.source).toBe('regional_npc_fallback');
   expect(spyRegionalBaseline(region)?.regionalLaw).toBe(law);
   expect(spyRegionalBaseline(region)?.basalDifficulty).toBe(spyLawDifficulty(law));
  }
 });
 it('Lei-base regional ainda é preservada, mas todos geram DC 6',()=>{
  for(const [region,expected] of [
   ['dragoncoast',10],['stonelands',10],['horselands',15],
   ['veilstone',15],['crownlands',30],['elfhold',25],
  ] as const){
   expect(resolveSpyHouseDefense({kind:'without_sheet',region}).law).toBe(expected);
   expect(resolveSpyHouseDefense({kind:'without_sheet',region}).difficulty).toBe(6);
  }
 });
 it('não concede os dez pontos a Casa com ficha, mesmo ainda em rascunho',()=>{
  for(const phase of ['draft','review','active'] as const){
   const state=withSheet('dragoncoast',phase);state.base.law=2;
   const result=resolveSpyHouseDefense({kind:'with_sheet',region:'dragoncoast',state});
   expect(result.source).toBe('own_house_sheet');
   expect(result.law).toBe(2);
   expect(result.difficulty).toBe(6);
   expect(result.regionalLaw).toBeNull();
  }
 });
 it('Casa com ficha em outra região não recebe +10 nem o bônus de Lei da região',()=>{
  const state=withSheet('crownlands');state.base.law=40;
  const result=resolveSpyHouseDefense({kind:'with_sheet',state,region:'crownlands'});
  expect(result.difficulty).toBe(12);
  expect(result.baseDifficulty).toBe(12);
  expect(result.regionalLaw).toBeNull();
 });
 it('proteções específicas entram apenas no domínio da Casa com ficha',()=>{
  const state=withSheet();
  const base=holding('pros-dog-kennels');
  state.holdings=[base,holding('pros-dog-kennels--guard-dogs','d1',base.id)];
  const local=resolveSpyHouseDefense({kind:'with_sheet',state,region:'dragoncoast',domainId:'d1'});
  const house=resolveSpyHouseDefense({kind:'with_sheet',state,region:'dragoncoast'});
  expect(local.difficulty).toBe(9);expect(local.constructionBonus).toBe(3);
  expect(house.difficulty).toBe(6);expect(house.constructionBonus).toBe(0);
 });
 it('nunca substitui ficha não carregada por NPC ou região desconhecida por zero',()=>{
  expect(()=>resolveSpyHouseDefense({kind:'with_sheet',region:'crownlands',state:null as never})).toThrow();
  expect(()=>resolveSpyHouseDefense({kind:'without_sheet',region:'regiao-inexistente'})).toThrow();
  expect(()=>resolveSpyHouseDefense({kind:'with_sheet',region:'dragoncoast',state:withSheet(),domainId:'inventado'})).toThrow();
 });
});
