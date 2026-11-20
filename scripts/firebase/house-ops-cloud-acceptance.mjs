/**
 * Auditoria somente leitura dos itens 4b/4c. Nunca ativa chaves nem altera
 * Firestore, Auth ou IAM. Os dados privados são processados somente na memória
 * do runner OIDC; saída contém contagens e códigos fixos.
 */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const BASE='https://firestore.googleapis.com/v1/projects/cormyr/databases/(default)/documents';
const SHA=/^[a-f0-9]{64}$/;
const hash=s=>createHash('sha256').update(s).digest('hex');
const decode=v=>{
 if(v==null||typeof v!=='object')throw Error('invalid_value');
 if('nullValue' in v)return null;
 if('stringValue' in v)return v.stringValue;
 if('booleanValue' in v)return v.booleanValue;
 if('integerValue' in v)return Number(v.integerValue);
 if('doubleValue' in v)return Number(v.doubleValue);
 if('mapValue' in v)return Object.fromEntries(
  Object.entries(v.mapValue?.fields??{}).map(([k,x])=>[k,decode(x)]));
 if('arrayValue' in v)return (v.arrayValue?.values??[]).map(decode);
 throw Error('unsupported_value');
};
const fields=d=>d?.fields&&typeof d.fields==='object'?
 Object.fromEntries(Object.entries(d.fields).map(([k,v])=>[k,decode(v)])):null;
const normalized=v=>{
 if(v===null||typeof v==='string'||typeof v==='boolean')return v;
 if(typeof v==='number'&&Number.isFinite(v))return v;
 if(Array.isArray(v))return v.map(normalized);
 if(v&&typeof v==='object')return Object.fromEntries(
   Object.keys(v).sort().map(k=>[k,normalized(v[k])]));
 throw Error('invalid_state');
};
const stateHash=v=>hash(JSON.stringify(normalized(v)));
const complete=d=>d?.status==='complete'&&d?.private===true;
const safeInt=n=>Number.isSafeInteger(n)&&n>=0;

const newReport=()=>({
 scannedHouses:0,reconciledHouses:0,missingEconomies:0,
 invalidEconomies:0,invalidSources:0,unknownHouses:0,
 runtimeApproved:false,calendarApproved:false,
 stageRootsVerified:false,snapshotDetected:false,
 cloudReadHttp:null,databaseMetadataHttp:null,realRoleTestsVerified:false,
 releaseDecision:'NO_GO',blockingCodes:[],
});
const issue=(r,code)=>{if(!r.blockingCodes.includes(code))r.blockingCodes.push(code)};
export async function auditHouseOpsCloud({
 tokenProvider=()=>execFileSync('gcloud',['auth','print-access-token','--quiet'],{
  encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']}).trim(),
 fetcher=fetch,
}={}){
 const r=newReport();
 let token;
 try{token=await tokenProvider()}catch{issue(r,'OIDC_UNAVAILABLE');return r}
 if(typeof token!=='string'||token.length<10){
  issue(r,'OIDC_UNAVAILABLE');return r;
 }
 const get=async(path,query={})=>{
  if(typeof path!=='string'||!/^[-a-zA-Z0-9_/]{1,400}$/.test(path))
   throw Error('invalid_path');
  const url=new URL(BASE+'/'+path);
  for(const [key,value] of Object.entries(query)){
   if(!['pageSize','pageToken','mask.fieldPaths'].includes(key))
    throw Error('invalid_query');
   if(key==='mask.fieldPaths'&&Array.isArray(value))
    for(const item of value)url.searchParams.append(key,item);
   else url.searchParams.set(key,String(value));
  }
  try{
   const resp=await fetcher(url.toString(),{
    method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
    headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000),
   });
   if(resp.status!==200)return {status:resp.status,body:null};
   const body=await resp.json();
   return {status:200,body:body&&typeof body==='object'?body:null};
  }catch{return {status:null,body:null}}
 };
 const list=async(path,mask,limit=1000)=>{
  const result=[];let pageToken='';
  for(let page=0;page<10;page++){
   const req=await get(path,{pageSize:100,'mask.fieldPaths':mask,
    ...(pageToken?{pageToken}:{})});
   if(req.status!==200||!req.body||!Array.isArray(req.body.documents)&&
      req.body.documents!==undefined)
    return {status:req.status,docs:null};
   result.push(...(req.body.documents??[]));
   if(result.length>limit)return {status:null,docs:null};
   pageToken=req.body.nextPageToken??'';
   if(!pageToken)return {status:200,docs:result};
  }
  return {status:null,docs:null};
 };
 // Check database metadata separately from listDocuments: no private content is
 // retrieved and only the HTTP status is retained in the report.
 try{
  const meta=await fetcher(
   'https://firestore.googleapis.com/v1/projects/cormyr/databases/(default)',{
    method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
    headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000),
   });
  r.databaseMetadataHttp=meta.status;
 }catch{r.databaseMetadataHttp=null}
 const roots=await list('migrationDomainStage',['status','private'],2);
 r.cloudReadHttp=roots.status;
 if(roots.status!==200){
  issue(r,'FIRESTORE_READER_UNAVAILABLE');return r;
 }
 if(roots.docs?.length!==1||!SHA.test(
  String(roots.docs[0]?.name??'').split('/').at(-1)??'')){
  issue(r,'SNAPSHOT_AMBIGUOUS');return r;
 }
 const snapshot=String(roots.docs[0].name).split('/').at(-1);
 r.snapshotDetected=true;
 const rootNames=['migrationDomainStage','migrationAuthStage',
  'migrationTimeEngineStage','migrationNobleHouseStage'];
 const stageResults=await Promise.all(rootNames.map(n=>get(n+'/'+snapshot,{
  'mask.fieldPaths':['status','private'],
 })));
 if(stageResults.some(x=>x.status!==200||!complete(fields(x.body)))){
  issue(r,'STAGES_UNVERIFIED');return r;
 }
 r.stageRootsVerified=true;
 const [runtime,archivedCalendar]=await Promise.all([
  get('campaignCloudRuntime/'+snapshot),
  get('migrationTimeEngineStage/'+snapshot+'/calendar/current'),
 ]);
 if(runtime.status!==200||archivedCalendar.status!==200){
  issue(r,'RUNTIME_OR_CALENDAR_INACCESSIBLE');return r;
 }
 const rt=fields(runtime.body),historical=fields(archivedCalendar.body);
 const c=rt?.calendarSource==='operational'?rt.calendar:historical;
 r.calendarApproved=!!c&&safeInt(c.version)&&c.version>0&&
  c.version===rt?.calendarVersion&&safeInt(c.year)&&
  safeInt(c.month)&&safeInt(c.day);
 r.runtimeApproved=rt?.status==='active'&&rt?.private===true&&
  rt?.sourceSnapshotId===snapshot&&rt?.sourceSnapshotReconciled===true&&
  rt?.applicationEnabled===true&&rt?.houseOpsWriteApproved===true;
 if(!r.runtimeApproved)issue(r,'HOUSE_WRITE_APPROVAL_MISSING');
 if(!r.calendarApproved)issue(r,'CALENDAR_NOT_RECONCILED');
 const houses=await list('migrationDomainStage/'+snapshot+'/houses',
  ['sourceId','active','season'],1000);
 if(houses.status!==200||!houses.docs){
  issue(r,'HOUSE_LIST_UNAVAILABLE');return r;
 }
 for(const doc of houses.docs){
  const h=fields(doc);
  if(!h||h.active!==true||h.season!==2)continue;
  if(typeof h.sourceId!=='string'||h.sourceId.length>128||
     /[\/\u0000-\u001f\u007f]/.test(h.sourceId)){
   r.unknownHouses++;continue;
  }
  r.scannedHouses++;
  const id=hash('house:'+h.sourceId),sid=hash('noble-sheet:'+h.sourceId);
  const [source,economy]=await Promise.all([
   get('migrationNobleHouseStage/'+snapshot+'/sheets/'+sid),
   get('campaignCloudRuntime/'+snapshot+'/houseEconomies/'+id),
  ]);
  if(source.status!==200){r.invalidSources++;continue}
  if(economy.status===404){r.missingEconomies++;continue}
  if(economy.status!==200){r.unknownHouses++;continue}
  try{
   const sheet=fields(source.body),op=fields(economy.body);
   if(!sheet||sheet.houseId!==h.sourceId||!safeInt(sheet.version)||
      !sheet.state||sheet.state.houseId!==h.sourceId){
    r.invalidSources++;continue;
   }
   const originHash=stateHash(sheet.state);
   if(!op||op.houseId!==h.sourceId||op.status!=='active'||
      op.private!==true||op.sourceSnapshotId!==snapshot||
      op.sourceReconciled!==true||op.seedVerified!==true||
      !safeInt(op.version)||!op.state||op.state.houseId!==h.sourceId||
      op.sourceSheetVersion!==sheet.version||
      op.sourceStateHash!==originHash||
      op.stateHash!==stateHash(op.state)||
      op.version===0&&op.stateHash!==originHash){
    r.invalidEconomies++;continue;
   }
   r.reconciledHouses++;
  }catch{r.invalidEconomies++}
 }
 if(!r.scannedHouses||r.scannedHouses!==r.reconciledHouses||
    r.invalidSources||r.missingEconomies||r.invalidEconomies||r.unknownHouses)
  issue(r,'HOUSE_RECONCILIATION_INCOMPLETE');
 // Uma leitura OIDC nunca equivale ao E2E de Narrador e duas Casas reais.
 issue(r,'AUTHENTICATED_ROLE_E2E_PENDING');
 return r;
}
export const summarize=r=>[
 '### Ficha da Casa 4b/4c: auditoria Cloud somente leitura',
 '| Verificação | Resultado |','|---|---|',
 '| Firestore documentos HTTP | '+(r.cloudReadHttp??'indisponível')+' |',
 '| Firestore metadados HTTP | '+(r.databaseMetadataHttp??'indisponível')+' |',
 '| Snapshot único | '+r.snapshotDetected+' |',
 '| Estágios históricos | '+r.stageRootsVerified+' |',
 '| Runtime de escrita aprovado | '+r.runtimeApproved+' |',
 '| Calendário validado | '+r.calendarApproved+' |',
 '| Casas ativas examinadas | '+r.scannedHouses+' |',
 '| Economias conciliadas | '+r.reconciledHouses+' |',
 '| Economias ausentes | '+r.missingEconomies+' |',
 '| Fontes inconsistentes | '+r.invalidSources+' |',
 '| Economias inconsistentes | '+r.invalidEconomies+' |',
 '| Casas sem leitura conclusiva | '+r.unknownHouses+' |',
 '| E2E autenticado por perfil | NÃO COMPROVADO |',
 '| Decisão | **NO_GO** |',
 'Bloqueios: '+r.blockingCodes.join(', '),
 'Sem escrita, sem dados privados e sem alteração de flags.',
].join('\n');
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=await auditHouseOpsCloud();
 const msg=summarize(report);
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,msg+'\n');
 // O resumo contém somente contagens, códigos fixos e booleanos públicos;
 // imprimi-lo também no log permite auditoria sem abrir dados privados.
 process.stdout.write(msg+'\n');
}
