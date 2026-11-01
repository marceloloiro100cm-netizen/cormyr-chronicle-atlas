# Hub Temporal de Cormyr — Lote 19: homologação agregada de cópias restauradas

**Data:** 31/10/2026  
**Base:** Lote 18, PR #144  
**Status:** código, consultas e testes de auditoria disponíveis na branch do lote. Não houve acesso ao backup real ou à produção.

## Objetivo

Preparar uma verificação mínima de integridade para comparar **duas cópias restauradas e autorizadas** antes e depois de uma operação de homologação. O procedimento preserva a privacidade: não lê nomes, IDs de jogador, e-mails, conteúdo de cartas, fichas nem recursos por Casa.

A auditoria fornece indicadores agregados e a **projeção pública** da data, não uma prova de igualdade linha a linha. A integridade completa dos dados e a procedência dos backups devem ser validadas fora da ferramenta, por operadores autorizados.

## Implementação

### Auditoria agregada read-only

O novo script scripts/temporal-restored-baseline.mjs consulta, exclusivamente em transação **REPEATABLE READ READ ONLY**:

| Domínio | Métrica |
| --- | --- |
| Casas nobres | Quantidade de registros de campaign_houses |
| Fichas nobres | Quantidade de noble_house_sheets |
| Jogadores vinculados a Casas | Somente contagem de house_memberships |
| Nobres e outros personagens | Quantidade de campaign_characters |
| Missivas | Quantidade de campaign_letters |
| Respostas às missivas | Quantidade de letter_replies |
| Operações das Casas | Quantidade de noble_house_ledger |
| Publicações do calendário | Quantidade de campaign_time_operations |
| Consumidores de eventos temporais | Quantidade de campaign_temporal_deliveries |
| Unidades militares | Soma dos comprimentos dos arrays state.units em noble_house_sheets |
| Construções e posses | Soma dos comprimentos dos arrays state.holdings |
| Relógio público | Apenas year, month, day, festival e version do RPC público |

**Atenção:** unidades militares e posses são estruturas internas da ficha JSON da Casa; por isso não são tratadas como tabelas SQL independentes. Contagens não garantem que bônus, atributos ou conteúdo de cada unidade esteja idêntico. Validações funcionais completas continuam necessárias.

O script não chama RPCs administrativas, não publica datas, não lê campos privados diretamente e não escreve no banco.

### Controle de acesso por ambiente

O modo conectado exige todas as opções e variáveis:

- Comando: node scripts/temporal-restored-baseline.mjs --snapshot --read-only --restored-copy
- CORMYR_RESTORED_DATABASE_URL: conexão explícita ao banco de cópia.
- CORMYR_APPROVED_RESTORED_HOST: hostname exato autorizado.
- CORMYR_APPROVED_RESTORED_DB: nome exato de banco isolado com sufixo de cópia/restauração.
- CORMYR_AUDIT_SOURCE_SHA: SHA completo do código examinado.

A URL deve corresponder **exatamente** aos identificadores autorizados e não pode receber parâmetros ocultos. Isso reduz o risco de apontar inadvertidamente para produção, mas **não comprova** que um banco chamado "restore" realmente foi isolado: o operador deve verificar a infraestrutura, a permissão read-only e a origem dos dados antes de qualquer conexão. Não colocar URL/credenciais em logs, commits ou mensagens.

Nenhum ambiente real é acessado automaticamente no GitHub Actions.

### Exemplo de comparação local

Após validação formal do isolamento, o operador coleta dois JSONs em ambientes restaurados, com o mesmo SHA do código e os mesmos campos. Os arquivos devem ficar em uma pasta privada e ignorada pelo Git:

~~~bash
mkdir -p .temporal-audit
# Em cada cópia autorizada, configurar variáveis por mecanismo seguro.
node scripts/temporal-restored-baseline.mjs \
  --snapshot --read-only --restored-copy \
  > .temporal-audit/baseline.json

# Repetir na cópia de homologação correspondente, sem tocar em produção.
node scripts/temporal-restored-baseline.mjs \
  --snapshot --read-only --restored-copy \
  > .temporal-audit/candidate.json

node scripts/temporal-restored-baseline.mjs \
  --compare .temporal-audit/baseline.json .temporal-audit/candidate.json \
  > .temporal-audit/comparison.json
~~~

O comparador falha (código 2) se houver diferença em quaisquer contagens, data pública, SHA ou formato. **Ele não divulga os totais divergentes**: informa apenas as categorias e se a verificação passou. Os snapshots locais contêm totais numéricos e devem permanecer em armazenamento restrito.

Mesmo um resultado positivo permanece explícito:

- production_backup_restored: false
- migrations_reconciled: false
- production_release_authorized: false
- source_database_verified: false

São documentos de auditoria, não certificados de origem, autorização de corte ou testes de dados reais.

## Compatibilidade verificada no CI

O arquivo scripts/test-temporal-restored-metrics.sql executa as mesmas contagens e RPC público em transação somente leitura. O Lote 19 o adiciona **ao ensaio do Lote 18**, diretamente na cópia efêmera recuperada por pg_dump/pg_restore em PostgreSQL 16. A execução falha se uma tabela ou coluna do contrato não existir. Nenhum conteúdo dessa consulta é publicado no sumário; stdout/stderr ficam somente no runner temporário.

O teste Node scripts/temporal-restored-baseline.test.mjs simula falhas e comprova: tabelas explícitas, SQL apenas de agregação, bloqueio de hostname ou nome de banco inesperados, campos extras no relógio, diferenças em unidades/posses, formatos de snapshot inválidos, SHA divergente e proibição de operações de escrita.

O manifesto de dependências passa a incluir a PR #144, preservando a exclusão da variante concorrente #129.

## Pendências de implantação

1. **Conciliação Drizzle:** continuam 69 scripts SQL versus 42 registros no diário, com 27 scripts não registrados e prefixo 0041 duplicado.
2. **Prova da origem:** inventário read-only do Supabase real e cadeia de custódia dos backups autorizados, conduzida por responsável com acesso ao ambiente.
3. **Restauração real em isolamento:** restauração comprovada com extensões, roles, dependências, dados e configuração de segurança compatíveis.
4. **Verificação funcional:** personagens envelhecem por data canônica; missivas mantêm data histórica; déšdias, meses, estações, compras de construções e bônus militares não se duplicam.
5. **Aprovação:** revisão independente, backup restaurável e autorização para janela de corte.

**Resultado esperado deste lote:** um instrumento de comparação read-only utilizável em homologação autorizada, já ensaiado estruturalmente contra o PostgreSQL efêmero. **Não significa que houve homologação real nem que a produção está liberada.**
