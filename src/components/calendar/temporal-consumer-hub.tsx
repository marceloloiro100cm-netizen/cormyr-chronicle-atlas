import {useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {supabase} from '@/integrations/supabase/client';
import {requireFreshNarratorAccess} from '@/lib/auth/campaign-access-scope';
import {isNarratorAccessRevoked,purgeRevokedNarratorCache} from '@/lib/auth/narrator-revocation';
import {validateTemporalConsumerDashboard,validateTemporalReleasePreflight,type TemporalDelivery} from '@/lib/calendar/temporal-consumers';

const names:Record<string,string>={
 informational:'Projeção / sem execução',
 pending:'Revisão pendente',
 reviewed:'Conferido pelo Narrador',
 skipped:'Dispensado com justificativa',
};
const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);

/** Hub apenas administrativo: jamais aplica efeitos financeiros/militares.
 * 'Conferido' reconhece a pendência, não executa ações do jogo.
 */
export function TemporalConsumerHub(){
 const qc=useQueryClient();
 const dashboard=useQuery({
  queryKey:['temporal-consumer-dashboard'],
  queryFn:async()=>{
   const {data,error}=await supabase.rpc('get_temporal_consumer_dashboard',{p_limit:80});
   if(error)throw error;
   return validateTemporalConsumerDashboard(data);
  },
  refetchInterval:30000,
 });
 const preflight=useQuery({
  queryKey:['temporal-release-preflight'],
  queryFn:async()=>{
   const {data,error}=await supabase.rpc('get_temporal_release_preflight');
   if(error)throw error;
   return validateTemporalReleasePreflight(data);
  },
  refetchInterval:30000,
 });
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState<string|null>(null);
 const [accessRevoked,setAccessRevoked]=useState(false);
 const retry=useRef<{signature:string;key:string}|null>(null);

 async function decide(d:TemporalDelivery,status:'reviewed'|'skipped'){
  if(busy)return;
  const note=(notes[d.id]??'').trim();
  if(note.length<10){setMessage('Informe justificativa com pelo menos 10 caracteres.');return;}
  const signature=JSON.stringify({id:d.id,status,note});
  if(retry.current?.signature!==signature)retry.current={signature,key:crypto.randomUUID()};
  setBusy(d.id);setMessage('');
  try{
   await requireFreshNarratorAccess();
   const {data,error}=await supabase.rpc('resolve_temporal_delivery',{
    p_id:d.id,p_request_key:retry.current.key,p_status:status,p_note:note,
   });
   if(error)throw error;
   if(!data||typeof data!=='object'||(data as {id?:unknown}).id!==d.id)
    throw new Error('Servidor não confirmou a resolução da entrega.');
   retry.current=null;
   await qc.invalidateQueries({queryKey:['temporal-consumer-dashboard']});
   setMessage(status==='reviewed'
    ?'Pendência conferida. Nenhum bônus, recurso ou ação foi executado.'
    :'Pendência dispensada com justificativa; nenhuma regra foi aplicada.');
  }catch(error){if(isNarratorAccessRevoked(error)){purgeRevokedNarratorCache(qc);setAccessRevoked(true);}setMessage(errorText(error));}
  finally{setBusy(null);}
 }

 async function replay(d:TemporalDelivery){
  if(busy)return;
  setBusy(d.id);setMessage('');
  try{
   await requireFreshNarratorAccess();
   const {data,error}=await supabase.rpc('replay_temporal_delivery',{p_id:d.id});
   if(error)throw error;
   const item=data as {id?:unknown;replay_read_only?:unknown;status?:unknown}|null;
   if(!item||item.id!==d.id||item.replay_read_only!==true)
    throw new Error('Replay não confirmado em modo somente leitura.');
   setMessage('Replay de leitura confirmado: '+d.consumer_code+' · '+String(item.status)+'. Nenhuma transação de jogo foi executada.');
  }catch(error){if(isNarratorAccessRevoked(error)){purgeRevokedNarratorCache(qc);setAccessRevoked(true);}setMessage(errorText(error));}
  finally{setBusy(null);}
 }

 if(accessRevoked)return <section role="alert">Permissão de Narrador revogada. Os dados privados foram ocultados. Atualize suas autorizações para continuar.</section>;
 return <section id="temporal-conexoes" className="narrator-calendar-panel" aria-label="Pontos de conexão temporal">
  <h3>Pontos de conexão e entregas temporais</h3>
  <p>O calendário publica uma notificação transacional por consumidor habilitado. Exércitos, posses, idades e missivas recalculam suas projeções a partir das fontes oficiais. Economia, serviços, estações e vassalagem exigem análise das regras antes de qualquer ação.</p>
  <div className="house-caption" aria-label="Diagnóstico pré-implantação temporal">
   <strong>Diagnóstico de integridade do calendário</strong>
   {preflight.isPending?<p>Verificando o estado das fichas no servidor…</p>:
    preflight.error?<p role="alert">Diagnóstico indisponível: {errorText(preflight.error)}</p>:
    preflight.data?<div>
     <p>Versão {preflight.data.calendar_version} · {preflight.data.official_date} ·
      {preflight.data.active_houses} Casa(s) ativa(s) · {preflight.data.draft_houses} rascunho(s).</p>
     <p>{preflight.data.invalid_houses} ficha(s) inválida(s) ·
      {preflight.data.lagging_houses} atrasada(s) · {preflight.data.ahead_houses} adiantada(s) ·
      {preflight.data.manual_reviews_pending} revisão(ões) temporais pendente(s).</p>
     {preflight.data.month_processing_preflight_ok?
      <p>Fichas válidas para avaliação mensal. A implantação ainda exige backup, homologação e aprovação.</p>:
      <p role="alert">Existem fichas inválidas: não avançar meses até corrigir os registros.</p>}
    </div>:null}
  </div>
  {dashboard.isPending?<p role="status">Consultando consumidores e pendências…</p>:
   dashboard.error?<p role="alert">Não foi possível consultar as entregas: {errorText(dashboard.error)} <Button type="button" onClick={()=>void dashboard.refetch()}>Tentar novamente</Button></p>:
   dashboard.data?<div>
    <p><strong>{dashboard.data.consumers.length}</strong> pontos registrados · <strong>{dashboard.data.pending_total}</strong> revisão(ões) pendente(s).</p>
    <details>
     <summary>Ver consumidores e suas responsabilidades</summary>
     {dashboard.data.consumers.map(c=><p key={c.code}><strong>{c.title}</strong> · {c.mode==='projection'?'Leitura derivada':'Revisão manual'} · {c.pending} pendência(s). {c.description}</p>)}
    </details>
    <details>
     <summary>Histórico recente de entregas ({dashboard.data.deliveries.length})</summary>
     {dashboard.data.deliveries.length===0&&<p>Nenhuma operação temporal registrada desde a implantação do Lote 10.</p>}
     {dashboard.data.deliveries.map(d=><div key={d.id} className="house-caption">
      <p><strong>{dashboard.data!.consumers.find(c=>c.code===d.consumer_code)?.title??d.consumer_code}</strong> · {names[d.status]} · versão {d.calendar_version}</p>
      <p>{d.from_date} → {d.to_date} · {d.direction==='backward'?'Retificação histórica':d.direction==='forward'?'Avanço':'Data inalterada'} · operação {d.operation_id.slice(0,8)}</p>
      {d.review_note&&<p>Justificativa: {d.review_note}</p>}
      {d.status==='pending'&&<>
       <label>Justificativa da conferência
        <textarea rows={2} maxLength={500} value={notes[d.id]??''}
         onChange={e=>{setNotes(current=>({...current,[d.id]:e.target.value}));retry.current=null;}}
         placeholder="Descreva a conferência da regra; este botão não aplica efeitos."/>
       </label>
       <div className="campaign-actions">
        <Button type="button" disabled={busy!==null||(notes[d.id]??'').trim().length<10}
         onClick={()=>void decide(d,'reviewed')}>Marcar conferido</Button>
        <Button type="button" variant="outline" disabled={busy!==null||(notes[d.id]??'').trim().length<10}
         onClick={()=>void decide(d,'skipped')}>Dispensar com justificativa</Button>
       </div>
      </>}
      <Button type="button" variant="ghost" disabled={busy!==null} onClick={()=>void replay(d)}>Replay seguro (somente leitura)</Button>
     </div>)}
    </details>
   </div>:null}
  {message&&<p role="status" aria-live="polite">{message}</p>}
  <p className="text-sm text-muted-foreground">Não há ganho mensal automático de recursos ou soldos, concessão de Sorte, conclusão fictícia de serviços ou ação militar. Conferir uma notificação não executa seus possíveis efeitos: futuras regras precisarão de sua própria operação transacional auditada.</p>
 </section>;
}
