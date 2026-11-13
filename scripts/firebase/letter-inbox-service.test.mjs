import assert from 'node:assert/strict';
import test from 'node:test';
import {createEmulatorInbox,InboxDenied} from './letter-inbox-service.mjs';

const hash='f'.repeat(64);
const env={FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'};
const ident=n=>n.repeat(64);
const when=i=>new Date(Date.UTC(2026,10,13,10,i)).toISOString();

function fixture(){
  const access=new Map(Object.entries({
    narrator:{userId:'narrator',profile:'narrador',active:true,admin:true,requirePasswordChange:false},
    alice:{userId:'alice',profile:'jogador',active:true,admin:false,playerId:'pa',requirePasswordChange:false,memberHouseIds:['a']},
    bob:{userId:'bob',profile:'jogador',active:true,admin:false,playerId:'pb',requirePasswordChange:false,memberHouseIds:['b']},
    editor:{userId:'editor',profile:'editor',active:true,admin:false,playerId:'pe',requirePasswordChange:false,memberHouseIds:[]},
    unknown:{userId:'unknown',profile:null,active:false,admin:false,playerId:null,requirePasswordChange:false,memberHouseIds:[]},
  }));
  const letters=[
    {id:ident('a'),senderUid:'narrator',senderName:'Mestre',senderPlayerId:null,
      recipientPlayerId:null,recipientHouseId:'a',subject:'A',content:'house A secret',publicationState:'delivered',createdAt:when(1),deletedAt:null},
    {id:ident('b'),senderUid:'narrator',senderName:'Mestre',senderPlayerId:null,
      recipientPlayerId:null,recipientHouseId:'b',subject:'B',content:'house B secret',publicationState:'delivered',createdAt:when(2),deletedAt:null},
    {id:ident('c'),senderUid:'alice',senderName:'A',senderPlayerId:'pa',
      recipientPlayerId:'pb',recipientHouseId:null,subject:'A to B',content:'reply',publicationState:'delivered',createdAt:when(3),deletedAt:null},
    {id:ident('d'),senderUid:'alice',senderName:'A',senderPlayerId:'pa',
      recipientPlayerId:null,recipientHouseId:'b',subject:'deleted',content:'should not show',publicationState:'delivered',createdAt:when(4),
      deletedAt:when(5)},
    {id:ident('e'),senderUid:'alice',senderName:'A',senderPlayerId:'pa',
      recipientPlayerId:null,recipientHouseId:null,subject:'bad both null',content:'quarantine mistake',publicationState:'delivered',createdAt:when(6),deletedAt:null},
    {id:ident('0'),senderUid:'alice',senderName:'A',senderPlayerId:'pa',
      recipientPlayerId:'pb',recipientHouseId:null,subject:'draft private',
      content:'should not show',publicationState:'draft',createdAt:when(8),deletedAt:null},
    {id:ident('1'),senderUid:'alice',senderName:'A',senderPlayerId:'pa',
      recipientPlayerId:'pb',recipientHouseId:null,subject:'scheduled private',
      content:'should not show',publicationState:'scheduled',createdAt:when(9),deletedAt:null},
    {id:ident('f'),senderUid:'alice',senderName:'A',senderPlayerId:'pa',
      recipientPlayerId:'pb',recipientHouseId:'b',subject:'bad double',content:'quarantine mistake',publicationState:'delivered',createdAt:when(7),deletedAt:null},
  ];
  const disabled=new Set();
  let status='complete';
  const wrap=letter=>({id:letter.id,exists:!!letter,data:()=>letter});
  class LetterQuery{
    constructor(predicates=[],max=Infinity){this.predicates=predicates;this.max=max;}
    where(field,operator,value){
      assert.equal(operator,'==');
      return new LetterQuery([...this.predicates,letter=>letter[field]===value],this.max);
    }
    limit(n){return new LetterQuery(this.predicates,n);}
    async get(){
      const found=letters.filter(letter=>this.predicates.every(p=>p(letter)))
        .slice(0,this.max).map(wrap);
      return {docs:found,size:found.length};
    }
    doc(id){return {get:async()=>{const found=letters.find(x=>x.id===id);
      return found?wrap(found):{exists:false};}};}
  }
  const db={collection(name){
    assert.equal(name,'migrationDomainStage');
    return {doc(snapshot){
      assert.equal(snapshot,hash);
      return {
        get:async()=>({exists:true,data:()=>({status})}),
        collection(type){
          if(type==='access')return {doc(uid){return {get:async()=>{
            const data=access.get(uid);
            return {exists:!!data,data:()=>data};
          }};}};
          assert.equal(type,'letters');
          return new LetterQuery();
        },
      };
    }};
  }};
  const auth={
    async verifyIdToken(token,checkRevoked){
      assert.equal(checkRevoked,true);
      if(!token.startsWith('token:'))throw Error('Bad token');
      return {uid:token.slice(6),profile:'narrador',admin:true};
    },
    async getUser(uid){return {uid,disabled:disabled.has(uid)};},
  };
  const inbox=createEmulatorInbox({db,auth,snapshotId:hash,env});
  return {inbox,access,letters,disabled,setStatus:next=>{status=next;}};
}

test('real roles and active membership determine each inbox, not token claims',async()=>{
  const {inbox}=fixture();
  const alice=(await inbox.listLetters({idToken:'token:alice'})).items;
  const bob=(await inbox.listLetters({idToken:'token:bob'})).items;
  const narrator=(await inbox.listLetters({idToken:'token:narrator'})).items;
  assert.deepEqual(alice.map(x=>x.subject),['A to B','A']);
  assert.deepEqual(bob.map(x=>x.subject),['A to B','B']);
  assert.deepEqual(narrator.map(x=>x.subject),['deleted','A to B','B','A']);
  assert.ok(alice.every(x=>!Object.hasOwn(x,'senderUid')&&!Object.hasOwn(x,'sourceId')));
  await assert.rejects(inbox.listLetters({idToken:'token:editor'}),InboxDenied);
  await assert.rejects(inbox.listLetters({idToken:'token:unknown'}),InboxDenied);
  await assert.rejects(inbox.listLetters({idToken:'unverified'}),InboxDenied);
});

test('direct reads never reveal another House or a historical delete',async()=>{
  const {inbox}=fixture();
  assert.equal((await inbox.getLetter({idToken:'token:alice',id:ident('a')})).subject,'A');
  assert.equal(await inbox.getLetter({idToken:'token:alice',id:ident('b')}),null);
  assert.equal(await inbox.getLetter({idToken:'token:alice',id:ident('d')}),null);
  assert.equal(await inbox.getLetter({idToken:'token:alice',id:ident('e')}),null);
  assert.equal(await inbox.getLetter({idToken:'token:narrator',id:ident('e')}),null);
  assert.equal((await inbox.getLetter({idToken:'token:narrator',id:ident('d')})).deleted,true);
  assert.equal(await inbox.getLetter({idToken:'token:alice',id:ident('1')}),null);
  assert.ok(!Object.hasOwn(inbox,'sendLetter'));
  await assert.rejects(inbox.getLetter({idToken:'token:alice',id:'../../access'}),/Invalid letter id/);
});

test('pagination is stable across sender and recipient queries and rejects bad cursors',async()=>{
  const {inbox}=fixture();
  const first=await inbox.listLetters({idToken:'token:alice',pageSize:1});
  assert.deepEqual(first.items.map(x=>x.subject),['A to B']);
  assert.ok(first.nextCursor);
  const second=await inbox.listLetters({idToken:'token:alice',pageSize:1,cursor:first.nextCursor});
  assert.deepEqual(second.items.map(x=>x.subject),['A']);
  assert.equal(second.nextCursor,null);
  await assert.rejects(inbox.listLetters({idToken:'token:alice',cursor:'invalid'}),/Invalid pagination/);
  await assert.rejects(inbox.listLetters({idToken:'token:alice',pageSize:1000}),/Invalid page size/);
});

test('revocation and stage readiness checked for every request; disabled Firebase UID denied',async()=>{
  const {inbox,access,disabled,setStatus}=fixture();
  assert.equal((await inbox.listLetters({idToken:'token:alice'})).items.length,2);
  access.get('alice').memberHouseIds=[];
  assert.deepEqual((await inbox.listLetters({idToken:'token:alice'})).items.map(x=>x.subject),['A to B']);
  access.get('alice').active=false;
  await assert.rejects(inbox.listLetters({idToken:'token:alice'}),InboxDenied);
  access.get('alice').active=true;
  disabled.add('alice');
  await assert.rejects(inbox.listLetters({idToken:'token:alice'}),InboxDenied);
  disabled.clear();
  setStatus('incomplete');
  await assert.rejects(inbox.listLetters({idToken:'token:alice'}),InboxDenied);
});

test('refuses to construct inbox outside loopback emulator or without verified Auth',()=>{
  const {inbox}=fixture();
  assert.ok(inbox);
  for(const badEnv of [{},{FIRESTORE_EMULATOR_HOST:'firestore.googleapis.com:443'}]){
    assert.throws(()=>createEmulatorInbox({db:{},auth:{},snapshotId:hash,env:badEnv}));
  }
  assert.throws(()=>createEmulatorInbox({db:{},auth:{},snapshotId:'cormyr',env}));
});
