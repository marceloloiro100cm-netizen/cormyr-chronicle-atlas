# Cormyr — etapas 1 a 4: Narrador, Drive, reconciliação Cloud e acesso dos jogadores

Situação inicial (16/11/2026): **archive-only** ativo, sem Supabase no novo
backend e com Firebase Cloud ainda sem acesso de leitura OIDC ao Firestore.
O login legado do site **não** é Firebase Auth. Todos os portões de publicação
permanecem desligados.

## Etapa 1 — acervo privado do Narrador

A rota `GET /api/public/gm-content` não usa mais Supabase. Ela verifica
Firebase ID token real (revogação, conta habilitada), acesso server-side
`narrador` + `admin:true`, estágios Auth/Domain completos, etapa
`migrationPrivateGmStage/<snapshot>` completa e runtime Cloud ativo com
`privateGmReadApproved:true`. Os dados vêm somente de
`content/<sha256("gm:atlas")>`, campo `payload.events` e
`payload.adventures`; não são incluídos payloads administrativos adicionais.
Sem token: 401. Jogador/editor: 403. Falta de qualquer aprovação: 503.

Flag extra `CORMYR_FIREBASE_PRIVATE_GM_ENABLED=true` e a flag de leitura
existente `CORMYR_FIREBASE_CLOUD_READ_ENABLED=true` são necessárias.
Nenhuma foi habilitada neste PR. O componente `gm-panels.tsx` passou a
usar o token Firebase do piloto `/firebase-access`, compartilhado na mesma
aba, e o painel do Narrador agora oferece Eventos e Aventuras sob clique.
Ainda faltam a aprovação do estágio privado e a homologação real.

## Etapa 2 — callback agendado do Drive

A rota `POST /api/public/jobs/drive-sync` não usa mais Supabase, suas RPCs
ou os métodos SQL `runDriveSync` e `updatePublicArchive`. Ela valida um
Bearer por SHA-256 e comparação em tempo constante usando `CRON_SECRET`
(e opcional `CRON_SECRET_PREVIOUS`), corpo JSON estrito
`{"kind":"reconcile"}` de no máximo 512 bytes, origem e cookies.
Retorna apenas uma **prévia de reconciliação sem gravações** no Firestore,
vinculada a `migrationDriveSyncStage/<snapshot>` completo, formato v1
e `campaignCloudRuntime/<snapshot>` reconciliado. A flag
`CORMYR_FIREBASE_DRIVE_PREFLIGHT_ENABLED` é desligada por padrão.

Importante: o executor antigo fazia transações SQL, importação,
sincronização, atualização de imagens e arquivos. **Essas escritas NÃO
foram portadas para Firebase Cloud neste lote.** A nova rota devolve
`mode:"preflight-only"`, `realSyncEnabled:false` e contagens agregadas,
sem tocar no Drive real. Não configurar o Cloud Scheduler para presumir
que o job já está sincronizando. A porta de produção completa exige
credenciais OAuth com escopo e propriedade das pastas, ETag/If-Match e
Firestore transacional homologados, além de importar a etapa real.
A rota de preflight pode ser usada como diagnóstico, não como sincronizador.

## Etapa 3 — dados reais, IAM, Auth e arquivos

O workflow **Firebase private GM and Drive prerequisites — read-only OIDC**
inspeciona via identidade OIDC já configurada:

- existência de um único snapshot privado revisado;
- status das etapas `migrationPrivateGmStage`,
  `migrationDriveSyncStage` e `migrationPublicContentStage`;
- aprovação Cloud de leitura do Narrador;
- acesso apenas aos metadados do bucket privado migrado.

Não consulta bytes, coleções individuais, usuários, segredos,
documentos ou nomes de arquivo. Os status HTTP são registrados sem IDs.
A conta OIDC ainda enfrenta Firestore 403 pela pendência
[issue #513](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/issues/513).
O Auth retornou 400 anteriormente; esse código não comprova erro IAM.
Não se pode afirmar que imagens, contas e permissões foram reconciliadas.

Mesmo um workflow verde **nunca** implica que objetos, hashes, UIDs ou
permissões de Casas foram homologados.

## Etapa 4 — papéis reais em ambiente publicado

Novo workflow **Firebase production role matrix — read-only acceptance**.
Os testes sintéticos verificam o contrato. O job real é **manual** e só roda
na branch `main` quando estiverem disponíveis credenciais de teste
separadas e explicitamente autorizadas como GitHub Actions Secrets:

- `CORMYR_E2E_NARRATOR_TOKEN`
- `CORMYR_E2E_PLAYER_A_TOKEN`
- `CORMYR_E2E_PLAYER_B_TOKEN`
- `CORMYR_E2E_HOUSE_A` e `CORMYR_E2E_HOUSE_B`

São enviados sete POSTs **somente leitura** a
`/api/firebase-cloud-read` para conferir: anônimo negado, Narrador nas
duas Casas, cada jogador na própria Casa e negação na Casa alheia.
Somente o código HTTP entra no relatório; nunca corpo, token,
UID, nomes de Casa ou conteúdo. Não usar contas de jogadores
reais sem autorização para homologação.

O teste de papéis NÃO prova missivas, alterações, Auth recuperado,
permissões IAM, Storage, Drive nem fonte reconciliada. Por isso
`readyForPlayers=false` e `readyForCutover=false` em qualquer resultado.

## Próximos impedimentos não contornáveis por código

1. Firestore OIDC HTTP 403: revisão IAM independente e restrita (#513).
2. Auth HTTP 400 e importação/habilitação controlada das contas.
3. Reconciliação dos dados/bytes reais e versões públicas aprovadas.
4. OAuth Drive, transações de sincronização e serviço agendado real.
5. Verificação real de Narrador, jogadores isolados, Jornal, espionagem,
   missivas e calendário com contas de teste e revisão publicada no tráfego.

Sem Cloud Shell, sem força no merge, sem chaves em repositório público,
sem Supabase nessas duas rotas migradas e sem alteração de IAM, DNS,
Firestore, Storage, regras, contas ou dados de produção.
