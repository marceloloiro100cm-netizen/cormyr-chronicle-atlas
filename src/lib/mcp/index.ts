import { auth, defineMcp } from '@lovable.dev/mcp-js';
import listarCasasTool from './tools/listar-casas';
import listarDocumentosTool from './tools/listar-documentos';
import lerDocumentoTool from './tools/ler-documento';
import editarDocumentoTool from './tools/editar-documento';
import listarMissivasTool from './tools/listar-missivas';
import escreverMissivaTool from './tools/escrever-missiva';
import responderMissivaTool from './tools/responder-missiva';

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? 'project-ref-unset';

export default defineMcp({
  name: 'cormyr-chronicle-atlas',
  title: 'Cormyr Chronicle Atlas',
  version: '0.1.0',
  instructions:
    'Ferramentas da campanha de Cormyr (segunda temporada). Permitem consultar casas, ler e editar documentos das casas e gerir missivas entre Narrador e jogadores. O acesso segue as permissões da conta conectada: cada usuário só vê e edita o que já pode ver no site.',
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: 'authenticated',
    requireOAuthClientClaim: true,
  }),
  tools: [listarCasasTool, listarDocumentosTool, lerDocumentoTool, editarDocumentoTool, listarMissivasTool, escreverMissivaTool, responderMissivaTool],
});
