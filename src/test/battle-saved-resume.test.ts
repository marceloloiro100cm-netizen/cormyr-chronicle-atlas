import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {makeFictionalStack,makeBattleSetup} from '@/lib/battle/domain/setup';
import {startBattle,applyBattleCommand} from '@/lib/battle/domain/turns';
import {exportReplayJson,parseReplayJson,battleHash} from '@/lib/battle/domain/replay';

const source=(path:string)=>readFileSync(resolve(path),'utf8');
describe('Batalha V2 — retomada local de replay persistido',()=>{
 it('reconstitui e continua uma batalha, preservando a cópia original',()=>{
  const map=createScenario('plain-open');
  const a=makeFictionalStack({id:'a',side:'attacker',name:'A',typeId:'infantry',
   training:'trained',count:40,position:map.deployment.attacker[0]!});
  const b=makeFictionalStack({id:'b',side:'defender',name:'B',typeId:'archers',
   training:'trained',count:40,position:map.deployment.defender[0]!});
  const initial=makeBattleSetup({id:'resume-case',name:'Batalha a retomar',
   seed:'resume-v2',map,controls:{attacker:'human',defender:'human'},stacks:[a,b]});
  const started=startBattle(initial);
  const step1=applyBattleCommand(started,{type:'END_ACTIVATION',unitId:started.activeUnitId!});
  const oldJson=exportReplayJson(initial,step1);
  const restored=parseReplayJson(oldJson);
  expect(restored.state).toEqual(step1);
  expect(battleHash(restored.state)).toBe(battleHash(step1));
  const step2=applyBattleCommand(restored.state,{type:'END_ACTIVATION',unitId:restored.state.activeUnitId!});
  const newerJson=exportReplayJson(restored.file.initial,step2);
  expect(parseReplayJson(newerJson).state).toEqual(step2);
  expect(parseReplayJson(newerJson).file.commands.length).toBe(2);
  expect(parseReplayJson(oldJson).state).toEqual(step1);
 });
 it('retomada só é mostrada para batalha ativa e mantém o gate de Narrador',()=>{
  const ui=source('src/components/battle/BattleSavedPanel.tsx');
  const hub=source('src/components/battle/BattleNarratorHub.tsx');
  const arena=source('src/components/battle/BattleArena.tsx');
  const routes=source('src/routes/_authenticated/jogadores.tsx');
  const server=source('src/lib/battle/battle-session.functions.ts');
  expect(ui).toContain("loaded.state.phase==='active'");
  expect(ui).toContain('onResume(loaded.file.initial,loaded.state)');
  expect(hub).toContain('storeStatus');
  expect(hub).toContain('checkBattlePersistence');
  expect(hub).toContain('onResume={(ready,restored)');
  expect(arena).toContain('resume??startBattle(initial)');
  expect(routes).toContain("data.admin?<div");
  expect(server).toContain('requireSupabaseAuth');
  expect(server).toContain("db.rpc('is_campaign_admin')");
  expect(server).toContain("db.rpc('campaign_access_active')");
 });
});
