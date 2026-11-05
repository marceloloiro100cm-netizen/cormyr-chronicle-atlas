# Liberação controlada da persistência tática PTE-2.0 — 05/11/2026

**Autorização expressa do Narrador:** liberar o Módulo de Batalha em produção.

## Migração isolada aplicada ao banco de produção
- Migração independente `docs/battle/sql/0076_battle_sim_homologation.sql`, aplicada via transação em banco de produção após identificar o cluster PostgreSQL `7692131729119822239`.
- Pré-requisitos verificados: as três tabelas e RPCs não existiam, 40 migrações Drizzle registradas, 10 fichas militares e 13 contas existentes.
- A SQL cria apenas `battle_sim_sessions`, `battle_sim_events`, `battle_sim_scenarios` e as duas RPCs `battle_sim_commit_replay`, `battle_sim_commit_step`; não atualiza fichas, missivas, calendário ou tabelas preexistentes.
- RLS habilitada nas três tabelas. Sem SELECT anônimo, sem escrita direta para authenticated, sem EXECUTE de RPC pelo navegador. EXECUTE somente para `service_role`.
- Smoke transacional em produção com contexto SQL de Narrador: criação de sessão, passo, idempotência, CAS obsoleto, RLS, rollback. **ROLLBACK completado, zero sessões/eventos/cenários remanescentes** e fichas intactas.
- Banco do simulador continua segregado no mesmo cluster lógico, sem sincronização de baixas às unidades oficiais.
- Drizzle permanece em 40 entradas. O SQL tático foi aplicado como migração **manual independente**, não marcamos entrada no journal. Antes da futura reconciliação Drizzle, verificar os objetos existentes e o histórico; não executar a mesma migração como versão numerada sem deduplicação.

## Rollout de interface e serviço
- A interface é apresentada apenas ao Narrador e após `checkBattlePersistence` autenticar papel corrente, acesso ativo e capacidade de leitura via chave técnica no **servidor**. Usuários anônimos, jogadores e Narradores revogados não podem gravar ou consultar.
- Kill-switch de interface: `VITE_ENABLE_BATTLE_PERSISTENCE=false` no build. Kill-switch de servidor: `ENABLE_BATTLE_PERSISTENCE=false` no runtime. Ausência das flags significa release autorizado; a verificação de capacidade da conexão técnica continua sendo obrigatória. Para desligar a interface de forma urgente, configurar o kill-switch e republicar.
- Se o Supabase `SUPABASE_SERVICE_ROLE_KEY` não estiver disponível no runtime, o botão de salvar é oculto, o módulo continua acessível sem persistência, e o replay pode ser exportado em JSON.
- Apenas snapshots de batalha são gravados. Unidades oficiais seguem em leitura, revalidadas antes do salvamento. Nenhum write em `noble_house_sheets`.
- Batalhas salvas podem ser listadas, visualizadas e exportadas; **retomar e editar uma batalha persistida no visualizador ainda não faz parte desta versão**. Declarar o escopo corretamente.

## Segurança e observabilidade pendentes
- SQL/RLS/concorrência/restore já verificados em homologação isolada e CI descartável. No banco de produção, verificamos RLS e rollback transacional. **Testes de JWT real com navegador não foram possíveis**: Lovable informou workspace sem créditos para enviar novas mensagens ao agente.
- O serviço só anuncia capacidade se o middleware, papel, banco e credenciais efetivamente responderem. Não publicar claim de E2E autenticado sem prova.
- Verificar após deploy: narrador com menu e salvamento habilitado; jogador bloqueado; retorno ao login; gravação/listagem/replay após reload; revogação impede leitura; teste mobile; disponibilidade da chave `SUPABASE_SERVICE_ROLE_KEY` no runtime.
- Para rollback do banco (somente se zero sessões): `docs/battle/sql/rollback-battle-sim-staging.sql` é guardado para backout explícito após inspeção/backup; não executar automaticamente nem sobre registros reais.
