#!/usr/bin/env node
/**
 * Fail-closed Cormyr Spy production release gate.
 * It NEVER migrates SQL, deploys code or grants permissions.
 * A green disposable PostgreSQL CI job is NOT staging homologation.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifestPath=path.join(repo,'docs/espionage/release-evidence.json');
const signoffPath=path.join(repo,'docs/espionage/homologation-signoff.json');
const expectedCases=Array.from({length:20},(_,i)=>'H'+String(i+1).padStart(2,'0'));
const sha=v=>typeof v==='string'&&/^[0-9a-f]{40}$/i.test(v);
const validEvidenceUrl=v=>typeof v==='string'&&/^https:\/\/[a-z0-9.-]+\//i.test(v)&&
 !/example\.(com|org|invalid)|localhost|127\.0\.0\.1|todo|placeholder|fake/i.test(v);
const validTimestamp=v=>typeof v==='string'&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&
 Number.isFinite(Date.parse(v));

/** Homologation is not authorized by passing disposable tests. These 20 cases
 * must each reference real restored-staging evidence and a specific reviewed
 * commit signed by the Narrator. A stale or duplicate record never counts.
 */
export function evaluateSpyHomologation(input,reviewedCommit){
 const missing=[];
 if(!input||input.schemaVersion!==1||input.module!=='CCA-ESP-MVP-001'){
  return {status:'NO_GO',missing:['Manifesto de homologação inexistente ou inválido']};
 }
 if(input.environment!=='restored-production-staging')
  missing.push('Homologação deve ocorrer em cópia integral restaurada da produção');
 if(input.status!=='ACCEPTED')missing.push('Homologação ainda não foi aceita');
 if(typeof input.stagingProjectId!=='string'||input.stagingProjectId.trim().length<8)
  missing.push('Identificador do ambiente de staging restaurado');
 if(!validEvidenceUrl(input.backupRestoreEvidenceUrl))
  missing.push('Comprovante real de restauração, sem links ilustrativos');
 if(!sha(input.reviewedCommit)||input.reviewedCommit!==reviewedCommit)
  missing.push('Commit de homologação incompatível com o código revisado');
 if(typeof input.narratorReviewerId!=='string'||!input.narratorReviewerId.trim()||
  !validTimestamp(input.narratorSignedAt))
  missing.push('Assinatura e data de aceite do Narrador');
 const scenarios=input.scenarios;
 if(!Array.isArray(scenarios)||scenarios.length!==expectedCases.length)
  missing.push('A matriz deve ter exatamente 20 cenários de H01 a H20');
 const ids=new Set();const urls=new Set();
 for(const c of Array.isArray(scenarios)?scenarios:[]){
  if(!c||typeof c.id!=='string'||ids.has(c.id)){missing.push('ID duplicado ou inválido na matriz');continue;}
  ids.add(c.id);
  if(!expectedCases.includes(c.id))missing.push('Cenário desconhecido: '+c.id);
  if(c.status!=='ACCEPTED'||!validEvidenceUrl(c.evidenceUrl)||
   c.reviewerId!==input.narratorReviewerId||c.reviewedCommit!==reviewedCommit||
   !validTimestamp(c.executedAt)){
   missing.push('Cenário '+c.id+' sem evidência aceita na versão revisada');
  }
  if(typeof c.evidenceUrl==='string'){
   if(urls.has(c.evidenceUrl))missing.push('Evidência duplicada entre cenários: '+c.id);
   urls.add(c.evidenceUrl);
  }
 }
 for(const id of expectedCases)if(!ids.has(id))missing.push('Cenário ausente: '+id);
 return {status:missing.length?'NO_GO':'GO',missing};
}

export function evaluateSpyReleaseGate(input,homologation){
 const missing=[];
 if(!input||input.schemaVersion!==1||input.module!=='CCA-ESP-MVP-001')
  return {status:'NO_GO',missing:['Manifesto de release inválido']};
 const approved=input.narratorApproval;
 if(!approved?.approved||!approved?.reviewerId||!validTimestamp(approved?.approvalRecordedAt)||
  !validEvidenceUrl(approved?.approvalDocumentUrl))
  missing.push('Aprovação explícita, datada e documentada do Narrador');
 const refs=input.requiredEvidence??{};
 const required=['reconciledMigrationJournal','verifiedFullBackupId','successfulRestoreDrillId',
  'stagingDatabaseUrl','stagingRlsCrossHouseReportUrl','stagingFullIntegrationRunUrl',
  'temporalHubGoDecisionUrl','allNarratorScenariosSignedUrl','rollbackVerificationUrl',
  'productionDiffApprovedUrl'];
 for(const key of required){
  const value=refs[key];
  // Backup IDs may be platform-issued opaque IDs, all other items are evidence links.
  const ok=['verifiedFullBackupId','successfulRestoreDrillId'].includes(key)
   ?typeof value==='string'&&value.trim().length>=8&&!/example|fake|placeholder|todo/i.test(value)
   :validEvidenceUrl(value);
  if(!ok)missing.push('Evidência: '+key);
 }
 for(const key of ['safeToMigrate','safeToMerge','safeToPublish'])
  if(input[key]!==true)missing.push('Autorização específica: '+key);
 if(!sha(input.reviewedCommit))missing.push('Commit exato e revisado');
 if(input.state!=='GO')missing.push('Decisão formal de produção: GO');
 const acceptance=evaluateSpyHomologation(homologation,input.reviewedCommit);
 missing.push(...acceptance.missing);
 if(approved?.reviewerId&&homologation?.narratorReviewerId&&
  approved.reviewerId!==homologation.narratorReviewerId)
  missing.push('A assinatura do Narrador difere entre o release e a homologação');
 if(validEvidenceUrl(refs.allNarratorScenariosSignedUrl)&&
  validEvidenceUrl(approved?.approvalDocumentUrl)&&
  refs.allNarratorScenariosSignedUrl===approved.approvalDocumentUrl)
  missing.push('Evidências do aceite e da autorização final devem ser distintas');
 return {status:missing.length?'NO_GO':'GO',missing};
}
export function evaluateCurrentSpyRelease(){
 return evaluateSpyReleaseGate(
  JSON.parse(fs.readFileSync(manifestPath,'utf8')),
  JSON.parse(fs.readFileSync(signoffPath,'utf8')));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=evaluateCurrentSpyRelease();
 console.log(JSON.stringify({
  module:'CCA-ESP-MVP-001',status:result.status,blockedBy:result.missing,
  message:result.status==='GO'
   ?'Evidências documentais registradas; exige revisão humana final. NÃO aplica migrações nem deploy.'
   :'NO_GO: não aplicar SQL, fazer merge ou publicar em produção.'
 },null,2));
 if(process.argv.includes('--enforce')&&result.status!=='GO')process.exitCode=1;
}
