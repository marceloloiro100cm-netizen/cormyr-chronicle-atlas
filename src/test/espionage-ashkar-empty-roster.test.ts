import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spyManagementSchema} from '@/lib/espionage/spy-management.functions';
import {spyRecruitmentOptionsSchema} from '@/lib/espionage/spy-recruitment.functions';
const file=(path:string)=>readFileSync(resolve(path),'utf8');

describe('Ashkar · construções dão vagas, agentes só existem após criação',()=>{
 const base={sourceHoldingId:'hold-ashkar-spy',name:'Rede de Espiões',
  capacity:3,occupied:0,vacancies:3};
 const expanded={sourceHoldingId:'hold-ashkar-spy-exp',name:'Rede Expandida',
  capacity:2,occupied:0,vacancies:2};

 it('aceita uma ficha sem nenhum agente e 5 vagas reais',()=>{
  expect(spyManagementSchema.safeParse({
   houseId:'ashkar',agents:[],operations:[],history:[],
   recruitment:[base,expanded],houseVersion:7,portraits:[],
  }).success).toBe(true);
  expect(spyRecruitmentOptionsSchema.parse({
   houseId:'ashkar',recruitment:[base,expanded],portraits:[],
  }).recruitment.reduce((n,x)=>n+x.vacancies,0)).toBe(5);
 });

 it('arquiva somente as três sementes intactas, não agentes criados pelo jogador',()=>{
  const sql=file('docs/espionage/sql/0097_archive_ashkar_legacy_seed_agents.sql');
  expect(sql).toContain('public.spy_legacy_seed_archive');
  expect(sql).toContain('archived_snapshot');
  expect(sql).toContain("a.owner_house_id='ashkar'");
  expect(sql).toContain("a.source_ref='base:hold-ashkar-spy:0'");
  expect(sql).toContain("a.source_ref='expanded:hold-ashkar-spy-exp:0'");
  expect(sql).toContain("a.source_ref='expanded:hold-ashkar-spy-exp:1'");
  expect(sql).toContain('a.mission_successes=0');
  expect(sql).toContain('a.version=1');
  expect(sql).toContain('a.portrait_id IS NULL');
  expect(sql).toContain('NOT EXISTS(SELECT 1 FROM public.spy_agent_history');
  expect(sql).toContain('NOT EXISTS(SELECT 1 FROM public.spy_agent_upgrades');
  expect(sql).toContain('NOT EXISTS(SELECT 1 FROM public.spy_operations');
  expect(sql).toContain('IF v_count<>3 THEN');
 });

 it('consulta a Casa na sessão Supabase existente, sem depender do transporte serverFn',()=>{
  const client=file('src/lib/espionage/spy-browser-client.ts');
  const management=file('src/components/house/espionage/spy-house-management.tsx');
  const create=file('src/components/house/espionage/spy-create-agent-dialog.tsx');
  const planner=file('src/components/house/espionage/spy-regional-turns-panel.tsx');
  expect(client).toContain('supabase.auth.getSession()');
  expect(client).toContain("db.rpc(name,{p_house:houseId,...extra})");
  expect(client).toContain("houseRpc('spy_house_management',houseId)");
  expect(client).toContain("houseRpc('spy_recruitment_options',houseId)");
  expect(client).toContain("houseRpc('spy_create_agent',input.houseId");
  expect(management).toContain('readSpyHouseManagementBrowser(houseId)');
  expect(create).toContain('readSpyRecruitmentOptionsBrowser(houseId)');
  expect(create).toContain('createSpyAgentBrowser({');
  expect(planner).toContain('readSpyRegionalStrategyBrowser(houseId)');
 });

 it('o banco continua exigindo autorização, sem controle administrativo falso no navegador',()=>{
  const client=file('src/lib/espionage/spy-browser-client.ts');
  const sql=file('docs/espionage/sql/0096_spy_recruitment_options_independent.sql');
  expect(client).not.toContain('service_role');
  expect(client).not.toContain('supabaseAdmin');
  expect(sql).toContain('auth.uid() IS NULL');
  expect(sql).toContain('public.in_campaign_house(p_house,false)');
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.spy_recruitment_options');
 });
});
