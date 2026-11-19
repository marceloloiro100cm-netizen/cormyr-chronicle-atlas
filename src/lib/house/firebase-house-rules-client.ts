import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';
export async function saveFirebaseHouseRule(input:{
 houseId:string;requestKey:string;expectedVersion:number;
 definition:Record<string,unknown>;
}):Promise<{message:string;itemId:string;version:number;duplicate:boolean}>{
 const auth=firebasePilotAuth(),uid=auth?.current()?.uid;
 const token=await auth?.getToken();
 if(!token||!uid||uid!==auth?.current()?.uid)
  throw Error('Entre novamente com sua conta Firebase.');
 const response=await fetch('/api/firebase-house-rules',{
  method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify({action:'save',...input}),
 });
 if(uid!==auth?.current()?.uid)throw Error('Sessão alterada. Entre novamente.');
 if(!response.ok)throw Error(response.status===403
  ?'Somente o Narrador pode alterar regras da Casa.':
   response.status===409?'A regra mudou. Recarregue o catálogo antes de editar.':
   response.status===503?'Regras da Casa ainda não homologadas no Firebase. Nenhuma alteração foi realizada.':
   'Não foi possível salvar a regra desta Casa.');
 const body:unknown=await response.json();
 if(!body||typeof body!=='object'||!('result' in body))
  throw Error('Resposta inválida do Firebase.');
 return (body as {result:{message:string;itemId:string;version:number;duplicate:boolean}}).result;
}
