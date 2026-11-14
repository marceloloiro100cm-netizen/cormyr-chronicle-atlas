/**
 * Pure authorization of Storage objects, ported from the storage.objects RLS
 * policies (0010, 0017 to 0021, 0058/0059, 0111, 0117, 0118, 0120). Default
 * deny: a bucket or operation without a policy is refused, as in the SQL.
 *
 * `actor` is null for an anonymous caller, otherwise
 *   {role:'narrador'|'jogador', uid, playerId, memberHouseIds:Set, editHouseIds:Set}
 * (an active account, as the access scope guarantees). Rules that depend on
 * other domains read `facts`, resolved by the caller from those domains:
 *   referencedByReadableContent  delivered, readable letter/reply or readable record embeds the path
 *   crestHouseId                 house whose sheet identity.crestPath equals the path
 *   publicGalleryImage           a reviewed house_catalog gallery lists the path
 *   canEditNewspaper             narrator or the newspaper editor identity
 *   newspaperAssetReadable       can_read_campaign_newspaper_asset(path)
 *   newspaperAssetUploadAllowed  the upload predicate of newspaper_asset_upload
 * No I/O.
 */
export class StorageAccessError extends Error {
  constructor(code,message){super(message);this.name='StorageAccessError';this.code=code;}
}
const IMAGE_NAME=/^[0-9a-f-]{36}\.(png|jpg|webp)$/;
const COMMISSION_NAME=/^[A-Za-z0-9_-]+\/[0-9a-f-]{36}\.(png|jpg|webp)$/;
export const BUCKETS=Object.freeze({
  images:'campaign-images',newspapers:'campaign-newspapers',commissions:'campaign-newspaper-commissions',
  staff:'campaign-newspaper-staff',engravings:'campaign-newspaper-engravings',
});
const isNarrator=a=>!!a&&a.role==='narrador';
const folder0=name=>name.includes('/')?name.split('/')[0]:null;
const member=(a,h)=>!!a&&a.role==='jogador'&&a.memberHouseIds.has(h);
const editor=(a,h)=>!!a&&a.role==='jogador'&&a.editHouseIds.has(h);

function validName(name){
  return typeof name==='string'&&name.length>0&&name.length<=1024&&!name.startsWith('/')&&!name.includes('..')&&
    !name.includes('\\')&&!name.includes('\u0000')&&!name.split('/').some(p=>p==='');
}

/** @returns {boolean} whether the operation is allowed. Never throws for a plain denial. */
export function canAccess({actor,op,bucket,name,facts={}}){
  if(!['read','upload','delete'].includes(op)||!validName(name))return false;
  if(actor&&!['narrador','jogador'].includes(actor.role))return false;
  switch(bucket){
    case BUCKETS.images:{
      if(op==='upload')
        return !!actor&&folder0(name)===actor.uid&&(isNarrator(actor)||actor.playerId!=null);
      if(op!=='read')return false;
      // public_gallery_image_read applies to anonymous and authenticated callers.
      if(facts.publicGalleryImage===true)return true;
      if(!actor)return false;
      if(isNarrator(actor))return true;
      if(folder0(name)===actor.uid||facts.referencedByReadableContent===true)return true;
      // campaign_house_crests_read
      return name.startsWith('house-crests/')&&typeof facts.crestHouseId==='string'&&
        name.startsWith('house-crests/'+facts.crestHouseId+'/')&&member(actor,facts.crestHouseId);
    }
    case BUCKETS.newspapers:
      if(!actor)return false;
      if(op==='read')return facts.newspaperAssetReadable===true;
      if(op==='upload')return facts.canEditNewspaper===true&&facts.newspaperAssetUploadAllowed===true;
      return false;
    case BUCKETS.commissions:{
      if(!actor)return false;
      const house=name.split('/')[0];
      if(op==='read')return facts.canEditNewspaper===true||member(actor,house);
      if(op==='upload')return COMMISSION_NAME.test(name)&&(isNarrator(actor)||editor(actor,house));
      return false;
    }
    case BUCKETS.staff:
    case BUCKETS.engravings:
      if(!actor||facts.canEditNewspaper!==true)return false;
      if(op==='upload')return IMAGE_NAME.test(name);
      return op==='read'||op==='delete';
    default:
      return false;
  }
}

export function requireAccess(args){
  if(!canAccess(args))throw new StorageAccessError('denied','Acesso negado');
}
