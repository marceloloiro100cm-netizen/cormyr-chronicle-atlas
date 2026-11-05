import {describe,it,expect} from 'vitest';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {makeFictionalStack,makeBattleSetup} from '@/lib/battle/domain/setup';
import {startBattle,applyBattleCommand} from '@/lib/battle/domain/turns';
import {chooseAiCommand,runAiActivation,runAiUntilHuman} from '@/lib/battle/domain/ai';
import {battleHash,captureReplay,verifyReplay,exportReplayJson,parseReplayJson} from '@/lib/battle/domain/replay';
import type {BattleState,BattleCommand} from '@/lib/battle/domain/types';
function initial(controls:BattleState['controls']={attacker:'human',defender:'ai'}){
 const map=createScenario('plain-open'),a=makeFictionalStack({id:'a',side:'attacker',name:'A',typeId:'infantry',training:'green',count:30,position:map.deployment.attacker[0]!});
 const b=makeFictionalStack({id:'b',side:'defender',name:'B',typeId:'archers',training:'green',count:40,position:map.deployment.defender[0]!});
 return makeBattleSetup({id:'replay',name:'Arena',seed:'fixed',map,controls,stacks:[a,b]});
}
describe('Batalha V2 — lote 8 IA e replay',()=>{
 it('escolhe comandos legais, sem WAIT; ambos IA atingem estado terminal',()=>{
  let state=startBattle(initial({attacker:'ai',defender:'ai'}));
  const check=chooseAiCommand(state);
  expect(check.type).not.toBe('WAIT');
  expect(()=>runAiActivation(state)).not.toThrow();
  const result=runAiUntilHuman(state,900);
  expect(result.state.phase).toBe('completed');
  expect(result.commands.length).toBeGreaterThan(0);
  expect(result.commands.every(c=>c.type!=='WAIT'&&c.type!=='MANUAL_FINISH')).toBe(true);
  expect(result.state.round).toBeLessThanOrEqual(20);
 });
 it('mesmos dados e comandos geram hashes idênticos; fraude é detectada',()=>{
  const ready=initial({attacker:'ai',defender:'ai'});
  const complete=runAiUntilHuman(startBattle(ready),900);
  const replay=captureReplay(ready,complete.commands);
  expect(verifyReplay(replay).state).toEqual(complete.state);
  expect(captureReplay(ready,complete.commands)).toEqual(replay);
  expect(battleHash({b:2,a:1})).toBe(battleHash({a:1,b:2}));
  expect(battleHash(complete.state)).toBe(replay.finalStateHash);
  const forged=structuredClone(replay) as {commands:{stateHash:string}[]};
  forged.commands[0]!.stateHash='f'.repeat(64);
  expect(()=>verifyReplay(forged)).toThrow('Integridade não confirmada');
  expect(parseReplayJson(exportReplayJson(ready,complete.state)).state).toEqual(complete.state);
 });
 it('20 fixtures determinísticas, com limites e sem mutação de snapshots',()=>{
  for(let i=0;i<20;i++){
   const ready=initial({attacker:'ai',defender:'ai'});
   const clone=structuredClone(ready);
   const completed=runAiUntilHuman(startBattle(ready),900);
   const again=runAiUntilHuman(startBattle(clone),900);
   expect(completed.state).toEqual(again.state);
   expect(battleHash(completed.state)).toBe(battleHash(again.state));
   expect(ready).toEqual(clone);
  }
 });
 it('nenhuma ação inválida entra no replay',()=>{
  const ready=initial();
  expect(()=>captureReplay(ready,[{type:'ATTACK',unitId:'b',targetId:'a'}] as BattleCommand[])).toThrow();
  const s=startBattle(ready);
  const out=applyBattleCommand(s,{type:'END_ACTIVATION',unitId:'a'});
  expect(verifyReplay(captureReplay(ready,[{type:'END_ACTIVATION',unitId:'a'}])).state).toEqual(out);
 });
});
