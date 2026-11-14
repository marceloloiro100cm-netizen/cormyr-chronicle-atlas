/**
 * Same-origin relay to a fixed, loopback-only Firebase Emulator bridge.
 * Never forward requests to caller-selected URLs or enable in production.
 */
export interface FirebaseDomainProxyConfig {
  enabled: boolean;
  production: boolean;
  projectId: string | undefined;
  firestoreEmulatorHost: string | undefined;
  authEmulatorHost: string | undefined;
  port: string | undefined;
  fetcher?: typeof fetch;
}

const LOOPBACK=/^(?:127\.0\.0\.1|localhost|\[::1\]):(?:[1-9][0-9]{1,4})$/;
const response=(status:number,error:string)=>Response.json({error},{status,headers:{
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Vary':'Authorization',
}});
export function localFirebaseProxyPort(c: FirebaseDomainProxyConfig): number | null {
  const port=Number(c.port??'8788');
  return c.enabled&&!c.production&&c.projectId==='demo-cormyr-migration'&&
    LOOPBACK.test(c.firestoreEmulatorHost??'')&&
    LOOPBACK.test(c.authEmulatorHost??'')&&
    Number.isInteger(port)&&port>=1024&&port<=65535 ? port:null;
}

export async function proxyFirebaseDomainRequest(
  request:Request,
  config:FirebaseDomainProxyConfig,
  mode:'domain'|'identity'='domain',
):Promise<Response>{
  const port=localFirebaseProxyPort(config);
  if(port===null)return response(503,'disabled');
  const u=new URL(request.url);
  if(u.search||request.headers.has('cookie')||
     request.headers.get('sec-fetch-site')==='cross-site'||
     (request.headers.has('origin')&&request.headers.get('origin')!==u.origin))
    return response(403,'access_denied');
  const header=request.headers.get('authorization');
  if(!header||!/^Bearer [^\s]{1,10000}$/.test(header))
    return response(401,'authentication_required');
  if(mode==='domain'&&request.method!=='POST')return response(405,'method_not_allowed');
  if(mode==='identity'&&request.method!=='GET')return response(405,'method_not_allowed');
  if(mode==='domain'&&request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
    return response(415,'json_required');
  if(request.headers.has('content-encoding'))return response(415,'unsupported_encoding');
  let body:string|undefined;
  if(mode==='domain'){
    // Bound memory use before submitting to the local bridge.
    const reader=request.body?.getReader();
    if(!reader)return response(400,'invalid_request');
    const parts:Uint8Array[]=[];let size=0;
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>65_536){await reader.cancel();return response(413,'body_too_large');}
      parts.push(value);
    }
    body=new TextDecoder().decode(Buffer.concat(parts));
  }
  try{
    const res=await (config.fetcher??fetch)(
      `http://127.0.0.1:${port}/api/domain${mode==='identity'?'/session':''}`,{
        method:mode==='domain'?'POST':'GET',
        redirect:'error',
        headers:{
          Authorization:header,
          ...(mode==='domain'?{'Content-Type':'application/json'}:{}),
        },
        ...(body===undefined?{}:{body}),
        signal:AbortSignal.timeout(10_000),
      },
    );
    if(!res.headers.get('content-type')?.startsWith('application/json'))
      return response(503,'invalid_backend_response');
    const raw=await res.text();
    if(raw.length>1_000_000)return response(503,'invalid_backend_response');
    const decoded:unknown=JSON.parse(raw);
    if(!decoded||typeof decoded!=='object'||Array.isArray(decoded))
      return response(503,'invalid_backend_response');
    const status=[200,400,401,403,404,409,413,415,422,503].includes(res.status)
      ? res.status:503;
    if(mode==='identity'){
      return res.ok&&(decoded as {authenticated?:unknown}).authenticated===true
        ? Response.json({authenticated:true},{headers:{
          'Cache-Control':'private, no-store','Vary':'Authorization',
        }})
        : response(status===200?503:status,'authentication_required');
    }
    return Response.json(decoded,{status,headers:{
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff',
      'Vary':'Authorization',
    }});
  }catch{return response(503,'service_unavailable');}
}
