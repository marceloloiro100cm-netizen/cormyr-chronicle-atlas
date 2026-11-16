/**
 * Firebase-only public campaign clock.
 *
 * Firebase Admin is privileged (Firestore Rules do not apply), so this
 * anonymous projection MUST require explicit, independent publication
 * approval in the private Cloud runtime. Never infer approval from a
 * successful migration stage or a historical calendar snapshot alone.
 */
import type {Firestore} from 'firebase-admin/firestore';
import {publicCampaignTimeProjection,type PublicCampaignTime} from './public-time';

const HASH=/^[a-f0-9]{64}$/;

export class PublicFirebaseTimeUnavailable extends Error {
  constructor(){
    super('firebase_public_time_unavailable');
    this.name='PublicFirebaseTimeUnavailable';
  }
}

const unavailable=():never=>{throw new PublicFirebaseTimeUnavailable();};

export async function readApprovedFirebasePublicTime({
  db,snapshotId,projectId,enabled,env=process.env,
}:{
  db:Firestore;
  snapshotId:string;
  projectId:string;
  enabled:boolean;
  env?:NodeJS.ProcessEnv;
}):Promise<PublicCampaignTime>{
  if(enabled!==true||projectId!=='cormyr'||!HASH.test(snapshotId)||
     env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||
     !db||typeof db.collection!=='function')return unavailable();

  // Active private runtime provides the explicit public release decision.
  // A historical imported stage, even status=complete, never self-publishes.
  const runtimeRef=db.collection('campaignCloudRuntime').doc(snapshotId);
  const runtime=await runtimeRef.get();
  const controls=runtime.exists?runtime.data():null;
  if(!controls||controls.status!=='active'||controls.private!==true||
     controls.sourceSnapshotId!==snapshotId||
     controls.sourceSnapshotReconciled!==true||
     controls.applicationEnabled!==true||
     controls.publicTimeApproved!==true||
     !Number.isSafeInteger(controls.publishedTimeVersion)||
     controls.publishedTimeVersion<1||
     controls.calendarVersion!==controls.publishedTimeVersion)
    return unavailable();

  const stageRef=db.collection('migrationTimeEngineStage').doc(snapshotId);
  const stage=await stageRef.get();
  const stageData=stage.exists?stage.data():null;
  if(!stageData||stageData.status!=='complete'||stageData.private!==true)
    return unavailable();

  const snapshot=await stageRef.collection('calendar').doc('current').get();
  const record=snapshot.exists?snapshot.data():null;
  if(!record||record.version!==controls.publishedTimeVersion)
    return unavailable();
  try{
    // Whitelist exactly year/month/day/festival/version and derived labels.
    // Never include snapshot hashes, house data, notes or metadata.
    return publicCampaignTimeProjection({
      year:record.year,month:record.month,day:record.day,
      festival:record.festival??null,version:record.version,
    });
  }catch{return unavailable();}
}
