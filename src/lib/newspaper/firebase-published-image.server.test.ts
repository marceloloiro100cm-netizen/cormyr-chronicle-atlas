import {describe,it,expect} from 'vitest';
import {vi} from 'vitest';
vi.mock('../../../scripts/firebase/newspaper-deleted.mjs',()=>({deletedNewspaperIds:async()=>new Set()}));
import {readPublishedNewspaperImage,publishedImageSrc}
 from './firebase-published-image.server';

const snap='a'.repeat(64),edition='edition-one',legacy='writer/image.png';
const png=Buffer.from('89504e470d0a1a0a0000000000000000000000','hex');
const published={
 id:edition,editionNo:1,state:'published',publishedAt:'2026-11-19T12:00:00Z',
 cancelledAt:null,blocks:[{type:'headline',text:'Jornal'},{
  type:'image',imagePath:legacy,caption:'Gravura original',
 }],
};
function ctx(options:{edition?:Record<string,unknown>;exists?:boolean;data?:Buffer;
 stageComplete?:boolean}={}){
 const fileData=options.data??png;
 const stage={exists:true,data:()=>({
  private:true,status:options.stageComplete===false?'pending':'complete',
 })};
 const row={exists:true,data:()=>options.edition??published};
 const files:string[]=[];
 const db={collection:()=>({doc:()=>({get:async()=>stage,
  collection:()=>({doc:()=>({get:async()=>row})}),
 })})};
 const bucket={file:(path:string)=>{files.push(path);return {
  exists:async()=>[options.exists!==false],
  getMetadata:async()=>[{size:String(fileData.length)}],
  download:async()=>[fileData],
 };}};
 return {db,bucket,snapshotId:snap,editionId:edition,index:1,files};
}
describe('Firebase historic newspaper image gateway',()=>{
 it('serves original bytes only from an image block in a published edition',async()=>{
  const f=ctx();
  const r=await readPublishedNewspaperImage(f);
  expect(r.contentType).toBe('image/png');
  expect(r.data).toEqual(png);
  expect(f.files).toEqual(['migration-staging/campaign-newspapers/'+legacy]);
  expect(publishedImageSrc(edition,1)).toBe('/api/public/newspaper-image?edition=edition-one&index=1');
 });
 it('denies drafts, stage not ready, missing source and non-image block',async()=>{
  await expect(readPublishedNewspaperImage(ctx({edition:{...published,state:'draft'}})))
   .rejects.toMatchObject({status:404});
  await expect(readPublishedNewspaperImage(ctx({stageComplete:false})))
   .rejects.toMatchObject({status:503});
  await expect(readPublishedNewspaperImage(ctx({exists:false})))
   .rejects.toMatchObject({status:404});
  await expect(readPublishedNewspaperImage({...ctx(),index:0}))
   .rejects.toMatchObject({status:404});
 });
 it('does not accept traversal, browser-selected URLs or invalid image bytes',async()=>{
  await expect(readPublishedNewspaperImage(ctx({
   edition:{...published,blocks:[{},{
    type:'image',imagePath:'../../private/another.png',
   }]},
  }))).rejects.toMatchObject({status:404});
  await expect(readPublishedNewspaperImage(ctx({data:Buffer.from('not image')})))
   .rejects.toMatchObject({status:503});
  await expect(readPublishedNewspaperImage({...ctx(),editionId:'../../x'}))
   .rejects.toMatchObject({status:400});
  expect(publishedImageSrc('bad/path',1)).toBeNull();
 });
});
