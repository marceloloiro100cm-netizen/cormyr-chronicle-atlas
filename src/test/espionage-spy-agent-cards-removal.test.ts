import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spyManagementSchema} from '@/lib/espionage/spy-management.functions';
const file=(name:string)=>readFileSync(resolve(name),'utf8');

describe('Agentes: cartas, retrato ampliado e baixa auditável',()=>{
 it('mostra fichas individuais sem tabela horizontal',()=>{
  const src=file('src/components/house/espionage/spy-house-management.tsx');
  expect(src).toContain('className="spy-agent-grid"');
  expect(src).toContain('className="house-card spy-agent-card"');
  expect(src).toContain('className="spy-agent-stat-grid"');
  expect(src).toContain('SpyAgentUpgrades');
  expect(src).toContain('SpyRemoveAgentButton');
  expect(src).not.toContain('<table><thead><tr><th scope="col">Agente');
  expect(src).toContain("agent.status!=='retired'");
 });
 it('permite clicar para ampliar e mantém o controle de seleção da foto',()=>{
  const src=file('src/components/house/espionage/spy-agent-portrait-control.tsx');
  expect(src).toContain('Ampliar retrato de ');
  expect(src).toContain('setPreviewOpen(true)');
  expect(src).toContain('Retrato ampliado de ');
  expect(src).toContain('<SpyPortraitPicker');
  expect(src).toContain('assignSpyPortrait');
 });
 it('a confirmação restringe baixa a agentes sem missão e refresca vagas, saldo e retratos',()=>{
  const src=file('src/components/house/espionage/spy-remove-agent-button.tsx');
  expect(src).toContain("agent.status==='available'&&!hasActiveMission");
  expect(src).toContain('removeSpyAgentBrowser');
  expect(src).toContain('Confirmar exclusão');
  expect(src).toContain('refundedWealth');
  expect(src).toContain("['spy-recruitment-options',houseId]");
  expect(src).toContain("['spy-house-management',houseId]");
  expect(src).toContain("['noble-house']");
 });
 it('a baixa e reembolso são uma transação autenticada, versionada e idempotente',()=>{
  const sql=file('docs/espionage/sql/0100_spy_agent_removal_refund.sql');
  expect(sql).toContain('BEGIN;');
  expect(sql).toContain('COMMIT;');
  expect(sql).toContain('public.spy_remove_agent(');
  expect(sql).toContain('public.campaign_access_active()');
  expect(sql).toContain('public.in_campaign_house(p_house,true)');
  expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('noble:'||p_house,0))");
  expect(sql).toContain('v_a.version<>p_expected_agent_version');
  expect(sql).toContain('v_h.version<>p_expected_house_version');
  expect(sql).toContain("o.status NOT IN('completed','cancelled')");
  expect(sql).toContain('WHERE u.agent_id=p_agent AND u.owner_house_id=p_house');
  expect(sql).toContain("status='retired',portrait_id=NULL");
  expect(sql).toContain('public.noble_house_ledger');
  expect(sql).toContain('spy_agent_removals');
  expect(sql).toContain("v_previous.request_key<>p_request_key");
  expect(sql).toContain("'retired',v_date");
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.spy_remove_agent');
  expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.spy_remove_agent');
  expect(sql).not.toMatch(/DELETE FROM public\.spy_agent_history/i);
 });
 it('preserva as ocorrências arquivadas no painel de histórico',()=>{
  const s=file('src/components/house/espionage/spy-agent-recruitment-history.tsx');
  expect(s).toContain("retired:'Agente excluído'");
  const schema=spyManagementSchema.parse({
   houseId:'ashkar',houseVersion:3,agents:[],operations:[],recruitment:[],
   portraits:[],history:[{
    id:'e40ff0a5-a744-4ee0-a4a4-4ef77fe86a38',
    agentId:'c2cd5b52-caba-41a2-a05d-115377c5b84a',
    eventType:'retired',dateKey:'1522-08-11',targetName:'O Corvo',
    targetRegion:null,detail:'Agente excluído do elenco ativo.',
    rank:'Verde',cunning:3,totalSuccesses:0,failureDegrees:null,operationId:null,
   }],
  });
  expect(schema.history[0]?.eventType).toBe('retired');
 });
});
