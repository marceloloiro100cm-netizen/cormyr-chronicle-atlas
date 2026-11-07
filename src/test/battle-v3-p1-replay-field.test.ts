import {describe,it,expect} from 'vitest';
import {createV3Game,v3PlayCommand,v3UseCommander,v3RunAi} from '@/lib/battle/v3/engine';
import {getLegalActions} from '@/lib/battle/domain/turns';
import {fieldUnitAtHex} from '@/lib/battle/v3/field';
import {exportV3ReplayJson,parseV3ReplayJson,verifyV3Replay} from '@/lib/battle/v3/replay';
import {battleHash} from '@/lib/battle/domain/replay';
const options={attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
 attackerCommander:'tillet' as const,defenderCommander:'ashkar-raider' as const,
 scenario:'plain-open' as const,opponent:'human' as const};
describe('P1 — Cruzada V3 recuperável e hexágonos livres após debandada',()=>{
 it('registra comandos em replay reexecutável e recusa alteração de hash',()=>{
  const initial=createV3Game(options);
  const command=getLegalActions(initial.battle).find(c=>c.type==='MOVE');
  expect(command).toBeDefined();
  const advanced=v3PlayCommand(initial,command!);
  const file=exportV3ReplayJson(advanced);
  const resumed=parseV3ReplayJson(file).game;
  expect(battleHash(resumed)).toBe(battleHash(advanced));
  expect(resumed.steps).toHaveLength(1);
  const tampered=JSON.parse(file) as {receipts:{hash:string}[]};
  tampered.receipts[0]!.hash='0'.repeat(64);
  expect(()=>verifyV3Replay(tampered)).toThrow(/integridade/);
 });
 it('recusa arquivos JSON estranhos ou grandes e não importa estado arbitrário',()=>{
  expect(()=>parseV3ReplayJson('{"mode":"PTE-3.0-SANDBOX"}')).toThrow();
  expect(()=>parseV3ReplayJson('x'.repeat(1_500_001))).toThrow(/1,5 MB/);
  expect(()=>parseV3ReplayJson('{invalid')).toThrow(/JSON/);
 });
 it('poder único de comandante permanece consumido após importação',()=>{
  const initial=createV3Game(options);
  const active=initial.battle.stacks.find(s=>s.id===initial.battle.activeUnitId)!;
  const target=initial.battle.stacks.find(s=>s.side===active.side)!;
  const advanced=v3UseCommander(initial,target.id);
  const resumed=parseV3ReplayJson(exportV3ReplayJson(advanced)).game;
  expect(resumed.usedPowers[active.side]).toBe(true);
  expect(battleHash(resumed)).toBe(battleHash(advanced));
 });
 it('IA determinística aparece como um único passo verificável',()=>{
  const initial=createV3Game({...options,opponent:'ai'});
  let current=initial;
  for(let i=0;i<20&&current.battle.phase==='active';i++){
   const active=current.battle.stacks.find(s=>s.id===current.battle.activeUnitId)!;
   if(current.battle.controls[active.side]==='ai')break;
   current=v3PlayCommand(current,{type:'END_ACTIVATION',unitId:active.id});
  }
  const turn=current.battle.stacks.find(s=>s.id===current.battle.activeUnitId);
  expect(turn&&current.battle.controls[turn.side]).toBe('ai');
  const after=v3RunAi(current);
  expect(after.steps.at(-1)?.type).toBe('AI');
  expect(battleHash(parseV3ReplayJson(exportV3ReplayJson(after)).game)).toBe(battleHash(after));
 });
 it('unidade em debandada não ocupa destino selecionável mesmo com PV restantes',()=>{
  const game=createV3Game(options);
  const selected=game.battle.stacks.find(s=>s.currentHp>0)!;
  const routed={...selected,moraleState:'routed' as const};
  expect(fieldUnitAtHex([routed],routed.position)).toBeUndefined();
  expect(fieldUnitAtHex([selected],selected.position)?.id).toBe(selected.id);
  expect(fieldUnitAtHex([{...selected,currentHp:0}],selected.position)).toBeUndefined();
 });
});
