import {describe,expect,it} from 'vitest';
import {makeNewspaperBlock,type NewspaperEdition} from './model';
import {snapshotOf} from './editing';
import type {OfflineEditionBackup} from './offline-draft';
import {autoApplicableBackup,isOwnEarlierSave,pickWorkingDraft,recoveryCandidates} from './working-draft';
import {readWorkingEditionId,rememberWorkingEditionId} from './offline-draft';

const id=(c:string)=>'cloud-'+c.repeat(64);
const edition=(c:string,patch:Partial<NewspaperEdition>={}):NewspaperEdition=>({
 id:id(c),edition_no:3,campaign_date:'1522-11-24',title:'A Folha Sem Selo',
 subtitle:'A verdade bem servida',template:'classico',font_style:'classico',
 blocks:[{...makeNewspaperBlock('headline'),text:'Manchete '+c}],pdf_path:null,version:2,
 publication_revision:0,created_by:'',updated_at:'2026-11-22T15:00:00Z',published_at:null,
 archived_at:null,cancelled_at:null,state:'draft',publish_on:null,...patch,
});
const backup=(e:NewspaperEdition,text:string,updatedAt:number,baseVersion=e.version):OfflineEditionBackup=>({
 schema:1,owner:'leonardo',editionId:e.id,baseVersion,updatedAt,
 snapshot:{...snapshotOf(e),blocks:[{...e.blocks[0]!,text}]},
});

describe('uma única edição em andamento',()=>{
 it('reabre o rascunho com a atividade mais recente, nunca um rascunho qualquer',()=>{
  const sunday=edition('a',{updated_at:'2026-11-22T15:00:00Z'});
  const emptyToday=edition('f',{updated_at:'2026-11-24T19:00:00Z',version:1,blocks:[makeNewspaperBlock('headline')]});
  const older=edition('b',{updated_at:'2026-11-20T15:00:00Z'});
  const published=edition('c',{state:'published',published_at:'2026-11-23T00:00:00Z',updated_at:'2026-11-25T00:00:00Z'});
  // An empty draft created today (never written in) does not hide Sunday's work.
  expect(pickWorkingDraft([older,sunday,emptyToday,published],[])?.id).toBe(sunday.id);
  const editedToday={...emptyToday,version:2};
  expect(pickWorkingDraft([older,sunday,editedToday,published],[])?.id).toBe(editedToday.id);
  // Text typed on this device at 16:27 is more recent than the empty draft.
  const typed=backup(sunday,'Texto de hoje',Date.parse('2026-11-24T19:27:44Z'));
  expect(pickWorkingDraft([older,sunday,emptyToday,published],[typed])?.id).toBe(sunday.id);
 });
 it('sincroniza sozinha a cópia que continua a versão atual do Firebase',()=>{
  const e=edition('a');
  const copy=backup(e,'Continuação',Date.parse('2026-11-24T19:27:44Z'));
  expect(autoApplicableBackup(e,[copy])).toBe(copy);
  // Based on an older version: real divergence, never applied silently.
  expect(autoApplicableBackup(e,[backup(e,'Antiga',Date.parse('2026-11-24T19:27:44Z'),1)])).toBeNull();
  // Identical to Firebase: nothing to do.
  expect(autoApplicableBackup(e,[{...copy,snapshot:snapshotOf(e)}])).toBeNull();
 });
 it('reconhece no 409 a versão salva por este próprio dispositivo',()=>{
  const e=edition('a');
  const mine=backup(e,'Já enviado',1);
  const remote={...e,version:3,blocks:mine.snapshot.blocks};
  expect(isOwnEarlierSave(remote,e,[mine])).toBe(true);
  expect(isOwnEarlierSave({...remote,blocks:[{...e.blocks[0]!,text:'Outro redator'}]},e,[mine])).toBe(false);
 });
 it('lista versões do Firebase e do dispositivo sem duplicar conteúdo igual',()=>{
  const a=edition('a'),b=edition('b',{updated_at:'2026-11-21T10:00:00Z'});
  const same={...backup(a,'x',5),snapshot:snapshotOf(a)};
  const lost:OfflineEditionBackup={...backup(edition('d'),'Edição perdida',Date.parse('2026-11-24T19:27:44Z'))};
  const list=recoveryCandidates([a,b],[same,lost],a.id);
  expect(list.map(c=>c.origin)).toEqual(['device','firebase','firebase']);
  expect(list[0]!.draftExists).toBe(false);
  expect(list.find(c=>c.editionId===a.id)?.working).toBe(true);
 });
 it('lembra neste dispositivo a edição em que se escreveu por último',()=>{
  const m=new Map<string,string>();
  const store={getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);},removeItem:(k:string)=>{m.delete(k);}};
  expect(readWorkingEditionId(store,'leonardo')).toBeNull();
  rememberWorkingEditionId(store,'leonardo',id('a'));
  expect(readWorkingEditionId(store,'leonardo')).toBe(id('a'));
  rememberWorkingEditionId(store,'leonardo','../bad');
  expect(readWorkingEditionId(store,'leonardo')).toBe(id('a'));
 });
});
