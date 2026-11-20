export class MediaReferenceError extends Error{code:string;status:number;constructor(code:string,status?:number);}
export function imagePaths(content:string|null):string[];
export function verifyMediaReferences(input:{tx:any;root:any;snapshotId:string;uid:string;content:string;previous?:string|null}):Promise<void>;
