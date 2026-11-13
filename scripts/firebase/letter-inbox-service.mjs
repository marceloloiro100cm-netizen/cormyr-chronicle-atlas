/**
 * Cormyr — authenticated, read-only missiva service for the PRIVATE
 * Firestore Emulator. This is a backend library, NOT a public HTTP route.
 *
 * Server verifies Firebase ID token (including revocation) and reads the
 * current authoritative access document on EVERY request. Client role
 * claims, selected UI house and caller-supplied snapshot IDs are ignored.
 *
 * Historical ambiguous letters remain in deny-all lettersQuarantine.
 * No send, reply, edit or delete endpoints are exposed.
 */
import {createHash} from 'node:crypto';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';

const DEMO='demo-cormyr-migration';
const MAX_SCAN=5000;
const MAX_PAGE_SIZE=50;
const HASH=/^[a-f0-9]{64}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

export class InboxDenied extends Error {
  constructor(){super('Inbox access denied');this.name='InboxDenied';}
}
const deny=()=>{throw new InboxDenied();};

function parseCursor(value){
  if(value==null)return null;
  if(typeof value!=='string'||value.length>256)throw new Error('Invalid pagination cursor');
  try{
    const decoded=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
    if(!Array.isArray(decoded)||decoded.length!==2||
       typeof decoded[0]!=='string'||!ISO.test(decoded[0])||
       typeof decoded[1]!=='string'||!HASH.test(decoded[1])){
      throw new Error('Invalid cursor content');
    }
    return {createdAt:decoded[0],id:decoded[1]};
  }catch{throw new Error('Invalid pagination cursor');}
}
const makeCursor=r=>Buffer.from(JSON.stringify([r.createdAt,r.id])).toString('base64url');
function compare(a,b){
  if(a.createdAt!==b.createdAt)return a.createdAt>b.createdAt?-1:1;
  return a.id===b.id?0:a.id>b.id?-1:1;
}

function normalizeAccess(uid,raw){
  if(!raw||raw.userId!==uid||raw.active!==true||
     raw.requirePasswordChange===true||raw.admin===undefined)deny();
  if(raw.profile==='narrador'&&raw.admin===true){
    return {role:'narrador',uid};
  }
  if(raw.profile!=='jogador'||raw.admin!==false||
     typeof raw.playerId!=='string'||!raw.playerId||
     !Array.isArray(raw.memberHouseIds)||
     !raw.memberHouseIds.every(x=>typeof x==='string'&&x&&x.length<=512))deny();
  return {role:'jogador',uid,playerId:raw.playerId,
    memberHouseIds:new Set(raw.memberHouseIds)};
}

function canRead(letter,actor){
  // Only unambiguous, addressed letters belong in this collection.
  if(!letter||typeof letter.senderUid!=='string'||
     typeof letter.subject!=='string'||typeof letter.content!=='string'||
     typeof letter.createdAt!=='string'||!ISO.test(letter.createdAt)||
     typeof letter.deletedAt==='undefined'||
     letter.publicationState!=='delivered')return false;
  const player=typeof letter.recipientPlayerId==='string'&&letter.recipientPlayerId.length>0;
  const house=typeof letter.recipientHouseId==='string'&&letter.recipientHouseId.length>0;
  if(player===house)return false;
  if(actor.role==='narrador')return true;
  if(letter.deletedAt!==null)return false;
  return letter.senderUid===actor.uid||
    (player&&letter.recipientPlayerId===actor.playerId)||
    (house&&actor.memberHouseIds.has(letter.recipientHouseId));
}
function safeView(doc){
  const r=doc.data();
  return {
    id:doc.id,subject:r.subject,content:r.content,createdAt:r.createdAt,
    senderName:typeof r.senderName==='string'?r.senderName:null,
    senderPlayerId:r.senderPlayerId??null,
    recipientPlayerId:r.recipientPlayerId??null,
    recipientHouseId:r.recipientHouseId??null,
    deleted:Boolean(r.deletedAt),
  };
}

/** The snapshot comes from trusted server initialization, NEVER user input. */
export function createEmulatorInbox({db,auth,snapshotId,env=process.env}){
  assertEmulatorOnly(env,DEMO);
  if(!HASH.test(snapshotId)||!db||!auth||
     typeof auth.verifyIdToken!=='function'||
     typeof auth.getUser!=='function')throw Error('Invalid inbox service configuration');

  const root=db.collection('migrationDomainStage').doc(snapshotId);
  const letters=root.collection('letters');
  const access=root.collection('access');

  async function authorize(idToken){
    if(typeof idToken!=='string'||!idToken||idToken.length>10000)deny();
    let decoded,user;
    try{
      decoded=await auth.verifyIdToken(idToken,true);
      if(!decoded||typeof decoded.uid!=='string'||!decoded.uid)deny();
      user=await auth.getUser(decoded.uid);
    }catch{deny();}
    if(!user||user.disabled===true||user.uid!==decoded.uid)deny();
    const [stage,scope]=await Promise.all([
      root.get(),access.doc(decoded.uid).get(),
    ]);
    if(!stage.exists||stage.data()?.status!=='complete'||!scope.exists)deny();
    return normalizeAccess(decoded.uid,scope.data());
  }

  async function listLetters({idToken,pageSize=20,cursor=null}={}){
    const actor=await authorize(idToken);
    if(!Number.isInteger(pageSize)||pageSize<1||pageSize>MAX_PAGE_SIZE)
      throw new Error('Invalid page size');
    const after=parseCursor(cursor);
    const snapshots=[];
    const collect=async query=>{
      const result=await query.limit(MAX_SCAN+1).get();
      if(result.size>MAX_SCAN)throw Error('Inbox exceeds preview scan limit');
      snapshots.push(result);
    };
    if(actor.role==='narrador') {
      await collect(letters);
    }else{
      if(actor.memberHouseIds.size>126)throw Error('Too many house memberships');
      const operations=[
        collect(letters.where('senderUid','==',actor.uid)),
        collect(letters.where('recipientPlayerId','==',actor.playerId)),
        ...[...actor.memberHouseIds].map(house=>
          collect(letters.where('recipientHouseId','==',house))),
      ];
      await Promise.all(operations);
    }
    const seen=new Map();
    for(const batch of snapshots)for(const doc of batch.docs){
      if(!HASH.test(doc.id))continue;
      if(canRead(doc.data(),actor))seen.set(doc.id,safeView(doc));
    }
    let items=[...seen.values()].sort(compare);
    if(after)items=items.filter(row=>compare(row,after)>0);
    const chunk=items.slice(0,pageSize);
    return {items:chunk,nextCursor:items.length>pageSize?
      makeCursor(chunk.at(-1)):null,readOnly:true};
  }

  async function getLetter({idToken,id}={}){
    const actor=await authorize(idToken);
    if(typeof id!=='string'||!HASH.test(id))throw Error('Invalid letter id');
    const doc=await letters.doc(id).get();
    if(!doc.exists||!canRead(doc.data(),actor))return null;
    return safeView(doc);
  }
  /**
   * Server-only delivered replies; NO draft/scheduled, deleted or stranger
   * correspondence. A House membership alone cannot expose a reply addressed
   * to a different individual within that House.
   */
  async function listReplies({idToken,letterId}={}){
    const actor=await authorize(idToken);
    if(typeof letterId!=='string'||!HASH.test(letterId))
      throw new Error('Invalid letter id');
    const parent=await letters.doc(letterId).get();
    if(!parent.exists||!canRead(parent.data(),actor))return null;
    const history=db.collection('migrationMailHistoryStage').doc(snapshotId);
    const current=await history.get();
    if(!current.exists||current.data()?.status!=='complete')deny();
    const results=await history.collection('replies')
      .where('letterId','==',letterId).limit(MAX_SCAN+1).get();
    if(results.size>MAX_SCAN)throw Error('Reply set exceeds preview scan limit');
    const visible=[];
    for(const doc of results.docs){
      const reply=doc.data();
      if(!HASH.test(doc.id)||reply?.letterId!==letterId||
         reply.publicationState!=='delivered'||reply.deletedAt!==null||
         !ISO.test(reply.createdAt)||typeof reply.content!=='string'||
         typeof reply.authorName!=='string')continue;
      if(actor.role!=='narrador'&&reply.authorUid!==actor.uid&&
         reply.recipientUid!==actor.uid)continue;
      visible.push({
        id:doc.id,authorName:reply.authorName,content:reply.content,
        createdAt:reply.createdAt,version:reply.version,
      });
    }
    return visible.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||
      a.id.localeCompare(b.id));
  }

  /**
   * Emulator-only, server-authorized receipt. This does not mark a house as
   * collectively having read a letter: each permitted recipient records only
   * their own acknowledgement. Sender, narrator by override, and editor
   * cannot generate another person's read receipt.
   *
   * The original imported archive and typed letter remain immutable. The
   * receipt lives in a separate deny-all runtime namespace.
   */
  async function markLetterRead({idToken,letterId}={}){
    const actor=await authorize(idToken);
    if(actor.role!=='jogador')deny();
    if(typeof letterId!=='string'||!HASH.test(letterId))
      throw new Error('Invalid letter id');
    if(typeof db.runTransaction!=='function')
      throw new Error('Firestore transactions unavailable');
    const receiptId=createHash('sha256')
      .update(letterId+':'+actor.uid).digest('hex');
    const receiptRef=db.collection('migrationMailRuntimeStage').doc(snapshotId)
      .collection('readReceipts').doc(receiptId);
    return db.runTransaction(async transaction=>{
      // Re-read the authorization snapshot inside the transaction: a
      // membership revoked between token verification and commit must fail.
      const [stage,scope,parent,existing]=await Promise.all([
        transaction.get(root),
        transaction.get(access.doc(actor.uid)),
        transaction.get(letters.doc(letterId)),
        transaction.get(receiptRef),
      ]);
      if(!stage.exists||stage.data()?.status!=='complete'||!scope.exists)
        deny();
      const current=normalizeAccess(actor.uid,scope.data());
      if(current.role!=='jogador'||!parent.exists)deny();
      const letter=parent.data();
      if(!canRead(letter,current)||letter.deletedAt!==null||
         letter.senderUid===actor.uid)deny();
      const direct=letter.recipientPlayerId===current.playerId;
      const house=typeof letter.recipientHouseId==='string'&&
        current.memberHouseIds.has(letter.recipientHouseId);
      if(!direct&&!house)deny();
      if(existing.exists){
        if(existing.data()?.viewerUid!==actor.uid||
           existing.data()?.letterId!==letterId)deny();
        return {recorded:true,alreadyRecorded:true};
      }
      transaction.create(receiptRef,{
        schemaVersion:1,letterId,viewerUid:actor.uid,
        readAt:new Date().toISOString(),
      });
      return {recorded:true,alreadyRecorded:false};
    });
  }
  return Object.freeze({listLetters,getLetter,listReplies,markLetterRead});
}
