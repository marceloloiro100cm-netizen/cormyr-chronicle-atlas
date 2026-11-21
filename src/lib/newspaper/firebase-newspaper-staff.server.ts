/* eslint-disable @typescript-eslint/no-explicit-any -- limite do Firebase Admin. */
import {createHash,randomUUID} from 'node:crypto';

/**
 * Redação (corpo de funcionários) da Folha no Firebase.
 *
 * O acervo importado continua imutável. A primeira alteração do Editor-Chefe
 * grava uma cópia operacional versionada em
 * campaignCloudRuntime/{snapshot}/newspaperEditorial/staff, que passa a ser
 * a lista lida por todos. Cada gravação fica auditada. O upload de fotos
 * usa uma rota própria autenticada e um caminho gerado no servidor.
 */
export class NewspaperStaffError extends Error{
 constructor(readonly code:string,readonly status:number){super(code);}
}
const fail=(code:string,status=400):never=>{throw new NewspaperStaffError(code,status);};
type Row=Record<string,any>;
const MAX_STAFF=200;
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const clean=(value:unknown,max:number)=>typeof value==='string'?value.trim():fail('invalid_staff',400);

const staffDoc=(db:any,snapshotId:string)=>db.collection('campaignCloudRuntime').doc(snapshotId)
 .collection('newspaperEditorial').doc('staff');

function normalize(list:Row[]):Row[]{
 return list.filter(r=>r&&typeof r['id']==='string').map(r=>({
  id:r['id'],name:String(r['name']??''),specialty:String(r['specialty']??''),
  bio:String(r['bio']??''),photo_path:typeof r['photo_path']==='string'?r['photo_path']:null,
  sort_order:Number.isSafeInteger(r['sort_order'])?r['sort_order']:0,
  created_at:String(r['created_at']??''),updated_at:String(r['updated_at']??''),
 }));
}

/** Lista operacional, quando já existe; senão null (vale o acervo importado). */
export async function readNewspaperStaffOverlay(db:any,snapshotId:string):Promise<Row[]|null>{
 const doc=await staffDoc(db,snapshotId).get();
 if(!doc.exists)return null;
 const rows=doc.data()?.rows;
 if(!Array.isArray(rows)||rows.length>MAX_STAFF)throw new NewspaperStaffError('staff_overlay_invalid',503);
 return normalize(rows);
}

export type StaffOperation=
 {action:'save';id?:string;name:string;specialty:string;bio:string;photoPath:string|null;sortOrder?:number}|
 {action:'reorder';ids:string[]}|
 {action:'delete';id:string};

export function parseStaffOperation(name:string,args:Row):StaffOperation{
 if(!args||typeof args!=='object'||Array.isArray(args))fail('invalid_staff');
 if(name==='newspaper_staff_reorder'){
  const ids=args['p_ids'];
  if(!Array.isArray(ids)||ids.length<1||ids.length>MAX_STAFF||
     ids.some(id=>typeof id!=='string'||!ID.test(id))||new Set(ids).size!==ids.length)
   fail('invalid_staff_order');
  return {action:'reorder',ids:ids as string[]};
 }
 if(name==='newspaper_staff_delete'){
  const id=args['p_id'];
  if(typeof id!=='string'||!ID.test(id))fail('invalid_staff');
  return {action:'delete',id:id as string};
 }
 if(name==='newspaper_staff_save'){
  const id=args['p_id'];
  if(id!==undefined&&id!==null&&(typeof id!=='string'||!ID.test(id)))fail('invalid_staff');
  const nameValue=clean(args['p_name'],120),specialty=clean(args['p_specialty'],120),bio=clean(args['p_bio'],3000);
  if(!nameValue||nameValue.length>120||specialty.length>120||bio.length>3000)fail('invalid_staff');
  const photo=args['p_photo_path'];
  if(photo!==null&&photo!==undefined&&(typeof photo!=='string'||photo.length>300))fail('invalid_staff');
  const sort=args['p_sort_order'];
  if(sort!==undefined&&sort!==null&&(!Number.isSafeInteger(sort)||sort<0||sort>10_000))fail('invalid_staff');
  return {action:'save',...(typeof id==='string'?{id}:{}),name:nameValue,specialty,bio,
   photoPath:typeof photo==='string'?photo:null,...(typeof sort==='number'?{sortOrder:sort}:{})};
 }
 return fail('invalid_staff');
}

/** Aplica a operação sobre a lista atual (pura, testável). */
export function applyStaffOperation(current:Row[],op:StaffOperation,now:string,newId:()=>string=()=>randomUUID()):Row[]{
 const list=normalize(current);
 if(op.action==='reorder'){
  const ids=new Set(list.map(r=>r['id']));
  if(op.ids.length!==list.length||op.ids.some(id=>!ids.has(id)))fail('staff_order_conflict',409);
  return op.ids.map((id,index)=>({...list.find(r=>r['id']===id)!,sort_order:index}));
 }
 if(op.action==='delete'){
  if(!list.some(r=>r['id']===op.id))fail('staff_not_found',404);
  return list.filter(r=>r['id']!==op.id);
 }
 if(op.id){
  const old=list.find(r=>r['id']===op.id);
  if(!old)fail('staff_not_found',404);
  // Foto: só mantém a que já existia (novos envios dependem do Storage homologado).
  if(op.photoPath!==null&&op.photoPath!==old!['photo_path'])fail('staff_photo_not_supported',501);
  return list.map(r=>r['id']===op.id?{...r,name:op.name,specialty:op.specialty,bio:op.bio,
   photo_path:op.photoPath,updated_at:now}:r);
 }
 if(op.photoPath!==null)fail('staff_photo_not_supported',501);
 if(list.length>=MAX_STAFF)fail('staff_too_large',413);
 const sort=op.sortOrder??list.reduce((m,r)=>Math.max(m,(r['sort_order']??0)+1),0);
 return [...list,{id:newId(),name:op.name,specialty:op.specialty,bio:op.bio,
  photo_path:null,sort_order:sort,created_at:now,updated_at:now}];
}

/** Grava a operação em transação, partindo da cópia operacional ou do acervo importado. */
export async function commitNewspaperStaff({db,snapshotId,actorUid,imported,op}:{
 db:any;snapshotId:string;actorUid:string;imported:Row[];op:StaffOperation;
}):Promise<Row[]>{
 const ref=staffDoc(db,snapshotId);
 const audits=db.collection('campaignCloudRuntime').doc(snapshotId).collection('newspaperStaffAudits');
 return db.runTransaction(async(tx:any)=>{
  const prev=await tx.get(ref);
  const before=prev.exists&&Array.isArray(prev.data()?.rows)?prev.data().rows:imported;
  const version=(prev.exists&&Number.isSafeInteger(prev.data()?.version)?prev.data().version:0)+1;
  const now=new Date().toISOString();
  const rows=applyStaffOperation(before,op,now);
  tx.set(ref,{rows,version,updatedBy:actorUid,updatedAt:now,sourceSnapshotId:snapshotId});
  tx.create(audits.doc(createHash('sha256').update('staff:'+version+':'+actorUid+':'+now).digest('hex')),
   {action:'staff_'+op.action,actorUid,version,occurredAt:now});
  return rows;
 });
}

/**
 * Só a rota autenticada de fotografias pode invocar esta operação. A RPC
 * genérica da Redação continua incapaz de escolher caminhos de arquivos.
 * Um requestId estável evita duplicar funcionário se a resposta HTTP cair.
 */
export async function commitNewspaperStaffPhoto({db,snapshotId,actorUid,imported,input}:{
 db:any;snapshotId:string;actorUid:string;imported:Row[];
 input:{id?:string;requestId:string;photoPath:string;name:string;
  specialty:string;bio:string;sortOrder?:number};
}):Promise<{id:string;rows:Row[]}>{
 const id=input.id??input.requestId;
 if(!ID.test(id)||!ID.test(input.requestId)||
    !/^newspaper-staff\/[a-f0-9]{64}\/[A-Za-z0-9_-]{1,80}\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/.test(input.photoPath)||
    !input.photoPath.startsWith(`newspaper-staff/${snapshotId}/${id}/${input.requestId}.`))
  fail('invalid_staff_photo_path');
 const op=parseStaffOperation('newspaper_staff_save',{
  p_id:input.id??null,p_name:input.name,p_specialty:input.specialty,
  p_bio:input.bio,p_photo_path:null,p_sort_order:input.sortOrder??null,
 });
 const ref=staffDoc(db,snapshotId);
 const audits=db.collection('campaignCloudRuntime').doc(snapshotId).collection('newspaperStaffAudits');
 return db.runTransaction(async(tx:any)=>{
  const prev=await tx.get(ref);
  const before=normalize(prev.exists&&Array.isArray(prev.data()?.rows)?prev.data().rows:imported);
  const old=before.find(r=>r['id']===id);
  if(!input.id&&old){
   // Retentativa de criação: somente a mesma foto e o mesmo conteúdo.
   if(old['photo_path']!==input.photoPath||old['name']!==op.name||
      old['specialty']!==op.specialty||old['bio']!==op.bio)
    fail('staff_photo_conflict',409);
   return {id,rows:before};
  }
  if(input.id&&!old)fail('staff_not_found',404);
  if(!input.id&&before.length>=MAX_STAFF)fail('staff_too_large',413);
  const now=new Date().toISOString();
  const next=old?
   before.map(r=>r['id']===id?{...r,name:op.name,specialty:op.specialty,
    bio:op.bio,photo_path:input.photoPath,updated_at:now}:r):
   [...before,{id,name:op.name,specialty:op.specialty,bio:op.bio,
    photo_path:input.photoPath,
    sort_order:op.sortOrder??before.reduce((max,r)=>Math.max(max,(r['sort_order']??0)+1),0),
    created_at:now,updated_at:now}];
  const version=(prev.exists&&Number.isSafeInteger(prev.data()?.version)?prev.data().version:0)+1;
  tx.set(ref,{rows:next,version,updatedBy:actorUid,updatedAt:now,sourceSnapshotId:snapshotId});
  tx.create(audits.doc(createHash('sha256').update(
   'staff_photo:'+version+':'+actorUid+':'+input.requestId).digest('hex')),
   {action:old?'staff_photo_update':'staff_photo_create',actorUid,version,
    staffId:id,occurredAt:now});
  return {id,rows:next};
 });
}
