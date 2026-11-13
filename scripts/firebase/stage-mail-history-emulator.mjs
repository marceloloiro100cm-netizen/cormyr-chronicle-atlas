/**
 * Private mail-history migration for verified PostgreSQL COPY snapshots.
 * Stages every receipt, reply, version, round, submission and narrator note
 * into a denied-by-client archive. Only unambiguous DELIVERED replies become
 * a separate backend-only projection; drafts/scheduled/trash are not promoted.
 * Never imports to Firebase Cloud or changes the source database.
 */
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  assertEmulatorOnly,buildPrivateArchivePlan,loadVerifiedPrivateTables,
} from './stage-firestore-emulator.mjs';

const PROJECT='demo-cormyr-migration';
const ROOT='migrationMailHistoryStage';
const TABLES=[
  'public.letter_replies','public.letter_receipts','public.letter_versions',
  'public.letter_reply_versions','public.letter_rounds',
  'public.mail_submissions','public.narrator_mail_notes',
  'public.campaign_letter_consequences',
];
const SHA=/^[a-f0-9]{64}$/;
const digest=s=>createHash('sha256').update(s).digest('hex');
const objBytes=o=>Buffer.byteLength(JSON.stringify(o),'utf8');
const validDate=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))
  ?new Date(Date.parse(v)).toISOString():null;
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=512;
const validVersion=v=>typeof v==='string'&&/^[1-9][0-9]*$/.test(v)&&
  Number.isSafeInteger(Number(v))&&Number(v)<=2147483647?Number(v):null;

/** Aggregate planning only: never return sender, UID, content or subject in logs. */
export function planMailHistory(tables,snapshotId){
  if(!Array.isArray(tables)||!SHA.test(snapshotId))throw Error('Invalid verified mail source');
  const byTable=new Map(tables.map(t=>[t.table,t]));
  const required=['auth.users','public.campaign_letters',...TABLES];
  const missingTables=required.filter(t=>!byTable.has(t));
  const selected=TABLES.filter(t=>byTable.has(t)).map(t=>byTable.get(t));
  const archive=buildPrivateArchivePlan(selected,snapshotId);
  const source=byTable.get('public.letter_replies')?.rows||[];
  const letterRows=byTable.get('public.campaign_letters')?.rows||[];
  const users=new Set((byTable.get('auth.users')?.rows||[]).map(r=>r.id));
  const letters=new Map(letterRows.filter(r=>validId(r.id)).map(r=>[r.id,r]));
  const issues={duplicateReplyIds:0,unaccountedReplies:0,oversizedProjection:0};
  const privateReasons={
    draft:0,scheduled:0,deleted:0,missingParent:0,
    unpublishedParent:0,unresolvedRecipient:0,invalidProjection:0,
  };
  const replies=[],seen=new Set();
  let privateReplyRows=0;
  for(const r of source){
    if(!validId(r.id)||seen.has(r.id)){
      issues.duplicateReplyIds++;privateReplyRows++;continue;
    }
    seen.add(r.id);
    const parent=letters.get(r.letter_id);
    let reason=null;
    if(!parent)reason='missingParent';
    else if(parent.publication_state!=='delivered'||parent.deleted_at!=null||
       Boolean(parent.recipient_player_id)===Boolean(parent.recipient_house_id)){
      reason='unpublishedParent';
    }else if(r.deleted_at!=null)reason='deleted';
    else if(r.publication_state==='draft')reason='draft';
    else if(r.publication_state==='scheduled')reason='scheduled';
    else if(r.publication_state!=='delivered')reason='invalidProjection';
    else if(!users.has(r.author_user_id)||!users.has(r.recipient_user_id))
      reason='unresolvedRecipient';
    const createdAt=validDate(r.created_at);
    const version=validVersion(r.version);
    if(!reason&&(!createdAt||!version||typeof r.content!=='string'||
       typeof r.author_name!=='string'||!r.author_name.trim())){
      reason='invalidProjection';
    }
    if(reason){
      privateReplyRows++;
      privateReasons[reason]++;
      continue;
    }
    const payload={
      sourceId:r.id,
      letterId:digest('letter:'+r.letter_id),
      authorUid:r.author_user_id,
      recipientUid:r.recipient_user_id,
      authorName:r.author_name,
      content:r.content,createdAt,version,
      publicationState:'delivered',deletedAt:null,
      migratedReadOnly:true,
    };
    if(objBytes(payload)+8192>850*1024){
      issues.oversizedProjection++;
      privateReplyRows++;
      privateReasons.invalidProjection++;
      continue;
    }
    replies.push({id:digest('reply:'+r.id),payload});
  }
  if(source.length!==replies.length+privateReplyRows)issues.unaccountedReplies++;
  const archiveRows=selected.reduce((sum,t)=>sum+t.rows.length,0);
  const summary={
    scope:'private-mail-history-firestore-emulator-only',
    sourceTables:selected.length,
    missingTables,
    sourceHistoryRows:archiveRows,
    sourceReplyRows:source.length,
    deliveredReplies:replies.length,
    privatelyArchivedReplies:privateReplyRows,
    privateReasons,
    replyCoverageComplete:source.length===replies.length+privateReplyRows,
    archiveRows:archive.summary.archivedPublicRows,
    issues:{...issues,archive:archive.summary.issues},
    planValid:missingTables.length===0&&
      Object.values(issues).every(v=>v===0)&&
      archive.summary.emulatorPlanValid&&
      archive.summary.archivedPublicRows===archiveRows,
    cloudWrites:0,readyForCloudImport:false,
    applicationWritesImplemented:false,
  };
  return {snapshotId,archive,replies,summary};
}

export async function loadMailHistoryPlan(normalized){
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(normalized);
  return planMailHistory(tables,snapshotHash);
}

export async function stageMailHistory(plan,db,env=process.env){
  assertEmulatorOnly(env,PROJECT);
  if(!plan?.summary?.planValid||!SHA.test(plan.snapshotId))
    throw Error('Mail-history source plan invalid');
  const root=db.collection(ROOT).doc(plan.snapshotId);
  if((await root.get()).exists)throw Error('Mail-history snapshot already exists');
  await root.set({status:'incomplete',private:true,formatVersion:1});
  let written=1,pending=0,bytes=0,batch=db.batch();
  const flush=async()=>{
    if(!pending)return;
    await batch.commit();written+=pending;
    pending=0;bytes=0;batch=db.batch();
  };
  async function enqueue(ref,payload){
    const size=objBytes(payload);
    if(size+8192>850*1024)throw Error('Oversized private mail document');
    if(pending&&(pending>=100||bytes+size>4*1024*1024))await flush();
    batch.set(ref,payload);pending++;bytes+=size;
  }
  for(const reply of plan.replies)
    await enqueue(root.collection('replies').doc(reply.id),reply.payload);
  for(const t of plan.archive.tableDocs)
    await enqueue(root.collection('archive').doc(t.tableDigest),t.payload);
  for(const row of plan.archive.plannedRows){
    const ref=root.collection('archive').doc(row.tableDigest)
      .collection('rows').doc(row.docId);
    await enqueue(ref,row.payload);
    for(const chunk of row.chunks||[])
      await enqueue(ref.collection('chunks').doc(chunk.docId),chunk.payload);
  }
  await flush();
  await root.set({
    status:'complete',private:true,formatVersion:1,
    archiveRows:plan.summary.archiveRows,
    deliveredReplies:plan.summary.deliveredReplies,
    privatelyArchivedReplies:plan.summary.privatelyArchivedReplies,
  });written++;
  return {staged:true,emulatorWrites:written,
    deliveredReplies:plan.summary.deliveredReplies,
    privatelyArchivedReplies:plan.summary.privatelyArchivedReplies,
    archiveRows:plan.summary.archiveRows,
    cloudWrites:0,readyForCloudImport:false};
}

async function main(args){
  if((args.length!==2&&args.length!==3)||args[0]!=='--normalized'||
     !args[1]||(args.length===3&&args[2]!=='--execute-emulator'))
    throw Error('Use --normalized PRIVATE_DIRECTORY [--execute-emulator]');
  const plan=await loadMailHistoryPlan(args[1]);
  if(args.length===2){
    process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');return;
  }
  assertEmulatorOnly(process.env,PROJECT);
  if(!plan.summary.planValid)throw Error('Mail history preflight failed');
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:PROJECT},'cormyr-mail-history-emulator');
  try{
    const result=await stageMailHistory(plan,getFirestore(app));
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }finally{await deleteApp(app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{
    console.error('Mail-history emulator staging blocked. No private data printed.');
    process.exitCode=1;
  });
}
