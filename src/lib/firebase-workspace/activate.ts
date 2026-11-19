import {createWorkspaceClient,workspaceRequest} from './client';
import {setFirebaseWorkspaceClient,registerWorkspaceFunction,clearWorkspaceFunctions} from './state';
import {loadHouseHub,loadHouseLedger,readCourtMember,readVassalNpc} from '../house/house.functions';
let stop:ReturnType<typeof setTimeout>|null=null;
export function activateFirebaseWorkspace(){
 if(stop){clearTimeout(stop);stop=null;}
 setFirebaseWorkspaceClient(createWorkspaceClient());
 registerWorkspaceFunction(loadHouseHub,input=>workspaceRequest({kind:'house',houseId:input?.data?.houseId}));
 registerWorkspaceFunction(loadHouseLedger,async input=>(await workspaceRequest({kind:'house',houseId:input?.data?.houseId})).ledger);
 for(const fn of [readCourtMember,readVassalNpc])registerWorkspaceFunction(fn,input=>workspaceRequest({kind:'record',houseId:input?.data?.houseId,id:input?.data?.id}));
}
export function deactivateFirebaseWorkspaceSoon(){
 stop=setTimeout(()=>{setFirebaseWorkspaceClient(null);clearWorkspaceFunctions();stop=null;},0);
}
