import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useCampaignTime, type CampaignTimeSnapshot} from '@/lib/calendar/campaign-time';
import {Shield,Flame,Leaf} from 'lucide-react';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {MONTHS,MONTH_DETAILS,FESTIVALS,annualEvents,dateKey,formatDate,formatCampaignPeriod,type CalendarEvent} from '@/lib/calendar/harptos';
import {useCampaignCalendarRealtime} from './realtime';
import './harptos.css';

export type CalendarState=CampaignTimeSnapshot;
function Symbol({kind}:{kind:CalendarEvent['kind']}){const Icon=kind==='mail'?Flame:kind==='season'?Leaf:Shield;return <Icon size={16} className={'harptos-'+kind} aria-hidden="true"/>;}
export function CampaignCalendar(){
 const realtimeStatus=useCampaignCalendarRealtime();
 const calendar=useCampaignTime();
 const [year,setYear]=useState(1),[month,setMonth]=useState(0),[selected,setSelected]=useState(''),[followCurrent,setFollowCurrent]=useState(true);
 // Não renderizar/fazer buscas de um ano provisório enquanto o snapshot publicado chega.
 const viewReady=Boolean(calendar.data&&!calendar.isError&&(!followCurrent||(year===calendar.data.year&&month===calendar.data.month)));
 // Update the open player calendar when the Narrator publishes a different date,
 // but preserve a month intentionally browsed by the player.
 const publishedDate=calendar.data?dateKey(calendar.data):null;
 useEffect(()=>{
  if(calendar.data&&followCurrent){
   setYear(calendar.data.year);setMonth(calendar.data.month);setSelected(dateKey(calendar.data));
  }
 },[publishedDate,followCurrent]);
 const mail=useQuery({queryKey:['calendar-events',year,month],enabled:viewReady,queryFn:async()=>{const r=await supabase.rpc('calendar_mail_events',{p_year:year,p_month:month});if(r.error)throw r.error;return r.data as unknown as CalendarEvent[];},refetchInterval:30000});
 const published=useQuery({queryKey:['calendar-schedule-events',year,month],enabled:viewReady,queryFn:async()=>{const r=await supabase.rpc('get_campaign_schedule_events',{p_year:year,p_month:month});if(r.error)throw r.error;return r.data as unknown as CalendarEvent[];},refetchInterval:15000});
 // Cached private correspondence must never remain visible after a failed RLS/RPC read.
 // Annual public observances remain available; no date is inferred from cache errors.
 const events=[...annualEvents(year),...(mail.isError?[]:mail.data??[]),...(published.isError?[]:published.data??[])],onDay=(key:string)=>events.filter(e=>e.date===key);
 const chooseMonth=(m:number)=>{setFollowCurrent(false);const y=m<0?year-1:m>11?year+1:year;if(y<1||y>9999)return;const next=(m+12)%12;setYear(y);setMonth(next);setSelected(dateKey({year:y,month:next,day:1,festival:null}));};
 // Apenas a ativação do botão (clique, Enter ou Espaço) seleciona um dia; hover e foco não alteram o painel de eventos.
 const cell=(key:string,label:string)=>{const items=onDay(key);return <button type="button" key={key} aria-current={calendar.data&&dateKey(calendar.data)===key?'date':undefined} aria-pressed={selected===key} aria-describedby={selected===key?'harptos-events':undefined} aria-label={`${formatDate(key)}: ${items.length} evento(s)`} title={items.map(e=>e.title).join('\n')||'Nenhum evento visível neste dia'} onClick={()=>setSelected(key)}><span>{label}</span><span className="harptos-symbols">{(['kingdom','mail','season'] as const).filter(kind=>items.some(e=>e.kind===kind)).map(kind=><Symbol key={kind} kind={kind}/>)}</span></button>;};
 if(!viewReady)return <section className="harptos"><h2>Calendário de Harptos</h2><p role={calendar.error?'alert':'status'}>{calendar.error?'Calendário oficial indisponível; nenhuma data foi presumida.':'Sincronizando data oficial da campanha…'}</p></section>;
 return <section className="harptos"><div className="harptos-intro"><div className="harptos-intro-copy"><h2>Calendário de Harptos</h2>
 <p className="harptos-sync-status" role="status">{realtimeStatus==='live'?'Sincronização em tempo real ativa':realtimeStatus==='fallback'?'Conexão em tempo real indisponível · atualização automática a cada 15 segundos':'Conectando calendário em tempo real · atualização automática ativa'}</p>
 {calendar.data&&!calendar.isError&&<p className="harptos-week" role="status" aria-live="polite">{formatCampaignPeriod(calendar.data)}</p>}
 <details><summary>Os doze meses de Harptos</summary><div className="harptos-months">{MONTHS.map((name,i)=><button type="button" key={name} aria-pressed={month===i} onClick={()=>chooseMonth(i)}><strong>{i+1}. {name}</strong><small>{MONTH_DETAILS[i]![0]} · {MONTH_DETAILS[i]![1]}</small></button>)}</div></details><p>Três désdias de dez dias por mês. Os festivais são dias intercalares.</p>
 </div>
 <svg className="harptos-compass" viewBox="0 0 160 160" role="img" aria-label="Rosa dos ventos"><circle cx="80" cy="80" r="52" fill="none" stroke="currentColor" opacity=".4"/><path d="M80 15 91 69 145 80 91 91 80 145 69 91 15 80 69 69Z" fill="none" stroke="currentColor"/><path d="M80 15 80 80 91 69ZM145 80 80 80 91 91ZM80 145 80 80 69 91ZM15 80 80 80 69 69Z" fill="currentColor" opacity=".65"/><circle cx="80" cy="80" r="4" fill="currentColor"/><text x="80" y="11" textAnchor="middle" fill="currentColor" fontSize="10">N</text></svg>
 </div>
 <div className="harptos-legend"><span><Symbol kind="kingdom"/>Cormyr · festas e eventos</span><span><Symbol kind="mail"/>Missivas entregues</span><span><Symbol kind="season"/>Estações</span></div>
 <h3>{MONTHS[month]} · {MONTH_DETAILS[month]![0]}</h3><div className="harptos-controls"><Button variant="outline" disabled={year===1&&month===0} onClick={()=>chooseMonth(month-1)}>Anterior</Button><label>Mês<select value={month} onChange={e=>chooseMonth(Number(e.target.value))}>{MONTHS.map((m,i)=><option key={m} value={i}>{m}</option>)}</select></label><label>Ano<input type="number" min={1} max={9999} value={year} onChange={e=>{const y=Number(e.target.value);if(y>=1&&y<=9999){setFollowCurrent(false);setYear(y);setSelected(dateKey({year:y,month,day:1,festival:null}));}}}/></label><Button variant="outline" disabled={year===9999&&month===11} onClick={()=>chooseMonth(month+1)}>Próximo</Button>{calendar.data&&<Button variant="ghost" onClick={()=>{setFollowCurrent(true);setYear(calendar.data!.year);setMonth(calendar.data!.month);setSelected(dateKey(calendar.data!));}}>Data atual</Button>}</div>
 {[0,1,2].map(row=><div key={row} className={calendar.data&&calendar.data.year===year&&calendar.data.month===month&&!calendar.data.festival&&Math.floor((calendar.data.day-1)/10)===row?'harptos-current-desdia':undefined}><p className="harptos-day-label">{row+1}ª désdia</p><div className="harptos-days">{Array.from({length:10},(_,i)=>{const day=row*10+i+1;return cell(dateKey({year,month,day,festival:null}),String(day));})}</div></div>)}
 <div className="harptos-festivals">{FESTIVALS.filter(f=>f.month===month&&(f.id!=='shieldmeet'||year%4===0)).map(f=>cell(dateKey({year,month,day:30,festival:f.id}),f.name))}</div>
 <div id="harptos-events" className="harptos-events" aria-live="polite"><h4>{formatDate(selected)}</h4>{onDay(selected).length?onDay(selected).map(e=><div className="harptos-event" key={e.id}><Symbol kind={e.kind}/><div><strong>{e.title}</strong>{e.description&&<p>{e.description}</p>}</div></div>):<p>Nenhum evento visível neste dia.</p>}</div>
 {(calendar.error||mail.error||published.error)&&<p role="alert">Não foi possível carregar {calendar.error?'a data global':published.error?'os eventos publicados':'as missivas'}. As festas continuam disponíveis para consulta. Verifique a migração 0038 e tente novamente. <Button onClick={()=>{calendar.refetch();mail.refetch();published.refetch();}}>Recarregar</Button></p>}

 </section>;
}
