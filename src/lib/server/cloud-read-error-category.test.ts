import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {cloudReadFailureCategory} from './cloud-read-error-category';

describe('Firebase Cloud read provider diagnostics',()=>{
  it('returns only safe, fixed categories for expected provider codes',()=>{
    expect(cloudReadFailureCategory({code:'permission-denied'}))
      .toBe('permission_denied');
    expect(cloudReadFailureCategory({code:7}))
      .toBe('permission_denied');
    expect(cloudReadFailureCategory({code:'unavailable'}))
      .toBe('provider_unavailable');
    expect(cloudReadFailureCategory({code:14}))
      .toBe('provider_unavailable');
    expect(cloudReadFailureCategory({code:'unauthenticated'}))
      .toBe('provider_unauthenticated');
    expect(cloudReadFailureCategory({code:16}))
      .toBe('provider_unauthenticated');
  });
  it('never returns user-controlled messages, paths, UIDs or unknown codes',()=>{
    for(const error of [
      Error('PRIVATE_HOUSE_ID_AND_EMAIL'),
      {code:'PRIVATE_GCS_OBJECT_PATH',message:'PRIVATE_FIRESTORE_DOC_ID'},
      {code:'auth/account-not-found',details:{uid:'PRIVATE_AUTH_UID'}},
      'PRIVATE_JWT_TOKEN',null,undefined,
    ]){
      const result=cloudReadFailureCategory(error);
      expect(result).toBe('unexpected_provider_failure');
      const output=String(result);
      for(const privatePart of [
        'PRIVATE_HOUSE_ID_AND_EMAIL','PRIVATE_GCS_OBJECT_PATH',
        'PRIVATE_FIRESTORE_DOC_ID','PRIVATE_AUTH_UID','PRIVATE_JWT_TOKEN',
      ])expect(output).not.toContain(privatePart);
    }
  });
  it('Cloud read route never forwards a raw provider message to the server logger',()=>{
    const route=readFileSync('src/routes/api/firebase-cloud-read.ts','utf8');
    expect(route).toContain('cloudReadFailureCategory(e)');
    expect(route).not.toContain('String(err?.message');
    expect(route).not.toContain('console.error(e)');
    expect(route).not.toContain('console.error(err)');
    expect(route).toContain("return error(503,'firebase_cloud_unavailable')");
  });
});
