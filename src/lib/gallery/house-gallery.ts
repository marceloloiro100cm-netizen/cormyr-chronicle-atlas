import {contentParts} from '@/lib/campaign-content';
import {isNarrativeNpc} from '@/lib/house/narrative-npc';

export type GalleryRecord={
 id:string;house_id:string;kind:string;title:string;content:string;
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
  const topic=isNarrativeNpc(record)?'npcs':'images';
  for(const part of contentParts(record.content)){
   if(!('path' in part)||!part.path)continue;
   const key=topic+':'+part.path;
   if(seen.has(key))continue;
   seen.add(key);
   output.push({
    id:record.id+':'+part.path,path:part.path,
    caption:part.caption.trim()||record.title,recordTitle:record.title,topic,
   });
  }
 }
 return output;
}
