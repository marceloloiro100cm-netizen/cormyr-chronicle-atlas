import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {classifySpyCreationFailure,SpyCreationError}
 from '@/lib/espionage/spy-creation-diagnostics';

const file=(path:string)=>readFileSync(path,'utf8');

describe('Von der Harten · recuperação segura do recrutamento',()=>{
 it('reconcilia somente o domínio homologado a partir da ficha oficial',()=>{
  const sql=file('docs/espionage/sql/0109_von_der_harten_spy_domain_location_2026_11_06.sql');
  expect(sql).toContain("n.house_id='von-der-harten'");
  expect(sql).toContain("c.public_reviewed IS TRUE");
  expect(sql).toContain("lower(c.region)='crownlands'");
  expect(sql).toContain("d->>'id'='dom-von-der-harten-lex-castle'");
  expect(sql).toContain("h->>'id'='von-der-harten-spy-network'");
  expect(sql).toContain("h->>'status'='active'");
  expect(sql).toContain("h->>'domainId'=d->>'id'");
  expect(sql).toContain("ON CONFLICT (kind,ref_id) DO NOTHING");
  expect(sql).toContain("'narrator'");
  expect(sql).not.toMatch(/INSERT INTO public.spy_assets|UPDATE public.spy_assets|DELETE FROM public.spy_assets/i);
  expect(sql).not.toMatch(/auth\.users|UPDATE public\.noble_house_sheets|spy_agent_history/i);
 });
 it('distingue a falha real de localização da foto livre',()=>{
  const problem=classifySpyCreationFailure({
   message:'Domínio de recrutamento sem localização homologada',code:'P0001',
  });
  expect(problem).toBeInstanceOf(SpyCreationError);
  expect(problem.reason).toBe('location_unapproved');
  expect(problem.message).toMatch(/domínio ainda não possui localização homologada/i);
  expect(problem.message).not.toMatch(/foto|imagem|retrato/i);
 });
 it('separa indisponibilidade de rede, vagas, foto e saldo',()=>{
  expect(classifySpyCreationFailure({message:'Fonte ativa da Rede de Espiões não encontrada'}).reason)
   .toBe('network_unavailable');
  expect(classifySpyCreationFailure({message:'Rede sem vaga livre para recrutamento'}).reason)
   .toBe('no_vacancies');
  expect(classifySpyCreationFailure({message:'duplicate key value violates unique constraint "spy_agent_portrait_campaign_unique"',code:'23505'}).reason)
   .toBe('portrait_unavailable');
  expect(classifySpyCreationFailure({message:'Riqueza insuficiente para compra'}).reason)
   .toBe('wealth_insufficient');
 });
 it('falha sem vazar detalhes ou acusar falsamente uma foto de ocupada',()=>{
  const raw='duplicate key value violates unique constraint "private_unrelated_index"';
  const unknown=classifySpyCreationFailure({message:raw,code:'23505'});
  expect(unknown.reason).toBe('unconfirmed');
  expect(unknown.message).not.toContain(raw);
  const denied=classifySpyCreationFailure({message:'Criação de agente não autorizada'});
  expect(denied.reason).toBe('unauthorized');
 });
 it('o cliente classifica o erro e preserva a chave idempotente em retries',()=>{
  const client=file('src/lib/espionage/spy-browser-client.ts');
  const dialog=file('src/components/house/espionage/spy-create-agent-dialog.tsx');
  expect(client).toContain("name==='spy_create_agent'");
  expect(client).toContain('classifySpyCreationFailure(result.error)');
  expect(dialog).toContain('cause instanceof SpyCreationError');
  expect(dialog).not.toMatch(/catch\(cause\)[\s\S]*?requestKey\.current=null;/);
  expect(dialog).toContain('void Promise.allSettled([');
 });
});
