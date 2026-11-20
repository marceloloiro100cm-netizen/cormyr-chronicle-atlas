# Item 6: início do acervo operacional versionado

O acervo `campaign_records` e `record_versions` da migração permanece
imutável. Este PR acrescenta uma camada de **leitura e projeção** de
`campaignCloudRuntime/{snapshot}/records`, cujo ID de documento é
SHA-256 de `record:{id}`.

A projeção combina registros importados e operacionais, mantendo a versão
mais recente, o autor e o histórico anterior. O código valida se uma
atualização de registro importado mantém `id`, Casa, jogador, tipo e
visibilidade de origem. Qualquer inconsistência bloqueia a resposta,
sem entregar dados parciais. A filtragem é feita conforme a autorização
atual de Narrador ou jogador, com proibição de acesso a registros de
outra Casa e visibilidade restrita `gm`.

A flag `CORMYR_FIREBASE_RECORDS_ENABLED` fica **false**. Quando for
habilitada, a raiz operacional deverá ter
`recordsReadApproved=true`, `sourceSnapshotReconciled=true` e
`applicationEnabled=true`.

**Ainda pendente para completar o item 6:** criar transação de escrita
`save_campaign_record` e inserção de registros com comparação de
versão, idempotência, auditoria e testes em emulador/Cloud real.
Nenhuma gravação em produção foi habilitada por esta etapa.
