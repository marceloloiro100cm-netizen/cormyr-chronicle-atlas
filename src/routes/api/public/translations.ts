import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const SUPPORTED = ['en', 'es', 'de'];
const PUBLIC_ENTITIES = ['region', 'house', 'constitution'] as const;

/** Read only pre-approved public content translations. Never expose private record translations. */
export const Route = createFileRoute('/api/public/translations')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const locale = new URL(request.url).searchParams.get('locale');
        if (!locale || !SUPPORTED.includes(locale))
          return Response.json({ error: 'Idioma inválido' }, { status: 400 });
        const url = process.env['SUPABASE_URL'];
        const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
        if (!url || !key)
          return Response.json({ translations: {} }, { headers: { 'Cache-Control': 'no-store' } });
        const db = createClient<Database>(url, key, {
          auth: { persistSession: false },
          global: { fetch: (input, init) => {
            const headers = new Headers(init?.headers);
            if (key.startsWith('sb_') && headers.get('Authorization') === `Bearer ${key}`)
              headers.delete('Authorization');
            headers.set('apikey', key);
            return fetch(input, { ...init, headers });
          } },
        });
        const { data, error } = await db
          .from('campaign_translations')
          .select('entity_type,entity_id,field_name,translated_text')
          .eq('locale', locale)
          .in('entity_type', [...PUBLIC_ENTITIES])
          .limit(5000);
        if (error)
          return Response.json({ error: 'Traduções indisponíveis' }, { status: 503 });
        const translations: Record<string, string> = {};
        for (const row of data ?? []) {
          translations[`${row.entity_type}:${row.entity_id}:${row.field_name}`] = row.translated_text;
        }
        return Response.json({ translations }, { headers: { 'Cache-Control': 'no-store' } });
      },
    },
  },
});
