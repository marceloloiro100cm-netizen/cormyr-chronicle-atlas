import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {ClipboardList,RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {formatDate,parseDate} from '@/lib/calendar/harptos';
import {readSpyNarratorOperationsBrowser,type SpyNarratorOperation}
 from '@/lib/espionage/spy-operations-browser';
import {readSpyHouseManagementBrowser} from '@/lib/espionage/spy-browser-client';
import {SpyNarratorResolutionPanel} from './spy-narrator-resolution';
import {retrySpyIntelligence} from '@/lib/espionage/spy-dossier.functions';
import './spy-operations-center.css';

const statusLabels:Record<string,string>={
 draft:'Rascunho',planned:'Planejada',traveling:'Em viagem',
 operating:'Investigando',pending_narrator_review:'Aguardando Narrador',
 returning:'Em retorno',completed:'Concluída',cancelled:'Encerrada',
};
const objectiveLabels:Record<string,string>={
 house_resources:'Recursos',army:'Exército',possessions:'Posses',
};
/** Only successful, completed missions can require an intelligence award.
 * Failed/captured/dead operations have no dossier to recover.
 */
/** Apenas waiting_catalog deve ser reprocessado automaticamente. */
export type SpyDossierAttentionKind='none'|'retry'|'integrity';
export const spyDossierAttentionKind=(o:SpyNarratorOperation):SpyDossierAttentionKind=>{
 if(o.status!=='completed'||o.outcome!=='success'||o.intelligenceStatus==='complete')
  return 'none';
 return o.intelligenceStatus==='waiting_catalog'?'retry':'integrity';
};
export const spyNeedsDossierAttention=(o:SpyNarratorOperation)=>
 spyDossierAttentionKind(o)!=='none';

export const spyNeedsNarratorAction=(o:SpyNarratorOperation)=>
 o.status==='pending_narrator_review'||spyNeedsDossierAttention(o);

/** Single, predictable queue: decisions first, then missing intelligence.
 * Never mix completed failures with awards awaiting processing.
 */
export function spyNarratorActionQueue(operations:readonly SpyNarratorOperation[]){
 const priority=(o:SpyNarratorOperation)=>
  o.status==='pending_narrator_review'?0:
  spyDossierAttentionKind(o)==='retry'?1:
  spyDossierAttentionKind(o)==='integrity'?2:3;
 return operations.filter(spyNeedsNarratorAction)
  .sort((a,b)=>priority(a)-priority(b)||
   b.createdAt.localeCompare(a.createdAt)||a.operationId.localeCompare(b.operationId));
}
export function spyOperationCounters(operations:readonly SpyNarratorOperation[]){
 return {
  active:operations.filter(o=>['traveling','operating','returning','planned'].includes(o.status)).length,
  review:operations.filter(o=>o.status==='pending_narrator_review').length,
  dossier:operations.filter(spyNeedsDossierAttention).length,
  complete:operations.filter(o=>o.status==='completed').length,
 };
}
export function filterSpyOperations(operations:readonly SpyNarratorOperation[],
 search:string,state:string){
 const q=search.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('pt-BR');
 const normalized=(value:string)=>value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
 return operations.filter(o=>{
  const matches=!q||[o.ownerHouseName,o.targetHouseName,o.agentName]
   .some(value=>normalized(value).includes(q));
  if(!matches)return false;
  if(state==='attention')return spyNeedsNarratorAction(o);
  if(state==='review')return o.status==='pending_narrator_review';
  if(state==='active')return ['traveling','operating','returning','planned'].includes(o.status);
  if(state==='dossier')return spyNeedsDossierAttention(o);
  if(state==='completed')return o.status==='completed';
  return true;
 });
}
const dateLabel=(value:string|null)=>value&&parseDate(value)?formatDate(value):'—';
export function SpyNarratorOperationsCenter(){
 const reviewRef=useRef<HTMLElement|null>(null);
 const [search,setSearch]=useState('');
 const [state,setState]=useState('attention');
 const [page,setPage]=useState(1);
 const [selectedReview,setSelectedReview]=useState<{
  operationId:string;ownerHouseId:string;
 }|null>(null);
 const [recentResolution,setRecentResolution]=useState('');
 const [retryingDossier,setRetryingDossier]=useState<string|null>(null);
 useEffect(()=>{
  if(!selectedReview)return;
  reviewRef.current?.focus({preventScroll:true});
  reviewRef.current?.scrollIntoView({block:'start',behavior:'smooth'});
 },[selectedReview]);
 const qc=useQueryClient();
 const retryDossier=useServerFn(retrySpyIntelligence);
 const finishDossier=async(operationId:string)=>{
  if(retryingDossier)return;
  setRetryingDossier(operationId);setRecentResolution('');
  try{
   const response=await retryDossier({data:{operationId}});
   setRecentResolution(response.status==='complete'
    ?'Descobertas confirmadas. O dossiê está atualizado.'
    :response.status==='waiting_catalog'
     ?'Missão salva; dossiê pendente de fonte oficial.'
     :'Prêmio não confirmado. Verifique o histórico antes de tentar novamente.');
   await Promise.allSettled([
    qc.invalidateQueries({queryKey:['spy-narrator-operations']}),
    qc.invalidateQueries({queryKey:['spy-dossiers']}),
   ]);
  }catch{
   setRecentResolution('O dossiê não pôde ser finalizado. Verifique a fonte oficial e a fila do Narrador.');
  }finally{setRetryingDossier(null);}
 };
 const houseQuery=useQuery({
  queryKey:['spy-house-management',selectedReview?.ownerHouseId],
  queryFn:()=>readSpyHouseManagementBrowser(selectedReview!.ownerHouseId),
  enabled:Boolean(selectedReview),staleTime:0,retry:false,
 });
 const query=useQuery({
  queryKey:['spy-narrator-operations'],
  queryFn:readSpyNarratorOperationsBrowser,retry:false,staleTime:15_000,
  refetchInterval:30_000,refetchIntervalInBackground:false,
  refetchOnWindowFocus:'always',refetchOnReconnect:'always',
 });
 const operations=query.data??[];
 const counters=spyOperationCounters(operations);
 const pending=state==='attention'
  ?filterSpyOperations(spyNarratorActionQueue(operations),search,'attention')
  :filterSpyOperations(operations,search,state);
 const pageSize=15,totalPages=Math.max(1,Math.ceil(pending.length/pageSize));
 const safePage=Math.min(totalPages,Math.max(1,page));
 const visible=pending.slice((safePage-1)*pageSize,safePage*pageSize);
 return <section className="house-panel spy-operations-center"
  aria-label="Central de operações do Narrador">
  <header className="house-section-heading">
   <div>
    <p className="campaign-eyebrow">ESPIONAGEM · NARRADOR</p>
    <h3><ClipboardList size={18} aria-hidden="true"/> Central de operações</h3>
    <p className="house-caption">Julgue missões e confirme descobertas no mesmo lugar.</p>
   </div>
   <Button type="button" variant="outline" disabled={query.isFetching}
    onClick={()=>void query.refetch()}><RefreshCw size={16}/>
    Atualizar</Button>
  </header>
  {query.isPending&&<p role="status">Consultando operações da campanha…</p>}
  {query.isError&&<p role="alert">{query.data
    ?'A lista pode estar desatualizada. Atualize antes de resolver uma missão.'
    :'Operações indisponíveis nesta sessão.'}
   <Button type="button" variant="outline" onClick={()=>void query.refetch()}>
    Tentar novamente</Button></p>}
  {query.data&&<>
   <div className="spy-operations-metrics" aria-label="Resumo operacional">
    <div><strong>{counters.review}</strong><small>Aguardam julgamento</small></div>
    <div><strong>{counters.active}</strong><small>Em andamento</small></div>
    <div><strong>{counters.dossier}</strong><small>Dossiês pendentes</small></div>
    <div><strong>{counters.complete}</strong><small>Concluídas</small></div>
   </div>
   <div className="spy-operations-filters">
    <label>Buscar Casa ou agente
     <input value={search} placeholder="Casa ou codinome"
      onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
    </label>
    <label>Situação
     <select value={state} onChange={e=>{setState(e.target.value);setPage(1);}}>
      <option value="attention">Ações pendentes ({counters.review+counters.dossier})</option>
      <option value="review">Aguardando julgamento</option>
      <option value="active">Em andamento</option>
      <option value="dossier">Dossiês pendentes</option>
      <option value="completed">Concluídas</option>
      <option value="all">Todas</option>
     </select>
    </label>
   </div>
   <p className="house-caption" role="status">{pending.length}
    {' '}operação(ões) neste filtro.</p>
   {state==='attention'&&counters.review+counters.dossier===0&&<p role="status"
    className="spy-operations-idle">Tudo em dia: nenhuma missão ou descoberta
    aguardando o Narrador.</p>}
   {recentResolution&&<p role="status" aria-live="polite" className="spy-operations-feedback">
    {recentResolution}</p>}
   {selectedReview&&!query.isError&&<section className="spy-operation-inline-review"
    ref={reviewRef} tabIndex={-1}
    aria-label="Resolver missão selecionada">
    <header className="spy-operation-inline-header">
     <strong>Homologar missão selecionada</strong>
     <Button type="button" variant="outline" size="sm"
      onClick={()=>setSelectedReview(null)}>Fechar</Button>
    </header>
    {houseQuery.isPending&&<p role="status">Carregando ficha do agente…</p>}
    {houseQuery.isError&&<div role="alert">
     <p>Não foi possível consultar o agente desta Casa.</p>
     <Button type="button" variant="outline" onClick={()=>void houseQuery.refetch()}>
      Tentar novamente</Button>
    </div>}
    {houseQuery.data&&
     <SpyNarratorResolutionPanel data={houseQuery.data}
      operationId={selectedReview.operationId}
      onResolved={result=>{
       setSelectedReview(null);
       setRecentResolution(result.intelligenceStatus==='complete'
        ?'Missão resolvida e dossiê confirmado.'
        :result.outcome==='mission_success'&&result.intelligenceStatus==='waiting_catalog'
         ?'Missão salva; dossiê pendente de fonte oficial.'
        :result.outcome==='mission_success'
         ?'Missão salva; prêmio exige verificação pelo Narrador.'
         :'Missão resolvida. Resultado registrado na campanha.');
       void Promise.allSettled([
        qc.invalidateQueries({queryKey:['spy-narrator-operations']}),
        qc.invalidateQueries({queryKey:['spy-dossiers']}),
       ]);
      }}/>}
    {houseQuery.data&&!houseQuery.data.operations.some(o=>
     o.id===selectedReview.operationId&&o.status==='pending_narrator_review')&&
     <p role="status">Esta missão não está mais aguardando resolução.</p>}
   </section>}
   {visible.length?<div className="spy-operations-list">
    {visible.map(o=><article className="spy-operation-row" key={o.operationId}>
     <div>
      <strong>{o.ownerHouseName} → {o.targetHouseName}</strong>
      <small>{o.agentName} · {objectiveLabels[o.objective]}</small>
     </div>
     <div>
      <strong>{statusLabels[o.status]??o.status}</strong>
      <small>{o.status==='pending_narrator_review'
       ?'Resultado aguardando a sua decisão':
       spyDossierAttentionKind(o)==='retry'
         ?'Missão salva; dossiê pendente de fonte oficial':
        spyDossierAttentionKind(o)==='integrity'
         ?'Prêmio sem confirmação: revisar integridade':
       'Chegada '+dateLabel(o.arrivalKey)+' · fim '+dateLabel(o.investigationEndKey)}</small>
     </div>
     {o.status==='pending_narrator_review'&&<Button type="button"
      disabled={query.isError} variant={selectedReview?.operationId===o.operationId?'default':'outline'}
      className="spy-operation-resolve-button"
      aria-pressed={selectedReview?.operationId===o.operationId}
      onClick={()=>{
       setRecentResolution('');
       setSelectedReview({operationId:o.operationId,ownerHouseId:o.ownerHouseId});
      }}>Resolver agora</Button>}
     {spyDossierAttentionKind(o)==='retry'&&<Button type="button"
      variant="outline" className="spy-operation-resolve-button"
      disabled={Boolean(retryingDossier)||query.isError}
      onClick={()=>void finishDossier(o.operationId)}>
      {retryingDossier===o.operationId?'Verificando…':'Concluir dossiê'}
     </Button>}
     {spyDossierAttentionKind(o)==='integrity'&&<Button type="button"
      variant="outline" className="spy-operation-resolve-button"
      disabled={query.isFetching}
      onClick={()=>{
       setRecentResolution('Prêmio não confirmado. Verifique a decisão e o histórico; não repita o julgamento.');
       void query.refetch();
      }}>Verificar status</Button>}
    </article>)}
   </div>:<p className="house-caption">Nenhuma missão neste filtro.</p>}
   {totalPages>1&&<div className="spy-operations-pages">
    <Button type="button" variant="outline" disabled={safePage===1}
     onClick={()=>setPage(n=>n-1)}>Anterior</Button>
    <span>Página {safePage} de {totalPages}</span>
    <Button type="button" variant="outline" disabled={safePage===totalPages}
     onClick={()=>setPage(n=>n+1)}>Próxima</Button>
   </div>}

   <small className="house-caption">Resolva missões e confirme descobertas
    nesta central. Falhas de integridade exigem revisão na fila de dossiês.</small>
  </>}
 </section>;
}
