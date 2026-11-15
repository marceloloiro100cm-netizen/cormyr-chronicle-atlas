/**
 * Resolvers for storage-access-service.mjs over the staged domains
 * (Firestore Emulator ONLY). Each returns a strict boolean and can only
 * answer true from data it read; a missing document means false.
 *
 *  publicGalleryImage           stage gallery doc (reviewed house_catalog gallery)
 *  referencedByReadableContent  index doc -> delivered letter, delivered reply
 *                               or record the actor can read
 *  newspaperAssetReadable       can_read_campaign_newspaper_asset
 *  newspaperAssetUploadAllowed  newspaper_asset_upload (edition id is the first folder)
 *
 * Replies are approximated by author, recipient or Narrator (a subset of
 * can_read_reply), so the approximation can only deny more.
 */
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {ROOT as REF_ROOT} from './stage-storage-references-emulator.mjs';
import {ROOT as NEWS_ROOT} from './stage-newspaper-runtime-emulator.mjs';
import {ROOT as RECORD_ROOT} from './stage-records-emulator.mjs';
import {pathDocId} from './storage-references-core.mjs';
import {canReadRecord} from './record-core.mjs';

const PROJECT='demo-cormyr-migration';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_STRING=v=>typeof v==='string'&&v.length>0;

function letterReadable(l,actor){
  if(!l||l.publicationState!=='delivered'||!ISO_STRING(l.senderUid))return false;
  const player=ISO_STRING(l.recipientPlayerId),house=ISO_STRING(l.recipientHouseId);
  if(player===house)return false;
  if(actor.role==='narrador')return true;
  if(l.deletedAt!==null&&l.deletedAt!==undefined)return false;
  return l.senderUid===actor.uid||(player&&l.recipientPlayerId===actor.playerId)||
    (house&&actor.memberHouseIds.has(l.recipientHouseId));
}
function replyReadable(r,actor){
  if(!r||r.publicationState!=='delivered')return false;
  if(actor.role==='narrador')return true;
  if(r.deletedAt!==null&&r.deletedAt!==undefined)return false;
  return r.authorUid===actor.uid||r.recipientUid===actor.uid;
}

export function createStageStorageResolvers({db,snapshotId,env=process.env}){
  assertEmulatorOnly(env,PROJECT);
  if(!/^[a-f0-9]{64}$/.test(snapshotId)||typeof db?.collection!=='function')
    throw Error('Invalid isolated storage resolver configuration');
  const refs=db.collection(REF_ROOT).doc(snapshotId);
  const letters=db.collection('migrationDomainStage').doc(snapshotId).collection('letters');
  const replies=db.collection('migrationMailHistoryStage').doc(snapshotId).collection('replies');
  const records=db.collection(RECORD_ROOT).doc(snapshotId).collection('records');
  const editions=db.collection(NEWS_ROOT).doc(snapshotId).collection('editions');
  const strList=v=>Array.isArray(v)?v.filter(x=>typeof x==='string'&&x.length>0).slice(0,500):[];
  const editionOf=async name=>{
    const id=name.split('/')[0];
    if(!UUID.test(id)||!name.includes('/'))return null;
    const s=await editions.doc(id).get();
    return s.exists?s.data():null;
  };

  return {
    async publicGalleryImage({name}){
      return (await refs.collection('gallery').doc(pathDocId(name)).get()).exists;
    },
    async referencedByReadableContent({name,actor}){
      const idx=(await refs.collection('refs').doc(pathDocId(name)).get()).data();
      if(!idx||idx.path!==name)return false;
      for(const id of strList(idx.letters)){
        const s=await letters.doc(id).get();
        if(s.exists&&letterReadable(s.data(),actor))return true;
      }
      for(const id of strList(idx.replies)){
        const s=await replies.doc(id).get();
        if(s.exists&&replyReadable(s.data(),actor))return true;
      }
      for(const id of strList(idx.records)){
        const s=await records.doc(id).get();
        if(s.exists&&canReadRecord(actor,s.data()))return true;
      }
      return false;
    },
    async newspaperAssetReadable({name,scope}){
      const e=await editionOf(name);
      if(!e)return false;
      if(scope.canEdit)return true;
      if(!scope.canRead||!['published','archived'].includes(e.state))return false;
      return e.pdfPath===name||(Array.isArray(e.blocks)&&e.blocks.some(b=>b&&b.imagePath===name));
    },
    async newspaperAssetUploadAllowed({name}){
      return (await editionOf(name))!==null;
    },
  };
}
