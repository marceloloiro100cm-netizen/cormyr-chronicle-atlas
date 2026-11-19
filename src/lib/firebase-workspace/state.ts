let client:object|null=null;
export const firebaseWorkspaceClient=()=>client;
export const setFirebaseWorkspaceClient=(value:object|null)=>{client=value;};
const handlers=new Map<unknown,(input:any)=>Promise<any>>();
export const registerWorkspaceFunction=(fn:unknown,handler:(input:any)=>Promise<any>)=>handlers.set(fn,handler);
export const workspaceFunction=(fn:unknown)=>handlers.get(fn);
export const clearWorkspaceFunctions=()=>handlers.clear();
