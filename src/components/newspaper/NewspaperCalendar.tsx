import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Feather} from 'lucide-react';
import {
 FESTIVALS,MONTHS,MONTH_DETAILS,annualEvents,dateKey,formatDate,parseDate,type CalendarEvent,
} from '@/lib/calendar/harptos';
import {getPublishedScheduleEvents} from '@/lib/newspaper/data';

/**
 * Calendário de pautas do jornal. Mostra só eventos públicos: festas e estações do reino
 * e os eventos que o Narrador já publicou. Missivas e dados de Casas nunca entram aqui.
 */
export function NewspaperCalendar({referenceDate,onWriteAbout}:{
 referenceDate:string;
 onWriteAbout:(date:string,eventTitle?:string)=>void;
}){
 const start=parseDate(referenceDate)??{year:1,month:0,day:1,festival:null};
 const [year,setYear]=useState(start.year);
 const [month,setMonth]=useState(start.month);
 const today=parseDate(referenceDate);
 const todayKey=today?dateKey(today):'';
 const [selected,setSelected]=useState(referenceDate&&parseDate(referenceDate)?referenceDate:dateKey({year:start.year,month:start.month,day:1,festival:null}));
 // A data do Hub chega depois da primeira renderização: reabre no mês atual quando ela muda.
 useEffect(()=>{
  const t=parseDate(referenceDate);
  if(!t)return;
  setYear(t.year);setMonth(t.month);setSelected(dateKey(t));
 },[referenceDate]);
 const currentWeekRow=today&&!today.festival&&today.year===year&&today.month===month?Math.floor((today.day-1)/10):-1;
 const published=useQuery({queryKey:['newspaper-calendar-events',year,month],
  queryFn:()=>getPublishedScheduleEvents(year,month),staleTime:60_000,retry:false});
 const events:CalendarEvent[]=[...annualEvents(year),...(published.isError?[]:published.data??[])];
 const onDay=(key:string)=>events.filter(e=>e.date===key);
 const go=(delta:-1|1)=>{
  let y=year,m=month+delta;
  if(m<0){m=11;y-=1;}else if(m>11){m=0;y+=1;}
  if(y<1||y>9999)return;
  setYear(y);setMonth(m);setSelected(dateKey({year:y,month:m,day:1,festival:null}));
 };
 const cell=(key:string,label:string)=>{
  const count=onDay(key).length;
  return <button type="button" key={key} className={`folha-cal-day${selected===key?' folha-cal-selected':''}${todayKey===key?' folha-cal-today':''}`}
   aria-current={todayKey===key?'date':undefined}
   aria-pressed={selected===key} aria-label={`${formatDate(key)}${count?`, ${count} evento(s)`:''}`}
   onClick={()=>setSelected(key)}>
   <span>{label}</span>{count>0&&<i className="folha-cal-dot" aria-hidden="true"/>}</button>;
 };
 const chosen=onDay(selected);
 return <div className="folha-calendar">
  <div className="folha-cal-head">
   <button type="button" onClick={()=>go(-1)} disabled={year===1&&month===0}>Mês anterior</button>
   <strong>{MONTHS[month]} · {MONTH_DETAILS[month]![0]} · {year} CV</strong>
   <button type="button" onClick={()=>go(1)}>Próximo mês</button>
  </div>
  {[0,1,2].map(row=><div key={row} className={`folha-cal-row${row===currentWeekRow?' folha-cal-week':''}`}>
   {row===currentWeekRow&&<span className="folha-cal-week-label">Semana atual</span>}
   {Array.from({length:10},(_,i)=>{const day=row*10+i+1;
    return cell(dateKey({year,month,day,festival:null}),String(day));})}
  </div>)}
  <div className="folha-cal-festivals">{FESTIVALS.filter(f=>f.month===month&&(f.id!=='shieldmeet'||year%4===0))
   .map(f=>cell(dateKey({year,month,day:30,festival:f.id}),f.name))}</div>
  {published.isError&&<p className="folha-empty-copy" role="status">Eventos publicados indisponíveis agora; as festas do reino continuam aqui.</p>}
  <section className="folha-cal-events" aria-label="Eventos da data" aria-live="polite">
   <h4>{formatDate(selected)}</h4>
   {chosen.length===0?<>
    <p className="folha-empty-copy">Nenhum evento público nesta data.</p>
    <button type="button" className="folha-text-action" onClick={()=>onWriteAbout(selected)}>
     <Feather size={16}/> Escrever sobre a data</button></>:
    chosen.map(e=><div key={e.id} className="folha-cal-event">
     <div><strong>{e.title}</strong>{e.description&&<p>{e.description}</p>}</div>
     <button type="button" className="folha-text-action" onClick={()=>onWriteAbout(selected,e.title)}>
      <Feather size={16}/> Escrever sobre a data</button></div>)}
  </section>
 </div>;
}
