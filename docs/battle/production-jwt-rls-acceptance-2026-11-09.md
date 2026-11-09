# P0 — Autenticação e RLS em produção (novembro 2026)

## Escopo
Executar manualmente `.github/workflows/battle-production-authenticated-readonly.yml` na branch `main`. O job usa apenas o environment protegido **production**, permissões GitHub read-only e o host de produção fixado ao backend publicamente configurado no projeto.

**Não configurar senhas em arquivos, commits, mensagens ou parâmetros de workflow.**

No GitHub → Settings → Environments → production, definir os seis secrets:
`BATTLE_E2E_SUPABASE_URL`,
`BATTLE_E2E_PUBLIC_KEY`,
`BATTLE_E2E_NARRATOR_EMAIL`,
`BATTLE_E2E_NARRATOR_PASSWORD`,
`BATTLE_E2E_PLAYER_EMAIL`,
`BATTLE_E2E_PLAYER_PASSWORD`.

Escolher contas distintas de teste, uma administrativa e outra jogador ativo, usando proteção das credenciais. O teste de login gera duas sessões de Auth temporárias; `signOut({scope:'local'})` **não desconecta sessões existentes em outros dispositivos**.

## Aceite automatizado
- Verifica host esperado de produção e presença de credenciais antes de se conectar.
- Efetua login real como Narrador e jogador, verifica roles atuais e acesso ativo à campanha.
- Verifica RLS em `battle_sim_sessions` e `battle_v3_invitations`.
- **Prova positiva**: exige que o Narrador veja pelo menos uma linha do catálogo D&D curado e da importação militar; jogador não pode ver nenhuma.
- Todas as operações de tabela são `SELECT`, sem alterar fichas, calendário, exércitos ou contas.
- Falha no teste **não autoriza liberação** dos jogadores. Flag `BATTLE_PLAYERS_ENABLED=false` permanece.

## Limitações
A base de produção apresentava zero sessões e convocações de batalha antes do teste: esses dois RLS não podem ser provados positivamente por ausência de registros. Os catálogos existentes são usados como fixtures privadas sem criação de linhas. Mesmo com sucesso, revisão de fluxo autenticado no navegador real e verificações em homologação isolada continuam recomendadas.
