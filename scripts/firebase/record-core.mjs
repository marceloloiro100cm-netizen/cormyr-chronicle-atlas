/**
 * Pure rules of campaign records (port of can_read_record, can_edit_record,
 * save_campaign_record, save_imported_source and the records_insert policy).
 * No I/O. The editor identity never sees house/player records.
 */
const VIS=['player','house','gm'];
const KIND=['document','character','details'];
const SYNC=['pending','synced','error','conflict'];
const MAX_TITLE=500;
const MAX_CONTENT=400_000;

export class RecordError extends Error {
  constructor(code,message){super(message);this.name='RecordError';this.code=code;}
}
const fail=(code,m)=>{throw new RecordError(code,m);};

export function recordScopeOf(uid,raw){
  if(!raw||raw.userId!==uid||raw.active!==true||raw.requirePasswordChange===true)
    fail('denied','Acesso não autorizado');
  if(raw.profile==='narrador'&&raw.admin===true)
    return {role:'narrador',uid,playerId:null,memberHouseIds:new Set(),editHouseIds:new Set()};
  const ids=a=>Array.isArray(a)&&a.every(x=>typeof x==='string'&&x.length>0);
  if(raw.profile!=='jogador'||raw.admin!==false||typeof raw.playerId!=='string'||!raw.playerId||
     !ids(raw.memberHouseIds)||!ids(raw.editHouseIds))fail('denied','Acesso não autorizado');
  return {role:'jogador',uid,playerId:raw.playerId,
    memberHouseIds:new Set(raw.memberHouseIds),editHouseIds:new Set(raw.editHouseIds)};
}

export function canReadRecord(actor,r){
  if(actor.role==='narrador')return true;
  return (r.visibility==='player'&&r.playerId!=null&&r.playerId===actor.playerId)||
    (r.visibility==='house'&&r.houseId!=null&&actor.memberHouseIds.has(r.houseId));
}
export function canEditRecord(actor,r){
  if(actor.role==='narrador')return true;
  if(r.houseId==null)return false;
  return (r.visibility==='player'&&r.playerId===actor.playerId&&actor.editHouseIds.has(r.houseId))||
    (r.visibility==='house'&&actor.editHouseIds.has(r.houseId));
}

function text(v,name,max,{allowEmpty=false}={}){
  if(typeof v!=='string'||(!allowEmpty&&v.length===0)||Buffer.byteLength(v,'utf8')>max)
    fail('invalid','Valor inválido: '+name);
  return v;
}

/** Records created by clients (records_insert policy): version 1, pending. */
export function applyRecordCreate({actor,input,newId,now,houseExists,playerExists}){
  if(!input||typeof input!=='object')fail('invalid','Registro inválido');
  const {visibility,kind}=input;
  const houseId=input.houseId??null,playerId=input.playerId??null;
  if(!VIS.includes(visibility)||!KIND.includes(kind))fail('invalid','Tipo ou visibilidade inválidos');
  if((visibility==='player'&&playerId===null)||(visibility==='house'&&houseId===null))
    fail('invalid','Visibilidade exige vínculo');
  if(houseId!==null&&!houseExists(houseId))fail('invalid','Casa inexistente');
  if(playerId!==null&&!playerExists(playerId))fail('invalid','Jogador inexistente');
  const draft={visibility,kind,houseId,playerId};
  if(!canEditRecord(actor,draft))fail('denied','Acesso não autorizado');
  const at=now||new Date().toISOString();
  const record={id:newId,houseId,playerId,visibility,kind,
    title:text(input.title,'title',MAX_TITLE),content:text(input.content??'','content',MAX_CONTENT,{allowEmpty:true}),
    version:1,createdBy:actor.uid,updatedBy:actor.uid,createdAt:at,updatedAt:at,
    syncState:'pending',lastSyncedAt:null,sourceFileId:null,sourceModifiedAt:null};
  return {record,version:versionOf(record)};
}

export function applyRecordSave({actor,record,version,title,content,now}){
  if(!record||!canEditRecord(actor,record))fail('denied','Acesso não autorizado');
  if(!Number.isInteger(version)||record.version!==version)
    fail('conflict','Conflito de versão: recarregue antes de salvar. Sua edição não foi descartada.');
  const at=now||new Date().toISOString();
  const saved={...record,title:text(title,'title',MAX_TITLE),
    content:text(content,'content',MAX_CONTENT,{allowEmpty:true}),
    version:record.version+1,updatedBy:actor.uid,updatedAt:at,syncState:'pending'};
  return {record:saved,version:versionOf(saved)};
}

/** Server-side Drive path (service_role in SQL): only untouched imports. */
export function applyImportedSource({record,content,modifiedAt,now}){
  if(!record||record.sourceFileId==null||record.version!==1)
    fail('conflict','Fonte editada no site; preserve ambas as versões para revisão');
  const saved={...record,content:text(content,'content',MAX_CONTENT,{allowEmpty:true}),
    sourceModifiedAt:typeof modifiedAt==='string'?modifiedAt:null,
    version:2,updatedAt:now||new Date().toISOString(),syncState:'pending'};
  return {record:saved,version:versionOf(saved)};
}

/** record_versions row (snapshot of the record, author = updatedBy). */
export function versionOf(record){
  return {recordId:record.id,version:record.version,snapshot:record,author:record.updatedBy,
    createdAt:record.updatedAt,
    // Denormalised access fields so Firestore rules need no second read.
    visibility:record.visibility,houseId:record.houseId,playerId:record.playerId};
}
export const SYNC_STATES=SYNC;
