/** Explicit local-only entrypoint; never imported by the production app. */
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {assertLocalMailEnvironment,createEmulatorMailHttpHandler,mailResponse} from './mail-http-handler.mjs';

async function main(){
  assertLocalMailEnvironment(process.env);
  const snapshotId=process.env.CORMYR_MAIL_SNAPSHOT;
  if(!/^[a-f0-9]{64}$/.test(snapshotId||''))throw Error('Missing snapshot');
  const port=Number(process.env.CORMYR_MAIL_PORT||8787);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
  const origin=`http://127.0.0.1:${port}`;
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const {getAuth}=await import('firebase-admin/auth');
  const app=initializeApp({projectId:'demo-cormyr-migration'},'mail-http-local');
  const handle=createEmulatorMailHttpHandler({
    db:getFirestore(app),auth:getAuth(app),snapshotId,origin,
  });
  const server=createServer(async(req,res)=>{
    let response;
    try{
      if(req.headers.host!==`127.0.0.1:${port}`||!req.url?.startsWith('/')){
        response=mailResponse(403,{error:'access_denied'});
      }else{
        const request=new Request(new URL(req.url,origin),{
          method:req.method,headers:req.headers,
          ...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'}),
        });
        response=await handle(request);
      }
    }catch{response=mailResponse(500,{error:'internal_error'});}
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  server.maxHeadersCount=32;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  console.log(`Local mail API ready at ${origin}; emulator-only, no deployment.`);
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
    server.close(async()=>{await deleteApp(app);process.exit(0);});
    server.closeAllConnections();
  });
}
main().catch(()=>{console.error('Local mail API could not start. Check emulator configuration.');process.exitCode=1;});
