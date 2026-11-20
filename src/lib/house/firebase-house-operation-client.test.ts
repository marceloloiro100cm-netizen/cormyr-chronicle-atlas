import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';
import {submitFirebaseHouseOperation} from './firebase-house-operation-client';

vi.mock('@/lib/auth/firebase-pilot-session',()=>({
 firebasePilotAuth:vi.fn(),
}));
const key='11111111-1111-4111-8111-111111111111';
const snapshot='a'.repeat(64),uid='player-a';
const crestPath='private/'+snapshot+'/'+uid+'/'+key+'.png';
const request={houseId:'house-a',version:0,key,action:'crest_import' as const,
 args:{base64:'iVBORw0KGgoAAAANSUhEUgAAAAEA',mime:'image/png'},
 explanation:''};

describe('Ficha Firebase: upload privado do brasão antes de alterar a Casa',()=>{
 beforeEach(()=>{
  vi.mocked(firebasePilotAuth).mockReturnValue({
   current:()=>({uid}),getToken:async()=> 'valid-token-123',
  } as never);
 });
 afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
 it('nunca envia base64 à transação Firestore; conserva a chave',async()=>{
  const fetchMock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const url=String(input),body=JSON.parse(String(init?.body));
   if(url==='/api/firebase-private-media'){
    expect(body).toMatchObject({action:'upload',id:key,
     contentType:'image/png',dataBase64:request.args.base64});
    return Response.json({result:{path:crestPath,duplicate:false}});
   }
   expect(url).toBe('/api/firebase-house-operation');
   expect(body).toMatchObject({action:'crest_import',houseId:'house-a',
    key,version:0,args:{path:crestPath}});
   expect(JSON.stringify(body)).not.toContain('base64');
   return Response.json({result:{houseId:'house-a',action:'crest_import',
    version:1,ledgerId:'hash',duplicate:false}});
  });
  vi.stubGlobal('fetch',fetchMock);
  const result=await submitFirebaseHouseOperation(request);
  expect(result.version).toBe(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);
 });
 it('nega a gravação se o Storage não homologou o arquivo',async()=>{
  const fetchMock=vi.fn(async()=>Response.json({error:'private_media_disabled'},
   {status:503}));
  vi.stubGlobal('fetch',fetchMock);
  await expect(submitFirebaseHouseOperation(request))
   .rejects.toThrow(/Storage privado ainda não está homologado/);
  expect(fetchMock).toHaveBeenCalledTimes(1);
 });
 it('não exige upload separado para as outras ações',async()=>{
  const fetchMock=vi.fn(async()=>Response.json({result:{houseId:'house-a',
   action:'domain_edit',version:1,duplicate:false,ledgerId:'hash'}}));
  vi.stubGlobal('fetch',fetchMock);
  await submitFirebaseHouseOperation({...request,action:'domain_edit',
   args:{id:'id',name:'Vale',notes:''}});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0]?.[0]))
   .toBe('/api/firebase-house-operation');
 });
});
