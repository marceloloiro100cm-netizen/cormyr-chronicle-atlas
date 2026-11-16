/**
 * Firebase-only mail HTTP boundary. No cookies, cross-origin requests,
 * Supabase fallback, emulator transport or source-controlled credentials.
 * All writes require server flag + independently activated Firebase runtime.
 */
import {CloudMailError} from './cloud-mail-service.mjs';

const MAX_REQUEST_BYTES=24_576;
const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Vary':'Authorization',
};
const reject=(status,code)=>Response.json({error:code},{status,headers});
const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);

async function boundedJson(request){
  if(request.headers.has('content-encoding')||
     request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
    throw new CloudMailError('json_required',415);
  if(!request.body)throw new CloudMailError('invalid_request',400);
  const reader=request.body.getReader();
  let size=0;
  const chunks=[];
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>MAX_REQUEST_BYTES){
      await reader.cancel();
      throw new CloudMailError('body_too_large',413);
    }
    chunks.push(Buffer.from(value));
  }
  let data;
  try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw new CloudMailError('invalid_json',400);}
  if(!isObject(data)||Object.keys(data).length!==2||
     data.action!=='send'||!isObject(data.request))
    throw new CloudMailError('invalid_request',400);
  return data.request;
}

export function createCloudMailHttpHandler({service,enabled=false}){
  return async function handle(request){
    if(!enabled||!service||typeof service.send!=='function')
      return reject(503,'firebase_cloud_mail_disabled');
    if(request.method!=='POST')return reject(405,'method_not_allowed');
    const u=new URL(request.url);
    if(u.search||request.headers.has('cookie')||
       request.headers.get('sec-fetch-site')==='cross-site'||
       (request.headers.has('origin')&&request.headers.get('origin')!==u.origin))
      return reject(403,'access_denied');
    const bearer=request.headers.get('authorization');
    if(!bearer||!/^Bearer [^\s]{10,10000}$/.test(bearer))
      return reject(401,'authentication_required');
    try{
      const data=await boundedJson(request);
      const result=await service.send(bearer.slice(7),data);
      return Response.json({result},{status:200,headers});
    }catch(e){
      if(e instanceof CloudMailError)return reject(e.status,e.code);
      return reject(503,'firebase_cloud_mail_unavailable');
    }
  };
}
