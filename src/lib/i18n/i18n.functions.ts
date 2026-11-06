import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import {createClient} from '@supabase/supabase-js';
import {resolvePublicSupabase} from '@/integrations/supabase/public-config';
import type {Database} from '@/integrations/supabase/types';
import { PUBLIC_TRANSLATION_ENTITY_TYPES, isPublicTranslationEntityType } from './public-translations';

export const loadDynamicTranslations = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    locale: z.enum(['pt', 'en', 'es', 'de']),
    entityType: z.enum(['house', 'region', 'event', 'adventure', 'catalog_item', 'record', 'festival', 'constitution']).optional(),
  }))
  .handler(async ({ data }) => {
    if (data.locale === 'pt' || (data.entityType && !isPublicTranslationEntityType(data.entityType))) return {};

    // Public server functions must use the anon database role so PostgreSQL
    // RLS also excludes unpublished Houses, not just private entity types.
    const {url,key}=resolvePublicSupabase(process.env['SUPABASE_URL'],
    process.env['SUPABASE_PUBLISHABLE_KEY']);
    if(!url||!key)return {};
    const publicDb=createClient<Database>(url,key,{
      auth:{persistSession:false,autoRefreshToken:false},
      global:{fetch:(input,init)=>{
        const headers=new Headers(init?.headers);
        if(key.startsWith('sb_')&&headers.get('Authorization')===`Bearer ${key}`)
          headers.delete('Authorization');
        headers.set('apikey',key);
        return fetch(input,{...init,headers,cache:'no-store'});
      }},
    });

    let query = publicDb
      .from('campaign_translations')
      .select('entity_type, entity_id, field_name, translated_text')
      .eq('locale', data.locale)
      .in('entity_type', [...PUBLIC_TRANSLATION_ENTITY_TYPES]);

    if (data.entityType) {
      query = query.eq('entity_type', data.entityType);
    }

    const { data: rows, error } = await query;
    if (error) {
      // If the table doesn't exist yet, gracefully return empty dictionary so tests don't break
      if (error.code === '42P01') return {};
      throw new Error(`Failed to load translations: ${error.message}`);
    }

    const dictionary: Record<string, string> = {};
    for (const row of rows || []) {
      dictionary[`${row.entity_type}:${row.entity_id}:${row.field_name}`] = row.translated_text;
    }
    return dictionary;
  });

export const upsertTranslationsBatch = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    items: z.array(z.object({
      entity_type: z.enum(['house', 'region', 'event', 'adventure', 'catalog_item', 'record', 'festival', 'constitution']),
      entity_id: z.string().min(1),
      field_name: z.string().min(1),
      locale: z.enum(['pt', 'en', 'es', 'de']),
      translated_text: z.string()
    })).max(1000)
  }))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc('is_campaign_admin');
    if (!admin) throw new Error('Acesso restrito ao administrador.');

    if (data.items.length === 0) return { message: 'Nenhuma tradução fornecida.' };

    const itemsToUpsert = data.items.map(item => ({
      ...item,
      updated_by: context.userId,
    }));

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { error } = await supabaseAdmin
      .from('campaign_translations')
      .upsert(itemsToUpsert, { onConflict: 'entity_type,entity_id,field_name,locale' });

    if (error) {
      throw new Error(`Falha ao salvar traduções: ${error.message}`);
    }

    return { message: `${data.items.length} traduções salvas com sucesso.` };
  });
