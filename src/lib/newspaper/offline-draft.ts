/**
 * Browser-only fallback for unpublished newsroom work. A local copy is scoped
 * to the authenticated Firebase UID and edition ID, never sent to analytics,
 * a CDN or a public API. Server-published editions are never restored.
 * Storage is best effort (private browsing and quota errors may deny it).
 */
import {safeNewspaperBlocks,type NewspaperEdition} from './model';
import {sameSnapshot,snapshotOf,type DraftSnapshot} from './editing';

const PREFIX='cormyr-folha-editor-offline-v1:';
const MAX_BYTES=260_000;
const ID=/^(cloud-[a-f0-9]{64}|[a-f0-9-]{36})$/i;
const OWNER=/^[a-zA-Z0-9_-]{1,128}$/;
export type OfflineEditionBackup={
 schema:1;owner:string;editionId:string;baseVersion:number;updatedAt:number;
 snapshot:DraftSnapshot;
};
type LocalStore=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function browserOfflineStore():LocalStore|null{
 try{return typeof window==='undefined'?null:window.localStorage;}
 catch{return null;}
}
export function offlineEditionKey(uid:string,id:string):string|null{
 return OWNER.test(uid)&&ID.test(id)?PREFIX+uid+':'+id:null;
}
export function writeOfflineEdition(store:LocalStore|null,uid:string,edition:NewspaperEdition,now=Date.now()):boolean{
 if(!store||edition.state!=='draft'||edition.archive_preview||!Number.isSafeInteger(edition.version)||
    edition.version<1||edition.blocks.length<1||edition.blocks.length>80)return false;
 const key=offlineEditionKey(uid,edition.id);if(!key)return false;
 const item:OfflineEditionBackup={schema:1,owner:uid,editionId:edition.id,
  baseVersion:edition.version,updatedAt:now,snapshot:snapshotOf(edition)};
 const json=JSON.stringify(item);
 if(json.length>MAX_BYTES)return false;
 try{store.setItem(key,json);return true;}catch{return false;}
}
export function readOfflineEdition(store:LocalStore|null,uid:string,edition:NewspaperEdition):OfflineEditionBackup|null{
 const key=offlineEditionKey(uid,edition.id);
 if(!store||!key||edition.state!=='draft'||edition.archive_preview)return null;
 try{
  const raw=store.getItem(key);
  if(!raw||raw.length>MAX_BYTES)return null;
  const item=JSON.parse(raw) as Partial<OfflineEditionBackup>;
  const snap=item.snapshot;
  if(item.schema!==1||item.owner!==uid||item.editionId!==edition.id||
     !Number.isSafeInteger(item.baseVersion)||item.baseVersion!<1||
     !Number.isFinite(item.updatedAt)||!snap||typeof snap!=='object'||
     typeof snap.title!=='string'||typeof snap.subtitle!=='string'||
     typeof snap.campaign_date!=='string'||typeof snap.template!=='string'||
     typeof snap.font_style!=='string'||!Array.isArray(snap.blocks)||
     snap.blocks.length<1||snap.blocks.length>80||
     typeof snap.pdf_path!=='string'&&snap.pdf_path!==null)
    return null;
  const blocks=safeNewspaperBlocks(snap.blocks);
  if(blocks.length!==snap.blocks.length)return null;
  const sanitized={campaign_date:snap.campaign_date,title:snap.title,
   subtitle:snap.subtitle,template:snap.template,font_style:snap.font_style,
   pdf_path:snap.pdf_path,blocks,
   publish_on:typeof snap.publish_on==='string'||snap.publish_on===null?snap.publish_on:null} as DraftSnapshot;
  if(sameSnapshot(sanitized,snapshotOf(edition)))return null;
  return {...item,snapshot:sanitized} as OfflineEditionBackup;
 }catch{return null;}
}
export function clearOfflineEdition(store:LocalStore|null,uid:string,id:string):void{
 const key=offlineEditionKey(uid,id);if(!key||!store)return;
 try{store.removeItem(key);}catch{/* storage may be blocked */}
}
/** Keep the current Firestore version. A recovered local copy can never
 * override a concurrently edited edition without the server CAS guard. */
export function recoverOfflineEdition(saved:NewspaperEdition,backup:OfflineEditionBackup):NewspaperEdition{
 if(saved.state!=='draft'||saved.id!==backup.editionId)throw Error('invalid_offline_restore');
 return {...saved,...backup.snapshot,version:saved.version,state:'draft'};
}
