import { defineTool, ToolError } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser } from '../supabase';

export default defineTool({
  name: 'responder_missiva',
  title: 'Responder missiva',
  description: 'Registra uma resposta a uma missiva recebida, marcando-a como respondida. A operação é idempotente: repetir o mesmo envio não duplica a resposta.',
  inputSchema: {
    missiva_id: z.string().uuid().describe('Identificador da missiva, obtido em listar_missivas.'),
    conteudo: z.string().min(1).describe('Texto da resposta.'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ missiva_id, conteudo }, ctx) => {
    const { data, error } = await supabaseForUser(ctx).rpc('reply_campaign_letter', { p_letter: missiva_id, p_content: conteudo, p_key: crypto.randomUUID() });
    if (error) throw new ToolError(`Não foi possível responder: ${error.message}`);
    return { content: [{ type: 'text', text: 'Resposta registrada e missiva marcada como respondida.' }], structuredContent: { resultado: data } };
  },
});
