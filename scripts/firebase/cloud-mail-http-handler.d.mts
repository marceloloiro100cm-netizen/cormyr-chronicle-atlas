export function createCloudMailHttpHandler(config:{
  service:{send(token:string,request:unknown):Promise<unknown>}|null;
  enabled?:boolean;
}):(request:Request)=>Promise<Response>;
