/**
 * Item 6: projeção somente leitura do acervo importado e versões operacionais.
 * O cliente nunca recebe um registro que não poderia consultar no original.
 * A origem importada e o histórico permanecem imutáveis.
 */
import {createHash} from 'node:crypto';
import type {Scope} from './service';

export type RecordRow=Record<string,unknown>;
export type OperationalRecord={
 id:string;version:number;baseVersion:number;record:RecordRow;
 previous:RecordRow|null;updatedBy:string;updatedAt:string;
};
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const safe=(v:unknown):v is string=>typeof v==='string'&&ID.test(v);
export class OperationalRecordError extends Error{
 constructor(readonly code:string,readonly status=503){super(code);}
}
const fail=(code:string):never=>{throw new OperationalRecordError(code);};
const authorized=(scope:Scope,row:RecordRow)=>scope.profile==='narrador'||
 scope.profile==='jogador'&&(
   row['visibility']==='player'&&scope.playerId!==null&&
     row['player_id']===scope.playerId||
   row['visibility']==='house'&&scope.memberHouseIds.includes(row['house_id'] as string));
const sameIdentity=(a:RecordRow,b:RecordRow)=>
 ['house_id','player_id','visibility','kind'].every(k=>
  (a[k]??null)===(b[k]??null));
const normalize=(v:unknown):RecordRow=>{
 if(!v||typeof v!=='object'||Array.isArray(v))fail('invalid_record_overlay');
 return v as RecordRow;
};
function validate(row:OperationalRecord):void{
 if(!row||!safe(row.id)||!Number.isSafeInteger(row.version)||
    !Number.isSafeInteger(row.baseVersion)||
    row.baseVersion<0||row.version<=row.baseVersion||
    row.version>2147483647||!safe(row.updatedBy)||
    typeof row.updatedAt!=='string'||
    !Number.isFinite(Date.parse(row.updatedAt)))fail('invalid_record_overlay');
 const r=normalize(row.record);
 if(r['id']!==row.id||r['version']!==row.version||
    typeof r['title']!=='string'||!r['title']||
    Buffer.byteLength(r['title'] as string,'utf8')>500||
    typeof r['content']!=='string'||
    Buffer.byteLength(r['content'] as string,'utf8')>400000||
    !['gm','house','player'].includes(String(r['visibility']))||
    !['character','details','document'].includes(String(r['kind']))||
    (r['house_id']!==null&&r['house_id']!==undefined&&!safe(r['house_id']))||
    (r['player_id']!==null&&r['player_id']!==undefined&&!safe(r['player_id'])))
    fail('invalid_record_overlay');
 if(row.previous!==null){
  const previous=normalize(row.previous);
  if(previous['id']!==row.id||previous['version']!==row.version-1||
     !sameIdentity(previous,r))fail('invalid_record_history');
 }
}
export function projectOperationalRecords(
 scope:Scope,imported:RecordRow[],operational:OperationalRecord[],
):RecordRow[]{
 const result=new Map<string,RecordRow>();
 for(const row of imported){
  const id=row['id'];
  if(!safe(id))throw new OperationalRecordError('invalid_imported_records');
  if(result.has(id))throw new OperationalRecordError('invalid_imported_records');
  result.set(id,row);
 }
 for(const current of operational){
  validate(current);
  const archived=result.get(current.id);
  if(archived){
   if(archived['version']!==current.baseVersion||
      !sameIdentity(archived,current.record)||
      (current.previous&&!sameIdentity(current.previous,archived)))
     fail('record_overlay_source_conflict');
  }else if(current.baseVersion!==0||current.version<1)
    fail('record_overlay_source_missing');
  const latest=result.get(current.id);
  if(latest&&current.version<=Number(latest['version']))
    fail('record_version_conflict');
  result.set(current.id,{...current.record});
 }
 return [...result.values()].filter(row=>authorized(scope,row));
}
export function projectOperationalVersions(
 scope:Scope,records:RecordRow[],importedVersions:RecordRow[],
 operational:OperationalRecord[],persistedVersions:RecordRow[] = [],
):RecordRow[]{
 const permitted=new Set(records.map(r=>r['id']));
 const list=importedVersions.filter(v=>permitted.has(v['record_id']));
 const ids=new Map(list.map(v=>[v['record_id']+'|'+v['version'],v]));
 for(const saved of persistedVersions){
  if(!permitted.has(saved['record_id']))continue;
  const key=saved['record_id']+'|'+saved['version'];
  if(!Number.isSafeInteger(saved['version'])||Number(saved['version'])<1||
     !saved['snapshot']||typeof saved['snapshot']!=='object'||
     (saved['snapshot'] as RecordRow)['id']!==saved['record_id']||
     (saved['snapshot'] as RecordRow)['version']!==saved['version'])
    fail('record_version_invalid');
  const existing=ids.get(key);
  // Histórico da origem já homologado prevalece, sem sobrescrever a versão importada.
  if(!existing){list.push(saved);ids.set(key,saved);}
 }
 for(const next of operational){
  validate(next);
  if(!permitted.has(next.id))continue;
  if(next.previous){
   const oldKey=next.id+'|'+next.previous['version'];
   if(!ids.has(oldKey)){
    list.push({id:hash('record-version:'+oldKey),record_id:next.id,
     version:next.previous['version'],snapshot:next.previous,
     author:next.previous['updated_by']??null,
     created_at:next.previous['updated_at']??null});
    ids.set(oldKey,list[list.length-1]!);
   }
  }
  const key=next.id+'|'+next.version;
  if(ids.has(key)){
   if(JSON.stringify(ids.get(key)!['snapshot'])!==JSON.stringify(next.record))
    fail('record_version_conflict');
  }else{
   list.push({id:hash('record-version:'+key),record_id:next.id,
    version:next.version,snapshot:next.record,
    author:next.updatedBy,created_at:next.updatedAt});
   ids.set(key,list[list.length-1]!);
  }
 }
 return list;
}
export async function readOperationalRecordDocs(db:any,snapshotId:string):
 Promise<OperationalRecord[]>{
 if(!/^[a-f0-9]{64}$/.test(snapshotId))fail('record_source_unavailable');
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 const live=await root.get();
 if(!live.exists||live.data()?.status!=='active'||
   live.data()?.private!==true||live.data()?.applicationEnabled!==true||
   live.data()?.sourceSnapshotId!==snapshotId||
   live.data()?.sourceSnapshotReconciled!==true||
   live.data()?.recordsReadApproved!==true)
   fail('record_runtime_not_approved');
 const snap=await root.collection('records').limit(501).get();
 if(!Array.isArray(snap.docs)||snap.docs.length>500)
   fail('record_collection_too_large');
 return snap.docs.map((doc:any)=>{
  const row=doc.data();
  if(!row||!safe(row.id)||doc.id!==hash('record:'+row.id)||
    row.sourceSnapshotId!==snapshotId)
   fail('record_document_integrity_failed');
  return row as OperationalRecord;
 });
}

/** Histórico operacional, separado do documento atual para não exceder 1 MiB. */
export async function readOperationalRecordVersionDocs(db:any,snapshotId:string):
 Promise<RecordRow[]>{
 if(!/^[a-f0-9]{64}$/.test(snapshotId))fail('record_source_unavailable');
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 const meta=await root.get();
 if(!meta.exists||meta.data()?.status!=='active'||meta.data()?.private!==true||
    meta.data()?.applicationEnabled!==true||meta.data()?.sourceSnapshotId!==snapshotId||
    meta.data()?.sourceSnapshotReconciled!==true||meta.data()?.recordsReadApproved!==true)
   fail('record_runtime_not_approved');
 const docs=await root.collection('recordVersions').limit(5001).get();
 if(!Array.isArray(docs.docs)||docs.docs.length>5000)
   fail('record_history_too_large');
 return docs.docs.map((doc:any)=>{
  const d=doc.data();
  if(!d||!safe(d.record_id)||!Number.isSafeInteger(d.version)||d.version<1||
     doc.id!==hash('record-version:'+d.record_id+'|'+d.version)||
     d.sourceSnapshotId!==snapshotId||!d.snapshot||
     typeof d.snapshot!=='object'||d.snapshot.id!==d.record_id||
     d.snapshot.version!==d.version)
    fail('record_version_integrity_failed');
  return {id:doc.id,record_id:d.record_id,version:d.version,
   snapshot:d.snapshot,author:d.author??null,created_at:d.created_at??null};
 });
}
