import {describe,it,expect} from 'vitest';
import {createUnit,unitStats,balances,UNIT_TYPES} from '@/lib/house/engine';
import {equipUnit} from '@/lib/house/military';
import {quoteMilitaryUnit,quoteMilitarySiege,militaryConstructionDuration,unitMilitaryBonuses} from '@/lib/house/military-bonuses';
import {newHouseState,SKILLS,type Holding,type Unit} from '@/lib/house/types';

const begin=()=>{const s=newHouseState('isolated-military');s.base.power=100;s.base.wealth=100;s.base.population=20;s.base.lands=10;
 s.domains=[{id:'d',name:'Vale',terrain:'hills',features:['river'],notes:''}];return s;};
const holding=(id:string,domainId='d'):Holding=>({id:'h-'+id,itemId:id,name:id,domainId,status:'active',costs:[],effects:[],ruleVersion:'isolated',source:'test'});
const recruit=(type='infantry'):Unit=>({
 id:'u-'+type,name:'Tropa isolada',types:[type],training:'trained',domainId:'d',origin:'',
 skills:Object.fromEntries(SKILLS.map(x=>[x,2])) as Unit['skills'],xp:60,costs:[],
 armor:3,armorPenalty:2,health:6,casualties:0,strength:100,
 disciplineModifier:0,equipment:[],situation:'Em quartel',notes:'',atHome:true,mounted:false
});
describe('automação de descontos na fonte da compra',()=>{
 it('converte descontos de fonte em Poder efetivamente cobrado, sem tocar custos antigos',()=>{
  const s=begin();
  s.holdings=[holding('pros-street-gangs'),holding('pros-gambling-dens--bloodsports')];
  const q=quoteMilitaryUnit(s,['levies'],'trained');
  expect(q.base.find(c=>c.resource==='power')?.amount).toBe(3);
  expect(q.costs.find(c=>c.resource==='power')?.amount).toBe(1);
  expect(q.costs.find(c=>c.resource==='population')?.amount).toBe(0);
  expect(q.discounts.reduce((n,d)=>n+d.amount,0)).toBe(4);
  const old=begin();expect(quoteMilitaryUnit(old,['levies'],'trained').costs.find(c=>c.resource==='power')?.amount).toBe(3);
 });
 it('concede descontos navais, de cavalaria, engenharia e guerrilha pela posse ativa, sem descontos de obra em construção',()=>{
  const s=begin();s.holdings=[
   holding('pros-timber--ship-yards'),holding('pros-shipwright'),holding('pros-charcoal--tar-works'),
   holding('pros-horse-husbandry--war-horse-herds'),holding('pros-fur-trade--trappers'),
   holding('pros-engineer--engineer-commander')
  ];
  expect(quoteMilitaryUnit(s,['warships'],'trained').costs[0]?.amount).toBe(5); // 10 − 2 − 2 − 1
  expect(quoteMilitaryUnit(s,['cavalry'],'trained').costs[0]?.amount).toBe(6);
  expect(quoteMilitaryUnit(s,['guerrillas'],'trained').costs[0]?.amount).toBe(3);
  expect(quoteMilitaryUnit(s,['engineers'],'trained').costs[0]?.amount).toBe(4);
  s.holdings[0]!.status='building';
  expect(quoteMilitaryUnit(s,['warships'],'trained').costs[0]?.amount).toBe(7);
 });
 it('registra na unidade os descontos realmente debitados, sem reaplicar valores em leituras posteriores',()=>{
  const s=begin();s.holdings=[holding('pros-fur-trade--trappers')];
  const raw=equipUnit(recruit('guerrillas'));
  const next=createUnit(s,raw,UNIT_TYPES);
  expect(next.units[0]?.costs.find(c=>c.resource==='power')?.amount).toBe(3);
  expect(next.units[0]?.recruitmentDiscounts?.[0]?.amount).toBe(2);
  expect(next.units[0]?.recruitmentBaseCosts?.[0]?.amount).toBe(5);
  expect(balances(next).available.power).toBe(97);
  expect(s.units).toHaveLength(0);
 });
 it('aplica Festivais Marciais somente na disciplina de plebeus recém-recrutados',()=>{
  const s=begin();s.holdings=[holding('pros-festivals--martial-festivals')];
  const next=createUnit(s,equipUnit(recruit('levies')),UNIT_TYPES);
  expect(next.units[0]?.disciplineModifier).toBe(3);
  expect(next.units[0]?.recruitmentBenefits?.[0]?.description).toContain('−3');
 });
 it('aplica Mestre de Campo somente ao tipo de unidade selecionado',()=>{
  const s=begin(),master=holding('pros-master-of-arms--field-master');
  master.militaryTypeId='archers';s.holdings=[master];
  expect(quoteMilitaryUnit(s,['archers'],'trained').discounts[0]?.amount).toBe(1);
  expect(quoteMilitaryUnit(s,['infantry'],'trained').discounts).toHaveLength(0);
 });
 it('não inventa descontos de cerco nem aplica descontos de prazo a personagens',()=>{
  const s=begin();
  expect(quoteMilitarySiege(s,'wealth',2,'small-catapult').cost).toBe(2);
  s.holdings=[holding('pros-engineer--siege-engineer'),holding('pros-engineer'),holding('pros-stonemason')];
  expect(quoteMilitarySiege(s,'wealth',2,'small-catapult').cost).toBe(1);
  expect(militaryConstructionDuration(s,'castle','fortification',100).months).toBe(70);
  expect(militaryConstructionDuration(s,'pros-master-of-arms','personage',100).months).toBe(100);
 });
});
describe('bônus derivados de unidades, sem alterar permanentemente habilidades',()=>{
 it('soma fortificação máxima com engenheiro, mas não múltiplas torres',()=>{
  const s=begin(),u=recruit();
  s.holdings=[holding('tower'),holding('castle'),holding('pros-engineer')];
  const b=unitMilitaryBonuses(s,u);
  expect(b.defense).toBe(9);
  expect(unitStats(u,s).defense).toBe(unitStats(u).defense+9);
  expect(u.skills.agility).toBe(2);
  u.atHome=false;expect(unitMilitaryBonuses(s,u).defense).toBe(0);
 });
 it('aplica Treinamento Fundamental somente após seleção da habilidade e a remove quando a posse cai',()=>{
  const s=begin(),u=recruit(),h=holding('pros-military-academy--core-training');s.holdings=[h];
  expect(unitMilitaryBonuses(s,u).skillBonuses.agility).toBeUndefined();
  h.militarySkill='agility';
  expect(unitMilitaryBonuses(s,u).skillBonuses.agility).toBe(1);
  expect(unitStats(u,s).defense).toBe(unitStats(u).defense+1);
  expect(u.skills.agility).toBe(2);
  h.status='destroyed';expect(unitStats(u,s).defense).toBe(unitStats(u).defense);
 });
 it('não cria gratuitamente Cães de Guerra; aplica dano apenas a unidade equipada e não montada',()=>{
  const s=begin(),u=recruit('infantry'),h=holding('pros-dog-kennels--war-hounds');s.holdings=[h];
  expect(unitMilitaryBonuses(s,u).fightingDamage).toBe(0);
  u.warHoundsHoldingId=h.id;
  expect(unitMilitaryBonuses(s,u).fightingDamage).toBe(2);
  expect(unitMilitaryBonuses(s,u).meleeBonusDice).toBe(1);
  h.status='building';expect(unitMilitaryBonuses(s,u).fightingDamage).toBe(0);
 });
 it('aplica dano e rastreamento aos batedores e descontos históricos sem inventar atributos',()=>{
  const s=begin(),u=recruit('scouts');s.holdings=[holding('pros-dog-kennels--scouting-hounds')];
  u.recruitmentDiscounts=[{source:'Armadilheiros',holdingId:'old',resource:'power',amount:2,description:'Desconto já pago'}];
  const b=unitMilitaryBonuses(s,u);
  expect(b.fightingDamage).toBe(1);
  expect(b.trackingBonusDice).toBe(2);
  expect(b.entries.some(x=>x.source==='Armadilheiros'&&x.kind==='recruitment')).toBe(true);
 });
});
