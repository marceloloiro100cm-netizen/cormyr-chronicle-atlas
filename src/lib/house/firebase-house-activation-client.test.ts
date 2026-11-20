import {describe,it,expect,vi} from 'vitest';
import {
 activateImportedHouses,HouseActivationClientError,houseActivationMessage,
} from './firebase-house-activation-client';

const reply=(result:unknown,status=200)=>Response.json(
 status===200?{result}:{error:result},{status});
const fakeResponse=(fn:(body:Record<string,unknown>)=>Response)=>{
 const requests:Record<string,unknown>[]=[];
 const fetcher=vi.fn(async (_url:string,opts?:RequestInit)=>{
  expect(_url).toBe('/api/firebase-house-activation');
  expect(opts?.method).toBe('POST');
  expect(opts?.credentials).toBe('omit');
  expect(opts?.cache).toBe('no-store');
  expect(opts?.redirect).toBe('error');
  expect((opts?.headers as Record<string,string>)['Authorization']).toBe('Bearer valid-narrator-token');
  const body=JSON.parse(String(opts?.body)) as Record<string,unknown>;
  requests.push(body);
  return fn(body);
 });
 return {fetcher:fetcher as unknown as typeof fetch,requests};
};
describe('Narrator House batch client: one transaction per House',()=>{
 it('lists Houses then inspects and activates individually, reporting review failures',async()=>{
  const f=fakeResponse(p=>{
   if(p['action']==='list')return reply({houseIds:['house-a','house-b','house-c']});
   if(p['action']==='inspect'&&p['houseId']==='house-a')
    return reply({houseId:'house-a',status:'ready_for_operator_review',
     preview:{sourceSheetVersion:3},sourceHash:'a'.repeat(64)});
   if(p['action']==='activate'&&p['houseId']==='house-a')
    return reply({houseId:'house-a',status:'activated'});
   if(p['action']==='inspect'&&p['houseId']==='house-b')
    return reply({houseId:'house-b',status:'already_initialized'});
   if(p['action']==='inspect'&&p['houseId']==='house-c')
    return reply({houseId:'house-c',status:'calendar_mismatch'});
   throw Error('unexpected request');
  });
  const ticks:number[]=[];
  const r=await activateImportedHouses({token:'valid-narrator-token',
   fetcher:f.fetcher,onProgress:p=>ticks.push(p.processed)});
  expect(r).toMatchObject({total:3,processed:3,
   activated:1,alreadyInitialized:1,needsReview:1});
  expect(r.results).toEqual([
   {houseId:'house-a',status:'activated'},
   {houseId:'house-b',status:'already_initialized'},
   {houseId:'house-c',status:'calendar_mismatch'},
  ]);
  expect(ticks).toEqual([1,2,3]);
  expect(f.requests.map(x=>x['action'])).toEqual(['list','inspect','activate','inspect','inspect']);
  expect(f.requests[2]).toMatchObject({
   action:'activate',houseId:'house-a',
   expectedSourceVersion:3,expectedSourceHash:'a'.repeat(64),
  });
  expect(f.requests.every(x=>x['action']!=='activateAll')).toBe(true);
 });
 it('decodes the precise safe server error and avoids starting House writes',async()=>{
  const f=fakeResponse(()=>reply('house_activation_disabled',503));
  await expect(activateImportedHouses({token:'valid-narrator-token',
   fetcher:f.fetcher})).rejects.toMatchObject({
    code:'house_activation_disabled',status:503,
   });
  expect(f.requests).toEqual([{action:'list'}]);
  expect(houseActivationMessage('house_activation_disabled'))
   .toContain('desabilitada');
 });
 it('reports partial success when service goes down after one House',async()=>{
  const f=fakeResponse(p=>{
   if(p['action']==='list')return reply({houseIds:['house-a','house-b']});
   if(p['houseId']==='house-a'&&p['action']==='inspect')
    return reply({houseId:'house-a',status:'ready_for_operator_review',
     preview:{sourceSheetVersion:4},sourceHash:'b'.repeat(64)});
   if(p['houseId']==='house-a'&&p['action']==='activate')
    return reply({houseId:'house-a',status:'activated'});
   return reply('house_catalog_unavailable',503);
  });
  let failure:unknown;
  try{await activateImportedHouses({token:'valid-narrator-token',fetcher:f.fetcher});}
  catch(e){failure=e;}
  expect(failure).toBeInstanceOf(HouseActivationClientError);
  expect(failure).toMatchObject({code:'house_catalog_unavailable',status:503,
   progress:{total:2,processed:1,activated:1,alreadyInitialized:0,
    results:[{houseId:'house-a',status:'activated'}]}});
 });
 it('rejects untrusted responses and invalid catalog IDs without activating anything',async()=>{
  const f=fakeResponse(()=>reply({houseIds:['house-a','house-a']}));
  await expect(activateImportedHouses({token:'valid-narrator-token',
    fetcher:f.fetcher})).rejects.toMatchObject({
     code:'house_activation_invalid_response',
    });
  expect(f.requests).toEqual([{action:'list'}]);
 });
 it('stops on expired session with no private catalogue request',async()=>{
  const f=fakeResponse(()=>{throw Error('should not fetch');});
  await expect(activateImportedHouses({token:'invalid',fetcher:f.fetcher}))
   .rejects.toMatchObject({code:'authentication_required',status:401});
  expect(f.requests).toHaveLength(0);
 });
});
