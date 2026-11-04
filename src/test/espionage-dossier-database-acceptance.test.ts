import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(p,'utf8');

describe('Dossiês · auditoria SQL de implantação',()=>{
 it('não revalida informações reveladas pela própria operação',()=>{
  const sql=read('docs/espionage/sql/0106_spy_intelligence_refresh_previous_only.sql');
  expect(sql).toContain('f.discovered_operation_id IS DISTINCT FROM p_operation');
  expect(sql).toContain('SELECT DISTINCT ON(f.subject_key)');
  expect(sql).toContain('WHERE a.operation_id=p_operation FOR UPDATE');
  expect(sql).toContain("v_award.processing_state='complete'");
  expect(sql).toContain('BEGIN;');
  expect(sql).toContain('COMMIT;');
 });
 it('preserva o isolamento no banco e a consulta segura por Casa',()=>{
  const original=read('docs/espionage/sql/0104_spy_intelligence_dossiers_lotes_1_3.sql');
  const integration=read('docs/espionage/sql/0105_spy_intelligence_catalog_dossiers_and_admin.sql');
  expect(original).toContain('UNIQUE(owner_house_id,target_house_id)');
  expect(original).toContain('REVOKE ALL ON public.spy_intelligence_findings FROM PUBLIC,anon,authenticated');
  expect(integration).toContain('public.spy_intelligence_read(p_house text DEFAULT NULL)');
  expect(integration).toContain("public.in_campaign_house(p_house,false)");
  expect(integration).toContain('public.is_campaign_admin()');
  expect(integration).toContain('public.spy_intelligence_source_items(');
  expect(integration).toContain("h.value->>'status'='active'");
  expect(integration).toContain("coalesce(u.value->>'destroyed','false')<>'true'");
  expect(integration).toContain('public.spy_intelligence_admin_audit');
 });
});
