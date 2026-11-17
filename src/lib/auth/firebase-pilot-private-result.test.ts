import {describe,expect,it} from 'vitest';
import {canApplyPilotPrivateResult} from './firebase-pilot-private-result';

const base=()=>({
  requestVersion:1,activeRequestVersion:1,
  sessionVersion:7,activeSessionVersion:7,
  uid:'account-A',currentUid:'account-A',
});

describe('Late Firebase private responses cannot cross a session boundary',()=>{
  it('accepts the latest response for the same logged in account',()=>{
    expect(canApplyPilotPrivateResult(base())).toBe(true);
  });
  it('rejects an older House or newspaper response after a newer request',()=>{
    expect(canApplyPilotPrivateResult({...base(),activeRequestVersion:2})).toBe(false);
  });
  it('rejects any result after logout or a new resource load',()=>{
    expect(canApplyPilotPrivateResult({...base(),activeSessionVersion:8})).toBe(false);
    expect(canApplyPilotPrivateResult({...base(),currentUid:undefined})).toBe(false);
  });
  it('rejects responses when another House player logs in',()=>{
    expect(canApplyPilotPrivateResult({...base(),currentUid:'account-B'})).toBe(false);
  });
  it('fails closed for absent or invalid request identities',()=>{
    expect(canApplyPilotPrivateResult({...base(),uid:''})).toBe(false);
    expect(canApplyPilotPrivateResult({...base(),requestVersion:NaN})).toBe(false);
  });
});
