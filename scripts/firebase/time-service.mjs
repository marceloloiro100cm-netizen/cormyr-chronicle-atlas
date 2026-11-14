/**
 * Transactional Hub Temporal commands. Firestore Emulator ONLY; no public
 * endpoint. The whole change (calendar, houses, ledger, event snapshots,
 * audit, idempotency record) commits in ONE transaction or not at all.
 */
import {randomUUID} from 'node:crypto';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {ROOT} from './stage-time-engine-emulator.mjs';
import {ROOT as NOBLE_ROOT,sheetDocId,ledgerDocId} from './stage-noble-house-emulator.mjs';
import {ROOT as SCHEDULE_ROOT} from './stage-schedule-emulator.mjs';
import {ROOT as CHARACTER_ROOT} from './stage-characters-emulator.mjs';
import {publishScheduleSnapshots} from './schedule-core.mjs';
import {previewTimeChange} from './harptos-core.mjs';
import {planTimeChange,previewHouseTimeImpacts,requireNarratorScope,TimeError} from './time-core.mjs';

const PROJECT='demo-cormyr-migration';
const HASH=/^[a-f0-9]{64}$/;

export function createEmulatorTimeService({db,auth,snapshotId,env=process.env}){
  assertEmulatorOnly(env,PROJECT);
  if(!HASH.test(snapshotId)||typeof db?.runTransaction!=='function'||typeof auth?.verifyIdToken!=='function')
    throw Error('Invalid isolated time engine configuration');
  const stage=db.collection(ROOT).doc(snapshotId);
  const calRef=stage.collection('calendar').doc('current');
  const opsCol=stage.collection('operations'),auditCol=stage.collection('audit');
  const sheets=db.collection(NOBLE_ROOT).doc(snapshotId).collection('sheets');
  const ledger=db.collection(NOBLE_ROOT).doc(snapshotId).collection('ledger');
  const events=db.collection(SCHEDULE_ROOT).doc(snapshotId).collection('events');
  const scheduleAudit=db.collection(SCHEDULE_ROOT).doc(snapshotId).collection('audit');
  const transitionsCol=db.collection(CHARACTER_ROOT).doc(snapshotId).collection('transitions');
  const access=db.collection('migrationDomainStage').doc(snapshotId).collection('access');
  const uidOf=async token=>{
    try{return (await auth.verifyIdToken(token)).uid;}catch{throw new TimeError('denied','Acesso não autorizado');}
  };
  const rawAccess=async(tx,uid)=>{
    const raw=(await tx.get(access.doc(uid))).data();
    if(!raw||raw.userId!==uid)throw new TimeError('denied','Acesso não autorizado');
    return raw;
  };
  const houseList=async tx=>(await tx.get(sheets)).docs.map(d=>{const v=d.data();return {houseId:v.houseId,version:v.version,state:v.state};});
  const calendarOf=async tx=>{const s=await tx.get(calRef);return s.exists?s.data():null;};
  return {
    async getCalendar(idToken){
      const uid=await uidOf(idToken);
      return db.runTransaction(async tx=>{
        const raw=await rawAccess(tx,uid);
        if(raw.active!==true)throw new TimeError('denied','Acesso não autorizado');
        const c=await calendarOf(tx);
        if(!c)throw new TimeError('invalid','Calendário oficial indisponível');
        return {year:c.year,month:c.month,day:c.day,festival:c.festival,version:c.version};
      });
    },
    async preview(idToken,{mode,date,count,allowBackdate}){
      const uid=await uidOf(idToken);
      return db.runTransaction(async tx=>{
        requireNarratorScope(await rawAccess(tx,uid));
        const [c,houses]=[await calendarOf(tx),await houseList(tx)];
        if(!c)throw new TimeError('invalid','Calendário oficial indisponível');
        const p=previewTimeChange({calendar:c,mode,date:date??null,count:count??1,allowBackdate:allowBackdate===true,houseSheets:houses});
        return {...p,house_impacts:previewHouseTimeImpacts({calendar:c,targetDate:p.to,houses})};
      });
    },
    async publish(idToken,request){
      const uid=await uidOf(idToken);
      return db.runTransaction(async tx=>{
        requireNarratorScope(await rawAccess(tx,uid));
        const key=request&&typeof request.key==='string'?request.key:'';
        const [calendar,houses,opSnap,advances,evSnap]=[
          await calendarOf(tx),await houseList(tx),
          key?await tx.get(opsCol.doc(key)):{exists:false},
          await tx.get(ledger.where('action','==','calendar_advance')),
          await tx.get(events)];
        const advanceLedger=new Set(advances.docs.map(d=>{const v=d.data();return v.houseId+':'+v.campaignMonth;}));
        const plan=planTimeChange({calendar,existingOp:opSnap.exists?opSnap.data():null,request,actorUid:uid,
          houses,advanceLedger,newKey:()=>randomUUID()});
        if(plan.duplicate)return plan.result;
        // ON CONFLICT DO NOTHING per (calendar version, from, to): read before any write.
        const fresh=[];
        for(const t of plan.transitions){
          const q=await tx.get(transitionsCol.where('calendarVersion','==',t.calendarVersion)
            .where('fromYear','==',t.fromYear).where('toYear','==',t.toYear).limit(1));
          if(q.empty)fresh.push(t);
        }
        const sched=publishScheduleSnapshots({events:evSnap.docs.map(d=>d.data()),actorUid:uid,reason:plan.scheduleReason});
        for(const w of plan.houseWrites){
          tx.set(sheets.doc(sheetDocId(w.houseId)),w.sheet);
          tx.set(ledger.doc(ledgerDocId(w.houseId,w.ledger.operationKey)),w.ledger);
        }
        for(const e of sched.updated)tx.set(events.doc(e.id),e);
        for(const a of sched.audits)tx.set(scheduleAudit.doc(randomUUID()),{eventId:a.eventId,actor:a.actor,
          changedAt:new Date().toISOString(),reason:a.reason,beforeState:a.before??null,afterState:a.after??null});
        for(const t of fresh)tx.set(transitionsCol.doc(randomUUID()),{...t,actor:uid,createdAt:new Date().toISOString()});
        tx.set(calRef,plan.calendar);
        tx.set(opsCol.doc(key),{id:key,...plan.operation});
        tx.set(auditCol.doc(randomUUID()),plan.calendarAudit);
        return {...plan.result,housesReconciled:plan.houseWrites.length,eventsPublished:sched.updated.length};
      });
    },
    async history(idToken,limit=20){
      const uid=await uidOf(idToken);
      return db.runTransaction(async tx=>{
        requireNarratorScope(await rawAccess(tx,uid));
        const snap=await tx.get(opsCol);
        return snap.docs.map(d=>d.data()).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))
          .slice(0,Math.min(Math.max(1,limit|0),100)).map(o=>({id:o.id,mode:o.mode,fromDate:o.fromDate,toDate:o.toDate,
            reason:o.reason,createdAt:o.createdAt}));
      });
    },
  };
}
