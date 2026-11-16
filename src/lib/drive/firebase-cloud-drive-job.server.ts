/**
 * Cloud-only Drive Scheduler boundary. This phase deliberately exposes a
 * read-only reconciliation audit, NOT a simulated successful Drive sync.
 * Real two-way writes require an independently reviewed transactional adapter.
 */
import {createHash,timingSafeEqual} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
const SHA=/^[a-f0-9]{64}$/;
const COUNTS=['bindings','files','inbox','outbox','conflicts'] as const;
const hash=(s:string)=>createHash('sha256').update(s,'utf8').digest();
const safe=(s:unknown):s is string=>
  typeof s==='string'&&s.length>=32&&s.length<=512;
export function isAuthorizedFirebaseDriveJob(request:Request,
  current:unknown,previous?:unknown):boolean{
  if(!safe(current)||previous!==undefined&&!safe(previous))return false;
  const m=/^Bearer ([^\s,]{32,512})$/.exec(
    request.headers.get('authorization')??'');
  const token=m?.[1];
  if(!token)return false;
  const received=hash(token);
  const now=timingSafeEqual(received,hash(current));
  const old=timingSafeEqual(received,hash(safe(previous)?previous:current));
  return now||old;
}
export class DriveCloudJobUnavailable extends Error{
  constructor(){super('drive_cloud_job_unavailable');this.name='DriveCloudJobUnavailable';}
}
const deny=():never=>{throw new DriveCloudJobUnavailable();};
const object=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);

type AuditArgs={
  db:Firestore;projectId:string;snapshotId:string;enabled:boolean;
  env?:NodeJS.ProcessEnv;
};

/** Never list folder names or user identities into the scheduler response. */
export async function inspectApprovedFirebaseDriveStage(args:AuditArgs){
  const env=args.env??process.env;
  if(args.projectId!=='cormyr'||args.enabled!==true||
     !SHA.test(args.snapshotId)||!args.db||
     typeof args.db.collection!=='function'||
     env['FIRESTORE_EMULATOR_HOST']||env['FIREBASE_AUTH_EMULATOR_HOST'])
    return deny();
  const runtime=(await args.db.collection('campaignCloudRuntime')
    .doc(args.snapshotId).get()).data();
  if(!object(runtime)||runtime['status']!=='active'||
     runtime['private']!==true||
     runtime['sourceSnapshotId']!==args.snapshotId||
     runtime['sourceSnapshotReconciled']!==true||
     runtime['applicationEnabled']!==true||
     runtime['driveAuditApproved']!==true)return deny();
  const stage=(await args.db.collection('migrationDriveSyncStage')
    .doc(args.snapshotId).get()).data();
  if(!object(stage)||stage['status']!=='complete'||
     stage['private']!==true||stage['formatVersion']!==1||
     !object(stage['counts']))return deny();
  const counts:Record<string,number>=Object.create(null);
  for(const key of COUNTS){
    const v=stage['counts'][key];
    if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>100_000)
      return deny();
    counts[key]=v;
  }
  return {mode:'audit_only' as const,cloudWrites:0,
    readyForReconciliation:false,counts:{...counts}};
}
