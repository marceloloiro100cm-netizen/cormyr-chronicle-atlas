import {createWorkspaceClient,workspaceRequest} from './client';
import {setFirebaseWorkspaceClient,registerWorkspaceFunction,clearWorkspaceFunctions} from './state';
import {loadHouseHub,loadHouseLedger,houseOperation,readCourtMember,readVassalNpc,saveHouseRule} from '../house/house.functions';
import {submitFirebaseHouseOperation} from '../house/firebase-house-operation-client';
import {saveFirebaseHouseRule} from '../house/firebase-house-rules-client';
import {managePlayerAccount,manageEditorialAccount,
  inspectLeonardoAccess,completePasswordChange} from '../player-admin.functions';
import {registerPlayer} from '../campaign.functions';
import {firebaseAccountRequest} from './account-client';
import {firebasePilotAuth} from '../auth/firebase-pilot-session';
import {recruitSpyAgent,createSpyAgent,buySpyAgentUpgrade,
 assignSpyPortrait} from '../espionage/spy-agent-actions.functions';
import {renameSpyAgent,loadSpyHouseManagement} from '../espionage/spy-management.functions';

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
 registerWorkspaceFunction(houseOperation,async input=>{
  const data=input?.data??{};
  if(typeof data.houseId!=='string'||typeof data.key!=='string'||
     typeof data.action!=='string'||!Number.isSafeInteger(data.version))
   throw Error('Operação de Casa incompleta. Recarregue a ficha.');
  return submitFirebaseHouseOperation(data as Parameters<
   typeof submitFirebaseHouseOperation>[0]);
 });
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
 const spyCall=(name:string,args:Record<string,unknown>)=>
  workspaceRequest({kind:'rpc',name,args});
 registerWorkspaceFunction(recruitSpyAgent,input=>{
  const d=input?.data??{};
  return spyCall('spy_recruit_agent',{
   p_house:d.houseId,p_source_holding:d.sourceHoldingId,
   p_codename:d.codename,p_request_key:d.requestKey,
  });
 });
 registerWorkspaceFunction(createSpyAgent,input=>{
  const d=input?.data??{};
  return spyCall('spy_create_agent',{
   p_house:d.houseId,p_source_holding:d.sourceHoldingId,
   p_codename:d.codename,p_portrait:d.portraitId,
   p_upgrades:d.upgrades,p_request_key:d.requestKey,
  });
 });
 registerWorkspaceFunction(buySpyAgentUpgrade,input=>{
  const d=input?.data??{};
  return spyCall('spy_buy_agent_upgrade',{
   p_house:d.houseId,p_agent:d.agentId,p_code:d.code,
   p_expected_agent_version:d.expectedAgentVersion,
   p_expected_house_version:d.expectedHouseVersion,p_key:d.requestKey,
  });
 });
 registerWorkspaceFunction(assignSpyPortrait,input=>{
  const d=input?.data??{};
  return spyCall('spy_assign_agent_portrait',{
   p_house:d.houseId,p_agent:d.agentId,p_portrait:d.portraitId,
   p_expected_version:d.expectedVersion,
  });
 });
 registerWorkspaceFunction(renameSpyAgent,input=>{
  const d=input?.data??{};
  return spyCall('spy_rename_agent',{
   p_house:d.houseId,p_agent:d.agentId,p_name:d.name,
   p_expected_version:d.expectedVersion,p_request_key:d.requestKey,
  });
 });
 registerWorkspaceFunction(loadSpyHouseManagement,async input=>{
  const r=await spyCall('spy_house_management',{p_house:input?.data?.houseId});
  return {...r,availableWealth:null};
 });
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
