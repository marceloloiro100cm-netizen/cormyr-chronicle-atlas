import {useEffect,useId,useState} from 'react';
import {MONTHS,FESTIVALS,dateKey,parseDate,formatDate} from '@/lib/calendar/harptos';
import './harptos.css';

export function CampaignDatePicker({value,onChange,name='campaign_date',updateOnNavigation=false,referenceDate}:{value:string;onChange:(value:string)=>void;name?:string;updateOnNavigation?:boolean;referenceDate?:string}){
  const id=useId(),selected=parseDate(value),reference=parseDate(referenceDate);
  const [year,setYear]=useState(selected?.year??reference?.year??0),[month,setMonth]=useState(selected?.month??reference?.month??0);
  // A data selecionada é histórica ou autoral; referenceDate serve apenas para
  // localizar a navegação no presente oficial, sem escolher o dia pelo jogador.
  useEffect(()=>{const next=parseDate(value)??parseDate(referenceDate);if(next){setYear(next.year);setMonth(next.month);}},[value,referenceDate]);
  const navigate=(nextYear:number,nextMonth:number)=>{
    if(!Number.isInteger(nextYear)||nextYear<1||nextYear>9999||nextMonth<0||nextMonth>11)return;
    setYear(nextYear);setMonth(nextMonth);
    // The Narrator edits the global date; changing month/year must update
    // the committed value, not merely the month being browsed.
    if(updateOnNavigation&&selected)onChange(dateKey({year:nextYear,month:nextMonth,day:selected.festival?1:selected.day,festival:null}));
  };
  return <fieldset className="harptos-picker"><legend>Data da campanha (obrigatória)</legend>
    <details><summary>{value?formatDate(value):'Selecionar dia no calendário'}</summary>
      <div className="harptos-controls"><label>Ano<input type="number" min={1} max={9999} value={year||''} placeholder="Ano CV" onChange={e=>{const n=Number(e.target.value);if(n>=1&&n<=9999)navigate(n,month);}}/></label><label>Mês<select value={month} onChange={e=>navigate(year,Number(e.target.value))}>{MONTHS.map((m,i)=><option key={m} value={i}>{m}</option>)}</select></label></div>
      {year===0&&<p role="status">Informe um ano ou aguarde a data oficial para navegar pelos dias.</p>}
      {year>0&&[0,1,2].map(row=><div key={row}><small>{row+1}ª désdia</small><div className="harptos-days">{Array.from({length:10},(_,i)=>{const day=row*10+i+1,key=dateKey({year,month,day,festival:null});return <button type="button" key={day} aria-pressed={value===key} aria-label={`${day} de ${MONTHS[month]}, ${year}`} onClick={()=>onChange(key)}>{day}</button>;})}</div></div>)}
      {year>0&&<div className="harptos-festivals">{FESTIVALS.filter(f=>f.month===month&&(f.id!=='shieldmeet'||year%4===0)).map(f=>{const key=dateKey({year,month,day:30,festival:f.id});return <button type="button" key={f.id} aria-pressed={value===key} onClick={()=>onChange(key)}>{f.name}</button>;})}</div>}
    </details>
    <label htmlFor={id} className="harptos-date-label">Dia selecionado<select id={id} name={name} required value={value} onChange={e=>onChange(e.target.value)}><option value="">Selecione uma data acima</option>{value&&<option value={value}>{formatDate(value)}</option>}</select></label>
  </fieldset>;
}
