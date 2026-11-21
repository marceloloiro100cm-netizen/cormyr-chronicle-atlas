import {describe,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
const overlay=vi.hoisted(()=>({rows:null as Record<string,unknown>[]|null}));
vi.mock('../../../scripts/firebase/workspace-import.mjs',()=>({
 readWorkspaceTable:async()=>[{id:'staff-1',name:'Edwina',photo_path:'portrait.png'}],
}));
vi.mock('./firebase-newspaper-staff.server',()=>({readNewspaperStaffOverlay:async()=>overlay.rows}));
import {publicStaffPhotoSrc,readPublicStaffPhoto} from './firebase-public-staff-photo.server';
const png=Buffer.from('89504e470d0a1a0a0000000000000000000000','hex');
function context(photo=png){
 const tried:string[]=[];
 const db={collection:()=>({doc:()=>({get:async()=>({
  exists:true,data:()=>({private:true,status:'complete'}),
 })})})};
 const bucket={file:(path:string)=>{tried.push(path);return {
  exists:async()=>[true],getMetadata:async()=>[{size:photo.length,
   metadata:{sourceSnapshotId:'a'.repeat(64),staffId:'staff-1',
    sha256:createHash('sha256').update(photo).digest('hex')}}],download:async()=>[photo],
 };}};
 return {db,bucket,snapshotId:'a'.repeat(64),staffId:'staff-1',tried};
}
describe('Fotografia da Redação publicada',()=>{
 it('vincula o identificador público a foto cadastrada sem divulgar caminho privado',async()=>{
  const c=context();const result=await readPublicStaffPhoto(c);
  expect(result.contentType).toBe('image/png');
  expect(result.data).toEqual(png);
  expect(c.tried).toEqual(['migration-staging/campaign-newspaper-staff/portrait.png']);
  expect(publicStaffPhotoSrc('staff-1')).toBe('/api/public/newspaper-staff-photo?staff=staff-1');
  expect(publicStaffPhotoSrc('bad/path')).toBeNull();
 });
 it('lê a foto nova pelo vínculo do funcionário e não pelo caminho do visitante',async()=>{
  const path='newspaper-staff/'+('a'.repeat(64))+'/staff-1/22222222-2222-4222-8222-222222222222.png';
  overlay.rows=[{id:'staff-1',name:'Edwina',photo_path:path}];
  try{
   const c=context();
   expect((await readPublicStaffPhoto(c)).contentType).toBe('image/png');
   expect(c.tried).toEqual([path]);
  }finally{overlay.rows=null;}
 });
 it('recusa identificador inválido e bytes que não são uma imagem',async()=>{
  await expect(readPublicStaffPhoto({...context(),staffId:'../x'})).rejects.toMatchObject({status:400});
  await expect(readPublicStaffPhoto(context(Buffer.from('not an image')))).rejects.toMatchObject({status:503});
 });
});
