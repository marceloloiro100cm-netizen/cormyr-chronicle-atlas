export class CloudMailError extends Error {
  readonly code:string;
  readonly status:number;
  constructor(code:string,status?:number);
}

export interface CloudMailRequest {
  requestKey:string;
  originHouseId:string|null;
  recipientHouseId:string|null;
  toNarrator:boolean;
  subject:string;
  content:string;
}
export function validateCloudMailRequest(value:unknown):CloudMailRequest;
export function createCloudMailService(config:{
  db:{collection(name:string):any;runTransaction(fn:(tx:any)=>Promise<any>):Promise<any>};
  auth:{
    verifyIdToken(token:string,checkRevoked:boolean):Promise<{uid:string}>;
    getUser(uid:string):Promise<{uid:string;disabled:boolean}>;
  };
  snapshotId:string;
  projectId:string;
  enabled?:boolean;
  env?:Record<string,string|undefined>;
  clock?:()=>Date;
}):{
  send(idToken:string,request:unknown):Promise<unknown>;
};
