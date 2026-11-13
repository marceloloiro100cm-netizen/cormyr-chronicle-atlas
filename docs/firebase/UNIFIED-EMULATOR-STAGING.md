# Cormyr — migração integrada de Auth + Firestore no emulador

## O que este lote conclui

Em vez de repetir manualmente cinco procedimentos, o comando
`scripts/firebase/stage-all-emulators.mjs` lê **uma vez** o backup
privado normalizado (com verificação de integridade SHA) e realiza
a conferência conjunta das conversões já implementadas:

1. Arquivo privado bruto do PostgreSQL: tabelas públicas preservadas
   com SHA por linha e fragmentação para documentos grandes.
2. Casas, jogadores, perfis/acessos e missivas endereçadas, mantendo
   em quarentena as cartas sem destinatário inequívoco.
3. Calendário Harptos e histórico operacional privado.
4. Jornal A Folha Sem Selo: publicados e rascunhos isolados,
   com oito tabelas preservadas integralmente.
5. Firebase Auth Emulator: UIDs originais, BCRYPT, Google OAuth conhecido
   e provedor customizado diferido, sem criar claims nem privilégios.

Todos os planos são calculados **antes de qualquer gravação**. A carga
é bloqueada se qualquer etapa estiver inválida, se faltarem tabelas
ou se o destino já contiver o snapshot/Auth. Os arquivos do emulador
podem conter conteúdo privado; nunca os enviar ao GitHub ou expor na web.

## Estado seguro e limites

- Ambiente fixo: `demo-cormyr-migration`.
- Emuladores obrigatórios, ambos em loopback:
  `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` e
  `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`.
- `firebase/firebase-all.json` ativa apenas Auth + Firestore locais,
  com regras específicas de migração, não as regras de produção.
- Checa se Auth está vazio **antes** de gravar qualquer coleção.
  Se falhar depois de começar, a carga local deve ser descartada;
  não tentar reaplicar sobre dados parcialmente importados.
- `migrationUnifiedStage/<hash>` só recebe `status:complete`
  depois das cinco etapas concluídas.
- Nenhuma senha em texto claro, identificação individual ou conteúdo
  de missiva é exibido nas saídas agregadas.
- `readyForEmulatorStage:true` não implica `readyForCutover:true`.
  Firestore Cloud, Auth Cloud, regras Cloud, App Hosting e domínio
  continuam **sem publicação**.

## Um comando de diagnóstico no Cloud Shell

Use o backup já exportado e validado, sem repetir o download:

```bash
set -euo pipefail
ROOT="$HOME/cormyr-chronicle-atlas"
git -C "$ROOT" fetch origin main
WORK="/tmp/cormyr-unified-$(date +%s)-$$"
git -C "$ROOT" worktree add --detach "$WORK" FETCH_HEAD
NORMALIZED="$ROOT/.firebase-migration/inspecao-12nov-E4pokAhB/normalized"

node "$WORK/scripts/firebase/stage-all-emulators.mjs" \
  --normalized "$NORMALIZED"
```

A saída informa os motivos de bloqueio por etapa, apenas em contagens.
Não execute a importação se `readyForEmulatorStage` for `false`.

## Importação em dois emuladores — somente se a auditoria passou

```bash
set -euo pipefail
umask 077
cd "$WORK"
npm install --no-save --package-lock=false \
  firebase-tools@15.35.0 firebase-admin@14.5.1

export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
OUT="$ROOT/.firebase-migration/unified-emulators-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$OUT"
rmdir "$OUT"

npx firebase emulators:exec --only firestore,auth \
  --project demo-cormyr-migration \
  --config firebase/firebase-all.json \
  --export-on-exit "$OUT" \
  "node scripts/firebase/stage-all-emulators.mjs --normalized '$NORMALIZED' --execute-emulator"
```

O `--export-on-exit` preserva a sessão de emulador privada para
verificação posterior. Ela pode conter UIDs, e-mails e hashes BCRYPT:
**não compartilhar nem publicar**, e restringir acesso ao diretório.

## O que ainda falta para o Firebase substituir a origem

- Reconciliar as alterações na origem ocorridas desde o backup,
  antes do corte; nenhum snapshot histórico garante atualidade.
- Reimplementar o backend transacional do Hub Temporal, correspondências,
  jornal, espionagem, combate e demais módulos; migrar todas as
  propriedades, unidades, construções, fichas, eventos e regras.
- Migrar os buckets e links, com controle de acesso de arquivos.
- Validar sign-in real (Google/SSO), conta sem senha, contas especiais e
  ausência de perfis para dois usuários; testar autorização por Casa.
- Provisionar e proteger uma instância Cloud de homologação com planos
  de backup, reconciliação, roll-forward e rollback; somente então
  testar a UI em um site de testes. Publicação ainda suspensa.
