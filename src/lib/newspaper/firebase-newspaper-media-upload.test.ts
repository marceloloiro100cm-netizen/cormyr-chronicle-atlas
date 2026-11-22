import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('@/lib/auth/firebase-pilot-session',()=>({
 firebasePilotAuth:()=>({
  current:()=>({uid:'editor-leonardo'}),
  getToken:async()=>'test-authenticated-editor-firebase-token',
 }),
}));
import {uploadFirebaseNewspaperMedia,uploadFirebaseEngraving} from './firebase-newspaper-media';

const id='00000000-0000-4000-8000-000000000001';
const path='newspaper-media/'+'f'.repeat(64)+'/engraving/'+id+'.png';
const file=()=>new File([Uint8Array.from([137,80,78,71])],'Grandragon.png',{type:'image/png'});
afterEach(()=>vi.unstubAllGlobals());

describe('Jornal native media transport',()=>{
 it('sends a File as binary to the authenticated same-origin API, not Base64 JSON',async()=>{
  const request=vi.fn(async(_url:string,init:RequestInit)=>Response.json(
   {result:{path}},{status:200,headers:{'X-Cormyr-Media-Handler':'v2'}}));
  vi.stubGlobal('fetch',request);
  expect(await uploadFirebaseNewspaperMedia({kind:'engraving',file:file()})).toBe(path);
  const [url,init]=request.mock.calls[0]!;
  expect(url).toBe('/api/firebase-newspaper-media');
  expect(init.body).toBeInstanceOf(File);
  expect(init.headers).toMatchObject({
   'Content-Type':'image/png',
   'X-Cormyr-Media-Action':'upload',
   'X-Cormyr-Media-Kind':'engraving',
  });
  expect((init.headers as Record<string,string>)['Authorization']).toMatch(/^Bearer /);
 });
 it('only confirms a registered engraving when the single transaction returns the exact ID',async()=>{
  const request=vi.fn(async()=>Response.json({result:{path,engravingId:id}},
   {headers:{'X-Cormyr-Media-Handler':'v2'}}));
  vi.stubGlobal('fetch',request);
  expect(await uploadFirebaseEngraving(file(),'Grandragon',id))
   .toEqual({path,engravingId:id});
  const headers=request.mock.calls[0]![1] as never;
  // The request carries a stable retry ID and atomic-catalogue opt-in.
  expect(headers).toBeDefined();
 });
 it('distinguishes a gateway-generated 503 without an API marker from a Firebase denial',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('<html>unavailable</html>',{
   status:503,headers:{'Content-Type':'text/html'}})));
  await expect(uploadFirebaseNewspaperMedia({kind:'engraving',file:file()}))
   .rejects.toThrow('media_503_no_handler');
 });
 it('reports exact safe backend code when the handler answered',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json(
   {error:'media_storage_permission_denied'},{
    status:503,headers:{'X-Cormyr-Media-Handler':'v2'}})));
  await expect(uploadFirebaseNewspaperMedia({kind:'engraving',file:file()}))
   .rejects.toThrow('media_storage_permission_denied');
 });
});
