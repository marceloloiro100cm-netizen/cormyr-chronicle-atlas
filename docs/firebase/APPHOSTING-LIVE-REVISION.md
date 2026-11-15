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
