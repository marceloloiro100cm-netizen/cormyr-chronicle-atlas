import {useEffect,useRef,type KeyboardEvent} from 'react';
import type {NewspaperBlockType} from '@/lib/newspaper/model';

const TYPES:{value:NewspaperBlockType;label:string;hint:string}[]=[
 {value:'headline',label:'Manchete',hint:'Título grande com linha de apoio'},
 {value:'subtitle',label:'Subtítulo',hint:'Linha fina entre os blocos'},
 {value:'article',label:'Matéria',hint:'Título e texto em colunas'},
 {value:'image',label:'Fotografia',hint:'Imagem com legenda'},
 {value:'quote',label:'Citação',hint:'Frase em destaque'},
 {value:'notice',label:'Aviso',hint:'Comunicado com selo'},
];

/** Devolve o foco a quem o tinha quando o painel abriu. */
function useReturnFocus(){
 const previous=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  previous.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  return()=>{previous.current?.focus?.();};
 },[]);
}

/** Menu aberto pela tecla "/": escolhe o tipo de bloco novo só com o teclado (setas, Enter, Esc). */
export function NewspaperSlashMenu({onPick,onClose}:{onPick:(type:NewspaperBlockType)=>void;onClose:()=>void}){
 const root=useRef<HTMLDivElement>(null);
 useReturnFocus();
 useEffect(()=>{root.current?.querySelector<HTMLElement>('button')?.focus();},[]);
 const keydown=(event:KeyboardEvent<HTMLDivElement>)=>{
  event.stopPropagation();
  if(event.key==='Escape'){event.preventDefault();onClose();return;}
  if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
  event.preventDefault();
  const buttons=Array.from(root.current?.querySelectorAll<HTMLElement>('button')??[]);
  const index=buttons.indexOf(document.activeElement as HTMLElement);
  const next=event.key==='ArrowDown'?(index+1)%buttons.length:(index-1+buttons.length)%buttons.length;
  buttons[next]?.focus();
 };
 return <div className="folha-slash-backdrop" role="presentation"
  onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <div ref={root} className="folha-slash-menu" role="menu" aria-label="Inserir bloco" onKeyDown={keydown}>
   <strong>Inserir depois do bloco selecionado</strong>
   {TYPES.map(item=><button type="button" role="menuitem" key={item.value} onClick={()=>onPick(item.value)}>
    <span>{item.label}</span><small>{item.hint}</small></button>)}
   <small className="folha-slash-foot">Setas escolhem · Enter insere · Esc fecha</small>
  </div>
 </div>;
}

const SHORTCUTS:[string,string][]=[
 ['Ctrl+Z / Ctrl+Y','Desfazer e refazer'],
 ['Ctrl+C / Ctrl+X / Ctrl+V','Copiar, recortar e colar o bloco selecionado'],
 ['Ctrl+D','Duplicar o bloco selecionado'],
 ['Delete','Remover o bloco selecionado (blocos fixos ficam protegidos)'],
 ['/','Inserir um bloco novo depois do selecionado'],
 ['?','Abrir esta lista'],
 ['Esc (dentro do texto)','Sair do campo e voltar ao bloco'],
 ['Enter (manchete e títulos)','Confirmar o campo (nas matérias, Enter cria nova linha)'],
 ['Tab / Shift+Tab','Ir ao próximo campo ou voltar'],
];
export function NewspaperShortcutHelp({onClose}:{onClose:()=>void}){
 const close=useRef<HTMLButtonElement>(null);
 useReturnFocus();
 useEffect(()=>{close.current?.focus();},[]);
 return <div className="folha-slash-backdrop" role="presentation"
  onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <div className="folha-slash-menu folha-shortcut-help" role="dialog" aria-modal="true" aria-label="Atalhos do teclado"
   onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();onClose();}}}>
   <strong>Atalhos do teclado</strong>
   <dl>{SHORTCUTS.map(([keys,text])=><div key={keys}><dt>{keys}</dt><dd>{text}</dd></div>)}</dl>
   <small>Dentro de um texto em edição valem as teclas normais do navegador (copiar, colar e desfazer o texto).</small>
   <button ref={close} type="button" className="folha-text-action" onClick={onClose}>Fechar</button>
  </div>
 </div>;
}
