# Cormyr — Dossiês de Espionagem
## Execução dos lotes 10, 11 e 12 · 04/11/2026

### Lote 10 — confirmação de integração e revisão de publicação
- Revalidado que o projeto Lovable reconhece o commit integrado ao GitHub e informa estado `ready` / publicado.
- Revalidado que o banco principal dispõe das estruturas dos lotes 1–9, inclusive a proteção `0106` contra descobertas revalidadas na mesma missão.
- A divulgação final de uma versão específica em produção precisa ser comprovada por confirmação de implantação; o estado genérico `is_published=true` não comprova sozinho o deploy do novo commit.
- Não alterar missões ou fichas reais para simular resultados de testes.

### Lote 11 — revogação efetiva e privacidade do histórico
**Falha descoberta:** a RPC de dossiês removia o segredo revogado da lista de descobertas, mas a matriz `history` ainda podia transportar `oldSnapshot`/`newSnapshot` de eventos antigos. Mesmo sem renderização na interface, os dados poderiam ser vistos no tráfego do navegador.

**Correção:** `0107_spy_intelligence_revoked_history_privacy.sql`.
- Jogadores recebem eventos somente se a descoberta correspondente **continua autorizada** e presente nos achados do dossiê.
- Os snapshots dos eventos não são enviados ao jogador (campos preservados como `null` e objeto vazio por compatibilidade da API).
- O narrador continua vendo todos os eventos, datas, valores e intervenções administrativas para auditoria.
- A RPC conserva a autenticação, a verificação de vínculo ativo com a Casa, os privilégios explícitos e a restrição de acesso por dono.
- Migração testada por transação reversível e aplicada ao banco ativo, com verificação da definição instalada e dos privilégios.

### Lote 12 — índices e testes de regressão
**Migração:** `0108_spy_intelligence_query_indexes.sql`.
- Índice da cronologia por dossiê para expandir o histórico sem varrer todos os eventos da campanha.
- Índice por Casa investigadora/última atualização para consultar os próprios relatórios.
- Índice parcial das missões `waiting_catalog` para facilitar a fila administrativa.
- Migração testada por transação reversível e aplicada ao banco ativo, com os três índices confirmados.
- Adicionado `src/test/espionage-dossier-privacy-release.test.ts` para impedir a reintrodução da exposição histórica e fiscalizar a proteção dos endpoints.

### Privacidade e compatibilidade
- Os valores históricos e a auditoria não foram apagados nem modificados.
- Não houve novos dossiês, missões simuladas ou alterações nas fichas de jogadores.
- O limite de descobertas, os três objetivos, as datas do HUB Temporal e a verificação por Casa seguem inalterados.
- Continuação do teste de permissão real com duas contas distintas exige sessões autenticadas de teste; não foi presumida a existência delas.

### Verificações finais a acompanhar
- [x] Migrações 0107 e 0108 aplicadas após dry-run.
- [x] Histórico revogado deixa de ser entregue ao jogador pela RPC.
- [x] Catálogo bruto de segredos segue inacessível aos jogadores.
- [x] Índices da cronologia, Casa e pendências criados.
- [ ] CI completo da PR de lotes 10–12.
- [ ] Publicação da revisão de produção confirmada para o commit exato.
- [ ] Testes reais de duas contas com Casas diferentes.
