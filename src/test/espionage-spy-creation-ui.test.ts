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
 it('retrato reservado por qualquer Casa fica indisponível sem revelar o outro agente',()=>{
  const picker=file('src/components/house/espionage/spy-portrait-picker.tsx');
  expect(picker).toContain('const used=p.assignedAgentId');
  expect(picker).toContain(':Boolean(p.occupied)');
  expect(picker).toContain('p.assignedAgentId!==currentAgentId');
  expect(picker).toContain("filter:used?'grayscale(100%)':'none'");
  expect(picker).toContain('disabled={used}');
  expect(picker).toContain('já reservada por outro agente');
  const sql=file('docs/espionage/sql/0103_spy_portrait_campaign_global_uniqueness.sql');
  expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS spy_agent_portrait_campaign_unique');
  expect(sql).toContain('ON public.spy_assets(portrait_id) WHERE portrait_id IS NOT NULL');
  expect(sql.match(/'occupied',EXISTS/g)).toHaveLength(2);
  expect(sql).toContain('WHERE claimed.portrait_id=c.id');
  expect(sql).toContain('a.portrait_id=c.id AND a.owner_house_id=p_house');
  expect(sql).not.toContain('DELETE FROM public.spy_assets');
  expect(sql).not.toContain('UPDATE public.spy_assets SET portrait_id=NULL');
 });
 it('ao trocar de retrato ou criar espião, consulta novamente a disponibilidade global',()=>{
  const control=file('src/components/house/espionage/spy-agent-portrait-control.tsx');
  const create=file('src/components/house/espionage/spy-create-agent-dialog.tsx');
  expect(control).toContain('!p.occupied&&!p.assignedAgentId');
  expect(control).toContain("['spy-recruitment-options',houseId]");
  expect(create).toContain('!p.occupied&&!p.assignedAgentId');
  expect(create).toContain('foto pode ter sido reservada por outro jogador');
  expect(create).toContain("['spy-recruitment-options',houseId]");
  expect(create).toContain('refetchInterval:open?10_000:false');
  expect(control).toContain('refetchInterval:open?10_000:false');
  expect(control).toContain('portraits={currentPortraits}');
  const removal=file('docs/espionage/sql/0100_spy_agent_removal_refund.sql');
  expect(removal).toContain("UPDATE public.spy_assets SET status='retired',portrait_id=NULL");
 });
 it('oculta a legenda técnica abaixo dos mapas locais',()=>{
  const map=file('src/components/house/espionage/spy-local-house-map.tsx');
  expect(map).not.toContain('Linha ilustrativa entre bandeiras');
  expect(map).not.toContain('O cálculo da missão continua seguindo as regras vigentes.');
  expect(map).not.toContain('spy-noble-local-footnote');
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
