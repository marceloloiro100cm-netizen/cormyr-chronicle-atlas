/**
 * Protected GET-only source diagnostic. Does not sign in as a user, mint a
 * token, or change any account. The internal Auth facade selects a stored
 * identity only to exercise the server projection; this is NOT an HTTP
 * authentication test. Output contains fixed categories/counts/timings only.
 */
import {initializeApp,applicationDefault,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {listCurrentAccountAccess} from './operational-account-access.mjs';
let app,temporary;
try{
 if(process.env.GOOGLE_CLOUD_PROJECT!=='cormyr'||process.env.FIRESTORE_EMULATOR_HOST||
    process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('invalid_environment');
 const credential=applicationDefault();
 app=initializeApp({projectId:'cormyr',credential},'workspace-login-diagnostic');
 const db=getFirestore(app),auth=getAuth(app);
 const imports=await db.collection('campaignWorkspaceImports').limit(2).get();
 if(imports.size!==1)throw Error('snapshot_ambiguous');
 const snapshotId=imports.docs[0].id;
 if(!/^[a-f0-9]{64}$/.test(snapshotId))throw Error('snapshot_invalid');
 try{
  const {access_token}=await credential.getAccessToken();
  const response=await fetch('https://identitytoolkit.googleapis.com/admin/v2/projects/cormyr/defaultSupportedIdpConfigs/google.com',
   {headers:{Authorization:'Bearer '+access_token}});
  const config=response.ok?await response.json():null;
  console.log(JSON.stringify({googleProvider:{status:response.status,enabled:config?.enabled===true,configured:typeof config?.clientId==='string'&&config.clientId.length>0}}));
 }catch{console.log(JSON.stringify({googleProvider:{status:'unavailable'}}));}
 temporary=await mkdtemp(join(resolve('node_modules'),'.cormyr-login-'));
 const output=join(temporary,'workspace.mjs');
 await build({entryPoints:[resolve('src/lib/firebase-workspace/service.ts')],
  bundle:true,platform:'node',format:'esm',target:'node24',outfile:output,
  logLevel:'silent',packages:'external'});
 const {createWorkspaceService}=await import(pathToFileURL(output).href);
 const accounts=await listCurrentAccountAccess(db,snapshotId);
 const tables=['campaign_houses','campaign_players','house_memberships','campaign_records',
  'campaign_letters','letter_replies','letter_receipts','letter_rounds','house_catalog','campaign_access_profiles'];
 for(const profile of ['narrador','jogador','editor']){
  const account=accounts.find(a=>a.profile===profile&&a.active===true&&a.requirePasswordChange===false);
  if(!account){console.log(JSON.stringify({profile,status:'no_active_account'}));continue;}
  const internal='internal-source-diagnostic';
  const service=createWorkspaceService({db,snapshotId,cacheImportedTables:true,
   auth:{verifyIdToken:async token=>{
    if(token!==internal)throw Error('invalid_internal_probe');
    return {uid:account.userId};
   },getUser:uid=>auth.getUser(uid)}});
  for(const pass of ['cold','warm']){
   const start=performance.now();
   try{
    const result=await service.execute(internal,{kind:'batch',items:tables.map(table=>({
     kind:'query',table,steps:[{op:'select',args:['id',{count:'exact',head:true}]}],
    }))});
    console.log(JSON.stringify({profile,pass,durationMs:Math.round(performance.now()-start),
     tables:result.map((r,i)=>({table:tables[i],ok:r.ok===true,
      ...(r.ok?{count:r.result.count}:{status:r.status,code:/^[a-z_]{3,60}$/.test(r.code)?r.code:'unknown'})}))}));
   }catch(e){
    console.log(JSON.stringify({profile,pass,durationMs:Math.round(performance.now()-start),
     code:/^[a-z_]{3,60}$/.test(e?.code??'')?e.code:'source_diagnostic_failed'}));
   }
  }
 }
}catch{console.error('workspace_login_diagnostic_failed');process.exitCode=2;}
finally{
 if(temporary)await rm(temporary,{recursive:true,force:true}).catch(()=>{});
 if(app)await deleteApp(app).catch(()=>{});
}
