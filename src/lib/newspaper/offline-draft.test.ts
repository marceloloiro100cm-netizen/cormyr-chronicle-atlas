import {describe,expect,it} from 'vitest';
import {makeNewspaperBlock,type NewspaperEdition} from './model';
import {clearOfflineEdition,readOfflineEdition,recoverOfflineEdition,
 writeOfflineEdition,offlineEditionKey,listOfflineEditionBackups} from './offline-draft';

const store=()=>{
 const m=new Map<string,string>();
 return {getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);},
  removeItem:(k:string)=>{m.delete(k);},entries:m};
};
const uid='editor-leonardo';
const id='cloud-'+'a'.repeat(64);
const original=():NewspaperEdition=>({
 id,edition_no:3,campaign_date:'1522-11-21',title:'A Folha Sem Selo',
 subtitle:'A verdade bem servida',template:'classico',font_style:'classico',
 blocks:[makeNewspaperBlock('headline')],pdf_path:null,version:3,
 publication_revision:0,created_by:uid,updated_at:'',published_at:null,
 archived_at:null,cancelled_at:null,state:'draft',publish_on:null,
});
describe('local-only unpublished newspaper backups',()=>{
 it('retains every partially typed headline even when it is not ready to publish',()=>{
  const storage=store(),edition=original();
  const changed={...edition,blocks:[{...edition.blocks[0]!,text:'O cavaleiro desapareceu'}]};
  expect(writeOfflineEdition(storage,uid,changed,400)).toBe(true);
  const backup=readOfflineEdition(storage,uid,edition);
  expect(backup?.snapshot.blocks[0]?.text).toBe('O cavaleiro desapareceu');
  expect(backup?.updatedAt).toBe(400);
  const recovered=recoverOfflineEdition({...edition,version:4},backup!);
  expect(recovered.version).toBe(4);
  expect(recovered.blocks[0]?.text).toBe('O cavaleiro desapareceu');
 });
 it('does not leak across editorial accounts and never restores a published issue',()=>{
  const storage=store(),edition=original(),other={...edition,blocks:[
   {...edition.blocks[0]!,text:'Manchete privada'}]};
  writeOfflineEdition(storage,uid,other);
  expect(readOfflineEdition(storage,'outro-editor',edition)).toBeNull();
  expect(readOfflineEdition(storage,uid,{...edition,state:'published'})).toBeNull();
  expect(offlineEditionKey('bad/uid',id)).toBeNull();
  expect(writeOfflineEdition(storage,uid,{...edition,state:'published'})).toBe(false);
 });
 it('detects corrupted payload and can explicitly discard a local copy',()=>{
  const storage=store(),edition=original();
  writeOfflineEdition(storage,uid,{...edition,blocks:[{...edition.blocks[0]!,text:'Texto A'}]});
  storage.setItem(offlineEditionKey(uid,id)!,'{"invalid":true}');
  expect(readOfflineEdition(storage,uid,edition)).toBeNull();
  clearOfflineEdition(storage,uid,id);
  expect(storage.getItem(offlineEditionKey(uid,id)!)).toBeNull();
 });
 it('does not ask recovery if the local version is already identical to the server',()=>{
  const storage=store(),edition=original();
  writeOfflineEdition(storage,uid,edition);
  expect(readOfflineEdition(storage,uid,edition)).toBeNull();
 });
 it('lists recoverable local text even when there is no loaded Firebase edition',()=>{
  const saved=store(),storage={...saved,
   get length(){return saved.entries.size;},
   key:(index:number)=>[...saved.entries.keys()][index]??null,
  };
  const mine={...original(),blocks:[{...original().blocks[0]!,text:'Texto da terceira edição recuperado'}]};
  const other={...mine,id:'cloud-'+'b'.repeat(64)};
  expect(writeOfflineEdition(storage,uid,mine,1000)).toBe(true);
  expect(writeOfflineEdition(storage,'outra-conta',other,2000)).toBe(true);
  const mineOnly=listOfflineEditionBackups(storage,uid);
  expect(mineOnly).toHaveLength(1);
  expect(mineOnly[0]?.snapshot.blocks[0]?.text).toBe('Texto da terceira edição recuperado');
  expect(listOfflineEditionBackups(storage,'outra-conta')).toHaveLength(1);
  saved.setItem(offlineEditionKey(uid,id)!,'invalid-json');
  expect(listOfflineEditionBackups(storage,uid)).toHaveLength(0);
 });

});
