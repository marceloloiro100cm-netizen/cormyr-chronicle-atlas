# Hub Temporal — Lote 13: homologação de contratos e ordem de integração

**Data:** 31/10/2026  
**Base:** Lote 12 / PR #138  
**Status:** testes de homologação estrutural versionados. **Não é uma homologação com dados reais de produção.**

## Escopo executado

O Lote 13 prepara o aceite técnico da cadeia temporal sem aplicar código ou migrações ao banco real e sem consumar merge no GitHub:

- \`scripts/test-temporal-homologation-contracts.sql\`: testes em PostgreSQL **descartável**, transação com \`ROLLBACK\`, cobrindo isolamento de quatro tabelas de outbox, sete RPCs administrativas inacessíveis a \`anon\`, tentativa de publicação por jogador comum, dados mínimos da data pública e persistência de gatilho/constraint de idempotência.
- \`scripts/temporal-homologation-audit.mjs\`: inventário opcional **read-only** em banco escolhido pelo operador, consultando apenas \`pg_catalog\`, \`has_*_privilege\` e \`get_public_campaign_time()\`. Nunca consulta textos, inventários, dinheiro, nomes, missivas ou dados de personagens; não usa o link de produção automaticamente.
- \`scripts/temporal-homologation-audit.test.mjs\`: rejeita ausência de RLS, grants excessivos, data pública malformada e tentativa de inspeção sem \`--read-only\`.
- \`docs/hub-temporal-pr-stack.json\`: manifesto da cadeia de PRs 127, 128, 130–138; **#129 excluída** por ser uma implementação concorrente do Lote 4. #126 é auditoria/baseline separada.
- \`scripts/temporal-stack-audit.mjs\`: valida a cadeia local e, opcionalmente, consulta a API **GET** do GitHub para identificar alterações de base, PRs fechadas sem merge, indisponibilidade ou sequência ainda não concluída. Não altera PRs, não executa deploy.
- \`scripts/temporal-stack-audit.test.mjs\`: testes sintéticos de desvio de base, duplicidade, PR concorrente, fechamento indevido, indisponibilidade e liberação indevida.
- \`.github/workflows/validate.yml\`: acrescenta os testes de SQL no banco isolado e a validação do manifesto estático. As demais verificações de migração, TypeScript, build e RLS continuam ativas.

## Sequência de integração que deve ser preservada

| Etapa | PR | Foco |
| --- | --- | --- |
| Motor Harptos | #127 | Désdias, festivais e operações temporais puras |
| Fonte única | #128 | Data oficial compartilhada |
| Comando transacional | #130 | Avanço único e auditado |
| Interfaces e sincronização | #131 | Hub do Narrador e projeção pública |
| Registro de nobres | #132 | Identidades canônicas |
| Idades por ano | #133 | Projeções anuais |
| Missivas e cronologia | #134 | Eventos sem redatação histórica |
| Posses e projetos | #135 | Transições mensais atômicas |
| Consumidores | #136 | Outbox, deduplicação e revisões |
| Auditoria e release | #137 | Preflight e segurança |
| Histórico de migrações | #138 | Bloqueio de deploy e reconciliação |
| Contratos de homologação | PR do Lote 13 | Evidência estrutural e ordem de integração |

**Importante:** todas as PRs anteriores da cadeia ainda estavam abertas na última inspeção. Os testes com banco descartável não fazem merge nem executam código na produção. A existência da PR #129 exige decisão humana de não integrá-la como duplicata do Lote 4.

## Execução de verificação

### Automática no GitHub Actions

- \`node --test scripts/*.test.mjs\`: inclui os testes de manifesto e inspeção de homologação com transações simuladas.
- \`node scripts/temporal-stack-audit.mjs --report\`: audita somente o manifesto local, sem acesso a segredos.
- \`scripts/test-temporal-homologation-contracts.sql\` no PostgreSQL 16 descartável, **depois** das migrations \`0000\`–\`0067\`, das verificações dos lotes anteriores e **antes** de qualquer implantação.
- TypeScript, Vitest e build continuam obrigatórios.

### Opcional em homologação real, com autorização de acesso somente leitura

O responsável configura \`CORMYR_AUDIT_DATABASE_URL\` **em seu próprio ambiente seguro** e executa:

\`\`\`bash
node scripts/temporal-db-inventory.mjs --read-only > inventory-homologacao.json
node scripts/temporal-migration-audit.mjs \
  --report --inventory inventory-homologacao.json > migracoes-homologacao.json
node scripts/temporal-homologation-audit.mjs \
  --read-only > contratos-homologacao.json
\`\`\`

O relatório de contratos mostra \`contract_ok\`, itens aprovados/reprovados e \`production_release_authorized: false\`. Mesmo um resultado de contratos aprovado **não** dispensa reconciliação dos 27 scripts sem journal, validação por conta comum e Narrador, backup e aceite formal.

### Opcional para verificar o estado atual da cadeia GitHub

Com uma credencial de leitura de PRs fornecida de forma segura:

\`\`\`bash
node scripts/temporal-stack-audit.mjs --report --live > pr-stack-atual.json
\`\`\`

A auditoria compara nome da branch \`head\`, nome da branch \`base\`, estado \`open/closed\`, merge e integridade da cadeia. **Não** usa PATCH/POST/PUT/DELETE nem altera as PRs. O parâmetro \`--gate\` retorna falha enquanto houver PR pendente ou divergência e **não representa autorização de implantação**, ainda que a cadeia esteja mesclada.

## Matriz de aceite

| Garantia | Banco descartável CI | Homologação real | Produção |
| --- | --- | --- | --- |
| Harptos, désdias, festivais, ano | Testes automatizados | Revalidar em clone restaurado | Verificar consulta pública apenas |
| Registro, idades e óbitos | Testes dos lotes 6–7 | Casos reais com dados aprovados | Sem envelhecimento artificial de pessoas durante smoke |
| Posses/projetos | Testes dos lotes 9–10 | Prazos e dependências representativas | Não avançar mês até liberar baseline |
| Outbox, replay e economia | Testes SQL e RLS | Duplicidade e travessias em dados de teste | Não gerar rendas/pagamentos automáticos |
| Segredos, RLS e RPCs | Teste por papel \`anon/authenticated\` | Contas reais de teste, mínimo privilégio | Smoke não destrutivo |
| Migrações e histórico | Catálogo e banco descartável | Comparação dos 27 arquivos contra logs/DDL real | **Bloqueado** enquanto houver divergência |
| Frontend/UI | Vitest, TypeScript, build | Teste visual com Narrador e jogador | Só publicar depois de RPCs compatíveis |
| Plano de rollback | Documentação Lote 11–12 | Testar restauração de backup isolado | Operador responsável e janela autorizada |

## Decisões de segurança

1. O smoke real é **somente leitura**; não invocar \`publish_campaign_time_change\`, não retroceder calendário, não simular aniversário de nobres e não testar recursos em produção.
2. Em homologação, a validação com escrita só é aceitável em uma **cópia isolada e descartável** com usuários de teste. Nunca usar o banco de campanha para reproduzir cenários.
3. O teste de \`anon\` e jogador comum no CI protege contratos conhecidos, mas **não substitui** o teste de permissão com sessões reais do provedor e política RLS efetiva do ambiente.
4. Scripts de inspeção não fornecem a lista de registros privados; as evidências operacionais são metadados e devem continuar sob acesso restrito.
5. O atual Drizzle journal tem 42 entradas e há 69 scripts SQL. Não alterar o diário ou os registros de execução automaticamente para fazer o gate passar.

## Pendências para aceite

- [x] Testes estruturais de RLS, relógio e outbox adicionados ao CI.
- [x] Contrato de verificação somente leitura sem execução de calendário publicado.
- [x] Manifesto de ordem de PRs e verificador de divergências.
- [ ] Testes e build aprovados no CI desta PR.
- [ ] Inventário real e conciliação das migrações 0036/0041/0043–0067, com logs.
- [ ] Homologação no ambiente isolado com dados representativos e contas reais de teste.
- [ ] Backup restaurável, plano de migração e janela autorizada.
- [ ] PRs revisadas e integradas em ordem, sem incluir a alternativa concorrente #129.

**Conclusão:** este lote transforma requisitos de segurança em testes executáveis, mas **não declara o Hub Temporal implantado**.
