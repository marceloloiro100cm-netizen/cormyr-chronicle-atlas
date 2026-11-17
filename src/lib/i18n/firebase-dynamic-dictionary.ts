/**
 * A second, local boundary for dynamic dictionary projection.
 * Server may supply ONLY the explicitly reviewed Firebase public dictionary.
 * No private entity type or malformed key may enter React i18n state.
 */
import {isPublicTranslationEntityType} from './public-translations';

const KEY=/^[A-Za-z0-9_-]{1,128}$/;
const record=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);

export function projectFirebaseDynamicTranslations(
  response:unknown,entityType?:string,
):Record<string,string>{
  const empty:Record<string,string>={};
  if(entityType!==undefined&&!isPublicTranslationEntityType(entityType)||
     !record(response)||!Object.hasOwn(response,'translations')||
     !record(response['translations']))return empty;
  const entries=Object.entries(response['translations']);
  if(entries.length>5000)return empty;
  const result:Record<string,string>=Object.create(null);
  for(const [key,value] of entries){
    const parts=key.split(':');
    const [type,id,field]=parts;
    if(parts.length!==3||!type||!id||!field||
       !isPublicTranslationEntityType(type)||!KEY.test(id)||!KEY.test(field)||
       typeof value!=='string'||value.length===0||value.length>12000)
      return empty;
    if(entityType===undefined||type===entityType)result[key]=value;
  }
  return {...result};
}
