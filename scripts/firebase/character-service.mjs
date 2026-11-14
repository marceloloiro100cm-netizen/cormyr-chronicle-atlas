/**
 * Narrator-only transactional commands for the canonical character registry.
 * Firestore Emulator ONLY; no public endpoint. Authorization is read from the
 * server-side access scope at request time.
 */
import {randomUUID} from 'node:crypto';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {ROOT,idOf,linkDocId,relationDocId} from './stage-characters-emulator.mjs';
import {requireNarrator,applyCharacterSave,validateRelation,applyReviewAction,
  characterAgeState,CharacterError} from './character-core.mjs';

const PROJECT='demo-cormyr-migration';
const HASH=/^[a-f0-9]{64}$/;
const MAX_DASHBOARD=2000;

export function createEmulatorCharacterService({db,auth,snapshotId,env=process.env}){
  assertEmulatorOnly(env,PROJECT);
  if(!HASH.test(snapshotId)||typeof db?.runTransaction!=='function'||
     typeof auth?.verifyIdToken!=='function')
    throw Error('Invalid isolated character configuration');
  const stage=db.collection(ROOT).doc(snapshotId);
  const domain=db.collection('migrationDomainStage').doc(snapshotId);
  const col=n=>stage.collection(n);
  const uidOf=async token=>{
    try{return (await auth.verifyIdToken(token)).uid;}
    catch{throw new CharacterError('denied','Acesso negado');}
  };
  const narrator=async(tx,uid)=>{
    const snap=await tx.get(domain.collection('access').doc(uid));
    const raw=snap.data();
    if(!raw||raw.userId!==uid)throw new CharacterError('denied','Acesso negado');
    requireNarrator(raw);
  };
  const audit=(tx,data)=>tx.set(col('audit').doc(randomUUID()),
    {...data,createdAt:new Date().toISOString()});
  return {
    async saveCharacter(idToken,{id=null,version=null,payload,reason}){
      const uid=await uidOf(idToken);
      return db.runTransaction(async tx=>{
        await narrator(tx,uid);
        const ref=id?col('characters').doc(id):null;
        const houseId=payload&&typeof payload.houseId==='string'?payload.houseId:null;
        const [cur,house]=await Promise.all([
          ref?tx.get(ref):null,
          houseId?tx.get(domain.collection('houses').doc(idOf('house',houseId))):null]);
        const newId=randomUUID();
        const r=applyCharacterSave({actorUid:uid,id,version,payload,reason,
          current:cur&&cur.exists?cur.data():null,
          houseExists:h=>h===houseId&&!!house&&house.exists,newId});
        const outRef=col('characters').doc(r.character.id);
        tx.set(outRef,r.character);
        audit(tx,{actor:uid,action:r.audit.action,characterId:r.character.id,
          beforeState:r.audit.before,afterState:r.audit.after,reason:reason.trim()});
        return {id:r.character.id,version:r.character.version,reviewStatus:r.character.reviewStatus};
      });
    },
    async saveRelation(idToken,{from,to,relation,note='',reason}){
      const uid=await uidOf(idToken);
      return db.runTransaction(async tx=>{
        await narrator(tx,uid);
        const [relSnap,a,b]=await Promise.all([tx.get(col('relations')),
          typeof from==='string'?tx.get(col('characters').doc(from)):null,
          typeof to==='string'?tx.get(col('characters').doc(to)):null]);
        const existing=relSnap.docs.map(d=>d.data());
        const known=new Set();
        if(a&&a.exists)known.add(from);if(b&&b.exists)known.add(to);
        validateRelation({from,to,relation,reason,existing,knownIds:known,
          parentEdges:existing.filter(r=>r.relation==='parent')});
        const doc={from,to,relation,note:String(note).slice(0,1000),approvedBy:uid,
          createdAt:new Date().toISOString()};
        tx.set(col('relations').doc(relationDocId(from,to,relation)),doc);
        audit(tx,{actor:uid,action:'relation_create',characterId:from,beforeState:null,
          afterState:{to,relation},reason:reason.trim()});
        return {from,to,relation};
      });
    },
    async reviewSource(idToken,{queueId,action,characterId=null,reason}){
      const uid=await uidOf(idToken);
      if(typeof queueId!=='string'||!queueId)throw new CharacterError('invalid','Fonte inválida');
      return db.runTransaction(async tx=>{
        await narrator(tx,uid);
        const qRef=col('queue').doc(queueId);
        const q=await tx.get(qRef);
        const queueItem=q.exists?q.data():null;
        const [c,l]=await Promise.all([
          characterId?tx.get(col('characters').doc(characterId)):null,
          queueItem?tx.get(col('links').doc(linkDocId(queueItem.sourceKind,queueItem.sourceKey))):null]);
        const r=applyReviewAction({queueItem,action,characterId,reason,
          character:c&&c.exists?c.data():null,existingLink:l&&l.exists?l.data():null});
        const at=new Date().toISOString();
        if(r.link)tx.set(col('links').doc(linkDocId(queueItem.sourceKind,queueItem.sourceKey)),
          {...r.link,confirmedBy:uid,confirmedAt:at});
        tx.update(qRef,{status:r.status,characterId:r.characterId,reviewNote:r.note,
          reviewedBy:uid,reviewedAt:at,updatedAt:at});
        audit(tx,{actor:uid,action:'source_'+action,characterId:r.characterId,
          sourceKind:queueItem.sourceKind,sourceKey:queueItem.sourceKey,
          beforeState:queueItem,afterState:{...queueItem,status:r.status},reason:r.note});
        return {status:r.status,characterId:r.characterId};
      });
    },
    async ageDashboard(idToken,{year,targetYear,limit=300}){
      const uid=await uidOf(idToken);
      if(!Number.isInteger(year)||!Number.isInteger(targetYear)||
         !Number.isInteger(limit)||limit<1||limit>MAX_DASHBOARD)
        throw new CharacterError('invalid','Ano ou limite inválido');
      const probe=await db.runTransaction(async tx=>{await narrator(tx,uid);return true;});
      if(!probe)throw new CharacterError('denied','Acesso negado');
      const [chars,links]=await Promise.all([col('characters').get(),col('links').get()]);
      const counts=new Map();
      for(const d of links.docs){const k=d.data().characterId;counts.set(k,(counts.get(k)||0)+1);}
      const people=chars.docs.map(d=>d.data())
        .sort((x,y)=>x.displayName.localeCompare(y.displayName)||x.id.localeCompare(y.id));
      const rows=people.map(c=>({id:c.id,displayName:c.displayName,houseId:c.houseId,
        before:characterAgeState(c,year,counts.get(c.id)||0),
        after:characterAgeState(c,targetYear,counts.get(c.id)||0)}));
      return {currentYear:year,targetYear,total:rows.length,
        truncated:rows.length>limit,characters:rows.slice(0,limit)};
    },
  };
}
