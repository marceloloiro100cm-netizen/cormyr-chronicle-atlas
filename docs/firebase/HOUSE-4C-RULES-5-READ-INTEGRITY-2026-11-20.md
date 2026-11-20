# Ficha 4c e regras da Casa 5 — segurança e prontidão operacional

Data: 20/11/2026. Ambiente: Firebase App Hosting `cormyr` / branch `main`.

## Item 4c — Ficha original

A leitura operacional da Ficha não pode presumir que um documento de
`houseEconomies` é legítimo só porque ele contém um `state`. Antes de
usar qualquer estado/versão de economia na UI original, o servidor confere:
- Casa da temporada 2 visível ao Narrador ou ao jogador autorizado;
- `sourceSnapshotId`, `sourceSheetVersion`, `sourceStateHash` e
  `sourceReconciled` com o histórico importado e imutável;
- `status=active`, `private=true`, `seedVerified=true`,
  versão e `stateHash` recalculado do conteúdo do estado;
- integridade estrutural das regras canônicas de recursos de Guerra dos Tronos.

Se existir um documento de economia para a Casa e ele não passar, a resposta
é `house_economy_unreconciled` e nenhum saldo antigo é mostrado como se
fosse o operacional. Se não existir um documento, a Ficha continua com a
prévia histórica importada, sem autorizar gravação. Não altera o visual,
os filtros ou os controles antigos.

As operações de compra, doação e demais 55 ações permanecem atrás de
`CORMYR_FIREBASE_HOUSE_OPS_ENABLED=false` e de
`houseOpsWriteApproved=true` na raiz operacional. Os dois requisitos não
são substituídos por um CI verde; 8 de 10 economias estavam conciliadas
e as outras duas tinham ficha importada em `phase=draft`. É necessário
aceite do Narrador e jogadores distintos antes de liberar dinheiro real.

## Item 5 — adaptações das regras

A leitura de regras operacionais agora recusa documentos com origem,
autoria, versão, item ou nome incompatível, antes de montar o catálogo da
Ficha. O original importado não é alterado e compras antigas conservam
seus custos. As escritas mantêm isolamento do Narrador, verificação dentro
da transação, `requestKey`, `expectedVersion` e auditoria imutável.

Uma nova auditoria em
`scripts/firebase/house-rules-cloud-acceptance.mjs`, workflow
`firebase-house-rules-readonly-acceptance.yml`, usa exclusivamente OIDC
de leitura e requisições GET. Emite apenas total de Casas, adaptações,
documentos inconsistentes e aprovações de runtime, sem nomes, IDs,
descrições ou saldos. Ela não altera contas, dados, regras ou IAM.

`CORMYR_FIREBASE_HOUSE_RULES_ENABLED=false` continua fechada até
`houseRulesWriteApproved=true` ser validado com Narrador e ao menos um
jogador não autorizado, comprovar isolamento entre Casas, conflito de
versões e ausência de alteração dos snapshots importados.

**Publicar somente via GitHub e Firebase App Hosting.**
