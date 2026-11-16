# Firebase Cloud — matriz automática de prontidão e decisão NO-GO

A auditoria `.github/workflows/firebase-cloud-access-readiness.yml` usa o principal OIDC já existente para fazer **somente GET** no projeto `cormyr`. O objetivo é identificar bloqueios sem exigir Cloud Shell nem alterar IAM, Firebase Auth, Firestore, regras, snapshots ou flags.

## Nova evidência: runtime operacional das Casas

Além da verificação das seis etapas históricas, Auth e runtime das missivas, consulta o documento `campaignCloudRuntime/<snapshot>` **somente quando existe um único snapshot válido**. A URL é fixa e exige os seguintes campos mascarados pela REST API do Firestore:

- `status` e `private`;
- `sourceSnapshotId` e `sourceSnapshotReconciled`;
- `applicationEnabled` e `calendarVersion`.

Nunca consulta `houseEconomies`, saldos, UIDs, tokens, eventos de compra, detalhes de carta, segredos ou dados do jogador. A inspeção informa apenas `operationalRuntimeHttpStatus` e `operationalRuntimeReconciled`. O segundo campo só pode ser verdadeiro se todas as condições anteriores forem válidas e apontarem para o único snapshot autorizado. Não é autorização de escrita nem ativação operacional.

## Resultado de decisão

O relatório agora inclui:

- `releaseDecision: 'NO_GO'`: constante; **não existe saída automática GO**;
- `blockingCodes`: apenas códigos fixos, validados nos testes, como `FIRESTORE_OIDC_DENIED`, `SNAPSHOT_UNVERIFIED`, `MIGRATION_STAGES_UNVERIFIED`, `MAIL_RUNTIME_UNVERIFIED`, `OPERATIONAL_RUNTIME_UNVERIFIED`, `AUTH_LIST_UNAVAILABLE`, `AUTH_LIST_INCOMPLETE` e `CLOUD_ROLE_E2E_PENDING`;
- `writes:0`, `cloudRoleE2EVerified:false` e `readyForCutover:false`, mantidos em todos os cenários.

Mesmo se todas as seis etapas, Auth e ambos os runtimes estiverem acessíveis em fixtures, `CLOUD_ROLE_E2E_PENDING` persiste até verificações *reais* de Narrador, Jogador da Casa A e Jogador da Casa B, autenticação/segregação e reconciliação das Casas.

## Resumo fácil de conferir pelo celular

O próprio script acrescenta a `GITHUB_STEP_SUMMARY` uma tabela contendo status HTTP do Firestore, etapas históricas, runtime de missivas, runtime das Casas, Auth e decisão **NÃO AUTORIZADO**. O sumário é montado com funções de formatação que aceitam somente números HTTP, booleanos e códigos de bloqueio fixos. Dados brutos, mensagens de erro do Google, IDs, hashes, credenciais, nomes de documentos e identificadores de usuários não são copiados.

**Workflow verde significa que a auditoria foi executada, não que o projeto foi liberado.** Nunca usar apenas o estado `success` do GitHub Actions para aprovar cutover.

## Bloqueios reais atuais

Na execução OIDC de 16/11/2026 ([run #43941357492](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/actions/runs/43941357492)), a leitura Firestore retornou 403, o Auth retornou 400 pelos dois identificadores fixos de projeto e a configuração do Auth retornou 403. Por isso o runtime operacional não pôde ser inspecionado; sua situação **não está confirmada**.

O acompanhamento está na [issue #513](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/issues/513). Conceder acesso de leitura no IAM, caso seja decidido pelo operador, exige observar que a role Datastore Viewer enxerga coleções privadas. Nenhum privilégio ou acesso adicional é concedido por este PR.

## Testes

`node --test scripts/firebase/cloud-access-readiness.test.mjs` cobre as seis etapas, Auth e suas respostas HTTP, o runtime operacional íntegro, dados históricos divergentes, erro 403 isolado no runtime, ausência de aprovação mesmo com todas as etapas sintéticas verdes, whitelist de motivos e privacidade do GitHub Actions Summary. Tudo roda com respostas simuladas no PR.
