/**
 * Transactional commands over the shared schedule. Firestore Emulator ONLY;
 * no public endpoint. Authorization comes from the server-side access scope.
 */
import {randomUUID} from 'node:crypto';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {ROOT} from './stage-schedule-emulator.mjs';
import {requireActive,requireNarrator,applyScheduleSave,publishScheduleSnapshots,
  draftsView,publishedForMonth,ScheduleError} from './schedule-core.mjs';

const PROJECT='demo-cormyr-migration';
const HASH=/^[a-f0-9]{64}$/;

export function createEmulatorScheduleService({db,auth,snapshotId,env=process.env}){
  assertEmulatorOnly(env,PROJECT);
  if(!HASH.test(snapshotId)||typeof db?.runTransaction!=='function'||
     typeof auth?.verifyIdToken!=='function')
    throw Error('Invalid isolated schedule configuration');
  const stage=db.collection(ROOT).doc(snapshotId);
  const events=stage.collection('events'),auditCol=stage.collection('audit');
  const access=db.collection('migrationDomainStage').doc(snapshotId).collection('access');
  const uidOf=async token=>{
    try{return (await auth.verifyIdToken(token)).uid;}
    catch{throw new ScheduleError('denied','Acesso não autorizado');}
  };
  const rawAccess=async(tx,uid)=>{
    const raw=(await tx.get(access.doc(uid))).data();
    if(!raw||raw.userId!==uid)throw new ScheduleError('denied','Acesso não autorizado');
    return raw;
  };
  const writeAudit=(tx,a,actor)=>tx.set(auditCol.doc(randomUUID()),{
    eventId:a.eventId,actor:a.actor??actor,changedAt:new Date().toISOString(),
    reason:a.reason,beforeState:a.before??null,afterState:a.after??null});
  return {
    async saveEvent(idToken,payload){
      const uid=await uidOf(idToken);
      return db.runTransaction(async tx=>{
        requireNarrator(await rawAccess(tx,uid));
        const id=payload&&typeof payload.id==='string'&&payload.id?payload.id:null;
        const existing=id?await tx.get(events.doc(id)):null;
        const r=applyScheduleSave({payload,existing:existing&&existing.exists?existing.data():null,
          newId:randomUUID(),actorUid:uid});
        tx.set(events.doc(r.event.id),r.event);
        writeAudit(tx,r.audit,uid);
        return {id:r.event.id,version:r.event.version};
      });
    },
    async getDrafts(idToken){
      const uid=await uidOf(idToken);
      await db.runTransaction(async tx=>requireNarrator(await rawAccess(tx,uid)));
      return draftsView((await events.get()).docs.map(d=>d.data()));
    },
    async getPublished(idToken,{year,month}){
      const uid=await uidOf(idToken);
      await db.runTransaction(async tx=>requireActive(await rawAccess(tx,uid)));
      return publishedForMonth((await events.get()).docs.map(d=>d.data()),year,month);
    },
    /** Server-side hook for the Temporal engine: publishes the event snapshots. */
    async serverPublishEventSnapshots({actorUid,reason}){
      if(typeof actorUid!=='string'||!actorUid||typeof reason!=='string'||!reason)
        throw new ScheduleError('invalid','Publicação inválida');
      return db.runTransaction(async tx=>{
        const all=(await tx.get(events)).docs.map(d=>d.data());
        const r=publishScheduleSnapshots({events:all,actorUid,reason});
        for(const e of r.updated)tx.set(events.doc(e.id),e);
        for(const a of r.audits)writeAudit(tx,a,actorUid);
        return {published:r.updated.length};
      });
    },
  };
}
