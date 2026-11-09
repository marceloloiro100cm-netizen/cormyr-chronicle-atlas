import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {spyIntelligenceFreshness,spyDossierLastVerified}
 from '@/lib/espionage/spy-intelligence-freshness';
import {buildSpyChronicle,filterSpyChronicle} from '@/lib/espionage/spy-agent-chronicle';
import {spyOperationCounters,filterSpyOperations,spyNeedsDossierAttention}
 from '@/components/house/espionage/spy-narrator-operations-center';
import {spyManagementSchema} from '@/lib/espionage/spy-management.functions';
import type {SpyNarratorOperation} from '@/lib/espionage/spy-operations-browser';

const op=(o:Partial<SpyNarratorOperation>={}):SpyNarratorOperation=>({
 operationId:'11111111-1111-4111-8111-111111111111',
 ownerHouseId:'ashkar',ownerHouseName:'Ashkar',
 targetHouseId:'harcourt',targetHouseName:'Harcourt',
 agentName:'Corvo',agentStatus:'available',status:'traveling',objective:'army',
 departureKey:'1522-01-21',arrivalKey:'1522-02-01',
 investigationEndKey:'1522-02-11',
 outcome:null,intelligenceStatus:null,createdAt:'2026-11-09T00:00:00Z',...o,
});
describe('Espionagem P2 · central de operações do Narrador',()=>{
 it('resumo mantém estados distintos e detecta prêmio não entregue',()=>{
  const operations=[
   op(),op({operationId:'22222222-2222-4222-8222-222222222222',status:'pending_narrator_review'}),
   op({operationId:'33333333-3333-4333-8333-333333333333',status:'completed',outcome:'success'}),
   op({operationId:'44444444-4444-4444-8444-444444444444',status:'completed',
    outcome:'success',intelligenceStatus:'complete'}),
  ];
  expect(spyOperationCounters(operations)).toEqual({active:1,review:1,dossier:1,complete:2});
  expect(spyNeedsDossierAttention(operations[2]!)).toBe(true);
  expect(spyNeedsDossierAttention(operations[3]!)).toBe(false);
 });
 it('filtra por Casa/Agente acentuados e não expõe resultados fora do filtro',()=>{
  const rows=[op(),op({agentName:'Águia',targetHouseName:'Evenhand'})];
  expect(filterSpyOperations(rows,'aguia','all')).toHaveLength(1);
  expect(filterSpyOperations(rows,'Harcourt','all')).toHaveLength(1);
  expect(filterSpyOperations(rows,'','review')).toHaveLength(0);
 });
});
describe('Espionagem P2 · data oficial e histórico cronológico',()=>{
 it('classifica 30/31/91 dias sem relógio real e atravessa Midwinter',()=>{
  expect(spyIntelligenceFreshness('1522-01-21','1522-02-01').days).toBe(10);
  expect(spyIntelligenceFreshness('1522-01-21','1522-02-21').tier).toBe('recent');
  expect(spyIntelligenceFreshness('1522-01-21','1522-02-22').tier).toBe('review');
  expect(spyIntelligenceFreshness('1522-01-21','1522-04-22').tier).toBe('old');
  expect(spyIntelligenceFreshness('1522-02-21','1522-01-21').tier).toBe('future');
  expect(spyIntelligenceFreshness('invalida',null).tier).toBe('unknown');
 });
 it('usa somente eventos da Casa já retornados pelas RPCs privadas',()=>{
  const agentId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const data=spyManagementSchema.parse({
   houseId:'ashkar',agents:[{id:agentId,codename:'Corvo',status:'available',version:1,
    currentRegion:'dragoncoast',missionSuccesses:1,rank:'Verde',
    cunning:3,toNextRank:2,sourceHoldingId:null,portraitId:null,
    forgedDocuments:false,aceInTheHole:false}],
   operations:[{
    id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',assetId:agentId,
    missionKind:'house_recon',targetType:'house',targetId:'harcourt',
    status:'pending_narrator_review',travelDays:10,
    arrivalKey:'1522-02-01',departureKey:'1522-01-21',
    investigationEndKey:'1522-02-11',createdAt:'2026-11-09T00:00:00Z',
   }],
   history:[{
    id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',agentId,eventType:'recruited',
    dateKey:'1522-01-11',targetName:null,targetRegion:null,
    detail:'Criado pelo Narrador',rank:'Verde',cunning:3,totalSuccesses:0,
    failureDegrees:null,operationId:null,
   }],
   recruitment:[],portraits:[],houseVersion:1,
  });
  const chronicle=buildSpyChronicle({...data,availableWealth:null});
  expect(chronicle.map(x=>x.label)).toEqual([
   'Prazo de investigação concluído','Chegada ao destino',
   'Missão iniciada','Recrutamento',
  ]);
  expect(filterSpyChronicle(chronicle,agentId,'travel','')).toHaveLength(1);
  expect(filterSpyChronicle(chronicle,agentId,'all','recrutamento')).toHaveLength(1);
 });
 it('classifica o dossiê pela última confirmação realmente conhecida',()=>{
  const dossier={
   findings:[{verifiedDate:'1522-01-21'},{verifiedDate:'1522-02-11'}],
  } as Parameters<typeof spyDossierLastVerified>[0];
  expect(spyDossierLastVerified(dossier)).toBe('1522-02-11');
 });
});
describe('Espionagem P2 · segurança e regressão estrutural',()=>{
 const read=(path:string)=>readFileSync(path,'utf8');
 it('o SQL exige Narrador ou propriedade da Casa sem expor identidades adversárias',()=>{
  const sql=read('docs/espionage/sql/0111_spy_p2_operations_and_counterintelligence.sql');
  expect(sql).toContain('public.is_campaign_admin()');
  expect(sql).toContain('public.in_campaign_house(p_house,false)');
  expect(sql).toContain("h.event_type IN('escaped','captured','dead')");
  expect(sql).toContain("o.status='completed'");
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.spy_narrator_operations_dashboard() FROM PUBLIC,anon');
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.spy_house_counterintelligence(text) FROM PUBLIC,anon');
  const block=sql.split('CREATE OR REPLACE FUNCTION public.spy_house_counterintelligence')[1]!;
  expect(block).not.toContain("'ownerHouseId'");
  expect(block).not.toContain("'agentName'");
  expect(block).not.toContain("'operationId'");
 });
 it('interface é segura para celular e esconde parâmetros do banco',()=>{
  const ui=read('src/components/house/espionage/spy-house-management.tsx');
  expect(ui).toContain('<SpyHouseCounterintelligence houseId={houseId}/>');
  expect(ui).toContain('spy-defense-overview');
  const dossier=read('src/components/house/espionage/spy-dossier-panel.tsx');
  expect(dossier).toContain('<SpyNarratorOperationsCenter/>');
  expect(dossier).toContain('spyIntelligenceFreshness');
  const server=read('src/lib/espionage/spy-dossier.functions.ts');
  expect(server).not.toContain("throw new Error(result.error.message)");
  expect(server).not.toContain("'+result.error.message)");
 });
});
