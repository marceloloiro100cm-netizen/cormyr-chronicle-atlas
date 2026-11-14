/**
 * Harptos calendar arithmetic (port of 0038/0060 SQL helpers). Pure.
 * Never uses JS Date: the campaign calendar has 12x30 days, five festivals
 * and Shieldmeet every fourth year.
 */
import {isCampaignDate} from './schedule-core.mjs';

export class TimeError extends Error {
  constructor(code,message){super(message);this.name='TimeError';this.code=code;}
}
const fail=(code,m)=>{throw new TimeError(code,m);};
export const FESTIVAL_MONTH={midwinter:0,greengrass:3,midsummer:6,shieldmeet:6,highharvestide:8,'feast-moon':10};
const FESTIVALS=[['midwinter',0,0],['greengrass',3,0],['midsummer',6,0],['shieldmeet',6,1],
  ['highharvestide',8,0],['feast-moon',10,0]];
const MAX_INDEX=9999*360;

export const timeKey=(year,month,day,festival)=>
  String(year).padStart(4,'0')+'-'+(festival==null
    ?String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0')
    :'F-'+festival);

function parts(date){
  if(!isCampaignDate(date))fail('invalid','Data de Harptos inválida');
  const y=Number(date.slice(0,4));
  if(date.slice(5,7)==='F-'){
    const name=date.slice(7);
    return {y,m:FESTIVAL_MONTH[name],d:30,festival:name};
  }
  return {y,m:Number(date.slice(5,7))-1,d:Number(date.slice(8,10)),festival:null};
}
export function ordinaryIndex(date){
  const {y,m,d}=parts(date);
  return (y-1)*360+m*30+d-1;
}
export function fromOrdinaryIndex(i){
  if(!Number.isInteger(i)||i<0||i>=MAX_INDEX)fail('range','Avanço ultrapassa o calendário de Harptos');
  const y=Math.floor(i/360)+1,m=Math.floor((i%360)/30),d=i%30+1;
  return timeKey(y,m,d,null);
}
export function advanceDesdia(start,count){
  if(!Number.isInteger(count)||count<0||count>120)fail('invalid','Informe entre zero e 120 désdias');
  const i=ordinaryIndex(start);
  return count===0?start:fromOrdinaryIndex(i+count*10);
}
/** Chronological day number including festivals and Shieldmeet. */
export function calendarOrdinal(date){
  const {y,m,d,festival}=parts(date);
  const dd=festival?31:d;
  const extra=(m>0?1:0)+(m>3?1:0)+(m>6?1+(y%4===0?1:0):0)+(m>8?1:0)+(m>10?1:0);
  return (y-1)*365+Math.floor((y-1)/4)+m*30+extra+dd-1+(festival==='shieldmeet'?1:0);
}
export const absoluteMonth=date=>{const {y,m}=parts(date);return y*12+m;};
export const monthOfCalendar=c=>c.year*12+c.month;

export function resolveTarget(mode,date,count,current){
  if(mode==='advance'){
    if(date!=null)fail('invalid','Avanço de désdia não aceita data arbitrária');
    if(!Number.isInteger(count)||count<1||count>120)fail('invalid','Informe entre uma e 120 désdias');
    return advanceDesdia(current,count);
  }
  if(mode==='set'){
    if(!isCampaignDate(date))fail('invalid','Data de Harptos inválida');
    return date;
  }
  if(mode==='publish'){
    if(date!=null)fail('invalid','Publicação de eventos não aceita outra data');
    return current;
  }
  return fail('invalid','Modo de publicação temporal inválido');
}

/** Port of preview_campaign_time_change (calendar part, no auth/version check). */
export function previewTimeChange({calendar,mode,date=null,count=1,allowBackdate=false,houseSheets=[]}){
  const start=timeKey(calendar.year,calendar.month,calendar.day,calendar.festival??null);
  const end=resolveTarget(mode,date,count,start);
  const baseMonth=monthOfCalendar(calendar),targetMonth=absoluteMonth(end);
  const delta=targetMonth-baseMonth;
  if(delta>120||delta<-120)fail('invalid','Altere no máximo 120 meses por operação');
  const s=calendarOrdinal(start),e=calendarOrdinal(end),endYear=Number(end.slice(0,4));
  const cand=[];
  for(let yr=Math.min(calendar.year,endYear);yr<=Math.max(calendar.year,endYear);yr++)
    for(const [id,m] of FESTIVALS){
      if(id==='shieldmeet'&&yr%4!==0)continue;
      const d=timeKey(yr,m,30,id),o=calendarOrdinal(d);
      if((e>s&&o>s&&o<=e)||(e<s&&o<s&&o>=e))cand.push({d,o});
    }
  cand.sort((a,b)=>e>=s?a.o-b.o:b.o-a.o);
  const yrs=[];
  for(let y=Math.min(calendar.year,endYear);y<=Math.max(calendar.year,endYear);y++)
    if((e>s&&y>calendar.year)||(e<s&&y<calendar.year))yrs.push(y);
  yrs.sort((a,b)=>e>=s?a-b:b-a);
  const houseCount=houseSheets.filter(h=>h.state&&String(h.state.schemaVersion)==='1'&&
    Object.hasOwn(h.state,'month')).length;
  return {version:calendar.version,from:start,to:end,mode,
    ordinary_days:ordinaryIndex(end)-ordinaryIndex(start),calendar_days:e-s,month_delta:delta,
    backdated:e<s,backdate_authorized:allowBackdate===true,
    crossed_festivals:cand.map(x=>x.d),crossed_years:yrs,
    house_sheets_to_check:delta>0?houseCount:0,published_week_unchanged:calendar.publishedWeek??null};
}
