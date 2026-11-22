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

 it('recovers the two public issues in the Editor-Chefe archive when imported projection is empty',async()=>{
  session.profile='editor';
  const id1='11111111-1111-4111-8111-111111111111';
  const id2='22222222-2222-4222-8222-222222222222';
  const detail=(id:string,editionNo:number)=>({
   id,editionNo,campaignDate:'1522-11-20',title:'A Folha Sem Selo',
   subtitle:'A verdade bem servida',state:'published',publishedAt:'2026-11-20T00:00:00Z',
   blocks:[{id:'headline',type:'headline',text:'A edição original',span:12,height:110}],
   template:'gazeta',font_style:'gotica',version:2,
  });
  vi.mocked(fetch)
   .mockResolvedValueOnce(success({canPublish:false}))
   .mockResolvedValueOnce(success({items:[{id:id1,editionNo:1},{id:id2,editionNo:2}]}))
   .mockResolvedValueOnce({ok:true,json:async()=>detail(id1,1)} as Response)
   .mockResolvedValueOnce({ok:true,json:async()=>detail(id2,2)} as Response);
  const result=await loadFirebaseNewspaperEditions([]);
  expect(result.map(x=>x.edition_no)).toEqual([2,1]);
  expect(result.every(x=>x.state==='published')).toBe(true);
  expect(result[0]).toMatchObject({id:id2,template:'gazeta',font_style:'gotica'});
  expect(fetch).toHaveBeenCalledWith('/api/public/newspaper?edicao='+id1,
   expect.objectContaining({credentials:'omit',redirect:'error'}));
 });
 it('shows the next unpublished draft as Nº 3 even when Firestore persisted an old Nº 9',async()=>{
  session.profile='editor';
  const draft={...cloud,editionNo:9,version:1,state:'draft' as const,publishedAt:null};
  vi.mocked(fetch)
   .mockResolvedValueOnce(success({canPublish:true}))
   .mockResolvedValueOnce(success({nextOfficialEditionNo:3,items:[
    {id:cloudId,editionNo:9,title:'Rascunho',state:'draft',version:1},
   ]}))
   .mockResolvedValueOnce(success(draft))
   .mockResolvedValueOnce(success({items:[]}))
   .mockResolvedValueOnce(success({items:[]}));
  const result=await loadFirebaseNewspaperEditions([]);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({id:cloudId,edition_no:3,state:'draft'});
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
