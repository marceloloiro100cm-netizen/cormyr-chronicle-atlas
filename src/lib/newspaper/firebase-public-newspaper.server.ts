/* eslint-disable @typescript-eslint/no-explicit-any -- limite do Firebase Admin. */
import {createHash} from 'node:crypto';
import {deletedNewspaperIds} from '../../../scripts/firebase/newspaper-deleted.mjs';
import {publishedImageSrc} from './firebase-published-image.server';
import {publicStaffPhotoSrc} from './firebase-public-staff-photo.server';
import {releaseDueNewspapers} from './firebase-scheduled-publication.server';

/**
 * Leitura PÚBLICA de A Folha Sem Selo (site aberto, sem conta).
 *
 * Usa exatamente a mesma lista aprovada que os leitores autenticados recebem
 * (listNewspaper do serviço somente leitura): edições históricas publicadas
 * ou arquivadas do estágio revisado e edições da nuvem publicadas pelo
 * runtime aprovado. Rascunhos, cancelamentos, encomendas, missivas e dados
 * de Casas nunca saem daqui. Imagens privadas (imagePath) são removidas.
 *
 * Cada aparelho que lê uma edição conta uma vez para o Editor-Chefe
 * (identificador aleatório guardado no navegador do visitante).
 */
export class PublicNewspaperError extends Error{
 constructor(readonly code:string,readonly status:number){super(code);}
}
const fail=(code:string,status=400):never=>{throw new PublicNewspaperError(code,status);};
const SAFE_ID=/^[A-Za-z0-9_-]{1,128}$/;
const VISITOR=/^[a-f0-9]{32,64}$/;
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
type Row=Record<string,any>;

async function stageReady(db:any,snapshotId:string){
 const snap=await db.collection('migrationNewspaperRuntimeStage').doc(snapshotId).get();
 if(!snap.exists||snap.data()?.status!=='complete'||snap.data()?.private!==true)
  fail('newspaper_stage_not_ready',503);
}
async function cloudRoot(db:any,snapshotId:string){
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 const doc=await root.get();
 const v=doc.data();
 if(!doc.exists||v?.status!=='active'||v.private!==true||v.sourceSnapshotId!==snapshotId||
    v.sourceSnapshotReconciled!==true||v.applicationEnabled!==true||
    v.newspaperWriteApproved!==true||v.newspaperSequenceReconciled!==true)return null;
 return root;
}
const publishedRow=(v:Row|undefined)=>Boolean(v)&&['published','archived'].includes(v!['state'])&&
 typeof v!['id']==='string'&&typeof v!['title']==='string'&&Number.isInteger(v!['editionNo'])&&
 typeof v!['publishedAt']==='string'&&v!['cancelledAt']==null;
const cloudRow=(v:Row|undefined,snapshotId:string)=>publishedRow(v)&&v!['source']==='firebase-cloud'&&
 v!['sourceSnapshotId']===snapshotId&&String(v!['id']).startsWith('cloud-');

/** Só o que é seguro mostrar a um visitante: texto e imagens públicas do site. */
export function publicBlocks(blocks:unknown,editionId?:string):Row[]{
 if(!Array.isArray(blocks))return [];
 return blocks.slice(0,80).map((b:Row,i)=>({b,i}))
 .filter(({b})=>b&&typeof b==='object'&&!Array.isArray(b))
 .map(({b,i})=>{
  const {imagePath:_private,...rest}=b;
  const staticSrc=typeof rest['imageSrc']==='string'&&
   /^\/(?:newspaper|cormyr|assets|maps)\/[A-Za-z0-9._/%-]+$/.test(rest['imageSrc'])
    ?rest['imageSrc']:undefined;
  const historicSrc=editionId&&
   (b['type']==='image'||b['kind']==='image')&&typeof b['imagePath']==='string'
    ?publishedImageSrc(editionId,i):null;
  const out:Row={...rest};
  if(staticSrc||historicSrc)out['imageSrc']=staticSrc??historicSrc;
  else delete out['imageSrc'];
  return out;
 });
}

export async function listPublicNewspapers(db:any,snapshotId:string,options:{releaseDue?:boolean}={}){
 await stageReady(db,snapshotId);
 // The editorial read-only archive never triggers a publication transaction.
 if(options.releaseDue!==false)
  try{await releaseDueNewspapers(db,snapshotId);}catch{/* archive remains readable */}
 const snap=await db.collection('migrationNewspaperRuntimeStage').doc(snapshotId).collection('editions').get();
 if(snap.size>100)fail('newspaper_response_too_large',503);
 const root=await cloudRoot(db,snapshotId);
 const removed=await deletedNewspaperIds(db,snapshotId);
 let cloud:Row[]=[];
 if(root){
  const c=await root.collection('publishedNewspapers').get();
  if(c.size>100)fail('newspaper_response_too_large',503);
  cloud=c.docs.map((d:any)=>d.data()).filter((v:Row)=>cloudRow(v,snapshotId));
 }
 const items=[...snap.docs.map((d:any)=>d.data()).filter(publishedRow),...cloud]
  .filter(v=>!removed.has(v['id']))
  .sort((a,b)=>b['editionNo']-a['editionNo'])
  .map(v=>({id:v['id'],title:v['title'],subtitle:v['subtitle']??'',editionNo:v['editionNo'],
   publishedAt:v['publishedAt'],campaignDate:v['campaignDate']??null}));
 return {items};
}

export async function getPublicNewspaper(db:any,snapshotId:string,editionId:unknown){
 if(typeof editionId!=='string'||!SAFE_ID.test(editionId))fail('invalid_edition');
 const id=editionId as string;
 await stageReady(db,snapshotId);
 try{await releaseDueNewspapers(db,snapshotId);}catch{/* published archive remains readable */}
 const cloudId=id.startsWith('cloud-');
 const root=cloudId?await cloudRoot(db,snapshotId):null;
 if(cloudId&&!root)fail('edition_unavailable',404);
 const snap=cloudId?await root.collection('publishedNewspapers').doc(id).get()
  :await db.collection('migrationNewspaperRuntimeStage').doc(snapshotId).collection('editions').doc(id).get();
 const v:Row|undefined=snap.exists?snap.data():undefined;
 if(!v||!(cloudId?cloudRow(v,snapshotId):publishedRow(v))||v['id']!==id||
    (await deletedNewspaperIds(db,snapshotId)).has(id))
  throw new PublicNewspaperError('edition_unavailable',404);
 const result={id,title:v['title'],subtitle:v['subtitle']??'',editionNo:v['editionNo'],
  template:v['template']??'classico',font_style:v['font_style']??'classico',
  blocks:publicBlocks(v['blocks'],id),
  pdfSrc:cloudId&&typeof v['pdfPath']==='string'?
   '/api/public/newspaper-file?edition='+encodeURIComponent(id):null,
  publishedAt:v['publishedAt'],campaignDate:v['campaignDate']??null,
  version:cloudId?v['version']??1:v['publicationRevision']??1};
 if(Buffer.byteLength(JSON.stringify(result),'utf8')>700_000)fail('edition_response_too_large',503);
 return result;
}

/** Equipe da Redação para o leitor público: só nome, especialidade e apresentação. */
export function publicStaff(rows:Row[]){
 return rows.filter(r=>r&&typeof r['id']==='string'&&typeof r['name']==='string')
  .map(r=>({id:r['id'],name:String(r['name']).slice(0,120),specialty:String(r['specialty']??'').slice(0,120),
   bio:String(r['bio']??'').slice(0,3000),sort_order:Number.isSafeInteger(r['sort_order'])?r['sort_order']:0,
   photo_url:typeof r['photo_path']==='string'&&r['photo_path'].length>0?publicStaffPhotoSrc(r['id']):null}))
  .sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name,'pt-BR')).slice(0,200);
}

/** Conta a leitura de um visitante (uma vez por aparelho e edição). */
export async function recordPublicNewspaperRead(db:any,snapshotId:string,editionId:unknown,visitor:unknown){
 if(typeof visitor!=='string'||!VISITOR.test(visitor))fail('invalid_visitor');
 // A edição precisa estar publicada e liberada ao público.
 const edition=await getPublicNewspaper(db,snapshotId,editionId);
 const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);
 const counter=runtime.collection('newspaperPublicReads').doc(digest('edition:'+edition.id));
 const seen=runtime.collection('newspaperPublicReadVisitors').doc(digest('read:'+edition.id+':'+visitor));
 return db.runTransaction(async(tx:any)=>{
  const [seenDoc,counterDoc]=await Promise.all([tx.get(seen),tx.get(counter)]);
  const count=counterDoc.exists&&Number.isSafeInteger(counterDoc.data()?.count)?counterDoc.data().count:0;
  if(seenDoc.exists)return {counted:false};
  const now=new Date().toISOString();
  tx.create(seen,{editionId:edition.id,at:now});
  tx.set(counter,{editionId:edition.id,count:count+1,updatedAt:now});
  return {counted:true};
 });
}

/** Totais por edição, só para o Editor-Chefe e o Narrador (via workspace autenticado). */
export async function readPublicNewspaperReadCounts(db:any,snapshotId:string):Promise<{editionId:string;count:number}[]>{
 const snap=await db.collection('campaignCloudRuntime').doc(snapshotId)
  .collection('newspaperPublicReads').limit(501).get();
 if(snap.docs.length>500)fail('public_reads_too_large',503);
 return snap.docs.map((d:any)=>d.data()).filter((v:Row)=>typeof v?.['editionId']==='string'&&
  Number.isSafeInteger(v?.['count'])&&v['count']>=0).map((v:Row)=>({editionId:v['editionId'],count:v['count']}));
}
