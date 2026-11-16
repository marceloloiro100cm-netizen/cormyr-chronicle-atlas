/**
 * Pure, server-side predicate for per-user mail read acknowledgements.
 * Historical letters and Firebase runtime letters share a single receipt
 * identity without ever modifying original letter data.
 */
import {createHash} from 'node:crypto';

const SAFE=/^[^/\u0000-\u001f\u007f]{1,128}$/;
export const MAIL_SOURCES=Object.freeze(['imported','firebase-cloud']);
export const validMailIdentity=(source,id)=>
  MAIL_SOURCES.includes(source)&&typeof id==='string'&&SAFE.test(id);

export function mailReceiptId(uid,source,id){
  if(typeof uid!=='string'||!SAFE.test(uid)||!validMailIdentity(source,id))
    throw Error('invalid_receipt_identity');
  return createHash('sha256').update('mail-read-v1:'+uid+':'+source+':'+id).digest('hex');
}

export function canAcknowledgeMail(actor,record,source,id){
  if(!record||!actor||!validMailIdentity(source,id)||
     record.publicationState!=='delivered'||record.deletedAt!==null||
     record.senderUid===actor.uid||
     typeof record.senderUid!=='string')return false;

  if(source==='imported'){
    if(record.sourceId!==id||record.source==='firebase-cloud')return false;
    const direct=typeof record.recipientPlayerId==='string'&&
      record.recipientPlayerId.length>0;
    const house=typeof record.recipientHouseId==='string'&&
      record.recipientHouseId.length>0;
    if(direct===house||actor.role!=='jogador')return false;
    return direct
      ?record.recipientPlayerId===actor.playerId
      :Array.isArray(actor.memberHouses)&&
        actor.memberHouses.includes(record.recipientHouseId);
  }

  if(record.source!=='firebase-cloud'||record.id!==id||
     record.recipientPlayerId!==null)return false;
  if(record.recipientKind==='narrator'){
    return actor.role==='narrador'&&
      record.recipientHouseId===null;
  }
  if(record.recipientKind!=='house'||
     typeof record.recipientHouseId!=='string'||
     record.recipientHouseId.length===0)return false;
  return actor.role==='jogador'&&Array.isArray(actor.memberHouses)&&
    actor.memberHouses.includes(record.recipientHouseId);
}
