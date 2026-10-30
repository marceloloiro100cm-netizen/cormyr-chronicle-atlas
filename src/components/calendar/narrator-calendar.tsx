import {useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {CampaignDatePicker} from './date-picker';
import {CampaignCalendar,type CalendarState} from './calendar';
import {dateKey,formatDate} from '@/lib/calendar/harptos';

type DraftEvent={
 id:string;date:string;title:string;description:string;deleted:boolean;
 version:number;published:boolean;
};

export function NarratorCalendar(){
 const qc=useQueryClient();
 const calendar=useQuery({queryKey:['campaign-calendar'],queryFn:async()=>{
  const {data,error}=await supabase.rpc('get_campaign_calendar');
  if(error)throw error;
  return data as unknown as CalendarState;
 },refetchInterval:15000});
 const drafts=useQuery({queryKey:['campaign-schedule-drafts'],queryFn:async()=>{
  const {data,error}=await supabase.rpc('get_campaign_schedule_drafts');
  if(error)throw error;
  return data as unknown as DraftEvent[];
 },refetchInterval:30000});
 const [date,setDate]=useState(''),[week,setWeek]=useState(1),[automatic,setAutomatic]=useState(true);
 const [editId,setEditId]=useState<string|null>(null),[editVersion,setEditVersion]=useState<number|null>(null);
 const [eventDate,setEventDate]=useState(''),[title,setTitle]=useState(''),[description,setDescription]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{
  if(!calendar.data)return;
  setDate(dateKey(calendar.data));setWeek(calendar.data.published_week??1);
  setAutomatic(calendar.data.auto_advance);
  if(!eventDate)setEventDate(dateKey(calendar.data));
 },[calendar.data?.version]);
 const reset=()=>{setEditId(null);setEditVersion(null);setEventDate(date||'1522-01-01');setTitle('');setDescription('');};
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
  }catch(err){setMessage(err instanceof Error?err.message:'Falha ao salvar evento.');}
  finally{setBusy(false);}
 }
 async function publish(){
  if(!calendar.data||busy)return;
  if(!date||week<1||!Number.isInteger(week)){setMessage('Informe uma data e semana válidas.');return;}
  if(!window.confirm('Publicar a data, semana e eventos do calendário para todas as casas?'))return;
  setBusy(true);setMessage('');
  try{
   const {error}=await supabase.rpc('publish_campaign_schedule',{
    p_version:calendar.data.version,p_date:date,p_auto:automatic,p_week:week
   });
   if(error)throw error;
   await Promise.all([
    qc.invalidateQueries({queryKey:['campaign-calendar']}),
    qc.invalidateQueries({queryKey:['campaign-schedule-drafts']}),
    qc.invalidateQueries({queryKey:['calendar-schedule-events']}),
    qc.invalidateQueries({queryKey:['noble-house']})
   ]);
   setMessage('Calendário publicado. As fichas dos jogadores consultarão esta versão automaticamente.');
  }catch(err){setMessage(err instanceof Error?err.message:'Não foi possível publicar o calendário.');}
  finally{setBusy(false);}
 }
 if(calendar.isPending||drafts.isPending)return <p role="status">Carregando calendário do Narrador…</p>;
 if(calendar.error||drafts.error||!calendar.data)return <p role="alert">Não foi possível carregar o calendário. {calendar.error?.message??drafts.error?.message} <Button type="button" onClick={()=>{calendar.refetch();drafts.refetch();}}>Tentar novamente</Button></p>;
 return <section className="narrator-calendar">
  <div className="campaign-heading"><div><p className="campaign-eyebrow">NARRADOR · CAMPANHA</p><h2>Calendário da campanha</h2></div></div>
  <p>Defina a semana atual, a data de Harptos e os eventos do reino. Apenas eventos publicados aparecem nas fichas das casas. As missivas privadas continuam restritas aos respectivos destinatários.</p>
  <div className="narrator-calendar-panel">
   <h3>Data e semana da campanha</h3>
   <div className="narrator-calendar-settings">
    <CampaignDatePicker value={date} onChange={setDate}/>
    <label>Semana atual do jogo
     <input type="number" min={1} step={1} value={week} onChange={e=>setWeek(Number(e.target.value))}/>
    </label>
   </div>
   <label className="narrator-calendar-check"><input type="checkbox" checked={automatic} onChange={e=>setAutomatic(e.target.checked)}/>Avançar uma désdia ao abrir nova rodada</label>
   <p className="text-sm text-muted-foreground">Avançar um mês pode concluir projetos das casas; retroceder a data não desfaz essas conclusões. A semana exibida é global para todas as fichas.</p>
  </div>
  <div className="narrator-calendar-panel">
   <h3>{editId?'Editar evento':'Criar evento em uma data'}</h3>
   <form className="campaign-form narrator-event-form" onSubmit={e=>{e.preventDefault();void saveEvent();}}>
    <CampaignDatePicker value={eventDate} onChange={setEventDate}/>
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
       setEditId(event.id);setEditVersion(event.version);setEventDate(event.date);setTitle(event.title);setDescription(event.description);
      }}>Editar</Button>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>{
       if(event.deleted){void saveEvent(false,event);return;}
       if(window.confirm('Marcar este evento para exclusão na próxima publicação?'))void saveEvent(true,event);
      }}>{event.deleted?'Restaurar':'Excluir'}</Button>
     </div>
    </article>)}
   </div>
  </div>
  <div className="narrator-calendar-publish">
   <div><strong>Publicação global</strong><p>Publica as alterações para todas as casas ao mesmo tempo. Os eventos em rascunho permanecem privados até aqui.</p></div>
   <Button type="button" disabled={busy||!date||week<1} onClick={()=>void publish()}>{busy?'Publicando…':'Publicar calendário'}</Button>
  </div>
  <p role="status">{message}</p>
  <div className="narrator-calendar-preview"><h3>Calendário publicado · visão dos jogadores</h3><CampaignCalendar/></div>
 </section>;
}
