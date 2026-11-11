import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const source=(path:string)=>readFileSync(path,'utf8');

describe('Leonardo — correção de autenticação e primeiro acesso',()=>{
 it('separa a preferência visual do provisionamento real no Supabase',()=>{
  const auth=source('src/routes/auth.tsx');
  const admin=source('src/components/players/admin-panel.tsx');
  expect(auth).toContain('<option value="espiao">Leonardo</option>');
  expect(auth).toContain('A opção Leonardo não cria a conta');
  expect(admin).toContain('<LeonardoAccountProvision players={data.players}');
 });
 it('restringe a provisão ao Narrador e confirma auth, casa e associação',()=>{
  const backend=source('src/lib/player-admin.functions.ts');
  expect(backend).toContain("db.auth.admin.createUser({email:data.email,password:data.password,email_confirm:true})");
  expect(backend).toContain("db.auth.admin.updateUserById(userId,{password:data.password})");
  expect(backend).toContain("db.rpc('admin_save_player_account'");
  expect(backend).toContain('inspectLeonardoAccess=createServerFn');
  expect(backend).toContain(".middleware([requireSupabaseAuth])");
  expect(backend).toContain("role.data!==true");
  expect(backend).toContain("linked.data?.can_edit");
  expect(backend).toContain("linked.data?.can_edit_attributes");
  expect(backend).toContain("player.data.roster_house_id==='espiao'");
  expect(backend).toContain("player.data.active===true");
  expect(backend).not.toContain("password:'cormyr'");
 });
 it('formulário não versiona senhas nem concede edição de casas ou papel Narrador',()=>{
  const ui=source('src/components/players/leonardo-account-provision.tsx');
  expect(ui).toContain("houseId:'espiao',active:true,canEdit:false,canEditAttributes:false");
  expect(ui).toContain('requireChange:true');
  expect(ui).toContain('<input type="password"');
  expect(ui).toContain('useServerFn(managePlayerAccount)');
  expect(ui).not.toContain('service_role');
  expect(ui).not.toContain('nachtdrachen@gmail.com');
  expect(ui).not.toContain('cormyr');
 });
 it('troca obrigatória de senha é exibida antes de leituras privadas e invalida escopo',()=>{
  const route=source('src/routes/_authenticated/jogadores.tsx');
  const change=source('src/components/change-password.tsx');
  expect(route).toContain('(!scope.data.active||scope.data.passwordChangeRequired)');
  expect(route.indexOf('(!scope.data.active||scope.data.passwordChangeRequired)'))
   .toBeLessThan(route.indexOf('return <PlayersWorkspace key={approved}'));
  expect(change).toContain('invalidateQueries({queryKey:CAMPAIGN_ACCESS_SCOPE_KEY})');
 });
});
