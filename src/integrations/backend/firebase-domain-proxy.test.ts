import {describe,it,expect,vi} from 'vitest';
import {
  localFirebaseProxyPort,proxyFirebaseDomainRequest,
  type FirebaseDomainProxyConfig,
} from './firebase-domain-proxy.server';
const base:FirebaseDomainProxyConfig={
  enabled:true,production:false,projectId:'demo-cormyr-migration',
  firestoreEmulatorHost:'127.0.0.1:8080',authEmulatorHost:'127.0.0.1:9099',
  port:'8788',
};
const request=(headers:Record<string,string>={})=>new Request(
  'http://localhost:5173/api/firebase-domain',{
    method:'POST',
    headers:{authorization:'Bearer emutoken','content-type':'application/json',...headers},
    body:JSON.stringify({domain:'time',action:'getCalendar',args:[]}),
  },
);
describe('local emulator relay - fail closed',()=>{
 it('rejects production, non-demo projects and non-loopback hosts',()=>{
  expect(localFirebaseProxyPort(base)).toBe(8788);
  expect(localFirebaseProxyPort({...base,production:true})).toBeNull();
  expect(localFirebaseProxyPort({...base,enabled:false})).toBeNull();
  expect(localFirebaseProxyPort({...base,projectId:'cormyr'})).toBeNull();
  expect(localFirebaseProxyPort({...base,authEmulatorHost:'example.com:9099'})).toBeNull();
  expect(localFirebaseProxyPort({...base,port:'99999'})).toBeNull();
 });
 it('forwards only a bearer token and bounded payload to loopback',async()=>{
  const fetcher=vi.fn(async(_url:string,init:RequestInit)=>new Response(
    JSON.stringify({result:{year:1522}}),{status:200,headers:{'content-type':'application/json'}}));
  const out=await proxyFirebaseDomainRequest(request(),{...base,fetcher:fetcher as never});
  expect(out.status).toBe(200);
  expect(await out.json()).toEqual({result:{year:1522}});
  expect(fetcher.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8788/api/domain');
  const init=fetcher.mock.calls[0]?.[1] as RequestInit;
  expect(init.credentials).toBeUndefined();
  expect(init.headers).toEqual({Authorization:'Bearer emutoken','Content-Type':'application/json'});
 });
 it('rejects other-origin requests, cookie-bearing requests and missing bearer',async()=>{
  expect((await proxyFirebaseDomainRequest(request({origin:'https://evil.test'}),base)).status).toBe(403);
  expect((await proxyFirebaseDomainRequest(request({cookie:'session=secret'}),base)).status).toBe(403);
  expect((await proxyFirebaseDomainRequest(request({authorization:''}),base)).status).toBe(401);
 });
 it('will not trust an HTML page or redirect as a Firebase result',async()=>{
  const html=vi.fn(async()=>new Response('<html></html>',{status:200,headers:{'content-type':'text/html'}}));
  const out=await proxyFirebaseDomainRequest(request(),{...base,fetcher:html as never});
  expect(out.status).toBe(503);
 });
 it('verifies local emulator identity without leaking account data',async()=>{
  const fetcher=vi.fn(async()=>new Response('{"authenticated":true}',{
    headers:{'content-type':'application/json'}}));
  const q=new Request('http://localhost:5173/api/firebase-auth-verify',{
    headers:{authorization:'Bearer emutoken'},
  });
  const out=await proxyFirebaseDomainRequest(q,{...base,fetcher:fetcher as never},'identity');
  expect(out.status).toBe(200);
  expect(await out.json()).toEqual({authenticated:true});
 });
});
