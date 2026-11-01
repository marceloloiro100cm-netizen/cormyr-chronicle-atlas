import {describe,expect,it} from 'vitest';
import {advance,balances,unitStats} from '@/lib/house/engine';
import {houseEffectLedger,resolveHouseNumericBonus} from '@/lib/house/house-effect-ledger';
import {unitMilitaryBonuses,quoteMilitaryUnit} from '@/lib/house/military-bonuses';
import {newHouseState,SKILLS,type Holding,type Unit} from '@/lib/house/types';

const start=1522*12;
const makeHolding=(id:string,itemId:string,status:Holding['status'],
 parentId?:string):Holding=>({
 id,itemId,name:itemId,domainId:'vale',parentId,status,
 costs:[],effects:[],ruleVersion:'lote21',source:'teste temporal multianual',
});
const unit=(id:string):Unit=>({
 id,name:id,types:['infantry'],training:'trained',domainId:'vale',origin:'',
 skills:Object.fromEntries(SKILLS.map(k=>[k,2])) as Unit['skills'],
 xp:60,costs:[],armor:3,armorPenalty:2,health:6,casualties:0,strength:100,
 disciplineModifier:0,equipment:[],situation:'Em guarnição',notes:'',atHome:true,
});
function fixture(){
 const s=newHouseState('house-l21','',start);
 s.phase='active';s.treasury=125;
 s.base.power=40;s.base.wealth=12;s.base.population=25;s.base.lands=15;
 s.domains=[{id:'vale',name:'Vale',terrain:'hills',features:[],notes:''}];
 s.units=[unit('a'),unit('b')];
 const stable=makeHolding('financial','pros-charcoal','active');
 stable.effects=[
  {kind:'fortune',amount:1,description:'Sorte derivada (não automática)'},
  {kind:'gain',resource:'wealth',amount:1,description:'Ganho só ao resolver evento'},
  {kind:'mitigation',resource:'wealth',amount:1,description:'Mitigação eventual'},
 ];
 s.holdings=[stable,makeHolding('fort','tower','building'),
  makeHolding('engineer','pros-engineer','building','fort')];
 s.projects=[
  {id:'work-engineer',holdingId:'engineer',name:'Engenharia',
   start,duration:3,modifier:0,status:'building',dice:[]},
  {id:'work-fort',holdingId:'fort',name:'Torre',
   start,duration:2,modifier:0,status:'building',dice:[]},
 ];
 return s;
}
describe('Lote 21 · projeções econômicas e militares entre anos',()=>{
 it('120 meses: nenhum crédito, débito, soldo, recrutamento ou duplicação de bônus',()=>{
  const initial=fixture(),base=balances(initial).total,units=structuredClone(initial.units);
  const fixed=structuredClone(initial.permanent);
  let current=initial;
  const months=[start+1,start+3,start+4,start+12,start+24,start+36,
   start+37,start+60,start+96,start+120];
  for(const month of months){
   current=advance(current,month);
   expect(current.month).toBe(month);
   expect(current.units).toEqual(units);
   expect(current.units).toHaveLength(2);
   expect(current.treasury).toBe(125);
   expect(current.permanent).toEqual(fixed);
   expect(balances(current).total).toEqual(base);
   expect(current.fortunes).toHaveLength(0);
   expect(current.actions).toHaveLength(0);
   expect(current.projects).toHaveLength(2);
   expect(current.holdings).toHaveLength(3);
   expect(new Set(current.holdings.map(h=>h.id)).size).toBe(3);
   expect(new Set(current.units.map(u=>u.id)).size).toBe(2);
   expect(houseEffectLedger(current).raw.gain.wealth).toBe(1);
   expect(resolveHouseNumericBonus(houseEffectLedger(current),'mitigation','wealth')).toBe(1);
   const b1=unitMilitaryBonuses(current,current.units[0]!);
   const b2=unitMilitaryBonuses(current,current.units[0]!);
   expect(b1).toEqual(b2);
   expect(b1.defense).toBe(month>=start+3?4:0);
   expect(unitStats(current.units[0]!,current).defense)
    .toBe(unitStats(units[0]!).defense+b1.defense);
   const quote=quoteMilitaryUnit(current,['infantry'],'trained');
   expect(quote).toEqual(quoteMilitaryUnit(current,['infantry'],'trained'));
   expect(quote).toEqual(quoteMilitaryUnit(initial,['infantry'],'trained'));
   expect(advance(current,month)).toEqual(current);
  }
  expect(initial.holdings[1]!.status).toBe('building');
  expect(current.holdings[1]!.status).toBe('active');
  expect(current.projects.every(p=>p.status==='completed')).toBe(true);
 });
 it('salto direto e saltos por etapas convergem para a mesma ficha sem dupla cobrança',()=>{
  const single=advance(fixture(),start+36);
  let stepped=fixture();
  for(let offset=1;offset<=36;offset++)stepped=advance(stepped,start+offset);
  expect(stepped).toEqual(single);
  expect(single.treasury).toBe(125);
  expect(single.permanent).toEqual(fixture().permanent);
  expect(single.units).toHaveLength(2);
  expect(unitMilitaryBonuses(single,single.units[1]!).defense).toBe(4);
  expect(houseEffectLedger(single)).toEqual(houseEffectLedger(stepped));
 });
 it('retrocesso não reduz mês já processado nem converte revisão em economia',()=>{
  const processed=advance(fixture(),start+36);
  const protectedBefore=structuredClone(processed);
  expect(()=>advance(processed,start+12)).toThrow('Período inválido');
  expect(processed).toEqual(protectedBefore);
  expect(advance(processed,start+36)).toEqual(protectedBefore);
  const future=advance(processed,start+37);
  expect(future.treasury).toBe(protectedBefore.treasury);
  expect(future.units).toEqual(protectedBefore.units);
  expect(future.permanent).toEqual(protectedBefore.permanent);
  expect(houseEffectLedger(future).raw.gain.wealth).toBe(1);
 });
 it('bonificação de guarnição é condicional e nunca gravada nas habilidades da unidade',()=>{
  const s=advance(fixture(),start+12);
  const u=s.units[0]!;
  const base=structuredClone(u);
  expect(unitMilitaryBonuses(s,u).defense).toBe(4);
  u.atHome=false;
  expect(unitMilitaryBonuses(s,u).defense).toBe(0);
  u.atHome=true;
  expect(unitMilitaryBonuses(s,u).defense).toBe(4);
  expect(u.skills).toEqual(base.skills);
  expect(u.armor).toBe(base.armor);
  expect(u.casualties).toBe(base.casualties);
  expect(s.permanent).toEqual(fixture().permanent);
 });
});
