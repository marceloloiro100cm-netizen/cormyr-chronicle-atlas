/**
 * Sessão Firebase do Atlas, compartilhada por todas as abas do navegador.
 *
 * Desde 21/11/2026 a renovação e o token ficam em localStorage (antes em
 * sessionStorage, presos à aba): "Abrir em nova aba" já abre logado, e sair
 * em uma aba sai de todas. O token guardado é só otimização: toda API
 * protegida continua verificando assinatura, revogação e permissões da Casa.
 * Nunca lê um JWT legado do Supabase.
 */
import {createFirebaseRestAuth} from '@/integrations/auth/firebase-rest-auth';
import {FIREBASE_PUBLIC_CONFIG} from '@/integrations/firebase/public-config';

type Auth=ReturnType<typeof createFirebaseRestAuth>;
export const FIREBASE_REFRESH_KEY='cormyr:firebase-cloud-pilot:refresh';
export const FIREBASE_ID_TOKEN_KEY='cormyr:firebase-cloud-pilot:id-token';

/** Lê do armazenamento compartilhado; a sessão antiga da aba é migrada uma vez. */
export function readSharedSessionValue(key:string):string|null{
  try{
    const shared=window.localStorage.getItem(key);
    if(shared!==null)return shared;
    const legacy=window.sessionStorage.getItem(key);
    if(legacy!==null){
      window.localStorage.setItem(key,legacy);
      window.sessionStorage.removeItem(key);
    }
    return legacy;
  }catch{return null;}
}
function writeSharedSessionValue(key:string,value:string|null){
  try{
    if(value===null)window.localStorage.removeItem(key);
    else window.localStorage.setItem(key,value);
    window.sessionStorage.removeItem(key);
  }catch{/* Sem armazenamento: a sessão fica só na memória desta aba. */}
}
const uidOf=(raw:string|null)=>{
  try{const v=raw?JSON.parse(raw) as {uid?:unknown}:null;return typeof v?.uid==='string'?v.uid:null;}
  catch{return null;}
};

let singleton:Auth|null=null;
export function firebasePilotAuth():Auth|null{
  if(typeof window==='undefined')return null;
  const key=FIREBASE_PUBLIC_CONFIG.apiKey;
  if(!key||FIREBASE_PUBLIC_CONFIG.projectId!=='cormyr')return null;
  if(singleton)return singleton;
  let memory:string|null=null;
  let idTokenMemory:string|null=null;
  const auth=createFirebaseRestAuth({
    apiKey:key,
    idTokenStorage:{
      get(){return readSharedSessionValue(FIREBASE_ID_TOKEN_KEY)??idTokenMemory;},
      set(value){idTokenMemory=value;writeSharedSessionValue(FIREBASE_ID_TOKEN_KEY,value);},
    },
    storage:{
      get(){return readSharedSessionValue(FIREBASE_REFRESH_KEY)??memory;},
      set(value){memory=value;writeSharedSessionValue(FIREBASE_REFRESH_KEY,value);},
    },
  });
  singleton=auth;
  // Outra aba saiu ou entrou com outra conta: esta aba nunca continua com a
  // identidade antiga em memória.
  window.addEventListener('storage',event=>{
    if(event.storageArea!==window.localStorage)return;
    const signedOut=(event.key===FIREBASE_REFRESH_KEY&&event.newValue===null)||event.key===null;
    const otherUser=event.key===FIREBASE_ID_TOKEN_KEY&&event.newValue!==null&&
      auth.current()!==null&&uidOf(event.newValue)!==auth.current()?.uid;
    if(!signedOut&&!otherUser)return;
    memory=null;idTokenMemory=null;
    if(signedOut)auth.signOut();
    // A área interna volta ao login (sessão encerrada) ou recarrega com a
    // nova conta; páginas públicas não precisam de nada.
    if(window.location.pathname==='/firebase-access')
      window.location.replace(signedOut?'/auth':window.location.href);
  });
  return auth;
}
