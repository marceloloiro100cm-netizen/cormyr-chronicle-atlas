export class CloudTreasuryAuditError extends Error{
  readonly code:string;
  readonly status:number;
  constructor(code:string,status?:number);
}
export interface CloudTreasuryAudit {
  list(token:string,houseId:unknown):Promise<{
    houseId:string;balance:number;version:number;total:number;
    truncated:boolean;verifiedChain:boolean;readOnly:boolean;
    items:Array<{
      version:number;delta:number;before:number;after:number;
      campaignDate:string;createdAt:string;reason?:string;actorUid?:string;
    }>;
  }>;
}
export function createFirebaseTreasuryAudit(options:{
  db:{collection(name:string):any;runTransaction<T>(fn:(tx:any)=>Promise<T>):Promise<T>};
  auth:{
    verifyIdToken(token:string,checkRevoked:boolean):Promise<{uid:string}>;
    getUser(uid:string):Promise<{uid:string;disabled:boolean}>;
  };
  snapshotId:string;projectId:string;enabled?:boolean;
  env?:Record<string,string|undefined>;
}):CloudTreasuryAudit;
