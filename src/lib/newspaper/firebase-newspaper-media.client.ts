import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';

type Kind='editionImage'|'editionPdf'|'commission'|'engraving';

/** Only fixed, non-sensitive error codes returned by the server may be
 * translated into a more specific troubleshooting message. Never print
 * provider errors, IAM identities, paths, or raw response content. */
export function newspaperMediaErrorMessage(status:number,code:unknown):string{
 if(status===503){
  switch(code){
   case 'newspaper_media_disabled':
    return 'A rota de mídias do Jornal não está habilitada nesta revisão do Firebase App Hosting.';
   case 'media_not_approved':
    return 'O Jornal não está autorizado a gravar no Firebase. O Narrador deve verificar em Contas as aprovações operacionais do Jornal.';
   case 'media_storage_permission_denied':
    return 'O Firebase App Hosting não tem permissão para gravar no bucket do Jornal. É necessário revisar o IAM da conta de serviço do backend, sem tornar o bucket público.';
   case 'media_storage_unavailable':
    return 'Falha no acesso ao Firebase Storage. Nenhum registro da gravura foi confirmado; tente novamente após verificar o serviço.';
   case 'media_registry_unavailable':
    return 'O arquivo pode ter chegado ao Storage, mas o registro da gravura falhou no Firestore. Preserve o original e solicite auditoria antes de repetir muitos envios.';
   case 'migration_stage_not_ready':
    return 'O serviço de autenticação da migração ainda não está pronto para enviar imagens. Verifique os estágios Auth/Domain do Firebase.';
   case 'invalid_server_configuration':
   case 'cloud_read_disabled':
   case 'media_not_ready':
   case 'media_sdk_initialization_failed':
   case 'media_service_initialization_failed':
    return 'O serviço Firebase do Jornal não inicializou corretamente na revisão publicada. É necessário revisar a configuração do servidor.';
   case 'media_runtime_lookup_failed':
    return 'O Jornal não conseguiu consultar suas aprovações no Firestore. Verifique a conexão e as permissões de leitura do App Hosting.';
   case 'media_scope_backend_unavailable':
    return 'O Jornal não conseguiu verificar sua sessão no serviço Firebase. Verifique a autenticação do backend; nenhuma imagem foi confirmada.';
   case 'media_parse_backend_unavailable':
    return 'A API do Jornal falhou ao receber o arquivo. Verifique o limite da requisição e o servidor.';
   case 'media_operation_unavailable':
    return 'O envio falhou em uma operação interna do Firebase, antes de ser confirmado. Verifique os logs do App Hosting para a etapa exata.';
   case 'media_integrity':
    return 'O objeto no Storage não corresponde ao registro original. Preserve o arquivo e solicite reconciliação.';
   case 'media_503_no_handler':
    return 'O gateway do App Hosting retornou HTTP 503 sem resposta da API do Jornal. Verifique a instância, a revisão e os logs de infraestrutura; isso não comprova falha de permissão.';
   case 'media_503_unexpected_reply':
    return 'A API do Jornal respondeu HTTP 503 em formato inesperado. O arquivo não foi confirmado; verifique os logs do servidor.';
   default:
    return 'Serviço de mídia do Jornal indisponível (HTTP 503). A causa precisa ser verificada no Firebase; isso não comprova falta de autorização.';
  }
 }
 const messages:Record<number,string>={
  400:'O formato do arquivo ou o vínculo com a edição é inválido.',
  401:'Sessão Firebase expirada. Entre novamente.',
  403:'Sua conta não tem acesso a este arquivo.',
  404:'Arquivo ainda não disponível no Firebase Storage.',
  409:'A edição mudou ou já foi publicada. Reabra um rascunho.',
  413:'Arquivo acima do limite permitido.',
  415:'Envie um arquivo PNG, JPG, WebP ou PDF válido.',
  500:'Erro interno ao processar a gravura. Preserve o arquivo e verifique o App Hosting.',
  502:'O gateway do App Hosting não recebeu uma resposta válida do serviço de imagens.',
  504:'O serviço de imagens não respondeu dentro do prazo do gateway.',
 };
 return messages[status]??'Falha na operação com o armazenamento do Jornal.';
}
const SAFE_503=new Set([
 'newspaper_media_unavailable','newspaper_media_disabled','media_not_approved',
 'media_storage_permission_denied','media_storage_unavailable','media_registry_unavailable',
 'migration_stage_not_ready','invalid_server_configuration','cloud_read_disabled',
 'media_not_ready','media_sdk_initialization_failed','media_service_initialization_failed',
 'media_runtime_lookup_failed','media_scope_backend_unavailable',
 'media_parse_backend_unavailable','media_operation_unavailable','media_integrity',
]);
export function newspaperMediaDiagnosticCode(status:number,raw:unknown,handlerReached?:boolean):string|null{
 if(status!==503)return null;
 if(typeof raw==='string'&&SAFE_503.has(raw))return raw;
 if(handlerReached===false)return 'media_503_no_handler';
 if(handlerReached===true)return 'media_503_unexpected_reply';
 return 'http_503_unclassified';
}
/** One safe decoder for JSON errors from the API and opaque gateway errors. */
async function mediaFailure(response:Response):Promise<Error>{
 let code:unknown=null;
 try{
  const value:unknown=await response.clone().json();
  if(value&&typeof value==='object'&&!Array.isArray(value))
   code=(value as Record<string,unknown>)['error'];
 }catch{/* Gateway responses may be HTML or empty. */}
 const reached=response.headers.get('x-cormyr-media-handler')==='v2';
 const detail=newspaperMediaDiagnosticCode(response.status,code,reached);
 const message=newspaperMediaErrorMessage(response.status,detail??code);
 return Error(detail?message+' (Diagnóstico: '+detail+')':message);
}
/** Media bytes travel unchanged, without 33% base64 expansion or JSON
 * decoding on the frontend/server. The bearer remains a same-origin header. */
type UploadInput={
 kind:Kind;file:File;editionId?:string;houseId?:string;
 name?:string;requestKey?:string;registerEngraving?:boolean;
};
async function uploadRaw(input:UploadInput):Promise<{path:string;engravingId?:string}>{
 const max=input.kind==='commission'||input.kind==='engraving'?5*1024*1024:15*1024*1024;
 if(input.file.size<1||input.file.size>max)
  throw Error('Arquivo maior que o limite permitido.');
 if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(input.file.type))
  throw Error('Formato inválido. Use PNG, JPG, WebP ou PDF.');
 const auth=firebasePilotAuth(),uid=auth?.current()?.uid;
 const token=await auth?.getToken();
 if(!uid||!token||auth?.current()?.uid!==uid)
  throw Error('Sua sessão Firebase expirou. Entre novamente.');
 const headers:Record<string,string>={
  'Authorization':'Bearer '+token,
  'Content-Type':input.file.type,
  'X-Cormyr-Media-Action':'upload',
  'X-Cormyr-Media-Kind':input.kind,
 };
 if(input.editionId)headers['X-Cormyr-Media-Edition']=input.editionId;
 if(input.houseId)headers['X-Cormyr-Media-House']=input.houseId;
 if(input.name!==undefined)headers['X-Cormyr-Media-Name']=encodeURIComponent(input.name);
 if(input.requestKey)headers['X-Cormyr-Media-Request-Key']=input.requestKey;
 if(input.registerEngraving)headers['X-Cormyr-Media-Atomic-Engraving']='true';
 const response=await fetch('/api/firebase-newspaper-media',{
  method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
  headers,body:input.file,
 });
 if(auth?.current()?.uid!==uid)throw Error('Sessão alterada durante o envio.');
 if(!response.ok)throw await mediaFailure(response);
 const value:unknown=await response.json();
 if(!value||typeof value!=='object'||!('result' in value)||
    !value.result||typeof value.result!=='object')
  throw Error('O Firebase não confirmou o arquivo.');
 const result=value.result as Record<string,unknown>;
 if(typeof result['path']!=='string'||!isFirebaseNewspaperMediaPath(result['path']))
  throw Error('O Firebase devolveu um caminho inválido para o arquivo.');
 return {path:result['path'],
  ...(typeof result['engravingId']==='string'?{engravingId:result['engravingId']}:{})};
}
async function call(body:Record<string,unknown>,binary=false):Promise<any>{
 const auth=firebasePilotAuth(),uid=auth?.current()?.uid;
 const token=await auth?.getToken();
 if(!uid||!token||auth?.current()?.uid!==uid)
  throw Error('Sua sessão Firebase expirou. Entre novamente.');
 const response=await fetch('/api/firebase-newspaper-media',{
  method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify(body),
 });
 if(auth?.current()?.uid!==uid)throw Error('Sessão alterada durante o envio.');
 if(!response.ok)throw await mediaFailure(response);
 if(binary){
  const blob=await response.blob();
  if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(blob.type))
   throw Error('O Firebase devolveu um arquivo inválido.');
  return URL.createObjectURL(blob);
 }
 const value:unknown=await response.json();
 if(!value||typeof value!=='object'||!('result' in value))
  throw Error('O Firebase devolveu uma resposta editorial inválida.');
 return (value as {result:unknown}).result;
}
export async function uploadFirebaseNewspaperMedia(input:{
 kind:Kind;file:File;editionId?:string;houseId?:string;
}):Promise<string>{
 return (await uploadRaw(input)).path;
}
/** One authenticated operation confirms BOTH Storage and the catalogue row.
 * Retrying the same request key resumes an interrupted attempt idempotently. */
export async function uploadFirebaseEngraving(
 file:File,name:string,requestKey:string,
):Promise<{path:string;engravingId:string}>{
 const result=await uploadRaw({kind:'engraving',file,name,requestKey,registerEngraving:true});
 if(typeof result.engravingId!=='string'||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(result.engravingId))
  throw Error('O Firebase não confirmou o registro da gravura.');
 return {path:result.path,engravingId:result.engravingId};
}
export async function readFirebaseNewspaperMedia(path:string):Promise<string>{
 return call({action:'read',path},true) as Promise<string>;
}
export async function cloneFirebaseNewspaperMedia(sourcePath:string,editionId:string,commissionId?:string):Promise<string>{
 const v=await call({action:'clone',sourcePath,editionId,
  ...(commissionId?{commissionId}:{})}) as {path:string};
 if(typeof v.path!=='string')throw Error('O Firebase não confirmou a cópia da imagem.');
 return v.path;
}
export function isFirebaseNewspaperMediaPath(path:string):boolean{
 return /^newspaper-media\/[a-f0-9]{64}\/(?:editionImage|editionPdf|commission|engraving)\/[0-9a-f-]{36}\.(?:pdf|png|jpg|webp)$/.test(path);
}
