import {useState,type ReactNode} from 'react';
import {firebaseWorkspaceClient} from '@/lib/firebase-workspace/state';
import {ChancelariaMissivas} from './ChancelariaMissivas';
import {ChancelariaNarrador} from './ChancelariaNarrador';
import type {Panel} from '@/components/players/panel-data';

const KEY='chancelaria-visao-classica';
const readClassic=()=>{try{return localStorage.getItem(KEY)==='1';}catch{return false;}};
const writeClassic=(v:boolean)=>{try{if(v)localStorage.setItem(KEY,'1');else localStorage.removeItem(KEY);}catch{/* armazenamento indisponível */}};

/**
 * No Firebase, a área de Missivas abre na Chancelaria: o Narrador usa o layout
 * v5 (filas, lista, leitura e contexto lado a lado) e os jogadores seguem na v4.
 * A visão clássica continua disponível por um botão, sem perder contratos.
 * Fora do Firebase (prévia ou legado) nada muda.
 */
export function MissivasArea({data,me,onSave,onError,onManage,classic,onOpenHub,initialHouse}:{
  data:Panel;me:Panel['players'][number]|undefined;onSave:()=>void;onError:(m:string)=>void;
  onManage?:((house:string)=>void)|undefined;classic:ReactNode;
  onOpenHub?:(()=>void)|undefined;initialHouse?:string|undefined;
}){
  const cloud=firebaseWorkspaceClient()!==null;
  const [useClassic,setUseClassic]=useState(readClassic);
  if(!cloud)return data.admin?<div className="nw-page">{classic}</div>:<>{classic}</>;
  const banner=<p className="campaign-status-banner" role="status">Você está na visão clássica das Missivas.{' '}
    <button type="button" className="underline" onClick={()=>{writeClassic(false);setUseClassic(false);}}>Voltar para a Chancelaria</button></p>;
  if(useClassic)return data.admin?<div className="nw-page">{banner}{classic}</div>:<>{banner}{classic}</>;
  if(data.admin)return <ChancelariaNarrador data={data} me={me} onSave={onSave} onError={onError} onManage={onManage}
    onOpenHub={onOpenHub} initialHouse={initialHouse} onClassic={()=>{writeClassic(true);setUseClassic(true);}}/>;
  return <ChancelariaMissivas data={data} me={me} onSave={onSave} onError={onError} onManage={onManage}
    onClassic={()=>{writeClassic(true);setUseClassic(true);}}/>;
}
