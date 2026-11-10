import {describe,expect,it} from 'vitest';
import {createWarBattle,issueWarOrder,issueWarPincer,previewWarOrderDifficulty} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {makeWarFortification} from '@/lib/battle/got/fortifications';
import type {WarBattle,WarUnit} from '@/lib/battle/got/types';

function unit(id:string,side:'attacker'|'defender',x:number,y:number):WarUnit{
 return modelWarUnit({id,name:id,side,typeId:'infantry',position:{x,y},training:'elite'});
}
function scenario(units:WarUnit[],fort=false):WarBattle{
 const b=createWarBattle({id:'strategic-combos',name:'Pinça e Martelo',
  seed:'cerco-combinado',width:12,height:8,
  commanders:modelWarCommanders({attacker:12,defender:9}),units,
  advancedFormations:true,fortifications:fort?[makeWarFortification({
   id:'wall',name:'Muralha',kind:'tower',side:'defender',
   cells:[{x:3,y:2}],engineerBuilt:false,hoursBuilt:7,
  })]:[]});
 return {...b,phase:'orders',turn:'attacker'};
}
describe('Capítulo 10 — Pinça, Martelo e Bigorna, Escalar muralhas',()=>{
 it('Pinça divide exatamente Guerra e dá +1D em dois ataques quando ambos passam',()=>{
  const b=scenario([
   {...unit('a','attacker',2,3),ability:{...unit('a','attacker',2,3).ability,fighting:8}},
   {...unit('b','attacker',3,2),ability:{...unit('b','attacker',3,2).ability,fighting:8}},
   {...unit('enemy','defender',3,3),health:60,maxHealth:60,
    ability:{...unit('enemy','defender',3,3).ability,endurance:20}},
  ]);
  const snapshot=JSON.stringify(b);
  const out=issueWarPincer(b,{commanderId:'leader-attacker',firstUnitId:'a',
   secondUnitId:'b',targetId:'enemy',firstWarfareDice:6});
  expect(out.passed).toBe(true);
  expect(out.battle.events.filter(e=>e.kind==='attack')).toHaveLength(2);
  expect(out.battle.events.some(e=>e.kind==='pincer-command')).toBe(true);
  expect(out.battle.units.find(u=>u.id==='a')?.issuedThisRound).toBe(1);
  expect(out.battle.units.find(u=>u.id==='b')?.issuedThisRound).toBe(1);
  expect(out.battle.ordersRemaining['leader-attacker'])
   .toBe(b.ordersRemaining['leader-attacker']!-1);
  expect(JSON.stringify(b)).toBe(snapshot);
 });
 it('Pinça não aceita unidades repetidas, fora do alcance ou divisão inválida',()=>{
  const b=scenario([unit('a','attacker',2,2),
   unit('b','attacker',8,2),unit('enemy','defender',3,2)]);
  const params={commanderId:'leader-attacker',firstUnitId:'a',
   secondUnitId:'b',targetId:'enemy',firstWarfareDice:6};
  expect(()=>issueWarPincer(b,params)).toThrow(/adjacentes/);
  expect(()=>issueWarPincer(b,{...params,secondUnitId:'a'}))
   .toThrow(/dois aliados/);
  const adjacent={...b,units:b.units.map(u=>u.id==='b'?{
   ...u,position:{x:3,y:3},
  }:u)};
  expect(()=>issueWarPincer(adjacent,{...params,firstWarfareDice:12}))
   .toThrow(/Divida exatamente/);
  expect(()=>issueWarOrder(b,{commanderId:'leader-attacker',
   unitId:'a',order:{kind:'pincer'}})).toThrow(/simultâneo/);
 });
 it('Martelo e Bigorna desloca alvo com Atletismo oposto até aliado de prontidão',()=>{
  const watcher=unit('anvil','attacker',6,3);
  const b=scenario([
   {...unit('hammer','attacker',2,3),
    ability:{...unit('hammer','attacker',2,3).ability,athletics:12}},
   {...watcher,facing:'west',standing:{kind:'ready',ready:{
    trigger:'enemy-adjacent',reaction:'attack',ranged:false,
   }}},
   {...unit('target','defender',3,3),
    ability:{...unit('target','defender',3,3).ability,athletics:1,endurance:20},
    health:60,maxHealth:60},
  ]);
  const r=issueWarOrder(b,{commanderId:'leader-attacker',
   unitId:'hammer',order:{kind:'hammer-anvil',
    targetId:'target',auxiliaryUnitId:'anvil'}});
  expect(r.passed).toBe(true);
  expect(r.battle.events.some(e=>e.kind==='hammer-anvil')).toBe(true);
  expect(r.battle.units.find(u=>u.id==='target')?.position).toEqual({x:5,y:3});
  expect(r.battle.events.filter(e=>e.kind==='attack')).toHaveLength(1);
  expect(r.battle.units.find(u=>u.id==='anvil')?.standing).toBeNull();
 });
 it('Martelo e Bigorna não funciona sem Prontidão válida',()=>{
  const b=scenario([unit('hammer','attacker',2,3),
   unit('anvil','attacker',6,3),unit('target','defender',3,3)]);
  expect(()=>issueWarOrder(b,{commanderId:'leader-attacker',unitId:'hammer',
   order:{kind:'hammer-anvil',targetId:'target',auxiliaryUnitId:'anvil'}}))
   .toThrow(/Prontidão/);
 });
 it('Escalar Muralhas usa Atletismo e move unidade para célula livre',()=>{
  const a=unit('a','attacker',2,2),d=unit('d','defender',9,2);
  const b=scenario([{...a,ability:{...a.ability,athletics:12}},d],true);
  const r=issueWarOrder(b,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'climb-walls',fortId:'wall',wallDifficulty:3}});
  expect(r.passed).toBe(true);
  expect(r.battle.units.find(u=>u.id==='a')?.position).toEqual({x:3,y:2});
  expect(r.battle.units.find(u=>u.id==='a')?.wallClimbedRound).toBe(1);
  expect(r.battle.events.some(e=>e.kind==='climb-walls')).toBe(true);
 });
 it('Escalada impossível mantém unidade no lugar e custo de ordem é testado',()=>{
  const a=unit('a','attacker',2,2);
  const b=scenario([a,unit('d','defender',9,2)],true);
  expect(()=>issueWarOrder(b,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'climb-walls',fortId:'wall',wallDifficulty:31}}))
   .toThrow(/3 e 30/);
  expect(b.units.find(u=>u.id==='a')?.position).toEqual({x:2,y:2});
 });
});

describe('P1: prévia da dificuldade de ordens GoT',()=>{
 it('mantém a mesma fórmula no painel e na emissão da ordem sem antecipar dados',()=>{
  const a={...unit('a','attacker',2,3),issuedThisRound:1,
   disorganizations:1,formation:'mob' as const};
  const battle=scenario([a,unit('enemy','defender',5,3)]);
  const order={kind:'formation' as const,formation:'shield-wall' as const};
  const snapshot=JSON.stringify(battle);
  const preview=previewWarOrderDifficulty(battle,a,order);
  expect(preview.parts).toEqual(expect.arrayContaining([
   {label:'Desorganizações',value:3},
   {label:'Ordens extras',value:3},
   {label:'Nova formação ou giro',value:6},
   {label:'Disciplina da formação atual',value:6},
  ]));
  expect(JSON.stringify(battle)).toBe(snapshot);
  const result=issueWarOrder(battle,{commanderId:'leader-attacker',unitId:'a',order});
  expect(result.difficulty).toBe(preview.difficulty);
  expect(result.battle.events.some(e=>e.kind==='command'&&
   e.difficulty===preview.difficulty)).toBe(true);
 });
 it('pula a penalidade de Escalar quando já há escadas apropriadas',()=>{
  const a={...unit('a','attacker',2,3),fieldEquipment:'ladders' as const};
  const battle=scenario([a,unit('d','defender',5,3)]);
  const preview=previewWarOrderDifficulty(battle,a,{kind:'climb-walls'});
  expect(preview.advancedModifier).toBe(0);
  expect(battle.turn).toBe('attacker');
  expect(battle.ordersRemaining['leader-attacker']).toBe(12);
 });
});
