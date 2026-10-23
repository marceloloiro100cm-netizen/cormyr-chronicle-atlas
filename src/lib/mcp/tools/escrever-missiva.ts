import { defineTool, ToolError } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser } from '../supabase';

export default defineTool({
  name: 'escrever_missiva',
  title: 'Escrever missiva',
  description: 'Envia uma missiva do Narrador para uma ou mais casas. Gerais podem ter várias casas; reservadas vão para uma só. A numeração segue a sequência das missivas da campanha.',
  inputSchema: {
    tipo: z.enum(['geral', 'reservada']).describe('Geral vai para várias casas; reservada para uma única casa.'),
    numero: z.number().int().min(1).optional().describe('Número da missiva na sequência da campanha, por exemplo 2 para a Missiva 2.'),
    assunto: z.string().min(1).describe('Assunto da missiva.'),
    conteudo: z.string().min(1).describe('Texto completo da missiva.'),
    casas: z.array(z.string().min(1)).min(1).describe('Identificadores das casas destinatárias, por exemplo ["ashkar","harcourt"].'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ tipo, numero, assunto, conteudo, casas }, ctx) => {
    if (tipo === 'reservada' && casas.length !== 1) throw new ToolError('Missiva reservada exige exatamente uma casa destinatária.');
    const { data, error } = await supabaseForUser(ctx).rpc('send_campaign_letter_batch', {
      p_kind: tipo,
      p_number: (numero ?? null) as number,
      p_subject: assunto,
      p_content: conteudo,
      p_recipients: casas.map((c) => 'h:' + c),
      p_key: crypto.randomUUID(),
    });
    if (error) throw new ToolError(`Não foi possível enviar: ${error.message}`);
    return { content: [{ type: 'text', text: `Missiva enviada para ${casas.length} casa(s).` }], structuredContent: { resultado: data } };
  },
});
