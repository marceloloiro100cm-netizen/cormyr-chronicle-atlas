import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const file=(name:string)=>readFileSync(resolve(name),'utf8');
describe('Batalha V3 — convocações entre narrador e jogador',()=>{
 it('tabela separada tem política RLS para membro, admin e sem grants anônimos',()=>{
  const sql=file('docs/battle/sql/0077_battle_v3_invitations.sql');
  expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  expect(sql).toContain('FORCE ROW LEVEL SECURITY');
  expect(sql).toContain("public.in_campaign_house(target_house_id,false)");
  expect(sql).toContain('public.is_campaign_admin()');
  expect(sql).toContain('public.campaign_access_active()');
  expect(sql).toContain('REVOKE ALL ON TABLE public.battle_v3_invitations FROM PUBLIC,anon,authenticated');
  expect(sql).toContain("status='open'");
  expect(sql).toContain('REFERENCES public.campaign_houses(id)');
 });
 it('server functions require auth and current narrator authorization for mutations',()=>{
  const server=file('src/lib/battle/v3/invitations.functions.ts');
  expect(server).toContain('requireSupabaseAuth');
  expect(server).toContain("db.rpc('is_campaign_admin')");
  expect(server).toContain("db.rpc('campaign_access_active')");
  expect(server).toContain('await requireNarrator(db)');
  expect(server).toContain('target_house_id:data.houseId');
  expect(server).not.toContain('supabaseAdmin');
  expect(server).not.toContain('houseOperation(');
  expect(server).not.toContain('changeUnitState(');
 });
 it('jogador só vê o segundo botão com convite ativo filtrado por casa',()=>{
  const ui=file('src/components/battle/BattleV3PlayerEntry.tsx');
  const route=file('src/routes/_authenticated/jogadores.tsx');
  expect(ui).toContain("invites.length>0&&<Button");
  expect(ui).toContain("Batalha convocada (");
  expect(ui).toContain("i.target_house_id===houseId&&i.status==='open'");
  expect(ui).toContain('refetchInterval:30000');
  expect(ui).toContain('locked invitationName={selected.title}');
  expect(route).toContain("tab==='batalha'&&!data.admin&&BATTLE_MODULE_ENABLED&&<BattleV3PlayerEntry");
 });
 it('narrador pode criar e encerrar sem expor seus controles ao jogador',()=>{
  const creator=file('src/components/battle/BattleV3InvitationCreator.tsx');
  const hub=file('src/components/battle/BattleNarratorHub.tsx');
  expect(creator).toContain('createV3Invitation');
  expect(creator).toContain('closeV3Invitation');
  expect(creator).toContain('Casa destinatária');
  expect(hub).toContain('Convocar batalha');
  expect(hub).toContain("view==='invite'&&<BattleV3InvitationCreator");
  expect(file('src/components/battle/BattleV3PlayerEntry.tsx')).not.toContain('BattleV3InvitationCreator');
 });
});
