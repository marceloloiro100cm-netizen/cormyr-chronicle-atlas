import {describe,it,expect} from 'vitest';
import {newHouseState,SKILLS,type Unit} from '@/lib/house/types';
import {balances,createUnit,UNIT_TYPES,unitStats} from '@/lib/house/engine';
import {improveEquipment,houseWeaponBonuses} from '@/lib/house/equipment';
import {resolveSurvivors,changeUnitState,trainUnit,survivorResult} from '@/lib/house/military';
import {SIEGE,buySiege,changeSiegeAssignment} from '@/lib/house/siege';
import {CORE_CATALOG} from '@/lib/house/catalog';
import {purchase} from '@/lib/house/engine';
const make=()=>{
 const s=newHouseState('military');s.phase='active';s.base.power=90;s.base.wealth=60;s.base.population=50;s.base.lands=50;
 s.domains=[{id:'d',name:'Domínio A',terrain:'hills',features:['river'],notes:''},{id:'e',name:'Domínio B',terrain:'plains',features:[],notes:''}];return s;
};
const unit=(type='infantry'):Unit=>({id:'u',name:'Unidade',types:[type],training:'veteran',domainId:'d',origin:'d',
 skills:Object.fromEntries(SKILLS.map(s=>[s,2])) as Unit['skills'],xp:100,costs:[],armor:3,armorPenalty:2,
 health:6,casualties:0,strength:100,disciplineModifier:0,equipment:[],situation:'No domínio',notes:''});
const holding=(s:ReturnType<typeof make>,id:string)=>{s.holdings.push({id,itemId:id,name:id,domainId:'d',source:'Teste',ruleVersion:'1',status:'active',effects:[],costs:[]});return s;};
describe('Lote 7: descontos militares e treinamento',()=>{
 it('Gangues de Rua elimina o custo de População dos plebeus sem reduzir abaixo de zero',()=>{
  const s=holding(make(),'pros-street-gangs');
  s.holdings[0]!.effects=CORE_CATALOG.find(i=>i.id==='pros-street-gangs')!.effects;
  const n=createUnit(s,unit('levies'),UNIT_TYPES);
  expect(n.units[0]?.costs.find(c=>c.resource==='population')?.amount).toBe(0);
  expect(n.permanent.population).toBe(0);
  expect(balances(n).total.population).toBe(s.base.population);
 });
 it('Estaleiro e Prisão aplicam descontos de Poder sem zerar investimento da tropa',()=>{
  const ship=holding(make(),'pros-timber--ship-yards');
  ship.holdings[0]!.effects=CORE_CATALOG.find(i=>i.id==='pros-timber--ship-yards')!.effects;
  const navy=createUnit(ship,unit('warships'),UNIT_TYPES);
  expect(navy.units[0]?.costs.find(c=>c.resource==='power')?.amount).toBe(10);
  const prison=holding(make(),'pros-gaol');
  prison.holdings[0]!.effects=CORE_CATALOG.find(i=>i.id==='pros-gaol')!.effects;
  const criminal=createUnit(prison,unit('criminals'),UNIT_TYPES);
  expect(criminal.units[0]?.costs.find(c=>c.resource==='power')?.amount).toBe(4);
 });
 it('Armeiro e Flecheiro precisam de escolha; bônus de dano só existe com posse ativa',()=>{
  const original=CORE_CATALOG.find(i=>i.id==='pros-bowyer-fletcher-or-weaponsmith')!;
  const item={...original,requirements:[],duration:{months:0}};
  const s=make();
  expect(()=>purchase(s,item,{id:'specialist',domainId:'d',name:'Oficina',dice:[]})).toThrow('Escolha Armeiro');
  const u=purchase(s,item,{id:'specialist',domainId:'d',name:'Oficina',dice:[],weaponSpecialty:'fighting'});
  expect(houseWeaponBonuses(u)).toMatchObject({fighting:1,marksmanship:0,unconfigured:false});
  const b=structuredClone(u);b.holdings[0]!.status='destroyed';
  expect(houseWeaponBonuses(b).fighting).toBe(0);
  const legacy=holding(make(),'pros-bowyer-fletcher-or-weaponsmith');
  expect(houseWeaponBonuses(legacy).unconfigured).toBe(true);
 });
 it('Mestre de Armas torna a primeira melhoria grátis, seguintes custam Riqueza',()=>{
  const s=holding(make(),'pros-master-of-arms');const trained=createUnit(s,unit(),UNIT_TYPES);
  const free=improveEquipment(trained,'u','armor');
  expect(free.permanent.wealth).toBe(0);expect(free.units[0]?.equipment).toEqual(['armor']);
  const paid=improveEquipment(free,'u','fighting');
  expect(paid.permanent.wealth).toBe(-1);
 });
 it('oficial de armas soma 1 no resultado de sobreviventes',()=>{
  const s=holding(make(),'pros-master-of-arms');const trained=createUnit(s,unit(),UNIT_TYPES);
  const result=resolveSurvivors(trained,{id:'ev',unitId:'u',roll:4,condition:'unharmed',disorganizations:0,skills:unit().skills,justification:'Testando mestria na batalha'});
  expect(result.units[0]?.evolution?.[0]?.justification).toContain('Mestre de Armas +1');
  expect(survivorResult(4,'unharmed',0,1).adjusted).toBe(5);
 });
 it('Sobreviventes nunca alteram habilidades sem redistribuição pelo jogador',()=>{
  const s=make();const u=unit();u.training='elite';u.xp=140;s.units=[u];
  const skills={...u.skills,marksmanship:9};
  const result=resolveSurvivors(s,{id:'ev',unitId:'u',roll:6,condition:'unharmed',disorganizations:0,skills,justification:'Tentativa proibida'});
  expect(result.units[0]?.skills.marksmanship).toBe(u.skills.marksmanship);
  expect(result.units[0]?.training).toBe('elite');
 });
 it('reconcilia custos de Poder em treino de sobreviventes e conserva histórico',()=>{
  const s=make();s.units=[{...unit(),costs:[{resource:'power',amount:12,mode:'allocation'}],allocatedCosts:{power:12}}];
  const n=resolveSurvivors(s,{id:'ev',unitId:'u',roll:1,condition:'unharmed',disorganizations:0,skills:unit().skills,justification:'Treino após batalha'});
  expect(n.units[0]?.training).toBe('trained');
  expect(n.units[0]?.allocatedCosts?.power).toBe(10);
  expect(balances(n).available.power).toBe(balances(s).available.power+2);
 });
 it('treinamento em campanha consome somente o Poder adicional de um nível',()=>{
  const s=make();s.units=[{...unit(),training:'trained',costs:[{resource:'power',amount:10,mode:'allocation'}],allocatedCosts:{power:10},xp:60}];
  const n=trainUnit(s,'u');
  expect(n.units[0]?.training).toBe('veteran');
  expect(n.units[0]?.allocatedCosts?.power).toBe(12);
  expect(n.units[0]?.evolution?.[0]?.condition).toBe('training');
  expect(balances(n).available.power).toBe(balances(s).available.power-2);
 });
 it('transferência entre domínios e baixa da unidade liberam apenas alocação',()=>{
  const s=make();s.units=[{...unit(),costs:[{resource:'power',amount:12,mode:'allocation'}],allocatedCosts:{power:12}}];
  const a=changeUnitState(s,{unitId:'u',domainId:'e',mounted:false,atHome:true,health:6,casualties:0,situation:'Transferida'});
  expect(a.units[0]?.domainId).toBe('e');
  const b=changeUnitState(a,{unitId:'u',disband:true,mounted:false,atHome:true,health:6,casualties:0,situation:'Desmobilizada'});
  expect(b.units[0]?.destroyed).toBe(true);expect(balances(b).available.power).toBe(90);expect(b.permanent.power).toBe(0);
 });
});
describe('Lote 7: equipamentos de cerco',()=>{
 it('catapulta média e quatro equipamentos adicionais aparecem no catálogo de cerco',()=>{
  for(const id of ['medium-catapult','siege-ladders','boiling-water','boiling-oil','wildfire'])
   expect(SIEGE.some(x=>x.id===id)).toBe(true);
  expect(SIEGE.find(x=>x.id==='medium-catapult')).toMatchObject({cost:2,damage:5,health:20,armor:3,range:400,movement:0});
 });
 it('troca operadores no mesmo domínio e destruição não devolve custo',()=>{
  const s=make();s.units=[{...unit(),id:'eng',types:['engineers']},{...unit(),id:'carrier'}];
  const a=buySiege(s,{id:'siege1',itemId:'medium-catapult',engineerId:'eng',carrierId:'',domainId:'d',name:'Catapulta'});
  const b=changeSiegeAssignment(a,{id:'siege1',engineerId:'eng',carrierId:'',destroyed:false});
  const c=changeSiegeAssignment(b,{id:'siege1',engineerId:'',carrierId:'',destroyed:true});
  expect(c.holdings[0]?.status).toBe('destroyed');
  expect(c.permanent.wealth).toBe(-2);
  expect(()=>changeSiegeAssignment(c,{id:'siege1',engineerId:'eng',carrierId:'',destroyed:false})).toThrow('não disponível');
 });
});
