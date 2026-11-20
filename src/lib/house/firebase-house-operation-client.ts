import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';
import type {HouseAction} from './operation-core';

export type HouseOperationRequest={houseId:string;version:number;
 key:string;action:HouseAction;args:Record<string,unknown>;explanation:string};
export type HouseOperationReply={houseId:string;version:number;action:string;
 duplicate:boolean;ledgerId:string};
export async function submitFirebaseHouseOperation(
 request:HouseOperationRequest,
):Promise<HouseOperationReply>{
 const auth=firebasePilotAuth(),uid=auth?.current()?.uid;
 const token=await auth?.getToken();
 if(!uid||!token||uid!==auth?.current()?.uid)
  throw Error('Sessão Firebase encerrada. Entre novamente.');
 const response=await fetch('/api/firebase-house-operation',{
  method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify(request),
 });
 if(uid!==auth?.current()?.uid)
  throw Error('A sessão mudou durante a operação. Recarregue a Ficha.');
 if(!response.ok){
  let code='';
  try{
   const v:unknown=await response.json();
   if(v&&typeof v==='object'&&'error' in v&&typeof v.error==='string')
    code=v.error;
  }catch{/* Nunca confiar no texto de resposta externa. */}
  if(response.status===409){
   if(code==='house_version_conflict')
    throw Error('A ficha foi alterada por outro jogador ou pelo Narrador. Recarregue antes de salvar.');
   if(code==='house_operation_key_conflict')
    throw Error('A chave de operação já foi usada com outros dados. Nada foi alterado.');
   throw Error('A ficha ou o calendário mudou. Recarregue e revise a operação.');
  }
  if(response.status===403)
   throw Error('Você não tem permissão de edição para esta Casa.');
  if(response.status===501)
   throw Error('Esta ação ainda não foi migrada para o Firebase. Nada foi gravado.');
  if(response.status===503)
   throw Error('A gravação desta Ficha ainda não foi homologada no Firebase. Nada foi gravado.');
  if(response.status===401)
   throw Error('Sua sessão expirou. Entre novamente.');
  throw Error('Não foi possível concluir a operação no Firebase. Nada foi confirmado.');
 }
 const v:unknown=await response.json();
 if(!v||typeof v!=='object'||!('result' in v))
  throw Error('O Firebase retornou uma confirmação inválida.');
 return (v as {result:HouseOperationReply}).result;
}
