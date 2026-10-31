import {describe,it,expect} from 'vitest';
import {newHouseState,SKILLS,type Unit} from '@/lib/house/types';
import {UNIT_TYPES,createUnit,balances} from '@/lib/house/engine';
import {equipUnit,trainUnit,resolveSurvivors} from '@/lib/house/military';
import {unitXpSummary,grantUnitXp,editUnitProfile,renameMilitaryHolding} from '@/lib/house/unit-progression';
import {improveEquipment} from '@/lib/house/equipment';

function create(){
 const s=newHouseState('xp-test');s.base.power=100;s.base.wealth=100;
 s.domains=[{id:'domain',name:'Fortaleza de teste',terrain:'hills',features:[],notes:''}];
 const skills=Object.fromEntries(SKILLS.map(x=>[x,2])) as Unit['skills'];
 const u:Unit={id:'army-1',name:'Guarda de teste',types:['infantry'],training:'trained',origin:'Forte',domainId:'domain',skills,
 equipmentTypeId:'infantry',xp:0,costs:[],armor:0,armorPenalty:0,health:6,casualties:0,strength:100,
 disciplineModifier:0,equipment:[],situation:'Em prontidão',notes:''};
 return createUnit(s,equipUnit(u),UNIT_TYPES);
}
describe('XP aberto e fichas militares',()=>{
 it('concede XP sem aumentar atributos, com audit trail e sem mudar o nível de treinamento',()=>{
  const s=create(),before=s.units[0]!;
  expect(unitXpSummary(before).available).toBe(60);
  const n=grantUnitXp(s,{unitId:'army-1',amount:35,reason:'Mérito no cerco e defesa'});
  expect(n.units[0]!.training).toBe('trained');
  expect(n.units[0]!.skills).toEqual(before.skills);
  expect(unitXpSummary(n.units[0]!).available).toBe(95);
  expect(n.units[0]!.xpEvents?.[0]?.delta).toBe(35);
  expect(s.units[0]!.xpEvents).toBeUndefined();
 });
 it('distribui graduações em bolinhas (20 XP) e impede tipos não autorizados',()=>{
  const n=create(),original=n.units[0]!;
  const skills={...original.skills,fighting:4,endurance:3};
  const upgraded=editUnitProfile(n,{unitId:original.id,name:'Guarda do Norte',origin:'Bastião',situation:'Em combate',notes:'Inspecionada',skills});
  expect(upgraded.units[0]!.name).toBe('Guarda do Norte');
  expect(upgraded.units[0]!.xp).toBe(0);
  expect(()=>editUnitProfile(n,{unitId:original.id,name:original.name,origin:'',situation:'',notes:'',
   skills:{...original.skills,cunning:3}})).toThrow('não permitida');
  expect(()=>editUnitProfile(n,{unitId:original.id,name:original.name,origin:'',situation:'',notes:'',
   skills:{...original.skills,fighting:6}})).toThrow('XP');
 });
 it('treinar aumenta o orçamento sem conceder habilidades automaticamente e cobra Poder',()=>{
  const n=create(),old=n.units[0]!;
  const trained=trainUnit(n,old.id);
  expect(trained.units[0]!.training).toBe('veteran');
  expect(unitXpSummary(trained.units[0]!).available).toBe(100);
  expect(trained.units[0]!.skills).toEqual(old.skills);
  expect(balances(trained).available.power).toBe(balances(n).available.power-2);
  expect(trained.units[0]!.xpEvents?.at(-1)?.delta).toBe(40);
 });
 it('sobreviventes que perdem treinamento geram débito, não redistribuição automática',()=>{
  const n=create();let u=n.units[0]!;
  u.training='veteran';u.skills.fighting=6;u.xp=20;
  const downgraded=resolveSurvivors(n,{id:'injury-1',unitId:u.id,roll:1,condition:'unharmed',disorganizations:0,
   skills:u.skills,justification:'Forte combate e ferimentos graves'});
  const after=downgraded.units[0]!;
  expect(after.training).toBe('trained');
  expect(after.skills.fighting).toBe(6);
  expect(unitXpSummary(after).deficit).toBe(20);
  expect(after.xpEvents?.at(-1)?.delta).toBe(-40);
  expect(after.situation).toContain('Déficit');
  const less=editUnitProfile(downgraded,{unitId:u.id,name:u.name,origin:u.origin,situation:u.situation,notes:u.notes,skills:{...u.skills,fighting:5}});
  expect(unitXpSummary(less.units[0]!).deficit).toBe(0);
 });
 it('melhoria de armadura custa 1 Riqueza; Mestre de Armas concede primeira melhoria gratuita',()=>{
  const s=create(),before=s.permanent.wealth;
  const paid=improveEquipment(s,'army-1','armor');
  expect(paid.permanent.wealth).toBe(before-1);
  const withMaster=create();
  withMaster.holdings.push({id:'master-1',itemId:'pros-master-of-arms',name:'Mestre de Armas',domainId:'domain',
    costs:[],effects:[],source:'Teste',ruleVersion:'1',status:'active'});
  const free=improveEquipment(withMaster,'army-1','armor');
  expect(free.permanent.wealth).toBe(withMaster.permanent.wealth);
  expect(free.units[0]!.armor).toBeGreaterThan(withMaster.units[0]!.armor);
 });
 it('renomear mestre de armas e academia não altera efeitos nem custos',()=>{
  const s=create();
  s.holdings.push({id:'academy',itemId:'pros-military-academy',name:'Academia Militar',
    domainId:'domain',costs:[{resource:'wealth',amount:10,mode:'allocation'}],effects:[],source:'Teste',ruleVersion:'1',status:'active'});
  const after=renameMilitaryHolding(s,{holdingId:'academy',name:'Academia da Maré'});
  expect(after.holdings.at(-1)?.name).toBe('Academia da Maré');
  expect(after.holdings.at(-1)?.costs).toEqual(s.holdings.at(-1)?.costs);
  expect(s.holdings.at(-1)?.name).toBe('Academia Militar');
 });
});
