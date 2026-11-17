/**
 * Read-only, privacy-safe prerequisite inspection for Cormyr Cloud runtimes.
 * The archived game/calendar does NOT itself authorize live operations.
 * This code never writes, sets flags, creates accounts or selects a round.
 */
import {validateHarptosDate} from './stage-temporal-emulator.mjs';

const HASH=/^[a-f0-9]{64}$/;
const CORE=Object.freeze([
  'migrationDomainStage','migrationAuthStage','migrationTimeEngineStage',
  'migrationNobleHouseStage','migrationNewspaperRuntimeStage','migrationSpyStage',
]);
const AUX=Object.freeze([
  'migrationPrivateGmStage','migrationDriveSyncStage',
  'migrationPublicContentStage','migrationStorageStage',
]);
const ALL=Object.freeze([...CORE,...AUX]);
const stageComplete=(doc,snapshotId)=>{
  if(doc?.exists!==true)return false;
  const data=doc.data();
  return data?.status==='complete'&&data?.private===true&&
    (data.sourceSnapshotId===undefined||data.sourceSnapshotId===snapshotId);
};
const calendarValid=doc=>{
  if(doc?.exists!==true)return false;
  const d=doc.data();
  // The Cloud TimeEngine projection may omit calendarType; the legacy
  // migration's other temporal projection sets it explicitly.
  return (d?.calendarType===undefined||d.calendarType==='harptos')&&
    Number.isSafeInteger(d.year)&&d.year>=1&&d.year<=9999&&
    Number.isSafeInteger(d.month)&&Number.isSafeInteger(d.day)&&
    Number.isSafeInteger(d.version)&&d.version>=1&&
    (d.festival===null||d.festival===undefined||typeof d.festival==='string')&&
    validateHarptosDate(d.year,d.month,d.day,d.festival??null)&&
    (d.lastRound===null||d.lastRound===undefined||
     Number.isSafeInteger(d.lastRound)&&d.lastRound>=1);
};

/**
 * Only fixed collection names and aggregate booleans are returned.
 * Never propagate the snapshot, dates, lastRound, House names, UIDs, contents
 * or provider error messages in the report.
 */
export async function inspectCloudRuntimeSources({db,snapshotId}={}){
  if(!HASH.test(snapshotId??'')||typeof db?.collection!=='function')
    throw Error('runtime_source_invalid_configuration');
  const refs=ALL.map(name=>db.collection(name).doc(snapshotId));
  const time=db.collection('migrationTimeEngineStage').doc(snapshotId);
  const mail=db.collection('campaignMailRuntime').doc(snapshotId);
  const houses=db.collection('campaignCloudRuntime').doc(snapshotId);
  const docs=await Promise.all([
    ...refs.map(ref=>ref.get()),
    time.collection('calendar').doc('current').get(),
    mail.get(),houses.get(),
  ]);
  const stages=Object.fromEntries(ALL.map((name,index)=>[
    name,stageComplete(docs[index],snapshotId),
  ]));
  const calendar=docs[ALL.length];
  const mailExists=docs[ALL.length+1]?.exists===true;
  const houseExists=docs[ALL.length+2]?.exists===true;
  const requiredStagesVerified=CORE.every(name=>stages[name]===true);
  const auxiliaryStagesVerified=AUX.filter(name=>stages[name]===true).length;
  const validCalendar=stages.migrationTimeEngineStage===true&&
    calendarValid(calendar);
  return {
    scope:'CORMYR_CLOUD_RUNTIME_SOURCE_PREFLIGHT_READ_ONLY',
    sourceStagesVerified:requiredStagesVerified?CORE.length:
      CORE.filter(name=>stages[name]).length,
    auxiliaryStagesVerified,
    missingCoreStages:CORE.filter(name=>!stages[name]),
    missingAuxiliaryStages:AUX.filter(name=>!stages[name]),
    calendarDocumentVerified:validCalendar,
    calendarHasHistoricalRound:validCalendar&&
      Number.isSafeInteger(calendar.data()?.lastRound)&&
      calendar.data().lastRound>=1,
    mailRuntimeExists:mailExists,
    houseRuntimeExists:houseExists,
    // Neither a historical lastRound nor a calendar version tells us the
    // CURRENT open round without a separate live-source reconciliation.
    currentRoundApproved:false,
    freshSourceDeltaReconciled:false,
    storageBytesReconciled:false,
    publicReviewApproved:false,
    actualCloudRoleE2EPassed:false,
    readyForRuntimeProvisioning:false,
    readyForPlayers:false,readyForCutover:false,
    cloudWrites:0,releaseDecision:'NO_GO',
  };
}
