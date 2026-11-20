/** Server-derived participants for historical and Cloud correspondence.
 * Never accept House or recipient from the reply form.
 */
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const validId=v=>typeof v==='string'&&ID.test(v);

export function cloudReplyRoute(actor,letter,snapshotId,{recipientPersonHouseId=null}={}){
 if(!actor||!letter||typeof letter!=='object'||Array.isArray(letter)||
    !validId(letter.id)||!['firebase-cloud','imported'].includes(letter.source)||
    (letter.source==='firebase-cloud'&&(!HASH.test(letter.id)||
      letter.sourceSnapshotId!==snapshotId))||
    letter.publicationState!=='delivered'||letter.deletedAt!==null||
    !validId(letter.senderUid)||letter.senderUid===actor.uid||
    typeof letter.subject!=='string'||!letter.subject.trim()||
    typeof letter.content!=='string')return null;
 const origin=letter.originHouseId??null;
 const recipient=letter.recipientKind==='player'
  ?recipientPersonHouseId:letter.recipientHouseId;
 if(origin!==null&&!validId(origin))return null;
 if(letter.recipientKind==='player'&&!validId(recipient))return null;
 if(letter.recipientKind==='house'&&!validId(recipient))return null;
 if(letter.recipientKind==='narrator'&&recipient!==null)return null;
 if(actor.role==='narrador'){
  if(letter.recipientKind==='narrator'&&validId(origin))
   return {originHouseId:null,recipientKind:'house',recipientHouseId:origin};
  // The Narrator's own broadcast may be answered by a House. The latest
  // Cloud response is then addressed to the Narrator.
  return null;
 }
 if(actor.role!=='jogador'||!Array.isArray(actor.editHouses))return null;
 if(!validId(recipient)||!actor.editHouses.includes(recipient)||
    origin===recipient)return null;
 return {originHouseId:recipient,
   recipientKind:origin===null?'narrator':'house',
   recipientHouseId:origin};
}
