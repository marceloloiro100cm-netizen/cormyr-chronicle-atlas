# Firestore IAM — correção comprovada do bootstrap inativo (17/11/2026)

## Evidência direta

O workflow protegido [#44144346139](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/actions/runs/44144346139) rodou após aprovação do ambiente `firebase-auth-test-activation`. Seu operador OIDC `cormyr-technical-admin@cormyr.iam.gserviceaccount.com` passou as verificações de fonte, mas falhou na fase `transactional_write` com o código sanitizado `firestore_permission_denied`. Não houve confirmação de criação dos documentos.

O Google documenta explicitamente `datastore.entities.create` para commit de criação de documentos. O papel predefinido `roles/datastore.user` também contém essa permissão, **mas concede leitura, criação, alteração e exclusão dos documentos do banco**. Para esta operação pontual é preferível acrescentar a permissão estritamente necessária em uma função personalizada, se a política do projeto permitir.

Fonte: https://docs.cloud.google.com/firestore/native/docs/security/iam
Fonte de papéis: https://docs.cloud.google.com/iam/docs/roles-permissions/firestore

## Alteração necessária por um administrador humano

Projeto: `cormyr`.
Principal: `cormyr-technical-admin@cormyr.iam.gserviceaccount.com`.

1. Acesse [IAM e Administração / Papéis](https://console.cloud.google.com/iam-admin/roles?project=cormyr) e crie ou edite uma função personalizada do projeto para acrescentar **`datastore.entities.create`**. A função precisa poder ser atribuída à conta técnica. Não conceda `Owner`, `Editor` ou `datastore.admin` por este motivo.
2. Em [IAM do projeto cormyr](https://console.cloud.google.com/iam-admin/iam?project=cormyr), localize a conta de serviço acima e atribua a função específica. Caso funções personalizadas não sejam viáveis, `Cloud Datastore User` (`roles/datastore.user`) é a alternativa funcional predefinida, reconhecendo seu escopo de escrita mais amplo.
3. Após propagação IAM, faça nova execução de `Firebase Cloud — bootstrap disabled runtime drafts`, modo `apply`, confirmação `CREATE_DISABLED_CORMYR_RUNTIME_DRAFTS`, e aprove somente o ambiente protegido do GitHub. O controlador da issue #568 já implementa a solicitação autorizada com título e nonce novo.

O usuário final não deve criar dados de Firestore manualmente. O script faz uma única transação e cria **somente se ausentes** os documentos `campaignCloudRuntime/<snapshot>` e `campaignMailRuntime/<snapshot>`, ambos `status=pending` e com permissões de gameplay desativadas.

**Não habilitar o site, missivas ou catálogo público com base nesse IAM.** Ainda são exigidos revisão pública dos dados, reconciliação da fonte atual, perfis/vínculos, confirmação da rodada e testes Cloud autenticados por Casa.

## Proteções de conteúdo público

O importador [public-content-cloud-stage.mjs](../../scripts/firebase/public-content-cloud-stage.mjs) também passou a exigir `projectId='cormyr'`, ausência de emuladores e correspondência de snapshot nos estágios de origem, além da aprovação independente do plano de revisão. Esse lote ainda não faz a importação nem libera conteúdo ao público.
