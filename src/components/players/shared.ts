import type { Database } from '@/integrations/supabase/types';

export type RecordRow = Database['public']['Tables']['campaign_records']['Row'];
export const date=(value:string)=>new Date(value).toLocaleString('pt-BR');
export const syncLabel=(state:string)=>({pending:'Salvo no site · pasta pendente',synced:'Sincronizado',error:'Erro de sincronização',conflict:'Conflito de versões'}[state]??state);
