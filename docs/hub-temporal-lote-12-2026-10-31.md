# Hub Temporal — Lote 12: reconciliação verificável de migrações

**Data:** 31/10/2026 · **Base:** Lote 11, PR #137  
**Situação:** análise e ferramentas em GitHub. Sem acesso ao inventário do Supabase real, sem execução de migração na produção, sem merge das PRs dependentes.

## 1. Diagnóstico comprovado no repositório

O histórico de Drizzle não representa a totalidade dos scripts SQL do repositório:

| Evidência | Quantidade / achado |
| --- | --- |
| Arquivos \`drizzle/migrations/*.sql\` | **69** |
| Entradas em \`drizzle/migrations/meta/_journal.json\` | **42** |
| Arquivos SQL não registrados no diário | **27** |
| Lacuna de índice \`idx\` do diário | **0036** não registrado (\`idx\` pula 35→37) |
| Prefixos numéricos repetidos | **0041** (\`campaign_translations\` e \`seed_complete_noble_house_possessions\`) |
| Migrações temporais \`0060\`–\`0067\` | Presentes em SQL, **não** no diário |

A migração \`0059\` corrige uma parte do *drift* do schema, mas **não prova** que outras migrações foram realmente aplicadas na base e não substitui a verificação do histórico do Drizzle.

Os testes do CI que aplicam cada arquivo SQL em ordem lexicográfica, em um banco descartável, demonstram compatibilidade nessa execução específica. **Não** revelam quais arquivos foram executados manualmente ou via Drizzle no banco de produção, nem autorizam reexecutá-los.

## 2. Solução implementada sem escrever no banco

- \`scripts/temporal-migration-audit.mjs\`: compara todos os arquivos SQL, hashes SHA-256 do conteúdo completo, tags e ordenação do diário. Com inventário, também verifica evidência das entradas do registro Drizzle e a existência dos objetos obrigatórios do Hub. Retorna \`ready_for_deploy=false\` em qualquer anomalia.
- \`scripts/temporal-db-inventory.mjs\`: coleta inventário de um banco indicado **explicitamente pelo operador** usando apenas consultas \`SELECT\` em catálogo/registro de migrações e transação \`READ ONLY\`. Não usa a conexão do site nem busca credenciais automaticamente.
- \`scripts/temporal-migration-audit.test.mjs\`: testes das condições de bloqueio, hashes divergentes, registros não reconhecidos, ausências de evidência e consultas somente leitura.
- CI: executa o teste e publica o resumo da auditoria como relatório, **sem desativar o bloqueio de deploy**.

A auditoria não edita \`_journal.json\`, não insere linhas em \`drizzle.__drizzle_migrations\` e não executa \`drizzle-kit migrate\`.

## 3. Como produzir a evidência em homologação

A execução é um passo manual e autorizado no ambiente escolhido. O operador configura uma credencial de **somente leitura**, sem colocar a URL no código, no chat, no relatório ou em logs. Exemplo para Linux:

\`\`\`bash
# Credenciais fornecidas por meio seguro ao shell do operador.
# Não compartilhar nem versionar a variável.
node scripts/temporal-migration-audit.mjs --report > audit-local.json

# Executar somente quando CORMYR_AUDIT_DATABASE_URL estiver configurada
# para a instância explicitamente autorizada para inspeção.
node scripts/temporal-db-inventory.mjs --read-only > inventory-homologacao.json
node scripts/temporal-migration-audit.mjs \
  --report --inventory inventory-homologacao.json > audit-homologacao.json

# Gate: deve falhar enquanto houver divergência.
node scripts/temporal-migration-audit.mjs \
  --gate --inventory inventory-homologacao.json
\`\`\`

O relatório de inventário contém somente nomes/indicadores de objetos do esquema e hashes/timestamps do registro de migrações. **Mesmo assim, tratar como informação operacional interna.** Não anexar credenciais ao GitHub. A consulta não lê tabelas de Casas, jogadores, missivas ou dados de personagens.

**Limitante:** existência de objeto SQL não comprova que o script exato foi aplicado e não comprova o estado dos dados. Os hashes no registro Drizzle só provam correspondência para as migrações que foram rastreadas pelo mecanismo, não execução manual de SQL. A fonte real deve ser reconciliada com registros de deploy, logs e schema diff, sem inventar timestamps.

## 4. Plano de conciliação antes do deploy

1. Congelar o SHA das branches aprovadas e a cadeia empilhada de PRs \`#127 → #128 → #130 → #131 → #132 → #133 → #134 → #135 → #136 → #137\`. Não mesclar a alternativa concorrente \`#129\` automaticamente.
2. Obter inventário **somente leitura** de homologação e da base real com autorização formal, verificando \`drizzle.__drizzle_migrations\` e DDL real; **não executar migrações nesta etapa**.
3. Para cada um dos 27 arquivos ausentes no diário, apurar se foi aplicado por execução manual ou ferramenta, identificar ordem e hash real, testar equivalência de schema com cópia restaurada e marcar o estado apenas depois de evidência verificável. Não inferir a aplicação por nomes de tabelas.
4. Resolver explicitamente a colisão \`0041\`, a lacuna \`0036\` e a ausência de snapshots/journal dos arquivos \`0043\`–\`0067\`. A estratégia (baseline de nova linha, diário reconciliado ou runner SQL separado) depende do estado observado do banco real, e deverá preservar os commits históricos.
5. Fixar uma única rotina de implantação para futuras migrações, com manifesto imutável de hashes e ordem, antes de reabilitar o \`--gate\`.
6. Realizar backup consistente restaurável, validação de homologação com dados legados representativos, testes RLS, verificação de side effects e contrato frontend/backend.
7. Somente depois executar a implantação autorizada e smoke tests não destrutivos. Não avançar datas reais durante o teste de produção.

**Ação proibida até essa conciliação:** editar manualmente o diário com timestamps fictícios, declarar migrações concluídas por \`INSERT\` no registro Drizzle, rodar \`drizzle-kit migrate\` cegamente, aplicar todas as \`*.sql\` em produção ou usar retrocesso de data Harptos como rollback técnico.

## 5. Contratos de aprovação

O relatório da ferramenta distingue:

- \`--report\`: retorna diagnóstico JSON mesmo havendo problemas (exit code 0 para a consulta em si).
- \`--gate\`: retorna exit code 2 diante de qualquer divergência detectada, ausência ou invalidez de inventário.
- \`ready_for_deploy\`: **somente critério técnico do catálogo e dos objetos de migração analisados**. Mesmo se vier \`true\` em um ambiente conciliado, não substitui autorização operacional, backup, análise dos dados privados, RLS e homologação.

## 6. Acompanhamento

- [x] Auditoria programática do diário e hashes SQL versionada.
- [x] Instrumento de coleta do registro SQL somente leitura implementado.
- [x] Testes de falha fechada e relatório CI preparados.
- [ ] Inventário autorizado do banco real.
- [ ] Conciliação \`0041\` e \`0036\` com evidência do ambiente real.
- [ ] Reconciliação aprovada de todos os 27 arquivos sem diário.
- [ ] Procedimento único de novas migrações e gate verde após a conciliação.
- [ ] Backup e homologação representativa.
- [ ] Integração e implantação em produção com autorização específica.

**Recomendação:** enquanto o inventário do Supabase não for obtido, manter o site atual sem alterações de data. Seguir com preparação e inspeção, não com DDL produtivo.
