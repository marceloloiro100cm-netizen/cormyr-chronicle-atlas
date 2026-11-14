# Jornal (A Folha Sem Selo) no emulador Firebase

Fatia do jornal da migração Supabase para Firebase. Só o Firestore Emulator (`demo-cormyr-migration`); nada de produção, nada de Supabase. O estágio somente leitura anterior (`migrationNewspaperStage`) continua existindo; este é o estágio de **runtime**, que o serviço lê e escreve.

## Arquivos
- `scripts/firebase/newspaper-core.mjs`: regras puras (porte de 0111 e 0117 a 0123).
- `scripts/firebase/stage-newspaper-runtime-emulator.mjs`: importa as 8 tabelas do backup normalizado (`migrationNewspaperRuntimeStage/<snapshot>`: editions, revisions, reads, commissions, staff, models, engravings, settings, meta).
- `scripts/firebase/newspaper-service.mjs`: serviço transacional (Admin SDK, `verifyIdToken`).
- Testes: `newspaper-core.test.mjs`, `stage-newspaper-runtime-emulator.test.mjs`, `newspaper-service.integration.mjs` (CI com emulador).
- Regras: bloco deny-all em `firebase/firestore.domain.rules`. Workflow: `firebase-newspaper.yml`.

## Autorização (resolvida no servidor, a partir dos docs de acesso)
- Editor: Narrador (admin) OU jogador ativo, sem troca de senha pendente, chamado `leonardo` (sem acento/caixa/espaços) com casa de roster `espiao`.
- Leitor: qualquer jogador ativo. Leitores só veem edições `published`/`archived`; rascunhos e canceladas são do editor.
- Casas: contratar notícia exige editar a casa (ou Narrador); marcar respostas como vistas exige ser membro.

## Regras portadas
- Edição: insert força rascunho, versão 1, revisão 0; menor número de edição livre; update imutável na identidade, `version`+1, `publication_revision`+1 quando algo visível muda ou ao entrar em published/archived (e archived para published); `published_at`/`archived_at`/`cancelled_at` ao entrar no estado; arquivar só quem já foi publicado. Cada update grava o estado anterior em `revisions` (snapshot em snake_case, como o app lê).
- Recibos de leitura: `read_version` = `publication_revision`, só edições publicadas.
- Publicação agendada (`publishDue`): o relógio do Reino (`migrationTimeEngineStage/calendar/current`) decide; só rascunhos com `publish_on` vencido e conteúdo; idempotente.
- Comissões: no máximo 3 pendentes por casa; chave de idempotência; debita 1 de Riqueza permanente na ficha da casa (versão+1) com lançamento no livro-caixa na mesma transação; sem Riqueza disponível a operação falha; recusa devolve 1 com nota (3 a 1000) e novo lançamento; publicar a edição que contém `commissionId` liquida o pedido.
- Excluir rascunho / excluir edição (apaga revisões e leituras, desvincula pedidos).
- Equipe, modelos de matéria, gravuras (upload OU imagem do site, `public_src` único) e configurações (só editores).
- Calendário do editor: só eventos já publicados pelo Narrador no mês.

## Dry-run no seu backup (não grava nada)
```
cd ~/cormyr-chronicle-atlas && git fetch origin && git checkout feat/firebase-newspaper-stage && git pull
node scripts/firebase/stage-newspaper-runtime-emulator.mjs --normalized ~/cormyr-chronicle-atlas/.firebase-migration/inspecao-12nov-E4pokAhB/normalized
```
Só contagens são impressas.

## Fora desta fatia
Arquivos de Storage (buckets `campaign-newspapers`, `-commissions`, `-staff`, `-engravings`) e a autorização de leitura de PDF/imagem; o adaptador do app; o job que chama `publishDue` no relógio.
