import {createHash} from 'node:crypto';

/**
 * Marcas operacionais de exclusão de RASCUNHOS. Publicações são patrimônio
 * permanente do Jornal; marcas legadas sobre publicações não as ocultam.
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
  return new Set(docs.map(d=>d.data()).filter(v=>v&&typeof v.id==='string'&&v.deleted===true&&v.previousState==='draft'&&typeof v.deletedBy==='string').map(v=>v.id));
}

export async function markNewspaperDeleted(db,snapshotId,{id,actorUid,draftOnly=false,state=null}){
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw Object.assign(Error('invalid_edition'),{status:400});
  // O antigo RPC geral também nunca pode retirar uma edição publicada.
  if(state!=='draft')throw Object.assign(Error('published_edition_immutable'),{status:409});
  const now=new Date().toISOString();
  const ref=deletedEditionsCollection(db,snapshotId).doc(deletedEditionDocId(id));
  const imported=db.collection('migrationNewspaperRuntimeStage').doc(snapshotId).collection('editions').doc(id);
  const operational=db.collection('campaignCloudRuntime').doc(snapshotId).collection('publishedNewspapers').doc(id);
  // A list/state read made before this call is not a lock. Recheck the real
  // edition inside the same transaction as its deletion marker, preventing
  // a simultaneous publication from being marked deleted as a stale draft.
  await db.runTransaction(async tx=>{
    const paper=await tx.get(id.startsWith('cloud-')?operational:imported);
    const issue=paper.data();
    if(!paper.exists||issue?.id!==id||issue.state!=='draft'||issue.publishedAt!=null)
      throw Object.assign(Error('published_edition_immutable'),{status:409});
    const previous=await tx.get(ref);
    if(previous.exists&&previous.data()?.deleted===true)return;
    tx.create(ref,{id,deleted:true,deletedBy:actorUid,deletedAt:now,
      previousState:'draft',sourceSnapshotId:snapshotId});
  });
  return {id,deleted:true};
}
