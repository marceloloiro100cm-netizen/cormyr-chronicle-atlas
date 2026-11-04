import {contentParts} from '@/lib/campaign-content';
import {isNarrativeNpc} from '@/lib/house/narrative-npc';

export type GalleryRecord={
 id:string;house_id:string|null;kind:string;title:string;content:string;
};
export type GalleryRecordImage={
 id:string;path:string;caption:string;recordTitle:string;topic:'images'|'npcs';
};

/** A derived index, never a second upload or a replacement for the originals.
 * The caller MUST pass only already authorized records of the selected House.
 */
export function houseRecordGalleryImages(
 records:readonly GalleryRecord[],houseId:string,
):GalleryRecordImage[]{
 const seen=new Set<string>();
 const output:GalleryRecordImage[]=[];
 for(const record of records){
  // Defense in depth: even an admin-wide Panel cannot mix another House in.
  if(record.house_id!==houseId)continue;
  const parts=contentParts(record.content);
  const imageParts=parts.filter((part):part is {path:string;caption:string}=>
   'path' in part&&Boolean(part.path));
  const onlyPortrait=imageParts.length===1&&parts.every(part=>
   'path' in part||!part.text.trim());
  // Preserve every standalone portrait shown by the old character-sheet
  // gallery, even when the record is also classified as a narrative NPC.
  const topics:('images'|'npcs')[]=[
   ...(onlyPortrait||!isNarrativeNpc(record)?['images' as const]:[]),
   ...(isNarrativeNpc(record)?['npcs' as const]:[]),
  ];
  for(const part of imageParts)for(const topic of topics){
   const key=topic+':'+part.path;
   if(seen.has(key))continue;
   seen.add(key);
   output.push({
    id:topic+':'+record.id+':'+part.path,path:part.path,
    caption:part.caption.trim()||record.title,recordTitle:record.title,topic,
   });
  }
 }
 return output;
}
