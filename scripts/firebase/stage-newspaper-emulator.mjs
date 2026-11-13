/**
 * Read-only A Folha Sem Selo / Cormyr newspaper migration to Firestore Emulator.
 * Only explicitly published/archived editions can be read by players.
 * Drafts/cancelled editions are visible to authorized editor and narrator.
 * Full original tables are preserved separately in a deny-all archive.
 * Never connects to production nor prints contents of newspapers.
 */
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  assertEmulatorOnly,buildPrivateArchivePlan,loadVerifiedPrivateTables,
} from './stage-firestore-emulator.mjs';
import {validateHarptosDate} from './stage-temporal-emulator.mjs';

const ROOT='migrationNewspaperStage';
const DEMO='demo-cormyr-migration';
const TABLES=[
  'public.campaign_newspapers',
  'public.campaign_newspaper_revisions',
  'public.campaign_newspaper_reads',
  'public.campaign_newspaper_commissions',
  'public.campaign_newspaper_staff',
  'public.campaign_newspaper_story_models',
  'public.campaign_newspaper_engravings',
  'public.campaign_newspaper_settings',
];
const STATES=new Set(['draft','published','archived','cancelled']);
const TEMPLATES=new Set(['classico','guerra','gazeta']);
const FONTS=new Set(['classico','editorial','condensado','moderno','serifado']);
const PUBLISHED=new Set(['published','archived']);
const MAX_DOC=850*1024;
const MAX_BATCH_BYTES=4*1024*1024;
const DIGEST=s=>createHash('sha256').update(s).digest('hex');
const entryId=(table,id)=>DIGEST(table+':'+id);
const integer=(s,min,max)=>{
  if(typeof s!=='string'||!/^\d+$/.test(s))return null;
  const n=Number(s);
  return Number.isSafeInteger(n)&&n>=min&&n<=max?n:null;
};
const dateString=s=>{
  if(typeof s!=='string')return false;
  const regular=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if(regular){
    const y=Number(regular[1]),m=Number(regular[2])-1,d=Number(regular[3]);
    return validateHarptosDate(y,m,d,null);
  }
  const festival=/^(\d{4})-F-(midwinter|greengrass|midsummer|shieldmeet|highharvestide|feast-moon)$/.exec(s);
  if(!festival)return false;
  const month={
    midwinter:0,greengrass:3,midsummer:6,shieldmeet:6,
    highharvestide:8,'feast-moon':10,
  }[festival[2]];
  return validateHarptosDate(Number(festival[1]),month,30,festival[2]);
};
const optionalText=v=>v==null?null:typeof v==='string'?v:undefined;
const underSize=o=>Buffer.byteLength(JSON.stringify(o),'utf8')+8192<=MAX_DOC;

/**
 * No import with missing source tables. Data model covers only edition content
 * and settings; revisions, reads, commissions, staff, templates and engravings
 * remain lossless private archives until separately authorized.
 */
export function planNewspaperEmulator(tables,snapshotId){
  if(!Array.isArray(tables)||!/^[0-9a-f]{64}$/.test(snapshotId))
    throw Error('Invalid private verified newspaper snapshot');
  const byTable=new Map(tables.map(x=>[x.table,x]));
  const missingTables=TABLES.filter(t=>!byTable.has(t));
  const selected=TABLES.filter(t=>byTable.has(t)).map(t=>byTable.get(t));
  const archive=buildPrivateArchivePlan(selected,snapshotId);
  const source=byTable.get('public.campaign_newspapers')?.rows||[];
  const settingsSource=byTable.get('public.campaign_newspaper_settings')?.rows||[];
  const issues={
    duplicateEditionIds:0,invalidEdition:0,oversizedEdition:0,
    invalidSettings:0,oversizedSettings:0,incompleteEditionCoverage:0,
  };
  const published=[],privateEditions=[],settings=[];
  const seen=new Set(),editionNumbers=new Set();
  for(const row of source){
    if(typeof row.id!=='string'||!row.id||seen.has(row.id)){
      issues.duplicateEditionIds++;continue;
    }
    seen.add(row.id);
    let blocks;
    try{blocks=JSON.parse(row.blocks);}catch{issues.invalidEdition++;continue;}
    const editionNo=integer(row.edition_no,1,Number.MAX_SAFE_INTEGER);
    const version=integer(row.version,1,2147483647);
    const revision=integer(row.publication_revision,0,2147483647);
    const state=row.state,template=row.template,font=row.font_style;
    const title=row.title,subtitle=row.subtitle;
    const pdf=optionalText(row.pdf_path);
    if(!editionNo||editionNumbers.has(editionNo)||
       version==null||revision==null||
       !STATES.has(state)||!TEMPLATES.has(template)||!FONTS.has(font)||
       typeof title!=='string'||!title.trim()||title.length>180||
       typeof subtitle!=='string'||subtitle.length>240||
       !dateString(row.campaign_date)||
       !Array.isArray(blocks)||blocks.length>80 ||
       pdf===undefined||(pdf!==null&&(
         pdf.length>300 || !pdf.startsWith(row.id+'/')||!pdf.endsWith('.pdf')
       ))){
      issues.invalidEdition++;continue;
    }
    editionNumbers.add(editionNo);
    const payload={
      sourceId:row.id,editionNo,version,publicationRevision:revision,
      campaignDate:row.campaign_date,title,subtitle,template,
      fontStyle:font,state,blocks,pdfPath:pdf,
      publishedAt:optionalText(row.published_at),
      updatedAt:optionalText(row.updated_at),
      migratedReadOnly:true,
    };
    if(!underSize(payload)){issues.oversizedEdition++;continue;}
    const doc={id:entryId('newspaper',row.id),payload};
    (PUBLISHED.has(state)?published:privateEditions).push(doc);
  }
  for(const row of settingsSource){
    const rawId=row.id;
    let bad=false;
    if(settingsSource.length!==1||rawId!=='t')bad=true;
    const title=row.title,subtitle=row.subtitle;
    if(typeof title!=='string'||!title.trim()||title.length>180||
       typeof subtitle!=='string'||subtitle.length>240||
       !TEMPLATES.has(row.template)||!FONTS.has(row.font_style))bad=true;
    if(bad){issues.invalidSettings++;continue;}
    const payload={
      title,subtitle,template:row.template,fontStyle:row.font_style,
      migratedReadOnly:true,
    };
    if(!underSize(payload)){issues.oversizedSettings++;continue;}
    settings.push({id:'current',payload});
  }
  if(published.length+privateEditions.length!==source.length)
    issues.incompleteEditionCoverage++;
  const summary={
    scope:'private-newspaper-firestore-emulator-only',
    sourceTables:TABLES.length,
    actualSourceTables:selected.length,
    missingTables,
    sourceEditionRows:source.length,
    publishedEditions:published.length,
    privateEditions:privateEditions.length,
    settingsRows:settingsSource.length,
    archivedSourceRows:archive.summary.archivedPublicRows,
    archivedSourceTables:archive.summary.archivedPublicTables,
    issues:{...issues,archive:archive.summary.issues},
    planValid:missingTables.length===0&&
      Object.values(issues).every(v=>v===0)&&
      archive.summary.emulatorPlanValid,
    firebaseCloudWrites:0,
    readyForCloudImport:false,
    warning:'Read-only newspaper projection. Storage asset authorization, publishing, commissions and editorial workflow still require server-side implementation.',
  };
  return {snapshotId,published,privateEditions,settings,archive,summary};
}

export async function loadNewspaperEmulatorPlan(dir){
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(dir);
  return planNewspaperEmulator(tables,snapshotHash);
}

export async function stageNewspaperEmulator(plan,db,env=process.env){
  assertEmulatorOnly(env,DEMO);
  if(!plan?.summary?.planValid)throw Error('Newspaper staging blocked by private source audit');
  const root=db.collection(ROOT).doc(plan.snapshotId);
  await root.set({status:'incomplete',private:true,version:1});
  let written=1,pending=0,bytes=0,batch=db.batch();
  async function flush(){
    if(!pending)return;
    await batch.commit();written+=pending;pending=0;bytes=0;batch=db.batch();
  }
  async function enqueue(ref,data){
    const size=Buffer.byteLength(JSON.stringify(data),'utf8');
    if(size+8192>MAX_DOC)throw Error('Newspaper document exceeds safe Firestore limit');
    if(pending&&(pending>=100||bytes+size>MAX_BATCH_BYTES))await flush();
    batch.set(ref,data);pending++;bytes+=size;
  }
  for(const [name,docs] of [
    ['published',plan.published],['privateEditions',plan.privateEditions],
    ['settings',plan.settings],
  ]){
    for(const doc of docs)await enqueue(root.collection(name).doc(doc.id),doc.payload);
  }
  for(const table of plan.archive.tableDocs){
    await enqueue(root.collection('archive').doc(table.tableDigest),table.payload);
  }
  for(const row of plan.archive.plannedRows){
    const parent=root.collection('archive').doc(row.tableDigest).collection('rows').doc(row.docId);
    await enqueue(parent,row.payload);
    for(const chunk of row.chunks||[])await enqueue(
      parent.collection('chunks').doc(chunk.docId),chunk.payload);
  }
  await flush();
  await root.set({
    status:'complete',private:true,version:1,
    published:plan.published.length,privateEditions:plan.privateEditions.length,
    archivedSourceRows:plan.summary.archivedSourceRows,
  });written++;
  return {
    staged:true,emulatorWrites:written,
    publishedEditions:plan.published.length,
    privateEditions:plan.privateEditions.length,
    archivedSourceRows:plan.summary.archivedSourceRows,
    firebaseCloudWrites:0,readyForCloudImport:false,
  };
}
async function main(args){
  if((args.length!==2&&args.length!==3)||args[0]!=='--normalized'||!args[1]||
     (args.length===3&&args[2]!=='--execute-emulator'))
    throw Error('Use --normalized PRIVATE_DIR [--execute-emulator]');
  const plan=await loadNewspaperEmulatorPlan(args[1]);
  if(args.length===2){
    process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');
    return;
  }
  assertEmulatorOnly(process.env,DEMO);
  if(!plan.summary.planValid)throw Error('Private newspaper staging plan invalid');
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:DEMO},'cormyr-newspaper-emulator');
  try{
    const result=await stageNewspaperEmulator(plan,getFirestore(app));
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }finally{
    await deleteApp(app);
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{
    console.error('Private newspaper staging blocked or failed; no source values displayed.');
    process.exitCode=1;
  });
}
