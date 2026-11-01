import {dateKey,formatCampaignPeriod,formatDate,parseDate,type CampaignDate} from './harptos';

/** Apenas a data global já publicada; nunca metadados de Casa ou missiva. */
export type PublicCampaignTime = CampaignDate & {
 version:number;
 date:string;
 period:string;
 label:string;
};

/** Whitelist da resposta pública: nenhum campo extra vindo do banco é propagado. */
export function publicCampaignTimeProjection(value:unknown):PublicCampaignTime {
 if(!value||typeof value!=='object'||Array.isArray(value))
  throw new Error('Data pública da campanha indisponível.');
 const row=value as Partial<CampaignDate>&{version?:unknown};
 if(typeof row.year!=='number'||!Number.isInteger(row.year)||row.year<1||row.year>9999||
  typeof row.month!=='number'||!Number.isInteger(row.month)||row.month<0||row.month>11||
  typeof row.day!=='number'||!Number.isInteger(row.day)||row.day<1||row.day>30||
  (typeof row.festival!=='string'&&row.festival!==null)||
  typeof row.version!=='number'||!Number.isSafeInteger(row.version)||row.version<0)
  throw new Error('Data pública da campanha inválida.');
 const candidate={year:row.year,month:row.month,day:row.day,festival:row.festival};
 const key=dateKey(candidate);
 const parsed=parseDate(key);
 if(!parsed||parsed.year!==row.year||parsed.month!==row.month||parsed.day!==row.day||
  parsed.festival!==row.festival)throw new Error('Data pública de Harptos inconsistente.');
 return {...candidate,version:row.version,date:key,period:formatCampaignPeriod(candidate),label:formatDate(key)};
}
