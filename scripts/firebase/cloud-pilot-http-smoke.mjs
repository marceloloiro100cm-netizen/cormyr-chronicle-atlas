/**
 * Public, anonymous Firebase Cloud-only portal smoke.
 *
 * Does NOT call Supabase, read account data, use bearer tokens, or mutate
 * Firestore/Auth. Only static GET and a deliberately unauthorized POST.
 */
import {pathToFileURL} from 'node:url';

export const ORIGIN='https://atlas.cormyr.com.br';
export const PATHS=Object.freeze(['/firebase-access','/api/firebase-cloud-read','/api/firebase-cloud-mail','/api/firebase-workspace']);
const SAFE_CODES=new Set(['firebase_cloud_read_disabled','authentication_required']);
function output(name,status,passed){return {name,status,passed};}

export async function probeCloudPilot(fetcher=fetch){
  const results=[];
  try{
    const route=await fetcher(ORIGIN+PATHS[0],{
      method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',
      headers:{Accept:'text/html'},signal:AbortSignal.timeout(12000),
    });
    results.push(output('pilotPage',route.status,
      route.status===200&&
      (route.headers.get('content-type')||'').toLowerCase().startsWith('text/html')
    ));
  }catch{results.push(output('pilotPage',null,false));}
  try{
    const res=await fetcher(ORIGIN+PATHS[1],{
      method:'POST',redirect:'manual',credentials:'omit',cache:'no-store',
      headers:{Accept:'application/json','Content-Type':'application/json'},
      body:JSON.stringify({action:'session'}),
      signal:AbortSignal.timeout(12000),
    });
    let parsed;
    try{parsed=await res.json();}catch{parsed=null;}
    // Require the NEW Firebase gateway's own codes, not a legacy 503 page.
    const passed=[401,503].includes(res.status)&&
      parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&
      SAFE_CODES.has(parsed.error)&&
      (res.headers.get('cache-control')||'').includes('no-store');
    results.push(output('unauthenticatedCloudReadDenied',res.status,Boolean(passed)));
  }catch{results.push(output('unauthenticatedCloudReadDenied',null,false));}
  try{
    // Never submit a real message or pass credentials in the public smoke.
    const res=await fetcher(ORIGIN+PATHS[2],{
      method:'POST',redirect:'manual',credentials:'omit',cache:'no-store',
      headers:{Accept:'application/json','Content-Type':'application/json'},
      body:JSON.stringify({action:'status'}),
      signal:AbortSignal.timeout(12000),
    });
    let parsed;
    try{parsed=await res.json();}catch{parsed=null;}
    const code=parsed?.error;
    const accepted=res.status===503&&code==='firebase_cloud_mail_disabled'||
      res.status===401&&code==='authentication_required';
    results.push(output('unauthenticatedCloudMailDenied',res.status,
      Boolean(accepted&&(res.headers.get('cache-control')||'').includes('no-store'))));
  }catch{results.push(output('unauthenticatedCloudMailDenied',null,false));}
  try{
    const res=await fetcher(ORIGIN+PATHS[3],{
      method:'POST',redirect:'manual',credentials:'omit',cache:'no-store',
      headers:{Accept:'application/json','Content-Type':'application/json'},
      body:JSON.stringify({kind:'auth'}),signal:AbortSignal.timeout(12000),
    });
    const parsed=await res.json().catch(()=>null);
    results.push(output('unauthenticatedWorkspaceDenied',res.status,
      res.status===401&&parsed?.error==='authentication_required'&&
      (res.headers.get('cache-control')||'').includes('no-store')));
  }catch{results.push(output('unauthenticatedWorkspaceDenied',null,false));}
  return {
    scope:'FIREBASE_CLOUD_PUBLIC_ANONYMOUS_SMOKE',
    origin:ORIGIN,verified:results.every(x=>x.passed),
    firebaseAuthRealUserVerified:false,houseIsolationCloudVerified:false,
    firestoreLiveWriteVerified:false,readyForCutover:false,
    checks:results,
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=await probeCloudPilot();
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(!report.verified)process.exitCode=1;
}
