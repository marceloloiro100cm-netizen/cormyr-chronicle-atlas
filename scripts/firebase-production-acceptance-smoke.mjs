/**
 * Cormyr public production boundaries — anonymous, no secrets, no user data.
 *
 * This checks read-only public routes and the negative authorization boundaries
 * of two private routes. The cron POST deliberately has an invalid 'kind'
 * so it cannot launch sync even if the server authorization check regresses.
 */
import {pathToFileURL} from 'node:url';

export const PRODUCTION_ORIGIN='https://atlas.cormyr.com.br';
export const LEGACY_AUTH_ORIGIN='https://qkdznngbkwodsbpkpoax.supabase.co';

export const PROBES=Object.freeze([
  {name:'loginPage',origin:PRODUCTION_ORIGIN,path:'/auth',method:'GET',status:200,type:'html',required:true},
  {name:'campaignTime',origin:PRODUCTION_ORIGIN,path:'/api/public/time',method:'GET',status:200,type:'json',required:true},
  {name:'publicCatalog',origin:PRODUCTION_ORIGIN,path:'/api/public/catalog',method:'GET',status:200,type:'json',required:true},
  {name:'publicTranslations',origin:PRODUCTION_ORIGIN,path:'/api/public/translations?locale=en',method:'GET',status:200,type:'json',required:true},
  {name:'privateGmAnonymousDenied',origin:PRODUCTION_ORIGIN,path:'/api/public/gm-content',method:'GET',status:401,type:'json',required:true},
  {name:'cronAnonymousDenied',origin:PRODUCTION_ORIGIN,path:'/api/public/jobs/drive-sync',method:'POST',status:401,type:'any',required:true},
  {name:'firebaseEmulatorGatewayClosed',origin:PRODUCTION_ORIGIN,path:'/api/firebase-auth-verify',method:'GET',status:503,type:'json',required:true},
  {name:'legacySupabaseAuthHealth',origin:LEGACY_AUTH_ORIGIN,path:'/auth/v1/health',method:'GET',status:200,type:'json',required:false},
]);

export function productionProbeRequest(probe){
  // No dynamic destinations, headers carrying credentials or cookies, and
  // no GET calls to private user-specific endpoints.
  if(!PROBES.includes(probe))throw Error('Unrecognized production probe');
  const url=new URL(probe.path,probe.origin);
  if(url.origin!==probe.origin||!['GET','POST'].includes(probe.method))
    throw Error('Unsafe probe destination');
  const options={
    method:probe.method,credentials:'omit',redirect:'manual',cache:'no-store',
    headers:probe.method==='POST'
      ?{Accept:'*/*','Content-Type':'application/json'}
      :{Accept:'*/*'},
    signal:AbortSignal.timeout(12000),
  };
  if(probe.method==='POST')options.body=JSON.stringify({kind:'__non_mutating_auth_probe__'});
  return {url:url.href,options};
}

export function classifyProductionProbe(probe,response){
  const contentType=(response.headers.get('content-type')||'').toLowerCase();
  const typeGood=probe.type==='any'||
    (probe.type==='html'&&contentType.startsWith('text/html'))||
    (probe.type==='json'&&contentType.startsWith('application/json'));
  return response.status===probe.status&&typeGood;
}

export async function probeProductionBoundaries({fetcher=fetch}={}){
  const checks=[];
  for(const probe of PROBES){
    try{
      const {url,options}=productionProbeRequest(probe);
      const response=await fetcher(url,options);
      // Intentionally do NOT read or print response bodies: public catalogue,
      // public time and translations may contain campaign details.
      checks.push({
        name:probe.name,method:probe.method,required:probe.required,
        status:response.status,passed:classifyProductionProbe(probe,response),
      });
    }catch{
      checks.push({name:probe.name,method:probe.method,required:probe.required,
        status:null,passed:false,reason:'transport_unavailable'});
    }
  }
  return {
    scope:'ANONYMOUS_PUBLIC_AND_DENIAL_BOUNDARIES_ONLY',
    publicHostingOrigin:PRODUCTION_ORIGIN,
    legacyAuthEndpoint:LEGACY_AUTH_ORIGIN,
    publicReadinessPassed:checks.filter(x=>x.required).every(x=>x.passed),
    advisoryAuthEndpointPassed:checks.find(x=>x.name==='legacySupabaseAuthHealth')?.passed??false,
    userLoginProven:false,
    narratorLoginProven:false,
    houseScopedAccessProven:false,
    mailboxAndCalendarWritesProven:false,
    serviceRoleSecretProven:false,
    cloudFirestoreMigrationProven:false,
    readyForPlayers:false,
    readyForCutover:false,
    productionWrites:0,
    checks,
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=await probeProductionBoundaries();
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(!report.publicReadinessPassed)process.exitCode=1;
}
