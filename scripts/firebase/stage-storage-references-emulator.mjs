/**
 * Stages the Storage reference index in Firestore Emulator ONLY: for every
 * image path, which letters, replies and records embed it, plus the reviewed
 * public gallery paths. Only ids and aggregate counts are stored or printed.
 * Usage: node stage-storage-references-emulator.mjs --normalized DIR [--execute-emulator]
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertEmulatorOnly,loadVerifiedPrivateTables} from './stage-firestore-emulator.mjs';
import {buildReferenceIndex,pathDocId} from './storage-references-core.mjs';

const DEMO='demo-cormyr-migration';
export const ROOT='migrationStorageStage';
const T={letters:'public.campaign_letters',replies:'public.letter_replies',
  records:'public.campaign_records',catalog:'public.house_catalog'};

export function buildStoragePlan(tables,snapshotId){
  if(!Array.isArray(tables)||!/^[a-f0-9]{64}$/.test(snapshotId))throw new Error('Invalid verified source data');
  const by=new Map(tables.map(t=>[t.table,t]));
  const rows=n=>by.get(n)?.rows||[];
  const missingTables=[T.letters,T.records].filter(n=>!by.has(n));
  const idx=buildReferenceIndex({letters:rows(T.letters),replies:rows(T.replies),
    records:rows(T.records),catalog:rows(T.catalog)});
  const refs=[...idx.refs].map(([path,v])=>({id:pathDocId(path),payload:{path,...v}}));
  const gallery=[...idx.gallery].map(path=>({id:pathDocId(path),payload:{path}}));
  const summary={referencedPaths:refs.length,galleryPaths:gallery.length,
    invalidGallery:idx.invalidGallery,missingTables:missingTables.length,
    planValid:missingTables.length===0&&idx.invalidGallery===0};
  return {snapshotId,docs:{refs,gallery},summary};
}

export async function writeStorageToEmulator(plan,db){
  assertEmulatorOnly(process.env,DEMO);
  if(!plan?.summary?.planValid)throw new Error('Storage plan blocked before writes');
  const root=db.collection(ROOT).doc(plan.snapshotId);
  await root.set({status:'incomplete',formatVersion:1,private:true});
  let written=1,batch=db.batch(),pending=0;
  const flush=async()=>{if(!pending)return;await batch.commit();written+=pending;batch=db.batch();pending=0;};
  for(const [type,items] of Object.entries(plan.docs))for(const item of items){
    if(pending>=100)await flush();
    batch.set(root.collection(type).doc(item.id),item.payload);pending++;
  }
  await flush();
  await root.set({status:'complete',formatVersion:1,private:true,...plan.summary});
  return {written,...plan.summary};
}

export async function main(args){
  assertEmulatorOnly(process.env,DEMO);
  const i=args.indexOf('--normalized'),dir=i>=0?args[i+1]:null;
  if(!dir)throw new Error('Missing --normalized');
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(dir);
  const plan=buildStoragePlan(tables,snapshotHash);
  if(!args.includes('--execute-emulator')){process.stdout.write(JSON.stringify({dryRun:true,...plan.summary},null,2)+'\n');return;}
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:DEMO},'cormyr-storage-stage');
  try{process.stdout.write(JSON.stringify(await writeStorageToEmulator(plan,getFirestore(app)),null,2)+'\n');}
  finally{await deleteApp(app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{console.error('Storage reference staging blocked. No source data displayed.');process.exitCode=1;});
}
