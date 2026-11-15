/**
 * Prove the compiled Nitro (node-server) artifact actually serves the routes
 * which are expected on Firebase App Hosting. No Cloud calls, authentication,
 * database queries or user data required.
 * In emergency archive-only mode all legacy API routes return HTTP 503;
 * restore the previous public translation-validation expectation only when
 * the Firebase native backend is activated and accepted in production.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export const EXPECTED_ROUTES = Object.freeze([
  {path:'/api/firebase-auth-verify', status:503, kind:'json'},
  {path:'/api/public/translations', status:503, kind:'json'},
  {path:'/cormyr/index.html', status:200, kind:'html'},
  {path:'/spy-portraits/tillet.jpg', status:200, kind:'image'},
]);

export function classifyCompiledRoute(entry, response) {
  const type=(response.headers.get('content-type')||'').toLowerCase();
  const safe=entry.kind==='json' ? type.startsWith('application/json')
    : entry.kind==='html' ? type.startsWith('text/html')
    : entry.kind==='image' ? type.startsWith('image/') : false;
  return response.status===entry.status && safe;
}

function disabledProductionEnvironment(port) {
  return {
    ...process.env,
    PORT:String(port),NITRO_PORT:String(port),
    HOST:'127.0.0.1',NITRO_HOST:'127.0.0.1',
    NODE_ENV:'production',
    FIREBASE_AUTH_HOMOLOGATION_ENABLED:'false',
    FIREBASE_DOMAIN_HOMOLOGATION_ENABLED:'false',
    VITE_FIREBASE_DOMAIN_HOMOLOGATION:'false',
    FIREBASE_PROJECT_ID:'',
    FIRESTORE_EMULATOR_HOST:'',
    FIREBASE_AUTH_EMULATOR_HOST:'',
    CORMYR_DOMAIN_PORT:'',
  };
}

export async function probeCompiledRoutes({port=39071,timeoutMs=25000,fetcher=fetch,launch=spawn}={}) {
  if(!Number.isInteger(port)||port<1024||port>65535) throw Error('Invalid local port');
  const origin=`http://127.0.0.1:${port}`;
  const child=launch(process.execPath,['dist/server/index.mjs'],{
    cwd:process.cwd(),
    env:disabledProductionEnvironment(port),
    stdio:'ignore',
  });
  const deadline=Date.now()+timeoutMs;
  let exited=false;
  child.once('exit',()=>{exited=true;});
  try{
    let alive=false;
    while(Date.now()<deadline&&!exited){
      try{
        const reply=await fetcher(origin+'/api/public/translations',{
          method:'GET',redirect:'manual',credentials:'omit',
          signal:AbortSignal.timeout(1500),
        });
        if(reply.status!==undefined) {alive=true;break;}
      }catch{/* Node server is still starting */}
      await sleep(250);
    }
    if(!alive) throw Error('compiled_server_failed_to_start');
    const checks=[];
    for(const entry of EXPECTED_ROUTES){
      const response=await fetcher(origin+entry.path,{
        method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',
        signal:AbortSignal.timeout(4000),
      });
      checks.push({
        name:entry.path,status:response.status,
        passed:classifyCompiledRoute(entry,response),
      });
    }
    return {
      scope:'LOCAL_COMPILED_ARTIFACT_ONLY',
      serverStarted:true,
      compiledRoutesPass:checks.every(c=>c.passed),
      cloudRolloutVerified:false,
      firebaseCloudDataVerified:false,
      readyForCutover:false,
      checks,
    };
  }finally{
    if(child.exitCode===null&&!child.killed)child.kill('SIGTERM');
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  probeCompiledRoutes()
    .then(report=>{
      process.stdout.write(JSON.stringify(report,null,2)+'\n');
      if(!report.compiledRoutesPass)process.exitCode=1;
    })
    .catch(error=>{
      // Do not show environment, HTTP response bodies, secrets or app logs.
      console.error('Compiled Node server route probe failed:',error.message==='compiled_server_failed_to_start'
        ?'server_start_failed':'route_probe_unavailable');
      process.exitCode=1;
    });
}
