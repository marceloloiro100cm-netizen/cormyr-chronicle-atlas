# Hub Temporal de Cormyr — Lote 16: ensaio isolado de reaplicação de migrações

**Data:** 31/10/2026  
**Base:** Lote 15, PR #141.  
**Estado:** rotina operacional e testes para **PostgreSQL efêmero do GitHub Actions**, não para homologação compartilhada nem Supabase de produção.

## 1. Problema tratado

Até o Lote 15 identificamos **69 SQL**, **42 registros do Drizzle**, **27 SQL não registrados no diário**, uma numeração duplicada **0041** e snapshots incompletos. Sabemos que os scripts migram uma base descartável vazia no CI, mas não sabíamos se **reaplicar** uma migração numa estrutura já migrada poderia falhar ou modificar dados/esquema. Isso é crítico porque o banco real pode ter recebido SQL manualmente.

O Lote 16 acrescenta um **ensaio real em banco isolado**, sem confundir esse resultado com a situação de produção.

## 2. Implementação versionada

### Ensaio de migração por clones descartáveis

\`scripts/test-temporal-migration-replay.sh\` testa precisamente os scripts \`0060\`–\`0067\`, que cobrem publicação temporal, relógio público, personagens, idades, missivas, posses mensais, outbox e pré-voo administrativo.

O procedimento no job \`mail-database\` segue uma ordem segura:

1. Monta a base inicial \`mail_test\` em PostgreSQL 16 efêmero, aplica os 69 SQL pela mesma sequência do CI e executa a bateria anterior de regressões.
2. Confere ambiente \`GITHUB_ACTIONS=true\`, \`TEMPORAL_DISPOSABLE_POSTGRES=true\`, host \`localhost\`, porta, base, usuário e senha **fixos da fixture**. Verifica que o esquema de teste esperado existe. Não usa \`CORMYR_AUDIT_DATABASE_URL\` nem \`LOVABLE_DB_MIGRATION_URL\`.
3. Calcula digests SHA-256 agregados de dump de **esquema e dados** do banco-fonte \`mail_test\`.
4. Para cada migração, cria um banco separado \`cormyr_replay_0060\` ... \`cormyr_replay_0067\` a partir de \`TEMPLATE mail_test\`.
5. Calcula digests de esquema e dados da cópia, tenta reexecutar **somente aquele SQL**, registra êxito/erro e alterações de cada digest. O script guarda erros apenas em pasta temporária efêmera, sem imprimi-los nos logs do GitHub.
6. **Descarta o clone**, independentemente de o SQL ser reentrante. Há limpeza por \`trap\` em caso de falha prematura.
7. Confirma que os digests do banco-fonte \`mail_test\` permanecem idênticos, falhando o job caso haja qualquer alteração.
8. Produz \`cormyr-replay-report.json\` sob \`RUNNER_TEMP\`, com resultados técnicos por arquivo e contagens agregadas no resumo do GitHub Actions.

### Os resultados possíveis não autorizam produção

| Diagnóstico em cópia | Interpretação |
| --- | --- |
| \`replay_succeeded_on_scratch_copy=true\` | O script foi executado nesse **snapshot descartável**, sem erro SQL relatado. Não garante segurança em banco real ou com dados diferentes |
| \`replay_succeeded_on_scratch_copy=false\` | A reaplicação não terminou sem erro nesta cópia. **Não** tentar novamente em produção |
| \`schema_changed_in_copy=true\` | A reaplicação mudou a representação textual do esquema na cópia |
| \`data_changed_in_copy=true\` | A reaplicação mudou o dump textual de dados na cópia; exige inspeção particular |
| Ambos \`false\` | Os digests permaneceram iguais, **sem comprovar** ausência de efeitos externos, locks ou consequências dependentes de dados |

As assinaturas são baseadas no dump de cada cópia com configurações fixas. Não são uma comparação criptográfica com o banco da campanha, nem demonstram equivalência RLS/dados entre ambientes.

O JSON grava sempre:

\`\`\`json
{
  "database": "ephemeral-ci-clones",
  "source_database_unchanged": true,
  "production_database_touched": false,
  "production_replay_safe": null,
  "ready_for_deploy": false
}
\`\`\`

Os campos são propriedades do ensaio **no job de banco efêmero**. Não há acesso ao banco produtivo.

### Testes e CI

- \`scripts/temporal-migration-replay-safety.test.mjs\`: valida a lista fixa de oito migrações, os bloqueios de ambiente, a criação e destruição dos clones, o comparativo da fonte e a ausência de permissão de deploy.
- \`.github/workflows/validate.yml\`: adiciona uma etapa **após** toda a regressão SQL anterior, exclusivamente no job \`mail-database\`.
- A suíte completa de Node, Vitest, TypeScript e build do Atlas permanece no job \`validate\`.

## 3. Restrições de operação

**Esta ferramenta é um teste de CI, não um runner de migrações.**

- Não invocar o script em produção, homologação conectada ao jogo ou servidores compartilhados.
- Não alterar manualmente as variáveis para contornar as proteções.
- Não criar clones de bancos que contenham dados reais de jogadores; as cópias são derivadas **somente** da fixture descartável \`mail_test\`.
- Não mesclar automaticamente as PRs empilhadas #127–#141, nem a variante #129.
- A última auditoria de release continua **NO_GO** até conciliar os 27 arquivos ausentes do diário com logs, schema e autorização.
- Mesmo se os oito scripts forem reexecutáveis nessa fixture, executar qualquer um deles no Supabase real requer análise da aplicação anterior, dados existentes, dependências e plano de rollback.

## 4. Matriz de aceite do lote

- [x] Preparar oito bancos clonados separadamente, a partir de migrações já aplicadas num PostgreSQL descartável.
- [x] Medir falhas de reaplicação e diferenças de esquema e dados em cada cópia.
- [x] Garantir descarte de clones e verificar que a base-fonte não sofreu alterações.
- [x] Preservar a distinção entre **êxito técnico em clone** e **autorização de aplicação real**.
- [x] Integrar o ensaio ao job de SQL e criar regressões estáticas de segurança.
- [ ] Validar o resultado do GitHub Actions desta PR e registrar as contagens observadas.
- [ ] Investigar qualquer script que falhe ou altere esquema/dados na reaplicação, em conjunto com a estratégia de conciliação real.
- [ ] Receber o inventário autorizado do Supabase e evidências de migrações já aplicadas.
- [ ] Restaurar backup e homologar o plano de corte com dados representativos antes de qualquer implantação.

**Conclusão:** o ensaio reduz risco de reaplicação acidental e fornece dados novos sobre os SQL temporais, mas **não resolve** sozinho o histórico incompleto do Drizzle. O site publicado e a data do jogo permanecem inalterados.
