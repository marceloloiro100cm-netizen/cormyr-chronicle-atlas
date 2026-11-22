/**
 * Cloud-only, narrator-scoped reader for archived GM Events/Adventures.
 * A completed import is not a publication decision. The Admin SDK ignores
 * Firestore Rules, so identity and live review gates are mandatory.
 */
import {createHash} from 'node:crypto';
import type {Auth} from 'firebase-admin/auth';
import type {Firestore} from 'firebase-admin/firestore';

const HASH=/^[a-f0-9]{64}$/;
const KEY=/^[A-Za-z0-9_-]{1,128}$/;
const DOC=createHash('sha256').update('gm:atlas').digest('hex');
export class PrivateGmCloudError extends Error{
  constructor(readonly status:401|403|503){
    super('private_gm_access_denied');
    this.name='PrivateGmCloudError';
  }
}
const reject=(status:401|403|503):never=>{throw new PrivateGmCloudError(status);};
const record=(v:unknown):v is Record<string,unknown>=>
  !!v&&typeof v==='object'&&!Array.isArray(v);
const validVersion=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=1;

type Reader={
  auth:Pick<Auth,'verifyIdToken'|'getUser'>;
  db:Firestore;
  snapshotId:string;
  enabled:boolean;
  projectId:string;
  env?:NodeJS.ProcessEnv;
};

export async function readApprovedFirebasePrivateGmContent(
  args:Reader,idToken:string,
):Promise<{events:unknown[];adventures:unknown[]}>{
  const env=args.env??process.env;
  if(args.enabled!==true||args.projectId!=='cormyr'||
     !HASH.test(args.snapshotId)||!args.db||
     typeof args.db.collection!=='function'||!args.auth||
     typeof args.auth.verifyIdToken!=='function'||
     typeof args.auth.getUser!=='function'||
     env['FIRESTORE_EMULATOR_HOST']||env['FIREBASE_AUTH_EMULATOR_HOST'])
    return reject(503);
  if(typeof idToken!=='string'||idToken.length<10||idToken.length>10000)
    return reject(401);
  let uid='';
  try{
    const verified=await args.auth.verifyIdToken(idToken,true);
    if(!verified||typeof verified.uid!=='string'||!KEY.test(verified.uid))
      return reject(401);
    uid=verified.uid;
    const user=await args.auth.getUser(uid);
    if(user.uid!==uid||user.disabled===true)return reject(401);
  }catch{return reject(401);}

  const domainRoot=args.db.collection('migrationDomainStage').doc(args.snapshotId);
  const authRoot=args.db.collection('migrationAuthStage').doc(args.snapshotId);
  const [domain,auth,access]=await Promise.all([
    domainRoot.get(),authRoot.get(),domainRoot.collection('access').doc(uid).get(),
  ]);
  const d=domain.data(),a=auth.data(),s=access.data();
  if(!domain.exists||d?.['status']!=='complete'||d?.['private']!==true||
     !auth.exists||a?.['status']!=='complete'||a?.['private']!==true)
    return reject(503);
  if(!access.exists||s?.['userId']!==uid||s?.['active']!==true||
     s?.['profile']!=='narrador'||s?.['admin']!==true||
     s?.['requirePasswordChange']!==false)
    return reject(403);

  const root=args.db.collection('campaignCloudRuntime').doc(args.snapshotId);
  const runtime=(await root.get()).data();
  if(!record(runtime)||runtime['status']!=='active'||
     runtime['private']!==true||
     runtime['sourceSnapshotId']!==args.snapshotId||
     runtime['sourceSnapshotReconciled']!==true||
     runtime['applicationEnabled']!==true||
     runtime['privateGmContentApproved']!==true)
    return reject(503);
  // Historic imported GM content has no versioned editing/publishing pipeline.
  // The Narrator's explicit, audited runtime approval is its publication gate.
  // If version metadata exists, preserve the stricter matching-version check.
  const gmVersion=runtime['gmContentVersion'];
  const publishedVersion=runtime['publishedGmContentVersion'];
  if((gmVersion!==undefined||publishedVersion!==undefined)&&
     (!validVersion(gmVersion)||gmVersion!==publishedVersion))
    return reject(503);

  const stageRef=args.db.collection('migrationPrivateGmStage').doc(args.snapshotId);
  const stage=(await stageRef.get()).data();
  if(!record(stage)||stage['status']!=='complete'||stage['private']!==true||
     stage['formatVersion']!==1||
     !record(stage['counts'])||typeof stage['counts']['content']!=='number'||
     stage['counts']['content']<1)
    return reject(503);

  const gm=(await stageRef.collection('content').doc(DOC).get()).data();
  if(!record(gm)||gm['id']!=='atlas'||!record(gm['payload']))
    return reject(503);
  const payload=gm['payload'];
  if(!Array.isArray(payload['events'])||!Array.isArray(payload['adventures'])||
     payload['events'].length>5000||payload['adventures'].length>5000)
    return reject(503);
  const result={events:payload['events'],adventures:payload['adventures']};
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>750_000)
    return reject(503);
  return result;
}
