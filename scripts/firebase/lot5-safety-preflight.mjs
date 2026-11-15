/**
 * Lote 5: repository-only cutover safety audit.
 * Never connects to either backend; green emulator tests are not cloud E2E.
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function evaluateLot5Safety({firestoreRules,storageRules,appStart,apphosting}){
  if([firestoreRules,storageRules,appStart,apphosting].some(
    x=>typeof x!=='string'||x.length===0))
    throw Error('Missing repository security inputs');
  // Only a single blanket DENY ALL is permitted in the production rules.
  const denyOnly=rules=>{
    const allows=rules.split(/\r?\n/).map(x=>x.trim())
      .filter(x=>/^allow\s/.test(x));
    return allows.length===1&&/^allow read, write:\s*if false;/.test(allows[0]);
  };
  const checks={
    productionFirestoreDenyAll:denyOnly(firestoreRules),
    productionStorageDenyAll:denyOnly(storageRules),
    supabaseStillActiveUntilCutover:/functionMiddleware:\s*\[attachSupabaseAuth\]/.test(appStart),
    noProductionFirebaseDomainBridge:!apphosting.includes('FIREBASE_DOMAIN_HOMOLOGATION_ENABLED'),
    noProductionFirebaseDomainPreview:!apphosting.includes('VITE_FIREBASE_DOMAIN_HOMOLOGATION'),
    cloudCredentialsNotCommitted:!/\b(private_key|client_secret|refresh_token):\s*["']?[A-Za-z0-9+/=]{20}/i
      .test(apphosting),
  };
  return {
    scope:'LOT5_SOURCE_REPOSITORY_SECURITY_ONLY',
    checks,
    safeToMergeCode:Object.values(checks).every(Boolean),
    // These are external verification gates, deliberately never inferred from
    // CI green status, comments, dates or local emulator results.
    realUserCloudE2EVerified:false,productionIdentityMigrated:false,
    cloudFirestoreDataReconciled:false,allMediaBucketsVerified:false,
    cloudSchedulerJobsVerified:false,driveBidirectionalVerified:false,
    rollbackInCloudVerified:false,readyForCutover:false,
    cloudWrites:0,
  };
}
async function main(args){
  if(args.length!==0)throw Error('No arguments accepted');
  const [firestoreRules,storageRules,appStart,apphosting]=await Promise.all([
    readFile('firebase/firestore.rules','utf8'),
    readFile('firebase/storage.rules','utf8'),
    readFile('src/start.ts','utf8'),
    readFile('apphosting.yaml','utf8'),
  ]);
  const result=evaluateLot5Safety({firestoreRules,storageRules,appStart,apphosting});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!result.safeToMergeCode)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(()=>{
    console.error('Lot 5 source preflight blocked: expected production safety invariant missing.');
    process.exitCode=2;
  });
