import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const file=(name:string)=>readFileSync(name,'utf8');

describe('R4 · jornada de espionagem utilizável numa sessão real',()=>{
 it('um jogador escolhe a Rede de origem e não fica preso à primeira vaga',()=>{
  const src=file('src/components/house/espionage/spy-create-agent-dialog.tsx');
  expect(src).toContain('Rede de origem do agente');
  expect(src).toContain('setSourceHoldingId(e.target.value)');
  expect(src).toContain('sourceHoldingId?slots.find');
  expect(src).not.toContain('const source=slots[0]');
  expect(src).toContain('sourceHoldingId&&!source');
  expect(src).toContain('requestKey.current=null;setSourceHoldingId');
 });
 it('o envio real revalida o HUB no último segundo',()=>{
  const src=file('src/components/house/espionage/spy-submit-house-mission.tsx');
  expect(src).toContain('const latest=await getCampaignTime()');
  expect(src).toContain('latest.version!==calendarVersion');
  expect(src).toContain("new SpyMissionError('calendar_changed')");
  expect(src).toContain('Atualizar previsão e agentes');
  expect(src).toContain('expectedAgentVersion:agentVersion.current');
  expect(src).toContain('expectedCalendarVersion:calendarVersion');
 });
 it('o narrador resolve a missão na Central sem navegar para outra Casa',()=>{
  const src=file('src/components/house/espionage/spy-narrator-operations-center.tsx');
  const resolution=file('src/components/house/espionage/spy-narrator-resolution.tsx');
  expect(src).toContain('Resolver agora');
  expect(src).toContain('enabled:Boolean(selectedReview)');
  expect(src).toContain('readSpyHouseManagementBrowser(selectedReview!.ownerHouseId)');
  expect(src).toContain('<SpyNarratorResolutionPanel data={houseQuery.data}');
  expect(src).toContain('operationId={selectedReview.operationId}');
  expect(resolution).toContain('(!operationId||o.id===operationId)');
  expect(resolution).toContain("queryKey:['spy-narrator-operations']");
 });
 it('a conclusão informa claramente quando o prêmio ainda não foi materializado',()=>{
  const src=file('src/components/house/espionage/spy-narrator-operations-center.tsx');
  expect(src).toContain("result.intelligenceStatus==='complete'");
  expect(src).toContain('Verifique o reprocessamento do dossiê.');
  const server=file('src/lib/espionage/spy-agent-actions.functions.ts');
  expect(server).toContain("intelligenceStatus='retry_required'");
  expect(server).toContain("parsed.data.outcome==='mission_success'");
 });
 it('a API preserva receiver em todas as ações server-side de espionagem',()=>{
  const names=[
   'spy-agent-actions.functions.ts','spy-management.functions.ts',
   'spy-recruitment.functions.ts','spy-target-defense.functions.ts',
   'spy-narrator-house-defense.functions.ts','region-review.functions.ts',
  ];
  for(const name of names){
   const src=file('src/lib/espionage/'+name);
   expect(src).not.toContain('const rpc=context.supabase.rpc as unknown as Rpc;');
   expect(src).toContain('context.supabase.rpc.bind(context.supabase)');
  }
 });
 it('o painel mantém um único fluxo de criação, planejamento, adjudicação e dossiê',()=>{
  expect(file('src/components/house/espionage/spy-create-agent-dialog.tsx'))
   .toContain('Criar espião');
  expect(file('src/components/house/espionage/spy-regional-turns-panel.tsx'))
   .toContain('Nova missão de espionagem');
  expect(file('src/components/house/espionage/spy-narrator-operations-center.tsx'))
   .toContain('Resolver agora');
  expect(file('src/components/house/espionage/spy-dossier-panel.tsx'))
   .toContain('Dossiês de Espionagem');
 });
 it('o CSS de telefone dá controles grandes e evita colunas comprimidas',()=>{
  const css=file('src/components/house/espionage/spy-operations-center.css');
  expect(css).toContain('.spy-operation-resolve-button');
  expect(css).toContain('min-height:48px');
  const planner=file('src/components/house/espionage/spy-mission-planner.css');
  expect(planner).toContain('.spy-planner-step select{font-size:16px');
 });
});
