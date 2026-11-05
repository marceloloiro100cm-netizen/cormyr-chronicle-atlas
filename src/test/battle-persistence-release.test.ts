import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {makeFictionalStack,makeBattleSetup} from '@/lib/battle/domain/setup';
import {startBattle,applyBattleCommand} from '@/lib/battle/domain/turns';
import {exportReplayJson,parseReplayJson,battleHash} from '@/lib/battle/domain/replay';

const source=(name:string)=>readFileSync(resolve(name),'utf8');
describe('Batalha V2 — fase B: retomada e isolamento em produção',()=>{
 it('salva, reabre e continua um replay verificável preservando o snapshot antigo',()=>{
  const map=createScenario('plain-open');
  const a=makeFictionalStack({id:'a',side:'attacker',name:'A',typeId:'infantry',
   training:'trained',count:40,position:map.deployment.attacker[0]!});
  const b=makeFictionalStack({id:'b',side:'defender',name:'B',typeId:'archers',
   training:'trained',count:40,position:map.deployment.defender[0]!});
  const initial=makeBattleSetup({id:'release-test',name:'Retomada',seed:'release-v2',
   map,controls:{attacker:'human',defender:'human'},stacks:[a,b]});
  const started=startBattle(initial);
  const one=applyBattleCommand(started,{type:'END_ACTIVATION',unitId:started.activeUnitId!});
  const saved=exportReplayJson(initial,one);
  const loaded=parseReplayJson(saved);
  expect(loaded.state).toEqual(one);
  expect(battleHash(loaded.state)).toBe(battleHash(one));
  const two=applyBattleCommand(loaded.state,{type:'END_ACTIVATION',unitId:loaded.state.activeUnitId!});
  const newer=exportReplayJson(loaded.file.initial,two);
  expect(parseReplayJson(newer).state).toEqual(two);
  expect(parseReplayJson(saved).state).toEqual(one);
  expect(parseReplayJson(newer).file.commands.length).toBe(2);
 });
 it('mantém acesso exclusivo ao Narrador, checagem de função e kill-switch no servidor',()=>{
  const route=source('src/routes/_authenticated/jogadores.tsx');
  const service=source('src/lib/battle/battle-session.functions.ts');
  const flags=source('src/lib/battle/feature-flag.ts');
  const hub=source('src/components/battle/BattleNarratorHub.tsx');
  const saved=source('src/components/battle/BattleSavedPanel.tsx');
  expect(route).toContain("section==='batalha'&&BATTLE_MODULE_ENABLED?");
  expect(route).toContain("data.admin?<div");
  expect(service).toContain('requireSupabaseAuth');
  expect(service).toContain("db.rpc('is_campaign_admin')");
  expect(service).toContain("db.rpc('campaign_access_active')");
  expect(service).toContain("process.env['ENABLE_BATTLE_PERSISTENCE']==='false'");
  expect(flags).toContain("VITE_ENABLE_BATTLE_PERSISTENCE']!=='false'");
  expect(hub).toContain('onResume={(ready,loaded)');
  expect(saved).toContain("loaded.state.phase==='active'");
  expect(service).not.toContain('houseOperation(');
  expect(service).not.toContain('changeUnitState(');
 });
});
