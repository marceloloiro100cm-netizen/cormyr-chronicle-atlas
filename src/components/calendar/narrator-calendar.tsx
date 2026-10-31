import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {CampaignDatePicker} from './date-picker';
import {CampaignCalendar,type CalendarState} from './calendar';
import {useCampaignTime} from '@/lib/calendar/campaign-time';
import {dateKey,formatDate,parseDate} from '@/lib/calendar/harptos';
import {calendarPublicationError,samePublishedCalendar} from '@/lib/calendar/publication';
import {calendarMonthIndex} from '@/lib/house/calendar-consistency';

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
 const drafts=useQuery({queryKey:['campaign-schedule-drafts'],queryFn:async()=>{
  const {data,error}=await supabase.rpc('get_campaign_schedule_drafts');
  if(error)throw error;
  return data as unknown as DraftEvent[];
 },refetchInterval:30000});
 const [date,setDate]=useState(''),[week,setWeek]=useState(1),[automatic,setAutomatic]=useState(true);
 const [editId,setEditId]=useState<string|null>(null),[editVersion,setEditVersion]=useState<number|null>(null);
 const [eventDate,setEventDate]=useState(''),[title,setTitle]=useState(''),[description,setDescription]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saveError,setSaveError]=useState(false);
 const editedRef=useRef(false),baseVersionRef=useRef<number|null>(null);
 const eventDateEditedRef=useRef(false);
 const [needsVersionRefresh,setNeedsVersionRefresh]=useState(false);
 useEffect(()=>{
  if(!calendar.data)return;
  // Polling must not silently replace a date/round edited by the Narrador.
  if(editedRef.current)return;
  const current=dateKey(calendar.data);
  baseVersionRef.current=calendar.data.version;
  setDate(current);setWeek(calendar.data.published_week??1);
  setAutomatic(calendar.data.auto_advance);
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
  if(!calendar.data||busy)return;
  if(!parseDate(date)||week<1||!Number.isInteger(week)){setSaveError(true);setMessage('Informe uma data de Harptos e uma semana válidas.');return;}
  if(needsVersionRefresh){setSaveError(true);setMessage('Atualize a versão do calendário antes de tentar novamente. Sua escolha foi preservada.');return;}
  const expected={date,week,automatic};
  const selected=parseDate(expected.date);
  if(selected&&calendarMonthIndex(selected)<calendarMonthIndex(calendar.data)){
   if(!window.confirm('A data selecionada recua para um mês anterior. Obras concluídas e lançamentos históricos das Casas NÃO serão revertidos automaticamente. Isso poderá deixar fichas adiantadas, exigindo revisão individual. Deseja continuar mesmo assim?'))return;
  }
  if(!window.confirm(`Publicar ${formatDate(expected.date)} · Rodada ${expected.week} para todas as casas?`))return;
  setBusy(true);setSaveError(false);setMessage('Publicando e confirmando os dados no Supabase…');
  try{
   const {data:snapshot,error}=await supabase.rpc('publish_campaign_schedule_confirmed',{
    p_version:baseVersionRef.current??calendar.data.version,
    p_date:expected.date,p_auto:expected.automatic,p_week:expected.week
   });
   if(error)throw error;
   const saved=snapshot as unknown as CalendarState|null;
   if(!samePublishedCalendar(saved,expected.date,expected.week,expected.automatic)||
      !saved||!Number.isInteger(saved.version))
    throw new Error('O banco não retornou a data, rodada e versão esperadas. Não foi possível confirmar a publicação.');
   editedRef.current=false;
   baseVersionRef.current=saved.version;
   setDate(dateKey(saved));setWeek(saved.published_week??expected.week);
   setAutomatic(saved.auto_advance);
   setNeedsVersionRefresh(false);
   // Update every calendar using the same shared query, immediately.
   qc.setQueryData(['campaign-calendar'],saved);
   const updates=await Promise.allSettled([
    qc.invalidateQueries({queryKey:['campaign-calendar']}),
    qc.invalidateQueries({queryKey:['campaign-schedule-drafts']}),
    qc.invalidateQueries({queryKey:['calendar-schedule-events']}),
    qc.invalidateQueries({queryKey:['noble-house']})
   ]);
   const pending=updates.some(result=>result.status==='rejected');
   setMessage(`Calendário gravado e confirmado: ${formatDate(expected.date)} · Rodada ${expected.week}.${pending?' Algumas consultas não atualizaram; recarregue as fichas.':' As fichas receberão a nova data.'}`);
  }catch(err){
   // Keep the locally selected date and week if anything failed.
   const errorMessage=calendarPublicationError(err);
   setNeedsVersionRefresh(/outra sessão|Calendário alterado|conflito/i.test(errorMessage));
   setSaveError(true);setMessage(errorMessage);
   const code=err&&typeof err==='object'&&'code' in err?String(err.code):'unknown';
   console.warn('[Cormyr calendar publish]',{code,phase:'publish',version:baseVersionRef.current});
  }finally{setBusy(false);}
 }
 async function reloadVersion(){
  if(busy)return;
  const result=await calendar.refetch();
  if(result.error||!result.data){setSaveError(true);setMessage('Não foi possível buscar a versão atual. Verifique sua conexão.');return;}
  baseVersionRef.current=result.data.version;
  setNeedsVersionRefresh(false);setSaveError(false);
  setMessage('Versão atualizada. Sua data e rodada selecionadas foram preservadas; confirme novamente a publicação.');
 }
 if(calendar.isPending||drafts.isPending)return <p role="status">Carregando calendário do Narrador…</p>;
 if(calendar.error||drafts.error||!calendar.data)return <p role="alert">Não foi possível carregar o calendário. {calendar.error?.message??drafts.error?.message} <Button type="button" onClick={()=>{calendar.refetch();drafts.refetch();}}>Tentar novamente</Button></p>;
 return <section className="narrator-calendar">
  <div className="campaign-heading"><div><p className="campaign-eyebrow">NARRADOR · CAMPANHA</p><h2>Calendário da campanha</h2></div></div>
  <p>Defina a semana atual, a data de Harptos e os eventos do reino. Apenas eventos publicados aparecem nas fichas das casas. As missivas privadas continuam restritas aos respectivos destinatários.</p>
  <div className="narrator-calendar-panel">
   <h3>Data e semana da campanha</h3>
   <div className="narrator-calendar-settings">
    <CampaignDatePicker value={date} updateOnNavigation onChange={next=>{editedRef.current=true;setDate(next);setMessage('');}}/>
    <div className="narrator-calendar-week-controls">
     <label>Semana atual do jogo
      <input type="number" min={1} step={1} value={week} onChange={e=>{editedRef.current=true;setWeek(Number(e.target.value));setMessage('');}}/>
     </label>
     <Button type="button" className="narrator-calendar-publish-button" disabled={busy||!date||week<1} onClick={()=>void publish()}>{busy?'Publicando…':'Publicar calendário'}</Button>
    </div>
   </div>
   <label className="narrator-calendar-check"><input type="checkbox" checked={automatic} onChange={e=>{editedRef.current=true;setAutomatic(e.target.checked);setMessage('');}}/>Avançar uma désdia ao abrir nova rodada</label>
   <p className="narrator-calendar-selection" aria-live="polite">Data selecionada para publicação: <strong>{formatDate(date)}</strong> · <strong>Semana {week}</strong></p>
   <p className="text-sm text-muted-foreground">Avançar um mês pode concluir projetos das casas; retroceder a data não desfaz essas conclusões. A rodada é interna; os jogadores veem a désdia calculada pelo dia.</p>
  </div>
  <div className="narrator-calendar-panel">
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
  {needsVersionRefresh&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void reloadVersion()}>Atualizar versão sem perder data selecionada</Button>}
  <p className="text-xs text-muted-foreground">Calendário · correção de publicação 2026.10.30-b · Versão do registro: {calendar.data.version}</p>
  <div className="narrator-calendar-preview"><h3>Calendário publicado · visão dos jogadores</h3><CampaignCalendar/></div>
 </section>;
}
