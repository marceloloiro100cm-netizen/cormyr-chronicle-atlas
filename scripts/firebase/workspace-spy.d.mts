export function readWorkspaceSpy(input:any):Promise<any>;
export function loadImportedSpyData(rows:any,snapshotId:string):Promise<any>;
export function regionalStrategy(input:{houseId:string;assets:any[];locations:any[]}):{
  houseId:string;agents:{id:string;codename:string;status:string;currentRegion:string|null}[];
  links:{id:string;fromRegion:string;toRegion:string;passage:string;bidirectional:boolean;version:number}[];
};
