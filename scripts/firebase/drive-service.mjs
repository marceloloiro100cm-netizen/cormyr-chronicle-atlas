/**
 * Drive sync for campaign records on Firestore Emulator ONLY. Port of
 * claim_drive_binding, apply_drive_record, resolve_drive_import, the requeue
 * trigger and the records path of runDriveSync. The Drive itself is an
 * injected adapter (the real Google adapter plugs in at app integration);
 * letters and replies are not exported/imported here (mail slice).
 */
import {randomUUID} from 'node:crypto';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {ROOT,fileDocId,inboxDocId,outboxDocId} from './stage-drive-emulator.mjs';
import {ROOT as RECORD_ROOT,versionDocId} from './stage-records-emulator.mjs';
import {versionOf} from './record-core.mjs';
import {allowed,canonical,digest,decide,retryDelay,filename,validateEnvelope,recordEnvelope,applyDriveRecord,
  resolveDriveImport,bindingReady,leaseFree,LEASE_MS,NAME_RE,DriveError} from './drive-core.mjs';

const PROJECT='demo-cormyr-migration';
const HASH=/^[a-f0-9]{64}$/;
const MAX_FILE=2_100_000;
const MAX_SCAN=5000;

export function createEmulatorDriveService({db,auth,snapshotId,adapter=null,env=process.env,now=()=>new Date(),
  newToken=randomUUID}){
  assertEmulatorOnly(env,PROJECT);
  if(!HASH.test(snapshotId)||typeof db?.runTransaction!=='function'||typeof auth?.verifyIdToken!=='function')
    throw Error('Invalid isolated Drive configuration');
  const stage=db.collection(ROOT).doc(snapshotId);
  const bindings=stage.collection('bindings'),files=stage.collection('files'),inbox=stage.collection('inbox'),
    outbox=stage.collection('outbox');
  const recStage=db.collection(RECORD_ROOT).doc(snapshotId);
  const records=recStage.collection('records'),versions=recStage.collection('versions');
  const access=db.collection('migrationDomainStage').doc(snapshotId).collection('access');
  const iso=()=>now().toISOString();
  const isAdmin=raw=>!!raw&&raw.active===true&&raw.profile==='narrador'&&raw.admin===true&&raw.requirePasswordChange!==true;
  const uidOf=async token=>{
    try{return (await auth.verifyIdToken(token)).uid;}catch{throw new DriveError('denied','Acesso restrito ao administrador');}
  };
  const narrator=async(tx,uid)=>{
    const raw=(await tx.get(access.doc(uid))).data();
    if(!raw||raw.userId!==uid||!isAdmin(raw))throw new DriveError('denied','Acesso restrito ao administrador');
  };
  const writeVersion=(tx,rec)=>{const v=versionOf(rec);tx.set(versions.doc(versionDocId(v.recordId,v.version)),v);};
  const requeue=(tx,recordId,outboxDocs)=>{
    for(const d of outboxDocs)tx.update(d.ref,{state:'pending',nextAttemptAt:iso(),error:null});
  };

  const api={
    /** claim_drive_binding: durable 2-minute lease, only for fully authorized bindings. */
    async claimBinding({id,token}){
      return db.runTransaction(async tx=>{
        const s=await tx.get(bindings.doc(String(id)));
        if(!s.exists)return false;
        const b=s.data();
        if(!bindingReady(b)||!leaseFree(b,now()))return false;
        tx.update(s.ref,{leaseToken:token,leaseUntil:new Date(now().getTime()+LEASE_MS).toISOString()});
        return true;
      });
    },
    async releaseBinding({id,token}){
      return db.runTransaction(async tx=>{
        const s=await tx.get(bindings.doc(String(id)));
        if(s.exists&&s.data().leaseToken===token)tx.update(s.ref,{leaseToken:null,leaseUntil:null});
      });
    },
    /** apply_drive_record: server-only, all conditions re-read inside one transaction. */
    async applyDriveRecord({bindingId,fileId,doc,siteVersion}){
      return db.runTransaction(async tx=>{
        const bs=await tx.get(bindings.doc(String(bindingId)));
        if(!bs.exists)return false;
        const b=bs.data();
        const docId=doc&&typeof doc.id==='string'?doc.id:'';
        const [conf,mapSnap,recSnap,owner]=await Promise.all([
          tx.get(access.doc(String(b.confirmedBy))),
          tx.get(files.doc(fileDocId(b.id,'record',docId))),
          tx.get(records.doc(docId||'-')),
          b.scope==='player'?tx.get(access.doc(String(b.ownerUserId))):Promise.resolve(null)]);
        const mapped=mapSnap.exists&&mapSnap.data().fileId===fileId;
        const rec=recSnap.exists?recSnap.data():null;
        const ownerRaw=owner&&owner.exists?owner.data():null;
        const r=applyDriveRecord({binding:b,mapped,confirmerIsAdmin:isAdmin(conf.exists?conf.data():null),record:rec,
          doc,siteVersion,now:now(),
          ownerIsPlayer:!!ownerRaw&&ownerRaw.active===true&&ownerRaw.playerId===b.playerId,
          ownerEditsHouse:!!ownerRaw&&rec&&Array.isArray(ownerRaw.editHouseIds)&&ownerRaw.editHouseIds.includes(rec.houseId)});
        if(!r.applied)return false;
        tx.set(records.doc(rec.id),r.record);
        writeVersion(tx,r.record);
        return true;
      });
    },
    /** resolve_drive_import + drive_resolution_requeue, in one transaction. */
    async resolveImport(idToken,inboxId,choice,content=null){
      const uid=await uidOf(idToken);
      return db.runTransaction(async tx=>{
        await narrator(tx,uid);
        const q=await tx.get(inbox.where('id','==',String(inboxId)).limit(1));
        if(q.empty)throw new DriveError('conflict','Revisão já encerrada');
        const iref=q.docs[0].ref,i=q.docs[0].data();
        const bs=await tx.get(bindings.doc(String(i.bindingId)));
        if(!bs.exists)throw new DriveError('denied','Pasta não autorizada');
        const docId=i.folderSnapshot&&i.folderSnapshot.id;
        const [rs,ob]=await Promise.all([docId?tx.get(records.doc(String(docId))):null,
          docId?tx.get(outbox.where('entityId','==',String(docId)).where('entityType','==','record')):null]);
        const r=resolveDriveImport({actorUid:uid,inbox:i,binding:bs.data(),record:rs&&rs.exists?rs.data():null,
          choice,content,now:now()});
        tx.update(iref,{state:r.inboxState,resolvedBy:r.resolvedBy,resolvedAt:r.resolvedAt});
        if(r.inboxState==='applied'&&r.requeueRecordId){
          let rec=r.record;
          if(rec){tx.set(records.doc(rec.id),rec);writeVersion(tx,rec);}
          else if(rs&&rs.exists)tx.update(rs.ref,{syncState:'pending'}); // trigger: applied => pending
          if(rec&&r.insert){
            // New record: no outbox row yet; the runner derives one from syncState.
          }else if(ob)requeue(tx,r.requeueRecordId,ob.docs);
        }
        return {state:r.inboxState};
      });
    },
    async listInbox(idToken){
      const uid=await uidOf(idToken);
      await db.runTransaction(async tx=>narrator(tx,uid));
      return (await inbox.limit(MAX_SCAN).get()).docs.map(d=>d.data())
        .filter(i=>['review','conflict'].includes(i.state))
        .map(i=>({id:i.id,bindingId:i.bindingId,state:i.state,fileId:i.fileId,createdAt:i.createdAt}));
    },
    async listBindings(idToken){
      const uid=await uidOf(idToken);
      await db.runTransaction(async tx=>narrator(tx,uid));
      return (await bindings.get()).docs.map(d=>{const b=d.data();
        return {id:b.id,scope:b.scope,houseId:b.houseId,playerId:b.playerId,enabled:b.enabled,
          lastCheckedAt:b.lastCheckedAt,lastError:b.lastError};});
    },

    /** Port of runDriveSync for records. Drive access only through the injected adapter. */
    async runSync({bindingIds=null}={}){
      if(!adapter)throw new DriveError('invalid','Adaptador do Drive não configurado');
      let synced=0,review=0,failed=0;
      const all=(await bindings.get()).docs.map(d=>d.data()).filter(bindingReady)
        .sort((a,b)=>String(a.lastCheckedAt??'').localeCompare(String(b.lastCheckedAt??'')));
      const selected=(bindingIds?all.filter(b=>bindingIds.includes(b.id)):all).slice(0,bindingIds?10:2);
      const loadRecord=async id=>{const s=await records.doc(String(id)).get();return s.exists?s.data():null;};
      const ownerHouses=async b=>{
        if(b.scope!=='player')return new Set();
        const raw=(await access.doc(String(b.ownerUserId)).get()).data();
        return new Set(raw&&raw.active===true&&Array.isArray(raw.memberHouseIds)?raw.memberHouseIds:[]);
      };
      const siteEnvelope=async(type,id,b)=>{
        if(type!=='record')return null; // mail export arrives with the mail slice
        return recordEnvelope(await loadRecord(id),b,{ownerMemberHouseIds:await ownerHouses(b)});
      };
      const stageInbox=async(b,file,etag,remote,site,conflict)=>{
        const h=digest(remote),ref=inbox.doc(inboxDocId(b.id,file,h));
        await db.runTransaction(async tx=>{
          if((await tx.get(ref)).exists)return; // ignoreDuplicates
          tx.set(ref,{id:randomUUID(),bindingId:b.id,fileId:file,remoteHash:h,etag,siteSnapshot:site??null,
            folderSnapshot:remote,state:conflict?'conflict':'review',resolvedBy:null,resolvedAt:null,createdAt:iso()});
        });
        if(conflict&&site&&site.entityType==='record')await records.doc(site.id).update({syncState:'conflict'});
      };
      // Records that changed on the site always owe the Drive a copy.
      const enqueuePending=async()=>{
        const pending=(await records.where('syncState','==','pending').limit(MAX_SCAN).get()).docs.map(d=>d.data());
        for(const r of pending){
          const ref=outbox.doc(outboxDocId('record',r.id,r.version));
          await db.runTransaction(async tx=>{
            if((await tx.get(ref)).exists)return;
            tx.set(ref,{id:randomUUID(),entityType:'record',entityId:r.id,version:r.version,payload:{},state:'pending',
              attempts:0,error:null,createdAt:iso(),lastAttemptAt:null,nextAttemptAt:iso()});
          });
        }
      };
      await enqueuePending();
      for(const b0 of selected){
        const token=newToken();
        if(!await api.claimBinding({id:b0.id,token}))continue;
        const b=(await bindings.doc(b0.id).get()).data();
        try{
          const conf=(await access.doc(String(b.confirmedBy)).get()).data();
          if(!isAdmin(conf))throw new Error('Administrador que confirmou a pasta não está mais autorizado.');
          if(b.scope==='player'){
            const raw=(await access.doc(String(b.ownerUserId)).get()).data();
            if(!raw||raw.active!==true||raw.playerId!==b.playerId)throw new Error('Identidade da pasta individual não confirmada.');
          }
          if(b.scope==='master'&&!isAdmin((await access.doc(String(b.ownerUserId)).get()).data()))
            throw new Error('Pasta do mestre sem proprietário administrador.');
          const folder=b.technicalFolderId??b.folderId;
          const list=await adapter.list(folder);
          const mappings=(await files.where('bindingId','==',b.id).get()).docs.map(d=>({ref:d.ref,...d.data()}));
          for(const f of list){
            if(!NAME_RE.test(f.name)||Number(f.size??0)>MAX_FILE||!f.parents?.includes(folder))continue;
            const remote=await adapter.read(f.id);validateEnvelope(remote.envelope);
            if(!allowed(b,remote.envelope))continue;
            const e=remote.envelope,canonicalName=filename(e);
            const versionName=canonicalName.replace('.json','-v'+e.version+'-'+digest(e)+'.json');
            if(f.name!==canonicalName&&f.name!==versionName)continue;
            const site=await siteEnvelope(e.entityType,e.id,b);
            const m=mappings.find(x=>x.fileId===f.id);
            const h=digest(e);
            const head=mappings.find(x=>x.entityId===e.id&&x.entityType===e.entityType);
            if(!m&&head&&e.version<=validateEnvelope(head.baseSnapshot).version)continue;
            if(!m){
              if(site&&canonical(site)===canonical(e)){
                await fileDocRef(b,site).set({id:randomUUID(),bindingId:b.id,entityType:site.entityType,entityId:site.id,
                  fileId:f.id,etag:remote.etag,baseSnapshot:site,remoteHash:h,lastSyncedAt:iso()});
              }else{await stageInbox(b,f.id,remote.etag,e,site,Boolean(site));review++;}
              continue;
            }
            if(!site)continue;
            const done=(await inbox.where('bindingId','==',b.id).where('fileId','==',f.id).where('remoteHash','==',h)
              .where('state','==','applied').get());
            if(!done.empty)continue;
            const decision=decide(validateEnvelope(m.baseSnapshot),site,e);
            if(decision==='import'){
              if(site.entityType==='record'){
                const ok=await api.applyDriveRecord({bindingId:b.id,fileId:f.id,doc:e,siteVersion:site.version});
                if(!ok){await stageInbox(b,f.id,remote.etag,e,site,true);review++;}
                else await m.ref.update({baseSnapshot:e,remoteHash:h,etag:remote.etag});
              }else{await stageInbox(b,f.id,remote.etag,e,site,true);review++;}
            }else if(decision==='conflict'){await stageInbox(b,f.id,remote.etag,e,site,true);review++;}
          }
          const due=(await outbox.where('state','in',['pending','error']).limit(MAX_SCAN).get()).docs
            .map(d=>({ref:d.ref,...d.data()})).filter(q=>Date.parse(q.nextAttemptAt)<=now().getTime())
            .sort((a,b2)=>String(a.lastAttemptAt??'').localeCompare(String(b2.lastAttemptAt??''))).slice(0,100);
          for(const q of due){
            const lease=(await bindings.doc(b.id).get()).data();
            if(lease.leaseToken!==token)throw new Error('Execução perdeu a autorização temporária da pasta.');
            await bindings.doc(b.id).update({leaseUntil:new Date(now().getTime()+LEASE_MS).toISOString()});
            const e=await siteEnvelope(q.entityType,q.entityId,b);if(!e)continue;
            const mapped=mappings.find(x=>x.entityType===e.entityType&&x.entityId===e.id)??
              (await fileDocRef(b,e).get().then(s=>s.exists?s.data():null));
            const candidates=list.filter(f=>f.name===filename(e));
            if(candidates.length>1){await bindings.doc(b.id).update({lastError:'Arquivos duplicados; revisão necessária.'});continue;}
            const fileId=mapped?.fileId??candidates[0]?.id;
            try{
              const remote=fileId?await adapter.read(fileId):null;
              if(remote&&canonical(remote.envelope)!==canonical(e)){
                const rh=digest(remote.envelope);
                const rev=await inbox.where('bindingId','==',b.id).where('fileId','==',fileId??'').where('remoteHash','==',rh)
                  .where('state','==','applied').get();
                if(rev.empty&&(!mapped||decide(validateEnvelope(mapped.baseSnapshot),e,remote.envelope)!=='export')){
                  await stageInbox(b,fileId??'',remote.etag,remote.envelope,e,true);review++;continue;}
              }
              const out=remote&&canonical(remote.envelope)===canonical(e)?{id:fileId??'',...remote}
                :await adapter.write(folder,e,fileId,remote?.etag);
              await fileDocRef(b,e).set({id:mapped?.id??randomUUID(),bindingId:b.id,entityType:e.entityType,entityId:e.id,
                fileId:out.id,etag:out.etag,baseSnapshot:e,remoteHash:digest(out.envelope),lastSyncedAt:iso()});
              // Complete only after every authorized audience holds this version.
              const dests=[];
              for(const t of all)if(await siteEnvelope('record',e.id,t))dests.push(t);
              const copies=(await files.where('entityId','==',e.id).get()).docs.map(d=>d.data());
              const complete=dests.every(t=>copies.some(c=>c.bindingId===t.id&&c.baseSnapshot.version===e.version));
              if(complete){
                await db.runTransaction(async tx=>{
                  const rs=await tx.get(records.doc(e.id));
                  const ob=await tx.get(outbox.where('entityId','==',e.id).where('entityType','==','record'));
                  if(rs.exists&&rs.data().version===e.version)tx.update(rs.ref,{syncState:'synced',lastSyncedAt:iso()});
                  for(const o of ob.docs)if(o.data().version<=e.version)
                    tx.update(o.ref,{state:'synced',error:null,lastAttemptAt:iso()});
                });
              }
              synced++;
            }catch(err){
              failed++;
              await q.ref.update({state:'error',attempts:q.attempts+1,error:err instanceof Error?err.message:'Falha no Drive',
                lastAttemptAt:iso(),nextAttemptAt:new Date(now().getTime()+retryDelay(q.attempts+1)).toISOString()});
            }
          }
          await bindings.doc(b.id).update({lastCheckedAt:iso(),lastError:null});
        }catch(err){
          failed++;
          await bindings.doc(b.id).update({lastError:err instanceof Error?err.message:'Falha de sincronização',lastCheckedAt:iso()});
        }finally{await api.releaseBinding({id:b.id,token});}
      }
      return {synced,review,failed,
        message:synced+' cópias confirmadas; '+review+' revisões; '+failed+' falhas. Pastas não autorizadas permanecem desligadas.'};
      function fileDocRef(b,e){return files.doc(fileDocId(b.id,e.entityType,e.id));}
    },
  };
  return api;
}
