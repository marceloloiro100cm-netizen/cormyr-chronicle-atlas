# Marco B — Inteligência simulada (Lotes 6 a 9)

**Fonte funcional:** `CCA-ESP-MVP-001`, 02/11/2026, seções 8–12 e 17.
**Base:** PRs encadeados após Marco A; **status de publicação:** NÃO PUBLICADO.

## Aprovações incorporadas antes do Lote 6
- Cada posse principal `pros-spy-network` **ativa** concede **1 agente inicial**.
- Cada `pros-spy-network--expanded-network` ativa concede **2 agentes**, repetível.
- Compra avulsa definida pelo Narrador: **5 Riqueza por 2 contratados**, repetível, sem exigir a posse Rede. A alocação de Riqueza segue a analogia com a Rede Ampliada; manutenção e duração não foram fixadas.
- Cadastro de contratados avulsos depende de `operationKey` financeiro verificado. Cotação não compra nem cria agentes; Lote 10 deverá registrar dois ativos + alocação de 5 Riqueza na mesma transação idempotente.

## Lote 6 — Missões e dificuldades
- `src/lib/espionage/missions.ts`: missões informativas permitidas, tipos de alvo, lista branca de campos, checagem de disponibilidade/duplicidade e prévias sem acesso a dados adversários.
- `src/lib/espionage/difficulty.server.ts`: Lei-alvo e regra de dificuldade sob dados restritos; ausência de regra, fonte de Lei ou política de acumulação gera **pendência do Narrador**, não número fictício.
- A prévia do jogador **não retorna Lei, contramedidas, rolagens ou chance de êxito**.

## Lote 7 — Dossiês e cartas
- `src/lib/espionage/dossier.ts`: fatos materializados e autorizados; carta `sealed/released/archived`; liberação somente após retorno ou comunicação expressamente autorizada, com justificativa.
- Cobertura calculada apenas contra o escopo elegível do objetivo: campos únicos autorizados / solicitados.
- Dossiês preservam versões históricas; fatos de outras Casas ou relatórios selados são negados ao visualizador da Casa.
- `releaseSpyReport` é uma função pura de demonstração de adjudicação; o parâmetro `narratorAuthorized` **não é autenticação** e deverá ser derivado da sessão no Lote 10.

## Lote 8 — Interface do jogador
- Aba `Ficha de Casa → Exército → Espionagem → Corte`.
- Visão geral, vagas habilitadas, rascunho de missões, consulta de rota não cadastrada, relatório/dossiê futuro e estruturas.
- Compras de posses já existentes usam o `PurchaseDrawer` e a RPC da Casa; **contratação avulsa permanece desabilitada**, pois não existe ledger transacional de pares.
- Missões, relatórios e rotas são **prévia local**. Nenhuma persistência é alegada.

## Lote 9 — Interface do Narrador
- Componente montado somente sob `admin` já validado pelo servidor da Casa.
- Prévia de cadastro de rota com justificativa; carta fictícia demonstrável (selada → liberada) usando a data **publicada** do calendário.
- Ações privilegiadas reais de missão, viagem e publicação permanecem desabilitadas até RLS, RPC e auditoria do Lote 10.

## Gates de segurança e homologação
- O projeto NÃO possui ainda tabelas/RLS/RPC de espionagem, consumidor temporal `spy-movements` nem eventos persistidos. Não transformar callbacks locais em operação de jogo.
- O Narrador deverá aprovar Lei por alvo, dificuldade por tipo de informação, acumulação de contramedidas, grafo real de rotas e comunicação fora do retorno antes de habilitar automações.
- Adicionar testes de negação entre Casas, replay idempotente, transação de Riqueza, publicação temporal e exportação em ambiente de banco descartável.
- O `NO_GO` anterior do Hub Temporal e falhas preexistentes do CI geral não são removidos por testes específicos verdes.

**Critério do Marco B:** o fluxo pode ser *simulado* com dados fictícios e interfaces responsivas; publicação real está condicionada ao Marco C.
