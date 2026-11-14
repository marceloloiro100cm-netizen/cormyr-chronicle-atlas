/**
 * Transactional newspaper service. Firestore Emulator ONLY; no public
 * endpoint. Authorization is resolved from server-side access/player docs at
 * request time, never from client claims. Returns application-shaped
 * (snake_case) rows so the adapter stays trivial.
 */
import {randomUUID,createHash} from 'node:crypto';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {ROOT,readDocId} from './stage-newspaper-runtime-emulator.mjs';
import {ROOT as NOBLE_ROOT,sheetDocId,ledgerDocId} from './stage-noble-house-emulator.mjs';
import {ROOT as TIME_ROOT} from './stage-time-engine-emulator.mjs';
import {ROOT as SCHEDULE_ROOT} from './stage-schedule-emulator.mjs';
import * as core from './newspaper-core.mjs';

const {NewspaperError}=core;
const PROJECT='demo-cormyr-migration';
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha=(t,id)=>createHash('sha256').update(t+':'+id).digest('hex');
const byId=(a,b)=>String(a.id).localeCompare(String(b.id));

export function createEmulatorNewspaperService({db,auth,snapshotId,env=process.env}){
  assertEmulatorOnly(env,PROJECT);
  if(!HASH.test(snapshotId)||typeof db?.runTransaction!=='function'||typeof auth?.verifyIdToken!=='function')
    throw Error('Invalid isolated newspaper configuration');
  const stage=db.collection(ROOT).doc(snapshotId);
  const C=n=>stage.collection(n);
  const editions=C('editions'),revisions=C('revisions'),reads=C('reads'),commissions=C('commissions'),
    staff=C('staff'),models=C('models'),engravings=C('engravings'),settings=C('settings'),
    counters=C('meta').doc('counters');
  const domain=db.collection('migrationDomainStage').doc(snapshotId);
  const access=domain.collection('access'),players=domain.collection('players');
  const noble=db.collection(NOBLE_ROOT).doc(snapshotId);
  const calendar=db.collection(TIME_ROOT).doc(snapshotId).collection('calendar').doc('current');
  const events=db.collection(SCHEDULE_ROOT).doc(snapshotId).collection('events');
  const uidOf=async token=>{
    try{return (await auth.verifyIdToken(token)).uid;}catch{throw new NewspaperError('denied','Acesso não autorizado');}
  };
  const scopeOf=async(tx,uid)=>{
    const raw=(await tx.get(access.doc(uid))).data();
    let player=null;
    if(raw&&typeof raw.playerId==='string'&&raw.playerId)
      player=(await tx.get(players.doc(sha('player',raw.playerId)))).data()||null;
    return core.newspaperScope({uid,access:raw,player});
  };
  const run=async(idToken,fn)=>{const uid=await uidOf(idToken);return db.runTransaction(async tx=>fn(tx,await scopeOf(tx,uid)));};
  const data=s=>s.exists?s.data():null;
  const nextRevisionId=async tx=>{
    const s=await tx.get(counters);
    return (s.exists?s.data().revisionSeq:0)+1;
  };

  /** Shared by save, scheduled publication: persists the edition, its audit row and settled commissions. */
  const persistUpdate=async(tx,{current,patch,uid,now,pending,revisionId})=>{
    const r=core.applyEditionUpdate({current,patch,actorUid:uid,now});
    const settled=core.settleCommissions({edition:r.next,commissions:pending,now});
    tx.set(editions.doc(current.id),r.next);
    tx.set(revisions.doc(String(revisionId)),{id:revisionId,...r.revision});
    tx.set(counters,{revisionSeq:revisionId});
    for(const c of settled)tx.set(commissions.doc(c.id),c);
    return r.next;
  };
  const pendingFor=async(tx,blocks)=>{
    const ids=core.commissionIdsOf(blocks).filter(i=>UUID.test(i)).slice(0,80);
    const snaps=await Promise.all(ids.map(i=>tx.get(commissions.doc(i))));
    return snaps.filter(s=>s.exists).map(s=>s.data());
  };

  return {
    /* ------------------------------ editions ------------------------------ */
    async listEditions(idToken){
      return run(idToken,async(tx,scope)=>{
        core.requireReader(scope);
        const all=(await tx.get(editions)).docs.map(d=>d.data());
        return all.filter(e=>core.canSeeEdition(scope,e)).sort((a,b)=>b.editionNo-a.editionNo).map(core.editionRow);
      });
    },
    async createEdition(idToken,input){
      return run(idToken,async(tx,scope)=>{
        core.requireEditor(scope);
        const all=(await tx.get(editions)).docs.map(d=>d.data());
        const id=input&&typeof input.id==='string'?input.id:randomUUID();
        if((await tx.get(editions.doc(id))).exists)throw new NewspaperError('conflict','Edição já existe');
        const e=core.createEdition({input,actorUid:scope.uid,id,editionNo:core.nextEditionNo(all)});
        tx.set(editions.doc(id),e);
        return core.editionRow(e);
      });
    },
    async saveEdition(idToken,id,patch){
      return run(idToken,async(tx,scope)=>{
        core.requireEditor(scope);
        const current=data(await tx.get(editions.doc(String(id))));
        if(!current)throw new NewspaperError('invalid','Edição não encontrada');
        const merged={...current,...(patch&&typeof patch==='object'?patch:{})};
        const [pending,revisionId]=await Promise.all([pendingFor(tx,merged.blocks),nextRevisionId(tx)]);
        const next=await persistUpdate(tx,{current,patch,uid:scope.uid,now:undefined,pending,revisionId});
        return core.editionRow(next);
      });
    },
    /** delete_campaign_newspaper_draft */
    async deleteDraft(idToken,id){
      return run(idToken,async(tx,scope)=>{
        core.requireEditor(scope);
        const cur=data(await tx.get(editions.doc(String(id))));
        if(!cur)throw new NewspaperError('invalid','Edição não encontrada');
        if(cur.state!=='draft')throw new NewspaperError('invalid','Somente rascunhos podem ser excluídos; use Cancelar envio ou Arquivar');
        const revs=await tx.get(revisions.where('newspaperId','==',cur.id));
        revs.docs.forEach(d=>tx.delete(d.ref));
        tx.delete(editions.doc(cur.id));
        return {deleted:true};
      });
    },
    /** delete_campaign_newspaper: any state; releases the commissions' link. */
    async deleteEdition(idToken,id){
      return run(idToken,async(tx,scope)=>{
        core.requireEditor(scope);
        const cur=data(await tx.get(editions.doc(String(id))));
        if(!cur)throw new NewspaperError('invalid','Edição não encontrada');
        const [revs,rds,cms]=await Promise.all([
          tx.get(revisions.where('newspaperId','==',cur.id)),tx.get(reads.where('newspaperId','==',cur.id)),
          tx.get(commissions.where('newspaperId','==',cur.id))]);
        revs.docs.forEach(d=>tx.delete(d.ref));
        rds.docs.forEach(d=>tx.delete(d.ref));
        cms.docs.forEach(d=>tx.update(d.ref,{newspaperId:null}));
        tx.delete(editions.doc(cur.id));
        return {deleted:true};
      });
    },
    async listRevisions(idToken,newspaperId){
      return run(idToken,async(tx,scope)=>{
        core.requireEditor(scope);
        return (await tx.get(revisions.where('newspaperId','==',String(newspaperId)))).docs.map(d=>d.data())
          .sort((a,b)=>b.previousVersion-a.previousVersion)
          .map(r=>({id:r.id,newspaper_id:r.newspaperId,previous_version:r.previousVersion,changed_by:r.changedBy,
            changed_at:r.changedAt,snapshot:r.snapshot}));
      });
    },
    /** mark_campaign_newspaper_read */
    async markRead(idToken,newspaperId){
      return run(idToken,async(tx,scope)=>{
        const e=data(await tx.get(editions.doc(String(newspaperId))));
        const r=core.markRead({scope,edition:e});
        tx.set(reads.doc(readDocId(r.newspaperId,r.userId)),r);
        return r.readVersion;
      });
    },
    async listReads(idToken){
      return run(idToken,async(tx,scope)=>{
        core.requireReader(scope);
        const all=(await tx.get(reads)).docs.map(d=>d.data());
        return all.filter(r=>scope.canEdit||r.userId===scope.uid)
          .map(r=>({newspaper_id:r.newspaperId,user_id:r.userId,read_version:r.readVersion,read_at:r.readAt}));
      });
    },
    /** publish_due_campaign_newspapers: only the Kingdom calendar decides. */
    async publishDue(idToken){
      return run(idToken,async(tx,scope)=>{
        void scope; // any authenticated account may trigger it, like the SQL function
        const today=core.todayOf(data(await tx.get(calendar)));
        const all=(await tx.get(editions)).docs.map(d=>d.data());
        const due=core.dueEditions({editions:all,today});
        if(!due.length)return 0;
        const pendings=await Promise.all(due.map(e=>pendingFor(tx,e.blocks)));
        let seq=await nextRevisionId(tx);
        const now=new Date().toISOString();
        for(let i=0;i<due.length;i++){
          await persistUpdate(tx,{current:due[i],patch:{state:'published',publishOn:null},uid:scope.uid,now,
            pending:pendings[i],revisionId:seq++});
        }
        return due.length;
      });
    },
    /* ----------------------------- commissions ---------------------------- */
    async listCommissions(idToken){
      return run(idToken,async(tx,scope)=>{
        core.requireReader(scope);
        return (await tx.get(commissions)).docs.map(d=>d.data()).filter(c=>core.canSeeCommission(scope,c))
          .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||byId(a,b)).map(core.commissionRow);
      });
    },
    async commissionStory(idToken,{houseId,title,body,imagePath,key}){
      return run(idToken,async(tx,scope)=>{
        const h=String(houseId);
        const sheetRef=noble.collection('sheets').doc(sheetDocId(h));
        const ledgerRef=typeof key==='string'&&UUID.test(key)?noble.collection('ledger').doc(ledgerDocId(h,key)):null;
        const [sheetSnap,ledgerSnap,keyed,pend]=await Promise.all([
          tx.get(sheetRef),ledgerRef?tx.get(ledgerRef):null,
          typeof key==='string'?tx.get(commissions.where('requestKey','==',key)):null,
          tx.get(commissions.where('houseId','==',h).where('state','==','pending'))]);
        const r=core.commissionStory({scope,houseId:h,title,body,imagePath,key,sheet:data(sheetSnap),
          existingByKey:keyed&&keyed.docs[0]?keyed.docs[0].data():null,
          ledgerKeyTaken:!!ledgerSnap&&ledgerSnap.exists,pendingCount:pend.size,newId:randomUUID});
        if(r.alreadyApplied)return {commissionId:r.commissionId,alreadyApplied:true,houseVersion:r.houseVersion};
        tx.set(sheetRef,r.sheet);
        tx.set(ledgerRef,r.ledger);
        tx.set(commissions.doc(r.commission.id),r.commission);
        return r.result;
      });
    },
    async rejectCommission(idToken,commissionId,note){
      return run(idToken,async(tx,scope)=>{
        core.requireEditor(scope);
        const c=data(await tx.get(commissions.doc(String(commissionId))));
        const sheetRef=c?noble.collection('sheets').doc(sheetDocId(c.houseId)):null;
        const sheet=sheetRef?data(await tx.get(sheetRef)):null;
        const key=randomUUID();
        const r=core.rejectCommission({scope,commission:c,note,sheet,ledgerKey:key});
        tx.set(sheetRef,r.sheet);
        tx.set(noble.collection('ledger').doc(ledgerDocId(c.houseId,key)),r.ledger);
        tx.set(commissions.doc(c.id),r.commission);
        return r.result;
      });
    },
    async markCommissionsSeen(idToken,houseId){
      return run(idToken,async(tx,scope)=>{
        const h=String(houseId);
        const list=(await tx.get(commissions.where('houseId','==',h))).docs.map(d=>d.data());
        const changed=core.markCommissionsSeen({scope,houseId:h,commissions:list});
        changed.forEach(c=>tx.set(commissions.doc(c.id),c));
        return changed.length;
      });
    },
    /* ----------------------- staff / models / engravings ------------------ */
    ...crud({run,col:staff,clean:core.cleanStaff,row:core.staffRow,names:['listStaff','saveStaff','deleteStaff'],
      order:(a,b)=>a.name.localeCompare(b.name)||byId(a,b)}),
    ...crud({run,col:models,clean:core.cleanModel,row:core.modelRow,names:['listModels','saveModel','deleteModel'],
      order:(a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))||byId(a,b)}),
    ...crud({run,col:engravings,clean:core.cleanEngraving,row:core.engravingRow,
      names:['listEngravings','saveEngraving','deleteEngraving'],
      order:(a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))||byId(a,b),
      uniqueBy:'publicSrc'}),
    /* ------------------------------- settings ----------------------------- */
    async getSettings(idToken){
      return run(idToken,async(tx,scope)=>{
        core.requireEditor(scope);
        return core.settingsRow(data(await tx.get(settings.doc('current')))||core.DEFAULT_SETTINGS);
      });
    },
    async saveSettings(idToken,input){
      return run(idToken,async(tx,scope)=>{
        core.requireEditor(scope);
        const next={...core.cleanSettings(input),updatedBy:scope.uid,updatedAt:new Date().toISOString()};
        tx.set(settings.doc('current'),next);
        return core.settingsRow(next);
      });
    },
    /* ------------------------------- calendar ----------------------------- */
    async calendarEvents(idToken,year,month){
      return run(idToken,async(tx,scope)=>{
        const list=(await tx.get(events)).docs.map(d=>d.data());
        return core.calendarEvents({scope,events:list,year,month});
      });
    },
  };
}

function crud({run,col,clean,row,names,order,uniqueBy}){
  const [list,save,remove]=names;
  return {
    async [list](idToken){
      return run(idToken,async(tx,scope)=>{
        core.requireEditor(scope);
        return (await tx.get(col)).docs.map(d=>d.data()).sort(order).map(row);
      });
    },
    async [save](idToken,input){
      return run(idToken,async(tx,scope)=>{
        core.requireEditor(scope);
        const fields=clean(input);
        const id=input&&typeof input.id==='string'?input.id:null;
        const all=uniqueBy&&fields[uniqueBy]?(await tx.get(col)).docs.map(d=>d.data()):[];
        if(uniqueBy&&fields[uniqueBy]&&all.some(x=>x[uniqueBy]===fields[uniqueBy]&&x.id!==id))
          throw new NewspaperError('conflict','Item já cadastrado');
        const now=new Date().toISOString();
        if(id){
          const cur=(await tx.get(col.doc(id)));
          if(!cur.exists)throw new NewspaperError('invalid','Item não encontrado');
          const next={...cur.data(),...fields,...(cur.data().updatedAt!==undefined||'updatedAt' in cur.data()?{updatedAt:now}:{})};
          tx.set(col.doc(id),next);
          return row(next);
        }
        const nid=randomUUID();
        const next={id:nid,...fields,createdBy:scope.uid,createdAt:now,updatedAt:now};
        tx.set(col.doc(nid),next);
        return row(next);
      });
    },
    async [remove](idToken,id){
      return run(idToken,async(tx,scope)=>{
        core.requireEditor(scope);
        const s=await tx.get(col.doc(String(id)));
        if(!s.exists)throw new NewspaperError('invalid','Item não encontrado');
        tx.delete(col.doc(String(id)));
        return {deleted:true};
      });
    },
  };
}
