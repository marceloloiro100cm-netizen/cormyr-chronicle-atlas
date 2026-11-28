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
     typeof record.senderUid!=='string')return false;

  // Narrador (decisão do proprietário, 28/11/2026): pode marcar como lida/analisada
  // qualquer missiva ENTREGUE (direta, Entre Casas/Mediação ou fio histórico com respostas)
  // para tirá-la de "Precisa de atenção" sem alterar a confirmação de leitura da Casa.
  if(actor.role==='narrador'){
    if(source==='imported')
      return record.sourceId===id&&record.source!=='firebase-cloud';
    return record.source==='firebase-cloud'&&record.id===id&&
      record.recipientPlayerId===null;
  }

  if(record.senderUid===actor.uid)return false;

  // Editor-Chefe (decisão do proprietário, 19/11/2026): lê toda missiva
  // ENTREGUE para escrever o Jornal, sem escrever, responder ou receber.
  // Só registra a própria leitura; rascunhos, programadas e excluídas
  // continuam fora do alcance pela checagem acima.
  if(actor.role==='editor'){
    if(source==='imported')
      return record.sourceId===id&&record.source!=='firebase-cloud';
    return record.source==='firebase-cloud'&&record.id===id&&
      record.recipientPlayerId===null;
  }

  if(source==='imported'){
    if(record.sourceId!==id||record.source==='firebase-cloud')return false;
    const direct=typeof record.recipientPlayerId==='string'&&
      record.recipientPlayerId.length>0;
    const house=typeof record.recipientHouseId==='string'&&
      record.recipientHouseId.length>0;
    // A narrator-wide historical announcement has no recipient. An active
    // verified House member may acknowledge their own reading of it.
    if(record.letterKind==='geral'&&record.originHouseId===null&&
       !direct&&!house&&actor.role==='jogador')
      return Array.isArray(actor.memberHouses)&&actor.memberHouses.length>0;
    if(record.recipientKind==='narrator'&&
       record.recipientPlayerId===null&&record.recipientHouseId===null)
      return false;
    if(direct===house||actor.role!=='jogador')return false;
    return direct
      ?record.recipientPlayerId===actor.playerId
      :Array.isArray(actor.memberHouses)&&
        actor.memberHouses.includes(record.recipientHouseId);
  }

  if(record.source!=='firebase-cloud'||record.id!==id||
     record.recipientPlayerId!==null)return false;
  if(record.recipientKind!=='house'||
     typeof record.recipientHouseId!=='string'||
     record.recipientHouseId.length===0)return false;
  return actor.role==='jogador'&&Array.isArray(actor.memberHouses)&&
    actor.memberHouses.includes(record.recipientHouseId);
}

/**
 * Pure predicate for per-user "Sem ação" (dismiss from "Sua vez").
 * Allows Narrator on any delivered non-deleted letter, and active House players
 * on any delivered non-deleted letter they sent or can acknowledge.
 * Editor-Chefe is read-only and never allowed.
 */
export function canSetNoAction(actor,record,source,id){
  if(!record||!actor||!validMailIdentity(source,id)||
     record.publicationState!=='delivered'||record.deletedAt!==null||
     typeof record.senderUid!=='string')return false;
  if(actor.role==='editor')return false;
  if(canAcknowledgeMail(actor,record,source,id))return true;
  if(actor.role==='jogador'&&record.senderUid===actor.uid){
    if(source==='imported')return record.sourceId===id&&record.source!=='firebase-cloud';
    return record.source==='firebase-cloud'&&record.id===id&&record.recipientPlayerId===null;
  }
  return false;
}
