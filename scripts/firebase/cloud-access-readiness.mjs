/**
 * Read-only, bounded readiness probe for Firebase Cloud.
 * Uses the already-configured GitHub OIDC service account. Does not mutate
 * Auth, Firestore, IAM, App Hosting, rules, identities or operational data.
 *
 * Output is ONLY aggregates and HTTP codes. Never log UIDs, emails, content,
 * passwords, snapshot hash, Firestore document names or remote errors.
 */
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const PROJECT='cormyr';
const FIRESTORE='https://firestore.googleapis.com/v1/projects/cormyr/databases/(default)/documents/';
const AUTH='https://identitytoolkit.googleapis.com/v1/projects/cormyr/accounts:batchGet?maxResults=1000';
const AUTH_NUMBER='https://identitytoolkit.googleapis.com/v1/projects/477785088395/accounts:batchGet?maxResults=1000';
const AUTH_CONFIG='https://identitytoolkit.googleapis.com/admin/v2/projects/cormyr/config';
// Only canonical Google RPC status identifiers, never provider error messages.
const SAFE_ERROR_STATUSES=new Set([
  'INVALID_ARGUMENT','FAILED_PRECONDITION','PERMISSION_DENIED',
  'UNAUTHENTICATED','NOT_FOUND','UNAVAILABLE','RESOURCE_EXHAUSTED',
]);
const HASH=/^[a-f0-9]{64}$/;
const STAGES=Object.freeze([
  'migrationDomainStage','migrationAuthStage','migrationTimeEngineStage',
  'migrationNobleHouseStage','migrationNewspaperRuntimeStage','migrationSpyStage',
]);
const AUX_STAGES=Object.freeze([
  'migrationPrivateGmStage','migrationDriveSyncStage',
  'migrationPublicContentStage','migrationStorageStage',
]);
const boolean=v=>v?.booleanValue===true;
const number=v=>Number.isSafeInteger(Number(v?.integerValue))?Number(v.integerValue):null;
const string=v=>typeof v?.stringValue==='string'?v.stringValue:null;

export async function inspectFirebaseCloudReadiness({
  tokenProvider=()=>execFileSync('gcloud',['auth','print-access-token','--quiet'],
    {encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']}).trim(),
  fetcher=fetch,
}={}){
  const token=await tokenProvider();
  if(typeof token!=='string'||token.length<10)throw Error('temporary_oidc_unavailable');
  const request=async (url,{statusOnly=false}={})=>{
    if(url===AUTH_CONFIG&&!statusOnly)
      throw Error('sensitive_config_body_forbidden');
    if(typeof url!=='string'||!url.startsWith(FIRESTORE) && url!==AUTH && url!==AUTH_NUMBER && url!==AUTH_CONFIG)
      throw Error('untrusted_cloud_destination');
    const u=new URL(url);
    if(!((u.hostname==='firestore.googleapis.com'&&u.pathname.startsWith(
      '/v1/projects/cormyr/databases/(default)/documents/'))||
      u.hostname==='identitytoolkit.googleapis.com'&&
        (url===AUTH||url===AUTH_NUMBER||url===AUTH_CONFIG)))
      throw Error('untrusted_cloud_destination');
    let response;
    try{
      response=await fetcher(url,{
        method:'GET',redirect:'error',cache:'no-store',credentials:'omit',
        // Cloud Shell OAuth tokens may have no implicit quota project.
        // Explicitly charge Identity Toolkit reads to the fixed Firebase
        // project; do not expose a caller-controlled billing project.
        headers:{
          Authorization:'Bearer '+token,
          ...(u.hostname==='identitytoolkit.googleapis.com'
            ?{'X-Goog-User-Project':PROJECT}:{}),
        },
        signal:AbortSignal.timeout(12000),
      });
    }catch{return {status:null,data:null,errorStatus:null};}
    // This endpoint may return credentials/providers in its JSON body.
    // Never even deserialize the configuration: status only.
    if(statusOnly)return {status:response.status,data:null,errorStatus:null};
    if(response.status!==200){
      let errorStatus=null;
      // Google structured error.status contains a public RPC enum. Discard
      // message, details, request IDs, payloads, tokens and identities.
      try{
        const err=await response.json();
        const value=err?.error?.status;
        if(typeof value==='string'&&SAFE_ERROR_STATUSES.has(value))
          errorStatus=value;
      }catch{/* HTTP code still sufficient if not JSON. */}
      return {status:response.status,data:null,errorStatus};
    }
    try{
      const body=await response.json();
      if(!body||typeof body!=='object'||Array.isArray(body))
        return {status:200,data:null,errorStatus:null};
      return {status:200,data:body,errorStatus:null};
    }catch{return {status:200,data:null,errorStatus:null};}
  };
  const root=await request(FIRESTORE+'migrationDomainStage?pageSize=2&mask.fieldPaths=status&mask.fieldPaths=private');
  const entries=Array.isArray(root.data?.documents)?root.data.documents:[];
  const singleRoot=root.status===200&&
    entries.length===1&&!root.data?.nextPageToken&&
    typeof entries[0]?.name==='string'&&
    entries[0].name.startsWith(
      'projects/cormyr/databases/(default)/documents/migrationDomainStage/')&&
    HASH.test(entries[0].name.split('/').at(-1));
  const snapshotId=singleRoot?entries[0].name.split('/').at(-1):null;
  const fields=entries[0]?.fields;
  const stageResults=[];
  if(snapshotId){
    for(const stage of STAGES){
      if(stage==='migrationDomainStage'){
        stageResults.push({
          stage,code:root.status,verified:
            string(fields?.status)==='complete'&&boolean(fields?.private),
        });
        continue;
      }
      const res=await request(FIRESTORE+stage+'/'+snapshotId+
        '?mask.fieldPaths=status&mask.fieldPaths=private');
      stageResults.push({
        stage,code:res.status,verified:
          string(res.data?.fields?.status)==='complete'&&
          boolean(res.data?.fields?.private),
      });
    }
  }
  const auxiliaryStages=[];
  if(snapshotId){
    // Only masked root metadata. Never read private GM events, Drive paths,
    // player accounts, Storage object names, hashes or other payloads.
    for(const stage of AUX_STAGES){
      const res=await request(FIRESTORE+stage+'/'+snapshotId+
        '?mask.fieldPaths=status&mask.fieldPaths=private');
      auxiliaryStages.push({stage,code:res.status,verified:
        string(res.data?.fields?.status)==='complete'&&
        boolean(res.data?.fields?.private)});
    }
  }
  let runtime={code:null,enabled:false,round:null,calendarVersion:null};
  if(snapshotId){
    const res=await request(FIRESTORE+'campaignMailRuntime/'+snapshotId+
      '?mask.fieldPaths=status&mask.fieldPaths=private&mask.fieldPaths=sourceLiveReconciled&mask.fieldPaths=applicationEnabled&mask.fieldPaths=mailEnabled&mask.fieldPaths=sourceSnapshotId'+
      '&mask.fieldPaths=openRound&mask.fieldPaths=calendarVersion');
    const v=res.data?.fields;
    runtime={code:res.status,enabled:
      string(v?.status)==='active'&&boolean(v?.private)&&
      boolean(v?.sourceLiveReconciled)&&boolean(v?.applicationEnabled)&&
      boolean(v?.mailEnabled)&&string(v?.sourceSnapshotId)===snapshotId,
      round:number(v?.openRound),calendarVersion:number(v?.calendarVersion),
    };
  }
  let operational={code:null,reconciled:false,round:null,
    calendarVersion:null,mailWriteApproved:false};
  if(snapshotId){
    // Fixed, masked, read-only runtime metadata. Never fetch House economies,
    // private audit events, balances, UIDs, flags or the entire document.
    const res=await request(FIRESTORE+'campaignCloudRuntime/'+snapshotId+
      '?mask.fieldPaths=status&mask.fieldPaths=private'+
      '&mask.fieldPaths=sourceSnapshotId'+
      '&mask.fieldPaths=sourceSnapshotReconciled'+
      '&mask.fieldPaths=applicationEnabled'+
      '&mask.fieldPaths=calendarVersion'+
      '&mask.fieldPaths=openRound&mask.fieldPaths=mailWriteApproved');
    const v=res.data?.fields;
    operational={code:res.status,reconciled:
      string(v?.status)==='active'&&boolean(v?.private)&&
      string(v?.sourceSnapshotId)===snapshotId&&
      boolean(v?.sourceSnapshotReconciled)&&
      boolean(v?.applicationEnabled)&&
      number(v?.calendarVersion)!==null&&
      number(v?.calendarVersion)>=1,
      round:number(v?.openRound),calendarVersion:number(v?.calendarVersion),
      mailWriteApproved:boolean(v?.mailWriteApproved)};
  }
  // Read one fixed numeric calendar field, never the private Harptos date.
  // The historical snapshot cannot establish which round is currently open.
  let calendar={code:null,version:null};
  if(snapshotId){
    const res=await request(FIRESTORE+'migrationTimeEngineStage/'+snapshotId+
      '/calendar/current?mask.fieldPaths=version');
    calendar={code:res.status,version:number(res.data?.fields?.version)};
  }
  // This mirrors the runtime's independent Cloud + mail gates; it is only
  // metadata consistency, not proof of a live-source delta or permission E2E.
  const mailWriteGatesAligned=Boolean(
    runtime.enabled&&operational.reconciled&&
    operational.mailWriteApproved&&
    Number.isSafeInteger(runtime.round)&&runtime.round>=1&&
    runtime.round===operational.round&&
    Number.isSafeInteger(runtime.calendarVersion)&&
    runtime.calendarVersion>=1&&
    runtime.calendarVersion===operational.calendarVersion&&
    runtime.calendarVersion===calendar.version);
  const firstAuth=await request(AUTH);
  // If a valid project-ID request gets HTTP 400, try only the known numeric
  // alias (no arbitrary URL/project IDs). Never expose the error body.
  const numberAuth=firstAuth.status===400?await request(AUTH_NUMBER):null;
  const auth=firstAuth.status===200?firstAuth:
    numberAuth?.status===200?numberAuth:firstAuth;
  // One additional fixed GET can distinguish accessible project Auth config
  // from the users endpoint's unexplained HTTP 400. Requires configs.get,
  // not a reason to grant new permissions; never read config contents.
  const identityConfig=firstAuth.status===400&&
    numberAuth?.status!==200
      ?await request(AUTH_CONFIG,{statusOnly:true}):null;
  const users=Array.isArray(auth.data?.users)?auth.data.users:[];
  const accountListComplete=auth.status===200&&
    !auth.data?.nextPageToken&&users.length<=1000;
  // Explicitly distinguish a green inspection job from production readiness.
  // No "GO" path exists until IAM, profile isolation, production Firestore
  // reconciliation and player acceptance are verified independently.
  const stagesVerified=stageResults.filter(x=>x.verified).length;
  const auxiliaryStagesComplete=auxiliaryStages.length===AUX_STAGES.length&&
    auxiliaryStages.every(x=>x.verified);
  const stagesComplete=Boolean(singleRoot&&
    stageResults.length===STAGES.length&&stagesVerified===STAGES.length);
  const blockers=[];
  if(root.status===403)blockers.push('FIRESTORE_OIDC_DENIED');
  else if(root.status!==200)blockers.push('FIRESTORE_STAGE_READ_UNCONFIRMED');
  else if(!singleRoot)blockers.push('SNAPSHOT_UNVERIFIED');
  else if(!stagesComplete)blockers.push('MIGRATION_STAGES_UNVERIFIED');
  if(snapshotId&&!auxiliaryStagesComplete)
    blockers.push('AUXILIARY_STAGES_UNVERIFIED');
  if(snapshotId){
    if(!runtime.enabled)blockers.push('MAIL_RUNTIME_UNVERIFIED');
    if(!operational.reconciled)
      blockers.push('OPERATIONAL_RUNTIME_UNVERIFIED');
    if(!mailWriteGatesAligned)blockers.push('MAIL_WRITE_GATES_UNALIGNED');
  }else blockers.push('RUNTIME_AUDITS_AWAIT_SNAPSHOT');
  if(auth.status!==200)blockers.push('AUTH_LIST_UNAVAILABLE');
  else if(!accountListComplete)blockers.push('AUTH_LIST_INCOMPLETE');
  blockers.push('CLOUD_ROLE_E2E_PENDING');
  return {
    project:PROJECT,scope:'FIREBASE_CLOUD_ACCESS_READ_ONLY',
    firestoreHttpStatus:root.status,
    singleVerifiedSnapshot:stagesComplete,
    stageCoverage:stageResults.length,
    stagesVerified,
    stageHttpStatusCounts:Object.fromEntries(
      [...new Set(stageResults.map(x=>String(x.code)))].map(code=>
        [code,stageResults.filter(x=>String(x.code)===code).length])),
    auxiliaryStageCoverage:auxiliaryStages.length,
    auxiliaryStagesVerified:auxiliaryStages.filter(x=>x.verified).length,
    // Public stage status is a fixed collection metadata probe, not content.
    publicContentStageHttpStatus:auxiliaryStages.find(x=>
      x.stage==='migrationPublicContentStage')?.code??null,
    publicContentStageVerified:auxiliaryStages.some(x=>
      x.stage==='migrationPublicContentStage'&&x.verified),
    // Fixed collection labels only; never reveal document IDs, content or provider errors.
    auxiliaryPendingStages:auxiliaryStages.filter(x=>!x.verified).map(x=>x.stage),
    auxiliaryStageHttpStatusCounts:Object.fromEntries(
      [...new Set(auxiliaryStages.map(x=>String(x.code)))].map(code=>
        [code,auxiliaryStages.filter(x=>String(x.code)===code).length])),
    auxiliaryStagesComplete,
    mailRuntimeHttpStatus:runtime.code,mailRuntimeEnabled:runtime.enabled,
    operationalRuntimeHttpStatus:operational.code,
    operationalRuntimeReconciled:operational.reconciled,
    historicalCalendarHttpStatus:calendar.code,
    historicalCalendarVersionVerified:Number.isSafeInteger(calendar.version)&&
      calendar.version>=1,
    mailWriteGatesAligned,
    authHttpStatus:auth.status,authProjectNumberHttpStatus:numberAuth?.status??null,
    authRpcStatus:auth.errorStatus??null,
    authProjectNumberRpcStatus:numberAuth?.errorStatus??null,
    identityConfigHttpStatus:identityConfig?.status??null,
    authListComplete:accountListComplete,
    accounts:accountListComplete?users.length:null,
    disabledAccounts:accountListComplete?users.filter(x=>x.disabled===true).length:null,
    requiresFirestoreReadPermission:root.status===403||
      stageResults.some(x=>x.code===403)||runtime.code===403||
      operational.code===403,
    requiresFirebaseAuthReadPermission:auth.status===403||
      numberAuth?.status===403,
    releaseDecision:'NO_GO',blockingCodes:blockers,
    writes:0,cloudRoleE2EVerified:false,readyForCutover:false,
  };
}

const BLOCKING_CODES=new Set([
  'FIRESTORE_OIDC_DENIED','FIRESTORE_STAGE_READ_UNCONFIRMED',
  'SNAPSHOT_UNVERIFIED','MIGRATION_STAGES_UNVERIFIED',
  'AUXILIARY_STAGES_UNVERIFIED',
  'MAIL_RUNTIME_UNVERIFIED','OPERATIONAL_RUNTIME_UNVERIFIED',
  'RUNTIME_AUDITS_AWAIT_SNAPSHOT','MAIL_WRITE_GATES_UNALIGNED',
  'AUTH_LIST_UNAVAILABLE',
  'AUTH_LIST_INCOMPLETE','CLOUD_ROLE_E2E_PENDING',
]);
/** Strictly allowlisted GitHub Summary: no source IDs, errors or documents. */
export function formatCloudReadinessSummary(report){
  const http=value=>Number.isInteger(value)&&value>=100&&value<=599
    ?String(value):'indisponível';
  const ok=value=>value===true?'Conferido':'Pendente';
  const blocks=Array.isArray(report?.blockingCodes)
    ?report.blockingCodes.filter(v=>BLOCKING_CODES.has(v)):[];
  return [
    '## Firebase Cloud — NO-GO para cutover',
    '',
    '> Um workflow verde confirma somente que a auditoria foi executada; **não** aprova publicação, compras ou ativação de contas.',
    '',
    '| Evidência privada (somente status) | Resultado |',
    '| --- | --- |',
    '| Firestore da migração | HTTP '+http(report?.firestoreHttpStatus)+' |',
    '| Estágios históricos | '+ok(report?.singleVerifiedSnapshot)+' |',
    '| Estágios GM, Drive, catálogo público e Storage | '+
      String(report?.auxiliaryStagesVerified??0)+'/'+
      String(report?.auxiliaryStageCoverage??0)+' verificados |',
    '| Runtime de missivas | HTTP '+http(report?.mailRuntimeHttpStatus)+' · '+ok(report?.mailRuntimeEnabled)+' |',
    '| Runtime operacional das Casas | HTTP '+http(report?.operationalRuntimeHttpStatus)+' · '+ok(report?.operationalRuntimeReconciled)+' |',
    '| Versão histórica do calendário | HTTP '+http(report?.historicalCalendarHttpStatus)+' · '+ok(report?.historicalCalendarVersionVerified)+' |',
    '| Aprovações de correio, Casas, rodada e calendário alinhadas | '+ok(report?.mailWriteGatesAligned)+' |',
    '| Firebase Auth | HTTP '+http(report?.authHttpStatus)+' · '+ok(report?.authListComplete)+' |',
    '| Testes reais de isolamento de perfis | Pendente |',
    '| Cutover | **NÃO AUTORIZADO** |',
    '',
    'Motivos de bloqueio (códigos predefinidos): '+(blocks.length?blocks.join(', '):'CLOUD_ROLE_E2E_PENDING')+'.',
    '',
    'Nenhum dado, UID, e-mail, hash, token, documento privado ou mensagem de erro do Google é publicado aqui.',
    '',
  ].join('\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const output=await inspectFirebaseCloudReadiness();
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY){
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      formatCloudReadinessSummary(output),'utf8');
  }
}
