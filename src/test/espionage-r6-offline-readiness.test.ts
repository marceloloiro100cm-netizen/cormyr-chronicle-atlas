import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const source=(path:string)=>readFileSync(path,'utf8');

/** Contratos verificáveis sem login, campanha, calendário ou banco de dados. */
describe('Espionagem R6 · prontidão offline sem alterar a campanha',()=>{
 it('reprocessa somente dossiê com fonte pendente; falha de integridade recebe diagnóstico',()=>{
  const ui=source('src/components/house/espionage/spy-narrator-operations-center.tsx');
  expect(ui).toContain("o.intelligenceStatus==='waiting_catalog'?'retry':'integrity'");
  expect(ui).toContain("spyDossierAttentionKind(o)==='retry'&&<Button");
  expect(ui).toContain("spyDossierAttentionKind(o)==='integrity'&&<Button");
  expect(ui).toContain('Verificar status');
  expect(ui).toContain('{selectedReview&&!query.isError&&<section');
  expect(ui).toContain('Prêmio não confirmado');
  expect(ui).toContain('disabled={Boolean(retryingDossier)||query.isError}');
  expect(ui).toContain('aria-live="polite"');
 });
 it('mantém a chave quando envio real fica incerto após perda de rede',()=>{
  const ui=source('src/components/house/espionage/spy-submit-house-mission.tsx');
  expect(ui).toContain('const key=requestKey.current??crypto.randomUUID()');
  expect(ui).toContain('requestKey.current=key');
  expect(ui).toContain('e instanceof SpyMissionError?e.message');
  expect(ui).toContain('locationChanged');
  expect(ui).toContain("requestKey.current=null;agentVersion.current=null");
  expect(ui).not.toContain('setError(e instanceof Error?e.message');
 });
 it('registra falha de materialização sem expor detalhes de banco ou da Casa',()=>{
  const server=source('src/lib/espionage/spy-agent-actions.functions.ts');
  expect(server).toContain('dossier reconciliation required (details redacted)');
  expect(server).not.toContain("console.error('Mission adjudicated; dossier retry required',error)");
  expect(server).toContain('return {...parsed.data,intelligenceStatus}');
 });
 it('garante toque, foco e legibilidade em celular pequeno',()=>{
  for(const p of [
   'src/components/house/espionage/spy-operations-center.css',
   'src/components/house/espionage/spy-dossier.css',
   'src/components/house/espionage/spy-agent-creation-ux.css',
  ]){
   const css=source(p);
   expect(css).toContain('@media(max-width:375px)');
   expect(css).toContain(':focus-visible');
   expect(css).toContain('min-height:48px');
   expect(css).toContain('font-size:16px');
   expect(css).toContain('min-width:0');
  }
 });
 it('mantém o planejamento com três passos e resumo oficial do HUB',()=>{
  const journey=source('src/lib/espionage/spy-player-journey.ts');
  const ui=source('src/components/house/espionage/spy-submit-house-mission.tsx');
  expect(journey).toContain("'agent'|'destination'|'objective'");
  expect(journey).toContain('durationDesdias:duration');
  expect(ui).toContain('const latest=await getCampaignTime()');
  expect(ui).toContain('if(latest.version!==calendarVersion)');
  expect(ui).toContain('readSpyHouseManagementBrowser(houseId)');
 });
 it('não executa fixture ou alterações em banco real nesta suíte',()=>{
  const live=source('scripts/espionage-authenticated-acceptance.mjs');
  expect(live).toContain("SPY_ACCEPTANCE_ENV!=='isolated-homologation'");
  expect(live).toContain('SPY_ALLOWED_HOMOLOGATION_HOST');
  expect(live).toContain('Read only.');
 });
});
