import {useEffect,useId,useState} from 'react';
import {MONTHS,FESTIVALS,dateKey,parseDate,formatDate} from '@/lib/calendar/harptos';
import './harptos.css';

export function CampaignDatePicker({value,onChange,name='campaign_date'}:{value:string;onChange:(value:string)=>void;name?:string}){
  const id=useId(),selected=parseDate(value);
  const [year,setYear]=useState(selected?.year??1522),[month,setMonth]=useState(selected?.month??0);
  // The value arrives asynchronously from the shared campaign calendar.
  // Keep the visible month/year in sync with the selected date after loading
  // or publication; otherwise the picker appears stuck in Hammer 1522.
  useEffect(()=>{const next=parseDate(value);if(next){setYear(next.year);setMonth(next.month);}},[value]);
  return <fieldset className="harptos-picker"><legend>Data da campanha (obrigatória)</legend>
    <details><summary>{value?formatDate(value):'Selecionar dia no calendário'}</summary>
      <div className="harptos-controls"><label>Ano<input type="number" min={1} max={9999} value={year} onChange={e=>{const n=Number(e.target.value);if(n>=1&&n<=9999)setYear(n);}}/></label><label>Mês<select value={month} onChange={e=>setMonth(Number(e.target.value))}>{MONTHS.map((m,i)=><option key={m} value={i}>{m}</option>)}</select></label></div>
      {[0,1,2].map(row=><div key={row}><small>{row+1}ª désdia</small><div className="harptos-days">{Array.from({length:10},(_,i)=>{const day=row*10+i+1,key=dateKey({year,month,day,festival:null});return <button type="button" key={day} aria-pressed={value===key} aria-label={`${day} de ${MONTHS[month]}, ${year}`} onClick={()=>onChange(key)}>{day}</button>;})}</div></div>)}
      <div className="harptos-festivals">{FESTIVALS.filter(f=>f.month===month&&(f.id!=='shieldmeet'||year%4===0)).map(f=>{const key=dateKey({year,month,day:30,festival:f.id});return <button type="button" key={f.id} aria-pressed={value===key} onClick={()=>onChange(key)}>{f.name}</button>;})}</div>
    </details>
    <label htmlFor={id} className="harptos-date-label">Dia selecionado<select id={id} name={name} required value={value} onChange={e=>onChange(e.target.value)}><option value="">Selecione uma data acima</option>{value&&<option value={value}>{formatDate(value)}</option>}</select></label>
  </fieldset>;
}
