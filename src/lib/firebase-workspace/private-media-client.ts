/**
 * Ponte única de imagens privadas no workspace Firebase.
 * O navegador nunca obtém acesso direto ao bucket nem utiliza tokens Supabase.
 */
import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';

const accepted=new Set(['image/png','image/jpeg','image/webp','image/gif']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH=/^private\/[a-f0-9]{64}\/[^/\u0000-\u001f\u007f]{1,128}\/[0-9a-f-]{36}\.(?:png|jpg|webp|gif)$/i;

async function currentAuth(){
 const session=firebasePilotAuth(),uid=session?.current()?.uid;
 const token=await session?.getToken();
 if(!session||!uid||!token||uid!==session.current()?.uid)
  throw Error('Sessão Firebase encerrada. Entre novamente.');
 return {session,uid,token};
}
async function requestJson(action:'upload'|'sign',args:Record<string,unknown>){
 const {session,uid,token}=await currentAuth();
 if(controller.signal.aborted)throw Error('Leitura cancelada por tempo excedido.');
 const response=await fetch('/api/firebase-private-media',{
  method:'POST',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal,
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify({action,...args}),
 });
 if(uid!==session.current()?.uid)throw Error('Sessão alterada durante a operação.');
 if(!response.ok)throw Error(response.status===503
  ?'Armazenamento privado ainda não homologado no Firebase.'
  :'Arquivo privado indisponível ou sem permissão.');
 const data:unknown=await response.json();
 if(!data||typeof data!=='object'||!('result' in data)||
    typeof data.result!=='object'||!data.result)
  throw Error('O Firebase não confirmou o arquivo privado.');
 return data.result as Record<string,unknown>;
}
/** ID estável por operação e posição, evitando duplicações em reenvios. */
export async function mediaUploadId(mutation:string,index:number):Promise<string>{
 if(!UUID.test(mutation)||!Number.isSafeInteger(index)||index<0||index>100)
  throw Error('Identificador da imagem inválido.');
 const encoded=new TextEncoder().encode(mutation+':'+index);
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',encoded));
 const bytes=digest.slice(0,16);
 bytes[6]=(bytes[6]!&15)|64;
 bytes[8]=(bytes[8]!&63)|128;
 const hex=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),
  hex.slice(16,20),hex.slice(20)].join('-');
}
export async function mediaFileBase64(file:File):Promise<string>{
 if(!accepted.has(file.type)||file.size<1||file.size>5*1024*1024)
  throw Error('Imagem inválida para o armazenamento privado.');
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>{
   const value=String(reader.result);
   const raw=value.slice(value.indexOf(',')+1);
   if(!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))
    reject(Error('Dados da imagem inválidos.'));
   else resolve(raw);
  };
  reader.onerror=()=>reject(Error('Não foi possível ler a imagem.'));
  reader.readAsDataURL(file);
 });
}
export async function uploadFirebasePrivateImage(id:string,contentType:string,dataBase64:string):
 Promise<{path:string;duplicate:boolean}>{
 if(!UUID.test(id)||!accepted.has(contentType)||typeof dataBase64!=='string'||
    !dataBase64.length||dataBase64.length>7_000_000)
  throw Error('Arquivo privado inválido.');
 const response=await requestJson('upload',{id,contentType,dataBase64});
 if(typeof response['path']!=='string'||!PATH.test(response['path']))
  throw Error('Referência privada inválida.');
 return {path:response['path'],duplicate:response['duplicate']===true};
}
/** Caminho histórico do acervo (galeria, Corte, missivas), servido da cópia migrada. */
const LEGACY=/^[A-Za-z0-9_-][A-Za-z0-9_./-]{0,299}$/;
const PRIVATE_IMAGE_READ_TIMEOUT_MS=18_000;
export async function downloadFirebasePrivateImage(path:string):Promise<Blob>{
 const controller=new AbortController();
 let timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<never>((_,reject)=>{
  timer=setTimeout(()=>{
   reject(new Error('A imagem demorou além do limite. Tente novamente.'));
   controller.abort();
  },PRIVATE_IMAGE_READ_TIMEOUT_MS);
 });
 const read=async()=>{
 const legacy=!path.startsWith('private/');
 if(legacy?(!LEGACY.test(path)||path.includes('..')):!PATH.test(path))throw Error('Referência privada inválida.');
 const {session,uid,token}=await currentAuth();
 const response=await fetch('/api/firebase-private-media',{
  method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify({action:'download',path}),
 });
 if(uid!==session.current()?.uid)throw Error('Sessão alterada durante a leitura.');
 if(!response.ok)throw Error('Imagem privada indisponível ou sem permissão.');
 const type=response.headers.get('content-type')||'';
 if(!accepted.has(type))throw Error('Tipo de imagem não autorizado.');
 const blob=await response.blob();
 if(blob.size>(legacy?20:5)*1024*1024||blob.size<1)
  throw Error('Imagem privada inválida.');
 return blob;
 };
 return Promise.race([read(),deadline]).finally(()=>{
  if(timer!==undefined)clearTimeout(timer);
 });
}
