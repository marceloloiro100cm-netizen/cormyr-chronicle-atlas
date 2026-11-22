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
 };
 return messages[status]??'Falha na operação com o armazenamento do Jornal.';
}
function encodeFile(file:File):Promise<string>{
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(Error('Não foi possível ler o arquivo.'));
  reader.onload=()=>{
   const value=String(reader.result);
   const raw=value.slice(value.indexOf(',')+1);
   if(!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))reject(Error('Arquivo inválido.'));
   else resolve(raw);
  };
  reader.readAsDataURL(file);
 });
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
 if(!response.ok){
  let code:unknown=null;
  try{
   const body:unknown=await response.clone().json();
   if(body&&typeof body==='object'&&!Array.isArray(body))
    code=(body as Record<string,unknown>)['error'];
  }catch{/* A response without JSON is still an error. */}
  throw Error(newspaperMediaErrorMessage(response.status,code));
 }
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
 const max=input.kind==='commission'||input.kind==='engraving'?5*1024*1024:15*1024*1024;
 if(input.file.size<1||input.file.size>max)
  throw Error('Arquivo maior que o limite permitido.');
 const v=await call({action:'upload',kind:input.kind,
  ...(input.editionId?{editionId:input.editionId}:{}),
  ...(input.houseId?{houseId:input.houseId}:{}),
  contentType:input.file.type,dataBase64:await encodeFile(input.file)}) as {path:string};
 if(typeof v.path!=='string')throw Error('O Firebase não confirmou o arquivo.');
 return v.path;
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
