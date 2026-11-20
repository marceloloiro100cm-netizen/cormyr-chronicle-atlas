/**
 * Galeria da Casa: índice derivado das cartas que o servidor JÁ autorizou.
 * Não indexa mensagens não entregues para destinatários nem imagens de
 * outras Casas. A leitura do arquivo revalida novamente cada token.
 */
import {PRIVATE_MEDIA_RE,privateMediaTokens} from './private-media-core';
type Row=Record<string,unknown>;
export type PrivateMailImage={
 id:string;path:string;caption:string;subject:string;
 sourceKind:'letter'|'reply';direction:'sent'|'received';
 publicationState:'delivered'|'scheduled';occurredAt:string;
};
const id=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=128;
const ofHouse=(row:Row,h:string)=>
 row['origin_house_id']===h||row['recipient_house_id']===h;
const caption=(content:string,path:string)=>{
 const at=content.indexOf('[cormyr-image:'+path+'|');
 if(at<0)return '';
 return content.slice(at+path.length+15).split(']')[0]?.slice(0,180)??'';
};
export function projectPrivateMailGallery(houseId:string,letters:Row[],replies:Row[],
 viewerUid:string):PrivateMailImage[]{
 if(!id(houseId)||!id(viewerUid))return [];
 const indexed=new Map<string,Row>();
 for(const l of letters){
  if(!id(l['id'])||!ofHouse(l,houseId)||
     l['deleted_at']!=null||l['publication_state']!=='delivered')
   continue;
  indexed.set(l['id'] as string,l);
 }
 const out:PrivateMailImage[]=[],seen=new Set<string>();
 const add=(r:Row,parent:Row,sourceKind:'letter'|'reply',direction:'sent'|'received')=>{
  if(r['deleted_at']!=null||r['publication_state']!=='delivered'||
     typeof r['content']!=='string'||!id(r['id']))
   return;
  const content=r['content'] as string;
  for(const path of privateMediaTokens(content)){
   if(!PRIVATE_MEDIA_RE.test(path))continue;
   const key=sourceKind+':'+r['id']+':'+path;
   if(seen.has(key))continue;
   seen.add(key);
   const at=r['delivered_at']??r['created_at']??'';
   out.push({id:key,path,caption:caption(content,path),
    subject:String(parent['subject']??'').slice(0,180),
    sourceKind,direction,publicationState:'delivered',
    occurredAt:typeof at==='string'?at:''});
  }
 };
 for(const parent of indexed.values()){
  const direction=parent['origin_house_id']===houseId?'sent':'received';
  add(parent,parent,'letter',direction);
 }
 for(const reply of replies){
  if(!id(reply['letter_id']))continue;
  const parent=indexed.get(reply['letter_id'] as string);
  if(!parent)continue;
  // Never infer a different target House from a reply's editable content.
  const sent=reply['author_user_id']===viewerUid&&
   (parent['origin_house_id']===houseId||parent['recipient_house_id']===houseId);
  add(reply,parent,'reply',sent?'sent':'received');
 }
 if(out.length>500)throw Error('private_media_gallery_too_large');
 return out.sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||a.id.localeCompare(b.id));
}
