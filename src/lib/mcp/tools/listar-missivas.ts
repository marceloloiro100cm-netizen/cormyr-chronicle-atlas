import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser } from '../supabase';

export default defineTool({
  name: 'listar_missivas',
  title: 'Listar missivas',
  description: 'Lista as missivas da campanha visíveis ao usuário conectado, com número, tipo, assunto e data.',
  inputSchema: {
    casa: z.string().optional().describe('Filtrar pela casa destinatária, por exemplo "harcourt".'),
    limite: z.number().int().min(1).max(100).optional().describe('Quantidade máxima de missivas (padrão 50).'),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ casa, limite }, ctx) => {
    let query = supabaseForUser(ctx)
      .from('campaign_letters')
      .select('id,letter_number,letter_kind,subject,recipient_house_id,created_at,version')
      .order('created_at', { ascending: false })
      .limit(limite ?? 50);
    if (casa) query = query.eq('recipient_house_id', casa);
    const { data, error } = await query;
    if (error) throw error;
    const missivas = (data ?? []).map((l) => ({ id: l.id, numero: l.letter_number, tipo: l.letter_kind, assunto: l.subject, casa: l.recipient_house_id, enviada_em: l.created_at, versao: l.version }));
    return { content: [{ type: 'text', text: `${missivas.length} missivas visíveis.` }], structuredContent: { missivas } };
  },
});
