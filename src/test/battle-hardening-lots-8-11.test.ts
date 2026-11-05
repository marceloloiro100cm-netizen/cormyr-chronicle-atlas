import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {makeFictionalStack,makeBattleSetup} from '@/lib/battle/domain/setup';
import {startBattle} from '@/lib/battle/domain/turns';
import {runAiUntilHuman} from '@/lib/battle/domain/ai';
import {battleReport} from '@/lib/battle/domain/report';
import {battleHash,captureReplay,verifyReplay,parseReplayJson} from '@/lib/battle/domain/replay';
const file=(p:string)=>readFileSync(resolve(p),'utf8');
describe('Batalha V2 — lote 11, segurança e conformidade',()=>{
 it('B-033/034: endpoints de origem e persistência exigem autenticação e papel atual',()=>{
  const src=file('src/lib/battle/adapters/readonly-source.functions.ts');
  const saved=file('src/lib/battle/server/battle-session.functions.ts');
  for(const x of [src,saved]){
   expect(x).toContain('requireSupabaseAuth');
   expect(x).toContain("db.rpc('is_campaign_admin')");
   expect(x).toContain("db.rpc('campaign_access_active')");
   expect(x).not.toContain('houseOperation(');
   expect(x).not.toContain('resolveSurvivors(');
   expect(x).not.toContain('changeUnitState(');
  }
  expect(saved).toContain("process.env['ENABLE_BATTLE_PERSISTENCE']");
  expect(saved).toContain('verifySources');
  expect(saved).toContain("db.from('noble_house_sheets')");
  const route=file('src/routes/_authenticated/jogadores.tsx');
  expect(route).toContain('data.admin?<div');
  expect(route).toContain("section==='batalha'&&BATTLE_MODULE_ENABLED?");
 });
 it('B-035/036/037: migração é draft fora de migrations; somente role técnica pode escrever',()=>{
  const sql=file('docs/battle/sql/0076_battle_sim_homologation.sql');
  const workflow=file('.github/workflows/validate.yml');
  expect(sql).toContain('SECURITY DEFINER');
  expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.battle_sim_commit_step');
  expect(sql).toContain('TO service_role');
  expect(sql).toContain('FOR UPDATE');
  expect(sql).toContain('UNIQUE(session_id,command_id)');
  expect(sql).toContain('public.campaign_access_active()');
  expect(sql).toContain('public.is_campaign_admin()');
  expect(sql).not.toMatch(/UPDATE public\.noble_house_sheets|UPDATE public\.campaign_houses/);
  expect(workflow).toContain('Apply battle draft ONLY to disposable test database');
  expect(workflow).toContain('battle-sql-smoke.sql');
  expect(file('src/lib/battle/feature-flag.ts')).toContain("VITE_ENABLE_BATTLE_PERSISTENCE");
 });
 it('B-026/027/040: 20 cenários realmente variados terminam, hashes e relatório coerentes',()=>{
  for(let n=0;n<20;n++){
   const map=createScenario((['plain-open','contested-woods','border-hills','narrow-passage'] as const)[n%4]!,
     n%2===0?11:15);
   const countA=15+3*n,countB=15+2*n;
   const posA=map.deployment.attacker[(n%5)]!,
     posB=map.deployment.defender[(n%5)]!;
   const a=makeFictionalStack({id:'a',side:'attacker',name:'A',typeId:n%3===0?'cavalry':'infantry',
    training:n%2===0?'trained':'green',count:countA,position:posA});
   const b=makeFictionalStack({id:'b',side:'defender',name:'B',typeId:n%3===1?'archers':'infantry',
    training:n%2===0?'green':'veteran',count:countB,position:posB});
   const initial=makeBattleSetup({id:'battle-'+n,name:'Cenário '+n,seed:String(n),
    map,controls:{attacker:'ai',defender:'ai'},stacks:[a,b]});
   const sim=runAiUntilHuman(startBattle(initial),900);
   expect(sim.state.phase).toBe('completed');
   const replay=captureReplay(initial,sim.commands);
   const verified=verifyReplay(replay);
   expect(verified.state).toEqual(sim.state);
   expect(replay.finalStateHash).toBe(battleHash(sim.state));
   const report=battleReport(sim.state);
   for(const row of report.units)expect(row.alive+row.casualties).toBe(row.initial);
   const broken=structuredClone(replay) as {finalStateHash:string};
   broken.finalStateHash='0'.repeat(64);
   expect(()=>verifyReplay(broken)).toThrow('Integridade não confirmada');
  }
 });
});
