/**
 * One-shot read-only Firebase workspace diagnosis from GitHub's existing
 * read-only OIDC identity. Never writes, never prints IDs/paths/rows/tokens,
 * and does not try to authenticate a player's account.
 */
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {readWorkspaceTable} from './workspace-import.mjs';
import {listCurrentAccountAccess} from './operational-account-access.mjs';
const safeCode=e=>{
  const m=String(e?.code??'').toUpperCase().replace(/[^A-Z_]/g,'');
  if(['PERMISSION_DENIED','UNAUTHENTICATED','UNAVAILABLE','DEADLINE_EXCEEDED',
      'RESOURCE_EXHAUSTED','FAILED_PRECONDITION'].includes(m))return m;
  const message=String(e?.message??'');
  if(['workspace_import_pending','workspace_source_table_missing',
      'workspace_table_not_supported','workspace_archive_integrity_failed',
      'invalid_access_scope'].includes(message))return message.toUpperCase();
  return e instanceof TypeError?'TYPE_ERROR':'UNCLASSIFIED';
};
let bad=0;
const check=async(label,fn)=>{
 try{
  await fn();
  console.log('DIAGNOSTIC '+label+' PASS');
 }catch(e){
  bad++;
  console.log('DIAGNOSTIC '+label+' FAIL '+safeCode(e));
 }
};
const app=initializeApp({projectId:'cormyr',credential:applicationDefault()},'cormyr-readonly-workspace-audit');
const db=getFirestore(app);
let snapshot='';
await check('resolve_workspace_snapshot',async()=>{
  const root=await db.collection('campaignWorkspaceImports').limit(7).get();
  const completed=root.docs.filter(d=>/^[a-f0-9]{64}$/.test(d.id)&&
   d.data()?.status==='complete'&&d.data()?.private===true&&
   d.data()?.sourceSnapshotId===d.id);
  if(completed.length!==1||root.size>6)throw Error('ambiguous_snapshot');
  snapshot=completed[0].id;
});
if(snapshot){
 await check('migration_auth_stage',async()=>{
  const d=await db.collection('migrationAuthStage').doc(snapshot).get();
  if(!d.exists||d.data()?.status!=='complete'||d.data()?.private!==true)
   throw Error('stage_not_ready');
 });
 await check('migration_domain_stage',async()=>{
  const d=await db.collection('migrationDomainStage').doc(snapshot).get();
  if(!d.exists||d.data()?.status!=='complete'||d.data()?.private!==true)
   throw Error('stage_not_ready');
 });
 await check('account_access_listing',async()=>{
  const accounts=await listCurrentAccountAccess(db,snapshot);
  if(!Array.isArray(accounts))throw Error('invalid_access_scope');
 });
 for(const table of ['campaign_houses','campaign_players','house_memberships',
     'campaign_records','house_catalog','campaign_access_profiles']){
   await check('source_'+table,async()=>{
    const rows=await readWorkspaceTable(db,snapshot,table);
    if(!Array.isArray(rows))throw Error('workspace_archive_integrity_failed');
   });
 }
 await check('workspace_house_overlay',async()=>{
  const d=await db.collection('campaignCloudRuntime').doc(snapshot)
   .collection('workspaceTableRows').limit(5001).get();
  if(d.size>5000)throw Error('overlay_limit');
 });
}
console.log('DIAGNOSTIC RESULT '+(bad?'INVESTIGATE':'READS_OK')+' failed_checks='+bad);
if(bad)process.exitCode=1;
