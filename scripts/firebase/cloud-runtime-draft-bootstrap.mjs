/** Protected, DISABLED Cloud runtime bootstrap: never open gameplay. */
import {pathToFileURL} from 'node:url';
import {inspectCloudRuntimeSources} from './cloud-runtime-source-preflight.mjs';
import {validateHarptosDate} from './stage-temporal-emulator.mjs';

const HASH=/^[a-f0-9]{64}$/;
const APPROVAL='CREATE_DISABLED_CORMYR_RUNTIME_DRAFTS';
const ROOTS=['migrationDomainStage','migrationAuthStage',
  'migrationTimeEngineStage','migrationNobleHouseStage',
  'migrationNewspaperRuntimeStage','migrationSpyStage',
  'migrationStorageStage'];
const refuse=code=>{throw Error('runtime_draft_'+code);};
const SAFE_ERRORS=Object.freeze(new Set([
  'invalid_configuration','approval_required','single_snapshot_unverified',
  'sources_unverified','destination_exists','transaction_sources_changed',
  'project_invalid',
]));
const SAFE_PHASES=Object.freeze(new Set([
  'initialization','snapshot_inventory','historical_source_preflight',
  'transactional_write','completed',
]));
/** Never print provider error strings: only allowlisted labels. */
export function classifyRuntimeDraftFailure(error){
  const code=error&&typeof error==='object'?error.code:null;
  if(code===7||code==='7'||code==='permission-denied'||code==='PERMISSION_DENIED')
    return 'firestore_permission_denied';
  if(code===14||code==='14'||code==='unavailable'||code==='UNAVAILABLE')
    return 'firestore_unavailable';
  if(code===10||code==='10'||code==='aborted'||code==='ABORTED')
    return 'firestore_transaction_aborted';
  const message=error instanceof Error?error.message:'';
  if(message.startsWith('runtime_draft_')){
    const suffix=message.slice('runtime_draft_'.length);
    if(SAFE_ERRORS.has(suffix))return suffix;
  }
  return 'unknown_failure';
}
function phase(callback,label){
  if(SAFE_PHASES.has(label)&&typeof callback==='function')callback(label);
}
const completed=(d,id)=>d?.exists===true&&
  d.data()?.status==='complete'&&d.data()?.private===true&&
  (d.data()?.sourceSnapshotId===undefined||d.data()?.sourceSnapshotId===id);
const goodCalendar=d=>{
  const c=d?.data?.();
  return d?.exists===true&&
    (c?.calendarType===undefined||c.calendarType==='harptos')&&
    Number.isSafeInteger(c.year)&&c.year>=1&&c.year<=9999&&
    Number.isSafeInteger(c.month)&&Number.isSafeInteger(c.day)&&
    Number.isSafeInteger(c.version)&&c.version>=1&&
    validateHarptosDate(c.year,c.month,c.day,c.festival??null);
};

export async function bootstrapDisabledCloudRuntimes({
  db,projectId,mode='preview',confirmation='',env=process.env,
  onPhase=()=>{},
}={}){
  phase(onPhase,'initialization');
  if(projectId!=='cormyr'||typeof db?.collection!=='function'||
     typeof db?.runTransaction!=='function'||
     env?.FIRESTORE_EMULATOR_HOST||env?.FIREBASE_AUTH_EMULATOR_HOST||
     !['preview','apply'].includes(mode))refuse('invalid_configuration');
  if(mode==='apply'&&confirmation!==APPROVAL)refuse('approval_required');
  phase(onPhase,'snapshot_inventory');
  const all=await db.collection('migrationDomainStage').limit(2).get();
  if(!Array.isArray(all?.docs)||all.docs.length!==1||
     !HASH.test(all.docs[0].id)||
     !completed(all.docs[0],all.docs[0].id))refuse('single_snapshot_unverified');
  const id=all.docs[0].id; // Deliberately never returned or logged.
  phase(onPhase,'historical_source_preflight');
  const sources=await inspectCloudRuntimeSources({db,snapshotId:id});
  const verified=sources.sourceStagesVerified===6&&
    sources.calendarDocumentVerified===true&&
    !sources.missingAuxiliaryStages.includes('migrationStorageStage');
  const absent=!sources.houseRuntimeExists&&!sources.mailRuntimeExists;
  const report={
    scope:'CORMYR_DISABLED_RUNTIME_DRAFT_BOOTSTRAP',
    historicalStagesVerified:sources.sourceStagesVerified,
    storageVerified:!sources.missingAuxiliaryStages.includes('migrationStorageStage'),
    historicalCalendarVerified:sources.calendarDocumentVerified,
    prerequisitesVerified:verified,destinationsAbsent:absent,
    documentsPlanned:verified&&absent?2:0,documentsCreated:0,
    currentRoundApproved:false,publicContentReviewed:false,
    sourceLiveReconciled:false,applicationEnabled:false,
    mailEnabled:false,readyForPlayers:false,
    readyForCutover:false,releaseDecision:'NO_GO',
  };
  if(mode==='preview'){
    phase(onPhase,'completed');
    return report;
  }
  if(!verified)refuse('sources_unverified');
  if(!absent)refuse('destination_exists');
  const roots=ROOTS.map(name=>db.collection(name).doc(id));
  const temporal=db.collection('migrationTimeEngineStage').doc(id)
    .collection('calendar').doc('current');
  const house=db.collection('campaignCloudRuntime').doc(id);
  const mail=db.collection('campaignMailRuntime').doc(id);
  phase(onPhase,'transactional_write');
  await db.runTransaction(async tx=>{
    const docs=await Promise.all([...roots.map(r=>tx.get(r)),
      tx.get(temporal),tx.get(house),tx.get(mail)]);
    if(docs.slice(0,ROOTS.length).some(d=>!completed(d,id))||
       !goodCalendar(docs[ROOTS.length]))
      refuse('transaction_sources_changed');
    if(docs[ROOTS.length+1]?.exists!==false||
       docs[ROOTS.length+2]?.exists!==false)
      refuse('destination_exists');
    tx.create(house,{
      status:'pending',private:true,sourceSnapshotId:id,
      sourceSnapshotReconciled:false,applicationEnabled:false,
      mailWriteApproved:false,publicCatalogApproved:false,
      publicTranslationsApproved:false,publicTimeApproved:false,
      // No openRound, version, or sensitive content is invented.
    });
    tx.create(mail,{
      status:'pending',private:true,sourceSnapshotId:id,
      sourceLiveReconciled:false,applicationEnabled:false,
      mailEnabled:false,
    });
  });
  phase(onPhase,'completed');
  return {...report,documentsCreated:2};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  let lastPhase='initialization';
  try{
    if(process.env.GOOGLE_CLOUD_PROJECT!=='cormyr')refuse('project_invalid');
    const [{initializeApp,getApps,applicationDefault},{getFirestore}]=
      await Promise.all([import('firebase-admin/app'),
        import('firebase-admin/firestore')]);
    const name='cormyr-protected-disabled-drafts';
    const app=getApps().find(v=>v.name===name)??initializeApp({
      credential:applicationDefault(),projectId:'cormyr',
    },name);
    const report=await bootstrapDisabledCloudRuntimes({
      db:getFirestore(app),projectId:'cormyr',
      mode:process.env.CORMYR_RUNTIME_DRAFT_MODE,
      confirmation:process.env.CORMYR_RUNTIME_DRAFT_CONFIRMATION,
      onPhase:label=>{lastPhase=label;},
    });
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if(!report.prerequisitesVerified||!report.destinationsAbsent)
      process.exitCode=2;
  }catch(error){
    // Log only fixed enum values; never provider messages, hashes, user data.
    process.stderr.write('runtime_draft_failed phase='+lastPhase+
      ' reason='+classifyRuntimeDraftFailure(error)+'\n');
    process.exitCode=2;
  }
}
