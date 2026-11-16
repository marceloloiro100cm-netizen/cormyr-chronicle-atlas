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
  send(idToken:string,input:unknown):Promise<{
    id:string;duplicate:boolean;state:string;deliveryRound:number;
  }>;
  reply(idToken:string,input:{
    requestKey:unknown;letterId:unknown;content:unknown;
  }):Promise<{
    id:string;duplicate:boolean;state:string;deliveryRound:number;
  }>;
  markRead(idToken:string,input:unknown):Promise<{
    recorded:boolean;alreadyRecorded:boolean;readAt:string;
  }>;
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
