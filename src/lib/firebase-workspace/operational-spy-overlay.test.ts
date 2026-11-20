import {describe,it,expect} from 'vitest';
import {projectSpyOverlay} from '../../../scripts/firebase/workspace-spy-overlay.mjs';

const agentId='11111111-1111-4111-8111-111111111111';
const opId='22222222-2222-4222-8222-222222222222';
const dossierId='33333333-3333-4333-8333-333333333333';
const findingId='44444444-4444-4444-8444-444444444444';
const source={
 assets:[{id:agentId,ownerHouseId:'h1',codename:'Sentinela',
   status:'operating',version:1,portraitId:null}],
 operations:[{id:opId,assetId:agentId,ownerHouseId:'h1',
   targetId:'h2',status:'operating',version:1}],
 dossiers:[],findings:[],events:[],history:[],upgrades:[],removals:[],
 timeline:[],decisions:[],awards:[],intelEvents:[],adminAudit:[],
};
const empty={spyAgents:[],spyOperations:[],spyDossiers:[],
 spyFindings:[],spyEvents:[],spyUpgrades:[],spyHistories:[],
 spyRemovals:[],spyTimelines:[],spyDecisions:[],spyAwards:[],
 spyIntelEvents:[],spyAdminAudits:[]};
describe('7b/7c, projeção operacional preserva sigilo e proveniência',()=>{
 it('aceita avanço estritamente mais recente sem tocar o acervo',()=>{
  const original=structuredClone(source);
  const next=projectSpyOverlay(source,{...empty,spyOperations:[{
   ...source.operations[0],version:2,status:'pending_narrator_review',
  }]});
  expect(next.operations[0].version).toBe(2);
  expect(source).toEqual(original);
 });
 it('recusa desvio de identidade ou titularidade da operação',()=>{
  expect(()=>projectSpyOverlay(source,{...empty,spyOperations:[{
   ...source.operations[0],version:2,ownerHouseId:'h3',
  }]})).toThrow(/spy_overlay/);
  expect(()=>projectSpyOverlay(source,{...empty,spyOperations:[{
   ...source.operations[0],version:2,assetId:'unknown',
  }]})).toThrow(/spy_overlay/);
 });
 it('aceita criação e posterior revogação de achado apenas operacional',()=>{
  const dossier={id:dossierId,ownerHouseId:'h1',targetHouseId:'h2',
   updatedAt:'2026-11-19T00:00:00Z'};
  const finding={id:findingId,dossierId,objective:'house_resources',
   subjectKey:'wealth',valueSnapshot:{value:5}};
  const ready=projectSpyOverlay(source,{...empty,
   spyDossiers:[dossier],spyFindings:[finding]});
  expect(ready.findings).toHaveLength(1);
  const revoked=projectSpyOverlay(source,{...empty,
   spyDossiers:[dossier],spyFindings:[{...finding,deleted:true}]});
  expect(revoked.findings).toHaveLength(0);
 });
 it('não admite duas Casas donas do mesmo par de dossiê',()=>{
  const one={id:dossierId,ownerHouseId:'h1',targetHouseId:'h2'};
  const two={id:findingId,ownerHouseId:'h1',targetHouseId:'h2'};
  expect(()=>projectSpyOverlay(source,{...empty,
   spyDossiers:[one,two]})).toThrow('spy_dossier_pair_duplicate');
 });
});
