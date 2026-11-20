import {createHash} from 'node:crypto';

/**
 * Edições excluídas do Arquivo pelo Editor-Chefe no Firebase (20/11/2026).
 * O acervo importado e as edições da nuvem continuam guardados; a exclusão é
 * uma marca auditada que tira a edição de todas as listas (Redação, leitores
 * autenticados e site aberto).
 */
export const deletedEditionsCollection=(db,snapshotId)=>
  db.collection('campaignCloudRuntime').doc(snapshotId).collection('newspaperDeletedEditions');
export const deletedEditionDocId=id=>createHash('sha256').update('newspaper-deleted:'+id).digest('hex');

export async function deletedNewspaperIds(db,snapshotId){
  let snap;
  // Sem a coleção (ou em bases de teste simplificadas) nada foi excluído.
  try{snap=await deletedEditionsCollection(db,snapshotId).limit(501).get();}
  catch{return new Set();}
  const docs=Array.isArray(snap?.docs)?snap.docs:[];
  return new Set(docs.map(d=>d.data()).filter(v=>v&&typeof v.id==='string'&&v.deleted!==false).map(v=>v.id));
}

export async function markNewspaperDeleted(db,snapshotId,{id,actorUid,draftOnly=false,state=null}){
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw Object.assign(Error('invalid_edition'),{status:400});
  if(draftOnly&&state!=='draft')throw Object.assign(Error('not_a_draft'),{status:409});
  const now=new Date().toISOString();
  const ref=deletedEditionsCollection(db,snapshotId).doc(deletedEditionDocId(id));
  await ref.set({id,deleted:true,deletedBy:actorUid,deletedAt:now,previousState:state,sourceSnapshotId:snapshotId});
  return {id,deleted:true};
}
