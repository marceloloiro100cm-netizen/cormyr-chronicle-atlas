/** Cloud-only reply routing. The recipient is derived on the server from a
 * delivered runtime letter and the caller's CURRENT trusted edit scope.
 * Never accept a reply destination or sender House from the browser.
 */
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const validId=v=>typeof v==='string'&&ID.test(v);
export function cloudReplyRoute(actor,letter,snapshotId){
  if(!actor||!letter||typeof letter!=='object'||Array.isArray(letter)||
     !HASH.test(letter.id??'')||letter.source!=='firebase-cloud'||
     letter.sourceSnapshotId!==snapshotId||
     letter.publicationState!=='delivered'||letter.deletedAt!==null||
     letter.recipientPlayerId!==null||
     !validId(letter.senderUid)||letter.senderUid===actor.uid||
     typeof letter.subject!=='string'||!letter.subject.trim()||
     typeof letter.content!=='string')return null;
  if(actor.role==='narrador'){
    // A narrator may only reply to letters specifically addressed to them.
    if(letter.recipientKind!=='narrator'||letter.recipientHouseId!==null||
       !validId(letter.originHouseId))return null;
    return {originHouseId:null,recipientKind:'house',
      recipientHouseId:letter.originHouseId};
  }
  if(actor.role!=='jogador'||!Array.isArray(actor.editHouses)||
     letter.recipientKind!=='house'||!validId(letter.recipientHouseId)||
     !actor.editHouses.includes(letter.recipientHouseId))return null;
  // The original sender is a narrator or an actual House, never a client
  // selected destination. A malformed origin cannot become a recipient.
  if(letter.originHouseId!==null&&!validId(letter.originHouseId))return null;
  if(letter.originHouseId===letter.recipientHouseId)return null;
  return {originHouseId:letter.recipientHouseId,
    recipientKind:letter.originHouseId===null?'narrator':'house',
    recipientHouseId:letter.originHouseId};
}
