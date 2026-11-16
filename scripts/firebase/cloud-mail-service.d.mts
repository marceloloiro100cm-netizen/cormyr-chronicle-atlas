import type {FirebaseCloudReadonly} from './cloud-readonly-service.mjs';

export const CLOUD_MAIL_RUNTIME:string;
export function mailRuntimeReady(data:Record<string,unknown>|undefined,snapshotId:string):boolean;
export interface CloudMailStatus {
  ready:boolean;canCompose:boolean;originHouseIds:string[];readOnly:boolean;
}
export interface CloudMailSendResult {
  id:string;duplicate:boolean;delivered:boolean;
}
export interface CloudMailService {
  status(idToken:string):Promise<CloudMailStatus>;
  send(idToken:string,input:unknown):Promise<CloudMailSendResult>;
}
export function createFirebaseCloudMail(config:{
  auth:{
    verifyIdToken(token:string,checkRevoked:boolean):Promise<{uid:string}>;
    getUser(uid:string):Promise<{uid:string;disabled:boolean}>;
  };
  db:{collection(name:string):any;runTransaction(fn:(tx:any)=>Promise<unknown>):Promise<any>};
  snapshotId:string;
  projectId:string;
  enabled?:boolean;
  env?:Record<string,string|undefined>;
  clock?:()=>Date;
}):CloudMailService;
