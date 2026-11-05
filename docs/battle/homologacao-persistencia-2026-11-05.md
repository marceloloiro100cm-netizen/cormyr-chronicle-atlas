# Homologação da persistência de batalha — 05/11/2026

**Projeto:** Cormyr Chronicle Atlas · módulo de batalha PTE-2.0  
**Escopo:** exclusivamente o **banco do projeto Lovable de homologação** `6fbb6b20-e2ad-4d5b-8cb5-ee6bc5af29c6` (separado de `bdc007de-2bdf-4e28-8df8-b09ce46f884c`, produção).  
**Classificação:** **APROVADO no SQL isolado / NÃO APROVADO para habilitação em produção**.  
**Responsável pela execução:** testes automatizados de PostgreSQL do projeto e execução controlada, somente no banco de homologação.

## Preflight — segurança de isolamento

1. Confirmadas identidades de cluster PostgreSQL **diferentes** via `pg_control_system().system_identifier`. Nenhum SQL de migração foi aplicado ao projeto de produção.
2. Homologação: zero usuários de `auth.users`, papéis de `user_roles` e fichas `noble_house_sheets`, antes e depois da execução. Produção possui dados reais e não foi usada para escritas.
3. Metadados comparados sem acessar informações pessoais: os bancos possuem as mesmas **77 tabelas-base**, **746 colunas** e **154 definições de funções públicas**. Restrições diferem apenas em `spy_portrait_catalog` (1 de 77 tabelas) e políticas apenas em `campaign_translations` (1 de 54 tabelas com políticas). As tabelas de papéis e fichas necessárias à batalha têm estruturas compatíveis.
4. **Divergência relevante:** `drizzle.__drizzle_migrations` registra **40** migrações na produção e **0** na homologação, apesar da forte similaridade estrutural. Não copiar o ledger nem aplicar retrospectivamente migrações sem inventário e reconciliação. A aplicação Lovable da homologação também não está no mesmo commit que a `main`.

## Execução controlada

**Migração realmente aplicada apenas na homologação:**
`docs/battle/sql/0076_battle_sim_homologation.sql`.

Objetos disponíveis após a aplicação:
- `public.battle_sim_sessions`
- `public.battle_sim_events`
- `public.battle_sim_scenarios`
- `public.battle_sim_commit_replay` e `public.battle_sim_commit_step`

As três tabelas estão com RLS ativa. Leitura é concedida ao papel `authenticated` apenas sob políticas `is_campaign_admin()` e `campaign_access_active()`. O papel `anon` não recebe `SELECT`; `authenticated` não recebe `INSERT`. Somente `service_role` recebe `EXECUTE` nas duas funções de escrita. Confirmado via catálogos reais `pg_class`, `pg_proc` e `has_*_privilege`.

## Matriz de aceite executada no banco Lovable de homologação

| Cenário | Resultado | Método |
|---|---|---|
| Instalar tabelas/RPCs com RLS | **PASSOU** | DDL transacional no Supabase separado |
| Papel anônimo não acessa tabelas/RPCs | **PASSOU** | `has_table_privilege`, `has_function_privilege` |
| Narrador autorizado vê sessão, evento e cenário | **PASSOU** | `SET LOCAL ROLE authenticated` + claim sintética |
| Jogador não vê sessões, eventos e cenários | **PASSOU** | Claim sintética de jogador, RLS real |
| Narrador revogado perde leitura e direito de gravar | **PASSOU** | Revogação de `user_roles` e checagem RPC/RLS |
| Criar sessão, gravar comando, incrementar versão | **PASSOU** | Funções SQL reais em `service_role` |
| Repetir mesmo `command_id` não duplica eventos | **PASSOU** | Confirmação de uma única entrada |
| `state_version` defasada é recusada | **PASSOU** | Erro de concorrência `40001` |
| Reutilizar `command_id` com payload diferente é recusado | **PASSOU** | Exceção transacional |
| Erro injetado após `INSERT` desfaz evento e estado | **PASSOU** | Trigger de falha em transação de teste |
| Reversão de DDL e restauração via `ROLLBACK` | **PASSOU** | DROP de funções/tabelas dentro de transação abortada |
| Integridade de dados reais da campanha | **PASSOU neste escopo** | Zero usuários, fichas e eventos de teste remanescentes; banco de produção intocado |
| Corrida verdadeira entre duas sessões simultâneas | **PASSOU no CI isolado; PENDENTE no Lovable de homologação** | [GitHub Actions #42090897370](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/actions/runs/42090897370): 2 conexões PostgreSQL independentes, 1 commit + 1 conflito `40001`, versão/evento = 1. A ferramenta bloqueou a tentativa equivalente no Supabase Lovable. |
| Fluxo E2E com JWT real no frontend da homologação | **PENDENTE** | Ambiente não tem contas de teste, e código da aplicação de homologação está defasado |
| Replay SHA-256 completo gravado, lido e reconstruído pela API | **PENDENTE no ambiente** | Já coberto por Vitest/Chromium sintético; requer credenciais e ambiente de app pareados |
| Backup e restauração real de clone da campanha | **PENDENTE** | Rollback transacional não substitui restauração de backup |

**CI de concorrência:** `docs/battle/sql/test/battle-cas-race.sh` tem guards `CI=true`, `BATTLE_DISPOSABLE_POSTGRES=true`, `PGHOST=localhost`, `PGDATABASE=battle_test` e foi aprovado no job `battle-database` do workflow #42090897370. Não reutilizar esse script em banco real.

**Limpeza:** todos os dados sintéticos foram criados dentro de transações e revertidos. Ao final: zero sessões, eventos, cenários, usuários de teste e papéis sintéticos. A **estrutura SQL de homologação foi mantida** para testes operacionais futuros.

## GO / NO-GO e próximos passos

- **GO:** continuar os testes SQL e o preparo da interface de persistência **exclusivamente em homologação**.
- **NO-GO:** ativar `ENABLE_BATTLE_PERSISTENCE` ou `VITE_ENABLE_BATTLE_PERSISTENCE` em produção, aplicar SQL em produção, migrar dados da campanha ou declarar conclusão de E2E autenticado.
- Reconciliar `drizzle.__drizzle_migrations` com o histórico efetivo. A similaridade de esquema não significa que o ledger seja seguro para alteração.
- Atualizar a aplicação Lovable de homologação para o commit aprovado da `main`, vinculada somente ao banco separado.
- Criar contas de **teste** de Narrador/jogador; executar E2E com **JWT real** e negar acesso após revogação, sem transportar fichas reais.
- Validar `saveBattleReplay`, `readSavedBattle`, `applySavedBattleCommand` no servidor de homologação com snapshots genuínos e hashes de replay; testar gravações simultâneas em duas abas.
- Confirmar plano de backup/restore e registrar aceite para fase B antes de nova publicação.

**Referências:** PR #258 (motor), PR #259 (fase A), issue #260, `docs/battle/sql/test/battle-sql-smoke.sql`.

**Conclusão:** a **homologação da camada SQL foi executada e aprovada** no banco separado; o aceite integral da **persistência pela aplicação** permanece **bloqueado** por autenticação/ambiente e reconciliação de migrações.
