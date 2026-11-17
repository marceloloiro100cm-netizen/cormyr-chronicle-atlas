import {describe,it,expect,vi} from 'vitest';
import {createFirebaseRestAuth,FirebaseAuthError,memoryStorage}
  from './firebase-rest-auth';

describe('Firebase cloud pilot password recovery',()=>{
  it('submits only a PASSWORD_RESET action to fixed Identity Toolkit, without login',async()=>{
    const calls:{url:string;init:RequestInit}[]=[];
    const fetcher=vi.fn(async(url:string,init:RequestInit)=>{
      calls.push({url,init});
      return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
    });
    const storage=memoryStorage();
    const auth=createFirebaseRestAuth({apiKey:'test-public-key',
      fetch:fetcher as unknown as typeof fetch,storage});
    const changes=vi.fn();
    auth.subscribe(changes);
    await auth.requestPasswordReset('someone@example.com');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=test-public-key');
    expect(calls[0]!.init.method).toBe('POST');
    const body=JSON.parse(calls[0]!.init.body as string);
    expect(body).toEqual({requestType:'PASSWORD_RESET',email:'someone@example.com'});
    expect(calls[0]!.init.headers).toEqual({'content-type':'application/json'});
    expect(storage.get()).toBeNull();
    expect(auth.current()).toBeNull();
    expect(changes).not.toHaveBeenCalled();
  });
  it('rejects malformed inputs locally without contacting the provider',async()=>{
    const fetcher=vi.fn();
    const auth=createFirebaseRestAuth({apiKey:'public-test',
      fetch:fetcher as unknown as typeof fetch});
    for(const email of ['', 'invalid', 'a@b', 'two words@example.com',
      'a'.repeat(260)+'@example.com']){
      await expect(auth.requestPasswordReset(email)).rejects.toMatchObject({
        code:'INVALID_EMAIL',
      });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('provider error never changes an existing session or initiates a sign-in',async()=>{
    const fetcher=vi.fn(async()=>new Response(
      '{"error":{"message":"EMAIL_NOT_FOUND"}}',{
        status:400,headers:{'content-type':'application/json'},
      }));
    const storage=memoryStorage();
    const auth=createFirebaseRestAuth({apiKey:'public-test',
      fetch:fetcher as unknown as typeof fetch,storage});
    await expect(auth.requestPasswordReset('missing@example.com'))
      .rejects.toBeInstanceOf(FirebaseAuthError);
    expect(auth.current()).toBeNull();
    expect(storage.get()).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
