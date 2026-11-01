# Hub Temporal — homologação isolada e bloqueios operacionais (31/10/2026, horário do Brasil)

## Ambientes

- **Produção:** Lovable Cormyr Chronicle Atlas, projeto `bdc007de-2bdf-4e28-8df8-b09ce46f884c`. Site publicado na revisão `f1107787d80327ac5b327a1252955f3e92bddfc9` no momento da auditoria. **Não foi alterado.**
- **Cópia de homologação:** projeto Lovable `41028f68-4fe7-4ed0-b123-c820522a0a3b`, workspace `workspace_01m5q91azgfy5ttbce2a6pfjnx`. Editor: https://lovable.dev/projects/41028f68-4fe7-4ed0-b123-c820522a0a3b . Criado com remix do original, sem histórico e sem conhecimentos personalizados, **não publicado**. Remix não copia dados de usuários, segredos ou conexões de serviços.
- A cópia tem **banco PostgreSQL/Supabase próprio**, 38 tabelas públicas e, no baseline, **zero** Casas, missivas, fichas, registros de backup e entradas no diário Drizzle. O calendário público estava vazio. Portanto, é um **clone estrutural vazio**, não uma restauração real de backup.

## Migrações executadas **somente na cópia de homologação**

| Arquivo | Ensaio transacional (COMMIT → ROLLBACK) | Aplicação no clone | Observações |
|---|---|---|---|
| `0060_hub_temporal_atomic_publication.sql` | PASSOU | PASSOU | `campaign_time_operations` e função `publish_campaign_time_change` confirmadas por consultas posteriores |
| `0061_public_campaign_time_projection.sql` | PASSOU | PASSOU | Publicação mínima da data |
| `0062_canonical_character_registry.sql` | PASSOU | PASSOU | Registro canônico; sem personagens reais na cópia |
| `0063_annual_character_ages.sql` | **Não executado** | **Não executado** | Limite de ações de banco do Lovable: resposta explícita `This query wasn't executed` |
| `0064_mail_chronology_integration.sql` | Não tentado | Não tentado | Depende da continuação do ensaio |
| `0065_house_temporal_months.sql` | Não tentado | Não tentado | Depende da continuação do ensaio |
| `0066_temporal_consumer_outbox.sql` | Não tentado | Não tentado | Depende da continuação do ensaio |
| `0067_temporal_release_preflight.sql` | Não tentado | Não tentado | Depende da continuação do ensaio |

**Atenção:** a execução direta de SQL no clone não escreveu as entradas correspondentes em `drizzle.__drizzle_migrations` (diário inicialmente vazio). Esse ensaio **não** substitui a execução do migrador Drizzle nem autoriza um replay automático de `0060`–`0062`. Reconciliar o histórico do clone antes de testar o pipeline oficial.

## Produção: evidências de segurança e pendências

1. Banco de produção: **40** registros Drizzle; os 40 timestamps e hashes SHA-256 foram comparados aos scripts correspondentes da branch final e coincidem.
2. Diário da branch tem **42** entradas, com 27 arquivos SQL fora do diário e prefixo `0041` duplicado.
3. `0042_reconcile_house_workbooks.sql` descreve **6** operações de importação; produção já possui as 6 chaves `operation_key` no ledger e 6 marcadores `applied`, apesar da ausência do registro `0042` no histórico Drizzle. **Não repetir essa carga.**
4. Banco real: ainda não contém `campaign_time_operations`, o conjunto de tabelas do consumidor temporal nem `publish_campaign_time_change`.
5. Produção tem 38/38 tabelas públicas com RLS habilitado, mas ainda não houve prova end-to-end com perfis de jogadores e Narrador.
6. A tabela interna `campaign_migration_backups` contém 13 registros JSON de operações anteriores. **Não são uma exportação integral restaurável do PostgreSQL e não demonstram uma recuperação de produção.**

## Backup/restauração: acesso necessário e operação segura

O conector Lovable desta sessão oferece `get_database_status` e `query_database`, **mas não oferece ação para listar/exportar snapshots gerenciados, gerar dump integral, baixar arquivos de backup ou restaurar banco isolado**. O limite de consultas foi atingido durante o ensaio. Não se deve simular backup com cópia de tabelas dentro da produção.

O responsável pelo projeto precisa:
1. No editor do projeto de produção, abrir **Cloud / Database / Backups** (na interface atual) para **verificar backup recente, abrangência e data de restauração**, **sem escolher Restore na produção**.
2. Usar a função segura de **Export project data / Export database** do Lovable, quando disponível, e guardar a exportação e mídias de Storage em destino privado; não carregar dumps com dados pessoais em PRs, chats ou logs.
3. Fazer a importação do backup num PostgreSQL **fisicamente separado** com usuários e permissões controladas; esse processo não está exposto pelas ações do conector atual. Conferir tabelas, funções, extensões, auth, roles, políticas, Storage e integridade do conjunto de dados. **A cópia criada neste lote não recebeu dados de produção.**
4. Executar e comprovar a restauração ao ponto de controle e recolher somente métricas agregadas de validação, usando `scripts/temporal-restored-baseline.mjs` e `scripts/temporal-reconciliation-plan.mjs` na revisão exata, em transação de leitura.
5. Resolver os SQL sem journal e o prefixo duplicado `0041` com a migração real; marcar `0042` como já aplicado **apenas com evidência individual e procedimento auditado**, nunca falsificando o histórico.
6. Retomar no clone somente as migrações `0063`–`0067` quando o limite de acesso permitir, primeiro via rollback transacional, depois aplicadas no clone, e executar smoke tests usando dados de teste.
7. Após homologação em clone **restaurado do backup real**, obter GO formal, integrar PR #164 ao main, conferir CI do commit exato e só então executar migração ordenada e publicar com janela de corte, métricas e rollback documentado.

## Critério de saída

- Clone estrutural criado e testes parciais concluídos: **SIM**.
- Backup integral de produção restaurado com sucesso: **NÃO**.
- Todas as migrações executadas e testadas no clone: **NÃO** (limite de ações).
- Histórico de migrações Drizzle reconciliado na produção: **NÃO**.
- Produção migrada ou nova versão publicada: **NÃO**.

**Decisão: NO_GO de produção.** Esse documento registra operações realmente executadas; não deve ser interpretado como comprovação de recuperação integral nem como autorização de mudança destrutiva.


## Retomada da implantação — 7/8 migrações no clone

**Execução posterior nesta conversa:** a cota de operações de banco voltou a permitir consultas por um período, e o projeto de homologação `41028f68-4fe7-4ed0-b123-c820522a0a3b` pôde receber mais mudanças. **Não houve nenhuma gravação no banco de produção.**

| Migração | Dry run BEGIN/ROLLBACK | Aplicação real no clone |
|---|---|---|
| 0060 | Aprovado anteriormente | Aplicada anteriormente |
| 0061 | Aprovado anteriormente | Aplicada anteriormente |
| 0062 | Aprovado anteriormente | Aplicada anteriormente |
| 0063_annual_character_ages | **PASSOU** | **PASSOU** (FK com `auth.users` aceitou no SQL direto) |
| 0064_mail_chronology_integration | **PASSOU** | **PASSOU** |
| 0065_house_temporal_months | **PASSOU** | **PASSOU** |
| 0066_temporal_consumer_outbox | **PASSOU** | **PASSOU** |
| 0067_temporal_release_preflight | **PASSOU** | **NÃO EXECUTADA: quota do Lovable novamente esgotada** |

O resultado `This query wasn't executed` foi retornado explicitamente pelo Lovable no momento da aplicação 0067. **Não afirmar que ela foi instalada.** Toda migração é uma transação com COMMIT próprio; a versão `COMMIT→ROLLBACK` foi testada antes de cada aplicação. As migrações 0060–0066 foram executadas diretamente, mas **o Drizzle journal do clone não foi atualizado**; conciliar seu histórico antes de rodar o migrador, sem repetir DDL e registros já existentes.

**Frontend:** a cópia Lovable ainda contém código anterior ao Hub; em inspeção, não possuía `src/lib/calendar/campaign-time.ts` nem os novos consumidores de calendário. O workspace `Cormyr` de homologação não tem conector GitHub conectado. O catálogo oferece o conector GitHub API, mas o usuário precisa concluir OAuth/token no dashboard em `https://lovable.dev/dashboard?connectors`; a API não instala credenciais por si. Os arquivos completos e testados do frontend estão na branch desta PR, **não na cópia Lovable**. Não copiar por recomposição aproximada e não publicar o frontend contra backend ausente.

**CI:** o commit `4ff0068e393aaea02bba316cd614790106e675f6` da branch cumulativa passou pelos dois workflows, incluindo testes isolados de PostgreSQL, TypeScript e build (runs `41256346780` e `41256345209`). Isto não valida o esquema produtivo.

**Pendências impeditivas:** (a) aplicação 0067 no clone quando quota permitir; (b) conector GitHub no Lovable e sincronização fiel do frontend com teste de navegação e papéis; (c) restauração real de backup de produção em cópia separada (clone atual está vazio); (d) reconciliação do diário Drizzle com os 27 SQL fora dele e importações 0042 já aplicadas; (e) aceite de produção do calendário, Casas, nobres e missivas. **NO_GO para produção**.
