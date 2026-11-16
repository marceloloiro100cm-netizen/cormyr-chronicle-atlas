export class CloudTreasuryError extends Error {
  readonly code:string;
  readonly status:number;
  constructor(code:string,status?:number);
}
export interface CloudTreasuryRuntime {
  summary(token:string,houseId:unknown):Promise<{
    available:boolean;readOnly:true;balance:number|null;version:number|null;
  }>;
  status(token:string,houseId:unknown):Promise<{
    enabled:boolean;canAdjust:boolean;readOnly:boolean;
    balance:number|null;version:number|null;
  }>;
  adjust(token:string,input:unknown):Promise<{
    id:string;duplicate:boolean;houseId:string;balance:number;version:number;
  }>;
}
export function createFirebaseCloudTreasury(options:{
  db:{collection(name:string):any;runTransaction<T>(fn:(tx:any)=>Promise<T>):Promise<T>};
  auth:{
    verifyIdToken(token:string,checkRevoked:boolean):Promise<{uid:string}>;
    getUser(uid:string):Promise<{uid:string;disabled:boolean}>;
  };
  snapshotId:string;projectId:string;enabled?:boolean;
  env?:Record<string,string|undefined>;clock?:()=>string;
}):CloudTreasuryRuntime;
