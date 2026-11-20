/* eslint-disable @typescript-eslint/no-explicit-any -- server validates rows against original source contracts. */
import {createFirebaseCloudReadonly,CloudAccessError} from '../../../scripts/firebase/cloud-readonly-service.mjs';
import {readWorkspaceTable} from '../../../scripts/firebase/workspace-import.mjs';
import {createFirebaseCloudMail,CloudMailError} from '../../../scripts/firebase/cloud-mail-service.mjs';
import {cloudMailRuntimeApproved} from '../../../scripts/firebase/cloud-mail-runtime-approval.mjs';
import {mailReceiptId} from '../../../scripts/firebase/cloud-mail-receipt-core.mjs';
import {projectCloudLetters} from '../mail/firebase-operational-mail';
import {originalMailSend,originalMailBatch,originalMailReply,originalReplyDraft,composerOptions,OriginalMailBridgeError} from '../mail/firebase-original-send';
import {dateKey,parseDate} from '../calendar/harptos';
import {canReadLetterAs,canReadReply,mailPage,mailTrashPage,mailInsights,mailInsightsGrouped,mailOverviewGrouped,type MailDataset} from '../mail/mail-page-contract';
import {readWorkspaceSpy,loadImportedSpyData} from '../../../scripts/firebase/workspace-spy.mjs';
import {commitSpyAction,SpyWriteError} from './operational-spy-write';
import {readSpyOverlay,projectSpyOverlay} from '../../../scripts/firebase/workspace-spy-overlay.mjs';
import {commitSpyMission,previewSpyMission,spyMissionMethod}
 from './operational-spy-missions';
import {SpyOperationError,spyDigest} from './operational-spy-context';
import {commitSpyNarrator,spyNarratorMethod} from './operational-spy-narrator';
import {resolveSpyHouseDefense} from '../espionage/spy-house-target-defense';
import {calculateSpyDefense} from '../espionage/spy-defense';
import {spyLawDifficulty} from '../espionage/spy-law-difficulty';
import type {HouseState} from '../house/types';
import {projectWorkspaceMailTables, type WorkspaceMailTables} from '../mail/firebase-workspace-mail';
import {mergeHouseRuleCatalog} from '../house/firebase-house-rules-core';
import {houseReleaseReadiness} from '../house/firebase-house-release-readiness';
import {readOperationalHouseRules} from '../../../scripts/firebase/cloud-house-rules-service.mjs';
import {constructionStateHash} from '../house/firebase-construction-transaction';
import {operationalHouseEconomyIsReconciled} from '../house/firebase-house-read-integrity';
import {createFirebaseLetterConsequences,LetterConsequenceError} from '../house/firebase-letter-consequences';
import {queryRows,type Row,type QueryStep} from './query';
import {createHash,randomUUID} from 'node:crypto';
import {planEventSave,parseEventDate,isEventId} from '../../../scripts/firebase/cloud-schedule-events-core.mjs';
import {listCurrentAccountAccess} from '../../../scripts/firebase/operational-account-access.mjs';
import {readOperationalHouseLedger,mergeHouseLedger} from './operational-house-ledger';
import {readOperationalRecordDocs,projectOperationalRecords,
 projectOperationalVersions,readOperationalRecordVersionDocs} from './operational-records';
import {commitOperationalRecord,RecordWriteError} from './operational-record-write';
import {representationRpc,RepresentationRpcError} from './representation-rpc';
import {projectPrivateMailGallery} from './private-media-gallery';
import {createFirebaseCommissions,readFirebaseCommissions,FirebaseCommissionError}
 from '../newspaper/firebase-news-commissions.server';
import {readNewspaperStaffOverlay,parseStaffOperation,commitNewspaperStaff,NewspaperStaffError}
 from '../newspaper/firebase-newspaper-staff.server';
import {readPublicNewspaperReadCounts,PublicNewspaperError} from '../newspaper/firebase-public-newspaper.server';
import {OVERLAY_TABLES,isOverlayTable,mergeOverlay,readOverlayRows,planOverlayMutation,commitOverlayPlan,
 TableOverlayError} from './operational-table-overlay';
import {deletedNewspaperIds,markNewspaperDeleted} from '../../../scripts/firebase/newspaper-deleted.mjs';
import {readRuntimeApprovals,setRuntimeApprovals,RuntimeApprovalError} from './runtime-approvals';
import {readAgeRegistry,projectAgeDashboard,projectHouseAges,listAgeTransitions,CharacterAgesError} from './operational-character-ages';

export type Scope={uid:string;profile:'narrador'|'jogador'|'editor';playerId:string|null;memberHouseIds:string[];editHouseIds:string[]};
const denied=()=>{throw new CloudAccessError('access_denied',403);};
export const recordVisible=(s:Scope,r:Row)=>s.profile==='narrador'||s.profile==='jogador'&&
 (r['visibility']==='player'&&s.playerId!==null&&r['player_id']===s.playerId||r['visibility']==='house'&&s.memberHouseIds.includes(r['house_id']));
/**
 * O acervo importado é imutável: readWorkspaceTable só responde depois que a
 * importação foi marcada como completa. Relê-lo do Firestore a cada consulta
 * (centenas de documentos por tabela) deixava o login perto de um minuto.
 * Cache por instância do Firestore; falhas nunca ficam guardadas. Permissões
 * continuam aplicadas a cada consulta, depois da leitura.
 */
const TABLE_TTL_MS=30*60_000;
const tableCache=new WeakMap<object,Map<string,{at:number;rows:Promise<Row[]>}>>();
export function cachedWorkspaceTable(db:any,snapshotId:string,name:string,now=Date.now()):Promise<Row[]>{
 let byDb=tableCache.get(db);
 if(!byDb){byDb=new Map();tableCache.set(db,byDb);}
 const key=snapshotId+'|'+name,hit=byDb.get(key);
 // Cada consulta recebe linhas próprias: nada do cache é alterado por engano.
 const copy=(rows:Row[])=>rows.map(r=>({...r}));
 if(hit&&now-hit.at<TABLE_TTL_MS)return hit.rows.then(copy);
 const entry={at:now,rows:readWorkspaceTable(db,snapshotId,name) as Promise<Row[]>};
 byDb.set(key,entry);
 entry.rows.catch(()=>{if(byDb.get(key)===entry)byDb.delete(key);});
 return entry.rows.then(copy);
}
/** Leituras idênticas simultâneas (várias páginas da caixa ao mesmo tempo)
 * compartilham a mesma consulta em andamento. Nada fica guardado depois. */
const inflight=new WeakMap<object,Map<string,Promise<any>>>();
function shared<T>(db:any,key:string,read:()=>Promise<T>):Promise<T>{
 let byDb=inflight.get(db);
 if(!byDb){byDb=new Map();inflight.set(db,byDb);}
 const running=byDb.get(key);if(running)return running;
 const p=read().finally(()=>{if(byDb.get(key)===p)byDb.delete(key);});
 byDb.set(key,p);return p;
}
/** cacheImportedTables: ligado só pela rota de produção (acervo imutável). */
export function createWorkspaceService({db,auth,snapshotId,cacheImportedTables=false}: {db:any;auth:any;snapshotId:string;cacheImportedTables?:boolean}){
 const cloud=createFirebaseCloudReadonly({db,auth,snapshotId,projectId:'cormyr',enabled:true});
 async function execute(token:string,input:any){
  const scope=await cloud.workspaceScope(token),admin=scope.profile==='narrador',editor=admin||scope.profile==='editor';
  const cache=new Map<string,Promise<Row[]>>();
  const rows=(name:string)=>{
   if(!cache.has(name))cache.set(name,(async()=>{
    // Tabelas sem cópia no acervo (ex.: caderno do Narrador) começam vazias.
    const importedTable=async()=>{
     try{
      return cacheImportedTables?await cachedWorkspaceTable(db,snapshotId,name)
       :await readWorkspaceTable(db,snapshotId,name) as Row[];
     }catch(e){
      if(isOverlayTable(name)&&String((e as Error)?.message??e).includes('workspace_table_not_supported'))return [] as Row[];
      throw e;
     }
    };
    const original=await importedTable();
    // Linhas gravadas pelas telas no Firebase (cópia operacional auditada).
    if(isOverlayTable(name))
     return mergeOverlay(original,await readOverlayRows(db,snapshotId,name),OVERLAY_TABLES[name]!.key);
    return original;
   })());
   return cache.get(name)!;
  };
  const once=<T,>(key:string,read:()=>Promise<T>)=>cacheImportedTables?shared(db,key,read):read();
  const houseAllowed=(id:string)=>admin||scope.profile==='jogador'&&scope.memberHouseIds.includes(id);
  const checkHouse=(id:string)=>{if(typeof id!=='string'||!houseAllowed(id))denied();};
  // Permissões atuais com overlay privado: jamais alterar ou autorizar pelo acervo.
  let accessPromise:Promise<any[]>|undefined;
  const accessDocs=()=>accessPromise??=listCurrentAccountAccess(db,snapshotId);
  const players=async():Promise<Row[]>=>{
   const [original,access]=await Promise.all([rows('campaign_players'),accessDocs()]);
   const mapped=original.map(p=>{
    const a=access.find((a:any)=>a.userId===p['user_id']&&a.playerId===p['id']);
    return {...p,
      name:a?.name??p['name'],
      roster_house_id:a?.rosterHouseId??p['roster_house_id'],
      active:a?.active===true&&a?.requirePasswordChange===false,
      require_password_change:a?.requirePasswordChange===true};
   });
   const existing=new Set(original.map(p=>p['id']));
   const added=access.filter((a:any)=>a.profile==='jogador'&&
     typeof a.playerId==='string'&&!existing.has(a.playerId)&&
     typeof a.name==='string'&&a.name.trim()).map((a:any)=>({
       id:a.playerId,user_id:a.userId,name:a.name,
       roster_house_id:a.rosterHouseId??a.memberHouseIds?.[0]??null,
       folder_id:null,active:a.active===true&&a.requirePasswordChange===false,
       require_password_change:a.requirePasswordChange===true,
     }));
   return [...mapped,...added];
  };
  const memberships=async()=> (await accessDocs()).filter((a:any)=>
    a.active===true&&a.requirePasswordChange===false&&a.profile==='jogador'&&a.playerId)
   .flatMap((a:any)=>a.memberHouseIds.map((h:string)=>({
     player_id:a.playerId,house_id:h,can_edit:a.editHouseIds.includes(h),
     can_edit_attributes:a.attrHouseIds?.includes(h)??false,
   })));
  // Operational read receipts live outside the immutable migration snapshot.
  // Reconcile them only under the independently approved live mail runtime.
  // Never use an unapproved or partially scanned receipt set for read indicators.
  const addOperationalMail=async(letters:Row[],historical:Row[]):Promise<{letters:Row[];receipts:Row[];openRound:number|null}>=>{
   const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);
   const [live,mailGate,calendar]=await Promise.all([
    runtime.get(),db.collection('campaignMailRuntime').doc(snapshotId).get(),
    db.collection('migrationTimeEngineStage').doc(snapshotId).collection('calendar').doc('current').get()]);
   if(!live.exists||!mailGate.exists||!calendar.exists||
      !cloudMailRuntimeApproved(live.data(),mailGate.data(),calendar.data(),snapshotId))
    return {letters,receipts:historical,openRound:null};
   // Read the whole bounded approved runtime before exposing any new row.
   const [mailDocs,snapshot,moderation]=await Promise.all([
    once(snapshotId+'|letters',()=>runtime.collection('letters').limit(501).get()),
    once(snapshotId+'|receipts',()=>runtime.collection('mailReadReceipts').limit(2001).get()),
    once(snapshotId+'|legacy-moderation',()=>runtime.collection('legacyMailModeration').limit(501).get()),
   ]) as [any,any,any];
   if(!Array.isArray(mailDocs.docs)||mailDocs.docs.length>500)
    throw new CloudAccessError('mailbox_requires_pagination',503);
   if(!Array.isArray(moderation.docs)||moderation.docs.length>500)
    throw new CloudAccessError('mail_moderation_too_large',503);
   const markers=new Map<string,Record<string,unknown>>();
   for(const d of moderation.docs){
    const m=d.data();
    if(!m||typeof m.letterId!=='string'||
       d.id!==createHash('sha256').update('legacy-mail:'+m.letterId).digest('hex')||
       m.sourceSnapshotId!==snapshotId||
       !Number.isSafeInteger(m['version'])||Number(m['version'])<1||
       !(m['deletedAt']===null||typeof m['deletedAt']==='string'&&
         Number.isFinite(Date.parse(m['deletedAt'])))||
       (m['deletedAt']!==null&&m['removalKind']!=='excluida')||
       markers.has(m.letterId))
      throw new CloudAccessError('mail_moderation_integrity_failed',503);
    markers.set(m.letterId,m);
   }
   const archived:Row[]=letters.map(l=>{
    const mark=markers.get(String(l['id']));
    return {...l,source:'imported',historical_source:true,
      ...(mark?{deleted_at:mark['deletedAt'],
       removal_kind:mark['removalKind'],version:mark['version']}:{}),
    };
   });
   const operational=projectCloudLetters(mailDocs.docs,snapshotId,live.data().openRound as number);
   const all=[...archived,...operational];
   if(new Set(all.map(l=>l['id'])).size!==all.length)
    throw new CloudAccessError('mailbox_id_conflict',503);
   if(!Array.isArray(snapshot.docs)||snapshot.docs.length>2000)
    throw new CloudAccessError('mail_receipts_too_large',503);
   const existing=new Map<string,Row>();
   const key=(letterId:string,uid:string)=>letterId+'|'+uid;
   for(const row of historical)existing.set(key(String(row['letter_id']),String(row['user_id'])),row);
   const delivered=new Set(all.filter(l=>l['publication_state']==='delivered'&&
    l['deleted_at']==null).map(l=>l['id']));
   const safe=/^[^/\u0000-\u001f\u007f]{1,128}$/;
   for(const doc of snapshot.docs){
    const data=doc.data(),uid=data?.viewerUid,letterId=data?.letterId,at=data?.readAt;
    if(!['imported','firebase-cloud'].includes(String(data?.source))||typeof uid!=='string'||!safe.test(uid)||
       typeof letterId!=='string'||!safe.test(letterId)||!delivered.has(letterId)||
       typeof at!=='string'||at.length>56||!Number.isFinite(Date.parse(at))||
       doc.id!==mailReceiptId(uid,data.source,letterId))continue;
    const k=key(letterId,uid),current=existing.get(k);
    if(!current||String(current['read_at'])<at)
      existing.set(k,{letter_id:letterId,user_id:uid,read_at:at});
   }
   operationalApproved=true;
   return {letters:all,receipts:[...existing.values()],
    openRound:live.data().openRound as number};
  };
  // True only after BOTH mail runtimes were verified in this request.
  let operationalApproved=false;
  let mailPromise:Promise<MailDataset>|undefined;
  const mail=()=>mailPromise??=(async()=>{
   const [letters,replies,receipts,p,m,h,rounds]=await Promise.all([
    rows('campaign_letters'),rows('letter_replies'),rows('letter_receipts'),players(),memberships(),rows('campaign_houses'),rows('letter_rounds')]);
   // Editor-Chefe: projected with editorUserIds, so the original contract
   // returns only delivered, non-deleted correspondence (read-only).
   const personHouse=new Map(p.map(row=>[row['id'],row['roster_house_id']]));
   const personAddressed=letters.map(l=>{
    const pId=l['recipient_player_id'];
    const h=typeof pId==='string'?personHouse.get(pId):null;
    return typeof h==='string'&&h.length>0&&l['recipient_house_id']==null
      ?{...l,recipient_house_id:h,recipient_player_id:null,
        legacy_person_recipient_id:pId}:l;
   });
   const merged=await addOperationalMail(personAddressed,receipts);
   // Historical rounds remain immutable. Once independently reconciled,
   // the operational round supersedes stale "open" archive flags in the UI.
   const currentRounds=merged.openRound===null?rounds:[
    ...rounds.filter(r=>r['number']!==merged.openRound)
     .map(r=>r['status']==='open'?{...r,status:'closed',closed:true}:r),
    {...(rounds.find(r=>r['number']===merged.openRound)??{number:merged.openRound}),
     status:'open',closed:false},
   ];
   const dataset=projectWorkspaceMailTables({campaign_letters:merged.letters,letter_replies:replies,letter_receipts:merged.receipts,
    campaign_players:p,house_memberships:m,campaign_houses:h,letter_rounds:currentRounds} as WorkspaceMailTables,
    {uid:scope.uid,profile:scope.profile,
     playerId:scope.profile==='editor'?null:scope.playerId,
     memberHouseIds:scope.profile==='editor'?[]:scope.memberHouseIds});
   // A foreign letter may have a valid receipt identity, but it must never
   // reveal its existence through the original table/RPC compatibility API.
   const visibleLetterIds=new Set(dataset.letters.filter(l=>canReadLetterAs(dataset,l,scope.uid)).map(l=>l.id));
   return {...dataset,receipts:dataset.receipts.filter(r=>visibleLetterIds.has(r.letter_id))};
  })();
  /** Replaced texts of author-edited Cloud letters, only for their author
   * (or the Narrator) and only under the approved mail runtime. */
  const cloudVersions=async(ds:MailDataset):Promise<Row[]>=>{
   if(!operationalApproved)return [];
   const own=new Set(ds.letters.filter(l=>l['source']==='firebase-cloud'&&
    (admin||l.sender_user_id===scope.uid)).map(l=>l.id));
   if(!own.size)return [];
   const snap=await db.collection('campaignCloudRuntime').doc(snapshotId)
    .collection('letterVersions').limit(2001).get();
   if(!Array.isArray(snap.docs)||snap.docs.length>2000)
    throw new CloudAccessError('mail_versions_too_large',503);
   return snap.docs.map((d:any)=>({id:d.id,...d.data()})).filter((v:any)=>
    own.has(v.letterId)&&Number.isSafeInteger(v.version)&&typeof v.content==='string')
    .map((v:any)=>({id:v.id,letter_id:v.letterId,version:v.version,
     snapshot:{subject:v.subject,content:v.content},created_at:v.replacedAt}));
  };
  const mailFlag=()=>{
   if(process.env['CORMYR_FIREBASE_CLOUD_MAIL_ENABLED']!=='true')
    throw new CloudAccessError('workspace_operation_not_implemented',501);
  };
  const cloudMail=()=>createFirebaseCloudMail({db,auth,snapshotId,projectId:'cormyr',enabled:true});
  const asAccess=async<T,>(work:()=>Promise<T>)=>{
   try{return await work();}
   catch(e){if(e instanceof CloudMailError)throw new CloudAccessError(e.code,e.status);throw e;}
  };
  const SAFE=/^[^/\u0000-\u001f\u007f]{1,128}$/;
  /** A lifecycle action needs a visible, Cloud-authored runtime letter.
   * Historical (imported) letters belong to closed weeks: immutable. */
  const lifecycleTarget=async(id:unknown,{deleted}:{deleted:boolean})=>{
   if(typeof id!=='string'||!SAFE.test(id))throw new CloudAccessError('invalid_mail_lifecycle_request',400);
   const ds=await mail();
   const row=ds.letters.find(l=>l.id===id);
   const visibleRow=row&&(deleted
    ?row.deleted_at!==null&&(admin||row.sender_user_id===scope.uid)
    :canReadLetterAs(ds,row,scope.uid));
   if(!row||!visibleRow)throw new CloudAccessError('access_denied',403);
   if(row['source']!=='firebase-cloud'){
    if(!admin)throw new CloudAccessError('access_denied',403);
    return {row,version:0};
   }
   const version=row['version'];
   if(!Number.isSafeInteger(version))throw new CloudAccessError('invalid_mail_lifecycle_request',400);
   return {row,version:version as number};
  };
  const eventsCollection=()=>db.collection('campaignCloudRuntime').doc(snapshotId).collection('scheduleEvents');
  const cloudEvents=async():Promise<Row[]>=>{
   const snap=await eventsCollection().limit(2001).get();
   if(!Array.isArray(snap.docs)||snap.docs.length>2000)throw new CloudAccessError('schedule_events_too_large',503);
   return snap.docs.map((d:any)=>d.data()).filter((v:any)=>isEventId(v?.id)&&Number.isSafeInteger(v?.version));
  };
  const consequences=()=>createFirebaseLetterConsequences({db,snapshotId});
  const notesCollection=()=>db.collection('campaignCloudRuntime').doc(snapshotId).collection('narratorMailNotes');
  const runtimeApproved=async()=>{
   const [live,gate,calendar]=await Promise.all([
    db.collection('campaignCloudRuntime').doc(snapshotId).get(),
    db.collection('campaignMailRuntime').doc(snapshotId).get(),
    db.collection('migrationTimeEngineStage').doc(snapshotId).collection('calendar').doc('current').get()]);
   return live.exists&&gate.exists&&calendar.exists&&
    cloudMailRuntimeApproved(live.data(),gate.data(),calendar.data(),snapshotId);
  };
  const cloudNotes=async():Promise<Row[]>=>{
   if(!admin||!await runtimeApproved())return [];
   const snap=await notesCollection().limit(2001).get();
   if(!Array.isArray(snap.docs)||snap.docs.length>2000)throw new CloudAccessError('mail_notes_too_large',503);
   return snap.docs.map((d:any)=>d.data()).filter((v:any)=>typeof v?.id==='string').map((v:any)=>({
    id:v.id,letter_id:v.letterId??null,reply_id:v.replyId??null,notes:v.notes,
    updated_by:v.updatedBy,updated_at:v.updatedAt}));
  };
  const NOTE_FIELDS=['ordem_recebida','execucao','resultado','conhecimento','pendencia'];
  /** "Registro do Mestre": Narrator-only, private, versioned and audited. */
  const saveNarratorNote=async(row:unknown)=>{
   if(!admin)denied();
   mailFlag();
   if(!await runtimeApproved())throw new CloudAccessError('mail_runtime_not_approved',503);
   const r=row as Record<string,unknown>;
   const id=r?.['id'],notes=r?.['notes'] as Record<string,unknown>|undefined;
   if(!r||typeof r!=='object'||typeof id!=='string'||!/^(letter|reply):[^/\u0000-\u001f\u007f]{1,128}$/.test(id)||
      !notes||typeof notes!=='object'||Array.isArray(notes)||
      Object.keys(notes).some(k=>!NOTE_FIELDS.includes(k))||
      Object.values(notes).some(v=>typeof v!=='string'||Buffer.byteLength(v,'utf8')>8000))
    throw new CloudAccessError('invalid_mail_note',400);
   const target=id.slice(id.indexOf(':')+1);
   const ds=await mail();
   const exists=id.startsWith('letter:')?ds.letters.some(l=>l.id===target):ds.replies.some(x=>x.id===target);
   if(!exists)throw new CloudAccessError('access_denied',403);
   const key=createHash('sha256').update('mail-note:'+id).digest('hex');
   const ref=notesCollection().doc(key);
   const audit=db.collection('campaignCloudRuntime').doc(snapshotId).collection('mailAudits');
   await db.runTransaction(async(tx:any)=>{
    const prev=await tx.get(ref);
    const version=(prev.exists&&Number.isSafeInteger(prev.data()?.version)?prev.data().version:0)+1;
    const at=new Date().toISOString();
    tx.set(ref,{id,letterId:id.startsWith('letter:')?target:null,replyId:id.startsWith('reply:')?target:null,
     notes:Object.fromEntries(NOTE_FIELDS.map(k=>[k,typeof notes[k]==='string'?notes[k]:''])),
     updatedBy:scope.uid,updatedAt:at,version});
    tx.create(audit.doc(createHash('sha256').update('mail-note:'+id+':'+version).digest('hex')),
     {action:'narrator_note',actorUid:scope.uid,noteId:key,version,occurredAt:at});
   });
   return {data:null,error:null,count:null};
  };
  const checkLinks=async(origin:string|null,r:{courtMemberId?:string|null;unitId?:string|null})=>{
   if(!r.courtMemberId&&!r.unitId)return;
   if(!origin||!scope.editHouseIds.includes(origin))throw new CloudAccessError('links_not_allowed',400);
   const sheet=(await rows('noble_house_sheets')).find(x=>x['house_id']===origin);
   const state=sheet?.['state'];
   const court=Array.isArray(state?.court)?state.court:[];
   const units=Array.isArray(state?.units)?state.units:[];
   if(r.courtMemberId&&!court.some((c:any)=>c?.id===r.courtMemberId))
    throw new CloudAccessError('court_member_unavailable',400);
   if(r.unitId&&!units.some((u:any)=>u?.id===r.unitId&&u.destroyed!==true&&u.destroyed!=='true'))
    throw new CloudAccessError('unit_unavailable',400);
  };
  // Operational House sheets (seeded from the imported sheet by owner
  // decision) supersede the immutable import once activated and verified.
  let economiesPromise:Promise<Map<string,Row>>|undefined;
  const economies=()=>economiesPromise??=(async()=>{
   const snap=await db.collection('campaignCloudRuntime').doc(snapshotId)
    .collection('houseEconomies').limit(51).get();
   const out=new Map<string,Row>();
   for(const d of (snap.docs??[]) as any[]){
    // Do not silently fall back to imported resources when an operational
    // economy exists but its provenance or state hash is inconsistent.
    if(typeof d.id==='string')out.set(d.id,d.data());
   }
   return out;
  })();
  const sheets=async()=>{
   const [imported,live]=await Promise.all([rows('noble_house_sheets'),economies()]);
   return imported.filter(r=>houseAllowed(r['house_id'])).map(r=>{
    const op=live.get(spyDigest('house:'+r['house_id']));
    if(!op)return r;
    if(!operationalHouseEconomyIsReconciled({house_id:r['house_id'],
      version:r['version'],state:r['state']},op,snapshotId))
     throw new CloudAccessError('house_economy_unreconciled',503);
    return {...r,state:op['state'],version:op['version'],operational:true};
   });
  };
  const sheetFor=async(id:string)=>{
   checkHouse(id);
   const sheet=(await sheets()).find(r=>r['house_id']===id);
   if(!sheet||!sheet['state']||typeof sheet['state']!=='object')throw new CloudAccessError('house_sheet_unavailable',404);
   return {state:sheet['state'],version:sheet['version']};
  };
  // A ficha rival só é consultada no servidor, após validar o catálogo oficial.
  // Economia operacional inconsistente bloqueia a prévia, sem fallback.
  const privateTargetSheet=async(id:string)=>{
   const archived=(await rows('noble_house_sheets')).filter(r=>r['house_id']===id);
   if(archived.length>1)throw new CloudAccessError('target_sheet_ambiguous',503);
   const doc=await db.collection('campaignCloudRuntime').doc(snapshotId)
    .collection('houseEconomies').doc(spyDigest('house:'+id)).get();
   if(doc.exists){
    const v=doc.data();
    if(!v||v.status!=='active'||v.seedVerified!==true||
      v.sourceSnapshotId!==snapshotId||v.houseId!==id||
      !Number.isSafeInteger(v.version)||v.version<1||
      !v.state||typeof v.state!=='object'||
      v.stateHash!==constructionStateHash(v.state))
     throw new CloudAccessError('target_sheet_inconsistent',503);
    return {state:v.state,version:v.version};
   }
   if(archived.length===0)return null;
   const row=archived[0];
   if(!row||!row['state']||typeof row['state']!=='object'||
      !Number.isSafeInteger(row['version']))
     throw new CloudAccessError('target_sheet_inconsistent',503);
   return {state:row['state'],version:row['version']};
  };
  let operationalRecordsPromise:ReturnType<typeof readOperationalRecordDocs>|undefined;
  const operationalRecords=()=>operationalRecordsPromise??=
    readOperationalRecordDocs(db,snapshotId);
  let operationalLedgerPromise:ReturnType<typeof readOperationalHouseLedger>|undefined;
  const operationalLedger=()=>operationalLedgerPromise??=
    readOperationalHouseLedger(db,snapshotId);
  const visible=async(name:string):Promise<Row[]>=>{
   if(name==='campaign_access_profiles')return (await accessDocs()).filter((a:any)=>admin||a.userId===scope.uid).map((a:any)=>({user_id:a.userId,profile:a.profile}));
   // A conta pode ter linhas históricas (outra temporada ou outro jogador
   // com o mesmo login). Para o próprio jogador só a identidade autorizada
   // AGORA (scope.playerId) representa a conta; linhas antigas causavam
   // "registro ambíguo" e bloqueavam a verificação de vínculos.
   if(name==='campaign_players'){
    const own=(p:Row)=>p['user_id']===scope.uid;
    const current=(p:Row)=>p['id']===scope.playerId;
    return (await players()).flatMap(p=>!own(p)||current(p)?(admin||own(p)?[p]:[])
     // Linha histórica da própria conta: nunca para o jogador; para o
     // Narrador fica na lista, porém sem o vínculo de login duplicado.
     :admin?[{...p,user_id:null,active:false}]:[]);
   }
   if(name==='house_memberships')return (await memberships()).filter((m:Row)=>admin||m['player_id']===scope.playerId);
   if(name==='campaign_houses')return (await rows(name)).filter(r=>r['active']===true).map(r=>{
    const {id,name,region,crest,castle,lord_name,season,active}=r;
    // Preserve the original House narrative for its authorized members and
    // the Narrator, never publish a foreign House's private historical text.
    const details=houseAllowed(id)&&typeof r['details']==='string'?r['details']:'';
    return {id,name,region,crest,castle,lord_name,season,active,details};
   });
   if(name==='house_catalog')return (await rows(name)).filter(r=>admin||r['public_reviewed']===true);
   if(name==='noble_house_sheets')return sheets();
   if(name==='noble_house_ledger'){
    const archived=(await rows(name)).filter(r=>houseAllowed(r['house_id']));
    if(process.env['CORMYR_FIREBASE_HOUSE_OPS_ENABLED']!=='true'&&
       process.env['CORMYR_FIREBASE_SPY_ENABLED']!=='true')
     return archived;
    const operational=(await operationalLedger()).filter(r=>houseAllowed(r.house_id));
    return [...archived,...operational] as Row[];
   }
   if(name==='spy_agent_upgrades'){
    if(process.env['CORMYR_FIREBASE_SPY_ENABLED']!=='true')
     return (await rows(name)).filter(r=>houseAllowed(r['owner_house_id']));
    const imported=await loadImportedSpyData(rows,snapshotId);
    const projected=projectSpyOverlay(imported,await readSpyOverlay(db,snapshotId));
    return projected.upgrades.filter((u:any)=>houseAllowed(u.ownerHouseId))
     .map((u:any)=>({agent_id:u.agentId,owner_house_id:u.ownerHouseId,
      upgrade_code:u.upgradeCode,cost_wealth:u.costWealth,
      purchased_at:u.purchasedAt,purchased_by:u.purchasedBy}));
   }
   if(name==='noble_house_rule_overrides')return scope.profile==='editor'?[]:rows(name);
   if(name==='campaign_records'){
    const archived=await rows(name);
    if(process.env['CORMYR_FIREBASE_RECORDS_ENABLED']!=='true')
      return archived.filter(r=>recordVisible(scope,r));
    return projectOperationalRecords(scope,archived,await operationalRecords());
   }
   if(name==='record_versions'){
    const visibleRecords=await visible('campaign_records');
    const archived=await rows(name);
    if(process.env['CORMYR_FIREBASE_RECORDS_ENABLED']!=='true'){
      const ids=new Set(visibleRecords.map(r=>r['id']));
      return archived.filter(r=>ids.has(r['record_id']));
    }
    return projectOperationalVersions(scope,visibleRecords,archived,
      await operationalRecords(),await readOperationalRecordVersionDocs(db,snapshotId));
   }
   if(['campaign_letters','letter_replies','letter_receipts','letter_rounds','letter_versions','letter_reply_versions','narrator_mail_notes','campaign_letter_consequences'].includes(name)){
    // The Editor-Chefe reads delivered mail and own receipts only.
    if(scope.profile==='editor'&&!['campaign_letters','letter_replies','letter_receipts','letter_rounds'].includes(name))return [];
    const ds=await mail();
    if(name==='campaign_letters')return ds.letters.filter(r=>canReadLetterAs(ds,r,scope.uid));
    if(name==='letter_replies')return ds.replies.filter(r=>canReadReply(ds,r,scope.uid));
    if(name==='letter_receipts')return ds.receipts.filter(r=>admin||r['user_id']===scope.uid);
    if(name==='letter_rounds')return [...ds.rounds];
    if(name==='letter_versions'){
     const imported=admin?await rows(name):[];
     return [...imported,...await cloudVersions(ds)];
    }
    if(name==='campaign_letter_consequences'){
     const all=[...(await rows(name)),...await consequences().list()];
     // Players see consequences of their House on letters they can read (0068).
     return all.filter(c=>admin||scope.memberHouseIds.includes(c['house_id'])&&
      ds.letters.some(l=>l.id===c['letter_id']&&canReadLetterAs(ds,l,scope.uid)))
      .map(c=>({id:c['id'],letter_id:c['letter_id'],house_id:c['house_id'],changes:c['changes'],
       active:c['active']===true,created_at:c['created_at']}));
    }
    if(!admin)return [];
    if(name==='narrator_mail_notes'){
     // Cloud notes supersede the imported record with the same id.
     const cloud=await cloudNotes();
     const ids=new Set(cloud.map(n=>n['id']));
     return [...(await rows(name)).filter(r=>!ids.has(r['id'])),...cloud];
    }
    return rows(name);
   }
   if(name==='campaign_newspapers'){
    const removed=await deletedNewspaperIds(db,snapshotId);
    return (await rows(name)).filter(r=>!removed.has(r['id'])&&(editor||['published','archived'].includes(r['state'])));
   }
   if(name==='campaign_newspaper_reads')return (await rows(name)).filter(r=>editor||r['user_id']===scope.uid);
   if(name==='campaign_newspaper_commissions'){
     const original=(await rows(name)).filter(r=>editor||houseAllowed(r['house_id']));
     const operational=await readFirebaseCommissions(db,snapshotId,scope);
     const ids=new Set(original.map(r=>r['id']));
     if(operational.some((r:Row)=>ids.has(r['id'])))
      throw new CloudAccessError('newspaper_commission_source_conflict',503);
     return [...original,...operational];
    }
   if(name==='campaign_newspaper_staff'){
    try{return (await readNewspaperStaffOverlay(db,snapshotId))??await rows(name);}
    catch(e){if(e instanceof NewspaperStaffError)throw new CloudAccessError(e.code,e.status);throw e;}
   }
   if(name==='noble_house_gm_notes'){
    if(!admin)denied();
    return rows(name);
   }
   if(['campaign_newspaper_story_models','campaign_newspaper_engravings','campaign_newspaper_settings','campaign_newspaper_revisions'].includes(name)){
    if(!editor)return [];
    return rows(name);
   }
   denied();return [];
  };
  const writeRecord=async(input:Parameters<typeof commitOperationalRecord>[0]['input'])=>{
   try{return await commitOperationalRecord({
    db,snapshotId,actor:scope,imported:await rows('campaign_records'),input,
   });}catch(e){
    if(e instanceof RecordWriteError)throw new CloudAccessError(e.code,e.status);
    throw e;
   }
  };
  const rpc=async(name:string,args:Row)=>{
   if(['newspaper_commission_story','newspaper_reject_commission',
       'mark_newspaper_commissions_seen'].includes(name)){
    try{
     const writer=createFirebaseCommissions({db,snapshotId,actor:scope});
     if(name==='newspaper_commission_story')
      return writer.commission(args,await rows('campaign_newspaper_commissions'));
     if(name==='newspaper_reject_commission')
      return writer.reject(args);
     return writer.markSeen(args);
    }catch(e){
     if(e instanceof FirebaseCommissionError)throw new CloudAccessError(e.code,e.status);
     throw e;
    }
   }
   // Redação da Folha (Editor-Chefe e Narrador): cópia operacional auditada.
   if(['newspaper_staff_save','newspaper_staff_reorder','newspaper_staff_delete'].includes(name)){
    if(!editor)denied();
    try{
     const op=parseStaffOperation(name,args);
     const current=(await readNewspaperStaffOverlay(db,snapshotId))??await rows('campaign_newspaper_staff');
     return await commitNewspaperStaff({db,snapshotId,actorUid:scope.uid,imported:current,op});
    }catch(e){
     if(e instanceof NewspaperStaffError)throw new CloudAccessError(e.code,e.status);
     throw e;
    }
   }
   // Aprovações do runtime: só o Narrador lê e liga (Contas > Aprovações).
   if(name==='runtime_approvals'||name==='runtime_approvals_set'){
    if(!admin)denied();
    try{
     return name==='runtime_approvals'?await readRuntimeApprovals(db,snapshotId)
      :await setRuntimeApprovals(db,snapshotId,scope.uid,args['p_changes']);
    }catch(e){
     if(e instanceof RuntimeApprovalError)throw new CloudAccessError(e.code,e.status);
     throw e;
    }
   }
   // Excluir rascunho ou edição do Arquivo (Editor-Chefe e Narrador).
   if(name==='delete_campaign_newspaper_draft'||name==='delete_campaign_newspaper'){
    if(!editor)denied();
    const id=args['p_newspaper'];
    if(typeof id!=='string')throw new CloudAccessError('invalid_edition',400);
    let state:string|null=null;
    if(id.startsWith('cloud-')){
     const doc=await db.collection('campaignCloudRuntime').doc(snapshotId).collection('publishedNewspapers').doc(id).get();
     if(!doc.exists)throw new CloudAccessError('edition_unavailable',404);
     state=String(doc.data()?.state??'');
    }else{
     const row=(await rows('campaign_newspapers')).find(r=>r['id']===id);
     if(!row)throw new CloudAccessError('edition_unavailable',404);
     state=String(row['state']??'');
    }
    try{return await markNewspaperDeleted(db,snapshotId,{id,actorUid:scope.uid,
     draftOnly:name==='delete_campaign_newspaper_draft',state});}
    catch(e){const status=(e as {status?:number}).status;
     if(status)throw new CloudAccessError((e as Error).message,status);throw e;}
   }
   // Edições agendadas não existem no Firebase (a gravação recusa publish_on).
   if(name==='publish_due_campaign_newspapers'){
    if(!editor)denied();
    return 0;
   }
   if(name==='newspaper_public_read_counts'){
    if(!editor)denied();
    try{return await readPublicNewspaperReadCounts(db,snapshotId);}
    catch(e){if(e instanceof PublicNewspaperError)throw new CloudAccessError(e.code,e.status);throw e;}
   }
   if(['start_campaign_representation','stop_campaign_representation',
       'campaign_representation_action'].includes(name)){
    try{return await representationRpc({
     db,snapshotId,actor:scope,token,name,args,players,rows,
     operationalRecords,mail,cloudMail,
    });}
    catch(e){if(e instanceof RepresentationRpcError)
      throw new CloudAccessError(e.code,e.status);throw e;}
   }
   if(name==='save_campaign_record'){
    if(!args||typeof args!=='object'||Array.isArray(args)||
      Object.keys(args).some(k=>!['p_id','p_version','p_title','p_content','p_request_key'].includes(k)))
     throw new CloudAccessError('invalid_record_request',400);
    return writeRecord({action:'save',recordId:args['p_id'],
     expectedVersion:args['p_version'],title:args['p_title'],
     content:args['p_content'],requestKey:args['p_request_key']});
   }
   if(name==='house_gallery_mail_images'){
    const id=args['p_house'];
    checkHouse(id);
    if(Object.keys(args).some(k=>k!=='p_house'))
     throw new CloudAccessError('private_media_request_invalid',400);
    if(process.env['CORMYR_FIREBASE_PRIVATE_MEDIA_ENABLED']!=='true')
     return [];
    const [letters,replies]=await Promise.all([
     visible('campaign_letters'),visible('letter_replies')]);
    return projectPrivateMailGallery(id,letters,replies,scope.uid);
   }
   if(['get_house_character_ages','get_character_age_dashboard',
       'get_character_year_transitions'].includes(name)){
    if(process.env['CORMYR_FIREBASE_CHARACTER_AGES_ENABLED']!=='true')
     throw new CloudAccessError('character_ages_disabled',501);
    try{
     const calendar=await cloud.workspaceCalendar(token) as {year:number}|null;
     if(!calendar||!Number.isSafeInteger(calendar.year))
      throw new CharacterAgesError('character_calendar_unavailable');
     const registry=await readAgeRegistry(db,snapshotId);
     if(name==='get_house_character_ages'){
      const houseId=args['p_house'];
      checkHouse(houseId);
      if(Object.keys(args).some(k=>k!=='p_house'))
       throw new CharacterAgesError('character_request_invalid',400);
      return projectHouseAges(scope,registry,await visible('campaign_records'),
       houseId,calendar.year);
     }
     if(!admin)denied();
     if(name==='get_character_year_transitions'){
      if(Object.keys(args).some(k=>k!=='p_limit'))
       throw new CharacterAgesError('character_request_invalid',400);
      return listAgeTransitions(db,snapshotId,registry,args['p_limit']??30);
     }
     if(Object.keys(args).some(k=>!['p_year','p_target_year','p_limit'].includes(k)))
      throw new CharacterAgesError('character_request_invalid',400);
     return projectAgeDashboard(registry,args['p_year']??calendar.year,
      args['p_target_year']??Math.min(calendar.year+1,9999),args['p_limit']??300);
    }catch(e){
     if(e instanceof CharacterAgesError)throw new CloudAccessError(e.code,e.status);
     throw e;
    }
   }
   // A galeria privada depende da implantação do Storage (item 11).
   if(name==='house_gallery_mail_images'){
    checkHouse(args['p_house']);return [];
   }
   if(name==='spy_narrator_house_defense'){
    if(!admin)denied();
    const id=args['p_house'],domain=args['p_domain'];
    if(typeof id!=='string'||domain!==undefined&&typeof domain!=='string')
     throw new CloudAccessError('spy_defense_invalid',400);
    const source=await loadImportedSpyData(rows,snapshotId);
    const target=source.catalog.find((x:any)=>x.id===id&&x.publicReviewed===true);
    if(!target)throw new CloudAccessError('spy_target_not_found',404);
    const official=source.nobleStats.find((s:any)=>s.houseId===id)??null;
    const sheet=await privateTargetSheet(id);
    let resolution:any,domains:any[]=[];
    try{
     if(sheet){
      const state=sheet.state as HouseState;
      resolution=resolveSpyHouseDefense({
       kind:'with_sheet',state,region:target.region,
       ...(domain?{domainId:domain}:{}),
      });
      const profile=calculateSpyDefense(state);
      domains=profile.domains.map(d=>({domainId:d.domainId,
       name:d.name,difficulty:d.difficulty}));
     }else if(official){
      if(!Number.isSafeInteger(official.law)||official.law<0)
       throw new CloudAccessError('spy_defense_invalid',503);
      const dc=spyLawDifficulty(official.law);
      resolution={source:'imported_noble_sheet',law:official.law,
       regionalLaw:null,baseDifficulty:dc,constructionBonus:0,
       difficulty:dc,domainId:null,sources:[]};
     }else resolution=resolveSpyHouseDefense({
       kind:'without_sheet',region:target.region,
      });
    }catch(e){if(e instanceof CloudAccessError)throw e;
     throw new CloudAccessError('spy_defense_invalid',503);}
    return {houseId:target.id,houseName:target.name,region:target.region,
     ...resolution,sourceSpreadsheetRow:null,domains};
   }
   if(name==='spy_player_mission_preview'){
    const h=args['p_house'],id=args['p_target'];
    checkHouse(h);
    if(typeof id!=='string'||typeof args['p_agent']!=='string')
     throw new CloudAccessError('spy_preview_invalid',400);
    const archive=await loadImportedSpyData(rows,snapshotId);
    const d=process.env['CORMYR_FIREBASE_SPY_ENABLED']==='true'
     ?projectSpyOverlay(archive,await readSpyOverlay(db,snapshotId)):archive;
    const target=d.catalog.find((t:any)=>t.id===id&&t.publicReviewed===true);
    if(!target)throw new CloudAccessError('spy_target_not_found',404);
    try{return previewSpyMission({scope,houseId:h,agentId:args['p_agent'],
     targetHouseId:id,data:d,targetSheet:await privateTargetSheet(id)});}
    catch(e){if(e instanceof SpyOperationError)
      throw new CloudAccessError(e.code,e.status);throw e;}
   }
   if(spyNarratorMethod(name)){
    if(!admin)denied();
    if(process.env['CORMYR_FIREBASE_SPY_ENABLED']!=='true')
     throw new CloudAccessError('spy_write_disabled',501);
    try{return await commitSpyNarrator({
     db,snapshotId,scope,name,args,
     source:await loadImportedSpyData(rows,snapshotId),
     calendar:await cloud.workspaceCalendar(token),
     archivedSheets:await rows('noble_house_sheets'),
    });}
    catch(e){if(e instanceof SpyOperationError)
     throw new CloudAccessError(e.code,e.status);throw e;}
   }
   if(spyMissionMethod(name)){
    if(process.env['CORMYR_FIREBASE_SPY_ENABLED']!=='true')
     throw new CloudAccessError('spy_write_disabled',501);
    const h=args['p_house'];
    if(typeof h!=='string'||(!admin&&!scope.editHouseIds.includes(h)))denied();
    try{return await commitSpyMission({db,snapshotId,scope,name,args,
     source:await loadImportedSpyData(rows,snapshotId),
     calendar:await cloud.workspaceCalendar(token)});}
    catch(e){if(e instanceof SpyOperationError)
      throw new CloudAccessError(e.code,e.status);throw e;}
   }
   if(['spy_recruit_agent','spy_create_agent','spy_buy_agent_upgrade',
       'spy_assign_agent_portrait','spy_rename_agent','spy_remove_agent'].includes(name)){
    if(process.env['CORMYR_FIREBASE_SPY_ENABLED']!=='true')
     throw new CloudAccessError('spy_write_disabled',501);
    const h=args['p_house'];
    if(typeof h!=='string'||(!admin&&!scope.editHouseIds.includes(h)))denied();
    const [source,calendar,house]=await Promise.all([
     loadImportedSpyData(rows,snapshotId),cloud.workspaceCalendar(token),sheetFor(h),
    ]);
    try{return await commitSpyAction({db,snapshotId,scope,name,args,
     source,calendar,fallbackSheet:house});}
    catch(e){
     if(e instanceof SpyWriteError)throw new CloudAccessError(e.code,e.status);
     throw e;
    }
   }
   if(name.startsWith('spy_'))return readWorkspaceSpy({scope,name,args,rows,snapshotId,db,sheet:async(h:string)=>{checkHouse(h);const s=await sheetFor(h) as any;return {houseId:h,state:s.state,version:s.version};}});
   if(name==='dated_mail_action'){
    if(scope.profile==='editor')denied();
    if(process.env['CORMYR_FIREBASE_CLOUD_MAIL_ENABLED']!=='true')
     throw new CloudAccessError('workspace_operation_not_implemented',501);
    if(args['p_action']==='edit_linked_mail_draft'){
     const p=args['p_args'];
     if(!p||typeof p!=='object'||Array.isArray(p)||
        Object.keys(args).some(k=>!['p_action','p_args','p_date'].includes(k))||
        Object.keys(p).some(k=>!['p_id','p_version','p_subject','p_content','p_origin','p_court','p_unit','p_role'].includes(k))||
        typeof p['p_subject']!=='string'||typeof p['p_content']!=='string')
      throw new CloudAccessError('invalid_mail_lifecycle_request',400);
     const {row,version}=await lifecycleTarget(p['p_id'],{deleted:false});
     if(row.publication_state!=='draft')throw new CloudAccessError('not_a_draft',409);
     if(p['p_version']!==version)throw new CloudAccessError('letter_version_conflict',409);
     // The origin House of a draft cannot be switched here.
     if((p['p_origin']||null)!==row.origin_house_id)throw new CloudAccessError('workspace_operation_not_implemented',501);
     let links;
     try{links=composerOptions({p_court:p['p_court'],p_role:p['p_role'],p_unit:p['p_unit']});}
     catch(e){if(e instanceof OriginalMailBridgeError)throw new CloudAccessError(e.code,e.status);throw e;}
     await checkLinks(row.origin_house_id,links);
     return asAccess(()=>cloudMail().edit(token,{letterId:row.id,expectedVersion:version,
      subject:p['p_subject'],content:p['p_content'],
      ...(row.origin_house_id?{courtMemberId:links.courtMemberId??null,
       courtAssignment:links.courtAssignment??null,unitId:links.unitId??null}:{})}));
    }
    if(args['p_action']==='edit_campaign_letter'){
     // Author edit during the open week. The campaign date is not editable
     // here: the original form must submit the letter's own date unchanged.
     const p=args['p_args'];
     if(!p||typeof p!=='object'||Array.isArray(p)||
        Object.keys(args).some(k=>!['p_action','p_args','p_date'].includes(k))||
        Object.keys(p).some(k=>!['p_id','p_version','p_subject','p_content'].includes(k))||
        typeof p['p_subject']!=='string'||typeof p['p_content']!=='string')
      throw new CloudAccessError('invalid_mail_lifecycle_request',400);
     const {row,version}=await lifecycleTarget(p['p_id'],{deleted:false});
     if(p['p_version']!==version)throw new CloudAccessError('letter_version_conflict',409);
     if((args['p_date']??'')!==(row['campaign_date']??''))
      throw new CloudAccessError('workspace_operation_not_implemented',501);
     return asAccess(()=>cloudMail().edit(token,{letterId:row.id,expectedVersion:version,
      subject:p['p_subject'],content:p['p_content']}));
    }
    const clock=await cloud.workspaceCalendar(token);
    if(!clock||typeof clock!=='object'||Array.isArray(clock))
     throw new CloudAccessError('calendar_unavailable',503);
    const t=clock as {year:number;month:number;day:number;festival:string|null};
    const key=dateKey(t),parsed=parseDate(key);
    if(!parsed||parsed.year!==t.year||parsed.month!==t.month||
       parsed.day!==t.day||parsed.festival!==t.festival)
     throw new CloudAccessError('calendar_unavailable',503);
    let request;
    let batch;
    let reply;
    try{
     if(args['p_action']==='reply_weekly_message')
      reply=originalMailReply(args,key);
     else if(args['p_action']==='save_weekly_reply_draft')
      reply=originalReplyDraft(args,key);
     else{
     const targets=args['p_args']?.['p_targets'];
     if(Array.isArray(targets)&&targets.length>1)
      batch=originalMailBatch(args,key);
     else request=originalMailSend(args,key);
     }
    }catch(e){
     if(e instanceof OriginalMailBridgeError)throw new CloudAccessError(e.code,e.status);
     throw e;
    }
    // Court member and unit must exist in the CURRENT sheet of the origin
    // House the caller may edit; the browser never chooses foreign links.
    for(const r of [request,...(batch??[])])if(r)await checkLinks(r.originHouseId,r);
    try{
     const mailService=createFirebaseCloudMail({
      db,auth,snapshotId,projectId:'cormyr',enabled:true,
     });
     if(reply){
      const sent=await mailService.reply(token,reply);
      return {ids:[sent.id],duplicate:sent.duplicate,state:sent.state,
       week:sent.deliveryRound};
     }
     if(batch){
      const sent=await mailService.sendBatch(token,batch);
      return {ids:sent.ids,duplicate:sent.duplicate,state:sent.state,
       week:sent.deliveryRound};
     }
     const sent=await mailService.send(token,request);
     return {ids:[sent.id],duplicate:sent.duplicate,state:sent.state,
      week:sent.deliveryRound};
    }catch(e){
     if(e instanceof CloudMailError)throw new CloudAccessError(e.code,e.status);
     throw e;
    }
   }
   if(name==='reply_delivery_week'){
    if(scope.profile==='editor')denied();
    if(process.env['CORMYR_FIREBASE_CLOUD_MAIL_ENABLED']!=='true')return null;
    if(Object.keys(args).length!==1||typeof args['p_recipient']!=='string'||
       !/^[^/\u0000-\u001f\u007f]{1,128}$/.test(args['p_recipient']))
     throw new CloudAccessError('invalid_week_request',400);
    const root=db.collection('campaignCloudRuntime').doc(snapshotId);
    const [live,mailGate,calendar]=await Promise.all([
     root.get(),db.collection('campaignMailRuntime').doc(snapshotId).get(),
     db.collection('migrationTimeEngineStage').doc(snapshotId)
      .collection('calendar').doc('current').get()]);
    if(!live.exists||!mailGate.exists||!calendar.exists||
       !cloudMailRuntimeApproved(live.data(),mailGate.data(),calendar.data(),snapshotId))
     return null;
    return live.data().openRound;
   }
   if(name==='mark_letter_unread'){
    const id=args['p_id'];
    if(Object.keys(args).length!==1||typeof id!=='string'||!SAFE.test(id))
     throw new CloudAccessError('invalid_receipt_request',400);
    mailFlag();
    const ds=await mail();
    const match=ds.letters.find(l=>l.id===id&&canReadLetterAs(ds,l,scope.uid));
    if(!match)throw new CloudAccessError('access_denied',403);
    const source=match['source']==='firebase-cloud'?'firebase-cloud':'imported';
    return asAccess(()=>cloudMail().markUnread(token,{source,letterId:id}));
   }
   if(name==='apply_letter_consequence'||name==='reverse_letter_consequence'){
    if(!admin)denied();
    mailFlag();
    if(!await runtimeApproved())throw new CloudAccessError('campaign_not_launched',409);
    try{
     if(name==='reverse_letter_consequence')
      return await consequences().reverse({actorUid:scope.uid,id:args['p_id'],key:args['p_key'],
       expectedVersion:args['p_expected_version'],reason:args['p_reason']});
     const letterId=args['p_letter'],houseId=args['p_house'];
     if(typeof letterId!=='string'||typeof houseId!=='string')throw new CloudAccessError('invalid_consequence',400);
     const ds=await mail();
     if(!ds.letters.some(l=>l.id===letterId&&l.deleted_at===null))throw new CloudAccessError('letter_not_found',404);
     if(!(await visible('campaign_houses')).some(h=>h['id']===houseId))throw new CloudAccessError('house_unavailable',404);
     return await consequences().apply({actorUid:scope.uid,letterId,houseId,changes:args['p_changes'],
      explanation:args['p_explanation'],key:args['p_key'],expectedVersion:args['p_expected_version']});
    }catch(e){
     if(e instanceof LetterConsequenceError)throw new CloudAccessError(e.code,e.status);
     throw e;
    }
   }
   if(name==='schedule_letter_draft'){
    if(scope.profile==='editor')denied();
    if(Object.keys(args).some(k=>!['p_id','p_week'].includes(k)))
     throw new CloudAccessError('invalid_mail_lifecycle_request',400);
    mailFlag();
    const week=args['p_week'];
    if(week!==null&&week!==undefined&&(!Number.isSafeInteger(week)||(week as number)<1))
     throw new CloudAccessError('invalid_mail_lifecycle_request',400);
    const {row,version}=await lifecycleTarget(args['p_id'],{deleted:false});
    return asAccess(()=>cloudMail().schedule(token,{letterId:row.id,expectedVersion:version,
     deliveryRound:(week??null) as number|null}));
   }
   if(name==='delete_campaign_letter'||name==='restore_campaign_letter'){
    if(scope.profile==='editor')denied();
    if(Object.keys(args).length!==1)throw new CloudAccessError('invalid_mail_lifecycle_request',400);
    mailFlag();
    const restore=name==='restore_campaign_letter';
    const {row,version}=await lifecycleTarget(args['p_id'],{deleted:restore});
    if(row['source']!=='firebase-cloud')
     return asAccess(()=>cloudMail().moderateImported(token,{
      letterId:row.id,action:restore?'restore':'remove',
     }));
    if(restore)return asAccess(()=>cloudMail().restore(token,{letterId:row.id,expectedVersion:version}));
    return asAccess(()=>cloudMail().cancel(token,{letterId:row.id,expectedVersion:version}));
   }
   if(name==='mark_letter_read'){
    // Editor-Chefe also records only its own reading.
    const id=args['p_id'],safe=/^[^/\u0000-\u001f\u007f]{1,128}$/;
    if(Object.keys(args).length!==1||typeof id!=='string'||!safe.test(id))
     throw new CloudAccessError('invalid_receipt_request',400);
    if(process.env['CORMYR_FIREBASE_CLOUD_MAIL_ENABLED']!=='true')
     throw new CloudAccessError('workspace_operation_not_implemented',501);
    // Derive the source from the verified, scoped inbox. A browser cannot
    // relabel an imported letter as mutable Cloud mail or the reverse.
    const ds=await mail();
    const match=ds.letters.find(l=>l.id===id&&canReadLetterAs(ds,l,scope.uid));
    if(!match)throw new CloudAccessError('access_denied',403);
    const source=match['source']==='firebase-cloud'?'firebase-cloud':'imported';
    try{
     return await createFirebaseCloudMail({
      db,auth,snapshotId,projectId:'cormyr',enabled:true,
     }).markRead(token,{source,letterId:id});
    }catch(e){
     if(e instanceof CloudMailError)throw new CloudAccessError(e.code,e.status);
     throw e;
    }
   }
   if(name==='is_campaign_admin')return admin;
   // workspaceScope already proved an active, password-cleared account.
   if(name==='campaign_access_active')return true;
   if(name==='save_campaign_schedule_event'){
    if(!admin)denied();
    if(!await runtimeApproved())throw new CloudAccessError('campaign_not_launched',409);
    const payload=args['p_payload'] as Record<string,unknown>|undefined;
    const id=payload?.['id'];
    if(id!==null&&id!==undefined&&!isEventId(id))throw new CloudAccessError('invalid_event',400);
    const col=eventsCollection();
    return db.runTransaction(async(tx:any)=>{
     const prevDoc=typeof id==='string'?await tx.get(col.doc(id)):null;
     const at=new Date().toISOString();
     const next=planEventSave(prevDoc?.exists?prevDoc.data():null,payload,{
      deny:(code:string,status:number)=>{throw new CloudAccessError(code,status);},
      newId:()=>'evt-'+randomUUID().replace(/-/g,''),uid:scope.uid,at});
     tx.set(col.doc(next.id),next);
     tx.create(db.collection('campaignCloudRuntime').doc(snapshotId).collection('mailAudits')
      .doc(createHash('sha256').update('schedule-event:'+next.id+':'+next.version).digest('hex')),
      {action:'schedule_event_draft',actorUid:scope.uid,eventId:next.id,version:next.version,occurredAt:at});
     return {id:next.id,version:next.version};
    });
   }
   if(name==='get_campaign_schedule_drafts'){
    if(!admin)denied();
    return (await cloudEvents()).filter(e=>e['draft']).map(e=>({id:e['id'],date:e['draft'].date,
     title:e['draft'].title,description:e['draft'].description??'',deleted:e['draft'].deleted===true,
     version:e['version'],published:e['published']!==null}));
   }
   if(name==='get_campaign_schedule_events'||name==='get_campaign_chronology'||name==='get_newspaper_calendar_events'){
    const year=args['p_year'],month=args['p_month'];
    if(!Number.isSafeInteger(year)||!Number.isSafeInteger(month)||(month as number)<0||(month as number)>11)
     throw new CloudAccessError('invalid_calendar_request',400);
    const inMonth=(key:unknown)=>{const d=parseEventDate(key);return Boolean(d&&d.year===year&&d.month===month);};
    const kingdom=(await cloudEvents()).filter(e=>e['published']&&inMonth(e['published'].date))
     .map(e=>({id:'evento-'+e['id'],date:e['published'].date,title:e['published'].title,kind:'kingdom' as const,
      ...(e['published'].description?{description:e['published'].description}:{})}));
    if(name!=='get_campaign_chronology')return kingdom;
    // Chronology: published Kingdom events and delivered letters the viewer may read.
    const ds=await mail();
    const letters=ds.letters.filter(l=>l.publication_state==='delivered'&&l.deleted_at===null&&
     inMonth(l['campaign_date'])&&canReadLetterAs(ds,l,scope.uid))
     .map(l=>({id:'mail-'+l.id,date:l['campaign_date'] as string,title:l.subject,kind:'mail' as const}));
    return {year,month,events:[...kingdom,...letters],rounds:[],unassigned_round_count:0};
   }
   if(name==='get_campaign_time_history'){
    // Narrator history of the Firebase HUB (launch and weekly openings).
    if(!admin)denied();
    const limit=args['p_limit']??15;
    if(!Number.isSafeInteger(limit)||(limit as number)<1||(limit as number)>50)
     throw new CloudAccessError('invalid_history_request',400);
    const docs=await db.collection('campaignNarratorDrafts').doc(snapshotId)
     .collection('calendarAudit').limit(500).get();
    const key=(d:any)=>d&&Number.isSafeInteger(d.year)&&Number.isSafeInteger(d.month)&&Number.isSafeInteger(d.day)
     ?dateKey({year:d.year,month:d.month,day:d.day,festival:d.festival??null}):null;
    return (docs.docs??[]).map((d:any)=>({id:d.id,...d.data()}))
     .filter((a:any)=>a.action==='advance_week'||a.action==='launch_firebase_campaign')
     .sort((a:any,b:any)=>String(b.at).localeCompare(String(a.at))).slice(0,limit as number)
     .map((a:any)=>({id:a.id,from:key(a.from)??'',to:key(a.to??a.calendar)??'',
      mode:a.action==='launch_firebase_campaign'?'set':'advance',
      reason:typeof a.reason==='string'?a.reason:'Lançamento da campanha no Firebase',
      created_at:a.at}));
   }
   if(name==='current_campaign_profile')return scope.profile;
   if(name==='in_campaign_house')return args['edit_required']?admin||scope.editHouseIds.includes(args['h']):houseAllowed(args['h']);
   if(name==='get_public_campaign_time'||name==='get_campaign_calendar')return cloud.workspaceCalendar(token);
   if(name==='calendar_mail_events'){
    if(scope.profile==='editor')return [];
    const prefix=String(args['p_year']).padStart(4,'0')+'-'+String(Number(args['p_month'])+1).padStart(2,'0');
    return (await visible('campaign_letters')).filter(r=>r['publication_state']==='delivered'&&typeof r['campaign_date']==='string'&&r['campaign_date'].startsWith(prefix))
     .map(r=>({id:'mail-'+r['id'],date:r['campaign_date'],title:r['subject'],kind:'mail'}));
   }
   if(['mail_page','mail_trash_page','mail_insights','mail_insights_grouped','mail_overview_grouped'].includes(name)){
    // Editor-Chefe: only the delivered mailbox page; no Lixeira or analytics.
    if(scope.profile==='editor'&&name!=='mail_page')denied();
    const ds=await mail(),viewer={uid:scope.uid};
    if(name==='mail_page')return mailPage(ds,viewer,args['p_filters']??{},args['p_page']??0,args['p_size']??20);
    if(name==='mail_trash_page')return mailTrashPage(ds,viewer,args['p_filters']??{},args['p_page']??0,args['p_size']??20);
    if(name==='mail_insights')return mailInsights(ds,viewer);
    if(!admin)denied();
    return name==='mail_insights_grouped'?mailInsightsGrouped(ds,viewer,args['p_houses']??args['p_house_ids']??[]):mailOverviewGrouped(ds,viewer,args['p_houses']??args['p_house_ids']??[]);
   }
   if(name==='mail_compose_options'){
    if(scope.profile==='editor')denied();
    const [directory,links,allHouses,houseSheets,records]=await Promise.all([
     players(),memberships(),visible('campaign_houses'),sheets(),visible('campaign_records')]);
    // Same active, password-cleared recipient directory as the original RPC.
    // Historic roster entries are never an access grant.
    const activePlayers=directory.filter(p=>p['active']===true&&p['require_password_change']!==true&&
      typeof p['user_id']==='string'&&p['user_id'].length>0);
    // Only officially active Season 2 Houses belong in recipient filters.
    // An outdated imported membership must never be offered as a live route.
    const activeRecipientHouses=new Set(allHouses.filter(h=>
      h['active']===true&&h['season']===2).map(h=>h['id']));
    const playersOut=activePlayers.map(p=>({
     id:p['id'],name:typeof p['name']==='string'?p['name']:'Jogador',
     houses:links.filter((m:Row)=>m['player_id']===p['id']&&
       activeRecipientHouses.has(m['house_id'])).map((m:Row)=>m['house_id']),
    })).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    // Original SQL LEFT JOIN: a season-two House without a sheet is still
    // addressable and simply has no court, units or version yet.
    const housesOut=allHouses.filter(h=>h['season']===2&&houseAllowed(h['id']))
      .map(h=>{
       const sheet=houseSheets.find(s=>s['house_id']===h['id']);
       const state=sheet?.['state']&&typeof sheet['state']==='object'?sheet['state']:null;
       const court=Array.isArray(state?.court)?state.court:[];
       const units=Array.isArray(state?.units)?state.units:[];
       return {
        id:h['id'],name:h['name'],version:sheet?.['version']??null,
        court:court.flatMap((c:any)=>{
         if(typeof c?.id!=='string'||!c.id)return [];
         const npcId=typeof c.npcId==='string'?c.npcId:'';
         const npc=npcId?records.find(r=>r['id']===npcId&&r['house_id']===h['id']&&
          r['kind']==='character'&&!/^ficha\b/i.test(String(r['title']??''))):null;
         if(npcId&&!npc)return [];
         return [{id:c.id,name:typeof npc?.['title']==='string'?npc['title']:
           typeof c.name==='string'&&c.name?c.name:'Integrante sem identificação',
          role:typeof c.role==='string'?c.role:''}];
        }),
        units:units.filter((u:any)=>typeof u?.id==='string'&&u.id)
         .map((u:any)=>({id:u.id,name:typeof u.name==='string'?u.name:'',
          available:u.destroyed!==true&&u.destroyed!=='true'})),
       };
      }).sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR'));
    return {players:playersOut,houses:housesOut};
   }
   throw new CloudAccessError('workspace_operation_not_implemented',501);
  };
  let result:any;
  if(input?.kind==='auth')result={user:{id:scope.uid},profile:scope.profile};
  else if(input?.kind==='query'){
   const steps=input.steps as QueryStep[];
   if(!Array.isArray(steps)||steps.length>40)throw new CloudAccessError('invalid_query',400);
   const mutations=steps.some(s=>['insert','update','delete','upsert'].includes(s.op));
   if(mutations&&input.table==='campaign_records'&&steps.length===1&&
       steps[0]?.op==='insert'&&steps[0].args?.length===1){
    const row=steps[0].args[0];
    if(!row||typeof row!=='object'||Array.isArray(row))
     throw new CloudAccessError('invalid_record_request',400);
    result={data:await writeRecord({action:'create',row}),error:null};
   }
   else if(mutations&&input.table==='narrator_mail_notes'&&steps.length===1&&steps[0]?.op==='upsert')
    result=await saveNarratorNote(steps[0].args?.[0]);
   else if(mutations&&isOverlayTable(String(input.table))){
    // Tabelas operacionais: gravação da tela original, transacional e auditada.
    const table=String(input.table);
    try{
     const config=OVERLAY_TABLES[table]!;
     if(!config.write(scope.profile))denied();
     const now=new Date().toISOString();
     const plan=planOverlayMutation(table,scope.profile,await rows(table),steps,now);
     await commitOverlayPlan(db,snapshotId,table,scope.uid,plan,now);
     cache.delete(table);
     result=plan.result;
    }catch(e){
     if(e instanceof TableOverlayError)throw new CloudAccessError(e.code,e.status);
     throw e;
    }
   }
   else if(mutations)throw new CloudAccessError('workspace_operation_not_implemented',501);
   else result=queryRows(await visible(String(input.table)),steps);
  }
  else if(input?.kind==='rpc')result=await rpc(String(input.name),input.args??{});
  else if(input?.kind==='houseLedgerExport'){
   // Exportação explícita, somente leitura e autorizada pela Casa. A
   // prévia normal permanece limitada a 100 itens para não inflar a UI.
   const id=input.houseId;checkHouse(id);
   const ledger=await visible('noble_house_ledger');
   const selected=ledger.filter(r=>r['house_id']===id);
   if(selected.length>1000)
    throw new CloudAccessError('house_ledger_export_too_large',413);
   result=mergeHouseLedger(selected,[],id,1000);
  }
  else if(input?.kind==='house'){
   const id=input.houseId;checkHouse(id);
   const [sheet,ledger,houses,overrides,live,economyMap]=await Promise.all([
    sheetFor(id),visible('noble_house_ledger'),
    visible('campaign_houses'),visible('noble_house_rule_overrides'),
    db.collection('campaignCloudRuntime').doc(snapshotId).get(),economies(),
   ]);
   const readiness=houseReleaseReadiness({
    root:live.exists?live.data():null,snapshotId,
    houseEconomyReconciled:economyMap.has(spyDigest('house:'+id)),
    narrator:admin,env:process.env,
   });
   const operational=readiness.houseRulesReadable
      ?await readOperationalHouseRules(db,snapshotId,id):[];
   const definitions=overrides.map(r=>r['definition']) as any[];
   const catalog=mergeHouseRuleCatalog(definitions,operational as any);
   result={state:(sheet as any).state,version:(sheet as any).version,
    catalog,houses,ledger:mergeHouseLedger(ledger,[],id),
    admin,canEditAttributes:admin,
    houseOperationsWritable:readiness.houseOperationsWritable,
    houseRulesWritable:readiness.houseRulesWritable,
    syncState:'synced'};
  }else if(input?.kind==='record'){
   checkHouse(input.houseId);
   result=(await visible('campaign_records')).find(r=>r['id']===input.id&&r['house_id']===input.houseId);
   if(!result)denied();
  }else throw new CloudAccessError('invalid_workspace_request',400);
  const after=await cloud.workspaceScope(token);
  if(JSON.stringify(after)!==JSON.stringify(scope))denied();
  return result;
 }
 return {execute};
}
