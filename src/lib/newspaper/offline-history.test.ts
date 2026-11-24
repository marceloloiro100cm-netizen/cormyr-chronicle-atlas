import {describe,expect,it,vi} from 'vitest';
import {makeNewspaperBlock,type NewspaperEdition} from './model';
import {appendOfflineHistory,listOfflineHistory} from './offline-history';

const uid='editor-leonardo';
const id='cloud-'+'a'.repeat(64);
function draft(value:string,editionId=id):NewspaperEdition{
 return {
  id:editionId,edition_no:3,campaign_date:'1522-11-24',
  title:'A Folha Sem Selo',subtitle:'A verdade bem servida',
  template:'classico',font_style:'classico',
  blocks:[{...makeNewspaperBlock('headline'),id:'headline-stable',text:value}],pdf_path:null,version:1,
  publication_revision:0,created_by:uid,updated_at:'',
  published_at:null,archived_at:null,cancelled_at:null,state:'draft',
 };
}
function memoryIndexedDb(){
 const rows=new Map<string,Record<string,unknown>>();
 const db={
  objectStoreNames:{contains:()=>false},
  createObjectStore:()=>({createIndex:()=>({})}),
  close:()=>{},
  onversionchange:null as (()=>void)|null,
  transaction:()=>{
   const tx={
    oncomplete:null as (()=>void)|null,
    onerror:null as (()=>void)|null,
    onabort:null as (()=>void)|null,
    objectStore:()=>({
     index:()=>({
      getAll:(owner:string)=>{
       const r:{result:unknown[];onsuccess:(()=>void)|null;onerror:(()=>void)|null}={
        result:[...rows.values()].filter(row=>row['owner']===owner),onsuccess:null,onerror:null,
       };
       setTimeout(()=>r.onsuccess?.(),0);
       return r;
      },
     }),
     put:(item:Record<string,unknown>)=>{
      rows.set(item['key'] as string,item);
      setTimeout(()=>tx.oncomplete?.(),0);
     },
     delete:(key:string)=>{rows.delete(key);},
    }),
   };
   return tx;
  },
 };
 const api={
  open:()=>{
   const r:{result:typeof db;onupgradeneeded:(()=>void)|null;
    onsuccess:(()=>void)|null;onerror:(()=>void)|null;onblocked:(()=>void)|null}={
    result:db,onupgradeneeded:null,onsuccess:null,onerror:null,onblocked:null,
   };
   setTimeout(()=>{r.onupgradeneeded?.();r.onsuccess?.();},0);
   return r;
  },
 };
 return {api,rows};
}

describe('Jornal: versioned offline recovery without Firestore',()=>{
 it('preserves independently recoverable versions, isolates UID and refuses published editions',async()=>{
  const {api,rows}=memoryIndexedDb();
  vi.stubGlobal('indexedDB',api);
  try{
   expect(await appendOfflineHistory(uid,draft('Primeira redação'),1000)).toBe(true);
   expect(await appendOfflineHistory(uid,draft('Segunda redação'),2000)).toBe(true);
   expect(await appendOfflineHistory(uid,draft('Segunda redação'),3000)).toBe(true);
   const items=await listOfflineHistory(uid);
   expect(items).toHaveLength(2);
   expect(items.map(x=>x.snapshot.blocks[0]?.text)).toEqual([
    'Segunda redação','Primeira redação',
   ]);
   expect(items[0]?.snapshot.subtitle).toBe('A verdade bem servida');
   expect(await listOfflineHistory('outro-editor')).toEqual([]);
   expect(await appendOfflineHistory(uid,{...draft('Publicado'),state:'published'},4000)).toBe(false);
   expect(await appendOfflineHistory('outra-conta',draft('Privado'),5000)).toBe(true);
   expect((await listOfflineHistory(uid)).length).toBe(2);
   // Invalid IndexedDB rows are never considered for restoration.
   rows.set('invalid',{key:'invalid',owner:uid,editionId:id,snapshot:{blocks:[]}});
   expect(await listOfflineHistory(uid)).toHaveLength(2);
  }finally{vi.unstubAllGlobals();}
 });
});
