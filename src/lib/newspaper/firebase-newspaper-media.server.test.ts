import {describe,it,expect} from 'vitest';
import {isNewspaperMediaPath,validateNewspaperMediaUpload,newspaperMediaDocId,
 classifyNewspaperStorageError}
 from './firebase-newspaper-media.server';

const snap='f'.repeat(64);
const uuid='00000000-0000-4000-8000-000000000001';
const base='newspaper-media/'+snap+'/editionImage/'+uuid+'.png';
const png=Buffer.from('89504e470d0a1a0a0000000000000000','hex');
describe('Firebase newsroom media boundary',()=>{
 it('distinguishes denied Storage IAM from temporary outage without leaking provider messages',()=>{
  expect(classifyNewspaperStorageError({code:403,message:'sensitive service account'}))
   .toBe('media_storage_permission_denied');
  expect(classifyNewspaperStorageError({statusCode:7}))
   .toBe('media_storage_permission_denied');
  expect(classifyNewspaperStorageError({code:500}))
   .toBe('media_storage_unavailable');
  expect(classifyNewspaperStorageError(Error('private bucket path')))
   .toBe('media_storage_unavailable');
 });
 it('accepts the exact server-owned path namespace and rejects traversal',()=>{
  expect(isNewspaperMediaPath(base,snap,'editionImage')).toBe(true);
  expect(isNewspaperMediaPath(base,snap,'commission')).toBe(false);
  expect(isNewspaperMediaPath('../'+base,snap)).toBe(false);
  expect(isNewspaperMediaPath(base,'x')).toBe(false);
  expect(newspaperMediaDocId(base)).toMatch(/^[a-f0-9]{64}$/);
 });
 it('checks image bytes, declared type, size and field allowlist',()=>{
  expect(validateNewspaperMediaUpload({action:'upload',kind:'editionImage',
   editionId:'cloud-'+snap,contentType:'image/png',dataBase64:png.toString('base64')}))
   .toMatchObject({kind:'editionImage',contentType:'image/png'});
  for(const bad of [
   {action:'upload',kind:'editionPdf',contentType:'image/png',
    dataBase64:png.toString('base64')},
   {action:'upload',kind:'editionImage',contentType:'image/jpeg',
    dataBase64:png.toString('base64')},
   {action:'upload',kind:'editionImage',contentType:'image/png',
    dataBase64:png.toString('base64'),admin:true},
   {action:'upload',kind:'editionImage',contentType:'image/png',dataBase64:'AAAA'},
  ])expect(()=>validateNewspaperMediaUpload(bad)).toThrow();
 });
 it('allows a genuine PDF only in an edition PDF slot',()=>{
  const data=Buffer.from('%PDF-1.7\n1 0 obj\nendobj\n');
  expect(validateNewspaperMediaUpload({
   action:'upload',kind:'editionPdf',contentType:'application/pdf',
   dataBase64:data.toString('base64'),
  }).kind).toBe('editionPdf');
  expect(()=>validateNewspaperMediaUpload({
   action:'upload',kind:'engraving',contentType:'application/pdf',
   dataBase64:data.toString('base64'),
  })).toThrow();
 });
});
