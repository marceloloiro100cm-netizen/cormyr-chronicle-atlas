/**
 * Pure helpers for the Storage reference index. Ports the substring tests of
 * the campaign_images_read policy ([cormyr-image:<path>| inside letter, reply
 * or record content) and can_read_public_gallery_image (reviewed house_catalog
 * gallery paths). No I/O; only paths and source ids leave this module.
 */
import {createHash} from 'node:crypto';

const REF=/\[cormyr-image:([a-zA-Z0-9_./-]+)\|/g;
export const pathDocId=path=>createHash('sha256').update('storage-path:'+path).digest('hex');
export const letterDocId=id=>createHash('sha256').update('letter:'+id).digest('hex');
export const replyDocId=id=>createHash('sha256').update('reply:'+id).digest('hex');

export function extractImagePaths(content){
  if(typeof content!=='string'||content.length===0)return [];
  const out=new Set();
  for(const m of content.matchAll(REF))out.add(m[1]);
  return [...out];
}

function galleryPaths(raw){
  let v=raw;
  if(typeof raw==='string'){try{v=JSON.parse(raw);}catch{return null;}}
  if(v==null||v==='')return [];
  if(!Array.isArray(v))return null;
  const out=[];
  for(const item of v)if(item&&typeof item.path==='string'&&item.path)out.push(item.path);
  return out;
}

/**
 * @param {{letters:object[],replies:object[],records:object[],catalog:object[]}} rows normalized source rows
 * @returns {{refs:Map<string,{letters:string[],replies:string[],records:string[]}>,gallery:Set<string>,invalidGallery:number}}
 */
export function buildReferenceIndex({letters=[],replies=[],records=[],catalog=[]}){
  const refs=new Map();
  const slot=p=>{if(!refs.has(p))refs.set(p,{letters:[],replies:[],records:[]});return refs.get(p);};
  for(const r of letters)for(const p of extractImagePaths(r.content))slot(p).letters.push(letterDocId(r.id));
  for(const r of replies)for(const p of extractImagePaths(r.content))slot(p).replies.push(replyDocId(r.id));
  for(const r of records)for(const p of extractImagePaths(r.content))slot(p).records.push(r.id);
  const gallery=new Set();
  let invalidGallery=0;
  for(const h of catalog){
    if(h.public_reviewed!=='t'&&h.public_reviewed!=='true'&&h.public_reviewed!==true)continue;
    const paths=galleryPaths(h.gallery);
    if(paths===null){invalidGallery++;continue;}
    for(const p of paths)gallery.add(p);
  }
  return {refs,gallery,invalidGallery};
}
