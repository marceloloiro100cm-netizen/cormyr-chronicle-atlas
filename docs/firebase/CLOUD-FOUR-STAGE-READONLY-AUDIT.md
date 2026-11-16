# Auditoria Cloud de quatro frentes (OIDC read-only)

Este lote amplia o workflow já existente
`Firebase Cloud access readiness — read-only OIDC`. O workflow roda
automaticamente na `main` depois do merge e usa apenas a conta de serviço
GitHub de **leitura**: `cormyr-gh-reader@cormyr.iam.gserviceaccount.com`.
Não cria tokens permanentes, não requer Cloud Shell e não escreve dados.

## Evidência que será coletada

Primeiro identifica um único snapshot por consulta mascarada à coleção
`migrationDomainStage` (sem imprimir hash). Quando o snapshot é
inequívoco, consulta apenas `status` e `private` dos documentos:

1. `migrationPrivateGmStage` — conteúdo privado do Narrador;
2. `migrationDriveSyncStage` — mapeamentos e auditoria da sincronização;
3. `migrationPublicContentStage` — catálogo, traduções, galeria revisados;
4. `migrationStorageStage` — referências e metadados de arquivos.

O resultado permite observar quantos dos quatro estágios existem,
quantos estão completos e quantos respondem 403/404. Não consulta os
documentos das imagens, pastas, usuários, missivas, registros ou
transações e não expõe hashes, UIDs, e-mails, conteúdo ou credenciais.

## Bloqueios confirmados anteriormente

A issue #513 registra **HTTP 403 Firestore** e **HTTP 400 Firebase Auth**
na auditoria OIDC anterior. Não é correto tratar o 400 como erro de IAM
sem provas. Um job verde de auditoria não é aceite operacional.

Com 403, a nova auditoria **não consegue reconciliar os dados reais**.
É necessário revisar no Console IAM a concessão *somente leitura*
adequada para a conta GitHub já configurada, depois repetir o workflow.
Não atribuir Owner/Editor, não abrir dados a anônimos e não criar
service-account keys.

## Homologação real ainda exigida

- Reconciliação de bytes/checksums dos buckets de origem e destino;
- confirmação das 14 contas e de seus vínculos/estados sem ativação geral;
- versão de calendário e runtime, direitos Narrador e Casas isolados;
- cenário autenticado real com jogador A, jogador B e Narrador;
- verificação da revisão exata em tráfego no App Hosting.

**Status**: apenas evidência GET; `writes=0`,
`releaseDecision=NO_GO`, `readyForCutover=false`. Nunca confundir
`workflow success` com autorização para publicar.
