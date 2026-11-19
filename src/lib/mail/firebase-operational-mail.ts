/** Strict server-side adaptation of approved mutable Firebase mail to the original UI. */
import type {Row} from '../firebase-workspace/query';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const validId=(v:unknown):v is string=>typeof v==='string'&&ID.test(v);
const validDate=(v:unknown):v is string=>typeof v==='string'&&
 v.length<=48&&Number.isFinite(Date.parse(v));
const bad=():never=>{throw Error('firebase_operational_mail_integrity_failed');};

/**
 * No synthetic fallback, no partial reads, and no edits to the archive.
 * Withdrawn (cancelled/removed) runtime rows keep deleted_at so the original
 * ACL hides them from players and shows them only in the Lixeira.
 * Replies are preserved as delivered correspondence with their parent
 * reference, pending full thread-aware editorial controls.
 */
export function projectCloudLetters(docs:readonly {id:string;data:()=>unknown}[],
 snapshotId:string):Row[]{
 if(!SHA.test(snapshotId)||!Array.isArray(docs)||docs.length>500)bad();
 const seen=new Set<string>();
 return docs.map(doc=>{
  const v=doc.data();
  if(!v||typeof v!=='object'||Array.isArray(v))bad();
  const m=v as Record<string,unknown>;
  if(!SHA.test(doc.id)||m['id']!==doc.id||seen.has(doc.id)||
     m['source']!=='firebase-cloud'||m['sourceSnapshotId']!==snapshotId||
     !validId(m['senderUid'])||!validDate(m['createdAt'])||
     !validDate(m['deliveredAt'])||typeof m['subject']!=='string'||
     !m['subject'].trim()||m['subject'].length>180||
     typeof m['content']!=='string'||m['content'].length>20000||
     m['publicationState']!=='delivered'||
     // Withdrawn messages stay in the Lixeira: deletedAt + a known kind.
     !(m['deletedAt']===null||validDate(m['deletedAt'])&&
       ['cancelada','excluida'].includes(String(m['removalKind'])))||
     (m['version']!==undefined&&(!Number.isSafeInteger(m['version'])||
       (m['version'] as number)<1))||
     (m['editedAt']!==undefined&&m['editedAt']!==null&&!validDate(m['editedAt']))||
     !Number.isSafeInteger(m['deliveryRound'])||
     (m['deliveryRound'] as number)<1||!Number.isSafeInteger(m['creationRound'])||
     (m['creationRound'] as number)<1||
     !['house','narrator'].includes(String(m['recipientKind']))||
     (m['originHouseId']!==null&&!validId(m['originHouseId']))||
     (m['recipientKind']==='narrator'&&
       (m['recipientHouseId']!==null||!validId(m['originHouseId'])))||
     (m['recipientKind']==='house'&&!validId(m['recipientHouseId']))||
     (m['recipientPlayerId']!==null)||
     (m['senderPlayerId']!==null&&!validId(m['senderPlayerId']))||
     (m['replyToId']!==undefined&&!SHA.test(String(m['replyToId'])))||
     (m['batchKey']!==undefined&&
       (typeof m['batchKey']!=='string'||m['batchKey'].length>128||
        !/^[a-zA-Z0-9_-]+$/.test(m['batchKey']))))
    bad();
  seen.add(doc.id);
  return {
   id:doc.id,sender_user_id:m['senderUid'],
   sender_player_id:m['senderPlayerId'],
   sender_name:typeof m['senderName']==='string'?m['senderName']:'Jogador',
   recipient_player_id:null,
   recipient_house_id:m['recipientHouseId'],
   origin_house_id:m['originHouseId'],
   subject:m['subject'],content:m['content'],
   created_at:m['createdAt'],delivered_at:m['deliveredAt'],
   deleted_at:m['deletedAt'],publication_state:'delivered',
   // Optimistic version for author edit/cancel during the open week.
   version:m['version']??1,edited_at:m['editedAt']??null,
   removal_kind:m['deletedAt']===null?null:m['removalKind'],
   creation_week:m['creationRound'],delivery_week:m['deliveryRound'],
   letter_number:null,letter_kind:'reservada',
   court_member_id:null,court_assignment:null,military_unit_id:null,
   batch_key:m['batchKey']??null,campaign_date:typeof m['campaignDate']==='string'
     ?m['campaignDate']:null,
   // Original letter and its Cloud response share the parent conversation.
   conversation_id:m['replyToId']??doc.id,source:'firebase-cloud',
  };
 });
}
