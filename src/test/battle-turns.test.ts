import {describe,it,expect} from 'vitest';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {offsetToAxial,hexKey} from '@/lib/battle/geometry/hex';
import {makeFictionalStack,makeBattleSetup} from '@/lib/battle/domain/setup';
import {activationOrder,applyBattleCommand,getLegalActions,startBattle,archiveBattle} from '@/lib/battle/domain/turns';
import type {BattleState} from '@/lib/battle/domain/types';
function initial():BattleState{
 const map=createScenario('plain-open');
 const a=makeFictionalStack({id:'a',side:'attacker',name:'Alfa',typeId:'infantry',training:'green',count:100,position:map.deployment.attacker[0]!});
 const b=makeFictionalStack({id:'b',side:'defender',name:'Beta',typeId:'infantry',training:'green',count:100,position:map.deployment.defender[0]!});
 return startBattle(makeBattleSetup({id:'b1',name:'Simulação',seed:'fixed',
   map,controls:{attacker:'human',defender:'human'},stacks:[a,b]}));
}
describe('Batalha V2 — lote 3, turnos determinísticos',()=>{
 it('ordena iniciativa por valor, atacante antes do defensor, e ID',()=>{
  const state=initial();
  expect(activationOrder(state.stacks)).toEqual(['a','b']);
  expect(state.activeUnitId).toBe('a');
  expect(state.round).toBe(1);
 });
 it('move no máximo uma vez e nunca aceita comando ilegal sem alterar estado',()=>{
  const state=initial(),from=state.stacks[0]!.position;
  const to=offsetToAxial(2,0);
  const moved=applyBattleCommand(state,{type:'MOVE',unitId:'a',to});
  expect(moved.stacks[0]!.position).toEqual(to);
  expect(moved.stacks[0]!.movedThisActivation).toBe(true);
  expect(state.stacks[0]!.position).toEqual(from);
  expect(moved.events).toHaveLength(1);
  expect(()=>applyBattleCommand(moved,{type:'MOVE',unitId:'a',to:offsetToAxial(3,0)})).toThrow();
  expect(()=>applyBattleCommand(moved,{type:'END_ACTIVATION',unitId:'b'})).toThrow();
  expect(moved.events).toHaveLength(1);
 });
 it('DEFEND encerra e o escudo persiste até a ativação seguinte',()=>{
  let state=initial();
  state=applyBattleCommand(state,{type:'DEFEND',unitId:'a'});
  expect(state.stacks[0]!.defenseGuard).toBe(true);
  expect(state.activeUnitId).toBe('b');
  state=applyBattleCommand(state,{type:'END_ACTIVATION',unitId:'b'});
  expect(state.round).toBe(2);
  expect(state.activeUnitId).toBe('a');
  expect(state.stacks[0]!.defenseGuard).toBe(false);
 });
 it('WAIT leva para o fim da fila e não duplica turnos',()=>{
  let state=initial();
  state=applyBattleCommand(state,{type:'WAIT',unitId:'a'});
  expect(state.activeUnitId).toBe('b');
  expect(state.waitingQueue).toEqual(['a']);
  state=applyBattleCommand(state,{type:'END_ACTIVATION',unitId:'b'});
  expect(state.activeUnitId).toBe('a');
  expect(state.stacks[0]!.waitedThisRound).toBe(true);
  expect(()=>applyBattleCommand(state,{type:'WAIT',unitId:'a'})).toThrow();
  state=applyBattleCommand(state,{type:'END_ACTIVATION',unitId:'a'});
  expect(state.round).toBe(2);
  expect(state.activeUnitId).toBe('a');
 });
 it('ataque legal adjacente é placeholder sem dano e encerra ativação',()=>{
  const base=initial();
  const adjacent={...base,stacks:base.stacks.map(s=>s.id==='b'?{...s,position:offsetToAxial(1,1)}:s)};
  expect(getLegalActions(adjacent).some(c=>c.type==='ATTACK')).toBe(true);
  const result=applyBattleCommand(adjacent,{type:'ATTACK',unitId:'a',targetId:'b'});
  expect(result.stacks.find(s=>s.id==='b')!.currentHp).toBe(1000);
  expect(result.activeUnitId).toBe('b');
  expect(result.events[0]!.type).toBe('ATTACK_PENDING_RESOLUTION');
  expect(()=>applyBattleCommand(result,{type:'MOVE',unitId:'a',to:offsetToAxial(2,0)})).toThrow();
 });
 it('tiro exige linha de visão e proíbe adjacência inimiga',()=>{
  const base=initial(),archer=makeFictionalStack({id:'a',name:'Arqueiros',side:'attacker',
    training:'trained',typeId:'archers',count:100,position:offsetToAxial(3,3)});
  const defender={...base.stacks[1]!,position:offsetToAxial(6,3)};
  const state={...base,stacks:[archer,defender],activeUnitId:'a'};
  expect(getLegalActions(state).some(c=>c.type==='ATTACK')).toBe(true);
  const engaged={...state,stacks:[archer,{...defender,position:offsetToAxial(4,3)}]};
  expect(getLegalActions(engaged).some(c=>c.type==='ATTACK')).toBe(false);
  const blocked={...state,map:{...state.map,tiles:state.map.tiles.map(t=>hexKey(t)===hexKey(offsetToAxial(4,3))?{...t,terrain:'forest' as const}:t)}};
  expect(getLegalActions(blocked).some(c=>c.type==='ATTACK')).toBe(false);
 });
 it('fecha por inatividade, permite encerramento do Narrador e arquivamento',()=>{
  let state=initial();
  for(let i=0;i<4;i++)state=applyBattleCommand(state,{type:'END_ACTIVATION',unitId:state.activeUnitId});
  expect(state.phase).toBe('completed');
  expect(state.resultReason).toBe('stalemate');
  expect(archiveBattle(state).phase).toBe('archived');
  const active=initial();
  expect(()=>applyBattleCommand(active,{type:'MANUAL_FINISH',reason:'Resultado manual',winnerSide:'attacker'},'ai')).toThrow();
  expect(applyBattleCommand(active,{type:'MANUAL_FINISH',reason:'Fim narrativo!',winnerSide:null}).phase).toBe('completed');
  expect(()=>applyBattleCommand(active,{type:'MOVE',unitId:'a',to:offsetToAxial(20,20),extra:true})).toThrow();
 });
});
