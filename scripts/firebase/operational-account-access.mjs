/**
 * Acesso efetivo do Firebase: overlay operacional independente e imutabilidade
 * da migração. A existência de um documento não concede privilégios; a raiz
 * operacional deve estar reconciliada e a identidade deve ser validada.
 */
const SNAPSHOT=/^[a-f0-9]{64}$/;
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
export const operationalAccessCollection=(db,snapshotId)=>
 db.collection('campaignCloudRuntime').doc(snapshotId).collection('accountAccess');

const isLive=v=>v?.status==='active'&&v.private===true&&
 v.applicationEnabled===true&&v.sourceSnapshotReconciled===true;
const validOverlay=(uid,v)=>v&&v.userId===uid&&
 ['jogador','editor'].includes(v.profile)&&v.admin===false&&
 typeof v.active==='boolean'&&typeof v.requirePasswordChange==='boolean'&&
 (v.profile==='editor'?v.playerId===null:typeof v.playerId==='string'&&ID.test(v.playerId))&&
 Array.isArray(v.memberHouseIds)&&Array.isArray(v.editHouseIds)&&
 v.memberHouseIds.length<=250&&v.editHouseIds.length<=250&&
 v.memberHouseIds.every(x=>typeof x==='string'&&ID.test(x))&&
 v.editHouseIds.every(x=>v.memberHouseIds.includes(x))&&
 (v.profile!=='editor'||v.memberHouseIds.length===0&&v.editHouseIds.length===0);

export async function currentAccountAccess(db,snapshotId,uid){
 if(!SNAPSHOT.test(snapshotId)||!ID.test(uid))throw Error('invalid_access_scope');
 const source=db.collection('migrationDomainStage').doc(snapshotId).collection('access').doc(uid);
 const [archived,live,overlay]=await Promise.all([
  source.get(),db.collection('campaignCloudRuntime').doc(snapshotId).get(),
  operationalAccessCollection(db,snapshotId).doc(uid).get(),
 ]);
 if(!overlay.exists)return archived.exists?archived.data():null;
 if(!isLive(live.data())||archived.data()?.profile==='narrador'||
    !validOverlay(uid,overlay.data()))
   throw Error('invalid_access_scope');
 return overlay.data();
}

export async function listCurrentAccountAccess(db,snapshotId){
 if(!SNAPSHOT.test(snapshotId))throw Error('invalid_access_scope');
 const [archive,live,overlays]=await Promise.all([
  db.collection('migrationDomainStage').doc(snapshotId).collection('access').get(),
  db.collection('campaignCloudRuntime').doc(snapshotId).get(),
  operationalAccessCollection(db,snapshotId).limit(251).get(),
 ]);
 if(overlays.size>250)throw Error('invalid_access_scope');
 const result=new Map();
 for(const doc of archive.docs){
  const a=doc.data();
  if(!a||!ID.test(a.userId)||a.userId!==doc.id)
   throw Error('invalid_access_scope');
  result.set(doc.id,a);
 }
 if(overlays.size&&!isLive(live.data()))throw Error('invalid_access_scope');
 for(const doc of overlays.docs){
  const a=doc.data();
  if(!validOverlay(doc.id,a)||result.get(doc.id)?.profile==='narrador')
   throw Error('invalid_access_scope');
  result.set(doc.id,a);
 }
 return [...result.values()];
}
