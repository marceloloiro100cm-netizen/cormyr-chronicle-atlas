/**
 * Read-only App Hosting release inspection through the already configured
 * GitHub OIDC identity. Never creates rollouts, changes IAM or reads campaign data.
 * Prints only public source revisions and aggregate backend/domain states.
 */
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const APPHOSTING_API='https://firebaseapphosting.googleapis.com/v1';
export const AUDITED_PROJECT='cormyr';
export const AUDITED_DOMAIN='atlas.cormyr.com.br';
export const AUDITED_REGIONS=Object.freeze(['us-east4','us-central1']);

const idPattern=/^[a-z][a-z0-9-]{1,61}[a-z0-9]$/;
const validBuild=(resource,backend)=>typeof resource==='string'&&
  resource.startsWith(backend+'/builds/')&&
  idPattern.test(resource.slice((backend+'/builds/').length));
const sha40=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x)?x:null;

export async function inspectAppHostingReadOnly({
  fetcher=fetch, tokenProvider=()=>execFileSync('gcloud',['auth','print-access-token','--quiet'],
    {encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10000}).trim(),
}={}){
  const token=await tokenProvider();
  if(typeof token!=='string'||token.length<12)throw Error('oidc_identity_unavailable');
  const request=async path=>{
    // Never accept caller-provided URLs or hosts.
    if(!/^projects\/cormyr\/locations\/(?:us-east4|us-central1)\/backends(?:\/[a-z0-9-]+(?:\/(?:domains|rollouts|traffic|builds\/[a-z0-9-]+))?)?(?:\?.*)?$/.test(path))
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
    if(!Array.isArray(found.data.backends)||found.data.nextPageToken){
      locations[locations.length-1].incomplete=true;
      continue; // never claim a complete regional inventory from a partial page
    }
    for(const backend of found.data.backends.slice(0,40)){
      const name=backend?.name;
      if(typeof name!=='string'||!name.startsWith(prefix+'/')||
         !idPattern.test(name.slice((prefix+'/').length)))continue;
      const [domains,traffic,rollouts]=await Promise.all([
        request(name+'/domains?pageSize=100'),
        request(name+'/traffic'),
        request(name+'/rollouts?pageSize=20&orderBy=createTime%20desc'),
      ]);
      const domainAttached=domains.status===200&&Array.isArray(domains.data.domains)
        ?domains.data.domains.some(d=>d?.name===name+'/domains/'+AUDITED_DOMAIN&&!d.disabled)
        :null;
      const currentSplits=traffic.status===200&&Array.isArray(traffic.data.current?.splits)
        ?traffic.data.current.splits:[];
      const serving=currentSplits.find(s=>s?.percent===100&&validBuild(s.build,name));
      const servedBuild=serving?await request(serving.build):null;
      const codebase=servedBuild?.status===200?servedBuild.data.source?.codebase:null;
      const policy=traffic.status===200?traffic.data.rolloutPolicy:null;
      const releases=rollouts.status===200&&Array.isArray(rollouts.data.rollouts)
        ?rollouts.data.rollouts:[];
      backends.push({
        backendId:name.slice((prefix+'/').length),region,domainAttached,
        domainsReadable:domains.status===200,
        trafficReadable:traffic.status===200,
        rolloutsReadable:rollouts.status===200,
        automaticRolloutsEnabled:policy?policy.disabled!==true:null,
        liveBranch:typeof policy?.codebaseBranch==='string'?policy.codebaseBranch:null,
        servedBuildState:servedBuild?.status===200?servedBuild.data.state:null,
        servedCommit:sha40(codebase?.hash),
        rolloutCountSampled:releases.length,
        latestRolloutState:typeof releases[0]?.state==='string'?releases[0].state:null,
      });
    }
  }
  const attached=backends.filter(b=>b.domainAttached);
  return {
    scope:'APPHOSTING_METADATA_READ_ONLY',
    project:AUDITED_PROJECT,domain:AUDITED_DOMAIN,
    locations,backends,matchingBackends:attached.length,
    auditComplete:locations.every(l=>l.httpStatus===200&&!l.incomplete)&&
      backends.every(b=>b.domainsReadable&&b.trafficReadable&&b.rolloutsReadable),
    readPermissionRequired:locations.some(l=>l.httpStatus===403)||
      backends.some(b=>!b.domainsReadable||!b.trafficReadable||!b.rolloutsReadable),
    domainServingCommit:attached.length===1?attached[0].servedCommit:null,
    cloudDataMigratedVerified:false,readyForCutover:false,cloudWrites:0,
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  inspectAppHostingReadOnly().then(report=>{
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if(report.readPermissionRequired)
      console.error('App Hosting read-only permissions unavailable; roles/firebaseapphosting.viewer may be required.');
  }).catch(()=>{
    console.error('App Hosting read-only inspection unavailable. No IAM, data or rollout changes made.');
    process.exitCode=1;
  });
}
