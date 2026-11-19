/** Type surface for the Firebase Cloud-only mail command service. */
export class CloudMailError extends Error {
  readonly code:string;
  readonly status:number;
  constructor(code:string,status?:number);
}
export interface CloudMailMessageRequest {
  requestKey:string;
  originHouseId:string|null;
  recipientKind:'house'|'narrator';
  recipientHouseId:string|null;
  subject:string;
  content:string;
}
export interface CloudMailRuntime {
  status(idToken:string):Promise<{
    enabled:boolean;canSend:boolean;originHouseIds:string[];readOnly:boolean;
  }>;
  sendBatch(idToken:string,input:unknown):Promise<{
    ids:string[];duplicate:boolean;state:string;deliveryRound:number;
  }>;
  send(idToken:string,input:unknown):Promise<{
    id:string;duplicate:boolean;state:string;deliveryRound:number;
  }>;
  reply(idToken:string,input:{
    requestKey:unknown;letterId:unknown;content:unknown;expectedCampaignDate?:unknown;
  }):Promise<{
    id:string;duplicate:boolean;state:string;deliveryRound:number;
  }>;
  markRead(idToken:string,input:unknown):Promise<{
    recorded:boolean;alreadyRecorded:boolean;readAt:string;
  }>;
  markUnread(idToken:string,input:unknown):Promise<{
    recorded:false;alreadyUnread:boolean;
  }>;
  cancel(idToken:string,input:{letterId:unknown;expectedVersion:unknown}):Promise<{
    removed:true;alreadyRemoved:boolean;version:number;removalKind:string|null;
  }>;
  restore(idToken:string,input:{letterId:unknown;expectedVersion:unknown}):Promise<{
    restored:true;alreadyActive:boolean;version:number;
  }>;
  edit(idToken:string,input:{
    letterId:unknown;expectedVersion:unknown;subject:unknown;content:unknown;
  }):Promise<{edited:boolean;unchanged:boolean;version:number}>;
}
export function createFirebaseCloudMail(options:{
  db:{collection(name:string):any;runTransaction<T>(fn:(tx:any)=>Promise<T>):Promise<T>};
  auth:{
    verifyIdToken(token:string,checkRevoked:boolean):Promise<{uid:string}>;
    getUser(uid:string):Promise<{uid:string;disabled:boolean}>;
  };
  snapshotId:string;projectId:string;enabled?:boolean;
  env?:Record<string,string|undefined>;clock?:()=>string;
}):CloudMailRuntime;
