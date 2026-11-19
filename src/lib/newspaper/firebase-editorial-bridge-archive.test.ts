import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const session=vi.hoisted(()=>({uid:'user-a',profile:'jogador',token:'verified-token'}));
vi.mock('../firebase-workspace/state',()=>({
 firebaseWorkspaceClient:()=>({}),
}));
vi.mock('../firebase-workspace/client',()=>({
 workspaceRequest:async()=>({profile:session.profile}),
}));
vi.mock('../auth/firebase-pilot-session',()=>({
 firebasePilotAuth:()=>({
  current:()=>({uid:session.uid}),
  getToken:async()=>session.token,
 }),
}));

import {loadFirebaseNewspaperEditions,originalNewspaperEdition}
 from './firebase-editorial-bridge';

const cloudId='cloud-'+'a'.repeat(64);
const cloud={
 id:cloudId,editionNo:12,title:'A Folha Sem Selo',subtitle:'Edição publicada',
 blocks:[{id:'article-1',type:'article' as const,text:'Crônica',span:12,height:190}],
 version:2,state:'published' as const,campaignDate:'1522-01-01',
 publishedAt:'2026-11-19T14:00:00Z',template:'gazeta' as const,
 font_style:'gotica' as const,
};
const history={...originalNewspaperEdition(cloud),id:'historical-edition',edition_no:5};
const unavailable=(status:number)=>({ok:false,status} as Response);
const success=(result:unknown)=>({ok:true,json:async()=>({result})} as Response);
beforeEach(()=>{
 session.uid='user-a';session.profile='jogador';session.token='verified-token';
 vi.stubGlobal('fetch',vi.fn());
});
afterEach(()=>vi.unstubAllGlobals());

describe('Historical Jornal is gated by the approved Cloud reader stage',()=>{
 it('never bypasses unapproved migration stages when Cloud returns 503',async()=>{
  vi.mocked(fetch).mockResolvedValue(unavailable(503));
  await expect(loadFirebaseNewspaperEditions([history]))
   .rejects.toThrow('Acervo publicado indisponível');
  expect(fetch).toHaveBeenCalledWith('/api/firebase-cloud-read',
   expect.objectContaining({credentials:'omit',redirect:'error',
    headers:expect.objectContaining({Authorization:'Bearer verified-token'})}));
 });
 it('preserves the editor archive when editorial writes are pending but Cloud reader is approved',async()=>{
  session.profile='editor';
  vi.mocked(fetch).mockResolvedValueOnce(unavailable(503))
   .mockResolvedValueOnce(success({items:[]}));
  expect(await loadFirebaseNewspaperEditions([history])).toEqual([history]);
  expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('never treats a 403 rejection as archive approval',async()=>{
  vi.mocked(fetch).mockResolvedValue(unavailable(403));
  await expect(loadFirebaseNewspaperEditions([history]))
   .rejects.toThrow('Acervo publicado indisponível');
 });
 it('does not fabricate archive availability when Cloud is down',async()=>{
  vi.mocked(fetch).mockResolvedValue(unavailable(503));
  await expect(loadFirebaseNewspaperEditions([]))
   .rejects.toThrow('Acervo publicado indisponível');
 });
 it('excludes unreviewed imported editions from player-facing Jornal',async()=>{
  vi.mocked(fetch).mockResolvedValue(success({items:[]}));
  expect(await loadFirebaseNewspaperEditions([history])).toEqual([]);
 });
 it('merges only reviewed history and genuine published Cloud editions for players',async()=>{
  vi.mocked(fetch)
   .mockResolvedValueOnce(success({items:[
    {id:'historical-edition',editionNo:5},{id:cloudId,editionNo:12},
   ]}))
   .mockResolvedValueOnce(success(cloud));
  const result=await loadFirebaseNewspaperEditions([history]);
  expect(result.map(x=>x.id)).toEqual([cloudId,'historical-edition']);
  expect(result[0]).toMatchObject({version:2,state:'published',subtitle:'Edição publicada'});
 });
});
