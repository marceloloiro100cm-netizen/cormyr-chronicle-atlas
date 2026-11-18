/**
 * Server-side season-2 membership proof shared by Firebase Cloud read/mail.
 * Validation is deliberately synchronous and pure: callers must read the
 * exact hashed House documents using trusted Firestore Admin credentials.
 * A syntactically valid House ID alone never confers private access.
 */
const HOUSE_ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const safeIds=ids=>Array.isArray(ids)&&ids.length<=250&&
  ids.every(id=>typeof id==='string'&&HOUSE_ID.test(id))&&
  new Set(ids).size===ids.length;

export function activeSeason2HouseScopeValid({
  memberHouseIds,editHouseIds,houseDocuments,
}={}){
  if(!safeIds(memberHouseIds)||!safeIds(editHouseIds)||
     memberHouseIds.length===0||
     editHouseIds.some(id=>!memberHouseIds.includes(id))||
     !Array.isArray(houseDocuments)||
     houseDocuments.length!==memberHouseIds.length)return false;
  for(let i=0;i<memberHouseIds.length;i++){
    const doc=houseDocuments[i];
    if(doc?.exists!==true||typeof doc?.data!=='function')return false;
    let house;
    try{house=doc.data();}catch{return false;}
    if(!house||house.sourceId!==memberHouseIds[i]||
       house.active!==true||house.season!==2)return false;
  }
  return true;
}
