/**
 * An operational working copy of an imported DRAFT.
 * The imported stage is never mutated. Publication of imported drafts is a
 * separate workflow; this only saves editor-only working content.
 */
import {validateEditorialContent} from './cloud-editorial-content.mjs';
import {isNewspaperDate} from './newspaper-core.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS=new Set(['id','type','text','subtitle','byline','caption','imageSrc',
 'titleFont','bodyFont','span','height','icon','align','imageStyle',
 'autoHeight','imageFocus','focusX','focusY','cropZoom','pinned','dropCap','commissionId']);
const imagePlaceholder='/newspaper/gravuras/castelo_cormyr.jpg';
const invalid=()=>{throw Error('invalid_historical_draft');};
export const historicalDraftId=id=>typeof id==='string'&&UUID.test(id);
export function validateHistoricalDraft(source,raw){
 if(!source||!historicalDraftId(source.id)||source.state!=='draft'||
    !Number.isSafeInteger(source.version)||source.version<1||
    !Number.isSafeInteger(source.editionNo)||source.editionNo<1||
    !Array.isArray(source.blocks)||!raw||typeof raw!=='object'||Array.isArray(raw)||
    Object.keys(raw).some(k=>!['title','subtitle','template','font_style','blocks','campaignDate'].includes(k))||
    !Array.isArray(raw.blocks)||raw.blocks.length>80||
    typeof raw.campaignDate!=='string'||!isNewspaperDate(raw.campaignDate)||
    Buffer.byteLength(JSON.stringify(raw),'utf8')>240_000)invalid();
 const original=new Map(source.blocks.filter(b=>b&&typeof b.id==='string').map(b=>[b.id,b]));
 const paths=new Map(),trustedSourceImages=new Map();
 const checked=raw.blocks.map(block=>{
  if(!block||typeof block!=='object'||Array.isArray(block))invalid();
  const old=original.get(block.id);
  // Only the previously imported image belonging to the SAME block can be kept.
  // Never accept arbitrary Storage keys from the browser.
  if('imagePath' in block){
   if(!old||typeof old.imagePath!=='string'||block.imagePath!==old.imagePath||
      block.type!=='image')invalid();
   paths.set(block.id,old.imagePath);
  }else if(old?.imagePath&&block.type==='image'){
   // The old editor can omit the legacy path from its draft projection.
   paths.set(block.id,old.imagePath);
  }
  const safe=Object.fromEntries(Object.entries(block).filter(([k])=>FIELDS.has(k)));
  // Older, already-reviewed imports may contain an image URL that the new
  // Cloud editor does not accept for *new* images. Keep it only if identical
  // to the immutable source, never from an arbitrary client value.
  if(block.type==='image'&&typeof safe.imageSrc==='string'&&
     safe.imageSrc!==imagePlaceholder&&
     !['/newspaper/gravuras/castelo_cormyr.jpg',
       '/newspaper/gravuras/conselho_real.jpg',
       '/newspaper/gravuras/mercado_suzail.jpg'].includes(safe.imageSrc)){
    if(old?.imageSrc!==safe.imageSrc)invalid();
    trustedSourceImages.set(block.id,old.imageSrc);
    safe.imageSrc=imagePlaceholder;
  }
  // A historical page may contain an empty image placeholder. Validate it
  // without replacing it with a fictitious picture in the saved edition.
  if(block.type==='image'&&!safe.imageSrc)safe.imageSrc=imagePlaceholder;
  return safe;
 });
 let valid;
 try{valid=validateEditorialContent({title:raw.title,subtitle:raw.subtitle,
  template:raw.template,font_style:raw.font_style,blocks:checked});}
 catch{invalid();}
 const blocks=valid.blocks.map(b=>{
  const prior=original.get(b.id),rest=prior&&prior.type===b.type?{...prior}:{};
  const next={...rest,...b};
  if(paths.has(b.id))next.imagePath=paths.get(b.id);
  else delete next.imagePath;
  if(trustedSourceImages.has(b.id))next.imageSrc=trustedSourceImages.get(b.id);
  else if(!raw.blocks.find(x=>x.id===b.id)?.imageSrc){
   // safeNewspaperBlocks may omit an unsupported legacy image URL. Never
   // discard its source reference merely because the browser cannot edit it.
   if(prior?.type==='image'&&typeof prior.imageSrc==='string')
    next.imageSrc=prior.imageSrc;
   else delete next.imageSrc;
  }
  return next;
 });
 return {...valid,blocks,campaignDate:raw.campaignDate};
}
