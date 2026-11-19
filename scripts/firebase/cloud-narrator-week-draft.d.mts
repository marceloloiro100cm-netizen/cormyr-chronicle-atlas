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
  id:string;action:'advance_week'|'launch_firebase_campaign';at:string;
  from:(NarratorWeekDate&{version?:number})|null;to:(NarratorWeekDate&{version?:number})|null;
  fromRound:number|null;toRound:number|null;monthsCrossed:number;reason:string|null;
}
export function harptosOrdinal(d:NarratorWeekDate):number;
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
  history(idToken:string,limit?:number):Promise<NarratorWeekHistoryItem[]>;
  publishEvents(idToken:string):Promise<{published:number}>;
};

