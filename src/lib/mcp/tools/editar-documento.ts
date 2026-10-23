import { defineTool, ToolError } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser } from '../supabase';

export default defineTool({
  name: 'editar_documento',
  title: 'Editar documento',
  description: 'Salva uma nova versão de um documento da campanha. Exige a versão atual para evitar sobrescrever edições de outra pessoa; o histórico de versões é preservado.',
  inputSchema: {
    id: z.string().uuid().describe('Identificador do documento.'),
    titulo: z.string().min(1).describe('Título do documento.'),
    conteudo: z.string().min(1).describe('Novo conteúdo completo do documento.'),
    versao: z.number().int().min(1).describe('Versão atual do documento, obtida em ler_documento.'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ id, titulo, conteudo, versao }, ctx) => {
    const { data, error } = await supabaseForUser(ctx).rpc('save_campaign_record', { p_id: id, p_version: versao, p_title: titulo, p_content: conteudo });
    if (error) throw new ToolError(`Não foi possível salvar: ${error.message}`);
    return { content: [{ type: 'text', text: `Documento salvo. Nova versão: ${JSON.stringify(data)}.` }], structuredContent: { resultado: data } };
  },
});
