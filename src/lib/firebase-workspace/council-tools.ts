import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';

/** Acesso HTTPS à API Firebase já existente. Nenhum Firestore privado
 * ou perfil é confiado ao navegador: as rotas validam o token e os vínculos.
 */
export type CouncilEndpoint=
  '/api/firebase-cloud-read'|
  '/api/firebase-cloud-house-quote'|
  '/api/firebase-operational-economy'|
  '/api/firebase-cloud-treasury';

export async function councilCloudRequest<T>(
  endpoint:CouncilEndpoint,body:Record<string,unknown>,
):Promise<T>{
  const token=await firebasePilotAuth()?.getToken();
  if(!token)throw Error('Entre novamente com sua conta Firebase.');
  const response=await fetch(endpoint,{
    method:'POST',credentials:'omit',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify(body),
  });
  if(!response.ok){
    const message=response.status===401?'Sessão Firebase expirada. Entre novamente.':
      response.status===403?'Seu perfil ou vínculo com esta Casa não autoriza esta operação.':
      response.status===404?'O registro consultado não foi localizado.':
      response.status===409?'Versão desatualizada ou chave de operação já utilizada. Atualize a consulta.':
      response.status===400?'Dados inválidos. Confira os campos e tente novamente.':
      'Função Firebase não liberada ou temporariamente indisponível.';
    throw Error(message);
  }
  const payload:unknown=await response.json();
  if(!payload||typeof payload!=='object'||!('result' in payload))
    throw Error('Resposta inesperada do servidor Firebase.');
  return (payload as {result:T}).result;
}
