import {describe,it,expect,vi} from 'vitest';
import {createFirebaseRestAuth,memoryStorage} from './firebase-rest-auth';
const reply=()=>new Response(JSON.stringify({user_id:'existing-uid',
 id_token:'verified-id-token',refresh_token:'rotated-refresh',expires_in:'3600'}));
describe('Google Firebase session bridge',()=>{
 it('exchanges the SDK refresh token and preserves the verified Firebase UID',async()=>{
  const request=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>reply()),storage=memoryStorage();
  const auth=createFirebaseRestAuth({apiKey:'public',fetch:request as typeof fetch,storage});
  await auth.signInWithGoogle(async()=>'google-refresh');
  expect(auth.current()?.uid).toBe('existing-uid');
  expect(storage.get()).toBe('rotated-refresh');
  expect(request.mock.calls[0]?.[0]).toBe('https://securetoken.googleapis.com/v1/token?key=public');
  const count=request.mock.calls.length;
  expect(await auth.getToken()).toBe('verified-id-token');
  expect(request.mock.calls.length).toBe(count);
 });
 it('does not restore a signed-out session when the Google popup completes late',async()=>{
  let complete!:(token:string)=>void;
  const request=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>reply());
  const auth=createFirebaseRestAuth({apiKey:'public',fetch:request as typeof fetch});
  const pending=auth.signInWithGoogle(()=>new Promise(resolve=>{complete=resolve;}));
  auth.signOut();complete('late-refresh');
  await expect(pending).rejects.toMatchObject({code:'STALE_SESSION'});
  expect(auth.current()).toBeNull();expect(request).not.toHaveBeenCalled();
 });
 it('rejects invalid provider credentials without storing a session',async()=>{
  const storage=memoryStorage();
  const auth=createFirebaseRestAuth({apiKey:'public',storage,fetch:vi.fn(async()=>
   new Response('{"error":{"message":"INVALID_REFRESH_TOKEN"}}',{status:400})) as typeof fetch});
  await expect(auth.signInWithGoogle(async()=>'invalid')).rejects.toMatchObject({code:'INVALID_REFRESH_TOKEN'});
  expect(auth.current()).toBeNull();expect(storage.get()).toBeNull();
 });
});
