import {beforeEach,describe,it,expect,vi} from 'vitest';
const session=vi.hoisted(()=>({uid:'a',token:vi.fn()}));
vi.mock('../auth/firebase-pilot-session',()=>({firebasePilotAuth:()=>({current:()=>({uid:session.uid}),getToken:session.token})}));
import {workspaceRequest} from './client';
beforeEach(()=>{session.uid='a';session.token.mockReset().mockResolvedValue('verified-token');vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({result:'source'})}));});
describe('Firebase identity boundary',()=>{
 it('sends only the Firebase bearer without cookies or redirects',async()=>{
  expect(await workspaceRequest({kind:'auth'})).toBe('source');
  expect(fetch).toHaveBeenCalledWith('/api/firebase-workspace',expect.objectContaining({credentials:'omit',redirect:'error',cache:'no-store',headers:expect.objectContaining({Authorization:'Bearer verified-token'})}));
 });
 it('allows the first request after a reload to hydrate its UID from the Firebase refresh',async()=>{
  session.uid='';
  session.token.mockImplementation(async()=>{session.uid='a';return 'verified-token';});
  expect(await workspaceRequest({kind:'auth'})).toBe('source');
  expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('rejects a changed identity while refreshing the token before requesting data',async()=>{
  session.token.mockImplementation(async()=>{session.uid='b';return 'old-token';});
  await expect(workspaceRequest({kind:'auth'})).rejects.toThrow('Sessão alterada');
  expect(fetch).not.toHaveBeenCalled();
 });
 it('discards private responses when identity changes while decoding the body',async()=>{
  vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>{session.uid='b';return {result:'private'};}} as Response);
  await expect(workspaceRequest({kind:'auth'})).rejects.toThrow('Sessão alterada');
 });
 it('explains stale campaign date and unsupported advanced sending without echoing server text',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce({ok:false,status:409,
   json:async()=>({error:'private-user-uid'})} as Response);
  await expect(workspaceRequest({kind:'rpc',name:'dated_mail_action'}))
   .rejects.toThrow('A data ou o registro mudou');
  vi.mocked(fetch).mockResolvedValueOnce({ok:false,status:501,
   json:async()=>({error:'secret-house-name'})} as Response);
  await expect(workspaceRequest({kind:'rpc',name:'dated_mail_action'}))
   .rejects.toThrow('múltiplos destinatários');
 });
 it('reports unsupported writes without synthetic success',async()=>{
  vi.mocked(fetch).mockResolvedValue({ok:false,status:501} as Response);
  await expect(workspaceRequest({kind:'rpc',name:'write'})).rejects.toThrow('ainda não está disponível');
 });
 it('agrupa consultas simultâneas num único pedido e entrega cada resultado ou erro',async()=>{
  vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({result:[
   {ok:true,result:'um'},{ok:false,status:403,code:'access_denied'}]})} as Response);
  const [a,b]=await Promise.allSettled([workspaceRequest({kind:'auth'}),workspaceRequest({kind:'rpc',name:'x'})]);
  expect(fetch).toHaveBeenCalledTimes(1);
  const body=JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]!.body));
  expect(body.kind).toBe('batch');expect(body.items).toHaveLength(2);
  expect(a).toEqual({status:'fulfilled',value:'um'});
  expect(b.status).toBe('rejected');
 });
});
