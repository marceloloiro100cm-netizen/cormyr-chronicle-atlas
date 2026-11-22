import {describe,expect,it,vi} from 'vitest';
vi.mock('@tanstack/react-router',()=>({createFileRoute:()=>()=>({})}));
import {safeMedia503Code} from './firebase-newspaper-media';

describe('Firebase Jornal media error boundaries',()=>{
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
