import { defineTool } from '@lovable.dev/mcp-js';
import { supabaseForUser } from '../supabase';

export default defineTool({
  name: 'listar_casas',
  title: 'Listar casas da temporada',
  description: 'Lista as oito casas nobres oficiais da segunda temporada de Cormyr, com lorde, castelo e região.',
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    const { data, error } = await supabaseForUser(ctx)
      .from('campaign_houses')
      .select('id,name,lord_name,castle,region')
      .eq('active', true)
      .eq('season', 2)
      .order('name');
    if (error) throw error;
    const casas = (data ?? []).map((h) => ({ id: h.id, nome: h.name, lorde: h.lord_name, castelo: h.castle, regiao: h.region }));
    return { content: [{ type: 'text', text: `${casas.length} casas ativas na segunda temporada.` }], structuredContent: { casas } };
  },
});
