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
    edition.version<1||edition.blocks.length>80)return false;
 const key=offlineEditionKey(uid,edition.id);if(!key)return false;
 const item:OfflineEditionBackup={schema:1,owner:uid,editionId:edition.id,
  baseVersion:edition.version,updatedAt:now,snapshot:snapshotOf(edition)};
 const json=JSON.stringify(item);
 if(json.length>MAX_BYTES)return false;
 try{store.setItem(key,json);return true;}catch{return false;}
}
/** Validate and sanitize a local backup without requiring the remote edition to
 * have loaded. This path is read-only and never sends the backup to the server. */
export function parseOfflineEdition(store:LocalStore|null,uid:string,id:string):OfflineEditionBackup|null{
 const key=offlineEditionKey(uid,id);
 if(!store||!key)return null;
 try{
  const raw=store.getItem(key);
  if(!raw||raw.length>MAX_BYTES)return null;
  const item=JSON.parse(raw) as Partial<OfflineEditionBackup>;
  const snap=item.snapshot;
  if(item.schema!==1||item.owner!==uid||item.editionId!==id||
     typeof item.baseVersion!=='number'||!Number.isSafeInteger(item.baseVersion)||item.baseVersion<1||
     typeof item.updatedAt!=='number'||!Number.isFinite(item.updatedAt)||
     !snap||typeof snap!=='object'||
     typeof snap.title!=='string'||typeof snap.subtitle!=='string'||
     typeof snap.campaign_date!=='string'||typeof snap.template!=='string'||
     typeof snap.font_style!=='string'||!Array.isArray(snap.blocks)||
     snap.blocks.length>80||
     (typeof snap.pdf_path!=='string'&&snap.pdf_path!==null))
    return null;
  const blocks=safeNewspaperBlocks(snap.blocks);
  if(blocks.length!==snap.blocks.length)return null;
  const sanitized={campaign_date:snap.campaign_date,title:snap.title,
   subtitle:snap.subtitle,template:snap.template,font_style:snap.font_style,
   pdf_path:snap.pdf_path,blocks,
   publish_on:typeof snap.publish_on==='string'||snap.publish_on===null?snap.publish_on:null} as DraftSnapshot;
  return {...item,snapshot:sanitized} as OfflineEditionBackup;
 }catch{return null;}
}
export function readOfflineEdition(store:LocalStore|null,uid:string,edition:NewspaperEdition):OfflineEditionBackup|null{
 if(edition.state!=='draft'||edition.archive_preview)return null;
 const backup=parseOfflineEdition(store,uid,edition.id);
 return backup&&!sameSnapshot(backup.snapshot,snapshotOf(edition))?backup:null;
}
/** Enumerates only this authenticated editor's local draft copies. The remote
 * archive is NOT needed, so a Firestore outage cannot hide recoverable text. */
export function listOfflineEditionBackups(store:LocalStore|null,uid:string):OfflineEditionBackup[]{
 if(!store||!OWNER.test(uid))return [];
 const indexed=store as LocalStore&{length?:number;key?:(index:number)=>string|null};
 const count=indexed.length;
 if(typeof count!=='number'||!Number.isSafeInteger(count)||count<0||
    typeof indexed.key!=='function')return [];
 const prefix=PREFIX+uid+':';
 const found:OfflineEditionBackup[]=[];
 try{
  for(let i=0;i<Math.min(count,5000);i++){
   const key=indexed.key(i);
   if(!key?.startsWith(prefix))continue;
   const id=key.slice(prefix.length);
   const backup=parseOfflineEdition(store,uid,id);
   if(backup)found.push(backup);
   if(found.length>=100)break;
  }
 }catch{/* Browser storage may be disabled while enumerating. */}
 return found.sort((a,b)=>b.updatedAt-a.updatedAt);
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
const WORKING='cormyr-folha-working-edition-v1:';
/** The draft last edited on this device: it reopens first after a reload. */
export function rememberWorkingEditionId(store:LocalStore|null,uid:string,id:string):void{
 if(!store||!OWNER.test(uid)||!ID.test(id))return;
 try{if(store.getItem(WORKING+uid)!==id)store.setItem(WORKING+uid,id);}catch{/* storage may be blocked */}
}
export function readWorkingEditionId(store:LocalStore|null,uid:string):string|null{
 if(!store||!OWNER.test(uid))return null;
 try{const id=store.getItem(WORKING+uid);return id&&ID.test(id)?id:null;}catch{return null;}
}
