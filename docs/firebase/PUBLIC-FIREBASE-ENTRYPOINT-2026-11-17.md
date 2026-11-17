# Cormyr: portal público e exceções de rota Firebase

O arquivo `public/cormyr/index.html` agora exibe um link de entrada para `/auth`, em vez de um aviso estático sem ação. A página pública permanece arquivada e não permite ler documentos de Casas, Missivas ou gerenciamento.

O roteador em `src/lib/archive-only.ts` autoriza somente as páginas públicas `/auth`, `/reset-password` e o portal piloto Firebase `/firebase-access` durante o modo archive-only. Um link antigo para `/jogadores` é redirecionado ao portal piloto. Outros caminhos antigos e funções do backend continuam bloqueados pelas regras existentes e não recebem acesso à API.

O script público `extras.js` teve removida a leitura de tokens locais do Supabase, a chamada ao RPC externo `is_campaign_admin` e a elevação de interface baseada em uma resposta de navegador. O material exclusivo do Narrador segue fora do arquivo público. Nenhuma atualização de IAM, Auth, perfis, Cloud Runtime ou Firestore ocorreu.

**Importante:** links públicos e autenticação Firebase não significam liberação para jogar. A auditoria real ainda informa `NO_GO` e os runtimes de Casas e Missivas não estão reconciliados; operações privadas continuam sob os controles do servidor.

Testes novos: `src/test/firebase-public-entrypoint.test.ts`, além dos contratos já existentes em `src/lib/archive-only.test.ts`.