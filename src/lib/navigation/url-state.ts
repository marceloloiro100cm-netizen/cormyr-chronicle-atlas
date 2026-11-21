/**
 * Estado de navegação guardado no endereço da página (?aba=ficha&parte=army...).
 *
 * Cada tela, aba e sub-aba da área interna tem um endereço próprio. Com isso:
 * botão direito > "Abrir em nova guia", Ctrl+clique e clique do meio abrem a
 * mesma tela; F5 não volta ao início; Voltar e Avançar do navegador funcionam.
 *
 * O endereço é só preferência de tela, nunca permissão: cada componente
 * continua validando o valor (Casa autorizada, carta visível...) e o servidor
 * continua conferindo o acesso em cada leitura.
 *
 * Não depende do roteador (funciona também nos testes e em componentes
 * reaproveitados fora de /firebase-access): usa history.pushState e avisa os
 * componentes inscritos; o Voltar do navegador chega pelo evento popstate.
 */
import {useCallback,useSyncExternalStore,type MouseEvent} from 'react';

export type UrlParamChanges=Record<string,string|null|undefined>;

/** Parâmetros das telas internas. Trocar de módulo ou de aba principal limpa
 * os níveis abaixo, para um link nunca carregar uma carta ou seção de outra tela. */
export const NESTED_URL_PARAMS=['parte','espionagem','ficha','pasta','carta','dossie','modalidade','redacao','filtroCasa','hub'] as const;

const listeners=new Set<()=>void>();
let bound=false;
const notify=()=>listeners.forEach(listener=>listener());
function subscribe(listener:()=>void){
 if(!bound&&typeof window!=='undefined'){bound=true;window.addEventListener('popstate',notify);}
 listeners.add(listener);
 return()=>{listeners.delete(listener);};
}
const currentSearch=()=>typeof window==='undefined'?'':window.location.search;

export function readUrlParam(key:string):string|null{
 if(typeof window==='undefined')return null;
 const value=new URLSearchParams(window.location.search).get(key);
 return value===null||value===''?null:value.slice(0,200);
}

/** Endereço da página atual com os parâmetros trocados (null remove). */
export function hrefWithParams(changes:UrlParamChanges,reset:readonly string[]=[]):string{
 if(typeof window==='undefined')return '#';
 const url=new URL(window.location.href);
 for(const key of reset)url.searchParams.delete(key);
 for(const [key,value] of Object.entries(changes)){
  if(value===null||value===undefined||value==='')url.searchParams.delete(key);
  else url.searchParams.set(key,value);
 }
 return url.pathname+url.search+url.hash;
}

export function setUrlParams(changes:UrlParamChanges,{replace=false,reset=[] as readonly string[]}={}):void{
 if(typeof window==='undefined')return;
 const next=hrefWithParams(changes,reset);
 const now=window.location.pathname+window.location.search+window.location.hash;
 if(next===now)return;
 // Preserva o estado do roteador na entrada do histórico.
 const state=window.history.state as unknown;
 if(replace)window.history.replaceState(state,'',next);
 else window.history.pushState(state,'',next);
 notify();
}

/** Valor de um parâmetro, como estado React: muda com cliques, Voltar e Avançar. */
export function useUrlParam(key:string,fallback:string,{reset=[] as readonly string[]}={}):
 readonly [string,(value:string,options?:{replace?:boolean})=>void]{
 const raw=useSyncExternalStore(subscribe,()=>readUrlParam(key),()=>null);
 const set=useCallback((value:string,options:{replace?:boolean}={})=>
  setUrlParams({[key]:value===fallback?null:value},{replace:options.replace===true,reset}),[key,fallback,reset]);
 return [raw??fallback,set] as const;
}

/** Faz o componente refazer os links quando qualquer parâmetro muda. */
export function useUrlSearch():string{
 return useSyncExternalStore(subscribe,currentSearch,()=> '');
}

/** Clique comum (sem Ctrl, Shift, Alt ou Cmd, botão esquerdo): navega aqui mesmo.
 * Os demais ficam com o navegador (nova guia, nova janela, menu do botão direito). */
export function isPlainLeftClick(event:MouseEvent):boolean{
 return event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&!event.defaultPrevented;
}

/** Props de um link de navegação interna: href real + troca sem recarregar. */
export function urlLinkProps(changes:UrlParamChanges,{reset=[] as readonly string[],onNavigate}:{
 reset?:readonly string[];onNavigate?:(()=>void)|undefined;
}={}){
 return {
  href:hrefWithParams(changes,reset),
  onClick:(event:MouseEvent<HTMLAnchorElement>)=>{
   if(!isPlainLeftClick(event))return;
   event.preventDefault();
   setUrlParams(changes,{reset});
   onNavigate?.();
  },
 };
}
