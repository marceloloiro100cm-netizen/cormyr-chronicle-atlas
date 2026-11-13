/**
 * Harptos temporal projection and private operational-history archive.
 * Emulator only; no calendar advancement, writes to source, or cloud import.
 *
 * Dates use the Forgotten Realms campaign calendar, never JS Date arithmetic.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertEmulatorOnly,loadVerifiedPrivateTables,buildPrivateArchivePlan,
} from './stage-firestore-emulator.mjs';

const DEMO='demo-cormyr-migration';
const ROOT='migrationTemporalStage';
const HISTORY=[
  'public.campaign_calendar',
  'public.campaign_calendar_audit',
  'public.campaign_time_operations',
  'public.campaign_temporal_consumers',
  'public.campaign_temporal_deliveries',
  'public.campaign_temporal_delivery_resolutions',
  'public.campaign_temporal_effect_checkpoints',
];
const FESTIVALS=new Map([
  ['midwinter',0],['greengrass',3],['midsummer',6],
  ['shieldmeet',6],['highharvestide',8],['feast-moon',10],
]);
const bool=v=>v==='t'||v==='true'?true:v==='f'||v==='false'?false:null;
const whole=(v,min,max)=>typeof v==='string'&&/^\d+$/.test(v)&&
  Number.isSafeInteger(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):null;

export function validateHarptosDate(year,month,day,festival) {
  if(!Number.isInteger(year)||year<1||year>9999 ||
     !Number.isInteger(month)||month<0||month>11 ||
     !Number.isInteger(day)||day<1||day>30)return false;
  if(festival===null)return true;
  return FESTIVALS.has(festival)&&FESTIVALS.get(festival)===month&&
    (festival!=='shieldmeet'||year%4===0);
}
export function harptosKey(year,month,day,festival) {
  if(!validateHarptosDate(year,month,day,festival))
    throw Error('Invalid Harptos date');
  return festival
    ? String(year).padStart(4,'0')+'-F-'+festival
    : String(year).padStart(4,'0')+'-'+String(month+1).padStart(2,'0')+
      '-'+String(day).padStart(2,'0');
}

export function planTemporalEmulator(tables,snapshotId) {
  if(!Array.isArray(tables)||!/^[a-f0-9]{64}$/.test(snapshotId))
    throw Error('Invalid verified temporal source');
  const entries=new Map(tables.map(t=>[t.table,t]));
  const missingRequired=entries.has('public.campaign_calendar')?[]:['public.campaign_calendar'];
  const history=HISTORY.filter(t=>entries.has(t)).map(t=>entries.get(t));
  const missingHistory=HISTORY.filter(t=>!entries.has(t));
  const rows=entries.get('public.campaign_calendar')?.rows||[];
  const issues={notExactlyOneCalendar:rows.length===1?0:1,invalidCalendar:0};
  let projection=null;
  if(rows.length===1){
    const r=rows[0];
    const year=whole(r.year,1,9999),month=whole(r.month,0,11);
    const day=whole(r.day,1,30),version=whole(r.version,1,2147483647);
    const round=r.last_round==null?null:whole(r.last_round,1,2147483647);
    const autoAdvance=bool(r.auto_advance);
    const festival=r.festival||null;
    if(bool(r.id)!==true||version===null||autoAdvance===null ||
       (r.last_round!=null&&round===null) ||
       !validateHarptosDate(year,month,day,festival)){
      issues.invalidCalendar++;
    }else{
      projection={
        calendarType:'harptos',
        year,month,day,festival,
        dateKey:harptosKey(year,month,day,festival),
        tenday:Math.ceil(day/10),
        autoAdvance,lastRound:round,version,
        migratedReadOnly:true,
      };
    }
  }
  // This exact snapshot has already passed the source manifest SHA checks.
  // The raw history is an additional private copy; no audit/operations data
  // will ever be put in the readable calendar document.
  const archive=buildPrivateArchivePlan(history,snapshotId);
  const complete=history.length===HISTORY.length;
  const valid=issues.notExactlyOneCalendar===0&&
    issues.invalidCalendar===0&&archive.summary.emulatorPlanValid&&
    complete&&missingRequired.length===0;
  return {
    snapshotId,projection,archive,
    summary:{
      scope:'private-temporal-emulator-only',
      calendarProjected:Boolean(projection),
      sourceCalendarRows:rows.length,
      migratedTemporalTables:history.length,
      temporalHistoryRows:archive.summary.archivedPublicRows,
      fragmentedHistoryRows:archive.summary.chunkedRows,
      missingHistoryTables:missingHistory,
      issues:{...issues,...archive.summary.issues},
      planValid:valid,cloudWrites:0,readyForCloudImport:false,
      warning:'Read-only Harptos projection: no advancement, audit review or temporal consumer execution implemented.',
    },
  };
}

export async function loadTemporalEmulatorPlan(normalized){
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(normalized);
  return planTemporalEmulator(tables,snapshotHash);
}

export async function stageTemporalEmulator(plan,db,env=process.env){
  assertEmulatorOnly(env,DEMO);
  if(!plan?.summary?.planValid || !plan.projection)
    throw Error('Private temporal source plan invalid or incomplete');
  const root=db.collection(ROOT).doc(plan.snapshotId);
  await root.set({status:'incomplete',formatVersion:1,private:true});
  let writes=1,batch=db.batch(),pending=0,bytes=0;
  async function flush(){
    if(!pending)return;
    await batch.commit();writes+=pending;batch=db.batch();pending=0;bytes=0;
  }
  async function enqueue(ref,data){
    const size=Buffer.byteLength(JSON.stringify(data),'utf8');
    if(size+8192>850*1024)throw Error('Temporal doc too large');
    if(pending&&(pending>=100||bytes+size>4*1024*1024))await flush();
    batch.set(ref,data);pending++;bytes+=size;
  }
  await enqueue(root.collection('calendar').doc('current'),plan.projection);
  for(const t of plan.archive.tableDocs){
    await enqueue(root.collection('tables').doc(t.tableDigest),t.payload);
  }
  for(const row of plan.archive.plannedRows){
    const ref=root.collection('tables').doc(row.tableDigest)
      .collection('rows').doc(row.docId);
    await enqueue(ref,row.payload);
    for(const chunk of row.chunks||[]){
      await enqueue(ref.collection('chunks').doc(chunk.docId),chunk.payload);
    }
  }
  await flush();
  await root.set({
    status:'complete',formatVersion:1,private:true,
    temporalHistoryRows:plan.summary.temporalHistoryRows,
    migratedTemporalTables:plan.summary.migratedTemporalTables,
  });writes++;
  return {
    staged:true,calendarProjected:true,
    migratedTemporalTables:plan.summary.migratedTemporalTables,
    temporalHistoryRows:plan.summary.temporalHistoryRows,
    emulatorWrites:writes,cloudWrites:0,readyForCloudImport:false,
  };
}

export async function main(args,options={}){
  if((args.length!==2&&args.length!==3)||args[0]!=='--normalized'||
      !args[1]||(args.length===3&&args[2]!=='--execute-emulator')){
    throw Error('Use --normalized PRIVATE_DIR [--execute-emulator]');
  }
  const plan=await loadTemporalEmulatorPlan(args[1]);
  if(args.length===2){
    if(!options.silent)process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');
    return plan.summary;
  }
  const env=options.env||process.env;
  assertEmulatorOnly(env,DEMO);
  if(!plan.summary.planValid)throw Error('Temporal source not ready for emulator');
  let app,db=options.db;
  if(!db){
    const {initializeApp}=await import('firebase-admin/app');
    const {getFirestore}=await import('firebase-admin/firestore');
    app=initializeApp({projectId:DEMO},'cormyr-temporal-stage');
    db=getFirestore(app);
  }
  try{
    const out=await stageTemporalEmulator(plan,db,env);
    if(!options.silent)process.stdout.write(JSON.stringify(out,null,2)+'\n');
    return out;
  }finally{
    if(app){
      const {deleteApp}=await import('firebase-admin/app');
      await deleteApp(app);
    }
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{
    console.error('Temporal emulator staging blocked. No private values printed.');
    process.exitCode=1;
  });
}
