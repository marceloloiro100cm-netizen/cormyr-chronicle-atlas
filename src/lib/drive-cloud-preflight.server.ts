/**
 * Scheduler-owned Firebase-only Drive reconciliation preflight.
 * This cannot sync or mutate files; the historical Drive executor used SQL
 * transactions and cannot safely be reused against Cloud Firestore.
 */
import type {Firestore} from 'firebase-admin/firestore';

const HASH=/^[a-f0-9]{64}$/;
type Args={db:Firestore;snapshotId:string;projectId:string;enabled:boolean;env?:NodeJS.ProcessEnv};
const obj=(v:unknown):v is Record<string,unknown>=>
  !!v&&typeof v==='object'&&!Array.isArray(v);
export class DriveCloudPreflightError extends Error{
  constructor(readonly code:string,readonly status:400|503=503){super(code);}
}
const deny=(code:string):never=>{throw new DriveCloudPreflightError(code);};
const count=(value:unknown)=>{
  if(!obj(value))return null;
  const fields=['bindings','files','inbox','outbox','conflicts'];
  if(fields.some(k=>!Number.isSafeInteger(value[k])||
       typeof value[k]!=='number'||value[k]<0||value[k]>1_000_000))
    return null;
  return fields.map(k=>value[k] as number);
};
export async function readDriveCloudPreflight(args:Args){
  const env=args.env??process.env;
  if(!args.enabled||args.projectId!=='cormyr'||!HASH.test(args.snapshotId)||
     env['FIRESTORE_EMULATOR_HOST']||env['FIREBASE_AUTH_EMULATOR_HOST']||
     typeof args.db?.collection!=='function')
    return deny('drive_preflight_disabled');
  const runtime=(await args.db.collection('campaignCloudRuntime')
    .doc(args.snapshotId).get()).data();
  if(!obj(runtime)||runtime['status']!=='active'||runtime['private']!==true||
     runtime['sourceSnapshotId']!==args.snapshotId||
     runtime['sourceSnapshotReconciled']!==true||
     runtime['applicationEnabled']!==true)
    return deny('drive_cloud_not_reconciled');
  const source=(await args.db.collection('migrationDriveSyncStage')
    .doc(args.snapshotId).get()).data();
  if(!obj(source)||source['status']!=='complete'||
     source['private']!==true||source['formatVersion']!==1)
    return deny('drive_stage_not_ready');
  const counts=count(source['counts']);
  if(!counts)return deny('drive_stage_not_ready');
  const total=counts.reduce((a,b)=>a+b,0);
  return {
    mode:'preflight-only',stageComplete:true,
    stagedObjects:total,stagedBindings:counts[0],
    // Real Drive folder ownership and byte-level consistency still require
    // independent approval: these booleans must never be optimistic.
    googleDriveAuthenticated:false,folderOwnershipVerified:false,
    realSyncEnabled:false,driveWrites:0,firestoreWrites:0,
    readyForPlayers:false,readyForCutover:false,
  } as const;
}
