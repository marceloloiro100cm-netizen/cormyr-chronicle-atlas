/**
 * Read-only synthetic startup probe. No request reaches the public API, no
 * Firebase user token is created, and no record, UID or error body is printed.
 * The selected profile is an approved active account from Firestore and its
 * Firebase Auth state is checked before any query runs.
 */
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {listCurrentAccountAccess} from './operational-account-access.mjs';
import {createWorkspaceService} from '../../src/lib/firebase-workspace/service';

const classify=(e:unknown):string=>{
 const o=e as {code?:unknown;message?:unknown}|null;
 const c=typeof o?.code==='string'?o.code:'';
 if(/^[a-z_]{3,60}$/.test(c))return c;
 if(['permission-denied','unavailable','deadline-exceeded','unauthenticated',
      'resource-exhausted'].includes(c))return c.replaceAll('-','_');
 const m=typeof o?.message==='string'?o.message:'';
 if(['invalid_access_scope','workspace_archive_integrity_failed',
     'workspace_source_table_missing','workspace_import_pending'].includes(m))return m;
 return e instanceof TypeError?'type_error':'unclassified';
};
const app=initializeApp({projectId:'cormyr',credential:applicationDefault()},'cormyr-council-query-probe');
const db=getFirestore(app);
const adminAuth=getAuth(app);
const roots=await db.collection('campaignWorkspaceImports').limit(7).get();
const snapshots=roots.docs.filter(d=>/^[a-f0-9]{64}$/.test(d.id)&&
 d.data()?.status==='complete'&&d.data()?.private===true&&
 d.data()?.sourceSnapshotId===d.id);
if(roots.size>6||snapshots.length!==1){
 console.log('COUNCIL_PROBE SETUP snapshot_unresolved');process.exit(1);
}
const snapshotId=snapshots[0]!.id;
const accounts=await listCurrentAccountAccess(db,snapshotId);
process.env['CORMYR_FIREBASE_RECORDS_ENABLED']='true';
process.env['CORMYR_FIREBASE_CLOUD_MAIL_ENABLED']='true';
process.env['CORMYR_FIREBASE_HOUSE_OPS_ENABLED']='true';
process.env['CORMYR_FIREBASE_SPY_ENABLED']='true';

const probes=[
 {name:'auth',input:{kind:'auth'}},
 {name:'admin',input:{kind:'rpc',name:'is_campaign_admin'}},
 {name:'profile',input:{kind:'rpc',name:'current_campaign_profile'}},
 {name:'houses',input:{kind:'query',table:'campaign_houses',steps:[
   {op:'select',args:['*']},{op:'order',args:['name',{ascending:true}]}]}},
 {name:'players',input:{kind:'query',table:'campaign_players',steps:[
   {op:'select',args:['*']},{op:'order',args:['name',{ascending:true}]}]}},
 {name:'memberships',input:{kind:'query',table:'house_memberships',steps:[
   {op:'select',args:['*']}]}},
 {name:'records',input:{kind:'query',table:'campaign_records',steps:[
   {op:'select',args:['*']},{op:'order',args:['updated_at',{ascending:false}]}]}},
 {name:'catalog',input:{kind:'query',table:'house_catalog',steps:[
   {op:'select',args:['id,name']},{op:'order',args:['name',{ascending:true}]}]}},
 {name:'editor_roles',input:{kind:'query',table:'campaign_access_profiles',steps:[
   {op:'select',args:['user_id']},{op:'eq',args:['profile','editor']}]}},
];
let failed=0;
for(const profile of ['narrador','jogador'] as const){
 const candidate=accounts.find(a=>a.profile===profile&&a.active===true&&
  a.requirePasswordChange===false&&typeof a.userId==='string');
 if(!candidate){console.log('COUNCIL_PROBE '+profile+' NO_ACTIVE_ACCOUNT');continue;}
 // Do not bypass the real Firebase Auth disabled state.
 let user;
 try{user=await adminAuth.getUser(candidate.userId);}
 catch(e){failed++;console.log('COUNCIL_PROBE '+profile+' AUTH_READ_FAIL '+classify(e));continue;}
 if(user.disabled||user.uid!==candidate.userId){
  console.log('COUNCIL_PROBE '+profile+' ACCOUNT_DISABLED');continue;
 }
 const auth={verifyIdToken:async()=>({uid:candidate.userId}),
  getUser:(uid:string)=>adminAuth.getUser(uid)};
 const service=createWorkspaceService({db,auth,snapshotId,cacheImportedTables:true});
 try{
  const data=await service.execute('internal-readonly-diagnostic',{kind:'batch',items:probes.map(p=>p.input)});
  if(!Array.isArray(data)||data.length!==probes.length)
   throw Error('invalid_batch_response');
  data.forEach((result,i)=>{
   const label=probes[i]!.name;
   if(result?.ok===true)console.log('COUNCIL_PROBE '+profile+' '+label+' PASS');
   else{
    failed++;
    console.log('COUNCIL_PROBE '+profile+' '+label+' FAIL '+String(
      /^[a-z_]{3,60}$/.test(String(result?.code))?result.code:'unclassified'));
   }
  });
 }catch(e){
  failed++;
  console.log('COUNCIL_PROBE '+profile+' BATCH_FAIL '+classify(e));
 }
}
console.log('COUNCIL_PROBE RESULT failed_checks='+failed);
if(failed)process.exitCode=1;
