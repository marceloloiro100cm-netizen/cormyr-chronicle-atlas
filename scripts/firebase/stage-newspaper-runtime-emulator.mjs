/**
 * Runtime stage of the newspaper domain in Firestore Emulator ONLY. Unlike the
 * read-only projection (stage-newspaper-emulator.mjs), these collections are
 * what newspaper-service.mjs reads and writes. Everything is server-only;
 * only aggregate counts are printed.
 */
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertEmulatorOnly,loadVerifiedPrivateTables} from './stage-firestore-emulator.mjs';
import {validateEditionFields,NewspaperError,TEMPLATES,FONTS,COMMISSION_STATES,
  cleanStaff,cleanModel,cleanEngraving,cleanSettings} from './newspaper-core.mjs';

const DEMO='demo-cormyr-migration';
export const ROOT='migrationNewspaperRuntimeStage';
const T={
  editions:'public.campaign_newspapers',revisions:'public.campaign_newspaper_revisions',
  reads:'public.campaign_newspaper_reads',commissions:'public.campaign_newspaper_commissions',
  staff:'public.campaign_newspaper_staff',models:'public.campaign_newspaper_story_models',
  engravings:'public.campaign_newspaper_engravings',settings:'public.campaign_newspaper_settings',
};
const MAX_DOC=850*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const readDocId=(newspaperId,userId)=>createHash('sha256').update('read:'+newspaperId+':'+userId).digest('hex');
const int=v=>v==null||v===''?null:/^-?\d+$/.test(v)?Number(v):NaN;
const bool=v=>v==='t'||v==='true'?true:v==='f'||v==='false'?false:null;
const iso=v=>{if(typeof v!=='string'||v==='')return null;const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString():null;};
const json=v=>{if(v==null||v==='')return undefined;if(typeof v==='object')return v;try{return JSON.parse(v);}catch{return undefined;}};
const nz=v=>v===undefined||v===''?null:v;
const bytes=o=>Buffer.byteLength(JSON.stringify(o),'utf8');

export function buildNewspaperRuntimePlan(tables,snapshotId){
  if(!Array.isArray(tables)||!/^[a-f0-9]{64}$/.test(snapshotId))throw new Error('Invalid verified source data');
  const by=new Map(tables.map(t=>[t.table,t]));
  const rows=n=>by.get(n)?.rows||[];
  const missing=[T.editions].filter(n=>!by.has(n));
  const issues={duplicateIds:0,invalidValues:0,orphanLinks:0,oversizedDocuments:0};
  const docs={editions:[],revisions:[],reads:[],commissions:[],staff:[],models:[],engravings:[],settings:[]};
  const seen=new Set();
  const once=k=>{if(seen.has(k)){issues.duplicateIds++;return false;}seen.add(k);return true;};
  const push=(type,id,payload)=>{if(bytes(payload)>MAX_DOC){issues.oversizedDocuments++;return;}docs[type].push({id,payload});};
  const bad=()=>{issues.invalidValues++;};
  const editionIds=new Set(),editionNos=new Set();
  for(const r of rows(T.editions)){
    const blocks=json(r.blocks),no=int(r.edition_no),version=int(r.version),rev=int(r.publication_revision);
    if(!UUID.test(r.id||'')||blocks===undefined||![no,version,rev].every(Number.isInteger)||no<1||version<1||rev<0){bad();continue;}
    let c;
    try{
      c=validateEditionFields({title:r.title,subtitle:r.subtitle??'',template:r.template,fontStyle:r.font_style,
        state:r.state,campaignDate:r.campaign_date,blocks,pdfPath:nz(r.pdf_path),publishOn:nz(r.publish_on)},r.id);
    }catch(e){if(e instanceof NewspaperError){bad();continue;}throw e;}
    if(!once('e:'+r.id))continue;
    if(editionNos.has(no)){issues.duplicateIds++;continue;}
    editionIds.add(r.id);editionNos.add(no);
    push('editions',r.id,{id:r.id,editionNo:no,...c,version,publicationRevision:rev,
      createdBy:nz(r.created_by),updatedBy:nz(r.updated_by),createdAt:iso(r.created_at),
      updatedAt:iso(r.updated_at),publishedAt:iso(r.published_at),archivedAt:iso(r.archived_at),
      cancelledAt:iso(r.cancelled_at)});
  }
  let revisionSeq=0;
  for(const r of rows(T.revisions)){
    const id=int(r.id),prev=int(r.previous_version),snap=json(r.snapshot);
    if(!Number.isInteger(id)||id<1||!Number.isInteger(prev)||!snap||typeof snap!=='object'){bad();continue;}
    if(!editionIds.has(r.newspaper_id)){issues.orphanLinks++;continue;}
    if(!once('v:'+id))continue;
    revisionSeq=Math.max(revisionSeq,id);
    push('revisions',String(id),{id,newspaperId:r.newspaper_id,previousVersion:prev,snapshot:snap,
      changedBy:nz(r.changed_by),changedAt:iso(r.changed_at)});
  }
  for(const r of rows(T.reads)){
    const rv=int(r.read_version);
    if(!r.user_id||!Number.isInteger(rv)||rv<0){bad();continue;}
    if(!editionIds.has(r.newspaper_id)){issues.orphanLinks++;continue;}
    if(!once('r:'+r.newspaper_id+':'+r.user_id))continue;
    push('reads',readDocId(r.newspaper_id,r.user_id),{newspaperId:r.newspaper_id,userId:r.user_id,
      readVersion:rv,readAt:iso(r.read_at)});
  }
  for(const r of rows(T.commissions)){
    const cost=int(r.cost_wealth);
    if(!UUID.test(r.id||'')||!r.house_id||!r.requested_by||!UUID.test(r.request_key||'')||
       typeof r.title!=='string'||typeof r.body!=='string'||cost!==1||!COMMISSION_STATES.has(r.state)){bad();continue;}
    if(r.newspaper_id&&!editionIds.has(r.newspaper_id)){issues.orphanLinks++;continue;}
    if(!once('c:'+r.id)||!once('ck:'+r.request_key))continue;
    push('commissions',r.id,{id:r.id,houseId:r.house_id,requestedBy:r.requested_by,title:r.title,body:r.body,
      imagePath:nz(r.image_path),costWealth:cost,state:r.state,rejectionNote:nz(r.rejection_note),
      rejectedAt:iso(r.rejected_at),rejectedBy:nz(r.rejected_by),requestKey:r.request_key,
      newspaperId:nz(r.newspaper_id),createdAt:iso(r.created_at),publishedAt:iso(r.published_at),
      seenAt:iso(r.seen_at)});
  }
  const guarded=(type,r,build)=>{
    if(!UUID.test(r.id||'')){bad();return;}
    let v;try{v=build();}catch(e){if(e instanceof NewspaperError){bad();return;}throw e;}
    if(!once(type+':'+r.id))return;
    push(type,r.id,{id:r.id,...v,createdBy:nz(r.created_by),createdAt:iso(r.created_at),
      ...(r.updated_at!==undefined?{updatedAt:iso(r.updated_at)}:{})});
  };
  for(const r of rows(T.staff))guarded('staff',r,()=>cleanStaff({name:r.name,specialty:r.specialty??'',bio:r.bio??'',photoPath:nz(r.photo_path)}));
  for(const r of rows(T.models))guarded('models',r,()=>{
    const b=json(r.blocks);return cleanModel({name:r.name,description:r.description??'',blocks:b});});
  for(const r of rows(T.engravings))guarded('engravings',r,()=>{
    const f=bool(r.in_collection);
    return cleanEngraving({name:r.name,imagePath:nz(r.image_path),publicSrc:nz(r.public_src),inCollection:f===null?true:f});});
  const srcSettings=rows(T.settings);
  if(srcSettings.length>1)issues.duplicateIds++;
  for(const r of srcSettings.slice(0,1)){
    try{
      push('settings','current',{...cleanSettings({title:r.title,subtitle:r.subtitle??'',template:r.template,fontStyle:r.font_style}),
        updatedBy:nz(r.updated_by),updatedAt:iso(r.updated_at)});
    }catch(e){if(e instanceof NewspaperError)bad();else throw e;}
  }
  const src=Object.fromEntries(Object.keys(T).map(k=>[k,rows(T[k]).length]));
  const counts=Object.fromEntries(Object.keys(T).map(k=>[k,docs[k].length]));
  const complete=Object.keys(T).every(k=>counts[k]===src[k]);
  return {snapshotId,docs,revisionSeq,summary:{
    planValid:missing.length===0&&complete&&Object.values(issues).every(n=>n===0),
    missingRequiredTables:missing.length,sourceCounts:src,stagedCounts:counts,coverageComplete:complete,issues}};
}

export async function loadNewspaperRuntimePlan(dir){
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(dir);
  return buildNewspaperRuntimePlan(tables,snapshotHash);
}

export async function writeNewspaperRuntimeToEmulator(plan,db){
  assertEmulatorOnly(process.env,DEMO);
  if(!plan?.summary?.planValid)throw new Error('Newspaper runtime plan blocked before writes');
  const root=db.collection(ROOT).doc(plan.snapshotId);
  await root.set({status:'incomplete',formatVersion:1,private:true});
  let written=1,batch=db.batch(),pending=0,size=0;
  const flush=async()=>{if(!pending)return;await batch.commit();written+=pending;batch=db.batch();pending=0;size=0;};
  const add=async(ref,data)=>{
    const b=bytes(data);
    if(pending>0&&(pending>=100||size+b>4*1024*1024))await flush();
    batch.set(ref,data);pending++;size+=b;};
  for(const [type,items] of Object.entries(plan.docs))for(const item of items)
    await add(root.collection(type).doc(item.id),item.payload);
  await add(root.collection('meta').doc('counters'),{revisionSeq:plan.revisionSeq});
  await flush();
  await root.set({status:'complete',formatVersion:1,private:true,counts:plan.summary.stagedCounts});
  written++;
  return {staged:true,stagedCounts:plan.summary.stagedCounts,emulatorWrites:written,firebaseCloudWrites:0};
}

async function main(args){
  if(args.length<2||args[0]!=='--normalized')throw Error('Use --normalized DIR [--execute-emulator]');
  const execute=args.length===3&&args[2]==='--execute-emulator';
  if(args.length!==2&&!execute)throw Error('Invalid CLI args');
  const plan=await loadNewspaperRuntimePlan(args[1]);
  if(!execute){process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');return;}
  assertEmulatorOnly(process.env,DEMO);
  if(!plan.summary.planValid)throw Error('Invalid newspaper runtime plan');
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:DEMO},'cormyr-newspaper-runtime-stage');
  try{process.stdout.write(JSON.stringify(await writeNewspaperRuntimeToEmulator(plan,getFirestore(app)),null,2)+'\n');}
  finally{await deleteApp(app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{console.error('Newspaper runtime staging blocked. No source data displayed.');process.exitCode=1;});
}
