/**
 * Read-only App Hosting release inspection through the already configured
 * GitHub OIDC identity. Never creates rollouts, changes IAM or reads campaign data.
 * Prints only public source revisions and aggregate backend/domain states.
 */
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const APPHOSTING_API='https://firebaseapphosting.googleapis.com/v1';
export const AUDITED_PROJECT='cormyr';
// Verified numeric project alias from the already configured GitHub GCP OIDC provider.
export const AUDITED_PROJECT_NUMBER='477785088395';
export const AUDITED_DOMAIN='atlas.cormyr.com.br';
export const AUDITED_REGIONS=Object.freeze(['us-east4','us-central1']);

const idPattern=/^[a-z][a-z0-9-]{1,61}[a-z0-9]$/;
// Build IDs can be UUID-like and start with a digit, unlike backend IDs.
const validBuild=(resource,backend)=>typeof resource==='string'&&
  resource.startsWith(backend+'/builds/')&&
  /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(resource.slice((backend+'/builds/').length));
const sha40=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x)?x:null;
/**
 * The Firebase API can return a numeric project resource even when queried
 * by the project ID. Only the known project number may alias this backend.
 * Canonicalize the build GET back to the same approved cormyr backend.
 */
export function validatedServingBuildPath(resource,backend){
  if(validBuild(resource,backend))return resource;
  if(typeof resource!=='string')return null;
  const prefix='projects/'+AUDITED_PROJECT_NUMBER+'/';
  if(!resource.startsWith(prefix))return null;
  const canonical='projects/'+AUDITED_PROJECT+'/'+resource.slice(prefix.length);
  return validBuild(canonical,backend)?canonical:null;
}


/**
 * Bounded metadata only: never emit raw build references, which could carry
 * arbitrary provider strings. Diagnose the mismatch with a shape enum.
 */
export function classifyTrafficSplit(split,backend){
  const build=split?.build;
  let buildRefShape='MISSING_OR_NON_STRING';
  if(typeof build==='string'){
    if(validBuild(build,backend)){
      buildRefShape='EXACT_BACKEND_RESOURCE';
    }else if(validatedServingBuildPath(build,backend)){
      buildRefShape='KNOWN_PROJECT_NUMBER_ALIAS';
    }else if(build.startsWith(backend+'/builds/')){
      buildRefShape='INVALID_BUILD_ID';
    }else if(/^projects\/[^/]+\/locations\/[^/]+\/backends\/[^/]+\/builds\/[^/]+$/.test(build)){
      const parts=build.split('/');
      const expected=backend.split('/');
      buildRefShape=parts[3]===expected[3]&&parts[5]===expected[5]
        ?'SAME_BACKEND_OTHER_PROJECT_ALIAS':'OTHER_BACKEND_RESOURCE';
    }else if(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(build)){
      buildRefShape='SHORT_BUILD_ID';
    }else if(/^builds\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(build)){
      buildRefShape='RELATIVE_BUILD_RESOURCE';
    }else{
      buildRefShape='OTHER_OR_UNTRUSTED_REFERENCE';
    }
  }
  const percent=split?.percent;
  return {
    buildRefShape,
    percentType:typeof percent,
    percentClass:percent===100||percent==='100'?'ONE_HUNDRED':
      percent===0||percent==='0'?'ZERO':'OTHER_OR_MISSING',
  };
}


export async function inspectAppHostingReadOnly({
  fetcher=fetch, tokenProvider=()=>execFileSync('gcloud',['auth','print-access-token','--quiet'],
    {encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10000}).trim(),
}={}){
  const token=await tokenProvider();
  if(typeof token!=='string'||token.length<12)throw Error('oidc_identity_unavailable');
  const request=async path=>{
    // Never accept caller-provided URLs or hosts.
    if(!/^projects\/cormyr\/locations\/(?:us-east4|us-central1)\/backends(?:\/[a-z0-9-]+(?:\/(?:domains|rollouts|traffic|builds|builds\/[a-z0-9-]+))?)?(?:\?.*)?$/.test(path))
      throw Error('untrusted_apphosting_resource');
    const response=await fetcher(APPHOSTING_API+'/'+path,{
      method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
      headers:{Authorization:`Bearer ${token}`},
      signal:AbortSignal.timeout(12000),
    });
    if(response.status===403)return {blocked:true,status:403};
    if(response.status===404)return {blocked:false,status:404};
    if(response.status!==200)return {blocked:true,status:response.status};
    const body=await response.json();
    if(!body||typeof body!=='object'||Array.isArray(body))
      throw Error('invalid_apphosting_json');
    return {blocked:false,status:200,data:body};
  };
  const backends=[];
  const locations=[];
  for(const region of AUDITED_REGIONS){
    const prefix=`projects/cormyr/locations/${region}/backends`;
    const found=await request(prefix+'?pageSize=40');
    locations.push({region,httpStatus:found.status});
    if(found.status!==200)continue;
    // Google omits the "backends" field when a successful list is empty.
    // An actual pagination token still means we cannot claim completeness.
    const entries=found.data.backends??[];
    if(!Array.isArray(entries)||found.data.nextPageToken){
      locations[locations.length-1].incomplete=true;
      continue;
    }
    for(const backend of entries.slice(0,40)){
      const name=backend?.name;
      if(typeof name!=='string'||!name.startsWith(prefix+'/')||
         !idPattern.test(name.slice((prefix+'/').length)))continue;
      const [domains,traffic,rollouts,builds]=await Promise.all([
        request(name+'/domains?pageSize=100'),
        request(name+'/traffic'),
        // Ordering is done locally; avoid a server-side orderBy incompatibility.
        request(name+'/rollouts?pageSize=20'),
        request(name+'/builds?pageSize=20'),
      ]);
      const domainAttached=domains.status===200&&Array.isArray(domains.data.domains)
        ?domains.data.domains.some(d=>d?.name===name+'/domains/'+AUDITED_DOMAIN&&!d.disabled)
        :null;
      const currentSplits=traffic.status===200&&Array.isArray(traffic.data.current?.splits)
        ?traffic.data.current.splits:[];
      const splitDiagnostics=currentSplits.slice(0,5)
        .map(split=>classifyTrafficSplit(split,name));
      // Google REST may serialize an int64 percent field as the canonical decimal string.
      const validServing=currentSplits.filter(s=>
        (s?.percent===100||s?.percent==='100')&&validatedServingBuildPath(s.build,name));
      // Only one 100%-traffic build is conclusive; no fallback from historical
      // rollout to the current revision, which may differ after rollback.
      const serving=validServing.length===1?validServing[0]:null;
      const servedBuild=serving?await request(validatedServingBuildPath(serving.build,name)):null;
      const codebase=servedBuild?.status===200?servedBuild.data.source?.codebase:null;
      const policy=traffic.status===200?traffic.data.rolloutPolicy:null;
      const releases=rollouts.status===200&&Array.isArray(rollouts.data.rollouts)
        ?rollouts.data.rollouts:[];
      releases.sort((a,b)=>String(b?.createTime??'').localeCompare(String(a?.createTime??'')));
      // Fetch only the five newest referenced builds in this fixed backend.
      // Report bounded status enums/codes; never emit Google error messages,
      // Cloud resource links, build logs, IAM details or authentication tokens.
      const recentRollouts=[];
      for(const rollout of releases.slice(0,5)){
        const buildPath=validatedServingBuildPath(rollout?.build,name);
        const buildInfo=buildPath?await request(buildPath):null;
        const data=buildInfo?.status===200?buildInfo.data:null;
        const state=typeof rollout?.state==='string'?rollout.state:null;
        const buildState=typeof data?.state==='string'?data.state:null;
        const code=rollout?.error?.code;
        const errorSource=typeof data?.errors?.[0]?.errorSource==='string'
          ?data.errors[0].errorSource:null;
        recentRollouts.push({
          rolloutState:state,
          rolloutErrorCode:Number.isInteger(code)&&code>=0&&code<=99?code:null,
          buildState,
          buildHttpStatus:buildInfo?.status??null,
          buildCommit:sha40(data?.source?.codebase?.hash),
          buildErrorSource:errorSource&&/^[A-Z_]{1,50}$/.test(errorSource)
            ?errorSource:null,
          buildErrorCount:Array.isArray(data?.errors)
            ?Math.min(data.errors.length,100):0,
        });
      }
      const receivedBuilds=builds.status===200&&Array.isArray(builds.data.builds)
        ?builds.data.builds:[];
      receivedBuilds.sort((a,b)=>String(b?.createTime??'').localeCompare(String(a?.createTime??'')));
      // Failed builds can be absent from rollouts entirely. Only emit safe
      // state/error-source enums and revision SHAs, not error messages.
      const recentBuilds=receivedBuilds.slice(0,12).filter(b=>
        validatedServingBuildPath(b?.name,name)!==null).map(b=>{
        const e=Array.isArray(b.errors)?b.errors[0]:null;
        const errorCode=e?.error?.code;
        const source=typeof e?.errorSource==='string'?e.errorSource:null;
        return {
          state:typeof b.state==='string'?b.state:null,
          sourceCommit:sha40(b.source?.codebase?.hash),
          errorCount:Array.isArray(b.errors)?Math.min(b.errors.length,100):0,
          errorCode:Number.isInteger(errorCode)&&errorCode>=0&&errorCode<=99
            ?errorCode:null,
          errorSource:source&&/^[A-Z_]{1,50}$/.test(source)?source:null,
        };
      });
      backends.push({
        backendId:name.slice((prefix+'/').length),region,domainAttached,
        domainsReadable:domains.status===200,
        trafficReadable:traffic.status===200,
        rolloutsReadable:rollouts.status===200,
        domainsHttpStatus:domains.status,
        trafficHttpStatus:traffic.status,
        rolloutsHttpStatus:rollouts.status,
        servingTrafficSplitCount:currentSplits.length,
        splitDiagnostics,
        servingBuildSelected:serving!==null,
        servingBuildHttpStatus:servedBuild?.status??null,
        automaticRolloutsEnabled:policy?policy.disabled!==true:null,
        liveBranch:typeof policy?.codebaseBranch==='string'?policy.codebaseBranch:null,
        servedBuildState:servedBuild?.status===200?servedBuild.data.state:null,
        servedCommit:sha40(codebase?.hash),
        rolloutCountSampled:releases.length,
        latestRolloutState:typeof releases[0]?.state==='string'?releases[0].state:null,
        recentRollouts,
        buildsHttpStatus:builds.status,
        buildsReadable:builds.status===200,
        recentBuilds,
      });
    }
  }
  const attached=backends.filter(b=>b.domainAttached);
  return {
    scope:'APPHOSTING_METADATA_READ_ONLY',
    project:AUDITED_PROJECT,domain:AUDITED_DOMAIN,
    locations,backends,matchingBackends:attached.length,
    // A 200 on metadata endpoints does not prove which build is serving.
    // Report a complete audit only when the attached domain has a resolved
    // 100% serving build and a source SHA.
    auditComplete:locations.every(l=>l.httpStatus===200&&!l.incomplete)&&
      backends.every(b=>b.domainsReadable&&b.trafficReadable&&b.rolloutsReadable)&&
      attached.length===1&&attached[0].servingBuildSelected&&
      attached[0].servingBuildHttpStatus===200&&attached[0].servedCommit!==null,
    readPermissionRequired:locations.some(l=>l.httpStatus===401||l.httpStatus===403)||
      backends.some(b=>[401,403].includes(b.domainsHttpStatus)||
        [401,403].includes(b.trafficHttpStatus)||
        [401,403].includes(b.rolloutsHttpStatus)||
        [401,403].includes(b.servingBuildHttpStatus)),
    domainServingCommit:attached.length===1?attached[0].servedCommit:null,
    cloudDataMigratedVerified:false,readyForCutover:false,cloudWrites:0,
  };
}


/**
 * Compare the live build observed at audit time to the triggering main push.
 * A rollout may still be in progress: NOT_YET_MATCHING is diagnostic, not
 * a deployment failure or permission to change traffic.
 */
export function classifyServingRevision(report,expectedSha){
  const expected=sha40(expectedSha);
  const served=sha40(report?.domainServingCommit);
  const backend=report?.matchingBackends===1?
    report?.backends?.find(b=>b.domainAttached===true):null;
  const complete=report?.auditComplete===true&&backend!==null&&backend!==undefined;
  const comparison=!complete||!served?'INCONCLUSIVE':
    !expected?'NO_EXPECTED_COMMIT':
    expected===served?'MATCH':'NOT_YET_MATCHING';
  return {
    comparison,
    expectedCommit:expected,
    servingCommit:served,
    servingBranch:backend?.liveBranch??null,
    automaticRolloutsEnabled:backend?.automaticRolloutsEnabled??null,
    readPermissionRequired:report?.readPermissionRequired===true,
    readyForCutover:false,
  };
}

/**
 * Observe one public GitHub main commit reaching the 100%-traffic build.
 * Inspections remain existing GET-only App Hosting metadata calls. The
 * periodic recheck is bounded, can be cancelled by the GitHub job timeout,
 * and NEVER performs a rollout. A MATCH describes only the inspection time.
 *
 * Retrying an already known wrong branch, disabled rollout policy or denied
 * read would waste time and could mislead the operator.
 */
export async function observeServingRevision({
  inspect=()=>inspectAppHostingReadOnly(),
  pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  expectedSha,
  maxAttempts=6,
  intervalMs=20_000,
}={}){
  if(!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>6||
     !Number.isSafeInteger(intervalMs)||intervalMs<0||intervalMs>30_000||
     typeof inspect!=='function'||typeof pause!=='function')
    throw Error('invalid_revision_observation_options');
  let report=null;
  let revision=null;
  let attempts=0;
  let stopReason='INCONCLUSIVE';
  for(let attempt=0;attempt<maxAttempts;attempt++){
    report=await inspect();
    attempts++;
    revision=classifyServingRevision(report,expectedSha);
    if(revision.comparison==='MATCH'){
      stopReason='MATCH_OBSERVED';
      break;
    }
    if(revision.readPermissionRequired){
      stopReason='READ_PERMISSION_REQUIRED';
      break;
    }
    if(revision.comparison==='NO_EXPECTED_COMMIT'){
      stopReason='NO_EXPECTED_COMMIT';
      break;
    }
    // The serving backend and its deployment policy must be known before
    // further polling. INCONCLUSIVE without a backend is not rollout evidence.
    const backend=report?.matchingBackends===1?
      report.backends?.find(b=>b.domainAttached===true):null;
    if(!backend){
      stopReason='SERVING_BACKEND_UNCONFIRMED';
      break;
    }
    if(revision.servingBranch!=='main'){
      stopReason='BRANCH_NOT_MAIN_OR_UNCONFIRMED';
      break;
    }
    if(revision.automaticRolloutsEnabled!==true){
      stopReason='AUTOMATIC_ROLLOUT_DISABLED_OR_UNCONFIRMED';
      break;
    }
    if(attempt===maxAttempts-1){
      stopReason='OBSERVATION_WINDOW_EXHAUSTED';
      break;
    }
    stopReason='OBSERVATION_WINDOW_EXHAUSTED';
    await pause(intervalMs);
  }
  return {
    report,
    observation:{
      attempts,
      maxAttempts,
      comparison:revision?.comparison??'INCONCLUSIVE',
      stopReason,
      matchingCommitObserved:revision?.comparison==='MATCH',
      // Matching code cannot prove migrated Cloud data or player access.
      cloudDataMigratedVerified:false,
      readyForCutover:false,
      writes:0,
    },
  };
}

function appendPublicationSummary(report,observation=null){
  const destination=process.env.GITHUB_STEP_SUMMARY;
  if(!destination)return;
  const state=classifyServingRevision(report,process.env.GITHUB_SHA);
  const lines=[
    '### Firebase App Hosting — revisão publicada (somente leitura)',
    '- Commit deste push: '+(state.expectedCommit??'não confirmado'),
    '- Commit efetivamente em tráfego: '+(state.servingCommit??'não confirmado'),
    '- Comparação no instante da auditoria: **'+state.comparison+'**',
    '- Observações somente leitura: '+(observation?.attempts??1)+
      ' · Motivo de parada: '+(observation?.stopReason??'SINGLE_CHECK')+
      ' · Mesmo MATCH não autoriza cutover.',
    '- Branch configurada: '+(state.servingBranch??'desconhecida'),
    '- Rollouts automáticos: '+(state.automaticRolloutsEnabled===null?
      'desconhecidos':state.automaticRolloutsEnabled?'ativados':'desativados'),
    '- Consulta completa: '+(report.auditComplete?'sim':'não'),
    '- Formato do split ativo (metadados sem IDs): '+
      (report.backends?.find(b=>b.domainAttached)?.splitDiagnostics
        ?.map(d=>d.percentType+'/'+d.percentClass+'/'+d.buildRefShape).join('; ')??'desconhecido'),
    '- Permissão de leitura pendente: '+(state.readPermissionRequired?'sim':'não'),
    '- Rollouts recentes (estados e códigos, sem mensagens): '+JSON.stringify(
      report.backends?.find(b=>b.domainAttached)?.recentRollouts??[]),
    '- Builds recentes (estados e códigos, sem mensagens): '+JSON.stringify(
      report.backends?.find(b=>b.domainAttached)?.recentBuilds??[]),
    '- Firebase Cloud/dados/Auth migrados: **não comprovado**. Corte definitivo: **NO_GO**.',
    '- Uma comparação diferente de MATCH pode apenas indicar rollout ainda em curso; conferir o check App Hosting - Rollout antes de concluir.',
    '',
  ];
  appendFileSync(destination,lines.join('\n')+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  observeServingRevision({expectedSha:process.env.GITHUB_SHA})
    .then(({report,observation})=>{
      process.stdout.write(JSON.stringify({...report,publicationObservation:observation},
        null,2)+'\n');
      appendPublicationSummary(report,observation);
      if(report.readPermissionRequired)
        console.error('One or more App Hosting metadata reads returned HTTP 401/403. Verify project-level access without expanding roles.');
      if(!report.auditComplete)
        console.error('App Hosting metadata audit is incomplete; inspect reported per-endpoint status codes. No rollout was created.');
    }).catch(()=>{
      console.error('App Hosting read-only inspection unavailable. No IAM, data or rollout changes made.');
      process.exitCode=1;
    });
}
