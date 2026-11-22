/**
 * Authorized Firebase Cloud persistence for the existing Folha Sem Selo UI.
 * Imported newsroom editions are immutable; this adapter never writes them.
 */
import {firebaseWorkspaceClient} from '../firebase-workspace/state';
import {workspaceRequest} from '../firebase-workspace/client';
import {firebasePilotAuth} from '../auth/firebase-pilot-session';
import {safeNewspaperBlocks,type NewspaperEdition,type NewspaperBlock,type NewspaperRevision,
 type NewspaperState,type NewspaperTemplate,type NewspaperFont} from './model';

const CLOUD=/^cloud-[a-f0-9]{64}$/;
type CloudEdition={id:string;editionNo:number;title:string;subtitle:string;
 blocks:NewspaperBlock[];pdfPath?:string|null;publishOn?:string|null;version:number;state:NewspaperState;
 campaignDate:string;publishedAt:string|null;template?:NewspaperTemplate;
 font_style?:NewspaperFont};
type EditorialList={nextOfficialEditionNo?:number;items:{id:string;editionNo:number;title:string;
 state:NewspaperState;version:number}[]};
type PublishedSummary={id:string;editionNo:number};
type HistoricalDraft={id:string;editionNo:number;sourceVersion:number;
  title:string;subtitle:string;template:NewspaperTemplate;font_style:NewspaperFont;
  blocks:NewspaperBlock[];version:number;state:'draft';campaignDate:string};
const HISTORICAL_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  state:value.state,blocks:safeNewspaperBlocks(value.blocks),pdf_path:value.pdfPath??null,
  publish_on:value.publishOn??null,
  version:value.version,publication_revision:value.publishedAt?value.version:0,
  created_by:'',updated_at:value.publishedAt??'',published_at:value.publishedAt,
  archived_at:null,cancelled_at:null,
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
 // Limite semanal definido pelo Narrador no Hub Temporal (Ajustes).
 const code=response.ok?'':await (async()=>{
  try{
   const b:unknown=await response.clone().json();
   return b&&typeof b==='object'&&'error' in b?String((b as {error:unknown}).error):'';
  }catch{return '';}
 })();
 if(!response.ok)throw Object.assign(Error(
  code==='weekly_edition_limit'?'A Folha já publicou a edição desta semana. O Narrador limitou o Jornal a uma edição por semana.':
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
 let historicDrafts:HistoricalDraft[]=[];
 let nextOfficialNumber:number|null=null;
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
   if(Number.isSafeInteger(list.nextOfficialEditionNo)&&list.nextOfficialEditionNo!>=1)
    nextOfficialNumber=list.nextOfficialEditionNo!;
   cloud=await Promise.all(list.items.map(item=>{
    if(!CLOUD.test(item.id))throw Error('Identificador editorial inválido.');
    return request<CloudEdition>({action:'getEditorial',id:item.id});
   }));
   const legacy=await request<{items:HistoricalDraft[]}>({action:'listHistoricalDrafts'});
   if(!Array.isArray(legacy.items)||legacy.items.length>100)
    throw Error('Cópias operacionais do Jornal acima do limite de segurança.');
   historicDrafts=legacy.items;
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
 // The approved reader stage is the authoritative allowlist for players.
 // Staged import rows alone must not expose an unreviewed newspaper edition.
 const reviewedHistoricIds=new Set(published.items.filter(item=>
  item&&typeof item.id==='string'&&!CLOUD.test(item.id)).map(item=>item.id));
 const history=editorial?imported:imported.filter(item=>
  reviewedHistoricIds.has(item.id)&&['published','archived'].includes(item.state));
 // Imported editorial rows can be absent from a partial workspace projection
 // even while the two independently reviewed issues remain public. Recover
 // their read-only canvas from the public allowlist, never duplicate IDs.
 const missing=editorial?published.items.filter(item=>
  item&&typeof item.id==='string'&&!CLOUD.test(item.id)&&
  !history.some(edition=>edition.id===item.id)):[];
 const recovered=await Promise.all(missing.map(async item=>{
  if(!HISTORICAL_ID.test(item.id)||!Number.isSafeInteger(item.editionNo))
   throw Error('Identificador histórico de publicação inválido.');
  const response=await fetch('/api/public/newspaper?edicao='+encodeURIComponent(item.id),{
   credentials:'omit',cache:'no-store',redirect:'error',
  });
  if(!response.ok)throw Error('A edição publicada não pôde ser restaurada para o arquivo editorial.');
  const value:unknown=await response.json();
  if(!value||typeof value!=='object')throw Error('Publicação histórica inválida.');
  const v=value as Record<string,unknown>;
  if(v.id!==item.id||v.editionNo!==item.editionNo||
     !Array.isArray(v.blocks)||typeof v.title!=='string'||
     typeof v.campaignDate!=='string')
   throw Error('A edição pública diverge do registro histórico.');
  const edition:NewspaperEdition={
   id:item.id,edition_no:item.editionNo,campaign_date:v.campaignDate,
   title:v.title,subtitle:typeof v.subtitle==='string'?v.subtitle:'',
   template:'classico',font_style:'classico',
   state:'published',blocks:safeNewspaperBlocks(v.blocks as NewspaperBlock[]),
   pdf_path:null,publish_on:null,
   version:typeof v.version==='number'&&Number.isSafeInteger(v.version)&&v.version>0?v.version:1,
   publication_revision:typeof v.version==='number'&&Number.isSafeInteger(v.version)&&v.version>0?v.version:1,
   created_by:'',updated_at:'',published_at:typeof v.publishedAt==='string'?v.publishedAt:null,
   archived_at:null,cancelled_at:null,
  };
  return edition;
 }));
 const originals=new Map(history.map(e=>[e.id,e]));
 const seenHistoric=new Set<string>();
 const editableHistory=history.map(e=>{
  const overlay=historicDrafts.find(x=>x.id===e.id);
  if(!overlay)return e;
  if(seenHistoric.has(overlay.id)||!HISTORICAL_ID.test(e.id)||
     e.state!=='draft'||overlay.state!=='draft'||
     overlay.sourceVersion!==e.version||overlay.editionNo!==e.edition_no||
     !Number.isSafeInteger(overlay.version)||overlay.version<=e.version||
     !Array.isArray(overlay.blocks))throw Error('Versão operacional histórica inconsistente.');
  seenHistoric.add(overlay.id);
  return {...e,title:overlay.title,subtitle:overlay.subtitle,
   template:overlay.template,font_style:overlay.font_style,
   campaign_date:overlay.campaignDate,blocks:safeNewspaperBlocks(overlay.blocks),
   version:overlay.version};
 });
 if(historicDrafts.some(o=>!originals.has(o.id)||!seenHistoric.has(o.id)))
  throw Error('Cópia histórica sem edição original. Acervo preservado.');
 const combined=[...editableHistory,...recovered,...[...cloud,...complete].map(originalNewspaperEdition)]
  .map(edition=>nextOfficialNumber!==null&&CLOUD.test(edition.id)&&edition.state==='draft'&&
   edition.published_at===null?{...edition,edition_no:nextOfficialNumber}:edition);
 if(new Set(combined.map(x=>x.id)).size!==combined.length)
  throw Error('Identificador de edição duplicado no acervo.');
 return combined.sort((a,b)=>b.edition_no-a.edition_no||b.id.localeCompare(a.id));
}
type DraftInput={campaign_date:string;title:string;subtitle?:string;pdf_path?:string|null;publish_on?:string|null;
 template:NewspaperTemplate;font_style?:NewspaperFont;blocks:NewspaperBlock[]};
type UpdateInput=DraftInput&{font_style:NewspaperFont;pdf_path:string|null;
 state:NewspaperState;publish_on?:string|null};
const content=(v:DraftInput)=>({
 title:v.title,subtitle:v.subtitle??'',template:v.template,
 font_style:v.font_style??'classico',blocks:v.blocks,
 ...(v.pdf_path?{pdfPath:v.pdf_path}:{}),
 publishOn:v.publish_on??null,
});
export async function createFirebaseNewspaperEdition(input:DraftInput):Promise<NewspaperEdition>{
 if(!isFirebaseNewspaperWorkspace())throw Error('Área Firebase não está ativa.');
 if(!input.blocks.length||input.blocks.some(b=>b.imagePath))
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
 if(!isFirebaseNewspaperWorkspace())throw Error('Área Firebase não está ativa.');
 if(!CLOUD.test(current.id)){
  if(!HISTORICAL_ID.test(current.id)||current.state!=='draft')
   throw Error('Esta edição histórica não é um rascunho editável. O original permanece preservado.');
  if(input.state==='published'){
   if(input.pdf_path!==current.pdf_path||input.publish_on!=null)
    throw Error('Revise os anexos e agendamentos históricos antes de publicar.');
   // Publish the CURRENT canvas atomically. The server validates it against
   // the immutable historical source and creates one separate Cloud edition.
   // Previously this request only published the last saved overlay, silently
   // omitting changes still visible in the Editor-Chefe's canvas.
   const saved=await request<CloudEdition>({action:'publishHistoricalDraft',
    id:current.id,requestKey:crypto.randomUUID(),expectedVersion:current.version,
    content:{title:input.title,subtitle:input.subtitle??'',template:input.template,
     font_style:input.font_style,blocks:input.blocks,campaignDate:input.campaign_date}});
   return originalNewspaperEdition(saved);
  }
  if(input.state!=='draft')
   throw Error('O original histórico não pode ser arquivado nem cancelado por esta edição.');
  if(input.pdf_path!==current.pdf_path||input.publish_on!=null)
   throw Error('Anexos e publicação agendada de edições importadas exigem reconciliação.');
  const saved=await request<HistoricalDraft>({action:'saveHistoricalDraft',
   id:current.id,requestKey:crypto.randomUUID(),expectedVersion:current.version,
   content:{...content(input),campaignDate:input.campaign_date}});
  if(saved.id!==current.id||saved.editionNo!==current.edition_no||
     saved.state!=='draft'||saved.version!==current.version+1)
   throw Error('Versão devolvida pelo Firebase não corresponde ao rascunho.');
  return {...current,title:saved.title,subtitle:saved.subtitle,
   template:saved.template,font_style:saved.font_style,
   campaign_date:saved.campaignDate,blocks:safeNewspaperBlocks(saved.blocks),
   version:saved.version,state:'draft'};
 }
 const saved=await request<CloudEdition>({action:'saveEdition',requestKey:crypto.randomUUID(),
  id:current.id,expectedVersion:current.version,state:input.state,
  content:content(input)});
 return originalNewspaperEdition(saved);
}

/** Versions created by Cloud writes; previous immutable snapshots stay intact. */
export async function loadFirebaseNewspaperRevisions(id:string):Promise<NewspaperRevision[]>{
 if(!CLOUD.test(id)&&!HISTORICAL_ID.test(id))return [];
 const result=await request<{items:NewspaperRevision[]}>({action:'listRevisions',id});
 if(!Array.isArray(result.items)||result.items.length>40)
  throw Error('Histórico editorial inválido.');
 return result.items.map(r=>({...r,snapshot:{...r.snapshot,
  blocks:safeNewspaperBlocks(r.snapshot?.blocks)}}));
}
