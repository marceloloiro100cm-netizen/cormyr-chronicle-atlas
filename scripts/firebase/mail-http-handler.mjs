/** Backend-only JSON boundary for the isolated Firebase mail preview. */
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {createEmulatorUnifiedMailbox} from './mail-unified-service.mjs';
import {createEmulatorMailCommands} from './mail-command-service.mjs';

export const MAX_MAIL_BODY=256*1024;
const routes={
  login:['identity','login',['email','password']],
  session:['commands','session',[]],
  list:['mailbox','list',['pageSize','cursor','folder','source','query']],
  thread:['mailbox','getThread',['letterId']],
  read:['mailbox','markRead',['letterId']],
  send:['commands','send',['requestKey','originHouseId','recipients','subject','content','campaignDate','asDraft','deliveryRound']],
  reply:['commands','reply',['requestKey','letterId','replyToId','content','campaignDate','asDraft']],
  'edit-draft':['commands','editDraft',['id','kind','version','subject','content']],
  'schedule-draft':['commands','scheduleDraft',['id','kind','version','deliveryRound']],
  trash:['commands','changeTrash',['id','kind','version','restore']],
  receipts:['commands','listReceipts',['letterId']],
  note:['commands','note',['letterId','text','requestKey']],
  initialize:['commands','initialize',[]],
  'open-round':['commands','openRound',['number']],
  'close-round':['commands','closeRound',['number']],
};
const invalid=new Set([
  'Invalid mail recipient','Invalid mail request','Duplicate mail recipients',
  'Invalid origin House','Invalid delivery round','Invalid reply request',
  'Invalid draft update','Invalid scheduling request','Invalid trash operation',
  'Invalid private note','Invalid letter id','Invalid letter ID',
  'Invalid page size','Invalid unified cursor','Invalid unified filter',
]);
const conflicts=new Set([
  'Mail version conflict','No open mail round',
  'Idempotency key already used for another message',
  'Idempotency key already used for another reply',
]);
export function mailResponse(status,body){
  return Response.json(body,{status,headers:{
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
  }});
}
export function assertLocalMailEnvironment(env){
  assertEmulatorOnly(env,'demo-cormyr-migration');
  if(!/^(127\.0\.0\.1|localhost|\[::1\]):([1-9][0-9]{1,4})$/.test(env.FIREBASE_AUTH_EMULATOR_HOST||''))
    throw Error('Local Auth emulator is mandatory');
}
export function createEmulatorMailHttpHandler({db,auth,snapshotId,origin,env=process.env}){
  assertLocalMailEnvironment(env);
  const base=new URL(origin);
  if(base.protocol!=='http:'||base.hostname!=='127.0.0.1'||base.origin!==origin)
    throw Error('Explicit loopback HTTP origin is mandatory');
  const services={
    mailbox:createEmulatorUnifiedMailbox({db,auth,snapshotId,env}),
    commands:createEmulatorMailCommands({db,auth,snapshotId,env}),
  };
  return async function handle(request){
    const failure=(status,code)=>mailResponse(status,{error:code});
    try{
      const url=new URL(request.url);
      // Reject DNS rebinding, cross-origin browser calls, cookies as identity,
      // URL tokens and client-selected snapshots before invoking any service.
      if(url.origin!==origin||
         (request.headers.has('origin')&&request.headers.get('origin')!==origin)||
         request.headers.get('sec-fetch-site')==='cross-site')
        return failure(403,'access_denied');
      if(request.method!=='POST')return failure(405,'method_not_allowed');
      if(url.search)return failure(400,'invalid_request');
      const action=url.pathname.slice('/api/firebase-mail/'.length);
      if(!url.pathname.startsWith('/api/firebase-mail/')||!Object.hasOwn(routes,action))
        return failure(404,'not_found');
      const bearer=request.headers.get('authorization');
      if(action!=='login'&&(!bearer||!/^Bearer [^\s]{1,10000}$/.test(bearer)))
        return failure(401,'authentication_required');
      if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
        return failure(415,'json_required');
      if(request.headers.has('content-encoding'))return failure(415,'unsupported_encoding');
      const reader=request.body?.getReader();
      const chunks=[];let size=0;
      if(reader){
        while(true){
          const {done,value}=await reader.read();if(done)break;
          size+=value.byteLength;
          if(size>MAX_MAIL_BODY){await reader.cancel();return failure(413,'body_too_large');}
          chunks.push(Buffer.from(value));
        }
      }
      let body;
      try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
      catch{return failure(400,'invalid_json');}
      const [service,method,allowed]=routes[action];
      if(!body||typeof body!=='object'||Array.isArray(body)||
         Object.keys(body).some(k=>!allowed.includes(k)))
        return failure(400,'invalid_request');
      if(action==='login'){
        if(typeof body.email!=='string'||!body.email.trim()||body.email.length>254||
           typeof body.password!=='string'||!body.password||body.password.length>4096)
          return failure(400,'invalid_request');
        // Fixed, startup-validated loopback destination. No account creation,
        // credential logging, real API key or refresh-token persistence.
        const login=await fetch(`http://${env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,{
          method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({email:body.email.trim(),password:body.password,returnSecureToken:true}),
          signal:AbortSignal.timeout(10000),redirect:'error',
        });
        if(!login.ok)return failure(401,'login_failed');
        const result=await login.json();
        if(typeof result.idToken!=='string'||!result.idToken)return failure(500,'internal_error');
        // Check application access before handing a token to the browser.
        const session=await services.commands.session({idToken:result.idToken});
        return mailResponse(200,{data:{idToken:result.idToken,expiresIn:Number(result.expiresIn),session},sourceMode:'emulator-only'});
      }
      const result=await services[service][method]({...body,idToken:bearer.slice(7)});
      if(result===null)return failure(404,'not_found');
      return mailResponse(200,{data:result,sourceMode:'emulator-only'});
    }catch(error){
      if(['MailCommandDenied','UnifiedMailboxDenied','InboxDenied'].includes(error?.name))
        return failure(403,'access_denied');
      if(invalid.has(error?.message))return failure(400,'invalid_request');
      if(conflicts.has(error?.message))return failure(409,'conflict');
      // Never return backend exceptions, UIDs, tokens or private content.
      return failure(500,'internal_error');
    }
  };
}
