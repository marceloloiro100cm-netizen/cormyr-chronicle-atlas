/**
 * Pure rules of the shared campaign schedule (port of 0043/0060):
 * save_campaign_schedule_event, the event half of publication and
 * get_campaign_schedule_events. The calendar date change itself belongs to
 * the Temporal engine slice and is not modeled here. No I/O.
 */
import {validateHarptosDate} from './stage-temporal-emulator.mjs';

const FESTIVAL_MONTH={midwinter:0,greengrass:3,midsummer:6,shieldmeet:6,highharvestide:8,'feast-moon':10};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ScheduleError extends Error {
  constructor(code,message){super(message);this.name='ScheduleError';this.code=code;}
}
const fail=(code,m)=>{throw new ScheduleError(code,m);};

export function isCampaignDate(v){
  if(typeof v!=='string')return false;
  const regular=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if(regular)return validateHarptosDate(Number(regular[1]),Number(regular[2])-1,Number(regular[3]),null);
  const f=/^(\d{4})-F-(midwinter|greengrass|midsummer|shieldmeet|highharvestide|feast-moon)$/.exec(v);
  return !!f&&validateHarptosDate(Number(f[1]),FESTIVAL_MONTH[f[2]],1,f[2]);
}
export const requireActive=raw=>{
  if(!raw||raw.active!==true)fail('denied','Acesso não autorizado');
};
export const requireNarrator=raw=>{
  requireActive(raw);
  if(raw.profile!=='narrador'||raw.admin!==true||raw.requirePasswordChange===true)
    fail('denied','Apenas o Narrador altera eventos');
};

export function applyScheduleSave({payload,existing,newId,actorUid,now}){
  if(!payload||typeof payload!=='object')fail('invalid','Evento inválido');
  const date=payload.date,title=typeof payload.title==='string'?payload.title.trim():'',
    description=payload.description==null?'':payload.description,
    deleted=payload.deleted===true;
  if(!isCampaignDate(date)||title.length<1||title.length>180||typeof description!=='string'||
     description.length>4000)
    fail('invalid','Preencha data, título (1–180) e descrição (até 4000 caracteres)');
  const at=now||new Date().toISOString();
  if(!payload.id){
    if(deleted)fail('invalid','Não é possível excluir evento não cadastrado');
    const event={id:newId,draftDate:date,draftTitle:title,draftDescription:description,
      draftDeleted:false,publishedDate:null,publishedTitle:null,publishedDescription:null,
      version:1,updatedAt:at,updatedBy:actorUid};
    return {event,audit:{eventId:event.id,before:null,after:event,reason:'Edição do rascunho do calendário'}};
  }
  if(!UUID.test(payload.id)||!existing)fail('invalid','Evento não encontrado');
  if(payload.version!==existing.version)fail('conflict','Evento alterado por outra sessão. Recarregue.');
  const event={...existing,draftDate:date,draftTitle:title,draftDescription:description,
    draftDeleted:deleted,version:existing.version+1,updatedAt:at,updatedBy:actorUid};
  return {event,audit:{eventId:event.id,before:existing,after:event,reason:'Edição do rascunho do calendário'}};
}

const changed=e=>e.draftDeleted
  ?e.publishedDate!=null
  :(e.publishedDate!==e.draftDate||e.publishedTitle!==e.draftTitle||
    e.publishedDescription!==e.draftDescription);

/** Event half of publication: promote drafts to published snapshots. */
export function publishScheduleSnapshots({events,actorUid,reason,now}){
  const at=now||new Date().toISOString();
  const updated=[],audits=[];
  for(const e of events){
    if(!changed(e))continue;
    const next={...e,
      publishedDate:e.draftDeleted?null:e.draftDate,
      publishedTitle:e.draftDeleted?null:e.draftTitle,
      publishedDescription:e.draftDeleted?null:e.draftDescription,
      version:e.version+1};
    updated.push(next);
    audits.push({eventId:e.id,actor:actorUid,reason,
      before:e,after:{date:next.publishedDate,title:next.publishedTitle}});
  }
  return {updated,audits};
}

export function draftsView(events){
  return events.map(e=>({id:e.id,date:e.draftDate,title:e.draftTitle,description:e.draftDescription,
    deleted:e.draftDeleted,version:e.version,published:e.publishedDate!=null}))
    .sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}

/** Published snapshots for one Harptos month (0-11); festivals fold into their month. */
export function publishedForMonth(events,year,month){
  if(!Number.isInteger(year)||year<1||year>9999||!Number.isInteger(month)||month<0||month>11)
    fail('invalid','Mês inválido');
  const y=String(year).padStart(4,'0'),m=String(month+1).padStart(2,'0');
  const festivalFits=d=>
    (month===0&&d.endsWith('midwinter'))||(month===3&&d.endsWith('greengrass'))||
    (month===6&&(d.endsWith('midsummer')||d.endsWith('shieldmeet')))||
    (month===8&&d.endsWith('highharvestide'))||(month===10&&d.endsWith('feast-moon'));
  return events
    .filter(e=>e.publishedDate!=null&&e.publishedTitle!=null&&e.publishedDate.slice(0,4)===y&&
      (e.publishedDate.slice(5,7)===m||(e.publishedDate.slice(5,7)==='F-'&&festivalFits(e.publishedDate))))
    .sort((a,b)=>a.publishedDate.localeCompare(b.publishedDate)||a.id.localeCompare(b.id))
    .map(e=>({id:'schedule:'+e.id,date:e.publishedDate,title:e.publishedTitle,
      description:e.publishedDescription??'',kind:'kingdom'}));
}
