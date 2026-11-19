export type AccountService = {
 submit(token:string,input:Record<string,unknown>):Promise<Record<string,unknown>>;
 list(token:string):Promise<Record<string,unknown>>;
 status(token:string):Promise<Record<string,unknown>>;
 completePassword(token:string,input:Record<string,unknown>):Promise<Record<string,unknown>>;
};
export function createFirebaseAccountService(config:{
 db:any;auth:any;snapshotId:string;enabled:boolean;projectId:string;
 env?:Record<string,string|undefined>;now?:()=>string;
}):AccountService;
