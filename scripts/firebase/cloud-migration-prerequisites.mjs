/**
 * Read-only GCP prerequisite audit. All URLs are fixed to project cormyr.
 * Uses short-lived GitHub OIDC. No IAM, Auth, storage or Firestore mutations.
 * Never prints source IDs, file names, UIDs, tokens or private payloads.
 */
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const BASE='https://firestore.googleapis.com/v1/projects/cormyr/databases/(default)/documents/';
const BUCKET='https://storage.googleapis.com/storage/v1/b/cormyr-migration-homolog-477785088395?fields=name';
const SHA=/^[a-f0-9]{64}$/;
const C=['migrationPrivateGmStage','migrationDriveSyncStage','migrationPublicContentStage'];
const bool=(v)=>v?.booleanValue===true;
const str=(v)=>typeof v?.stringValue==='string'?v.stringValue:null;
const status=(v)=>Number.isInteger(v)&&v>=100&&v<=599?v:null;
export async function auditCloudPrerequisites({
 tokenProvider=()=>execFileSync('gcloud',['auth','print-access-token','--quiet'],
   {encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']}).trim(),
 fetcher=fetch,
}={}){
 const token=await tokenProvider();
 if(typeof token!=='string'||token.length<10||/\s/.test(token))
   throw Error('oidc_unavailable');
 const get=async(url,readBody)=>{
   if(url!==BUCKET&&!url.startsWith(BASE))throw Error('destination_denied');
   try{
     const response=await fetcher(url,{
       method:'GET',headers:{Authorization:'Bearer '+token},
       redirect:'error',cache:'no-store',credentials:'omit',
       signal:AbortSignal.timeout(12000),
     });
     if(response.status!==200||!readBody)return {status:status(response.status),data:null};
     const data=await response.json().catch(()=>null);
     return {status:status(response.status),data};
   }catch{return {status:null,data:null};}
 };
 const root=await get(BASE+'migrationDomainStage?pageSize=2&mask.fieldPaths=status&mask.fieldPaths=private',true);
 const entries=Array.isArray(root.data?.documents)?root.data.documents:[];
 const exact=entries.length===1&&!root.data?.nextPageToken&&
   typeof entries[0]?.name==='string'&&
   entries[0].name.startsWith('projects/cormyr/databases/(default)/documents/migrationDomainStage/')&&
   SHA.test(entries[0].name.split('/').at(-1))&&
   str(entries[0].fields?.status)==='complete'&&bool(entries[0].fields?.private);
 const snapshot=exact?entries[0].name.split('/').at(-1):null;
 const steps=[];
 if(snapshot){
   for(const collection of C){
     const result=await get(BASE+collection+'/'+snapshot+
       '?mask.fieldPaths=status&mask.fieldPaths=private',true);
     const v=result.data?.fields;
     steps.push({collection,status:result.status,
       complete:result.status===200&&str(v?.status)==='complete'&&bool(v?.private)});
   }
 }
 let runtime={status:null,gmReadApproved:false};
 if(snapshot){
   const result=await get(BASE+'campaignCloudRuntime/'+snapshot+
     '?mask.fieldPaths=status&mask.fieldPaths=private'+
     '&mask.fieldPaths=sourceSnapshotId&mask.fieldPaths=sourceSnapshotReconciled'+
     '&mask.fieldPaths=applicationEnabled&mask.fieldPaths=privateGmReadApproved',true);
   const v=result.data?.fields;
   runtime={status:result.status,
     gmReadApproved:result.status===200&&str(v?.status)==='active'&&
       bool(v?.private)&&str(v?.sourceSnapshotId)===snapshot&&
       bool(v?.sourceSnapshotReconciled)&&bool(v?.applicationEnabled)&&
       bool(v?.privateGmReadApproved)};
 }
 const bucket=await get(BUCKET,false);
 const all=exact&&steps.length===C.length&&steps.every(x=>x.complete);
 return {
   scope:'FIXED_PROJECT_GET_ONLY',
   firestoreHttpStatus:root.status,
   uniquePrivateSnapshot:Boolean(exact),
   privateGmStageStatus:steps.find(x=>x.collection===C[0])?.status??null,
   driveStageStatus:steps.find(x=>x.collection===C[1])?.status??null,
   publicContentStageStatus:steps.find(x=>x.collection===C[2])?.status??null,
   stageMetadataComplete:Boolean(all),
   runtimeHttpStatus:runtime.status,
   gmReadApproved:runtime.gmReadApproved,
   privateBucketMetadataHttpStatus:bucket.status,
   // Storage object hash-by-hash, accounts and role-E2E cannot be inferred.
   storageBytesReconciled:false,
   firebaseAccountsReconciled:false,
   realRoleE2EVerified:false,
   readyForPlayers:false,readyForCutover:false,
   writes:0,releaseDecision:'NO_GO',
 };
}
export function summarizeCloudPrerequisites(r){
 const h=v=>status(v)??'indisponível';
 const ok=v=>v===true?'verificado':'pendente';
 return [
  '## Cormyr — pré-requisitos Cloud (somente leitura)',
  '',
  '| Verificação | Estado |','| --- | --- |',
  '| Firestore OIDC | HTTP '+h(r.firestoreHttpStatus)+' |',
  '| Snapshot privado único | '+ok(r.uniquePrivateSnapshot)+' |',
  '| Conteúdo do Narrador | HTTP '+h(r.privateGmStageStatus)+' |',
  '| Estágio Drive | HTTP '+h(r.driveStageStatus)+' |',
  '| Estágio público | HTTP '+h(r.publicContentStageStatus)+' |',
  '| Metadados de estágio completos | '+ok(r.stageMetadataComplete)+' |',
  '| Runtime privado do Narrador | HTTP '+h(r.runtimeHttpStatus)+' · '+ok(r.gmReadApproved)+' |',
  '| Bucket migrado privado | HTTP '+h(r.privateBucketMetadataHttpStatus)+' |',
  '| Hash dos objetos, contas e isolamento real por Casa | **pendente** |',
  '| Liberar jogadores | **NÃO AUTORIZADO** |',
  '',
  'GET-only; nenhuma pasta, UID, hash, imagem, segredo ou mensagem privada foi registrada.',
  'Workflow verde **não** representa aprovação de liberação.',
  '',
 ].join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
   const report=await auditCloudPrerequisites();
   if(process.env.GITHUB_STEP_SUMMARY)
     appendFileSync(process.env.GITHUB_STEP_SUMMARY,summarizeCloudPrerequisites(report));
   process.stdout.write(JSON.stringify(report)+'\n');
 }catch{
   process.stderr.write('Cloud prerequisite audit unavailable; no data changed.\n');
   process.exitCode=1;
 }
}
