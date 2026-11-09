import type {WarBattle} from './types';
import {decodeGotLabSave,encodeGotLabSave} from './lab-save';

/** Cópias locais: índices separados por perfil, sem expor uma API de servidor. */
export type GotArchiveScope='narrator'|'player';
export type GotArchiveEntry=Readonly<{
 id:string;label:string;updatedAt:string;round:number;phase:WarBattle['phase'];
}>;
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export const GOT_ARCHIVE_LIMIT=8;
const base=(scope:GotArchiveScope)=>'cormyr-got-archive-v1-'+scope;
const indexKey=(scope:GotArchiveScope)=>base(scope)+':index';
const snapshotKey=(scope:GotArchiveScope,id:string)=>base(scope)+':'+id;
const safeId=(id:string)=>/^[a-z0-9-]{4,50}$/.test(id);
export function listGotArchives(store:Store,scope:GotArchiveScope):readonly GotArchiveEntry[]{
 try{
  const stored=store.getItem(indexKey(scope));
  if(!stored)return [];
  const data:unknown=JSON.parse(stored);
  if(!Array.isArray(data))return [];
  return data.filter((row):row is GotArchiveEntry=>{
   if(!row||typeof row!=='object')return false;
   const x=row as Record<string,unknown>;
   return typeof x['id']==='string'&&safeId(x['id'])&&typeof x['label']==='string'&&
    x['label'].length>0&&x['label'].length<=80&&typeof x['updatedAt']==='string'&&
    Number.isInteger(x['round'])&&Number(x['round'])>0&&
    typeof x['phase']==='string';
  }).slice(0,GOT_ARCHIVE_LIMIT);
 }catch{return [];}
}
export function saveGotArchive(store:Store,scope:GotArchiveScope,label:string,battle:WarBattle){
 const clean=label.trim().slice(0,80);
 if(!clean)throw Error('Informe um nome para a cópia.');
 const snapshot=encodeGotLabSave(battle);
 const current=listGotArchives(store,scope);
 const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
 const entry:GotArchiveEntry={id,label:clean,updatedAt:new Date().toISOString(),
  round:battle.round,phase:battle.phase};
 // Escreve o snapshot antes do índice: uma falha não remove cópias válidas.
 store.setItem(snapshotKey(scope,id),snapshot);
 try{store.setItem(indexKey(scope),JSON.stringify([entry,...current].slice(0,GOT_ARCHIVE_LIMIT)));}
 catch(e){store.removeItem(snapshotKey(scope,id));throw e;}
 for(const old of current.slice(GOT_ARCHIVE_LIMIT-1))store.removeItem(snapshotKey(scope,old.id));
 return entry;
}
export function loadGotArchive(store:Store,scope:GotArchiveScope,id:string):WarBattle{
 if(!safeId(id)||!listGotArchives(store,scope).some(e=>e.id===id))
  throw Error('Cópia de batalha não encontrada.');
 const snapshot=store.getItem(snapshotKey(scope,id));
 if(!snapshot)throw Error('O conteúdo da cópia não está disponível neste navegador.');
 return decodeGotLabSave(snapshot);
}
export function deleteGotArchive(store:Store,scope:GotArchiveScope,id:string){
 if(!safeId(id))throw Error('Identificador da cópia inválido.');
 const current=listGotArchives(store,scope);
 store.setItem(indexKey(scope),JSON.stringify(current.filter(e=>e.id!==id)));
 store.removeItem(snapshotKey(scope,id));
}
