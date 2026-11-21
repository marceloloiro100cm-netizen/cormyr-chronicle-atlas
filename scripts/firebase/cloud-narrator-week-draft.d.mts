/** Type surface for a private Firebase-only Narrator week proposal.
 * Initial publication requires an explicit narrator decision and preserves imported documents.
 */
export class NarratorWeekDraftError extends Error {
  readonly code:string;
  readonly status:number;
  constructor(code:string,status?:number);
}
export interface NarratorWeekDate {
  year:number;month:number;day:number;festival:string|null;
}
export interface NarratorWeekProposal {
  expectedCalendarVersion:number;
  expectedDraftVersion:number;
  proposedDate:NarratorWeekDate;
  openRound:number;
  reason:string;
}
export interface NarratorWeekDraftView {
  archivedCalendar:NarratorWeekDate&{version:number};
  draft:({
    draftVersion:number;
    expectedCalendarVersion:number;
    proposedDate:NarratorWeekDate;
    proposedOpenRound:number;
    reason:string;
    updatedAt:string;
    status:'pending';
  })|null;
  editable:boolean;
  calendarPublished:boolean;
  requiresReconciliation?:boolean;
  mailEnabled:boolean;
  operationalCalendar?:NarratorWeekDate&{version:number}|null;
  openRound?:number|null;
  pendingHouseEffectMonths?:number;
  saved?:boolean;
}
export interface NarratorWeekHistoryItem {
  id:string;action:'advance_week'|'launch_firebase_campaign'|'set_calendar_date'|'undo_advance'|'start_season';at:string;
  from:(NarratorWeekDate&{version?:number})|null;to:(NarratorWeekDate&{version?:number})|null;
  fromRound:number|null;toRound:number|null;monthsCrossed:number;reason:string|null;
  flashback?:boolean;undone?:boolean;publishedEvents?:number|null;
  season?:{number:number;name:string}|null;
}
export interface HubSeason {
  number:number;name:string;startRound:number|null;
  startDate:NarratorWeekDate|null;status:'active'|'closed';endRound?:number;
}
export interface HubLetterSummary {
  id:string;from:string|null;to:string|null;subject:string;date:string;
  creationRound:number|null;deliveryRound:number|null;state:'draft'|'scheduled'|'delivered';
}
export interface HubData {
  openRound:number;seasons:HubSeason[];
  settings:{newspaperOneEditionPerWeek:boolean};
  fixedFestivalNotify:Record<string,boolean>;
  festivals:unknown[];letters:HubLetterSummary[];
  newspaper:{total:number;thisWeek:number[]};
  undo:{available:boolean;reason?:string};
}
export function harptosOrdinal(d:NarratorWeekDate):number;
export function seasonsOf(live:unknown):HubSeason[];
export function undoBlocker(last:unknown,live:unknown):{available:boolean;reason?:string};
export function planEventPublication(docs:unknown[]|undefined,date:NarratorWeekDate,exclude?:unknown):unknown[];
export function planSeasonStart(input:{live:unknown;request:unknown}):{
 date:NarratorWeekDate;openRound:number;version:number;reason:string;seasons:HubSeason[];number:number;
};
export function planCalendarDateChange(input:{live:unknown;request:unknown}):{
 date:NarratorWeekDate;version:number;monthsCrossed:number;backdated:boolean;
 openRound:number;reason:string;
};
export function planNarratorWeekDraft(input:{
  archivedCalendar:unknown;previous:unknown;request:unknown;
  actorUid:string;at:string;
}):unknown;
export function createFirebaseNarratorWeekDraft(config:{
  db:{
    collection(name:string):any;
    runTransaction<T>(fn:(tx:any)=>Promise<T>):Promise<T>;
  };
  auth:{
    verifyIdToken(token:string,checkRevoked:boolean):Promise<{uid:string}>;
    getUser(uid:string):Promise<{uid:string;disabled:boolean}>;
  };
  snapshotId:string;
  projectId:string;
  enabled?:boolean;
  env?:Record<string,string|undefined>;
  now?:()=>string;
  newId?:()=>string;
}):{
  publish(idToken:string,request:unknown):Promise<{published:true;duplicate:boolean;calendar:NarratorWeekDate&{version:number};openRound:number}>;
  get(idToken:string):Promise<NarratorWeekDraftView>;
  save(idToken:string,request:unknown):Promise<NarratorWeekDraftView>;
  advance(idToken:string,request:unknown):Promise<{advanced:true;duplicate:boolean;
    calendar:NarratorWeekDate&{version:number};openRound:number;monthsCrossed?:number;publishedEvents?:number}>;
  changeDate(idToken:string,request:unknown):Promise<{changed:true;duplicate:boolean;
    calendar:NarratorWeekDate&{version:number};openRound:number;monthsCrossed:number}>;
  history(idToken:string,limit?:number):Promise<NarratorWeekHistoryItem[]>;
  publishEvents(idToken:string,ids?:unknown):Promise<{published:number}>;
  hubData(idToken:string):Promise<HubData>;
  undo(idToken:string,request:unknown):Promise<{undone:true;duplicate:boolean;
    calendar:NarratorWeekDate&{version:number};openRound:number;restoredEvents?:number}>;
  startSeason(idToken:string,request:unknown):Promise<{started:true;duplicate:boolean;
    calendar:NarratorWeekDate&{version:number};openRound:number;season?:number;publishedEvents?:number}>;
  saveFestival(idToken:string,payload:unknown):Promise<unknown>;
  deleteFestival(idToken:string,request:unknown):Promise<{deleted:true}>;
  saveSettings(idToken:string,request:unknown):Promise<{settings:{newspaperOneEditionPerWeek:boolean};
    fixedFestivalNotify:Record<string,boolean>}>;
};

