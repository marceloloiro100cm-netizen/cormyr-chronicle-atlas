import {createWorkspaceClient,workspaceRequest} from './client';
import {setFirebaseWorkspaceClient,registerWorkspaceFunction,clearWorkspaceFunctions} from './state';
import {loadHouseHub,loadHouseLedger,readCourtMember,readVassalNpc,saveHouseRule} from '../house/house.functions';
import {saveFirebaseHouseRule} from '../house/firebase-house-rules-client';
import {managePlayerAccount,manageEditorialAccount,
  inspectLeonardoAccess,completePasswordChange} from '../player-admin.functions';
import {registerPlayer} from '../campaign.functions';
import {firebaseAccountRequest} from './account-client';
import {firebasePilotAuth} from '../auth/firebase-pilot-session';

type AccountRow={uid:string;playerId:string|null;name:string|null;
 email:string|null;profile:string;version:number;active:boolean;
 requirePasswordChange:boolean;memberHouseIds:string[];
 editHouseIds:string[];attrHouseIds:string[]};
async function listAccounts():Promise<AccountRow[]>{
 const result=await firebaseAccountRequest<{items:AccountRow[]}>('list');
 return result.items;
}
const requestKey=()=>crypto.randomUUID();
async function submitPlayer(value:Record<string,unknown>){
 if(value['houseId']==='espiao')
   throw Error('Editor-Chefe deve ser cadastrado sem Casa.');
 const houseId=value['houseId'];
 if(typeof houseId!=='string'||!houseId)
   throw Error('Selecione uma Casa válida.');
 const records=await listAccounts();
 const old=records.find(x=>x.playerId===value['playerId']);
 if(value['playerId']&&!old)throw Error('Conta anterior não localizada.');
 const email=(typeof value['email']==='string'&&value['email'])||old?.email;
 if(typeof email!=='string'||!email)
   throw Error('Informe um e-mail autenticável.');
 const edits=value['canEdit']===true?[houseId]:[];
 const attrs=value['canEditAttributes']===true&&value['canEdit']===true?[houseId]:[];
 const r=await firebaseAccountRequest<{playerId:string}>('submit',{
  ...(old?{targetUid:old.uid}:{}),expectedVersion:old?.version??0,
  requestKey:requestKey(),name:String(value['name']??''),
  email,...(value['password']?{password:value['password']}:{}),
  profile:'jogador',active:value['active']===true,
  requireChange:value['requireChange']===true,
  memberHouseIds:[houseId],editHouseIds:edits,attrHouseIds:attrs,
 });
 return {message:'Conta e vínculo salvos no Firebase.',playerId:r.playerId};
}
let stop:ReturnType<typeof setTimeout>|null=null;
export function activateFirebaseWorkspace(){
 if(stop){clearTimeout(stop);stop=null;}
 setFirebaseWorkspaceClient(createWorkspaceClient());
 registerWorkspaceFunction(loadHouseHub,input=>workspaceRequest({kind:'house',houseId:input?.data?.houseId}));
 registerWorkspaceFunction(loadHouseLedger,async input=>(await workspaceRequest({kind:'house',houseId:input?.data?.houseId})).ledger);
 registerWorkspaceFunction(saveHouseRule,async input=>{
  const raw=input?.data??{};
  const {houseId,requestKey,expectedVersion,operationalRuleVersion,...definition}=raw;
  if(typeof houseId!=='string'||typeof requestKey!=='string'||
     !Number.isSafeInteger(expectedVersion))
   throw Error('Dados da regra incompletos. Recarregue a ficha da Casa.');
  const result=await saveFirebaseHouseRule({
   houseId,requestKey,expectedVersion,definition,
  });
  return {message:result.message};
 });
 for(const fn of [readCourtMember,readVassalNpc])registerWorkspaceFunction(fn,input=>workspaceRequest({kind:'record',houseId:input?.data?.houseId,id:input?.data?.id}));
 registerWorkspaceFunction(managePlayerAccount,input=>submitPlayer(input?.data??{}));
 registerWorkspaceFunction(registerPlayer,async input=>{
  const data=input?.data??{};
  if(!data.userId)
    throw Error('Para criar uma conta Firebase, use Cadastrar conta e jogador com e-mail e senha.');
  const account=(await listAccounts()).find(x=>x.uid===data.userId);
  if(!account||!account.email)
    throw Error('Conta Firebase não localizada. Use a gestão de contas Firebase.');
  return submitPlayer({
   playerId:account.playerId,name:data.name,email:account.email,
   houseId:data.houseId,active:true,canEdit:data.canEdit,
   canEditAttributes:false,requireChange:account.requirePasswordChange,
  });
 });
 registerWorkspaceFunction(manageEditorialAccount,async input=>{
  const data=input?.data??{};
  const email=String(data.email??'').trim().toLowerCase();
  const old=(await listAccounts()).find(x=>x.profile==='editor'&&
    x.email?.toLowerCase()===email);
  await firebaseAccountRequest('submit',{
   ...(old?{targetUid:old.uid}:{}),expectedVersion:old?.version??0,
   requestKey:requestKey(),name:'Leonardo',email,
   ...(data.password?{password:data.password}:{}),
   profile:'editor',active:true,requireChange:true,
   memberHouseIds:[],editHouseIds:[],attrHouseIds:[],
  });
  return {message:'Conta editorial salva no Firebase sem vínculo com Casas.'};
 });
 registerWorkspaceFunction(inspectLeonardoAccess,async input=>{
  const email=String(input?.data?.email??'').trim().toLowerCase();
  const item=(await listAccounts()).find(x=>x.email?.toLowerCase()===email);
  return {state:!item?'missing':item.profile==='editor'?'ready':'incomplete',
   passwordChangeRequired:item?.requirePasswordChange===true};
 });
 registerWorkspaceFunction(completePasswordChange,async input=>{
  const current=await firebaseAccountRequest<{version:number}>('status');
  await firebaseAccountRequest('completePassword',{
    password:input?.data?.password,requestKey:requestKey(),
    expectedVersion:current.version,
  });
  firebasePilotAuth()?.signOut();
  if(typeof window!=='undefined')window.location.replace('/auth');
  return {message:'Senha alterada. Entre novamente com a nova senha.'};
 });
}
export function deactivateFirebaseWorkspaceSoon(){
 stop=setTimeout(()=>{setFirebaseWorkspaceClient(null);clearWorkspaceFunctions();stop=null;},0);
}
