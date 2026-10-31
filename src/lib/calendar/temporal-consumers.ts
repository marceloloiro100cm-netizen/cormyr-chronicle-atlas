import {dateKey,parseDate} from './harptos';
import type {CampaignTimePreview} from './temporal-publication';

export type TemporalConsumerMode='projection'|'manual_review';
export type TemporalConsumerStatus='informational'|'pending'|'reviewed'|'skipped';
export type TemporalBoundary='always'|'date'|'month'|'year'|'season';
export type TemporalConsumer={
 code:string;title:string;description:string;boundary:TemporalBoundary;
 mode:TemporalConsumerMode;enabled:boolean;total:number;pending:number;
};
export type TemporalDelivery={
 id:string;operation_id:string;consumer_code:string;calendar_version:number;
 from_date:string;to_date:string;direction:'forward'|'backward'|'same';
 boundary:TemporalBoundary;mode:TemporalConsumerMode;
 status:TemporalConsumerStatus;review_note:string|null;
 reviewed_at:string|null;created_at:string;
};
export type TemporalConsumerDashboard={
 consumers:TemporalConsumer[];
 deliveries:TemporalDelivery[];
 pending_total:number;
};
const object=(value:unknown):value is Record<string,unknown> =>
 value!==null&&typeof value==='object'&&!Array.isArray(value);
const number=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const boundaries=new Set<TemporalBoundary>(['always','date','month','year','season']);
const modes=new Set<TemporalConsumerMode>(['projection','manual_review']);
const statuses=new Set<TemporalConsumerStatus>(['informational','pending','reviewed','skipped']);
const directions=new Set(['forward','backward','same']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O Narrador só recebe metadados; nunca dados privados de Casas/missivas.
 * Falha fechada em status, datas, ids e contagens incoerentes.
 */
export function validateTemporalConsumerDashboard(value:unknown):TemporalConsumerDashboard{
 if(!object(value)||!Array.isArray(value.consumers)||!Array.isArray(value.deliveries)||
  !number(value.pending_total))throw new Error('Fila de consumidores temporais inválida.');
 const seen=new Set<string>();
 for(const c of value.consumers){
  if(!object(c)||typeof c.code!=='string'||seen.has(c.code)||
   typeof c.title!=='string'||typeof c.description!=='string'||
   !boundaries.has(c.boundary as TemporalBoundary)||
   !modes.has(c.mode as TemporalConsumerMode)||
   typeof c.enabled!=='boolean'||!number(c.pending)||!number(c.total)||c.pending>c.total)
   throw new Error('Cadastro temporal inconsistente.');
  seen.add(c.code);
 }
 const ids=new Set<string>();
 for(const d of value.deliveries){
  if(!object(d)||typeof d.id!=='string'||!uuid.test(d.id)||ids.has(d.id)||
   typeof d.operation_id!=='string'||!uuid.test(d.operation_id)||
   typeof d.consumer_code!=='string'||!seen.has(d.consumer_code)||
   !number(d.calendar_version)||d.calendar_version===0||
   typeof d.from_date!=='string'||!parseDate(d.from_date)||
   typeof d.to_date!=='string'||!parseDate(d.to_date)||
   !directions.has(d.direction as string)||!boundaries.has(d.boundary as TemporalBoundary)||
   !modes.has(d.mode as TemporalConsumerMode)||
   !statuses.has(d.status as TemporalConsumerStatus)||
   (d.mode==='projection'&&d.status!=='informational')||
   (d.mode==='manual_review'&&d.status==='informational')||
   (d.review_note!==null&&typeof d.review_note!=='string')||
   (d.reviewed_at!==null&&typeof d.reviewed_at!=='string')||
   typeof d.created_at!=='string')
   throw new Error('Entrega temporal inconsistente.');
  ids.add(d.id);
 }
 return value as unknown as TemporalConsumerDashboard;
}

export type TemporalBoundaryPreview={
 months:number;years:number;seasonChanges:boolean;
 backdated:boolean;manualEffectsApplied:false;
};
export function temporalBoundaryPreview(preview:CampaignTimePreview):TemporalBoundaryPreview{
 const from=parseDate(preview.from),to=parseDate(preview.to);
 if(!from||!to)throw new Error('Datas do Hub Temporal inválidas.');
 const season=(month:number)=>month<=1||month===11?'winter':
  month<=4?'spring':month<=7?'summer':'autumn';
 return {
  months:Math.abs((to.year*12+to.month)-(from.year*12+from.month)),
  years:Math.abs(to.year-from.year),
  seasonChanges:season(from.month)!==season(to.month),
  backdated:preview.backdated,
  manualEffectsApplied:false,
 };
}

/** Consumidores devem olhar exclusivamente a versão e a data do relógio
 * oficial. Não é permitido derivar tempo da rodada, navegador ou Casa.
 */
export function temporalConsumerIdentity(consumerCode:string,calendarVersion:number){
 if(!/^[a-z][a-z0-9_-]{1,48}$/.test(consumerCode)||
  !Number.isSafeInteger(calendarVersion)||calendarVersion<1)
  throw new Error('Identificador de consumidor temporal inválido.');
 return consumerCode+':v'+calendarVersion;
}
export function validatedTemporalDate(key:string){
 const d=parseDate(key);
 if(!d)throw new Error('Data do consumidor temporal inválida.');
 return dateKey(d);
}


export type TemporalReleasePreflight={
 calendar_version:number;official_date:string;official_month:number;
 house_sheets:number;active_houses:number;draft_houses:number;invalid_houses:number;
 lagging_houses:number;ahead_houses:number;operations:number;deliveries:number;
 manual_reviews_pending:number;month_processing_preflight_ok:boolean;
 requires_production_backup:true;requires_homologation:true;
 automatic_economic_effects_enabled:false;
};
/** Diagnóstico operacional não substitui aprovação de segurança nem backup. */
export function validateTemporalReleasePreflight(value:unknown):TemporalReleasePreflight{
 if(!object(value)||typeof value.official_date!=='string'||!parseDate(value.official_date)||
  typeof value.month_processing_preflight_ok!=='boolean'||
  value.requires_production_backup!==true||value.requires_homologation!==true||
  value.automatic_economic_effects_enabled!==false)
  throw new Error('Pré-implantação temporal inválida.');
 for(const key of ['calendar_version','official_month','house_sheets','active_houses',
  'draft_houses','invalid_houses','lagging_houses','ahead_houses',
  'operations','deliveries','manual_reviews_pending']){
  if(!number(value[key]))throw new Error('Contagem inválida na pré-implantação temporal.');
 }
 if(value.calendar_version===0||
  Number(value.active_houses)+Number(value.draft_houses)+Number(value.invalid_houses)!==value.house_sheets||
  value.month_processing_preflight_ok!==(value.invalid_houses===0)||
  Number(value.lagging_houses)+Number(value.ahead_houses)>Number(value.active_houses))
  throw new Error('Contagens inconsistentes na pré-implantação temporal.');
 const parsed=parseDate(value.official_date)!;
 if(value.official_month!==parsed.year*12+parsed.month)
  throw new Error('Mês da pré-implantação diverge de Harptos.');
 return value as TemporalReleasePreflight;
}
