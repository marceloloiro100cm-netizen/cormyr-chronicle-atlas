import type {ReactNode} from 'react';
import {firebaseWorkspaceClient} from '@/lib/firebase-workspace/state';
import {ChancelariaMissivas} from './ChancelariaMissivas';
import {ChancelariaNarrador} from './ChancelariaNarrador';
import type {Panel} from '@/components/players/panel-data';

/** Preferência antiga da "visão clássica": removida para ninguém ficar preso nela. */
const LEGACY_CLASSIC_KEY='chancelaria-visao-classica';
const forgetClassic=()=>{try{localStorage.removeItem(LEGACY_CLASSIC_KEY);}catch{/* armazenamento indisponível */}};

/**
 * No Firebase, a área de Missivas abre sempre na Chancelaria: o Narrador usa o
 * layout v5 (pastas, lista e leitura lado a lado) e os jogadores seguem na v4.
 * A visão clássica deixou de ser oferecida (decisão de 20/11/2026).
 * Fora do Firebase (prévia ou legado) nada muda.
 */
export function MissivasArea({data,me,onSave,onError,onManage,classic,onOpenHub,initialHouse}:{
  data:Panel;me:Panel['players'][number]|undefined;onSave:()=>void;onError:(m:string)=>void;
  onManage?:((house:string)=>void)|undefined;classic:ReactNode;
  onOpenHub?:(()=>void)|undefined;initialHouse?:string|undefined;
}){
  const cloud=firebaseWorkspaceClient()!==null;
  if(!cloud)return data.admin?<div className="nw-page">{classic}</div>:<>{classic}</>;
  forgetClassic();
  if(data.admin)return <ChancelariaNarrador data={data} me={me} onSave={onSave} onError={onError} onManage={onManage}
    onOpenHub={onOpenHub} initialHouse={initialHouse}/>;
  return <ChancelariaMissivas data={data} me={me} onSave={onSave} onError={onError} onManage={onManage}/>;
}
