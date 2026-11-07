# Cormyr — entrega P0/P1 do módulo de batalha (PR #317)

## Fronteira de segurança
- Todas as simulações continuam **isoladas**: não escrevem em `noble_house_sheets`, economia, XP, missivas ou Hub Temporal.
- O acesso às cópias de unidades oficiais em V3 é exclusivo do Narrador e usa o adaptador existente, que revalida JWT e RLS. O snapshot é local, somente leitura.
- Partidas que possuem cópias de exércitos oficiais **não podem gerar replay V3 exportável**; impedir arquivos locais se passarem por fichas autorizadas.
- Multiplayer é exclusivamente com exércitos-modelo e comandos reexecutados pelo servidor; o cliente não envia `HouseState`, `V3Game` completo ou o estado final.
- Persistência multiplayer é mantida em `battle_v3_live_matches`, tabela separada, RLS obrigatória, apenas `service_role` pode escrever, e o servidor revalida a casa ativa antes da atualização CAS `state_version + state_hash`.

## P1 implementado na branch
1. **Debandada:** o clique V3 ignora tokens com moral `routed`, assim como o motor e a renderização; a IA também deixa de tratar essas pilhas como obstáculo.
2. **Replay V3 local:** `CCA-V3-REPLAY-1` serializa somente opções de modelos e sequência de ações, com reexecução e SHA-256 a cada passo, importação, retomada e limite de 1,5 MB. Não é assinatura de autoria.
3. **Unidades reais somente leitura:** o Narrador seleciona as cópias de até cinco unidades por lado. Sem escrita no exército oficial; o modo V3 não aplica perdas.
4. **Multiplayer:** duas casas distintas, jogo compartilhado, leitura RLS, cada comandante só move no turno de sua casa, sincronização por consulta periódica e controle de versão CAS. Uma terceira casa não tem permissão de leitura da tabela. O banco SQL 0078 é **candidato, não aplicado em produção**.

## P0 implementado como verificação
- Diagnóstico autenticado na própria interface de jogador e Narrador, acessado voluntariamente pela sessão real. Somente consultas.
- Workflow **Battle JWT acceptance (read-only)** por `workflow_dispatch` no environment `homologation`; requer *secrets* de **duas contas de teste independentes** e referência exata do host Supabase. Nenhuma credencial ou resultado de identidade é impresso.
- Os testes de banco novos rodam somente em PostgreSQL descartável do GitHub Actions. Nunca aplicam SQL no Supabase de produção.

## Portões de liberação
**NO-GO para publicação do multiplayer e ativação de `VITE_ENABLE_BATTLE_V3_LIVE`** até:
1. Revisão e backup do Supabase correto, reconciliação de migrações e aplicação transacional autorizada de `0078_battle_v3_live_matches.sql` **primeiro em homologação**.
2. Ambiente de homologação executando o commit da PR, dois jogadores de teste em casas diferentes e uma conta de Narrador, sem importar contas da campanha real.
3. JWT real para as três identidades, testes de membro/externo/saída da casa/revogação e tentativa de escrita proibida diretamente.
4. Partida E2E em duas sessões distintas com ataque, defesa, magia, poderes, fim de turno, conclusão e concorrência simultânea. Nenhuma ação altera fichas.
5. CI completo de TypeScript, Vitest, banco, build e navegador; revisão e autorização explícita para merge/deploy.

**As checagens locais e do CI não devem ser descritas como aprovação de produção enquanto esses portões estiverem pendentes.**
