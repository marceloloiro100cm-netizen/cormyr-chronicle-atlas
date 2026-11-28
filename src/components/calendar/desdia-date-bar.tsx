import {useState} from 'react';
import {CalendarDays} from 'lucide-react';
import {CampaignDatePicker} from '@/components/calendar/date-picker';
import {FESTIVALS,MONTHS,dateKey,formatCampaignPeriod,formatDate,parseDate} from '@/lib/calendar/harptos';

export function DesdiaDateBar({
 value,
 officialDate,
 allowFullCalendar=false,
 disabled=false,
 label='Data da missiva (désdia atual)',
 onChange,
}:{
 value:string;
 officialDate?:string|undefined;
 allowFullCalendar?:boolean;
 disabled?:boolean;
 label?:string;
 onChange:(date:string)=>void;
}){
 const [showFull,setShowFull]=useState(false);
 const base=parseDate(officialDate)||parseDate(value);
 const selected=parseDate(value);
 const periodTitle=base?formatCampaignPeriod(base):'Calendário de Harptos';

 // Monta os 10 dias da désdia oficial (ex.: 21–30 de Marpenoth) ou o festival atual.
 const quickDays=(()=>{
  if(!base)return [] as {key:string;label:string;title:string;isOfficial:boolean}[];
  if(base.festival){
   const fest=FESTIVALS.find(f=>f.id===base.festival);
   const key=dateKey(base);
   return [{key,label:fest?.name??base.festival,title:formatDate(key),isOfficial:key===officialDate}];
  }
  const start=Math.floor((base.day-1)/10)*10+1;
  return Array.from({length:10},(_,i)=>{
   const day=start+i;
   const key=dateKey({year:base.year,month:base.month,day,festival:null});
   return {
    key,
    label:String(day),
    title:`${day} de ${MONTHS[base.month]} · ${base.year} CV`,
    isOfficial:key===officialDate,
   };
  });
 })();

 const isOutsidePeriod=Boolean(selected&&base&&(
  base.festival
   ?selected.festival!==base.festival||selected.year!==base.year
   :selected.festival!==null||selected.year!==base.year||selected.month!==base.month||
    Math.floor((selected.day-1)/10)!==Math.floor((base.day-1)/10)
 ));

 return <div className="desdia-picker" role="group" aria-label={label}>
  <div className="desdia-picker-head">
   <span className="desdia-picker-title">
    <CalendarDays size={14} aria-hidden="true"/>
    <strong>{periodTitle}</strong>
    {value&&<span className="desdia-picker-selected">· {formatDate(value)}</span>}
   </span>
   {allowFullCalendar&&<button type="button" className="desdia-picker-toggle" disabled={disabled}
    aria-expanded={showFull||isOutsidePeriod}
    onClick={()=>setShowFull(v=>!v)}>
    {showFull||isOutsidePeriod?'Ocultar calendário completo':'Outro mês / festival'}
   </button>}
  </div>
  {quickDays.length>0&&<div className="desdia-days">
   {quickDays.map(d=><button key={d.key} type="button" disabled={disabled}
    className={'desdia-day'+(value===d.key?' desdia-day--active':'')+(d.isOfficial?' desdia-day--official':'')}
    aria-pressed={value===d.key}
    aria-label={d.title+(d.isOfficial?' (data oficial do HUB)':'')}
    title={d.title+(d.isOfficial?' · Data oficial do HUB':'')}
    onClick={()=>onChange(d.key)}>
    {d.label}
   </button>)}
  </div>}
  {allowFullCalendar&&(showFull||isOutsidePeriod)&&<div className="desdia-full-wrap">
   <CampaignDatePicker value={value} referenceDate={officialDate} onChange={onChange}/>
  </div>}
 </div>;
}
