# Hub Temporal de Cormyr — Lote 15: matriz de reconciliação por arquivo SQL

**Data:** 31/10/2026 · **Base:** Lote 14, PR #140  
**Estado:** implementado como instrumento de auditoria local, sem execução de DDL, sem alteração de diário e sem contato com o Supabase de produção.

## 1. Objetivo e avanço real

A auditoria dos lotes 11–14 encontrou uma diferença séria entre o catálogo de migrations e o diário Drizzle. Este lote troca a contagem genérica por **uma folha individual de conciliação para cada arquivo sem diário**, com hash SHA-256 do conteúdo versionado, indicador textual de revisão, dois papéis de revisão independentes e referência cruzada às evidências de execução e ao estado real do schema. Os arquivos de evidência são tratados como **autodeclarações**: não são coletados nem autenticados automaticamente.

Os artefatos novos são:

- \`scripts/temporal-reconciliation-plan.mjs\`: inventário determinístico de arquivos ausentes do diário; encontra prefixos repetidos e snapshots existentes; gera template de investigação e valida evidência documental em modo seguro, **sem alterar o histórico**.
- \`scripts/temporal-reconciliation-plan.test.mjs\`: testa caso real (27 arquivos), hashes exatos, estado desconhecido, fonte/ambiente errados, evidência duplicada, revisores iguais, falta de logs e não autorização de deploy.
- \`.gitignore\`: exclui \`.temporal-audit/\` para reduzir o risco de adicionar inadvertidamente credenciais indiretas ou documentos operacionais ao GitHub.
- \`.github/workflows/validate.yml\`: imprime apenas métricas agregadas do inventário no sumário do CI, sem documentos privados.
- Este relatório contém a sequência de investigação e os limites da ferramenta.

## 2. Foto verificável do repositório

| Indicador | Valor |
| --- | ---: |
| Arquivos SQL de migração | 69 |
| Registros em \`meta/_journal.json\` | 42 |
| Arquivos SQL fora do diário | **27** |
| Snapshots \`NNNN_snapshot.json\` encontrados | **36** |
| Último snapshot nomeado | \`0040_snapshot.json\` |
| Colisão de prefixos | \`0041_campaign_translations.sql\` e \`0041_seed_complete_noble_house_possessions.sql\` |
| Lacuna de índice no diário | \`idx=36\` (o índice salta 35→37; não equivale a prova de migração executada) |

**Não** supor que um snapshot existente prova migração executada, nem que a ausência de snapshot prove que a migração não foi executada. Nomes, índices e timestamps do diário precisam ser reconciliados contra a situação do banco.

### Arquivos que exigem evidência individual

| Prioridade | Migrações fora do diário | Risco operacional a verificar |
| --- | --- | --- |
| Crítica: histórico prévio divergente | \`0036_seed_legacy_houses_state\`, \`0041_campaign_translations\` | Dados legados de Casas, traduções, colisão do 0041 |
| Alta: processos de missivas | \`0043_narrator_calendar_publishing\` até \`0057_mail_npc_signatures\` (15 arquivos) | Envios, respostas, privacidade, cronologia e gatilhos |
| Alta: conciliação da estrutura | \`0058_house_attribute_permissions_and_crests\`, \`0059_reconcile_production_schema\` | Permissões e esquema de produção |
| Crítica: motor Hub Temporal | \`0060_hub_temporal_atomic_publication\` até \`0067_temporal_release_preflight\` (8 arquivos) | Publicação atômica, registro de nobres, idades, posses, missivas, outbox e RLS |

O script devolve os **27 nomes exatos**, hashes integrais e sinais textuais para orientar a leitura de cada SQL. As flags são apenas indicadores lexicais (\`INSERT/UPDATE/ALTER\`, \`SECURITY DEFINER\`, \`GRANT/REVOKE\`, trigger, RLS etc.). **Não** são um parser SQL nem atestam idempotência, impacto ou reversibilidade.

## 3. Como preparar o dossiê de evidências

Todas as operações abaixo são locais. Devem ser executadas por responsável com acesso legítimo e em ambiente seguro.

\`\`\`bash
mkdir -p .temporal-audit

# 1. Produz relatório inicial: 27 SQL pendentes, sem sinal de execução real.
node scripts/temporal-reconciliation-plan.mjs --report \
  > .temporal-audit/diagnostico.json

# 2. Usa o SHA de commit do código a ser implantado. Não misturar
# evidências de outra revisão.
node scripts/temporal-reconciliation-plan.mjs \
  --template --sha SHA_COMPLETO_DE_40_CARACTERES \
  --environment homologation \
  > .temporal-audit/folha-de-evidencias.json

# 3. Após preencher a folha COM referências verificáveis e revisão humana:
node scripts/temporal-reconciliation-plan.mjs \
  --check --sha SHA_COMPLETO_DE_40_CARACTERES \
  --environment homologation \
  --evidence .temporal-audit/folha-de-evidencias.json \
  > .temporal-audit/resultado-da-revisao.json
\`\`\`

Cada linha da folha contém:

| Campo | Regra |
| --- | --- |
| \`tag\` / \`file_sha256\` | Precisam corresponder ao arquivo SQL atual, byte a byte conforme a codificação do arquivo |
| \`disposition\` | Apenas \`applied\` ou \`not_applied\`, depois da análise. O padrão é \`unknown\` |
| \`deployment_log_ref\` | Identificador interno verificável do histórico de execução ou da ausência comprovada |
| \`schema_comparison_ref\` | Referência da comparação do esquema e efeitos observáveis com o esperado |
| \`operator\` | Responsável pela inspeção; não registrar tokens nem credenciais |
| \`reviewer\` | Revisor independente, diferente do operador |
| \`reviewed_at\` | Data/hora ISO do exame; não aceitar data futura |
| \`source_sha\`, \`environment\` | Mesmos valores do lote inteiro, vedada mistura de commits e ambientes |

O resultado de \`--check\` indica apenas **completude documental autodeclarada** e falha com código 2 se existir pendência, duplicidade, discrepância ou colisão de prefixos. Mesmo com todas as evidências declaradas, \`ready_for_deploy\` e \`production_release_authorized\` permanecem permanentemente \`false\`. Resolver a numeração duplicada de \`0041\` ainda depende de análise e escolha técnica humana, não de renomear um arquivo arbitrariamente.

**Privacidade:** manter os JSONs sob \`.temporal-audit/\`, fora de commits e PRs. Não copiar dados de jogadores, casas, missivas, e-mails, credenciais, SQL dump ou documentos internos para a conversa ou o sumário de CI. Os campos são referências curtas para evidências em ambiente protegido.

## 4. Procedimento de reconciliação por arquivo

1. **Identidade:** anotar nome, hash, versão e o commit exato da migração; registrar a origem do banco e o ambiente.
2. **Prova de execução ou ausência:** confrontar logs de execução real, registro \`drizzle.__drizzle_migrations\`, ferramenta de migração responsável e histórico de aplicação manual. SQL não registrado pode ter sido aplicado anteriormente: não aplicar novamente por inferência.
3. **Prova de estado do schema:** verificar dependências, funções assinadas, gatilhos, políticas RLS, constraints e tipo das colunas. Atenção especial aos efeitos DML e aos recursos de jogo.
4. **Confirmação sem duplicação:** identificar se o SQL é idempotente, parcialmente aplicado ou depende de ordem já violada. Não executar \`INSERT\`, \`UPDATE\` nem \`CREATE OR REPLACE\` em produção como teste.
5. **Registro de divergências:** para estado ambíguo, manter \`unknown\`, sem inventar logs. Para \`not_applied\`, descrever futura aplicação em plano separado de homologação e implantação; a folha não executa nada.
6. **Revisão independente:** revisor distinto do responsável deve confirmar evidências e possíveis perdas de dados, plano de reversão e mecanismos de compatibilidade entre app e RPC.
7. **Aprovação:** somente após todos os arquivos conciliados, decidir junto ao mantenedor do Drizzle uma rotina única de migrations e corrigir o diário com referência ao histórico verdadeiro. Executar migração produtiva apenas em etapa futura especificamente autorizada.

## 5. Controles de aceite

- [x] Listar as 27 migrações individualmente com hashes para cada revisão.
- [x] Evidenciar a dupla numeração \`0041\` e a lacuna de índice sem aplicar correções fictícias.
- [x] Verificar completude documental, dois revisores, data e consistência de fonte/ambiente.
- [x] Reportar snapshots sem confundir metadata com estado de aplicação.
- [x] Garantir que nenhum modo do script execute SQL ou altere \`_journal.json\`.
- [x] Evitar versionamento acidental de evidências locais.
- [ ] Receber logs de banco real e evidência do estado de cada uma das 27 migrations.
- [ ] Resolver e aprovar estratégia real para diário, snapshots e pipeline de migração.
- [ ] Executar homologação em cópia isolada e restauração testada.
- [ ] Obter aprovação explícita antes de qualquer alteração produtiva.

**Decisão atual:** a cadeia do Hub Temporal continua em **NO_GO** para implantação. O Lote 15 entrega o roteiro executável de auditoria que faltava para transformar pendências genéricas em verificações individuais, sem arriscar o banco de Cormyr.
