import {supabase} from '@/integrations/supabase/client';
import {dateKey} from './harptos';
import {previewHarptosDesdia} from './temporal-engine';
import type {CampaignTimeSnapshot} from './campaign-time';

export type CampaignTimeImpact={
 from:string;to:string;expected_version:number;desdias:number;ordinary_days:number;
 months_delta:number;
 crossed_months:{year:number;month:number}[];
 crossed_years:number[];
 crossed_seasons:{year:number;month:number;from:string;to:string}[];
 crossed_festivals:{date:string;id:string}[];
 houses_drifted:number;projects_maturing:number;can_publish:boolean;
};
export type CampaignTimeCommit={
 duplicate:boolean;
 snapshot:CampaignTimeSnapshot;
 change:CampaignTimeImpact;
 original_to?:string;
};

function isRecord(v:unknown):v is Record<string,unknown>{return typeof v==='object'&&v!==null;}
function validateImpact(value:unknown,current:CampaignTimeSnapshot,count:number):CampaignTimeImpact {
 if(!isRecord(value))throw new Error('Prévia temporal indisponível.');
 const local=previewHarptosDesdia(current,count);
 if(value['from']!==dateKey(current) || value['to']!==local.nextDateKey ||
    value['desdias']!==count || value['ordinary_days']!==count*10 ||
    value['expected_version']!==current.version ||
    typeof value['months_delta']!=='number'||!Number.isInteger(value['months_delta'])||
    !Array.isArray(value['crossed_months'])||!Array.isArray(value['crossed_years'])||
    !Array.isArray(value['crossed_seasons'])||!Array.isArray(value['crossed_festivals'])||
    typeof value['projects_maturing']!=='number'||typeof value['houses_drifted']!=='number'||
    typeof value['can_publish']!=='boolean'){
  throw new Error('A prévia do servidor diverge do motor de Harptos. Nenhum avanço foi publicado.');
 }
 return value as CampaignTimeImpact;
}

export async function previewCampaignTimeChange(current:CampaignTimeSnapshot,count:number):Promise<CampaignTimeImpact>{
 if(!Number.isSafeInteger(count)||count<1||count>360)throw new Error('Informe entre 1 e 360 désdias.');
 const {data,error}=await supabase.rpc('preview_campaign_time_change',{
  p_version:current.version,p_desdias:count,
 });
 if(error)throw error;
 return validateImpact(data,current,count);
}

export async function publishCampaignTimeChange(
 current:CampaignTimeSnapshot,impact:CampaignTimeImpact,key:string,reason:string
):Promise<CampaignTimeCommit>{
 if(!key || !reason.trim() || reason.trim().length<10 || reason.trim().length>500)
  throw new Error('Justifique o avanço com 10 a 500 caracteres.');
 validateImpact(impact,current,impact.desdias);
 if(!impact.can_publish)throw new Error('Concilie as Casas antes de avançar.');
 const {data,error}=await supabase.rpc('publish_campaign_time_change',{
  p_key:key,p_expected_version:current.version,p_desdias:impact.desdias,p_reason:reason.trim(),
 });
 if(error)throw error;
 if(!isRecord(data)||!isRecord(data['snapshot'])||!isRecord(data['change'])||
    typeof data['duplicate']!=='boolean')throw new Error('Confirmação de avanço incompleta.');
 const saved=data['snapshot'] as CampaignTimeSnapshot;
 if(!data['duplicate'] && (dateKey(saved)!==impact.to || saved.version!==current.version+1||
   (data['change'] as Record<string,unknown>)['to']!==impact.to)){
  throw new Error('O banco não confirmou a nova data e versão; atualize o calendário.');
 }
 return data as unknown as CampaignTimeCommit;
}

export type CampaignTimeHistoryItem={
 key:string;from:string;to:string;desdias:number;version:number;reason:string;
 created_at:string;impact:CampaignTimeImpact;
};
export async function getCampaignTimeChangeHistory(limit=20):Promise<CampaignTimeHistoryItem[]>{
 const {data,error}=await supabase.rpc('get_campaign_time_change_history',{p_limit:limit});
 if(error)throw error;
 if(!Array.isArray(data))throw new Error('Histórico temporal indisponível.');
 return data as CampaignTimeHistoryItem[];
}
