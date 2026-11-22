import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('@tanstack/react-router',()=>({createFileRoute:()=>()=>({})}));
import {safeMedia503Code,handleFirebaseNewspaperMedia} from './firebase-newspaper-media';
afterEach(()=>vi.unstubAllEnvs());

describe('Firebase Jornal media error boundaries',()=>{
 it('returns a marked 401 without loading the heavy media service for anonymous requests',async()=>{
  vi.stubEnv('CORMYR_FIREBASE_CLOUD_READ_ENABLED','true');
  vi.stubEnv('CORMYR_FIREBASE_CLOUD_NEWSPAPER_ENABLED','true');
  vi.stubEnv('CORMYR_FIREBASE_PUBLIC_NEWSPAPER_ENABLED','true');
  vi.stubEnv('CORMYR_FIREBASE_SNAPSHOT_ID','a'.repeat(64));
  for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST',
    'FIREBASE_STORAGE_EMULATOR_HOST'])vi.stubEnv(key,'');
  const request=new Request('https://atlas.cormyr.com.br/api/firebase-newspaper-media',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:'{"action":"read","path":"invalid"}',
  });
  const response=await handleFirebaseNewspaperMedia(request);
  expect(response.status).toBe(401);
  expect(response.headers.get('x-cormyr-media-handler')).toBe('v2');
  expect(await response.json()).toEqual({error:'authentication_required'});
 });
 it('marks feature-flag denials as app-generated, not gateway-generated',async()=>{
  vi.stubEnv('CORMYR_FIREBASE_CLOUD_READ_ENABLED','true');
  vi.stubEnv('CORMYR_FIREBASE_CLOUD_NEWSPAPER_ENABLED','false');
  vi.stubEnv('CORMYR_FIREBASE_PUBLIC_NEWSPAPER_ENABLED','true');
  vi.stubEnv('CORMYR_FIREBASE_SNAPSHOT_ID','a'.repeat(64));
  const response=await handleFirebaseNewspaperMedia(
   new Request('https://atlas.cormyr.com.br/api/firebase-newspaper-media',
    {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));
  expect(response.status).toBe(503);
  expect(response.headers.get('x-cormyr-media-handler')).toBe('v2');
  expect(await response.json()).toEqual({error:'newspaper_media_disabled'});
 });

 it('retains an approved 503 code across duplicated Error class instances',()=>{
  expect(safeMedia503Code({status:503,code:'media_not_approved'}))
   .toBe('media_not_approved');
  expect(safeMedia503Code({status:503,code:'migration_stage_not_ready'}))
   .toBe('migration_stage_not_ready');
 });
 it('does not reflect arbitrary provider errors or user-supplied strings',()=>{
  expect(safeMedia503Code({status:503,code:'secret-service-account'}))
   .toBeNull();
  expect(safeMedia503Code({status:403,code:'media_not_approved'}))
   .toBeNull();
  expect(safeMedia503Code(new Error('private image path')))
   .toBeNull();
 });
});
