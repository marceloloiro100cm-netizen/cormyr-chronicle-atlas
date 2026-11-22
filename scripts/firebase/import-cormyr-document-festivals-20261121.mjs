/**
 * Import source-catalog festivals to the Firebase Hub, preserving already
 * visible player/editor observances and registered scheduleEvents.
 *
 * Safe default: --check only (no writes). --apply requires protected OIDC,
 * project/owner opt-in, and rechecks all duplicates in a single transaction.
 *
 * Authoritative source: Festivais.docx (Google Drive). Catalog uses the first
 * dated index; discrepancies in long-form Waukeentide narrative are recorded
 * in the catalog source, not silently overwritten.
 */
import {fileURLToPath} from 'node:url';
import {CORMYR_DOCUMENT_FESTIVALS,SOURCE_DOCUMENT}
 from './cormyr-festivals-catalog-20261121.mjs';
import {isFestivalId,harptosDateValid} from './hub-temporal-core.mjs';
import {effectiveCloudCalendar} from './cloud-operational-calendar.mjs';

const PROJECT='cormyr';
const ACK='OWNER_IMPORT_CORMYR_DOCUMENT_FESTIVALS_20261121';
const HASH=/^[a-f0-9]{64}$/;
const AUDIT_ID='owner-import-docfest-cormyr-20261121';
const fail=(condition,code)=>{if(!condition)throw Error(code);};
const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .replace(/^(festival|evento|waukeen|cormyr)\s*[·:\-]\s*/i,'')
 .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const sameDay=(a,b)=>Number(a?.month)===b.month&&Number(a?.day)===b.day&&
 (a?.festival??null)===(b.festival??null);
const sameDateKey=(key,date)=>{
 const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(String(key??''));
 return Boolean(m&&Number(m[1])>=1522&&Number(m[2])-1===date.month&&
  Number(m[3])===date.day);
};
function aliases(item){return new Set([item.name,...item.aliases].map(normalize));}
function matchesName(item,title){return aliases(item).has(normalize(title));}

export function planFestivalImport(existingFestivals,existingEvents){
  fail(Array.isArray(existingFestivals)&&Array.isArray(existingEvents),
    'inventory_invalid');
  const names=new Set(),ids=new Set(),planned=[];
  const counts={source:CORMYR_DOCUMENT_FESTIVALS.length,create:0,
    existingFestival:0,existingDeletedFestival:0,existingPublishedEvent:0,conflicts:0};
  for(const item of CORMYR_DOCUMENT_FESTIVALS){
    fail(item.name&&item.description.length>0&&item.description.length<=600&&
      item.repeat==='yearly'&&item.scope==='kingdom'&&item.region===null&&
      item.notify===true&&item.date.year===1522&&
      item.durationDays>=1&&item.durationDays<=30&&
      isFestivalId(item.id)&&harptosDateValid(item.date),
      'catalog_schema_invalid');
    fail(!ids.has(item.id),'catalog_duplicate_id');
    ids.add(item.id);
    const n=normalize(item.name);
    fail(!names.has(n),'catalog_duplicate_name');
    names.add(n);
    const related=existingFestivals.filter(v=>v&&
      (v.id===item.id||matchesName(item,v.name)));
    fail(related.every(v=>sameDay(v.date,item.date)&&
      Number(v.durationDays??1)===item.durationDays),
      'existing_festival_conflicts_'+item.key);
    if(related.length){
      if(related.some(v=>v.deleted!==true)){
        counts.existingFestival++;planned.push({item,status:'existing_festival'});
      }else{
        counts.existingDeletedFestival++;planned.push({item,status:'existing_deleted_festival'});
      }
      continue;
    }
    const events=existingEvents.filter(v=>{
      const pair=[v?.published,v?.draft].filter(Boolean);
      return pair.some(x=>matchesName(item,x.title)&&
        typeof x.date==='string'&&/^(\d{4})-/.test(x.date)&&
        Number(x.date.slice(0,4))>=1522);
    });
    fail(events.every(v=>[v.published,v.draft].filter(Boolean).every(x=>
      !matchesName(item,x.title)||sameDateKey(x.date,item.date))),
      'existing_event_conflicts_'+item.key);
    if(events.length){
      counts.existingPublishedEvent++;planned.push({item,status:'existing_event'});continue;
    }
    counts.create++;planned.push({item,status:'create'});
  }
  fail(counts.source===25,'unexpected_source_count');
  return {planned,counts};
}
function publishSummary(plan,action){
  const results=plan.planned.map(({item,status})=>({
    key:item.key,month:item.month+1,day:item.day,durationDays:item.durationDays,status,
  }));
  return {action,sourceDoc:SOURCE_DOCUMENT,counts:plan.counts,results};
}

export async function importDocumentFestivals(db,{apply=false,now=()=>new Date().toISOString()}={}){
  const candidates=await db.collection('campaignCloudRuntime').limit(20).get();
  fail(candidates.size<20,'runtime_count_limit');
  const active=candidates.docs.filter(d=>d.data()?.status==='active'&&
    d.data()?.private===true&&d.data()?.applicationEnabled===true);
  fail(active.length===1&&HASH.test(active[0].id),'active_runtime_not_unique');
  const snapshotId=active[0].id,root=active[0].ref;
  const archive=db.collection('migrationTimeEngineStage').doc(snapshotId)
    .collection('calendar').doc('current');
  const festivals=root.collection('festivals');
  const events=root.collection('scheduleEvents');
  const audit=db.collection('campaignNarratorDrafts').doc(snapshotId)
    .collection('calendarAudit').doc(AUDIT_ID);
  const result=await db.runTransaction(async tx=>{
    const [runtimeDoc,archiveDoc,festivalDocs,eventDocs,auditDoc]=await Promise.all([
      tx.get(root),tx.get(archive),tx.get(festivals.limit(501)),
      tx.get(events.limit(2001)),tx.get(audit),
    ]);
    const live=runtimeDoc.data();
    fail(runtimeDoc.exists&&archiveDoc.exists&&live?.private===true&&
      live?.status==='active'&&live?.applicationEnabled===true&&
      live?.sourceSnapshotId===snapshotId&&
      live?.sourceSnapshotReconciled===true&&live?.calendarSource==='operational'&&
      effectiveCloudCalendar(archiveDoc.data(),live,snapshotId)!=null,
      'campaign_runtime_not_ready');
    fail(festivalDocs.size<=500&&eventDocs.size<=2000,
      'inventory_too_large');
    const currentFest=festivalDocs.docs.map(d=>({id:d.id,...d.data()}));
    const currentEvents=eventDocs.docs.map(d=>d.data());
    const plan=planFestivalImport(currentFest,currentEvents);
    if(auditDoc.exists){
      fail(auditDoc.data()?.action==='import_document_festivals'&&
        auditDoc.data()?.sourceDocument===SOURCE_DOCUMENT,'audit_conflict');
    }
    if(!apply)return publishSummary(plan,'preview');
    if(auditDoc.exists){
      fail(plan.counts.create===0,'previous_import_has_missing_records');
      return publishSummary(plan,'already_imported');
    }
    const at=now();fail(typeof at==='string'&&Number.isFinite(Date.parse(at)),
      'audit_clock_invalid');
    for(const {item,status} of plan.planned){
      if(status!=='create')continue;
      const document={
        id:item.id,version:1,name:item.name,scope:item.scope,region:item.region,
        date:item.date,repeat:item.repeat,durationDays:item.durationDays,
        notify:item.notify,description:item.description,deleted:false,
        createdAt:at,updatedAt:at,updatedBy:'owner-approved-document-import',
        sourceDocument:SOURCE_DOCUMENT,
      };
      tx.create(festivals.doc(item.id),document);
    }
    tx.create(audit,{
      action:'import_document_festivals',at,actorUid:'owner-approved-document-import',
      sourceDocument:SOURCE_DOCUMENT,createdCount:plan.counts.create,
      previouslyRegistered:plan.counts.existingFestival+plan.counts.existingDeletedFestival+plan.counts.existingPublishedEvent,
      sourceCount:plan.counts.source,importedIds:plan.planned
        .filter(p=>p.status==='create').map(p=>p.item.id),
      note:'Importação sem alterar eventos fixos, calendário operacional, missivas ou jornal.',
    });
    return publishSummary(plan,'applied');
  });
  // Post-write read of exact imported IDs, no raw private records in logs.
  if(result.action==='applied'){
    const imported=result.results.filter(r=>r.status==='create');
    const checks=await Promise.all(imported.map(r=>
      root.collection('festivals').doc('docfest-'+r.key).get()));
    fail(checks.every(d=>d.exists&&d.data()?.deleted===false),
      'post_commit_festival_verification_failed');
  }
  const safe={action:result.action,counts:result.counts,
    byStatus:result.results.filter(r=>r.status!=='create')};
  console.log('CORMYR_FESTIVAL_IMPORT '+JSON.stringify(safe));
  return result;
}

async function main(){
  fail(process.env.GOOGLE_CLOUD_PROJECT===PROJECT&&
    (!process.env.GCLOUD_PROJECT||process.env.GCLOUD_PROJECT===PROJECT)&&
    !process.env.FIRESTORE_EMULATOR_HOST&&!process.env.FIREBASE_AUTH_EMULATOR_HOST,
    'wrong_project');
  const apply=process.argv.includes('--apply');
  fail(!(apply&&process.argv.includes('--check')),'conflicting_modes');
  if(apply)fail(process.env.CORMYR_FESTIVAL_IMPORT_ACK===ACK,
    'explicit_owner_ack_required');
  const [{initializeApp,applicationDefault},{getFirestore}]=await Promise.all([
    import('firebase-admin/app'),import('firebase-admin/firestore'),
  ]);
  const app=initializeApp({projectId:PROJECT,credential:applicationDefault()},
    'cormyr-document-festivals-import');
  await importDocumentFestivals(getFirestore(app),{apply});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  main().catch(e=>{console.error('CORMYR_FESTIVAL_IMPORT_BLOCKED '+(e?.message??'unknown'));
    process.exitCode=1;});
}
