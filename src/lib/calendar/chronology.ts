import {FESTIVALS,MONTHS,formatDate,parseDate} from './harptos';

export type RoundPeriod={number:number;status:string;harptos_period:string|null;opened_at?:string|null;closed_at?:string|null};
export type ChronologyEvent={id:string;date:string;title:string;kind:'mail'|'kingdom';description?:string};
export type CampaignChronology={year:number;month:number;events:ChronologyEvent[];rounds:RoundPeriod[];unassigned_round_count:number};

const validNumber=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>=0;
const isRecord=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);

/** A rodada não é uma désdia nem uma data de envio; este valor é um registro
 * histórico do período em que o Narrador abriu a rodada.
 */
export function formatRoundHarptosReference(value:string|null|undefined):string {
 if(value===null||value===undefined||value==='')return 'Referência histórica não registrada';
 const intercalary=parseDate(value);
 if(intercalary?.festival)return formatDate(value);
 const match=/^(\d{4})-(\d{2}):désdia-([123])$/.exec(value);
 if(!match)return 'Referência histórica inválida';
 const year=Number(match[1]),month=Number(match[2])-1;
 if(year<1||month<0||month>11)return 'Referência histórica inválida';
 return `${match[3]}ª désdia · ${MONTHS[month]} · ${year} CV`;
}
export function roundPeriodMatchesCurrent(period:string|null|undefined,currentDate:string):boolean {
 if(!period)return false;
 const d=parseDate(currentDate);
 if(!d)return false;
 if(d.festival)return period===currentDate;
 return period===`${String(d.year).padStart(4,'0')}-${String(d.month+1).padStart(2,'0')}:désdia-${Math.floor((d.day-1)/10)+1}`;
}
export function monthOfCampaignDate(date:string):number|null{
 const d=parseDate(date);
 return d?.month??null;
}
export function validateCampaignChronology(input:unknown,year:number,month:number):CampaignChronology {
 if(!isRecord(input)||input['year']!==year||input['month']!==month||
  !Array.isArray(input['events'])||!Array.isArray(input['rounds'])||
  !validNumber(input['unassigned_round_count']))
  throw new Error('Cronologia oficial inválida ou de outro período.');
 const eventKeys=new Set<string>();
 for(const e of input['events']){
  if(!isRecord(e)||typeof e['id']!=='string'||typeof e['title']!=='string'||
   typeof e['date']!=='string'||(e['kind']!=='mail'&&e['kind']!=='kingdom')||
   eventKeys.has(e['id'])||e['title'].length>5000||
   (e['description']!==undefined&&typeof e['description']!=='string')){
    throw new Error('Evento da cronologia inválido.');
  }
  const d=parseDate(e['date']);
  if(!d||d.year!==year||d.month!==month)throw new Error('Evento fora do mês consultado.');
  eventKeys.add(e['id']);
 }
 for(const r of input['rounds']){
  if(!isRecord(r)||!Number.isInteger(r['number'])||Number(r['number'])<1||
   typeof r['status']!=='string'||
   (r['harptos_period']!==null&&typeof r['harptos_period']!=='string')||
   formatRoundHarptosReference(r['harptos_period'] as string|null).includes('inválida'))
    throw new Error('Referência histórica de rodada inválida.');
 }
 return input as unknown as CampaignChronology;
}
