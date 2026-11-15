/** Loopback-only migration service; NEVER run this as a cloud entrypoint. */
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {createEmulatorDomainHttpHandler,assertLocalDomainEnvironment} from './domain-http-handler.mjs';
import {createEmulatorHouseViewService} from './house-view-service.mjs';
import {createEmulatorNobleHouseService} from './noble-house-service.mjs';
import {createEmulatorRecordService} from './record-service.mjs';
import {createEmulatorCharacterService} from './character-service.mjs';
import {createEmulatorScheduleService} from './schedule-service.mjs';
import {createEmulatorTimeService} from './time-service.mjs';
import {createEmulatorUnifiedMailbox} from './mail-unified-service.mjs';
import {createEmulatorMailCommands} from './mail-command-service.mjs';
import {createEmulatorNewspaperService} from './newspaper-service.mjs';
import {createEmulatorSpyAgentsService} from './spy-agents-service.mjs';
import {createEmulatorSpyMissionsService} from './spy-missions-service.mjs';
import {createEmulatorSpyIntelService} from './spy-intel-service.mjs';
import {createEmulatorBattleService} from './battle-service.mjs';
import {createEmulatorPrivateGmService} from './private-gm-service.mjs';
import {createEmulatorDriveService} from './drive-service.mjs';

async function main(){
  const env=process.env;
  const snapshotId=env.CORMYR_DOMAIN_SNAPSHOT;
  if(!/^[a-f0-9]{64}$/.test(snapshotId||''))throw Error('Valid private snapshot hash required');
  const port=Number(env.CORMYR_DOMAIN_PORT||8788);
  if(!Number.isInteger(port)||port<1024||port>65535)
    throw Error('Invalid domain preview port');
  const origin=`http://127.0.0.1:${port}`;
  assertLocalDomainEnvironment(env,origin);
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getAuth}=await import('firebase-admin/auth');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:'demo-cormyr-migration'},'domain-local');
  const auth=getAuth(app),db=getFirestore(app);
  const ctx={db,auth,snapshotId,env};
  const view=createEmulatorHouseViewService(ctx);
  const noble=createEmulatorNobleHouseService(ctx);
  const services={
    access:view,
    houses:{...view,commit:noble.commit},
    records:createEmulatorRecordService(ctx),
    characters:createEmulatorCharacterService(ctx),
    schedule:createEmulatorScheduleService(ctx),
    time:createEmulatorTimeService(ctx),
    mailbox:createEmulatorUnifiedMailbox(ctx),
    mailCommands:createEmulatorMailCommands(ctx),
    newspaper:createEmulatorNewspaperService(ctx),
    spyAgents:createEmulatorSpyAgentsService(ctx),
    spyMissions:createEmulatorSpyMissionsService(ctx),
    spyIntel:createEmulatorSpyIntelService(ctx),
    battle:createEmulatorBattleService(ctx),
    privateGm:createEmulatorPrivateGmService(ctx),
    drive:createEmulatorDriveService(ctx),
  };
  const handle=createEmulatorDomainHttpHandler({services,auth,env,origin});
  const server=createServer(async(req,res)=>{
    let response;
    try{
      if(req.headers.host!==`127.0.0.1:${port}`||!req.url?.startsWith('/')){
        response=Response.json({error:'access_denied'},{status:403});
      }else{
        const request=new Request(new URL(req.url,origin),{
          method:req.method,headers:req.headers,
          ...(['GET','HEAD'].includes(req.method)?{}:{
            body:Readable.toWeb(req),duplex:'half',
          }),
        });
        response=await handle(request);
      }
    }catch{
      response=Response.json({error:'service_unavailable'},{status:503});
    }
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  server.requestTimeout=15_000;
  server.headersTimeout=10_000;
  server.maxHeadersCount=32;
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,'127.0.0.1',resolve);
  });
  console.log(`Firebase domain emulator bridge listening only on ${origin}`);
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
    server.close(async()=>{await deleteApp(app);process.exit(0);});
    server.closeAllConnections();
  });
}
main().catch(()=>{
  console.error('Firebase domain emulator bridge could not start.');
  process.exitCode=1;
});
