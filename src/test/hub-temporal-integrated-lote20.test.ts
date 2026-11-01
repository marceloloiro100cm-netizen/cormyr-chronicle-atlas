import {describe,expect,it} from 'vitest';
import {advance,unitStats} from '@/lib/house/engine';
import {unitMilitaryBonuses,quoteMilitaryUnit} from '@/lib/house/military-bonuses';
import {houseEffectLedger} from '@/lib/house/house-effect-ledger';
import {newHouseState,SKILLS,type Holding,type Unit} from '@/lib/house/types';
import {monthFromHarptosDate} from '@/lib/calendar/house-time-impact';

const at=1522*12;
function fixture(){
 const s=newHouseState('lote20-house','',at);
 s.phase='active';s.treasury=125;
 s.base.power=30;s.base.wealth=10;
 s.domains=[{id:'vale',name:'Vale Isolado',terrain:'hills',features:[],notes:''}];
 const h=(id:string,itemId:string,parentId?:string):Holding=>({
  id,itemId,parentId,name:itemId,domainId:'vale',status:'building',
  costs:[],effects:[],ruleVersion:'lote20',source:'fixture',
 });
 s.holdings=[h('tower','tower'),h('engineer','pros-engineer','tower')];
 s.projects=[
  {id:'child-work',holdingId:'engineer',name:'Engenharia',start:at,
   duration:2,modifier:0,status:'building',dice:[]},
  {id:'parent-work',holdingId:'tower',name:'Torre',start:at,
   duration:1,modifier:0,status:'building',dice:[]},
 ];
 const u:Unit={
  id:'guard',name:'Guarda existente',types:['infantry'],training:'trained',
  domainId:'vale',origin:'',skills:Object.fromEntries(SKILLS.map(k=>[k,2])) as Unit['skills'],
  xp:40,costs:[],armor:3,armorPenalty:2,health:6,casualties:0,strength:100,
  disciplineModifier:0,equipment:[],situation:'Guarnição',notes:'',atHome:true,
 };
 s.units=[u];
 return s;
}
describe('Lote 20 · integração militar/posses sem reaplicação de efeitos',()=>{
 it('projeto dependente ativa fortificação e engenheiro sem duplicar bônus nas consultas',()=>{
  const s=fixture();
  const before=unitMilitaryBonuses(s,s.units[0]!);
  expect(before.defense).toBe(0);
  const completed=advance(s,at+3);
  expect(completed.projects.every(p=>p.status==='completed')).toBe(true);
  expect(completed.holdings.map(h=>h.status)).toEqual(['active','active']);
  const bonus=unitMilitaryBonuses(completed,completed.units[0]!);
  expect(bonus.defense).toBe(4); // Torre +3, Engenheiro +1, somente após conclusão
  expect(unitStats(completed.units[0]!,completed).defense)
   .toBe(unitStats(s.units[0]!).defense+4);
  expect(unitMilitaryBonuses(completed,completed.units[0]!).defense).toBe(4);
  expect(advance(completed,at+3)).toEqual(completed);
  expect(advance(completed,at+4).units).toEqual(completed.units);
  expect(completed.units).toEqual(s.units);
  expect(completed.holdings).toHaveLength(2);
  expect(completed.treasury).toBe(125);
  expect(completed.actions).toHaveLength(0);
  expect(completed.fortunes).toHaveLength(0);
  expect(s.holdings.map(h=>h.status)).toEqual(['building','building']);
 });
 it('retificação oficial não regride mês já processado da ficha nem cria tropas',()=>{
  const completed=advance(fixture(),at+12);
  const correctedOfficialDate=monthFromHarptosDate({year:1522,month:2});
  expect(correctedOfficialDate).toBeLessThan(completed.month);
  expect(()=>advance(completed,correctedOfficialDate)).toThrow('Período inválido');
  const returnMonth=monthFromHarptosDate({year:1523,month:0});
  expect(advance(completed,returnMonth)).toEqual(completed);
  expect(completed.units).toHaveLength(1);
  expect(unitMilitaryBonuses(completed,completed.units[0]!).defense).toBe(4);
 });
 it('projeções militares e econômicas só leem posses ativas, sem bônus acumulativo',()=>{
  const complete=advance(fixture(),at+3);
  const before=structuredClone(complete);
  const military1=unitMilitaryBonuses(complete,complete.units[0]!);
  const military2=unitMilitaryBonuses(complete,complete.units[0]!);
  const economic1=houseEffectLedger(complete);
  const economic2=houseEffectLedger(complete);
  expect(military1).toEqual(military2);
  expect(economic1).toEqual(economic2);
  expect(quoteMilitaryUnit(complete,['infantry'],'trained'))
   .toEqual(quoteMilitaryUnit(complete,['infantry'],'trained'));
  expect(complete).toEqual(before);
  expect(complete.permanent).toEqual(before.permanent);
 });
});
