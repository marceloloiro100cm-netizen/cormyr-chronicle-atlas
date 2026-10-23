import { defineTool, ToolError } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser } from '../supabase';

export default defineTool({
  name: 'ler_documento',
  title: 'Ler documento',
  description: 'Lê o conteúdo completo de um documento da campanha pelo seu identificador.',
  inputSchema: { id: z.string().uuid().describe('Identificador do documento, obtido em listar_documentos.') },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    const { data, error } = await supabaseForUser(ctx)
      .from('campaign_records')
      .select('id,title,kind,house_id,version,content,updated_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ToolError('Documento não encontrado ou sem permissão de leitura.');
    return {
      content: [{ type: 'text', text: data.content }],
      structuredContent: { documento: { id: data.id, titulo: data.title, tipo: data.kind, casa: data.house_id, versao: data.version, atualizado_em: data.updated_at } },
    };
  },
});
