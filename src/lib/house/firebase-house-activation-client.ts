/**
 * Narrator-only House activation client. One authorized Firestore transaction
 * per House, not a potentially timed-out multi-House HTTP request.
 * All errors are mapped from fixed server codes; no raw remote messages.
 */
export type HouseActivationProgress={
 total:number;processed:number;activated:number;alreadyInitialized:number;
 needsReview:number;results:{houseId:string;status:string}[];
};
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const SAFE_CODE=/^[a-z_]{1,64}$/;

export const HOUSE_ACTIVATION_MESSAGES:Record<string,string>={
 authentication_required:'Sua sessão Firebase expirou. Entre novamente como Narrador.',
 narrator_required:'Esta conta não está autorizada como Narrador para ativar Casas.',
 access_denied:'A solicitação foi bloqueada pela proteção de origem.',
 house_activation_disabled:'A ativação de Casas está desabilitada nesta revisão do Firebase.',
 house_activation_unavailable:'O serviço de ativação está indisponível. Nenhuma ativação foi confirmada por esta resposta.',
 house_access_unavailable:'O servidor não conseguiu validar o perfil de Narrador no Firestore.',
 house_catalog_unavailable:'O servidor não conseguiu consultar o catálogo de Casas no Firestore.',
 publish_campaign_first:'Publique primeiro o HUB oficial e confirme que o Firebase é a fonte da campanha.',
 calendar_unavailable:'O calendário operacional da campanha está indisponível.',
 source_stage_unavailable:'As etapas históricas de importação ainda não estão prontas.',
 house_source_unavailable:'A ficha importada desta Casa não está disponível.',
 source_review_required:'Confira novamente a versão e os dados da ficha importada.',
 source_version_conflict:'A ficha mudou desde a conferência. Revise antes de ativar.',
 calendar_mismatch:'O mês da ficha não corresponde ao calendário homologado.',
 source_unusable:'A ficha importada tem campos ou saldos incompatíveis com o motor de regras.',
 treasury_invalid:'O Tesouro da ficha importada não passou na conferência.',
 state_exceeds_firestore_budget:'A ficha excede o limite seguro de armazenamento.',
 existing_document_requires_review:'Já há documentos operacionais parciais. A ativação não sobrescreveu nenhum.',
 house_month_catch_up_failed:'Não foi possível reconciliar o mês da ficha sem alterar a origem.',
 house_activation_invalid_response:'O Firebase retornou um resultado de ativação inválido.',
};
export function houseActivationMessage(code:string,status=0):string{
 return HOUSE_ACTIVATION_MESSAGES[code]??
  (status===401?HOUSE_ACTIVATION_MESSAGES['authentication_required']!:
   status===403?HOUSE_ACTIVATION_MESSAGES['narrator_required']!:
   status===503?'O Firebase não confirmou a ativação. Revise o serviço e o acesso ao Firestore.':
   status===409?'O calendário ou a origem mudou. Atualize antes de tentar novamente.':
   'A ativação não foi confirmada. Nenhuma gravação adicional será tentada.');
}
export class HouseActivationClientError extends Error{
 constructor(readonly code:string,readonly status:number,readonly progress?:HouseActivationProgress){
  super(houseActivationMessage(code,status));
  this.name='HouseActivationClientError';
 }
}
const object=(v:unknown):v is Record<string,unknown>=>
 !!v&&typeof v==='object'&&!Array.isArray(v);
const safeStatus=(v:unknown):string=>
 typeof v==='string'&&SAFE_CODE.test(v)?v:'house_activation_invalid_response';

export async function activateImportedHouses({
 token,fetcher=fetch,onProgress,
}:{
 token:string;fetcher?:typeof fetch;onProgress?:(progress:HouseActivationProgress)=>void;
}):Promise<HouseActivationProgress>{
 if(typeof token!=='string'||token.length<10)
  throw new HouseActivationClientError('authentication_required',401);
 async function request(payload:Record<string,unknown>):Promise<unknown>{
  let response:Response;
  try{
   response=await fetcher('/api/firebase-house-activation',{
    method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify(payload),
   });
  }catch{throw new HouseActivationClientError('house_activation_unavailable',503);}
  let body:unknown;
  try{body=await response.json();}
  catch{throw new HouseActivationClientError('house_activation_invalid_response',response.status);}
  if(!response.ok){
   const code=object(body)&&typeof body['error']==='string'&&SAFE_CODE.test(body['error'])
    ?body['error']:'house_activation_unavailable';
   throw new HouseActivationClientError(code,response.status);
  }
  if(!object(body)||!('result' in body))
   throw new HouseActivationClientError('house_activation_invalid_response',503);
  return body['result'];
 }
 const raw=await request({action:'list'});
 if(!object(raw)||!Array.isArray(raw['houseIds'])||
    raw['houseIds'].length>50||
    !raw['houseIds'].every((x:unknown)=>typeof x==='string'&&ID.test(x))||
    new Set(raw['houseIds']).size!==raw['houseIds'].length)
  throw new HouseActivationClientError('house_activation_invalid_response',503);
 const houseIds=raw['houseIds'] as string[];
 const progress:HouseActivationProgress={
  total:houseIds.length,processed:0,activated:0,alreadyInitialized:0,
  needsReview:0,results:[],
 };
 for(const houseId of houseIds){
  let status='house_activation_invalid_response';
  try{
   const inspected=await request({action:'inspect',houseId});
   if(!object(inspected)||inspected['houseId']!==houseId)
    throw new HouseActivationClientError('house_activation_invalid_response',503);
   status=safeStatus(inspected['status']);
   if(status==='ready_for_operator_review'){
    const preview=inspected['preview'];
    if(!object(preview)||!Number.isSafeInteger(preview['sourceSheetVersion'])||
       typeof inspected['sourceHash']!=='string'||!HASH.test(inspected['sourceHash']))
     throw new HouseActivationClientError('house_activation_invalid_response',503);
    const activated=await request({action:'activate',houseId,
     expectedSourceVersion:preview['sourceSheetVersion'],
     expectedSourceHash:inspected['sourceHash']});
    if(!object(activated)||activated['houseId']!==houseId)
     throw new HouseActivationClientError('house_activation_invalid_response',503);
    status=safeStatus(activated['status']);
   }
  }catch(e){
   if(!(e instanceof HouseActivationClientError))throw e;
   if(e.status===401||e.status===403||e.status===503){
    // A server outage may follow previous successful Houses; show the
    // confirmed partial result rather than pretending no work occurred.
    throw new HouseActivationClientError(e.code,e.status,{
     ...progress,results:[...progress.results],
    });
   }
   status=e.code;
  }
  progress.results.push({houseId,status});
  progress.processed++;
  if(status==='activated')progress.activated++;
  else if(status==='already_initialized')progress.alreadyInitialized++;
  else progress.needsReview++;
  onProgress?.({...progress,results:[...progress.results]});
 }
 return {...progress,results:[...progress.results]};
}
