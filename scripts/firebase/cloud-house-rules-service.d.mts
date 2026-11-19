export type OperationalRule={definition:Record<string,unknown>;version:number};
export declare function readOperationalHouseRules(
 db:any,snapshotId:string,houseId:string,
):Promise<OperationalRule[]>;
export declare function createFirebaseHouseRulesService(options:{
 db:any;auth:any;snapshotId:string;projectId:string;
 enabled?:boolean;env?:Record<string,string|undefined>;clock?:()=>string;
}):{save:(token:string,request:{
 houseId:string;requestKey:string;expectedVersion:number;
 definition:Record<string,unknown>;
})=>Promise<{message:string;houseId:string;itemId:string;version:number;duplicate:boolean}>};
