/**
 * Private Narrator content on Firebase Cloud. Read-only.
 * This service never trusts client roles, claims, snapshot selectors, or a
 * legacy Supabase identity. An independent Cloud approval is required.
 */
import {createHash} from 'node:crypto';
import {createFirebaseCloudReadonly,CloudAccessError}
  from '../../../scripts/firebase/cloud-readonly-service.mjs';
import type {Firestore} from 'firebase-admin/firestore';

type AuthPort={
  verifyIdToken:(token:string,checkRevoked?:boolean)=>Promise<unknown>;
  getUser:(uid:string)=>Promise<unknown>;
};
type Config={
  db:Firestore;auth:AuthPort;snapshotId:string;projectId:string;
  enabled:boolean;env?:NodeJS.ProcessEnv;
};
const HASH=/^[a-f0-9]{64}$/;
const object=(v:unknown):v is Record<string,unknown>=>
  !!v&&typeof v==='object'&&!Array.isArray(v);
const fail=(status:403|503,code:string):never=>{
  throw new CloudAccessError(code,status);
};

export async function readFirebaseNarratorContent(
  config:Config,idToken:string,
):Promise<{events:unknown[];adventures:unknown[]}>{
  const env=config.env??process.env;
  if(!config.enabled||config.projectId!=='cormyr'||
     !HASH.test(config.snapshotId)||
     env['FIRESTORE_EMULATOR_HOST']||env['FIREBASE_AUTH_EMULATOR_HOST'])
    return fail(503,'narrator_content_disabled');

  // The established Cloud Auth service checks token revocation and disabled
  // users, migration stage readiness, trusted profile/admin and role scope.
  const role=await createFirebaseCloudReadonly({
    db:config.db,auth:config.auth,snapshotId:config.snapshotId,
    projectId:'cormyr',enabled:true,env,
  }).session(idToken);
  if(role.profile!=='narrador')return fail(403,'access_denied');

  const root=config.db.collection('campaignCloudRuntime').doc(config.snapshotId);
  const state=(await root.get()).data();
  if(!object(state)||state['status']!=='active'||
     state['private']!==true||
     state['sourceSnapshotId']!==config.snapshotId||
     state['sourceSnapshotReconciled']!==true||
     state['applicationEnabled']!==true||
     state['privateGmReadApproved']!==true)
    return fail(503,'narrator_content_unavailable');

  const stage=config.db.collection('migrationPrivateGmStage').doc(config.snapshotId);
  const meta=(await stage.get()).data();
  if(!object(meta)||meta['status']!=='complete'||meta['private']!==true)
    return fail(503,'narrator_content_unavailable');
  const key=createHash('sha256').update('gm:atlas').digest('hex');
  const doc=(await stage.collection('content').doc(key).get()).data();
  if(!object(doc)||doc['id']!=='atlas'||!object(doc['payload']))
    return fail(503,'narrator_content_unavailable');
  const data=doc['payload'];
  if(!Array.isArray(data['events'])||!Array.isArray(data['adventures'])||
     data['events'].length>5000||data['adventures'].length>1000)
    return fail(503,'narrator_content_unavailable');
  // Only fields historically consumed by the narrator UI are returned.
  const result={events:data['events'],adventures:data['adventures']};
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>800_000)
    return fail(503,'narrator_content_unavailable');
  return result;
}
