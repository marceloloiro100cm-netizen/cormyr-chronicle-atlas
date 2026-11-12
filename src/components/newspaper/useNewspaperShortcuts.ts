import {useEffect,useRef} from 'react';

export interface NewspaperShortcutHandlers{
 /** Só escuta enquanto a folha está aberta para edição. */
 active:boolean;
 selectedId:string|null;
 onUndo:()=>void;
 onRedo:()=>void;
 /** Devolvem o texto da área de transferência (ou null se não houver bloco) para o navegador gravar. */
 onCopy:(id:string)=>string|null;
 onCut:(id:string)=>string|null;
 onPaste:(text:string,files:File[])=>void;
 onRemove:(id:string)=>void;
 onDuplicate:(id:string)=>void;
 /** Tecla "/": abre o menu de inserção. Tecla "?": abre a lista de atalhos. */
 onSlash?:()=>void;
 onHelp?:()=>void;
}

/** Campos de texto cuidam do próprio Ctrl+Z/C/X/V; a folha cuida disso quando o foco está num bloco. */
export function isTextTarget(target:EventTarget|null):boolean{
 if(!(target instanceof HTMLElement))return false;
 return target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName);
}
function hasTextSelection():boolean{
 const selection=window.getSelection();
 return Boolean(selection&&!selection.isCollapsed&&selection.toString().trim());
}

/**
 * Atalhos da folha para BLOCOS: Ctrl+Z / Ctrl+Y (ou Ctrl+Shift+Z) desfazer e refazer,
 * Ctrl+C / Ctrl+X / Ctrl+V copiar, recortar e colar, Ctrl+D duplicar, Delete remover,
 * "/" inserir bloco e "?" ajuda.
 * Dentro de um texto em edição valem as teclas normais do navegador.
 */
export function useNewspaperShortcuts(handlers:NewspaperShortcutHandlers):void{
 const ref=useRef(handlers);
 ref.current=handlers;
 const {active}=handlers;
 useEffect(()=>{
  if(!active)return;
  const keydown=(event:KeyboardEvent)=>{
   if(isTextTarget(event.target))return;
   const h=ref.current,mod=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
   if(mod&&key==='z'){event.preventDefault();if(event.shiftKey)h.onRedo();else h.onUndo();return;}
   if(mod&&key==='y'){event.preventDefault();h.onRedo();return;}
   if(!mod&&!event.altKey&&event.key==='/'&&h.onSlash){event.preventDefault();h.onSlash();return;}
   if(!mod&&!event.altKey&&event.key==='?'&&h.onHelp){event.preventDefault();h.onHelp();return;}
   if(!h.selectedId)return;
   if(mod&&key==='d'){event.preventDefault();h.onDuplicate(h.selectedId);return;}
   if(!mod&&!event.altKey&&event.key==='Delete'){
    event.preventDefault();h.onRemove(h.selectedId);
   }
  };
  const clipboard=(kind:'copy'|'cut')=>(event:ClipboardEvent)=>{
   const h=ref.current;
   if(isTextTarget(event.target)||hasTextSelection()||!h.selectedId)return;
   const text=kind==='copy'?h.onCopy(h.selectedId):h.onCut(h.selectedId);
   if(text===null||!event.clipboardData)return;
   event.clipboardData.setData('text/plain',text);
   event.preventDefault();
  };
  const copy=clipboard('copy'),cut=clipboard('cut');
  const paste=(event:ClipboardEvent)=>{
   if(isTextTarget(event.target))return;
   const data=event.clipboardData;
   if(!data)return;
   const files=Array.from(data.files).filter(file=>file.type.startsWith('image/'));
   const text=data.getData('text/plain');
   if(files.length===0&&!text.trim())return;
   event.preventDefault();
   ref.current.onPaste(text,files);
  };
  window.addEventListener('keydown',keydown);
  window.addEventListener('copy',copy);
  window.addEventListener('cut',cut);
  window.addEventListener('paste',paste);
  return()=>{
   window.removeEventListener('keydown',keydown);
   window.removeEventListener('copy',copy);
   window.removeEventListener('cut',cut);
   window.removeEventListener('paste',paste);
  };
 },[active]);
}
