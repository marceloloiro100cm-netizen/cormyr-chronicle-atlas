import {describe,it,expect} from 'vitest';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {offsetToAxial,hexKey} from '@/lib/battle/geometry/hex';
import {makeFictionalStack,makeBattleSetup} from '@/lib/battle/domain/setup';
import {resolveDamage} from '@/lib/battle/domain/combat';
import {battleOutcome} from '@/lib/battle/domain/victory';
import {moraleThresholds,casualtyCount,livingCount,stateAfterDamage} from '@/lib/battle/domain/morale';
import {startBattle,applyBattleCommand} from '@/lib/battle/domain/turns';
import {battleReport} from '@/lib/battle/domain/report';

const stack=(id:string,side:'attacker'|'defender',typeId='infantry',count=100)=>
  makeFictionalStack({id,side,name:id,typeId,training:'green',count,position:offsetToAxial(side==='attacker'?2:3,4)});
describe('Batalha V2 — lote 4, regressões PTE-2.0',()=>{
 it('B-015: 100 infantarias, 176 dano, 17 mortos, 824 PV e 6 PV residuais',()=>{
  const map=createScenario('plain-open');
  const a={...stack('a','attacker'),attack:4};
  const b={...stack('b','defender'),defense:4};
  const hit=resolveDamage(map,a,b,false);
  expect(hit).toMatchObject({damage:176,casualties:17,aliveAfter:83,residualWoundHp:6});
  expect(hit.defender.currentHp).toBe(824);
 });
 it('B-016: cobertura florestal reduz 100 arqueiros a 70 PV de dano e 7 baixas',()=>{
  const original=createScenario('plain-open');
  const a={...stack('a','attacker','archers'),attack:4};
  const b={...stack('b','defender'),defense:4};
  const map={...original,tiles:original.tiles.map(t=>hexKey(t)===hexKey(b.position)?{...t,terrain:'forest' as const}:t)};
  const hit=resolveDamage(map,a,b,true);
  expect(hit.damage).toBe(70);
  expect(hit.casualties).toBe(7);
 });
 it('limiares de moral sobem com treino e não há regressão de abalada/debandada',()=>{
  const s=stack('a','attacker');
  expect(moraleThresholds(s)).toEqual({shaken:40,routed:70});
  const shaken=stateAfterDamage(s,600);
  expect(shaken.moraleState).toBe('shaken');
  const routed=stateAfterDamage(shaken,300);
  expect(routed.moraleState).toBe('routed');
  expect(stateAfterDamage(routed,300).moraleState).toBe('routed');
  expect(casualtyCount(routed)).toBe(70);
 });
 it('retaliação usa sobreviventes, só uma vez por rodada',()=>{
  const map=createScenario('plain-open');
  let a=stack('a','attacker'),b=stack('b','defender');
  const s=startBattle(makeBattleSetup({id:'f',name:'Melee',seed:'abc',
    map,controls:{attacker:'human',defender:'human'},
    stacks:[{...a,position:map.deployment.attacker[0]!},{...b,position:map.deployment.defender[0]!}]}));
  // Aproximação controlada de unidades prontas ao combate corpo a corpo.
  const ready={...s,stacks:s.stacks.map(x=>x.side==='attacker'?{...x,position:offsetToAxial(3,3)}:{...x,position:offsetToAxial(4,3)})};
  const once=applyBattleCommand(ready,{type:'ATTACK',unitId:'a',targetId:'b'});
  const damage=once.events.filter(e=>e.type==='DAMAGE');
  const retal=once.events.filter(e=>e.type==='RETALIATION');
  expect(damage).toHaveLength(1);
  expect(retal).toHaveLength(1);
  expect(retal[0]!.delta['aliveAttacker']).toBeLessThan(100);
  expect(once.stacks.find(x=>x.id==='b')!.retaliationUsedRound).toBe(1);
  expect(once.stacks.find(x=>x.id==='a')!.currentHp).toBeLessThan(1000);
 });
 it('debandada entrega vitória sem fingir que todos morreram',()=>{
  const a=stack('a','attacker'),b=stateAfterDamage(stack('b','defender'),300);
  expect(b.moraleState).toBe('routed');
  expect(livingCount(b)).toBe(30);
  expect(battleOutcome([a,b])).toEqual({winner:'attacker',reason:'rout'});
 });
 it('relatório descreve perdas táticas separadas da ficha',()=>{
  const map=createScenario('plain-open');
  const a=stack('a','attacker'),b=stack('b','defender');
  const battle=makeBattleSetup({id:'f',name:'Teste',seed:'a',map,controls:{attacker:'human',defender:'human'},
    stacks:[{...a,position:map.deployment.attacker[0]!},{...b,position:map.deployment.defender[0]!}]});
  const result=battleReport(battle);
  expect(result.bySide.attacker.initial).toBe(100);
  expect(result.units[0]!.casualties).toBe(0);
 });
});
