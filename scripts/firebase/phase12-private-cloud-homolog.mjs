/**
 * Phase 1+2: controlled Firestore RAW/typed archive and BCRYPT Auth import into
 * a NEW, EMPTY, ISOLATED Firebase homologation project ONLY.
 *
 * No direct write to the official "cormyr" project, no roles/claims, no
 * exposure of private values and no integration with App Hosting.
 * Dry-run is the default; cloud writes need --execute-cloud plus a signed-off
 * deny-all rules deployment and operator approval via environment variables.
 */
import { resolve } from 'node:path';
import { lstat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadUnifiedEmulatorPlan } from './stage-all-emulators.mjs';
import { writePrivateArchiveToEmulator } from './stage-firestore-emulator.mjs';
import { isolatedDestination } from './lot7-cloud-destination-preflight.mjs';

const SHA = /^[a-f0-9]{64}$/;
const RULES_ACK = 'DENY_ALL_DEPLOYED_TO_THIS_HOMOLOGATION_PROJECT';
const IMPORT_ACK = 'APPROVE_PRIVATE_AUTH_AND_FIRESTORE_IMPORT';

export function assertPrivateCloudTarget(projectId, env=process.env, execute=false) {
  if (!isolatedDestination(projectId) || projectId === 'cormyr')
    throw Error('isolated_firebase_homologation_project_required');
  if (env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST)
    throw Error('cloud_import_refuses_emulator_environment');
  if (execute && (env.CORMYR_HOMOLOG_RULES_ACK !== RULES_ACK ||
      env.CORMYR_PHASE12_IMPORT_ACK !== IMPORT_ACK)) {
    throw Error('homologation_import_requires_two_explicit_approvals');
  }
  return true;
}

export async function assertPrivateSource(dir) {
  const stat=await lstat(resolve(dir));
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0)
    throw Error('normalized_source_must_be_owner_only');
}

export async function assertEmptyCloudDestination(db, auth) {
  const [collections, page] = await Promise.all([db.listCollections(),auth.listUsers(1)]);
  if (!Array.isArray(collections) || !Array.isArray(page?.users) ||
      collections.length !== 0 || page.users.length !== 0 || page.pageToken)
    throw Error('homologation_project_must_be_empty');
}

function toPublicSummary(plan,projectId) {
  const summary=plan.summary;
  return {
    scope:'PHASE12-PRIVATE-CLOUD-HOMOLOGATION-ONLY',
    projectId,
    archiveRows:summary.stages.rawArchive.rows,
    archiveTables:summary.stages.rawArchive.tables,
    archiveChunks:summary.stages.rawArchive.fragments,
    typedCollections:summary.stages.typedDomain.collections,
    missivaCoverage:summary.stages.typedDomain.letters,
    temporalValid:summary.stages.temporal.valid,
    newspaperValid:summary.stages.newspaper.valid,
    historicalMailValid:summary.stages.mailHistory.valid,
    accounts:summary.stages.auth.importCandidates,
    bcrypt:summary.stages.auth.bcryptCount,
    passwordless:summary.stages.auth.passwordlessCount,
    withoutAccessProfile:summary.stages.auth.accountsWithoutProfile,
    deferredCustomProviders:summary.stages.auth.deferredCustomProviders,
    preflightValid:summary.readyForEmulatorStage,
    productionWrites:0,
    domainReadyForPlayers:false,
  };
}

/** Write the validated typed-domain projection with batching; no emulator guard bypass. */
export async function writeTypedPrivateCloud(plan,db) {
  if (!plan?.summary?.planValid || !SHA.test(plan.snapshotId))
    throw Error('typed_domain_plan_invalid');
  const root=db.collection('migrationDomainStage').doc(plan.snapshotId);
  await root.set({status:'incomplete',private:true,formatVersion:1});
  let batch=db.batch(),pending=0,bytes=0,writes=1;
  const flush=async()=>{
    if (pending) {
      await batch.commit();writes+=pending;
      batch=db.batch();pending=0;bytes=0;
    }
  };
  for (const [type,docs] of Object.entries(plan.docs)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,60}$/.test(type) || !Array.isArray(docs))
      throw Error('invalid_typed_projection');
    for (const item of docs) {
      const estimate=Buffer.byteLength(JSON.stringify(item.payload),'utf8')+8192;
      if (!item.id || estimate>850*1024)throw Error('typed_doc_size_or_id_invalid');
      if (pending && (pending>=100 || bytes+estimate>4*1024*1024))
        await flush();
      batch.set(root.collection(type).doc(item.id),item.payload);
      pending++;bytes+=estimate;
    }
  }
  await flush();
  await root.set({
    status:'complete',private:true,formatVersion:1,
    counts:plan.summary.typedCollections,
  });
  return writes+1;
}

export async function importAuthPrivateCloud(plan,auth) {
  if (!plan?.summary?.preflightValid || !plan.records?.length)
    throw Error('auth_plan_invalid');
  const first=await auth.listUsers(1);
  if (first.users.length || first.pageToken)throw Error('auth_destination_not_empty');
  const result=await auth.importUsers(plan.records,{hash:{algorithm:'BCRYPT'}});
  if (result.failureCount || result.successCount!==plan.records.length)
    throw Error('partial_auth_import_keep_homologation_quarantined');
  const verified=await auth.listUsers(1000);
  const expected=new Set(plan.records.map(x=>x.uid));
  if (verified.pageToken || verified.users.length!==expected.size ||
      verified.users.some(x=>!expected.has(x.uid)))
    throw Error('auth_uid_reconciliation_failed');
  // No custom claims, house grants, password reset, email or invitation is sent.
  return result.successCount;
}

export async function executePrivateHomologation(plan,db,auth,projectId,env=process.env) {
  assertPrivateCloudTarget(projectId,env,true);
  if (!plan?.summary?.readyForEmulatorStage || !SHA.test(plan.snapshotId))
    throw Error('source_stage_not_ready');
  await assertEmptyCloudDestination(db,auth);
  const marker=db.collection('migrationPhase12').doc(plan.snapshotId);
  // A failed import remains visibly INCOMPLETE and is never retried in-place.
  await marker.set({status:'incomplete',private:true,origin:'verified-backup',version:1});
  const raw=await writePrivateArchiveToEmulator(plan.archive,db);
  await writeTypedPrivateCloud(plan.typed,db);
  const count=await importAuthPrivateCloud(plan.auth,auth);
  await marker.set({
    status:'complete',private:true,version:1,
    rawTables:raw.archivedPublicTables,rawRows:raw.archivedPublicRows,
    typedCollections:plan.typed.summary.typedCollections,
    authAccounts:count,
    userClaimsEnabled:false,
    applicationEnabled:false,
  });
  return {
    scope:'PHASE12-PRIVATE-CLOUD-HOMOLOGATION-ONLY',
    projectId,importComplete:true,rawTables:raw.archivedPublicTables,
    rawRows:raw.archivedPublicRows,
    typedCollections:plan.typed.summary.typedCollections,
    authAccounts:count,
    accountsWithoutProfile:plan.auth.summary.accountsWithoutProfile,
    deferredCustomProviders:plan.auth.summary.deferredCustomProviders,
    productionWrites:0,readyForPlayers:false,readyForCutover:false,
  };
}

function parseArgs(args) {
  const values={execute:false};
  for (let i=0;i<args.length;i++) {
    if (args[i]==='--execute-cloud'){values.execute=true;continue;}
    if ((args[i]==='--normalized'||args[i]==='--project') &&
        args[i+1] && !args[i+1].startsWith('--')) {
      values[args[i].slice(2)]=args[++i];continue;
    }
    throw Error('invalid_cli_arguments');
  }
  if (!values.normalized || !values.project)throw Error('missing_source_or_project');
  return values;
}

export async function main(args,options={}) {
  const parsed=parseArgs(args);
  assertPrivateCloudTarget(parsed.project,options.env||process.env,parsed.execute);
  await assertPrivateSource(parsed.normalized);
  const plan=await loadUnifiedEmulatorPlan(parsed.normalized);
  if (!parsed.execute) {
    const summary=toPublicSummary(plan,parsed.project);
    if (!options.silent)process.stdout.write(JSON.stringify(summary,null,2)+'\n');
    return summary;
  }
  if (!plan.summary.readyForEmulatorStage)throw Error('source_preflight_invalid');
  const appModule=await import('firebase-admin/app');
  const firestoreModule=await import('firebase-admin/firestore');
  const authModule=await import('firebase-admin/auth');
  const app=appModule.initializeApp(
    {projectId:parsed.project},'cormyr-phase12-homolog-'+process.pid);
  try {
    const result=await executePrivateHomologation(
      plan,firestoreModule.getFirestore(app),authModule.getAuth(app),
      parsed.project,options.env||process.env);
    if (!options.silent)process.stdout.write(JSON.stringify(result,null,2)+'\n');
    return result;
  }finally{await appModule.deleteApp(app);}
}

if (process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(()=>{
    // Never print user identities, hashes, firestore documents or source paths.
    console.error('Phase 1+2 homologation blocked or failed; do not retry a partial cloud import.');
    process.exitCode=1;
  });
}
