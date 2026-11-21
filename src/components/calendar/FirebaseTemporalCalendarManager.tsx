import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {FESTIVALS,MONTHS,annualEvents,dateKey,formatCampaignPeriod,formatDate,parseDate,
  type CampaignDate,type CalendarEvent} from '@/lib/calendar/harptos';
import {nextTendayStart} from '@/lib/calendar/firebase-next-tenday';
import {workspaceRequest} from '@/lib/firebase-workspace/client';

type OfficialDate=CampaignDate&{version:number};
type SavedEvent={id:string;version:number;date:string;title:string;description:string;
  deleted:boolean;published:boolean;pending:boolean};
type DateResult={changed:boolean;duplicate:boolean;calendar:OfficialDate;openRound:number;
  monthsCrossed:number;houses?:{error?:string}|null};
type ChangeDate=(fields:Record<string,unknown>)=>Promise<DateResult>;
type PublishEvents=()=>Promise<{published:number}>;
type Props={calendar:OfficialDate;openRound:number;changeDate:ChangeDate;
  publishEvents:PublishEvents;onDone:()=>void};

const ordinal=(d:CampaignDate)=>d.year*1000+d.month*40+(d.festival?31:d.day);
const valid=(d:CampaignDate)=>{
 const parsed=parseDate(dateKey(d));
 return parsed!==null&&parsed.year===d.year&&parsed.month===d.month&&
  parsed.day===d.day&&parsed.festival===d.festival;
};
const safeString=(e:unknown)=>e instanceof Error?e.message:'Serviço do calendário indisponível.';

/** Narrator-only Firebase calendar. Does not depend on Supabase, the archive
 * snapshot, a browser clock or an implicit round advance. */
export function FirebaseTemporalCalendarManager({
 calendar,openRound,changeDate,publishEvents,onDone,
}:Props){
 const [mode,setMode]=useState<'set'|'advance'>('set');
 const [target,setTarget]=useState<CampaignDate>(calendar);
 const [reason,setReason]=useState('');
 const [ackMonth,setAckMonth]=useState(false);
 const [ackPast,setAckPast]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [year,setYear]=useState(calendar.year);
 const [month,setMonth]=useState(calendar.month);
 const [selected,setSelected]=useState(dateKey(calendar));
 const [drafts,setDrafts]=useState<SavedEvent[]>([]);
 const [published,setPublished]=useState<CalendarEvent[]>([]);
 const [eventsLoading,setEventsLoading]=useState(true);
 const [eventsError,setEventsError]=useState('');
 const [editId,setEditId]=useState<string|null>(null);
 const [editVersion,setEditVersion]=useState<number|null>(null);
 const [title,setTitle]=useState('');
 const [description,setDescription]=useState('');

 useEffect(()=>{
  setTarget(calendar);setYear(calendar.year);setMonth(calendar.month);
  setSelected(dateKey(calendar));setAckMonth(false);setAckPast(false);
 },[calendar.year,calendar.month,calendar.day,calendar.festival,calendar.version]);

 const loadEvents=useCallback(async()=>{
  const [d,p]=await Promise.all([
   workspaceRequest({kind:'rpc',name:'get_campaign_schedule_drafts',args:{}}),
   workspaceRequest({kind:'rpc',name:'get_campaign_schedule_events',
    args:{p_year:year,p_month:month}}),
  ]);
  if(!Array.isArray(d)||!Array.isArray(p))
   throw Error('O Firebase não retornou a lista de eventos esperada.');
  setDrafts(d as SavedEvent[]);setPublished(p as CalendarEvent[]);
 },[year,month]);
 useEffect(()=>{
  let active=true;
  setEventsLoading(true);setEventsError('');
  void loadEvents().catch(e=>{if(active)setEventsError(safeString(e));})
   .finally(()=>{if(active)setEventsLoading(false);});
  return()=>{active=false;};
 },[loadEvents]);

 const monthDelta=(target.year-calendar.year)*12+(target.month-calendar.month);
 const earlier=ordinal(target)<ordinal(calendar);
 const targetValid=valid(target);
 const changed=targetValid&&dateKey(target)!==dateKey(calendar);
 const canCommit=targetValid&&changed&&reason.trim().length>=12&&
  monthDelta>=0&&monthDelta<=3&&(!earlier||ackPast)&&
  (monthDelta===0||ackMonth)&&!busy;

 async function commitDate(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!canCommit)return;
  if(!window.confirm('Alterar a data oficial de '+formatDate(dateKey(calendar))+
   ' para '+formatDate(dateKey(target))+' sem fechar a Semana '+openRound+
   '? Nenhuma missiva será entregue por esta alteração. Operações passadas não serão desfeitas.'))return;
  setBusy(true);setMessage('');
  try{
   const r=await changeDate({
    expectedCalendarVersion:calendar.version,expectedOpenRound:openRound,
    proposedDate:target,reason:reason.trim(),
    requestKey:typeof crypto!=='undefined'&&crypto.randomUUID
     ?crypto.randomUUID():'date-'+Date.now(),
    allowBackdate:earlier,acknowledgeIrreversibleEffects:earlier&&ackPast,
    acknowledgeHouseEffectsPending:monthDelta>0&&ackMonth,
   });
   setMessage('Data oficial atualizada para '+formatDate(dateKey(r.calendar))+
    '. A Semana '+r.openRound+' permanece aberta.'+
    (r.houses?.error?' Os efeitos mensais das Casas exigem reprocessamento.':''));
   setReason('');onDone();
  }catch(e){setMessage(safeString(e));}
  finally{setBusy(false);}
 }
 const shiftMonth=(delta:-1|1)=>{
  const n=year*12+month+delta;
  if(n<12||n>9999*12+11)return;
  const y=Math.floor(n/12),m=n%12;
  setYear(y);setMonth(m);
  setSelected(dateKey({year:y,month:m,day:1,festival:null}));
 };
 const events=useMemo(()=>[
  ...annualEvents(year).filter(e=>parseDate(e.date)?.month===month),
  ...published,
 ],[year,month,published]);
 const eventsAt=(day:string)=>events.filter(e=>e.date===day);
 const selectedEvents=eventsAt(selected);
 const currentKey=dateKey(calendar);
 const currentIsVisible=calendar.year===year&&calendar.month===month;

 async function saveEvent(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(busy||title.trim().length===0||!parseDate(selected))return;
  setBusy(true);setMessage('');
  try{
   await workspaceRequest({kind:'rpc',name:'save_campaign_schedule_event',args:{
    p_payload:{id:editId,version:editVersion,date:selected,title:title.trim(),
     description,deleted:false},
   }});
   setMessage('Evento salvo como rascunho. Publique os eventos para mostrá-lo aos jogadores.');
   setEditId(null);setEditVersion(null);setTitle('');setDescription('');
   await loadEvents();
  }catch(err){setMessage(safeString(err));}
  finally{setBusy(false);}
 }
 function editEvent(event:SavedEvent){
  setEditId(event.id);setEditVersion(event.version);
  setTitle(event.title);setDescription(event.description);
  setSelected(event.date);
  const d=parseDate(event.date);
  if(d){setYear(d.year);setMonth(d.month);}
 }
 async function markDeleted(event:SavedEvent,deleted:boolean){
  if(busy||!window.confirm(deleted
   ?'Marcar este evento para exclusão na próxima publicação?'
   :'Restaurar este evento como rascunho?'))return;
  setBusy(true);setMessage('');
  try{
   await workspaceRequest({kind:'rpc',name:'save_campaign_schedule_event',args:{
    p_payload:{id:event.id,version:event.version,date:event.date,
     title:event.title,description:event.description,deleted},
   }});
   setMessage(deleted?'Exclusão pendente de publicação.':'Evento restaurado como rascunho.');
   await loadEvents();
  }catch(err){setMessage(safeString(err));}
  finally{setBusy(false);}
 }
 async function publish(){
  if(busy||!window.confirm('Publicar os eventos pendentes para todos os leitores, sem mudar a data e sem abrir outra semana?'))return;
  setBusy(true);setMessage('');
  try{
   const out=await publishEvents();
   setMessage(out.published
    ?out.published+' evento(s) publicado(s). A data e a rodada não foram alteradas.'
    :'Nenhum evento pendente de publicação.');
   await loadEvents();onDone();
  }catch(err){setMessage(safeString(err));}
  finally{setBusy(false);}
 }
 return <section className="space-y-5" aria-label="Calendário e eventos oficiais do Narrador">
  <div className="rounded border p-4 space-y-3" id="temporal-comando">
   <h3 className="text-lg font-semibold">Comando central de tempo</h3>
   <p className="text-sm">Data oficial: <strong>{formatCampaignPeriod(calendar)}</strong> ·
    versão {calendar.version} · Semana de missivas <strong>{openRound}</strong>.</p>
   <p className="text-sm">Mudar o dia não fecha a semana, não entrega missivas programadas
    e não publica eventos pendentes.</p>
   <form onSubmit={e=>void commitDate(e)} className="space-y-3">
    <label className="block text-sm">Ação temporal
     <select className="block w-full rounded border p-2" value={mode} onChange={e=>{
      const m=e.target.value as 'set'|'advance';setMode(m);
      setTarget(m==='advance'?nextTendayStart(calendar):calendar);
      setAckMonth(false);setAckPast(false);
     }}>
      <option value="set">Corrigir / escolher a data de Harptos</option>
      <option value="advance">Avançar para a próxima désdia, sem mudar a semana</option>
     </select>
    </label>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
     <label className="text-sm">Ano (CV)
      <input type="number" min={1} max={9999} required className="block w-full rounded border p-2"
       value={target.year} onChange={e=>setTarget({...target,year:Number(e.target.value)})}/>
     </label>
     <label className="text-sm">Mês
      <select className="block w-full rounded border p-2" value={target.month}
       onChange={e=>{setTarget({...target,month:Number(e.target.value),festival:null});setAckMonth(false);}}>
       {MONTHS.map((name,i)=><option key={name} value={i}>{name}</option>)}
      </select>
     </label>
     <label className="text-sm">Dia
      <input type="number" min={1} max={30} required disabled={Boolean(target.festival)}
       className="block w-full rounded border p-2" value={target.day}
       onChange={e=>setTarget({...target,day:Number(e.target.value)})}/>
     </label>
    </div>
    <label className="block text-sm">Festival (opcional)
     <select className="block w-full rounded border p-2" value={target.festival??''}
      onChange={e=>{const f=FESTIVALS.find(x=>x.id===e.target.value);
       setTarget(f?{...target,festival:f.id,month:f.month,day:30}:{...target,festival:null});
      }}>
      <option value="">Dia comum</option>
      {FESTIVALS.filter(f=>f.id!=='shieldmeet'||target.year%4===0)
       .map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
     </select>
    </label>
    <label className="block text-sm">Justificativa da mudança
     <textarea minLength={12} maxLength={300} required rows={2}
      className="block w-full rounded border p-2" value={reason}
      onChange={e=>setReason(e.target.value)}
      placeholder="Ex.: Atualização do dia oficial sem alterar a rodada das missivas"/>
    </label>
    {earlier&&monthDelta===0&&<label className="flex gap-2 text-sm">
     <input type="checkbox" checked={ackPast} onChange={e=>setAckPast(e.target.checked)}/>
     Autorizo a correção para um dia anterior do mesmo mês. Entendo que
     ações e efeitos já realizados não serão revertidos.
    </label>}
    {monthDelta>0&&<label className="flex gap-2 text-sm">
     <input type="checkbox" checked={ackMonth} onChange={e=>setAckMonth(e.target.checked)}/>
     Confirmo a virada de mês e o processamento ou registro dos efeitos
     mensais das Casas, sem avançar a semana das missivas.
    </label>}
    {monthDelta<0&&<p role="alert" className="text-sm">Não é permitido voltar a um mês histórico
     por este comando: os efeitos econômicos já executados não seriam revertidos.</p>}
    {!targetValid&&<p role="alert" className="text-sm">Selecione uma data válida de Harptos.</p>}
    <button type="submit" disabled={!canCommit} className="rounded border px-4 py-2 disabled:opacity-50">
     {busy?'Atualizando…':'Confirmar data oficial sem fechar semana'}
    </button>
   </form>
  </div>
  <div className="rounded border p-4 space-y-3" id="temporal-eventos">
   <h3 className="text-lg font-semibold">Calendário de Harptos e eventos oficiais</h3>
   <div className="flex flex-wrap items-center gap-3">
    <button type="button" className="rounded border px-3 py-2" onClick={()=>shiftMonth(-1)}
     disabled={year<=1&&month===0}>Mês anterior</button>
    <strong>{MONTHS[month]} · {year} CV</strong>
    <button type="button" className="rounded border px-3 py-2" onClick={()=>shiftMonth(1)}
     disabled={year>=9999&&month===11}>Próximo mês</button>
    {!currentIsVisible&&<button type="button" className="rounded border px-3 py-2" onClick={()=>{
     setYear(calendar.year);setMonth(calendar.month);setSelected(currentKey);
    }}>Voltar à data oficial</button>}
   </div>
   <div className="space-y-3">
    {[0,1,2].map(period=><div key={period} className="space-y-1">
     <p className="text-xs font-semibold">{period+1}ª désdia · dias {period*10+1}–{period*10+10}</p>
     <div className="grid grid-cols-5 sm:grid-cols-10 gap-1">
      {Array.from({length:10},(_,i)=>{
       const d=period*10+i+1,k=dateKey({year,month,day:d,festival:null});
       const count=eventsAt(k).length;
       return <button type="button" key={k} aria-current={currentKey===k?'date':undefined}
        aria-pressed={selected===k} aria-label={'Dia '+d+', '+count+' evento(s)'}
        className={'rounded border px-2 py-2 text-sm '+(selected===k?'font-bold border-amber-600 ':
         currentKey===k?'border-current font-semibold ':'')}
        onClick={()=>setSelected(k)}>
        {d}{count>0&&<span aria-hidden="true"> ·</span>}
       </button>;
      })}
     </div>
    </div>)}
    {FESTIVALS.filter(f=>f.month===month&&(f.id!=='shieldmeet'||year%4===0))
     .map(f=><button type="button" key={f.id} className="rounded border p-2 mr-2"
      onClick={()=>setSelected(dateKey({year,month,day:30,festival:f.id}))}>{f.name}</button>)}
   </div>
   <div className="border-t pt-3">
    <h4 className="font-semibold">{formatDate(selected)}</h4>
    {eventsLoading?<p role="status">Carregando eventos…</p>:
     eventsError?<p role="alert">{eventsError}</p>:
     selectedEvents.length===0?<p className="text-sm">Nenhum evento publicado para esta data.</p>:
     <ul className="space-y-2">{selectedEvents.map(event=><li key={event.id} className="text-sm">
      <strong>{event.title}</strong>{event.description&&<p>{event.description}</p>}
     </li>)}</ul>}
   </div>
  </div>
  <div className="rounded border p-4 space-y-3" aria-label="Gerenciar eventos do Narrador">
   <h3 className="text-lg font-semibold">Cadastro e edição de eventos</h3>
   <p className="text-sm">Escolha uma data no calendário. Salvar cria apenas um rascunho;
    publicar é uma ação separada e não altera o dia nem a Semana {openRound}.</p>
   <form onSubmit={e=>void saveEvent(e)} className="space-y-3">
    <p className="text-sm"><strong>Data do evento:</strong> {formatDate(selected)}
     {editId&&' · editando evento cadastrado'}</p>
    <label className="block text-sm">Título
     <input required maxLength={200} className="block w-full rounded border p-2"
      value={title} onChange={e=>setTitle(e.target.value)}/>
    </label>
    <label className="block text-sm">Descrição
     <textarea rows={3} maxLength={5000} className="block w-full rounded border p-2"
      value={description} onChange={e=>setDescription(e.target.value)}/>
    </label>
    <div className="flex flex-wrap gap-2">
     <button type="submit" disabled={busy||!title.trim()} className="rounded border px-4 py-2 disabled:opacity-50">
      {editId?'Salvar alteração em rascunho':'Cadastrar evento'}
     </button>
     {editId&&<button type="button" className="rounded border px-4 py-2" onClick={()=>{
      setEditId(null);setEditVersion(null);setTitle('');setDescription('');
     }}>Cancelar edição</button>}
    </div>
   </form>
   <div className="flex flex-wrap items-center gap-3">
    <h4 className="font-semibold">Eventos cadastrados ({drafts.length})</h4>
    <button type="button" className="rounded border px-3 py-1" disabled={busy}
     onClick={()=>void loadEvents().catch(e=>setEventsError(safeString(e)))}>Atualizar eventos</button>
   </div>
   {eventsLoading?<p role="status">Buscando eventos cadastrados…</p>:
    eventsError?<p role="alert">{eventsError}</p>:
    drafts.length===0?<p className="text-sm">Nenhum evento registrado no acervo operacional.</p>:
    <div className="space-y-2">{drafts.map(event=><article key={event.id} className="rounded border p-3 text-sm">
     <p><strong>{event.title}</strong> · {formatDate(event.date)} ·
      {' '}{event.pending?(event.deleted?'Exclusão pendente':'Rascunho pendente'):
       event.published?'Publicado':'Não publicado'}</p>
     {event.description&&<p>{event.description}</p>}
     <div className="flex flex-wrap gap-2 mt-2">
      <button type="button" className="rounded border px-3 py-1" disabled={busy}
       onClick={()=>editEvent(event)}>Editar</button>
      <button type="button" className="rounded border px-3 py-1" disabled={busy}
       onClick={()=>void markDeleted(event,!event.deleted)}>
       {event.deleted?'Restaurar':'Excluir'}
      </button>
     </div>
    </article>)}</div>}
   <button type="button" disabled={busy||eventsLoading||Boolean(eventsError)}
    className="rounded border px-4 py-2 disabled:opacity-50"
    onClick={()=>void publish()}>Publicar eventos pendentes sem abrir outra semana</button>
  </div>
  {message&&<p role="status" className="rounded border p-3 text-sm">{message}</p>}
 </section>;
}
