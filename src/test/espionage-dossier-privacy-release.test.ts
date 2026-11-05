import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const source=(path:string)=>readFileSync(path,'utf8');
const privacy=()=>source('docs/espionage/sql/0107_spy_intelligence_revoked_history_privacy.sql');
const indexes=()=>source('docs/espionage/sql/0108_spy_intelligence_query_indexes.sql');

describe('Dossiês · lotes 10–12 · privacidade e desempenho',()=>{
 it('revogação não expõe valores nem eventos de segredos desconhecidos ao jogador',()=>{
  const sql=privacy();
  expect(sql).toContain("known.dossier_id=d.id");
  expect(sql).toContain("known.objective=e.objective");
  expect(sql).toContain("known.subject_key=e.subject_key");
  expect(sql).toContain("v_admin OR EXISTS");
  expect(sql).toContain("'oldSnapshot',CASE WHEN v_admin THEN e.previous_snapshot ELSE NULL END");
  expect(sql).toContain("'newSnapshot',CASE WHEN v_admin THEN e.new_snapshot ELSE '{}'::jsonb END");
  expect(sql).toContain("'adminHistory',CASE WHEN v_admin THEN");
  expect(sql).toContain("NOT v_admin AND d.owner_house_id=p_house");
  expect(sql).toContain("public.in_campaign_house(p_house,false)");
 });
 it('mantém a execução da leitura somente para usuários autenticados',()=>{
  const sql=privacy();
  expect(sql).toContain("auth.uid() IS NULL OR NOT public.campaign_access_active()");
  expect(sql).toContain("REVOKE ALL ON FUNCTION public.spy_intelligence_read(text) FROM PUBLIC,anon;");
  expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.spy_intelligence_read(text) TO authenticated;");
  expect(sql).toContain("BEGIN;");
  expect(sql).toContain("COMMIT;");
 });
 it('usa índices focados na cronologia e nas missões ainda pendentes',()=>{
  const sql=indexes();
  expect(sql).toContain("public.spy_intelligence_events(dossier_id,created_at DESC)");
  expect(sql).toContain("public.spy_intelligence_dossiers(owner_house_id,updated_at DESC)");
  expect(sql).toContain("public.spy_intelligence_mission_awards(processing_state,created_at DESC)");
  expect(sql).toContain("WHERE processing_state='waiting_catalog'");
 });
 it('o cliente mantém um limite de leitura por Casa sem serializar inventários vivos',()=>{
  const client=source('src/lib/espionage/spy-dossier.functions.ts');
  expect(client).toContain("browserRead('spy_intelligence_read',{p_house:houseId})");
  expect(client).toContain("parsed.data.some(d=>d.ownerHouseId!==houseId)");
  const panel=source('src/components/house/espionage/spy-dossier-panel.tsx');
  expect(panel).toContain('A quantidade real de');
  expect(panel).toContain('Nenhuma informação desta categoria foi descoberta.');
 });
});
