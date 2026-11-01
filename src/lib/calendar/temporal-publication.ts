import {dateKey,parseDate} from './harptos';
import type {CampaignTimeSnapshot} from './campaign-time';

export type CampaignTimeMode='advance'|'set'|'publish';
export type CampaignTimePreview={
 version:number;
 from:string;
 to:string;
 mode:CampaignTimeMode;
 ordinary_days:number;
 calendar_days:number;
 month_delta:number;
 backdated:boolean;
 backdate_authorized:boolean;
 crossed_festivals:string[];
 crossed_years:number[];
 house_sheets_to_check:number;
 published_week_unchanged:number;
};

export function validateCampaignTimePreview(
 result:unknown,expectedVersion:number,expectedMode:CampaignTimeMode
):CampaignTimePreview{
 if(!result||typeof result!=='object')throw new Error('Prévia temporal indisponível.');
 const value=result as Partial<CampaignTimePreview>;
 if(value.version!==expectedVersion||value.mode!==expectedMode||
  typeof value.from!=='string'||!parseDate(value.from)||
  typeof value.to!=='string'||!parseDate(value.to)||
  !Number.isInteger(value.ordinary_days)||!Number.isInteger(value.calendar_days)||
  !Number.isInteger(value.month_delta)||value.backdated===undefined||
  !Array.isArray(value.crossed_festivals)||!Array.isArray(value.crossed_years)||
  !Number.isInteger(value.house_sheets_to_check))throw new Error('O servidor retornou uma prévia temporal inconsistente.');
 return value as CampaignTimePreview;
}

/** Snapshot RPC must match the server preview, not just a local estimate. */
export function matchesPublishedTime(
 snapshot:CampaignTimeSnapshot|null|undefined,
 preview:CampaignTimePreview,expectedVersion:number
):boolean{
 return Boolean(snapshot&&dateKey(snapshot)===preview.to&&
  Number.isSafeInteger(snapshot.version)&&snapshot.version===expectedVersion+1&&
  snapshot.auto_advance===false);
}

export function campaignTimeRpcArguments(
 mode:CampaignTimeMode,selectedDate:string,count:number,expectedVersion:number,key:string,
 reason:string,allowBackdate:boolean
){
 return {
  p_version:expectedVersion,p_key:key,p_mode:mode,
  p_date:mode==='set'?selectedDate:null,
  p_count:mode==='advance'?count:0,
  p_reason:reason,
  p_allow_backdate:mode==='set'&&allowBackdate,
 } as const;
}
