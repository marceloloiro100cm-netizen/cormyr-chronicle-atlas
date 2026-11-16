# Conteúdo privado do Narrador — leitura Firebase Cloud

A rota existente `GET /api/public/gm-content` agora executa **somente
Firebase Admin Auth/Firestore**. O caminho histórico permanece, mas
**não é uma rota pública**: exige Firebase ID token verificado com revogação,
usuário ativo e escopo de Narrador no Firestore. Não usa RPC
`is_campaign_admin`, Supabase RLS, chave pública nem fallback de origem.

## Requisitos de liberação (ainda não satisfeitos)

O serviço responde HTTP 503 por padrão até configurar no App Hosting:
`CORMYR_FIREBASE_PRIVATE_GM_ENABLED=true` e
`CORMYR_FIREBASE_SNAPSHOT_ID` (SHA-256 da origem reconciliada).

Em Cloud, são exigidos:

- `migrationDomainStage/<snapshot>` e `migrationAuthStage/<snapshot>`
  completos/privados; acesso `access/<uid>` com `active=true`,
  `profile=narrador`, `admin=true`,
  `requirePasswordChange=false`, `userId=<uid>`.
- `campaignCloudRuntime/<snapshot>` ativo, privado,
  `sourceSnapshotId=<snapshot>`, `sourceSnapshotReconciled=true`,
  `applicationEnabled=true`, `privateGmContentApproved=true`,
  `gmContentVersion` inteiro positivo idêntico a
  `publishedGmContentVersion`.
- `migrationPrivateGmStage/<snapshot>` completo, privado,
  `formatVersion=1`, `counts.content>=1`.
- Documento `content/<sha256("gm:atlas")>` com `id=atlas` e
  `payload.events[]` e `payload.adventures[]`.

A importação real deste conteúdo ainda precisa ser auditada. O lote
**não importa** eventos, aventuras, planilhas privadas, sessões de
representação ou logs e não altera coleções nem contas. O conteúdo em
emulador não comprova disponibilidade Cloud.

O carregador legível em `public/cormyr/gm-loader.js` deixa de enviar
automaticamente tokens da antiga sessão Supabase. Somente uma integração
futura de Firebase Auth pode fornecer ao navegador a função
`window.CORMYR_FIREBASE_ID_TOKEN_PROVIDER`, que deverá retornar um
token atual da conta autenticada. Sem esta função, a página inicia sem
carregar os segredos do Narrador — **falha fechada**. É obrigatório
homologar o fluxo de Narrador antes de declarar o módulo migrado.

Nenhum usuário anônimo, Editor ou jogador de Casa pode receber conteúdo
GM. Erros sem informações privadas, `Vary: Authorization` e
`Cache-Control: private, no-store`. O servidor entrega só `events`
e `adventures`, jamais a estrutura inteira importada.

**Status operacional:** código preparado, dados/importação e
revisão real pendentes; `readyForPlayers=false` e
`readyForCutover=false`. Ver issue #513.
