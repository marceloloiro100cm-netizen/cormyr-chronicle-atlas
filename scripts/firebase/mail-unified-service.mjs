/**
 * Cormyr: unified historical + newly authored mail inbox.
 * Backend-only, loopback Firebase Emulator preview. This module does NOT
 * expose an HTTP endpoint, modify historical source data or deploy to Cloud.
 */
import {createHash} from 'node:crypto';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {createEmulatorInbox} from './letter-inbox-service.mjs';
import {createEmulatorMailCommands} from './mail-command-service.mjs';

const PROJECT='demo-cormyr-migration';
const HASH=/^[a-f0-9]{64}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const FOLDERS=new Set(['all','received','sent','drafts','scheduled']);
const SOURCES=new Set(['all','imported','runtime']);
const MAX_PAGE_SIZE=50;
const MAX_LEGACY_PAGES=101;
const MAX_TOTAL=7000;
const hash=s=>createHash('sha256').update(s).digest('hex');

export class UnifiedMailboxDenied extends Error {
  constructor(){super('Unified mailbox access denied');this.name='UnifiedMailboxDenied';}
}
const deny=()=>{throw new UnifiedMailboxDenied();};

function parseCursor(value){
  if(value===null)return null;
  if(typeof value!=='string'||value.length>256)
    throw Error('Invalid unified cursor');
  try{
    const payload=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
    if(!Array.isArray(payload)||payload.length!==2||
       !ISO.test(payload[0])||!HASH.test(payload[1]))
      throw Error('Invalid unified cursor');
    return {createdAt:payload[0],id:payload[1]};
  }catch{throw Error('Invalid unified cursor');}
}
const cursorOf=r=>Buffer.from(JSON.stringify([r.createdAt,r.id]))
  .toString('base64url');
const newerFirst=(a,b)=>
  b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id);
const normalizeTerm=v=>v.normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');

const importedRow=letter=>({
  id:letter.id,source:'imported',readOnly:true,
  senderIsViewer:letter.senderIsViewer===true,
  senderName:letter.senderName,
  subject:letter.subject,content:letter.content,createdAt:letter.createdAt,
  campaignDate:null,publicationState:'delivered',deliveryRound:null,
  recipientKind:letter.recipientHouseId?'house':'player',
  recipientHouseId:letter.recipientHouseId??null,
  recipientPlayerId:letter.recipientPlayerId??null,
  recipientUid:null,deleted:letter.deleted===true,
  version:null,
});
const runtimeRow=(letter,viewerUid)=>({
  id:letter.id,source:'runtime',readOnly:false,
  senderIsViewer:letter.senderUid===viewerUid,
  senderName:letter.senderName??null,
  subject:letter.subject,content:letter.content,createdAt:letter.createdAt,
  campaignDate:letter.campaignDate??null,
  publicationState:letter.publicationState,
  deliveryRound:letter.deliveryRound??null,
  recipientKind:letter.recipientKind??null,
  recipientHouseId:letter.recipientHouseId??null,
  recipientPlayerId:letter.recipientPlayerId??null,
  recipientUid:letter.recipientUid??null,
  deleted:letter.deletedAt!==null,
  version:letter.version??null,
});
const mayView=(row,actor)=>{
  if(row.deleted)return false;
  if(row.publicationState!=='delivered')return row.senderIsViewer;
  if(row.senderIsViewer||actor.role==='narrador')return true;
  if(row.recipientKind==='house')
    return actor.memberHouseIds.has(row.recipientHouseId);
  if(row.recipientKind==='player')
    return actor.playerId!==null&&row.recipientPlayerId===actor.playerId;
  // 'narrator' is not a House. It never grants a player cross-mail access.
  return false;
};
const actuallyReceived=(row,actor)=>{
  if(row.senderIsViewer||row.publicationState!=='delivered')return false;
  if(row.recipientKind==='house')
    return actor.role==='jogador'&&
      actor.memberHouseIds.has(row.recipientHouseId);
  if(row.recipientKind==='player')
    return actor.role==='jogador'&&row.recipientPlayerId===actor.playerId;
  return row.recipientKind==='narrator'&&actor.role==='narrador';
};
const matchesFolder=(row,folder,actor)=>({
  all:()=>true,
  received:()=>actuallyReceived(row,actor),
  sent:()=>row.senderIsViewer&&row.publicationState==='delivered',
  drafts:()=>row.senderIsViewer&&row.publicationState==='draft',
  scheduled:()=>row.senderIsViewer&&row.publicationState==='scheduled',
}[folder])();
const matchesQuery=(row,query)=>{
  if(!query)return true;
  return normalizeTerm([row.subject||'',row.content||'',row.senderName||'']
    .join('\n')).includes(query);
};
const validTimestamp=v=>typeof v==='string'&&ISO.test(v);

/** Snapshot ID is trusted server configuration, never taken from a request. */
export function createEmulatorUnifiedMailbox({db,auth,snapshotId,env=process.env}){
  assertEmulatorOnly(env,PROJECT);
  if(!HASH.test(snapshotId)||!db||
     typeof auth?.verifyIdToken!=='function'||
     typeof auth?.getUser!=='function')
    throw Error('Invalid unified mailbox configuration');
  const legacy=createEmulatorInbox({db,auth,snapshotId,env});
  const operational=createEmulatorMailCommands({db,auth,snapshotId,env});
  const root=db.collection('migrationDomainStage').doc(snapshotId);
  const state=db.collection('migrationMailRuntimeStage').doc(snapshotId);
  const receiptColl=state.collection('readReceipts');

  async function viewer(idToken){
    if(typeof idToken!=='string'||idToken.length>10000||!idToken)deny();
    let decoded,user;
    try{
      decoded=await auth.verifyIdToken(idToken,true);
      if(typeof decoded?.uid!=='string'||!decoded.uid)deny();
      user=await auth.getUser(decoded.uid);
    }catch{deny();}
    if(!user||user.disabled||user.uid!==decoded.uid)deny();
    const [stage,access,runtime]=await Promise.all([
      root.get(),root.collection('access').doc(decoded.uid).get(),state.get(),
    ]);
    if(!stage.exists||stage.data()?.status!=='complete'||
       !runtime.exists||runtime.data()?.status!=='active'||
       !access.exists)deny();
    const raw=access.data();
    if(raw?.userId!==decoded.uid||raw.active!==true||
       raw.requirePasswordChange===true)deny();
    if(raw.profile==='narrador'&&raw.admin===true)
      return {uid:decoded.uid,role:'narrador',playerId:null,
        memberHouseIds:new Set()};
    if(raw.profile!=='jogador'||raw.admin!==false||
       typeof raw.playerId!=='string'||!raw.playerId||
       !Array.isArray(raw.memberHouseIds)||
       !raw.memberHouseIds.every(x=>typeof x==='string'&&x&&x.length<=512))
      deny();
    return {uid:decoded.uid,role:'jogador',playerId:raw.playerId,
      memberHouseIds:new Set(raw.memberHouseIds)};
  }

  async function importedList(idToken){
    const all=[],seen=new Set();
    let cursor=null;
    for(let page=0;page<MAX_LEGACY_PAGES;page++){
      const data=await legacy.listLetters({idToken,pageSize:50,cursor});
      for(const row of data.items){
        if(!HASH.test(row.id)||seen.has(row.id))throw Error('Invalid historical pagination');
        seen.add(row.id);all.push(importedRow(row));
      }
      if(all.length>MAX_TOTAL)throw Error('Mailbox preview capacity exceeded');
      if(!data.nextCursor)return all;
      if(data.nextCursor===cursor)throw Error('Historical pagination did not advance');
      cursor=data.nextCursor;
    }
    throw Error('Historical pagination exceeds preview limit');
  }

  async function attachReadAt(rows,actor){
    // Per-user only: do not expose recipient lists, source UIDs or all
    // other people's receipts. Backend root remains deny-all to clients.
    const readIds=rows.filter(row=>
      !row.senderIsViewer&&row.publicationState==='delivered');
    if(!readIds.length)return rows.map(r=>({...r,readAt:null}));
    const refs=readIds.map(r=>
      receiptColl.doc(hash(r.id+':'+actor.uid)));
    const docs=typeof db.getAll==='function'
      ?await db.getAll(...refs):await Promise.all(refs.map(ref=>ref.get()));
    const readAt=new Map();
    readIds.forEach((row,i)=>{
      const receipt=docs[i]?.exists?docs[i].data():null;
      if(receipt?.letterId===row.id&&receipt.viewerUid===actor.uid&&
         validTimestamp(receipt.readAt))
        readAt.set(row.id,receipt.readAt);
    });
    return rows.map(r=>({...r,readAt:readAt.get(r.id)??null}));
  }

  async function list({idToken,pageSize=20,cursor=null,
    folder='all',source='all',query=''}={}){
    if(!Number.isInteger(pageSize)||pageSize<1||pageSize>MAX_PAGE_SIZE)
      throw Error('Invalid page size');
    if(!FOLDERS.has(folder)||!SOURCES.has(source)||
       typeof query!=='string'||query.length>120)
      throw Error('Invalid unified filter');
    const after=parseCursor(cursor);
    const actor=await viewer(idToken);
    const [old,current]=await Promise.all([
      source==='runtime'?Promise.resolve([]):importedList(idToken),
      source==='imported'?Promise.resolve([]):operational.list({idToken}),
    ]);
    const mapped=[
      ...old,
      ...current.map(r=>runtimeRow(r,actor.uid)),
    ];
    if(mapped.length>MAX_TOTAL)throw Error('Mailbox preview capacity exceeded');
    if(mapped.some(r=>!validTimestamp(r.createdAt)||!HASH.test(r.id)))
      throw Error('Invalid message ordering keys');
    if(new Set(mapped.map(r=>r.id)).size!==mapped.length)
      throw Error('Unified mailbox source identity collision');
    // Re-check access after parallel scans to prevent an old House membership
    // from authorizing a message returned by an earlier query.
    const fresh=await viewer(idToken);
    const term=normalizeTerm(query.trim());
    const filtered=mapped.filter(r=>
      mayView(r,fresh)&&matchesFolder(r,folder,fresh)&&
      matchesQuery(r,term)&&(!after||newerFirst(r,after)>0))
      .sort(newerFirst);
    const pageRows=filtered.slice(0,pageSize);
    const items=await attachReadAt(pageRows,fresh);
    return {
      items,
      nextCursor:filtered.length>pageSize?cursorOf(pageRows.at(-1)):null,
      returned:items.length,readOnly:true,
      sourceMode:'emulator-only',folder,
    };
  }

  async function getThread({idToken,letterId}={}){
    if(typeof letterId!=='string'||!HASH.test(letterId))
      throw Error('Invalid letter ID');
    const actor=await viewer(idToken);
    // Backend services enforce their own independent access checks.
    const [runtime,imported]=await Promise.all([
      operational.get({idToken,letterId}),
      legacy.getLetter({idToken,id:letterId}),
    ]);
    const current=runtime&&runtime.source!=='imported'
      ?runtimeRow(runtime,actor.uid):null;
    const previous=imported?importedRow(imported):null;
    if(current&&previous)throw Error('Unified message identity collision');
    const row=current??previous;
    if(!row)return null;
    const [runtimeReplies,historyReplies]=await Promise.all([
      operational.listReplies({idToken,letterId}),
      previous?legacy.listReplies({idToken,letterId}):Promise.resolve([]),
    ]);
    const fresh=await viewer(idToken);
    if(!mayView(row,fresh))return null;
    if(runtimeReplies===null||(previous&&historyReplies===null))return null;
    const replies=[
      ...(historyReplies??[]).map(r=>({
        id:r.id,source:'imported',readOnly:true,
        authorName:r.authorName,content:r.content,createdAt:r.createdAt,
        publicationState:'delivered',version:r.version,
      })),
      ...(runtimeReplies??[]).map(r=>({
        id:r.id,source:'runtime',readOnly:false,
        authorName:r.senderName,content:r.content,createdAt:r.createdAt,
        publicationState:r.publicationState,
        deliveryRound:r.deliveryRound??null,version:r.version,
      })),
    ];
    if(new Set(replies.map(r=>r.id)).size!==replies.length)
      throw Error('Unified reply identity collision');
    const [withReceipt]=await attachReadAt([row],fresh);
    return {
      letter:withReceipt,
      replies:replies.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||
        a.id.localeCompare(b.id)),
      readOnly:true,sourceMode:'emulator-only',
    };
  }

  async function markRead({idToken,letterId}={}){
    if(typeof letterId!=='string'||!HASH.test(letterId))
      throw Error('Invalid letter ID');
    const actor=await viewer(idToken);
    const [current,old]=await Promise.all([
      operational.get({idToken,letterId}),
      legacy.getLetter({idToken,id:letterId}),
    ]);
    if(current?.source!=='imported'&&current){
      const row=runtimeRow(current,actor.uid);
      if(!mayView(row,actor))deny();
      return operational.markRead({idToken,letterId});
    }
    if(!old)deny();
    const row=importedRow(old);
    if(!mayView(row,actor))deny();
    return legacy.markLetterRead({idToken,letterId});
  }
  return Object.freeze({list,getThread,markRead});
}
