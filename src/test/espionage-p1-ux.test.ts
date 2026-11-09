import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 spyDiceSuccessPercent,spyMissionRiskAssessment,spyMissionOdds,
} from '@/lib/espionage/spy-mission-probability';
import {SpyMissionError,classifySpyMissionFailure} from '@/lib/espionage/spy-mission-errors';

const read=(name:string)=>readFileSync(name,'utf8');
describe('P1.1 e P1.3 · chance e risco sem alteração das regras de Cormyr',()=>{
 it('distingue impossibilidade matemática de chance diminuta arredondada',()=>{
  expect(spyMissionRiskAssessment(3,21).tier).toBe('impossible');
  expect(spyMissionRiskAssessment(3,18).tier).toBe('extreme');
  expect(spyDiceSuccessPercent(3,18)).toBe(0.5);
  expect(spyMissionRiskAssessment(6,30).tier).toBe('extreme');
  expect(spyMissionRiskAssessment(3,12).tier).toBe('moderate');
  expect(spyMissionRiskAssessment(3,6).tier).toBe('low');
 });
 it('só muda textos, não altera a dificuldade nem a probabilidade oficial',()=>{
  for(const dice of [3,4,5,6])for(const dc of [6,9,12,15,18,21,24,30]){
   const odds=spyMissionOdds(dc,dice);
   spyMissionRiskAssessment(dice,dc);
   expect(spyMissionOdds(dc,dice)).toEqual(odds);
  }
 });
 it('probabilidades muito pequenas não são apresentadas como impossível',()=>{
  const ui=read('src/components/house/espionage/spy-mission-odds-card.tsx');
  expect(ui).toContain('data.testDifficulty<=data.testDice*6');
  expect(ui).toContain('Menos de 0,1%');
  expect(ui).toContain('spyMissionRiskAssessment');
  expect(ui).toContain('Ver detalhes do cálculo');
 });
});
describe('P1.6 · erros de viagem sem vazamento de informações privadas',()=>{
 const cases=[
  ['O Hub Temporal mudou. Atualize a previsão','calendar_changed'],
  ['Espião indisponível ou desatualizado','agent_busy'],
  ['Localização real do espião não homologada','agent_location'],
  ['Não há uma ligação regional conhecida','route_unavailable'],
  ['Casa-alvo inválida','invalid_target'],
  ['Início de missão não autorizado','not_authorized'],
  ['Chave da missão já utilizada','idempotency_conflict'],
 ] as const;
 it.each(cases)('mapeia %s', (raw,problem)=>{
  const failure=classifySpyMissionFailure({message:raw});
  expect(failure).toBeInstanceOf(SpyMissionError);
  expect(failure.problem).toBe(problem);
  expect(failure.message).not.toContain(raw);
 });
 it('oculta dados SQL inesperados',()=>{
  const e=classifySpyMissionFailure({message:'relation secret_table key id uuid 123 leaked'});
  expect(e.problem).toBe('not_confirmed');
  expect(e.message).not.toContain('secret_table');
 });
 it('classifica apenas erros de envio da missão na camada autorizada',()=>{
  const browser=read('src/lib/espionage/spy-browser-client.ts');
  expect(browser).toContain("name==='spy_submit_house_mission'");
  expect(browser).toContain('classifySpyMissionFailure(result.error)');
  expect(browser).toContain("name==='spy_create_agent'");
 });
});
describe('P1.2, P1.4, P1.5, P1.7 e P1.8 · experiência compacta',()=>{
 it('planejador mantém seleção oficial, pré-seleciona região e deixa o mapa opcional',()=>{
  const ui=read('src/components/house/espionage/spy-regional-turns-panel.tsx');
  expect(ui).toContain("setDestination(agent?.status==='available'?agent.currentRegion??'':'')");
  expect(ui).toContain("agents.filter(a=>a.status==='available')");
  expect(ui).toContain('Ver trajeto no mapa');
  expect(ui).toContain('readSpyNobleHouseTargetsBrowser');
  expect(ui).toContain('<SpySubmitHouseMission');
 });
 it('narrador só vê três controles essenciais por padrão',()=>{
  const ui=read('src/components/house/espionage/spy-narrator-resolution.tsx');
  expect(ui).toContain('Resultado dos dados');
  expect(ui).toContain('Bônus / penalidade');
  expect(ui).toContain('Espião descoberto?');
  expect(ui).toContain('<details className="spy-narrator-advanced">');
  expect(ui).toContain('requestKey.current=null');
  expect(ui).toContain('Resolver missão');
  expect(ui).toContain('response.intelligenceStatus');
 });
 it('agentes mostram disponibilidade, trajetória e progressão em poucos elementos',()=>{
  const ui=read('src/components/house/espionage/spy-house-management.tsx');
  expect(ui).toContain('spy-agent-overview');
  expect(ui).toContain('spy-mission-stages');
  expect(ui).toContain('spy-agent-next-step');
  expect(ui).toContain('spy-agent-timeline-details');
  expect(ui).toContain('agent.toNextRank');
  expect(ui).toContain('progressbar');
 });
 it('controles móveis são responsivos e têm tamanho mínimo para toque',()=>{
  const planner=read('src/components/house/espionage/spy-mission-planner.css');
  const narrator=read('src/components/house/espionage/spy-narrator-resolution.css');
  const agent=read('src/components/house/espionage/spy-agent-cards.css');
  expect(planner).toContain('@media(max-width:640px)');
  expect(planner).toContain('min-height:48px');
  expect(planner).toContain('font-size:16px');
  expect(narrator).toContain('min-height:44px');
  expect(agent).toContain('min-height:44px');
 });
});
