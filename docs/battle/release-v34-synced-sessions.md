# Cormyr · Cruzada V3.4 — sessões sincronizadas (duas contas)

## Escopo implementado
- Sessões separadas por convocação ativa e duas casas distintas; apenas o Narrador cria, configura ou encerra a sessão.
- Cada casa controla **um lado**, mediante associação autenticada à campanha. O primeiro membro da casa que entra ocupa a cadeira; o outro lado é preenchido pelo jogador da outra casa.
- Jogo completo usando os modelos fictícios da Cruzada V3: movimento, ataques, espera, defesa, habilidades e poderes dos comandantes. O estado é lido por ambas as contas a cada 2,5 segundos; não é WebSocket.
- Comando único identificado por UUID, versão esperada, hash anterior e transação PostgreSQL atômica. Em caso de disputa, o servidor recusa o comando perdedor (CAS), e o cliente atualiza a posição antes de tentar novamente.
- Replay `CCA-V34-REPLAY-1` com transições recalculadas pelo redutor de servidor, versões, `SHA-256` canônico, autor, lado e sequência. Recusa adulteração, buracos e replay divergente.
- RLS read-only com associação de casa verificada via JWT; mutações apenas por backend `service_role`, funções de banco não executáveis por jogadores. Revalidação da associação e convite ainda aberto também na mesma transação de assento e de comando.
- Revogação de uma associação impede novas leituras e jogadas sem modificar dados antigos do exercício.
- Sem acesso a ficha, atributos, exército oficial ou Hub Temporal; apenas cópias fictícias.

## Operação
- Script aditivo e independente: `docs/battle/sql/0078_battle_v34_synced_sessions.sql`; pré-requisito `0077_battle_v3_invitations.sql`.
- Ambiente precisa de `ENABLE_BATTLE_V34_SYNC=true` **no servidor** e `VITE_ENABLE_BATTLE_V34_SYNC=true` no frontend, exclusivamente após migração e homologação.
- O botão `Duelo sincronizado` só aparece quando uma sessão para uma casa do jogador existe. A convocação local não se transforma automaticamente em multiplayer.
- Narrador: `Convocar batalha` → criar convocação → selecionar casa adversária em `Partidas sincronizadas`.
- Jogador: `Batalha` → `Duelo sincronizado` → ocupar a cadeira e comandar seu lado.

## Testes e limites
- Testes puros `src/test/battle-v34-synced.test.tsx`: vez de cada lado, autorização, comandos, SHA-256, incompatibilidade e ausência de writes oficiais.
- PostgreSQL descartável em CI: `battle-v34-bootstrap.sql` + `0077` + `0078` + `battle-v34-smoke.sql`, para RLS, idempotência, versões obsoletas, cadeiras, autorização e revogação.
- E2E sintético no Chromium NÃO substitui dois usuários reais com JWT em homologação. Testar concorrência de duas abas/dispositivos, revogação durante o comando, perda de conectividade, período de inatividade e convite encerrado.
- Máximo de 600 comandos por duelo e 40 sessões exibidas, para reduzir abuso de armazenamento.
- Nenhum deploy foi realizado por esta PR. SQL não é executado em produção pelo GitHub Actions.

## Explicitamente fora do escopo
- Realtime por WebSocket, matchmaking aberto, escolha de casas sem convite, regras de tempo por turno ou IA adversária remota.
- Aplicação de baixas e custos às fichas das casas. Isso exige a fase V3.5 independente, validação de regras de perdas e aprovação explícita do Narrador.
