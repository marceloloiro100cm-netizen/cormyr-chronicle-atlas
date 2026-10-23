import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser } from '../supabase';

export default defineTool({
  name: 'listar_documentos',
  title: 'Listar documentos das casas',
  description: 'Lista os documentos da campanha que o usuário conectado pode ver, com título, casa, tipo e versão.',
  inputSchema: { casa: z.string().optional().describe('Identificador da casa para filtrar, por exemplo "ashkar".') },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ casa }, ctx) => {
    let query = supabaseForUser(ctx)
      .from('campaign_records')
      .select('id,title,kind,house_id,version,updated_at')
      .order('updated_at', { ascending: false });
    if (casa) query = query.eq('house_id', casa);
    const { data, error } = await query;
    if (error) throw error;
    const documentos = (data ?? []).map((r) => ({ id: r.id, titulo: r.title, tipo: r.kind, casa: r.house_id, versao: r.version, atualizado_em: r.updated_at }));
    return { content: [{ type: 'text', text: `${documentos.length} documentos visíveis.` }], structuredContent: { documentos } };
  },
});
