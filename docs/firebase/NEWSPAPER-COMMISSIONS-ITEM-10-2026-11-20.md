# Item 10, notícias contratadas no Jornal Firebase

Contratar uma matéria custa 1 Riqueza permanente na Casa ativa, usando o motor econômico canônico e a ficha operacional já conciliada. A mesma transação guarda o débito, a encomenda, o livro-caixa, a chave de idempotência e a auditoria. Não modifica a origem importada.

A Redação aceita apenas blocos com comissão UUID existente, paga, pendente e vinculada ao banco privado. Uma edição pode publicar várias encomendas; cada uma é liquidada na mesma transação da publicação. Uma encomenda publicada em outra edição não pode ser reutilizada. Uma matéria publicada não pode perder seu vínculo silenciosamente.

A recusa editorial exige justificativa e devolve 1 Riqueza, com lançamento econômico independente e idempotente. A Casa pode marcar respostas de encomendas como lidas. O Narrador e o Editor-Chefe veem o conjunto de pedidos; cada jogador vê somente os das Casas de que é membro. O Editor-Chefe não recebe ficha ou saldo para si.

O módulo usa `CORMYR_FIREBASE_NEWSPAPER_COMMISSIONS_ENABLED=false` até homologação. Mesmo após alterar a flag, a raiz do Firestore deve ter `newspaperCommissionsReadApproved` e `newspaperCommissionsWriteApproved` verdadeiros e a economia operacional e o Jornal precisam estar aprovados. Imagens enviadas por Casas exigem o Storage do item 11 e não são descartadas sem aviso.

Testes cobrem débito, reembolso, duplicidade, edição e liquidação. Publicação exclusivamente no GitHub e Firebase App Hosting.

## Continuação de 20/11/2026

A leitura das encomendas já pagas passa a depender da aprovação de
consulta e da origem conciliada, sem exigir que a escrita editorial continue
habilitada. Suspender novas encomendas não oculta o histórico pago nem
permite débitos adicionais. O cadastro e o reembolso seguem exigindo
`newspaperWriteApproved` e `newspaperCommissionsWriteApproved`.

A interface Firebase não envia imagens ao bucket legado Supabase e não
promete publicação automática: o Editor-Chefe pode aceitar, publicar ou recusar.
O fluxo textual permanece preparado, mas a flag de contratação continua
desativada até homologação real de economia, permissões e publicação.
As imagens contratadas ficam bloqueadas até a vinculação aprovada do Storage
privado e da Redação, sem cobrança parcial por upload.
