import {describe,expect,it,vi} from 'vitest';
import {makeNewspaperBlock,type NewspaperEdition} from './model';
import {updateFirebaseNewspaperEdition} from './firebase-editorial-bridge';

vi.mock('../firebase-workspace/state',()=>({firebaseWorkspaceClient:()=>({})}));
vi.mock('../firebase-workspace/client',()=>({workspaceRequest:vi.fn()}));
vi.mock('../auth/firebase-pilot-session',()=>({
 firebasePilotAuth:()=>({
  current:()=>({uid:'editor-folha'}),
  getToken:async()=> 'token-test-only',
 }),
}));
const id='cloud-'+'b'.repeat(64);
function edition():NewspaperEdition{
 return {id,edition_no:3,campaign_date:'1522-11-24',
  title:'A Folha Sem Selo',subtitle:'A verdade bem servida',
  template:'classico',font_style:'classico',state:'draft',
  blocks:[{...makeNewspaperBlock('headline'),text:'Uma notícia escrita'}],
  pdf_path:null,version:1,publication_revision:0,created_by:'editor-folha',
  updated_at:'',published_at:null,archived_at:null,cancelled_at:null};
}
function patch(e:NewspaperEdition){
 return {campaign_date:e.campaign_date,title:e.title,subtitle:e.subtitle,
  template:e.template,font_style:e.font_style,blocks:e.blocks,
  pdf_path:null,state:'draft' as const,publish_on:null};
}
describe('Jornal Firebase: idempotent autosave under network faults',()=>{
 it('reuses request key after network response is lost and confirms the saved version',async()=>{
  const sent:Record<string,unknown>[]=[];
  let count=0;
  vi.stubGlobal('fetch',vi.fn(async(_url:string,init:{body:string})=>{
   sent.push(JSON.parse(init.body) as Record<string,unknown>);
   count++;
   if(count===1)throw Error('Connection dropped after commit');
   return {ok:true,json:async()=>({result:{
    id,editionNo:3,title:'A Folha Sem Selo',
    subtitle:'A verdade bem servida',blocks:edition().blocks,
    campaignDate:'1522-11-24',version:2,state:'draft',publishedAt:null,
   }})};
  }));
  try{
   const current=edition();
   await expect(updateFirebaseNewspaperEdition(current,patch(current))).rejects.toMatchObject({
    status:503,
   });
   const recovered=await updateFirebaseNewspaperEdition(current,patch(current));
   expect(recovered.version).toBe(2);
   expect(sent).toHaveLength(2);
   expect(sent[0]?['requestKey']).toBe(sent[1]?['requestKey']);
   expect(sent[0]?['expectedVersion']).toBe(1);
   expect(sent[1]?['state']).toBe('draft');
  }finally{vi.unstubAllGlobals();}
 });
 it('surfaces a concurrent edit conflict instead of reporting a successful save',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({
   ok:false,status:409,clone:()=>({json:async()=>({error:'edition_version_conflict'})}),
  })));
  try{
   const current={...edition(),id:'cloud-'+'c'.repeat(64)};
   await expect(updateFirebaseNewspaperEdition(current,patch(current))).rejects.toMatchObject({
    status:409,
   });
  }finally{vi.unstubAllGlobals();}
 });
});
