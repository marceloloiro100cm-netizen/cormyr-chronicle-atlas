import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {dateKey, parseDate, formatDate, formatCampaignPeriod, type CampaignDate} from './harptos';
import {getHarptosDesdia, getHarptosSeason} from './temporal-engine';

/** ÚNICA chave de cache para a data oficial do Reino. Não criar consultas paralelas. */
export const CAMPAIGN_TIME_QUERY_KEY = ['campaign-calendar'] as const;
export const CAMPAIGN_TIME_REFRESH_MS = 15_000;

/** Colunas públicas para leitores autenticados do calendário vigente.
 * O banco é a fonte; "published_week" continua sendo uma rodada de missivas,
 * nunca a désdia derivada. Preservar o shape do RPC para compatibilidade.
 */
export type CampaignTimeSnapshot = CampaignDate & {
 auto_advance: boolean;
 version: number;
 published_week?: number;
 last_round?: number | null | undefined;
 published_at?: string | null | undefined;
 updated_at?: string | null | undefined;
};

/** Valida a resposta do RPC antes de permitir que ela seja considerada o presente.
 * Sem fallback para 1522, para o relógio do dispositivo ou para um estado da Casa.
 */
export function validateCampaignTimeSnapshot(value: unknown): CampaignTimeSnapshot {
 if(!value || typeof value !== 'object')throw new Error('Calendário oficial indisponível.');
 const row=value as Partial<CampaignTimeSnapshot>;
 if(typeof row.year !== 'number' || typeof row.month !== 'number' ||
   typeof row.day !== 'number' || !('festival' in row) ||
   (row.festival !== null && typeof row.festival !== 'string') ||
   typeof row.version !== 'number' || !Number.isSafeInteger(row.version) || row.version < 0 ||
   typeof row.auto_advance !== 'boolean' ||
   (row.published_week !== undefined && (!Number.isSafeInteger(row.published_week) || row.published_week < 1)) ||
   (row.last_round !== undefined && row.last_round !== null && (!Number.isSafeInteger(row.last_round) || row.last_round < 1)) ||
   !parseDate(dateKey({year:row.year,month:row.month,day:row.day,festival:row.festival as string|null}))) {
  throw new Error('O banco retornou uma data de Harptos inválida.');
 }
 const parsed=parseDate(dateKey({year:row.year,month:row.month,day:row.day,festival:row.festival as string|null}));
 // Também verifica a coerência entre mês e dia declarado para festivais intercalares.
 if(!parsed || parsed.month!==row.month || parsed.day!==row.day || parsed.year!==row.year || parsed.festival!==row.festival) {
  throw new Error('A data oficial de Harptos contém campos incompatíveis.');
 }
 return value as CampaignTimeSnapshot;
}

/** Leitura autenticada sob a política RLS existente. Nenhum acesso anônimo é criado. */
export async function getCampaignTime(): Promise<CampaignTimeSnapshot> {
 const {data,error}=await supabase.rpc('get_campaign_calendar');
 if(error)throw error;
 return validateCampaignTimeSnapshot(data);
}

/** Hook compartilhado por Calendário, Narrador, Casas, painel e Cabeçalho.
 * A invalidação Realtime existente e o fallback de polling usam a mesma chave.
 */
export function useCampaignTime(enabled=true){
 return useQuery({
  queryKey:CAMPAIGN_TIME_QUERY_KEY,
  queryFn:getCampaignTime,
  enabled,
  refetchInterval:CAMPAIGN_TIME_REFRESH_MS,
 });
}

export function campaignTimeView(snapshot:CampaignTimeSnapshot){
 const date=dateKey(snapshot);
 return {
  date,
  label:formatDate(date),
  period:formatCampaignPeriod(snapshot),
  year:snapshot.year,
  month:snapshot.month,
  day:snapshot.day,
  desdia:getHarptosDesdia(snapshot),
  season:getHarptosSeason(snapshot),
  version:snapshot.version,
 } as const;
}

/** Uma projeção da mesma consulta, não um segundo relógio. */
export function useCampaignYear(){
 const clock=useCampaignTime();
 return {...clock, year:clock.data?.year??null};
}
