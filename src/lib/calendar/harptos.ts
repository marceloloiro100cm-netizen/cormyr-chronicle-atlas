export const MONTHS = ['Hammer', 'Alturiak', 'Ches', 'Tarsakh', 'Mirtul', 'Kythorn', 'Flamerule', 'Eleasis', 'Eleint', 'Marpenoth', 'Uktar', 'Nightal'] as const;
export const FESTIVALS = [
  {id:'midwinter', name:'Midwinter · Meio do Inverno', month:0},
  {id:'greengrass', name:'Greengrass · Relva Verde', month:3},
  {id:'midsummer', name:'Midsummer · Meio do Verão', month:6},
  {id:'shieldmeet', name:'Shieldmeet · Encontro dos Escudos', month:6},
  {id:'highharvestide', name:'Highharvestide · Grande Colheita', month:8},
  {id:'feast-moon', name:'Feast of the Moon · Festa da Lua', month:10},
] as const;
export type CampaignDate = {year:number; month:number; day:number; festival:string|null};
export function dateKey(d:CampaignDate):string {
  return `${String(d.year).padStart(4,'0')}-${d.festival?'F-'+d.festival:String(d.month+1).padStart(2,'0')+'-'+String(d.day).padStart(2,'0')}`;
}
export function parseDate(value:string|null|undefined):CampaignDate|null {
  const m=/^(\d{4})-(?:(\d{2})-(\d{2})|F-([a-z-]+))$/.exec(value??'');
  if(!m)return null;
  const year=Number(m[1]); if(year<1)return null;
  if(m[4]){const f=FESTIVALS.find(f=>f.id===m[4]);return f&&(f.id!=='shieldmeet'||year%4===0)?{year,month:f.month,day:30,festival:f.id}:null;}
  const month=Number(m[2])-1,day=Number(m[3]);return month>=0&&month<12&&day>=1&&day<=30?{year,month,day,festival:null}:null;
}
export function formatDate(value:string|null|undefined):string {
  const d=parseDate(value);return d?`${d.festival?FESTIVALS.find(f=>f.id===d.festival)!.name:`${d.day} de ${MONTHS[d.month]}`} · ${d.year} CV`:'Sem data de campanha';
}
export type CalendarEvent={id:string;date:string;title:string;kind:'kingdom'|'season'|'mail';description?:string};
const WAUKEEN = [[15,'Cold Counting'],[1,"Grandmasster’s March"],[10,'Great Weave'],[4,'High Coin'],[8,'Springsheen'],[14,'Coinswarm'],[12,'Goldensun'],[17,'Bountiful Harvest'],[21,'Brightbuckle'],[10,"Coin’s Rest"],[25,'Darkcoin'],[29,'Audit']] as const;
export function annualEvents(year:number):CalendarEvent[]{
  const events:CalendarEvent[]=FESTIVALS.filter(f=>f.id!=='shieldmeet'||year%4===0).map(f=>({id:f.id,date:dateKey({year,month:f.month,day:30,festival:f.id}),title:f.name,kind:'kingdom',description:'Dia intercalar: fora das três désdias do mês.'}));
  MONTHS.forEach((_,month)=>{
    [[1,'Seeing Justice'],[13,'Right Hand'],[22,'Maimed Hand']].forEach(([day,title])=>events.push({id:`tyr-${month}-${day}`,date:dateKey({year,month,day:Number(day),festival:null}),title:`Tyr · ${title}`,kind:'kingdom'}));
    const [day,title]=WAUKEEN[month]!;
    for(let n=day;n<=(month===1?6:day);n++)events.push({id:`waukeen-${month}-${n}`,date:dateKey({year,month,day:n,festival:null}),title:`Waukeen · ${title}`,kind:'kingdom'});
  });
  ([[2,19,'Equinócio da primavera'],[5,20,'Solstício de verão'],[8,21,'Equinócio do outono'],[11,20,'Solstício de inverno']] as const).forEach(([month,day,title])=>events.push({id:`season-${month}`,date:dateKey({year,month,day,festival:null}),title,kind:'season'}));
  return events;
}
