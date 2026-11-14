/**
 * Transactional commands over campaign records. Firestore Emulator ONLY; no
 * public endpoint. Authorization is read from the server-side access scope at
 * request time, never from client claims.
 */
import {randomUUID,createHash} from 'node:crypto';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {ROOT,versionDocId} from './stage-records-emulator.mjs';
import {recordScopeOf,canReadRecord,applyRecordCreate,applyRecordSave,applyImportedSource,
  RecordError} from './record-core.mjs';

const PROJECT='demo-cormyr-migration';
const HASH=/^[a-f0-9]{64}$/;
const MAX_SCAN=5000;
const h=(t,id)=>createHash('sha256').update(t+':'+id).digest('hex');

export function createEmulatorRecordService({db,auth,snapshotId,env=process.env}){
  assertEmulatorOnly(env,PROJECT);
  if(!HASH.test(snapshotId)||typeof db?.runTransaction!=='function'||
     typeof auth?.verifyIdToken!=='function')
    throw Error('Invalid isolated record configuration');
  const stage=db.collection(ROOT).doc(snapshotId);
  const domain=db.collection('migrationDomainStage').doc(snapshotId);
  const records=stage.collection('records'),versions=stage.collection('versions');
  const uidOf=async token=>{
    try{return (await auth.verifyIdToken(token)).uid;}
    catch{throw new RecordError('denied','Acesso não autorizado');}
  };
  const actorIn=async(tx,uid)=>recordScopeOf(uid,(await tx.get(domain.collection('access').doc(uid))).data());
  const writeVersion=(tx,v)=>tx.set(versions.doc(versionDocId(v.recordId,v.version)),v);
  return {
    async createRecord(idToken,input){
      const uid=await uidOf(idToken);
      return db.runTransaction(async tx=>{
        const actor=await actorIn(tx,uid);
        const hid=input&&typeof input.houseId==='string'?input.houseId:null;
        const pid=input&&typeof input.playerId==='string'?input.playerId:null;
        const [hs,ps]=await Promise.all([
          hid?tx.get(domain.collection('houses').doc(h('house',hid))):null,
          pid?tx.get(domain.collection('players').doc(h('player',pid))):null]);
        const r=applyRecordCreate({actor,input,newId:randomUUID(),
          houseExists:x=>x===hid&&!!hs&&hs.exists,playerExists:x=>x===pid&&!!ps&&ps.exists});
        tx.set(records.doc(r.record.id),r.record);
        writeVersion(tx,r.version);
        return {id:r.record.id,version:r.record.version};
      });
    },
    async saveRecord(idToken,{id,version,title,content}){
      const uid=await uidOf(idToken);
      if(typeof id!=='string'||!id)throw new RecordError('denied','Acesso não autorizado');
      return db.runTransaction(async tx=>{
        const actor=await actorIn(tx,uid);
        const snap=await tx.get(records.doc(id));
        const r=applyRecordSave({actor,record:snap.exists?snap.data():null,version,title,content});
        tx.set(records.doc(id),r.record);
        writeVersion(tx,r.version);
        return {id,version:r.record.version,syncState:r.record.syncState};
      });
    },
    async getRecord(idToken,id){
      const uid=await uidOf(idToken);
      const actor=await db.runTransaction(tx=>actorIn(tx,uid));
      const snap=await records.doc(String(id)).get();
      if(!snap.exists||!canReadRecord(actor,snap.data()))
        throw new RecordError('denied','Acesso não autorizado');
      return snap.data();
    },
    async listRecords(idToken,{kind=null}={}){
      const uid=await uidOf(idToken);
      const actor=await db.runTransaction(tx=>actorIn(tx,uid));
      let q=records.limit(MAX_SCAN);
      if(kind)q=records.where('kind','==',kind).limit(MAX_SCAN);
      return (await q.get()).docs.map(d=>d.data()).filter(r=>canReadRecord(actor,r))
        .sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id))
        .map(({content,...rest})=>rest);
    },
    /** Server-side only (Drive sync); equals the service_role SQL function. */
    async serverSaveImportedSource({recordId,content,modifiedAt}){
      return db.runTransaction(async tx=>{
        const snap=await tx.get(records.doc(String(recordId)));
        const r=applyImportedSource({record:snap.exists?snap.data():null,content,modifiedAt});
        tx.set(records.doc(recordId),r.record);
        writeVersion(tx,r.version);
        return {id:recordId,version:r.record.version};
      });
    },
  };
}
