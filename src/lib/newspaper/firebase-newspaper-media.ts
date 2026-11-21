import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';

type Kind='editionImage'|'editionPdf'|'commission'|'engraving';
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
  const messages:Record<number,string>={
   400:'O formato do arquivo ou o vínculo com a edição é inválido.',
   401:'Sessão Firebase expirada. Entre novamente.',
   403:'Sua conta não tem acesso a este arquivo.',
   404:'Arquivo ainda não disponível no Firebase Storage.',
   409:'A edição mudou ou já foi publicada. Reabra um rascunho.',
   413:'Arquivo acima do limite permitido.',
   415:'Envie um arquivo PNG, JPG, WebP ou PDF válido.',
   503:'O armazenamento editorial do Firebase ainda não está autorizado nesta implantação.',
  };
  throw Error(messages[response.status]??'Falha na operação com o armazenamento do Jornal.');
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
