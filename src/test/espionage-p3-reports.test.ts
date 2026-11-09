import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {spyDossierSchema} from '@/lib/espionage/spy-dossier.functions';
import {buildSpyDossierReport,spyDossierDisclosureSummary,spyDossierVersionRows}
 from '@/lib/espionage/spy-dossier-report';

const uuid=(part:string)=>part+'0000000-0000-4000-8000-000000000000';
const sample=()=>spyDossierSchema.parse({
 id:uuid('1'),ownerHouseId:'ashkar',ownerHouseName:'Ashkar',
 targetHouseId:'evenhand',targetHouseName:'Evenhand',targetRegion:'helmlands',
 updatedAt:'2026-11-09T12:00:00Z',
 findings:[
  {id:uuid('2'),objective:'house_resources',key:'law',
   snapshot:{value:34,rawSecret:'JOGADOR_NAO_PODE_VER'},
   discoveredDate:'1522-01-11',verifiedDate:'1522-01-21'},
  {id:uuid('3'),objective:'army',key:'unit:guard',
   snapshot:{name:'Guardas',category:'Unidade militar',strength:250,
    dataInterna:'EXERCITO_INTEIRO_SECRETO'},
   discoveredDate:'1522-01-11',verifiedDate:'1522-02-11'},
  {id:uuid('4'),objective:'possessions',key:'holding:1',
   snapshot:{name:'Torre',category:'Fortificação'},
   discoveredDate:'1522-02-01',verifiedDate:'1522-02-11'},
 ],
 history:[
  {id:uuid('5'),objective:'house_resources',key:'law',action:'refreshed',
   dateKey:'1522-01-21',oldSnapshot:{value:30},newSnapshot:{value:34}},
  {id:uuid('6'),objective:'house_resources',key:'wealth',action:'revealed',
   dateKey:'1522-01-11',oldSnapshot:null,newSnapshot:{value:30000}},
 ],
 adminHistory:[
  {id:uuid('7'),objective:'house_resources',key:'law',action:'revalidate',
   dateKey:'1522-01-21',reason:'Motivo interno restrito ao narrador.'},
 ],
});
describe('P3 — exportação privada e sem vazamento',()=>{
 it('copia só atributos descobertos, nunca estado bruto nem auditoria',()=>{
  const dossier=sample();
  const report=buildSpyDossierReport(dossier,'1522-04-22');
  expect(report).toContain('CORMYR · RELATÓRIO DE INTELIGÊNCIA');
  expect(report).toContain('CONFIDENCIAL · CASA Ashkar');
  expect(report).toContain('Alvo: Casa Evenhand');
  expect(report).toContain('Guardas');
  expect(report).toContain('Torre');
  expect(report).toContain('Desconhecido');
  expect(report).not.toContain('JOGADOR_NAO_PODE_VER');
  expect(report).not.toContain('EXERCITO_INTEIRO_SECRETO');
  expect(report).not.toContain('Motivo interno restrito');
  expect(report).not.toContain('30000');
  expect(report).not.toContain('unit:guard');
 });
 it('o resumo conta somente informações conhecidas, sem presumir forças reais',()=>{
  const s=spyDossierDisclosureSummary(sample(),'1522-04-22');
  expect(s).toEqual({resources:1,army:1,possessions:1,stale:3,total:3});
 });
 it('jogadores não recuperam snapshots anteriores ou registros revogados',()=>{
  const history=spyDossierVersionRows(sample(),false);
  expect(history).toHaveLength(1);
  expect(history[0]?.previous).toBeNull();
  expect(history[0]?.next).toBeNull();
  expect(history.every(v=>v.subject!=='wealth')).toBe(true);
 });
 it('narrador vê comparações do histórico oficial, inclusive revogações',()=>{
  const history=spyDossierVersionRows(sample(),true);
  expect(history).toHaveLength(2);
  expect(history[0]?.previous).toBe('30');
  expect(history[0]?.next).toBe('34');
  expect(history[1]?.next).toBe('30000');
 });
 it('a impressão só altera a página ao clicar no botão e nunca por CSS global',()=>{
  const jsx=readFileSync('src/components/house/espionage/spy-dossier-report-actions.tsx','utf8');
  const css=readFileSync('src/components/house/espionage/spy-dossier.css','utf8');
  expect(jsx).toContain('window.addEventListener(\'afterprint\',clear,{once:true})');
  expect(jsx).toContain("buildSpyDossierReport(dossier,officialDate)");
  expect(css).toContain('body.spy-dossier-print-active *{visibility:hidden!important}');
  expect(css).not.toContain(' body *{visibility:hidden!important}');
 });
});
describe('P3 — histórico narrador isolado por banco',()=>{
 it('não publica o arquivo de incidentes para usuários anônimos',()=>{
  const sql=readFileSync('docs/espionage/sql/0112_spy_p3_narrator_incident_history.sql','utf8');
  expect(sql).toContain('auth.uid() IS NULL');
  expect(sql).toContain('public.campaign_access_active()');
  expect(sql).toContain('public.is_campaign_admin()');
  expect(sql).toContain("h.event_type IN('escaped','captured','dead')");
  expect(sql).toContain("o.status='completed'");
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.spy_narrator_incident_history() FROM PUBLIC,anon;');
  expect(sql).not.toMatch(/DELETE\s+FROM|UPDATE\s+public\.spy_/i);
 });
 it('o painel narrador consulta o RPC protegido, nunca tabelas diretamente',()=>{
  const jsx=readFileSync('src/components/house/espionage/spy-narrator-incidents.tsx','utf8');
  const client=readFileSync('src/lib/espionage/spy-operations-browser.ts','utf8');
  expect(jsx).toContain('enabled:expanded');
  expect(jsx).toContain('queryFn:readSpyNarratorIncidentsBrowser');
  expect(client).toContain("privateSpyRead('spy_narrator_incident_history',{})");
  expect(client).toContain('spyNarratorIncidentListSchema');
 });
});
