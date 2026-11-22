/**
 * Read-only Cormyr temporal integrity report. Does not print identities,
 * snapshot IDs, event titles/descriptions, Firestore paths or row content.
 * Uses the already configured short-lived GitHub OIDC reader credentials.
 */
import {initializeApp,applicationDefault,getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const app=getApps().find(a=>a.name==='cormyr-temporal-integrity')??
 initializeApp({projectId:'cormyr',credential:applicationDefault()},'cormyr-temporal-integrity');
const db=getFirestore(app);
const SOURCE=['campaign_calendar','campaign_calendar_audit','campaign_time_operations',
 'campaign_schedule_events','campaign_schedule_event_audit',
 'campaign_temporal_consumers','campaign_temporal_deliveries',
 'campaign_temporal_delivery_resolutions','campaign_temporal_effect_checkpoints'];
const snap=await db.collection('migrationDomainStage').limit(2).get();
if(snap.size!==1||snap.docs[0].data()?.status!=='complete')throw Error('snapshot_not_unique_or_incomplete');
const snapshotId=snap.docs[0].id;
if(!/^[a-f0-9]{64}$/.test(snapshotId))throw Error('snapshot_invalid');
const archive=await db.collection('migrationPrivateSnapshots').doc(snapshotId).get();
const archiveData=archive.data()??{};
const archiveOkay=archive.exists&&archiveData.status==='complete'&&archiveData.private===true;
const tableDocs=archiveOkay
 ?await archive.ref.collection('tables').limit(160).get():null;
if(tableDocs&&tableDocs.size>=160)throw Error('source_table_inventory_exceeds_limit');
const source={};
for(const table of SOURCE){
 const match=tableDocs?.docs.filter(d=>d.data()?.sourceTable==='public.'+table)??[];
 if(match.length>1)throw Error('duplicate_source_table_metadata');
 if(match.length===0){source[table]={present:false,expected:null,actual:null,matched:null};continue;}
 const meta=match[0].data();
 const expected=meta.rowCount;
 if(!Number.isSafeInteger(expected)||expected<0)throw Error('invalid_source_row_count');
 const actual=(await match[0].ref.collection('rows').count().get()).data().count;
 source[table]={present:true,expected,actual,matched:actual===expected};
}
const timeStage=await db.collection('migrationTimeEngineStage').doc(snapshotId).get();
const importedCal=await timeStage.ref.collection('calendar').doc('current').get();
const cloud=await db.collection('campaignCloudRuntime').doc(snapshotId).get();
const mail=await db.collection('campaignMailRuntime').doc(snapshotId).get();
const operational=cloud.data()??{};
const runtimeEvents=(await cloud.ref.collection('scheduleEvents').count().get()).data().count;
const runtimeAudit=(await db.collection('campaignNarratorDrafts').doc(snapshotId)
 .collection('calendarAudit').count().get()).data().count;
const scheduleStage=await db.collection('migrationScheduleStage').doc(snapshotId).get();
const scheduleSourceCount=source.campaign_schedule_events.expected;
const lastId=typeof operational.lastAdvanceAuditId==='string'?operational.lastAdvanceAuditId:null;
const lastAdvance=lastId?await db.collection('campaignNarratorDrafts').doc(snapshotId)
 .collection('calendarAudit').doc(lastId).get():null;
const last=lastAdvance?.exists?lastAdvance.data():null;
const cloudWeek4Letters=(await cloud.ref.collection('letters')
 .where('creationRound','==',4).count().get()).data().count;
const cloudWeek4Newspapers=(await cloud.ref.collection('publishedNewspapers')
 .where('publishedRound','==',4).count().get()).data().count;
const result={
 scope:'CORMYR_TEMPORAL_INTEGRITY_READ_ONLY',
 sourceArchiveComplete:archiveOkay,
 sourceMetadataTables:tableDocs?.size??null,
 sourceTables:source,
 historicalTimeStageComplete:timeStage.data()?.status==='complete',
 historicalCalendarPresent:importedCal.exists,
 historicalCalendarVersion:Number.isSafeInteger(importedCal.data()?.version)
  ?importedCal.data().version:null,
 operationalRuntimeActive:operational.status==='active'&&operational.private===true,
 operationalCalendarVersion:Number.isSafeInteger(operational.calendarVersion)
  ?operational.calendarVersion:null,
 operationalWeek:Number.isSafeInteger(operational.openRound)?operational.openRound:null,
 operationalCalendarDay:Number.isSafeInteger(operational.calendar?.day)?operational.calendar.day:null,
 operationalCalendarYear:Number.isSafeInteger(operational.calendar?.year)?operational.calendar.year:null,
 operationalCalendarFestival:typeof operational.calendar?.festival==='string'?operational.calendar.festival:null,
 operationalLastAdvanceAction:['advance_week','undo_advance','start_season'].includes(last?.action)?last.action:null,
 operationalLastAdvanceFromWeek:Number.isSafeInteger(last?.fromRound)?last.fromRound:null,
 operationalLastAdvanceToWeek:Number.isSafeInteger(last?.toRound)?last.toRound:null,
 operationalLastAdvanceToDay:Number.isSafeInteger(last?.to?.day)?last.to.day:null,
 operationalLastAdvanceToMonth:Number.isSafeInteger(last?.to?.month)?last.to.month:null,
 operationalLastAdvanceUndone:typeof last?.undoneAt==='string',
 operationalWeekFourNewLetterCount:cloudWeek4Letters,
 operationalWeekFourNewspaperCount:cloudWeek4Newspapers,
 operationalCalendarMonth:Number.isSafeInteger(operational.calendar?.month)?operational.calendar.month:null,
 mailRuntimeAligned:mail.exists&&mail.data()?.openRound===operational.openRound&&
  mail.data()?.calendarVersion===operational.calendarVersion,
 importedScheduleStagePresent:scheduleStage.exists,
 importedScheduleStageComplete:scheduleStage.data()?.status==='complete',
 runtimeEventCount:runtimeEvents,
 operationalCalendarAuditCount:runtimeAudit,
 eventCountCompared:scheduleSourceCount!==null,
 operationalEventsBelowHistoricalCount:
  Number.isSafeInteger(scheduleSourceCount)&&runtimeEvents<scheduleSourceCount,
 sourceArchiveMetadataConsistent:SOURCE.every(t=>!source[t].present||source[t].matched===true),
 sourceEventRecordLossNotProven:true,
 firestoreWrites:0,
};
console.log('TEMPORAL_INTEGRITY_REPORT '+JSON.stringify(result));
if(!archiveOkay||!result.sourceArchiveMetadataConsistent||
 !result.historicalTimeStageComplete||!result.historicalCalendarPresent)process.exitCode=2;
