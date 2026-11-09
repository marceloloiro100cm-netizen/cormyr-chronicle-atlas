import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {spyNarratorOperationSchema,type SpyNarratorOperation}
 from '@/lib/espionage/spy-operations-browser';
import {filterSpyOperations,spyNeedsDossierAttention,
 spyNeedsNarratorAction,spyNarratorActionQueue,spyOperationCounters}
 from '@/components/house/espionage/spy-narrator-operations-center';

const root=(p:string)=>readFileSync(p,'utf8');
const base={
 ownerHouseId:'ashkar',ownerHouseName:'Ashkar',targetHouseId:'harcourt',
 targetHouseName:'Harcourt',agentName:'Corvo',agentStatus:'available',
 objective:'house_resources',departureKey:'1522-01-11',arrivalKey:'1522-01-21',
 investigationEndKey:'1522-02-01',createdAt:'2026-11-09T10:00:00Z',
 outcome:null,intelligenceStatus:null,
} as const;
const id=(n:number)=>n.toString(16).padStart(8,'0')+'-0000-4000-8000-000000000000';
function op(n:number,fields:Partial<SpyNarratorOperation>={}):SpyNarratorOperation{
 return spyNarratorOperationSchema.parse({
  ...base,operationId:id(n),status:'traveling',...fields,
 });
}

describe('R5 Lote 3: central do Narrador com pendências prioritárias',()=>{
 it('só mostra casos que exigem julgamento ou dossiê ainda incompleto',()=>{
  const rows=[
   op(1,{status:'traveling'}),
   op(2,{status:'pending_narrator_review'}),
   op(3,{status:'completed',outcome:'success',intelligenceStatus:'waiting_catalog'}),
   op(4,{status:'completed',outcome:'success',intelligenceStatus:'complete'}),
   op(5,{status:'completed',outcome:'failure',intelligenceStatus:null}),
   op(6,{status:'completed',outcome:'captured',intelligenceStatus:null}),
   op(7,{status:'cancelled'}),
  ];
  expect(rows.filter(spyNeedsNarratorAction).map(x=>x.operationId))
   .toEqual([id(2),id(3)]);
  expect(filterSpyOperations(rows,'','attention').map(x=>x.operationId))
   .toEqual([id(2),id(3)]);
  expect(spyNeedsDossierAttention(rows[5]!)).toBe(false);
  expect(spyOperationCounters(rows)).toEqual({
   active:1,review:1,dossier:1,complete:4,
  });
 });
 it('prioriza julgar, depois reprocessar, sem esconder pendências por paginação',()=>{
  const rows=[
   op(1,{status:'completed',outcome:'success',intelligenceStatus:'waiting_catalog',
    createdAt:'2026-11-09T19:00:00Z'}),
   op(2,{status:'pending_narrator_review',createdAt:'2026-11-09T08:00:00Z'}),
   op(3,{status:'pending_narrator_review',createdAt:'2026-11-09T20:00:00Z'}),
   op(4,{status:'traveling'}),
  ];
  expect(spyNarratorActionQueue(rows).map(x=>x.operationId))
   .toEqual([id(3),id(2),id(1)]);
  expect(rows[0]!.operationId).toBe(id(1)); // nonmutating sort
 });
 it('filtros por Casa continuam funcionando sem revelar outro resultado',()=>{
  const rows=[op(1,{status:'pending_narrator_review',ownerHouseName:'Érdénor'}),
   op(2,{status:'completed',outcome:'success',intelligenceStatus:null,
    ownerHouseName:'Harcourt'})];
  expect(filterSpyOperations(rows,'erdenor','attention')).toHaveLength(1);
  expect(filterSpyOperations(rows,'Harcourt','review')).toHaveLength(0);
  expect(filterSpyOperations(rows,'','dossier').map(x=>x.operationId)).toEqual([id(2)]);
 });
 it('a tela abre diretamente em pendências e mantém os botões R4',()=>{
  const src=root('src/components/house/espionage/spy-narrator-operations-center.tsx');
  expect(src).toContain("useState('attention')");
  expect(src).toContain("state==='attention'");
  expect(src).toContain('spyNarratorActionQueue(operations)');
  expect(src).toContain('Ações pendentes');
  expect(src).toContain('Resolver agora');
  expect(src).toContain('Concluir dossiê');
  expect(src).toContain('retrySpyIntelligence');
  expect(src).toContain('role="status"');
  expect(src).toContain('scrollIntoView');
  const focus=src.indexOf('ref={reviewRef} tabIndex={-1}');
  const list=src.indexOf('className="spy-operations-list"');
  expect(focus).toBeGreaterThan(0);
  expect(list).toBeGreaterThan(focus); // no buried form after 15 missions
 });
 it('falha no RPC de dossiês não esconde Central ou incidentes',()=>{
  const src=root('src/components/house/espionage/spy-dossier-panel.tsx');
  const guard=src.slice(src.indexOf('if(query.isError)return <>'));
  expect(guard).toContain('<SpyNarratorOperationsCenter/>');
  expect(guard).toContain('<SpyNarratorIncidentHistory/>');
  expect(guard).toContain('A Central de Operações');
 });
 it('dossiê do Narrador expõe atualização e funciona em cards móveis',()=>{
  const src=root('src/components/house/espionage/spy-dossier-panel.tsx');
  expect(src).toContain('spyDossierLastVerified(d)');
  expect(src).toContain('spyIntelligenceFreshness(last,officialDate).label');
  expect(src).toContain('data-label="Recursos"');
  expect(src).toContain('data-label="Exército"');
  expect(src).toContain('data-label="Posses"');
  const css=root('src/components/house/espionage/spy-dossier.css');
  expect(css).toContain('.spy-dossier-admin-table td:before');
  expect(css).toContain('content:attr(data-label)');
  expect(css).toContain('min-height:48px');
 });
});
