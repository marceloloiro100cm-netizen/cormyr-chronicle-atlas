/**
 * Item 5 — acceptance audit using only GET and temporary GitHub OIDC.
 * Never exposes names, House IDs, UIDs, source states, definition text or hashes.
 * A successful read is not permission to enable writes.
 */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const BASE='https://firestore.googleapis.com/v1/projects/cormyr/databases/(default)/documents';
const SHA=/^[a-f0-9]{64}$/;
const hash=v=>createHash('sha256').update(v).digest('hex');
const readField=v=>{
 if(!v||typeof v!=='object')throw Error('invalid_field');
 if('nullValue' in v)return null;
 if('stringValue' in v)return v.stringValue;
 if('booleanValue' in v)return v.booleanValue;
 if('integerValue' in v)return Number(v.integerValue);
 if('doubleValue' in v)return Number(v.doubleValue);
 if('arrayValue' in v)return (v.arrayValue?.values??[]).map(readField);
 if('mapValue' in v)return Object.fromEntries(
  Object.entries(v.mapValue?.fields??{}).map(([k,x])=>[k,readField(x)]));
 throw Error('invalid_field');
};
const unpack=d=>d?.fields?Object.fromEntries(
 Object.entries(d.fields).map(([k,v])=>[k,readField(v)])):null;
const ready=r=>r?.status==='complete'&&r?.private===true;
const fresh=()=>({
 cloudReadHttp:null,stagesVerified:false,runtimeReconciled:false,
 houseRulesWriteApproved:false,housesChecked:0,operationalRules:0,
 invalidRules:0,inconclusiveHouses:0,ruleHouses:0,
 authenticatedRoleTestsVerified:false,releaseDecision:'NO_GO',
 blockingCodes:[],
});
const block=(r,code)=>{if(!r.blockingCodes.includes(code))r.blockingCodes.push(code)};
export async function auditHouseRulesCloud({
 tokenProvider=()=>execFileSync('gcloud',['auth','print-access-token','--quiet'],{
  encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']}).trim(),
 fetcher=fetch,
}={}){
 const r=fresh();
 let token;
 try{token=await tokenProvider()}catch{block(r,'OIDC_UNAVAILABLE');return r}
 if(typeof token!=='string'||token.length<10){
  block(r,'OIDC_UNAVAILABLE');return r;
 }
 const get=async(path,params=null)=>{
  if(typeof path!=='string'||!/^[-A-Za-z0-9_/]{1,500}$/.test(path))
   throw Error('invalid_path');
  const u=new URL(BASE+'/'+path);
  if(params)for(const [key,value] of Object.entries(params)){
   if(!['pageSize','pageToken','mask.fieldPaths'].includes(key))
    throw Error('invalid_query');
   if(key==='mask.fieldPaths'&&Array.isArray(value))
    for(const f of value)u.searchParams.append(key,f);
   else u.searchParams.set(key,String(value));
  }
  try{
   const response=await fetcher(u.toString(),{
    method:'GET',headers:{Authorization:'Bearer '+token},
    credentials:'omit',cache:'no-store',redirect:'error',
    signal:AbortSignal.timeout(15000),
   });
   return {status:response.status,body:response.status===200?
    await response.json():null};
  }catch{return {status:null,body:null}}
 };
 const list=async(path,mask,max,notFoundEmpty=false)=>{
  let entries=[],cursor='';
  for(let page=0;page<6;page++){
   const x=await get(path,{pageSize:100,'mask.fieldPaths':mask,
    ...(cursor?{pageToken:cursor}:{})});
   if(x.status===404&&notFoundEmpty)
    return {status:200,documents:[]};
   if(x.status!==200||!x.body||
      x.body.documents!==undefined&&!Array.isArray(x.body.documents))
    return {status:x.status,documents:null};
   entries.push(...(x.body.documents??[]));
   if(entries.length>max)return {status:null,documents:null};
   cursor=x.body.nextPageToken??'';
   if(!cursor)return {status:200,documents:entries};
  }
  return {status:null,documents:null};
 };
 const roots=await list('migrationDomainStage',['status','private'],2);
 r.cloudReadHttp=roots.status;
 if(roots.status!==200||roots.documents?.length!==1){
  block(r,'SNAPSHOT_UNAVAILABLE');return r;
 }
 const snapshot=roots.documents[0].name.split('/').at(-1);
 if(!SHA.test(snapshot)){
  block(r,'SNAPSHOT_UNAVAILABLE');return r;
 }
 const [stage,auth,root,houses]=await Promise.all([
  get('migrationDomainStage/'+snapshot),
  get('migrationAuthStage/'+snapshot),
  get('campaignCloudRuntime/'+snapshot),
  list('migrationDomainStage/'+snapshot+'/houses',
   ['sourceId','season','active'],1000),
 ]);
 if(!ready(unpack(stage.body))||!ready(unpack(auth.body))||
    root.status!==200||houses.status!==200||!houses.documents){
  block(r,'STAGES_OR_HOUSES_UNAVAILABLE');return r;
 }
 r.stagesVerified=true;
 const runtime=unpack(root.body);
 r.runtimeReconciled=runtime?.status==='active'&&runtime?.private===true&&
  runtime?.sourceSnapshotId===snapshot&&runtime?.sourceSnapshotReconciled===true&&
  runtime?.applicationEnabled===true;
 if(!r.runtimeReconciled)block(r,'RUNTIME_NOT_RECONCILED');
 r.houseRulesWriteApproved=r.runtimeReconciled&&runtime?.houseRulesWriteApproved===true;
 if(!r.houseRulesWriteApproved)block(r,'RULES_WRITE_APPROVAL_MISSING');
 const active=[];
 for(const doc of houses.documents){
  let house;
  try{house=unpack(doc);}catch{block(r,'INVALID_HOUSE_CATALOG');continue}
  if(house?.season!==2||house?.active!==true)continue;
  if(typeof house.sourceId!=='string'||house.sourceId.length>128||
     /[/\u0000-\u001f\u007f]/.test(house.sourceId)){
   block(r,'INVALID_HOUSE_CATALOG');continue;
  }
  active.push(house.sourceId);
 }
 if(active.length===0||active.length>50||new Set(active).size!==active.length){
  block(r,'INVALID_HOUSE_CATALOG');return r;
 }
 for(const houseId of active){
  r.housesChecked++;
  const id=hash('house:'+houseId);
  const item=await list('campaignCloudRuntime/'+snapshot+
    '/houseRuleSets/'+id+'/rules',
    ['houseId','itemId','sourceSnapshotId','updatedBy','version',
     'definition'],101,true);
  if(item.status!==200||!item.documents){
   r.inconclusiveHouses++;continue;
  }
  if(item.documents.length)r.ruleHouses++;
  for(const d of item.documents){
   r.operationalRules++;
   try{
    const v=unpack(d),documentId=d.name.split('/').at(-1);
    if(!v||v.houseId!==houseId||typeof v.itemId!=='string'||
       v.itemId.length<1||v.itemId.length>128||
       documentId!==hash('rule:'+v.itemId)||
       v.sourceSnapshotId!==snapshot||
       typeof v.updatedBy!=='string'||v.updatedBy.length<1||
       !Number.isSafeInteger(v.version)||v.version<1||
       v.version>2147483646||v.definition?.id!==v.itemId||
       v.definition?.custom!==true||
       typeof v.definition?.name!=='string'||!v.definition.name.trim())
      r.invalidRules++;
   }catch{r.invalidRules++}
  }
 }
 if(r.inconclusiveHouses||r.invalidRules)
  block(r,'OPERATIONAL_RULES_UNVERIFIED');
 block(r,'AUTHENTICATED_NARRATOR_PLAYER_E2E_PENDING');
 return r;
}
export const summarizeHouseRules=r=>[
 '### Item 5 — regras da Casa, auditoria Firebase somente leitura',
 '| Verificação | Resultado |','|---|---|',
 '| Firestore GET HTTP | '+(r.cloudReadHttp??'indisponível')+' |',
 '| Estágios históricos confirmados | '+r.stagesVerified+' |',
 '| Runtime reconciliado | '+r.runtimeReconciled+' |',
 '| Aprovação de escrita das regras | '+r.houseRulesWriteApproved+' |',
 '| Casas examinadas | '+r.housesChecked+' |',
 '| Casas com adaptações operacionais | '+r.ruleHouses+' |',
 '| Adaptações registradas | '+r.operationalRules+' |',
 '| Adaptações inconsistentes | '+r.invalidRules+' |',
 '| Casas com leitura inconclusiva | '+r.inconclusiveHouses+' |',
 '| Perfis Narrador/Jogador testados | NÃO COMPROVADO |',
 '| Escrita de regras | **NO_GO** |',
 'Bloqueios: '+r.blockingCodes.join(', '),
 'Somente consultas GET: sem nomes, IDs, regras, custos ou saldos nos logs.',
].join('\n');
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=await auditHouseRulesCloud();
 const output=summarizeHouseRules(report);
 if(process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,output+'\n');
 process.stdout.write(output+'\n');
}
