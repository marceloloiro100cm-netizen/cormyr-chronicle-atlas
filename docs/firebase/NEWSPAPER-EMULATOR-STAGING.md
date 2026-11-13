# Firebase — A Folha Sem Selo (modelo de leitura em emulador)

## Objetivo e limites

Este lote prepara a conversão dos dados do jornal para um
**Firestore Emulator isolado**, mantendo a origem funcionando.
Não substitui os RPCs de edição, publicação, agendamento, encomendas,
notificações nem as regras de Storage do jornal.

A migração utiliza as tabelas oficiais das migrations 0111, 0117,
0118, 0119, 0120, 0121, 0122 e 0123 do repositório.
O arquivador preserva as linhas originais destas **oito tabelas**:
`campaign_newspapers`, `campaign_newspaper_revisions`,
`campaign_newspaper_reads`, `campaign_newspaper_commissions`,
`campaign_newspaper_staff`, `campaign_newspaper_story_models`,
`campaign_newspaper_engravings` e `campaign_newspaper_settings`.

O arquivo `archive` inclui as colunas e os valores como
PostgreSQL COPY text/null (SHA-256, fragmentação para registros grandes),
sem omitir textos ou registros.

## Visões tipadas

Sob `migrationNewspaperStage/<hash-do-backup>/`:

- `published`: edições em estado `published` ou `archived`;
  consulta somente por narrador, editor e jogador ativo autorizado;
- `privateEditions`: rascunhos e edições canceladas; consulta
  **somente por narrador ou editor ativo**;
- `settings/current`: configuração geral da redação, leitura
  somente pelo narrador ou editor;
- `archive`: todos os documentos das oito tabelas originais,
  **deny-all inclusive para narrador/editor no SDK cliente**.

Todas as coleções são **somente leitura** para clientes, inclusive o
narrador. Em particular, o editor não ganha privilégios sobre missivas,
calendário privado, Casas ou acesso de outros jogadores.

O importador valida título, número de edição, versão, estado, dados
JSON de blocos, tamanhos conservadores, caminhos PDF e datas Harptos.
Os estilos `gotica` e `romana` seguem a migration 0123.
O campo `publish_on` usa datas de Harptos e é privado quando a
edição é rascunho. Edições não são publicadas automaticamente.

Os documentos tipados têm tamanho máximo conservador. Caso uma edição
seja grande demais para um documento, o plano tipado é bloqueado,
mas o arquivo privado ainda é capaz de preservar o registro por
fragmentação. Nenhum conteúdo de rascunho ou assinatura é impresso
no relatório de contagens.

## Testes

O CI executa testes de transformação e regras reais com Firestore
Emulator para narrador, editor, dois jogadores, conta inativa, conta
sem perfil e usuário anônimo. Confere também negação de escrita,
isolamento de rascunhos, arquivo privado e revogação imediata de
permissões. Não utiliza Firebase Cloud nem segredos.

## Auditoria no backup existente

Depois que o PR estiver integrado à `main`, sem reexportar:

```bash
ROOT="$HOME/cormyr-chronicle-atlas"
git -C "$ROOT" fetch origin main
WORK="/tmp/cormyr-newspaper-$(date +%s)-$$"
git -C "$ROOT" worktree add --detach "$WORK" FETCH_HEAD

NORMALIZED="$ROOT/.firebase-migration/inspecao-12nov-E4pokAhB/normalized"
node "$WORK/scripts/firebase/stage-newspaper-emulator.mjs" \
  --normalized "$NORMALIZED"
```

Apenas se `planValid:true`, a carga local pode ser feita com:

```bash
cd "$WORK"
npm install --no-save --package-lock=false firebase-tools@15.35.0 firebase-admin@14.5.1
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
npx firebase emulators:exec --only firestore \
  --project demo-cormyr-migration \
  --config firebase/firebase-domain.json \
  "node scripts/firebase/stage-newspaper-emulator.mjs --normalized '$NORMALIZED' --execute-emulator"
```

Não exporte o backup privado para CI, GitHub ou URLs públicas.
`readyForCloudImport:false` e `firebaseCloudWrites:0` são
propositais. A migração só poderá ir para a nuvem depois da
reconciliação da fonte ativa, autorização e testes de interação.

## Pendências

- Reimplementar operações de edição/publicação/arquivamento,
  encomendas e controle de revisões com funções transacionais.
- Migrar arquivos dos três buckets de jornal e suas permissões
  (PDF, fotografias da equipe, gravuras).
- Reconciliar confirmações de leitura, autores, horários de publicação,
  fotos, modelos e arquivos privados, sem conceder acesso aos jogadores.
- Rodar testes de integração da interface e da API de jornal em um
  backend de homologação separado.
