/**
 * Protected direct App Hosting API rollout for exact CI-verified main revision.
 * Avoids Firebase CLI's unrelated Service Usage API preflight. This does NOT
 * bypass App Hosting IAM: builds.create and rollouts.create remain mandatory.
 * No Firestore, Firebase Auth, Storage or runtime flag mutations.
 */
import {pathToFileURL} from 'node:url';
import {appendFileSync} from 'node:fs';

const BASE='https://firebaseapphosting.googleapis.com/v1/';
const BACKEND='projects/cormyr/locations/us-east4/backends/cormyr-preview';
const SHA=/^[a-f0-9]{40}$/;
const RUN=/^[1-9][0-9]{7,13}$/;
const fail=code=>{throw Error('apphosting_direct_'+code);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Only fixed Google RPC reason labels may reach public Actions logs.
// Never include provider messages, arbitrary metadata, service identities or URLs.
const SAFE_REASONS=new Set([
  'IAM_PERMISSION_DENIED','ACCESS_TOKEN_SCOPE_INSUFFICIENT',
  'SERVICE_DISABLED','CONSUMER_INVALID','ORG_RESTRICTION',
  'SECURITY_POLICY_VIOLATED','API_KEY_INVALID','LOCATION_POLICY_VIOLATED',
]);
export function classifyAppHostingDenial(response,status){
  if(status!==403||!response||typeof response!=='object')return null;
  const error=response.error;
  if(!error||typeof error!=='object')return null;
  const details=Array.isArray(error.details)?error.details:[];
  for(const d of details){
    if(!d||typeof d!=='object'||d['@type']!==
       'type.googleapis.com/google.rpc.ErrorInfo')continue;
    if(SAFE_REASONS.has(d.reason))return d.reason.toLowerCase();
  }
  if(error.status==='PERMISSION_DENIED')return 'permission_denied_unspecified';
  return null;
}

export async function requestExactAppHostingRollout({
  sha,runId,fetcher=fetch,accessToken,wait=sleep,
}={}){
  if(!SHA.test(sha??'')||!RUN.test(String(runId??''))||
     typeof accessToken!=='string'||accessToken.length<12||
     typeof fetcher!=='function')fail('invalid_invocation');
  const name='gh-'+sha.slice(0,12)+'-'+runId;
  const call=async(path,method='GET',body)=>{
    // These resource paths are fixed by this module; no URL from Cloud data,
    // environment variables, user input or API response can be requested.
    if(!path.startsWith(BACKEND)||
       !['GET','POST'].includes(method))fail('invalid_resource');
    let reply;
    try{
      reply=await fetcher(BASE+path,{
        method,redirect:'error',cache:'no-store',
        headers:{
          Authorization:'Bearer '+accessToken,
          ...(method==='POST'?{'Content-Type':'application/json'}:{}),
        },
        ...(method==='POST'?{body:JSON.stringify(body)}:{}),
        signal:AbortSignal.timeout(15000),
      });
    }catch{fail('request_unavailable');}
    if(!Number.isSafeInteger(reply?.status))fail('invalid_http_response');
    let data=null;
    if(reply.status>=200&&reply.status<300){
      try{data=await reply.json();}catch{fail('invalid_json');}
      if(!data||typeof data!=='object'||Array.isArray(data))
        fail('invalid_response');
    }
    if(reply.status===403){
      // A denied response is untrusted. Parse only for allowlisted RPC reason.
      let denial=null;
      try{denial=await reply.json();}catch{/* Opaque denial. */}
      return {status:reply.status,data:null,
        denialReason:classifyAppHostingDenial(denial,reply.status)};
    }
    return {status:reply.status,data};
  };
  const traffic=await call(BACKEND+'/traffic');
  if(traffic.status!==200)fail('traffic_http_'+traffic.status);
  const policy=traffic.data.rolloutPolicy;
  if(policy?.codebaseBranch!=='main'||policy?.disabled===true)
    fail('live_branch_unverified');

  const buildPath=BACKEND+'/builds/'+name;
  const buildBody={source:{codebase:{commit:sha}}};
  const createBuild=await call(
    BACKEND+'/builds?buildId='+name,'POST',buildBody,
  );
  if(createBuild.status!==409&&
     (createBuild.status<200||createBuild.status>=300))
    fail('build_create_http_'+createBuild.status+
      (createBuild.status===403&&createBuild.denialReason
        ?'_'+createBuild.denialReason:''));
  if(createBuild.status!==409&&
     typeof createBuild.data.name!=='string')
    fail('build_operation_unverified');

  let confirmed=false;
  for(let attempt=0;attempt<12;attempt++){
    if(attempt>0)await wait(5000);
    const build=await call(buildPath);
    if(build.status===404)continue;
    if(build.status!==200)fail('build_get_http_'+build.status);
    const source=build.data.source?.codebase;
    if(source?.commit!==sha&&source?.hash!==sha)
      fail('build_source_mismatch');
    if(build.data.state==='FAILED'||build.data.state==='EXPIRED')
      fail('build_not_usable');
    confirmed=true;break;
  }
  if(!confirmed)fail('build_visibility_unverified');

  const createRollout=await call(
    BACKEND+'/rollouts?rolloutId='+name,
    'POST',{build:buildPath},
  );
  if(createRollout.status<200||createRollout.status>=300)
    fail('rollout_create_http_'+createRollout.status);
  if(typeof createRollout.data.name!=='string'||
     createRollout.data.name.length<8)
    fail('rollout_operation_unverified');
  return {
    scope:'CORMYR_PROTECTED_APPHOSTING_DIRECT_API',
    exactMainShaVerified:true,buildCreatedOrAlreadyPresent:true,
    rolloutRequested:true,servedCommitVerified:false,
    firebaseAuthWrites:0,firestoreWrites:0,storageWrites:0,
    releaseDecision:'NO_GO',
  };
}

/**
 * Read only the denied-permission flags from Cloud Audit Logs after a
 * confirmed App Hosting build 403. Never return entries, identities, paths,
 * timestamps, request objects, provider messages or arbitrary permissions.
 * The logging API call is a query (POST entries:list), not a Cloud mutation.
 */
export async function inspectAppHostingBuildDenial({
  accessToken,fetcher=fetch,now=new Date(),
}={}){
  const result={scope:'CORMYR_APPHOSTING_DENIAL_AUDIT_READ_ONLY',
    auditHttpStatus:null,matchingDeniedPermissions:[],
    auditEvidenceFound:false,cloudWrites:0};
  if(typeof accessToken!=='string'||accessToken.length<12||
     typeof fetcher!=='function'||!(now instanceof Date)||
     !Number.isFinite(now.getTime()))return result;
  const since=new Date(now.getTime()-10*60*1000).toISOString();
  const filter='timestamp>="'+since+'" AND '+
    'protoPayload.serviceName="firebaseapphosting.googleapis.com" AND '+
    'protoPayload.status.code=7';
  let response;
  try{
    response=await fetcher('https://logging.googleapis.com/v2/entries:list',{
      method:'POST',redirect:'error',cache:'no-store',
      headers:{Authorization:'Bearer '+accessToken,
        'Content-Type':'application/json'},
      body:JSON.stringify({resourceNames:['projects/cormyr'],filter,
        orderBy:'timestamp desc',pageSize:20}),
      signal:AbortSignal.timeout(15000),
    });
  }catch{return result;}
  if(!Number.isSafeInteger(response?.status))return result;
  result.auditHttpStatus=[200,400,401,403,404,429,500,503].includes(response.status)
    ?response.status:null;
  if(response.status!==200)return result;
  let body;
  try{body=await response.json();}catch{return result;}
  if(!Array.isArray(body?.entries)||body.entries.length>20)return result;
  const allowed=new Set([
    'firebaseapphosting.builds.create','firebaseapphosting.builds.get',
    'firebaseapphosting.rollouts.create',
    'serviceusage.services.use','cloudbuild.builds.create',
  ]);
  const denied=new Set();
  for(const entry of body.entries){
    const payload=entry?.protoPayload;
    if(payload?.serviceName!=='firebaseapphosting.googleapis.com'||
       payload?.status?.code!==7||!Array.isArray(payload.authorizationInfo))
      continue;
    result.auditEvidenceFound=true;
    for(const info of payload.authorizationInfo){
      if(info?.granted===false&&allowed.has(info.permission))
        denied.add(info.permission);
    }
  }
  result.matchingDeniedPermissions=[...denied].sort();
  return result;
}

export async function runProtectedAppHostingRelease(env=process.env){
  const sha=env.VERIFIED_SHA,runId=env.GITHUB_RUN_ID;
  if(sha!==env.GITHUB_SHA||env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_RUN_ATTEMPT!=='1')
    fail('ci_revision_or_attempt_unverified');
  const {applicationDefault}=await import('firebase-admin/app');
  const credential=applicationDefault();
  const token=(await credential.getAccessToken())?.access_token;
  const summary=await requestExactAppHostingRollout({
    sha,runId,accessToken:token,
  });
  const line='App Hosting API: rollout requested for CI-verified main; '+
    'serving revision must still be checked independently. NO_GO.';
  if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,line+'\n');
  console.log(JSON.stringify(summary));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runProtectedAppHostingRelease().catch(async e=>{
    const message=typeof e?.message==='string'?e.message:'';
    const code=/^apphosting_direct_[a-z0-9_]{1,80}$/.test(message)
      ?message:'apphosting_direct_unavailable';
    console.error(code);
    if(code.startsWith('apphosting_direct_build_create_http_403')){
      try{
        const {applicationDefault}=await import('firebase-admin/app');
        const credential=applicationDefault();
        const accessToken=(await credential.getAccessToken())?.access_token;
        const report=await inspectAppHostingBuildDenial({accessToken});
        console.error(JSON.stringify(report));
      }catch{
        console.error('apphosting_denial_audit_unavailable');
      }
    }
    process.exitCode=2;
  });
}
