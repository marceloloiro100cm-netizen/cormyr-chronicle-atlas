import {describe,it,expect,vi} from 'vitest';
import {callFirebaseDomain,firebaseDomainPreviewEnabled,MIGRATED_DOMAINS} from './firebase-domain-client';
describe('Firebase domain client',()=>{
 it('is opt-in and isolated from the active Supabase app',()=>{
  expect(firebaseDomainPreviewEnabled(undefined,true)).toBe(false);
  expect(firebaseDomainPreviewEnabled('true',false)).toBe(false);
  expect(firebaseDomainPreviewEnabled('true',true)).toBe(true);
  expect(MIGRATED_DOMAINS).toContain('newspaper');
  expect(MIGRATED_DOMAINS).toContain('spyMissions');
  expect(MIGRATED_DOMAINS).toContain('battle');
 });
 it('provides the selected Firebase credential only to its own API endpoint',async()=>{
  const fetcher=vi.fn(async()=>new Response('{"result":{"year":1522}}',{
    headers:{'content-type':'application/json'}}));
  const r=await callFirebaseDomain<{year:number}>(
    {domain:'time',action:'getCalendar',args:[]},
    {getToken:async()=> 'firebase-token',fetcher:fetcher as never},
  );
  expect(r.year).toBe(1522);
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/firebase-domain');
 });
 it('does not silently fall back to Supabase when unavailable',async()=>{
  const fetcher=vi.fn();
  await expect(callFirebaseDomain({domain:'records',action:'listRecords',args:[]},{
    getToken:async()=>null,fetcher:fetcher as never,
  })).rejects.toThrow(/Sessão Firebase/);
  expect(fetcher).not.toHaveBeenCalled();
 });
});
