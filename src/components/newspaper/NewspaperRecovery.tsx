import {useState} from 'react';
import {NewspaperCanvas} from './NewspaperCanvas';
import type {NewspaperEdition} from '@/lib/newspaper/model';
import type {RecoveryCandidate} from '@/lib/newspaper/working-draft';

const when=(at:number)=>at?new Date(at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'medium'}):'data não informada';
const previewOf=(c:RecoveryCandidate):NewspaperEdition=>({
 id:c.editionId,edition_no:0,state:'draft',version:1,publication_revision:0,created_by:'',
 updated_at:'',published_at:null,archived_at:null,cancelled_at:null,...c.snapshot,
 publish_on:null,
});

/**
 * Todas as versões que podem virar "a edição em andamento", lado a lado:
 * rascunhos do Firebase e cópias guardadas neste dispositivo. Usar uma versão
 * grava o conteúdo em UM rascunho; nada é apagado.
 */
export function NewspaperRecovery({candidates,workingId,nextNumber,draftCount,unreadable,busy,onUse,onKeepOnlyWorking}:{
 candidates:RecoveryCandidate[];workingId:string|null;nextNumber:number|null;
 draftCount:number;unreadable:number;busy:boolean;
 onUse:(candidate:RecoveryCandidate)=>void;
 onKeepOnlyWorking:()=>void;
}){
 const [preview,setPreview]=useState<string|null>(null);
 if(!candidates.length&&draftCount<2&&!unreadable)return null;
 const label=nextNumber?`Nº ${nextNumber}`:'em andamento';
 return <section aria-label="Recuperar a edição em andamento" className="folha-archive-local folha-recovery">
  <h4>Edição em andamento ({label}): versões disponíveis</h4>
  <p>O Jornal mantém uma única edição em andamento. Escolha a versão mais completa e clique em
   {' '}<strong>Usar esta versão</strong>: o texto vai para essa edição e é salvo no Firebase.
   Nenhuma versão é apagada: o Firebase guarda a anterior no histórico de revisões e este dispositivo mantém suas cópias.</p>
  {unreadable>0&&<p role="alert" className="folha-field-hint">
   {unreadable===1?'1 rascunho do Firebase não pôde ser lido agora':`${unreadable} rascunhos do Firebase não puderam ser lidos agora`}.
   {' '}Atualize a página em instantes antes de escolher.</p>}
  {draftCount>1&&<div className="folha-check-actions">
   <span>Há {draftCount} rascunhos no Firebase. Depois de escolher a versão certa, mantenha só a edição em andamento.</span>
   <button type="button" disabled={busy||!workingId} onClick={onKeepOnlyWorking}>Manter só a edição em andamento</button>
  </div>}
  {candidates.slice(0,60).map(c=><div key={c.key} className="folha-archive-row">
   <div>
    <strong>{c.snapshot.title||'Sem título'}{c.working?' · em andamento':''}</strong>
    <small>{c.origin==='firebase'?'Firebase':'Este dispositivo'} · {when(c.updatedAt)} · {c.words} palavra(s) · {c.elements} elemento(s)
     {c.origin==='device'&&!c.draftExists?' · rascunho original indisponível':''}</small>
    {preview===c.key&&<div className="folha-recovery-preview"><NewspaperCanvas edition={previewOf(c)} compactMasthead/></div>}
   </div>
   <div className="folha-check-actions">
    <button type="button" onClick={()=>setPreview(p=>p===c.key?null:c.key)}>{preview===c.key?'Fechar':'Ver'}</button>
    <button type="button" disabled={busy||(c.working&&c.origin==='firebase')} onClick={()=>onUse(c)}>Usar esta versão</button>
   </div>
  </div>)}
 </section>;
}
