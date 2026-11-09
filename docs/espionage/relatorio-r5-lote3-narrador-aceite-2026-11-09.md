# Cormyr Chronicle Atlas — R5 Lote 3 · Narrador, dossiês e aceite final

**Data:** 09/11/2026 · **Base:** R5 Lote 2 (#356) → Lote 1 (#355) → R4 (#354).  
**Produção:** inalterada (P3), sem novos usuários, missões ou calendários alterados pela implementação.

## 1. Melhorias implementadas

### A. Central de Operações — uma só fila de ação
- O filtro inicial **Ações pendentes** reúne *aguardando julgamento* e *sucesso homologado com descobertas pendentes*, em vez de abrir apenas as missões a julgar.
- A fila prioriza o julgamento e depois os dossiês pendentes; em cada grupo ordena por registro recente, de modo determinístico.
- Mantém filtros independentes para **Em andamento**, **Concluídas** e **Todas**.
- Um único botão **Resolver agora** abre a ficha correspondente dentro da Central. O formulário passa a aparecer **antes** da listagem, com foco e rolagem para o ponto correto.
- **Concluir dossiê** continua usando o reprocessamento idempotente já implementado, sem creditar prêmio ou experiência novamente.
- Quando não há pendências, há um estado vazio claro, sem exigir busca por telas adicionais.
- A confirmação de resolução distingue missão salva, dossiê completo e pendência de fonte oficial.

### B. Dossiês e consultas
- Uma falha isolada da RPC de dossiês não oculta mais a Central de Operações nem o arquivo de incidentes do Narrador.
- A listagem de dossiês do Narrador mostra a **data da última confirmação** e sua classificação de atualidade.
- No celular, a tabela se torna uma coleção vertical de itens com rótulos, botão de ação grande e sem rolagem horizontal.
- Leitura de dossiê por jogador passa a recusar, adicionalmente, qualquer resposta que contenha auditoria administrativa ou snapshots antigos/ocultos. O banco já deve filtrar esses campos: a validação do cliente funciona como defesa extra contra regressões de contrato.
- Os atributos não descobertos continuam apresentados como *Desconhecido*. O histórico completo e motivos administrativos permanecem no ambiente do Narrador, protegidos por RPC.

### C. Acessibilidade e confiabilidade
- Alvos de toque de 48 px, foco visível, ações legíveis e formulário de julgamento ao alcance após selecionar a missão.
- Mecanismo de atualização da fila já existente (30 segundos enquanto visível) e invalidação após resolver e reprocessar.
- Nenhuma alteração em Lei, Astúcia, XP, dificuldade, avanço do HUB ou saldo das Casas.

## 2. Testes de segurança e aceitação

**Prova SQL isolada executada e aprovada:** `scripts/espionage-r5-lot3-rls-rollback-acceptance.sql`.

- Ambiente de homologação foi checado como vazio antes de inserir temporariamente três identidades **sintéticas** (2 jogadores, 1 Narrador), duas Casas e permissões.
- O jogador A acessou apenas a Casa A; o jogador B acessou apenas a Casa B.
- Ambos foram recusados nas RPCs de agentes e dossiês adversários, Central do Narrador, arquivo de incidentes e premiações pendentes.
- O Narrador acessou a Central, os incidentes, os dossiês do reino e a fila administrativa.
- Todo o ensaio está dentro de `BEGIN ... ROLLBACK`, com guarda para recusar ambiente contendo usuários, agentes, calendário ou jogadores. Nenhuma identidade de laboratório permanece persistida.
- Leituras anônimas das cinco RPCs também foram negadas diretamente na homologação.
- O Lote 1 já validou criação → viagem → investigação → julgamento → informações de Recursos/Exército/Posses, promoção, fracasso, fuga, captura e morte, com rollback.
- Os testes Vitest adicionais checam prioridade de fila, filtros, resiliência da Central, UX mobile e proibição de auditoria/snapshots na resposta do jogador.

**Aceite com contas reais:** o arquivo `scripts/espionage-authenticated-acceptance.mjs` foi expandido para usar contas **autênticas distintas** de jogador A, jogador B e Narrador, com host explicitamente autorizado, sem service role e sem qualquer escrita.

O teste autenticado ainda **não foi executado** porque o ambiente isolado consultado não dispõe de usuários, calendário e Casas de teste persistentes. Não se cria nem altera conta de jogadores reais para suprir essa lacuna.

## 3. Roteiro de partida (aceite pendente com sessão real)

1. O jogador A recruta um espião, escolhe Rede/retrato e confirma eventual custo de melhoria.
2. O jogador A seleciona agente, Casa B e **Recursos**, envia a missão e verifica o comprovante.
3. O Narrador publica uma ou mais désdias no HUB isolado; o agente passa de Viagem a Investigação e Aguardando julgamento.
4. Na Central do Narrador, tocar **Resolver agora**; homologar sucesso, ver experiência, dossiê e atualização da fila.
5. Em caso de fonte pendente, tocar **Concluir dossiê**; repetir a operação e confirmar que não surgem prêmios/segredos duplicados.
6. Jogador A vê apenas os atributos conquistados no dossiê. Jogador B não consegue ler agente, rota, dossiê ou histórico da Casa A.
7. Repetir cenários de fracasso, fuga, captura e morte; conferir eventos e histórico.
8. Simular desconexão e retorno, concorrência entre duas Casas e acesso revogado.
9. Executar em desktop/Android e telas de 320–375 px com teste de tarefas sem auxílio. Medir cliques, tempo, taxa de sucesso e erros.

## 4. Critérios de aceite antes de publicar

- **P0:** zero vazamento de segredos, zero adjudicação por jogador e zero duplicação de decisões, XP ou prêmios.
- **P0:** cenário real completo com contas de jogador e Narrador, e mudança real de calendário em homologação.
- **P1:** nenhuma falha grave de navegação, tela legível em celular e resultado encontrável sem explicação técnica.
- **P1:** CI específico de espionagem, regressão geral, TypeScript e build verdes.
- **Usabilidade:** pelo menos 90% de conclusão sem ajuda nas tarefas essenciais e os oito critérios reavaliados com evidência suficiente. Não atribuir 92% apenas com testes unitários.

## 5. Publicação e segurança

A ordem de integração é **R4 #354 → R5 Lote 1 #355 → Lote 2 #356 → Lote 3 (PR atual)**. A inclusão de uma PR empilhada não publica as anteriores nem aciona deploy.

Esta branch **não contém migrações de banco** e não realizou nenhuma ação de mutação persistente em produção. A avaliação de 92% é uma **meta projetada**, não uma medição concluída.

O ensaio SQL com identidades sintéticas comprova as verificações de autorização do banco, mas não substitui autenticação real nem homologação visual.
