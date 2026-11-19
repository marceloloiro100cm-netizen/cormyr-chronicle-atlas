import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';

type AccountAction='status'|'list'|'submit'|'completePassword';
export async function firebaseAccountRequest<T>(
 action:AccountAction,input:Record<string,unknown>={},
):Promise<T>{
 const auth=firebasePilotAuth(),uid=auth?.current()?.uid;
 const token=await auth?.getToken();
 if(!token||!uid||auth?.current()?.uid!==uid)
   throw Error('Entre novamente com sua conta Firebase.');
 const response=await fetch('/api/firebase-accounts',{
   method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
   headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
   body:JSON.stringify({action,...input}),
 });
 if(auth?.current()?.uid!==uid)throw Error('Sessão alterada durante a operação.');
 if(!response.ok){
   const message=response.status===401?'Sessão expirada. Entre novamente.':
    response.status===403?'Esta operação exige autorização válida do Narrador.':
    response.status===404?'A conta não está disponível para esta operação.':
    response.status===409?'Outra atualização alterou esta conta. Recarregue os dados e confira antes de salvar.':
    response.status===400?'Confira os dados e as permissões selecionadas.':
    'Gestão de contas Firebase ainda não está liberada ou está indisponível.';
   throw Error(message);
 }
 const raw:unknown=await response.json();
 if(!raw||typeof raw!=='object'||!('result' in raw))
   throw Error('Resposta de contas Firebase inválida.');
 return (raw as {result:T}).result;
}
