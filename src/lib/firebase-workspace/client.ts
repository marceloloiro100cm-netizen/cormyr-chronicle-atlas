/* eslint-disable @typescript-eslint/no-explicit-any -- compatibility boundary for the original query API. */
import {firebasePilotAuth} from '../auth/firebase-pilot-session';
import type {QueryStep} from './query';
export async function workspaceRequest(input:Record<string,unknown>):Promise<any>{
 const auth=firebasePilotAuth(),uid=auth?.current()?.uid;
 const token=await auth?.getToken();
 if(auth?.current()?.uid!==uid)throw Error('Sessão alterada durante a consulta.');
 if(!token||!uid)throw Error('Entre novamente com sua conta Firebase.');
 const r=await fetch('/api/firebase-workspace',{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(input)});
 if(auth?.current()?.uid!==uid)throw Error('Sessão alterada durante a consulta.');
 if(!r.ok){
  // Fixed, reviewed wording only; never expose an untrusted provider body.
  const message=r.status===401?'Sessão Firebase expirada.':
   r.status===403?'Acesso não autorizado.':
   r.status===409?'A data ou o registro mudou. Atualize a página e confira a semana do HUB antes de repetir.':
   r.status===429?'Limite de missivas desta semana atingido.':
   r.status===501?'Esta modalidade ainda não está disponível no Firebase (por exemplo, múltiplos destinatários, rascunho, agendamento ou vínculos).':
   r.status===400?'Dados da operação inválidos. Confira os campos da missiva.':
   'Não foi possível acessar os dados operacionais do Firebase. Tente novamente após a homologação.';
  throw Object.assign(Error(message),{code:'FIREBASE_'+r.status});
 }
 const body=await r.json();
 if(auth?.current()?.uid!==uid)throw Error('Sessão alterada durante a consulta.');
 return body.result;
}
const response=async(fn:()=>Promise<any>)=>{try{return {data:await fn(),error:null};}catch(e){return {data:null,error:{message:e instanceof Error?e.message:'Firebase indisponível',code:(e as any)?.code}};}};
export function createWorkspaceClient(){
 const from=(table:string)=>{
  const steps:QueryStep[]=[];
  const builder:any=new Proxy({}, {get(_target,key){
   if(key==='then')return (resolve:any,reject:any)=>workspaceRequest({kind:'query',table,steps}).catch(e=>({data:null,error:{message:e.message,code:e.code}})).then(resolve,reject);
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
  storage:{from:()=>({createSignedUrl:unsupported,createSignedUrls:unsupported,download:unsupported,upload:unsupported,remove:unsupported})},
 };
}
