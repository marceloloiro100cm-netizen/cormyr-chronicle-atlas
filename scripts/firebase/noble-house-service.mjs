/**
 * Transactional noble house commit. Firestore Emulator ONLY; no public
 * endpoint. Authorization is resolved from the server-side access scope at
 * request time, never from client claims.
 */
import {randomUUID} from 'node:crypto';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {ROOT as RECORD_ROOT,versionDocId} from './stage-records-emulator.mjs';
import {versionOf} from './record-core.mjs';
import {ROOT,sheetDocId,ledgerDocId} from './stage-noble-house-emulator.mjs';
import {scopeOf,applyNobleHouseOperation,validateOperationRequest,NobleHouseError} from './noble-house-core.mjs';

const PROJECT='demo-cormyr-migration';
const HASH=/^[a-f0-9]{64}$/;

export function createEmulatorNobleHouseService({db,auth,snapshotId,env=process.env}){
  assertEmulatorOnly(env,PROJECT);
  if(!HASH.test(snapshotId)||typeof db?.runTransaction!=='function'||
     typeof auth?.verifyIdToken!=='function')
    throw Error('Invalid isolated noble house configuration');
  const stage=db.collection(ROOT).doc(snapshotId);
  const access=db.collection('migrationDomainStage').doc(snapshotId).collection('access');
  return {
    async commit(idToken,request){
      let uid;
      try{uid=(await auth.verifyIdToken(idToken)).uid;}
      catch{throw new NobleHouseError('denied','Acesso negado');}
      const req=validateOperationRequest(request);
      return db.runTransaction(async tx=>{
        const actor=scopeOf(uid,(await tx.get(access.doc(uid))).data());
        const sheetRef=stage.collection('sheets').doc(sheetDocId(req.houseId));
        const ledgerRef=stage.collection('ledger').doc(ledgerDocId(req.houseId,req.operationKey));
        const isUnit=req.action==='unit'||req.action==='unit_state';
        const recRoot=db.collection(RECORD_ROOT).doc(snapshotId);
        const [sheetSnap,ledgerSnap,recs]=await Promise.all([tx.get(sheetRef),tx.get(ledgerRef),
          isUnit?tx.get(recRoot.collection('records').where('houseId','==',req.houseId)
            .where('kind','==','character').where('visibility','==','house')):null]);
        const result=applyNobleHouseOperation({
          actor,request:req,
          currentSheet:sheetSnap.exists?sheetSnap.data():null,
          existingLedger:ledgerSnap.exists?ledgerSnap.data():null,
          commanderContext:isUnit?{houseRecords:recs.docs.map(d=>d.data()),newId:randomUUID}:null});
        if(result.duplicate)return {duplicate:true,version:result.version};
        tx.set(sheetRef,result.sheet);
        tx.set(ledgerRef,result.ledger);
        for(const rec of result.newRecords){
          tx.set(recRoot.collection('records').doc(rec.id),rec);
          const v=versionOf(rec);
          tx.set(recRoot.collection('versions').doc(versionDocId(v.recordId,v.version)),v);
        }
        return {duplicate:false,version:result.version,state:result.sheet.state};
      });
    },
  };
}
