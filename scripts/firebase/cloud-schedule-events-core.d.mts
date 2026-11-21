export function parseEventDate(key:unknown):{year:number;month:number;day:number;festival:string|null}|null;
export function planEventSave(previous:any,payload:unknown,ctx:{deny:(code:string,status:number)=>never;newId:()=>string;uid:string;at:string}):any;
export function publishEvent(doc:any,at:string):any;
export function isEventId(v:unknown):v is string;
export const EVENT_REGIONS:readonly string[];
