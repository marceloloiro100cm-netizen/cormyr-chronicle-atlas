/**
 * Uma única tela de login (/auth). A área interna (/firebase-access) nunca
 * mostra um segundo formulário: sem sessão ela volta para /auth, levando
 * apenas uma mensagem curta e fixa (nunca token, e-mail ou dado da campanha).
 */
import {FIREBASE_REFRESH_KEY,readSharedSessionValue} from './firebase-pilot-session';
const MESSAGE_KEY='cormyr:firebase-login-message';

/** Há sessão neste navegador (em memória ou com renovação guardada, válida
 * para todas as abas)? Não autoriza nada. */
export function hasStoredFirebaseSession(current:unknown):boolean{
  if(current)return true;
  return Boolean(readSharedSessionValue(FIREBASE_REFRESH_KEY));
}

export function handOffLoginMessage(message:string|undefined){
  try{
    if(message)window.sessionStorage.setItem(MESSAGE_KEY,message.slice(0,400));
    else window.sessionStorage.removeItem(MESSAGE_KEY);
  }catch{/* sem armazenamento: a tela de login abre sem aviso */}
}

/** Lê e apaga a mensagem deixada pela área interna. */
export function takeLoginMessage():string{
  try{
    if(typeof window==='undefined')return '';
    const value=window.sessionStorage.getItem(MESSAGE_KEY)??'';
    window.sessionStorage.removeItem(MESSAGE_KEY);
    return value;
  }catch{return '';}
}
