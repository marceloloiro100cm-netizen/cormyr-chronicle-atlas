export class CloudNewspaperError extends Error {
  readonly code:string;
  readonly status:number;
  constructor(code:string,status?:number);
}
export interface CloudNewspaperRuntime {
  listReaderReceipts(token:string):Promise<{items:{
    newspaper_id:string;user_id:string;read_version:number;read_at:string;
  }[]}>;
  markReader(token:string,input:unknown):Promise<{
    recorded:boolean;alreadyRecorded:boolean;
  }>;
  listHistoricalDrafts(token:string):Promise<{items:unknown[]}>;
  saveHistoricalDraft(token:string,input:unknown):Promise<unknown>;
  listEditorial(token:string):Promise<unknown>;
  getEditorial(token:string,input:unknown):Promise<unknown>;
  saveEdition(token:string,input:unknown):Promise<unknown>;
  status(token:string):Promise<{enabled:boolean;canPublish:boolean;readOnly:boolean}>;
  publish(token:string,input:unknown):Promise<{
    id:string;editionNo:number;duplicate:boolean;state:'published';
  }>;
}
export function createFirebaseCloudNewspaper(options:{
  db:{collection(name:string):any;runTransaction<T>(fn:(tx:any)=>Promise<T>):Promise<T>};
  auth:{
    verifyIdToken(token:string,revoked:boolean):Promise<{uid:string}>;
    getUser(uid:string):Promise<{uid:string;disabled:boolean}>;
  };
  snapshotId:string;projectId:string;enabled?:boolean;
  env?:Record<string,string|undefined>;clock?:()=>string;
}):CloudNewspaperRuntime;

