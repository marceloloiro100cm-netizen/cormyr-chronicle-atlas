# Firebase App Hosting — auditoria de commit publicado (somente leitura)

Domínio oficial: `https://atlas.cormyr.com.br`. O teste externo registrou HTTP 404 em `/api/firebase-auth-verify`, embora o mesmo código compilado responda HTTP 503 JSON, como previsto quando a homologação está desativada (PR #474). Isso aponta a investigação para **revisão, backend, configurações ou tráfego do App Hosting**; não prova qual desses está incorreto.

## Inspeção autorizada no GitHub Actions

Workflow: **Firebase App Hosting - live revision read-only audit**. Usa a identidade federada e temporária `cormyr-gh-reader@cormyr.iam.gserviceaccount.com` já configurada em `main`, nunca guarda JSON de conta de serviço ou imprime bearer token.

Consulta somente `GET` da API Firebase App Hosting v1 no projeto `cormyr`, nas regiões `us-east4` e `us-central1`:

1. Lista backends e domínios associados, identificando `atlas.cormyr.com.br`.
2. Consulta `traffic.current.splits`, a **build realmente recebendo 100% do tráfego**, e seu `source.codebase.hash`.
3. Resume branch e estado da política de rollouts automáticos, e últimos estados de rollout.
4. Retorna somente metadados de implantação, sem source files, chaves, usuários, mensagens, IDs privados ou dados de Storage/Firestore.

O relatório de `domainServingCommit` será **nulo** quando a API não comprovar exatamente um backend associado com um commit em tráfego a 100%. Não confundir último rollout criado com build ativo. `readyForCutover=false` e `cloudWrites=0` invariáveis.

### Se aparecer `readPermissionRequired: true`

A conexão OIDC pode estar funcionando, mas a conta de serviço não ter acesso aos metadados do App Hosting. **Não elevar permissões automaticamente.** Se o proprietário decidir autorizar a inspeção, o papel Google Cloud **Firebase App Hosting Viewer** (`roles/firebaseapphosting.viewer`) concede apenas leitura de backend, domínio, build, rollout e tráfego. Conceda-o à conta de serviço usando a área IAM do projeto `cormyr`, sem dar `roles/editor`, `roles/owner` ou `roles/firebaseapphosting.admin`. Depois reexecute manualmente o workflow na `main`.

Documentação de permissões: https://firebase.google.com/docs/projects/iam/roles-predefined-product

### Interpretar os resultados

- Commit em tráfego anterior ao SHA da `main`: backend atrasado, política desligada, branch diferente ou rollout pendente/falho; inspecionar logs e decidir rollout no Console.
- Branch não for `main`: investigar Settings → Deployment, sem alterar DNS.
- Commit do build ativo igual à `main`, mas API externa continuar 404: investigar domínio associado, regras e cache/roteamento, sem presumir que a build está correta para aquela URL.
- Sem permissão/nenhum backend em regiões examinadas: diagnóstico incompleto, não concluir que o projeto não tem backend.

O workflow **não cria, promove ou reverte rollouts**, não concede IAM, não altera o domínio e não toca no Supabase. O cutover definitivo continua subordinado a `CUTOVER-RUNBOOK.md`.

## Confirmação limitada da revisão publicada após push (PR #547)

Antes, a auditoria fazia uma leitura única imediatamente após o push. Era possível encontrar a revisão anterior em tráfego enquanto o App Hosting ainda compilava a nova, sem distinguir um atraso normal de uma implantação permanentemente pendente.

Agora, no job `live-readonly` (somente `main`), o script observa o **commit do push** (`GITHUB_SHA`) e consulta somente metadados App Hosting, no máximo **6 vezes**, com intervalo fixo de **20 segundos** entre tentativas (até cinco intervalos). Não existem consultas em segundo plano após o encerramento do job.

Cada leitura exige o backend real associado a `atlas.cormyr.com.br`, a divisão de tráfego atual com **100% em uma build** e o hash publicado da build, sem inferir pelo último rollout criado.

A auditoria encerra antecipadamente se:
- A build em tráfego corresponder exatamente ao commit do push (`MATCH_OBSERVED`);
- A API negar leitura (`READ_PERMISSION_REQUIRED`);
- Não houver backend associado de forma conclusiva (`SERVING_BACKEND_UNCONFIRMED`);
- A branch configurada não for `main` (`BRANCH_NOT_MAIN_OR_UNCONFIRMED`);
- O rollout automático estiver desativado ou não confirmado (`AUTOMATIC_ROLLOUT_DISABLED_OR_UNCONFIRMED`);
- Não houver SHA esperado válido (`NO_EXPECTED_COMMIT`).

Se o commit não aparecer dentro do limite, termina com `OBSERVATION_WINDOW_EXHAUSTED` e a classificação `NOT_YET_MATCHING` ou `INCONCLUSIVE`. Isso **não significa implantação concluída nem necessariamente falha definitiva**: a construção pode demorar mais que a janela. É preciso verificar o estado real do App Hosting.

O `GITHUB_STEP_SUMMARY` apresenta quantidade de observações, motivo de parada, SHA esperado e SHA servido. Não coleta senhas, tokens, e-mails, identidades, Firestore, Storage ou conteúdo de Casas; **não altera tráfego, rollouts, IAM, contas ou configuração de hosting**.

Um `MATCH` confirma somente o commit que estava recebendo tráfego **no momento da consulta**. Não confirma autenticação, reconciliação de dados, direitos dos perfis ou cutover: `cloudDataMigratedVerified=false`, `readyForCutover=false` e `cloudWrites=0` permanecem.

A suíte sintética `apphosting-live-revision-readonly.test.mjs` cobre correspondência tardia, ausência de match, bloqueios por IAM, branch e política, limite de tentativas, SHA inválido e transição de build temporariamente inconclusiva.
