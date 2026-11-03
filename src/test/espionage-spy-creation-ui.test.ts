import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spyManagementSchema} from '@/lib/espionage/spy-management.functions';
const file=(p:string)=>readFileSync(resolve(p),'utf8');

describe('Espionagem · criação com foto exclusiva, melhorias e campos ocultos',()=>{
 it('não exibe a tabela por domínio nem as legendas marcadas para ocultação',()=>{
  const s=file('src/components/house/espionage/spy-house-management.tsx');
  const start=s.indexOf('export function SpyDefensePanel');
  const end=s.indexOf('function AgentRow',start);
  const panel=s.slice(start,end);
  expect(panel).not.toContain('<th scope="col">Domínio</th>');
  expect(panel).not.toContain('Calculada pela ficha, não pela Lei basal da região.');
  expect(panel).not.toContain('Dificuldade-base {defense.baseDifficulty} (gerada pela Lei');
  expect(s).not.toContain('A tabela protegida de agentes ainda não está instalada');
  expect(s).toContain('<SpyCreateAgentDialog');
 });
 it('a galeria não inventa fotos antes de o Narrador cadastrar os links',()=>{
  const code=file('src/components/house/espionage/spy-portrait-picker.tsx');
  const migration=file('docs/espionage/sql/0095_spy_portraits_atomic_creation.sql');
  expect(code).toContain('A galeria de retratos ainda não foi cadastrada.');
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.spy_portrait_catalog');
  expect(migration).not.toMatch(/INSERT INTO public.spy_portrait_catalog/);
 });
 it('fotos cinzentas e desabilitadas pertencem a outro agente da mesma Casa',()=>{
  const code=file('src/components/house/espionage/spy-portrait-picker.tsx');
  expect(code).toContain('p.assignedAgentId!==currentAgentId');
  expect(code).toContain("filter:used?'grayscale(100%)':'none'");
  expect(code).toContain('disabled={used}');
  const sql=file('docs/espionage/sql/0095_spy_portraits_atomic_creation.sql');
  expect(sql).toContain('ON public.spy_assets(owner_house_id,portrait_id)');
  expect(sql).toContain('WHERE portrait_id IS NOT NULL');
  expect(sql).toContain('LEFT JOIN public.spy_assets a ON a.portrait_id=c.id AND a.owner_house_id=p_house');
 });
 it('formulário exige nome, vagas, foto se há catálogo e oferece as duas compras',()=>{
  const s=file('src/components/house/espionage/spy-create-agent-dialog.tsx');
  expect(s).toContain('Criar espião');
  expect(s).toContain('required autoFocus minLength={2} maxLength={80}');
  expect(s).toContain('Object.keys(SPY_AGENT_UPGRADES)');
  expect(s).toContain('SPY_AGENT_UPGRADES');
  expect(s).toContain('portraits.length===0||Boolean(portraitId');
  expect(s).toContain('sourceHoldingId:source.sourceHoldingId');
 });
 it('criação e compras ocorrem numa única transação, com concorrência protegida',()=>{
  const sql=file('docs/espionage/sql/0095_spy_portraits_atomic_creation.sql');
  expect(sql).toContain('PERFORM pg_advisory_xact_lock');
  expect(sql).toContain('public.spy_recruit_agent');
  expect(sql).toContain('public.spy_buy_agent_upgrade');
  expect(sql).toContain('md5(p_request_key::text');
  expect(sql).toContain("p_portrait IS NOT NULL");
  expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS spy_agent_portrait_house_unique");
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.spy_create_agent');
  expect(sql).toContain('auth.uid() IS NULL');
 });
 it('leitura de agentes e equipamentos é única e não depende de RLS separado',()=>{
  const sql=file('docs/espionage/sql/0095_spy_portraits_atomic_creation.sql');
  expect(sql).toContain("'forgedDocuments',EXISTS");
  expect(sql).toContain("'aceInTheHole',EXISTS");
  expect(sql).toContain("'houseVersion',(SELECT n.version");
  const code=file('src/lib/espionage/spy-management.functions.ts');
  expect(code).not.toContain("db.from('spy_agent_upgrades')");
  expect(code).toContain('if(!sheet.error&&sheet.data?.state)');
  expect(code).toContain('portraits:z.array(');
 });
 it('valida a resposta completa do banco antes de exibir imagens',()=>{
  const data={
   houseId:'ashkar',houseVersion:7,agents:[{
    id:'df1bbb0a-9ccd-4829-86b6-5e672aa4e2d4',
    codename:'O Corvo',status:'available',version:1,
    currentRegion:'dragoncoast',missionSuccesses:0,
    rank:'Verde',cunning:3,toNextRank:3,sourceHoldingId:'network',
    portraitId:null,forgedDocuments:false,aceInTheHole:false,
   }],operations:[],history:[],recruitment:[{
    sourceHoldingId:'network',name:'Rede de Espiões',capacity:3,
    occupied:1,vacancies:2,
   }],portraits:[],
  };
  expect(spyManagementSchema.safeParse(data).success).toBe(true);
  expect(spyManagementSchema.safeParse({...data,portraits:[{
   id:'img-1',label:'Espião',imageUrl:'http://example.com/image.jpg',
   assignedAgentId:null,
  }]}).success).toBe(false);
 });
});
