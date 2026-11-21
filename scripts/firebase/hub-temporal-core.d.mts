/** Tipos do núcleo puro do Hub Temporal V2.1. */
export interface HarptosDate {year:number;month:number;day:number;festival:string|null;}
export interface FixedFestival {id:string;month:number;name:string;leapOnly?:boolean;}
export interface HubRegion {id:string;label:string;}
export interface HubFestival {
  id:string;version?:number;fixed?:boolean;name:string;
  scope:'kingdom'|'region';region:string|null;date:HarptosDate;
  repeat:'once'|'yearly';durationDays:number;notify:boolean;description:string;
  deleted?:boolean;
}
export interface FestivalOccurrence {festival:HubFestival;start:number;end:number;}
export const FIXED_FESTIVALS:readonly FixedFestival[];
export const HUB_REGIONS:readonly HubRegion[];
export function harptosDateValid(d:unknown):boolean;
export function dayOfYear(d:HarptosDate):number;
export function absoluteDay(d:HarptosDate):number;
export function fromAbsoluteDay(n:number):HarptosDate;
export function nextTendayStart(d:HarptosDate):HarptosDate;
export function weekPeriod(d:HarptosDate):{start:number;end:number};
export function parseDateKey(key:unknown):HarptosDate|null;
export function dateKeyOf(d:HarptosDate):string;
export function dateKeyInRange(key:unknown,start:number,end:number):boolean;
export function isFestivalId(v:unknown):boolean;
export function fixedFestivalEntries(notify?:Record<string,boolean>):HubFestival[];
export function festivalOccurrence(f:HubFestival,year:number):{start:number;end:number}|null;
export function festivalsInRange(list:readonly HubFestival[],start:number,end:number):FestivalOccurrence[];
export function visibleForRegions(item:{scope?:string;region?:string|null},regions:readonly string[]|null):boolean;
export function planFestivalSave(previous:unknown,payload:unknown,ctx:{
  deny:(code:string,status:number)=>never;newId:()=>string;uid:string;at:string;
}):HubFestival&{version:number};
