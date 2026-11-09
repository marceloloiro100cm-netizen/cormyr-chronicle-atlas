import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

describe('Battle production JWT P0: defensas de segurança',()=>{
 it('nunca desconecta outras sessões de Narrador ou jogador',()=>{
  const script=readFileSync('scripts/battle-authenticated-readonly.mjs','utf8');
  expect(script).toContain("signOut({scope:'local'})");
  expect(script).not.toMatch(/\.auth\.signOut\(\)/);
  expect(script).not.toMatch(/createClient\([^\n]*service_role/i);
 });
 it('exige prova positiva de RLS usando dados privados existentes',()=>{
  const script=readFileSync('scripts/battle-authenticated-readonly.mjs','utf8');
  expect(script).toContain("rows(narrator,'battle_dnd_cormyr_monsters')");
  expect(script).toContain("rows(player,'battle_dnd_cormyr_monsters')");
  expect(script).toContain("rows(narrator,'battle_house_roster_imports')");
  expect(script).toContain("rows(player,'battle_house_roster_imports')");
  expect(script).toContain("BATTLE_E2E_REQUIRE_PRIVATE_FIXTURE==='true'");
 });
 it('só permite teste manual no ambiente protegido e host correto',()=>{
  const workflow=readFileSync('.github/workflows/battle-production-authenticated-readonly.yml','utf8');
  expect(workflow).toContain('workflow_dispatch:');
  expect(workflow).toContain('environment: production');
  expect(workflow).toContain('permissions:\n  contents: read');
  expect(workflow).toContain('BATTLE_E2E_REQUIRE_PRIVATE_FIXTURE');
  expect(workflow).toContain('BATTLE_E2E_EXPECTED_HOST: qkdznngbkwodsbpkpoax.supabase.co');
 });
});
