/**
 * Núcleo puro do Hub Temporal V2.1 (servidor e navegador).
 *
 * Duas linhas do tempo independentes:
 * - a ordem das semanas (openRound) só cresce;
 * - a data do jogo é livre (pode recuar, avançar ou mudar de era numa
 *   nova temporada).
 * Toda data vira um número absoluto de dias (absoluteDay), então um evento
 * de 21 de Marpenoth de 1522 nunca coincide com 21 de Marpenoth de 1300.
 * Uma semana cobre da data de abertura até o início da próxima désdia
 * (dias 1, 11 e 21); dias festivos entre meses ficam na última désdia.
 */
export const FIXED_FESTIVALS=Object.freeze([
  {id:'midwinter',month:0,name:'Meio-Inverno'},
  {id:'greengrass',month:3,name:'Relva Verde'},
  {id:'midsummer',month:6,name:'Meio-Verão'},
  {id:'shieldmeet',month:6,name:'Encontro dos Escudos',leapOnly:true},
  {id:'highharvestide',month:8,name:'Grande Colheita'},
  {id:'feast-moon',month:10,name:'Festa da Lua'},
]);
/** Regiões de festivais e eventos regionais: os grupos oficiais de narração. */
export const HUB_REGIONS=Object.freeze([
  {id:'1',label:'Costa do Dragão'},
  {id:'2',label:'Horselands'},
]);
const FIXED=new Map(FIXED_FESTIVALS.map(f=>[f.id,f]));
const leap=y=>y%4===0;
const SLOTS=new Map();
function slots(year){
  const key=leap(year);
  if(SLOTS.has(key))return SLOTS.get(key);
  const out=[];
  for(let month=0;month<12;month++){
    for(let day=1;day<=30;day++)out.push({month,day,festival:null});
    for(const f of FIXED_FESTIVALS)if(f.month===month&&(!f.leapOnly||key))
      out.push({month,day:30,festival:f.id});
  }
  SLOTS.set(key,out);
  return out;
}
export function harptosDateValid(d){
  if(!d||typeof d!=='object')return false;
  const {year,month,day}=d,festival=d.festival??null;
  if(!Number.isInteger(year)||year<1||year>9999||!Number.isInteger(month)||
     month<0||month>11||!Number.isInteger(day)||day<1||day>30)return false;
  if(festival===null)return true;
  const f=FIXED.get(festival);
  return Boolean(f&&f.month===month&&day===30&&(!f.leapOnly||leap(year)));
}
/** Posição 1..365 (366 em ano bissexto); 0 quando a data não existe. */
export function dayOfYear(d){
  if(!harptosDateValid(d))return 0;
  const f=d.festival??null;
  const i=slots(d.year).findIndex(s=>f?s.festival===f:s.festival===null&&s.month===d.month&&s.day===d.day);
  return i+1;
}
const yearStart=y=>(y-1)*365+Math.floor((y-1)/4);
export function absoluteDay(d){
  const n=dayOfYear(d);
  if(!n)throw new RangeError('invalid_harptos_date');
  return yearStart(d.year)+n;
}
export function fromAbsoluteDay(n){
  if(!Number.isSafeInteger(n)||n<1)throw new RangeError('invalid_absolute_day');
  let year=Math.floor((n-1)/365.25)+1;
  while(year>1&&yearStart(year)+1>n)year--;
  while(yearStart(year+1)+1<=n)year++;
  const s=slots(year)[n-yearStart(year)-1];
  return {year,month:s.month,day:s.day,festival:s.festival};
}
/** Início da próxima désdia (1, 11, 21); dia festivo leva ao dia 1 seguinte. */
export function nextTendayStart(d){
  if(!(d.festival??null)&&d.day<=10)return {year:d.year,month:d.month,day:11,festival:null};
  if(!(d.festival??null)&&d.day<=20)return {year:d.year,month:d.month,day:21,festival:null};
  return d.month>=11?{year:d.year+1,month:0,day:1,festival:null}
    :{year:d.year,month:d.month+1,day:1,festival:null};
}
/** Período [start,end) da semana aberta numa data. */
export function weekPeriod(d){
  return {start:absoluteDay(d),end:absoluteDay(nextTendayStart(d))};
}
const DATE_KEY=/^(\d{4})-(?:(\d{2})-(\d{2})|F-([a-z-]+))$/;
export function parseDateKey(key){
  const m=typeof key==='string'?DATE_KEY.exec(key):null;
  if(!m)return null;
  const year=Number(m[1]);
  const d=m[4]?{year,month:FIXED.get(m[4])?.month??-1,day:30,festival:m[4]}
    :{year,month:Number(m[2])-1,day:Number(m[3]),festival:null};
  return harptosDateValid(d)?d:null;
}
export function dateKeyOf(d){
  return String(d.year).padStart(4,'0')+'-'+((d.festival??null)?'F-'+d.festival
    :String(d.month+1).padStart(2,'0')+'-'+String(d.day).padStart(2,'0'));
}
/** Datas de evento: true quando a chave cai no período [start,end). */
export function dateKeyInRange(key,start,end){
  const d=parseDateKey(key);
  if(!d)return false;
  const n=absoluteDay(d);
  return n>=start&&n<end;
}

/* ---------- Festivais ---------- */
const ID=/^[A-Za-z0-9_-]{8,128}$/;
export const isFestivalId=v=>typeof v==='string'&&ID.test(v);
/** Festivais fixos de Harptos no mesmo formato dos cadastrados. */
export function fixedFestivalEntries(notify={}){
  return FIXED_FESTIVALS.map(f=>({id:'fixed-'+f.id,fixed:true,name:f.name,
    scope:'kingdom',region:null,date:{year:1,month:f.month,day:30,festival:f.id},
    repeat:'yearly',durationDays:1,notify:notify?.[f.id]!==false,
    description:f.leapOnly?'Só em anos bissextos (divisíveis por 4).':'Dia festivo do Calendário de Harptos.'}));
}
/** Ocorrência [start,end) no ano pedido, ou null. "date.year" é o ano
 * (festival único) ou o primeiro ano (festival anual). */
export function festivalOccurrence(f,year){
  if(!f||f.deleted===true||!f.date)return null;
  if(f.repeat==='yearly'){if(year<f.date.year)return null;}
  else if(f.date.year!==year)return null;
  const d={year,month:f.date.month,day:f.date.day,festival:f.date.festival??null};
  if(!dayOfYear(d))return null;
  const start=absoluteDay(d);
  return {start,end:start+Math.max(1,Math.min(30,f.durationDays??1))};
}
export function festivalsInRange(list,start,end){
  const out=[];
  if(!(end>start))return out;
  const y1=fromAbsoluteDay(start).year-1,y2=fromAbsoluteDay(end-1).year;
  for(const f of Array.isArray(list)?list:[])
    for(let y=Math.max(1,y1);y<=y2;y++){
      const o=festivalOccurrence(f,y);
      if(o&&o.start<end&&o.end>start)out.push({festival:f,start:o.start,end:o.end});
    }
  return out.sort((a,b)=>a.start-b.start);
}
/** Região visível para quem vê: Narrador/Editor (null) veem tudo. */
export function visibleForRegions(item,regions){
  if(regions===null)return true;
  return item?.scope!=='region'||regions.includes(item.region);
}
/** Valida e monta o documento de festival (cadastro ou edição). */
export function planFestivalSave(previous,payload,{deny,newId,uid,at}){
  const keys=['id','version','name','scope','region','date','repeat','durationDays','notify','description','public'];
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
     Object.keys(payload).some(k=>!keys.includes(k)))deny('invalid_festival',400);
  const {id,version,name,scope,region,date,repeat,durationDays,notify,description}=payload;
  const d=date&&typeof date==='object'?{year:date.year,month:date.month,
    day:date.day,festival:date.festival??null}:null;
  if(typeof name!=='string'||!name.trim()||name.length>120||
     !['kingdom','region'].includes(scope)||
     (scope==='region'?!HUB_REGIONS.some(r=>r.id===region):region!==null&&region!==undefined)||
     !d||!harptosDateValid(d)||!['once','yearly'].includes(repeat)||
     !Number.isInteger(durationDays)||durationDays<1||durationDays>30||
     typeof notify!=='boolean'||
     (payload.public!==undefined&&typeof payload.public!=='boolean')||
     (description!==undefined&&(typeof description!=='string'||description.length>600)))
    deny('invalid_festival',400);
  const body={name:name.trim(),scope,region:scope==='region'?region:null,date:d,
    repeat,durationDays,notify,description:(description??'').trim(),
    ...(payload.public===true?{public:true}:{}),deleted:false,
    updatedAt:at,updatedBy:uid};
  if(id===null||id===undefined){
    if(previous||(version!==null&&version!==undefined))deny('invalid_festival',400);
    return {id:newId(),version:1,...body,createdAt:at};
  }
  if(!isFestivalId(id)||!previous||previous.id!==id||previous.deleted===true)
    deny('festival_not_found',404);
  if(version!==previous.version)deny('festival_version_conflict',409);
  return {...previous,...body,version:previous.version+1};
}
