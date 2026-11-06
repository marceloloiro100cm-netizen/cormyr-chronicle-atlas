import { createClient } from '@supabase/supabase-js';
import {resolvePublicSupabase} from '@/integrations/supabase/public-config';
import type { Database } from '@/integrations/supabase/types';
import type { ToolContext } from '@lovable.dev/mcp-js';

// Authenticated client for MCP tools: the caller's verified OAuth token decides
// access through the existing row-level security policies.
export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!token) throw new Error('supabaseForUser requer um token OAuth verificado');
  const {url,key}=resolvePublicSupabase(process.env['SUPABASE_URL'],
    process.env['SUPABASE_PUBLISHABLE_KEY']);
  if (!url || !key) throw new Error('Configuração do banco indisponível');
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
