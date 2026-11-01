import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
describe('Lote 28 · revogação durante operação assíncrona',()=>{
 it('verifica permissão antes da operação longa e novamente antes de gravar',()=>{
  const code=readFileSync(resolve(process.cwd(),'src/lib/house/house.functions.ts'),'utf8');
  const start=code.indexOf("export const houseOperation=");
  const initial=code.indexOf("rpc('in_campaign_house'",start);
  const compute=code.indexOf("if(data.action==='draft')",start);
  const recheck=code.indexOf("const [finalRole,finalMembership]",compute);
  const commit=code.indexOf("db.rpc('commit_noble_house_operation'",recheck);
  expect(start).toBeGreaterThan(0);
  expect(initial).toBeGreaterThan(start);
  expect(compute).toBeGreaterThan(initial);
  expect(recheck).toBeGreaterThan(compute);
  expect(commit).toBeGreaterThan(recheck);
  expect(code.slice(recheck,commit)).toContain("if(finalRole.error||finalMembership.error)");
  expect(code.slice(recheck,commit)).toContain("if(!finalRole.data&&!finalMembership.data)");
  expect(code.slice(recheck,commit)).toContain("if(admin&&!finalRole.data)");
 });
 it('commit transacional confere vínculo depois de o Narrador revogar edição',()=>{
  const sql=readFileSync(resolve(process.cwd(),'drizzle/migrations/0039_house_commander_transaction.sql'),'utf8');
  expect(sql).toContain('AND m.can_edit AND p.user_id=p_actor AND p.active');
  expect(sql).toContain("PERFORM pg_advisory_xact_lock");
  expect(sql).toContain("SELECT * INTO current_row FROM public.noble_house_sheets WHERE house_id=p_house FOR UPDATE");
  expect(sql).toContain("coalesce(current_row.version,0)<>p_version");
 });
});
