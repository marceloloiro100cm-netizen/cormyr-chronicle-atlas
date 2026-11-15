/**
 * Loopback-only HTTP runner for the pre-existing Firebase scheduled jobs.
 * Cloud Scheduler is NOT configured by this file and must NOT be pointed at it.
 */
import {createServer} from 'node:http';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {createEmulatorJobs,createJobsHandler} from './scheduled-jobs-handler.mjs';

const PROJECT='demo-cormyr-migration',HASH=/^[a-f0-9]{64}$/;
const errorResponse=()=>Response.json({error:'access_denied'},{
  status:403,headers:{'Cache-Control':'private, no-store'},
});
/** A separate listener owns only HTTP mapping; identity stays with the job handler. */
export function createLocalJobHttpHandler({handle,origin}){
  if(typeof handle!=='function'||!/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(origin))
    throw Error('Invalid local jobs HTTP settings');
  return async function(request){
    const u=new URL(request.url);
    if(u.origin!==origin||request.headers.has('cookie')||
       request.headers.has('x-forwarded-host')||
       (request.headers.has('origin')&&request.headers.get('origin')!==origin)||
       (request.headers.get('content-length')&&request.headers.get('content-length')!=='0')||
       request.headers.has('transfer-encoding'))
      return errorResponse();
    return handle(request);
  };
}
async function main(){
  const env=process.env;
  assertEmulatorOnly(env,PROJECT);
  const snapshotId=env.CORMYR_JOBS_SNAPSHOT;
  const actorUid=env.CORMYR_JOBS_ACTOR_UID;
  const secret=env.CRON_SECRET;
  const port=Number(env.CORMYR_JOBS_PORT||8790);
  if(!HASH.test(snapshotId||'')||!actorUid||actorUid.length>128||
     typeof secret!=='string'||secret.length<32||
     !Number.isInteger(port)||port<1024||port>65535)
    throw Error('Explicit snapshot, narrator, strong secret and valid port required');
  const origin='http://127.0.0.1:'+port;
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:PROJECT},'cormyr-local-jobs');
  const jobs=createEmulatorJobs({
    db:getFirestore(app),snapshotId,actorUid,env,
  });
  const handle=createLocalJobHttpHandler({
    handle:createJobsHandler({
      jobs,secret,previousSecret:env.CRON_SECRET_PREVIOUS,
    }),
    origin,
  });
  const server=createServer(async(req,res)=>{
    let response;
    try{
      if(req.headers.host!=='127.0.0.1:'+port){
        response=errorResponse();
      }else{
        const url=new URL(req.url||'/',origin);
        response=await handle(new Request(url,{
          method:req.method,headers:req.headers,
        }));
      }
    }catch{response=Response.json({error:'job_unavailable'},{
      status:503,headers:{'Cache-Control':'no-store'},
    });}
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  server.requestTimeout=10_000;
  server.headersTimeout=8_000;
  server.maxHeadersCount=32;
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,'127.0.0.1',resolve);
  });
  console.log('Scheduled jobs emulator listening on loopback only.');
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
    server.close(async()=>{await deleteApp(app);process.exit(0);});
    server.closeAllConnections();
  });
}
if(process.argv[1]?.endsWith('serve-jobs-emulator.mjs'))
  main().catch(()=>{
    console.error('Scheduled jobs emulator refused to start.');
    process.exitCode=1;
  });
