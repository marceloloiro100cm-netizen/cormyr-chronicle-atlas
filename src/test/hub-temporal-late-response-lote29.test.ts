import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {assertUnchangedAccessScope} from '@/lib/auth/campaign-access-scope';

const scope=(userId:string,fingerprint:string)=>({userId,fingerprint});
describe('Lote 29 · resposta tardia e mudança de permissão',()=>{
 it('permite conclusão de consulta apenas se identidade E escopo não mudarem',()=>{
  expect(()=>assertUnchangedAccessScope(scope('a','house1:view'),scope('a','house1:view'))).not.toThrow();
  expect(()=>assertUnchangedAccessScope(scope('a','house1:edit'),scope('a','house1:view')))
   .toThrow('Vínculos alterados');
  expect(()=>assertUnchangedAccessScope(scope('a','house1:view'),scope('b','house1:view')))
   .toThrow('Vínculos alterados');
  expect(()=>assertUnchangedAccessScope(scope('admin','gm:true'),scope('admin','gm:false')))
   .toThrow('Vínculos alterados');
 });
 it('o Conselho verifica o escopo antes de iniciar e depois de terminar o fetch',()=>{
  const s=readFileSync(resolve(process.cwd(),'src/components/players/panel-data.ts'),'utf8');
  const begin=s.indexOf('const before=await loadCampaignAccessScope()');
  const queries=s.indexOf('Promise.all([',begin);
  const end=s.indexOf('const after=await loadCampaignAccessScope()',queries);
  const gate=s.indexOf('assertUnchangedAccessScope(before,after)',end);
  const result=s.indexOf('return {user,catalog',gate);
  expect(begin).toBeGreaterThan(0);
  expect(queries).toBeGreaterThan(begin);
  expect(end).toBeGreaterThan(queries);
  expect(gate).toBeGreaterThan(end);
  expect(result).toBeGreaterThan(gate);
 });
 it('a ficha e exportação conferem direitos NOVAMENTE depois de ler fontes',()=>{
  const s=readFileSync(resolve(process.cwd(),'src/lib/house/house.functions.ts'),'utf8');
  const ledger=s.slice(s.indexOf('export const loadHouseLedger='),s.indexOf('export const loadHouseHub='));
  expect(ledger).toContain('const [roleNow,memberNow]');
  expect(ledger).toContain("Histórico não autorizado após atualização dos vínculos");
  const hub=s.slice(s.indexOf('export const loadHouseHub='),s.indexOf('export const houseOperation='));
  const final=hub.indexOf('const [adminNow,memberNow]');
  expect(final).toBeGreaterThan(hub.indexOf('const myMembership='));
  expect(final).toBeLessThan(hub.indexOf('return {state:finalState'));
  expect(hub).toContain('Permissão de Casa revogada durante o carregamento');
  expect(hub).toContain("canEditAttributes:Boolean(adminNow.data||editNow?.data?.can_edit_attributes)");
 });
});
