import {describe,it,expect} from 'vitest';
import {newHouseState,RESOURCE_KEYS} from '@/lib/house/types';
import {balances} from '@/lib/house/engine';
import {FOUNDATIONS,regionBonus} from '@/lib/house/regions';
import {rollFoundation,rollHistoricalEvent,historyAdjustments,memberBonusAdjustments,HISTORY_TABLE,HISTORY_EFFECTS} from '@/lib/house/creation-history';

function diceForTotal(total:number):number[]{
 for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)for(let c=1;c<=6;c++)
   if(a+b+c===total)return [a,b,c];
 throw new Error('invalid 3d6 sum');
}
const rollSequence=(values:number[],otherwise=6)=>{
 let i=0;return ()=>values[i++]??otherwise;
};
const base=()=>{const s=newHouseState('test');s.base={defense:20,influence:20,lands:20,law:20,population:20,power:20,wealth:20};s.identity.region='swordmark';s.regionalApplied=true;return s;};

describe('itens 1–5: criação auditável',()=>{
 it('Tabela 6-3 preserva 1d6 de fundação e 1d6 de quantidade, com piso mínimo',()=>{
  for(let foundation=1;foundation<=6;foundation++)for(let count=1;count<=6;count++){
   const h=rollFoundation(rollSequence([foundation,count]));
   expect(h.foundationRoll).toBe(foundation);
   expect(h.eventCountRoll).toBe(count);
   expect(h.limit).toBe(Math.max(1,count+[3,2,1,0,-1,-2][foundation-1]!));
   expect(h.events).toHaveLength(0);
   expect(h.applied).toBe(false);
  }
  expect(FOUNDATIONS).toHaveLength(6);
 });
 it('Tabela 6-4 possui 16 eventos com resultado mecânico em cada caso',()=>{
  for(let total=3;total<=18;total++){
   const event=rollHistoricalEvent(rollSequence(diceForTotal(total)),['defense','wealth'],'event-'+total);
   expect(event.result).toBe(total);
   expect(event.name).toBe(HISTORY_TABLE[total]);
   expect(HISTORY_EFFECTS[total]).toBeTruthy();
   expect(event.dice).toHaveLength(3);
   expect(Object.keys(event.changes).length).toBeGreaterThan(0);
  }
 });
 it('Derrocada aplica 2d6 distintos a cada um dos sete recursos',()=>{
  const event=rollHistoricalEvent(rollSequence([1,1,1],6),['defense','wealth'],'derrocada');
  expect(RESOURCE_KEYS.every(r=>event.changes[r]===-12&&(event.modifierDice[r]??[]).length===2)).toBe(true);
 });
 it('Loucura calcula seis menos 2d6 por recurso',()=>{
  const event=rollHistoricalEvent(rollSequence([1,2,3],6),['defense','wealth'],'loucura');
  expect(event.result).toBe(6);
  expect(RESOURCE_KEYS.every(r=>event.changes[r]===-6)).toBe(true);
 });
 it('Infraestrutura exige dois recursos distintos e aplica somente aos escolhidos',()=>{
  const roll=diceForTotal(11);
  expect(()=>rollHistoricalEvent(rollSequence(roll),['influence','influence'],'bad')).toThrow('dois recursos');
  const event=rollHistoricalEvent(rollSequence(roll),['law','wealth'],'valid');
  expect(event.changes).toEqual({law:6,wealth:6});
 });
 it('Ventura aplica 2d6 na Riqueza, 1d6 nos outros cinco e não altera Poder',()=>{
  const event=rollHistoricalEvent(rollSequence([6,6,6],4),['defense','wealth'],'ventura');
  expect(event.changes.wealth).toBe(8);
  expect(event.changes.power).toBeUndefined();
  for(const r of ['defense','influence','lands','law','population'] as const)expect(event.changes[r]).toBe(4);
 });
 it('Eventos calculam o piso zero após CADA evento e não modificam dados-base',()=>{
  const s=base();s.regionalApplied=false;s.base.defense=5;
  s.creationHistory={...rollFoundation(rollSequence([4,2])),events:[
   {id:'1',dice:[1,1,1],result:3,name:'Derrocada',changes:{defense:-12},modifierDice:{}},
   {id:'2',dice:[6,6,6],result:18,name:'Ventura',changes:{defense:3},modifierDice:{}},
  ],applied:false};
  expect(historyAdjustments(s).defense).toBe(-2);
  expect(balances(s).total.defense).toBe(3);
  expect(s.base.defense).toBe(5);
  expect(s.permanent.defense).toBe(0);
 });
 it('Bônus pessoais somam com eventos sem duplicar bônus regional',()=>{
  const s=base();s.creationBonuses=[{playerId:'p1',resource:'law',die:4},{playerId:'p2',resource:'law',die:2}];
  expect(memberBonusAdjustments(s).law).toBe(6);
  expect(balances(s).total.law).toBe(36);
  expect(Object.values(regionBonus('swordmark')).reduce((n,v)=>n+v,0)).toBe(70);
 });
 it('Históricos importados ou já consolidados nunca aplicam modificadores novamente',()=>{
  const s=base();
  s.creationHistory={...rollFoundation(rollSequence([4,2])),
   events:[{id:'1',dice:[6,6,6],result:18,name:'Ventura',changes:{wealth:12},modifierDice:{}}],applied:false};
  s.creationBonuses=[{playerId:'p1',resource:'power',die:5}];
  s.method='import';expect(historyAdjustments(s).wealth).toBe(0);
  expect(memberBonusAdjustments(s).power).toBe(0);
  s.method='budget';s.creationHistory.applied=true;s.creationBonusesApplied=true;
  expect(historyAdjustments(s).wealth).toBe(0);
  expect(memberBonusAdjustments(s).power).toBe(0);
 });
 it('RNG e escolhas inválidas são recusados',()=>{
  expect(()=>rollFoundation(()=>0)).toThrow('RNG');
  expect(()=>rollHistoricalEvent(()=>7,['defense','wealth'],'bad')).toThrow('RNG');
 });
});
