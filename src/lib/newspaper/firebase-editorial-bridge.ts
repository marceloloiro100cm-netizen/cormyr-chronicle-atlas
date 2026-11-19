/**
 * Authorized Firebase Cloud persistence for the existing Folha Sem Selo UI.
 * Imported newsroom editions are immutable; this adapter never writes them.
 */
import {firebaseWorkspaceClient} from '../firebase-workspace/state';
import {workspaceRequest} from '../firebase-workspace/client';
import {firebasePilotAuth} from '../auth/firebase-pilot-session';
import {safeNewspaperBlocks,type NewspaperEdition,type NewspaperBlock,
 type NewspaperState,type NewspaperTemplate,type NewspaperFont} from './model';

const CLOUD=/^cloud-[a-f0-9]{64}$/;
type CloudEdition={id:string;editionNo:number;title:string;subtitle:string;
 blocks:NewspaperBlock[];version:number;state:NewspaperState;
 campaignDate:string;publishedAt:string|null;template?:NewspaperTemplate;
 font_style?:NewspaperFont};
type EditorialList={items:{id:string;editionNo:number;title:string;
 state:NewspaperState;version:number}[]};
type PublishedSummary={id:string;editionNo:number};
const prohibited='Esta funcionalidade do jornal ainda requer a integração do Firebase Storage ou das configurações editoriais.';
export function isFirebaseNewspaperWorkspace(){return firebaseWorkspaceClient()!==null;}

/** Original presentation shape; no forged imported source or extra editions. */
export function originalNewspaperEdition(value:CloudEdition):NewspaperEdition{
 if(!value||!CLOUD.test(value.id)||!Number.isSafeInteger(value.editionNo)||
    value.editionNo<1||!Number.isSafeInteger(value.version)||value.version<1||
    typeof value.title!=='string'||typeof value.subtitle!=='string'||
    typeof value.campaignDate!=='string'||!Array.isArray(value.blocks)||
    !['draft','published','archived','cancelled'].includes(value.state))
  throw Error('Edição operacional do Jornal inválida.');
 return {
  id:value.id,edition_no:value.editionNo,campaign_date:value.campaignDate,
  title:value.title,subtitle:value.subtitle,
  template:value.template??'classico',font_style:value.font_style??'classico',
  state:value.state,blocks:safeNewspaperBlocks(value.blocks),pdf_path:null,
  version:value.version,publication_revision:value.publishedAt?value.version:0,
  created_by:'',updated_at:value.publishedAt??'',published_at:value.publishedAt,
  archived_at:null,cancelled_at:null,publish_on:null,
 };
}
async function request<T>(body:Record<string,unknown>):Promise<T>{
 const auth=firebasePilotAuth(),uid=auth?.current()?.uid;
 const token=await auth?.getToken();
 if(!uid||!token||auth?.current()?.uid!==uid)
  throw Error('Sessão Firebase inválida. Entre novamente.');
 const response=await fetch('/api/firebase-cloud-newspaper',{
  method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify(body),
 });
 if(auth?.current()?.uid!==uid)throw Error('Sessão alterada durante a redação.');
 if(!response.ok)throw Object.assign(Error(
  response.status===409?'Esta edição mudou. Recarregue o jornal antes de salvar.':
  response.status===403?'Seu perfil não tem permissão editorial.':
  response.status===400?'Confira os blocos, imagens, título e conteúdo antes de salvar.':
  response.status===401?'Sessão editorial expirada.':
  'Redação operacional indisponível. Seu texto não foi descartado.'
 ),{status:response.status});
 const result:unknown=await response.json();
 if(auth?.current()?.uid!==uid)throw Error('Sessão alterada durante a redação.');
 if(!result||typeof result!=='object'||!('result' in result))
  throw Error('Resposta editorial inválida.');
 return (result as {result:T}).result;
}
async function publishedRequest<T>(action:'listNewspaper'|'getNewspaper',id?:string):Promise<T>{
 const auth=firebasePilotAuth(),uid=auth?.current()?.uid,token=await auth?.getToken();
 if(!uid||!token||auth?.current()?.uid!==uid)throw Error('Sessão Firebase expirada.');
 const response=await fetch('/api/firebase-cloud-read',{
  method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify({action,...(id?{editionId:id}:{})}),
 });
 if(auth?.current()?.uid!==uid)throw Error('Sessão alterada durante a leitura do Jornal.');
 if(!response.ok)throw Object.assign(Error('Acervo publicado indisponível.'),{status:response.status});
 const body:unknown=await response.json();
 if(!body||typeof body!=='object'||!('result' in body))
  throw Error('Acervo publicado inválido.');
 return (body as {result:T}).result;
}
export async function loadFirebaseNewspaperEditions(imported:NewspaperEdition[]):Promise<NewspaperEdition[]>{
 if(!isFirebaseNewspaperWorkspace())return imported;
 // The trusted server supplies the role: no client-supplied "editor" flag.
 const identity=await workspaceRequest({kind:'auth'});
 const editorial=identity?.profile==='editor'||identity?.profile==='narrador';
 let cloud:CloudEdition[]=[];
 if(editorial){
  // Cloud editorial writes can remain safely unapproved while the immutable
  // published archive is available. Preserve historic reading in that phase.
  let status:{canPublish:boolean}|null=null;
  try{status=await request<{canPublish:boolean}>({action:'status'});}
  catch(error){
   if((error as {status?:number})?.status!==503)throw error;
  }
  if(status?.canPublish){
   const list=await request<EditorialList>({action:'listEditorial'});
   if(!Array.isArray(list.items)||list.items.length>100)
    throw Error('Histórico editorial maior que o limite de segurança.');
   cloud=await Promise.all(list.items.map(item=>{
    if(!CLOUD.test(item.id))throw Error('Identificador editorial inválido.');
    return request<CloudEdition>({action:'getEditorial',id:item.id});
   }));
  }
 }
 // Public reader and editor both see editions published by the Cloud runtime.
 // The archive source already carries historical (non-cloud) editions.
 const published=await publishedRequest<{items:PublishedSummary[]}>('listNewspaper');
 if(!Array.isArray(published.items)||published.items.length>100)
  throw Error('Acervo publicado acima do limite de segurança.');
 const ids=new Set(cloud.map(e=>e.id));
 const newPublic=published.items.filter(e=>CLOUD.test(e.id)&&!ids.has(e.id));
 const complete=await Promise.all(newPublic.map(async item=>{
  const v=await publishedRequest<CloudEdition>('getNewspaper',item.id);
  if(v.id!==item.id)throw Error('Edição publicada inconsistente.');
  return v;
 }));
 const combined=[...imported,...[...cloud,...complete].map(originalNewspaperEdition)];
 if(new Set(combined.map(x=>x.id)).size!==combined.length)
  throw Error('Identificador de edição duplicado no acervo.');
 return combined.sort((a,b)=>b.edition_no-a.edition_no||b.id.localeCompare(a.id));
}
type DraftInput={campaign_date:string;title:string;subtitle?:string;
 template:NewspaperTemplate;font_style?:NewspaperFont;blocks:NewspaperBlock[]};
type UpdateInput=DraftInput&{font_style:NewspaperFont;pdf_path:string|null;
 state:NewspaperState;publish_on?:string|null};
const content=(v:DraftInput)=>({
 title:v.title,subtitle:v.subtitle??'',template:v.template,
 font_style:v.font_style??'classico',blocks:v.blocks,
});
export async function createFirebaseNewspaperEdition(input:DraftInput):Promise<NewspaperEdition>{
 if(!isFirebaseNewspaperWorkspace())throw Error('Área Firebase não está ativa.');
 if(!input.blocks.length||input.blocks.some(b=>b.imagePath||b.commissionId))
  throw Error(prohibited);
 const saved=await request<CloudEdition>({action:'saveEdition',requestKey:crypto.randomUUID(),
  id:null,expectedVersion:0,state:'draft',content:content(input)});
 return originalNewspaperEdition(saved);
}

export async function loadFirebaseNewspaperReceipts():Promise<{
 newspaper_id:string;user_id:string;read_version:number;read_at:string;
}[]>{
 if(!isFirebaseNewspaperWorkspace())return [];
 try{
  const result=await request<{items:{
    newspaper_id:string;user_id:string;read_version:number;read_at:string;
  }[]}>({action:'getReceipts'});
  if(!Array.isArray(result.items)||result.items.length>500)
    throw Error('Recibos editoriais inválidos.');
  return result.items;
 }catch(error){
  // The immutable archive remains readable before the operational runtime
  // is released; no fake successes or writes are performed in that phase.
  if((error as {status?:number})?.status===503)return [];
  throw error;
 }
}
export async function markFirebaseNewspaperRead(id:string,read:boolean):Promise<void>{
 if(!isFirebaseNewspaperWorkspace())throw Error('Área Firebase não está ativa.');
 if(typeof id!=='string'||!/^[-a-zA-Z0-9]{1,128}$/.test(id))
  throw Error('Edição inválida.');
 await request({action:read?'markRead':'markUnread',id});
}
export async function updateFirebaseNewspaperEdition(
 current:NewspaperEdition,input:UpdateInput):Promise<NewspaperEdition>{
 if(!isFirebaseNewspaperWorkspace()||!CLOUD.test(current.id))
  throw Error('Edições históricas importadas são somente leitura no Firebase.');
 if(input.pdf_path!==null||input.publish_on!=null||
    input.blocks.some(b=>b.imagePath||b.commissionId))
  throw Error(prohibited);
 const saved=await request<CloudEdition>({action:'saveEdition',requestKey:crypto.randomUUID(),
  id:current.id,expectedVersion:current.version,state:input.state,
  content:content(input)});
 return originalNewspaperEdition(saved);
}
