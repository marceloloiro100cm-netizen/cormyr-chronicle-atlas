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

## Atualização em 20/11/2026

A escrita `save_campaign_record` e a criação de registros já estão
implementadas em `operational-record-write.ts`, com versão otimista,
idempotência, histórico e auditoria. O acervo migrado continua imutável.

A gravação direta agora relê o acesso efetivo (incluindo `accountAccess`)
e a situação das Casas dentro da própria transação, antes de alterar o
registro ou devolver um recibo idempotente. Revogação da edição,
desativação da conta/Casa, troca de jogador ou exigência de senha
impedem a gravação. A representação mantém sua verificação transacional
independente de sessão, Narrador e jogador.

**Pendente:** homologação em emulador/Cloud real e liberação operacional.
A flag permanece false e exige `recordsReadApproved=true` e
`recordsWriteApproved=true` no runtime. Testes com Firestore simulado
não comprovam aprovação nem funcionamento em produção.

## Incidente de abertura do Conselho — 20/11/2026

O sinalizador de build/runtime `CORMYR_FIREBASE_RECORDS_ENABLED` foi
ativado no App Hosting antes de a liberação independente dos registros
operacionais ser confirmada. Isso pode fazer uma consulta de registros
interromper a abertura de todas as Casas, mesmo com importações íntegras.

A leitura agora conserva a autorização original e distingue dois casos:

- Raiz operacional ativa, privada e reconciliada, mas
  `recordsReadApproved` pendente **e** coleções `records` e
  `recordVersions` comprovadamente vazias: devolve o acervo histórico
  autorizado, sem criar ou liberar registros operacionais.
- Há qualquer documento/versão operacional, ou a raiz não está íntegra:
  mantém a resposta bloqueada com o código seguro
  `record_runtime_not_approved`; nunca esconde um registro existente.

A aprovação de escrita continua exigindo `recordsWriteApproved` e todas
as verificações transacionais. A homologação de leitura/escrita segue
pendente; este ajuste não altera as flags nem concede novos privilégios.
