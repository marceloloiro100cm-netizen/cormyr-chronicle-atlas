/**
 * Lote 9: no-cutover release gate. Repository and emulator CI alone must
 * never authorize the production migration. All external facts remain
 * unverified unless independently evidenced outside public source control.
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {evaluateLot5Safety} from './lot5-safety-preflight.mjs';

export const CUTOVER_REQUIREMENTS=Object.freeze([
  'appHostingSSRRoutesPublished',
  'sourceLiveAccessAndFreshBackup',
  'sourceFreezeAndFinalDeltaReconciled',
  'allAuthUIDAndOAuthAccountsImported',
  'allFirestoreDomainsReconciled',
  'allFiveStorageBucketsByteVerified',
  'realCloudRoleE2EPassed',
  'productionFrontendAdaptersTested',
  'driveSyncConflictProtectionVerified',
  'cloudSchedulerNoDuplicateJobs',
  'cloudRollbackRehearsed',
  'ownerExplicitlyApprovedCutover',
]);

export function evaluateLot9CutoverGate({sourceSafety, externalEvidence = {}}) {
  if(!sourceSafety||sourceSafety.safeToMergeCode!==true||
     !sourceSafety.checks||Object.values(sourceSafety.checks).some(v=>v!==true))
    throw Error('Repository production safety preflight failed');
  if(!externalEvidence||typeof externalEvidence!=='object'||Array.isArray(externalEvidence))
    throw Error('Invalid private readiness evidence');
  const checked=Object.create(null);
  for(const name of CUTOVER_REQUIREMENTS)checked[name]=externalEvidence[name]===true;
  const missing=CUTOVER_REQUIREMENTS.filter(k=>!checked[k]);
  const isClaimedComplete=missing.length===0;
  return {
    scope:'NO_CUTOVER_OFFLINE_CHECKLIST',
    repositorySafeToMergeCode:true,
    totalExternalRequirements:CUTOVER_REQUIREMENTS.length,
    selfReportedComplete:isClaimedComplete,
    missing,
    // Even a complete externally asserted checklist is not proof:
    // a human must independently verify logs, hashes and test artifacts.
    independentExternalEvidenceVerified:false,
    eligibleForHumanAudit:isClaimedComplete,
    productionReleaseAuthorized:false,
    readyForCutover:false,
    cloudWrites:0,
    decision:'NO_GO',
  };
}

export async function inspectLot9RepositorySafety(root=process.cwd()){
  const inputs=await Promise.all([
    readFile(resolve(root,'firebase/firestore.rules'),'utf8'),
    readFile(resolve(root,'firebase/storage.rules'),'utf8'),
    readFile(resolve(root,'src/start.ts'),'utf8'),
    readFile(resolve(root,'apphosting.yaml'),'utf8'),
  ]);
  return evaluateLot5Safety({
    firestoreRules:inputs[0],storageRules:inputs[1],
    appStart:inputs[2],apphosting:inputs[3],
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  inspectLot9RepositorySafety()
    .then(sourceSafety=>evaluateLot9CutoverGate({sourceSafety}))
    .then(report=>process.stdout.write(JSON.stringify(report,null,2)+'\n'))
    .catch(()=>{
      console.error('Lote 9 safety gate blocked. No deployment or data change attempted.');
      process.exitCode=1;
    });
}
