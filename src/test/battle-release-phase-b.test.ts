import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const source=(path:string)=>readFileSync(resolve(path),'utf8');
describe('Liberação de persistência de batalha — isolada e reversível',()=>{
 it('ativa UI por padrão com kill-switch de build explícito e menu restrito ao Narrador',()=>{
  const flags=source('src/lib/battle/feature-flag.ts');
  expect(flags).toContain("VITE_ENABLE_BATTLE_PERSISTENCE'] !== 'false'");
  expect(flags).toContain('BATTLE_MODULE_ENABLED &&');
  const route=source('src/routes/_authenticated/jogadores.tsx');
  expect(route).toContain("section==='batalha'&&BATTLE_MODULE_ENABLED?");
  expect(route).toContain('data.admin?<div');
 });
 it('mantém kill-switch no servidor, autenticação e revalidação do papel antes da escrita',()=>{
  const server=source('src/lib/battle/battle-session.functions.ts');
  expect(server).toContain("process.env['ENABLE_BATTLE_PERSISTENCE']==='false'");
  expect(server).toContain('requireSupabaseAuth');
  expect(server).toContain("db.rpc('is_campaign_admin')");
  expect(server).toContain("db.rpc('campaign_access_active')");
  expect(server).toContain('await verifySources(');
  expect(server).toContain('parseReplayJson(');
  expect(server).toContain('verifyReplay(');
  expect(server).toContain('battle_sim_commit_replay');
  expect(server).toContain('battle_sim_commit_step');
  expect(server).not.toMatch(/\bhouseOperation\(/);
  expect(server).not.toMatch(/\bresolveSurvivors\(/);
  expect(server).not.toMatch(/\bchangeUnitState\(/);
 });
 it('mantém saved viewer de leitura e garante que não promete retomada editável',()=>{
  const panel=source('src/components/battle/BattleSavedPanel.tsx');
  expect(panel).toContain('readSavedBattle');
  expect(panel).toContain('somente leitura');
  expect(panel).not.toContain('applySavedBattleCommand');
  expect(panel).toContain('parseReplayJson(');
 });
});
