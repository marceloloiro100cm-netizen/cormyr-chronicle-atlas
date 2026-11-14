/**
 * Pure Drive sync rules (port of src/lib/drive-sync.ts and SQL 0003/0004/0005).
 * Canonical form and digests are byte-compatible with the files already in the
 * campaign Drive. No I/O.
 */
import {createHash} from 'node:crypto';

export class DriveError extends Error {
  constructor(code,message){super(message);this.name='DriveError';this.code=code;}
}
const fail=(code,m)=>{throw new DriveError(code,m);};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS=['schema','entityType','id','houseId','playerId','visibility','version','baseVersion','title','content',
  'kind','letterId','createdAt','updatedAt','authorName','mailLinks','mutationId','origin'];
const REQUIRED=['schema','entityType','id','houseId','playerId','visibility','version','baseVersion','title','content',
  'createdAt','updatedAt','mutationId','origin'];
const LINK_KEYS=['originHouseId','courtMemberId','courtAssignment','militaryUnitId','sheetVersion','deliveryWeek'];
const isInt=v=>Number.isInteger(v);
const nullableStr=v=>v===null||typeof v==='string';

/** Strict envelope validation (zod envelopeSchema equivalent). Throws on any deviation. */
export function validateEnvelope(e){
  const bad=()=>fail('invalid','Envelope inválido');
  if(!e||typeof e!=='object'||Array.isArray(e))bad();
  for(const k of Object.keys(e))if(!KEYS.includes(k))bad();
  for(const k of REQUIRED)if(!(k in e))bad();
  if(e.schema!=='cormyr-record-v1'||!['record','letter','reply'].includes(e.entityType)||!UUID.test(e.id)||
     !nullableStr(e.houseId)||!(e.playerId===null||(typeof e.playerId==='string'&&UUID.test(e.playerId)))||
     !['house','player','master'].includes(e.visibility)||!isInt(e.version)||e.version<1||
     !isInt(e.baseVersion)||e.baseVersion<0||typeof e.title!=='string'||e.title.length>500||
     typeof e.content!=='string'||e.content.length>2_000_000||typeof e.createdAt!=='string'||
     typeof e.updatedAt!=='string'||!UUID.test(e.mutationId)||!['site','drive'].includes(e.origin))bad();
  if('kind' in e&&!['document','character','details'].includes(e.kind))bad();
  if('letterId' in e&&!UUID.test(e.letterId))bad();
  if('authorName' in e&&(typeof e.authorName!=='string'||e.authorName.length>160))bad();
  if('mailLinks' in e){
    const m=e.mailLinks;
    if(!m||typeof m!=='object'||Object.keys(m).some(k=>!LINK_KEYS.includes(k))||LINK_KEYS.some(k=>!(k in m)))bad();
    if(!nullableStr(m.originHouseId)||!nullableStr(m.courtMemberId)||
       !(m.courtAssignment===null||['executor','order_recipient'].includes(m.courtAssignment))||
       !nullableStr(m.militaryUnitId)||!(m.sheetVersion===null||isInt(m.sheetVersion))||
       !(m.deliveryWeek===null||isInt(m.deliveryWeek)))bad();
  }
  return e;
}

export function allowed(b,e){
  if(!b.enabled||!b.privacyReviewed||!b.runtimeAuthorized)return false;
  if(e.entityType==='record'&&e.visibility==='master')return false;
  return b.scope==='house'?e.visibility==='house'&&e.houseId===b.houseId&&e.playerId===null:
    b.scope==='player'?e.visibility==='player'&&e.playerId===b.playerId:e.visibility==='master';
}
export function canonical(e){
  const base=[e.schema,e.entityType,e.id,e.houseId,e.playerId,e.visibility,e.version,e.title,e.content,
    e.kind??null,e.letterId??null,e.createdAt,e.updatedAt,e.authorName??null];
  const m=e.mailLinks;
  return JSON.stringify(m?[...base,[m.originHouseId,m.courtMemberId,m.courtAssignment,m.militaryUnitId,m.sheetVersion,m.deliveryWeek]]:base);
}
export const digest=e=>createHash('sha256').update(canonical(e),'utf8').digest('hex');
export function decide(base,site,remote){
  const a=canonical(base),s=canonical(site),r=canonical(remote);
  if(s===r)return 'noop';
  if(r===a)return 'export';
  if(s===a&&remote.baseVersion===base.version&&remote.version===base.version+1)return 'import';
  return 'conflict';
}
export const retryDelay=attempt=>Math.min(3_600_000,30_000*2**Math.min(Math.max(attempt-1,0),7));
export const filename=e=>'cormyr-'+e.entityType+'-'+e.id+'.json';
export const versionedFilename=e=>filename(e).replace('.json','-v'+e.version+'-'+digest(e)+'.json');
export const NAME_RE=/^cormyr-(record|letter|reply)-[0-9a-f-]{36}(-v[0-9]+-[0-9a-f]{64})?\.json$/;

/** Postgres COPY timestamptz text -> the ISO text PostgREST returned when files were written. */
export function postgrestTimestamp(v){
  if(typeof v!=='string')return null;
  const m=/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)\+00(?::00)?$/.exec(v);
  return m?m[1]+'T'+m[2]+'+00:00':null;
}
/** Timestamp text for an envelope: the preserved original while it still denotes the same instant. */
export const stamp=(text,iso)=>
  typeof text==='string'&&typeof iso==='string'&&Date.parse(text)===Date.parse(iso)?text:iso;

/** Envelope of a site record for a binding, or null when it must never leave the site. */
export function recordEnvelope(r,b,{ownerMemberHouseIds=new Set()}={}){
  if(!r||r.visibility==='gm')return null;
  let visibility=r.visibility,houseId=r.houseId??null,playerId=r.playerId??null;
  if(visibility==='house'&&b.scope==='player'&&b.playerId&&houseId&&houseId===b.houseId){
    if(!ownerMemberHouseIds.has(houseId))return null;
    visibility='player';playerId=b.playerId;
  }
  const e={schema:'cormyr-record-v1',entityType:'record',id:r.id,houseId,playerId,visibility,version:r.version,
    baseVersion:Math.max(r.version-1,0),title:r.title??'',content:r.content??'',kind:r.kind,
    createdAt:stamp(r.createdAtText,r.createdAt)??'',updatedAt:stamp(r.updatedAtText,r.updatedAt)??r.createdAt??'',
    authorName:'',mutationId:r.id,origin:'site'};
  try{validateEnvelope(e);}catch{return null;}
  return allowed(b,e)?e:null;
}

export const bindingReady=b=>b.enabled===true&&b.privacyReviewed===true&&b.runtimeAuthorized===true;
export const leaseFree=(b,at)=>!b.leaseUntil||Date.parse(b.leaseUntil)<at.getTime();
export const LEASE_MS=2*60*1000;

/** apply_drive_record (SQL 0004). Returns {applied:false} or the updated record. */
export function applyDriveRecord({binding:b,mapped,confirmerIsAdmin,record:r,doc,siteVersion,ownerEditsHouse,ownerIsPlayer,now}){
  const no={applied:false};
  if(!bindingReady(b)||!confirmerIsAdmin||!mapped)return no;
  if(!r||r.version!==siteVersion||r.visibility==='gm')return no;
  const ok=(b.scope==='house'&&r.visibility==='house'&&r.houseId===b.houseId&&doc.visibility==='house'&&
      doc.houseId===r.houseId&&doc.playerId==null)||
    (b.scope==='player'&&r.visibility==='player'&&r.playerId===b.playerId&&doc.visibility==='player'&&
      doc.playerId===r.playerId&&ownerIsPlayer&&ownerEditsHouse);
  if(!ok)return no;
  if(doc.baseVersion!==r.version||doc.version!==r.version+1)return no;
  return {applied:true,record:{...r,title:doc.title,content:doc.content,version:r.version+1,
    updatedBy:b.confirmedBy,updatedAt:(now||new Date()).toISOString(),syncState:'pending'}};
}

/** resolve_drive_import (SQL 0003). Returns {record, insert, inboxState, requeueRecordId}. */
export function resolveDriveImport({actorUid,inbox:i,binding:b,record:r,choice,content,now}){
  const at=(now||new Date()).toISOString();
  if(!i||!['review','conflict'].includes(i.state))fail('conflict','Revisão já encerrada');
  if(!bindingReady(b))fail('denied','Pasta não autorizada');
  const done=state=>({inboxState:state,resolvedBy:actorUid,resolvedAt:at});
  if(choice==='reject')return {...done('rejected'),record:null,requeueRecordId:null};
  if(!['folder','site','merge'].includes(choice))fail('invalid','Escolha inválida');
  const doc=i.folderSnapshot;
  if(doc.entityType==='record'){
    if(r){
      const scoped=b.scope==='house'&&r.visibility==='house'&&r.houseId===b.houseId||
        b.scope==='player'&&r.visibility==='player'&&r.playerId===b.playerId;
      if(r.visibility==='gm'||!scoped)fail('denied','Escopo não autorizado');
      if(i.siteSnapshot&&r.version!==i.siteSnapshot.version)
        fail('conflict','Versão do site mudou; execute reconciliação novamente');
      let next=null;
      if(choice!=='site'){
        if(choice==='merge'&&typeof content!=='string')fail('invalid','Conteúdo mesclado obrigatório');
        next={...r,title:doc.title,content:choice==='merge'?content:doc.content,version:r.version+1,
          updatedBy:actorUid,updatedAt:at,syncState:'pending'};
      }
      return {...done('applied'),record:next,requeueRecordId:r.id};
    }
    if(choice==='site'||b.scope==='master'||doc.visibility==='gm')fail('denied','Importação não autorizada');
    const created={id:doc.id,houseId:b.houseId??null,playerId:b.playerId??null,
      visibility:b.scope==='house'?'house':'player',kind:doc.kind,title:doc.title,content:doc.content,
      version:1,createdBy:actorUid,updatedBy:actorUid,createdAt:at,updatedAt:at,syncState:'pending',
      lastSyncedAt:null,sourceFileId:null,sourceModifiedAt:null};
    return {...done('applied'),record:created,insert:true,requeueRecordId:doc.id};
  }
  if(doc.entityType==='reply'){
    if(choice==='site')return {...done('applied'),record:null,requeueRecordId:null};
    fail('invalid','Importação de respostas ainda não disponível neste ambiente');
  }
  fail('invalid','Missivas recebidas são imutáveis; utilize resposta');
}
