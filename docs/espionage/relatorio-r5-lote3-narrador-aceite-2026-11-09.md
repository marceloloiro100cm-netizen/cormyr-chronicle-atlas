# Cormyr Chronicle Atlas — R5 Lote 3
## Central do Narrador, dossiês, permissões e aceite operacional

**Data:** 09/11/2026  
**Base:** R5 Lote 2 (PR #356), Lote 1 (PR #355), R4 (PR #354).  
**Escopo:** interface do Narrador, segurança de leitura, testes e relatório.  
**Não publicado em produção.**

### Objetivos e implementação

**1. Fila de ações em uma Central**
- Filtro inicial **Ações pendentes** une as operações que aguardam julgamento com as missões bem-sucedidas cujo dossiê ainda precisa de processamento.
- Ordenação: julgamento, dossiê pendente, missão em andamento, concluídas/arquivo. A ordenação é pura, com desempate determinístico; nunca muda a ordem original da lista.
- Atalhos grandes **Ações pendentes / Em andamento / Concluídas**. Busca por Casa e agente continua.
- Ação **Resolver agora** consulta o agente somente sob demanda; ficha desatualizada não libera julgamento.
- Ação **Concluir dossiê** só aparece quando o prêmio foi registrado no estado `waiting_catalog`, seguro para reprocessamento idempotente. Um sucesso sem premiação persistida aparece como **inconsistência** e exige revisão, sem repetição da rolagem.
- Ao resolver, invalida os dados da Central, dossiês e agentes da Casa; a próxima ação fica visível após a atualização.

**2. Dossiês fáceis de consultar**
- Recursos apresentam explicitamente `x/7`; Exército e Posses indicam a quantidade efetivamente descoberta, sem inventar o total do alvo.
- Data da última confirmação em destaque e aviso de atualidade derivado exclusivamente do HUB oficial.
- Abas exibem contagem por categoria, exportação segura e histórico de versões preservados.
- No celular, a tabela do Narrador vira cartões legíveis com rótulos para Casa investigadora, alvo, Recursos, Exército, Posses e ação. Campos/botões com toque de 48 px.
- Se o RPC dos dossiês falhar, **a Central de Operações continua disponível** mediante autenticação válida do Narrador; o erro não derruba todos os controles.

**3. Segurança e isolamento**
- Não se adicionou acesso administrativo a jogadores. A Central, incidentes e fila de premiação consultam exclusivamente RPCs protegidas no PostgreSQL.
- Teste SQL real com **três identidades sintéticas** em uma transação `BEGIN…ROLLBACK`: jogador A da Casa A, jogador B da Casa B e narrador. Executado e aprovado na homologação isolada.
- O jogador A visualizou apenas seu dossiê com um atributo descoberto; não recuperou auditoria. O jogador B não acessou o dossiê alheio. Ambos foram impedidos de ler ações administrativas. Narrador pôde ler dossiês, operações, incidentes e fila. Usuário anônimo foi impedido.
- Arquivo SQL se recusa a executar se houver usuários, agentes, dossiês ou calendário preexistentes; **não executar em produção**.
- O runner read-only `scripts/espionage-authenticated-acceptance.mjs` foi estendido para exigir **duas contas de jogadores reais, uma de Narrador e duas Casas distintas**, conferir o resultado positivo e recusar aceitar ambiente sem dossiê concluído.

### Verificações automatizadas

- `src/test/espionage-r5-lote3-operations-privacy.test.ts`: prioridade da fila, filtros, idempotência/reparo, contagem de descobertas, ausência de dados desconhecidos em relatórios, CSS mobile, autorização e guarda de isolamento.
- Regressões P0/P1/P2/P3/R4/R5 Lote 1 e 2, TypeScript escopado e build exigidos pelo workflow especializado.
- Suite geral do site, testes de correspondência e batalha e TypeScript global continuam como gates de CI.

### Aceite de sessão real ainda necessário

Este lote **não inventa** o resultado de um teste com pessoas reais nem uma porcentagem medida. A prova de segurança com identidades sintéticas e regras SQL não substitui login e UX em navegador com usuários efetivos.

Para validar uma sessão real, provisionar **somente homologação isolada** com três contas reais autorizadas, duas Casas e seu HUB. Executar:

1. Jogador A: criar espião, escolher Rede e retrato, iniciar missão contra B, conferir prazo/objetivo, avançar oficialmente a désdia.
2. Jogador B: entrar em conta própria e confirmar que não vê agentes, missões ou dossiês da Casa A.
3. Narrador: abrir **Ações pendentes**, resolver missão sem sair da Central, verificar XP/histórico, concluir dossiê, testar repetição segura.
4. Jogador A: receber apenas as descobertas autorizadas, abrir Recursos/Exército/Posses, copiar e imprimir sem informações internas.
5. Narrador: testar fracasso, fuga, captura e morte; verificar registro e proteção contra prêmios duplicados.
6. Executar em desktop e telefone a 320/375 px, medindo tempo, erros, cliques, leitura e taxa de tarefas concluídas sem ajuda.
7. Perder conexão durante envio e reentrar; verificar que resultados persistidos não são relatados como novas missões.

**Aceite mínimo:** nenhuma falha crítica de permissões, de integridade ou de persistência; testes gerais verdes; ao menos 90% de conclusão sem ajuda entre os participantes; oito critérios ponderados reavaliados.

### Status de liberação

- Código R5 Lote 3 concluído em branch própria, dependente das PRs #354 → #355 → #356.
- Teste transacional de segurança aprovado em homologação isolada; sem efeito em produção.
- A integração, publicação e a meta global de ≥90% ficam condicionadas aos gates acima.
