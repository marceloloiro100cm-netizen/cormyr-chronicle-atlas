import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {planSpyRegionalMission} from '@/lib/espionage/region-turns';
import {cormyrPreviewLinks} from '@/lib/espionage/cormyr-map';
import {spyHouseTargetStage} from '@/lib/espionage/spy-target-stages';

const source=(name:string)=>readFileSync(name,'utf8');
const agent={
 id:'14a26c31-4ef2-4119-b4e5-a3df71a3c2de',
 codename:'O Corvo',status:'available' as const,currentRegion:'dragoncoast',
};

describe('Planejador de espionagem · espião → destino → objetivo → resumo e mapa',()=>{
 it('solicita os três campos na sequência e usa a posição real do espião',()=>{
  const panel=source('src/components/house/espionage/spy-regional-turns-panel.tsx');
  const agentStep=panel.indexOf('aria-label="Agente da missão"');
  const regionStep=panel.indexOf('aria-label="Região de destino"');
  const houseStep=panel.indexOf('aria-label="Casa nobre alvo"');
  const preview=panel.indexOf('<SpyMissionOddsCard');
  const map=panel.indexOf('<CormyrInteractiveMap');
  expect(agentStep).toBeGreaterThan(0);
  expect(regionStep).toBeGreaterThan(agentStep);
  expect(houseStep).toBeGreaterThan(regionStep);
  expect(preview).toBeGreaterThan(houseStep);
  expect(map).toBeGreaterThan(preview);
  expect(panel).toContain("const originRegion=selected?.currentRegion??null");
  expect(panel).toContain("const [assetId,setAssetId]=useState('')");
  expect(panel).not.toContain('Origem do cálculo');
  expect(panel).toContain('Objetivo da espionagem');
  const objectiveStep=panel.indexOf('aria-label="Objetivo da espionagem"');
  expect(objectiveStep).toBeGreaterThan(houseStep);
  expect(preview).toBeGreaterThan(objectiveStep);
  expect(panel).not.toContain('originOverride');
  expect(panel).not.toContain("setTargetMode(");
 });
 it('pré-seleciona a região atual ao escolher o espião e limpa Casa quando muda o destino',()=>{
  const panel=source('src/components/house/espionage/spy-regional-turns-panel.tsx');
  expect(panel).toContain("setAssetId(e.target.value);");
  expect(panel).toContain("setDestination(agent?.status==='available'?agent.currentRegion??'':'');");
  expect(panel).toContain("setTargetHouseId('');");
  expect(panel).toContain("const chooseRegion=(id:string)=>{\n  setDestination(id);\n  setTargetHouseId('');");
  expect(panel).toContain('h.regionId===destination&&h.id!==houseId');
  expect(panel).toContain('disabled={!destination||targetsQuery.isPending||targetsQuery.isError}');
  expect(panel).toContain("agents.filter(a=>a.status==='available')");
  expect(panel).toContain('Ver trajeto no mapa');
 });
 it('separa a viagem da investigação e inclui passagens marítimas aprovadas',()=>{
  const result=planSpyRegionalMission({
   agent,destinationRegion:'crownlands',
   links:cormyrPreviewLinks([]),seaAllowed:true,includeReturn:false,
  });
  expect(result.status).toBe('ready');
  if(result.status==='ready'){
   expect(result.travelRounds).toBe(1);
   expect(result.totalRounds).toBe(2);
   expect(result.legs[0]?.passage).toBe('sea_passage');
   expect(result.totalRounds*10).toBe(20);
  }
  const local=planSpyRegionalMission({
   agent,destinationRegion:'dragoncoast',links:cormyrPreviewLinks([]),seaAllowed:true,
  });
  expect(local.status).toBe('ready');
  if(local.status==='ready'){
   expect(local.travelRounds).toBe(0);
   expect(local.totalRounds).toBe(1);
  }
 });
 it('permite planejamento antes da viagem sem autorizar investigação à distância',()=>{
  expect(spyHouseTargetStage({
   agent,selectedRegion:'crownlands',targetHouseId:'calantar',
   houseTargets:[{id:'calantar',name:'Calantar',regionId:'crownlands'}],
   simulation:false,
  })).toBe('requires_region_arrival');
  const panel=source('src/components/house/espionage/spy-regional-turns-panel.tsx');
  expect(panel).toContain('A missão inicia a viagem até');
  expect(panel).toContain("queryFn:readSpyNobleHouseTargetsBrowser");
  expect(panel).toContain("queryFn:()=>readSpyRegionalStrategyBrowser(houseId)");
 });
 it('mostra tempo de viagem, chance real e total antes do mapa',()=>{
  const card=source('src/components/house/espionage/spy-mission-odds-card.tsx');
  expect(card).toContain('Tempo de viagem');
  expect(card).toContain('Chance estimada de sucesso');
  expect(card).toContain('Tempo para executar a missão');
  expect(card).toContain('props.travelRounds+1');
  expect(card).toContain('missionRounds*10');
  expect(card).toContain('readSpyMissionOddsBrowser');
  expect(card).toContain("query.isPending?'Calculando…'");
  expect(card).not.toContain("successPercent??0");
  const css=source('src/components/house/espionage/spy-mission-odds-card.css');
  expect(css).toContain('grid-template-columns:repeat(3,minmax(0,1fr))');
 });
 it('mapa marca os pontos de origem/destino e desenha seta na rota',()=>{
  const map=source('src/components/house/espionage/cormyr-interactive-map.tsx');
  expect(map).toContain('cormyr-origin-pin');
  expect(map).toContain('cormyr-target-pin');
  expect(map).toContain('markerEnd=');
  expect(map).toContain('Partida: ');
  expect(map).toContain('Destino: ');
  expect(map).toContain('href="/maps/cormyr-regioes.webp"');
  expect(map).toContain('onSelect');
 });
});
