/**
 * One-pass, read-once staging orchestrator for Cormyr's VERIFIED PRIVATE backup.
 *
 * Dry-run by default; no cloud calls. Emulated execution requires BOTH
 * loopback Auth and Firestore emulators with a fixed demo-* project ID.
 *
 * This is NOT a cutover or a functional migration of the SQL RPC engines:
 * it combines independent read-only model/archive stages and checks their
 * source coverage. Never logs data/IDs/hashes.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  assertEmulatorOnly,loadVerifiedPrivateTables,buildPrivateArchivePlan,
  writePrivateArchiveToEmulator,
} from './stage-firestore-emulator.mjs';
import {buildTypedDomainPlan,writeTypedDomainToEmulator} from './stage-typed-domain-emulator.mjs';
import {planTemporalEmulator,stageTemporalEmulator} from './stage-temporal-emulator.mjs';
import {planNewspaperEmulator,stageNewspaperEmulator} from './stage-newspaper-emulator.mjs';
import {planAuthEmulator,assertAuthEmulatorOnly,importAuthIntoEmulator} from './stage-auth-emulator.mjs';

const PROJECT='demo-cormyr-migration';
const ROOT='migrationUnifiedStage';

function safeSummary({archive,typed,temporal,newspaper,auth}) {
  const stages={
    rawArchive:{
      valid:archive.summary.emulatorPlanValid,
      tables:archive.summary.archivedPublicTables,
      rows:archive.summary.archivedPublicRows,
      fragments:archive.summary.totalChunks,
      issues:archive.summary.issues,
    },
    typedDomain:{
      valid:typed.summary.planValid,
      collections:typed.summary.typedCollections,
      missingTables:typed.summary.missingRequiredTables,
      issues:typed.summary.issues,
      letters:typed.summary.letterCoverage,
    },
    temporal:{
      valid:temporal.summary.planValid,
      calendarProjected:temporal.summary.calendarProjected,
      historyTables:temporal.summary.migratedTemporalTables,
      historyRows:temporal.summary.temporalHistoryRows,
      missingTables:temporal.summary.missingHistoryTables,
      issues:temporal.summary.issues,
    },
    newspaper:{
      valid:newspaper.summary.planValid,
      publishedEditions:newspaper.summary.publishedEditions,
      privateEditions:newspaper.summary.privateEditions,
      historyTables:newspaper.summary.archivedSourceTables,
      historyRows:newspaper.summary.archivedSourceRows,
      missingTables:newspaper.summary.missingTables,
      issues:newspaper.summary.issues,
    },
    auth:{
      valid:auth.summary.preflightValid,
      importCandidates:auth.summary.importCandidates,
      bcryptCount:auth.summary.bcryptCount,
      passwordlessCount:auth.summary.passwordlessCount,
      mappedProviders:auth.summary.mappedProviders,
      deferredCustomProviders:auth.summary.deferredCustomProviders,
      accountsWithoutProfile:auth.summary.accountsWithoutProfile,
      issues:auth.summary.issues,
    },
  };
  const readyForEmulatorStage=Object.values(stages).every(x=>x.valid===true)
    && stages.rawArchive.rows>0 && stages.auth.importCandidates>0;
  return {
    scope:'PRIVATE-ALL-FIREBASE-EMULATORS-ONLY',
    sourceManifestVerified:true,
    stages,readyForEmulatorStage,
    sourceLiveReconciled:false,
    applicationFunctionsMigrated:false,
    cloudWrites:0,readyForCloudImport:false,
    readyForCutover:false,
    note:'Read-only staging and original archives only; never use this result to authorize public deployment or site cutover.',
  };
}

export function planUnifiedEmulator(tables,snapshotId) {
  if(!Array.isArray(tables)||!/^[0-9a-f]{64}$/.test(snapshotId))
    throw Error('Invalid private source snapshot');
  const byName=new Map(tables.map(t=>[t.table,t.rows]));
  const archive=buildPrivateArchivePlan(tables,snapshotId);
  const typed=buildTypedDomainPlan(tables,snapshotId);
  const temporal=planTemporalEmulator(tables,snapshotId);
  const newspaper=planNewspaperEmulator(tables,snapshotId);
  const auth=planAuthEmulator(
    byName.get('auth.users')||[],
    byName.get('auth.identities')||[],
    byName.get('public.campaign_access_profiles')||[],
  );
  const missingAuthTables=['auth.users','auth.identities','public.campaign_access_profiles']
    .filter(t=>!byName.has(t));
  const summary=safeSummary({archive,typed,temporal,newspaper,auth});
  summary.missingAuthTables=missingAuthTables;
  if(missingAuthTables.length)summary.readyForEmulatorStage=false;
  return {snapshotId,archive,typed,temporal,newspaper,auth,summary};
}

export async function loadUnifiedEmulatorPlan(dir) {
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(dir);
  return planUnifiedEmulator(tables,snapshotHash);
}

export async function executeUnifiedEmulator(plan,db,auth,env=process.env) {
  // Both guards run BEFORE the first write.
  assertEmulatorOnly(env,PROJECT);
  assertAuthEmulatorOnly(env,PROJECT);
  if(!plan?.summary?.readyForEmulatorStage)throw Error('Unified preflight is not valid');
  const refs=[
    db.collection('migrationPrivateSnapshots').doc(plan.snapshotId),
    db.collection('migrationDomainStage').doc(plan.snapshotId),
    db.collection('migrationTemporalStage').doc(plan.snapshotId),
    db.collection('migrationNewspaperStage').doc(plan.snapshotId),
    db.collection(ROOT).doc(plan.snapshotId),
  ];
  // Never reuse a partially staged snapshot or overwrite past evidence.
  const current=await Promise.all(refs.map(ref=>ref.get()));
  if(current.some(doc=>doc.exists))throw Error('Emulator already contains this source snapshot');
  const batchRoot=refs[4];
  await batchRoot.set({
    status:'incomplete',scope:'emulator-only',formatVersion:1,
    private:true,
  });
  const raw=await writePrivateArchiveToEmulator(plan.archive,db);
  const typed=await writeTypedDomainToEmulator(plan.typed,db);
  const temporal=await stageTemporalEmulator(plan.temporal,db,env);
  const newspaper=await stageNewspaperEmulator(plan.newspaper,db,env);
  // Import Auth last; this refuses any existing destination accounts.
  const importedAuth=await importAuthIntoEmulator(plan.auth,auth,env);
  await batchRoot.set({
    status:'complete',scope:'emulator-only',formatVersion:1,
    private:true,
    archiveRows:raw.archivedPublicRows,
    typedLetters:typed.typedCollections.letters,
    quarantineLetters:typed.typedCollections.lettersQuarantine,
    calendarProjected:temporal.calendarProjected,
    publishedNewspapers:newspaper.publishedEditions,
    authUsers:importedAuth.imported,
  });
  return {
    staged:true,
    archiveRows:raw.archivedPublicRows,
    typedCollections:typed.typedCollections,
    temporalHistoryRows:temporal.temporalHistoryRows,
    newspaperHistoryRows:newspaper.archivedSourceRows,
    authImported:importedAuth.imported,
    authVerified:importedAuth.verified,
    cloudWrites:0,readyForCloudImport:false,readyForCutover:false,
  };
}

async function main(args) {
  if((args.length!==2&&args.length!==3)||args[0]!=='--normalized'||!args[1]||
     (args.length===3&&args[2]!=='--execute-emulator'))
    throw Error('Use --normalized PRIVATE_DIRECTORY [--execute-emulator]');
  const plan=await loadUnifiedEmulatorPlan(args[1]);
  if(args.length===2){
    process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');
    return;
  }
  assertEmulatorOnly(process.env,PROJECT);
  assertAuthEmulatorOnly(process.env,PROJECT);
  if(!plan.summary.readyForEmulatorStage)throw Error('Verified unified plan blocked');
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const {getAuth}=await import('firebase-admin/auth');
  const app=initializeApp({projectId:PROJECT},'cormyr-unified-stage');
  try{
    const result=await executeUnifiedEmulator(plan,getFirestore(app),getAuth(app));
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }finally{await deleteApp(app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{
    console.error('Unified emulator staging blocked or failed; no source values displayed.');
    process.exitCode=1;
  });
}
