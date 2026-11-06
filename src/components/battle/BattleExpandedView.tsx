import {useEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import './battle-expanded-view.css';

/** A mesma batalha é renderizada sobre o site, sem alterar seu estado ou o motor.
 * O portal evita que overflow/transform do layout do Narrador limite o tamanho.
 */
export function BattleExpandedView({expanded,onClose,children}:{
 expanded:boolean;onClose:()=>void;children:ReactNode;
}){
 const dialogRef=useRef<HTMLDivElement>(null);
 const lastFocus=useRef<HTMLElement|null>(null);
 const closeRef=useRef(onClose);
 closeRef.current=onClose;

 useEffect(()=>{
  if(!expanded)return;
  lastFocus.current=document.activeElement instanceof HTMLElement?
   document.activeElement:null;
  const previousBodyOverflow=document.body.style.overflow;
  const previousRootOverflow=document.documentElement.style.overflow;
  document.body.style.overflow='hidden';
  document.documentElement.style.overflow='hidden';
  dialogRef.current?.focus();

  const handleKeys=(event:globalThis.KeyboardEvent)=>{
   if(event.key==='Escape'){
    event.preventDefault();
    event.stopPropagation();
    closeRef.current();
    return;
   }
   if(event.key!=='Tab'||!dialogRef.current)return;
   const focusable=Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
    'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),'+
    'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
   )).filter(el=>el.getClientRects().length>0);
   if(focusable.length===0){event.preventDefault();dialogRef.current.focus();return;}
   const first=focusable[0]!,last=focusable[focusable.length-1]!;
   if(event.shiftKey&&(document.activeElement===first||
    document.activeElement===dialogRef.current)){
    event.preventDefault();last.focus();
   }else if(!event.shiftKey&&document.activeElement===last){
    event.preventDefault();first.focus();
   }
  };
  document.addEventListener('keydown',handleKeys,true);
  return ()=>{
   document.removeEventListener('keydown',handleKeys,true);
   document.body.style.overflow=previousBodyOverflow;
   document.documentElement.style.overflow=previousRootOverflow;
   if(lastFocus.current?.isConnected)lastFocus.current.focus();
  };
 },[expanded]);

 if(!expanded||typeof document==='undefined')return <>{children}</>;
 return createPortal(
  <div className="battle-expanded-backdrop">
   <div ref={dialogRef} className="battle-expanded-dialog"
    role="dialog" aria-modal="true" aria-label="Batalha em tela ampliada"
    tabIndex={-1}>
    {children}
   </div>
  </div>,document.body
 );
}
