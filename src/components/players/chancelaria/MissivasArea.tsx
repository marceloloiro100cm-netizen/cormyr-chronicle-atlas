import {useState,type ReactNode} from 'react';
import {firebaseWorkspaceClient} from '@/lib/firebase-workspace/state';
import {ChancelariaMissivas} from './ChancelariaMissivas';
import type {Panel} from '@/components/players/panel-data';

const KEY='chancelaria-visao-classica';
const readClassic=()=>{try{return localStorage.getItem(KEY)==='1';}catch{return false;}};
const writeClassic=(v:boolean)=>{try{if(v)localStorage.setItem(KEY,'1');else localStorage.removeItem(KEY);}catch{/* armazenamento indisponível */}};

/**
 * No Firebase, a área de Missivas abre na Chancelaria (protótipo v4).
 * A visão clássica continua disponível por um botão, sem perder contratos.
 * Fora do Firebase (prévia ou legado) nada muda.
 */
export function MissivasArea({data,me,onSave,onError,onManage,classic}:{
  data:Panel;me:Panel['players'][number]|undefined;onSave:()=>void;onError:(m:string)=>void;
  onManage?:((house:string)=>void)|undefined;classic:ReactNode;
}){
  const cloud=firebaseWorkspaceClient()!==null;
  const [useClassic,setUseClassic]=useState(readClassic);
  if(!cloud)return <>{classic}</>;
  if(useClassic)return <>
    <p className="campaign-status-banner" role="status">Você está na visão clássica das Missivas.{' '}
      <button type="button" className="underline" onClick={()=>{writeClassic(false);setUseClassic(false);}}>Voltar para a Chancelaria</button></p>
    {classic}</>;
  return <ChancelariaMissivas data={data} me={me} onSave={onSave} onError={onError} onManage={onManage}
    onClassic={()=>{writeClassic(true);setUseClassic(true);}}/>;
}
