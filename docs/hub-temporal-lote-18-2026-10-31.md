# Hub Temporal — Lote 18: restauração e homologação em cópia isolada

**Data:** 31/10/2026 · **Base:** Lote 17 / PR #143

**Escopo executável:** backup e restauração do PostgreSQL 16 efêmero do GitHub Actions. Não foi obtido ou restaurado nenhum backup real do Supabase neste lote.

## Objetivo e procedimento

O ensaio acrescentado ao CI segue a validação já existente das migrações, dos testes SQL e do replay isolado do Lote 16. O script scripts/test-temporal-restore-drill.sh:

1. Exige exclusivamente a conexão de fixture do CI (GITHUB_ACTIONS, TEMPORAL_DISPOSABLE_POSTGRES, host localhost, banco mail_test, usuário postgres e senha de teste). Rejeita variáveis libpq que redirecionam a conexão.
2. Exige que a fixture contenha os objetos do Hub Temporal. Confere se o banco de destino cormyr_temporal_restore_18 ainda não existe; a limpeza somente remove um banco criado pelo próprio script.
3. Calcula hashes SHA-256 do esquema e dados da fonte e obtém a projeção pública do calendário, sem divulgar seus valores.
4. Gera arquivo custom via pg_dump -Fc num diretório temporário do runner, verifica seu catálogo e restaura uma cópia nova, com pg_restore --single-transaction --exit-on-error. As ferramentas pg_dump/pg_restore são executadas com o **cliente PostgreSQL 16 oficial no contêiner postgres:16**, pois o cliente mais recente pré-instalado no runner pode produzir opções incompatíveis com o servidor da fixture.
5. Compara hashes e data pública entre origem e destino; qualquer divergência interrompe o job.
6. Executa scripts/test-temporal-homologation-contracts.sql **na restauração**, em transação revertida, para verificar RLS, acesso do jogador comum, RPCs administrativas e relógio público.
7. Confere que a função sazonal contém a correção season_crossings da migração 0067. Essa checagem é importante porque o Lote 16 comprovou que reaplicar 0066 pode substituí-la por lógica antiga sem erro.
8. Confere que os testes não alteraram a cópia e que esquema, dados e data da **origem** continuam intactos.
9. Destrói o banco criado e o arquivo de backup, inclusive ao falhar. O sumário contém apenas resultados técnicos agregados, sem dumps, credenciais ou dados de jogadores.

O teste Node scripts/temporal-restore-drill-safety.test.mjs impõe as restrições de uso, impossibilidade de remoção de banco preexistente, rollback, verificação de integridade e ausência de alegação de deploy produtivo.

## Distinção crítica: fixture versus backup real

| Garantia | Evidência CI neste lote | Prova externa pendente |
| --- | --- | --- |
| Backup restaurável | Arquivo custom e restauração descartável | Backup real restaurado em homologação autorizada |
| Esquema e dados | Comparação dos dumps normalizados | Comparação com registros reais da campanha |
| Relógio Harptos | Projeção pública igual após restauração | Conferir mês, ano, désdia e versão da campanha |
| Permissões | Contratos RLS e RPC testados em cópia | Sessões reais de Narrador e jogadores de teste |
| Outbox e estação | Correção da 0067 preservada | Fluxos representativos com dependências reais |
| Diário de migrações | Não é alterado | **27 SQL sem registro**, ordinal 0041 duplicado |
| Liberação de implantação | **NÃO** | Backup, homologação, histórico conciliado e autorização |

## Evidência do job

Quando aprovado, o script produz temporal-restore-drill.json somente em RUNNER_TEMP, com resultado positivo para igualdade de schema, dados, data e correção sazonal. Os indicadores production_backup_restored, real_user_data_examined, drizzle_history_reconciled e production_release_authorized permanecem **false**.

O job falha se a cópia não puder ser restaurada, se falhar um contrato de RLS/RPC, se a correção sazonal regredir ou se houver alteração dos fingerprints. Não existe acesso automático a Supabase, execução de novas migrações ou merge.

## Condição de corte

O Hub Temporal ainda está em **NO_GO**. Antes de implantação: inventário read-only do banco real, conciliação da sequência SQL e Drizzle, backup real restaurado num ambiente isolado, teste com dados representativos, revisão de privacidade e autorização operacional explícita. A PR alternativa #129 não deve ser mesclada junto à #130.

A aprovação da CI apenas demonstra que a fixture migra, é restaurável e preserva os contratos testados; **não representa implantação do Hub Temporal**.
