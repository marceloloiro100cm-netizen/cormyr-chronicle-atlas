/**
 * Transactional espionage intelligence service. Firestore Emulator ONLY; no
 * public endpoint. Authorization comes from server-side access docs at
 * request time. Dossiers, findings, awards and events live in the spy stage.
 */
import {randomUUID} from 'node:crypto';
import {ROOT} from './stage-spy-emulator.mjs';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {ROOT as NOBLE_ROOT,sheetDocId} from './stage-noble-house-emulator.mjs';
import {ROOT as TIME_ROOT} from './stage-time-engine-emulator.mjs';
import * as core from './spy-intel-core.mjs';
import {spyScope} from './spy-agents-core.mjs';

const {SpyError,findingDocId}=core;
const PROJECT='demo-cormyr-migration';
const HASH=/^[a-f0-9]{64}$/;

export function createEmulatorSpyIntelService({db,auth,snapshotId,env=process.env}){
  assertEmulatorOnly(env,PROJECT);
  if(!HASH.test(snapshotId)||typeof db?.runTransaction!=='function'||typeof auth?.verifyIdToken!=='function')
    throw Error('Invalid isolated spy intelligence configuration');
  const stage=db.collection(ROOT).doc(snapshotId);
  const C=n=>stage.collection(n);
  const operations=C('operations'),decisions=C('decisions'),catalog=C('catalog'),nobleStats=C('nobleStats'),
    dossiers=C('dossiers'),findings=C('findings'),awards=C('awards'),intelEvents=C('intelEvents'),adminAudit=C('adminAudit');
  const access=db.collection('migrationDomainStage').doc(snapshotId).collection('access');
  const sheets=db.collection(NOBLE_ROOT).doc(snapshotId).collection('sheets');
  const calendar=db.collection(TIME_ROOT).doc(snapshotId).collection('calendar').doc('current');
  const uidOf=async token=>{
    try{return (await auth.verifyIdToken(token)).uid;}catch{throw new SpyError('denied','Acesso negado');}
  };
  const run=async(idToken,fn)=>{
    const uid=await uidOf(idToken);
    return db.runTransaction(async tx=>fn(tx,spyScope(uid,(await tx.get(access.doc(uid))).data())));
  };
  const data=s=>s&&s.exists?s.data():null;
  const docs=async(tx,q)=>(await tx.get(q)).docs.map(d=>d.data());
  const sheetOf=async(tx,houseId)=>data(await tx.get(sheets.doc(sheetDocId(houseId))));
  const narrator=actor=>{if(actor.role!=='narrador')throw new SpyError('denied','Acesso negado');};

  return {
    async read(idToken,houseId){
      return run(idToken,async(tx,actor)=>{
        const h=houseId==null?null:String(houseId);
        const [ds,fs,es,au,cat]=await Promise.all([docs(tx,dossiers),docs(tx,findings),docs(tx,intelEvents),
          actor.role==='narrador'?docs(tx,adminAudit):[],docs(tx,catalog)]);
        return core.readDossiers({actor,houseId:h,dossiers:ds,findings:fs,events:es,audit:au,catalog:cat});
      });
    },
    async operationStatus(idToken,operationId){
      return run(idToken,async(tx,actor)=>{
        narrator(actor);
        const id=String(operationId);
        const [op,decs,award]=await Promise.all([tx.get(operations.doc(id)),docs(tx,decisions.where('operationId','==',id)),
          tx.get(awards.doc(id))]);
        const decision=[...decs].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]||null;
        return core.operationStatus({actor,operation:data(op),decision,award:data(award)});
      });
    },
    async adminPending(idToken){
      return run(idToken,async(tx,actor)=>{
        narrator(actor);
        const [aw,ds]=await Promise.all([docs(tx,awards.where('processingState','==','waiting_catalog')),docs(tx,dossiers)]);
        return core.adminPending({actor,awards:aw,dossiers:ds});
      });
    },
    async adminOptions(idToken,dossierId){
      return run(idToken,async(tx,actor)=>{
        narrator(actor);
        const d=data(await tx.get(dossiers.doc(String(dossierId))));
        const [sheet,fs]=await Promise.all([d?sheetOf(tx,d.targetHouseId):null,d?docs(tx,findings.where('dossierId','==',d.id)):[]]);
        return core.adminOptions({actor,dossier:d,sheet,findings:fs});
      });
    },
    async finalize(idToken,{operationId,resources=null}){
      return run(idToken,async(tx,actor)=>{
        narrator(actor);
        const id=String(operationId);
        const award=data(await tx.get(awards.doc(id)));
        if(!award)return core.finalize({actor,award:null}).result;
        if(award.processingState==='complete')return core.finalize({actor,award}).result;
        const [op,decs,dossier,cal]=await Promise.all([tx.get(operations.doc(id)),
          docs(tx,decisions.where('operationId','==',id)),tx.get(dossiers.doc(award.dossierId)),tx.get(calendar)]);
        const operation=data(op),dos=data(dossier);
        const decision=decs.find(d=>d.resolution==='success')||null;
        const target=operation?operation.targetId:null;
        const [sheet,stats,fs]=await Promise.all([target?sheetOf(tx,target):null,target?tx.get(nobleStats.doc(target)):null,
          dos?docs(tx,findings.where('dossierId','==',dos.id)):[]]);
        const items=core.sourceItems({objective:award.objective,sheet,stats:data(stats),resources});
        const r=core.finalize({actor,award,operation,decision,dossier:dos,findings:fs,items,calendar:data(cal),newId:randomUUID});
        if(r.award){
          tx.set(awards.doc(id),r.award);
          tx.set(dossiers.doc(r.dossier.id),r.dossier);
          r.findings.forEach(f=>tx.set(findings.doc(findingDocId(f.dossierId,f.objective,f.subjectKey)),f));
          r.events.forEach(e=>tx.set(intelEvents.doc(e.id),e));
        }
        return r.result;
      });
    },
    async adminAction(idToken,{dossierId,objective,subjectKey,action,reason,resources=null}){
      return run(idToken,async(tx,actor)=>{
        narrator(actor);
        const d=data(await tx.get(dossiers.doc(String(dossierId))));
        if(!d)throw new SpyError('invalid','Dossiê inexistente');
        const ok=typeof objective==='string'&&typeof subjectKey==='string'&&subjectKey.length>0;
        const fid=ok?findingDocId(d.id,objective,subjectKey):null;
        const [existingSnap,sheet,stats,fs,cal]=await Promise.all([fid?tx.get(findings.doc(fid)):null,sheetOf(tx,d.targetHouseId),
          tx.get(nobleStats.doc(d.targetHouseId)),docs(tx,findings.where('dossierId','==',d.id)),tx.get(calendar)]);
        const needsItems=(action==='reveal'||action==='revalidate')&&core.OBJECTIVES.includes(objective);
        const items=needsItems?core.sourceItems({objective,sheet,stats:data(stats),resources}):null;
        const r=core.adminAction({actor,dossier:d,objective,subjectKey,action,reason,existing:data(existingSnap),items,
          calendar:data(cal),newId:randomUUID});
        if(r.remove)tx.delete(findings.doc(fid));
        if(r.finding)tx.set(findings.doc(fid),r.finding);
        tx.set(adminAudit.doc(r.audit.id),r.audit);
        tx.set(dossiers.doc(r.dossier.id),r.dossier);
        return {status:'applied',knownCount:core.knownCount(fs,objective,r)};
      });
    },
  };
}
