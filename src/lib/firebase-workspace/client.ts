/* eslint-disable @typescript-eslint/no-explicit-any -- compatibility boundary for the original query API. */
import {firebasePilotAuth} from '../auth/firebase-pilot-session';
import type {QueryStep} from './query';
type Pending={input:Record<string,unknown>;resolve:(v:any)=>void;reject:(e:unknown)=>void};
/** Fixed, reviewed wording only; never expose an untrusted provider body. */
function workspaceError(status:number,input:Record<string,unknown>,serverCode?:string):Error{
 const message=status===401?'Sessão Firebase expirada.':
  status===403?'Acesso não autorizado.':
  status===409?'A data ou o registro mudou. Atualize a página e confira a semana do HUB antes de repetir.':
  status===429?'Limite de missivas desta semana atingido.':
  status===413&&input['kind']==='houseLedgerExport'?
   'O histórico ultrapassa 1.000 lançamentos. A exportação integral exige paginação homologada; nenhum arquivo parcial foi gerado.':
  status===501?(input['name']==='dated_mail_action'
   ?'Esta modalidade de missiva ainda não está disponível no Firebase (por exemplo, múltiplos destinatários, rascunho, agendamento ou vínculos). Nada foi enviado.'
   :'Esta função ainda não está disponível no Firebase. Nada foi alterado.'):
  status===400?'Dados da operação inválidos. Confira os campos da missiva.':
  'Não foi possível acessar os dados operacionais do Firebase. Tente novamente após a homologação.';
 // Only a fixed lowercase server code (never provider text) is kept for diagnosis.
 const code=typeof serverCode==='string'&&/^[a-z_]{3,60}$/.test(serverCode)?serverCode:undefined;
 return Object.assign(Error(message),{code:'FIREBASE_'+status,...(code?{serverCode:code}:{})});
}
async function send(body:Record<string,unknown>):Promise<{ok:true;result:any}|{ok:false;status:number;serverCode?:string}>{
 const auth=firebasePilotAuth();
 const beforeUid=auth?.current()?.uid;
 const token=await auth?.getToken();
 const uid=auth?.current()?.uid;
 if((beforeUid&&beforeUid!==uid)||auth?.current()?.uid!==uid)throw Error('Sessão alterada durante a consulta.');
 if(!token||!uid)throw Error('Entre novamente com sua conta Firebase.');
 const r=await fetch('/api/firebase-workspace',{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
 if(auth?.current()?.uid!==uid)throw Error('Sessão alterada durante a consulta.');
 if(!r.ok){
  let serverCode:string|undefined;
  try{const b=await r.json();if(typeof b?.error==='string')serverCode=b.error;}catch{/* sem corpo */}
  return {ok:false,status:r.status,...(serverCode?{serverCode}:{})};
 }
 const json=await r.json();
 if(auth?.current()?.uid!==uid)throw Error('Sessão alterada durante a consulta.');
 return {ok:true,result:json.result};
}
/**
 * Consultas feitas ao mesmo tempo (mesma volta do navegador) viajam juntas
 * num único pedido ao servidor, que confere o escopo uma vez só. Cada uma
 * recebe o próprio resultado ou erro, como se tivesse ido sozinha.
 */
let queue:Pending[]=[];
let scheduled=false;
async function flush(){
 const batch=queue;queue=[];scheduled=false;
 for(let i=0;i<batch.length;i+=40){
  const part=batch.slice(i,i+40);
  void (async()=>{
   try{
    if(part.length===1){
     const only=part[0]!;
     const reply=await send(only.input);
     if(reply.ok)only.resolve(reply.result);
     else only.reject(workspaceError(reply.status,only.input,reply.serverCode));
     return;
    }
    const reply=await send({kind:'batch',items:part.map(p=>p.input)});
    if(!reply.ok){for(const p of part)p.reject(workspaceError(reply.status,p.input,reply.serverCode));return;}
    const results=reply.result;
    if(!Array.isArray(results)||results.length!==part.length)
     throw Error('Resposta do Firebase incompleta.');
    part.forEach((p,index)=>{
     const item=results[index];
     if(item?.ok===true)p.resolve(item.result);
     else p.reject(workspaceError(Number(item?.status)||503,p.input,item?.code));
    });
   }catch(e){for(const p of part)p.reject(e);}
  })();
 }
}
export function workspaceRequest(input:Record<string,unknown>):Promise<any>{
 return new Promise((resolve,reject)=>{
  queue.push({input,resolve,reject});
  if(!scheduled){scheduled=true;queueMicrotask(()=>{void flush();});}
 });
}
const response=async(fn:()=>Promise<any>)=>{try{return {data:await fn(),error:null};}catch(e){return {data:null,error:{message:e instanceof Error?e.message:'Firebase indisponível',code:(e as any)?.code,serverCode:(e as any)?.serverCode}};}};

async function privateMediaRequest(input:Record<string,unknown>,binary=false){
 const auth=firebasePilotAuth(),beforeUid=auth?.current()?.uid;
 const token=await auth?.getToken(),uid=auth?.current()?.uid;
 if(!token||!uid||(beforeUid&&beforeUid!==uid)||auth?.current()?.uid!==uid)throw Error('Sessão Firebase inválida.');
 const response=await fetch('/api/firebase-private-media',{
  method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify(input),
 });
 if(auth?.current()?.uid!==uid)throw Error('Sessão alterada durante a leitura.');
 if(!response.ok)throw Error(response.status===403?'Imagem não autorizada.':
  response.status===404?'Imagem não localizada.':
  response.status===413?'Imagem maior que o limite de 5 MB.':
  response.status===501||response.status===503?
   'Arquivos privados ainda não homologados no Firebase.':
   'Não foi possível acessar o arquivo privado.');
 if(binary)return response.blob();
 const result:unknown=await response.json();
 if(!result||typeof result!=='object'||!('result' in result))
  throw Error('Resposta de arquivo inválida.');
 return (result as {result:unknown}).result;
}
async function privateMediaUuid(path:string):Promise<string>{
 const result=new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(path)));
 result[6]=(result[6]!&15)|64;result[8]=(result[8]!&63)|128;
 const hex=[...result.slice(0,16)].map(b=>b.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),
  hex.slice(16,20),hex.slice(20,32)].join('-');
}
function toBase64(file:Blob):Promise<string>{
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>{
   const v=reader.result;
   if(typeof v!=='string'||!v.startsWith('data:')||!v.includes(','))
    reject(Error('Imagem inválida.'));
   else resolve(v.slice(v.indexOf(',')+1));
  };
  reader.onerror=()=>reject(Error('Não foi possível ler a imagem.'));
  reader.readAsDataURL(file);
 });
}
function workspaceStorage(){
 const upload=async(path:string,file:File|Blob)=>{
  try{
   if(!path||file.size>5*1024*1024||file.size===0)
    throw Error('Imagem inválida ou maior que 5 MB.');
   const id=await privateMediaUuid(path);
   const data=await privateMediaRequest({action:'upload',id,
    contentType:file.type,dataBase64:await toBase64(file)}) as
      {path:string;duplicate:boolean};
   return {data:{path:data.path},error:null};
  }catch(e){return {data:null,error:{message:e instanceof Error?e.message:'Falha no envio.'}};}
 };
 const download=async(path:string)=>{
  try{
   const data=await privateMediaRequest({action:'download',path},true) as Blob;
   return {data,error:null};
  }catch(e){return {data:null,error:{message:e instanceof Error?e.message:'Arquivo indisponível.'}};}
 };
 const createSignedUrl=async(path:string,_expires?:number)=>{
  try{
   const data=await privateMediaRequest({action:'sign',path}) as {signedUrl:string};
   return {data:{signedUrl:data.signedUrl},error:null};
  }catch(e){return {data:null,error:{message:e instanceof Error?e.message:'Arquivo indisponível.'}};}
 };
 return {upload,download,createSignedUrl,
  createSignedUrls:async(paths:string[])=>{
   const items=await Promise.all(paths.map(path=>createSignedUrl(path)));
   return {data:items.map((item,i)=>({path:paths[i],
    signedUrl:item.data?.signedUrl??null,error:item.error??null})),error:null};
  },
  remove:async()=>({data:null,error:{message:'Remoção de arquivos não autorizada no Firebase.'}}),
 };
}

export function createWorkspaceClient(){
 const from=(table:string)=>{
  const steps:QueryStep[]=[];
  const builder:any=new Proxy({}, {get(_target,key){
   if(key==='then')return (resolve:any,reject:any)=>workspaceRequest({kind:'query',table,steps}).catch(e=>({data:null,error:{message:e.message,code:e.code,serverCode:e.serverCode}})).then(resolve,reject);
   return (...args:any[])=>{steps.push({op:String(key),args:key==='abortSignal'?[]:args});return builder;};
  }});return builder;
 };
 const channel=()=>({on(){return this;},subscribe(){return this;},unsubscribe:async()=>undefined});
 const unsupported=async()=>({data:null,error:{message:'Operação de arquivo ainda não disponível no Firebase.'}});
 return {from,rpc:(name:string,args:Record<string,unknown>={})=>{
   const p:any=response(()=>workspaceRequest({kind:'rpc',name,args}));
   p.single=()=>p;p.maybeSingle=()=>p;return p;
  },auth:{
   getUser:async()=>{const r=await response(()=>workspaceRequest({kind:'auth'}));return {data:{user:r.data?.user??null},error:r.error};},
   getSession:async()=>{const r=await response(()=>workspaceRequest({kind:'auth'}));return {data:{session:r.data?{user:r.data.user,access_token:await firebasePilotAuth()?.getToken()}:null},error:r.error};},
   onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
   signOut:async()=>{firebasePilotAuth()?.signOut();return {error:null};},
   updateUser:unsupported,
  },channel,removeChannel:async()=>undefined,removeAllChannels:async()=>undefined,
  storage:{from:(bucket:string)=>bucket==='campaign-images'?workspaceStorage():({createSignedUrl:unsupported,createSignedUrls:unsupported,download:unsupported,upload:unsupported,remove:unsupported})},
 };
}
