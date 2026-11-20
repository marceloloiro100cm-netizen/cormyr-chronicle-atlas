/**
 * Firestore-only account access audit. GitHub OIDC reader; no Auth Admin
 * privileges, no writes and no PII exposed in logs. This is NOT an Auth E2E.
 */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const BASE='https://firestore.googleapis.com/v1/projects/cormyr/databases/(default)/documents';
const SNAP=/^[a-f0-9]{64}$/;
const uid=v=>typeof v==='string'&&v.length>=1&&v.length<=128&&
 !/[/\u0000-\u001f\u007f]/.test(v);
const digest=s=>createHash('sha256').update(s).digest('hex');
const decode=v=>{
 if(!v||typeof v!=='object')throw Error('invalid_firestore_value');
 if('nullValue' in v)return null;
 if('stringValue' in v)return v.stringValue;
 if('booleanValue' in v)return v.booleanValue;
 if('integerValue' in v)return Number(v.integerValue);
 if('doubleValue' in v)return Number(v.doubleValue);
 if('arrayValue' in v)return (v.arrayValue?.values??[]).map(decode);
 if('mapValue' in v)return Object.fromEntries(
  Object.entries(v.mapValue?.fields??{}).map(([k,x])=>[k,decode(x)]));
 throw Error('invalid_firestore_value');
};
const unpack=doc=>doc?.fields&&typeof doc.fields==='object'?
 Object.fromEntries(Object.entries(doc.fields).map(([k,v])=>[k,decode(v)])):null;
const cleanList=v=>Array.isArray(v)&&v.length<=250&&
 v.every(uid)&&v.length===new Set(v).size;
const report=()=>({
 sourceAccounts:0,overlays:0,activeAccess:0,inactiveAccess:0,
 mustChangePassword:0,missingProfile:0,playersWithoutHouse:0,
 invalidAccessRecords:0,invalidHouseReferences:0,
 roleCounts:{narrador:0,jogador:0,editor:0,outro:0},
 runtimeReconciled:false,readerHttp:null,authInventoryVerified:false,
 realRoleE2EVerified:false,accountsWriteFlagEnabled:false,
 releaseDecision:'NO_GO',blockingCodes:[],
});
const block=(r,reason)=>{if(!r.blockingCodes.includes(reason))r.blockingCodes.push(reason)};
export async function auditCloudAccountAccess({
 tokenProvider=()=>execFileSync('gcloud',['auth','print-access-token','--quiet'],{
  encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']}).trim(),
 fetcher=fetch,
}={}){
 const r=report();
 let token;
 try{token=await tokenProvider()}catch{block(r,'OIDC_UNAVAILABLE');return r}
 if(typeof token!=='string'||token.length<10){block(r,'OIDC_UNAVAILABLE');return r}
 const get=async(path,query=null)=>{
  if(typeof path!=='string'||!/^[-a-zA-Z0-9_/]{1,400}$/.test(path))
   throw Error('invalid_path');
  const url=new URL(BASE+'/'+path);
  if(query)for(const [k,v] of Object.entries(query)){
   if(k==='mask.fieldPaths')for(const field of v)url.searchParams.append(k,field);
   else if(k==='pageSize'||k==='pageToken')url.searchParams.set(k,String(v));
   else throw Error('invalid_query');
  }
  try{
   const response=await fetcher(url.toString(),{
    method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
    headers:{Authorization:'Bearer '+token},
    signal:AbortSignal.timeout(15000),
   });
   return {status:response.status,body:response.status===200?await response.json():null};
  }catch{return {status:null,body:null}}
 };
 const list=async(path,mask,max=251)=>{
  let result=[],pageToken='';
  for(let i=0;i<5;i++){
   const q={'pageSize':100,'mask.fieldPaths':mask,...(pageToken?{'pageToken':pageToken}:{})};
   const res=await get(path,q);
   if(res.status!==200||!res.body||
      res.body.documents!==undefined&&!Array.isArray(res.body.documents))
    return null;
   result.push(...(res.body.documents??[]));
   if(result.length>max)return null;
   pageToken=res.body.nextPageToken??'';
   if(!pageToken)return result;
  }
  return null;
 };
 const root=await list('migrationDomainStage',['status','private'],2);
 r.readerHttp=root===null?403:200;
 if(!root||root.length!==1||
   !SNAP.test(String(root[0]?.name??'').split('/').at(-1)??'')){
  block(r,'SOURCE_UNAVAILABLE');return r;
 }
 const snap=root[0].name.split('/').at(-1);
 const [stage,live,accounts,overlays,houses]=await Promise.all([
  get('migrationDomainStage/'+snap),
  get('campaignCloudRuntime/'+snap),
  list('migrationDomainStage/'+snap+'/access',
   ['userId','profile','active','admin','requirePasswordChange',
    'memberHouseIds','editHouseIds','attrHouseIds'],251),
  list('campaignCloudRuntime/'+snap+'/accountAccess',
   ['userId','profile','active','admin','requirePasswordChange',
    'memberHouseIds','editHouseIds','attrHouseIds'],251),
  list('migrationDomainStage/'+snap+'/houses',
   ['sourceId','active','season'],251),
 ]);
 if(stage.status!==200||live.status!==200||accounts===null||
    overlays===null||houses===null){
  block(r,'ACCESS_COLLECTION_UNAVAILABLE');return r;
 }
 const d=unpack(stage.body),rt=unpack(live.body);
 r.runtimeReconciled=rt?.status==='active'&&rt.private===true&&
  rt.applicationEnabled===true&&rt.sourceSnapshotId===snap&&
  rt.sourceSnapshotReconciled===true&&d?.status==='complete'&&d?.private===true;
 if(!r.runtimeReconciled)block(r,'RUNTIME_NOT_RECONCILED');
 const activeHouses=new Set();
 for(const h of houses){
  const v=unpack(h);
  if(v?.active===true&&v.season===2&&uid(v.sourceId))
   activeHouses.add(v.sourceId);
 }
 const users=new Map();
 for(const doc of accounts){
  const uidValue=String(doc.name??'').split('/').at(-1);
  const a=unpack(doc);
  if(!uid(uidValue)||!a||a.userId!==uidValue||users.has(uidValue)){
   r.invalidAccessRecords++;continue;
  }
  users.set(uidValue,a);
 }
 r.sourceAccounts=accounts.length;
 r.overlays=overlays.length;
 for(const doc of overlays){
  const uidValue=String(doc.name??'').split('/').at(-1);
  const v=unpack(doc);
  if(!uid(uidValue)||!v||v.userId!==uidValue||
     !['jogador','editor'].includes(v.profile)||v.admin!==false||
     !cleanList(v.memberHouseIds)||!cleanList(v.editHouseIds)||
     !cleanList(v.attrHouseIds)||typeof v.active!=='boolean'||
     typeof v.requirePasswordChange!=='boolean'||
     users.get(uidValue)?.profile==='narrador'){
    r.invalidAccessRecords++;continue;
  }
  users.set(uidValue,v);
 }
 for(const a of users.values()){
  const role=['narrador','jogador','editor'].includes(a.profile)?a.profile:'outro';
  r.roleCounts[role]++;
  if(role==='outro')r.missingProfile++;
  if(a.active===true)r.activeAccess++;
  else r.inactiveAccess++;
  if(a.requirePasswordChange===true)r.mustChangePassword++;
  if(!cleanList(a.memberHouseIds)||!cleanList(a.editHouseIds)){
   r.invalidAccessRecords++;continue;
  }
  if(role==='jogador'&&!a.memberHouseIds.length)r.playersWithoutHouse++;
  for(const houseId of a.memberHouseIds)if(!activeHouses.has(houseId))
   r.invalidHouseReferences++;
  if(a.editHouseIds.some(h=>!a.memberHouseIds.includes(h)))
   r.invalidAccessRecords++;
  if(role==='editor'&&a.memberHouseIds.length)
   r.invalidAccessRecords++;
 }
 if(r.invalidAccessRecords||r.invalidHouseReferences)
  block(r,'INVALID_ACCOUNT_SCOPE');
 if(r.missingProfile||r.playersWithoutHouse)
  block(r,'INCOMPLETE_PLAYER_PROFILES');
 block(r,'AUTH_ADMIN_INVENTORY_PENDING');
 block(r,'AUTHENTICATED_ACCOUNT_E2E_PENDING');
 return r;
}
export function accountAuditSummary(r){
 const n=x=>Number.isSafeInteger(x)&&x>=0&&x<=1000?x:'indisponível';
 return [
  '### Gestão de contas: auditoria privada somente leitura',
  '| Verificação | Resultado |','|---|---|',
  '| Firestore acesso HTTP | '+n(r.readerHttp)+' |',
  '| Runtime operacional reconciliado | '+r.runtimeReconciled+' |',
  '| Contas do acervo | '+n(r.sourceAccounts)+' |',
  '| Contas sobrepostas operacionalmente | '+n(r.overlays)+' |',
  '| Acessos ativos | '+n(r.activeAccess)+' |',
  '| Acessos inativos | '+n(r.inactiveAccess)+' |',
  '| Troca de senha pendente | '+n(r.mustChangePassword)+' |',
  '| Narradores | '+n(r.roleCounts.narrador)+' |',
  '| Jogadores | '+n(r.roleCounts.jogador)+' |',
  '| Editores | '+n(r.roleCounts.editor)+' |',
  '| Sem perfil | '+n(r.missingProfile)+' |',
  '| Jogadores sem Casa | '+n(r.playersWithoutHouse)+' |',
  '| Registros de acesso inconsistentes | '+n(r.invalidAccessRecords)+' |',
  '| Referências de Casas inválidas | '+n(r.invalidHouseReferences)+' |',
  '| Inventário de Firebase Auth (contas, disabled) | NÃO VERIFICADO |',
  '| Contas de teste por perfil | NÃO HOMOLOGADAS |',
  '| Liberação de escrita | **NO_GO** |',
  'Bloqueios: '+r.blockingCodes.join(', '),
  'Credencial OIDC de leitura, somente GET, sem UIDs, e-mails ou nomes nos logs.',
 ].join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const r=await auditCloudAccountAccess();
 const output=accountAuditSummary(r);
 if(process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,output+'\n');
 process.stdout.write(output+'\n');
}
