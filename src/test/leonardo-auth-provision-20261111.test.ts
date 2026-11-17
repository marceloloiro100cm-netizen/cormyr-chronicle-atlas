import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const source=(path:string)=>readFileSync(path,'utf8');

describe('Cormyr: Jogador, Editor-Chefe e Narrador',()=>{
 it('o login Firebase não concede perfil ou Casa escolhidos pelo navegador',()=>{
  const auth=source('src/routes/auth.tsx');
  const pilot=source('src/routes/firebase-access.tsx');
  expect(auth).toContain('firebasePilotAuth');
  expect(auth).toContain("navigate({to:'/firebase-access'})");
  expect(auth).not.toContain('<option value="jogador">');
  expect(auth).not.toContain('<option value="editor">');
  expect(auth).not.toContain('<option value="narrador">');
  expect(auth).not.toContain('campaign-selected-house');
  expect(pilot).toContain("view.profile==='editor'");
  expect(pilot).toContain("view.profile==='narrador'");
  expect(auth).not.toContain('<option value="espiao">Leonardo</option>');
 });
 it('a identidade editorial não carrega o painel ou as fichas de Casas',()=>{
  const route=source('src/routes/_authenticated/jogadores.tsx');
  expect(route).toContain("scope.data.profile==='editor'");
  expect(route).toContain('<EditorialWorkspace key={approved}');
  expect(route).not.toContain('showLeonardoEditorial');
  expect(route).not.toContain('specialMailReadOnly');
  expect(route).not.toContain('<BattleLeonardoSandbox');
  expect(route.indexOf("if(scope.data.profile==='editor')")).toBeLessThan(route.indexOf('return <PlayersWorkspace key={approved}'));
  expect(route).toContain('(!scope.data.active||scope.data.passwordChangeRequired)');
 });
 it('o Narrador gerencia Editor-Chefe sem cadastro de casa',()=>{
  const backend=source('src/lib/player-admin.functions.ts');
  const ui=source('src/components/players/leonardo-account-provision.tsx');
  expect(backend).toContain('manageEditorialAccount=createServerFn');
  expect(backend).toContain("db.from('house_memberships').delete()");
  expect(backend).toContain("profile:'editor',active:true");
  expect(backend).toContain("roster_house_id:null,folder_id:null");
  expect(backend).toContain("role.data!==true");
  expect(ui).toContain('useServerFn(manageEditorialAccount)');
  expect(ui).not.toContain("houseId:'espiao'");
  expect(ui).toContain('<input type="password"');
  expect(backend).not.toContain("password:'cormyr'");
 });
 it('a senha deve ser alterada antes de consultas privadas',()=>{
  const route=source('src/routes/_authenticated/jogadores.tsx');
  const change=source('src/components/change-password.tsx');
  expect(route.indexOf('(!scope.data.active||scope.data.passwordChangeRequired)'))
   .toBeLessThan(route.indexOf("scope.data.profile==='editor'"));
  expect(change).toContain('invalidateQueries({queryKey:CAMPAIGN_ACCESS_SCOPE_KEY})');
 });
 it('a migração revoga associação de Casas e bloqueia acesso por banco',()=>{
  const sql=source('drizzle/migrations/0116_campaign_three_access_profiles.sql');
  expect(sql).toContain("profile IN ('jogador','editor','narrador')");
  expect(sql).toContain('DELETE FROM public.house_memberships WHERE player_id=v_player');
  expect(sql).toContain("UPDATE public.campaign_players SET roster_house_id=NULL");
  expect(sql).toContain('CREATE POLICY editor_no_letters');
  expect(sql).toContain('CREATE POLICY editor_no_replies');
  expect(sql).toContain('CREATE POLICY editor_no_house_records');
  expect(sql).toContain('CREATE OR REPLACE FUNCTION public.can_edit_campaign_newspaper()');
 });
});
