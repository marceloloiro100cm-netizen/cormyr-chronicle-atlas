/**
 * Shared, tab-scoped Firebase Auth pilot session.
 * The same refresh-token storage is used by the pilot page and the
 * Narrator-only library. Never read a legacy Supabase JWT.
 */
import {createFirebaseRestAuth} from '@/integrations/auth/firebase-rest-auth';
import {FIREBASE_PUBLIC_CONFIG} from '@/integrations/firebase/public-config';

type Auth=ReturnType<typeof createFirebaseRestAuth>;
let singleton:Auth|null=null;
export function firebasePilotAuth():Auth|null{
  if(typeof window==='undefined')return null;
  const key=FIREBASE_PUBLIC_CONFIG.apiKey;
  if(!key||FIREBASE_PUBLIC_CONFIG.projectId!=='cormyr')return null;
  if(singleton)return singleton;
  const storageKey='cormyr:firebase-cloud-pilot:refresh';
  let memory:string|null=null;
  singleton=createFirebaseRestAuth({
    apiKey:key,
    storage:{
      get(){try{return window.sessionStorage.getItem(storageKey);}catch{return memory;}},
      set(value){
        memory=value;
        try{
          if(value===null)window.sessionStorage.removeItem(storageKey);
          else window.sessionStorage.setItem(storageKey,value);
        }catch{/* Keep the current tab's session only in memory on failure. */}
      },
    },
  });
  return singleton;
}
