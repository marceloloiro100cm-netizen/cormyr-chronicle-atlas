/**
 * Pure rules for Narrator calendar events in the Firebase runtime.
 * A save only changes the private draft; players see an event only after
 * the Narrator publishes the calendar in the HUB (with the weekly opening
 * or the explicit "publish events" action).
 */
import {validateHarptosDate} from './stage-temporal-emulator.mjs';
const ID=/^[A-Za-z0-9_-]{8,128}$/;
const DATE=/^(\d{4})-(?:(\d{2})-(\d{2})|F-([a-z-]+))$/;
const FESTIVAL_MONTH={midwinter:0,greengrass:3,midsummer:6,shieldmeet:6,highharvestide:8,'feast-moon':10};
export function parseEventDate(key){
  const m=typeof key==='string'?DATE.exec(key):null;
  if(!m)return null;
  const year=Number(m[1]);
  const d=m[4]?{year,month:FESTIVAL_MONTH[m[4]]??-1,day:30,festival:m[4]}
    :{year,month:Number(m[2])-1,day:Number(m[3]),festival:null};
  return validateHarptosDate(d.year,d.month,d.day,d.festival)?d:null;
}
/** Returns the next stored document or throws via deny(code,status). */
export function planEventSave(previous,payload,{deny,newId,uid,at}){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
     Object.keys(payload).some(k=>!['id','version','date','title','description','deleted'].includes(k)))
    deny('invalid_event',400);
  const {id,version,date,title,description,deleted}=payload;
  if(typeof deleted!=='boolean'||typeof title!=='string'||typeof description!=='string'||
     !parseEventDate(date)||(!deleted&&!title.trim())||title.length>200||description.length>5000)
    deny('invalid_event',400);
  if(id===null||id===undefined){
    if(previous||deleted||(version!==null&&version!==undefined))deny('invalid_event',400);
    return {id:newId(),version:1,draft:{date,title:title.trim(),description,deleted:false},
      published:null,updatedAt:at,updatedBy:uid};
  }
  if(typeof id!=='string'||!ID.test(id)||!previous||previous.id!==id)deny('event_not_found',404);
  if(version!==previous.version)deny('event_version_conflict',409);
  return {...previous,version:previous.version+1,
    draft:{date,title:title.trim(),description,deleted},updatedAt:at,updatedBy:uid};
}
/** Publishing applies every pending draft: deletion removes it from view. */
export function publishEvent(doc,at){
  if(!doc?.draft)return null;
  const d=doc.draft;
  return {...doc,draft:null,version:doc.version+1,publishedAt:at,
    published:d.deleted?null:{date:d.date,title:d.title,description:d.description}};
}
export const isEventId=v=>typeof v==='string'&&ID.test(v);
