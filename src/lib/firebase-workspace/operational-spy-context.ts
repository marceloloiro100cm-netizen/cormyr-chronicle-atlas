/* eslint-disable @typescript-eslint/no-explicit-any -- acesso ao Firestore Admin no limite do servidor. */
/** Contexto transacional compartilhado pelos itens 7b e 7c. */
import {createHash} from 'node:crypto';
import {projectSpyOverlay,SPY_OVERLAY_COLLECTIONS}
 from '../../../scripts/firebase/workspace-spy-overlay.mjs';

export const spyDigest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const spyUuid=(v:unknown):v is string=>typeof v==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const spySafe=(v:unknown):v is string=>typeof v==='string'&&
 v.length>0&&v.length<=160&&!/[\/\u0000-\u001f\u007f]/.test(v);
export class SpyOperationError extends Error{
 constructor(readonly code:string,readonly status:number=400){super(code);}
}
export const spyFail=(code:string,status=400):never=>{
 throw new SpyOperationError(code,status);
};
export const asSpyError=(error:unknown):never=>{
 if(error instanceof SpyOperationError)throw error;
 const code=(error as {code?:string})?.code;
 if(code==='denied')spyFail('access_denied',403);
 if(code==='conflict')spyFail('spy_version_conflict',409);
 if(code==='invalid')spyFail('spy_operation_invalid',400);
 throw error;
};
export const spyActor=(scope:{uid:string;profile:string;memberHouseIds:string[];editHouseIds:string[]})=>({
 uid:scope.uid,role:scope.profile,
 memberHouseIds:new Set(scope.memberHouseIds),
 editHouseIds:new Set(scope.editHouseIds),
});
export function spyDoc(root:any,collection:string,type:string,key:string){
 if(!spySafe(key))spyFail('spy_document_invalid');
 return root.collection(collection).doc(spyDigest(type+':'+key));
}
export function setSpyPayload(tx:any,root:any,collection:string,type:string,key:string,
 payload:unknown,snapshotId:string){
 tx.set(spyDoc(root,collection,type,key),
  {key,sourceSnapshotId:snapshotId,payload});
}
/** Consultas e verificação da raiz ocorrem antes de qualquer gravação. */
export async function readSpyTx({tx,root,snapshotId,source,calendar,write=true}:{
 tx:any;root:any;snapshotId:string;source:any;calendar:any;write?:boolean;
}){
 const entries=Object.entries(SPY_OVERLAY_COLLECTIONS) as
  [string,{type:string;limit:number}][];
 const [metaDoc,...snaps]=await Promise.all([
  tx.get(root),
  ...entries.map(([name,cfg])=>tx.get(root.collection(name).limit(cfg.limit+1))),
 ]);
 const meta=metaDoc.data();
 if(!metaDoc.exists||meta?.status!=='active'||meta?.private!==true||
    meta?.applicationEnabled!==true||meta?.sourceSnapshotId!==snapshotId||
    meta?.sourceSnapshotReconciled!==true||meta?.spyReadApproved!==true||
    write&&meta?.spyWriteApproved!==true||
    !Number.isSafeInteger(calendar?.version)||meta?.calendarVersion!==calendar.version)
  spyFail('spy_runtime_not_approved',503);
 const overlay:Record<string,unknown>={};
 for(let i=0;i<entries.length;i++){
  const [name,cfg]=entries[i]!,snap=snaps[i];
  if(!Array.isArray(snap?.docs)||snap.docs.length>cfg.limit)
   spyFail('spy_collection_over_limit',503);
  overlay[name]=snap.docs.map((doc:any)=>{
   const value=doc.data();
   if(!value||!spySafe(value.key)||value.sourceSnapshotId!==snapshotId||
      doc.id!==spyDigest(cfg.type+':'+value.key)||
      !value.payload||typeof value.payload!=='object'||Array.isArray(value.payload))
    spyFail('spy_document_integrity_failed',503);
   return value.payload;
  });
 }
 try{return {data:projectSpyOverlay(source,overlay),meta};}
 catch{return spyFail('spy_archive_overlay_conflict',503);}
}
export function spyRequestRef(root:any,namespace:string,uid:string,key:string){
 if(!spyUuid(key))spyFail('spy_request_invalid');
 return root.collection('spyRequests').doc(spyDigest(namespace+':'+uid+':'+key));
}
