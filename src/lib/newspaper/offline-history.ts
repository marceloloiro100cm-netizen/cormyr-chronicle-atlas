/**
 * Private, device-only revision journal for unpublished newsroom drafts.
 * It complements (never migrates, replaces or removes) the existing synchronous
 * localStorage backup. IndexedDB can fail in private mode/quota conditions:
 * callers must keep the synchronous fallback and surface a warning.
 *
 * Records are scoped to Firebase UID and edition ID. Nothing is transmitted.
 */
import {type NewspaperEdition} from './model';
import {snapshotOf,sameSnapshot} from './editing';
import {offlineEditionKey,parseOfflineEdition,type OfflineEditionBackup} from './offline-draft';

const DB_NAME='cormyr-folha-editor-revisions-v1';
const STORE='revisions';
const INDEX='owner';
const MAX_REVISIONS=100;
const MAX_SIZE=260_000;
const MAX_AGE_MS=30*24*60*60*1000;
type Entry=OfflineEditionBackup&{key:string};
let dbPromise:Promise<IDBDatabase|null>|null=null;
let serial:Promise<unknown>=Promise.resolve();

function connect():Promise<IDBDatabase|null>{
 if(typeof indexedDB==='undefined')return Promise.resolve(null);
 if(dbPromise)return dbPromise;
 dbPromise=new Promise(resolve=>{
  try{
   const request=indexedDB.open(DB_NAME,1);
   request.onupgradeneeded=()=>{
    const db=request.result;
    if(!db.objectStoreNames.contains(STORE)){
     const table=db.createObjectStore(STORE,{keyPath:'key'});
     table.createIndex(INDEX,'owner',{unique:false});
    }
   };
   request.onsuccess=()=>{
    const db=request.result;
    db.onversionchange=()=>{db.close();dbPromise=null;};
    resolve(db);
   };
   request.onerror=()=>{dbPromise=null;resolve(null);};
   request.onblocked=()=>{dbPromise=null;resolve(null);};
  }catch{dbPromise=null;resolve(null);}
 });
 return dbPromise;
}
function ownerEntries(db:IDBDatabase,uid:string):Promise<Entry[]>{
 return new Promise(resolve=>{
  try{
   const tx=db.transaction(STORE,'readonly');
   const request=tx.objectStore(STORE).index(INDEX).getAll(uid);
   request.onsuccess=()=>resolve(Array.isArray(request.result)?request.result as Entry[]:[]);
   request.onerror=()=>resolve([]);
   tx.onabort=()=>resolve([]);
  }catch{resolve([]);}
 });
}
function revisionKey(uid:string,editionId:string,at:number){
 return uid+':'+editionId+':'+at+':'+crypto.randomUUID();
}
async function write(uid:string,edition:NewspaperEdition,now:number):Promise<boolean>{
 if(edition.state!=='draft'||edition.archive_preview||edition.version<1||
    !offlineEditionKey(uid,edition.id))return false;
 const backup:OfflineEditionBackup={schema:1,owner:uid,editionId:edition.id,
  baseVersion:edition.version,updatedAt:now,snapshot:snapshotOf(edition)};
 if(JSON.stringify(backup).length>MAX_SIZE)return false;
 const db=await connect();
 if(!db)return false;
 const previous=await ownerEntries(db,uid);
 const latest=previous.filter(v=>v.editionId===edition.id)
  .sort((a,b)=>b.updatedAt-a.updatedAt)[0];
 if(latest&&sameSnapshot(latest.snapshot,backup.snapshot))return true;
 return new Promise(resolve=>{
  try{
   const tx=db.transaction(STORE,'readwrite');
   const table=tx.objectStore(STORE);
   table.put({...backup,key:revisionKey(uid,edition.id,now)});
   // Prune only this account's old history, never backups for other accounts
   // or the original localStorage copy. Keep the newest record per edition.
   const ordered=previous.slice().sort((a,b)=>b.updatedAt-a.updatedAt);
   const latestKeys=new Set<string>();
   const remove:string[]=[];
   ordered.forEach((entry,index)=>{
    if(!latestKeys.has(entry.editionId)){latestKeys.add(entry.editionId);return;}
    if(index>=MAX_REVISIONS-1||entry.updatedAt<now-MAX_AGE_MS)remove.push(entry.key);
   });
   for(const key of remove)table.delete(key);
   tx.oncomplete=()=>resolve(true);
   tx.onerror=()=>resolve(false);
   tx.onabort=()=>resolve(false);
  }catch{resolve(false);}
 });
}
/** Serialized writes protect ordering when React dispatches multiple updates. */
export function appendOfflineHistory(uid:string,edition:NewspaperEdition,now=Date.now()):Promise<boolean>{
 const next=serial.catch(()=>null).then(()=>write(uid,edition,now));
 serial=next;
 return next;
}
export async function listOfflineHistory(uid:string):Promise<OfflineEditionBackup[]>{
 if(!offlineEditionKey(uid,'cloud-'+'a'.repeat(64)))return [];
 const db=await connect();
 if(!db)return [];
 const entries=await ownerEntries(db,uid);
 return entries.slice().sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,MAX_REVISIONS)
  .flatMap(entry=>{
   if(!offlineEditionKey(uid,entry.editionId)||typeof entry.key!=='string')return [];
   // Reuse exact legacy snapshot validation, including blocks and account checks.
   const storage={getItem:()=>JSON.stringify(entry),setItem:()=>{},removeItem:()=>{}};
   const valid=parseOfflineEdition(storage,uid,entry.editionId);
   return valid?[valid]:[];
  });
}
