#!/usr/bin/env node
/**
 * Segurança do release de Espionagem: default NO_GO e falha fechada.
 * Não faz deploy, não aplica SQL e não altera evidências.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidencePath=path.join(repo,'docs/espionage/release-evidence.json');

export function evaluateSpyReleaseGate(input){
 const missing=[];
 if(!input||input.schemaVersion!==1||input.module!=='CCA-ESP-MVP-001')
  return {status:'NO_GO',missing:['Manifesto de release inválido']};
 const approved=input.narratorApproval;
 if(!approved?.approved||!approved?.reviewerId||!approved?.approvalRecordedAt||
  !/^https:\/\//.test(approved?.approvalDocumentUrl??''))
  missing.push('Aprovação explícita, identificada e documentada do Narrador');
 const refs=input.requiredEvidence??{};
 for(const field of [
  'reconciledMigrationJournal','verifiedFullBackupId','successfulRestoreDrillId',
  'stagingDatabaseUrl','stagingRlsCrossHouseReportUrl','stagingFullIntegrationRunUrl',
  'temporalHubGoDecisionUrl','allNarratorScenariosSignedUrl',
  'rollbackVerificationUrl','productionDiffApprovedUrl'
 ]) if(typeof refs[field]!=='string'||refs[field].trim().length<8)
  missing.push('Evidência: '+field);
 for(const key of ['safeToMigrate','safeToMerge','safeToPublish'])
  if(input[key]!==true)missing.push('Autorização específica: '+key);
 if(typeof input.reviewedCommit!=='string'||!/^[0-9a-f]{40}$/i.test(input.reviewedCommit))
  missing.push('Commit exato e revisado');
 if(input.state!=='GO')missing.push('Decisão formal de produção: GO');
 return {status:missing.length?'NO_GO':'GO',missing};
}
export function evaluateCurrentSpyRelease(){
 return evaluateSpyReleaseGate(JSON.parse(fs.readFileSync(evidencePath,'utf8')));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=evaluateCurrentSpyRelease();
 console.log(JSON.stringify({
  module:'CCA-ESP-MVP-001',status:result.status,
  blockedBy:result.missing,
  message:result.status==='GO'
   ?'Pré-condições documentais atendidas; executar revisão humana final (NÃO executa deploy).'
   :'Publicação e migração bloqueadas; NÃO EXECUTAR SQL em produção.'
 },null,2));
 if(process.argv.includes('--enforce')&&result.status!=='GO')process.exitCode=1;
}
