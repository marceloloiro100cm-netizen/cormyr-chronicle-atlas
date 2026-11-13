# Cormyr — preservar o backup privado em um emulador Firestore

**Estado do lote:** código e testes em PR. A aplicação em produção, os usuários e o banco ativos NÃO são modificados. O snapshot privado de 12/11 deve permanecer fora do repositório público.

## Objetivo e escopo exato

A auditoria do backup privado identificou anteriormente 5.209 registros analisados, incluindo metadados, autenticação e sistemas auxiliares. Este script não presume que esses registros possam ser copiados diretamente para o modelo de dados definitivo do site.

O script `scripts/firebase/stage-firestore-emulator.mjs`:

- valida o manifesto e os hashes SHA-256 de **todas** as tabelas normalizadas;
- leva **apenas** as linhas das tabelas `public.*` para um arquivo interno, privado e idempotente **somente no emulador Firestore**;
- não importa `auth.*`, `storage.*`, `vault.*` ou outros esquemas, para nunca tratar senhas, identities ou caminhos de arquivos como documentos da aplicação;
- preserva os valores como strings/null conforme o PostgreSQL COPY, a ordem das colunas, as linhas duplicadas e hashes de cada linha;
- usa IDs determinísticos por tabela, ID original ou conteúdo (quando chave composta/ausente);
- bloqueia linhas maiores que a margem conservadora de 850 KiB, IDs duplicados e dados corrompidos antes de gravar qualquer documento;
- separa cada snapshot por hash de seu manifesto;
- marca o snapshot como `incomplete` durante a gravação e `complete` somente após todas as gravações bem-sucedidas;
- não escreve na nuvem: o modo de execução exige explicitamente `FIRESTORE_EMULATOR_HOST` com loopback e o projeto `demo-cormyr-migration`.

Isso é um **arquivo bruto de preservação para testes**, não a migração do modelo de jogo. Ele não reconstrói SQL triggers, RPCs, RLS ou a granularidade de acesso a missivas/casas.

## Auditoria de autorizações

O script `scripts/firebase/audit-private-access-graph.mjs` confere, sem exibir valores privados:

- 14 contas de Auth e seus vínculos de jogador;
- autorizações de Casas em `house_memberships`, nunca inferidas apenas de `roster_house_id`;
- perfis `jogador`, `editor` e `narrador` e o papel administrativo;
- ausência de privilégios nobres para o editor;
- referências órfãs, UIDs duplicados, flags inválidas, inconsistências de perfil e narrador.

A regra editorial de impedir missivas deverá ser aplicada no backend Firebase definitivo, não apenas no frontend. A auditoria **não implementa essas regras**: gera uma lista de divergências agregadas para corrigir antes da migração.

## Rodar a auditoria offline sobre o backup existente

No Cloud Shell, no repositório atual:

~~~bash
cd ~/cormyr-chronicle-atlas
git fetch origin feat/firebase-firestore-emulator-archive-20261113
git worktree add --detach /tmp/cormyr-firestore-archive FETCH_HEAD
cd /tmp/cormyr-firestore-archive

# Use o mesmo diretório NORMALIZED privado que já passou nas auditorias.
export NORMALIZED="$HOME/cormyr-chronicle-atlas/.firebase-migration/inspecao-12nov-E4pokAhB/normalized"

node scripts/firebase/audit-private-access-graph.mjs "$NORMALIZED"
node scripts/firebase/stage-firestore-emulator.mjs --normalized "$NORMALIZED"
~~~

Os dois comandos são somente leitura. Reportam **contagens e tipos de bloqueio**, nunca conteúdo de missivas, identificadores pessoais, hashes ou nomes dos jogadores.

## Importar no emulador privado — só depois de dry-run limpo

Se o script de arquivo retornar `emulatorPlanValid: true`, o proprietário poderá executar uma vez dentro do Cloud Shell:

~~~bash
cd /tmp/cormyr-firestore-archive

# Ferramentas instaladas apenas no worktree de testes; sem editar o lockfile:
npm install --no-save --package-lock=false firebase-admin@14.5.1 firebase-tools@15.35.0

# Mantém o backup privado e o estado exportado fora do GitHub:
mkdir -p "$HOME/cormyr-chronicle-atlas/.firebase-migration/firestore-emulator-export"
export NORMALIZED="$HOME/cormyr-chronicle-atlas/.firebase-migration/inspecao-12nov-E4pokAhB/normalized"
export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"

npx firebase emulators:exec --only firestore \
  --project demo-cormyr-migration \
  --config firebase/firebase.json \
  --export-on-exit "$HOME/cormyr-chronicle-atlas/.firebase-migration/firestore-emulator-export" \
  "node scripts/firebase/stage-firestore-emulator.mjs --normalized $NORMALIZED --execute-emulator"
~~~

**Importante:** uma execução de emulator não é produção nem uma instância hospedada em nuvem. Se o Firebase CLI exigir Java, instalar a versão suportada pelo CLI. Se o emulador retornar erro ou houver linha superdimensionada, **não** forçar a importação. O arquivo exportado dos emuladores contém dados privados: manter fora de GitHub, compartilhamentos ou logs públicos.

Não executar importação Auth ou Firestore no projeto real `cormyr` com esse script; ele recusa projetos que não são `demo-cormyr-migration`.

## Critérios de saída antes de uma migração real

1. Auditoria do grafo de acessos sem órfãos, privilégios inconsistentes ou vínculos do editor com Casas.
2. Arquivo bruto do emulador totalmente importado e marcado como completo.
3. Transposição **tipada** dos domínios (Casas, jogadores, missivas, temporal, jornal, espionagem, batalhas) com índices e permissões equivalentes.
4. Testes por perfil: anônimo, jogador da Casa, outra Casa, narrador, editor; os dados privados nunca são liberados por selecionador visual.
5. Storage: 986 objetos copiados no bucket privado; verificar hashes/novos objetos e preservar referências históricas.
6. Antes do corte: nova reconciliação do backup de 12/11 com a origem ativa e freeze das escritas, teste de login das 14 contas e plano de rollback.

Até todas essas condições passarem, **nenhuma troca de domínio, publicação de regras permissivas ou desligamento da origem**.

Referências oficiais:
- https://firebase.google.com/docs/emulator-suite/connect_firestore
- https://firebase.google.com/docs/emulator-suite/connect_and_prototype
- https://docs.cloud.google.com/firestore/quotas

## Teste real com o emulador (CI)

Em 13/11, o workflow de teste confirmou:
- Importação de 3 linhas públicas fictícias no Firestore Emulator real;
- Exclusão de 1 registro Auth fictício do arquivo Firestore;
- Repetição da importação sem duplicar documentos;
- Marcador `complete` depois das gravações;
- Nenhuma interação com Firebase de produção.

Essa verificação usa dados sintéticos, não o backup privado de 12/11.
Ainda é necessário rodar a auditoria no backup real antes de declarar o
lote de dados concluído.
