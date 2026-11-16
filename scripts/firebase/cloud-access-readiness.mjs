/**
 * Read-only, bounded readiness probe for Firebase Cloud.
 * Uses the already-configured GitHub OIDC service account. Does not mutate
 * Auth, Firestore, IAM, App Hosting, rules, identities or operational data.
 *
 * Output is ONLY aggregates and HTTP codes. Never log UIDs, emails, content,
 * passwords, snapshot hash, Firestore document names or remote errors.
 */
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const PROJECT='cormyr';
const FIRESTORE='https://firestore.googleapis.com/v1/projects/cormyr/databases/(default)/documents/';
const AUTH='https://identitytoolkit.googleapis.com/v1/projects/cormyr/accounts:batchGet?maxResults=1000';
const HASH=/^[a-f0-9]{64}$/;
const STAGES=Object.freeze([
  'migrationDomainStage','migrationAuthStage','migrationTimeEngineStage',
  'migrationNobleHouseStage','migrationNewspaperRuntimeStage','migrationSpyStage',
]);
const boolean=v=>v?.booleanValue===true;
const string=v=>typeof v?.stringValue==='string'?v.stringValue:null;
const nonnegativeInt=v=>typeof v?.integerValue==='string'&&
  /^(?:0|[1-9][0-9]*)$/.test(v.integerValue)&&
  Number.isSafeInteger(Number(v.integerValue))
    ?Number(v.integerValue):null;

export async function inspectFirebaseCloudReadiness({
  tokenProvider=()=>execFileSync('gcloud',['auth','print-access-token','--quiet'],
    {encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']}).trim(),
  fetcher=fetch,
}={}){
  const token=await tokenProvider();
  if(typeof token!=='string'||token.length<10)throw Error('temporary_oidc_unavailable');
  const request=async url=>{
    if(typeof url!=='string'||!url.startsWith(FIRESTORE) && url!==AUTH)
      throw Error('untrusted_cloud_destination');
    const u=new URL(url);
    if(!((u.hostname==='firestore.googleapis.com'&&u.pathname.startsWith(
      '/v1/projects/cormyr/databases/(default)/documents/'))||
      u.hostname==='identitytoolkit.googleapis.com'&&url===AUTH))
      throw Error('untrusted_cloud_destination');
    let response;
    try{
      response=await fetcher(url,{
        method:'GET',redirect:'error',cache:'no-store',credentials:'omit',
        headers:{Authorization:'Bearer '+token},
        signal:AbortSignal.timeout(12000),
      });
    }catch{return {status:null,data:null};}
    if(response.status!==200)return {status:response.status,data:null};
    try{
      const body=await response.json();
      if(!body||typeof body!=='object'||Array.isArray(body))
        return {status:200,data:null};
      return {status:200,data:body};
    }catch{return {status:200,data:null};}
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
  let runtime={code:null,enabled:false};
  if(snapshotId){
    // Read the *actual* operational namespace from PR #505. Other
    // prototype namespaces are not authority for campaign mail.
    const [res,calendar]=await Promise.all([
      request(FIRESTORE+'campaignCloudRuntime/'+snapshotId+
        '?mask.fieldPaths=status&mask.fieldPaths=private'+
        '&mask.fieldPaths=sourceSnapshotReconciled'+
        '&mask.fieldPaths=applicationEnabled'+
        '&mask.fieldPaths=mailWriteApproved'+
        '&mask.fieldPaths=sourceSnapshotId'+
        '&mask.fieldPaths=openRound'+
        '&mask.fieldPaths=calendarVersion'),
      request(FIRESTORE+'migrationTimeEngineStage/'+snapshotId+
        '/calendar/current?mask.fieldPaths=version'),
    ]);
    const v=res.data?.fields;
    const round=nonnegativeInt(v?.openRound);
    const runtimeCalendarVersion=nonnegativeInt(v?.calendarVersion);
    const actualVersion=nonnegativeInt(calendar.data?.fields?.version);
    runtime={code:res.status,enabled:
      res.status===200&&calendar.status===200&&
      string(v?.status)==='active'&&boolean(v?.private)&&
      boolean(v?.sourceSnapshotReconciled)&&
      boolean(v?.applicationEnabled)&&
      boolean(v?.mailWriteApproved)&&
      string(v?.sourceSnapshotId)===snapshotId&&
      round!==null&&round>=1&&actualVersion!==null&&
      runtimeCalendarVersion===actualVersion,
    };
  }
  const auth=await request(AUTH);
  const users=Array.isArray(auth.data?.users)?auth.data.users:[];
  const accountListComplete=auth.status===200&&
    !auth.data?.nextPageToken&&users.length<=1000;
  return {
    project:PROJECT,scope:'FIREBASE_CLOUD_ACCESS_READ_ONLY',
    firestoreHttpStatus:root.status,
    singleVerifiedSnapshot:Boolean(singleRoot&&
      stageResults.every(s=>s.verified)),
    stageCoverage:stageResults.length,
    stagesVerified:stageResults.filter(x=>x.verified).length,
    stageHttpStatusCounts:Object.fromEntries(
      [...new Set(stageResults.map(x=>String(x.code)))].map(code=>
        [code,stageResults.filter(x=>String(x.code)===code).length])),
    mailRuntimeHttpStatus:runtime.code,mailRuntimeEnabled:runtime.enabled,
    authHttpStatus:auth.status,authListComplete:accountListComplete,
    accounts:accountListComplete?users.length:null,
    disabledAccounts:accountListComplete?users.filter(x=>x.disabled===true).length:null,
    requiresFirestoreReadPermission:root.status===403||
      stageResults.some(x=>x.code===403)||runtime.code===403,
    requiresFirebaseAuthReadPermission:auth.status===403,
    writes:0,cloudRoleE2EVerified:false,readyForCutover:false,
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const output=await inspectFirebaseCloudReadiness();
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
}
