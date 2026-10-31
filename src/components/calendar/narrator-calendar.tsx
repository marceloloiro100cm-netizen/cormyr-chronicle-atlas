import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {CampaignDatePicker} from './date-picker';
import {CampaignCalendar,type CalendarState} from './calendar';
import {campaignTimeView,useCampaignTime} from '@/lib/calendar/campaign-time';
import {useCampaignCalendarRealtime} from './realtime';
import {dateKey,formatDate,parseDate} from '@/lib/calendar/harptos';
import {calendarPublicationError} from '@/lib/calendar/publication';
import {campaignTimeRpcArguments,matchesPublishedTime,validateCampaignTimePreview,type CampaignTimeMode,type CampaignTimePreview} from '@/lib/calendar/temporal-publication';

function calendarErrorMessage(error:unknown):string{
 if(error&&typeof error==='object'&&'message' in error)return String(error.message);
 return error instanceof Error?error.message:'Não foi possível concluir a operação.';
}

type DraftEvent={
 id:string;date:string;title:string;description:string;deleted:boolean;
 version:number;published:boolean;
};

export function NarratorCalendar(){
 const qc=useQueryClient();
 const calendar=useCampaignTime();
 const realtime=useCampaignCalendarRealtime();
 const drafts=useQuery({queryKey:['campaign-schedule-drafts'],queryFn:async()=>{
  const {data,error}=await supabase.rpc('get_campaign_schedule_drafts');
  if(error)throw error;
  return data as unknown as DraftEvent[];
 },refetchInterval:30000});
 const [date,setDate]=useState(''),[mode,setMode]=useState<CampaignTimeMode>('advance'),[count,setCount]=useState(1);
 const [reason,setReason]=useState(''),[allowBackdate,setAllowBackdate]=useState(false);
 const [expectedVersion,setExpectedVersion]=useState<number|null>(null);
 const retry=useRef<{payload:string;key:string}|null>(null);
 const [editId,setEditId]=useState<string|null>(null),[editVersion,setEditVersion]=useState<number|null>(null);
 const [eventDate,setEventDate]=useState(''),[title,setTitle]=useState(''),[description,setDescription]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saveError,setSaveError]=useState(false);
 const editedRef=useRef(false),baseVersionRef=useRef<number|null>(null);
 const eventDateEditedRef=useRef(false);
 const [needsVersionRefresh,setNeedsVersionRefresh]=useState(false);
 const preview=useQuery({
  queryKey:['campaign-time-preview',expectedVersion,mode,date,count,allowBackdate],
  enabled:expectedVersion!==null&&!needsVersionRefresh&&(mode!=='set'||Boolean(parseDate(date))),
  queryFn:async()=>{
   const version=expectedVersion!;
   const {data,error}=await supabase.rpc('preview_campaign_time_change',{
    p_version:version,p_mode:mode,p_date:mode==='set'?date:null,
    p_count:mode==='advance'?count:0,p_allow_backdate:mode==='set'&&allowBackdate,
   });
   if(error)throw error;
   return validateCampaignTimePreview(data,version,mode);
  },
 });
 const history=useQuery({queryKey:['campaign-time-history'],queryFn:async()=>{
  const {data,error}=await supabase.rpc('get_campaign_time_history',{p_limit:15});
  if(error)throw error;
  return data as unknown as {id:string;from:string;to:string;mode:string;reason:string;created_at:string}[];
 },refetchInterval:30000});
 useEffect(()=>{
  if(!calendar.data)return;
  // Polling must not silently replace a date/round edited by the Narrador.
  if(editedRef.current)return;
  const current=dateKey(calendar.data);
  baseVersionRef.current=calendar.data.version;
  setDate(current);
  setExpectedVersion(calendar.data.version);
  setEventDate(previous=>eventDateEditedRef.current?previous:current);
 },[calendar.data?.version]);
 const reset=()=>{setEditId(null);setEditVersion(null);eventDateEditedRef.current=false;setEventDate(date);setTitle('');setDescription('');};
 useEffect(()=>{if(date&&!eventDateEditedRef.current&&!editId)setEventDate(date);},[date,editId]);
 async function saveEvent(deleted=false,override?:DraftEvent){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const payload=override
    ?{id:override.id,version:override.version,date:override.date,title:override.title,description:override.description,deleted}
    :{id:editId,version:editVersion,date:eventDate,title,description,deleted};
   const {error}=await supabase.rpc('save_campaign_schedule_event',{p_payload:payload});
   if(error)throw error;
   await qc.invalidateQueries({queryKey:['campaign-schedule-drafts']});
   setMessage(deleted?'Exclusão marcada. Publique o calendário para aplicá-la a todos os jogadores.':'Evento salvo como rascunho. Publique para torná-lo visível nas fichas.');
   reset();
  }catch(err){setMessage(calendarErrorMessage(err));}
  finally{setBusy(false);}
 }
 async function publish(){
  if(!calendar.data||busy||expectedVersion===null)return;
  if(mode==='set'&&!parseDate(date)){setSaveError(true);setMessage('Selecione uma data válida.');return;}
  if(mode==='advance'&&(!Number.isInteger(count)||count<1||count>120)){setSaveError(true);setMessage('Informe entre uma e 120 désdias.');return;}
  if(needsVersionRefresh){setSaveError(true);setMessage('Atualize a versão do calendário antes de tentar novamente.');return;}
  const planned=preview.data as CampaignTimePreview|undefined;
  if(!planned||preview.isError||planned.version!==expectedVersion){setSaveError(true);setMessage('Prévia oficial indisponível ou desatualizada. Não foi possível confirmar.');return;}
  if(planned.backdated&&(!allowBackdate||reason.trim().length<10)){
   setSaveError(true);setMessage('Retrocesso exige autorização expressa e justificativa de pelo menos dez caracteres.');return;
  }
  const params={mode,date:mode==='set'?date:null,count:mode==='advance'?count:0,expectedVersion,reason:reason.trim(),allowBackdate:mode==='set'&&allowBackdate};
  const signature=JSON.stringify(params);
  const confirmText='Confirmar '+planned.from+' → '+planned.to+' ('+planned.month_delta+
   ' mês(es), '+planned.crossed_years.length+' virada(s) de ano, '+planned.crossed_festivals.length+
   ' festival(is))? '+planned.house_sheets_to_check+
   ' ficha(s) de Casa serão conferidas no avanço. Missivas não avançarão automaticamente.';
  if(!window.confirm(confirmText))return;
  if(retry.current?.payload!==signature)retry.current={payload:signature,key:crypto.randomUUID()};
  const key=retry.current.key;
  setBusy(true);setSaveError(false);setMessage('Publicando mudança temporal em uma transação…');
  try{
   const args=campaignTimeRpcArguments(mode,date,count,expectedVersion,key,reason.trim(),allowBackdate);
   const {data:snapshot,error}=await supabase.rpc('publish_campaign_time_change',args);
   if(error)throw error;
   const saved=snapshot as unknown as CalendarState|null;
   if(!matchesPublishedTime(saved,planned,expectedVersion))throw new Error('O banco não retornou a data e versão esperadas; confirme o estado no servidor antes de tentar novamente.');
   retry.current=null;editedRef.current=false;
   baseVersionRef.current=saved!.version;
   setExpectedVersion(saved!.version);
   setDate(dateKey(saved!));setNeedsVersionRefresh(false);setAllowBackdate(false);
   qc.setQueryData(['campaign-calendar'],saved);
   const results=await Promise.allSettled([
    qc.invalidateQueries({queryKey:['campaign-calendar']}),
    qc.invalidateQueries({queryKey:['campaign-time-preview']}),
    qc.invalidateQueries({queryKey:['campaign-time-history']}),
    qc.invalidateQueries({queryKey:['campaign-schedule-drafts']}),
    qc.invalidateQueries({queryKey:['calendar-schedule-events']}),
    qc.invalidateQueries({queryKey:['noble-house']}),
    qc.invalidateQueries({queryKey:['house-realm-dashboard']}),
   ]);
   const delayed=results.some(r=>r.status==='rejected');
   setMessage('Calendário gravado e confirmado: '+formatDate(dateKey(saved!))+
    '. Versão '+saved!.version+'.'+(delayed?' Algumas consultas precisam ser atualizadas.':''));
  }catch(err){
   const errorMessage=calendarPublicationError(err);
   setNeedsVersionRefresh(/outra sessão|Calendário alterado|conflito/i.test(errorMessage));
   setSaveError(true);setMessage(errorMessage);
   const code=err&&typeof err==='object'&&'code' in err?String(err.code):'unknown';
   console.warn('[Cormyr temporal publish]',{code,mode,version:expectedVersion});
  }finally{setBusy(false);}
 }
 async function reloadVersion(){
  if(busy)return;
  const result=await calendar.refetch();
  if(result.error||!result.data){setSaveError(true);setMessage('Não foi possível buscar a versão atual. Verifique sua conexão.');return;}
  baseVersionRef.current=result.data.version;
  setExpectedVersion(result.data.version);
  setNeedsVersionRefresh(false);setSaveError(false);
  void qc.invalidateQueries({queryKey:['campaign-time-preview']});
  setMessage('Versão atualizada. Sua seleção foi preservada; confira a nova prévia antes de publicar.');
 }
 if(calendar.isPending||drafts.isPending)return <p role="status">Carregando calendário do Narrador…</p>;
 if(calendar.error||drafts.error||!calendar.data)return <p role="alert">Não foi possível carregar o calendário. {calendar.error?.message??drafts.error?.message} <Button type="button" onClick={()=>{calendar.refetch();drafts.refetch();}}>Tentar novamente</Button></p>;
 const clock=campaignTimeView(calendar.data);
 const isStale=expectedVersion!==null&&expectedVersion!==calendar.data.version;
 const seasonNames={winter:'Inverno',spring:'Primavera',summer:'Verão',autumn:'Outono'} as const;
 return <section className="narrator-calendar" aria-label="Central Temporal do Narrador">
  <div className="campaign-heading"><div><p className="campaign-eyebrow">NARRADOR · HUB TEMPORAL</p><h2>Calendário da campanha</h2></div></div>
  <div className="temporal-hub-dashboard" role="region" aria-label="Resumo temporal oficial">
   <div><span>Data oficial</span><strong>{clock.label}</strong></div>
   <div><span>Período atual</span><strong>{clock.desdia===null?'Festival intercalar':clock.desdia+'ª désdia'}</strong></div>
   <div><span>Estação</span><strong>{seasonNames[clock.season]}</strong></div>
   <div><span>Estado do relógio</span><strong>{realtime==='live'?'Tempo real conectado':realtime==='fallback'?'Atualização automática (15 s)':'Conectando…'}</strong><small>Versão {clock.version}</small></div>
  </div>
  <nav className="temporal-hub-navigation" aria-label="Seções do Hub Temporal">
   <a href="#temporal-comando">Comando e prévia</a>
   <a href="#temporal-eventos">Eventos oficiais</a>
   <a href="#temporal-historico">Histórico</a>
   <a href="#temporal-jogadores">Visão dos jogadores</a>
  </nav>
  {isStale&&<p role="alert" className="temporal-hub-stale">O calendário foi alterado em outra sessão. Recarregue a versão antes de confirmar qualquer operação.</p>}
  <p>O calendário oficial é a referência de todas as Casas. Escolha avançar désdias, corrigir a data ou publicar apenas eventos. A numeração das missivas permanece independente do relógio.</p>
  <div className="narrator-calendar-panel" id="temporal-comando">
   <h3>Comando central de tempo</h3>
   <div className="narrator-calendar-settings">
    <label>Ação temporal
     <select value={mode} aria-label="Ação temporal" onChange={e=>{setMode(e.target.value as CampaignTimeMode);setMessage('');}}>
      <option value="advance">Avançar désdias (10 dias ordinários)</option>
      <option value="set">Corrigir / escolher data de Harptos</option>
      <option value="publish">Publicar eventos sem alterar o dia</option>
     </select>
    </label>
    {mode==='advance'&&<label>Quantidade de désdias
     <input type="number" aria-label="Quantidade de désdias" min={1} max={120} value={count} onChange={e=>setCount(Number(e.target.value))}/>
    </label>}
    {mode==='set'&&<CampaignDatePicker value={date} updateOnNavigation onChange={next=>{editedRef.current=true;setDate(next);setMessage('');}}/>}
    {mode==='set'&&<label className="narrator-calendar-check"><input type="checkbox" checked={allowBackdate} onChange={e=>setAllowBackdate(e.target.checked)}/>Autorizar retrocesso histórico (não reverte obras ou ações já concluídas)</label>}
    <label>Justificativa administrativa (obrigatória no retrocesso)
     <textarea aria-label="Justificativa temporal" rows={2} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/>
    </label>
   </div>
   <p className="narrator-calendar-selection">Data oficial: <strong>{formatDate(dateKey(calendar.data))}</strong> · Versão <strong>{calendar.data.version}</strong>. Semana legada de missivas: <strong>{calendar.data.published_week??'não informada'}</strong> (não avança o Reino).</p>
   <div role="status" aria-live="polite" className="house-caption">
    {preview.isPending||preview.isFetching?'Calculando prévia no servidor…':preview.error?'Prévia indisponível: '+calendarErrorMessage(preview.error):preview.data?<>
     <strong>Prévia:</strong> {formatDate(preview.data.from)} → <strong>{formatDate(preview.data.to)}</strong> · {preview.data.ordinary_days} dias ordinários · {preview.data.calendar_days} dias cronológicos · {preview.data.month_delta} mês(es) · {preview.data.crossed_years.length} virada(s) de ano · {preview.data.crossed_festivals.length} festival(is).
     {preview.data.crossed_festivals.length>0&&<p>Festivais: {preview.data.crossed_festivals.map(formatDate).join(' · ')}</p>}
     {preview.data.month_delta>0&&<p>{preview.data.house_sheets_to_check} ficha(s) serão conferidas para processamento mensal na transação.</p>}
     {preview.data.backdated&&<p role="alert" className="house-warning">Retrocesso histórico: registros e obras concluídas não serão desfeitos. Exige autorização e justificativa.</p>}
    </>:null}
   </div>
   <Button type="button" className="narrator-calendar-publish-button" disabled={busy||isStale||needsVersionRefresh||!preview.data||preview.isFetching||(preview.data.backdated&&(!allowBackdate||reason.trim().length<10))} onClick={()=>void publish()}>{busy?'Publicando…':mode==='advance'?'Confirmar avanço de désdia':mode==='set'?'Confirmar data oficial':'Publicar eventos'}</Button>
   <p className="text-sm text-muted-foreground">A publicação é atômica, versionada e protegida por chave de operação. Abrir uma rodada de missivas não altera a data. Alterações no ano serão consumidas pelo registro de personagens em lote posterior.</p>
  </div>
  <div className="narrator-calendar-panel" id="temporal-eventos">
   <h3>{editId?'Editar evento':'Criar evento em uma data'}</h3>
   <form className="campaign-form narrator-event-form" onSubmit={e=>{e.preventDefault();void saveEvent();}}>
    <CampaignDatePicker value={eventDate} onChange={next=>{eventDateEditedRef.current=true;setEventDate(next);}}/>
    <label>Título do evento<input required maxLength={180} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Convocação da corte"/></label>
    <label>Descrição<textarea maxLength={4000} rows={3} value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <div className="campaign-actions"><Button disabled={busy||!eventDate||!title.trim()}>{busy?'Salvando…':'Salvar rascunho do evento'}</Button>
     {editId&&<Button type="button" variant="outline" onClick={reset}>Cancelar edição</Button>}
    </div>
   </form>
   <h4>Eventos cadastrados</h4>
   {drafts.data?.length===0&&<p>Nenhum evento criado ainda.</p>}
   <div className="narrator-calendar-event-list">
    {drafts.data?.map(event=><article key={event.id} className="narrator-calendar-event">
     <div><strong>{event.title}</strong><span>{formatDate(event.date)} · {event.deleted?'Exclusão pendente':event.published?'Publicado ou com alterações pendentes':'Rascunho'}</span>
      {event.description&&<p>{event.description}</p>}
     </div>
     <div className="campaign-actions">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>{
       eventDateEditedRef.current=true;setEditId(event.id);setEditVersion(event.version);setEventDate(event.date);setTitle(event.title);setDescription(event.description);
      }}>Editar</Button>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>{
       if(event.deleted){void saveEvent(false,event);return;}
       if(window.confirm('Marcar este evento para exclusão na próxima publicação?'))void saveEvent(true,event);
      }}>{event.deleted?'Restaurar':'Excluir'}</Button>
     </div>
    </article>)}
   </div>
  </div>

  <p role={saveError?'alert':'status'}>{message}</p>
  {(needsVersionRefresh||isStale)&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void reloadVersion()}>Atualizar versão sem perder data selecionada</Button>}
  <p className="text-xs text-muted-foreground">Hub Temporal · Lote 4 · Versão do registro: {calendar.data.version}</p>
  <details id="temporal-historico" open><summary>Histórico de mudanças temporais</summary>{history.error&&<p role="alert">Histórico indisponível.</p>}{history.data?.length===0&&<p>Nenhum avanço registrado pelo Hub.</p>}{history.data?.map(entry=><p key={entry.id}>{formatDate(entry.from)} → {formatDate(entry.to)} · {entry.mode} · {entry.reason||'Sem observação'}</p>)}</details>
  <div className="narrator-calendar-preview" id="temporal-jogadores"><h3>Calendário publicado · visão dos jogadores</h3><CampaignCalendar/></div>
 </section>;
}
