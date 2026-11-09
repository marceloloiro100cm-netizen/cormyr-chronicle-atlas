import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 spyNeedsDossierAttention,spyCanRetryDossier,spyOperationCounters,filterSpyOperations,
 prioritizeSpyOperations,
} from '@/components/house/espionage/spy-narrator-operations-center';
import type {SpyNarratorOperation}
 from '@/lib/espionage/spy-operations-browser';
import {spyDossierSchema} from '@/lib/espionage/spy-dossier.functions';
import {spyDossierDisclosureSummary,buildSpyDossierReport}
 from '@/lib/espionage/spy-dossier-report';

const read=(path:string)=>readFileSync(path,'utf8');
const op=(id:string,status:SpyNarratorOperation['status'],
 o:Partial<SpyNarratorOperation>={}):SpyNarratorOperation=>({
 operationId:id,ownerHouseId:'r5-owner',ownerHouseName:'Casa da Origem',
 targetHouseId:'r5-target',targetHouseName:'Casa do Alvo',
 agentName:'Corvo',agentStatus:'available',status,objective:'house_resources',
 departureKey:'1522-01-11',arrivalKey:'1522-01-21',
 investigationEndKey:'1522-02-01',outcome:null,intelligenceStatus:null,
 createdAt:'2026-11-09T00:00:00Z',...o,
});
const uuid=(n:string)=>n+'0000000-0000-4000-8000-000000000000';

describe('R5 Lote 3 — Central Narrador, missão e prêmio sem navegação lateral',()=>{
 const reviewing=op(uuid('1'),'pending_narrator_review');
 const pending=op(uuid('2'),'completed',{outcome:'success',intelligenceStatus:'waiting_catalog'});
 const ongoing=op(uuid('3'),'traveling');
 const finished=op(uuid('4'),'completed',{outcome:'failure'});
 const awarded=op(uuid('5'),'completed',{outcome:'success',intelligenceStatus:'complete'});
 const rows=[finished,ongoing,awarded,pending,reviewing];

 it('Ações pendentes combina julgamento e prêmio, sem esconder nenhuma das duas',()=>{
  expect(filterSpyOperations(rows,'','attention').map(x=>x.operationId))
   .toEqual([pending.operationId,reviewing.operationId]);
 });
 it('prioriza julgamento, dossiê, viagem e arquivo, independentemente da ordem SQL',()=>{
  const ordered=prioritizeSpyOperations(rows);
  expect(ordered.map(x=>x.operationId))
   .toEqual([reviewing.operationId,pending.operationId,ongoing.operationId,
    finished.operationId,awarded.operationId]);
  expect(rows[0]?.operationId).toBe(finished.operationId); // input not mutated
 });
 it('sucesso confirmado não fica na fila e fracasso não recebe reprocessamento',()=>{
  expect(spyNeedsDossierAttention(awarded)).toBe(false);
  expect(spyNeedsDossierAttention(finished)).toBe(false);
  expect(spyNeedsDossierAttention(pending)).toBe(true);
  expect(spyCanRetryDossier(pending)).toBe(true);
  const missing=op(uuid('9'),'completed',{outcome:'success',intelligenceStatus:null});
  expect(spyNeedsDossierAttention(missing)).toBe(true);
  expect(spyCanRetryDossier(missing)).toBe(false);
  expect(spyOperationCounters(rows)).toEqual({active:1,review:1,dossier:1,complete:3});
 });
 it('filtro de modalidade e busca continuam isolados, inclusive com acentos',()=>{
  expect(filterSpyOperations(rows,'Casa do Alvo','attention')).toHaveLength(2);
  expect(filterSpyOperations(rows,'não existe','attention')).toHaveLength(0);
  expect(filterSpyOperations(rows,'','completed')).toHaveLength(3);
  expect(filterSpyOperations(rows,'','review')).toHaveLength(1);
 });
 it('ação da Central carrega ficha da Casa apenas por clique e não julga operação obsoleta',()=>{
  const src=read('src/components/house/espionage/spy-narrator-operations-center.tsx');
  expect(src).toContain('enabled:Boolean(selectedReview)');
  expect(src).toContain('readSpyHouseManagementBrowser(selectedReview!.ownerHouseId)');
  expect(src).toContain('Ações pendentes');
  expect(src).toContain('prioritizeSpyOperations(filterSpyOperations(operations,search,state))');
  expect(src).toContain('o.id===selectedReview.operationId&&o.status');
  expect(src).toContain('Resolver agora');
  expect(src).toContain('Concluir dossiê');
  expect(src).toContain('spyCanRetryDossier(o)');
  expect(src).toContain('Não repetir o julgamento; revisar integridade do dossiê');
  expect(src).toContain("qc.invalidateQueries({queryKey:['spy-dossiers']})");
 });
 it('a Central permanece acessível quando apenas a consulta aos dossiês falha',()=>{
  const dossier=read('src/components/house/espionage/spy-dossier-panel.tsx');
  expect(dossier).toContain('if(query.isError)return <>');
  expect(dossier).toContain('<SpyNarratorOperationsCenter/>');
  expect(dossier).toContain('Tentar novamente');
 });
});

describe('R5 Lote 3 — dossiês claros e exportação confidencial',()=>{
 const dossier=spyDossierSchema.parse({
  id:uuid('6'),ownerHouseId:'r5-owner',ownerHouseName:'Casa da Origem',
  targetHouseId:'r5-target',targetHouseName:'Casa do Alvo',
  targetRegion:'ferlin',updatedAt:'2026-11-09T00:00:00Z',
  findings:[{
   id:uuid('7'),objective:'house_resources',key:'law',
   snapshot:{value:41,rawSecret:'NÃO_VAZAR_DADO_INTERNO'},
   discoveredDate:'1522-01-11',verifiedDate:'1522-02-01',
  }],
  history:[{id:uuid('8'),objective:'house_resources',key:'law',
   action:'refreshed',dateKey:'1522-02-01',oldSnapshot:{value:38},
   newSnapshot:{value:41}}],
  adminHistory:[{id:uuid('9'),objective:'house_resources',
   key:'law',action:'revalidate',dateKey:'1522-02-01',
   reason:'Justificativa administrativa confidencial'}],
 });
 it('exibe contagem 1/7 sem inferir os outros seis valores',()=>{
  const s=spyDossierDisclosureSummary(dossier,'1522-02-11');
  expect(s.resources).toBe(1);
  expect(s.army).toBe(0);
  expect(s.possessions).toBe(0);
  const ui=read('src/components/house/espionage/spy-dossier-panel.tsx');
  expect(ui).toContain("item.id==='house_resources'?'/7':''");
  expect(ui).toContain('Última confirmação:');
  expect(ui).toContain('Desconhecido');
 });
 it('relatório não exporta snapshot bruto ou justificativa do Narrador',()=>{
  const text=buildSpyDossierReport(dossier,'1522-02-11');
  expect(text).toContain('41');
  expect(text).not.toContain('NÃO_VAZAR_DADO_INTERNO');
  expect(text).not.toContain('Justificativa administrativa confidencial');
  expect(text).not.toContain('38');
 });
 it('tabela de dossiês usa rótulos nos cartões de celular sem alargar a página',()=>{
  const ui=read('src/components/house/espionage/spy-dossier-panel.tsx');
  const css=read('src/components/house/espionage/spy-dossier.css');
  for(const text of ['data-label="Investigadora"','data-label="Casa-alvo"',
   'data-label="Recursos"','data-label="Exército"','data-label="Posses"']){
   expect(ui).toContain(text);
  }
  expect(css).toContain('content:attr(data-label)');
  expect(css).toContain('grid-template-columns:minmax(0,1fr)');
  expect(css).toContain('min-height:48px');
 });
 it('exportação continua por ação do usuário e o histórico do jogador não exibe valores anteriores',()=>{
  const actions=read('src/components/house/espionage/spy-dossier-report-actions.tsx');
  expect(actions).toContain('navigator.clipboard.writeText(buildSpyDossierReport');
  expect(actions).toContain('window.print()');
  expect(actions).toContain('spyDossierVersionRows(dossier,narrator)');
 });
});

describe('R5 Lote 3 — autorização SQL separa jogadores e Narrador sem dados reais',()=>{
 const sql=read('scripts/espionage-r5-lot3-privacy-rollback.sql');
 it('recusa bancos com contas, calendário ou informações já cadastradas',()=>{
  expect(sql).toContain("laboratório não isolado");
  expect(sql).toContain('IF EXISTS(SELECT 1 FROM auth.users)');
  expect(sql).toContain('OR EXISTS(SELECT 1 FROM public.spy_intelligence_dossiers)');
  expect(sql.trim().endsWith('ROLLBACK;')).toBe(true);
  expect(sql).not.toMatch(/\bCOMMIT\s*;/i);
 });
 it('testa isolamento das duas Casas e impede leitura global por jogador',()=>{
  expect(sql).toContain("public.spy_intelligence_read('r5-l3-owner')");
  expect(sql).toContain("public.spy_intelligence_read('r5-l3-other')");
  expect(sql).toContain("public.spy_intelligence_read(NULL)");
  expect(sql).toContain('jogador B leu informação de A');
  expect(sql).toContain("jsonb_array_length(v->0->'adminHistory')<>0");
 });
 it('testa que somente Narrador lê operações, incidentes e pendências',()=>{
  for(const fn of ['spy_narrator_operations_dashboard',
   'spy_narrator_incident_history','spy_intelligence_admin_pending']){
   expect(sql).toContain('public.'+fn);
  }
  expect(sql).toContain('jogador A acessou Central');
  expect(sql).toContain('anônimo leu Central');
 });
 it('não tenta publicar nem modificar usuários reais',()=>{
  expect(sql).toContain("r5-l3-narrator@invalid.example");
  expect(sql).toContain('BEGIN;');
  expect(sql.trim().endsWith('ROLLBACK;')).toBe(true);
 });
});
