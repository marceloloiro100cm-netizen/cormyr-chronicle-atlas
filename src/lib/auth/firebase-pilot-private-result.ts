/** A private Cloud response can only update the same live pilot account and request. */
export function canApplyPilotPrivateResult(input:{
  requestVersion:number;activeRequestVersion:number;
  sessionVersion:number;activeSessionVersion:number;
  uid:string|undefined;currentUid:string|undefined;
}):boolean{
  return Number.isSafeInteger(input.requestVersion)&&
    input.requestVersion===input.activeRequestVersion&&
    Number.isSafeInteger(input.sessionVersion)&&
    input.sessionVersion===input.activeSessionVersion&&
    typeof input.uid==='string'&&input.uid.length>0&&
    input.uid===input.currentUid;
}
