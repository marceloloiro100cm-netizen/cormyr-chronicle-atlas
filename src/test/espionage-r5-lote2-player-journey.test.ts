import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {spyPlayerJourneyStep,spyPlayerMissionSummary}
 from '@/lib/espionage/spy-player-journey';

const file=(name:string)=>readFileSync(name,'utf8');
const agentReady={hasAgent:true,agentAvailable:true,hasRegion:true,
 hasTarget:true,routeReady:true} as const;

describe('R5 Lote 2 — jornada simples de jogador',()=>{
 it('mostra o passo 1 até o espião estar realmente disponível',()=>{
  expect(spyPlayerJourneyStep({...agentReady,hasAgent:false})).toBe('agent');
  expect(spyPlayerJourneyStep({...agentReady,agentAvailable:false})).toBe('agent');
 });
 it('trata região e Casa como um único passo 2',()=>{
  expect(spyPlayerJourneyStep({...agentReady,hasRegion:false})).toBe('destination');
  expect(spyPlayerJourneyStep({...agentReady,hasTarget:false})).toBe('destination');
  expect(spyPlayerJourneyStep({...agentReady,routeReady:false})).toBe('destination');
 });
 it('libera o objetivo apenas com origem, alvo e rota homologáveis',()=>{
  expect(spyPlayerJourneyStep(agentReady)).toBe('objective');
 });
 it('uma missão local usa uma désdia, nunca zero ou prazo inventado',()=>{
  expect(spyPlayerMissionSummary({objective:'house_resources',travelRounds:0,
   arrivalDate:'1522-01-11',endDate:'1522-01-21'}))
   .toEqual({objective:'house_resources',durationDesdias:1,
    durationOrdinaryDays:10,travelDesdias:0,
    arrivalDate:'1522-01-11',endDate:'1522-01-21'});
 });
 it('missão inter-regional soma investigação após viagem, sem modificar regra',()=>{
  expect(spyPlayerMissionSummary({objective:'army',travelRounds:2,
   arrivalDate:'1522-02-01',endDate:'1522-02-11'}))
   .toEqual({objective:'army',durationDesdias:3,
    durationOrdinaryDays:30,travelDesdias:2,
    arrivalDate:'1522-02-01',endDate:'1522-02-11'});
 });
 it('sem rota oficial não inventa dias nem datas',()=>{
  const result=spyPlayerMissionSummary({objective:'possessions',
   travelRounds:null,arrivalDate:null,endDate:null});
  expect(result.durationDesdias).toBeNull();
  expect(result.durationOrdinaryDays).toBeNull();
  expect(result.endDate).toBeNull();
 });
 it('o usuário decide espião, destino e objetivo antes da confirmação',()=>{
  const ui=file('src/components/house/espionage/spy-regional-turns-panel.tsx');
  expect(ui).toContain('Planeje sua missão em três etapas');
  const agent=ui.indexOf('<b>1</b> Espião');
  const destination=ui.indexOf('<b>2</b> Destino');
  const objective=ui.indexOf('<b>3</b> Missão');
  const confirmation=ui.indexOf('<SpySubmitHouseMission');
  expect(agent).toBeGreaterThan(0);
  expect(destination).toBeGreaterThan(agent);
  expect(objective).toBeGreaterThan(destination);
  expect(confirmation).toBeGreaterThan(objective);
  expect(ui).toContain('Região de destino');
  expect(ui).toContain('Casa nobre alvo');
  expect(ui).toContain('SPY_INTELLIGENCE_OBJECTIVES.map');
  expect(ui).toContain('disabled={!selectedTargetHouse||!agentAvailable||!ready}');
  expect(ui).toContain('A missão inicia a viagem até');
  expect(ui).toContain('Ver trajeto no mapa (opcional)');
 });
 it('a troca de alvo, região, agente e modalidade limpa um comprovante anterior',()=>{
  const ui=file('src/components/house/espionage/spy-regional-turns-panel.tsx');
  expect(ui).toContain("setDestination(agent?.status==='available'?agent.currentRegion??'':'')");
  expect(ui).toContain("setTargetHouseId('');\n  setSubmitted(null);");
  expect(ui).toContain('setTargetHouseId(e.target.value);setSubmitted(null)');
  expect(ui).toContain('setObjective(e.target.value as SpyIntelligenceObjective)');
  expect(ui).toContain("setSubmitted(null);");
 });
 it('confirmação é breve e mostra somente dados oficiais do HUB',()=>{
  const ui=file('src/components/house/espionage/spy-submit-house-mission.tsx');
  const planner=file('src/components/house/espionage/spy-regional-turns-panel.tsx');
  expect(ui).not.toContain('id="spy-mission-objective"');
  expect(ui).toContain('<strong>Objetivo:</strong>');
  expect(ui).toContain('<strong>Conclusão prevista:</strong>');
  expect(ui).toContain('formatDate(summary.endDate)');
  expect(ui).toContain('getCampaignTime()');
  expect(ui).toContain('expectedCalendarVersion:calendarVersion');
  expect(ui).toContain('requestKey.current??crypto.randomUUID()');
  expect(planner).toContain('forecast.investigationEndsDateKey');
  expect(planner).toContain('Aguardando a previsão oficial do HUB');
 });
 it('criação contém só campos essenciais, com compras recolhidas por padrão',()=>{
  const ui=file('src/components/house/espionage/spy-create-agent-dialog.tsx');
  expect(ui).toContain('Nome do espião');
  expect(ui).toContain('Rede de origem do agente');
  expect(ui).toContain('SpyPortraitPicker');
  expect(ui).toContain('<details className="cormyr-creation-section spy-create-upgrades">');
  expect(ui).toContain('Melhorias opcionais');
  expect(ui).toContain('sourceHoldingId:source.sourceHoldingId');
  expect(ui).toContain('if(busy)return;requestKey.current=null;setPortraitId');
  expect(ui).not.toContain('Vagas de espionagem da Casa');
 });
 it('as quatro fases têm leitura imediata, com conclusão oficial visível',()=>{
  const ui=file('src/components/house/espionage/spy-house-management.tsx');
  expect(ui).toContain("['Viagem','Investigação','Narrador','Concluída']");
  expect(ui).toContain('Próxima etapa:');
  expect(ui).toContain('Conclusão prevista: <strong>{formatDate(progress.end)}</strong>');
  expect(ui).toContain('Tentar novamente');
  expect(ui).toContain('spy-agent-timeline-details');
 });
 it('os layouts estreitos evitam rolagem lateral e priorizam toque',()=>{
  const planner=file('src/components/house/espionage/spy-mission-planner.css');
  const create=file('src/components/house/espionage/spy-agent-creation-ux.css');
  const cards=file('src/components/house/espionage/spy-agent-cards.css');
  expect(planner).toContain('@media(max-width:360px)');
  expect(planner).toContain('.spy-mission-confirm-actions');
  expect(planner).toContain('font-size:16px');
  expect(planner).toContain('min-height:48px');
  expect(create).toContain('.spy-create-upgrades');
  expect(create).toContain('min-height:48px');
  expect(create).toContain('@media(max-width:360px)');
  expect(cards).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
 });
});
